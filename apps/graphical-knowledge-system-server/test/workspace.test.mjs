import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createGeodeWorkspace, GeodeRevisionConflict, projectGeodeWorkspace } from "../src/workspace.mjs";
import { searchCairnSnapshot } from "@red-cup-engineering/knowledge-system-server/markdown-vault";

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
    assert.equal(receipt.type, "CairnRevisionReceipt");
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

test("snapshot search retains headings and normalized catalogue order", () => {
  const documents = [
    { path: "notes.md", title: "Notes", aliases: [], keywords: [], headings: ["Café methods"] },
    { path: "cafe.md", title: "Café Methods", aliases: [], keywords: [], headings: [] },
  ];
  const snapshot = { type: "CairnVaultSnapshot", documents };
  assert.deepEqual(searchCairnSnapshot(snapshot, "cafe methods").map(({ path }) => path), ["cafe.md", "notes.md"]);
  assert.deepEqual(searchCairnSnapshot(snapshot, "", { limit: 1 }), [documents[0]]);
  assert.deepEqual(searchCairnSnapshot(snapshot, "cafe", { limit: 0 }), []);
});
