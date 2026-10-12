import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { treeManifest, verifyTreeManifest, writeTreeManifest } from "../src/tree-manifest.mjs";

async function makeTree(order) {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-tree-");
  await mkdir(path.join(root, "nested", "deeper"), { recursive: true });
  for (const index of order) {
    const parent = index % 3 === 0 ? path.join(root, "nested") : index % 5 === 0 ? path.join(root, "nested", "deeper") : root;
    await writeFile(path.join(parent, `entry-${String(index).padStart(3, "0")}.txt`), `entry ${index}\n`);
  }
  return root;
}

test("tree manifests are deterministic across >257 shuffled nested entries with bounded chunks", async () => {
  const names = Array.from({ length: 258 }, (_item, index) => index);
  const firstRoot = await makeTree(names);
  const secondRoot = await makeTree([...names].reverse());
  const first = path.join(await mkdtemp("/var/tmp/corpus-normalizer-manifest-"), "tree.ndjson");
  const second = path.join(await mkdtemp("/var/tmp/corpus-normalizer-manifest-"), "tree.ndjson");
  const firstResult = await writeTreeManifest(firstRoot, first, { chunkSize: 2 });
  const secondResult = await writeTreeManifest(secondRoot, second, { chunkSize: 2 });
  assert.equal(firstResult.maxChunkObserved, 2);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(await readFile(first, "utf8"), await readFile(second, "utf8"));
  assert.deepEqual(await verifyTreeManifest(firstRoot, first, { chunkSize: 2 }), { valid: true, hash: firstResult.hash, count: firstResult.count });
});

test("tree manifest rejects links and cleans its partial output", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-tree-link-");
  const output = path.join(await mkdtemp("/var/tmp/corpus-normalizer-manifest-"), "manifest.ndjson");
  await writeFile(path.join(root, "real.txt"), "real\n");
  await symlink(path.join(root, "real.txt"), path.join(root, "pointer.txt"));
  await assert.rejects(writeTreeManifest(root, output, { chunkSize: 2 }), /unsupported tree node/);
  assert.equal(existsSync(output), false);
  await assert.rejects(async () => { for await (const _entry of treeManifest(root, { chunkSize: 2 })) {} }, /unsupported tree node/);
});

test("tree manifest verification notices changed, added, and removed nodes", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-tree-verify-");
  const output = path.join(await mkdtemp("/var/tmp/corpus-normalizer-manifest-"), "tree.ndjson");
  const source = path.join(root, "term.md");
  await writeFile(source, "# Term\n");
  await writeTreeManifest(root, output, { chunkSize: 2 });
  assert.equal((await verifyTreeManifest(root, output, { chunkSize: 2 })).valid, true);
  await writeFile(source, "# Changed\n");
  assert.equal((await verifyTreeManifest(root, output, { chunkSize: 2 })).valid, false);
  await writeFile(source, "# Term\n"); await writeFile(path.join(root, "added.md"), "# Added\n");
  assert.equal((await verifyTreeManifest(root, output, { chunkSize: 2 })).valid, false);
  await unlink(path.join(root, "added.md")); await unlink(source);
  assert.equal((await verifyTreeManifest(root, output, { chunkSize: 2 })).valid, false);
  await rm(root, { recursive: true, force: true });
});
