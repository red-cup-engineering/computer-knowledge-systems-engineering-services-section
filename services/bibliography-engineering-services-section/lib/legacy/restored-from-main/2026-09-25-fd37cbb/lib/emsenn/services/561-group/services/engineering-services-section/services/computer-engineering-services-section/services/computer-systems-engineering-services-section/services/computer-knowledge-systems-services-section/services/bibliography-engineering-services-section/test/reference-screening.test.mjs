import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  makeSearchRecord,
  dedupeKeyForItem,
  makeCandidateRecord,
  dedupeCandidates,
  applyScreening,
  prismaCounts,
  includedCslItems,
} from "../src/reference-screening.mjs";
import { screenCandidates } from "../scripts/screen-candidates.mjs";
import { projectScreenedCandidatesCsl } from "../scripts/project-screened-candidates-csl.mjs";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** @returns {object} the parsed JSON fixture at fixtures/<name> */
function fixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

/** @returns {string} a fresh scratch directory under the OS tmpdir */
function scratchDir() {
  return mkdtempSync(join(tmpdir(), "screening-test-"));
}

// — src: makeSearchRecord —

test("makeSearchRecord builds a frozen record with a deterministic id", () => {
  const record = makeSearchRecord({ source: "openalex", query: "deep learning", date: "2026-08-30", resultCount: 42 });
  assert.equal(record.id, "openalex::2026-08-30::deep learning");
  assert.equal(record.resultCount, 42);
  assert.throws(() => { record.resultCount = 0; });
});

test("makeSearchRecord throws on a missing source", () => {
  assert.throws(() => makeSearchRecord({ query: "x", date: "2026-01-01", resultCount: 0 }), /non-empty source/);
});

test("makeSearchRecord throws on a negative resultCount", () => {
  assert.throws(() => makeSearchRecord({ source: "s", query: "x", date: "2026-01-01", resultCount: -1 }), /non-negative integer/);
});

// — src: dedupeKeyForItem —

test("dedupeKeyForItem keys same-DOI items identically regardless of case", () => {
  assert.equal(dedupeKeyForItem({ DOI: "10.1038/NATURE14539" }), dedupeKeyForItem({ DOI: "10.1038/nature14539" }));
  assert.equal(dedupeKeyForItem({ DOI: "10.1038/nature14539" }), "doi:10.1038/nature14539");
});

test("dedupeKeyForItem falls back to normalized title when no DOI", () => {
  assert.equal(dedupeKeyForItem({ title: "  Attention   IS all You Need  " }), "title:attention is all you need");
});

test("dedupeKeyForItem keys a near-miss title differently from its base title", () => {
  const base = dedupeKeyForItem({ title: "Attention Is All You Need" });
  const nearMiss = dedupeKeyForItem({ title: "Attention Is All You Need: A Survey" });
  assert.notEqual(base, nearMiss);
});

test("dedupeKeyForItem returns undefined for an item with neither DOI nor title", () => {
  assert.equal(dedupeKeyForItem({ type: "article-journal" }), undefined);
  assert.equal(dedupeKeyForItem(null), undefined);
});

// — src: makeCandidateRecord —

test("makeCandidateRecord builds a frozen candidate carrying its dedupe key", () => {
  const candidate = makeCandidateRecord({ item: { title: "Deep learning", DOI: "10.1038/nature14539" }, source: "openalex", searchId: "s1" });
  assert.equal(candidate.dedupeKey, "doi:10.1038/nature14539");
  assert.equal(candidate.source, "openalex");
  assert.equal(candidate.searchId, "s1");
});

test("makeCandidateRecord throws on a non-object item", () => {
  assert.throws(() => makeCandidateRecord({ item: "nope", source: "s" }), TypeError);
});

test("makeCandidateRecord throws when the item has neither DOI nor title", () => {
  assert.throws(() => makeCandidateRecord({ item: { type: "article-journal" }, source: "s" }), /neither a DOI nor a title/);
});

// — src: dedupeCandidates —

const RAW_CANDIDATES = fixture("screening-ledger.json").candidates;

test("dedupeCandidates merges same-DOI candidates differing only in case", () => {
  const deduped = dedupeCandidates(RAW_CANDIDATES);
  const doiGroup = deduped.find((c) => c.dedupeKey === "doi:10.1038/nature14539");
  assert.equal(doiGroup.duplicateCount, 2);
  assert.deepEqual([...doiGroup.sources].sort(), ["crossref", "openalex"]);
});

test("dedupeCandidates merges title-only candidates on normalized title", () => {
  const deduped = dedupeCandidates(RAW_CANDIDATES);
  const titleGroup = deduped.find((c) => c.dedupeKey === "title:attention is all you need");
  assert.equal(titleGroup.duplicateCount, 2);
  assert.deepEqual([...titleGroup.sources].sort(), ["openalex", "pubmed"]);
});

test("dedupeCandidates does NOT merge a near-miss title into the base title's group", () => {
  const deduped = dedupeCandidates(RAW_CANDIDATES);
  const nearMiss = deduped.find((c) => c.dedupeKey === "title:attention is all you need a survey");
  assert.ok(nearMiss);
  assert.equal(nearMiss.duplicateCount, 1);
  const base = deduped.find((c) => c.dedupeKey === "title:attention is all you need");
  assert.equal(base.duplicateCount, 2);
});

test("dedupeCandidates keeps the first-seen item for a merged group", () => {
  const deduped = dedupeCandidates(RAW_CANDIDATES);
  const doiGroup = deduped.find((c) => c.dedupeKey === "doi:10.1038/nature14539");
  assert.equal(doiGroup.item.id, "W1");
});

test("dedupeCandidates collapses 6 raw candidates to 4 unique groups", () => {
  assert.equal(dedupeCandidates(RAW_CANDIDATES).length, 4);
});

test("dedupeCandidates skips malformed entries and throws on a non-array", () => {
  assert.deepEqual(dedupeCandidates([null, "nope", { dedupeKey: "doi:x", item: { id: "1" }, source: "s" }]).length, 1);
  assert.throws(() => dedupeCandidates("nope"), TypeError);
});

// — src: applyScreening —

test("applyScreening marks unmatched candidates pending and matched ones by decision", () => {
  const deduped = dedupeCandidates(RAW_CANDIDATES);
  const screened = applyScreening(deduped, [
    { dedupeKey: "doi:10.1038/nature14539", decision: "include", criterion: "meets criteria" },
    { dedupeKey: "doi:10.1000/xyz123", decision: "exclude", criterion: "wrong-population" },
  ]);
  const byKey = Object.fromEntries(screened.map((c) => [c.dedupeKey, c]));
  assert.equal(byKey["doi:10.1038/nature14539"].status, "included");
  assert.equal(byKey["doi:10.1000/xyz123"].status, "excluded");
  assert.equal(byKey["doi:10.1000/xyz123"].criterion, "wrong-population");
  assert.equal(byKey["title:attention is all you need"].status, "pending");
});

test("applyScreening lets the last decision for a dedupeKey win", () => {
  const deduped = dedupeCandidates(RAW_CANDIDATES);
  const screened = applyScreening(deduped, [
    { dedupeKey: "doi:10.1000/xyz123", decision: "exclude", criterion: "first-pass" },
    { dedupeKey: "doi:10.1000/xyz123", decision: "include", criterion: "second-pass" },
  ]);
  const candidate = screened.find((c) => c.dedupeKey === "doi:10.1000/xyz123");
  assert.equal(candidate.status, "included");
  assert.equal(candidate.criterion, "second-pass");
});

test("applyScreening throws when a decision names no criterion", () => {
  const deduped = dedupeCandidates(RAW_CANDIDATES);
  assert.throws(() => applyScreening(deduped, [{ dedupeKey: "doi:10.1000/xyz123", decision: "exclude" }]), /named criterion/);
});

test("applyScreening throws on an invalid decision value", () => {
  const deduped = dedupeCandidates(RAW_CANDIDATES);
  assert.throws(() => applyScreening(deduped, [{ dedupeKey: "x", decision: "maybe", criterion: "c" }]), /"include" or "exclude"/);
});

test("applyScreening throws on non-array inputs", () => {
  assert.throws(() => applyScreening("nope", []), TypeError);
  assert.throws(() => applyScreening([], "nope"), TypeError);
});

// — src: prismaCounts —

test("prismaCounts tallies identified, deduplicated, screened, excluded-by-criterion, and included", () => {
  const deduped = dedupeCandidates(RAW_CANDIDATES);
  const decisions = fixture("screening-decisions.json");
  const screened = applyScreening(deduped, decisions);
  const counts = prismaCounts({ candidates: RAW_CANDIDATES, screened });
  assert.equal(counts.identified, 6);
  assert.equal(counts.deduplicated, 4);
  assert.equal(counts.duplicatesRemoved, 2);
  assert.equal(counts.screened, 3);
  assert.equal(counts.included, 2);
  assert.equal(counts.excluded, 1);
  assert.equal(counts.pending, 1);
  assert.deepEqual(counts.excludedByCriterion, { "wrong-study-design": 1 });
});

test("prismaCounts returns all zeros for an empty ledger", () => {
  const counts = prismaCounts({});
  assert.equal(counts.identified, 0);
  assert.equal(counts.deduplicated, 0);
  assert.equal(counts.pending, 0);
});

test("prismaCounts throws on a non-object", () => {
  assert.throws(() => prismaCounts(null), TypeError);
});

// — src: includedCslItems —

test("includedCslItems returns only included candidates' CSL-JSON items, in order", () => {
  const deduped = dedupeCandidates(RAW_CANDIDATES);
  const decisions = fixture("screening-decisions.json");
  const screened = applyScreening(deduped, decisions);
  const items = includedCslItems({ screened });
  assert.equal(items.length, 2);
  assert.ok(items.every((item) => typeof item.id === "string"));
});

test("includedCslItems returns an empty array when nothing is included", () => {
  assert.deepEqual(includedCslItems({ screened: [{ status: "excluded", item: { id: "1" } }] }), []);
});

test("includedCslItems throws on a non-object", () => {
  assert.throws(() => includedCslItems(undefined), TypeError);
});

// — scripts: screenCandidates —

test("screenCandidates writes a screened ledger and returns matching prismaCounts", () => {
  const dir = scratchDir();
  const ledgerPath = join(dir, "ledger.json");
  writeFileSync(ledgerPath, JSON.stringify(fixture("screening-ledger.json")));
  const decisionsPath = join(FIXTURES_DIR, "screening-decisions.json");

  const counts = screenCandidates({ ledgerPath, decisionsPath });
  assert.equal(counts.identified, 6);
  assert.equal(counts.included, 2);
  assert.equal(counts.excluded, 1);
  assert.equal(counts.pending, 1);

  const written = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.equal(written.screened.length, 4);
  assert.ok(Array.isArray(written.searches));
});

test("screenCandidates writes to a separate outputPath when given, leaving the ledger untouched", () => {
  const dir = scratchDir();
  const ledgerPath = join(dir, "ledger.json");
  const outputPath = join(dir, "out.json");
  const originalLedger = fixture("screening-ledger.json");
  writeFileSync(ledgerPath, JSON.stringify(originalLedger));
  const decisionsPath = join(FIXTURES_DIR, "screening-decisions.json");

  screenCandidates({ ledgerPath, decisionsPath, outputPath });

  const unchanged = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.equal(unchanged.screened, undefined);
  const written = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(written.screened.length, 4);
});

test("screenCandidates throws when ledgerPath or decisionsPath is missing", () => {
  assert.throws(() => screenCandidates({ decisionsPath: "x" }), /ledgerPath/);
  assert.throws(() => screenCandidates({ ledgerPath: "x" }), /decisionsPath/);
});

// — scripts: projectScreenedCandidatesCsl —

test("projectScreenedCandidatesCsl writes the included candidates' CSL-JSON items to a paper's references file", () => {
  const dir = scratchDir();
  const ledgerPath = join(dir, "ledger.json");
  const referencesPath = join(dir, "references.json");
  writeFileSync(ledgerPath, JSON.stringify(fixture("screening-ledger.json")));
  screenCandidates({ ledgerPath, decisionsPath: join(FIXTURES_DIR, "screening-decisions.json") });

  const items = projectScreenedCandidatesCsl({ ledgerPath, outputPath: referencesPath });
  assert.equal(items.length, 2);
  const written = JSON.parse(readFileSync(referencesPath, "utf8"));
  assert.deepEqual(written, items);
});

test("projectScreenedCandidatesCsl returns an empty array for a ledger with no screening yet", () => {
  const dir = scratchDir();
  const ledgerPath = join(dir, "ledger.json");
  writeFileSync(ledgerPath, JSON.stringify(fixture("screening-ledger.json")));
  assert.deepEqual(projectScreenedCandidatesCsl({ ledgerPath }), []);
});

test("projectScreenedCandidatesCsl throws when ledgerPath is missing", () => {
  assert.throws(() => projectScreenedCandidatesCsl({}), /ledgerPath/);
});
