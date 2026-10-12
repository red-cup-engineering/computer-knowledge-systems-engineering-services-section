#!/usr/bin/env node
import { collectReferencesFrom } from "./collect-set-of-references.mjs";
import { renderReferenceListAria } from "../src/bibliography-aria.mjs";

export { orderedReferenceEntries, referenceEntryId, referenceNumbering, renderBiblioRefLink, renderReferenceEntryHtml, renderReferenceListAria } from "../src/bibliography-aria.mjs";

/**
 * Walk `root`, collect its depth-1 reference triples, and project them as
 * DPUB-ARIA 1.1 bibliography HTML.
 *
 * @param {string} root - the scope directory to walk.
 * @param {{label?: string, id?: string}} [options] - forwarded to `renderReferenceListAria`.
 * @returns {string} the rendered HTML.
 */
export function projectReferencesAriaFrom(root, options) {
  const { triples } = collectReferencesFrom(root);
  return renderReferenceListAria(triples, options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? process.cwd();
  const label = process.argv[3];
  const id = process.argv[4];
  const options = { ...(label ? { label } : {}), ...(id ? { id } : {}) };
  process.stdout.write(`${projectReferencesAriaFrom(root, options)}\n`);
}
