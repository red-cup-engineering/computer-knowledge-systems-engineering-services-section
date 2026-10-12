# bibliography-engineering-services-section

Engineering policy and operations for the citation model ruled canonical by
`561-group-science-services-section`'s
`2026-08-30-science-topic-section-model.md`: depth-1 frontmatter
`references:` maps, depth-2 `<citekey>.md` bibliography carriers, and the
generated `.bib` build artifact at depth 3.

Seated as a direct sibling of `question-engineering-services-section` under
`computer-knowledge-systems-services-section/services/`: bibliography, like
question, is its own carrier-class topic rather than a subtype of another
system (contrast `term-engineering-services-section`, nested one level
deeper under `computer-glossary-systems-engineering-services-section`
because a term is specifically a glossary carrier).

## Operations

- `scripts/recognize-bibliography.mjs` / `render-bibliography.mjs` /
  `write-bibliography.mjs` / `read-bibliography.mjs` — one depth-2 carrier.
- `scripts/collect-set-of-references.mjs` — walk a scope and collect every
  `references:` triple, every depth-2 carrier, and every inline body
  citation in it.
- `scripts/reconcile-set-of-references.mjs` — the corpus's citation health
  numbers: conflicts (one citekey naming materially different works),
  probable duplicates (two citekeys naming the same work), uncovered
  citekeys (an inline `[@key]` body citation whose key is absent from that
  file's own depth-1 `references:` map — the model's actual health
  failure), citekeys without a carrier (depth-1 citekeys with no depth-2
  bibliography carrier — informational, since an ordinary depth-1-only
  citation is healthy under the model), and orphan carriers (a depth-2
  carrier no `references:` entry cites).
- `scripts/project-references-bibtex.mjs` — deterministic generated `.bib`.
- `scripts/record-set-of-references-health.mjs` — witnesses a reconciliation
  through `@red-cup-engineering/semiotic-eavt-services-section`.
- `scripts/parse-set-of-citations.mjs` — free-text citation lines to a keyed
  `references:` map, via the CSL-JSON landmark scanner in `src/citation-text.mjs`.
- `scripts/import-set-of-csl-references.mjs` — a CSL-JSON array, or a
  single bare CSL-JSON item object, to a keyed `references:` map, via the
  record formatter in `@red-cup-engineering/csl-json-services-section`. A citation carrying a DOI can be upgraded to
  CrossRef-authoritative metadata with
  `apps/bibliography-cli.mjs resolve-doi <doi> | apps/bibliography-cli.mjs import-csl`.
- `scripts/project-references-csl.mjs` — a scope's collected references as a
  CSL-JSON array, for a Pandoc `references:` bibliography.
- `scripts/project-references-aria.mjs` (`src/bibliography-aria.mjs`) — a
  scope's collected references as W3C DPUB-ARIA 1.1 bibliography HTML
  (`doc-bibliography` / `doc-biblioentry` roles for the rendered list,
  `doc-biblioref` for `renderBiblioRefLink`'s inline citation links), the
  canonical backend for what koios.news's `bibliography.mts` currently
  hand-rolls. The visible heading label and its id/`aria-labelledby` are a
  `{label, id}` options argument (defaults `"References"` / `"references"`),
  never hardcoded English, so a site can display its own nomenclature (e.g.
  koios.news's `"Sources"`) over the one standards-conformant projection.
- `scripts/verify-set-of-references.mjs` — resolves every reference row's
  `doi` against CrossRef (via this section's own `scripts/resolve-doi.mjs`)
  and reports `agreed` / `title-mismatch` / `year-mismatch` /
  `unresolved` / `no-doi` per row, exiting 1 when any defect is found — the
  deterministic check a fabricated or paraphrased `references:` entry has
  never had.
### Bibliographic-record retrieval

Retrieving a work's authoritative record from a bibliographic database is
this section's work, not a separate one: the noun is the reference, and
these are verbs on it. They arrived here from the deleted
`scholarly-literature-services-section`, whose only real consumer was this
section's own verifier.

- `scripts/resolve-doi.mjs` — CrossRef `/works/{doi}` -> CSL-JSON.
- `scripts/search-openalex-works.mjs` / `scripts/fetch-openalex-work.mjs` —
  OpenAlex `/works` search and single-work fetch (by OpenAlex id or DOI).
  `searchOpenAlexWorks` takes an optional `filter` passed through to
  OpenAlex.
- `scripts/search-pubmed.mjs` / `scripts/fetch-pubmed-summaries.mjs` —
  PubMed E-utilities `esearch` (query -> PMIDs) and `esummary` (PMIDs ->
  CSL-JSON items). `searchPubmed` takes an optional `from`/`to` publication
  date window.

All three sources are free and keyless. Every fetching function takes an
injected `fetchImpl` (defaulting to global `fetch`), so tests run against
the recorded fixtures under `test/fixtures/` rather than the network. A
`mailto`/`email` option, when given, identifies the caller to OpenAlex's and
CrossRef's polite pools and per NCBI's usage guidelines; it never gates
access. The record shapes themselves are not decoded here — the CSL-JSON
projections of an OpenAlex work, a PubMed summary, and a CrossRef work are
a data format's business and live in
`@red-cup-engineering/csl-json-services-section`.

### Systematic-review screening and journal watches

- `src/reference-screening.mjs` — the screening algebra:
  `makeSearchRecord` (one row of the search-audit trail),
  `dedupeKeyForItem`/`makeCandidateRecord` (a CSL-JSON item tagged with its
  dedupe key — `doi:<bare DOI>` when it carries a DOI, case-insensitively,
  else `title:<folded title>`; the fold is the house CSL-JSON
  `normalizeTitle`, the same one reconciliation and CrossRef verification
  compare titles with, so a near-miss title folds to a different key and is
  deliberately left unmerged), `dedupeCandidates`, `applyScreening`
  (defaulting unmatched candidates to `"pending"`), `prismaCounts` (the
  identified/deduplicated/screened/excluded-by-criterion/included tally a
  PRISMA flow diagram needs), and `includedCslItems`. Pure; no I/O.
- `scripts/screen-candidates.mjs` — reads a screening ledger and a decisions
  file from disk, dedupes and applies the decisions, writes the ledger back
  with its `screened` field populated, and prints the `prismaCounts`.
- `scripts/project-screened-candidates-csl.mjs` — a screened ledger's
  included candidates as one CSL-JSON array, the screening-ledger
  counterpart of `project-references-csl.mjs`.
- `src/reference-watch.mjs` — `dateWindow` (a rolling `YYYY-MM-DD` window
  ending "now") and `runWatch(spec, {ledger, now, fetchImpl})`, which runs
  every query in a `WatchSpec` against PubMed or OpenAlex over that window
  and appends a `CandidateRecord` only for results whose dedupe key the
  ledger does not already carry. A watch is an ordinary search with a date
  filter and a memory, so it composes the retrieval scripts above (with
  `from`/`to` and `filter`) rather than carrying a second client.
- `scripts/watch-literature.mjs` — reads a `WatchSpec` and a ledger from
  disk, runs the watch live, writes the ledger back, prints the
  new-candidate count. Queries run sequentially, throttled 1200ms apart by
  default: PubMed's anonymous E-utilities nominally allow 3 requests/second,
  but live testing (2026-09-02) still drew HTTP 429s at sub-second spacing.
- `content/config/watches/` — one `WatchSpec` per named watch, as data.
  `infection-associated-chronic-illness.json` covers long COVID, ME/CFS,
  post-exertional malaise, post-infective fatigue, and post-infection
  dysautonomia across both sources.

A screening ledger is one JSON document with three fields: `searches`
(`SearchRecord[]`), `candidates` (raw, before dedup), and `screened` (one
deduplicated candidate per unique DOI/title, each carrying a `status` of
`"pending"`, `"included"`, or `"excluded"` plus its named `criterion`). A
decisions file is a flat `ScreeningDecision[]` — `{dedupeKey, decision,
criterion}` — matched against `screened` candidates' `dedupeKey`s.

### Registers and source records

- `src/register.mjs` — `searchRegister(register, variables)`. A register is
  data, `{ query, item }`: a JSON API query (`http-services-section`
  `json-api-query`: RFC 6570 template, shared variables, RFC 6901 result and
  count pointers) and the CSL projection (`csl-json-services-section`
  `projection`) of one result. A section adds a register by writing that
  pair; no client is written.
- `src/source-record.mjs` — a source record: CSL-JSON items as read
  (`sources[].item`, plus the owning section's own row fields) and the
  searches run (`searches[]`, each with the ids it `included`, so a search
  including none records a null result). The record names its JSON Schema in
  `$schema`; that schema's `x-citation-policy` says which rows a note may
  cite (`uncitable`) and what a cited row carries (`requires`), and its
  `x-row-defaults` fill a newly read row. A note cites a row by its house
  citation label (`formatCitationLabel`), and its frontmatter `references:`
  map is derived from the rows it cites. `record-search`, `record-read`,
  `record-check` and `record-references` are its CLI verbs.

- `apps/bibliography-cli.mjs` — the composed CLI face over all of the above.

## Design note

Depth-1 `references:` map entries are validated under the closed contract
mirrored from `term-engineering-services-section`'s
`term.schema.json` (`additionalProperties: false`): authors, title, year
required; publication, publisher, translator, url, doi, note, eprint
optional. Depth-2 bibliography carrier frontmatter is validated for its
required fields (type, key, reference-type, authors, year, title) but is
*not* closed to additional bibliographic detail fields (journal, volume,
number, pages, ...): the specification states what a depth-2 carrier's
frontmatter carries without ruling it a closed vocabulary, and the
existing math-section corpus legitimately uses such fields.
