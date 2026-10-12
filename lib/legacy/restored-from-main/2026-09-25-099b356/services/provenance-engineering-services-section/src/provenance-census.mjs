import { constituteContentAddressedEntity } from "@red-cup-engineering/eavt";

const AGENT_AUTHOR_PATTERN = /^(claude\b.*|codex|gpt-.*)$/iu;

const MARKER_PHRASES = [
  "owner-stated",
  "owner-ruled",
  "owner verbatim",
  "owner:",
  "founder-ruled",
  "owner movement",
  "emsenn (",
  "(owner,",
  "the owner said",
];

const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/u;
const TRANSCRIPT_LOCATOR = /rollout-[\w.-]+\.jsonl|~\/\.claude\/projects|~\/\.codex\/sessions|\bsession\s+[0-9a-f]{6,}\b/iu;
const PERSONAL_LOG_LOCATOR = /emsenn-services-section\/content\/text\/logs/u;

const LEAN_PATH = /[\w./-]*\.lean\b/giu;
const LEAN_MODULE = /\bObsmetrologia(?:\.[A-Za-z0-9_]+)+/gu;
const LEGACY_CITATION = /lib\/legacy/gu;
const BRACKET_CITATION = /\[@[^\]]*\]/gu;
const CITEKEY_TOKEN = /@[a-z][a-z0-9-]*/giu;

const EXCLUDED_SEGMENTS = new Set(["node_modules", ".git", "dist", "triage"]);
const SUBSECTION_MARKER = "science-services-section/services/";

function escapeRegExp(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function buildMarkerPattern(phrase) {
  const startsWithWord = /^[A-Za-z]/u.test(phrase);
  const endsWithWord = /[A-Za-z0-9]$/u.test(phrase);
  const prefix = startsWithWord ? "(?<![A-Za-z0-9_])" : "";
  const suffix = endsWithWord ? "(?![A-Za-z0-9_])" : "";
  return new RegExp(`${prefix}${escapeRegExp(phrase)}${suffix}`, "giu");
}

const MARKER_PATTERNS = MARKER_PHRASES.map((phrase) => Object.freeze({ phrase, pattern: buildMarkerPattern(phrase) }));

/**
 * Split Markdown text into paragraph blocks (contiguous non-blank lines),
 * each carrying its character offsets in the source text.
 *
 * @param {string} text - Markdown text.
 * @returns {Array<{start: number, end: number, text: string}>} in source order.
 */
function splitParagraphs(text) {
  const paragraphs = [];
  const boundary = /\n[ \t]*\n+/gu;
  let lastEnd = 0;
  let match = boundary.exec(text);
  while (match !== null) {
    paragraphs.push({ start: lastEnd, end: match.index, text: text.slice(lastEnd, match.index) });
    lastEnd = boundary.lastIndex;
    match = boundary.exec(text);
  }
  paragraphs.push({ start: lastEnd, end: text.length, text: text.slice(lastEnd) });
  return paragraphs;
}

function paragraphContaining(paragraphs, offset) {
  return paragraphs.find((paragraph) => offset >= paragraph.start && offset <= paragraph.end) ?? paragraphs[paragraphs.length - 1];
}

function hasLocator(paragraphText) {
  return ISO_DATE.test(paragraphText) || TRANSCRIPT_LOCATOR.test(paragraphText) || PERSONAL_LOG_LOCATOR.test(paragraphText);
}

/**
 * Normalize a frontmatter `authors` value into a provenance authors class.
 *
 * `"emsenn"` only when the value is exactly a single "emsenn" entry (string
 * or one-element array); `"agent"` when every entry names an agent model
 * (`claude-*`, `codex`, `gpt-*`, case-insensitive); `"absent"` when there are
 * no entries; `"other"` otherwise (mixed, unrecognized, or human-but-not-owner
 * names).
 *
 * @param {(string|Array<string>|null|undefined)} rawAuthors
 * @returns {("emsenn"|"agent"|"other"|"absent")}
 */
export function classifyAuthors(rawAuthors) {
  const entries = rawAuthors === null || rawAuthors === undefined
    ? []
    : Array.isArray(rawAuthors)
      ? rawAuthors
      : [rawAuthors];
  const names = entries.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
  if (names.length === 0) return "absent";
  if (names.length === 1 && names[0].trim().toLowerCase() === "emsenn") return "emsenn";
  if (names.every((name) => AGENT_AUTHOR_PATTERN.test(name.trim()))) return "agent";
  return "other";
}

/**
 * Find every owner-attribution marker occurrence in a carrier's Markdown
 * body, each paired with the paragraph it occurs in and whether that
 * paragraph also carries a locator (an ISO date, a transcript path, or a
 * personal-log path under `emsenn-services-section/content/text/logs`).
 *
 * @param {string} text - Markdown body text (frontmatter already stripped).
 * @returns {Array<{marker: string, paragraph: string, located: boolean}>} in occurrence order.
 */
export function ownerMarkers(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  const paragraphs = splitParagraphs(text);
  const occurrences = [];
  for (const { phrase, pattern } of MARKER_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match !== null) {
      const paragraph = paragraphContaining(paragraphs, match.index);
      occurrences.push(Object.freeze({ marker: phrase, paragraph: paragraph.text, located: hasLocator(paragraph.text) }));
      match = pattern.exec(text);
    }
  }
  return occurrences;
}

/**
 * Count Lean module citations in text: paths ending `.lean` and
 * `Obsmetrologia.<Module>` dotted identifiers.
 *
 * @param {string} text
 * @returns {number}
 */
export function countLeanCitations(text) {
  if (typeof text !== "string") return 0;
  const paths = text.match(LEAN_PATH) ?? [];
  const modules = text.match(LEAN_MODULE) ?? [];
  return paths.length + modules.length;
}

/**
 * Count citations into `lib/legacy` found in text.
 *
 * @param {string} text
 * @returns {number}
 */
export function countLegacyCitations(text) {
  if (typeof text !== "string") return 0;
  return (text.match(LEGACY_CITATION) ?? []).length;
}

/**
 * Count inline `[@citekey]` bracket citations in text, one per key named
 * inside a bracket group (`[@a; @b]` counts as two).
 *
 * @param {string} text
 * @returns {number}
 */
export function countInlineCitations(text) {
  if (typeof text !== "string") return 0;
  let total = 0;
  for (const bracket of text.matchAll(BRACKET_CITATION)) {
    total += (bracket[0].match(CITEKEY_TOKEN) ?? []).length;
  }
  return total;
}

/**
 * Read a frontmatter `references:` map's entry count, or 0 when absent or
 * malformed.
 *
 * @param {object} frontmatter
 * @returns {number}
 */
export function referencesMapSize(frontmatter) {
  const references = frontmatter?.references;
  if (references === undefined || references === null || typeof references !== "object" || Array.isArray(references)) return 0;
  return Object.keys(references).length;
}

/**
 * Read a frontmatter `x-provenance` or `collection-provenance` object, or
 * null when neither is present as an object.
 *
 * @param {object} frontmatter
 * @returns {(object|null)}
 */
export function extractProvenanceObject(frontmatter) {
  const candidate = frontmatter?.["x-provenance"] ?? frontmatter?.["collection-provenance"];
  if (candidate === undefined || candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate;
}

/**
 * Decide whether a corpus-relative path is excluded from the census: any
 * `lib/legacy` or `lib/obsmetrologia/docs` subtree, or a `node_modules`,
 * `.git`, `dist`, or `triage` path segment.
 *
 * @param {string} relativePath
 * @returns {boolean}
 */
export function shouldExcludeCarrierPath(relativePath) {
  if (relativePath.includes("lib/legacy")) return true;
  if (relativePath.includes("lib/obsmetrologia/docs")) return true;
  return relativePath.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

/**
 * Derive a carrier's top-level science subsection: the path segment right
 * after `science-services-section/services/`, or `"science-root"` for a
 * carrier directly under the section (not under `services/`).
 *
 * @param {string} relativePath
 * @returns {string}
 */
export function deriveSubsection(relativePath) {
  const index = relativePath.indexOf(SUBSECTION_MARKER);
  if (index === -1) return "science-root";
  const rest = relativePath.slice(index + SUBSECTION_MARKER.length);
  const segment = rest.split("/")[0];
  return segment && segment.length > 0 ? segment : "science-root";
}

/**
 * Grade a carrier from its computed provenance facts.
 *
 * Priority order: `owner-authored` (exact-emsenn authors, or a personal-log
 * entry under `emsenn-services-section`) beats `owner-attributed-located`
 * (an owner marker with a locator) beats `owner-attributed-unlocated` (an
 * owner marker, none located) beats `agent-cited` (agent-or-absent authors
 * with a references map, Lean citation, or inline citation) beats the
 * `agent-uncited` default.
 *
 * @param {{authorsClass: string, isEmsennPersonalLog?: boolean, markerCount?: number, locatedMarkerCount?: number, hasReferencesMap?: boolean, leanCitationCount?: number, inlineCitationCount?: number}} facts
 * @returns {("owner-authored"|"owner-attributed-located"|"owner-attributed-unlocated"|"agent-cited"|"agent-uncited")}
 */
export function gradeOf({
  authorsClass,
  isEmsennPersonalLog = false,
  markerCount = 0,
  locatedMarkerCount = 0,
  hasReferencesMap = false,
  leanCitationCount = 0,
  inlineCitationCount = 0,
}) {
  if (authorsClass === "emsenn" || isEmsennPersonalLog) return "owner-authored";
  if (markerCount > 0) return locatedMarkerCount > 0 ? "owner-attributed-located" : "owner-attributed-unlocated";
  if ((authorsClass === "agent" || authorsClass === "absent") && (hasReferencesMap || leanCitationCount > 0 || inlineCitationCount > 0)) {
    return "agent-cited";
  }
  return "agent-uncited";
}

/**
 * Assess one carrier: compute its provenance facts and grade from its
 * frontmatter, body, and raw text.
 *
 * @param {{relativePath: string, frontmatter: object, body: string, rawText: string}} carrier
 * @returns {object} frozen assessed-carrier row.
 */
export function assessCarrier({ relativePath, frontmatter, body, rawText }) {
  const authorsClass = classifyAuthors(frontmatter?.authors);
  const type = typeof frontmatter?.type === "string" ? frontmatter.type : null;
  const status = typeof frontmatter?.status === "string" ? frontmatter.status : null;
  const isEmsennPersonalLog = type === "personal-log-entry" && relativePath.includes("emsenn-services-section");
  const markers = ownerMarkers(body ?? "");
  const locatedMarkerCount = markers.filter((marker) => marker.located).length;
  const referencesSize = referencesMapSize(frontmatter);
  const provenanceObject = extractProvenanceObject(frontmatter);
  const text = typeof rawText === "string" ? rawText : "";
  const leanCitationCount = countLeanCitations(text);
  const legacyCitationCount = countLegacyCitations(text);
  const inlineCitationCount = countInlineCitations(text);
  const grade = gradeOf({
    authorsClass,
    isEmsennPersonalLog,
    markerCount: markers.length,
    locatedMarkerCount,
    hasReferencesMap: referencesSize > 0,
    leanCitationCount,
    inlineCitationCount,
  });
  return Object.freeze({
    relativePath,
    subsection: deriveSubsection(relativePath),
    authorsRaw: frontmatter?.authors ?? null,
    authorsClass,
    status,
    type,
    referencesMapSize: referencesSize,
    hasProvenanceObject: provenanceObject !== null,
    hasRecordedBy: Boolean(provenanceObject?.["recorded-by"]),
    hasCollectedBy: Boolean(provenanceObject?.["collected-by"]),
    hasSourcePath: Boolean(provenanceObject?.["source-path"]),
    ownerMarkerCount: markers.length,
    locatedMarkerCount,
    leanCitationCount,
    legacyCitationCount,
    inlineCitationCount,
    grade,
  });
}

function comparePaths(a, b) {
  return a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0;
}

/**
 * Aggregate assessed carriers into grade counts overall and per subsection,
 * the owner-attributed-unlocated inventory, and the top-ten most-marked
 * unlocated carriers.
 *
 * @param {Array<object>} carriers - rows produced by `assessCarrier`.
 * @returns {object} frozen summary.
 */
export function summarize(carriers) {
  const gradeCounts = {};
  const bySubsection = {};
  for (const carrier of carriers) {
    gradeCounts[carrier.grade] = (gradeCounts[carrier.grade] ?? 0) + 1;
    const bucket = bySubsection[carrier.subsection] ?? (bySubsection[carrier.subsection] = { gradeCounts: {}, ownerLocatedCount: 0, ownerAttributedCount: 0 });
    bucket.gradeCounts[carrier.grade] = (bucket.gradeCounts[carrier.grade] ?? 0) + 1;
    if (carrier.grade === "owner-attributed-located") {
      bucket.ownerLocatedCount += 1;
      bucket.ownerAttributedCount += 1;
    } else if (carrier.grade === "owner-attributed-unlocated") {
      bucket.ownerAttributedCount += 1;
    }
  }
  for (const bucket of Object.values(bySubsection)) {
    bucket.ownerLocatedRatio = bucket.ownerAttributedCount === 0 ? null : bucket.ownerLocatedCount / bucket.ownerAttributedCount;
  }
  const unlocated = carriers.filter((carrier) => carrier.grade === "owner-attributed-unlocated");
  const unlocatedCarriers = unlocated.map((carrier) => carrier.relativePath).sort();
  const topUnlocatedByMarkerCount = unlocated
    .slice()
    .sort((a, b) => b.ownerMarkerCount - a.ownerMarkerCount || comparePaths(a, b))
    .slice(0, 10)
    .map((carrier) => ({ relativePath: carrier.relativePath, ownerMarkerCount: carrier.ownerMarkerCount }));
  const topSubsectionsByUnlocatedCount = Object.entries(bySubsection)
    .map(([subsection, bucket]) => ({ subsection, unlocatedCount: bucket.gradeCounts["owner-attributed-unlocated"] ?? 0 }))
    .sort((a, b) => b.unlocatedCount - a.unlocatedCount || (a.subsection < b.subsection ? -1 : 1))
    .slice(0, 5);
  return Object.freeze({
    totalCarriers: carriers.length,
    gradeCounts,
    bySubsection,
    unlocatedCarriers,
    topUnlocatedByMarkerCount,
    topSubsectionsByUnlocatedCount,
  });
}

/**
 * Assemble the dated census record: the corpus summary plus a `checkedAt`
 * timestamp and the scanned `root`. Deterministic given the same carriers
 * and `checkedAt` — every other field is a pure fold over `carriers`.
 *
 * @param {{root: string, carriers: Array<object>, checkedAt?: string}} request
 * @returns {object} frozen record.
 */
export function assembleRecord({ root, carriers, checkedAt = new Date().toISOString() }) {
  const summary = summarize(carriers);
  return Object.freeze({ checkedAt, root, ...summary });
}

// === eavt relation (relate-set-of-carrier-provenance-rows.mjs's pure half) ====================
//
// The census JSON record (assembleRecord's output) is an aggregate fold; per-carrier detail lives
// only in the sibling rows TSV that scripts/census-set-of-carrier-provenance.mjs writes beside it
// (TSV_COLUMNS there, renderRowsTsv's inverse here). This section reads that TSV back into rows
// and relates each one into eavt facts -- no I/O, callers pass in the bytes/path and do the
// appendEavt writes.

const TSV_NUMBER_COLUMNS = new Set([
  "referencesMapSize",
  "ownerMarkerCount",
  "locatedMarkerCount",
  "leanCitationCount",
  "legacyCitationCount",
  "inlineCitationCount",
]);
const TSV_BOOLEAN_COLUMNS = new Set(["hasProvenanceObject", "hasRecordedBy", "hasCollectedBy", "hasSourcePath"]);
const TSV_JSON_COLUMNS = new Set(["authorsRaw"]);

function parseTsvCell(column, raw) {
  if (TSV_NUMBER_COLUMNS.has(column)) return raw === "" ? 0 : Number(raw);
  if (TSV_BOOLEAN_COLUMNS.has(column)) return raw === "true";
  if (TSV_JSON_COLUMNS.has(column)) {
    if (raw === "") return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw === "" ? null : raw;
}

/**
 * Parse a provenance-census rows TSV (`renderRowsTsv`'s inverse, in
 * `scripts/census-set-of-carrier-provenance.mjs`) back into row objects,
 * typing each cell by its own column (`*Count`/`*Size` to number,
 * `has*` to boolean, `authorsRaw` best-effort JSON, everything else a
 * string or `null` when the cell was empty). Column order is read from
 * the header line, not assumed.
 *
 * @param {string} text - The TSV file's full text, header row first.
 * @returns {Array<object>} One object per data row, in file order.
 */
export function parseProvenanceRowsTsv(text) {
  const lines = String(text).split(/\r?\n/u).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const [header, ...dataLines] = lines;
  const columns = header.split("\t");
  return dataLines.map((line) => {
    const cells = line.split("\t");
    const row = {};
    columns.forEach((column, index) => {
      row[column] = parseTsvCell(column, cells[index] ?? "");
    });
    return row;
  });
}

/**
 * The sibling rows-TSV path for a census JSON record path, per
 * `runCensus`'s own `${basename}.json` / `${basename}.rows.tsv` pairing.
 *
 * @param {string} censusPath
 * @returns {string}
 * @throws {Error} When `censusPath` does not end in `.json`.
 */
export function deriveRowsTsvPath(censusPath) {
  if (typeof censusPath !== "string" || !censusPath.endsWith(".json")) {
    throw new Error(`deriveRowsTsvPath: census path must end in .json, got ${JSON.stringify(censusPath)}`);
  }
  return `${censusPath.slice(0, -".json".length)}.rows.tsv`;
}

/** Carrier-row fields carried onto eavt attributes, TSV column name to eavt predicate name. */
const CARRIER_ATTRIBUTE_PREDICATES = [
  ["relativePath", "path"],
  ["grade", "provenance-grade"],
  ["subsection", "section"],
  ["authorsRaw", "authors"],
  ["authorsClass", "authors-class"],
  ["status", "status"],
  ["type", "type"],
  ["referencesMapSize", "references-map-size"],
  ["hasProvenanceObject", "has-provenance-object"],
  ["hasRecordedBy", "has-recorded-by"],
  ["hasCollectedBy", "has-collected-by"],
  ["hasSourcePath", "has-source-path"],
  ["ownerMarkerCount", "owner-marker-count"],
  ["locatedMarkerCount", "located-marker-count"],
  ["leanCitationCount", "lean-citation-count"],
  ["legacyCitationCount", "legacy-citation-count"],
  ["inlineCitationCount", "inline-citation-count"],
];

/**
 * The eavt rows for one census-graded carrier: a genesis row constituting
 * its `science-carrier:<digest>` entity (kind `"science-carrier"`,
 * attributes `{path}`, per eavt's own `constituteEntity` law -- the same
 * convention `obsmetrological-services-section`'s `census-admission.mjs`
 * uses for its `obsmetrologia-theorem` entities), plus one row per
 * populated carrier fact (`CARRIER_ATTRIBUTE_PREDICATES`), skipping only
 * facts the TSV carried as `null`.
 *
 * @param {object} carrier - One row parsed by `parseProvenanceRowsTsv`.
 * @param {string} t - The census date (eavt's transaction/witness coordinate).
 * @returns {object[]} eavt rows, genesis row first.
 * @throws {TypeError} When `carrier.relativePath` is not a non-empty string.
 */
export function buildCarrierRows(carrier, t) {
  if (typeof carrier?.relativePath !== "string" || carrier.relativePath.length === 0) {
    throw new TypeError("buildCarrierRows: carrier.relativePath must be a non-empty string");
  }
  const { address, genesisRow } = constituteContentAddressedEntity({
    kind: "science-carrier",
    attributes: { path: carrier.relativePath },
    t,
  });
  const rows = [genesisRow];
  for (const [field, predicate] of CARRIER_ATTRIBUTE_PREDICATES) {
    const value = carrier[field];
    if (value === null || value === undefined) continue;
    rows.push({ e: address, a: predicate, v: value, t });
  }
  return rows;
}
