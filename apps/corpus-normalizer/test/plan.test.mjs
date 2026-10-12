import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, cp, lstat, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyPlan, materializePlan, validateForm, validateTerms, verifyPlan } from "../src/materialize.mjs";
import { explainPlan, plan, writePlan } from "../src/plan.mjs";
import { proposeTerm, sha256 } from "../src/term.mjs";
import { validateTriageText } from "../src/triage-text.mjs";
import { scratchDirectory } from "../src/temp.mjs";
import { isGenerated } from "../src/detect.mjs";
import { auditNotebooks } from "../src/application.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (...parts) => path.join(here, "fixtures", ...parts);
const terms = "/corpus/content/text/glossary/terms";
const expected = JSON.parse(await readFile(path.join(here, "expected-decisions.json"), "utf8"));

async function copyPlan(root, { covered = false } = {}) {
  const sourceRoot = path.join(root, "source"); const source = path.join(sourceRoot, "asset.html"); const destination = path.join(root, "destination", "content", "text", "triage"); const bytes = Buffer.from([0, 255, 1, 2, 3, 10]); await mkdir(sourceRoot, { recursive: true }); await mkdir(destination, { recursive: true }); await writeFile(source, bytes); await chmod(source, 0o755);
  const target = path.join(destination, "asset.html"); if (covered) await writeFile(target, bytes);
  const hash = sha256(bytes); const planFile = path.join(root, "copy.ndjson"); const action = covered ? "covered-by-destination" : "copy";
  await writeFile(planFile, `${JSON.stringify({ schema: "corpus-normalizer.decision.v2", id: "decision:asset", input: "asset.html", sourcePath: source, sourceRoot, inputType: "file", destination, destinationForm: "triage-text", status: "proven", decision: action, proposed: { action, output: target, sourceContentSha256: hash, proposedContentSha256: hash, mode: 0o755 }, target: { state: covered ? "exact-covered" : "absent", sha256: covered ? hash : null } })}\n`);
  return { source, destination, target, bytes, planFile };
}

async function collect(source, destination = terms, options) {
  const result = [];
  for await (const item of plan(source, destination, options)) result.push(item);
  return result;
}

test("scratch selection honors an override and defaults to host-local /var/tmp", async () => {
  assert.equal(await scratchDirectory("/tmp/corpus-normalizer-override"), "/tmp/corpus-normalizer-override"); const selected = await scratchDirectory(); assert.equal(selected.startsWith("/mnt/c"), false); assert.equal(selected, "/var/tmp");
});

test("application planning copies one root package and rejects nested packages and loose files", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-app-plan-"); const app = path.join(root, "app"); const destination = path.join(root, "destination", "apps", "demo"); await mkdir(path.join(app, "src"), { recursive: true }); await writeFile(path.join(app, "package.json"), "{\"name\":\"demo\"}\n"); await writeFile(path.join(app, "src", "main.bin"), Buffer.from([0, 255])); await mkdir(path.join(app, "node_modules", "x"), { recursive: true }); await writeFile(path.join(app, "node_modules", "x", "index.js"), "ignored");
  const decisions = await collect(app, destination); const binary = decisions.find((item) => item.input === "src/main.bin"); assert.equal(binary.proposed.action, "copy"); assert.equal(binary.proposed.mode, 0o644); assert.ok(!decisions.some((item) => item.input.startsWith("node_modules/x/")));
  await mkdir(path.join(app, "nested")); await writeFile(path.join(app, "nested", "package.json"), "{}"); const nested = await collect(app, destination); assert.equal(nested.find((item) => item.input === "nested").decision, "application-nested-package");
  const loose = path.join(root, "loose.js"); await writeFile(loose, "x"); const looseDecisions = await collect(loose, destination); assert.equal(looseDecisions[0].decision, "application-loose-file");
});

test("application validation counts authored files while ignoring generated roots", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-app-validate-"); await writeFile(path.join(root, "package.json"), "{\"name\":\"demo\"}"); await mkdir(path.join(root, "src")); await writeFile(path.join(root, "src", "main.js"), "export {};"); await mkdir(path.join(root, ".venv", "cache"), { recursive: true }); await writeFile(path.join(root, ".venv", "cache", "state"), "ignored");
  const result = await validateForm("application", root); assert.equal(result.valid, true); assert.equal(result.modeledFiles, 2); assert.equal(result.ignoredRoots, 1); assert.equal(result.manifests, 1);
});

test("service sections preserve sparse nested authored trees, modes, coverage, and generated exclusions", async () => {
  const root=await mkdtemp("/var/tmp/corpus-normalizer-service-"); const source=path.join(root,"source-services-section"); const destination=path.join(root,"destination","services","demo-services-section"); const overlay=path.join(root,"overlay"); await mkdir(path.join(source,"services","nested-services-section"),{recursive:true}); await mkdir(path.join(source,".venv"),{recursive:true}); await writeFile(path.join(source,"package.json"),"{\"name\":\"demo\"}\n"); await writeFile(path.join(source,"content.txt"),"content\n"); await writeFile(path.join(source,"services","nested-services-section","nested.bin"),Buffer.from([0,255,1])); await chmod(path.join(source,"services","nested-services-section","nested.bin"),0o755); await writeFile(path.join(source,".venv","ignored"),"ignored");
  const planFile=path.join(root,"plan.ndjson"); await writePlan(source,destination,planFile); const decisions=await collect(source,destination); assert.equal(decisions.find((x)=>x.input==="services/nested-services-section/nested.bin").proposed.action,"copy"); assert.equal(decisions.some((x)=>x.input.includes(".venv/ignored")),false); await materializePlan(planFile,overlay); assert.equal(existsSync(path.join(overlay,".venv")),false); await applyPlan(planFile,overlay); assert.equal((await verifyPlan(planFile,overlay)).valid,true); assert.equal((await stat(path.join(destination,"services","nested-services-section","nested.bin"))).mode&0o777,0o755); assert.equal(existsSync(path.join(source,"content.txt")),false); assert.equal(existsSync(path.join(source,".venv","ignored")),true);
  const exactRoot=await mkdtemp("/var/tmp/corpus-normalizer-service-exact-"); const exactSource=path.join(exactRoot,"source-services-section"); const exactDest=path.join(exactRoot,"destination","services","demo-services-section"); await mkdir(exactSource); await mkdir(exactDest,{recursive:true}); await writeFile(path.join(exactSource,"same.txt"),"same\n"); await writeFile(path.join(exactSource,"only.txt"),"only\n"); await writeFile(path.join(exactDest,"same.txt"),"same\n"); const exactPlan=path.join(exactRoot,"p.ndjson"); await writePlan(exactSource,exactDest,exactPlan); await materializePlan(exactPlan,path.join(exactRoot,"overlay")); await applyPlan(exactPlan,path.join(exactRoot,"overlay")); assert.equal(existsSync(path.join(exactSource,"same.txt")),false);
  const wrong=await mkdtemp("/var/tmp/corpus-normalizer-wrong-"); await writeFile(path.join(wrong,"x.txt"),"x"); assert.equal((await collect(wrong,destination))[0].status,"invalid");
  const conflictRoot=await mkdtemp("/var/tmp/corpus-normalizer-service-conflict-"); const conflictSource=path.join(conflictRoot,"source-services-section"); const conflictDest=path.join(conflictRoot,"destination","services","demo-services-section"); await mkdir(conflictSource); await mkdir(conflictDest,{recursive:true}); await writeFile(path.join(conflictSource,"same.txt"),"source\n"); await writeFile(path.join(conflictDest,"same.txt"),"destination\n"); const conflictPlan=path.join(conflictRoot,"p.ndjson"); await writePlan(conflictSource,conflictDest,conflictPlan); assert.ok((await collect(conflictSource,conflictDest)).some((x)=>x.status==="invalid")); await assert.rejects(()=>materializePlan(conflictPlan,path.join(conflictRoot,"overlay")),/unresolved or invalid/);
});

const sparseScienceSection="/home/emsenn/info/lib/emsenn/services/561-group/services/science-services-section/services/social-science-services-section/services/social-theory-science-services-section/services/ludics-science-services-section";
const activitypubSection="/home/emsenn/info/lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-networking-engineering-services-section/services/activitypub-services-section";
for (const [label, root] of [["sparse science", sparseScienceSection], ["ActivityPub", activitypubSection]]) test(`${label} service-section audit dynamically matches modeled tree`, { skip: !existsSync(root) }, async () => {
  async function count(dir, rel="") { let modeledFiles=0,modeledDirs=0,ignoredRoots=0,manifests=0; const errors=[]; for(const entry of await readdir(dir,{withFileTypes:true})){const child=path.join(dir,entry.name),next=path.join(rel,entry.name); if(entry.isDirectory()&&isGenerated(next)){ignoredRoots++;continue;} if(entry.isDirectory()){modeledDirs++;const nested=await count(child,next);modeledFiles+=nested.modeledFiles;modeledDirs+=nested.modeledDirs;ignoredRoots+=nested.ignoredRoots;manifests+=nested.manifests;errors.push(...nested.errors);} else if(entry.isFile()){modeledFiles++;if(["package.json","pyproject.toml","Cargo.toml","go.mod"].includes(entry.name)){manifests++;const text=await readFile(child,"utf8");if(!text.trim())errors.push(`empty manifest: ${next}`);}} else errors.push(`unsupported service node: ${next}`);} return {modeledFiles,modeledDirs,ignoredRoots,manifests,errors}; }
  const expected=await count(root); const audit=await validateForm("service-section",root);
  assert.equal(audit.modeledFiles,expected.modeledFiles); assert.equal(audit.modeledDirs,expected.modeledDirs); assert.equal(audit.ignoredRoots,expected.ignoredRoots); assert.equal(audit.manifests,expected.manifests); assert.deepEqual(audit.warnings,[]);
  if(label==="ActivityPub") {
    // Detection, not accepted validity: these are live legacy shapes awaiting routing.
    const violations=[
      "active content contains opaque process/provenance directory: services/fediverse-services-section/content/text/glossary/topics",
      "active content contains opaque process/provenance directory: services/mastodon-services-section/content/text/glossary/topics",
      "notes: note has invalid layout: mastodon-overview.md",
    ];
    assert.equal(audit.valid,false); assert.deepEqual([...audit.errors].sort(),violations.sort());
  } else assert.deepEqual(audit,{valid:expected.errors.length===0,errors:expected.errors,warnings:[],...expected});
});

test("application accepts a Python pyproject package root", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-python-app-"); const destination = path.join(root, "destination", "apps", "python-demo"); await writeFile(path.join(root, "pyproject.toml"), "[project]\nname = \"python-demo\"\nversion = \"0.1.0\"\n"); await writeFile(path.join(root, "main.py"), "print('hello')\n");
  const audit = await validateForm("application", root); assert.deepEqual(audit, { valid: true, errors: [], warnings: [], count: 2, modeledFiles: 2, ignoredRoots: 0, manifests: 1 });
  const decisions = await collect(root, destination); assert.equal(decisions.find((item) => item.input === "main.py").proposed.action, "copy");
});

test("application lifecycle copies binary executable files, contracts exact destination, and leaves generated destination untouched", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-app-lifecycle-"); const source = path.join(root, "source"); const destination = path.join(root, "destination", "apps", "demo"); const overlay = path.join(root, "overlay"); await mkdir(path.join(source, "src"), { recursive: true }); await writeFile(path.join(source, "pyproject.toml"), "[project]\nname = \"demo\"\nversion = \"0.1.0\"\n"); const binary = Buffer.from([0, 255, 2, 3, 10]); await writeFile(path.join(source, "src", "tool.bin"), binary); await chmod(path.join(source, "src", "tool.bin"), 0o755); await mkdir(path.join(source, ".pytest_cache"), { recursive: true }); await writeFile(path.join(source, ".pytest_cache", "ignored"), "source cache");
  await mkdir(path.join(destination, ".venv"), { recursive: true }); await writeFile(path.join(destination, ".venv", "live-cache"), "live cache"); await symlink("missing", path.join(destination, ".venv", "untraversed-link"));
  const planFile = path.join(root, "plan.ndjson"); await writePlan(source, destination, planFile); const decisions = await collect(source, destination); assert.equal(decisions.find((item) => item.input === "src/tool.bin").proposed.action, "copy"); assert.ok(!decisions.some((item) => item.input.includes(".pytest_cache/ignored")));
  await materializePlan(planFile, overlay); assert.equal(existsSync(path.join(overlay, ".venv")), false); assert.equal((await validateForm("application", overlay)).valid, true); await applyPlan(planFile, overlay); assert.equal((await verifyPlan(planFile, overlay)).valid, true); assert.deepEqual(await readFile(path.join(destination, "src", "tool.bin")), binary); assert.equal((await stat(path.join(destination, "src", "tool.bin"))).mode & 0o777, 0o755); assert.equal(await readFile(path.join(destination, ".venv", "live-cache"), "utf8"), "live cache"); assert.equal((await lstat(path.join(destination, ".venv", "untraversed-link"))).isSymbolicLink(), true); assert.equal(existsSync(path.join(source, "src", "tool.bin")), false); assert.equal(existsSync(path.join(source, "pyproject.toml")), false);
});

test("application exact destination coverage coexists with source-only files while differing authored targets fail closed", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-app-covered-"); const source = path.join(root, "source"); const destination = path.join(root, "destination", "apps", "demo"); await mkdir(source); const project = "[project]\nname = \"demo\"\nversion = \"0.1.0\"\n"; await writeFile(path.join(source, "pyproject.toml"), project); await writeFile(path.join(source, "source-only.py"), "print('source only')\n"); await mkdir(destination, { recursive: true }); await writeFile(path.join(destination, "pyproject.toml"), project);
  const planFile = path.join(root, "plan.ndjson"); await writePlan(source, destination, planFile); const exact = await collect(source, destination); assert.equal(exact.find((item) => item.input === "pyproject.toml").proposed.action, "covered-by-destination"); await materializePlan(planFile, path.join(root, "overlay")); await applyPlan(planFile, path.join(root, "overlay")); assert.equal(existsSync(path.join(source, "pyproject.toml")), false); assert.equal(existsSync(path.join(source, "source-only.py")), false);
  const conflictRoot = await mkdtemp("/var/tmp/corpus-normalizer-app-conflict-"); const conflictSource = path.join(conflictRoot, "source"); const conflictDestination = path.join(conflictRoot, "destination", "apps", "demo"); await mkdir(conflictSource); await mkdir(conflictDestination, { recursive: true }); await writeFile(path.join(conflictSource, "pyproject.toml"), project); await writeFile(path.join(conflictDestination, "pyproject.toml"), "[project]\nname = \"other\"\n"); const conflictPlan = path.join(conflictRoot, "plan.ndjson"); await writePlan(conflictSource, conflictDestination, conflictPlan); assert.ok((await collect(conflictSource, conflictDestination)).some((item) => item.status === "invalid")); await assert.rejects(() => materializePlan(conflictPlan, path.join(conflictRoot, "overlay")), /unresolved or invalid/);
});

test("standalone notebooks normalize only into an existing application notebooks contract", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-notebook-app-"); const destination = path.join(root, "destination", "apps", "demo"); const source = path.join(root, "executed", "2026", "field.ipynb"); await mkdir(path.dirname(source), { recursive: true }); await mkdir(path.join(destination, "notebooks"), { recursive: true }); await writeFile(path.join(destination, "pyproject.toml"), "[project]\nname = \"demo\"\nversion = \"0\"\n");
  const notebook = { nbformat: 4, nbformat_minor: 5, metadata: { keep: "yes", widgets: { transient: true }, unknown: { stable: true } }, cells: [{ cell_type: "markdown", metadata: { keep: true }, source: "pyinfotiles prose stays\n" }, { cell_type: "code", execution_count: 7, outputs: [{ text: "old" }], metadata: { execution: { iopub: "old" }, custom: "kept" }, source: "import pyinfotiles\nfrom pyinfotiles.tools import x\ntext = 'pyinfotiles'\n" }] };
  await writeFile(source, JSON.stringify(notebook)); const planFile = path.join(root, "plan.ndjson"); await writePlan(source, destination, planFile, { rewriteMap: { pyinfotiles: "pymetrologic" } }); const decisions = await collect(source, destination, { rewriteMap: { pyinfotiles: "pymetrologic" } }); const decision = decisions[0]; assert.equal(decision.proposed.output, path.join(destination, "notebooks", "field.ipynb")); assert.deepEqual(decision.proposed.replacements, [{ from: "pyinfotiles", to: "pymetrologic", rule: "python-import-identifier" }, { from: "pyinfotiles", to: "pymetrologic", rule: "python-import-identifier" }]); const clean = JSON.parse(decision.proposed.content); assert.equal(clean.cells[1].execution_count, null); assert.deepEqual(clean.cells[1].outputs, []); assert.equal(clean.cells[1].metadata.execution, undefined); assert.equal(clean.cells[1].metadata.custom, "kept"); assert.equal(clean.metadata.widgets, undefined); assert.equal(clean.metadata.unknown.stable, true); assert.match(clean.cells[0].source, /pyinfotiles prose/); assert.match(clean.cells[1].source, /import pymetrologic/); assert.match(clean.cells[1].source, /'pyinfotiles'/);
  const overlay = path.join(root, "overlay"); await materializePlan(planFile, overlay); await applyPlan(planFile, overlay); assert.equal(existsSync(source), false); assert.equal((await verifyPlan(planFile, overlay)).valid, true);
  const ordinary = path.join(root, "ordinary.py"); await writeFile(ordinary, "import pyinfotiles\n"); assert.equal((await collect(ordinary, destination))[0].status, "invalid"); const jupytext = path.join(root, "cells.py"); await writeFile(jupytext, "# %%\nimport pyinfotiles\n# %% [markdown]\n# pyinfotiles prose\n"); const jt = (await collect(jupytext, destination, { rewriteMap: { pyinfotiles: "pymetrologic" } }))[0]; assert.equal(jt.status, "proven"); assert.match(jt.proposed.content, /import pymetrologic/); assert.match(jt.proposed.content, /# pyinfotiles prose/);
  await writeFile(path.join(root, "bad.ipynb"), "{not json"); assert.equal((await collect(path.join(root, "bad.ipynb"), destination))[0].decision, "application-notebook-invalid"); const absent = path.join(root, "absent", "apps", "demo"); assert.equal((await collect(jupytext, absent))[0].decision, "application-notebook-destination-required");
});

test("notebook audit reports direct files, paired stems, and generated subdirectories", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-notebook-audit-"); await mkdir(path.join(root, "notebooks", ".ipynb_checkpoints"), { recursive: true }); await writeFile(path.join(root, "notebooks", "same.ipynb"), "{}"); await writeFile(path.join(root, "notebooks", "same.py"), "# %%\n"); await writeFile(path.join(root, "notebooks", ".ipynb_checkpoints", "old.ipynb"), "{}"); assert.deepEqual(await auditNotebooks(root), { exists: true, sources: ["same.ipynb", "same.py"], pairedStems: ["same"], generatedSubdirs: [".ipynb_checkpoints"] });
});

const pymetrologic = "/home/emsenn/info/lib/emsenn/services/561-group/services/science-services-section/services/information-science-services-section/services/math-services-section/services/obsmetrological-services-section/apps/pymetrologic";
test("PyMetroLogic application audit reports the modeled corpus without entering generated roots", { skip: !existsSync(pymetrologic) }, async () => {
  async function model(directory, relative = "") {
    let files = 0; let ignoredRoots = 0; let manifests = 0; const errors = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name); const childRelative = path.join(relative, entry.name);
      if (entry.isDirectory() && isGenerated(childRelative)) { ignoredRoots += 1; continue; }
      if (entry.isDirectory()) { const nested = await model(child, childRelative); files += nested.files; ignoredRoots += nested.ignoredRoots; manifests += nested.manifests; errors.push(...nested.errors); continue; }
      if (!entry.isFile()) { errors.push(`unsupported application node: ${childRelative}`); continue; }
      files += 1;
      if (["package.json", "pyproject.toml", "Cargo.toml", "go.mod"].includes(entry.name)) { manifests += 1; const text = await readFile(child, "utf8"); if (!text.trim()) errors.push(`empty manifest: ${childRelative}`); if (entry.name === "package.json") try { JSON.parse(text); } catch { errors.push(`invalid package.json: ${childRelative}`); } }
    }
    return { files, ignoredRoots, manifests, errors };
  }
  const expectedAudit = await model(pymetrologic); const result = await validateForm("application", pymetrologic);
  assert.equal(existsSync(path.join(pymetrologic, "package.json")), true); assert.equal(existsSync(path.join(pymetrologic, "pyproject.toml")), true);
  assert.equal(result.modeledFiles, expectedAudit.files); assert.equal(result.count, expectedAudit.files); assert.equal(result.ignoredRoots, expectedAudit.ignoredRoots); assert.equal(result.manifests, expectedAudit.manifests); assert.deepEqual(result.errors, expectedAudit.errors); assert.deepEqual(result.warnings, []); assert.equal(result.valid, expectedAudit.errors.length === 0 && expectedAudit.manifests > 0);
});

test("PyMetroLogic notebook audit reports the direct flat notebook set read-only", { skip: !existsSync(pymetrologic) }, async () => {
  const notebooks = path.join(pymetrologic, "notebooks"); const entries = await readdir(notebooks, { withFileTypes: true }); const expectedSources = entries.filter((entry) => entry.isFile() && [".ipynb", ".py"].includes(path.extname(entry.name))).map((entry) => entry.name).sort(); const expectedGenerated = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(); const stems = new Map(); for (const name of expectedSources) { const stem = path.basename(name, path.extname(name)); stems.set(stem, [...(stems.get(stem) ?? []), name]); }
  const audit = await auditNotebooks(pymetrologic); assert.deepEqual(audit, { exists: true, sources: expectedSources, pairedStems: [...stems.entries()].filter(([, files]) => files.length > 1).map(([stem]) => stem).sort(), generatedSubdirs: expectedGenerated }); assert.equal(audit.sources.every((name) => !name.includes(path.sep)), true);
});

test("destination contract deterministically governs mixed scientific material", async () => {
  // A dependency tree is generated, never tracked, so the fixture's copy gains one before inventory.
  const material = await mkdtemp("/var/tmp/corpus-normalizer-mixed-scientific-");
  await cp(fixture("mixed-scientific"), material, { recursive: true });
  await mkdir(path.join(material, "node_modules", "left-pad"), { recursive: true });
  await writeFile(path.join(material, "node_modules", "left-pad", "index.js"), "module.exports = (value) => value;\n");
  const decisions = await collect(material);
  assert.ok(decisions.length >= 10);
  assert.equal(new Set(decisions.map((item) => item.input)).size, decisions.length, "every inventoried input has exactly one decision");
  assert.ok(decisions.every((item) => item.destinationForm === "term"));
  for (const key of ["mixedScientificNotebook", "mixedScientificBibliography", "flatGlossaryRoot"]) {
    const actual = decisions.find((item) => item.input === expected[key].input);
    assert.equal(actual.decision, expected[key].decision);
    assert.equal(actual.status, expected[key].status);
  }
  for (const root of ["node_modules", ".ipynb_checkpoints"]) {
    assert.equal(decisions.find((item) => item.input === root).decision, "exclude-generated-unit");
    assert.equal(decisions.some((item) => item.input.startsWith(`${root}/`)), false, "generated roots are not traversed");
  }
});

test("records package boundaries, authored material, and generated outputs separately", async () => {
  const decisions = await collect(fixture("koios-like", "v2"), "/corpus/apps/koios-news");
  const manifest = decisions.find((item) => item.input === "package.json");
  assert.deepEqual(manifest.boundaries, ["package"]);
  assert.equal(manifest.decision, "propose-output");
  assert.equal(manifest.status, "proven");
  assert.equal(manifest.unitId, "unit:.");
  assert.equal(decisions.find((item) => item.input === "src/index.mjs").proposed.action, "copy");
  assert.equal(decisions.find((item) => item.input === "dist").decision, "exclude-generated-unit");
  assert.equal(decisions.some((item) => item.input.startsWith("dist/")), false);
  const successor = await collect(fixture("koios-like", "v3"), "/corpus/apps/koios-news");
  assert.equal(successor.find((item) => item.input === "src/index.mjs").proposed.action, "copy");
  assert.equal(successor.find((item) => item.input === "dist").decision, "exclude-generated-unit");
});

test("does not follow package symlinks", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-link-");
  const packageRoot = path.join(root, "actual-package");
  await mkdir(packageRoot);
  await writeFile(path.join(packageRoot, "package.json"), '{"name":"actual"}');
  await symlink(packageRoot, path.join(root, "node_modules-link"));
  const decisions = await collect(root, "/corpus/apps/demo");
  const link = decisions.find((item) => item.input === "node_modules-link");
  assert.equal(link.representation, "symlink");
  assert.equal(link.inputType, "symlink");
  assert.equal(link.decision, expected.packageSymlink.decision);
  assert.equal(link.status, expected.packageSymlink.status);
  assert.equal(link.realPath, packageRoot);
  assert.ok(!decisions.some((item) => item.input === "node_modules-link/package.json"));
});

test("recognizes nested service sections without mistaking source ownership for destination form", async () => {
  const decisions = await collect(fixture("nested-services"), "/corpus/services/physical-sciences-services-section");
  const section = decisions.find((item) => item.input === "services/hydrology-sciences-services-section");
  assert.equal(section.representation, "service-section");
  assert.equal(section.destinationForm, "service-section");
  assert.equal(section.decision, "service-section-directory-accounting");
  assert.equal(section.status, "proven");
  assert.ok(section.boundaries.includes("service-section"));
});

test("archive carriers are opaque and safe in the planner", async () => {
  const decisions = await collect(fixture("archive"));
  const archive = decisions.find((item) => item.input === "unsafe-looking.tgz");
  assert.equal(archive.representation, "archive");
  assert.equal(archive.status, expected.archive.status);
  assert.equal(archive.decision, expected.archive.decision);
  assert.match(archive.evidence.join(" "), /no member path is trusted/);
});

test("streaming explain surfaces incompatible units without materializing the full plan", async () => {
  const planFile = path.join(await mkdtemp("/var/tmp/corpus-normalizer-explain-"), "plan.ndjson");
  await writePlan(fixture("mixed-scientific"), terms, planFile);
  let output = "";
  await explainPlan(planFile, { write(chunk) { output += chunk; } });
  const lines = output.trim().split("\n").map(JSON.parse);
  assert.ok(lines.some((line) => line.type === "review" && line.decision.input === expected.mixedScientificNotebook.input && line.decision.status === "invalid"));
  assert.equal(lines.at(-1).type, "summary");
});

test("external ordering is globally deterministic across shuffled large directories", async () => {
  async function plannedInputs(order) {
    const root = await mkdtemp("/var/tmp/corpus-normalizer-order-");
    await Promise.all(order.map((name) => writeFile(path.join(root, `${name}.md`), `# ${name}`)));
    const inputs = [];
    for await (const item of plan(root, terms, { chunkSize: 3 })) inputs.push(item.input);
    return inputs;
  }
  const names = ["zeta", "alpha", "kappa", "beta", "theta", "gamma", "delta", "eta", "iota", "epsilon"];
  assert.deepEqual(await plannedInputs(names), await plannedInputs([...names].reverse()));
});

test("external identity grouping handles 257 unique inputs through multiple tiny sorted runs", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-external-identities-");
  for (let index = 0; index < 257; index += 1) await writeFile(path.join(root, `term-${String(index).padStart(3, "0")}.md`), `# Term ${index}\n`);
  const decisions = await collect(root, terms, { identitySortChunkSize: 2 });
  assert.equal(decisions.filter((item) => item.proposed?.action === "write").length, 257);
  assert.equal(decisions.length, 258);
});

test("external identity grouping picks the lexical canonical source independently of creation order", async () => {
  async function duplicatePlan(order) {
    const root = await mkdtemp("/var/tmp/corpus-normalizer-external-duplicate-");
    for (const name of order) await writeFile(path.join(root, `${name}.md`), "# Alpha\n\nOne definition.\n");
    return collect(root, terms, { identitySortChunkSize: 2 });
  }
  for (const decisions of [await duplicatePlan(["zeta", "alpha", "beta"]), await duplicatePlan(["beta", "zeta", "alpha"])]) {
    const canonical = decisions.find((item) => item.input === "alpha.md");
    assert.equal(canonical.proposed.action, "write");
    for (const input of ["beta.md", "zeta.md"]) { const duplicate = decisions.find((item) => item.input === input); assert.equal(duplicate.proposed.action, "covered-by-duplicate"); assert.equal(duplicate.coveredBy, canonical.id); }
  }
});

test("an exact-covered destination witness is preferred over source duplicates", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-covered-witness-"); const source = path.join(root, "source"); const destination = path.join(root, "destination", "content", "text", "glossary", "terms");
  await mkdir(source); await mkdir(destination, { recursive: true }); await writeFile(path.join(destination, "alpha.md"), "---\nidentity: alpha\nname: alpha\n---\n# Alpha\n\nOne definition.\n");
  await writeFile(path.join(source, "alpha.md"), "# Alpha\n\nOne definition.\n"); await writeFile(path.join(source, "beta.md"), "# Alpha\n\nOne definition.\n");
  const decisions = await collect(source, destination, { identitySortChunkSize: 2 });
  assert.equal(decisions.find((item) => item.input === "alpha.md").proposed.action, "covered-by-destination");
  assert.equal(decisions.find((item) => item.input === "beta.md").proposed.action, "covered-by-duplicate");
});

test("single HTML and TeX files route as triage text", async () => {
  for (const [extension, content] of [["html", "<article>Evidence</article>\n"], ["tex", "\\section{Evidence}\n"]]) {
    const root = await mkdtemp("/var/tmp/corpus-normalizer-triage-single-"); const source = path.join(root, `evidence.${extension}`); await writeFile(source, content);
    const decisions = await collect(source, path.join(root, "destination", "content", "text", "triage"));
    assert.equal(decisions.length, 1); assert.equal(decisions[0].representation, "text"); assert.equal(decisions[0].proposed.action, "write");
  }
});

test("triage plan materialize apply verify preserves destination and retires HTML and TeX sources", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-triage-apply-"); const source = path.join(root, "source"); const destination = path.join(root, "destination", "content", "text", "triage"); const overlay = path.join(root, "overlay");
  await mkdir(source); await mkdir(destination, { recursive: true }); await writeFile(path.join(source, "field evidence.html"), "<p>HTML evidence</p>\n"); await writeFile(path.join(source, "model.tex"), "\\section{Model}\n"); await writeFile(path.join(destination, "existing.md"), "Existing destination.\n");
  const planFile = path.join(root, "triage.ndjson"); await writePlan(source, destination, planFile); const materialized = await materializePlan(planFile, overlay);
  assert.equal(materialized.writes, 2); assert.deepEqual((await readdir(overlay)).sort(), ["existing.md", "field-evidence.html", "model.tex"]); assert.equal((await validateForm("triage-text", overlay)).valid, true);
  const verified = await applyPlan(planFile, overlay); assert.equal(verified.valid, true); assert.equal(verified.writes, 3); assert.equal((await verifyPlan(planFile, overlay)).valid, true);
  assert.equal(existsSync(path.join(source, "field evidence.html")), false); assert.equal(existsSync(path.join(source, "model.tex")), false); assert.equal(await readFile(path.join(destination, "existing.md"), "utf8"), "Existing destination.\n");
});

test("external identity conflicts invalidate every differing-body witness and refuse materialization", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-external-conflict-"); const source = path.join(root, "source"); const destination = path.join(root, "destination", "content", "text", "glossary", "terms"); await mkdir(source);
  await writeFile(path.join(source, "alpha.md"), "# Alpha\n\nFirst body.\n"); await writeFile(path.join(source, "alpha-copy.md"), "# Alpha\n\nSecond body.\n");
  const decisions = await collect(source, destination, { identitySortChunkSize: 2 }); const witnesses = decisions.filter((item) => item.input !== ".");
  assert.deepEqual(witnesses.map((item) => item.status), ["invalid", "invalid"]); assert.ok(witnesses.every((item) => item.decision === "identity-conflict"));
  const planFile = path.join(root, "conflict.ndjson"); await writePlan(source, destination, planFile); await assert.rejects(() => materializePlan(planFile, path.join(root, "overlay")), /unresolved|invalid/);
});

test("note routing derives dates by filename, metadata, Org, ancestry, and undated without retaining source groups", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-notes-route-"); const intake = path.join(root, "intake"); const source = path.join(intake, "researching", "2024", "03", "04"); const destination = path.join(root, "destination", "content", "text", "documents", "articles", "notes"); await mkdir(source, { recursive: true });
  await writeFile(path.join(source, "2024-01-02 Filename Note.md"), "filename\n"); await writeFile(path.join(source, "metadata.html"), "---\ndate-created: 2024-02-03\n---\nmetadata\n"); await writeFile(path.join(source, "org-note.org"), "#+date: 2024-02-04\norg\n"); await writeFile(path.join(source, "ancestry.md"), "ancestry\n"); await mkdir(path.join(intake, "papers"), { recursive: true }); await writeFile(path.join(intake, "papers", "undated note.md"), "undated\n");
  const decisions = await collect(intake, destination, { identitySortChunkSize: 2 }); const outputs = decisions.filter((item) => item.proposed?.action === "write").map((item) => path.relative(destination, item.proposed.output).split(path.sep).join("/")).sort();
  assert.deepEqual(outputs, ["2024/01/02/2024-01-02-filename-note.md", "2024/02/03/2024-02-03-metadata.html", "2024/02/04/2024-02-04-org-note.org", "2024/03/04/2024-03-04-ancestry.md", "undated/undated-note.md"]);
});

test("notes project recursively, preserve nested destination, apply full relative targets, and reject unsafe layouts", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-notes-apply-"); const source = path.join(root, "source", "researching"); const destination = path.join(root, "destination", "content", "text", "documents", "articles", "notes"); const overlay = path.join(root, "overlay"); await mkdir(source, { recursive: true }); await mkdir(path.join(destination, "2020", "01", "02"), { recursive: true });
  await writeFile(path.join(source, "2024-05-06 Field.md"), "field\n"); await writeFile(path.join(destination, "2020", "01", "02", "2020-01-02-existing.md"), "existing\n");
  const planFile = path.join(root, "notes.ndjson"); await writePlan(path.join(root, "source"), destination, planFile); const materialized = await materializePlan(planFile, overlay);
  assert.equal(materialized.writes, 1); assert.equal((await validateForm("note", overlay)).valid, true); assert.equal(existsSync(path.join(overlay, "2020", "01", "02", "2020-01-02-existing.md")), true);
  await applyPlan(planFile, overlay); assert.equal(existsSync(path.join(source, "2024-05-06 Field.md")), false); assert.equal(existsSync(path.join(destination, "2024", "05", "06", "2024-05-06-field.md")), true); assert.equal((await verifyPlan(planFile, overlay)).valid, true);
  await mkdir(path.join(root, "invalid", "researching"), { recursive: true }); await writeFile(path.join(root, "invalid", "researching", "bad.md"), "bad\n"); const invalid = await validateForm("note", path.join(root, "invalid")); assert.equal(invalid.valid, false); assert.ok(invalid.errors.some((item) => item.includes("invalid layout")));
});

const personalNotes = process.env.PERSONAL_NOTES ?? "/home/emsenn/info/lib/emsenn/services/561-group/services/public-services-section/services/personal-services-section/emsenn-services-section/content/text/documents/articles/notes";
test("current personal notes audit reports the remaining contract violations without mutating them", { skip: !existsSync(personalNotes) }, async () => {
  async function filesystemFiles(root) { let count = 0; const entries = await readdir(root, { withFileTypes: true }); for (const entry of entries) { if (entry.isFile()) count += 1; else if (entry.isDirectory()) count += await filesystemFiles(path.join(root, entry.name)); } return count; }
  const audit = await validateForm("note", personalNotes); assert.equal(audit.count, await filesystemFiles(personalNotes)); assert.equal(audit.warnings.length, 0); assert.equal(audit.valid, false); assert.equal(audit.errors.includes("note has invalid layout: 2026-06-15-language-consolidation.md"), false); assert.ok(audit.errors.includes("note date does not match directory: 2026/03/12/big-picture-technical.md"));
});

test("external planner cleans temporary state after completion, failure, and early cancellation", async () => {
  async function temporaryRun(work) {
    const temporary = await mkdtemp("/var/tmp/corpus-normalizer-temporary-parent-"); let child;
    await work(temporary, (value) => { child = value; }); assert.ok(child); assert.equal(existsSync(child), false); await rm(temporary, { recursive: true, force: true });
  }
  await temporaryRun(async (temporary, remember) => { for await (const _item of plan(fixture("term-valid"), terms, { tempDirectory: temporary, onTemporaryDirectory: remember, identitySortChunkSize: 2 })) {} });
  await temporaryRun(async (temporary, remember) => { const root = await mkdtemp("/var/tmp/corpus-normalizer-group-limit-"); await writeFile(path.join(root, "one.md"), "# Alpha\n"); await writeFile(path.join(root, "two.md"), "# Alpha\n"); await assert.rejects(async () => { for await (const _item of plan(root, terms, { tempDirectory: temporary, onTemporaryDirectory: remember, identitySortChunkSize: 2, identityGroupLimit: 1 })) {} }, /exceeds safe limit/); });
  await temporaryRun(async (temporary, remember) => { for await (const _item of plan(fixture("term-valid"), terms, { tempDirectory: temporary, onTemporaryDirectory: remember, identitySortChunkSize: 2 })) break; });
});

test("materializes and validates flat canonical glossary terms only", async () => {
  const planFile = path.join(await mkdtemp("/var/tmp/corpus-normalizer-materialize-plan-"), "plan.ndjson");
  await writePlan(fixture("term-valid"), terms, planFile);
  const output = await mkdtemp("/var/tmp/corpus-normalizer-materialize-output-");
  const result = await materializePlan(planFile, output);
  assert.equal(result.writes, 2);
  assert.deepEqual((await readdir(output)).sort(), ["already-normal.md", "runoff.md"]);
  assert.deepEqual(await validateTerms(output), { valid: true, errors: [], warnings: [], count: 2 });
  const first = await readFile(path.join(output, "already-normal.md"), "utf8");
  assert.match(first, /^---\nidentity: already-normal\nname: Already Normal\n---/);
  await assert.rejects(() => materializePlan(planFile, terms), /outside source and destination/);
});

test("preserves representative glossary metadata and derives documented identities", async () => {
  const directory = fixture("term-representative");
  const cases = [
    ["relational_dynamic.org", "Org #+name"],
    ["blackberry.md", "canonical filename"],
    ["new-modes-sheaf.md", "canonical filename"],
    ["filename-identified.md", "canonical filename"],
    ["bom-repairable.md", "canonical filename"]
  ];
  for (const [name, evidence] of cases) {
    const source = await readFile(path.join(directory, name), "utf8");
    const proposal = await proposeTerm(path.join(directory, name), terms);
    assert.equal(proposal.identityEvidence, evidence);
    if (name === "bom-repairable.md") assert.equal(proposal.repair, "removed UTF-8 BOM before YAML frontmatter");
    else if (name.endsWith(".org")) assert.equal(proposal.content, source.replace(/\r\n/g, "\n").trimEnd() + "\n");
    else assert.match(proposal.content, new RegExp(`identity: ${path.basename(name, ".md")}`));
  }
  const blackberry = await proposeTerm(path.join(directory, "blackberry.md"), terms);
  assert.match(blackberry.content, /aliases:\n  - Rubus fruticosus/);
  assert.match(blackberry.content, /provenance:\n  date-created: 2026-04-02/);
  assert.match(blackberry.content, /keywords:\n  - gardening/);
});

const personalGlossary = process.env.PERSONAL_GLOSSARY ?? "/home/emsenn/info/lib/emsenn/services/561-group/services/public-services-section/services/personal-services-section/emsenn-services-section/content/text/glossary/terms";
test("current personal glossary satisfies the structural term contract", { skip: !existsSync(personalGlossary) }, async () => {
  const root = personalGlossary;
  const result = await validateTerms(root);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.errors.length, 0);
  assert.ok(result.count > 2000);
});

const personalTriage = process.env.PERSONAL_TRIAGE ?? "/home/emsenn/info/lib/emsenn/services/561-group/services/public-services-section/services/personal-services-section/emsenn-services-section/content/text/triage";
test("current personal triage satisfies the flat textual contract", { skip: !existsSync(personalTriage) }, async () => {
  const result = await validateTriageText(personalTriage); assert.equal(result.valid, true, result.errors.join("\n")); assert.equal(result.errors.length, 0); assert.ok(result.count > 6000);
});

test("fails closed for malformed terms and canonical-name collisions", async () => {
  for (const [name, expectedCase] of [["term-malformed", "malformedTerm"], ["term-duplicate", "duplicateTerm"]]) {
    const planFile = path.join(await mkdtemp("/var/tmp/corpus-normalizer-invalid-plan-"), "plan.ndjson");
    await writePlan(fixture(name), terms, planFile);
    const decisions = [];
    for await (const item of plan(fixture(name), terms, { identitySortChunkSize: 2 })) decisions.push(item);
    const matching = decisions.find((item) => item.input === expected[expectedCase].input);
    assert.equal(matching.decision, expected[expectedCase].decision);
    const output = await mkdtemp("/var/tmp/corpus-normalizer-invalid-output-");
    await assert.rejects(() => materializePlan(planFile, output), /unresolved|collision/);
  }
});

test("contracts exact semantic duplicates to one proposed write", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-duplicate-"); const source = path.join(root, "source"); const termRoot = path.join(source, "content", "text", "glossary", "terms"); await mkdir(termRoot, { recursive: true }); await writeFile(path.join(termRoot, "first.md"), "# Alpha\n\nOne definition.\n"); await writeFile(path.join(termRoot, "second.md"), "# Alpha\n\nOne definition.\n"); const destination = path.join(root, "destination", "content", "text", "glossary", "terms"); const decisions = await collect(source, destination);
  const second = decisions.find((item) => item.input.endsWith("second.md"));
  assert.equal(second.decision, "covered-by-exact-duplicate");
  assert.equal(second.status, "proven");
  assert.ok(second.coveredBy);
  const planFile = path.join(await mkdtemp("/var/tmp/corpus-normalizer-exact-plan-"), "plan.ndjson");
  await writePlan(source, destination, planFile);
  const output = await mkdtemp("/var/tmp/corpus-normalizer-exact-output-");
  const result = await materializePlan(planFile, output);
  assert.equal(result.writes, 1);
  assert.deepEqual(await readdir(output), ["first.md"]);
  await applyPlan(planFile, output);
  assert.equal(existsSync(path.join(termRoot, "first.md")), false);
  assert.equal(existsSync(path.join(termRoot, "second.md")), false);
  assert.match(await readFile(path.join(destination, "first.md"), "utf8"), /One definition/);
});

test("projects existing destination, applies guarded changes, and retires covered sources", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-apply-"); const source = path.join(root, "source"); const destination = path.join(root, "destination", "content", "text", "glossary", "terms");
  await mkdir(source); await mkdir(destination, { recursive: true });
  await writeFile(path.join(source, "new.md"), "# New\n\nA new term.\n"); await writeFile(path.join(destination, "existing.md"), "Existing term.\n");
  const planFile = path.join(root, "run.ndjson"); await writePlan(source, destination, planFile); const overlay = path.join(root, "overlay");
  await materializePlan(planFile, overlay); assert.deepEqual((await readdir(overlay)).sort(), ["existing.md", "new.md"]);
  const verified = await applyPlan(planFile, overlay); assert.equal(verified.valid, true); assert.equal(existsSync(path.join(source, "new.md")), false); assert.equal(await readFile(path.join(destination, "existing.md"), "utf8"), "Existing term.\n");
  assert.equal((await verifyPlan(planFile, overlay)).valid, true);
});

test("destination conflicts and post-plan changes leave source and destination untouched", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-guard-"); const source = path.join(root, "source"); const destination = path.join(root, "destination", "content", "text", "glossary", "terms");
  await mkdir(source); await mkdir(destination, { recursive: true }); await writeFile(path.join(source, "alpha.md"), "# Alpha\n"); await writeFile(path.join(destination, "alpha.md"), "Different\n");
  const conflict = path.join(root, "conflict.ndjson"); await writePlan(source, destination, conflict); const conflictText = await readFile(conflict, "utf8"); assert.match(conflictText, /destination-conflict/); await assert.rejects(() => materializePlan(conflict, path.join(root, "overlay-conflict"))); assert.equal(await readFile(path.join(source, "alpha.md"), "utf8"), "# Alpha\n");
  await rm(destination, { recursive: true }); await mkdir(destination, { recursive: true }); const planFile = path.join(root, "run.ndjson"); const overlay = path.join(root, "overlay"); await writePlan(source, destination, planFile); await writeFile(path.join(source, "alpha.md"), "# Changed\n"); await assert.rejects(() => materializePlan(planFile, overlay), /source changed/); assert.equal(existsSync(path.join(destination, "alpha.md")), false); assert.equal(existsSync(overlay), false); assert.equal(existsSync(`${overlay}.corpus-normalizer-run.json`), false); assert.equal(existsSync(`${overlay}.corpus-normalizer-changes.ndjson`), false); assert.equal(existsSync(`${overlay}.corpus-normalizer-tree.ndjson`), false);
});

test("apply refuses destination drift and an empty rerun is idempotent", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-drift-"); const source = path.join(root, "source"); const destination = path.join(root, "destination", "content", "text", "glossary", "terms"); await mkdir(source); await mkdir(destination, { recursive: true }); await writeFile(path.join(source, "beta.md"), "# Beta\n");
  const planFile = path.join(root, "plan.ndjson"); await writePlan(source, destination, planFile); const overlay = path.join(root, "overlay"); await materializePlan(planFile, overlay); await writeFile(path.join(destination, "beta.md"), "drift\n"); await assert.rejects(() => applyPlan(planFile, overlay), /destination changed/); assert.equal(await readFile(path.join(source, "beta.md"), "utf8"), "# Beta\n");
  await rm(destination, { recursive: true }); await mkdir(destination, { recursive: true }); const cleanPlan = path.join(root, "clean.ndjson"); await writePlan(source, destination, cleanPlan); const cleanOverlay = path.join(root, "clean-overlay"); await materializePlan(cleanPlan, cleanOverlay); await applyPlan(cleanPlan, cleanOverlay);
  const rerunPlan = path.join(root, "rerun.ndjson"); await writePlan(source, destination, rerunPlan); const rerunOverlay = path.join(root, "rerun-overlay"); const rerun = await materializePlan(rerunPlan, rerunOverlay); assert.equal(rerun.writes, 0); assert.equal((await applyPlan(rerunPlan, rerunOverlay)).valid, true);
});

test("apply and verify reject every tampered manifest guard", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-tamper-"); const source = path.join(root, "source"); const destination = path.join(root, "destination", "content", "text", "glossary", "terms"); await mkdir(source); await writeFile(path.join(source, "alpha.md"), "# Alpha\n"); const planFile = path.join(root, "plan.ndjson"); await writePlan(source, destination, planFile); const overlay = path.join(root, "overlay"); const result = await materializePlan(planFile, overlay); const originalHeader = JSON.parse(await readFile(result.manifest, "utf8")); const originalSidecar = await readFile(originalHeader.changes.path, "utf8"); const originalTree = await readFile(originalHeader.tree.path, "utf8");
  async function rejectsTamper(mutateHeader, mutateSidecar, mutateTree) {
    const header = structuredClone(originalHeader); let sidecar = originalSidecar; let tree = originalTree; mutateHeader?.(header); sidecar = mutateSidecar?.(sidecar) ?? sidecar; tree = mutateTree?.(tree) ?? tree;
    await writeFile(result.manifest, JSON.stringify(header)); await writeFile(originalHeader.changes.path, sidecar); await writeFile(originalHeader.tree.path, tree);
    await assert.rejects(() => applyPlan(planFile, overlay)); await assert.rejects(() => verifyPlan(planFile, overlay));
  }
  for (const mutate of [(m) => { m.destination = path.join(root, "elsewhere"); }, (m) => { m.changes.path = path.join(root, "other.ndjson"); }, (m) => { m.changes.hash = "bad"; }, (m) => { m.changes.count += 1; }]) await rejectsTamper(mutate);
  for (const mutate of [
    (text) => `${text}{"added":true}\n`,
    (text) => text.split("\n").slice(0, -2).join("\n") + "\n",
    (text) => text.replace("sourceRoot", "sourceRootTampered"),
    (text) => text.replace('"targetBefore":null', '"targetBefore":"bad"').replace('"sourceRoot":"', '"sourceRoot":"/bad')
  ]) await rejectsTamper(null, mutate);
  for (const mutate of [(m) => { m.tree.path = path.join(root, "other-tree.ndjson"); }, (m) => { m.tree.hash = "bad"; }, (m) => { m.tree.count += 1; }]) await rejectsTamper(mutate);
  for (const mutate of [(text) => `${text}{"path":"added"}\n`, (text) => text.split("\n").slice(0, -2).join("\n") + "\n", (text) => text.replace("\"type\":\"file\"", "\"type\":\"tampered\"")]) await rejectsTamper(null, null, mutate);
  await writeFile(result.manifest, JSON.stringify(originalHeader)); await writeFile(originalHeader.changes.path, originalSidecar); await writeFile(originalHeader.tree.path, originalTree);
});

test("copy action preserves opaque bytes and executable mode through materialize apply and retirement", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-copy-"); const fixture = await copyPlan(root); const overlay = path.join(root, "overlay"); const materialized = await materializePlan(fixture.planFile, overlay);
  assert.equal(materialized.writes, 1); const sidecar = JSON.parse(await readFile(`${overlay}.corpus-normalizer-changes.ndjson`, "utf8")); assert.deepEqual({ action: sidecar.action, modeAfter: sidecar.modeAfter }, { action: "copy", modeAfter: 0o755 });
  const projected = path.join(overlay, "asset.html"); assert.deepEqual(await readFile(projected), fixture.bytes); assert.equal((await stat(projected)).mode & 0o777, 0o755);
  await applyPlan(fixture.planFile, overlay); assert.deepEqual(await readFile(fixture.target), fixture.bytes); assert.equal((await stat(fixture.target)).mode & 0o777, 0o755); assert.equal(existsSync(fixture.source), false);
});

test("exact-covered copy retires source while drift and action/mode sidecar tampering fail closed", async () => {
  const coveredRoot = await mkdtemp("/var/tmp/corpus-normalizer-copy-covered-"); const covered = await copyPlan(coveredRoot, { covered: true }); const coveredOverlay = path.join(coveredRoot, "overlay"); await materializePlan(covered.planFile, coveredOverlay); await applyPlan(covered.planFile, coveredOverlay); assert.equal(existsSync(covered.source), false); assert.deepEqual(await readFile(covered.target), covered.bytes);
  const root = await mkdtemp("/var/tmp/corpus-normalizer-copy-guards-"); const fixture = await copyPlan(root); const overlay = path.join(root, "overlay"); await materializePlan(fixture.planFile, overlay); const sidecarPath = `${overlay}.corpus-normalizer-changes.ndjson`; const original = await readFile(sidecarPath, "utf8"); const tampered = JSON.parse(original); tampered.action = "write"; tampered.modeAfter = 0o644; await writeFile(sidecarPath, `${JSON.stringify(tampered)}\n`); await assert.rejects(() => applyPlan(fixture.planFile, overlay), /sidecar/); await writeFile(sidecarPath, original);
  await writeFile(fixture.source, Buffer.from([9, 9])); await assert.rejects(() => applyPlan(fixture.planFile, overlay), /source changed/); assert.equal(existsSync(fixture.target), false); assert.equal(existsSync(fixture.source), true);
});

test("transaction header keeps change records in a sidecar, not an in-memory array", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-sidecar-"); const source = path.join(root, "source"); const destination = path.join(root, "destination", "content", "text", "triage"); const overlay = path.join(root, "overlay"); await mkdir(source);
  for (let index = 0; index < 260; index += 1) await writeFile(path.join(source, `item-${String(index).padStart(3, "0")}.txt`), `item ${index}\n`);
  const planFile = path.join(root, "plan.ndjson"); await writePlan(source, destination, planFile); const result = await materializePlan(planFile, overlay); const header = JSON.parse(await readFile(result.manifest, "utf8"));
  assert.equal(Array.isArray(header.changes), false); assert.equal(typeof header.changes.path, "string"); assert.equal(header.changes.count, 260); assert.equal((await readFile(header.changes.path, "utf8")).trim().split("\n").length, 260);
  await applyPlan(planFile, overlay); assert.equal((await verifyPlan(planFile, overlay)).valid, true);
});

test("transaction hashes and transfers large projected files through stream/copy paths", async () => {
  const implementation = await readFile(path.join(here, "..", "src", "materialize.mjs"), "utf8");
  assert.match(implementation, /for await \(const chunk of createReadStream\(file\)\)/);
  assert.match(implementation, /copyFile\(projected, change\.target\)/);
  assert.doesNotMatch(implementation, /readFile\(projected\)/);
  const root = await mkdtemp("/var/tmp/corpus-normalizer-large-transfer-"); const source = path.join(root, "source"); const destination = path.join(root, "destination", "content", "text", "triage"); const overlay = path.join(root, "overlay"); await mkdir(source);
  const body = "x".repeat(2 * 1024 * 1024); await writeFile(path.join(source, "large.txt"), body);
  const planFile = path.join(root, "plan.ndjson"); await writePlan(source, destination, planFile); await materializePlan(planFile, overlay); await applyPlan(planFile, overlay);
  assert.equal((await readFile(path.join(destination, "large.txt"), "utf8")).length, body.length + 1);
});
