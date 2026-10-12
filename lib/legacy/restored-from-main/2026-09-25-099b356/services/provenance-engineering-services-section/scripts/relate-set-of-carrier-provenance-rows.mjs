#!/usr/bin/env node
/**
 * Effect: relate every carrier graded by the science-carrier provenance
 * census into one eavt trace, via `appendEavt`/`constituteEntity` (eavt's
 * own row identity and digesting, never hand-rolled here).
 * @module relate-set-of-carrier-provenance-rows
 */
import { rm } from "node:fs/promises";
import { readFileBytes } from "@red-cup-engineering/file-services/read-file";
import { appendEavtRow } from "@red-cup-engineering/eavt";
import { isMain } from "@red-cup-engineering/javascript-file-services-section/javascript-file-main-guard";
import { buildCarrierRows, deriveRowsTsvPath, parseProvenanceRowsTsv } from "../src/provenance-census.mjs";

/**
 * Parse argv into the die's options.
 * @param {string[]} argv - `process.argv.slice(2)`.
 * @returns {{census: (string|undefined), trace: (string|undefined)}}
 */
export function parseArgv(argv) {
  let census;
  let trace;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--census") {
      census = argv[index + 1];
      index += 1;
    } else if (token === "--trace") {
      trace = argv[index + 1];
      index += 1;
    }
  }
  return { census, trace };
}

/**
 * Read a piped standard-input stream completely as text; returns "" when
 * the stream is a TTY (nothing piped).
 * @param {NodeJS.ReadStream} stdin
 * @returns {Promise<string>}
 */
async function readPipedStdin(stdin) {
  if (stdin.isTTY) return "";
  let text = "";
  for await (const chunk of stdin) text += chunk;
  return text;
}

/**
 * Resolve the `{census, trace}` request from argv flags, falling back to
 * one JSON object read from piped stdin for whichever of the two is not
 * given as a flag.
 * @param {string[]} argv
 * @param {NodeJS.ReadStream} [stdin]
 * @returns {Promise<{census: string, trace: string}>}
 * @throws {TypeError} When neither source names both `census` and `trace`.
 */
export async function resolveRequest(argv, stdin = process.stdin) {
  const { census: flagCensus, trace: flagTrace } = parseArgv(argv);
  let census = flagCensus;
  let trace = flagTrace;
  if (census === undefined || trace === undefined) {
    const piped = (await readPipedStdin(stdin)).trim();
    if (piped.length > 0) {
      const parsed = JSON.parse(piped);
      census = census ?? parsed.census;
      trace = trace ?? parsed.trace;
    }
  }
  if (typeof census !== "string" || census.length === 0 || typeof trace !== "string" || trace.length === 0) {
    throw new TypeError("relate-set-of-carrier-provenance-rows: --census and --trace (or stdin {census,trace}) are required");
  }
  return { census, trace };
}

/**
 * Run the relation end to end: read the census record (for its
 * `checkedAt` date) and its sibling rows TSV, constitute one
 * `science-carrier` entity per carrier row, append its eavt rows to
 * `trace`, and return the summary.
 * @param {{census: string, trace: string}} request
 * @returns {Promise<{type: string, trace: string, carriers: number, rows: number}>}
 */
export async function relateCarrierProvenanceRows({ census, trace }) {
  const censusBuffer = await readFileBytes(census);
  const record = JSON.parse(censusBuffer.toString("utf8"));
  const rowsTsvPath = deriveRowsTsvPath(census);
  const tsvBuffer = await readFileBytes(rowsTsvPath);
  const carriers = parseProvenanceRowsTsv(tsvBuffer.toString("utf8"));
  const censusDate = typeof record.checkedAt === "string" ? record.checkedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);

  await rm(trace, { recursive: true, force: true }); // fresh relation each run, never accumulated appends

  let rowCount = 0;
  for (const carrier of carriers) {
    for (const row of buildCarrierRows(carrier, censusDate)) {
      appendEavtRow({ path: trace, row });
      rowCount += 1;
    }
  }

  return { type: "CarrierProvenanceRowsRelated", trace, carriers: carriers.length, rows: rowCount };
}

async function main() {
  const request = await resolveRequest(process.argv.slice(2));
  const summary = await relateCarrierProvenanceRows(request);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
