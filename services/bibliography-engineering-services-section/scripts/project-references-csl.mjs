#!/usr/bin/env node
import { collectReferencesFrom } from "./collect-set-of-references.mjs";
import { toCslItem as formatReferenceEntry } from "@red-cup-engineering/csl-json-services-section/record-formatting";
import { admitReferenceEntry } from "../schemas/bibliography/reference-entry.schema.mjs";

export function toCslItem(citekey, entry) {
  return formatReferenceEntry(citekey, entry, { admitReferenceEntry });
}

/**
 * Walk `root`, collect its depth-1 reference triples, and project them as a
 * CSL-JSON array (one item per distinct citekey, sorted), ready to drop
 * into a Pandoc `references:` bibliography.
 *
 * @param {string} root - the scope directory to walk.
 * @returns {Array<object>} the CSL-JSON items, sorted by citekey.
 */
export function projectReferencesCslFrom(root) {
  const { triples } = collectReferencesFrom(root);
  const byKey = new Map();
  for (const { citekey, reference } of triples) {
    if (!byKey.has(citekey)) byKey.set(citekey, reference);
  }
  return [...byKey.keys()].sort().map((citekey) => toCslItem(citekey, byKey.get(citekey)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? process.cwd();
  process.stdout.write(`${JSON.stringify(projectReferencesCslFrom(root), null, 2)}\n`);
}
