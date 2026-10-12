import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mentionPattern, outlineOf, tagsOf, unlinkedMentionsOf } from "../src/document-structure.mjs";

const mentionsRoot = fileURLToPath(new URL("fixtures/structure/mentions/", import.meta.url));
const MENTION_PATHS = Object.freeze(["mixed.md", "only-linked.md", "unlinked.md"]);

/**
 * Stands in for the vault's ripgrep supplier:
 * apply the real regular expression the module builds, over the real fixture files, so the
 * pattern itself is under test rather than assumed.
 */
async function fixtureSearch({ query, regularExpression, limit }) {
  assert.equal(regularExpression, true, "mention discovery must search as a regular expression");
  const pattern = new RegExp(query, "gimu");
  const matches = [];
  for (const path of MENTION_PATHS) {
    const text = await readFile(join(mentionsRoot, path), "utf8");
    text.split("\n").forEach((line, offset) => {
      pattern.lastIndex = 0;
      if (pattern.test(line) && matches.length < limit) matches.push({ path, line: offset + 1, text: line });
    });
  }
  return Object.freeze({ matches: Object.freeze(matches), truncated: false });
}

async function fixtureReadDocument(path) {
  return readFile(join(mentionsRoot, path), "utf8");
}

// ---------------------------------------------------------------------------
// outlineOf
// ---------------------------------------------------------------------------

test("outlineOf reads ATX headings as a flat list with levels, text, line numbers, and anchors", () => {
  const outline = outlineOf([
    "# Title",
    "",
    "## Section One",
    "",
    "### Sub",
    "",
    "## Section Two",
  ].join("\n"));
  assert.deepEqual(outline.headings.map((h) => [h.level, h.text, h.line, h.anchor]), [
    [1, "Title", 1, "title"],
    [2, "Section One", 3, "section-one"],
    [3, "Sub", 5, "sub"],
    [2, "Section Two", 7, "section-two"],
  ]);
});

test("outlineOf nests headings into a tree by level", () => {
  const outline = outlineOf([
    "# Title",
    "## Section One",
    "### Sub",
    "## Section Two",
  ].join("\n"));
  assert.equal(outline.tree.length, 1);
  const [title] = outline.tree;
  assert.equal(title.text, "Title");
  assert.deepEqual(title.children.map((c) => c.text), ["Section One", "Section Two"]);
  assert.deepEqual(title.children[0].children.map((c) => c.text), ["Sub"]);
});

test("outlineOf does not read a heading-shaped line inside a fenced code block as a heading", () => {
  const outline = outlineOf([
    "# Real heading",
    "",
    "```",
    "# not a heading",
    "```",
    "",
    "## Also real",
  ].join("\n"));
  assert.deepEqual(outline.headings.map((h) => h.text), ["Real heading", "Also real"]);
});

test("outlineOf recognizes setext headings at level 1 (=) and level 2 (-)", () => {
  const outline = outlineOf([
    "Title One",
    "=========",
    "",
    "Subtitle",
    "--------",
  ].join("\n"));
  assert.deepEqual(outline.headings.map((h) => [h.level, h.text, h.line]), [
    [1, "Title One", 1],
    [2, "Subtitle", 4],
  ]);
});

test("outlineOf gives duplicate heading text distinct anchors", () => {
  const outline = outlineOf([
    "# Notes",
    "",
    "## Notes",
    "",
    "## Notes",
  ].join("\n"));
  assert.deepEqual(outline.headings.map((h) => h.anchor), ["notes", "notes-1", "notes-2"]);
});

test("outlineOf rejects a non-string argument rather than reading nothing silently", () => {
  assert.throws(() => outlineOf(null), TypeError);
});

// ---------------------------------------------------------------------------
// tagsOf
// ---------------------------------------------------------------------------

test("tagsOf reads frontmatter tags and inline #tags, folding identity case-insensitively", () => {
  const markdown = "Uses #alpha again, plus #Gamma.";
  const { tags } = tagsOf(markdown, { tags: ["Alpha", "beta"] });
  const byLower = Object.fromEntries(tags.map((t) => [t.name.toLowerCase(), t]));
  assert.deepEqual([...byLower.alpha.sources], ["frontmatter", "inline"]);
  assert.equal(byLower.alpha.name, "Alpha", "the first-seen spelling (frontmatter) is kept as the display name");
  assert.deepEqual([...byLower.beta.sources], ["frontmatter"]);
  assert.deepEqual([...byLower.gamma.sources], ["inline"]);
});

test("tagsOf also reads the singular frontmatter key `tag`", () => {
  const { tags } = tagsOf("no inline tags here", { tag: "solo" });
  assert.deepEqual(tags.map((t) => t.name), ["solo"]);
});

test("tagsOf records the line each inline tag was found on", () => {
  const markdown = ["first line", "second #here line"].join("\n");
  const { tags } = tagsOf(markdown, {});
  assert.deepEqual(tags, [{ name: "here", sources: ["inline"], lines: [2] }]);
});

test("tagsOf does not read a # as a tag inside a fenced code block, inline code, a URL fragment, or a heading", () => {
  const markdown = [
    "# Heading #notreal",
    "",
    "```",
    "#fence-not-a-tag",
    "```",
    "",
    "Inline code `#inline-not-a-tag` stays code.",
    "",
    "See http://example.com/page#url-fragment-not-a-tag for details.",
    "",
    "Prose #realtag here.",
  ].join("\n");
  const { tags } = tagsOf(markdown, {});
  const names = tags.map((t) => t.name);
  assert.deepEqual(names, ["realtag"]);
});

test("tagsOf rejects a non-string markdown argument", () => {
  assert.throws(() => tagsOf(42, {}), TypeError);
});

// ---------------------------------------------------------------------------
// mentionPattern
// ---------------------------------------------------------------------------

test("mentionPattern matches a name only as a whole word", () => {
  const pattern = new RegExp(mentionPattern("Cat"), "u");
  assert.equal(pattern.test("I saw a Cat today"), true);
  assert.equal(pattern.test("Category theory"), false);
  assert.equal(pattern.test("Cat"), true, "a bare match with nothing on either side still counts");
});

// ---------------------------------------------------------------------------
// unlinkedMentionsOf
// ---------------------------------------------------------------------------

test("unlinkedMentionsOf classifies a plain-text mention in a document with no existing link as unlinked", async () => {
  const found = await unlinkedMentionsOf({ name: "Nightjar", search: fixtureSearch, readDocument: fixtureReadDocument });
  const unlinkedDoc = found.documents.find((d) => d.path === "unlinked.md");
  assert.ok(unlinkedDoc, "unlinked.md should be reported as a candidate");
  assert.deepEqual(unlinkedDoc.mentions.map((m) => m.classification), ["unlinked"]);
  assert.match(unlinkedDoc.mentions[0].evidence, /Nightjar/u);
});

test("unlinkedMentionsOf classifies a mention inside a fenced code block and inline code as code, never as a link candidate", async () => {
  const found = await unlinkedMentionsOf({ name: "Nightjar", search: fixtureSearch, readDocument: fixtureReadDocument });
  const mixed = found.documents.find((d) => d.path === "mixed.md");
  const codeMentions = mixed.mentions.filter((m) => m.classification === "code");
  assert.equal(codeMentions.length, 2, "one in the fenced block, one in inline code");
  assert.ok(codeMentions.some((m) => m.evidence.includes("grep Nightjar logs.txt")));
  assert.ok(codeMentions.some((m) => m.evidence.includes("`Nightjar`")));
});

test("unlinkedMentionsOf classifies a mention on a heading line as heading", async () => {
  const found = await unlinkedMentionsOf({ name: "Nightjar", search: fixtureSearch, readDocument: fixtureReadDocument });
  const mixed = found.documents.find((d) => d.path === "mixed.md");
  const headingMention = mixed.mentions.find((m) => m.classification === "heading");
  assert.ok(headingMention);
  assert.match(headingMention.evidence, /^# Nightjar overview$/u);
});

test("unlinkedMentionsOf classifies a plain-text repeat as linked-elsewhere once the document links the name for real", async () => {
  const found = await unlinkedMentionsOf({ name: "Nightjar", search: fixtureSearch, readDocument: fixtureReadDocument });
  const mixed = found.documents.find((d) => d.path === "mixed.md");
  const proseMentions = mixed.mentions.filter((m) => m.classification === "linked-elsewhere");
  // mixed.md carries a real [[Nightjar]] wikilink elsewhere, so its two plain-text repeats are
  // reported as already covered rather than as fresh unlinked candidates.
  assert.equal(proseMentions.length, 2);
  // The wikilink occurrence itself is a proven link, exactly what `deriveBacklinks` already
  // reports — it never appears among these results at all, under any classification.
  assert.equal(mixed.mentions.length, 5, "heading + 2 code + 2 linked-elsewhere; the wikilink itself is excluded");
});

test("unlinkedMentionsOf reports no entry for a document where every mention is already a real link", async () => {
  const found = await unlinkedMentionsOf({ name: "Nightjar", search: fixtureSearch, readDocument: fixtureReadDocument });
  assert.equal(found.documents.some((d) => d.path === "only-linked.md"), false);
  // Confirm the search did find the document as a candidate — it is filtered after classification,
  // not because the search missed it.
  assert.ok(found.searchedDocuments >= 2);
});

test("unlinkedMentionsOf honors `limit` as a cap on distinct documents examined and reports truncation", async () => {
  const found = await unlinkedMentionsOf({ name: "Nightjar", search: fixtureSearch, readDocument: fixtureReadDocument, limit: 1 });
  assert.equal(found.searchedDocuments, 1);
  assert.equal(found.truncated, true);
});

test("unlinkedMentionsOf requires a name", async () => {
  await assert.rejects(() => unlinkedMentionsOf({ name: "", search: fixtureSearch, readDocument: fixtureReadDocument }), TypeError);
});

test("document projections share multiline code, Unicode tags and reference-link observations", async () => {
  const markdown = ['---', 'example: Nightjar', '---', 'Nightjar #heading', '=================', '', '``code', 'Nightjar #hidden', 'code``', '', 'Prose #Métier [Nightjar][bird] and Nightjar.'].join("\n");
  assert.deepEqual(outlineOf(markdown).headings.map(({ text, line }) => [text, line]), [['Nightjar #heading', 4]]);
  assert.deepEqual(tagsOf(markdown).tags.map(({ name, lines }) => [name, lines]), [['Métier', [11]]]);
  const result = await unlinkedMentionsOf({ name: 'Nightjar', search: async () => ({ matches: [{ path: 'note.md' }], truncated: false }), readDocument: async () => markdown });
  assert.deepEqual(result.documents[0].mentions.map(({ line, classification }) => [line, classification]), [[4, 'heading'], [8, 'code'], [11, 'linked-elsewhere']]);
});
