import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createSemanticRecordJournal } from "@red-cup-engineering/witness-journal-document-service/record-semantic-record";
import { recordSetOfReferencesHealth } from "../scripts/record-set-of-references-health.mjs";

let scopeRoot;
let journalRoot;
before(() => {
  scopeRoot = mkdtempSync(join(tmpdir(), "bibliography-health-scope-"));
  journalRoot = mkdtempSync(join(tmpdir(), "bibliography-health-journal-"));
  mkdirSync(join(scopeRoot, "bibliographies"), { recursive: true });
  writeFileSync(join(scopeRoot, "bibliographies", "orphan1999.md"), [
    "---",
    "type: bibliography",
    "key: orphan1999",
    "reference-type: article",
    "authors: [Nobody, N.]",
    "year: 1999",
    "title: Never cited",
    "---",
    "",
    "# Orphan",
    "",
  ].join("\n"));
});
after(() => {
  rmSync(scopeRoot, { recursive: true, force: true });
  rmSync(journalRoot, { recursive: true, force: true });
});

test("recordSetOfReferencesHealth witnesses the citation health counts through the semantic record journal", () => {
  const result = recordSetOfReferencesHealth({ scopeRoot, journalRoot, recordedAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(result.record.orphanCarrierCount, 1);
  assert.equal(result.record.conflictCount, 0);
  assert.equal(result.record.uncoveredCitekeyCount, 0);
  assert.equal(result.record.citekeysWithoutCarrierCount, 0);
  assert.equal(result.record.inlineCitationsCollected, 0);
  assert.equal(result.told.for, true);
  assert.equal(result.told.against, false);
  const journal = createSemanticRecordJournal({ root: journalRoot, objectKind: "bibliography-corpus-health" });
  const witnessed = journal.query({ category: "bibliography-corpus-health" });
  assert.equal(witnessed.length, 1);
  assert.equal(witnessed[0].record.orphanCarrierCount, 1);
});

test("recordSetOfReferencesHealth counts an inline citation with no map entry as uncovered, and a map entry with no carrier as citekeysWithoutCarrier, separately", () => {
  const scope = mkdtempSync(join(tmpdir(), "bibliography-health-scope-mixed-"));
  const journal = mkdtempSync(join(tmpdir(), "bibliography-health-journal-mixed-"));
  try {
    writeFileSync(join(scope, "note.md"), [
      "---",
      "name: note",
      "references:",
      "  caillois1958:",
      "    authors: [Caillois, Roger]",
      "    title: Man, Play, and Games",
      "    year: 1958",
      "---",
      "",
      "Cites [@caillois1958] (covered) and @euler1736 (uncovered).",
      "",
    ].join("\n"));
    const result = recordSetOfReferencesHealth({ scopeRoot: scope, journalRoot: journal, recordedAt: "2026-09-01T00:00:00.000Z" });
    assert.equal(result.record.uncoveredCitekeyCount, 1);
    assert.equal(result.record.uncoveredCitekeys[0].citekey, "euler1736");
    assert.equal(result.record.citekeysWithoutCarrierCount, 1);
    assert.equal(result.record.citekeysWithoutCarrier[0].citekey, "caillois1958");
    assert.equal(result.record.inlineCitationsCollected, 2);
  } finally {
    rmSync(scope, { recursive: true, force: true });
    rmSync(journal, { recursive: true, force: true });
  }
});
