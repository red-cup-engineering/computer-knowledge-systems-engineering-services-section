/**
 * @module search-openalex-works
 * The effect: queries the OpenAlex works search API and normalizes results
 * to CSL-JSON. No API key required; a mailto identifies the caller to
 * OpenAlex's polite pool for faster, less-throttled responses.
 */

import { openAlexWorkToCsl } from "@red-cup-engineering/csl-json-services-section/scripts/project-openalex-work-csl.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-operation-engineering-services-section/operation";

/**
 * @param {string} mailto
 * @returns {string} the User-Agent header value OpenAlex's polite pool expects
 */
function politeUserAgent(mailto) {
  return mailto
    ? `bibliography-engineering-services-section (mailto:${mailto})`
    : "bibliography-engineering-services-section";
}

/**
 * Search OpenAlex works by free-text query. `filter`, when given, is passed
 * through as OpenAlex's own `filter` parameter — the one parameter a rolling
 * journal watch adds over an ordinary search (a publication-date window), so
 * `src/reference-watch.mjs` composes this rather than growing a second
 * OpenAlex client.
 *
 * @param {string} query
 * @param {{ fetchImpl?: typeof fetch, mailto?: string, perPage?: number, cursor?: string, filter?: string }} [opts]
 * @returns {Promise<{ count: number, items: object[], nextCursor: (string|undefined) }>}
 * @throws {Error} on a missing query, a non-OK response, or a malformed body
 */
export async function searchOpenAlexWorks(query, { fetchImpl = fetch, mailto, perPage = 25, cursor, filter } = {}) {
  if (typeof query !== "string" || query.trim() === "") {
    throw new Error("searchOpenAlexWorks requires a non-empty query string");
  }
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per_page", String(perPage));
  if (mailto) url.searchParams.set("mailto", mailto);
  if (cursor) url.searchParams.set("cursor", cursor);
  if (filter) url.searchParams.set("filter", filter);

  const response = await fetchImpl(url, { headers: { "User-Agent": politeUserAgent(mailto) } });
  if (!response.ok) throw new Error(`OpenAlex search failed: HTTP ${response.status}`);
  const body = await response.json();
  if (!body || !Array.isArray(body.results)) {
    throw new Error("OpenAlex search: malformed response (missing results array)");
  }
  return {
    count: typeof body.meta?.count === "number" ? body.meta.count : body.results.length,
    items: body.results.map(openAlexWorkToCsl),
    nextCursor: typeof body.meta?.next_cursor === "string" ? body.meta.next_cursor : undefined,
  };
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "search-openalex-works", description: "Search OpenAlex works by free-text query.", operation: searchOpenAlexWorks }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
