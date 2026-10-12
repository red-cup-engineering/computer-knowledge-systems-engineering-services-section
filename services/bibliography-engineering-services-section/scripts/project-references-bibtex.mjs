#!/usr/bin/env node
import { collectReferencesFrom } from "./collect-set-of-references.mjs";
import { projectBibtex } from "../src/bibliography-bibtex.mjs";

export { projectBibtex, renderBibtexEntry } from "../src/bibliography-bibtex.mjs";

/**
 * Walk `root` and project its reconciled reference set as deterministic
 * BibTeX text.
 *
 * @param {string} root - the scope directory to walk.
 * @returns {string} the generated `.bib` text.
 */
export function projectReferencesBibtexFrom(root) {
  return projectBibtex(collectReferencesFrom(root));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? process.cwd();
  process.stdout.write(projectReferencesBibtexFrom(root));
}
