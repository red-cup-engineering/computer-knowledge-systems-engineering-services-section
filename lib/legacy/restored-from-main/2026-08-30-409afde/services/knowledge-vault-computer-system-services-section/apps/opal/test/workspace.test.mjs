import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createOpalWorkspace, OpalRevisionConflict, projectOpalWorkspace } from "../src/workspace.mjs";

const root = fileURLToPath(new URL("fixtures/vault/", import.meta.url));

test("opens a deterministic Markdown workspace with typed relations and backlinks", async () => {
  const workspace = await createOpalWorkspace({ root });
  assert.deepEqual(workspace.snapshot.documents.map(({ path }) => path).sort(), ["alpha.md", "home.md", "notes/beta.md"]);
  assert.equal(workspace.snapshot.graph.nodes.length, 3);
  assert.equal(workspace.snapshot.graph.edges.length, 3);
  assert.equal(workspace.snapshot.graph.diagnostics.dangling, 0);
  assert.deepEqual(
    workspace.snapshot.graph.backlinks["home.md"].map(({ sourcePath }) => sourcePath),
    ["alpha.md"],
  );
});

test("search ranks exact and prefix title matches before incidental fields", async () => {
  const workspace = await createOpalWorkspace({ root });
  assert.equal(workspace.search("alpha")[0].path, "alpha.md");
  assert.equal(workspace.search("sec")[0].path, "notes/beta.md");
  assert.equal(workspace.search("start")[0].path, "home.md");
});

test("generic workspaces expose the same DREW concept and structured SPARQL reads used by network hosts", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "opal-graph-"));
  try {
    await writeFile(join(temporary, "order.md"), "---\ntitle: Order\ndefines: order\nrequires: relation\n---\n\n# Order\n");
    const workspace = await createOpalWorkspace({ root: temporary });
    const concept = await workspace.concept("order");
    assert.equal(concept.known, true);
    assert.deepEqual(concept.definedBy, ["order.md"]);

    const result = await workspace.sparql({
      kind: "knowing.sparql.query",
      type: "select",
      select: ["document"],
      where: [{
        s: { kind: "knowing.sparql.variable", name: "document" },
        p: "defines",
        o: "order",
      }],
    });
    assert.deepEqual(result.bindings, [{ document: "order.md" }]);

    const fae = await workspace.faeSummary();
    assert.equal(fae.providers.length, 1);
    assert.equal(fae.resources, 1);
    const projected = await workspace.faeRelations({ predicate: "requires" });
    assert.equal(projected.total, 0, "frontmatter declarations remain the concept ledger's relations");
    const documentType = await workspace.faeRelations({ predicate: "urn:opal:type" });
    assert.equal(documentType.total, 1);
    assert.equal(documentType.relations[0].subject, "order.md");
    assert.match(documentType.relations[0].source.provider, /opal:workspace-provider/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("reads only admitted notes and renders raw HTML inert", async () => {
  const workspace = await createOpalWorkspace({ root });
  const reading = await workspace.read("home.md");
  assert.equal(reading.title, "Home");
  assert.equal(reading.body.includes("title: Home"), false);
  assert.match(reading.html, /&lt;script&gt;alert/);
  await assert.rejects(() => workspace.read("../secret.md"), /unknown document/u);
});

test("public projection does not reveal the absolute vault root", async () => {
  const workspace = await createOpalWorkspace({ root });
  const projection = projectOpalWorkspace(workspace.snapshot);
  assert.equal("root" in projection, false);
  assert.equal(JSON.stringify(projection).includes(root), false);
});

test("replaces Markdown only at the revision that was opened", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "opal-write-"));
  await cp(root, temporary, { recursive: true });
  try {
    const workspace = await createOpalWorkspace({ root: temporary });
    const opened = await workspace.read("home.md");
    const next = `${opened.markdown}\nSaved through Opal.\n`;
    const receipt = await workspace.replace({ path: opened.path, markdown: next, expectedRevision: opened.revision });
    assert.equal(receipt.type, "OpalMarkdownWriteReceipt");
    assert.equal(receipt.previousRevision, opened.revision);
    assert.notEqual(receipt.revision, opened.revision);
    assert.equal(await readFile(join(temporary, "home.md"), "utf8"), next);

    await writeFile(join(temporary, "home.md"), `${next}\nExternal edit.\n`, "utf8");
    await assert.rejects(
      () => workspace.replace({ path: opened.path, markdown: "stale draft", expectedRevision: receipt.revision }),
      (error) => error instanceof OpalRevisionConflict && error.currentRevision !== receipt.revision,
    );
    assert.match(await readFile(join(temporary, "home.md"), "utf8"), /External edit/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
