/**
 * @module export-bibliography
 * The effect: reads a screened screening ledger from disk and returns the
 * CSL-JSON items of its included candidates as one array, ready to drop
 * into a paper's references frontmatter — optionally writing it to a file.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { includedCslItems } from "../src/screening.mjs";

/**
 * Export the included candidates of a screened ledger as a CSL-JSON array.
 * @param {{ ledgerPath: string, outputPath?: string }} opts
 * @returns {ReadonlyArray<object>} the included candidates' CSL-JSON items
 * @throws {Error} when ledgerPath is missing/empty
 * @throws {SyntaxError} when the ledger file is not valid JSON
 */
export function exportBibliography({ ledgerPath, outputPath } = {}) {
  if (typeof ledgerPath !== "string" || ledgerPath.trim() === "") {
    throw new Error("exportBibliography requires a ledgerPath");
  }
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const items = includedCslItems(ledger);
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(items, null, 2)}\n`);
  return items;
}

function main() {
  const [ledgerPath, outputPath] = process.argv.slice(2);
  if (!ledgerPath) {
    console.error("usage: export-bibliography.mjs <ledger.json> [output.json]");
    process.exitCode = 1;
    return;
  }
  const items = exportBibliography({ ledgerPath, outputPath });
  if (!outputPath) console.log(JSON.stringify(items, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(error.message ?? error);
    process.exitCode = 1;
  }
}
