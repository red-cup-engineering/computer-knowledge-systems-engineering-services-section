import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { chmod, lstat, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyBibliography, materializeBibliography, verifyBibliography, writeBibliographyPlan } from "../src/bibliography-transaction.mjs";

async function fixture({ existing = null, source = "@book{A,title={A}}\n" } = {}) {
  const root = await mkdtemp("/var/tmp/bib-transaction-");
  const sourceRoot = path.join(root, "source");
  const destination = path.join(root, "destination", "bibliography.bib");
  const plan = path.join(root, "plan.ndjson");
  const output = path.join(root, "projection");
  await mkdir(sourceRoot); await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(path.join(sourceRoot, "input.bib"), source);
  if (existing !== null) await writeFile(destination, existing);
  return { root, sourceRoot, destination, plan, output, source: path.join(sourceRoot, "input.bib") };
}

test("bibliography plan write and absent projection are deterministic and validate exact aggregate bytes", async () => {
  const item = await fixture();
  const first = await writeBibliographyPlan(item.sourceRoot, item.destination, item.plan);
  const secondPlan = path.join(item.root, "second.ndjson");
  await writeBibliographyPlan(item.sourceRoot, item.destination, secondPlan);
  assert.equal(await readFile(item.plan, "utf8"), await readFile(secondPlan, "utf8"));
  assert.ok(first.count > 2);
  const result = await materializeBibliography(item.plan, item.output);
  assert.equal(await readFile(result.bibliography, "utf8"), "@book{A,title={A}}\n");
  const manifest = JSON.parse(await readFile(result.manifest, "utf8"));
  assert.equal(manifest.sourceRoot, item.sourceRoot); assert.equal(manifest.destination, item.destination); assert.equal(manifest.projected.sha256, result.sha256);
});

test("existing exact target is authenticated and projected as the aggregate", async () => {
  const exact = "% retained\n@book{A,title={A}}\n";
  const item = await fixture({ existing: exact, source: exact });
  await writeBibliographyPlan(item.sourceRoot, item.destination, item.plan);
  const result = await materializeBibliography(item.plan, item.output);
  assert.equal(await readFile(result.bibliography, "utf8"), "% retained\n\n@book{A,title={A}}\n");
  assert.equal(JSON.parse(await readFile(result.manifest, "utf8")).targetBefore.state, "present");
});

test("invalid conflicts refuse projection and clean all projection artifacts", async () => {
  const item = await fixture({ existing: "@book{A,title={old}}\n" });
  await writeBibliographyPlan(item.sourceRoot, item.destination, item.plan);
  await assert.rejects(() => materializeBibliography(item.plan, item.output), /invalid record|proven aggregate/);
  assert.equal(existsSync(item.output), false);
  assert.equal(existsSync(`${item.output}.corpus-normalizer-bibliography-run.json`), false);
});

test("source drift, target drift, and aggregate plan tampering fail closed", async () => {
  const sourceDrift = await fixture();
  await writeBibliographyPlan(sourceDrift.sourceRoot, sourceDrift.destination, sourceDrift.plan);
  await writeFile(sourceDrift.source, "@book{A,title={changed}}\n");
  await assert.rejects(() => materializeBibliography(sourceDrift.plan, sourceDrift.output), /source changed/);
  assert.equal(existsSync(sourceDrift.output), false);

  const targetDrift = await fixture({ existing: "@book{Z,title={Z}}\n" });
  await writeBibliographyPlan(targetDrift.sourceRoot, targetDrift.destination, targetDrift.plan);
  await writeFile(targetDrift.destination, "@book{Z,title={changed}}\n");
  await assert.rejects(() => materializeBibliography(targetDrift.plan, targetDrift.output), /destination changed/);

  const tampered = await fixture();
  await writeBibliographyPlan(tampered.sourceRoot, tampered.destination, tampered.plan);
  const text = await readFile(tampered.plan, "utf8");
  await writeFile(tampered.plan, text.replace("title={A}", "title={tampered}"));
  await assert.rejects(() => materializeBibliography(tampered.plan, tampered.output), /content hash mismatch/);
});

test("nonempty output is refused without deleting caller content", async () => {
  const item = await fixture();
  await writeBibliographyPlan(item.sourceRoot, item.destination, item.plan);
  await mkdir(item.output); await writeFile(path.join(item.output, "keep"), "keep\n");
  await assert.rejects(() => materializeBibliography(item.plan, item.output), /absent or empty/);
  assert.equal(await readFile(path.join(item.output, "keep"), "utf8"), "keep\n");
});

test("apply atomically reaches the aggregate, preserves target mode, and retires covered sources within their root", async () => {
  const item = await fixture({ source: "@book{A,title={A}}\n" });
  const nested = path.join(item.sourceRoot, "nested"); await mkdir(nested);
  await writeFile(path.join(nested, "extra.bib"), "@book{B,title={B}}\n");
  const outside = path.join(item.root, "outside"); await mkdir(outside); await writeFile(path.join(outside, "keep"), "keep\n");
  await writeFile(item.destination, "@book{Z,title={before}}\n"); await chmod(item.destination, 0o640);
  await writeBibliographyPlan(item.sourceRoot, item.destination, item.plan);
  await materializeBibliography(item.plan, item.output);
  const result = await applyBibliography(item.plan, item.output);
  assert.equal(result.valid, true);
  assert.match(await readFile(item.destination, "utf8"), /@book\{A/);
  assert.match(await readFile(item.destination, "utf8"), /@book\{B/);
  assert.equal((await lstat(item.destination)).mode & 0o777, 0o640);
  assert.equal(existsSync(item.sourceRoot), false);
  assert.equal(await readFile(path.join(outside, "keep"), "utf8"), "keep\n");
});

test("apply handles an interrupted-after-write rerun and never retires a source equal to the destination", async () => {
  const item = await fixture({ existing: "@book{Z,title={before}}\n" });
  await writeBibliographyPlan(item.sourceRoot, item.destination, item.plan);
  const projection = await materializeBibliography(item.plan, item.output);
  await writeFile(item.destination, await readFile(projection.bibliography));
  assert.equal((await applyBibliography(item.plan, item.output)).valid, true);
  assert.equal(existsSync(item.source), false);

  const root = await mkdtemp("/var/tmp/bib-overlap-"); const sourceRoot = path.join(root, "source"); const destination = path.join(sourceRoot, "bibliography.bib"); const plan = path.join(root, "plan.ndjson"); const output = path.join(root, "projection");
  await mkdir(sourceRoot); await writeFile(destination, "@book{A,title={A}}\n");
  await writeBibliographyPlan(sourceRoot, destination, plan); await materializeBibliography(plan, output); await applyBibliography(plan, output);
  assert.equal(existsSync(destination), true);
});

test("apply and verify reject manifest, projection, source, and target drift", async () => {
  const make = async () => { const item = await fixture({ existing: "@book{Z,title={before}}\n" }); await writeBibliographyPlan(item.sourceRoot, item.destination, item.plan); const result = await materializeBibliography(item.plan, item.output); return { ...item, result }; };
  const manifestDrift = await make(); const manifest = JSON.parse(await readFile(manifestDrift.result.manifest, "utf8")); manifest.targetBefore = { state: "absent", sha256: null }; await writeFile(manifestDrift.result.manifest, JSON.stringify(manifest)); await assert.rejects(() => applyBibliography(manifestDrift.plan, manifestDrift.output), /manifest/);
  const projectionDrift = await make(); const targetBefore = await readFile(projectionDrift.destination, "utf8"); await writeFile(projectionDrift.result.bibliography, "@book{P,title={changed}}\n"); await assert.rejects(() => applyBibliography(projectionDrift.plan, projectionDrift.output), /projected bibliography changed/); assert.equal(await readFile(projectionDrift.destination, "utf8"), targetBefore);
  const sourceDrift = await make(); await writeFile(sourceDrift.source, "@book{A,title={changed}}\n"); await assert.rejects(() => applyBibliography(sourceDrift.plan, sourceDrift.output), /source changed/);
  const targetDrift = await make(); await writeFile(targetDrift.destination, "@book{Q,title={changed}}\n"); await assert.rejects(() => applyBibliography(targetDrift.plan, targetDrift.output), /destination changed/);
});

test("verify requires a parseable target with the exact projected hash", async () => {
  const item = await fixture(); await writeBibliographyPlan(item.sourceRoot, item.destination, item.plan); await materializeBibliography(item.plan, item.output); await applyBibliography(item.plan, item.output);
  assert.equal((await verifyBibliography(item.plan, item.output)).valid, true);
  await writeFile(item.destination, "@book{A,title={unterminated}\n");
  await assert.rejects(() => verifyBibliography(item.plan, item.output), /target hash mismatch/);
});
