/**
 * @module watch-literature
 * The effect: reads a WatchSpec and a screening ledger from disk, runs the
 * watch against the live network, writes the ledger back with its new
 * search-audit rows and candidates appended, and prints the new-candidate
 * count.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { runWatch } from "../src/reference-watch.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

// throttle between queries against PubMed's anonymous 3 req/sec E-utilities
// limit; observed live (2026-09-02) that <1s spacing still draws HTTP 429s
const DEFAULT_LIVE_REQUEST_DELAY_MS = 1200;

/**
 * Run one journal watch against a spec file and a ledger file on disk,
 * writing the updated ledger back.
 * @param {{ specPath: string, ledgerPath: string, outputPath?: string, now?: Date, fetchImpl?: typeof fetch, requestDelayMs?: number }} opts
 * @returns {Promise<number>} the count of newly appended candidates
 * @throws {Error} when specPath or ledgerPath is missing/empty
 * @throws {SyntaxError} when either file is not valid JSON
 */
export async function watchLiterature({ specPath, ledgerPath, outputPath, now, fetchImpl, requestDelayMs = DEFAULT_LIVE_REQUEST_DELAY_MS } = {}) {
  if (typeof specPath !== "string" || specPath.trim() === "") {
    throw new Error("watchLiterature requires a specPath");
  }
  if (typeof ledgerPath !== "string" || ledgerPath.trim() === "") {
    throw new Error("watchLiterature requires a ledgerPath");
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const { newCandidates, ledger: updatedLedger } = await runWatch(spec, { ledger, now, fetchImpl, requestDelayMs });
  writeFileSync(outputPath ?? ledgerPath, `${JSON.stringify(updatedLedger, null, 2)}\n`);
  return newCandidates.length;
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "watch-literature", description: "Run one journal watch against a spec file and a ledger file on disk, writing the updated ledger back.", operation: watchLiterature }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
