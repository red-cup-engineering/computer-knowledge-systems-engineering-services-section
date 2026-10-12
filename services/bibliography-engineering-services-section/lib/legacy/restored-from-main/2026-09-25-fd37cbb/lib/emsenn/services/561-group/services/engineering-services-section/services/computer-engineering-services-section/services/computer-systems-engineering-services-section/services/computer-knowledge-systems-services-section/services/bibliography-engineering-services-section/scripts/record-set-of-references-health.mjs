#!/usr/bin/env node
import { createSemanticRecordJournal } from "@red-cup-engineering/witness-journal-document-service/record-semantic-record";
import { reconcileSetOfReferencesFrom } from "./reconcile-set-of-references.mjs";

const OBJECT_KIND = "bibliography-corpus-health";
const CATEGORY = "bibliography-corpus-health";

/**
 * Reconcile a scope's references and record the citation health counts as a
 * witnessed receipt through the house semantic record journal.
 *
 * The six recorded counts: `conflictCount` (one citekey naming materially
 * different works), `probableDuplicateCount` (two citekeys naming the same
 * work), `uncoveredCitekeyCount` (an inline `[@key]` body citation whose key
 * is absent from that same file's depth-1 `references:` map — the real
 * health failure the citation model states), `citekeysWithoutCarrierCount`
 * (depth-1 citekeys with no depth-2 bibliography carrier — informational
 * only, since an ordinary depth-1-only citation is healthy), and
 * `orphanCarrierCount` (a depth-2 carrier no `references:` entry cites).
 * `triplesCollected`, `carriersCollected`, and `inlineCitationsCollected`
 * report the raw collection volumes behind those counts.
 *
 * @param {{scopeRoot: string, journalRoot: string, recordedAt?: string}} request
 * @returns {object} the frozen journal `record()` result, `.record` carrying the health counts.
 */
export function recordSetOfReferencesHealth({ scopeRoot, journalRoot, recordedAt = new Date().toISOString() }) {
  const { collected, ...health } = reconcileSetOfReferencesFrom(scopeRoot);
  const journal = createSemanticRecordJournal({ root: journalRoot, objectKind: OBJECT_KIND });
  const record = {
    scopeRoot,
    conflictCount: health.conflicts.length,
    probableDuplicateCount: health.probableDuplicates.length,
    uncoveredCitekeyCount: health.uncoveredCitekeys.length,
    citekeysWithoutCarrierCount: health.citekeysWithoutCarrier.length,
    orphanCarrierCount: health.orphanCarriers.length,
    triplesCollected: collected.triples.length,
    carriersCollected: collected.carriers.length,
    inlineCitationsCollected: collected.citations.length,
    ...health,
  };
  const result = journal.record({ category: CATEGORY, record, recordedAt, told: { for: true, against: false } });
  return Object.freeze({ ...result, record });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const scopeRoot = process.argv[2] ?? process.cwd();
  const journalRoot = process.argv[3] ?? scopeRoot;
  process.stdout.write(`${JSON.stringify(recordSetOfReferencesHealth({ scopeRoot, journalRoot }), null, 2)}\n`);
}
