/**
 * @module screening
 * Domain semantics: systematic-review screening — a search-audit trail,
 * candidates deduplicated by DOI/normalized title, PRISMA-named
 * inclusion/exclusion decisions, and the PRISMA flow tally. Pure
 * data-in/data-out; no I/O, no network.
 */

import { bareDoi } from "./scholarly-literature.mjs";
import { isObjectRecord as isRecord } from "@red-cup-engineering/json-codec-service";

// trimmed non-empty string coercion, else undefined
function str(value) {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Fold a title to a dedupe-comparable form; only an exact fold match
 * merges two candidates, so a near-miss title is left unmerged.
 * @param {unknown} value
 * @returns {string|undefined}
 */
function normalizeTitle(value) {
  const s = str(value);
  if (s === undefined) return undefined;
  const folded = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
  return folded === "" ? undefined : folded;
}

/**
 * Build one row of the search-audit trail: which source was queried, with
 * what query, when, and how many results it reported.
 *
 * @typedef {Object} SearchRecord
 * @property {string} id - deterministic id linking candidates to this search
 * @property {string} source
 * @property {string} query
 * @property {string} date - ISO 8601 date string
 * @property {number} resultCount
 *
 * @param {{ source: string, query: string, date: string, resultCount: number }} fields
 * @returns {Readonly<SearchRecord>}
 * @throws {TypeError} when source, query, or date is missing/empty, or resultCount is not a non-negative integer
 */
export function makeSearchRecord({ source, query, date, resultCount } = {}) {
  const s = str(source);
  const q = str(query);
  const d = str(date);
  if (s === undefined) throw new TypeError("makeSearchRecord requires a non-empty source");
  if (q === undefined) throw new TypeError("makeSearchRecord requires a non-empty query");
  if (d === undefined) throw new TypeError("makeSearchRecord requires a non-empty date");
  if (!Number.isInteger(resultCount) || resultCount < 0) {
    throw new TypeError("makeSearchRecord requires a non-negative integer resultCount");
  }
  return Object.freeze({ id: `${s}::${d}::${q}`, source: s, query: q, date: d, resultCount });
}

/**
 * Compute the dedupe key for a CSL-JSON item: `doi:<lowercased bare DOI>`
 * when the item carries a DOI (case-insensitive), else
 * `title:<normalized title>` when it carries a title, else undefined.
 * @param {unknown} item
 * @returns {string|undefined}
 */
export function dedupeKeyForItem(item) {
  if (!isRecord(item)) return undefined;
  const doi = bareDoi(item.DOI);
  if (doi !== undefined) return `doi:${doi.toLowerCase()}`;
  const title = normalizeTitle(item.title);
  return title === undefined ? undefined : `title:${title}`;
}

/**
 * Build one raw candidate record: a CSL-JSON item tagged with the source
 * (and, when known, the search) that surfaced it, plus its dedupe key.
 *
 * @typedef {Object} CandidateRecord
 * @property {object} item - a CSL-JSON item
 * @property {string} source
 * @property {string} [searchId] - the SearchRecord.id that surfaced this candidate
 * @property {string} dedupeKey - `doi:<lowercased bare DOI>` or `title:<normalized title>`
 *
 * @param {{ item: object, source: string, searchId?: string }} fields
 * @returns {Readonly<CandidateRecord>}
 * @throws {TypeError} when item is not an object, source is missing/empty, or the item carries neither a DOI nor a title to key on
 */
export function makeCandidateRecord({ item, source, searchId } = {}) {
  if (!isRecord(item)) throw new TypeError("makeCandidateRecord requires a CSL-JSON item object");
  const s = str(source);
  if (s === undefined) throw new TypeError("makeCandidateRecord requires a non-empty source");
  const dedupeKey = dedupeKeyForItem(item);
  if (dedupeKey === undefined) {
    throw new TypeError("makeCandidateRecord: item carries neither a DOI nor a title to dedupe on");
  }
  const record = { item: Object.freeze({ ...item }), source: s, dedupeKey };
  const sid = str(searchId);
  if (sid !== undefined) record.searchId = sid;
  return Object.freeze(record);
}

/**
 * Collapse raw candidate records sharing a dedupe key into one deduplicated
 * candidate: same DOI (case-insensitive), or same normalized title when
 * neither record carries a DOI. The first-seen CSL-JSON item is kept; every
 * distinct source and search id that surfaced the candidate is recorded.
 * Candidates with no dedupeKey (or that are not records) are skipped.
 *
 * @typedef {Object} DeduplicatedCandidate
 * @property {object} item - the first-seen CSL-JSON item for this dedupe key
 * @property {string} dedupeKey
 * @property {ReadonlyArray<string>} sources - distinct sources that surfaced this candidate
 * @property {ReadonlyArray<string>} searchIds - distinct search ids that surfaced this candidate
 * @property {number} duplicateCount - how many raw candidate records collapsed into this one
 *
 * @param {ReadonlyArray<CandidateRecord>} candidates
 * @returns {ReadonlyArray<Readonly<DeduplicatedCandidate>>} in first-seen order
 * @throws {TypeError} when candidates is not an array
 */
export function dedupeCandidates(candidates) {
  if (!Array.isArray(candidates)) throw new TypeError("dedupeCandidates requires an array of candidate records");
  const byKey = new Map();
  for (const candidate of candidates) {
    if (!isRecord(candidate) || typeof candidate.dedupeKey !== "string") continue;
    const existing = byKey.get(candidate.dedupeKey);
    if (existing === undefined) {
      byKey.set(candidate.dedupeKey, {
        item: candidate.item,
        dedupeKey: candidate.dedupeKey,
        sources: new Set(candidate.source ? [candidate.source] : []),
        searchIds: new Set(candidate.searchId ? [candidate.searchId] : []),
        duplicateCount: 1,
      });
    } else {
      if (candidate.source) existing.sources.add(candidate.source);
      if (candidate.searchId) existing.searchIds.add(candidate.searchId);
      existing.duplicateCount += 1;
    }
  }
  return Object.freeze(
    Array.from(byKey.values(), (entry) =>
      Object.freeze({
        item: entry.item,
        dedupeKey: entry.dedupeKey,
        sources: Object.freeze(Array.from(entry.sources)),
        searchIds: Object.freeze(Array.from(entry.searchIds)),
        duplicateCount: entry.duplicateCount,
      })),
  );
}

/**
 * Apply named screening decisions to deduplicated candidates. A candidate
 * with no matching decision keeps status "pending"; when more than one
 * decision names the same dedupeKey, the last one given wins.
 *
 * @typedef {Object} ScreeningDecision
 * @property {string} dedupeKey - which deduplicated candidate this decides
 * @property {"include"|"exclude"} decision
 * @property {string} criterion - the named inclusion/exclusion criterion
 * @property {string} [note]
 *
 * @typedef {Object} ScreenedCandidate
 * @property {object} item
 * @property {string} dedupeKey
 * @property {ReadonlyArray<string>} sources
 * @property {ReadonlyArray<string>} searchIds
 * @property {number} duplicateCount
 * @property {"pending"|"included"|"excluded"} status
 * @property {string} [criterion]
 * @property {string} [note]
 *
 * @param {ReadonlyArray<DeduplicatedCandidate>} candidates
 * @param {ReadonlyArray<ScreeningDecision>} decisions
 * @returns {ReadonlyArray<Readonly<ScreenedCandidate>>}
 * @throws {TypeError} when candidates or decisions is not an array, or a decision lacks a dedupeKey, a valid "include"/"exclude" decision, or a named criterion
 */
export function applyScreening(candidates, decisions) {
  if (!Array.isArray(candidates)) throw new TypeError("applyScreening requires an array of deduplicated candidates");
  if (!Array.isArray(decisions)) throw new TypeError("applyScreening requires an array of decisions");
  const byKey = new Map();
  for (const decision of decisions) {
    if (!isRecord(decision)) throw new TypeError("applyScreening: each decision must be an object");
    const key = str(decision.dedupeKey);
    const outcome = decision.decision;
    if (key === undefined || (outcome !== "include" && outcome !== "exclude")) {
      throw new TypeError('applyScreening: each decision requires a dedupeKey and a decision of "include" or "exclude"');
    }
    const criterion = str(decision.criterion);
    if (criterion === undefined) {
      throw new TypeError("applyScreening: each decision requires a named criterion");
    }
    const entry = { decision: outcome, criterion };
    const note = str(decision.note);
    if (note !== undefined) entry.note = note;
    byKey.set(key, entry);
  }
  return Object.freeze(
    candidates.map((candidate) => {
      const decision = byKey.get(candidate.dedupeKey);
      const record = {
        item: candidate.item,
        dedupeKey: candidate.dedupeKey,
        sources: candidate.sources,
        searchIds: candidate.searchIds,
        duplicateCount: candidate.duplicateCount,
        status: decision === undefined ? "pending" : decision.decision === "include" ? "included" : "excluded",
      };
      if (decision?.criterion !== undefined) record.criterion = decision.criterion;
      if (decision?.note !== undefined) record.note = decision.note;
      return Object.freeze(record);
    }),
  );
}

/**
 * Tally the PRISMA flow-diagram counts for a screening ledger: records
 * identified, deduplicated, screened, excluded (by named criterion), and
 * included.
 *
 * @typedef {Object} ScreeningLedger
 * @property {ReadonlyArray<SearchRecord>} [searches]
 * @property {ReadonlyArray<CandidateRecord>} [candidates] - raw candidates, before dedup
 * @property {ReadonlyArray<ScreenedCandidate>} [screened] - deduplicated candidates with screening decisions applied
 *
 * @typedef {Object} PrismaCounts
 * @property {number} identified - raw candidate records across all searches, before dedup
 * @property {number} deduplicated - unique candidates remaining after dedup
 * @property {number} duplicatesRemoved - identified minus deduplicated
 * @property {number} screened - deduplicated candidates carrying a decision (included or excluded)
 * @property {Record<string, number>} excludedByCriterion
 * @property {number} excluded
 * @property {number} included
 * @property {number} pending
 *
 * @param {ScreeningLedger} ledger
 * @returns {Readonly<PrismaCounts>}
 * @throws {TypeError} when ledger is not an object
 */
export function prismaCounts(ledger) {
  if (!isRecord(ledger)) throw new TypeError("prismaCounts requires a ledger object");
  const rawCandidates = Array.isArray(ledger.candidates) ? ledger.candidates : [];
  const screened = Array.isArray(ledger.screened) ? ledger.screened : [];
  const excludedByCriterion = {};
  let included = 0;
  let excluded = 0;
  let pending = 0;
  for (const candidate of screened) {
    if (!isRecord(candidate)) continue;
    if (candidate.status === "included") {
      included += 1;
    } else if (candidate.status === "excluded") {
      excluded += 1;
      const criterion = str(candidate.criterion) ?? "unspecified";
      excludedByCriterion[criterion] = (excludedByCriterion[criterion] ?? 0) + 1;
    } else {
      pending += 1;
    }
  }
  return Object.freeze({
    identified: rawCandidates.length,
    deduplicated: screened.length,
    duplicatesRemoved: rawCandidates.length - screened.length,
    screened: included + excluded,
    excludedByCriterion: Object.freeze(excludedByCriterion),
    excluded,
    included,
    pending,
  });
}

/**
 * Extract the CSL-JSON items of every included candidate in a screening
 * ledger, in ledger order — ready to drop into a paper's references
 * frontmatter.
 * @param {{ screened?: ReadonlyArray<ScreenedCandidate> }} ledger
 * @returns {ReadonlyArray<object>} CSL-JSON items
 * @throws {TypeError} when ledger is not an object
 */
export function includedCslItems(ledger) {
  if (!isRecord(ledger)) throw new TypeError("includedCslItems requires a ledger object");
  const screened = Array.isArray(ledger.screened) ? ledger.screened : [];
  return Object.freeze(
    screened.filter((candidate) => isRecord(candidate) && candidate.status === "included").map((candidate) => candidate.item),
  );
}
