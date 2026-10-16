#!/usr/bin/env node
import { fromCslItem as formatCslItem } from "@red-cup-engineering/csl-json-services-section/record-formatting";
import { admitReferenceEntry } from "../schemas/bibliography/reference-entry.schema.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-operation-service";

export function fromCslItem(item, options = {}) {
  return formatCslItem(item, { ...options, admitReferenceEntry });
}

/**
 * Import a CSL-JSON array — or, for composing directly with a single-item
 * resolver like `resolve-doi.mjs` over a bare pipe, one bare CSL-JSON item
 * object — into a keyed depth-1 `references:` map, admitting every item as
 * a house reference entry. Items whose `id` is not already a house citekey
 * (a bare DOI, an OpenAlex id, a URL, ...) get one minted (see
 * `fromCslItem`); minted citekeys are disambiguated against every citekey
 * already used earlier in this same batch.
 *
 * @param {(Array<object>|object)} items - a CSL-JSON array, or a single CSL-JSON item object.
 * @returns {{references: object}} frozen keyed map, citekey -> admitted house entry.
 * @throws {TypeError} when `items` is neither an array nor a plain object.
 * @throws {Error|TypeError|RangeError} when any item does not admit (see `fromCslItem`).
 */
export function importSetOfCslReferences(items) {
  const list = Array.isArray(items) ? items
    : items !== null && typeof items === "object" ? [items]
    : null;
  if (list === null) throw new TypeError("importSetOfCslReferences requires a CSL-JSON array, or a single CSL-JSON item object");
  const references = {};
  const taken = new Set();
  for (const item of list) {
    const { citekey, entry } = fromCslItem(item, { taken });
    references[citekey] = entry;
  }
  return Object.freeze({ references: Object.freeze(references) });
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "import-set-of-csl-references", description: "Import a CSL-JSON array — or, for composing directly with a single-item resolver like `resolve-doi.mjs` over a bare pipe, one bare CSL-JSON item object — into a keyed depth-1 `references:` map, admitting every item as a house reference entry.", operation: importSetOfCslReferences }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
