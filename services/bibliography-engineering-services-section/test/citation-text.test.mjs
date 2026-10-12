import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCitation, parseCitationFragment, parseCitations, passesConfidence } from "../src/citation-text.mjs";
import { admitReferenceEntry } from "../schemas/bibliography/reference-entry.schema.mjs";

const NOW = new Date("2026-07-01T00:00:00");

test("parses a journal article to CSL-JSON", () => {
  const r = parseCitationFragment('Fitting, Melvin (1991). "Bilattices and the Semantics of Logic Programming." *Journal of Logic Programming* 11(2), 91-116.', { now: NOW });
  assert.ok(r.ok);
  assert.equal(r.entry.type, "article-journal");
  assert.deepEqual(r.entry.author, [{ family: "Fitting", given: "Melvin" }]);
  assert.equal(r.entry["container-title"], "Journal of Logic Programming");
  assert.equal(r.entry.volume, 11);
  assert.equal(r.entry.issue, "2");
  assert.equal(r.entry.page, "91-116");
  assert.deepEqual(r.entry.issued, { "date-parts": [[1991]] });
});

test("parses a chapter with container and publisher", () => {
  const r = parseCitationFragment("Belnap, Nuel D. (1977). \"A Useful Four-Valued Logic.\" In *Modern Uses of Multiple-Valued Logic*, Reidel, 5-37.", { now: NOW });
  assert.ok(r.ok);
  assert.equal(r.entry.type, "chapter");
  assert.equal(r.entry["container-title"], "Modern Uses of Multiple-Valued Logic");
  assert.equal(r.entry.publisher, "Reidel");
  assert.equal(r.entry.page, "5-37");
});

test("parses an arXiv preprint", () => {
  const r = parseCitationFragment('Jakl, T. (2025). "Four Imprints." arXiv:2503.20679.', { now: NOW });
  assert.ok(r.ok);
  assert.equal(r.entry.type, "article");
  assert.equal(r.entry.note, "arXiv:2503.20679");
});

test("parses a multi-author italic-title book", () => {
  const r = parseCitationFragment("Galatos, Nikolaos, Peter Jipsen, Tomasz Kowalski, and Hiroakira Ono (2007). *Residuated Lattices*. Elsevier.", { now: NOW });
  assert.ok(r.ok);
  assert.equal(r.entry.type, "book");
  assert.equal(r.entry.author.length, 4);
  assert.deepEqual(r.entry.author[1], { family: "Jipsen", given: "Peter" });
  assert.equal(r.entry.publisher, "Elsevier");
});

test("parses an RFC into a report with number", () => {
  const r = parseCitationFragment('Bradner, S. (1997). "Key Words." BCP 14, RFC 2119.', { now: NOW });
  assert.ok(r.ok);
  assert.equal(r.entry.type, "report");
  assert.equal(r.entry.publisher, "IETF");
  assert.equal(r.entry.number, "RFC 2119");
});

test("every parsed fragment converts to an admissible house reference entry", () => {
  const inputs = [
    'Fitting, Melvin (1991). "Bilattices." *Journal of Logic Programming* 11(2), 91-116.',
    "Belnap, Nuel D. (1977). \"A Useful Four-Valued Logic.\" In *Modern Uses of Multiple-Valued Logic*, Reidel, 5-37.",
    "Galatos, Nikolaos, and Hiroakira Ono (2007). *Residuated Lattices*. Elsevier.",
    "WHATWG (current). *HTML Living Standard.* https://html.spec.whatwg.org/",
  ];
  const taken = new Set();
  for (const input of inputs) {
    const results = parseCitation(input, { now: NOW, taken });
    assert.equal(results.length, 1, `failed to parse: ${input}`);
    const [result] = results;
    assert.ok(result.ok, `failed to parse: ${input}: ${result.reason}`);
    assert.deepEqual(admitReferenceEntry(result.citekey, result.entry), result.entry);
  }
});

test("assigns unique disambiguated citekeys", () => {
  const { references } = parseCitations([
    "Smith, J. (2020). *One*. Pub.",
    "Smith, K. (2020). *Two*. Pub.",
  ].join("\n"), { now: NOW, minConfidence: "low" });
  const citekeys = Object.keys(references).sort();
  assert.deepEqual(citekeys, ["smith2020", "smith2020a"]);
});

test("confidence filter drops low-confidence parses", () => {
  const text = 'Anon (2020). "A bare title with no container."';
  const high = parseCitations(text, { now: NOW, minConfidence: "high" });
  assert.equal(Object.keys(high.references).length, 0);
  const low = parseCitations(text, { now: NOW, minConfidence: "low" });
  assert.equal(Object.keys(low.references).length, 1);
});

test("reports unparsable lines as findings", () => {
  const { references, findings } = parseCitations("this is not a citation at all", { now: NOW, minConfidence: "low" });
  assert.equal(Object.keys(references).length, 0);
  assert.ok(findings.some((f) => f.rule === "entry-unparsed"));
});

test("parseCitations pairs each admitted reference with its CSL item and confidence", () => {
  const { references, items, confidence } = parseCitations(
    'Fitting, Melvin (1991). "Bilattices." *Journal of Logic Programming* 11(2), 91-116.',
    { now: NOW, minConfidence: "low" },
  );
  const [citekey] = Object.keys(references);
  assert.equal(citekey, "fitting1991");
  assert.equal(items[citekey].id, "fitting1991");
  assert.equal(items[citekey].type, "article-journal");
  assert.equal(confidence[citekey], "high");
  assert.deepEqual(references[citekey].authors, ["Melvin Fitting"]);
});

test("passesConfidence ranks high > medium > low", () => {
  assert.equal(passesConfidence("high", "medium"), true);
  assert.equal(passesConfidence("medium", "high"), false);
  assert.equal(passesConfidence("low", "low"), true);
});

// ----- APA 7 / Chicago author-date journal-article and APA book shapes -----

test("parses a plain (non-Markdown) APA 7 journal-article citation, splitting title/journal/volume/issue/page, DOI corroborates high confidence", () => {
  const r = parseCitationFragment(
    "Peters, O. (2019). The ergodicity problem in economics. Nature Physics, 15(12), 1216–1221. https://doi.org/10.1038/s41567-019-0732-0",
    { now: NOW },
  );
  assert.ok(r.ok);
  assert.equal(r.style, "apa-journal-article");
  assert.equal(r.entry.type, "article-journal");
  assert.equal(r.entry.title, "The ergodicity problem in economics");
  assert.equal(r.entry["container-title"], "Nature Physics");
  assert.equal(r.entry.volume, 15);
  assert.equal(r.entry.issue, "12");
  assert.equal(r.entry.page, "1216-1221");
  assert.equal(r.entry.DOI, "10.1038/s41567-019-0732-0");
  assert.deepEqual(r.entry.author, [{ family: "Peters", given: "O." }]);
  assert.equal(r.confidence, "high");
});

test("parses a multi-author APA 7 journal-article citation without a DOI at medium confidence", () => {
  const r = parseCitationFragment(
    "Smith, J., & Doe, K. (2020). A study of things. Journal of Studies, 5(2), 100-110.",
    { now: NOW },
  );
  assert.ok(r.ok);
  assert.equal(r.style, "apa-journal-article");
  assert.equal(r.entry.title, "A study of things");
  assert.equal(r.entry["container-title"], "Journal of Studies");
  assert.equal(r.entry.volume, 5);
  assert.equal(r.entry.issue, "2");
  assert.equal(r.entry.page, "100-110");
  assert.deepEqual(r.entry.author, [{ family: "Smith", given: "J." }, { family: "Doe", given: "K." }]);
  assert.equal(r.confidence, "medium");
  assert.equal(r.entry.DOI, undefined);
});

test("parses a Chicago author-date journal-article citation, splitting title/journal/volume/issue/page", () => {
  const r = parseCitationFragment(
    'Berlant, Lauren. 2011. "Cruel Optimism." Critical Inquiry 33 (4): 754-780.',
    { now: NOW },
  );
  assert.ok(r.ok);
  assert.equal(r.style, "chicago-author-date-journal-article");
  assert.equal(r.entry.type, "article-journal");
  assert.equal(r.entry.title, "Cruel Optimism");
  assert.equal(r.entry["container-title"], "Critical Inquiry");
  assert.equal(r.entry.volume, 33);
  assert.equal(r.entry.issue, "4");
  assert.equal(r.entry.page, "754-780");
  assert.equal(r.confidence, "medium");
});

test("parses a multi-author Chicago author-date journal-article citation", () => {
  const r = parseCitationFragment(
    'Berlant, Lauren, and Kathleen Stewart. 2019. "The Hundreds." Critical Inquiry 45 (3): 599-624.',
    { now: NOW },
  );
  assert.ok(r.ok);
  assert.equal(r.style, "chicago-author-date-journal-article");
  assert.deepEqual(r.entry.author, [{ family: "Berlant", given: "Lauren" }, { family: "Stewart", given: "Kathleen" }]);
  assert.equal(r.entry.volume, 45);
  assert.equal(r.entry.issue, "3");
  assert.equal(r.entry.page, "599-624");
});

test("a DOI or arXiv landmark upgrades a Chicago-style parse to high confidence", () => {
  const r = parseCitationFragment(
    'Berlant, Lauren. 2011. "Cruel Optimism." Critical Inquiry 33 (4): 754-780. https://doi.org/10.1086/659353',
    { now: NOW },
  );
  assert.ok(r.ok);
  assert.equal(r.confidence, "high");
  assert.equal(r.entry.DOI, "10.1086/659353");
});

test("parses an APA-style book citation (title. publisher.) as CSL type book", () => {
  const r = parseCitationFragment("Berlant, L. (2011). Cruel Optimism. Duke University Press.", { now: NOW });
  assert.ok(r.ok);
  assert.equal(r.style, "apa-book");
  assert.equal(r.entry.type, "book");
  assert.equal(r.entry.title, "Cruel Optimism");
  assert.equal(r.entry.publisher, "Duke University Press");
  assert.equal(r.entry["container-title"], undefined);
  assert.deepEqual(r.entry.author, [{ family: "Berlant", given: "L." }]);
});

test("every new-shape parse converts to an admissible house reference entry", () => {
  const inputs = [
    "Peters, O. (2019). The ergodicity problem in economics. Nature Physics, 15(12), 1216–1221. https://doi.org/10.1038/s41567-019-0732-0",
    "Smith, J., & Doe, K. (2020). A study of things. Journal of Studies, 5(2), 100-110.",
    'Berlant, Lauren, and Kathleen Stewart. 2019. "The Hundreds." Critical Inquiry 45 (3): 599-624.',
    "Berlant, L. (2011). Cruel Optimism. Duke University Press.",
  ];
  const taken = new Set();
  for (const input of inputs) {
    const [result] = parseCitation(input, { now: NOW, taken });
    assert.ok(result.ok, `failed to parse: ${input}: ${result.reason}`);
    assert.deepEqual(admitReferenceEntry(result.citekey, result.entry), result.entry);
  }
});

test("parseCitations reports the Peters (2019) citation as high confidence with a clean publication split", () => {
  const { references, confidence } = parseCitations(
    "Peters, O. (2019). The ergodicity problem in economics. Nature Physics, 15(12), 1216–1221. https://doi.org/10.1038/s41567-019-0732-0",
    { now: NOW },
  );
  assert.equal(confidence.peters2019, "high");
  assert.equal(references.peters2019.publication, "Nature Physics");
});
