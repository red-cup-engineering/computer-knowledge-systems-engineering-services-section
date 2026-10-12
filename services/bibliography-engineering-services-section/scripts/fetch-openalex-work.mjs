/**
 * @module fetch-openalex-work
 * The effect: fetches a single OpenAlex work by its OpenAlex id or by DOI,
 * and normalizes it to CSL-JSON.
 */

import { openAlexWorkToCsl } from "@red-cup-engineering/csl-json-services-section/scripts/project-openalex-work-csl.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

const DOI_PATTERN = /^10\.\d{4,9}\//u;

/**
 * @param {string} idOrDoi
 * @returns {string} the OpenAlex `/works/{path}` path segment for idOrDoi
 */
function openAlexWorkPath(idOrDoi) {
  const bare = idOrDoi.replace(/^https:\/\/doi\.org\//iu, "").replace(/^doi:/iu, "");
  if (DOI_PATTERN.test(bare)) return `doi:${bare}`;
  return idOrDoi.replace(/^https:\/\/openalex\.org\//iu, "");
}

/**
 * Fetch one OpenAlex work by OpenAlex id (e.g. "W2919115771") or by DOI
 * (bare, `doi:`-prefixed, or `https://doi.org/`-prefixed).
 * @param {string} idOrDoi
 * @param {{ fetchImpl?: typeof fetch, mailto?: string }} [opts]
 * @returns {Promise<object>} a CSL-JSON item
 * @throws {Error} on a missing id, a non-OK response, or a malformed body
 */
export async function fetchOpenAlexWork(idOrDoi, { fetchImpl = fetch, mailto } = {}) {
  if (typeof idOrDoi !== "string" || idOrDoi.trim() === "") {
    throw new Error("fetchOpenAlexWork requires a non-empty id or DOI");
  }
  const url = new URL(`https://api.openalex.org/works/${openAlexWorkPath(idOrDoi.trim())}`);
  if (mailto) url.searchParams.set("mailto", mailto);

  const response = await fetchImpl(url, {
    headers: { "User-Agent": mailto ? `bibliography-engineering-services-section (mailto:${mailto})` : "bibliography-engineering-services-section" },
  });
  if (!response.ok) throw new Error(`OpenAlex fetch failed: HTTP ${response.status}`);
  const body = await response.json();
  if (!body || typeof body !== "object") {
    throw new Error("OpenAlex fetch: malformed response (not an object)");
  }
  return openAlexWorkToCsl(body);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "fetch-openalex-work", description: "Fetch one OpenAlex work by OpenAlex id (e.g.", operation: fetchOpenAlexWork }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
