import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createGeodeWorkspace } from "../src/workspace.mjs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const root = fileURLToPath(new URL("fixtures/vault/", import.meta.url));

// A census shaped like the real repository: one deep single-child run down to the first
// real branch, so navigation cost and proof-path retention can both be asserted.
const PATHS = Object.freeze([
  "README.md",
  "lib/emsenn/services/561-group/lib/legacy/old.md",
  "lib/emsenn/services/561-group/services/science/a.md",
  "lib/emsenn/services/561-group/services/science/deep/only/one/leaf.md",
  "lib/emsenn/services/561-group/services/public/b.md",
]);

async function workspaceFor(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "geode-browse-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of PATHS) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), "# Document\n"); }
  return createGeodeWorkspace({ root, ...options });
}

test("collapses a single-child run into one item without altering the proof path", async (t) => {
  const workspace = await workspaceFor(t);
  const listing = workspace.browse("");
  const directory = listing.items.find((item) => item.kind === "directory");
  // Four levels of no choice are one click, and the full path is preserved verbatim.
  assert.equal(directory.path, "lib/emsenn/services/561-group");
  assert.equal(directory.name, "lib/emsenn/services/561-group");
  assert.equal(directory.segments, 4);
  assert.equal(directory.count, 4);
  // The run stops exactly where a real choice begins.
  const branch = workspace.browse(directory.path);
  assert.deepEqual(branch.items.filter((i) => i.kind === "directory").map((i) => i.name).sort(), ["lib/legacy", "services"]);
});

test("a collapsed run stops at a directory that also holds a document", async (t) => {
  const workspace = await workspaceFor(t);
  const listing = workspace.browse("lib/emsenn/services/561-group/services");
  const science = listing.items.find((item) => item.name.startsWith("science"));
  // science/ holds a.md, so it must not swallow deep/only/one even though that run is single-child.
  assert.equal(science.path, "lib/emsenn/services/561-group/services/science");
  assert.equal(science.segments, 1);
  const inside = workspace.browse(science.path);
  assert.deepEqual(inside.items.map((i) => i.name), ["deep/only/one", "a.md"]);
});

test("compression can be turned off, and then costs one click per level", async (t) => {
  const workspace = await workspaceFor(t);
  const listing = workspace.browse("", { compress: false });
  const directory = listing.items.find((item) => item.kind === "directory");
  assert.equal(directory.path, "lib");
  assert.equal(directory.segments, 1);
});

test("a vault root makes the empty prefix start below it and refuses escape", async (t) => {
  const workspace = await workspaceFor(t, { region: "lib/emsenn" });
  const listing = workspace.browse("");
  assert.equal(listing.prefix, "lib/emsenn");
  assert.equal(listing.vaultRoot, "lib/emsenn");
  // README.md sits above the vault root and is therefore not listed.
  assert.equal(listing.items.some((item) => item.name === "README.md"), false);
  assert.equal(listing.items[0].path, "lib/emsenn/services/561-group");
  // Paths stay repository-relative, so reading and writing are unaffected by the display root.
  assert.equal(workspace.admit("lib/emsenn/services/561-group/services/science/a.md").path, "lib/emsenn/services/561-group/services/science/a.md");
  assert.throws(() => workspace.browse("README.md"), RangeError);
  assert.throws(() => workspace.browse("../escape"), RangeError);
});

test("without a vault root the repository root is still the browse root", async (t) => {
  const workspace = await workspaceFor(t);
  const listing = workspace.browse("");
  assert.equal(listing.prefix, "");
  assert.equal(listing.vaultRoot, "");
  assert.equal(listing.items.some((item) => item.name === "README.md"), true);
});
