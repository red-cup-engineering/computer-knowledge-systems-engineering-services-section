import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBareCedarFogWorkspace } from "../src/bare-cedar-fog-workspace.mjs";
import { buildPathAliasIndex } from "../src/repository-graph.mjs";

const root = fileURLToPath(new URL("fixtures/graph-vault/", import.meta.url));

const PATHS = Object.freeze([
  "a/shared.md",
  "b/shared.md",
  "index.md",
  "mentions.md",
  "notes/target-appendix.md",
  "notes/target.md",
]);

const INDEX = "index.md";
const TARGET = "notes/target.md";

/**
 * Stands in for the vault's ripgrep supplier: applies the same regular expression the workspace
 * builds, over the same fixture carriers, so the pattern itself is under test rather than assumed.
 */
async function fixtureSearch({ query, regularExpression, limit }) {
  assert.equal(regularExpression, true, "backlink discovery must search as a regular expression");
  const pattern = new RegExp(query, "gimu");
  const matches = [];
  for (const path of PATHS) {
    const text = await readFile(join(root, path), "utf8");
    text.split("\n").forEach((line, offset) => {
      pattern.lastIndex = 0;
      if (pattern.test(line) && matches.length < limit) {
        matches.push({ path, line: offset + 1, text, vaultId: "repo", generation: "current" });
      }
    });
  }
  return Object.freeze({ matches: Object.freeze(matches), truncated: false });
}

function services() {
  return {
    async observeBareCedarFogMarkdownVaults() {
      const totals = { documents: PATHS.length, generations: { current: PATHS.length, legacy: 0, reference: 0 }, extensions: { md: PATHS.length } };
      return Object.freeze({
        totals,
        diagnostics: Object.freeze({ allDocumentsAssigned: true, fallbackDocuments: 0 }),
        supplier: Object.freeze({ command: "rg", mode: "test" }),
        vaults: Object.freeze([Object.freeze({
          id: "repo", region: ".", description: "fixture", fallback: true, ...totals,
          samples: Object.freeze([]), paths: PATHS,
        })]),
      });
    },
    searchBareCedarFogMarkdownVaults: fixtureSearch,
  };
}

const workspace = () => createBareCedarFogWorkspace({ root, services: services() });

test("the alias index answers by path, by extensionless path, and by bare name", () => {
  const index = buildPathAliasIndex(PATHS);
  assert.equal(index.get("notes/target.md"), TARGET);
  assert.equal(index.get("notes/target"), TARGET);
  assert.equal(index.get("target"), TARGET);
  // One bare name carried by two documents must stay both, so the graph service can call it ambiguous.
  assert.deepEqual([...index.get("shared")].sort(), ["a/shared.md", "b/shared.md"]);
});

test("a document read at repository scale carries its real outgoing edges", async () => {
  const note = await (await workspace()).read(INDEX);
  const byKind = Object.fromEntries(note.outgoing.map((edge) => [`${edge.kind}:${edge.target}`, edge]));
  assert.equal(byKind["wikilink:target"].status, "resolved");
  assert.equal(byKind["wikilink:target"].targetPath, TARGET);
  assert.equal(byKind["markdown-link:notes/target.md"].targetPath, TARGET);
  assert.equal(byKind["frontmatter-reference:notes/target.md"].targetPath, TARGET);
});

test("edges keep the distinction between resolved, ambiguous, and dangling", async () => {
  const note = await (await workspace()).read(INDEX);
  const status = (target) => note.outgoing.find((edge) => edge.target === target).status;
  assert.equal(status("target"), "resolved");
  assert.equal(status("shared"), "ambiguous");
  assert.equal(status("missing.md"), "dangling");
  const ambiguous = note.outgoing.find((edge) => edge.target === "shared");
  assert.deepEqual([...ambiguous.candidates], ["a/shared.md", "b/shared.md"]);
});

test("opening a document does not pay for its backlinks", async () => {
  const note = await (await workspace()).read(TARGET);
  assert.equal(note.backlinksDeferred, true);
  assert.deepEqual(note.backlinks, []);
});

test("backlinks are proven by re-deriving each candidate source's edges", async () => {
  const found = await (await workspace()).backlinks(TARGET);
  assert.deepEqual(
    found.backlinks.map((backlink) => `${backlink.sourcePath}:${backlink.kind}`).sort(),
    ["index.md:frontmatter-reference", "index.md:markdown-link", "index.md:wikilink"],
  );
  assert.match(found.backlinks.find((backlink) => backlink.kind === "markdown-link").evidence, /\[look\]\(notes\/target\.md\)/u);
});

test("a link naming a longer document is not examined at all", async () => {
  const found = await (await workspace()).backlinks(TARGET);
  // mentions.md links to notes/target-appendix.md. Requiring a whole final path segment keeps
  // that source out of the candidate set entirely rather than reading it and discarding it.
  assert.equal(found.backlinks.concat(found.unresolved).some((entry) => entry.sourcePath === "mentions.md"), false);
});

test("an ambiguous mention is reported as one, not attributed to either candidate", async () => {
  // index.md writes [[shared]] and two documents carry that name. Neither may claim the link,
  // but both should be able to show that something out there names them.
  const found = await (await workspace()).backlinks("a/shared.md");
  assert.deepEqual(found.backlinks, []);
  const mention = found.unresolved.find((entry) => entry.sourcePath === "index.md");
  assert.equal(mention.status, "ambiguous");
  assert.deepEqual([...mention.candidates], ["a/shared.md", "b/shared.md"]);
});

test("a document nothing links to reports no backlinks rather than failing", async () => {
  const found = await (await workspace()).backlinks("mentions.md");
  assert.deepEqual(found.backlinks, []);
  assert.deepEqual(found.unresolved, []);
});

test("the snapshot declines to report a whole-vault edge total it never computed", async () => {
  const { graph } = (await workspace()).snapshot;
  assert.equal(graph.edges, null);
  assert.equal(graph.diagnostics.dangling, null);
  assert.equal(graph.derivation, "per-document");
  assert.equal(graph.nodes.length, PATHS.length);
});

test("backlinks refuse a path the census never admitted", async () => {
  const opened = await workspace();
  await assert.rejects(() => opened.backlinks("nowhere.md"), RangeError);
});
