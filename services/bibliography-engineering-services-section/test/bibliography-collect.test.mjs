import assert from "node:assert/strict";
import { test } from "node:test";
import { collectBibliographyCarriers, collectInlineCitations, collectReferenceTriples } from "../src/bibliography-collect.mjs";

function markdown(frontmatter, body = "prose") {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

test("collectReferenceTriples extracts one triple per references: entry", () => {
  const documents = [
    { relativePath: "glossary/terms/stomata.md", text: markdown({ references: { caillois1958: { authors: ["Caillois, Roger"], title: "Les jeux et les hommes", year: 1958 } } }) },
    { relativePath: "glossary/terms/no-refs.md", text: markdown({ name: "no-refs" }) },
  ];
  const { triples, findings } = collectReferenceTriples(documents);
  assert.equal(triples.length, 1);
  assert.equal(triples[0].citekey, "caillois1958");
  assert.equal(triples[0].path, "glossary/terms/stomata.md");
  assert.equal(findings.length, 0);
});

test("collectReferenceTriples reports an invalid reference entry as a finding rather than throwing", () => {
  const documents = [
    { relativePath: "a.md", text: markdown({ references: { caillois1958: { title: "no authors or year" } } }) },
  ];
  const { triples, findings } = collectReferenceTriples(documents);
  assert.equal(triples.length, 0);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "invalid-reference-entry");
});

test("collectReferenceTriples reports a malformed references: shape as a finding", () => {
  const documents = [{ relativePath: "a.md", text: markdown({ references: ["not", "a", "map"] }) }];
  const { triples, findings } = collectReferenceTriples(documents);
  assert.equal(triples.length, 0);
  assert.equal(findings[0].rule, "references-shape");
});

test("collectBibliographyCarriers recognizes every type: bibliography document", () => {
  const documents = [
    { relativePath: "bibliographies/euler1736.md", text: markdown({ type: "bibliography", key: "euler1736", "reference-type": "article", authors: ["Euler, Leonhard"], year: 1736, title: "Solutio problematis" }) },
    { relativePath: "bibliographies/scraped-doc.md", text: markdown({ type: "bibliography", title: "Reference on Something" }) },
    { relativePath: "glossary/terms/stomata.md", text: markdown({ name: "stomata" }) },
  ];
  const carriers = collectBibliographyCarriers(documents);
  assert.equal(carriers.length, 2);
  const euler = carriers.find((carrier) => carrier.path === "bibliographies/euler1736.md");
  assert.equal(euler.citekey, "euler1736");
  assert.equal(euler.recognized.admitted, true);
  const scraped = carriers.find((carrier) => carrier.path === "bibliographies/scraped-doc.md");
  assert.equal(scraped.recognized.admitted, false);
});

test("collectInlineCitations extracts a bare @citekey and a bracketed multi-key citation", () => {
  const documents = [
    { relativePath: "a.md", text: markdown({ name: "a" }, "See @euler1736 and [@caillois1958; @caillois1958b, p. 5] for detail.") },
  ];
  const citations = collectInlineCitations(documents);
  assert.deepEqual(citations.map((citation) => citation.citekey), ["euler1736", "caillois1958", "caillois1958b"]);
  assert.ok(citations.every((citation) => citation.path === "a.md"));
});

test("collectInlineCitations ignores an email-like @ inside a word", () => {
  const documents = [
    { relativePath: "a.md", text: markdown({ name: "a" }, "Contact info@euler1736.com for more.") },
  ];
  const citations = collectInlineCitations(documents);
  assert.deepEqual(citations, []);
});

test("collectInlineCitations ignores a citekey-shaped token inside a fenced code block", () => {
  const documents = [
    { relativePath: "a.md", text: markdown({ name: "a" }, "before\n\n```\n@euler1736 in a code sample\n```\n\n@caillois1958 outside the fence") },
  ];
  const citations = collectInlineCitations(documents);
  assert.deepEqual(citations.map((citation) => citation.citekey), ["caillois1958"]);
});
