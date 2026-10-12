---
title: VICTOR System Architecture Specification
date-created: 2026-08-26
status: draft-for-review
tags:
- victor
- sas
- website-engineering
- living-web
- architecture
- specification
---


## 1. Introduction

### 1.1 Purpose of this document

This specification defines the architecture of VICTOR: its requirements, its information model, its subsystem decomposition with the interfaces between subsystems, its externally visible surfaces (URLs, artifacts, checks, refusals), the decisions that shaped it with the alternatives they rejected, and the disposition of every prior system it absorbs. It is written for the person implementing VICTOR, the person extending it, and the person judging whether a proposed change belongs in it. The high-level design maps this architecture to packages; low-level designs specify components to the function level; where documents disagree, this SAS wins until amended by a dated revision.

### 1.2 System identification

VICTOR — Voxelized Information Catalog Topos Orienting Relations — is a website framework: software that turns domain applications and authored content into complete, conformant, served websites. It is the engineering realization of the Living Web initiative (Living Web Science Services Section): conformance to living standards is a property the build verifies on every run and reports as data.

### 1.3 Scope

In scope: content ingestion, the catalog model, downstream domain-application composition, TUFTE user-interface integration, theming, site structure, structured-data and feed emission, discovery and federation surfaces, conformance checking, live and static serving, and the author command surface. VICTOR does not duplicate the browser-application capability TUFTE owns or the protocol capabilities of upstream services. Out of scope for this document: package layout (HLD), function-level component design (LLD), and provider-specific deployment (carrier repositories).

### 1.4 Definitions

- **Cell** — the unit of content: one authored document with its metadata and asserted relations. The "voxel" of the system's name.
- **Name** — a cell's stable identity: a URL path and corresponding subject IRI that survive revision.
- **Address** — an RFC 6920 `ni:///sha-256` URI identifying one exact revision of one cell by content.
- **Catalog** — the assembled value: all cells, the name map, the redirect map, the relation index.
- **View** — a subset of the catalog selected by type, tag, status, section, or relation; itself a catalog.
- **Relation** — a typed, directed edge between two names (or a name and an external IRI), with provenance.
- **Projection** — a pure function from a view and a site configuration to artifacts plus a report.
- **Artifact** — one emitted file or response body: a page, a feed, a JSON-LD document, an index shard.
- **Release** — the complete artifact set of a static build, sharded by content address, with manifest.
- **Refusal** — a typed value naming a failure: what refused, why, where. Blocks release.
- **Advisory** — a typed value naming a concern that does not block release. Reported alongside refusals.
- **Anatomy** — the closed set of page-level partials: masthead, breadcrumb, spine, reservoir, colophon.
- **Reservoir** — the margin `aside` present on every published page: sidenotes, citations, backlinks, neighborhood.
- **Atlas** — the site's tiled macro-view surface. **Neighborhood** — the per-cell tiled relation surface.
- **Jewel** — the single accent color a theme may use; at most one accent use-class per page.
- **Dialect** — the house Markdown: CommonMark plus wikilinks, transclusion, citations, callouts, inline fields, footnotes.
- **Earned addition** — the growth rule for every closed set: a member enters on three independent, cited uses.
- **Jiangshi criterion** — the acceptance test for structural joints: soft, local, reversible, evidenced by real use.
- **TUFTE** — Tiling User Form Topology Engine: the browser user-interface engine VICTOR consumes.

### 1.5 Companion notes

This directory is self-sufficient: the knowledge this SAS depends on is stated in full in its sibling notes, and a developer holding only this directory can implement the system. The companions are: *TUFTE As Built* (the renderer's complete contract, model, semantics, and gaps), *VICTOR Authoring Dialect Specification* (the source language and the exact HTML each construct renders), *VICTOR Design Rules* (every design law with its numbers, machine-checkable where possible), *Standards Facts for VICTOR* (the external standards' actual thresholds, formats, and protocol wire shapes as of 2026-08-26), *VICTOR Engineering Practices* (the build, test, release, and documentation rules with their reasons), and *Note on the VICTOR Mandate* (the 2026-08-26 rulings this SAS executes).

## 2. Stakeholders and architectural drivers

### 2.1 Stakeholders

- **The operator-author** (Morgan Sennhauser): writes in the dialect, runs the CLI, owns every deployed site. Optimizes for: writing without leaving prose, refusals that read as editing feedback, no build-tool ceremony.
- **Agent collaborators**: AI sessions that author content, run builds, and maintain sites. Optimize for: deterministic behavior, typed outputs, doctested documentation that cannot drift.
- **Readers**: the public, including assistive-technology users, keyboard-only users, print readers, no-JS and CSS-off readers, and readers on constrained connections. The quality requirements treat these as primary, not edge cases.
- **Machine consumers**: search crawlers, AI answer engines (which now extract entities from schema.org markup), feed readers, Webmention senders and receivers, fediverse peers.
- **Site deployments**: 561.group and subdomains, emsenn.net, and the VICTOR handbook site — the permanent dogfood.

### 2.2 Drivers

1. **The convergent gap.** The 2026 field survey finds page-tree publishers (Hugo, Astro, Eleventy, Ghost) and graph publishers (Quartz, TiddlyWiki, Obsidian Publish) almost never serve both a conventional site and a queryable relational surface from one model. The L-Space deployment record independently defers exactly that interface ("typed semantic-neighborhood and multi-projection TUFTE explorer"). VICTOR exists to close this gap.
2. **Conformance as identity.** Roughly 96% of surveyed top homepages fail WCAG; overlay remediation has drawn regulatory action. Accessible-by-construction output, verified continuously, is both the house ethic (AAA floors already govern the visual language) and the durable differentiation.
3. **Coherent machine surfaces.** JSON-LD is now load-bearing for search and AI answer engines, and it drifts from page content in every mainstream tool because it is authored separately. Deriving both from one model makes drift structurally impossible.
4. **House continuity.** The corpus's conventions — content trees, front-matter vocabulary, the dialect, ISO dates, the visual language, TUFTE — are constraints, not preferences. VICTOR serves the corpus as it is.
5. **The attention-budget lesson.** Five prior site-engine generations were built and pruned. The mandate rules this a consequence of attention budgets, not flawed architecture; VICTOR therefore absorbs proven code deliberately (§13) and bounds its own scope by refusals (§10) so it survives attention scarcity.

## 3. System context and external interfaces

VICTOR is one package with these external interfaces:

| Interface | Direction | Contract |
|---|---|---|
| Content trees | in | Filesystem directories of dialect Markdown + YAML front matter + media assets, in the corpus `content/` conventions. Version control is the author's concern; VICTOR reads working trees. |
| Site configuration | in | One validated file per site (§6.8). |
| Themes | in | Token manifest + optional partial overrides + font assets (§6.7). |
| TUFTE | out (dependency) | `@red-cup-engineering/web-tufte-gui-services-section` ≥0.4.1: VICTOR authors tile models, calls `renderTufteFragment` for embedded grids and `normalizeTufteModel` before authoring; never `renderTufteDocument` (VICTOR owns the page shell). TUFTE's browser layer is optional enhancement on tile surfaces. Changes VICTOR needs from TUFTE go through TUFTE's evidence gate as TUFTE work (§14, R-6). |
| HTTP clients | out (serving) | Pages, artifacts, content negotiation per §9.1; live-mode dynamic endpoints per §7.6. |
| Webmention peers | in/out | Receipt endpoint (live); source-verification fetch on receipt; sending on publish (live). |
| Fediverse peers | in/out | ActivityPub actor/outbox/object documents (both modes, as static documents); inbox and signed delivery (live mode only). |
| Validators | internal | The conformance suite embeds its checkers (§7.5); no network validation service is depended on at build time. |
| Deployment carriers | out | A carrier imports the package and owns provider configuration only; no provider concept appears in VICTOR. |

## 4. Requirements

### 4.1 Functional requirements

- **F1 Ingest.** Assemble a catalog from one or more content trees: parse front matter and dialect, mint addresses, build the name map, redirect map, and relation index.
- **F2 Render pages.** Render every cell as a complete semantic HTML page with the full anatomy and the reader surfaces of §7.3.
- **F3 Derive structure.** Section indexes, taxonomy pages, the four navigation systems, pagination, redirects, error pages.
- **F4 Serve relations.** Backlinks, typed neighborhood, and citations inside every page; the atlas and neighborhood tile surfaces as dedicated pages.
- **F5 Emit machine surfaces.** Per-subject JSON-LD and Turtle; RSS, Atom, and JSON feeds; sitemap; well-known documents including RFC 6920 resolution; microformats2; ActivityPub documents; the static search index.
- **F6 Dual-mode serving.** Live server and static freezer from one configuration; identical page content; explicit degradation manifest for dynamic surfaces in static mode.
- **F7 Editorial lifecycle.** The four statuses with their build semantics; corrections as first-class published cells; revision history per cell.
- **F8 Addressing.** Stable name per cell; content address per revision; both resolve; renames leave permanent redirects.
- **F9 Author tooling.** `serve`, `build`, `check`, `new`, `release`; typed refusals and advisories per the catalog of §9.4; the doctested handbook.

### 4.2 Quality requirements

- **Q1 Conformance.** Every HTML artifact validates against the WHATWG HTML Living Standard; ARIA usage validates against ARIA in HTML (W3C REC 2026-04-15); the machine-checkable WCAG 2.2 subset passes. Verified per build; failures enumerated; none ship silently.
- **Q2 Accessibility floor.** WCAG 2.2 AAA contrast (7:1 body; 4.5:1 at display sizes ≥24px); visible focus never removed without replacement; authored order equals DOM and tab order in every projection including tile surfaces, by test.
- **Q3 Resilience.** Every page complete, ordered, and navigable with CSS disabled and with JavaScript disabled. Client scripts enhance only.
- **Q4 Determinism.** Same catalog plus configuration yields byte-identical artifacts, verified by double-build comparison. No wall-clock, randomness, or environment reads in any projection.
- **Q5 Coherence.** The structured data emitted for a page and the claims the page renders are checked against each other; divergence fails the build.
- **Q6 Honesty.** Orderings stated in visible text; visual adjacency never implies unasserted semantic distance; retractions and corrections displayed, never hidden; capability gaps named in reports rather than silently absent.
- **Q7 Performance envelope.** Full build of a 10,000-cell catalog completes on operator hardware without pruning features to do so; incremental rebuild in live mode re-derives only cells affected by a change and their dependents. (Numeric targets are HLD work; the architectural obligation is the dependency tracking that makes incrementality possible.)

Traceability from requirements to subsystems and verifications: §15.

## 5. Architectural overview

VICTOR is a pipeline of pure functions over one value:

```
content trees ──readers──▶ CATALOG ──projections──▶ artifacts + BUILD REPORT
                              │                            │
                              └────────── serving ─────────┤
                                                 live server │ static freezer
```

Constitutive principles:

1. **One model.** The catalog is the only state, assembled fresh (or incrementally revalidated) each build. Projections read the catalog and the site configuration and nothing else; no projection reads another projection's output. Coherence between surfaces is therefore structural, then additionally checked (Q5) as a guard on the implementation.
2. **Everything is a value.** Cells, catalogs, artifacts, reports, refusals, themes, and configurations are data. The build report supports meet, join, and difference, so comparing builds is algebra, not log reading.
3. **Closed sets, earned growth.** Every vocabulary — types, fields, dialect features, partials, projections, checks, refusals — is enumerated in this SAS and grows only by earned addition, through the procedure of §12.4.
4. **Refusal is data.** No failure path throws past the boundary or logs-and-continues; every failure is a catalogued refusal or advisory in the report.
5. **Joints pass the Jiangshi criterion.** A subsystem boundary that cannot be tested across, reversed, or evidenced by a real consumer is not drawn.

## 6. Information view

The schemas below are normative in shape and field name; language-level typing is HLD work. Notation is informal TypeScript.

### 6.1 Cell

```ts
interface Cell {
  name: Name                      // stable: URL path, e.g. "notes/2026-08-26-victor-sas"
  address: NiAddress              // ni:///sha-256;… of this revision's canonical form
  type: ContentType               // §6.2
  title: string                   // required; lint A-02 on generic titles
  eyebrow?: string
  summary?: string                // feeds, listings, JSON-LD description; first paragraph serves if absent
  dateCreated: IsoDate            // required, authored
  dateRevised?: IsoDate           // derived from revision history, never authored
  status: 'potential' | 'active' | 'stable' | 'absurd'
  tags: Tag[]                     // kebab-case
  references: Record<CiteKey, Reference>   // CSL-shaped: authors, title, publication, year, …
  body: Block[]                   // parsed dialect AST (§6.3); never raw unparsed text
  relations: Relation[]           // asserted by this cell (derived from body + front matter)
  extra: Record<string, unknown>  // pass-through; invisible to machine surfaces until earned in
}
```

**Canonical serialization and addressing.** A cell's address is the SHA-256 of its canonical serialization: deterministically encoded CBOR (RFC 8949 §4.2 core deterministic encoding) of the cell value excluding `address` itself. This continues the house practice already deployed in the RMN stores (`data/rmn/sha-256/<2-char>/<base64url>.rmn.cbor`) and the `ni` URIs of the MAPE stage schema; VICTOR's release store uses the same two-character fan-out layout. The byte-level field ordering and normalization rules are LLD work under this decision (AD-03).

### 6.2 Content types

Closed set. A type binds four things at once so they cannot disagree:

| Type | Default template | schema.org type | Syndicates | Listing behavior |
|---|---|---|---|---|
| article | article | Article | yes | dated, summary shown |
| note | note | Article (with genre "note") | yes | dated, summary shown |
| letter | letter | Message | yes | dated, addressee shown |
| glossary-term | term | DefinedTerm | no | alphabetical |
| glossary-topic | topic | DefinedTermSet | no | alphabetical |
| record | record | Dataset or CreativeWork per subtype | corrections feed only | dated, machine-leaning |
| index | index | CollectionPage | no | n/a (is a listing) |
| page | page | WebPage | no | unlisted by default |
| paper | paper | ScholarlyArticle | yes | dated, one index/archive entry, lists its chapters in order |
| chapter | chapter | Chapter | no | unlisted; found through its paper's entry, in `order` |

A chapter's front matter carries `part-of` (its paper's cell name, asserting a
`part-of` relation) and a positive integer `order`; both are required and a
missing or invalid one is refusal R-03. The catalog groups chapters under
their resolved paper, sorted by `order`, so the index and archive renderers
can list a paper as one entry linking its chapters in that sequence.

### 6.3 Body and dialect

The dialect is CommonMark plus the closed feature set below, parsed once, at build time, by one implementation (extracted from the L-Space release compiler's renderer — §13). The AST (`Block[]`) is the normative body form; HTML is a projection of it.

| Feature | Syntax | Semantics | Relation asserted | On failure |
|---|---|---|---|---|
| Wikilink | `[[name]]`, `[[name\|label]]` | Anchor to the target's page, target type in a data attribute | `links` | Unresolved: renders as a marked potential link (visibly distinct, not color-only); advisory A-01 |
| Transclusion | `![[name]]`, `![[name#section]]` | Target body (or section) embedded in a provenance-marked figure linking home | `transcludes` | Cycle: refusal R-05. Unresolved: A-01, placeholder rendered |
| Citation | `[@key]` | Author-year in place; full reference in the reservoir beside the citing paragraph | `cites` (to the reference entity) | Unknown key: refusal R-03 |
| Callout | `> [!note]`, `[!caution]`, `[!evidence]` | Semantic `aside` with visible text label, never icon-only | — | Unknown callout type: advisory, rendered as plain quote |
| Inline field | `key:: value` | Typed relation from this cell; value may be a wikilink or literal | `key` (must be in the relation vocabulary) | Unknown key: advisory; passes to `extra` |
| Footnote | `[^n]` | Margin-first sidenote (§7.3); endnote under CSS-off | — | Orphan mark/def: refusal R-03 |

### 6.4 Relation

```ts
interface Relation {
  from: Name
  type: RelationType              // closed: links, transcludes, cites, corrects, follows, part-of + earned
  to: Name | Iri                  // internal name or external IRI
  qualifier?: string
  provenance: { source: 'body' | 'front-matter' | 'inline-field'; span?: SourceSpan }
}
```

The relation index stores forward edges and derives reverse edges; backlinks and neighborhoods are index queries, never authored duplication. `corrects` drives the correction surfaces (§7.1); `follows` drives pager ordering where authored; `part-of` supplements the name hierarchy where a cell belongs to a series its path does not express.

### 6.5 Catalog and views

```ts
interface Catalog {
  cells: Map<Name, Cell>              // current revisions
  revisions: Map<Name, NiAddress[]>   // history, newest first
  redirects: Map<Name, Name>          // permanent, from renames
  relations: RelationIndex            // forward + derived reverse
  hash: NiAddress                     // address of the catalog itself (over sorted cell addresses)
}
type CatalogView = Catalog            // any selection is a catalog; selections compose
select(catalog, by: { type?, tag?, status?, sectionPrefix?, relatedTo? }): CatalogView
merge(a: Catalog, b: Catalog): { catalog: Catalog; conflicts: Refusal[] }
```

Merge: cells identical by address unify; a name carried by different addresses is refusal R-01 in the result's report, never silently resolved. The corpus's stronger gluing semantics (a computable obstruction test for coordination-free merge) is adopted only when its covering relation is defined and its compatibility obligations discharged — the theory–practice-bridge note's own standard; until then this operational rule governs (AD-10).

### 6.6 Build report and refusal

```ts
interface BuildReport {
  catalogHash: NiAddress
  configHash: NiAddress
  victorVersion: string
  cells: Map<Name, CellRecord>        // status, template used, checks run
  artifacts: Map<Path, ArtifactRecord> // projection id, source addresses, content hash, check results
  refusals: Refusal[]                 // release-blocking
  advisories: Advisory[]              // reported, non-blocking
  absent: CapabilityNote[]            // e.g. dynamic surfaces missing from a static release
}
interface Refusal {
  code: RefusalCode                   // catalogued, §9.4
  subject: Name | Path
  reason: string                      // one sentence, author-readable
  site?: { file: string; line: number }
  data?: unknown                      // e.g. the measured contrast ratio
}
```

Reports form a lattice: `meetReports` (what both builds achieved), `joinReports` (all claims of either), `residualReport` (what regressed from a to b) — the `meetBuilds`/`joinBuilds`/`residualBuild` algebra of the absorbed engine, carried forward and extended to conformance results. "What broke since yesterday" is `residualReport(yesterday, today)`.

### 6.7 Theme manifest

```ts
interface ThemeManifest {
  name: string
  colors: Record<ColorToken, { light: Color; dark: Color }>   // exactly 7 tokens; exactly one marked jewel
  space: [Space, Space, Space, Space, Space, Space, Space, Space]   // 8 units, one scale
  type: {
    families: FontFamily[]           // ≤3; self-hosted woff2 + real fallback stack; no font CDNs
    weights: Weight[]                // ≤4 declared; ≤2 used per artifact (checked)
    sizes: [Size, Size, Size, Size, Size, Size, Size]               // 7
    roles: Record<'display'|'heading'|'body'|'annotation', TypeSetting>
  }
  geometry: 'narrow' | 'standard' | 'wide'
  density: 'compact' | 'standard' | 'generous'
}
```

A theme is *finished*: the base stylesheet generates from the manifest and nothing else; there is no inheritance chain — a theme derives from another by copying and changing values, keeping every theme legible alone. Validation (check C-08): every producible pairing meets Q2's ratios in light, dark, and grayscale print; focus styles present; one-jewel and two-weights hold. A failing theme is refusal R-07/R-08 with the pairing and measured ratio named. VICTOR ships one default theme derived from the emsenn Visual Language and the shelf-chrome lineage (IBM Plex, the kit's scales), which is also the manifest format's reference implementation.

### 6.8 Site configuration

```ts
interface SiteConfig {
  name: string
  baseIri: Iri                        // e.g. https://example.561.group/
  language: BCP47                     // one language per site in v1 (§12.5)
  theme: ThemeRef
  menu: MenuEntry[]                   // authored; short; a masthead that scrolls is a failed masthead
  routes: ViewBinding[]               // catalog views → route roots
  feeds: FeedSelection[]              // which views syndicate, windowed at N
  pagination: { pageSize: number }
  federation?: { actorName: string; deliveryMode: 'live-only' }
  license: SpdxId | LicenseRef
}
```

Configuration validates on load (refusal R-15); everything not present derives.

### 6.9 Release manifest

A static release comprises: every artifact of every projection, sharded into the two-character content-address layout with a compact discovery index (the L-Space pattern, so no reader downloads a monolith); plus `release.json`: VICTOR version, catalog hash, config hash, artifact inventory with hashes, the build report, and the `absent` capability notes naming each dynamic surface not present (ActivityPub inbox/delivery, Webmention receipt, live relation queries) and what a hosting layer must provide to restore it.

## 7. Logical view: subsystems

Seven subsystems. For each: responsibility, owned data, provided interface, and the behavior that is architecturally significant. Required interfaces are the provided interfaces of the subsystems named; nothing else.

### 7.1 Content subsystem

**Responsibility:** everything between a source tree and parsed cells: readers, front-matter validation, the dialect parser, lifecycle rules.

**Provides:**

```ts
interface Reader {                              // shape continues SemanticReader (absorbed)
  list(): Promise<SourceRef[]>
  settle(ref: SourceRef): Promise<CellSource>   // raw front matter + body text + media refs
}
directoryReader(root: Path): Reader             // the Markdown-tree reader; first and primary
mountReaders(mounts: Record<PathPrefix, Reader>): Reader
memoizeReader(r: Reader): Reader
memoryReader(cells: CellSource[]): Reader       // tests
parseCell(source: CellSource): Cell | Refusal   // front matter validation + dialect parse + relation extraction
```

**Lifecycle behavior (F7):** `potential` cells are excluded from releases unless the build is explicitly a draft release; always served by `victor serve`. Editing a `stable` cell without a dated changelog entry in the revision is refusal R-06. An `absurd` cell renders at its name with the retraction reason as the first element of the spine, body intact but visually subordinated; deletion is not an operation the system has. A **correction** is a cell of type record bearing `corrects → target`; the target's page renders each correction as a dated banner between breadcrumb and title; corrections have their own pages, addresses, and feed. Received corrections never expire.

### 7.2 Catalog subsystem

**Responsibility:** assembly and the model of §6.1–6.5: address minting over the canonical serialization, the name map, redirect map, relation index with reverse derivation, views, merge, and the dependency map that makes incremental rebuild possible (Q7): for each cell, which cells' pages must re-render when it changes (its transcluders, its backlink pages, its section index, taxonomy pages carrying it).

**Provides:** `assemble(readers, prior?: Catalog): { catalog, report }`, `select`, `merge`, `dependentsOf(name): Name[]`, `resolve(nameOrAddress): Cell | Redirect | Absent`.

### 7.3 Presentation subsystem

**Responsibility:** how a cell becomes a page: templates, partials, themes, and the reader surfaces.

**Template contract (AD-04):**

```ts
type Template = (view: CellView, ctx: RenderContext) => Html
// CellView: the cell plus every derived value precomputed — no callbacks into the catalog:
interface CellView {
  cell: Cell
  toc: TocEntry[]                     // from heading hierarchy
  incoming: RelationGroup[]           // backlinks grouped by type, type named
  outgoing: RelationGroup[]
  corrections: CorrectionView[]
  revisions: RevisionSummary
  trail: BreadcrumbEntry[]            // name hierarchy
  pager?: { prev?: PageRef; next?: PageRef }   // §4.3 ordering
  referencesUsed: ReferenceView[]     // in citation order, margin-placed
}
html`…${value}…`                      // escapes every interpolation
raw(trusted: string): Html            // the sole, greppable trust boundary
```

Templates are plain exported functions composing by ordinary calls — no template language, no build step (AD-04). **Resolution cascade**, deterministic, most specific first: cell-named template → section template for the type → site template for the type → VICTOR default for the type → VICTOR default page. The build report records which template rendered every page (F9; the direct answer to lookup-order folklore).

**Anatomy** (closed): masthead (`header`; identity, menu, skip link first), breadcrumb (`nav`), spine (`main`; eyebrow, title, body), reservoir (`aside`; sidenotes, citations, backlinks, neighborhood — present on every published page even when empty, the spine-with-reservoir rule), colophon (`footer`; created, revised, status, license, revision-history link, correction trail). **Fragment partials** (closed): listing, pager, tag-list, reference-list, sidenote, figure, callout, tile-grid (embeds a TUFTE fragment). **The orientation contract**, enforced as check C-15: every page answers *what is this* (masthead+title+eyebrow+type), *where am I* (breadcrumb), *what is nearby* (reservoir), *where next* (relations, pager, menu).

**Reader surfaces owned here:** footnotes and citations as margin sidenotes beside their passage (inline-disclosure on narrow viewports; true endnotes with working bidirectional links under CSS-off); TOC on pages with ≥3 headings; heading levels never skip (C-09); build-time syntax highlighting colored by theme tokens inside semantic `pre`/`code` with the language named in text, wide blocks scrolling in their own container; mathematics as native MathML at build time (AD-08); figures with required alt, intrinsic dimensions, captions that are prose not alt-repetition; glossary term pages with the term's usage neighborhood — and no auto-linking of term mentions: linking a term is an authorial act; auto-linking is salience theft (AD-09).

**Themes** per §6.7. Light and dark from one manifest via `prefers-color-scheme` with `data-theme` override winning both directions; print is a first-class rendition generated and checked with the screen stylesheets — sidenotes true to the margin, chrome dropped, URLs surfaced after links, grayscale-survivable (the print-native rule: a VICTOR page is a document that happens to be served).

### 7.4 Projection subsystem

**Responsibility:** the closed projection set behind one interface.

```ts
interface Projection {
  id: 'page' | 'tile' | 'data' | 'feed' | 'discovery' | 'federation'
  project(view: CatalogView, site: SiteConfig): { artifacts: Artifact[]; report: BuildReport }
}
```

- **page** — one page per cell (via 7.3), section indexes (authored index cell's prose above the derived listing; listings state their ordering principle in visible text), taxonomy pages for tags/type/status, the paginated and the complete single-page archive per section, the 404 (a real page: orients, lists near-name matches), redirect stubs.
- **tile** — TUFTE models: the **atlas** (catalog on the deterministic grid, tile order = stated order — by date or by section, in visible text — never force-directed: visual adjacency must not imply unasserted distance, the L-Space judgment generalized) and the **neighborhood** per cell (the cell at center with typed relations as tiles). Vocabulary mapping: `tile.id` = cell name; `eyebrow` = type; `confidence: low` when status is potential; `lifecycle` unused in v1. Both surfaces are complete server-rendered pages; TUFTE's browser layer enhances.
- **data** — per-subject JSON-LD and Turtle from the same cell values as the page, plus the page-embedded JSON-LD block using the `@graph`/`@id` cross-referencing pattern (current best practice per the field survey); schema.org typing from the type table (§6.2); soft, local, reversible — no OWL, no global consistency obligation (AD-06).
- **feed** — RSS 2.0, Atom, JSON Feed 1.1 for every configured view and every taxonomy term, windowed; the corrections feed always present.
- **discovery** — sitemap.xml (complete), robots.txt, web app manifest, `/.well-known/` documents including RFC 6920 `ni` resolution, and the static search index: sharded JSON over titles, summaries, tags, glossary terms (the L-Space sharding pattern). The search page is enhancement; its no-JS fallback is the glossary, section indexes, and atlas — orientation's foundation is never a script.
- **federation** — microformats2 (h-entry, h-card, h-feed) woven into page markup; Webmention endpoint discovery links; received webmentions rendered below the colophon, clearly labeled and visually subordinate; ActivityPub actor, outbox, and per-cell object documents as static artifacts in both modes (fetchable federation); inbox and delivery are live-mode services (§7.6). The shelved `organizing-with-the-living-web` ActivityPub implementation is the reference for actor/WebFinger/NodeInfo document shapes (§13).

### 7.5 Conformance subsystem

**Responsibility:** Q1–Q6 as executable checks (catalog at §9.3), run as build stages after projection, writing `CheckResult`s into the report. Embedded checkers only — no network dependence at build. The suite is structured so a future WCAG 3.0 profile is an added stage, not a rewrite.

### 7.6 Serving subsystem

**Responsibility:** both bindings of the projected artifacts.

**Live:** routes from the catalog; content negotiation at subject IRIs (Accept: HTML → page; JSON-LD/Turtle → data document; ActivityStreams → AP object) in the Cool URIs pattern (absorbed module, §13); content watching with incremental rebuild via `dependentsOf`; the dynamic endpoints — Webmention receipt (with source-verification fetch before acceptance), ActivityPub inbox (HTTP-signature verification) and outbound delivery, and the relation query endpoint (typed queries over the index; the deferred Triple Pattern Fragments module is its future shape if earned). **Static:** the freezer walks every projection to a release (§6.9); live-versus-frozen parity is check C-16. Redirects and errors are artifacts in both modes. VICTOR is a package; carriers own provider configuration (AD-12).

### 7.7 Author tooling subsystem

**Responsibility:** the command surface and the documentation contract. `victor serve | build | check | new <type> <name> | release`. `check` runs the conformance suite alone — the writer's fast loop. `new` scaffolds typed front matter with today's ISO date. Every failure across all subsystems surfaces here as its catalogued refusal (§9.4) with subject, reason, and location; the handbook documents every refusal and every example in it executes in the test suite (the TUFTE doctest pattern); the handbook is a VICTOR site and the permanent dogfood.

## 8. Behavioral view

### 8.1 Full build

1. Load and validate site config (R-15 on failure; nothing else runs).
2. Readers list and settle sources; `parseCell` each (front matter validation, dialect parse, relation extraction).
3. Assemble: mint addresses over canonical CBOR; name map; redirect map from rename records; relation index + reverse edges; dependency map; catalog hash.
4. Content checks (heading levels, alt, titles, lifecycle rules) → report.
5. Projections run — order-independent, parallelizable, each pure over (view, config).
6. Conformance suite over the artifact set → report.
7. Reports meet into the build report; any refusal ⇒ the build is not releasable; `victor build` prints the refusal set and exits nonzero.
8. Binding: server holds artifacts + report in memory; freezer writes the release.

### 8.2 Live request

Request → redirect map (301 with permanent target) → negotiation at subject IRI → artifact from the current build → response. Dynamic endpoints (webmention, inbox, query) validate, verify (fetch/signature), and append to their stores; stores are inputs to the next incremental build (received webmentions render on the next rebuild of the target page).

### 8.3 Watch loop

File event → affected cells re-settled → `dependentsOf` closure re-projected → conformance on changed artifacts → report updated; the serve log prints `residualReport(previous, current)` — what this edit changed, gained, broke.

### 8.4 Rename

Author moves/renames a source file and records the old name (front-matter `renamed-from`, consumed into the redirect map). Build refuses a vanished name with no redirect record (R-01 variant) so links never silently die; the old name 301s forever; the sitemap carries only current names.

### 8.5 Correction flow

Author runs `victor new record <name>` with `corrects:: [[target]]`; the correction publishes as its own page and feed entry; the target renders the banner. The target's cell is not edited by the correction — the correction is additive, addressable evidence; if the target is also revised, that is its own revision with its own changelog.

## 9. External surface specifications

### 9.1 URL and IRI scheme

| Path | Surface |
|---|---|
| `/{section…}/{slug}/` | Cell page; the subject IRI; content-negotiated |
| `/{section…}/{slug}/data.jsonld`, `data.ttl` | Data projection, direct paths |
| `/{section…}/{slug}/neighborhood/` | Tile neighborhood view |
| `/{section…}/{slug}/revisions/` | Revision history; `/revisions/{ni-hash}/` an exact revision |
| `/{section…}/` | Section index; `/{section…}/archive/` the complete single page; `/page/{n}/` pagination |
| `/tags/{tag}/`, `/type/{type}/`, `/status/{status}/` | Taxonomy pages, each with `feed.xml` siblings |
| `/glossary/`, `/glossary/{term}/` | Glossary surfaces |
| `/atlas/` | The tiled macro-view |
| `/feed.xml`, `/feed.atom.xml`, `/feed.json`, `/corrections/feed.xml` | Site feeds |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` | Discovery |
| `/.well-known/ni/sha-256/{base64url}` | RFC 6920 resolution → 302 to the revision |
| `/search/`, `/search-index/{shard}.json` | Search page + sharded index |
| `/actor`, `/outbox`, `/inbox`, `/.well-known/webfinger` | Federation (inbox live-only) |

Names never break; renames 301; nothing under a subject IRI is ever reused for a different subject.

### 9.2 Artifact inventory

Per cell: page, data.jsonld, data.ttl, neighborhood page, AP object, revision entries. Per section: index, archive, pagination pages, feeds. Per taxonomy term: page + feed. Per site: home, atlas, glossary index, search page + shards, 404, sitemap, robots, manifest, well-known set, site feeds, corrections feed, actor + outbox. The freezer's manifest enumerates exactly this inventory with hashes; completeness is checkable, and any bounded emission (windowed feeds) is stated in the report, never silent.

### 9.3 Conformance check catalog

| Id | Check | Requirement | Failure class |
|---|---|---|---|
| C-01 | HTML validates against the WHATWG Living Standard | Q1 | R-13 |
| C-02 | ARIA-in-HTML rules; ARIA-last (no ARIA where native semantics exist) | Q1 | R-14 |
| C-03 | WCAG 2.2 machine subset: computed contrast, focus visibility, target size, language attribute | Q1, Q2 | R-07 / A-03 |
| C-04 | DOM and tab order equal authored order, all projections | Q2 | R-09 |
| C-05 | CSS-off and JS-off pass: content complete, ordered, links work | Q3 | R-09 |
| C-06 | Double-build determinism (byte comparison) | Q4 | R-02 |
| C-07 | Page/data coherence: emitted JSON-LD claims match rendered claims | Q5 | R-12 |
| C-08 | Theme validation: ratios in light/dark/grayscale-print, focus, jewel, weights | Q2 | R-07, R-08 |
| C-09 | Heading hierarchy: no skipped levels | Q1 | R-10 |
| C-10 | Media: alt present or explicitly decorative; intrinsic dimensions | Q1, Q2 | R-11 |
| C-11 | Feeds well-formed (RSS/Atom/JSON Feed schemas) | Q1 | R-13 |
| C-12 | JSON-LD parses; schema.org type present per the type table | Q5 | R-12 |
| C-13 | Internal link integrity; redirect map closure | F8 | A-01 |
| C-14 | Print rendition: grayscale contrast, margin placement | Q2 | R-07 |
| C-15 | Orientation contract: the four answers present | Q6 | R-09 |
| C-16 | Live/frozen parity over the artifact inventory | F6 | R-02 |

### 9.4 Refusal and advisory catalog

Refusals (block release): R-01 name-conflict · R-02 nondeterminism/parity failure · R-03 invalid front matter or dialect (unknown citation key, orphan footnote) · R-04 unknown content type · R-05 transclusion cycle · R-06 stable-edit-without-changelog · R-07 contrast failure (with measured ratio) · R-08 invalid theme manifest · R-09 anatomy/order/fallback failure · R-10 heading-level skip · R-11 media without alt/dimensions · R-12 coherence mismatch · R-13 invalid HTML/feed · R-14 invalid ARIA · R-15 invalid site config.

Advisories (report, don't block): A-01 potential link (unresolved name; the wanted-but-absent page as data) · A-02 generic title · A-03 WCAG advisory (non-machine-checkable notices for human review) · A-04 orphan cell (no incoming relations — surfaced, since an unfindable page is an orientation failure in waiting) · A-05 reference cited from ≥3 cells (bibliography-candidate, earned-addition applied to the site's own knowledge).

Every code has a doctested handbook entry; an author can cite a refusal by name.

## 10. Refusals of scope

What VICTOR does not duplicate, each with its owner: browser application and user-form topology belong to TUFTE; HTTP transport belongs to the shared server services; protocol custody belongs to the protocol applications; provider deployment belongs to carrier repositories. VICTOR owns their composition into websites, the catalog and projections they share, release and conformance policy, and the lifecycle a downstream website consumes. It retains no owned clock or scheduler, no deletion in place (retirement, retraction, redirects), no force-directed default visualizations, and no third-party CDNs for assets or fonts.

## 11. Architectural decisions

Each: the decision, alternatives considered, rationale.

- **AD-01 One model, pure projections.** *Alt:* per-surface pipelines (the field norm); post-hoc sync checks only. *Rationale:* drift between page and machine surfaces is the field's chronic failure (driver 3); purity makes drift structurally impossible and Q4/Q5 cheap; TUFTE proves the pure-render pattern in house production.
- **AD-02 Name/address split.** *Alt:* address-only identity (links break on edit); name-only (no permanent citation). *Rationale:* both resolve, links bind to either; continues the RMN/`ni` practice and the four-authority L-Space separation.
- **AD-03 Canonical CBOR for addressing.** *Alt:* canonical JSON; hash of source bytes. *Rationale:* source-byte hashing makes trivial reformatting a new revision; deterministic CBOR is the house's deployed practice (`.rmn.cbor` stores) with an RFC-specified deterministic encoding.
- **AD-04 Templates as plain functions with one escaping literal.** *Alt:* Go templates (the single most-complained-of aspect of Hugo in the 2026 survey); Jinja/Tera (a second language with its own resolution folklore); JSX (a build step and a framework gravity well). *Rationale:* the house pattern (TUFTE fragments, hand-written HTML tradition); the trust boundary (`raw`) becomes greppable; template resolution becomes reportable data.
- **AD-05 Build-time dialect rendering, one implementation.** *Alt:* client-side rendering; multiple renderers per surface. *Rationale:* Q3's zero-JS floor; the L-Space rule ("exactly one Markdown-dialect implementation, server-side") already proved in production.
- **AD-06 JSON-LD (with Turtle sibling), soft typing, `@graph` pattern.** *Alt:* RDFa/Microdata woven into markup (couples presentation to data, the drift vector); full OWL/SPARQL stack (the Jiangshi refusal). *Rationale:* current best practice per survey; AI answer engines consume it; coherence is checkable (C-07).
- **AD-07 Dual-mode from one config, static-first degradation manifest.** *Alt:* live-only (Ghost's shape); static-only (no federation receipt at all). *Rationale:* the absorbed engine proved `buildApp`/`projectSite` from one reader; honesty (Q6) demands the absence of dynamic surfaces be data, not surprise.
- **AD-08 Native MathML.** *Alt:* client KaTeX/MathJax (violates Q3); build-time KaTeX HTML (a div-soup of presentation spans). *Rationale:* MathML Core is in the Living Standard and Baseline; this corpus's mathematics deserves first-class markup.
- **AD-09 No glossary auto-linking.** *Alt:* every-mention linking (wiki convention). *Rationale:* attention-budget discipline — auto-links are salience theft; linking is an authorial act. Reversible by a one-line decision if lived experience disagrees.
- **AD-10 Operational merge now; gluing semantics deferred.** *Alt:* claim the sheaf semantics now. *Rationale:* the theory–practice-bridge note's own refusal — no covering relation is yet defined; the SAS does not claim what is not proved.
- **AD-11 Closed sets everywhere, earned addition as the only growth.** *Alt:* plugin/hook architecture (the WordPress lesson: power and an unauditable surface); config sprawl. *Rationale:* the visual language's proven governance; keeps the attention-budget failure mode (driver 5) structurally bounded.
- **AD-12 Package/carrier split.** *Alt:* the repo deploys itself. *Rationale:* the north-shore pattern proved in production ("the deployment carrier owns only provider configuration"); keeps every provider concept out of the system.

## 12. Cross-cutting concerns

### 12.1 Trust and security

Content trees are trusted-authored but escaped anyway; `raw()` is the only escape hatch and is greppable; the trusted-fragment list is stated in the handbook (the TUFTE precedent). Emitted pages carry no inline event handlers, no third-party origins (fonts self-hosted), so a strict CSP is trivially satisfiable — the carrier documentation states the recommended policy. Live endpoints verify before accepting: Webmention receipt fetches the claimed source and confirms the link; ActivityPub inbox verifies HTTP signatures; the query endpoint is read-only over the index. No secrets exist in the package; keys for AP delivery are carrier-provided at runtime.

### 12.2 Versioning

VICTOR versions semantically; the release manifest records VICTOR version, catalog hash, and config hash, so any artifact is reproducible from named inputs. A change to canonical serialization is a major version and re-mints addresses; old addresses remain resolvable through the revision store.

### 12.3 Error philosophy

One rule at every layer: failures are catalogued values in the report (§9.4). No silent catch, no log-and-continue, no capability that fails by absence — the TUFTE 0.4.0 lesson ("72/72 green" masking a dead capability) is the standing caution, and C-16 (parity) plus the doctested handbook are its structural answers.

### 12.4 The earned-addition procedure

A proposal to grow any closed set is a note in this directory citing three independent, existing uses (cells, sites, or documents that want the member today, not hypothetically); acceptance is a dated revision of this SAS amending the set's table. The procedure is mechanical so the sets stay closed under attention scarcity.

### 12.5 Internationalization stance

One language per site in v1, declared in config, emitted on `html[lang]`. Multilingual publishing enters by earned addition; nothing in the name scheme or catalog model presumes monolingualism (a language-qualified view binding is the anticipated shape).

## 13. Absorption and disposition of prior systems

| Prior asset | Disposition |
|---|---|
| `semantic-site-server` readers (`markdownDirectoryReader`, `mountedDirectoryReader`, `memoizeReader`, `memoryReader`) | Extract; interface shape continues as §7.1 `Reader` |
| `buildApp` / `projectSite` dual-mode | Superseded by §7.6; the pattern is the requirement (F6) |
| `toTurtle` / `toJsonLd` / `semanticHead` | Rewritten against the Cell model in the data projection; JSON-LD moves to the `@graph` pattern |
| `jsonFeedDocument` / `atomFeed` / `rssFeed` / sitemap / manifest | Transfer substantially unchanged into feed/discovery projections |
| `cool-uris` module | Transfer into serving (§7.6 negotiation) |
| `microformats` (h-card/h-entry/h-feed) | Transfer into the federation projection |
| `page-metadata` (OpenGraph/Twitter/schema-scale) | Evaluate at HLD; candidate for discovery/data |
| `taxonomy` module | Superseded by catalog views + the taxonomy tables of §6.2/§4.3 |
| `meetBuilds` / `joinBuilds` / `residualBuild` | Carried forward as the report lattice (§6.6), extended to conformance results |
| `semantic-hypertext` / `semantic-reader` | Superseded: the reservoir and the dialect cover their intent |
| `triple-pattern-fragments` sibling | Deferred; the future shape of the query endpoint if earned |
| L-Space release compiler's Markdown renderer | Extract as the dialect implementation (AD-05); the L-Space feature set is the dialect's initial set |
| L-Space sharded release + discovery index | Pattern adopted by the freezer and search index (§6.9, §7.4) |
| `relating-experimental` codecs (turtle, rdf-adjacent, markdown, svg; holography/projecting) | Evaluate at HLD as data-projection backends; preserved 2026-08-26 from cold-red-gate |
| `organizing-with-the-living-web` `activitypub-microblog` | Reference implementation (actor, WebFinger, NodeInfo, delivery shapes) — mined, not imported; it is decommissioned |
| `@emsenn/content` algebra | Not absorbed; its retirement is a standing caution. Its codecs' concerns live on as §6.2 references and feed modules |
| TUFTE | Dependency, unchanged; VICTOR's needs (ARIA semantics for the typed vocabulary, default styles, a non-color `side` signal, the disclosure primitive) filed through TUFTE's evidence gate as TUFTE work |
| 2026-08-04 dynamic-site MUD/Ethereum/x402 stack | Not absorbed; the standing scope caution (§10) |

## 14. Risks

- **R-1 Canonical serialization stability.** Addresses are only as stable as the byte spec; a drifting canonical form invalidates the address store. *Mitigation:* AD-03 pins the encoding to an RFC-specified deterministic profile; C-06 catches nondeterminism per build; §12.2 governs deliberate change.
- **R-2 Conformance-checker fidelity.** Embedded checkers can lag the living standards they check. *Mitigation:* the Living Web Science section owns tracking the standards' movement; checker updates are ordinary dependency work surfaced in the report's checker-version field.
- **R-3 The AAA floor versus real themes.** AAA contrast constrains palettes hard; authors may fight it. *Mitigation:* the default theme proves the floor is livable; refusal R-07 names the exact failing pair and ratio, making the fix mechanical.
- **R-4 Incremental-rebuild correctness.** Dependency-tracked rebuilds that miss a dependent silently serve stale pages. *Mitigation:* C-06/C-16 compare against full builds in CI; `dependentsOf` is LLD-specified with its own tests; the fallback is always a full build.
- **R-5 Federation depth.** Signed delivery, inbox moderation, and fan-out are live-mode complexity with real abuse surface. *Mitigation:* static-mode federation is fetch-only documents (no inbox, no delivery, stated in the manifest); live-mode delivery ships behind config and can be off; the reference implementation exists in-house.
- **R-6 TUFTE coupling.** VICTOR's tile surfaces need TUFTE changes that must pass TUFTE's own gate and might not. *Mitigation:* every tile surface is a complete page without the browser layer; the needs are filed as evidence-bearing requests; VICTOR does not fork TUFTE.
- **R-7 One-implementor bus/attention factor.** Driver 5's honest restatement. *Mitigation:* refusals bound scope; doctested docs keep behavior and description identical; this SAS plus the report algebra make state legible to any future session, human or agent.

## 15. Traceability

| Req | Subsystems | Verified by |
|---|---|---|
| F1 | Content, Catalog | assembly tests; R-03/R-04 paths |
| F2 | Presentation, Projection(page) | C-01..05, C-09, C-10, C-15 |
| F3 | Projection(page), Serving | route/artifact inventory tests (§9.2); C-13 |
| F4 | Catalog, Presentation, Projection(tile) | relation-index tests; C-04 on tile surfaces |
| F5 | Projection(data/feed/discovery/federation) | C-07, C-11, C-12; inventory tests |
| F6 | Serving | C-16; release-manifest completeness test |
| F7 | Content, Presentation | lifecycle tests; R-06 path; correction-flow test (§8.5) |
| F8 | Catalog, Serving | address round-trip; redirect-closure (C-13); rename flow (§8.4) |
| F9 | Author tooling | refusal-catalog doctests; CLI tests |
| Q1 | Conformance | C-01, C-02, C-03, C-09, C-10, C-11 |
| Q2 | Presentation, Conformance | C-03, C-04, C-08, C-14 |
| Q3 | Presentation | C-05 |
| Q4 | all projections | C-06 |
| Q5 | Projection(data), Conformance | C-07, C-12 |
| Q6 | Presentation, Projection(tile), reporting | C-15; report `absent` notes; ordering-statement lints |
| Q7 | Catalog, Serving | incremental-vs-full comparison (R-4 mitigation) |

## 16. Document governance

This SAS governs VICTOR. Its closed sets amend only through §12.4; its decisions revise only by dated amendment noting what changed and why. The HLD (packages, module boundaries, the open interface details this SAS assigns it: the byte-level canonical form, template file conventions, search-index format, the extraction plan's order) and the LLDs live in this directory under ISO-dated filenames.
