/**
 * @module watch
 * Domain semantics: a journal watch — a named set of per-source queries run
 * on a rolling date window, appending one search-audit row per query and
 * only the candidates a screening ledger does not already know about. The
 * dedupe identity reuses `dedupeKeyForItem`/`makeCandidateRecord` from
 * screening.mjs, so a work already surfaced (by DOI or normalized title)
 * never re-enters the ledger as a new candidate. The one effect is the
 * network fetch (`fetchImpl`), injected so `runWatch` is testable against
 * recorded fixtures with no network access.
 */

import { openAlexWorkToCsl, pubmedSummaryToCsl } from "./scholarly-literature.mjs";
import { makeSearchRecord, makeCandidateRecord, dedupeKeyForItem } from "./screening.mjs";
import { isObjectRecord as isRecord } from "@red-cup-engineering/json-codec-service";

const WATCH_SOURCES = new Set(["pubmed", "openalex"]);

/**
 * @param {unknown} value
 * @returns {string|undefined} trimmed non-empty string, else undefined
 */
function str(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Compute the inclusive `YYYY-MM-DD` date window ending at `now` and
 * reaching back `sinceDays` days.
 * @param {Date} now
 * @param {number} sinceDays
 * @returns {Readonly<{ from: string, to: string }>}
 * @throws {TypeError} when now is not a valid Date or sinceDays is not a positive integer
 */
export function dateWindow(now, sinceDays) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("dateWindow requires a valid Date for now");
  }
  if (!Number.isInteger(sinceDays) || sinceDays <= 0) {
    throw new TypeError("dateWindow requires a positive integer sinceDays");
  }
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - sinceDays * 86400000).toISOString().slice(0, 10);
  return Object.freeze({ from, to });
}

/**
 * Query PubMed (esearch, date-windowed by publication date, then esummary)
 * for CSL-JSON items.
 * @param {string} query
 * @param {Readonly<{ from: string, to: string }>} window
 * @param {{ fetchImpl: typeof fetch, mailto?: string }} opts
 * @returns {Promise<{ count: number, items: object[] }>}
 * @throws {Error} on a non-OK response or a malformed body
 */
async function queryPubmed(query, window, { fetchImpl, mailto }) {
  const searchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  searchUrl.searchParams.set("db", "pubmed");
  searchUrl.searchParams.set("term", query);
  searchUrl.searchParams.set("retmode", "json");
  searchUrl.searchParams.set("retmax", "200");
  searchUrl.searchParams.set("datetype", "pdat");
  searchUrl.searchParams.set("mindate", window.from.replaceAll("-", "/"));
  searchUrl.searchParams.set("maxdate", window.to.replaceAll("-", "/"));
  if (mailto) searchUrl.searchParams.set("email", mailto);

  const searchResponse = await fetchImpl(searchUrl);
  if (!searchResponse.ok) throw new Error(`PubMed esearch failed: HTTP ${searchResponse.status}`);
  const searchBody = await searchResponse.json();
  const idlist = searchBody?.esearchresult?.idlist;
  if (!Array.isArray(idlist)) {
    throw new Error("PubMed esearch: malformed response (missing esearchresult.idlist)");
  }
  const count = Number(searchBody.esearchresult.count ?? idlist.length);
  if (idlist.length === 0) return { count, items: [] };

  const summaryUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
  summaryUrl.searchParams.set("db", "pubmed");
  summaryUrl.searchParams.set("id", idlist.join(","));
  summaryUrl.searchParams.set("retmode", "json");
  if (mailto) summaryUrl.searchParams.set("email", mailto);

  const summaryResponse = await fetchImpl(summaryUrl);
  if (!summaryResponse.ok) throw new Error(`PubMed esummary failed: HTTP ${summaryResponse.status}`);
  const summaryBody = await summaryResponse.json();
  const uids = summaryBody?.result?.uids;
  if (!Array.isArray(uids)) {
    throw new Error("PubMed esummary: malformed response (missing result.uids)");
  }
  const items = uids
    .map((uid) => summaryBody.result[uid])
    .filter((record) => record && typeof record === "object" && record.error === undefined)
    .map(pubmedSummaryToCsl);
  return { count, items };
}

/**
 * Query OpenAlex works (search, date-windowed by publication date) for
 * CSL-JSON items.
 * @param {string} query
 * @param {Readonly<{ from: string, to: string }>} window
 * @param {{ fetchImpl: typeof fetch, mailto?: string }} opts
 * @returns {Promise<{ count: number, items: object[] }>}
 * @throws {Error} on a non-OK response or a malformed body
 */
async function queryOpenAlex(query, window, { fetchImpl, mailto }) {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per_page", "200");
  url.searchParams.set("filter", `from_publication_date:${window.from},to_publication_date:${window.to}`);
  if (mailto) url.searchParams.set("mailto", mailto);
  const userAgent = mailto
    ? `scholarly-literature-services-section (mailto:${mailto})`
    : "scholarly-literature-services-section";

  const response = await fetchImpl(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok) throw new Error(`OpenAlex search failed: HTTP ${response.status}`);
  const body = await response.json();
  if (!body || !Array.isArray(body.results)) {
    throw new Error("OpenAlex search: malformed response (missing results array)");
  }
  return {
    count: typeof body.meta?.count === "number" ? body.meta.count : body.results.length,
    items: body.results.map(openAlexWorkToCsl),
  };
}

/**
 * @typedef {Object} WatchQuery
 * @property {"pubmed"|"openalex"} source
 * @property {string} query
 * @property {string} [mailto]
 *
 * @typedef {Object} WatchSpec
 * @property {string} id
 * @property {ReadonlyArray<WatchQuery>} queries
 * @property {number} sinceDays - rolling window, in days, ending at `now`
 */

/** @param {number} ms @returns {Promise<void>} */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run one journal watch: query every source in `spec.queries` over the
 * rolling `spec.sinceDays` window ending at `now`, appending one
 * `SearchRecord` per query and one `CandidateRecord` per result item whose
 * dedupe key (`dedupeKeyForItem`) is not already carried by an existing
 * candidate in `ledger.candidates` — the same identity screening.mjs uses,
 * reused here so a watch never re-surfaces a work already in the ledger.
 * Queries run sequentially (never concurrently), so `requestDelayMs`, when
 * given, is a real per-query throttle — needed against PubMed's anonymous
 * E-utilities rate limit (3 requests/second without an API key) once a
 * spec carries more than a couple of `"pubmed"` queries.
 *
 * @param {WatchSpec} spec
 * @param {{ ledger?: { searches?: object[], candidates?: object[], screened?: object[] }, now?: Date, fetchImpl?: typeof fetch, requestDelayMs?: number }} [opts]
 * @returns {Promise<{ newCandidates: ReadonlyArray<import("./screening.mjs").CandidateRecord>, ledger: object }>}
 * @throws {TypeError} when spec lacks an id, a non-empty queries array, or a valid sinceDays, or a query lacks a known source/non-empty query string
 */
export async function runWatch(spec, { ledger, now = new Date(), fetchImpl = fetch, requestDelayMs = 0 } = {}) {
  if (!isRecord(spec)) throw new TypeError("runWatch requires a WatchSpec object");
  const id = str(spec.id);
  if (id === undefined) throw new TypeError("runWatch requires a WatchSpec.id");
  if (!Array.isArray(spec.queries) || spec.queries.length === 0) {
    throw new TypeError("runWatch requires a non-empty WatchSpec.queries array");
  }
  const window = dateWindow(now, spec.sinceDays);
  const today = now.toISOString().slice(0, 10);

  const baseLedger = isRecord(ledger) ? ledger : {};
  const existingSearches = Array.isArray(baseLedger.searches) ? baseLedger.searches : [];
  const existingCandidates = Array.isArray(baseLedger.candidates) ? baseLedger.candidates : [];
  const knownKeys = new Set(
    existingCandidates
      .map((candidate) => (isRecord(candidate) ? candidate.dedupeKey : undefined))
      .filter((key) => typeof key === "string"),
  );

  const newSearches = [];
  const newCandidates = [];

  for (const [index, query] of spec.queries.entries()) {
    if (!isRecord(query)) throw new TypeError("runWatch: each query must be an object");
    const source = query.source;
    if (!WATCH_SOURCES.has(source)) {
      throw new TypeError(`runWatch: query.source must be "pubmed" or "openalex", got ${JSON.stringify(source)}`);
    }
    const queryText = str(query.query);
    if (queryText === undefined) throw new TypeError("runWatch: each query requires a non-empty query string");

    if (index > 0 && requestDelayMs > 0) await sleep(requestDelayMs);
    const { count, items } = source === "pubmed"
      ? await queryPubmed(queryText, window, { fetchImpl, mailto: query.mailto })
      : await queryOpenAlex(queryText, window, { fetchImpl, mailto: query.mailto });

    const searchRecord = makeSearchRecord({ source, query: queryText, date: today, resultCount: count });
    newSearches.push(searchRecord);

    for (const item of items) {
      const dedupeKey = dedupeKeyForItem(item);
      if (dedupeKey === undefined || knownKeys.has(dedupeKey)) continue;
      knownKeys.add(dedupeKey);
      newCandidates.push(makeCandidateRecord({ item, source, searchId: searchRecord.id }));
    }
  }

  const updatedLedger = {
    ...baseLedger,
    searches: [...existingSearches, ...newSearches],
    candidates: [...existingCandidates, ...newCandidates],
  };
  return { newCandidates: Object.freeze(newCandidates), ledger: updatedLedger };
}
