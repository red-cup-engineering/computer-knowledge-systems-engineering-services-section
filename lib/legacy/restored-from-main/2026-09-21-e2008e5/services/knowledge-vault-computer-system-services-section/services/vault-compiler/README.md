# @red-cup-engineering/vault-compiler

**Compile a knowledge vault — house frontmattered markdown, Obsidian, or a minimal-v1
org-roam — into the platform World JSON shape (`{ wingId, rooms, doors, halls, cards,
warnings }`) for consumers that need a read-only knowledge-vault graph.**
Read-only: nothing in this package ever writes into the vault it compiles (checked, not just
documented — see `read-only` in `src/compile.test.mts`).

The compiler provides a dialect detector, three file-discovery-and-parse adapters, wikilink
resolution, and World-shape validation. Its shared pipeline handles link resolution, FCA halls,
stability, cards, and layouts without writing into the input vault. Exact FCA runs through 500
distinct attributes and 1,024 closed intents. Either deterministic ceiling selects an explicit
greedy approximation and records a World warning, so a full vault is retained without claiming
an unbounded exact concept closure.

## Install

```sh
npm install @red-cup-engineering/vault-compiler --registry https://registry.561.group/
```

## The mesh, not a monolith

```
dialect.mjs ──detects──▶ 'house' | 'obsidian' | 'org'
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
   adapters/house-md   adapters/obsidian-md   adapters/org
   (frontmatter path-   (wikilinks, tags,      (#+TITLE:/#+FILETAGS:,
    fields = hard doors, aliases; "up:"-style   file: links; HONEST
    [text](x.md) = soft) wikilink fields = hard) v1 scope — see below)
              │               │               │
              └───────────────┼───────────────┘
                               ▼
                   compile.mjs (shared, dialect-neutral):
                   link resolution → promotion rule → FCA halls
                   (fca.mjs) → stability (stability.mjs) → cards
                   (cards.mjs) → canonical.mjs's assembleWorld()
                               │
                               ▼
                         World (platform JSON)
                               │
                               ▼
                    build-layout.mjs → { positions, katas }
```

Every adapter exports exactly four functions — `discoverFiles`, `parseRoom`, `buildIndex`,
`resolveLink` — and returns per-file `{ room, hardCandidates, softCandidates }`. The shared
pipeline in `compile.mjs` (link resolution, the zero-hard-doors-in promotion rule, FCA hall
computation, hall stability, card generation) is the SAME code for every dialect — this is what
the seam digest found was already true of lantern-service's own `compile.mts` before this
package existed, just newly reachable by three adapters instead of one hard-wired house parser.

## Dialects

### `house` — the original lantern-service corpus convention

Frontmatter fields shaped like a `.md` path (any field name) are hard-door candidates;
`[text](path.md)` links anywhere in the body are soft-door candidates. `WingConfig` exposes
`titleField`/`aliasFields`/`kindField`/`dateField`/`archivalField`/`descriptionField` overrides
for the 7 originally-hardcoded house key names. The house fixture covers archival provenance,
typed halls, frontmatter path fields, and body-link promotion.

### `obsidian` — foreign, honestly degraded

Most Obsidian vaults declare no frontmatter path-field convention, so hard-door candidates are
usually empty and **every door comes from `[[wikilink]]`s**, promoted to hard by the same generic
zero-hard-doors-in rule house already had — "doors from links only" is not a special case, it
falls out of the existing rule for free. Halls draw from `tags` (frontmatter `tags:` merged with
inline `#hashtag`s — real Obsidian tag semantics). `kind` defaults to `'note'` (not house's
`'unknown'`) when absent. `dateCreated` is usually absent, which `kata.mjs`'s own doc comment
already covers (auto-kata DFS start ordering falls back to room-id order). Aliases feed both
`Room.aliases` and wikilink resolution. Wikilinks resolve by the **shortest-unique-path rule**
(see `wikilink.mjs`): among every note whose title or alias matches, the one reachable by the
fewest path segments wins, unless that minimum is tied, in which case it's reported ambiguous
rather than guessed — exactly the discipline the equivalent house/org basename resolver already
applies to genuine basename collisions.

### `org` — HONEST V1 SCOPE

Reads `#+TITLE:`, `#+FILETAGS:`, `#+DATE:`, and `[[file:target.org][Description]]` links (basename
resolution, same mechanism as house's `.md` links). Every other `#+DIRECTIVE:` is
recognized-and-skipped, not interpreted. `[[id:...]]` org-roam ID links are silently ignored — out
of v1 scope, no vault-wide ID index exists to resolve them against. No hard-door convention is
parsed (no PROPERTY drawers, no `:ROAM_ALIASES:`) — doors come entirely from file links, the same
"links only" degradation Obsidian gets. See `src/adapters/org.mjs`'s own doc comment for the full,
disclosed list of what v1 does not read. A vault that needs more should wait for a v2 org adapter
or pre-convert to house/Obsidian.

## What's here

- **`@red-cup-engineering/vault-compiler/dialect`** — `detectDialect(root, options)`: `.obsidian` directory
  (authoritative) → `'obsidian'`; `.org` file majority → `'org'`; house frontmatter marker fields
  (`type`/`cites`/`date-created`) or structural default → `'house'`. An explicit `override`
  always wins.
- **`@red-cup-engineering/vault-compiler/compile`** — `compileVault(root, wingConfig, options)` (the general
  entry point, returns `{ world, dialect, dialectReason }`). Select the house dialect
  with `{ dialect: "house" }` and consume its `world`.
- **`@red-cup-engineering/vault-compiler/canonical`** — `WORLD_JSON_SCHEMA`, `validateWorld` (zero
  dependencies — no ajv), `assembleWorld` (the one place every compile's output is required to
  conform before it becomes a returned `World`), `canonicalStringify` (stable-key JSON, used by
  the determinism test and available to any caller who wants byte-identical output guarantees).
- **`@red-cup-engineering/vault-compiler/wikilink`** — Obsidian `[[wikilink]]` extraction and
  shortest-unique-path resolution.
- **`@red-cup-engineering/vault-compiler/docindex`** — shared basename-based resolution for house/org's
  literal-path link conventions.
- **`@red-cup-engineering/vault-compiler/walk`** — shared, dialect-neutral file discovery. The ONE place
  `teraum` exclusion is implemented (always, unconditionally, not overridable by
  `excludeGlobs` — see `isTeraumNamed`), plus `node_modules`/`.git`/any hidden directory.
- **`@red-cup-engineering/vault-compiler/adapters/house-md`**, **`/adapters/obsidian-md`**,
  **`/adapters/org`** — the three dialect adapters.
- **`@red-cup-engineering/vault-compiler/frontmatter`**, **`/fca`**, **`/stability`**, **`/cards`**,
  **`/kata`**, **`/build-layout`** — vendored, dialect-neutral, from lantern-service (see each
  module's own doc comment for provenance).
- **`@red-cup-engineering/vault-compiler`** (bare) — re-exports all of the above from one module.

## Fixtures

`fixtures/house-corpus/` — 5 hand-built files (4 rooms + 1 `provenance:`-archival file) exercising
the house convention end to end. `fixtures/obsidian-vault/` — 19 hand-built notes (18 real rooms +
1 `teraum-secret/` note that must never compile) with wikilinks, aliases, frontmatter + inline
tags, two folders, a duplicate-basename-at-equal-depth ambiguity case, and a duplicate-basename-at
-different-depth shortest-unique-path case. `fixtures/org-roam/` — 5 hand-built `.org` files
exercising `#+TITLE:`/`#+FILETAGS:`/`#+DATE:`, file links, an unresolved link, and an ignored
`[[id:...]]` link. Every adapter, `dialect.mjs`, `canonical.mjs`, and the shared pipeline are
tested against these fixtures — 61 active tests (`node --test`).

## Verified

`npm run check && npm test` — **61 passing, 0 failing, 0 skipped** (`node --test
src/*.test.mts src/adapters/*.test.mts`), including:

- Every adapter over its own fixture (house/obsidian/org).
- Dialect detection (all three signals + explicit override).
- shape conformance: every dialect's output validated against `WORLD_JSON_SCHEMA`
  (derived from lantern-service's `src/types.mts`), plus schema-rejection tests (missing field,
  wrong type, invalid enum) proving the validator actually discriminates.
- Determinism: two independent compiles of the same fixture are byte-identical
  (`canonicalStringify` equal) for all three dialects.
- Exclusion: `teraum`-named paths never compile into a room under any dialect (checked structurally
  AND via a warning-not-silent-drop assertion on a link into an excluded path), plus
  caller-supplied `excludeGlobs`.
- Read-only: a before/after size+mtime snapshot of the fixture vault proves compiling never
  modifies it, PLUS a static-source check that no write-capable `fs` call appears anywhere in the
  vault-reading modules.
- The fixed house fixture verifies its expected rooms, prerequisite doors, halls, archival
  provenance exclusion, and deterministic canonical output without requiring a sibling package.

## Packaging

Runtime source is `.mjs`, with hand-written `.d.ts` alongside every module. Node does not
type-strip `.mts`/`.ts` once resolved from inside a consumer's `node_modules`, so a package meant
to be `npm install`ed by other services cannot ship `.mts` as its actual entry points. `.test.mts` files
stay `.mts` (run via `node --test` from this package's own directory, never resolved through a
consumer's `node_modules`) and import the `.mjs` runtime plus `import type` from the co-located
`.d.ts` files.

Zero runtime dependencies.

## What this package deliberately does not do

- It does not implement a v2 org adapter (PROPERTY drawers, TODO states, `:ROAM_ALIASES:`,
  `id:`-link resolution) — see `src/adapters/org.mjs`'s own disclosed scope.
- It does not write anything, anywhere, ever — no "sync back to the vault," no cache file, no
  lockfile. Every artifact this package produces (`World`, `Layout`) is returned to the caller in
  memory; what a caller does with it (e.g. lantern-service's `vaultmaze` bin writing
  `web/data/*.json`) is the caller's own responsibility, not this package's.
- It does not choose a rendering/game engine — `World`/`Layout` are plain JSON; VaultMaze is one
  consumer, not the only one this contract is meant to support.

## License

No `license` field is declared. Published to the private registry at
`https://registry.561.group/`, not to the public npm registry.
