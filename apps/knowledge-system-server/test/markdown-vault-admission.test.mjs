import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { openFullTextIndex } from "@red-cup-engineering/markdown-engineering-services-section/vault/full-text-index";
import { openMarkdownVault } from "../src/markdown-vault.mjs";

const science = path => path.startsWith("science/");
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "cairn-reader-admission-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "corpus");
  await mkdir(root);
  const write = async (path, text) => {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  await write("science/accepted.md", "# Accepted\n\nsciencereceivingmarker\n");
  await write("sibling/denied.md", "# Denied\n\nsiblingreceivingmarker\n");
  return { directory, root, write };
}

// Observe the genuine provider's I/O; do not replace its inventory or index.
function forbidSiblingIo(t, root) {
  const seen = [];
  const blocked = resolve(root, "sibling");
  const pathname = value => value instanceof URL ? fileURLToPath(value) : typeof value === "string" ? value : "";
  const mocks = ["readFile", "stat", "lstat"].map(name => {
    const actual = fsPromises[name];
    return t.mock.method(fsPromises, name, async (path, ...args) => {
      const candidate = pathname(path);
      if (candidate === blocked || candidate.startsWith(blocked + sep)) {
        seen.push({ name, path: candidate });
        throw new Error("denied sibling eligibility or content I/O");
      }
      return actual(path, ...args);
    });
  });
  syncBuiltinESMExports();
  t.after(() => { for (const mock of mocks) mock.mock.restore(); syncBuiltinESMExports(); });
  return seen;
}

test("CAIRN passes reader admission before sibling eligibility and content reads", async t => {
  const { root } = await fixture(t);
  const forbidden = forbidSiblingIo(t, root);
  const vault = await openMarkdownVault({ root, admitPath: science });
  assert.deepEqual(vault.paths, ["science/accepted.md"]);
  assert.deepEqual((await vault.search("sciencereceivingmarker", { mode: "text" })).map(hit => hit.path), ["science/accepted.md"]);
  assert.deepEqual(await vault.search("siblingreceivingmarker", { mode: "text" }), []);
  assert.deepEqual(await vault.names("denied"), []);
  await assert.rejects(() => vault.read("sibling/denied.md"), error => error instanceof RangeError && error.reason === "not-found");
  const snapshot = await vault.completeSnapshot();
  assert.deepEqual(snapshot.documents.map(note => note.path), ["science/accepted.md"]);
  assert.deepEqual(snapshot.inventoryDiagnostics, []);
  assert.deepEqual(forbidden, []);
});

test("CAIRN default reader keeps ordinary unfiltered documents", async t => {
  const { root } = await fixture(t);
  const vault = await openMarkdownVault({ root });
  assert.deepEqual([...vault.paths].sort(), ["science/accepted.md", "sibling/denied.md"]);
  assert.deepEqual((await vault.search("siblingreceivingmarker", { mode: "text" })).map(hit => hit.path), ["sibling/denied.md"]);
});

test("refresh narrows prior observations and ignores newly arriving sibling documents", async t => {
  const { root, write } = await fixture(t);
  let narrowed = false;
  const vault = await openMarkdownVault({ root, admitPath: path => !narrowed || science(path) });
  await vault.completeSnapshot();
  assert.equal((await vault.search("siblingreceivingmarker", { mode: "text" })).length, 1);
  await write("sibling/new.md", "# New denied\n\nnewdeniedmarker\n");
  await write("science/new.md", "# New accepted\n\nnewacceptedmarker\n");
  narrowed = true;
  const forbidden = forbidSiblingIo(t, root);
  await vault.refresh();
  assert.deepEqual([...vault.paths].sort(), ["science/accepted.md", "science/new.md"]);
  assert.deepEqual(await vault.search("siblingreceivingmarker", { mode: "text" }), []);
  assert.deepEqual(await vault.search("newdeniedmarker", { mode: "text" }), []);
  assert.deepEqual((await vault.search("newacceptedmarker", { mode: "text" })).map(hit => hit.path), ["science/new.md"]);
  assert.deepEqual(await vault.names("denied"), []);
  assert.deepEqual((await vault.completeSnapshot()).documents.map(note => note.path).sort(), ["science/accepted.md", "science/new.md"]);
  assert.deepEqual(forbidden, []);
});

test("a reopened persisted index cannot restore documents outside the narrower reader", async t => {
  const { directory, root } = await fixture(t);
  const fullText = join(directory, "index.sqlite");
  const observations = join(directory, "observations.jsonl");
  const broad = await openMarkdownVault({ root, fullText, observations });
  await broad.completeSnapshot();
  assert.equal((await broad.search("siblingreceivingmarker", { mode: "text" })).length, 1);
  const prior = openFullTextIndex({ file: fullText });
  assert.ok(prior.paths().includes("sibling/denied.md"));
  prior.close();
  const forbidden = forbidSiblingIo(t, root);
  const narrow = await openMarkdownVault({ root, fullText, observations, admitPath: science });
  assert.deepEqual(narrow.paths, ["science/accepted.md"]);
  assert.deepEqual(await narrow.search("siblingreceivingmarker", { mode: "text" }), []);
  assert.deepEqual(await narrow.names("denied"), []);
  assert.deepEqual((await narrow.search("sciencereceivingmarker", { mode: "text" })).map(hit => hit.path), ["science/accepted.md"]);
  const received = openFullTextIndex({ file: fullText });
  assert.deepEqual(received.paths(), ["science/accepted.md"]);
  received.close();
  assert.deepEqual(forbidden, []);
});

test("create and move cannot widen the reader's admitted scope", async t => {
  const { root } = await fixture(t);
  const vault = await openMarkdownVault({ root, admitPath: science });
  const original = await readFile(join(root, "science/accepted.md"), "utf8");
  assert.throws(() => vault.create({ path: "sibling/new.md", markdown: "# Unauthorized\n" }), /admitted knowledge scope/);
  assert.throws(() => vault.move({ moves: { "science/accepted.md": "sibling/moved.md" } }), /admitted knowledge scope/);
  await assert.rejects(() => readFile(join(root, "sibling/new.md")), { code: "ENOENT" });
  await assert.rejects(() => readFile(join(root, "sibling/moved.md")), { code: "ENOENT" });
  assert.equal(await readFile(join(root, "science/accepted.md"), "utf8"), original);
  await vault.create({ path: "science/new.md", markdown: "# Allowed\n\nallowedcreationmarker\n" });
  assert.deepEqual((await vault.search("allowedcreationmarker", { mode: "text" })).map(hit => hit.path), ["science/new.md"]);
});

test("invalid reader predicates and non-boolean new-document decisions fail closed", async t => {
  const { root } = await fixture(t);
  await assert.rejects(() => openMarkdownVault({ root, admitPath: null }), /admitPath must be a function/);
  let decision = true;
  const vault = await openMarkdownVault({ root, admitPath: () => decision });
  for (const decide of [() => undefined, () => "yes", () => 1, () => Promise.resolve(true), () => Promise.reject(new Error("async policy rejected"))]) {
    decision = decide();
    assert.throws(() => vault.create({ path: "science/invalid.md", markdown: "# Invalid\n" }), /admitPath must return a boolean/);
    await assert.rejects(() => readFile(join(root, "science/invalid.md")), { code: "ENOENT" });
  }
});

