import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dateWindow, runWatch } from "../src/reference-watch.mjs";
import { watchLiterature } from "../scripts/watch-literature.mjs";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

/** @returns {object} the parsed JSON fixture at fixtures/<name> */
function fixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

/** @returns {string} a fresh scratch directory under the OS tmpdir */
function scratchDir() {
  return mkdtempSync(join(tmpdir(), "watch-test-"));
}

const NOW = new Date("2026-09-02T12:00:00Z");

/**
 * A recorded-fixture fetchImpl: routes PubMed esearch/esummary and
 * OpenAlex works search to their fixtures, throwing on anything else so an
 * accidental real-network call fails loudly instead of hanging.
 * @returns {typeof fetch}
 */
function fixtureFetchImpl() {
  const pubmedEsearch = fixture("watch-pubmed-esearch-response.json");
  const pubmedEsummary = fixture("watch-pubmed-esummary-response.json");
  const openAlexSearch = fixture("watch-openalex-search-response.json");
  return async (url) => {
    const u = url instanceof URL ? url : new URL(url);
    if (u.hostname === "eutils.ncbi.nlm.nih.gov" && u.pathname.endsWith("esearch.fcgi")) {
      return { ok: true, json: async () => pubmedEsearch };
    }
    if (u.hostname === "eutils.ncbi.nlm.nih.gov" && u.pathname.endsWith("esummary.fcgi")) {
      return { ok: true, json: async () => pubmedEsummary };
    }
    if (u.hostname === "api.openalex.org") {
      return { ok: true, json: async () => openAlexSearch };
    }
    throw new Error(`fixtureFetchImpl: unexpected request to ${u}`);
  };
}

const SPEC = {
  id: "test-watch",
  sinceDays: 7,
  queries: [
    { source: "pubmed", query: "post-exertional malaise" },
    { source: "openalex", query: "long covid" },
  ],
};

// — src: dateWindow —

test("dateWindow computes an inclusive YYYY-MM-DD window ending at now", () => {
  assert.deepEqual(dateWindow(NOW, 7), { from: "2026-08-26", to: "2026-09-02" });
});

test("dateWindow throws on an invalid now or a non-positive sinceDays", () => {
  assert.throws(() => dateWindow(new Date("nope"), 7), /valid Date/);
  assert.throws(() => dateWindow(NOW, 0), /positive integer/);
  assert.throws(() => dateWindow(NOW, -1), /positive integer/);
});

// — src: runWatch —

test("runWatch appends a SearchRecord per query and skips candidates already known to the ledger", async () => {
  const ledger = fixture("watch-ledger.json");
  const { newCandidates, ledger: updated } = await runWatch(SPEC, { ledger, now: NOW, fetchImpl: fixtureFetchImpl() });

  assert.equal(updated.searches.length, 2);
  assert.deepEqual(updated.searches.map((s) => s.source), ["pubmed", "openalex"]);
  assert.equal(updated.searches[0].resultCount, 2);

  // 4 raw results (2 pubmed + 2 openalex), 2 already known (by title, by DOI) -> 2 new
  assert.equal(newCandidates.length, 2);
  const newKeys = newCandidates.map((c) => c.dedupeKey).sort();
  assert.deepEqual(newKeys, ["doi:10.1000/watchtest.002", "doi:10.1000/watchtest.003"]);

  assert.equal(updated.candidates.length, 4);
});

test("runWatch is a pure append: the input ledger object is not mutated", async () => {
  const ledger = fixture("watch-ledger.json");
  const before = JSON.parse(JSON.stringify(ledger));
  await runWatch(SPEC, { ledger, now: NOW, fetchImpl: fixtureFetchImpl() });
  assert.deepEqual(ledger, before);
});

test("runWatch works against an empty/absent ledger, surfacing every deduplicatable result", async () => {
  const { newCandidates, ledger } = await runWatch(SPEC, { now: NOW, fetchImpl: fixtureFetchImpl() });
  assert.equal(newCandidates.length, 4);
  assert.equal(ledger.candidates.length, 4);
  assert.equal(ledger.searches.length, 2);
});

test("runWatch waits requestDelayMs between queries but not before the first", async () => {
  const start = Date.now();
  await runWatch(SPEC, { now: NOW, fetchImpl: fixtureFetchImpl(), requestDelayMs: 50 });
  const elapsed = Date.now() - start;
  // SPEC has 2 queries -> exactly one inter-query delay
  assert.ok(elapsed >= 50, `expected at least one 50ms delay, took ${elapsed}ms`);
});

test("runWatch defaults requestDelayMs to 0 (no artificial delay)", async () => {
  const start = Date.now();
  await runWatch(SPEC, { now: NOW, fetchImpl: fixtureFetchImpl() });
  assert.ok(Date.now() - start < 50, "expected no artificial delay by default");
});

test("runWatch throws on a malformed spec", async () => {
  await assert.rejects(() => runWatch({}, { fetchImpl: fixtureFetchImpl() }), /WatchSpec\.id/);
  await assert.rejects(() => runWatch({ id: "x", sinceDays: 7, queries: [] }, { fetchImpl: fixtureFetchImpl() }), /non-empty WatchSpec\.queries/);
  await assert.rejects(
    () => runWatch({ id: "x", sinceDays: 7, queries: [{ source: "arxiv", query: "q" }] }, { fetchImpl: fixtureFetchImpl() }),
    /"pubmed" or "openalex"/,
  );
  await assert.rejects(
    () => runWatch({ id: "x", sinceDays: 0, queries: [{ source: "pubmed", query: "q" }] }, { fetchImpl: fixtureFetchImpl() }),
    /positive integer/,
  );
});

// — scripts: watchLiterature —

test("watchLiterature reads spec+ledger from disk, writes the updated ledger back, and returns the new-candidate count", async () => {
  const dir = scratchDir();
  const specPath = join(dir, "spec.json");
  const ledgerPath = join(dir, "ledger.json");
  writeFileSync(specPath, JSON.stringify(SPEC));
  writeFileSync(ledgerPath, JSON.stringify(fixture("watch-ledger.json")));

  const count = await watchLiterature({ specPath, ledgerPath, now: NOW, fetchImpl: fixtureFetchImpl(), requestDelayMs: 0 });
  assert.equal(count, 2);

  const written = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.equal(written.candidates.length, 4);
  assert.equal(written.searches.length, 2);
});

test("watchLiterature writes to a separate outputPath when given, leaving the ledger untouched", async () => {
  const dir = scratchDir();
  const specPath = join(dir, "spec.json");
  const ledgerPath = join(dir, "ledger.json");
  const outputPath = join(dir, "out.json");
  const originalLedger = fixture("watch-ledger.json");
  writeFileSync(specPath, JSON.stringify(SPEC));
  writeFileSync(ledgerPath, JSON.stringify(originalLedger));

  await watchLiterature({ specPath, ledgerPath, outputPath, now: NOW, fetchImpl: fixtureFetchImpl(), requestDelayMs: 0 });

  const unchanged = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.deepEqual(unchanged, originalLedger);
  const written = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(written.candidates.length, 4);
});

test("watchLiterature throws when specPath or ledgerPath is missing", async () => {
  await assert.rejects(() => watchLiterature({ ledgerPath: "x" }), /specPath/);
  await assert.rejects(() => watchLiterature({ specPath: "x" }), /ledgerPath/);
});
