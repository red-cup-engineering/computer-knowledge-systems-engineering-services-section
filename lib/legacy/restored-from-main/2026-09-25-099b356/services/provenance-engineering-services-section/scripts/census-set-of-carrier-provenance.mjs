#!/usr/bin/env node
// friction (provenance-engineering-services-section-node-import-migration, 2026-09-04): no
// house service walks a directory tree upward looking for a marker file (manifest.scm names
// the repo root); existsSync/dirname/resolve stay for that small bounded loop.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath as projectFileUrlFilepath } from "node:url";
import { writeFileText } from "@red-cup-engineering/file-services/write-file";
import { confinePath } from "@red-cup-engineering/filepath-services-section";
import { isMain } from "@red-cup-engineering/javascript-file-services-section/javascript-file-main-guard";
import { walkPosixPaths } from "@red-cup-engineering/filepath-services-section/walk-posix-paths";
import { readMarkdownFile } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-file";
import { readMarkdownFrontmatter } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-frontmatter";
import { assembleRecord, assessCarrier, shouldExcludeCarrierPath } from "../src/provenance-census.mjs";

const SCRIPT_DIRECTORY = dirname(projectFileUrlFilepath(import.meta.url));

/**
 * Resolve the enclosing Git worktree. Guix configuration does not identify a
 * repository.
 *
 * @param {string} startDirectory
 * @returns {string}
 * @throws {Error} when no ancestor carries the marker.
 */
function findRepoRoot(startDirectory) {
  return execFileSync("git", ["-C", resolve(startDirectory), "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

const REPO_ROOT = findRepoRoot(SCRIPT_DIRECTORY);
const DEFAULT_SCIENCE_ROOT = `${REPO_ROOT}/lib/emsenn/services/561-group/services/science-services-section`;
const DEFAULT_OUT_DIR = `${REPO_ROOT}/lib/emsenn/services/561-group/services/561-group-services-section/services/561-group-science-services-section/data/records`;

const EXCLUDED_DIRECTORY_NAMES = ["node_modules", ".git", "dist", "triage"];

/**
 * Parse `--flag value` command-line arguments into an options object.
 *
 * @param {Array<string>} argv
 * @returns {{root: string, outDir: string, date: string, limit: (number|null)}}
 */
export function parseArguments(argv) {
  const options = { root: DEFAULT_SCIENCE_ROOT, outDir: DEFAULT_OUT_DIR, date: new Date().toISOString().slice(0, 10), limit: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--root") options.root = confinePath({ root: argv[++index] }).path;
    else if (flag === "--out-dir") options.outDir = confinePath({ root: argv[++index] }).path;
    else if (flag === "--date") options.date = argv[++index];
    else if (flag === "--limit") options.limit = Number(argv[++index]);
    else throw new Error(`unrecognized argument: ${flag}`);
  }
  return options;
}

/**
 * Walk `root` for Markdown carrier paths, excluding any candidate whose
 * repo-root-relative path is refused by `shouldExcludeCarrierPath`
 * (`node_modules`/`.git`/`dist`/`triage` segments are also pruned early,
 * as a directory-name exclude, so the walk never descends into them).
 *
 * @param {{root: string, repoRoot: string}} request
 * @returns {Promise<Array<string>>} sorted absolute Markdown file paths.
 */
export async function walkCandidatePaths({ root, repoRoot }) {
  const walk = await walkPosixPaths({ root, extensions: [".md"], excludes: EXCLUDED_DIRECTORY_NAMES });
  const found = walk.files
    .filter(({ kind }) => kind === "file")
    .map(({ path }) => `${walk.root}/${path}`)
    .filter((absolutePath) => !shouldExcludeCarrierPath(confinePath({ root: repoRoot, path: absolutePath }).relativePath));
  found.sort();
  return found;
}

/**
 * Read and assess every carrier under `root`, via the two house Markdown
 * reading services (`read-markdown-file-service`, then
 * `read-markdown-frontmatter-service`).
 *
 * @param {{root: string, repoRoot: string, limit?: (number|null)}} request
 * @returns {Promise<Array<object>>} assessed carrier rows, sorted by relativePath.
 */
export async function censusCarriers({ root, repoRoot, limit = null }) {
  const candidates = await walkCandidatePaths({ root, repoRoot });
  const scoped = typeof limit === "number" && Number.isFinite(limit) ? candidates.slice(0, limit) : candidates;
  const carriers = [];
  for (const absolutePath of scoped) {
    const relativePath = confinePath({ root: repoRoot, path: absolutePath }).relativePath;
    let rawText;
    try {
      rawText = await readMarkdownFile(absolutePath);
    } catch (error) {
      process.stderr.write(`skip (unreadable): ${relativePath}: ${error.message}\n`);
      continue;
    }
    let frontmatter;
    let body;
    try {
      ({ frontmatter, body } = readMarkdownFrontmatter(rawText, { frontmatterFormats: ["yaml", "toml"], absentFrontmatter: "null" }));
    } catch (error) {
      process.stderr.write(`skip (unparseable frontmatter): ${relativePath}: ${error.message}\n`);
      continue;
    }
    carriers.push(assessCarrier({ relativePath, frontmatter, body, rawText }));
  }
  carriers.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
  return carriers;
}

const TSV_COLUMNS = [
  "relativePath",
  "subsection",
  "authorsRaw",
  "authorsClass",
  "status",
  "type",
  "referencesMapSize",
  "hasProvenanceObject",
  "hasRecordedBy",
  "hasCollectedBy",
  "hasSourcePath",
  "ownerMarkerCount",
  "locatedMarkerCount",
  "leanCitationCount",
  "legacyCitationCount",
  "inlineCitationCount",
  "grade",
];

function tsvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/[\t\n\r]/gu, " ");
}

/**
 * Render assessed carrier rows as a tab-separated table, header first.
 *
 * @param {Array<object>} carriers
 * @returns {string}
 */
export function renderRowsTsv(carriers) {
  const lines = [TSV_COLUMNS.join("\t")];
  for (const carrier of carriers) lines.push(TSV_COLUMNS.map((column) => tsvCell(carrier[column])).join("\t"));
  return `${lines.join("\n")}\n`;
}

function printReport(record) {
  process.stdout.write(`total carriers: ${record.totalCarriers}\n`);
  process.stdout.write("grade counts:\n");
  for (const [grade, count] of Object.entries(record.gradeCounts)) process.stdout.write(`  ${grade}: ${count}\n`);
  process.stdout.write(`owner-attributed-unlocated carriers: ${record.unlocatedCarriers.length}\n`);
  process.stdout.write("grade table per subsection:\n");
  for (const [subsection, bucket] of Object.entries(record.bySubsection)) {
    const gradeSummary = Object.entries(bucket.gradeCounts).map(([grade, count]) => `${grade}=${count}`).join(", ");
    const ratio = bucket.ownerLocatedRatio === null ? "n/a" : bucket.ownerLocatedRatio.toFixed(2);
    process.stdout.write(`  ${subsection}: ${gradeSummary} (owner-located ratio ${ratio})\n`);
  }
  process.stdout.write("top five subsections by owner-attributed-unlocated count:\n");
  for (const entry of record.topSubsectionsByUnlocatedCount) process.stdout.write(`  ${entry.subsection}: ${entry.unlocatedCount}\n`);
}

/**
 * Run the census end to end: walk, assess, write the dated JSON record and
 * its sibling rows TSV, and print the summary report.
 *
 * @param {{root: string, outDir: string, date: string, limit?: (number|null), repoRoot?: string}} options
 * @returns {Promise<{record: object, jsonPath: string, tsvPath: string}>}
 */
export async function runCensus({ root, outDir, date, limit = null, repoRoot = REPO_ROOT }) {
  const carriers = await censusCarriers({ root, repoRoot, limit });
  const record = assembleRecord({ root: confinePath({ root: repoRoot, path: root }).relativePath, carriers });
  const basename = `${date}-science-carrier-provenance-census`;
  const jsonPath = `${outDir}/${basename}.json`;
  const tsvPath = `${outDir}/${basename}.rows.tsv`;
  await writeFileText(jsonPath, `${JSON.stringify(record, null, 2)}\n`);
  await writeFileText(tsvPath, renderRowsTsv(carriers));
  printReport(record);
  process.stdout.write(`wrote ${jsonPath}\n`);
  process.stdout.write(`wrote ${tsvPath}\n`);
  return { record, jsonPath, tsvPath };
}
// friction (provenance-engineering-services-section-node-import-migration, 2026-09-04):
// semantic-record-journal-service writes an append-only JSONL log under data/logs/, never an
// exact named path under data/records/ that other carriers already cite. Kept as a
// house-file-services writer (not raw node:fs) of these exact-path carriers until the journal
// grows that shape.

if (isMain(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  runCensus(options).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
