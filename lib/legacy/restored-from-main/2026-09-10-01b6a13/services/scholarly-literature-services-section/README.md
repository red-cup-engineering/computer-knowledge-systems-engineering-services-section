# Scholarly literature services section

Retrieves scholarly-work records from OpenAlex, PubMed (NCBI E-utilities),
and CrossRef, normalizes each to CSL-JSON, and screens the results as a
systematic review: dedupe, PRISMA-named inclusion/exclusion decisions, and
the PRISMA flow tally — the org's missing research-paper retrieval and
screening primitives; no such client or screening ledger existed anywhere
in the tree before this section.

## What lives here

- `src/scholarly-literature.mjs` — the normalization algebra:
  `openAlexWorkToCsl`, `pubmedSummaryToCsl`, and `crossrefWorkToCsl` map
  each source's native record shape to a CSL-JSON item, plus the shared
  name/date/DOI helpers they build on. Field conventions follow the house
  CSL codec (metroplat's `codecs/text/csl`) without importing across
  strata: an author becomes a `{ literal }` name when the source gives
  only a display string, `{ family, given }` when the source gives
  structured parts.
- `scripts/search-openalex-works.mjs` / `scripts/fetch-openalex-work.mjs` —
  OpenAlex `/works` search and single-work fetch (by OpenAlex id or DOI).
- `scripts/search-pubmed.mjs` / `scripts/fetch-pubmed-summaries.mjs` —
  PubMed E-utilities `esearch` (query → PMIDs) and `esummary` (PMIDs →
  CSL-JSON items).
- `scripts/resolve-doi.mjs` — CrossRef `/works/{doi}` → CSL-JSON.
- `src/screening.mjs` — the screening algebra: `makeSearchRecord` (one row
  of the search-audit trail), `dedupeKeyForItem`/`makeCandidateRecord`
  (a CSL-JSON item tagged with its dedupe key — `doi:<bare DOI>` when the
  item carries a DOI, case-insensitively, else `title:<normalized title>`;
  a near-miss title folds to a different key and is deliberately left
  unmerged), `dedupeCandidates` (collapses raw candidates sharing a
  dedupe key, recording every source/search that surfaced each one),
  `applyScreening` (applies named include/exclude decisions, defaulting
  unmatched candidates to `"pending"`), `prismaCounts` (the
  identified/deduplicated/screened/excluded-by-criterion/included tally a
  PRISMA flow diagram needs), and `includedCslItems`.
- `scripts/screen-candidates.mjs` — reads a screening ledger and a
  decisions file from disk, dedupes and applies the decisions, writes the
  ledger back with its `screened` field populated, and prints the
  resulting `prismaCounts`.
- `scripts/export-bibliography.mjs` — reads a screened ledger and returns
  (optionally also writes) the included candidates' CSL-JSON items as one
  array, ready for a paper's references frontmatter.
- `src/watch.mjs` — the journal-watch algebra: `dateWindow` (a rolling
  `YYYY-MM-DD` window ending "now") and `runWatch(spec, { ledger, now,
  fetchImpl })`, which runs every query in a `WatchSpec` against PubMed or
  OpenAlex over that window, appends one `SearchRecord` per query, and
  appends a `CandidateRecord` only for results whose dedupe key
  (`dedupeKeyForItem`, reused from `screening.mjs`) is not already carried
  by the ledger — so a watch never re-surfaces a work already known.
  Returns `{ newCandidates, ledger }`.
- `scripts/watch-literature.mjs` — reads a `WatchSpec` and a screening
  ledger from disk, runs the watch against the live network, writes the
  ledger back, and prints the new-candidate count.
- `apps/scholarly-literature-cli.mjs` — the composed face: one CLI
  dispatching to each retrieval script (screening and watch are invoked
  directly via their scripts, pending CLI wiring).

## No API keys, no dependencies

All three sources are free and keyless. Every fetching function takes an
injected `fetchImpl` (defaulting to global `fetch`), so tests run against
recorded fixtures under `test/fixtures/` rather than the network. A
`mailto`/`email` option, when given, identifies the caller to OpenAlex's
and CrossRef's polite pools and per NCBI's usage guidelines — it never
gates access. The screening layer (`src/screening.mjs` and its two
scripts) does no network I/O at all: it operates purely on the ledger and
decisions JSON it is given. The package has zero runtime dependencies.

## The screening ledger

A screening ledger is one JSON document with three fields: `searches`
(the search-audit trail, `SearchRecord[]`), `candidates` (raw candidate
records surfaced by those searches, before dedup), and `screened`
(populated by `scripts/screen-candidates.mjs`: one deduplicated candidate
per unique DOI/title, each carrying a `status` of `"pending"`,
`"included"`, or `"excluded"` plus its named `criterion`). A decisions
file is a flat `ScreeningDecision[]` — `{ dedupeKey, decision, criterion
}` — matched against `screened` candidates' `dedupeKey`s.

## Watch specs

A `WatchSpec` is `{ id, sinceDays, queries: [{ source: "pubmed"|"openalex",
query, mailto? }] }`. `content/config/watches/` holds one such spec per
named watch as data — `infection-associated-chronic-illness.json` covers
long COVID, ME/CFS, post-exertional malaise, post-infective fatigue, and
post-infection dysautonomia across both sources. Running
`scripts/watch-literature.mjs <spec.json> <ledger.json>` re-queries every
source over the spec's rolling `sinceDays` window and appends only the
candidates the ledger does not already carry; feed the resulting ledger to
`scripts/screen-candidates.mjs` as usual. Queries run sequentially, throttled
1200ms apart by default (`runWatch`'s `requestDelayMs` option) — a real
throttle, not a cosmetic one: PubMed's anonymous E-utilities nominally
allow 3 requests/second, but live testing (2026-09-02) still drew HTTP 429s
at sub-second spacing, so `scripts/watch-literature.mjs` defaults wider.

## Status

Every retrieval script and the CLI has been run once live against the
real APIs to confirm the shapes in `src/scholarly-literature.mjs` match
production responses; the fixtures under `test/fixtures/` for those are
real recorded responses, not hand-written stand-ins. The screening
fixtures (`screening-ledger.json`, `screening-decisions.json`) are
hand-written, since screening has no external API to record against. The
`infection-associated-chronic-illness` watch spec has been run once live
against PubMed and OpenAlex; `test/fixtures/watch-*.json` are hand-written
(shaped from the recorded PubMed/OpenAlex fixtures) since a watch's
result set depends on the calendar day it runs.
