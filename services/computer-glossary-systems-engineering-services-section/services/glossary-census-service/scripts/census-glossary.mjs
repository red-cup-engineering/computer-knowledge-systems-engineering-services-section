#!/usr/bin/env node
import { readFileText } from "@red-cup-engineering/computer-file-engineering-services-section/read-file";
import { writeFileText } from "@red-cup-engineering/computer-file-engineering-services-section/write-file";
import { confinePath } from "@red-cup-engineering/computer-filepath-engineering-services-section/filepath";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { isMain } from "@red-cup-engineering/javascript-file-services-section/javascript-file-main-guard";
import { findGlossaryTermMarkdownPaths, projectGlossaryIndex } from "@red-cup-engineering/term-engineering-services-section/glossary-index";
import { censusGlossaryIndex } from "../src/glossary-census.mjs";

/** Default `--out-dir`: the 561 Group section's own knowledge records, beneath `--root`. */
const DEFAULT_OUT_DIR = "services/561-group-services-section/data/records/knowledge-census-records/glossary/census";

/**
 * Parse `--root <dir> [--out-dir <dir>] [--date YYYY-MM-DD]`.
 * @param {string[]} argv
 * @returns {{root: string, outDir: string, date: string}}
 */
export function parseCensusGlossaryArgs(argv) {
  const root = argument("--root", argv);
  if (typeof root !== "string" || root === "") throw new TypeError("--root is required");
  return { root, outDir: argument("--out-dir", argv) ?? `${root}/${DEFAULT_OUT_DIR}`, date: argument("--date", argv) ?? new Date().toISOString().slice(0, 10) };
}

/**
 * Index every glossary term under `root` through the term owner, census the index, and write
 * `<date>.json` and its `<date>.rows.tsv` sidecar under `outDir`.
 * @param {ReturnType<typeof parseCensusGlossaryArgs>} options
 */
export async function censusGlossary({ root, outDir, date }) {
  const absoluteRoot = confinePath({ root }).path;
  const documents = [];
  for (const path of findGlossaryTermMarkdownPaths(absoluteRoot)) {
    const relativePath = confinePath({ root: absoluteRoot, path }).relativePath;
    documents.push({ path: relativePath, filename: relativePath.split("/").pop(), text: await readFileText(path) });
  }
  const { record, rows } = censusGlossaryIndex(projectGlossaryIndex({ root: absoluteRoot, documents }), { date });
  await writeFileText(`${outDir}/${date}.json`, `${JSON.stringify(record, null, 2)}\n`);
  await writeFileText(`${outDir}/${date}.rows.tsv`, `${rows.map((row) => row.join("\t")).join("\n")}\n`);
  return { out: `${outDir}/${date}.json`, record };
}

if (isMain(import.meta.url)) {
  const { out, record } = await censusGlossary(parseCensusGlossaryArgs(process.argv.slice(2)));
  process.stdout.write(`carriers: ${record.carriers}  admitted: ${record.admitted}  refused: ${record.refused}  stubs: ${record.stubs}  shared identities: ${Object.keys(record.sharedIdentities).length}\nwrote: ${out}\n`);
}
