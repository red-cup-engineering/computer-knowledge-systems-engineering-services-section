import assert from "node:assert/strict";
import { test } from "node:test";
import { admitBibliographyMarkdown, recognizeBibliographyMarkdown, renderBibliographyMarkdown } from "../src/bibliography-carrier.mjs";

const VALID_RECORD = Object.freeze({
  type: "bibliography",
  key: "arnold1995",
  "reference-type": "article",
  authors: Object.freeze(["Arnold, V. I."]),
  year: 1995,
  title: "Remarks on eigenvalues and eigenvectors of Hermitian matrices",
  eprint: "9502210",
  eprinttype: "arxiv",
  body: "# Arnold 1995\n\nWhy this is central.\n",
});

test("renderBibliographyMarkdown produces admissible Markdown", () => {
  const markdown = renderBibliographyMarkdown(VALID_RECORD);
  assert.match(markdown, /^---\n/);
  assert.match(markdown, /type: bibliography/);
  assert.match(markdown, /key: arnold1995/);
  const recognized = recognizeBibliographyMarkdown({ text: markdown, filename: "arnold1995.md" });
  assert.equal(recognized.admitted, true, JSON.stringify(recognized.findings));
});

test("recognizeBibliographyMarkdown refuses a scraped source document without crashing", () => {
  const text = [
    "---",
    'title: "Reference on Fixed-Point Topology"',
    "date-created: 2026-06-18",
    "type: bibliography",
    "---",
    "",
    "Some prose with no citation metadata.",
    "",
  ].join("\n");
  const recognized = recognizeBibliographyMarkdown({ text, filename: "fixed-point-topology.md" });
  assert.equal(recognized.admitted, false);
  const rules = recognized.findings.map((finding) => finding.rule);
  assert.ok(rules.includes("key"), rules.join(","));
  assert.ok(rules.includes("reference-type"), rules.join(","));
  assert.ok(rules.includes("authors"), rules.join(","));
  assert.ok(rules.includes("year"), rules.join(","));
});

test("recognizeBibliographyMarkdown refuses a citekey/filename mismatch", () => {
  const markdown = renderBibliographyMarkdown(VALID_RECORD);
  const recognized = recognizeBibliographyMarkdown({ text: markdown, filename: "someoneelse2020.md" });
  assert.equal(recognized.admitted, false);
  assert.ok(recognized.findings.some((finding) => finding.rule === "key-identity"));
});

test("recognizeBibliographyMarkdown refuses a malformed citekey", () => {
  // renderBibliographyMarkdown itself refuses an invalid key before ever
  // producing text, so the malformed carrier here is written by hand.
  const text = [
    "---",
    "type: bibliography",
    "key: NotACitekey",
    "reference-type: article",
    "authors: [Someone]",
    "year: 2020",
    "title: A title",
    "---",
    "",
    "# NotACitekey",
    "",
  ].join("\n");
  const recognized = recognizeBibliographyMarkdown({ text, filename: "NotACitekey.md" });
  assert.equal(recognized.admitted, false);
  assert.ok(recognized.findings.some((finding) => finding.rule === "key-pattern"));
});

test("recognizeBibliographyMarkdown refuses non-article carriers missing reference-type only (article-kind is not reference-type)", () => {
  const text = [
    "---",
    "type: bibliography",
    "article-kind: reference",
    "key: church1940",
    "authors: [Alonzo Church]",
    "year: 1940",
    "---",
    "",
    "# Church 1940",
    "",
  ].join("\n");
  const recognized = recognizeBibliographyMarkdown({ text, filename: "church1940.md" });
  assert.equal(recognized.admitted, false);
  const rules = recognized.findings.map((finding) => finding.rule);
  assert.ok(rules.includes("reference-type"));
  assert.ok(rules.includes("title"));
});

test("admitBibliographyMarkdown throws with .findings when refused", () => {
  assert.throws(() => admitBibliographyMarkdown({ text: "no frontmatter here" }), (error) => {
    assert.ok(Array.isArray(error.findings));
    return true;
  });
});

test("renderBibliographyMarkdown throws on a malformed record", () => {
  assert.throws(() => renderBibliographyMarkdown({ ...VALID_RECORD, year: "not-a-year" }), TypeError);
});
