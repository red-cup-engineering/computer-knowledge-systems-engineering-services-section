import assert from "node:assert/strict";
import test from "node:test";

import { bookRecord } from "../src/book-record.mjs";
import { referenceCheck } from "../src/reference-check.mjs";

const response = (body, status = 200, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, json: async () => body });
const networkError = (code) => Object.assign(new TypeError("fetch failed"), { cause: { code } });
const author = [{ family: "Sénéchal", given: "Monique" }];
const given = { type: "article-journal", title: "The effect of family literacy interventions on children's acquisition of reading", author, issued: { "date-parts": [[2008]] } };
const crossref = (title = given.title) => ({ message: { DOI: "10.3102/example", type: "journal-article", title: [title], author: [{ family: "Sénéchal", given: "Monique" }], issued: { "date-parts": [[2008]] } } });
const crossrefSearch = (title = given.title) => ({ message: { items: [crossref(title).message] } });
const openAlex = (title = given.title, displayName = "Monique Sénéchal") => ({ id: "https://openalex.org/W1", type: "article", title, authorships: [{ author: { display_name: displayName } }], publication_year: 2008 });
const openAlexSearch = (title = given.title, displayName) => ({ meta: { count: 1 }, results: [openAlex(title, displayName)] });
const emptyOpenLibrarySearch = { numFound: 0, docs: [] };
const drabinskiReference = "Drabinski, E. (2019). What is critical about critical librarianship? Art Libraries Journal, 44(2), 49–57.";
const drabinskiTitle = "What is critical about critical librarianship?";
const drabinskiCrossrefSearch = { message: { items: [{ DOI: "10.1017/alj.2019.3", type: "journal-article", title: [drabinskiTitle], author: [{ family: "Drabinski", given: "Emily" }], issued: { "date-parts": [[2019]] } }] } };

test("referenceCheck produces each house FOUR truth reading", async () => {
  async function run(crossrefBody, openAlexBody) {
    const fetchImpl = async (input) => {
      const url = String(input);
      if (url.includes("api.crossref.org")) return crossrefBody ? response(crossrefBody) : response({}, 404);
      if (url.includes("api.openalex.org/works/doi:")) return openAlexBody ? response(openAlexBody) : response({}, 404);
      throw new Error(`unexpected URL ${url}`);
    };
    const item = { ...given, DOI: "10.3102/example" };
    return (await referenceCheck({ references: [item] }, { fetchImpl })).results[0];
  }
  assert.equal((await run(crossref(), null)).read, "true");
  assert.equal((await run(crossref("A different work"), null)).read, "false");
  assert.equal((await run(crossref(), openAlex("A different work"))).read, "both");
  assert.equal((await run(null, null)).read, "neither");
});

test("bookRecord returns a sourced book and refuses bad checksums and missing books", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.endsWith("/isbn/9780670654000.json")) return response({ title: "The Snowy Day", publish_date: "1962", publishers: ["Viking Press"], works: [{ key: "/works/OL45804W" }], authors: [{ key: "/authors/OL22242A" }] });
    if (url.endsWith("/works/OL45804W.json")) return response({ title: "The Snowy Day" });
    if (url.endsWith("/authors/OL22242A.json")) return response({ name: "Ezra Jack Keats" });
    return response({}, 404);
  };
  assert.equal((await bookRecord({ isbn: "9780670654000" }, { fetchImpl })).read, "true");
  assert.equal((await bookRecord({ isbn: "9780670654001" }, { fetchImpl })).refusal.code, "invalid-isbn");
  assert.equal((await bookRecord({ isbn: "9780306406157" }, { fetchImpl })).refusal.code, "isbn-not-found");
});

test("referenceCheck refuses more than 25 references", async () => {
  await assert.rejects(referenceCheck({ references: Array(26).fill("x") }, { fetchImpl: async () => response({}) }), /at most 25/u);
});

test("referenceCheck retries one transient source failure and keeps its successful reading", async () => {
  let crossrefCalls = 0;
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("api.crossref.org") && ++crossrefCalls === 1) throw networkError("ETIMEDOUT");
    if (url.includes("api.crossref.org")) return response(crossref());
    if (url.includes("api.openalex.org")) return response({}, 404);
    throw new Error(`unexpected URL ${url}`);
  };
  const result = (await referenceCheck({ references: [{ ...given, DOI: "10.3102/example" }] }, { fetchImpl })).results[0];
  assert.equal(crossrefCalls, 2);
  assert.equal(result.read, "true");
  assert.deepEqual(result.sources, [{ source: "CrossRef", url: "https://api.crossref.org/works/10.3102%2Fexample", status: "matched" }]);
});

test("referenceCheck isolates an unreachable source and preserves other references", async () => {
  const first = { ...given, DOI: "10.3102/example" };
  const second = { ...given, DOI: "10.3102/other" };
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("api.crossref.org") && url.includes("example")) return response(crossref());
    if (url.includes("api.crossref.org")) return response({}, 404);
    if (url.includes("api.openalex.org") && url.includes("example")) throw networkError("ECONNRESET");
    if (url.includes("api.openalex.org")) return response(openAlex());
    throw new Error(`unexpected URL ${url}`);
  };
  const { results } = await referenceCheck({ references: [first, second] }, { fetchImpl });
  assert.equal(results.length, 2);
  assert.equal(results[0].read, "true");
  assert.deepEqual(results[0].sources, [
    { source: "OpenAlex", url: "https://api.openalex.org/works/doi:10.3102/example", status: "unreachable", error: "ECONNRESET" },
    { source: "CrossRef", url: "https://api.crossref.org/works/10.3102%2Fexample", status: "matched" },
  ]);
  assert.equal(results[1].read, "true");
});

test("referenceCheck times out hung sources and distinguishes not checked from not found", async () => {
  let calls = 0;
  const fetchImpl = (_input, { signal }) => new Promise((_resolve, reject) => {
    calls += 1;
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const result = (await referenceCheck({ references: [{ ...given, DOI: "10.3102/example" }] }, { fetchImpl, timeoutMs: 5 })).results[0];
  assert.equal(calls, 4);
  assert.equal(result.read, "neither");
  assert.match(result.note, /not checked/u);
  assert.deepEqual(result.sources.map(({ source, error }) => ({ source, error })), [
    { source: "CrossRef", error: "ETIMEDOUT" },
    { source: "OpenAlex", error: "ETIMEDOUT" },
  ]);
});

test("bookRecord refuses an unreachable Open Library source after one retry", async () => {
  let calls = 0;
  const result = await bookRecord({ isbn: "9780670654000" }, { fetchImpl: async () => {
    calls += 1;
    return response({}, 503, { "retry-after": "0" });
  } });
  assert.equal(calls, 2);
  assert.deepEqual(result.refusal, { code: "source-unreachable", source: "Open Library", error: "HTTP_503", message: "Open Library is unreachable: HTTP_503" });
  assert.equal(result.read, "neither");
});

test("referenceCheck title search uses CrossRef when OpenAlex misses", async () => {
  const requests = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.hostname === "api.crossref.org") return response(drabinskiCrossrefSearch);
    if (url.hostname === "api.openalex.org") return response({ meta: { count: 0 }, results: [] });
    if (url.hostname === "openlibrary.org") return response(emptyOpenLibrarySearch);
    throw new Error(`unexpected URL ${url}`);
  };
  const result = (await referenceCheck({ references: [drabinskiReference] }, { fetchImpl, mailto: "catalog@example.org" })).results[0];
  const request = requests.find(({ url }) => url.hostname === "api.crossref.org");
  assert.equal(request.url.searchParams.get("query.bibliographic"), drabinskiTitle);
  assert.equal(request.url.searchParams.get("query.author"), "E. Drabinski");
  assert.equal(request.url.searchParams.get("rows"), "5");
  assert.equal(request.url.searchParams.get("mailto"), "catalog@example.org");
  assert.equal(request.init.headers["User-Agent"], "bibliography-engineering-services-section (mailto:catalog@example.org)");
  assert.equal(result.item["container-title"], "Art Libraries Journal");
  assert.equal(result.read, "true");
  assert.deepEqual(result.sources.map(({ source, status }) => ({ source, status })), [{ source: "CrossRef", status: "matched" }]);
});

test("referenceCheck title search records CrossRef and OpenAlex when both agree", async () => {
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.crossref.org") return response(crossrefSearch());
    if (url.hostname === "api.openalex.org") return response(openAlexSearch());
    if (url.hostname === "openlibrary.org") return response(emptyOpenLibrarySearch);
    throw new Error(`unexpected URL ${url}`);
  };
  const result = (await referenceCheck({ references: [given] }, { fetchImpl })).results[0];
  assert.equal(result.read, "true");
  assert.deepEqual(result.sources.map(({ source, status }) => ({ source, status })), [
    { source: "OpenAlex", status: "matched" },
    { source: "CrossRef", status: "matched" },
  ]);
});

test("referenceCheck title search treats an unrelated hit as no evidence", async () => {
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.crossref.org") return response(crossrefSearch());
    if (url.hostname === "api.openalex.org") return response(openAlexSearch("A different work"));
    if (url.hostname === "openlibrary.org") return response(emptyOpenLibrarySearch);
    throw new Error(`unexpected URL ${url}`);
  };
  const result = (await referenceCheck({ references: [given] }, { fetchImpl })).results[0];
  assert.equal(result.read, "true");
});

test("referenceCheck refutes a real book credited to the wrong author", async () => {
  const snowyDay = { numFound: 1, docs: [{ key: "/works/OL1W", title: "The Snowy Day", author_name: ["Ezra Jack Keats"], first_publish_year: 1962 }] };
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.crossref.org") return response({ message: { items: [] } });
    if (url.hostname === "api.openalex.org") return response({ meta: { count: 0 }, results: [] });
    if (url.hostname === "openlibrary.org") return response(url.searchParams.has("author") ? emptyOpenLibrarySearch : snowyDay);
    throw new Error(`unexpected URL ${url}`);
  };
  const result = (await referenceCheck({ references: ["Sendak, M. (1962). The snowy day. Viking."] }, { fetchImpl })).results[0];
  assert.equal(result.read, "false");
  assert.equal(result.matched.author[0].family, "Keats");
});

test("referenceCheck title search reads both when CrossRef and OpenAlex credit the work differently", async () => {
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.crossref.org") return response(crossrefSearch());
    if (url.hostname === "api.openalex.org") return response(openAlexSearch(given.title, "Someone Else"));
    if (url.hostname === "openlibrary.org") return response(emptyOpenLibrarySearch);
    throw new Error(`unexpected URL ${url}`);
  };
  const result = (await referenceCheck({ references: [given] }, { fetchImpl })).results[0];
  assert.equal(result.read, "both");
  assert.deepEqual(result.sources.map(({ source, status }) => ({ source, status })), [{ source: "CrossRef", status: "matched" }]);
});
