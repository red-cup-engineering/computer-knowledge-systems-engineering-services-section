#!/usr/bin/env node
import { collectReferencesFrom } from "./collect-set-of-references.mjs";
import { reconcileReferences } from "../src/bibliography-reconcile.mjs";

export { reconcileReferences } from "../src/bibliography-reconcile.mjs";

/**
 * Walk `root` and reconcile the collected reference triples, bibliography
 * carriers, and inline body citations into the corpus's citation-health
 * counts.
 *
 * @param {string} root - the scope directory to walk.
 * @returns {object} frozen `{conflicts, probableDuplicates, uncoveredCitekeys, citekeysWithoutCarrier, orphanCarriers}` plus the raw `collected` inputs.
 */
export function reconcileSetOfReferencesFrom(root) {
  const collected = collectReferencesFrom(root);
  return Object.freeze({ ...reconcileReferences(collected), collected });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? process.cwd();
  const { collected, ...health } = reconcileSetOfReferencesFrom(root);
  process.stdout.write(`${JSON.stringify(health, null, 2)}\n`);
}
