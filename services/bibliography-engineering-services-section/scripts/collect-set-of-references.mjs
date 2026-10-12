#!/usr/bin/env node
import { collectReferencesFrom } from "../src/bibliography-collect.mjs";

export { collectBibliographyCarriers, collectInlineCitations, collectReferencesFrom, collectReferenceTriples } from "../src/bibliography-collect.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? process.cwd();
  process.stdout.write(`${JSON.stringify(collectReferencesFrom(root), null, 2)}\n`);
}
