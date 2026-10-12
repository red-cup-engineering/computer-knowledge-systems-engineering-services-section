import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";
/**
 * @module search-pubmed
 * The effect: queries PubMed's E-utilities `esearch` endpoint for matching
 * PMIDs. No API key required; an email identifies the caller per NCBI's
 * usage guidelines. Returns bare PMIDs — pair with fetch-pubmed-summaries.mjs
 * to get CSL-JSON items.
 */

/**
 * Search PubMed by free-text query, returning matching PMIDs. A `from`/`to`
 * pair (inclusive `YYYY-MM-DD` dates) restricts the search to works
 * published in that window — the one parameter a rolling journal watch adds
 * over an ordinary search, so `src/reference-watch.mjs` composes this rather
 * than growing a second E-utilities client.
 *
 * @param {string} query
 * @param {{ fetchImpl?: typeof fetch, email?: string, retmax?: number, from?: string, to?: string }} [opts]
 * @returns {Promise<{ count: number, ids: string[] }>}
 * @throws {Error} on a missing query, a non-OK response, or a malformed body
 */
export async function searchPubmed(query, { fetchImpl = fetch, email, retmax = 20, from, to } = {}) {
  if (typeof query !== "string" || query.trim() === "") {
    throw new Error("searchPubmed requires a non-empty query string");
  }
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("term", query);
  url.searchParams.set("retmode", "json");
  url.searchParams.set("retmax", String(retmax));
  if (from !== undefined && to !== undefined) {
    url.searchParams.set("datetype", "pdat");
    url.searchParams.set("mindate", from.replaceAll("-", "/"));
    url.searchParams.set("maxdate", to.replaceAll("-", "/"));
  }
  if (email) url.searchParams.set("email", email);

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`PubMed esearch failed: HTTP ${response.status}`);
  const body = await response.json();
  const idlist = body?.esearchresult?.idlist;
  if (!Array.isArray(idlist)) {
    throw new Error("PubMed esearch: malformed response (missing esearchresult.idlist)");
  }
  return {
    count: Number(body.esearchresult.count ?? idlist.length),
    ids: idlist,
  };
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "search-pubmed", description: "Search PubMed by free-text query, returning matching PMIDs.", operation: searchPubmed }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
