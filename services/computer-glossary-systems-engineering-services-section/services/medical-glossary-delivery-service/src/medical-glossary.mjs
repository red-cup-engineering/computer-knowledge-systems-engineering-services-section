import { createGlossaryIndexReader } from "@red-cup-engineering/term-engineering-services-section/glossary-index";
import index from "../data/records/glossary-index-records/glossary-index.json" with { type: "json" };

/**
 * The medical division's glossary, bound over the term owner's generic index reader. This
 * module carries no glossary logic of its own: every recognition, projection, resolution,
 * neighborhood, and search rule is the term owner's; this file only binds that reader to this
 * division's own derived data.
 */
const reader = createGlossaryIndexReader(index);

/**
 * A query's `limit`, when present, coerced from a URL query string and checked against the
 * offer's declared range.
 * @param {string|number|undefined} limit
 * @returns {number|undefined}
 * @throws {RangeError} When `limit` is present but not an integer from 1 to 100.
 */
function normalizedLimit(limit) {
  if (limit === undefined) return undefined;
  const numeric = typeof limit === "string" ? Number(limit) : limit;
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) throw new RangeError("limit must be an integer between 1 and 100");
  return numeric;
}

/**
 * Validate a medical term identity's syntax, delegating to the term owner's reader (which
 * throws `TypeError` on a non-kebab-case identity). Used as this offer's `validate` binding so
 * the market refuses a malformed identity (422) before any payment challenge.
 * @param {string} identity
 * @returns {string} `identity`, unchanged.
 * @throws {TypeError} When `identity` is not a kebab-case carrier identity.
 */
export function validateMedicalTermIdentity(identity) {
  reader.resolve(identity);
  return identity;
}

/**
 * Validate a medical glossary search request: `{q, limit?}` (the market's query object) with a
 * nonempty `q` and, when present, a `limit` from 1 to 100.
 * @param {{q?: unknown, limit?: unknown}} query
 * @returns {{q: string, limit?: number}} `query`, unchanged.
 * @throws {TypeError} When `query` is not an object or `q` is not nonempty text.
 * @throws {RangeError} When `limit` is present but out of range.
 */
export function validateMedicalGlossarySearch(query) {
  if (query === null || typeof query !== "object" || Array.isArray(query)) throw new TypeError("query must be an object with q and an optional limit");
  if (typeof query.q !== "string" || query.q.trim() === "") throw new TypeError("query.q must be nonempty text");
  normalizedLimit(query.limit);
  return query;
}

/**
 * Resolve one medical term by identity.
 * @param {string} identity
 * @returns {Readonly<object>} The glossary record.
 * @throws {TypeError} When `identity` is not a kebab-case carrier identity.
 * @throws {RangeError} When no medical term is admitted under `identity`.
 */
export function resolveMedicalTerm(identity) {
  const record = reader.resolve(identity);
  if (record === undefined) throw new RangeError(`unknown medical term: ${identity}`);
  return record;
}

/**
 * The relation neighborhood of one medical term: its record (if admitted), its outgoing
 * carrier-range relations, and every other admitted record's carrier-range relation naming it.
 * @param {string} identity
 * @returns {Readonly<{record: object|undefined, outgoing: readonly object[], incoming: readonly object[]}>}
 * @throws {TypeError} When `identity` is not a kebab-case carrier identity.
 */
export function medicalTermNeighborhood(identity) {
  return reader.neighborhood(identity);
}

/**
 * Search the medical glossary.
 * @param {string|{q: string, limit?: number|string}} query A query string, or the market's
 *   `{q, limit}` query object (URL query values arrive as strings).
 * @returns {readonly {identity: string, name: string, description: string|undefined, section: string, score: number}[]}
 * @throws {TypeError} When the query carries no nonempty `q`.
 * @throws {RangeError} When `limit` is present but out of range.
 */
export function searchMedicalGlossary(query) {
  const isPlainQuery = typeof query === "string";
  const q = isPlainQuery ? query : query?.q;
  const limit = isPlainQuery ? undefined : normalizedLimit(query?.limit);
  if (typeof q !== "string" || q.trim() === "") throw new TypeError("query must be nonempty text");
  return reader.search(q, limit === undefined ? {} : { limit });
}
