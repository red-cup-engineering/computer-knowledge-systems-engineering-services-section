/**
 * @module resolve-doi
 * The effect: resolves a DOI against the CrossRef works API and normalizes
 * the record to CSL-JSON. No API key required; a mailto identifies the
 * caller to CrossRef's polite pool for faster, less-throttled responses.
 */

import { bareDoi } from "@red-cup-engineering/csl-json-services-section";
import { crossrefWorkToCsl } from "@red-cup-engineering/csl-json-services-section/scripts/project-crossref-work-csl.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

/**
 * Resolve one DOI (bare, `doi:`-prefixed, or `https://doi.org/`-prefixed)
 * to a CSL-JSON item via CrossRef.
 * @param {string} doi
 * @param {{ fetchImpl?: typeof fetch, mailto?: string }} [opts]
 * @returns {Promise<object>} a CSL-JSON item
 * @throws {Error} on a missing DOI, a non-OK response, or a malformed body
 */
export async function resolveDoi(doi, { fetchImpl = fetch, mailto } = {}) {
  if (typeof doi !== "string" || doi.trim() === "") {
    throw new Error("resolveDoi requires a non-empty DOI");
  }
  const clean = bareDoi(doi.trim());
  const url = new URL(`https://api.crossref.org/works/${clean}`);
  if (mailto) url.searchParams.set("mailto", mailto);

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`CrossRef resolve failed: HTTP ${response.status}`);
  const body = await response.json();
  if (!body || typeof body !== "object" || !body.message) {
    throw new Error("CrossRef resolve: malformed response (missing message)");
  }
  return crossrefWorkToCsl(body.message);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "resolve-doi", description: "Resolve one DOI (bare, `doi:`-prefixed, or `https://doi.org/`-prefixed) to a CSL-JSON item via CrossRef.", operation: resolveDoi }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
