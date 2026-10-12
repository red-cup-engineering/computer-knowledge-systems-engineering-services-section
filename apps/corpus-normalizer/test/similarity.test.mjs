import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { analyzeSimilarity } from "../src/similarity.mjs";

async function corpus(files) { const root = await mkdtemp("/var/tmp/corpus-normalizer-similarity-"); await Promise.all(Object.entries(files).map(([name, body]) => writeFile(path.join(root, name), body))); return root; }
const names = (results, type) => results.filter((item) => item.type === type).map((item) => item.paths ?? [item.path]);

test("reports exact byte, normalized text, and metadata-aware body families as evidence", async () => {
  const root = await corpus({ "one.md": "---\ndate: yesterday\n---\n# Alpha\n\nSame\n", "two.md": "---\ndate: tomorrow\n---\n# Alpha\n\nSame\n", "three.md": "---\ndate: yesterday\n---\n# Alpha\n\nSame\n" });
  const result = await analyzeSimilarity(["one.md", "two.md", "three.md"].map((file) => ({ path: file })), { root });
  assert.deepEqual(names(result, "exact-bytes"), [["one.md", "three.md"]]);
  assert.deepEqual(names(result, "exact-normalized-text"), [["one.md", "three.md", "two.md"]]);
  assert.deepEqual(names(result, "exact-normalized-body"), [["one.md", "three.md", "two.md"]]);
  assert.equal(result.every((item) => item.schema === "corpus-normalizer.similarity.v1" && item.policy), true);
});

test("derives metadata-only status from a frontmatter-only body, not a caller flag", async () => {
  const root = await corpus({ "a.md": "---\ntitle: Signal\n---\n", "b.md": "---\ntitle: Signal\n---\n" });
  const result = await analyzeSimilarity([{ path: "a.md" }, { path: "b.md", metadataOnly: false }], { root, threshold: 0.8 });
  assert.deepEqual(names(result, "exact-normalized-body"), []);
  assert.deepEqual(names(result, "near-text-family"), []);
});

test("confirms near candidates with Jaccard and rejects a same-stem false positive", async () => {
  const root = await corpus({ "alpha-notes.md": "alpha beta gamma delta epsilon zeta eta theta iota kappa\n", "alpha_notes.md": "alpha beta gamma delta epsilon zeta eta theta iota lambda\n", "alpha--notes.md": "volcano basalt magma caldera obsidian pumice ash lava tectonic plume\n" });
  const result = await analyzeSimilarity(["alpha-notes.md", "alpha_notes.md", "alpha--notes.md"].map((file) => ({ path: file })), { root, threshold: 0.8 });
  assert.deepEqual(names(result, "near-text-family"), [["alpha-notes.md", "alpha_notes.md"]]);
});

test("emits bounded overflow and stale-source evidence", async () => {
  const root = await corpus({ "same-a.md": "a", "same-b.md": "b", "large.md": "123456789" });
  const result = await analyzeSimilarity([{ path: "same-a.md" }, { path: "same-b.md", sha256: "0".repeat(64) }, { path: "large.md" }], { root, maxBucket: 2, maxBodyBytes: 4 });
  assert.ok(result.some((item) => item.type === "stale-source-hash" && item.path === "same-b.md"));
  assert.ok(result.some((item) => item.type === "body-byte-overflow" && item.path === "large.md"));
});

test("rejects invalid UTF-8 and source paths outside the explicit root", async () => {
  const root = await corpus({ "valid.md": "valid\n" }); await writeFile(path.join(root, "invalid.md"), Buffer.from([0xc3, 0x28]));
  const result = await analyzeSimilarity([{ path: "invalid.md" }, { path: "../outside.md" }], { root });
  assert.ok(result.some((item) => item.type === "non-text-source" && item.path === "invalid.md" && item.reason === "invalid-utf8"));
  assert.ok(result.some((item) => item.type === "source-path-rejected" && item.path === "../outside.md"));
});

test("bounds admitted records and emits one candidate-limit overflow", async () => {
  const root = await corpus({ "same-name.md": "one two three four five six seven eight nine ten", "same_name.md": "one two three four five six seven eight nine eleven", "same--name.md": "one two three four five six seven eight nine twelve", "later.md": "later" });
  const records = ["same-name.md", "same_name.md", "same--name.md"].map((file) => ({ path: file }));
  const candidates = await analyzeSimilarity(records, { root, maxBucket: 4, maxCandidates: 1 });
  assert.equal(candidates.filter((item) => item.type === "candidate-limit-overflow").length, 1);
  const bounded = await analyzeSimilarity([...records, { path: "later.md" }], { root, maxRecords: 3 });
  assert.equal(bounded.filter((item) => item.type === "record-limit-overflow").length, 1);
});

test("is deterministic through forced tiny sort chunks and removes its host scratch directory", async () => {
  const root = await corpus(Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`term-${index}.md`, `common words ${index}`])));
  const records = Array.from({ length: 9 }, (_, index) => ({ path: `term-${index}.md` })); const temp = path.join(root, "scratch");
  const first = await analyzeSimilarity(records, { root, tempDirectory: temp, sortChunkSize: 2, maxBucket: 3 });
  const second = await analyzeSimilarity([...records].reverse(), { root, tempDirectory: temp, sortChunkSize: 2, maxBucket: 3 });
  assert.deepEqual(first, second);
  assert.equal(existsSync(temp), false);
});
