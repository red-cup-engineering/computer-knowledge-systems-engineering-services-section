import { createReadStream, createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, rm, rename } from "node:fs/promises";
import readline from "node:readline";
import path from "node:path";
import { resolveDestinationContract } from "./contracts.mjs";
import { boundaryKinds, isGenerated } from "./detect.mjs";
import { inventory } from "./inventory.mjs";
import { sha256 } from "./term.mjs";
import { formFor } from "./forms.mjs";
import { scratchDirectory } from "./temp.mjs";

export const decisionSchemaVersion = "corpus-normalizer.decision.v2";
const incompatibleWithTerm = new Set(["notebook", "bibliography", "package-root", "service-section", "directory", "file"]);

async function writeRecord(stream, record) { if (!stream.write(`${JSON.stringify(record)}\n`)) await new Promise((resolve) => stream.once("drain", resolve)); }
async function closeWriter(stream) { await new Promise((resolve, reject) => stream.end(resolve).once("error", reject)); }
async function* records(file) { const input = readline.createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity }); for await (const line of input) if (line.trim()) yield JSON.parse(line); }
const lexical = (left, right) => left.localeCompare(right, "en");
async function hashFile(file) { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); }

/** Bounded external NDJSON sort with bounded multi-pass fan-in. */
export async function externalSortNdjson(input, output, compare, { chunkSize = 4096, mergeFanIn = 32 } = {}) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error("external sort chunkSize must be a positive integer");
  if (!Number.isInteger(mergeFanIn) || mergeFanIn < 2) throw new Error("external sort mergeFanIn must be at least 2");
  const work = await mkdtemp(path.join(path.dirname(output), ".corpus-normalizer-sort-"));
  async function spill(chunk, index) { const file = path.join(work, `run-${index}.ndjson`); const writer = createWriteStream(file, { encoding: "utf8" }); chunk.sort(compare); for (const record of chunk) await writeRecord(writer, record); await closeWriter(writer); return file; }
  async function merge(files, file) {
    const iterators = files.map((item) => records(item)[Symbol.asyncIterator]()); const current = await Promise.all(iterators.map((iterator) => iterator.next())); const writer = createWriteStream(file, { encoding: "utf8" });
    try { while (true) { let selected = -1; for (let index = 0; index < current.length; index += 1) if (!current[index].done && (selected < 0 || compare(current[index].value, current[selected].value) < 0)) selected = index; if (selected < 0) break; await writeRecord(writer, current[selected].value); current[selected] = await iterators[selected].next(); } await closeWriter(writer); } catch (error) { writer.destroy(); throw error; }
  }
  try {
    let chunk = []; let run = 0; let active = [];
    for await (const record of records(input)) { chunk.push(record); if (chunk.length >= chunkSize) { active.push(await spill(chunk, run)); run += 1; chunk = []; } }
    if (chunk.length) active.push(await spill(chunk, run));
    if (!active.length) { await closeWriter(createWriteStream(output, { encoding: "utf8" })); return; }
    let pass = 0;
    while (active.length > 1) { const next = []; for (let index = 0; index < active.length; index += mergeFanIn) { const batch = active.slice(index, index + mergeFanIn); const merged = path.join(work, `merge-${pass}-${index}.ndjson`); await merge(batch, merged); await Promise.all(batch.map((file) => rm(file, { force: true }))); next.push(merged); } active = next; pass += 1; }
    await rm(output, { force: true }); await rename(active[0], output);
  } finally { await rm(work, { recursive: true, force: true }); }
}

function identityRecord(decision) { if (!decision.proposed?.identity || !["write", "covered-by-destination"].includes(decision.proposed.action)) return null; return { input: decision.input, id: decision.id, identity: decision.proposed.definesIdentity ?? decision.proposed.identity, hash: decision.proposed.definitionSha256 ?? decision.proposed.proposedContentSha256, contentHash: decision.proposed.proposedContentSha256, output: decision.proposed.output, targetState: decision.target?.state ?? "absent" }; }
const identityOrder = (left, right) => lexical(left.identity, right.identity) || ((left.targetState === "exact-covered" ? 0 : 1) - (right.targetState === "exact-covered" ? 0 : 1)) || lexical(left.input, right.input);
const inputOrder = (left, right) => lexical(left.input, right.input);

async function patchIdentityGroups(sortedIdentities, patchFile, { identityGroupLimit = 100000 } = {}) {
  if (!Number.isInteger(identityGroupLimit) || identityGroupLimit < 1) throw new Error("identityGroupLimit must be a positive integer");
  const writer = createWriteStream(patchFile, { encoding: "utf8" }); let group = []; let identity = null;
  async function emitGroup() {
    if (!group.length) return;
    const canonical = group[0]; const hashes = new Set(group.map((record) => record.hash));
    if (hashes.size !== 1) for (const record of group) await writeRecord(writer, { input: record.input, patch: { decision: "identity-conflict", rule: "destination.identity-conflict.v2", status: "invalid", evidence: [`identity ${record.identity} has conflicting canonical content`], proposed: { action: "conflict" } } });
    else for (const record of group.slice(1)) await writeRecord(writer, { input: record.input, patch: { decision: "covered-by-exact-duplicate", rule: "destination.identity-exact-duplicate.v2", status: "proven", coveredBy: canonical.id, proposed: { output: canonical.output, action: "covered-by-duplicate", proposedContentSha256: canonical.contentHash } } });
    group = [];
  }
  try { for await (const record of records(sortedIdentities)) { if (identity !== null && record.identity !== identity) await emitGroup(); identity = record.identity; group.push(record); if (group.length > identityGroupLimit) throw new Error(`identity group ${identity} exceeds safe limit ${identityGroupLimit}; refusing to classify it`); } await emitGroup(); await closeWriter(writer); } catch (error) { writer.destroy(); throw error; }
}
function applyPatch(decision, patch) { if (!patch) return decision; const proposed = patch.proposed ? { ...decision.proposed, ...patch.proposed } : decision.proposed; return { ...decision, ...patch, proposed, evidence: patch.evidence ?? decision.evidence }; }

async function candidateDecision(entry, contract, options) {
  if (entry.relativePath === ".") return contract.form === "service-section" && !path.basename(entry.absolutePath).endsWith("-services-section") ? { decision: "service-section-source-required", rule: "destination.service-section.v1", status: "invalid", evidence: ["direct service-section admission requires a source root ending -services-section"], rejectedAlternatives: [] } : { decision: "accounting-root", rule: "source.root-accounting.v1", status: "proven", evidence: ["source root is an accounting record, never a transformer candidate"], rejectedAlternatives: [] };
  if (isGenerated(entry.relativePath)) return contract.form === "reference-source" ? { decision: "reference-source-incompatible", rule: "destination.reference-sources.v1", status: "invalid", evidence: ["reference source destinations do not admit generated roots"], rejectedAlternatives: [] } : { decision: entry.unit?.root === entry.relativePath ? "exclude-generated-unit" : "accounted-by-unit", rule: "source.generated-output.v2", status: "proven", evidence: [`${entry.relativePath} belongs to generated unit ${entry.unit?.id}`, "generated output is not source corpus material"], rejectedAlternatives: [{ decision: "normalize-as-authored", reason: "generated directories are excluded by rule" }] };
  if (entry.type === "symlink") {
    if (entry.packageSourcePointer) return { decision: "resolve-package-source", rule: "source.symlink-package-source.v1", status: "supported", evidence: [`symlink resolves to ${entry.realPath}`, "resolved target has a package marker", "inventory did not traverse the link"], rejectedAlternatives: [] };
    return { decision: "route-out-incompatible-unit", rule: "source.symlink-generic.v1", status: "invalid", evidence: [`symlink resolves to ${entry.realPath ?? "no target"}`, "generic symlink has no safe corpus representation"], rejectedAlternatives: [] };
  }
  if (contract.form === "reference-source") {
    if (entry.type === "directory") return { decision: entry.relativePath === "." ? "accounting-root" : "reference-source-incompatible", rule: "destination.reference-sources.v1", status: entry.relativePath === "." ? "proven" : "invalid", evidence: [entry.relativePath === "." ? "source root is an accounting record, never a transformer candidate" : "reference source destinations admit one flat directory of files"], rejectedAlternatives: [] };
    if (entry.type !== "file" || entry.representation === "package-manifest" || entry.representation === "python-project-manifest" || entry.representation === "rust-project-manifest" || entry.representation === "go-project-manifest") return { decision: "reference-source-incompatible", rule: "destination.reference-sources.v1", status: "invalid", evidence: ["reference source destinations do not admit packages or special nodes"], rejectedAlternatives: [] };
    try {
      const proposed = await formFor("reference-source").propose(entry.absolutePath, contract.destination);
      let target = { state: "absent", sha256: null };
      try { const stat = await lstat(proposed.output); if (!stat.isFile()) throw new Error("target is not a file"); const hash = await hashFile(proposed.output); target = { state: hash === proposed.proposedContentSha256 ? "exact-covered" : "conflict", sha256: hash }; } catch (error) { if (error.code !== "ENOENT") return { decision: "destination-conflict", rule: "destination.reference-sources.v1", status: "invalid", evidence: [String(error.message)], rejectedAlternatives: [] }; }
      if (target.state === "conflict") return { decision: "destination-conflict", rule: "destination.reference-sources.v1", status: "invalid", evidence: [`existing target differs: ${proposed.output}`], proposed, target, rejectedAlternatives: [] };
      return { decision: target.state === "exact-covered" ? "destination-exact-covered" : "propose-output", rule: "destination.reference-sources.v1", status: "proven", evidence: ["supported flat reference source", `destination target is ${target.state}`], rejectedAlternatives: [], proposed: { ...proposed, action: target.state === "exact-covered" ? "covered-by-destination" : proposed.action }, target };
    } catch (error) { return { decision: "reference-source-incompatible", rule: "destination.reference-sources.v1", status: "invalid", evidence: [String(error.message)], rejectedAlternatives: [] }; }
  }
  if (entry.type === "directory" && !entry.unit) return { decision: "accounting-container", rule: "source.container-accounting.v1", status: "proven", evidence: ["directory is an ancestor of a cohesive unit, not a destination candidate"], rejectedAlternatives: [] };
  if (contract.form === "service-section") {
    if (entry.type === "directory") return { decision: "service-section-directory-accounting", rule: "destination.service-section.v1", status: "proven", evidence: ["service section directories are represented by authored files"], rejectedAlternatives: [] };
    const handler = formFor("service-section"); if (!handler.accepts(entry)) return { decision: "service-section-source-required", rule: "destination.service-section.v1", status: "invalid", evidence: ["authored files require one source service-section root"], rejectedAlternatives: [] };
    const proposed = await handler.propose(entry, contract.destination); let target={state:"absent",sha256:null}; try { const stat=await lstat(proposed.output); if(!stat.isFile())throw new Error("target is not a file"); const hash=await hashFile(proposed.output); target={state:hash===proposed.proposedContentSha256?"exact-covered":"conflict",sha256:hash}; } catch(error){if(error.code!=="ENOENT") return {decision:"destination-conflict",rule:"destination.service-section.v1",status:"invalid",evidence:[String(error.message)],rejectedAlternatives:[]};}
    if(target.state==="conflict") return {decision:"destination-conflict",rule:"destination.service-section.v1",status:"invalid",evidence:[`existing target differs: ${proposed.output}`],proposed,target,rejectedAlternatives:[]}; return {decision:target.state==="exact-covered"?"destination-exact-covered":"propose-output",rule:"destination.service-section.v1",status:"proven",evidence:["authored service-section file",`destination target is ${target.state}`],rejectedAlternatives:[],proposed:{...proposed,action:target.state==="exact-covered"?"covered-by-destination":"copy"},target};
  }
  if (contract.form === "application") {
    if (entry.representation === "package-root" && entry.relativePath !== ".") return { decision: "application-nested-package", rule: "destination.application-single-root.v1", status: "invalid", evidence: ["one application destination admits exactly one root package unit"], rejectedAlternatives: [] };
    if (entry.type === "directory") return { decision: "application-directory-accounting", rule: "destination.application-directory.v1", status: "proven", evidence: ["application directories are represented by authored files"], rejectedAlternatives: [] };
    const handler = formFor("application"); const standaloneNotebook = !handler.accepts(entry) && await handler.isStandaloneNotebook(entry);
    if (!handler.accepts(entry) && !standaloneNotebook) return { decision: "application-loose-file", rule: "destination.application-root-package.v1", status: "invalid", evidence: ["authored application files require one root package unit"], rejectedAlternatives: [] };
    if (standaloneNotebook && !(await handler.destinationNotebookContract(contract.destination)).valid) return { decision: "application-notebook-destination-required", rule: "destination.application-notebook.v1", status: "invalid", evidence: ["standalone notebooks require an existing valid application destination with notebooks/"], rejectedAlternatives: [] };
    let proposed;
    try { proposed = standaloneNotebook ? await handler.proposeNotebook(entry, contract.destination, options?.rewriteMap) : await handler.propose(entry, contract.destination); } catch (error) { return { decision: "application-notebook-invalid", rule: "destination.application-notebook.v1", status: "invalid", evidence: [String(error.message)], rejectedAlternatives: [] }; }
    let target = { state: "absent", sha256: null };
    try { const stat = await lstat(proposed.output); if (!stat.isFile()) throw new Error("target is not a file"); const hash = await hashFile(proposed.output); target = { state: hash === proposed.proposedContentSha256 ? "exact-covered" : "conflict", sha256: hash }; } catch (error) { if (error.code !== "ENOENT") return { decision: "destination-conflict", rule: "destination.application-target.v1", status: "invalid", evidence: [String(error.message)], rejectedAlternatives: [] }; }
    if (target.state === "conflict") return { decision: "destination-conflict", rule: "destination.application-target.v1", status: "invalid", evidence: [`existing target differs: ${proposed.output}`], proposed, target, rejectedAlternatives: [] };
    const action = target.state === "exact-covered" ? "covered-by-destination" : proposed.action;
    return { decision: target.state === "exact-covered" ? "destination-exact-covered" : "propose-output", rule: standaloneNotebook ? "destination.application-notebook.v1" : "destination.application.v1", status: "proven", evidence: [standaloneNotebook ? "standalone notebook admitted by existing application notebooks contract" : "root package authored file", `destination target is ${target.state}`, ...(proposed.replacements?.map((item) => `rewrite ${item.from} -> ${item.to}`) ?? [])], rejectedAlternatives: [], proposed: { ...proposed, action }, target };
  }
  if (contract.form === "term" && entry.representation === "glossary-terms-root") return { decision: "term-unit-container", rule: "destination.term-unit.v1", status: "proven", evidence: ["typed glossary root is a cohesive term unit"], rejectedAlternatives: [] };
  if (["term", "triage-text", "note"].includes(contract.form) && entry.representation === "text" && (!entry.unit || entry.unit.kind === "glossary-terms-root" || entry.unit.root === entry.relativePath)) {
    try {
      const proposed = await formFor(contract.form).propose(entry.absolutePath, contract.destination);
      if (proposed.warnings.length) return { decision: "route-out-incompatible-unit", rule: `destination.${contract.form}-markup.v1`, status: "invalid", evidence: proposed.warnings, rejectedAlternatives: [{ decision: `normalize-as-${contract.form}`, reason: "source markup has no narrow proven repair" }] };
      let target = { state: "absent", sha256: null };
      try { const stat = await lstat(proposed.output); if (!stat.isFile()) throw new Error("target is not a file"); const hash = await hashFile(proposed.output); target = { state: proposed.proposedContentSha256 === hash ? "exact-covered" : "conflict", sha256: hash }; } catch (error) { if (error.code !== "ENOENT") return { decision: "destination-conflict", rule: `destination.${contract.form}-target.v1`, status: "invalid", evidence: [String(error.message)], rejectedAlternatives: [] }; }
      if (target.state === "conflict") return { decision: "destination-conflict", rule: `destination.${contract.form}-target.v1`, status: "invalid", evidence: [`existing target differs: ${proposed.output}`], rejectedAlternatives: [], proposed, target };
      return { decision: target.state === "exact-covered" ? "destination-exact-covered" : "propose-output", rule: `destination.${contract.form}.v1`, status: "proven", evidence: [`${contract.form} has a canonical filename`, `destination target is ${target.state}`], rejectedAlternatives: [], proposed: { ...proposed, action: target.state === "exact-covered" ? "covered-by-destination" : "write" }, target };
    } catch (error) {
      return { decision: "route-out-incompatible-unit", rule: `destination.${contract.form}-markup.v1`, status: "invalid", evidence: [String(error.message)], rejectedAlternatives: [{ decision: `normalize-as-${contract.form}`, reason: "source markup is not canonicalizable" }] };
    }
  }
  if (entry.unit && entry.unit.root !== entry.relativePath && !entry.unitRepresentative) return { decision: "accounted-by-unit", rule: "unit.member-accounting.v1", status: "proven", evidence: [`member of cohesive ${entry.unit.kind} unit ${entry.unit.id}`], rejectedAlternatives: [] };
  if (entry.representation === "archive") return { decision: "inspect-archive-as-contained-units", rule: "source.archive-safe-traversal.v1", status: "supported", evidence: ["archive is an opaque carrier; no member path is trusted or written"], rejectedAlternatives: [{ decision: "treat-archive-name-as-destination-tree", reason: "safe extraction belongs to a later transformer" }] };
  if (contract.form === "unknown") return { decision: "no-destination-contract", rule: contract.rule, status: "invalid", evidence: ["destination path matches no installed corpus contract"], rejectedAlternatives: [] };
  if (contract.form === "term" && incompatibleWithTerm.has(entry.representation)) return { decision: "route-out-incompatible-unit", rule: "destination.term-representation.v1", status: "invalid", evidence: [`${entry.representation} cannot be admitted as one glossary term`, "destination contract is a flat glossary term set"], rejectedAlternatives: [{ decision: "normalize-as-term", reason: "representation requires its own destination contract" }] };
  return { decision: "inspect-unit-for-transformer", rule: contract.rule, status: "supported", evidence: [`destination contract is ${contract.form}`, `cohesive unit kind is ${entry.representation}`], rejectedAlternatives: [{ decision: "source-path-routing", reason: "explicit destination contract has precedence" }] };
}

export async function makeDecision(entry, contract, options) {
  const result = await candidateDecision(entry, contract, options);
  return { schema: decisionSchemaVersion, id: `decision:${encodeURIComponent(entry.relativePath)}`, input: entry.relativePath, sourcePath: entry.absolutePath, inputType: entry.type, size: entry.size, representation: entry.representation, boundaries: boundaryKinds(entry, entry.representation), unitId: entry.unit?.id ?? null, unitRoot: entry.unit?.root ?? null, unitKind: entry.unit?.kind ?? null, boundaryAncestry: entry.boundaryAncestry.map((unit) => ({ id: unit.id, root: unit.root, kind: unit.kind })), realPath: entry.realPath ?? null, destination: contract.destination, destinationForm: contract.form, ...result, preconditions: [], postconditions: ["every inventoried path has one decision record", "no source mutation was performed"] };
}

export async function* plan(source, destination, options) {
  const contract = resolveDestinationContract(destination); const sourceRoot = path.resolve(source);
  const temporary = await mkdtemp(path.join(await scratchDirectory(options?.tempDirectory), "corpus-normalizer-plan-"));
  const provisionalFile = path.join(temporary, "provisional.ndjson"); const identityFile = path.join(temporary, "identities.ndjson"); const sortedIdentityFile = path.join(temporary, "identities.sorted.ndjson"); const patchFile = path.join(temporary, "patches.ndjson"); const sortedPatchFile = path.join(temporary, "patches.sorted.ndjson");
  options?.onTemporaryDirectory?.(temporary);
  try {
    const provisionalWriter = createWriteStream(provisionalFile, { encoding: "utf8" }); const identityWriter = createWriteStream(identityFile, { encoding: "utf8" });
    try {
      for await (const entry of inventory(source, options)) {
        const decision = { ...await makeDecision(entry, contract, options), sourceRoot };
        await writeRecord(provisionalWriter, decision);
        const record = identityRecord(decision); if (record) await writeRecord(identityWriter, record);
      }
      await closeWriter(provisionalWriter); await closeWriter(identityWriter);
    } catch (error) { provisionalWriter.destroy(); identityWriter.destroy(); throw error; }
    const sortOptions = { chunkSize: options?.identitySortChunkSize ?? options?.chunkSize ?? 4096, mergeFanIn: options?.sortMergeFanIn ?? 32 };
    await externalSortNdjson(identityFile, sortedIdentityFile, identityOrder, sortOptions);
    await patchIdentityGroups(sortedIdentityFile, patchFile, { identityGroupLimit: options?.identityGroupLimit ?? 100000 });
    await externalSortNdjson(patchFile, sortedPatchFile, inputOrder, sortOptions);
    const patches = records(sortedPatchFile)[Symbol.asyncIterator](); let nextPatch = await patches.next();
    for await (const decision of records(provisionalFile)) {
      while (!nextPatch.done && lexical(nextPatch.value.input, decision.input) < 0) throw new Error(`orphan identity patch for ${nextPatch.value.input}`);
      if (!nextPatch.done && nextPatch.value.input === decision.input) { yield applyPatch(decision, nextPatch.value.patch); nextPatch = await patches.next(); }
      else yield decision;
    }
    if (!nextPatch.done) throw new Error(`orphan identity patch for ${nextPatch.value.input}`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function writePlan(source, destination, output, options) {
  const sourceRoot = path.resolve(source); const outputPath = path.resolve(output);
  if (outputPath === sourceRoot || outputPath.startsWith(`${sourceRoot}${path.sep}`)) throw new Error("Plan output must be outside the source tree so dry-run inventory cannot alter its input.");
  await mkdir(path.dirname(outputPath), { recursive: true }); const stream = createWriteStream(outputPath, { encoding: "utf8" }); let count = 0;
  try { for await (const decision of plan(source, destination, options)) { if (!stream.write(`${JSON.stringify(decision)}\n`)) await new Promise((resolve) => stream.once("drain", resolve)); count += 1; } await new Promise((resolve, reject) => stream.end(resolve).once("error", reject)); return { output: outputPath, count }; }
  catch (error) { stream.destroy(); await rm(outputPath, { force: true }); throw error; }
}

export async function* readPlanLines(file) { const input = readline.createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity }); for await (const line of input) if (line.trim()) yield JSON.parse(line); }

export async function explainPlan(file, output = process.stdout) {
  const counts = { proven: 0, supported: 0, ambiguous: 0, invalid: 0 }; const decisions = {}; let inputs = 0;
  for await (const item of readPlanLines(file)) { inputs += 1; counts[item.status] = (counts[item.status] ?? 0) + 1; decisions[item.decision] = (decisions[item.decision] ?? 0) + 1; if (item.status !== "proven" || item.decision.startsWith("exclude-")) output.write(`${JSON.stringify({ type: "review", decision: item })}\n`); }
  output.write(`${JSON.stringify({ type: "summary", inputs, statuses: counts, decisions })}\n`);
}
