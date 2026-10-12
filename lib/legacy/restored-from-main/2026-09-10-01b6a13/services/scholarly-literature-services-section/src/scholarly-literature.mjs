/**
 * @module scholarly-literature
 * Domain semantics: normalizes external scholarly-work records (OpenAlex,
 * PubMed E-utilities, CrossRef) into CSL-JSON items, following the house
 * CSL field conventions (metroplat's codecs/text/csl) without importing
 * across strata.
 */

import { isObjectRecord as isRecord } from "@red-cup-engineering/json-codec-service";

const CSL_TYPES = new Set([
  "article-journal", "article-magazine", "article-newspaper", "book", "chapter",
  "paper-conference", "report", "webpage", "thesis", "manuscript", "dataset",
  "entry-encyclopedia", "entry-dictionary", "post", "post-weblog", "speech",
  "document", "broadcast", "interview", "legislation", "patent", "review",
  "software", "standard", "figure", "graphic", "map", "song", "motion_picture",
]);

const OPENALEX_TYPE_ALIASES = Object.freeze({
  article: "article-journal",
  "journal-article": "article-journal",
  "book-chapter": "chapter",
  "posted-content": "manuscript",
  preprint: "manuscript",
  dissertation: "thesis",
  "proceedings-article": "paper-conference",
  "reference-entry": "entry-encyclopedia",
});

const PUBMED_TYPE_ALIASES = Object.freeze({
  "journal article": "article-journal",
  "review": "review",
  "letter": "article-journal",
  "case reports": "article-journal",
  "clinical trial": "article-journal",
  "preprint": "manuscript",
  "comment": "article-journal",
});

const CROSSREF_TYPE_ALIASES = Object.freeze({
  "journal-article": "article-journal",
  "proceedings-article": "paper-conference",
  "book-chapter": "chapter",
  book: "book",
  monograph: "book",
  dataset: "dataset",
  report: "report",
  "posted-content": "manuscript",
  dissertation: "thesis",
  "reference-entry": "entry-encyclopedia",
  "journal-issue": "document",
  standard: "standard",
});

const MONTH_ABBREVIATIONS = Object.freeze({
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
});

/**
 * @param {unknown} value
 * @returns {value is Readonly<Record<string, unknown>>}
 */
/**
 * @param {unknown} value
 * @returns {string|undefined} trimmed non-empty string, else undefined
 */
function str(value) {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Resolve a CSL type against an alias table, falling back to "document".
 * @param {unknown} rawType
 * @param {Readonly<Record<string, string>>} aliases
 * @returns {string} a member of the CSL type vocabulary
 */
function toCslType(rawType, aliases) {
  const value = str(rawType)?.toLowerCase();
  if (value === undefined) return "document";
  if (CSL_TYPES.has(value)) return value;
  return aliases[value] ?? "document";
}

/**
 * Normalize one author into a CSL-JSON name: `{ literal }` when only a
 * display string is available, `{ family, given }` when both parts are
 * known.
 * @param {{ literal?: string, family?: string, given?: string }} parts
 * @returns {{family?: string, given?: string, literal?: string}|undefined}
 */
export function cslName({ literal, family, given } = {}) {
  const f = str(family);
  const g = str(given);
  if (f !== undefined || g !== undefined) {
    const name = {};
    if (f !== undefined) name.family = f;
    if (g !== undefined) name.given = g;
    return Object.freeze(name);
  }
  const l = str(literal);
  return l === undefined ? undefined : Object.freeze({ literal: l });
}

/**
 * @param {ReadonlyArray<unknown>} names
 * @returns {ReadonlyArray<{family?: string, given?: string, literal?: string}>|undefined}
 */
function cslNames(names) {
  if (!Array.isArray(names)) return undefined;
  const out = names.map((n) => (typeof n === "string" ? cslName({ literal: n }) : isRecord(n) ? cslName(n) : undefined))
    .filter((n) => n !== undefined);
  return out.length > 0 ? Object.freeze(out) : undefined;
}

/**
 * Build a CSL-JSON date from explicit numeric parts.
 * @param {number} year
 * @param {number} [month]
 * @param {number} [day]
 * @returns {{"date-parts": ReadonlyArray<ReadonlyArray<number>>}|undefined}
 */
export function cslDateFromParts(year, month, day) {
  if (!Number.isInteger(year)) return undefined;
  const parts = [year];
  if (Number.isInteger(month)) parts.push(month);
  if (Number.isInteger(day)) parts.push(day);
  return Object.freeze({ "date-parts": Object.freeze([Object.freeze(parts)]) });
}

/**
 * Parse an ISO-like date string ("YYYY-MM-DD", "YYYY-MM", or "YYYY") into
 * a CSL-JSON date.
 * @param {unknown} value
 * @returns {{"date-parts": ReadonlyArray<ReadonlyArray<number>>}|undefined}
 */
export function cslDateFromIsoString(value) {
  const s = str(value);
  if (s === undefined) return undefined;
  const match = s.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/u);
  if (match === null) return undefined;
  return cslDateFromParts(Number(match[1]), match[2] ? Number(match[2]) : undefined, match[3] ? Number(match[3]) : undefined);
}

/**
 * Parse a PubMed-style date string ("2026 Sep 1", "2026 Sep", "2026") into
 * a CSL-JSON date.
 * @param {unknown} value
 * @returns {{"date-parts": ReadonlyArray<ReadonlyArray<number>>}|undefined}
 */
export function cslDateFromPubmedString(value) {
  const s = str(value);
  if (s === undefined) return undefined;
  const match = s.match(/^(\d{4})(?:\s+([A-Za-z]{3})(?:\s+(\d{1,2}))?)?/u);
  if (match === null) return undefined;
  const month = match[2] ? MONTH_ABBREVIATIONS[match[2].toLowerCase()] : undefined;
  return cslDateFromParts(Number(match[1]), month, match[3] ? Number(match[3]) : undefined);
}

/**
 * Build a CSL-JSON date from a CrossRef-shaped `date-parts` array (an array
 * of `[year, month?, day?]` tuples; only the first tuple is used).
 * @param {unknown} dateParts
 * @returns {{"date-parts": ReadonlyArray<ReadonlyArray<number>>}|undefined}
 */
export function cslDateFromDateParts(dateParts) {
  if (!Array.isArray(dateParts) || dateParts.length === 0 || !Array.isArray(dateParts[0])) return undefined;
  const [year, month, day] = dateParts[0];
  return cslDateFromParts(year, month, day);
}

/**
 * Strip a DOI down to its bare `10.xxxx/yyyy` form, whatever prefix
 * (`https://doi.org/`, `doi:`) it arrived with.
 * @param {unknown} value
 * @returns {string|undefined}
 */
export function bareDoi(value) {
  const s = str(value);
  if (s === undefined) return undefined;
  return s.replace(/^https?:\/\/(dx\.)?doi\.org\//iu, "").replace(/^doi:/iu, "");
}

/**
 * Normalize one OpenAlex work object (from `/works` search results or a
 * single `/works/{id}` fetch) to a CSL-JSON item.
 * @param {Readonly<Record<string, unknown>>} work
 * @returns {object} a CSL-JSON item
 * @throws {TypeError} when work is not a record, or carries neither an id nor a title
 */
export function openAlexWorkToCsl(work) {
  if (!isRecord(work)) throw new TypeError("openAlexWorkToCsl requires a work object");
  const title = str(work.title) ?? str(work.display_name);
  const id = str(work.id);
  if (title === undefined && id === undefined) {
    throw new TypeError("openAlexWorkToCsl: work carries neither an id nor a title");
  }
  const location = isRecord(work.primary_location) ? work.primary_location : {};
  const source = isRecord(location.source) ? location.source : {};
  const biblio = isRecord(work.biblio) ? work.biblio : {};
  const authorships = Array.isArray(work.authorships) ? work.authorships : [];
  const doi = bareDoi(work.doi);
  const page = str(biblio.first_page) !== undefined
    ? [str(biblio.first_page), str(biblio.last_page)].filter((p) => p !== undefined).join("-")
    : undefined;

  const item = {
    id: id !== undefined ? id.replace(/^https:\/\/openalex\.org\//iu, "") : undefined,
    type: toCslType(work.type, OPENALEX_TYPE_ALIASES),
    title,
    author: cslNames(authorships.map((a) => isRecord(a) && isRecord(a.author) ? a.author.display_name : undefined)),
    "container-title": str(source.display_name),
    publisher: str(source.host_organization_name),
    volume: str(biblio.volume),
    issue: str(biblio.issue),
    page,
    issued: cslDateFromIsoString(work.publication_date) ?? cslDateFromParts(work.publication_year),
    DOI: doi,
    URL: str(location.landing_page_url) ?? (doi !== undefined ? `https://doi.org/${doi}` : undefined),
  };
  return Object.freeze(stripUndefined(item));
}

/**
 * Normalize one PubMed E-utilities `esummary` result record (one entry
 * under `result.<uid>`) to a CSL-JSON item.
 * @param {Readonly<Record<string, unknown>>} summary
 * @returns {object} a CSL-JSON item
 * @throws {TypeError} when summary is not a record, or carries no uid
 */
export function pubmedSummaryToCsl(summary) {
  if (!isRecord(summary)) throw new TypeError("pubmedSummaryToCsl requires a summary object");
  const uid = str(summary.uid);
  if (uid === undefined) throw new TypeError("pubmedSummaryToCsl: summary carries no uid");
  const authors = Array.isArray(summary.authors) ? summary.authors : [];
  const articleIds = Array.isArray(summary.articleids) ? summary.articleids : [];
  const doi = str(articleIds.find((a) => isRecord(a) && a.idtype === "doi")?.value);
  const pubtype = Array.isArray(summary.pubtype) ? summary.pubtype[0] : undefined;

  const item = {
    id: uid,
    type: toCslType(pubtype, PUBMED_TYPE_ALIASES),
    title: str(summary.title),
    author: cslNames(authors.map((a) => isRecord(a) ? a.name : undefined)),
    "container-title": str(summary.fulljournalname) ?? str(summary.source),
    volume: str(summary.volume),
    issue: str(summary.issue),
    page: str(summary.pages),
    issued: cslDateFromPubmedString(summary.pubdate),
    DOI: doi,
    URL: `https://pubmed.ncbi.nlm.nih.gov/${uid}`,
    note: `PMID: ${uid}`,
  };
  return Object.freeze(stripUndefined(item));
}

/**
 * Normalize one CrossRef work object (the `message` field of a
 * `/works/{doi}` response) to a CSL-JSON item. CrossRef's own record is
 * already CSL-shaped; this flattens the array-wrapped `title` and
 * `container-title` fields CrossRef uses.
 * @param {Readonly<Record<string, unknown>>} message
 * @returns {object} a CSL-JSON item
 * @throws {TypeError} when message is not a record, or carries no DOI
 */
export function crossrefWorkToCsl(message) {
  if (!isRecord(message)) throw new TypeError("crossrefWorkToCsl requires a work object");
  const doi = str(message.DOI);
  if (doi === undefined) throw new TypeError("crossrefWorkToCsl: work carries no DOI");
  const authors = Array.isArray(message.author) ? message.author : [];

  const item = {
    id: doi,
    type: toCslType(message.type, CROSSREF_TYPE_ALIASES),
    title: str(Array.isArray(message.title) ? message.title[0] : message.title),
    author: cslNames(authors.map((a) => isRecord(a) ? a : undefined)),
    "container-title": str(Array.isArray(message["container-title"]) ? message["container-title"][0] : message["container-title"]),
    publisher: str(message.publisher),
    volume: str(message.volume),
    issue: str(message.issue),
    page: str(message.page),
    issued: cslDateFromDateParts(message.issued?.["date-parts"]),
    DOI: doi,
    URL: str(message.URL) ?? `https://doi.org/${doi}`,
  };
  return Object.freeze(stripUndefined(item));
}

/**
 * @param {Record<string, unknown>} item
 * @returns {Record<string, unknown>} a shallow copy with undefined-valued keys removed
 */
function stripUndefined(item) {
  const out = {};
  for (const [key, value] of Object.entries(item)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
