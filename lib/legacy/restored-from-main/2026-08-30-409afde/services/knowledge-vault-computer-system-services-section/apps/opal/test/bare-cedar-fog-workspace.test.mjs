import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createBareCedarFogWorkspace } from "../src/bare-cedar-fog-workspace.mjs";

const root = fileURLToPath(new URL("fixtures/vault/", import.meta.url));

function services() {
  return {
    async observeBareCedarFogMarkdownVaults() {
      return Object.freeze({
        type: "BareCedarFogMarkdownVaultObservation",
        totals: Object.freeze({ documents: 3, generations: Object.freeze({ current: 3, legacy: 0, reference: 0 }), extensions: Object.freeze({ md: 3 }) }),
        diagnostics: Object.freeze({ allDocumentsAssigned: true, fallbackDocuments: 0 }),
        supplier: Object.freeze({ command: "rg", mode: "test" }),
        vaults: Object.freeze([Object.freeze({
          id: "notes",
          region: ".",
          description: "fixture notes",
          fallback: true,
          documents: 3,
          generations: Object.freeze({ current: 3, legacy: 0, reference: 0 }),
          extensions: Object.freeze({ md: 3 }),
          samples: Object.freeze(["home.md"]),
          paths: Object.freeze(["alpha.md", "home.md", "notes/beta.md"]),
        })]),
      });
    },
    async searchBareCedarFogMarkdownVaults(options) {
      assert.equal(options.limit, 2);
      assert.equal(options.query, "home");
      return Object.freeze({
        matches: Object.freeze([Object.freeze({
          path: "home.md",
          vaultId: "notes",
          generation: "current",
          line: 3,
          column: 1,
          text: "# Home",
          submatches: Object.freeze([Object.freeze({ start: 2, end: 6, text: "Home" })]),
        })]),
      });
    },
  };
}

test("adapts a BCF census while preserving the Opal workspace surface", async () => {
  const workspace = await createBareCedarFogWorkspace({ root, services: services(), searchLimit: 2 });
  assert.equal(workspace.snapshot.type, "OpalWorkspaceSnapshot");
  assert.equal(workspace.snapshot.profile, "bare-cedar-fog");
  assert.equal(workspace.snapshot.collections[0].id, "notes");
  assert.equal(workspace.snapshot.available, 3);
  assert.equal(workspace.snapshot.truncated, false);
  assert.deepEqual(workspace.snapshot.documents, []);
  assert.equal("root" in workspace.snapshot, false);
  assert.equal(workspace.admit("home.md").vaultId, "notes");
  assert.equal((await workspace.read("home.md")).title, "Home");
  assert.deepEqual(workspace.browse().items.map(({ kind, path }) => [kind, path]), [
    ["directory", "notes"],
    ["document", "alpha.md"],
    ["document", "home.md"],
  ]);
  assert.deepEqual(workspace.browse("notes").items.map(({ kind, path }) => [kind, path]), [
    ["document", "notes/beta.md"],
  ]);
  await assert.rejects(() => workspace.read("outside.md"), /unknown Bare Cedar Fog document/u);

  const results = await workspace.search("home");
  assert.deepEqual(results, [{
    path: "home.md",
    title: "Home",
    aliases: [],
    keywords: [],
    headings: [],
    properties: {},
    incoming: 0,
    outgoing: 0,
    vaultId: "notes",
    collection: "notes",
    generation: "current",
    line: 3,
    evidence: ["line 3: # Home"],
  }]);
});

test("never lets caller-provided search limits exceed its BCF bound", async () => {
  const workspace = await createBareCedarFogWorkspace({ root, services: services(), searchLimit: 2 });
  await assert.rejects(() => workspace.search("home", { limit: 3 }), /configured bound of 2/u);
});

test("reads and revision-safely replaces any classified carrier on demand", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "opal-bcf-"));
  await cp(root, temporary, { recursive: true });
  try {
    const workspace = await createBareCedarFogWorkspace({ root: temporary, services: services(), searchLimit: 2 });
    const opened = await workspace.read("home.md");
    const markdown = `${opened.markdown}\nRepository-mode edit.\n`;
    const receipt = await workspace.replace({ path: "home.md", markdown, expectedRevision: opened.revision });
    assert.equal(receipt.type, "OpalMarkdownWriteReceipt");
    assert.notEqual(receipt.revision, opened.revision);
    assert.equal(await readFile(join(temporary, "home.md"), "utf8"), markdown);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
