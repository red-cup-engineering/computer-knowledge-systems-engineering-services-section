#!/usr/bin/env node
/**
 * @module scholarly-literature-cli
 * The composed face: one CLI dispatching to each retrieval script,
 * printing CSL-JSON on stdout.
 */

import { searchOpenAlexWorks } from "../scripts/search-openalex-works.mjs";
import { fetchOpenAlexWork } from "../scripts/fetch-openalex-work.mjs";
import { searchPubmed } from "../scripts/search-pubmed.mjs";
import { fetchPubmedSummaries } from "../scripts/fetch-pubmed-summaries.mjs";
import { resolveDoi } from "../scripts/resolve-doi.mjs";

const USAGE = `usage: scholarly-literature-cli <command> [args...]
  search-openalex <query> [mailto]
  fetch-openalex <id-or-doi> [mailto]
  search-pubmed <query> [email]
  fetch-pubmed-summaries <pmid> [pmid...] [email]
  resolve-doi <doi> [mailto]`;

/**
 * Dispatch one CLI invocation to its retrieval function.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {Promise<object>} the JSON-serializable result to print
 * @throws {Error} on an unknown or malformed command
 */
export async function runScholarlyLiteratureCli(argv) {
  const [command, ...rest] = argv;
  switch (command) {
    case "search-openalex":
      return searchOpenAlexWorks(rest[0], { mailto: rest[1] });
    case "fetch-openalex":
      return fetchOpenAlexWork(rest[0], { mailto: rest[1] });
    case "search-pubmed":
      return searchPubmed(rest[0], { email: rest[1] });
    case "fetch-pubmed-summaries": {
      const ids = rest.filter((arg) => !arg.includes("@"));
      const email = rest.find((arg) => arg.includes("@"));
      return fetchPubmedSummaries(ids, { email });
    }
    case "resolve-doi":
      return resolveDoi(rest[0], { mailto: rest[1] });
    default:
      throw new Error(USAGE);
  }
}

async function main() {
  const result = await runScholarlyLiteratureCli(process.argv.slice(2));
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
