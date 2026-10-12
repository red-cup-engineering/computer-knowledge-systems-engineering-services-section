import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  adaptVictorReleaseMetadata,
  createVaultMazeAuthoring,
  validateVaultMazeAuthoringConfig,
} from "../src/authoring.mjs";
import {
  createVaultMazeVictorRelease,
  createVaultMazeVictorReleaseFromResources,
} from "../src/victor-release.mjs";

const fixture = fileURLToPath(new URL("../../opal/test/fixtures/vault/", import.meta.url));

test("authoring fixes an admitted root and normalized region before exposing reads", async () => {
  const authoring = await createVaultMazeAuthoring({ root: fixture, region: "notes" });
  assert.deepEqual(authoring.snapshot.documents.map(({ path }) => path), ["notes/beta.md"]);
  assert.equal(authoring.search("beta")[0].path, "notes/beta.md");
  await assert.rejects(() => authoring.read("../home.md"), /unknown document/u);
  assert.throws(() => validateVaultMazeAuthoringConfig({ root: fixture, region: "../outside" }), /within root/u);
  assert.throws(() => validateVaultMazeAuthoringConfig({ root: "relative" }), /absolute path/u);
  assert.throws(() => validateVaultMazeAuthoringConfig({ root: fixture, arbitraryPath: "/elsewhere" }), /unknown field/u);
});

test("authoring reuses Opal revision-safe replacement and projects a TUFTE editor", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "vaultmaze-authoring-"));
  await cp(fixture, temporary, { recursive: true });
  try {
    const authoring = await createVaultMazeAuthoring({
      root: temporary,
      victorRelease: Object.freeze({ kind: "web-release-manifest", digest: "sha256:test" }),
    });
    const opened = await authoring.read("home.md");
    const projection = await authoring.editorDocument("home.md");
    assert.equal(projection.schemaVersion, "vaultmaze-editor-document/v1");
    assert.equal(projection.victorRelease.digest, "sha256:test");
    assert.equal(projection.tiles[1].form.revision, opened.revision);
    const html = await authoring.renderEditorDocument("home.md");
    assert.match(html, /data-tufte-revision=/u);
    assert.match(html, /&lt;script&gt;alert/u);
    assert.match(html, /vaultmaze:replace-document\/v1/u);

    const next = `${opened.markdown}\nAuthoring receipt.\n`;
    const receipt = await authoring.replace({ path: opened.path, markdown: next, expectedRevision: opened.revision });
    assert.notEqual(receipt.revision, opened.revision);
    assert.equal(await readFile(join(temporary, "home.md"), "utf8"), next);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("Victor metadata is copied immutably at an adapter boundary", () => {
  const offered = Object.freeze({ catalogHash: "abc", nested: Object.freeze({ cells: 2 }) });
  const adapted = adaptVictorReleaseMetadata(offered);
  assert.notEqual(adapted, offered);
  assert.equal(Object.isFrozen(adapted), true);
  assert.equal(Object.isFrozen(adapted.nested), true);
  assert.throws(() => adaptVictorReleaseMetadata({ build: () => {} }), /must be an object/u);
});

test("an admitted Opal snapshot and readings yield immutable Victor release metadata", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "vaultmaze-victor-release-"));
  try {
    await writeFile(join(temporary, "note.md"), "---\ntitle: Note\ndate-created: 2026-08-29\ntype: note\n---\n\nA released note.\n");
    const authoring = await createVaultMazeAuthoring({ root: temporary });
    const readings = await Promise.all(authoring.snapshot.documents.map(({ path }) => authoring.read(path)));
    const release = await createVaultMazeVictorRelease({ snapshot: authoring.snapshot, readings });

    assert.equal(release.schemaVersion, "vaultmaze-victor-release/v1");
    assert.equal(release.source.type, "opal-admitted-readings");
    assert.equal(Object.isFrozen(release), true);
    assert.match(release.catalog.hash, /^ni:\/\/\/sha-256;/u);
    assert.equal(release.catalog.cells.length, 1);
    assert.ok(release.catalog.cells.every(({ address }) => address.startsWith("ni:///sha-256;")));
    assert.equal(release.workspaceGraph.cellResources.length, 1);
    await assert.rejects(() => createVaultMazeVictorRelease({ snapshot: authoring.snapshot, readings: [{ ...readings[0], path: "outside.md" }] }), /not admitted/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("explicit Victor resources and cells retain the shared graph's content addresses", () => {
  const release = createVaultMazeVictorReleaseFromResources({
    hash: "ni:///sha-256;catalog",
    cells: [{ name: "note", address: "ni:///sha-256;cell", type: "note" }],
    resources: [{ path: "note.md", content: "# Note\n" }],
  });
  assert.equal(release.source.type, "victor-resources-and-cells");
  assert.equal(release.workspaceGraph.cellResources[0].cellAddress, "ni:///sha-256;cell");
  assert.match(release.workspaceGraph.cellResources[0].sourceNi, /^ni:\/\/\/sha-256;/u);
  assert.equal(Object.isFrozen(release.workspaceGraph.graph.resources), true);
});

test("explicit Victor releases shard large graph projections without retaining graph ASTs", () => {
  const release = createVaultMazeVictorReleaseFromResources({
    hash: "ni:///sha-256;catalog",
    cells: [
      { name: "one", address: "ni:///sha-256;one", source: { id: "one.md" } },
      { name: "two", address: "ni:///sha-256;two", source: { id: "two.md" } },
    ],
    resources: [{ path: "one.md", content: "# One\n" }, { path: "two.md", content: "# Two\n" }],
    workspaceGraphShardSize: 1,
  });
  assert.equal(release.workspaceGraph.type, "VictorWorkspaceGraphShardedProjection");
  assert.equal(release.workspaceGraph.graph, null);
  assert.equal(release.workspaceGraph.shards.length, 2);
  assert.ok(release.workspaceGraph.shards.every(({ graphId }) => /^ni:\/\/\/sha-256;/u.test(graphId)));
  assert.deepEqual(release.workspaceGraph.cellResources.map(({ cellName }) => cellName), ["one", "two"]);
});
