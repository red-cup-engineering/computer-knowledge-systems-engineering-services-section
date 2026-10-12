import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { searchOpenAlexWorks } from "../scripts/search-openalex-works.mjs";
import { fetchOpenAlexWork } from "../scripts/fetch-openalex-work.mjs";
import { searchPubmed } from "../scripts/search-pubmed.mjs";
import { fetchPubmedSummaries } from "../scripts/fetch-pubmed-summaries.mjs";
import { resolveDoi } from "../scripts/resolve-doi.mjs";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** @returns {object} the parsed JSON fixture at fixtures/<name> */
function fixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

/**
 * @param {object} body - the JSON body to serve
 * @param {{ ok?: boolean, status?: number, seen?: URL[] }} [opts]
 * @returns {typeof fetch} a fetchImpl stub resolving to a fixture-backed Response
 */
function fakeFetch(body, { ok = true, status = 200, seen } = {}) {
  return async (url) => {
    if (seen) seen.push(new URL(url));
    return { ok, status, json: async () => body };
  };
}

// ----- OpenAlex -----

test("searchOpenAlexWorks normalizes a real search response", async () => {
  const body = fixture("openalex-search-response.json");
  const result = await searchOpenAlexWorks("attention is all you need", { fetchImpl: fakeFetch(body) });
  assert.equal(result.items.length, body.results.length);
  assert.equal(result.items[0].title, "Attention Is All You Need");
  assert.ok(typeof result.count === "number");
});

test("searchOpenAlexWorks passes a caller-given filter through as OpenAlex's own filter parameter", async () => {
  const seen = [];
  await searchOpenAlexWorks("x", {
    fetchImpl: fakeFetch({ results: [], meta: { count: 0 } }, { seen }),
    filter: "from_publication_date:2026-08-01,to_publication_date:2026-09-01",
    perPage: 200,
  });
  assert.equal(seen[0].searchParams.get("filter"), "from_publication_date:2026-08-01,to_publication_date:2026-09-01");
  assert.equal(seen[0].searchParams.get("per_page"), "200");
});

test("searchOpenAlexWorks sets no filter parameter when none is given", async () => {
  const seen = [];
  await searchOpenAlexWorks("x", { fetchImpl: fakeFetch({ results: [], meta: { count: 0 } }, { seen }) });
  assert.equal(seen[0].searchParams.has("filter"), false);
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

test("fetchOpenAlexWork resolves a DOI to OpenAlex's doi: path form", async () => {
  const seen = [];
  await fetchOpenAlexWork("https://doi.org/10.1038/nature14539", {
    fetchImpl: fakeFetch(fixture("openalex-work-response.json"), { seen }),
  });
  assert.equal(seen[0].pathname, "/works/doi:10.1038/nature14539");
});

test("fetchOpenAlexWork throws on an empty id", async () => {
  await assert.rejects(() => fetchOpenAlexWork(""), /non-empty id/);
});

test("fetchOpenAlexWork throws on a malformed body", async () => {
  await assert.rejects(() => fetchOpenAlexWork("W1", { fetchImpl: fakeFetch(null) }), /malformed response/);
});

// ----- PubMed -----

test("searchPubmed returns real recorded PMIDs", async () => {
  const body = fixture("pubmed-esearch-response.json");
  const result = await searchPubmed("CRISPR", { fetchImpl: fakeFetch(body) });
  assert.deepEqual(result.ids, body.esearchresult.idlist);
  assert.equal(result.count, Number(body.esearchresult.count));
});

test("searchPubmed restricts by publication date when given a from/to window", async () => {
  const seen = [];
  await searchPubmed("x", {
    fetchImpl: fakeFetch(fixture("pubmed-esearch-response.json"), { seen }),
    from: "2026-08-01",
    to: "2026-09-01",
  });
  assert.equal(seen[0].searchParams.get("datetype"), "pdat");
  assert.equal(seen[0].searchParams.get("mindate"), "2026/08/01");
  assert.equal(seen[0].searchParams.get("maxdate"), "2026/09/01");
});

test("searchPubmed sets no date parameters when the window is absent or half-given", async () => {
  for (const opts of [{}, { from: "2026-08-01" }, { to: "2026-09-01" }]) {
    const seen = [];
    await searchPubmed("x", { fetchImpl: fakeFetch(fixture("pubmed-esearch-response.json"), { seen }), ...opts });
    assert.equal(seen[0].searchParams.has("datetype"), false);
    assert.equal(seen[0].searchParams.has("mindate"), false);
  }
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

// ----- CrossRef -----

test("resolveDoi normalizes a real recorded CrossRef response", async () => {
  const body = fixture("crossref-work-response.json");
  const item = await resolveDoi("10.1038/nature14539", { fetchImpl: fakeFetch(body) });
  assert.equal(item.title, "Deep learning");
  assert.equal(item.DOI, "10.1038/nature14539");
});

test("resolveDoi strips whatever prefix the DOI arrived with before querying CrossRef", async () => {
  const seen = [];
  await resolveDoi("https://doi.org/10.1038/nature14539", {
    fetchImpl: fakeFetch(fixture("crossref-work-response.json"), { seen }),
  });
  assert.equal(seen[0].pathname, "/works/10.1038/nature14539");
});

test("resolveDoi throws on an empty DOI", async () => {
  await assert.rejects(() => resolveDoi(""), /non-empty DOI/);
});

test("resolveDoi throws on a malformed body", async () => {
  await assert.rejects(() => resolveDoi("10.1/x", { fetchImpl: fakeFetch({ nope: true }) }), /malformed response/);
});
