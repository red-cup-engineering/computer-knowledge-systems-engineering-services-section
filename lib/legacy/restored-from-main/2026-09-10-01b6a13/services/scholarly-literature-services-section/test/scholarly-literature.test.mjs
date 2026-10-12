import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cslName,
  cslDateFromParts,
  cslDateFromIsoString,
  cslDateFromPubmedString,
  cslDateFromDateParts,
  bareDoi,
  openAlexWorkToCsl,
  pubmedSummaryToCsl,
  crossrefWorkToCsl,
} from "../src/scholarly-literature.mjs";
import { searchOpenAlexWorks } from "../scripts/search-openalex-works.mjs";
import { fetchOpenAlexWork } from "../scripts/fetch-openalex-work.mjs";
import { searchPubmed } from "../scripts/search-pubmed.mjs";
import { fetchPubmedSummaries } from "../scripts/fetch-pubmed-summaries.mjs";
import { resolveDoi } from "../scripts/resolve-doi.mjs";
import { runScholarlyLiteratureCli } from "../apps/scholarly-literature-cli.mjs";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** @returns {object} the parsed JSON fixture at fixtures/<name> */
function fixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

/**
 * @param {object} body - the JSON body to serve
 * @param {{ ok?: boolean, status?: number }} [opts]
 * @returns {typeof fetch} a fetchImpl stub resolving to a fixture-backed Response
 */
function fakeFetch(body, { ok = true, status = 200 } = {}) {
  return async () => ({ ok, status, json: async () => body });
}

// — src: name/date/DOI helpers —

test("cslName prefers structured family/given over a literal", () => {
  assert.deepEqual(cslName({ literal: "Yann LeCun", family: "LeCun", given: "Yann" }), { family: "LeCun", given: "Yann" });
});

test("cslName falls back to literal when no family/given given", () => {
  assert.deepEqual(cslName({ literal: "Yann LeCun" }), { literal: "Yann LeCun" });
});

test("cslName returns undefined for an empty input", () => {
  assert.equal(cslName({}), undefined);
});

test("cslDateFromParts builds a date-parts array, omitting absent parts", () => {
  assert.deepEqual(cslDateFromParts(2015, 5), { "date-parts": [[2015, 5]] });
});

test("cslDateFromParts returns undefined for a non-integer year", () => {
  assert.equal(cslDateFromParts(undefined), undefined);
});

test("cslDateFromIsoString parses YYYY-MM-DD", () => {
  assert.deepEqual(cslDateFromIsoString("2015-05-26"), { "date-parts": [[2015, 5, 26]] });
});

test("cslDateFromIsoString parses a bare year", () => {
  assert.deepEqual(cslDateFromIsoString("2015"), { "date-parts": [[2015]] });
});

test("cslDateFromIsoString returns undefined for garbage", () => {
  assert.equal(cslDateFromIsoString("not a date"), undefined);
});

test("cslDateFromPubmedString parses \"YYYY Mon D\"", () => {
  assert.deepEqual(cslDateFromPubmedString("2026 Sep 1"), { "date-parts": [[2026, 9, 1]] });
});

test("cslDateFromPubmedString parses \"YYYY Mon\"", () => {
  assert.deepEqual(cslDateFromPubmedString("2026 Sep"), { "date-parts": [[2026, 9]] });
});

test("cslDateFromDateParts takes the first tuple of a CrossRef date-parts array", () => {
  assert.deepEqual(cslDateFromDateParts([[2015, 5, 27]]), { "date-parts": [[2015, 5, 27]] });
});

test("cslDateFromDateParts returns undefined for a non-array", () => {
  assert.equal(cslDateFromDateParts(undefined), undefined);
});

test("bareDoi strips https://doi.org/ and doi: prefixes", () => {
  assert.equal(bareDoi("https://doi.org/10.1038/nature14539"), "10.1038/nature14539");
  assert.equal(bareDoi("doi:10.1038/nature14539"), "10.1038/nature14539");
  assert.equal(bareDoi("10.1038/nature14539"), "10.1038/nature14539");
});

// — src: normalizers, against real recorded API shapes —

test("openAlexWorkToCsl normalizes a real OpenAlex work record", () => {
  const work = fixture("openalex-work-response.json");
  const item = openAlexWorkToCsl(work);
  assert.equal(item.id, "W2919115771");
  assert.equal(item.type, "article-journal");
  assert.equal(item.title, "Deep learning");
  assert.equal(item.DOI, "10.1038/nature14539");
  assert.equal(item["container-title"], "Nature");
  assert.equal(item.volume, "521");
  assert.equal(item.issue, "7553");
  assert.equal(item.page, "436-444");
  assert.deepEqual(item.issued, { "date-parts": [[2015, 5, 26]] });
  assert.ok(item.author.length > 0);
  assert.equal(item.author[0].literal, "Yann LeCun");
});

test("openAlexWorkToCsl throws on a non-object", () => {
  assert.throws(() => openAlexWorkToCsl(null), TypeError);
});

test("openAlexWorkToCsl throws when neither id nor title is present", () => {
  assert.throws(() => openAlexWorkToCsl({ type: "article" }), /neither an id nor a title/);
});

test("pubmedSummaryToCsl normalizes a real PubMed esummary record", () => {
  const body = fixture("pubmed-esummary-response.json");
  const summary = body.result["42678998"];
  const item = pubmedSummaryToCsl(summary);
  assert.equal(item.id, "42678998");
  assert.equal(item.type, "article-journal");
  assert.match(item.title, /TRAF6-Akt/);
  assert.equal(item.DOI, "10.1371/journal.ppat.1014557");
  assert.equal(item["container-title"], "PLoS pathogens");
  assert.equal(item.volume, "22");
  assert.equal(item.issue, "9");
  assert.deepEqual(item.issued, { "date-parts": [[2026, 9, 1]] });
  assert.equal(item.URL, "https://pubmed.ncbi.nlm.nih.gov/42678998");
  assert.ok(item.author.length > 0);
});

test("pubmedSummaryToCsl throws on a non-object", () => {
  assert.throws(() => pubmedSummaryToCsl("nope"), TypeError);
});

test("pubmedSummaryToCsl throws when uid is missing", () => {
  assert.throws(() => pubmedSummaryToCsl({ title: "x" }), /no uid/);
});

test("crossrefWorkToCsl normalizes a real CrossRef work record", () => {
  const body = fixture("crossref-work-response.json");
  const item = crossrefWorkToCsl(body.message);
  assert.equal(item.id, "10.1038/nature14539");
  assert.equal(item.type, "article-journal");
  assert.equal(item.title, "Deep learning");
  assert.equal(item["container-title"], "Nature");
  assert.equal(item.publisher, "Springer Science and Business Media LLC");
  assert.equal(item.volume, "521");
  assert.equal(item.issue, "7553");
  assert.equal(item.page, "436-444");
  assert.deepEqual(item.issued, { "date-parts": [[2015, 5, 27]] });
  assert.deepEqual(item.author[0], { family: "LeCun", given: "Yann" });
});

test("crossrefWorkToCsl throws on a non-object", () => {
  assert.throws(() => crossrefWorkToCsl(undefined), TypeError);
});

test("crossrefWorkToCsl throws when DOI is missing", () => {
  assert.throws(() => crossrefWorkToCsl({ title: ["x"] }), /no DOI/);
});

// — scripts: injected-fetch happy path against recorded fixtures —

test("searchOpenAlexWorks normalizes a real search response", async () => {
  const body = fixture("openalex-search-response.json");
  const result = await searchOpenAlexWorks("attention is all you need", { fetchImpl: fakeFetch(body) });
  assert.equal(result.items.length, body.results.length);
  assert.equal(result.items[0].title, "Attention Is All You Need");
  assert.ok(typeof result.count === "number");
});

test("searchOpenAlexWorks throws on an empty query", async () => {
  await assert.rejects(() => searchOpenAlexWorks(""), /non-empty query/);
});

test("searchOpenAlexWorks throws on a non-OK response", async () => {
  await assert.rejects(() => searchOpenAlexWorks("x", { fetchImpl: fakeFetch({}, { ok: false, status: 500 }) }), /HTTP 500/);
});

test("searchOpenAlexWorks throws on a malformed body", async () => {
  await assert.rejects(() => searchOpenAlexWorks("x", { fetchImpl: fakeFetch({ nope: true }) }), /malformed response/);
});

test("fetchOpenAlexWork normalizes a real single-work response", async () => {
  const body = fixture("openalex-work-response.json");
  const item = await fetchOpenAlexWork("W2919115771", { fetchImpl: fakeFetch(body) });
  assert.equal(item.title, "Deep learning");
  assert.equal(item.DOI, "10.1038/nature14539");
});

test("fetchOpenAlexWork throws on an empty id", async () => {
  await assert.rejects(() => fetchOpenAlexWork(""), /non-empty id/);
});

test("fetchOpenAlexWork throws on a malformed body", async () => {
  await assert.rejects(() => fetchOpenAlexWork("W1", { fetchImpl: fakeFetch(null) }), /malformed response/);
});

test("searchPubmed returns real recorded PMIDs", async () => {
  const body = fixture("pubmed-esearch-response.json");
  const result = await searchPubmed("CRISPR", { fetchImpl: fakeFetch(body) });
  assert.deepEqual(result.ids, body.esearchresult.idlist);
  assert.equal(result.count, Number(body.esearchresult.count));
});

test("searchPubmed throws on an empty query", async () => {
  await assert.rejects(() => searchPubmed(""), /non-empty query/);
});

test("searchPubmed throws on a malformed body", async () => {
  await assert.rejects(() => searchPubmed("x", { fetchImpl: fakeFetch({ nope: true }) }), /malformed response/);
});

test("fetchPubmedSummaries normalizes real recorded esummary records", async () => {
  const body = fixture("pubmed-esummary-response.json");
  const items = await fetchPubmedSummaries(["42678998", "42678995"], { fetchImpl: fakeFetch(body) });
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "42678998");
});

test("fetchPubmedSummaries throws on an empty id list", async () => {
  await assert.rejects(() => fetchPubmedSummaries([]), /non-empty array/);
});

test("fetchPubmedSummaries throws on a malformed body", async () => {
  await assert.rejects(() => fetchPubmedSummaries(["1"], { fetchImpl: fakeFetch({ nope: true }) }), /malformed response/);
});

test("resolveDoi normalizes a real recorded CrossRef response", async () => {
  const body = fixture("crossref-work-response.json");
  const item = await resolveDoi("10.1038/nature14539", { fetchImpl: fakeFetch(body) });
  assert.equal(item.title, "Deep learning");
  assert.equal(item.DOI, "10.1038/nature14539");
});

test("resolveDoi throws on an empty DOI", async () => {
  await assert.rejects(() => resolveDoi(""), /non-empty DOI/);
});

test("resolveDoi throws on a malformed body", async () => {
  await assert.rejects(() => resolveDoi("10.1/x", { fetchImpl: fakeFetch({ nope: true }) }), /malformed response/);
});

// — apps: CLI dispatch —

test("runScholarlyLiteratureCli throws for an unknown command", async () => {
  await assert.rejects(() => runScholarlyLiteratureCli(["not-a-command"]), /usage:/);
});
