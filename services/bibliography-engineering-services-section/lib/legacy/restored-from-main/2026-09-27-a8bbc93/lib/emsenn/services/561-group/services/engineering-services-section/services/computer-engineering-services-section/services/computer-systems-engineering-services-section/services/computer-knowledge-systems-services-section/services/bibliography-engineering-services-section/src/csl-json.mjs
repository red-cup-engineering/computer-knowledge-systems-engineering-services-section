/**
 * @module csl-json
 * The boundary between CSL-JSON and this house's depth-1 reference-entry
 * contract: `fromCslItem` and `toCslItem`.
 *
 * The CSL-JSON algebra itself — the CSL 1.0.2 type vocabulary, name objects,
 * date objects, DOI and title normalization, item admission — is NOT here.
 * It is a data format, so it lives once in computer-data, at
 * `@red-cup-engineering/csl-json-services-section`, and this knowledge system
 * consumes it. Import CSL primitives from that package directly, not through
 * this module.
 */

import {
  admitCslItem,
  cslDate,
  issuedYear,
  nameFromString,
  nameToString,
} from "@red-cup-engineering/csl-json-services-section";
import { admitReferenceEntry } from "../data/records/schema/bibliography/reference-entry.schema.mjs";
import { makeCitekey } from "./citation-text.mjs";

function isNonEmptyString(value) { return typeof value === "string" && value.trim() !== ""; }

// Mirrors admitReferenceEntry's citekey contract (reference-entry.schema.mjs).
// Not imported from there (that module keeps it private, and this exact
// pattern is already independently inlined the same way in
// bibliography-carrier.mjs and bibliography-reconcile.mjs — matching, not
// introducing, existing house practice for this one-line regex).
const HOUSE_CITEKEY_RE = /^[a-z][a-z0-9-]*[0-9]{4}[a-z0-9-]*$/u;

/**
 * Mint a citekey for a CSL item whose `id` is absent or not already a house
 * citekey, from its first author's (or editor's) family name and its
 * issued year, via `makeCitekey`/`surnameToken` in `src/citation-text.mjs`
 * (reused, not duplicated).
 *
 * @param {object} item - a CSL-JSON item.
 * @param {Set<string>} taken - citekeys already used in this batch; mutated by `makeCitekey`'s caller, not here.
 * @returns {string} the minted citekey.
 * @throws {TypeError} when the item has no author/editor, or no resolvable issued year.
 */
function mintCitekeyFromCslItem(item, taken) {
  const names = Array.isArray(item.author) && item.author.length > 0 ? item.author
    : Array.isArray(item.editor) && item.editor.length > 0 ? item.editor
    : null;
  if (names === null) {
    throw new TypeError("cannot mint a citekey for this CSL item: no author or editor to derive a surname from");
  }
  const year = issuedYear(item.issued);
  if (!Number.isInteger(year)) {
    throw new TypeError("cannot mint a citekey for this CSL item: no resolvable issued year");
  }
  return makeCitekey([names[0]], year, taken);
}

/**
 * Convert one CSL-JSON item to a house depth-1 reference-entry
 * (`src/reference-entry.mjs`). Field mapping: `author` (falling back to
 * `editor`) -> `authors` (CSL names flattened to "Given Family"/literal
 * strings); the first `issued` date-part -> `year`; `container-title` ->
 * `publication`; `publisher` -> `publisher`; `DOI` -> `doi`; `URL` -> `url`;
 * `note` -> `note`.
 *
 * `id` -> citekey when `id` is already a house citekey (`surnameYYYY`);
 * otherwise a citekey is minted (see `mintCitekeyFromCslItem`) and, when the
 * original `id` has no other home in the entry (it is not already carried
 * as `doi` or `url` — e.g. a CrossRef item whose `id` duplicates its own
 * `DOI`), it is preserved as `note` so a bare DOI, an OpenAlex `W...` id, or
 * a URL used as `id` is not silently lost.
 *
 * @param {object} item - a CSL-JSON item.
 * @param {{taken?: Set<string>}} [options] - `taken` collision-avoids minted citekeys across one batch (see `importSetOfCslReferences`); a fresh Set when omitted.
 * @returns {{citekey: string, entry: object}} the citekey and the frozen, admitted house entry.
 * @throws {TypeError} when `item` is not an object, or a citekey cannot be minted (see `mintCitekeyFromCslItem`).
 * @throws {Error} when the item (with its citekey installed as `id`) is not an admissible CSL-JSON item (see `admitCslItem`).
 * @throws {TypeError|RangeError} when the resulting entry does not admit (see `admitReferenceEntry`).
 */
export function fromCslItem(item, { taken = new Set() } = {}) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    throw new TypeError("fromCslItem requires a CSL-JSON item object");
  }
  const hasHouseCitekeyId = typeof item.id === "string" && HOUSE_CITEKEY_RE.test(item.id);
  const sourceId = !hasHouseCitekeyId && isNonEmptyString(item.id) ? item.id.trim() : null;
  const citekey = hasHouseCitekeyId ? item.id : mintCitekeyFromCslItem(item, taken);
  taken.add(citekey);

  const admitted = admitCslItem({ ...item, id: citekey });
  const names = admitted.author ?? admitted.editor ?? [];
  const authors = names.map(nameToString);
  const entry = { authors, title: admitted.title, year: issuedYear(admitted.issued) };
  if (isNonEmptyString(admitted["container-title"])) entry.publication = admitted["container-title"];
  if (isNonEmptyString(admitted.publisher)) entry.publisher = admitted.publisher;
  if (isNonEmptyString(admitted.DOI)) entry.doi = admitted.DOI;
  if (isNonEmptyString(admitted.URL)) entry.url = admitted.URL;
  if (isNonEmptyString(admitted.note)) entry.note = admitted.note;
  if (entry.note === undefined && sourceId !== null && sourceId !== entry.doi && sourceId !== entry.url) {
    entry.note = `source id: ${sourceId}`;
  }
  return Object.freeze({ citekey, entry: admitReferenceEntry(citekey, entry) });
}

/**
 * Convert one house depth-1 reference entry back to a CSL-JSON item. The
 * CSL `type` is inferred: `article-journal` when `publication` is set,
 * `book` when `publisher` is set (and no `publication`), else `document`.
 *
 * @param {string} citekey
 * @param {object} entry - a house reference entry.
 * @returns {object} the frozen CSL-JSON item.
 * @throws {TypeError|RangeError} when `entry` does not admit (see `admitReferenceEntry`).
 */
export function toCslItem(citekey, entry) {
  const admitted = admitReferenceEntry(citekey, entry);
  const type = admitted.publication !== undefined ? "article-journal" : admitted.publisher !== undefined ? "book" : "document";
  const item = {
    id: citekey,
    type,
    author: admitted.authors.map(nameFromString),
    title: admitted.title,
    issued: cslDate(admitted.year),
  };
  if (admitted.publication !== undefined) item["container-title"] = admitted.publication;
  if (admitted.publisher !== undefined) item.publisher = admitted.publisher;
  if (admitted.doi !== undefined) item.DOI = admitted.doi;
  if (admitted.url !== undefined) item.URL = admitted.url;
  if (admitted.note !== undefined) item.note = admitted.note;
  return Object.freeze(item);
}
