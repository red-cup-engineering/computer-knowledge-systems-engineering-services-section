# provenance-engineering-services-section

Engineering policy and operations for the provenance census: a deterministic
instrument that grades every science carrier by who its claims come from,
so an agent can tell owner-stated theory from agent extrapolation without
reading prose. Owner, 2026-09-04: "a lot of how Obsmetrologia frames stuff
is thin vibes extrapolated from my talking in sessions that aren't
recoverable"; and the working-discipline law: "Before enforcing any law
found in a document, check its provenance: who ruled it, where, when.
Owner-stated rules cite the owner; everything else is a proposal."

Seated as a direct sibling of `bibliography-engineering-services-section`
under `computer-knowledge-systems-services-section/services/`: provenance
grading, like bibliography reconciliation, is its own carrier-class
measurement rather than a subtype of another system.

`services/research-product-admission-service` receives an explicitly supplied
research corpus, validates its evidence contract, and writes immutable product
admissions. It does not own scientific packets or citations.

## Grades

Computed, never asserted, in priority order:

- `owner-authored` — frontmatter `authors` is exactly `emsenn`, or the
  carrier is a `personal-log-entry` under `emsenn-services-section`.
- `owner-attributed-located` — the body carries an owner-attribution marker
  ("owner-stated", "owner-ruled", "owner verbatim", "owner:",
  "founder-ruled", "owner movement", "emsenn (", "(owner,", "the owner
  said") whose own paragraph also carries a locator (an ISO date, a
  transcript path, or a personal-log path).
- `owner-attributed-unlocated` — an owner marker present, none located.
- `agent-cited` — agent-or-absent authors, no owner markers, and at least
  one of a `references:` map, a Lean module citation, or an inline
  `[@citekey]` citation.
- `agent-uncited` — none of the above.

## Operations

- `src/provenance-census.mjs` — pure grading: `classifyAuthors`,
  `ownerMarkers`, `gradeOf`, `assessCarrier`, `summarize`, `assembleRecord`,
  plus the exclusion (`shouldExcludeCarrierPath`) and subsection
  (`deriveSubsection`) predicates.
- `scripts/census-set-of-carrier-provenance.mjs` — walks a scope (default:
  `science-services-section`, excluding `lib/legacy`, `triage`,
  `node_modules`, `.git`, `dist`, and `lib/obsmetrologia/docs`), reads each
  carrier through `@red-cup-engineering/read-markdown-file-service` and
  `@red-cup-engineering/read-markdown-frontmatter-service`, and writes the
  dated JSON record plus a sibling rows TSV to
  `561-group-science-services-section/data/records/`. Flags: `--root`,
  `--out-dir`, `--date`, `--limit`.

## Design note

The record is an aggregate fold (grade counts overall and per subsection,
the owner-attributed-unlocated inventory, the owner-located ratio per
subsection, the ten most-marked unlocated carriers) — deterministic given
the same corpus, aside from its `checkedAt` timestamp. Per-carrier detail
lives only in the sibling rows TSV, never duplicated into the JSON.
