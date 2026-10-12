# corpus-normalizer

A Node.js CLI that moves files and directories from a source tree into a destination whose path shape determines the target form (glossary term, triage note, dated note, bibliography, application, or service section). It inventories the source, plans a projection of the destination, validates that projection against the destination's rules, and only then applies the change and retires the covered source files. It also inspects and safely unpacks tar archives, detects near-duplicate content, and compares/retires superseded copies of a tree against a live counterpart.

Requires Node.js 20 or newer. No external runtime dependencies.

## Cheap note sorting

```sh
note-keywords content/text/documents/articles/notes

match-note-sections content/text/documents/articles/notes \
  --services-root /path/to/science-services-section \
  --services-root /path/to/engineering-services-section \
  --services-root /path/to/operations-services-section \
  > sorting.tsv

# Fill the final owner column for the rows you accept.
move-sorted-notes sorting.tsv
```

`note-keywords` removes common prose and code words and reports what distinguishes each note from its neighbors. `match-note-sections` compares those terms with live service names, package descriptions, and README introductions, then emits one editable TSV. `move-sorted-notes` moves rows whose final `owner` column has been filled into that owner's dated `content/text/documents/articles/notes/` directory.

## Install

```sh
npm install
```

This exposes the `corpus-normalizer` bin (see `package.json`); run it directly with `node ./scripts/corpus-normalizer.mjs` or via `npm exec corpus-normalizer`.

## Usage

A typical run:

```sh
corpus-normalizer plan SOURCE DESTINATION --output plan.ndjson
corpus-normalizer explain plan.ndjson
corpus-normalizer materialize --plan plan.ndjson --output /tmp/projected
corpus-normalizer validate --form FORM --root /tmp/projected
corpus-normalizer apply --plan plan.ndjson --materialized /tmp/projected
corpus-normalizer verify --plan plan.ndjson --materialized /tmp/projected
```

`plan` walks `SOURCE` and, based on `DESTINATION`'s path shape, proposes one action per file (write, copy, skip as already-covered, or reject as invalid). `materialize` builds the proposed destination tree in a scratch directory without touching the real source or destination. `validate` checks that tree against the target form's rules. `apply` performs the write for real and deletes only the source files it copied. `verify` re-checks the applied result against the plan.

For a source with many independent files, `route` splits the same work into per-file tasks; `prepare-task` stages one task at a time so each can be reviewed with the `materialize`/`validate`/`apply`/`verify` steps above before the next task starts. `receipt-task` records that a task finished, and `complete-route` checks that every task in a route has a receipt.

### Commands

```text
plan SOURCE DESTINATION --output PLAN.ndjson [--rewrite-map JSON]
explain PLAN.ndjson
materialize --plan PLAN.ndjson --output TEMP_ROOT
validate --form FORM --root ROOT
apply --plan PLAN.ndjson --materialized TEMP_ROOT
verify --plan PLAN.ndjson --materialized TEMP_ROOT

route SOURCE DESTINATION --output ROUTE.ndjson [--max-records N] [--max-tasks N] [--chunk-size N]
explain-route ROUTE.ndjson
prepare-task ROUTE.ndjson TASK_ID --output ARTIFACT
receipt-task ROUTE.ndjson TASK_ID --artifact PLAN.ndjson --materialized OVERLAY --output RECEIPT.json
retire-archive ROUTE.ndjson TASK_ID --manifest ARCHIVE-MANIFEST.json --nested-completion COMPLETION.json --output RECEIPT.json
complete-route ROUTE.ndjson --receipt RECEIPT.json [--receipt RECEIPT.json ...] --output COMPLETION.json

inspect-archive ARCHIVE --output INVENTORY.ndjson [archive limits]
unpack-archive ARCHIVE --output TEMP_ROOT [--strip-wrapper] [archive limits]
verify-archive --manifest MANIFEST

analyze-similarity INPUT.ndjson --root ROOT --output EVIDENCE.ndjson [similarity options]
compare-trees CANDIDATE LIVE --form application|service-section --output COMPARISON.ndjson [comparison options]
assess-legacy CANDIDATE LIVE LEGACY --form application|service-section --date YYYY-MM-DD --slug SLUG --output ASSESSMENT.json [legacy options]
```

`validate --form` accepts `term`, `triage-text`, `note`, `reference-source`, `application`, `service-section`, or `bibliography`.

### Destination forms

The destination's path shape (not the source) selects the form:

| Destination shape | Form | Accepted input | Output layout |
| --- | --- | --- | --- |
| `content/text/glossary/terms` | `term` | Markdown or Org terms | one flat directory, filenames, deduplicated by identity |
| `content/text/triage` | `triage-text` | `.md`, `.org`, `.html`, `.txt`, `.tex` | one flat directory, basenames |
| `content/text/documents/articles/notes` | `note` | `.md`, `.org`, `.html` notes | `YYYY/MM/DD/YYYY-MM-DD-slug.ext` or `undated/slug.ext` |
| `content/text/documents/articles/bibliographies/sources` | `reference-source` | flat `.pdf`, `.epub`, `.html`, `.htm`, `.md`, `.org`, `.txt`, `.tex`, `.ris` | flat filenames |
| `apps/NAME` | `application` | one package root (`package.json`, `pyproject.toml`, `Cargo.toml`, or `go.mod`) | authored tree preserved, generated roots (e.g. `node_modules`, `.venv`) excluded |
| `services/NAME-services-section` | `service-section` | one service-section root, including nested sections | authored relative tree preserved |
| `bibliography.bib` | `bibliography` | BibTeX plus Markdown/Org with citation metadata | one parsed aggregate, merged only on exact key/entry match |

Anything else is `unsupported` and produces no plan.

Terms derive their identity from `defines`/`name`/`title` frontmatter, an Org identity directive, a heading, or finally the filename. Notes derive their date from the filename, frontmatter, or `YYYY/MM/DD` ancestry, defaulting to `undated`. Reference-source text must be strict UTF-8, non-executable, and under 16 MiB; PDF/EPUB payloads are copied opaquely. A standalone notebook (`.ipynb` or Jupytext `.py`) is only admitted into an existing application with a `notebooks/` directory; `--rewrite-map` there does an exact, literal rename of Python import identifiers in notebook code — it does not check API compatibility.

### Archives

Only uncompressed tar (`.tar`) and gzip tar (`.tgz`/`.tar.gz`) are supported — ZIP is rejected. `inspect-archive` and `unpack-archive` reject absolute paths, path traversal, duplicate members, links, device files, corrupt checksums, and truncated or padded data; only regular files and directories are admitted. Extraction is only allowed into a fresh, absent directory under the host temp root or `/var/tmp`. `--strip-wrapper` removes one common top-level directory, but only after inspection confirms it exists on every member. Defaults: 10,000 members, 1 GiB expanded, 256 MiB per member, 1,024-character paths, 32 path components — override with `--max-members`, `--max-expanded-bytes`, `--max-member-bytes`, `--max-path-length`, `--max-nesting`, `--high-water-mark`.

```sh
corpus-normalizer inspect-archive old.tgz --output /var/tmp/old.inventory.ndjson
corpus-normalizer unpack-archive old.tgz --output /var/tmp/old-unpacked --strip-wrapper
corpus-normalizer route /var/tmp/old-unpacked LIVE-SERVICES-SECTION --output /var/tmp/old.route.ndjson
```

### Similarity and legacy comparison

`analyze-similarity` reports exact-byte, normalized-text, and bounded near-text matches over a set of files under `--root`; it only reports evidence and never merges or edits anything. Defaults: threshold `0.9`, bucket size `200`, up to 2,000,000 candidate pairs, 10 MiB body size — override with `--threshold`, `--max-bucket`, `--max-candidates`, `--max-body-bytes`, `--token-cache`, `--trust-source-hash`, `--temp-dir`.

`compare-trees` classifies a candidate tree against a live tree as exact, a subset of live, additive without conflict, or divergent. `assess-legacy` applies that comparison to decide what to do with an old copy:

| Comparison result | Decision |
| --- | --- |
| Candidate exact or covered by live | `covered-by-live` — no legacy copy kept |
| Candidate adds files without conflict | `fuse-into-live` — no legacy copy kept |
| Divergent, already covered by an existing legacy witness | `covered-by-legacy` |
| Divergent, additive superset of one legacy witness | `replace-covered-legacy-family` (review) |
| Otherwise divergent | `retain-divergent-review` (review) |

## Development

```sh
npm test
```

`test/*.test.mjs` runs under `node --test`, serially, since some tests exercise host-temp workflows.

## Provenance

This application was the 561 Group's corpus normalization services section (`@561-group/561-group-corpus-normalization-fall-2026-services-section`), deleted on 2026-09-13 in "Normalize 561 Group content and service structure" (ccf2d7a0d) with no live successor, and restored from main's history into legacy on 2026-10-10.
It is seated here, among the knowledge systems that own terms, bibliographies and the corpus census, from its complete tree as it stood before that deletion.
Carried forward against the current term carrier: a Markdown term keeps its filename-stem carrier identity, while duplicates and conflicts are grouped by what it defines (`definesIdentity`) and compared by its definition apart from that identity (`definitionSha256`); a covered duplicate expects its canonical's bytes; staged terms gain their carrier identity before description seating; tests that assumed the pre-identity carrier now assert its canonical form.
