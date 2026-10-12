import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { openMarkdownVault, projectCairnSnapshot, searchCairnSnapshot } from "../src/markdown-vault.mjs";

test("ranked search reads full notes without requiring complete semantic observations", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cairn-search-before-semantics-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const alpha = "---\ntitle: Transport\n---\n\n# Transport\n\nHolonomy preserves this distinction.\n";
  await writeFile(join(root, "alpha.md"), alpha);
  await writeFile(join(root, "beta.md"), "# Retired\n\nLegacymarker.\n");
  await writeFile(join(root, "gamma.md"), "# Other\n\nAn unrelated purpose.\n");
  const vault = await openMarkdownVault({ root });
  assert.deepEqual((await vault.search("holonomy", { mode: "text" })).map(hit => hit.path), ["alpha.md"]);
  assert.equal(vault.snapshot.observationsComplete, false);
  const note = await vault.read("alpha.md");
  assert.equal(note.markdown, alpha);
  assert.equal(note.relationsDeferred, true);
  await vault.replace({ path: "alpha.md", expectedRevision: note.revision, markdown: "# Transport\n\nNewreading.\n" });
  assert.equal((await vault.search("holonomy", { mode: "text" })).length, 0);
  assert.equal((await vault.search("newreading", { mode: "text" }))[0].path, "alpha.md");
  await rm(join(root, "beta.md"));
  await writeFile(join(root, "gamma.md"), "# Other\n\nHolonomy also matters here.\n");
  await vault.refresh();
  assert.equal((await vault.search("legacymarker", { mode: "text" })).length, 0);
  assert.deepEqual((await vault.search("holonomy", { mode: "text" })).map(hit => hit.path), ["gamma.md"]);
  assert.equal((await vault.completeSnapshot()).observationsComplete, true);
});

test("CAIRN opens, searches, reads, and revision-safely changes a Markdown content vault", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cairn-markdown-vault-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "alpha.md"), "---\ntitle: Alpha\ntags: [research]\n---\n\n# Alpha\n\nLinks to [[beta]].\n");
  await writeFile(join(root, "beta.md"), "# Beta\n\nOriginal.\n");

  const vault = await openMarkdownVault({ root });
  await vault.completeSnapshot();
  assert.equal(vault.type, "CairnContentVault");
  assert.equal(vault.snapshot.documents.length, 2);
  assert.equal(projectCairnSnapshot(vault.snapshot).graph.nodes, 2);
  assert.equal((await vault.search("alpha"))[0].path, "alpha.md");

  const opened = await vault.read("beta.md");
  assert.equal(opened.type, "CairnDocumentReading");
  const receipt = await vault.replace({
    path: "beta.md",
    markdown: "# Beta\n\nRevised.\n",
    expectedRevision: opened.revision,
  });
  assert.equal(receipt.type, "CairnRevisionReceipt");
  assert.equal((await vault.read("beta.md")).body.trim(), "# Beta\n\nRevised.");
  await assert.rejects(
    () => vault.replace({ path: "beta.md", markdown: "stale", expectedRevision: opened.revision }),
    /revision/iu,
  );
});

test("CAIRN refuses paths its content-vault adapter did not admit", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cairn-confined-vault-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "inside.md"), "# Inside\n");
  const vault = await openMarkdownVault({ root });
  await vault.completeSnapshot();
  await assert.rejects(() => vault.read("../outside.md"), /unknown document/u);
});

test("CAIRN counts each document's outgoing edges in a multi-document graph", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cairn-edge-counts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "alpha.md"), "# Alpha\n\n[[beta]] and [[gamma]].\n");
  await writeFile(join(root, "beta.md"), "# Beta\n\n[[gamma]].\n");
  await writeFile(join(root, "gamma.md"), "# Gamma\n\nNo links.\n");

  const vault = await openMarkdownVault({ root });
  await vault.completeSnapshot();
  const counts = Object.fromEntries(
    vault.snapshot.documents.map(({ path, outgoing }) => [path, outgoing]),
  );

  assert.deepEqual(counts, {
    "alpha.md": 2,
    "beta.md": 1,
    "gamma.md": 0,
  });
  assert.equal(vault.snapshot.graph.edges.length, 3);
});

test("snapshot discovery uses normalized catalogue ranking while preserving bounded listing", () => {
  const documents = [
    { path: "notes.md", title: "Notes", aliases: ["coffee"], headings: ["Café methods"], keywords: ["field"] },
    { path: "cafe.md", title: "Café Methods", aliases: [], headings: [], keywords: [] },
  ];
  const snapshot = { type: "CairnVaultSnapshot", documents };
  assert.deepEqual(searchCairnSnapshot(snapshot, "cafe methods").map(({ path }) => path), ["cafe.md", "notes.md"]);
  const [coffeeFieldHit] = searchCairnSnapshot(snapshot, "coffee field");
  assert.deepEqual(coffeeFieldHit, Object.freeze({ ...documents[0], score: coffeeFieldHit.score }));
  assert.ok(coffeeFieldHit.score > 0);
  assert.deepEqual(searchCairnSnapshot(snapshot, "", { limit: 1 }), [documents[0]]);
  assert.deepEqual(searchCairnSnapshot(snapshot, "cafe", { limit: 0 }), []);
  // A document matching only one of several query tokens still appears (inclusive "any" match),
  // ranked behind a document that matches more of them.
  assert.deepEqual(
    searchCairnSnapshot(snapshot, "cafe coffee unrelated-elsewhere").map(({ path }) => path),
    ["notes.md", "cafe.md"],
  );
});

test("an admitted subset never claims complete corpus relations", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cairn-bounded-vault-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "alpha.md"), "# Alpha\n[[beta]]\n");
  await writeFile(join(root, "beta.md"), "# Beta\n[[alpha]]\n");
  const vault = await openMarkdownVault({ root, limit: 1 });
  const snapshot = await vault.completeSnapshot();
  assert.equal(snapshot.observationsComplete, true);
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.graph.complete, false);
  const relations = await vault.relations(vault.paths[0]);
  assert.equal(relations.complete, false);
  assert.equal(relations.truncated, true);
  assert.equal((await vault.search("", { limit: 1 })).length, 1);
});

test("failed inventory admission remains incomplete without claiming truncation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "cairn-admission-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "readable.md"), "# Readable\n");
  await writeFile(join(root, "unreadable.md"), "# Unreadable\n");
  const realLstat = fsPromises.lstat;
  const mocked = t.mock.method(fsPromises, "lstat", async (path, ...args) => {
    if (path === join(root, "unreadable.md")) throw Object.assign(new Error("candidate permission denied"), { code: "EACCES" });
    return realLstat(path, ...args);
  });
  syncBuiltinESMExports();
  t.after(() => { mocked.mock.restore(); syncBuiltinESMExports(); });
  const vault = await openMarkdownVault({ root });
  assert.deepEqual(vault.paths, ["readable.md"]);
  const snapshot = await vault.completeSnapshot();
  assert.equal(snapshot.truncated, false);
  assert.equal(snapshot.observationsComplete, true);
  assert.equal(snapshot.inventoryComplete, false);
  assert.equal(snapshot.complete, false);
  assert.equal(snapshot.graph.complete, false);
  assert.equal(snapshot.inventoryDiagnostics[0].code, "EACCES");
  const relations = await vault.relations("readable.md");
  assert.equal(relations.complete, false);
  assert.equal(relations.truncated, false);
  assert.deepEqual(relations.diagnostics[0], { path: "unreadable.md", code: "EACCES", message: "candidate permission denied", stage: "admission" });
  assert.equal((await vault.search("Readable")).length, 1);
});
