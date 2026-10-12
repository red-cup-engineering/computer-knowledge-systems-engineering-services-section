/**
 * @module screen-candidates
 * The effect: reads a screening ledger and a decisions file from disk,
 * deduplicates the ledger's raw candidates, applies the decisions, writes
 * the ledger back with its `screened` field populated, and prints the
 * resulting PRISMA flow counts.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dedupeCandidates, applyScreening, prismaCounts } from "../src/screening.mjs";

/**
 * Screen a ledger's raw candidates against a decisions file and persist the
 * result.
 * @param {{ ledgerPath: string, decisionsPath: string, outputPath?: string }} opts
 * @returns {Readonly<import("../src/screening.mjs").PrismaCounts>}
 * @throws {Error} when ledgerPath or decisionsPath is missing/empty
 * @throws {SyntaxError} when either file is not valid JSON
 */
export function screenCandidates({ ledgerPath, decisionsPath, outputPath } = {}) {
  if (typeof ledgerPath !== "string" || ledgerPath.trim() === "") {
    throw new Error("screenCandidates requires a ledgerPath");
  }
  if (typeof decisionsPath !== "string" || decisionsPath.trim() === "") {
    throw new Error("screenCandidates requires a decisionsPath");
  }
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const decisions = JSON.parse(readFileSync(decisionsPath, "utf8"));
  const deduplicated = dedupeCandidates(Array.isArray(ledger.candidates) ? ledger.candidates : []);
  const screened = applyScreening(deduplicated, Array.isArray(decisions) ? decisions : []);
  const updatedLedger = { ...ledger, screened };
  writeFileSync(outputPath ?? ledgerPath, `${JSON.stringify(updatedLedger, null, 2)}\n`);
  return prismaCounts(updatedLedger);
}

function main() {
  const [ledgerPath, decisionsPath, outputPath] = process.argv.slice(2);
  if (!ledgerPath || !decisionsPath) {
    console.error("usage: screen-candidates.mjs <ledger.json> <decisions.json> [output.json]");
    process.exitCode = 1;
    return;
  }
  const counts = screenCandidates({ ledgerPath, decisionsPath, outputPath });
  console.log(JSON.stringify(counts, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error.message ?? error);
    process.exitCode = 1;
  }
}
