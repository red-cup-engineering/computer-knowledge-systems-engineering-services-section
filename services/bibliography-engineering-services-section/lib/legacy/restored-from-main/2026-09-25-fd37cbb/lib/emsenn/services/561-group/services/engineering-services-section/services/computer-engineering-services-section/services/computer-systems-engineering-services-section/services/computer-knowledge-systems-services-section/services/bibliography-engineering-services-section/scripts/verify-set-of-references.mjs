#!/usr/bin/env node
import { resolveDoi } from "./resolve-doi.mjs";
import { collectReferencesFrom } from "./collect-set-of-references.mjs";
import { buildVerificationSet, classifyRow, rowsFromCollected, validateRawRows } from "../src/reference-verification.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

export { buildVerificationSet, classifyRow, rowsFromCollected, validateRawRows } from "../src/reference-verification.mjs";

/**
 * Resolve the verifier's input rows from a parsed request: a bare array of
 * `{path?, citekey, doi?, title, year}` rows, or `{scope, includeGlobs?}`
 * naming a directory to collect the section's own way.
 *
 * @param {unknown} parsed - the parsed stdin JSON.
 * @returns {Array<object>} frozen rows.
 * @throws {TypeError} when `parsed` is neither shape, or fails validation.
 */
function rowsFromInput(parsed) {
  if (Array.isArray(parsed)) return validateRawRows(parsed);
  if (parsed !== null && typeof parsed === "object" && typeof parsed.scope === "string" && parsed.scope.trim() !== "") {
    if (parsed.includeGlobs !== undefined && !Array.isArray(parsed.includeGlobs)) {
      throw new TypeError("includeGlobs must be an array of glob strings");
    }
    const collected = collectReferencesFrom(parsed.scope);
    return rowsFromCollected(collected, { includeGlobs: parsed.includeGlobs });
  }
  throw new TypeError('verifier input must be an array of rows, or an object {scope, includeGlobs?}');
}

/**
 * Resolve every row's doi against CrossRef and report per-row agreement, the
 * one CrossRef-verification effect this section performs.
 *
 * @param {unknown} parsed - the parsed stdin JSON (array of rows, or {scope, includeGlobs?}).
 * @param {{fetchImpl?: typeof fetch, mailto?: string}} [options] - `fetchImpl` is injectable so tests never reach the network.
 * @returns {Promise<{type: "ReferenceVerificationSet", version: 1, rowCount: number, defects: Array<object>, defectCount: number, agreed: number}>} the frozen verification set.
 */
export async function verifySetOfReferences(parsed, { fetchImpl = fetch, mailto } = {}) {
  const rows = rowsFromInput(parsed);
  const results = [];
  for (const row of rows) {
    if (row.doi === undefined) {
      results.push(classifyRow(row, null));
      continue;
    }
    try {
      const cslItem = await resolveDoi(row.doi, { fetchImpl, mailto });
      results.push(classifyRow(row, { ok: true, cslItem }));
    } catch (error) {
      results.push(classifyRow(row, { ok: false, error: error.message }));
    }
  }
  return buildVerificationSet(results);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "verify-set-of-references", description: "Resolve every row's doi against CrossRef and report per-row agreement, the one CrossRef-verification effect this section performs.", operation: verifySetOfReferences }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
