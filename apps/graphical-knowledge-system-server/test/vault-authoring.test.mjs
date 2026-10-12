import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  adaptVictorReleaseMetadata,
  createGeodeAuthoring,
  validateGeodeAuthoringConfig,
} from "@red-cup-engineering/graphical-knowledge-system-server/authoring";

const fixture = fileURLToPath(new URL("./fixtures/vault/", import.meta.url));

test("authoring fixes an admitted root and normalized region before exposing reads", async () => {
  const authoring = await createGeodeAuthoring({ root: fixture, region: "notes" });
  assert.deepEqual(authoring.paths, ["notes/beta.md"]);
  assert.equal(authoring.snapshot.documents.length, 0, "opening authoring does not read bodies");
  assert.equal((await authoring.search("beta"))[0].path, "notes/beta.md");
  assert.equal(typeof authoring.faeSummary, "undefined");
  await assert.rejects(() => authoring.read("../home.md"), /unknown document/u);
  assert.throws(() => validateGeodeAuthoringConfig({ root: fixture, region: "../outside" }), /within root/u);
  assert.throws(() => validateGeodeAuthoringConfig({ root: "relative" }), /absolute path/u);
  assert.throws(() => validateGeodeAuthoringConfig({ root: fixture, arbitraryPath: "/elsewhere" }), /unknown field/u);
});

test("authoring reuses Geode revision-safe replacement and projects a TUFTE editor", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "geode-authoring-"));
  await cp(fixture, temporary, { recursive: true });
  try {
    const authoring = await createGeodeAuthoring({
      root: temporary,
      victorRelease: Object.freeze({ kind: "web-release-manifest", digest: "sha256:test" }),
    });
    const opened = await authoring.read("home.md");
    const projection = await authoring.editorDocument("home.md");
    assert.equal(projection.schemaVersion, "geode-editor-document/v1");
    assert.equal(projection.victorRelease.digest, "sha256:test");
    assert.equal(projection.tiles[1].form.revision, opened.revision);
    const html = await authoring.renderEditorDocument("home.md");
    assert.match(html, /data-tufte-revision=/u);
    assert.match(html, /&lt;script&gt;alert/u);
    assert.match(html, /geode:replace-document\/v1/u);

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
