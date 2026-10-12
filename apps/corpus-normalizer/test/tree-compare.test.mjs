import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import test from "node:test";
import { compareTrees, streamTreeComparison, writeTreeComparisonNdjson } from "../src/tree-compare.mjs";

async function tree(files = {}) {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-compare-");
  for (const [name, body] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), body); }
  return root;
}
async function compared(candidate, live, options) { const result = await compareTrees(candidate, live, options); await Promise.all([rm(candidate, { recursive: true, force: true }), rm(live, { recursive: true, force: true })]); return result; }

test("compares exact, subset, additive, divergent, and mode-only trees", async () => {
  let candidate = await tree({ "a.txt": "a\n" }); let live = await tree({ "a.txt": "a\n" });
  assert.equal((await compared(candidate, live)).summary.relation, "exact-tree");
  candidate = await tree({ "a.txt": "a\n" }); live = await tree({ "a.txt": "a\n", "b.txt": "b\n" });
  assert.equal((await compared(candidate, live)).summary.relation, "candidate-covered-subset");
  candidate = await tree({ "a.txt": "a\n", "b.txt": "b\n" }); live = await tree({ "a.txt": "a\n" });
  assert.equal((await compared(candidate, live)).summary.relation, "additive-no-conflicts");
  candidate = await tree({ "a.txt": "candidate\n" }); live = await tree({ "a.txt": "live\n" });
  assert.equal((await compared(candidate, live)).summary.relation, "divergent");
  candidate = await tree({ "a.txt": "same\n" }); live = await tree({ "a.txt": "same\n" }); await chmod(path.join(candidate, "a.txt"), 0o755);
  const mode = await compared(candidate, live); assert.equal(mode.summary.relation, "divergent"); assert.equal(mode.records[0].status, "changed-mode-type");
});

test("filters generated roots by the application form unless expressly included", async () => {
  const candidate = await tree({ "a.txt": "same\n", "node_modules/x.js": "candidate\n" }); const live = await tree({ "a.txt": "same\n", "node_modules/x.js": "live\n" });
  assert.equal((await compareTrees(candidate, live, { form: "application" })).summary.relation, "exact-tree");
  assert.equal((await compareTrees(candidate, live, { includeGenerated: true })).summary.relation, "divergent");
  await Promise.all([rm(candidate, { recursive: true, force: true }), rm(live, { recursive: true, force: true })]);
});

test("distinguishes a nonempty covered subset from an empty candidate", async () => {
  const candidate = await tree(); const live = await tree({ "a.txt": "a\n" });
  const empty = await compared(candidate, live); assert.equal(empty.summary.relation, "live-only-superset"); assert.equal(empty.summary.candidateFiles, 0); assert.equal(empty.summary.liveFiles, 1);
  const smaller = await tree({ "a.txt": "a\n" }); const larger = await tree({ "a.txt": "a\n", "b.txt": "b\n" });
  assert.equal((await compared(smaller, larger)).summary.relation, "candidate-covered-subset");
});

test("reports bounded package JSON and code-symbol evidence without retaining bodies", async () => {
  const candidate = await tree({ "package.json": JSON.stringify({ name: "new", version: "2", scripts: { test: "new" }, dependencies: { x: "2" }, devDependencies: { d: "2" }, peerDependencies: { p: "2" }, optionalDependencies: { o: "2" }, bin: "cli.js", exports: "./index.js" }), "mod.ts": "import x from 'x';\nexport function newThing() {}\n" });
  const live = await tree({ "package.json": JSON.stringify({ name: "old", version: "1", scripts: { lint: "old" }, dependencies: { x: "1", y: "1" }, devDependencies: { d: "1" }, peerDependencies: { p: "1" }, optionalDependencies: { old: "1" }, bin: "old.js", exports: "./old.js" }), "mod.ts": "import y from 'y';\nexport function oldThing() {}\n" });
  const result = await compared(candidate, live); const packageRecord = result.records.find((record) => record.path === "package.json"); const codeRecord = result.records.find((record) => record.path === "mod.ts");
  assert.deepEqual(packageRecord.evidence.json.additions, ["optionalDependencies.o", "scripts.test"]); assert.equal(packageRecord.evidence.package.name.candidate, "new"); assert.deepEqual(Object.keys(packageRecord.evidence.package.dependencies.removals), ["y"]); assert.deepEqual(Object.keys(packageRecord.evidence.package.devDependencies.changes), ["d"]); assert.deepEqual(Object.keys(packageRecord.evidence.package.peerDependencies.changes), ["p"]); assert.deepEqual(Object.keys(packageRecord.evidence.package.optionalDependencies.additions), ["o"]); assert.equal(packageRecord.evidence.package.bin.changes.$.candidate, "cli.js"); assert.equal(packageRecord.evidence.package.exports.changes.$.live, "./old.js");
  assert.deepEqual(codeRecord.evidence.symbols.imports.additions, ["x"]); assert.deepEqual(codeRecord.evidence.symbols.definitions.removals, ["oldThing"]);
  assert.equal(codeRecord.evidence.normalizedTextHashes.candidate.length, 64);
});

test("fails closed at record and changed-text bounds", async () => {
  let candidate = await tree({ "a.txt": "a", "b.txt": "b" }); let live = await tree({ "a.txt": "a", "b.txt": "b" });
  await assert.rejects(compareTrees(candidate, live, { maxRecords: 1 }), /exceeded maxRecords/); await Promise.all([rm(candidate, { recursive: true, force: true }), rm(live, { recursive: true, force: true })]);
  candidate = await tree({ "a.txt": "candidate body" }); live = await tree({ "a.txt": "live body" }); const result = await compared(candidate, live, { maxChangedTextBytes: 1 });
  assert.deepEqual(result.records[0].evidence, { hashes: result.records[0].evidence.hashes, bounded: false, reason: "maxChangedTextBytes" });
});

test("does not replace invalid UTF-8 while producing text evidence", async () => {
  const candidate = await tree({ "a.txt": Buffer.from([0xff]) }); const live = await tree({ "a.txt": Buffer.from([0xfe]) });
  const result = await compared(candidate, live); assert.equal(result.records[0].evidence.reason, "invalid-text"); assert.equal(result.records[0].evidence.bounded, false);
});

test("stream order and NDJSON-shaped records are deterministic code-unit order", async () => {
  const candidate = await tree({ "z.txt": "z", "A.txt": "a", "nested/a.txt": "a" }); const live = await tree({ "z.txt": "z", "A.txt": "a", "nested/a.txt": "a" });
  const one = []; const two = [];
  for await (const record of streamTreeComparison(candidate, live)) one.push(record);
  for await (const record of streamTreeComparison(candidate, live)) two.push(record);
  assert.deepEqual(one, two); assert.deepEqual(one.slice(0, -1).map((record) => record.path), ["A.txt", "nested", "nested/a.txt", "z.txt"]);
  assert.equal(one.at(-1).type, "summary"); await Promise.all([rm(candidate, { recursive: true, force: true }), rm(live, { recursive: true, force: true })]);
});

test("uses bounded ordered directory runs and honors NDJSON writer backpressure", async () => {
  const files = Object.fromEntries(Array.from({ length: 300 }, (_unused, index) => [`large/${String(299 - index).padStart(3, "0")}.txt`, `${index}\n`]));
  const candidate = await tree(files); const live = await tree(files); const stats = { maxChunkObserved: 0 };
  const first = await compareTrees(candidate, live, { chunkSize: 2, stats }); const second = await compareTrees(candidate, live, { chunkSize: 2 });
  assert.equal(stats.maxChunkObserved, 2); assert.deepEqual(first, second);
  const chunks = []; const writer = new Writable({ highWaterMark: 1, write(chunk, _encoding, done) { chunks.push(chunk.toString()); setImmediate(done); } });
  await writeTreeComparisonNdjson(candidate, live, writer, { chunkSize: 2 });
  assert.equal(chunks.length, first.records.length + 1); assert.equal(JSON.parse(chunks.at(-1)).type, "summary");
  await Promise.all([rm(candidate, { recursive: true, force: true }), rm(live, { recursive: true, force: true })]);
});
