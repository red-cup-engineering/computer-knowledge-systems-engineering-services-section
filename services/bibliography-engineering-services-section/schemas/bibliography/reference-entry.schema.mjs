import REFERENCE_ENTRY_SCHEMA from "./reference-entry.schema.json" with { type: "json" };

export { REFERENCE_ENTRY_SCHEMA };

const CITEKEY = /^[a-z][a-z0-9-]*[0-9]{4}[a-z0-9-]*$/u;

function nonempty(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} must be nonempty text`);
}

/**
 * Admit one depth-1 `references:` map entry under the glossary term reference
 * contract, mirrored exactly from term-engineering-services-section.
 *
 * @param {string} citekey - the map key the entry is filed under.
 * @param {object} reference - the entry value.
 * @returns {object} the frozen, admitted reference entry.
 * @throws {TypeError|RangeError} when the citekey or entry shape is invalid.
 */
export function admitReferenceEntry(citekey, reference) {
  if (!CITEKEY.test(citekey)) throw new TypeError(`invalid citekey ${citekey}`);
  if (reference === null || typeof reference !== "object" || Array.isArray(reference)) throw new TypeError(`reference ${citekey} must be an object`);
  const allowedKeys = new Set(Object.keys(REFERENCE_ENTRY_SCHEMA.properties));
  for (const key of ["authors", "title", "year"]) if (!(key in reference)) throw new TypeError(`reference ${citekey} requires ${key}`);
  if (!Array.isArray(reference.authors) || reference.authors.length === 0) throw new TypeError(`reference ${citekey} authors must be nonempty`);
  for (const author of reference.authors) nonempty(author, "reference author");
  nonempty(reference.title, "reference title");
  if (!Number.isInteger(reference.year) || reference.year < 1) throw new TypeError(`reference ${citekey} year must be positive`);
  for (const key of Object.keys(reference)) if (!allowedKeys.has(key)) throw new RangeError(`reference ${citekey} does not admit ${key}`);
  for (const key of ["publication", "publisher", "translator", "url", "doi", "note", "eprint"]) if (reference[key] !== undefined) nonempty(reference[key], `reference ${key}`);
  if (reference.url !== undefined) { try { new URL(reference.url); } catch { throw new TypeError(`reference ${citekey} url must be a URI`); } }
  return Object.freeze({ ...reference });
}
