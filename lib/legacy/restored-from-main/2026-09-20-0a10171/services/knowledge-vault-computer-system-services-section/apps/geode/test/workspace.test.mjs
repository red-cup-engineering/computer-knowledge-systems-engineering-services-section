import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createGeodeWorkspace, GeodeRevisionConflict, projectGeodeWorkspace, searchGeodeSnapshot } from "../src/workspace.mjs";

const root = fileURLToPath(new URL("fixtures/vault/", import.meta.url));

test("opens a deterministic Markdown workspace with typed relations and backlinks", async () => {
  const workspace = await createGeodeWorkspace({ root });
  await workspace.completeSnapshot();
  assert.deepEqual(workspace.snapshot.documents.map(({ path }) => path).sort(), ["alpha.md", "home.md", "notes/beta.md"]);
  assert.equal(workspace.snapshot.graph.nodes.length, 3);
  assert.equal(workspace.snapshot.graph.edges.length, 3);
  assert.equal(workspace.snapshot.graph.diagnostics.dangling, 0);
  assert.deepEqual(
    workspace.snapshot.graph.backlinks["home.md"].map(({ sourcePath }) => sourcePath),
    ["alpha.md"],
  );
});

test("search finds titles, aliases, and keywords through the shared catalogue", async () => {
  const workspace = await createGeodeWorkspace({ root });
  await workspace.completeSnapshot();
  assert.equal((await workspace.search("alpha"))[0].path, "alpha.md");
  assert.equal((await workspace.search("sec"))[0].path, "notes/beta.md");
  assert.equal((await workspace.search("start"))[0].path, "home.md");
});

test("generic workspaces expose the TESS keyword web beside the FeltOS workspace graph", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "geode-graph-"));
  try {
    const terms = join(temporary, "section/content/text/glossary/terms");
    await mkdir(terms, { recursive: true });
    await writeFile(join(terms, "model.md"), "---\nidentity: model\nname: Model\n---\n\nA model is a purpose-bounded representation used to answer specified questions. Its adequacy depends on that purpose.\n");
    await writeFile(join(terms, "operation.md"), "---\nidentity: operation\nname: Operation\n---\n\nAn operation is an admitted transformation with defined inputs and effects. Its contract distinguishes it from an accidental action.\n");
    await writeFile(join(terms, "model-operation.md"), "---\nidentity: model-operation\nname: Model Operation\nkeywords: [model, operation]\n---\n\nA model operation transforms a purpose-bounded representation through an admitted operational contract. The compound declares only those two constituents.\n");
    const workspace = await createGeodeWorkspace({ root: temporary });
    const concept = await workspace.concept("model");
    assert.equal(concept.known, true);
    assert.deepEqual(concept.definedBy, ["section/content/text/glossary/terms/model.md"]);
    assert.deepEqual(concept.keywordBacklinks, ["section/content/text/glossary/terms/model-operation.md"]);

    const result = await workspace.sparql({
      kind: "knowing.sparql.query",
      type: "select",
      select: ["document"],
      where: [{
        s: { kind: "knowing.sparql.variable", name: "document" },
        p: "declares-keyword",
        o: "model",
      }],
    });
    assert.deepEqual(result.bindings, [{ document: "section/content/text/glossary/terms/model-operation.md" }]);

    const feltos = await workspace.feltosSummary();
    assert.equal(feltos.providers.length, 1);
    assert.equal(feltos.resources, 3);
    const projected = await workspace.feltosRelations({ predicate: "declares-keyword" });
    assert.equal(projected.total, 0, "the keyword web remains distinct from the generic document graph");
    const documentType = await workspace.feltosRelations({ predicate: "urn:geode:type" });
    assert.equal(documentType.total, 3);
    assert.ok(documentType.relations.some(({ subject }) => subject === "section/content/text/glossary/terms/model-operation.md"));
    assert.match(documentType.relations[0].source.provider, /geode:workspace-provider/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("reads only admitted notes and renders raw HTML inert", async () => {
  const workspace = await createGeodeWorkspace({ root });
  await workspace.completeSnapshot();
  const reading = await workspace.read("home.md");
  assert.equal(reading.title, "Home");
  assert.equal(reading.body.includes("title: Home"), false);
  assert.match(reading.html, /&lt;script&gt;alert/);
  await assert.rejects(() => workspace.read("../secret.md"), /unknown document/u);
});

test("public projection does not reveal the absolute vault root", async () => {
  const workspace = await createGeodeWorkspace({ root });
  await workspace.completeSnapshot();
  const projection = projectGeodeWorkspace(workspace.snapshot);
  assert.equal("root" in projection, false);
  assert.equal(JSON.stringify(projection).includes(root), false);
});

test("replaces Markdown only at the revision that was opened", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "geode-write-"));
  await cp(root, temporary, { recursive: true });
  try {
    const workspace = await createGeodeWorkspace({ root: temporary });
    const opened = await workspace.read("home.md");
    const next = `${opened.markdown}\nSaved through Geode.\n`;
    const receipt = await workspace.replace({ path: opened.path, markdown: next, expectedRevision: opened.revision });
    assert.equal(receipt.type, "GeodeMarkdownWriteReceipt");
    assert.equal(receipt.previousRevision, opened.revision);
    assert.notEqual(receipt.revision, opened.revision);
    assert.equal(await readFile(join(temporary, "home.md"), "utf8"), next);

    await writeFile(join(temporary, "home.md"), `${next}\nExternal edit.\n`, "utf8");
    await assert.rejects(
      () => workspace.replace({ path: opened.path, markdown: "stale draft", expectedRevision: receipt.revision }),
      (error) => error instanceof GeodeRevisionConflict && error.currentRevision !== receipt.revision,
    );
    assert.match(await readFile(join(temporary, "home.md"), "utf8"), /External edit/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("Geode snapshot search retains headings and normalized catalogue order", () => {
  const documents = [
    { path: "notes.md", title: "Notes", aliases: [], keywords: [], headings: ["Café methods"] },
    { path: "cafe.md", title: "Café Methods", aliases: [], keywords: [], headings: [] },
  ];
  const snapshot = { type: "GeodeWorkspaceSnapshot", documents };
  assert.deepEqual(searchGeodeSnapshot(snapshot, "cafe methods").map(({ path }) => path), ["cafe.md", "notes.md"]);
  assert.deepEqual(searchGeodeSnapshot(snapshot, "", { limit: 1 }), [documents[0]]);
  assert.deepEqual(searchGeodeSnapshot(snapshot, "cafe", { limit: 0 }), []);
});
