import BIBLIOGRAPHY_RECORD_SCHEMA from "./bibliography.schema.json" with { type: "json" };

export { BIBLIOGRAPHY_RECORD_SCHEMA };

const CITEKEY = /^[a-z][a-z0-9-]*[0-9]{4}[a-z0-9-]*$/u;

function nonempty(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} must be nonempty text`);
}

/**
 * Admit one depth-2 bibliography carrier record before it is rendered to
 * Markdown. Unlike the closed depth-1 reference-entry contract, additional
 * bibliographic detail fields (journal, volume, number, pages, ...) are
 * permitted: the science-topic-section-model specification states the
 * carrier's required frontmatter without ruling it a closed vocabulary.
 *
 * @param {object} value - the candidate bibliography record.
 * @returns {object} the frozen, admitted record.
 * @throws {TypeError} when a required field is missing or malformed.
 */
export function admitBibliographyRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("bibliography record must be an object");
  for (const key of BIBLIOGRAPHY_RECORD_SCHEMA.required) if (!(key in value)) throw new TypeError(`bibliography record requires ${key}`);
  if (value.type !== "bibliography") throw new TypeError("type must equal bibliography");
  if (!CITEKEY.test(value.key)) throw new TypeError("key must be a citekey matching ^[a-z][a-z0-9-]*[0-9]{4}[a-z0-9-]*$");
  nonempty(value["reference-type"], "reference-type");
  if (!Array.isArray(value.authors) || value.authors.length === 0) throw new TypeError("authors must be a nonempty array");
  for (const author of value.authors) nonempty(author, "author");
  if (!Number.isInteger(value.year) || value.year < 1) throw new TypeError("year must be a positive integer");
  nonempty(value.title, "title");
  nonempty(value.body, "body");
  for (const key of ["eprint", "eprinttype", "publication", "publisher", "translator", "doi", "note"]) {
    if (value[key] !== undefined) nonempty(value[key], key);
  }
  if (value.url !== undefined) { try { new URL(value.url); } catch { throw new TypeError("url must be a URI"); } }
  return Object.freeze(value);
}
