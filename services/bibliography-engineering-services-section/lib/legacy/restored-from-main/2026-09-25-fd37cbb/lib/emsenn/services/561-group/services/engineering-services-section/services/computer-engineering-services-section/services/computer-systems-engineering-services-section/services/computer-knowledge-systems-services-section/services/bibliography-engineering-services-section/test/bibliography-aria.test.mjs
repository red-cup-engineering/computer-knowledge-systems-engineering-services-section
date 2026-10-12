import assert from "node:assert/strict";
import { test } from "node:test";
import {
  orderedReferenceEntries,
  referenceEntryId,
  referenceNumbering,
  renderBiblioRefLink,
  renderReferenceEntryHtml,
  renderReferenceListAria,
} from "../src/bibliography-aria.mjs";

function triple(citekey, reference) { return { citekey, reference }; }

const CAILLOIS = { authors: ["Roger Caillois"], title: "Les jeux et les hommes", year: 1958, publication: "Diogenes", url: "https://example.org/caillois" };
const EULER = { authors: ["Leonhard Euler"], title: "Solutio problematis", year: 1736, publisher: "Petropolitanae" };

test("referenceEntryId slugs a citekey into a DOM-safe ref- id", () => {
  assert.equal(referenceEntryId("caillois1958"), "ref-caillois1958");
});

test("orderedReferenceEntries deduplicates by citekey (first occurrence wins) and sorts by citekey", () => {
  const entries = orderedReferenceEntries([
    triple("zed2020", { authors: ["Z"], title: "Last", year: 2020 }),
    triple("caillois1958", CAILLOIS),
    triple("caillois1958", { authors: ["Someone Else"], title: "Wrong", year: 1999 }),
  ]);
  assert.deepEqual(entries.map((e) => e.citekey), ["caillois1958", "zed2020"]);
  assert.equal(entries[0].reference.title, "Les jeux et les hommes");
});

test("referenceNumbering assigns 1-based ordinals matching orderedReferenceEntries", () => {
  const triples = [triple("zed2020", { authors: ["Z"], title: "Last", year: 2020 }), triple("caillois1958", CAILLOIS)];
  const numbering = referenceNumbering(triples);
  assert.equal(numbering.get("caillois1958"), 1);
  assert.equal(numbering.get("zed2020"), 2);
});

test("renderReferenceEntryHtml renders a doc-biblioentry li with the entry id, a linked cite when url is present, and escaped text", () => {
  const html = renderReferenceEntryHtml("caillois1958", { ...CAILLOIS, title: "Les <jeux> & les hommes" });
  assert.match(html, /^<li id="ref-caillois1958" role="doc-biblioentry">/);
  assert.match(html, /<cite><a href="https:\/\/example\.org\/caillois">Les &lt;jeux&gt; &amp; les hommes<\/a><\/cite>/);
  assert.match(html, /Roger Caillois\./);
  assert.match(html, /Diogenes\./);
  assert.match(html, /1958\./);
});

test("renderReferenceEntryHtml renders a bare cite (no link) when url is absent", () => {
  const html = renderReferenceEntryHtml("euler1736", EULER);
  assert.match(html, /<cite>Solutio problematis<\/cite>/);
  assert.doesNotMatch(html, /<a /);
  assert.match(html, /Petropolitanae\./);
});

test("renderReferenceListAria renders a DPUB-ARIA doc-bibliography section with default nomenclature", () => {
  const html = renderReferenceListAria([triple("caillois1958", CAILLOIS)]);
  assert.match(html, /^<section class="bibliography" role="doc-bibliography" aria-labelledby="references">/);
  assert.match(html, /<h2 id="references">References<\/h2>/);
  assert.match(html, /<ol><li id="ref-caillois1958" role="doc-biblioentry">/);
  assert.match(html, /<\/ol><\/section>$/);
});

test("renderReferenceListAria takes a {label, id} nomenclature parameter instead of hardcoding English", () => {
  const html = renderReferenceListAria([triple("caillois1958", CAILLOIS)], { label: "Sources", id: "sources" });
  assert.match(html, /aria-labelledby="sources"/);
  assert.match(html, /<h2 id="sources">Sources<\/h2>/);
});

test("renderReferenceListAria escapes a label containing markup", () => {
  const html = renderReferenceListAria([triple("caillois1958", CAILLOIS)], { label: "<b>Sources</b>" });
  assert.match(html, /<h2 id="references">&lt;b&gt;Sources&lt;\/b&gt;<\/h2>/);
});

test("renderReferenceListAria orders and deduplicates entries the same way orderedReferenceEntries does", () => {
  const html = renderReferenceListAria([triple("zed2020", { authors: ["Z"], title: "Last", year: 2020 }), triple("caillois1958", CAILLOIS)]);
  assert.ok(html.indexOf("ref-caillois1958") < html.indexOf("ref-zed2020"));
});

test("renderReferenceListAria returns the empty string for no distinct citekeys", () => {
  assert.equal(renderReferenceListAria([]), "");
});

test("renderBiblioRefLink renders a doc-biblioref anchor addressing the same id referenceEntryId produces", () => {
  const html = renderBiblioRefLink("caillois1958", 1);
  assert.equal(html, '<a class="citation" role="doc-biblioref" href="#ref-caillois1958" data-cites="caillois1958">[1]</a>');
});

test("renderBiblioRefLink falls back to a bracketed citekey when no number is given", () => {
  const html = renderBiblioRefLink("caillois1958");
  assert.match(html, />\[caillois1958\]<\/a>$/);
});

test("renderBiblioRefLink refuses a non-citekey", () => {
  assert.throws(() => renderBiblioRefLink("not a citekey"), TypeError);
});

test("a list and its inline links agree: renderBiblioRefLink's href matches the list's rendered entry id and referenceNumbering's ordinal", () => {
  const triples = [triple("zed2020", { authors: ["Z"], title: "Last", year: 2020 }), triple("caillois1958", CAILLOIS)];
  const list = renderReferenceListAria(triples);
  const numbering = referenceNumbering(triples);
  const link = renderBiblioRefLink("caillois1958", numbering.get("caillois1958"));
  assert.match(link, /href="#ref-caillois1958"/);
  assert.ok(list.includes('id="ref-caillois1958"'));
  assert.match(link, />\[1\]<\/a>$/);
});
