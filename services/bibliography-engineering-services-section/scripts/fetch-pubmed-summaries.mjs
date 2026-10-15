/**
 * @module fetch-pubmed-summaries
 * The effect: fetches PubMed's E-utilities `esummary` records for a set of
 * PMIDs and normalizes each to a CSL-JSON item.
 */

import { pubmedSummaryToCsl } from "@red-cup-engineering/csl-json-services-section/scripts/project-pubmed-summary-csl.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-operation-engineering-services-section/operation";

/**
 * Fetch and normalize PubMed summaries for a set of PMIDs.
 * @param {string[]} ids - PMIDs, e.g. from search-pubmed.mjs
 * @param {{ fetchImpl?: typeof fetch, email?: string }} [opts]
 * @returns {Promise<object[]>} CSL-JSON items, one per resolvable id
 * @throws {Error} on an empty id list, a non-OK response, or a malformed body
 */
export async function fetchPubmedSummaries(ids, { fetchImpl = fetch, email } = {}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("fetchPubmedSummaries requires a non-empty array of PMIDs");
  }
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("retmode", "json");
  if (email) url.searchParams.set("email", email);

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`PubMed esummary failed: HTTP ${response.status}`);
  const body = await response.json();
  const uids = body?.result?.uids;
  if (!Array.isArray(uids)) {
    throw new Error("PubMed esummary: malformed response (missing result.uids)");
  }
  return uids
    .map((uid) => body.result[uid])
    .filter((record) => record && typeof record === "object" && record.error === undefined)
    .map(pubmedSummaryToCsl);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "fetch-pubmed-summaries", description: "Fetch and normalize PubMed summaries for a set of PMIDs.", operation: fetchPubmedSummaries }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
