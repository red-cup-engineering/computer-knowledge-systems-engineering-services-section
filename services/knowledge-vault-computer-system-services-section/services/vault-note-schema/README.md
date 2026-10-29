# Vault Note Schema

JSON Schema contracts for treating any directory as a vault of markdown
notes — read, write, query, and ingestion-profile shapes — plus a vault
website publish request/receipt contract, and a Diataxis (tutorial/how-to/
explanation/reference) mode-and-coverage classification read over markdown
document text, transported through the shared claim-charge vocabulary over the canonical science FOUR
bilattice.

Relocated from `@red-cup-engineering/metroplat`'s
`src/integrations/knowledge-vaults/{notes,publish,schema,codec}.mts` per the
2026-09-05 ruling (`561-group-services-section/data/records/2026-09-05-ruling-metroplat-is-a-marsh-library.json`):
a capability implemented inside metroplat's `src/integrations/*` is not
metroplat's to keep; it belongs in its own topic section as an operation
package, with metroplat reduced to a thin consumer.

This package carries the pure contract/algebra layer only — the `kind`
literal on each contract is unchanged from its metroplat origin
(`metroplat.knowledge-vault.*`, `metroplat.vault-website-publish.*`) because
metroplat's own `vault.mts`/`services/notes.mts`/`services/publish.mts`
still construct and emit those exact literals; only the schema `$id`
(an internal AJV addressing concern) was renamed off the `metroplat/`
prefix. The effectful vault-ingestion, wikilink-resolution, and
static-website-publish legs remain in metroplat: they compose metroplat's
own markdown/CSL/JSON codecs, its Article/Page site model, its
static-website generator, and its RPC operation registry — none of which
this package owns or relocates. See the finding record
`561-group-services-section/data/records/2026-09-11-finding-metroplat-knowledge-vault-content-kernel-coupling.json`
for why that heavier layer stayed put in this lot.
