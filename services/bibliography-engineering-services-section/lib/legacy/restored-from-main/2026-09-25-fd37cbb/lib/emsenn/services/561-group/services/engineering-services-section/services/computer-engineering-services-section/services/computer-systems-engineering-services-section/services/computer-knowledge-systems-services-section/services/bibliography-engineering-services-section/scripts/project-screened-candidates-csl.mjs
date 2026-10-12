#!/usr/bin/env node
/**
 * @module project-screened-candidates-csl
 * The effect: reads a screened screening ledger from disk and returns the
 * CSL-JSON items of its included candidates as one array, ready to drop
 * into a paper's `references:` frontmatter — optionally writing it to a
 * file. The screening-ledger counterpart of
 * `scripts/project-references-csl.mjs`, which projects a scope's already
 * collected `references:` maps.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { includedCslItems } from "../src/reference-screening.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

/**
 * Project the included candidates of a screened ledger as a CSL-JSON array.
 * @param {{ ledgerPath: string, outputPath?: string }} opts
 * @returns {ReadonlyArray<object>} the included candidates' CSL-JSON items
 * @throws {Error} when ledgerPath is missing/empty
 * @throws {SyntaxError} when the ledger file is not valid JSON
 */
export function projectScreenedCandidatesCsl({ ledgerPath, outputPath } = {}) {
  if (typeof ledgerPath !== "string" || ledgerPath.trim() === "") {
    throw new Error("projectScreenedCandidatesCsl requires a ledgerPath");
  }
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const items = includedCslItems(ledger);
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(items, null, 2)}\n`);
  return items;
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "project-screened-candidates-csl", description: "Project the included candidates of a screened ledger as a CSL-JSON array.", operation: projectScreenedCandidatesCsl }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
