/**
 * @module screen-candidates
 * The effect: reads a screening ledger and a decisions file from disk,
 * deduplicates the ledger's raw candidates, applies the decisions, writes
 * the ledger back with its `screened` field populated, and prints the
 * resulting PRISMA flow counts.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dedupeCandidates, applyScreening, prismaCounts } from "../src/reference-screening.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

/**
 * Screen a ledger's raw candidates against a decisions file and persist the
 * result.
 * @param {{ ledgerPath: string, decisionsPath: string, outputPath?: string }} opts
 * @returns {Readonly<import("../src/reference-screening.mjs").PrismaCounts>}
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

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "screen-candidates", description: "Screen a ledger's raw candidates against a decisions file and persist the result.", operation: screenCandidates }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
