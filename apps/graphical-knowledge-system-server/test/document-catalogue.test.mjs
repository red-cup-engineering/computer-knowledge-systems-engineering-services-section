import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createGeodeWorkspace } from "../src/workspace.mjs";

test("inventory, source reading, complete relations, edits and external changes share one catalogue", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "geode-catalogue-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "source.md"), "# Source\n\n[[Declared Alias]] and [[missing]].\n");
  await writeFile(join(root, "target.md"), "---\naliases: [Declared Alias]\n---\n# Target\n\nA unique prose phrase.\n");
  const workspace = await createGeodeWorkspace({ root });
  assert.equal(workspace.snapshot.documents.length, 0, "opening reads inventory only");
  assert.equal(workspace.snapshot.graph.nodes.length, 2);
  assert.equal(workspace.snapshot.graph.edges, null);
  const first = await workspace.read("source.md");
  assert.equal(first.relationsDeferred, true);
  assert.equal(first.outgoing, null, "unknown relations are not reported as empty");
  assert.equal(workspace.snapshot.documents.length, 1);
  const links = await workspace.relations("source.md");
  assert.equal(links.outgoing.find((edge) => edge.target === "Declared Alias").targetPath, "target.md");
  assert.equal(links.outgoing.find((edge) => edge.target === "missing").status, "dangling");
  assert.equal((await workspace.relations("target.md")).backlinks[0].sourcePath, "source.md");
  assert.equal(await workspace.resolveLink("source.md", "Declared Alias"), "target.md");
  const target = await workspace.read("target.md");
  const before = new Map(workspace.snapshot.documents.map((document) => [document.path, document.revision]));
  await workspace.replace({ path: "target.md", markdown: "---\naliases: [Replacement]\n---\n# New title\n", expectedRevision: target.revision });
  assert.equal(workspace.snapshot.documents.find(({ path }) => path === "source.md").revision, before.get("source.md"));
  assert.equal((await workspace.relations("source.md")).outgoing.find((edge) => edge.target === "Declared Alias").status, "dangling");
  assert.equal((await workspace.search("New title"))[0].path, "target.md");
  await writeFile(join(root, "target.md"), "---\naliases: [Declared Alias]\n---\n# External title\n");
  assert.equal((await workspace.relations("source.md")).outgoing.find((edge) => edge.target === "Declared Alias").targetPath, "target.md", "complete queries detect external revisions");
  await workspace.refresh();
  assert.equal((await workspace.search("External title"))[0].path, "target.md");
});

test("prose search reads bodies and returns the observed metadata of the documents holding every word", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "geode-prose-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "one.md"), "---\ntitle: Declared title\naliases: [One]\n---\n# Heading\nNeedle phrase.\n");
  await writeFile(join(root, "two.md"), "# Unrelated\n");
  const workspace = await createGeodeWorkspace({ root });
  const results = await workspace.search("Needle phrase", { mode: "text", limit: 1 });
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Declared title");
  assert.deepEqual(results[0].aliases, ["One"]);
  assert.match(results[0].evidence[0], /Needle phrase/u);
});

test("malformed metadata is visible as a diagnostic and does not remove readable source", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "geode-malformed-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const markdown = "---\na: [unfinished\n---\n# Survives\n";
  await writeFile(join(root, "broken.md"), markdown);
  const workspace = await createGeodeWorkspace({ root });
  const reading = await workspace.read("broken.md");
  assert.equal(reading.markdown, markdown);
  assert.equal(reading.diagnostics.length, 1);
  assert.equal((await workspace.completeSnapshot()).documents.length, 1);
  const relations = await workspace.relations("broken.md");
  assert.equal(relations.complete, false);
  assert.equal(relations.diagnostics[0].path, "broken.md");
});
