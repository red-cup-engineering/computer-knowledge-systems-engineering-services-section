# VICTOR Competitive Position — first measurement

Companion to `content/text/documents/articles/notes/2026-08-26-victor-sas.md`
(§2.2 names the convergent gap as a driver but does not measure it) and
`2026-08-26-note-on-victor-mandate.md` (VICTOR must meet and beat current
website frameworks). Before this document, that requirement had narrative
support (SAS §2.2, §7.3, §11) and no measurement carrier.
This is the first one, run per the `meet-then-beat` house discipline. VICTOR is
at 0.1.2, "a walking skeleton that walks" (README.md); this is a spec-stage and
early-build measurement, not a claim that any MEET gap below is closed.

**Receiver and job.** A publisher — solo or small team, agent or human — who
wants to author prose (Markdown-plus-front-matter) and get a complete,
conformant, served website: pages, navigation, feeds, search, and (for the
relational niche) a queryable view of how their writing connects. The
observable outcome: a site that builds, serves, and is complete for a reader
with CSS off, JS off, or assistive technology, without the publisher hand-
writing HTML, structured data, or a second navigation system.

**Boundary.** In scope: everything a publisher touches between "I wrote a
document" and "a reader can find and read it" — content authoring, rendering,
site structure, feeds, search, accessibility, and deploy. Out of scope: TUFTE's
own browser-application capability (measured separately, per TUFTE's own
`docs/competitive-position.md`), and provider-specific hosting economics
(carrier concern, per SAS AD-12).

All evidence below was fetched from first-party documentation on
**2026-09-02** (UTC observed-at timestamps in Sources). Docs sites carry no
per-page revision date in the fetched content, so `published_date: unknown`
for every row unless stated otherwise; treat this as a public-docs snapshot,
owing remeasurement before any BEAT claim ships as a product statement.

## 1. Incumbent portfolio

| Product | Role | Why included | Class unmeasured this pass |
|---|---|---|---|
| **Hugo** | same-job incumbent | Mandate-named; the largest page-tree SSG by ecosystem size | Theme-marketplace size (found, not quantified — themes.gohugo.io exists, count not fetched) |
| **Ghost** | same-job incumbent | Mandate-named; the CMS-with-hosting-business shape VICTOR's package/carrier split (AD-12) explicitly refuses to become | Full theme-marketplace count; membership/newsletter economics (out of this arena's boundary) |
| **Astro** | same-job incumbent (SSG class) | Same customer journey (content → built site), component-based templating class VICTOR's AD-04 explicitly rejected as a decision, not an omission | Server-island/SSR-adapter depth (VICTOR is static-first + optional live mode, not the same shape) |
| **Eleventy** | same-job incumbent (SSG class) | Same customer journey; zero-framework-opinion templating class, closest in spirit to VICTOR's "plain functions" template stance (AD-04) though via a different mechanism (pluggable template languages, not one JS function contract) | Plugin-ecosystem breadth (11tybundle.dev lists 100+ resources; not individually surveyed) |
| **Quartz** | same-job incumbent (digital-garden class) | VICTOR's own relational niche — the SAS's convergent-gap claim (§2.2 driver 1) names Quartz explicitly as the graph-publisher side of the gap it exists to close | Multi-user/collaborative-vault story (Quartz is single-author-oriented; not deeply probed) |

No product here is an upstream provider or complement to VICTOR — TUFTE (a
VICTOR dependency) and the deployment carriers are the actual upstream/complement
roles in this arena, per SAS §3, and are excluded from the incumbent portfolio
by that same table.

## 2. Measured capability matrix

Legend: ✅ built-in/shipped by default · ➖ partial, or ships via first-party
integration package rather than the core · ❌ confirmed absent/refused ·
`?` not disclosed by the fetched first-party page this pass (a research lead,
not a negative finding — `unknown_reason: page not found or not fetched`,
`next_evidence: fetch the named source`).

| Capability | Hugo | Ghost | Astro | Eleventy | Quartz | **VICTOR (0.1.5)** |
|---|---|---|---|---|---|---|
| Content model | ✅ page-tree: kind/section/taxonomy/term (gohugo.io/templates/lookup-order/) | ✅ post/page + collections, DB-backed (docs.ghost.org) | ✅ content collections, typed (docs.astro.build/en/concepts/why-astro/) | ➖ file-based, no named model doc found (`?`) | ✅ graph of notes, wikilink-native (quartz.jzhao.xyz) | ✅ content-addressed cell + name/address split (SAS §6.1) |
| Markdown: tables | ✅ Goldmark GFM extension (gohugo.io/content-management/formats/) | `?` (editor cards, not confirmed) | ➖ via remark/MDX pipeline, not confirmed core | `?` (markdown-it, plugin-dependent) | ✅ GitHubFlavoredMarkdown transformer (quartz.jzhao.xyz/plugins) | ✅ **0.1.3**: GFM pipe tables, alignment, and inline markup in cells; wrapped in `<figure class="table-scroll">` per the dialect specification note (src/dialect.mjs, tested) |
| Markdown: math | ✅ LaTeX via Goldmark passthrough (gohugo.io/content-management/formats/) | `?` | ➖ via remark-math/rehype-katex integration, not core | `?` | ✅ KaTeX (quartz.jzhao.xyz) | ❌ deferred, native MathML spec'd (SAS AD-08) but unbuilt |
| Markdown: citations | ➖ Pandoc format only, non-default (`--citeproc`) | `?` | `?` | `?` | ✅ "academic citation support" (quartz.jzhao.xyz/features) | ✅ **0.1.5**: `[@key]`/`[@key, p. N]`/`[@a; @b]` resolve against CSL-JSON front-matter `references`, rendering author-year anchors with margin copies (the sidenote mechanism) and a plain author-year reference list — no citeproc dependency; an unknown key refuses the build (src/dialect.mjs, src/citations.mjs, tested) |
| Markdown: raw HTML passthrough | `?` (not confirmed this pass; content-format denial found applies to `.html` files, not inline HTML) | `?` | `?` | `?` | `?` (no dedicated plugin found) | ❌ deferred, escapes everything (src/dialect.mjs:7) |
| Templating: cascade | ✅ 6-level lookup order incl. site+theme layers (gohugo.io/templates/lookup-order/) | ✅ Handlebars theme hierarchy (docs.ghost.org/themes) | ✅ component tree, "hundreds of integrations" | ✅ data cascade + layout chaining, multi-language | ➖ JSX layouts + components, no stated cascade | ❌ one built-in template; cascade spec'd, unimplemented (README.md:123, SAS AD-04) |
| Templating: theme ecosystem | ✅ themes.gohugo.io directory (size not quantified) | ✅ marketplace, ~30+ themes visible (ghost.org/marketplace) | ✅ "hundreds" of integrations | ✅ 107+ community resources (11tybundle.dev) | `?` (not surveyed) | ❌ one default theme, no marketplace |
| Image pipeline | ✅ Hugo Pipes: transform/optimize (gohugo.io) | ✅ automatic resizing via theme helper (docs.ghost.org/themes/assets) | ✅ `astro:assets`: resize, avif/webp, responsive srcset, CLS-safe (docs.astro.build/en/guides/images/) | ✅ `eleventy-img` plugin | `?` (not surveyed) | ❌ copied byte-for-byte, unprocessed (README.md:123) |
| SEO meta (OG/Twitter) | ✅ internal `opengraph.html`/`twitter_cards.html` templates, on by default (gohugo.io/templates/internal/) | ✅ `{{meta_title}}`/`{{meta_description}}`/`{{canonical_url}}` helpers (docs.ghost.org) | `?` (no official integration found this pass) | `?` | ✅ Description + Custom OG Images plugins (quartz.jzhao.xyz/plugins) | ✅ **0.1.3**: `og:title`/`og:type`/`og:url`/`og:description`/`og:image` (when a cell declares `image` front matter) and `twitter:card`, on every rendered page (TUFTE `src/publication/page.mjs`, tested) |
| Feeds | ✅ RSS on by default for home/section/taxonomy/term (gohugo.io/templates/rss/) | ✅ auto RSS per collection/channel, `/rss/` (docs.ghost.org/themes/routing) | ➖ `@astrojs/rss`, opt-in package | ✅ official RSS plugin | ✅ RSS feed generation (quartz.jzhao.xyz/features) | ✅ RSS 2.0 + Atom 1.0 + JSON Feed 1.1 (README.md:25) — **only one of six measured with all three feed formats** |
| Sitemap | `?` (nav section exists, default-on not directly quoted this pass) | `?` (not found in routing docs) | ➖ `@astrojs/sitemap`, opt-in package | `?` | `?` | ✅ built in (README.md:25) |
| Search | ❌ no built-in; docs catalog 6+ third-party options (gohugo.io/tools/search/) | ✅ built-in native search, single data-attribute (docs.ghost.org/themes/search) | `?` (Pagefind is a common pattern, not confirmed core) | `?` | ✅ client-side Flexsearch, <10ms on 500K-word corpora, no server (quartz.jzhao.xyz/features/full-text-search) | ✅ built-in browser search, Pagefind-compatible annotations (README.md) |
| Accessibility posture | `?` (no page found asserting conformance) | `?` | ➖ guide exists; testing docs confirm no built-in conformance gate (docs.astro.build/en/guides/testing/) | ➖ explicit refusal: "automated auditing systems are only a starting point," points to external axe/Lighthouse/pa11y/WAVE, not a build gate (11ty.dev/docs/accessibility/) | `?` | ➖ **spec'd, partially wired**: SAS catalogs C-01–C–16; only link-integrity (C-13, via `static-site-conformance-service`) is actually called from `build.mjs` today — the WCAG/ARIA/contrast checks (C-01–C-03, C-08–C-10, C-14, C-15) are normative in the SAS but not yet invoked in the build pipeline (theme contrast certification now belongs to `web-theming-service`; VICTOR still has no wired per-page contrast checker) |
| Editor/admin surface | ❌ CLI only (gohugo.io homepage) | ✅ full web admin (Koenig editor, staff roles) — the category's admin-surface leader | ❌ CLI/IDE only | ❌ CLI/IDE only | ❌ CLI/file-based only | ❌ CLI only (`victor serve\|build\|check\|new\|release`); README.md:123 names editor/admin as a current gap |
| Multi-author + scheduling | ➖ `params.author` convention only, no native role/archive; `draft`/`publishDate`/`expiryDate` front matter IS native (gohugo.io/content-management/front-matter/) | ✅ staff roles/permissions + native post scheduling (docs.ghost.org) | ❌ no CMS layer, N/A | ❌ no CMS layer, N/A | ❌ single-author oriented | ❌ named gap (README.md:123); 4-state lifecycle (`potential`/`active`/`stable`/`absurd`, SAS §7.1) has no author/role concept yet |
| Build determinism | `?` (not disclosed by any fetched page) | — N/A, dynamic server not a build | `?` | `?` | ➖ "incremental rebuilds for content edits" claimed; full determinism not addressed | ✅ **the only one of six with a stated, tested determinism guarantee**: double-build byte-identical comparison is `victor check` (README.md:23; SAS Q4, C-06) |
| Federation/ActivityPub | ❌ not mentioned in any fetched page | ➖ **private beta**, invite-only, small weekly-publishing Ghost(Pro) sites only; can follow/be-followed/receive replies; federated data explicitly *not* protected during beta, reserves right to reset (activitypub.ghost.org/beta-plans/, observed 2026-09-02, page's own internal reference suggests ~2024 authorship — `published_date: unconfirmed`) | ❌ not mentioned | ❌ not mentioned | ❌ not mentioned | ➖ static-mode actor/outbox/object documents spec'd as fetchable-only (SAS §7.6); live inbox/delivery spec'd, seam exists (`createPublicationActivityPubProvider()`, README.md:121) but "federation... remain[s] to be composed or implemented" (README.md:123) |
| Hosting/deploy story | ➖ generic deploy docs only; no Hugo-run hosting product | ✅✅ Ghost(Pro) managed hosting is a first-party business, plus self-host | ➖ adapter ecosystem (Netlify/Vercel/Cloudflare/Node), no first-party hosting | ➖ generic deploy docs, no first-party hosting | ➖ GitHub Pages/Cloudflare/Netlify/Vercel guides, no first-party hosting | ➖ package/carrier split by design (AD-12): VICTOR is imported, never self-deploys; carrier is a separate repository concern |

## 3. MEET contract

For every row where VICTOR is currently behind (❌ or the weaker ➖), stated as
the skill requires: incumbent baseline, our present evidence state, the
smallest acceptance assay, and the owning gap.

| Capability | Incumbent baseline (evidence) | Our evidence state | Smallest acceptance assay | Next gap |
|---|---|---|---|---|
| Markdown tables | Hugo (Goldmark GFM), Quartz (GFM transformer) ship tables by default | **tested (0.1.3)**: `dialect.mjs` parses GFM pipe tables (header, alignment, inline markup, blank-line-free continuation from a prior paragraph) to a `table` AST node and renders a semantic `<table>` wrapped in `<figure class="table-scroll">`; `test/victor.test.mjs` covers parsing, rendering, escaping, and the AST round-trip | One cell with a GFM table renders to a semantic `<table>` in `victor check`'s output with no refusal, and round-trips through the dialect AST | Closed for this pass; the earned-addition procedure (SAS §12.4) governed the addition |
| Markdown math | Hugo (LaTeX passthrough), Quartz (KaTeX) ship math | absent | One cell with inline/display math renders as native MathML (AD-08's own commitment) and passes C-01 HTML validation | Implement the MathML build-time transform; AD-08 already picked the technique, so this is implementation debt, not a design decision |
| Markdown citations | Hugo (Pandoc-only, non-default), Quartz (native) | **tested (0.1.5)**: `dialect.mjs` parses `[@key]`/`[@key, p. N]`/`[@a; @b]` against the cell's CSL-JSON `references` front matter, asserting a literal `cites` relation and resolving each key to an author-year anchor plus a margin sidenote; `citations.mjs` formats article-journal/report/book/chapter/webpage entries without a citeproc dependency; an unknown key is refusal R-03 | One cell citing `[@key]` resolves against `references` front matter and renders in the reservoir; an unknown key produces refusal R-03 | Closed for this pass; the earned-addition procedure (SAS §12.4) governed the addition |
| Raw HTML passthrough | not confirmed for any of the five this pass | absent by design (`raw()` is the sole, greppable escape hatch — SAS §7.3) | A documented `raw()` call site list stays a single grep result as the feature ships | Lowest priority of the two remaining — VICTOR's trust-boundary design (§12.1) makes broad passthrough a bigger decision than mathematics, not just an implementation gap |
| Theme cascade | Hugo's 6-level lookup order is the field's most elaborate (and, per SAS AD-04, its "single most-complained-of aspect") | absent; the alternative (AD-04's plain-function cascade) is fully specified, not yet built | `victor build` reports which template rendered each page (per the AD-04 requirement already stated in SAS §7.3) across at least two specificity levels (cell-named vs. site-default) | Implement the 5-level resolution cascade already specified in SAS §7.3; this is the README's own named gap (README.md:123: "there is one built-in template rather than the resolution cascade") |
| Theme ecosystem | Hugo/Ghost/Astro/Eleventy all have marketplaces or integration directories in the dozens-to-hundreds | absent — one default theme | N/A until the cascade (above) exists to place additional themes into; a second theme derived from the manifest format (SAS §6.7) is the first assay | Downstream of the cascade gap; not independently actionable yet |
| Image pipeline | All four page-tree incumbents (Hugo, Ghost, Astro, Eleventy) ship build-time resize/reformat; Astro's is the deepest measured (CLS-safe responsive `srcset`, avif/webp) | absent — assets copied byte-for-byte (README.md:123) | One source image emits at least one resized/reformatted derivative with dimensions recorded in the release manifest | New projector, likely composing an existing house image-processing primitive rather than hand-rolling one (per working-discipline's "check what exists first") |
| SEO meta (OG/Twitter) | Hugo ships this by default with zero config (`opengraph.html`/`twitter_cards.html`); Ghost and Quartz ship it via helpers/plugins | **tested (0.1.3)**: `page.mjs`'s `socialMeta()` emits `og:title`/`og:type`/`og:url`/`og:description`/`og:image` (resolved against `site.baseIri` when a cell's `image` front matter is present) and `twitter:card` on every rendered page kind (cell, index, archive, taxonomy, search); `test/victor.test.mjs` covers both the with-image and without-image cases | One cell's rendered `<head>` carries `og:title`/`og:description`/`og:image` (when present) and `twitter:card`, checked against the cell's own title/summary/lead image by an extension of the existing C-07 coherence check | Closed for the meta emission itself; wiring an automated C-07-style coherence check that diffs the emitted meta against the cell's own fields (rather than relying on the test suite) remains open |
| Editor/admin surface | Ghost's Koenig editor + staff-role admin is the category leader; every SSG incumbent (Hugo/Astro/Eleventy/Quartz) is CLI/file-based like VICTOR | absent | Out of scope for the nearest wedge (see §5) — no acceptance assay proposed this pass | Named but deliberately not commissioned; a CLI-first tool matches four of five incumbents, and Ghost's admin surface is a different product shape (dynamic app vs. static/dual-mode) that VICTOR's package/carrier split (AD-12) would need to re-justify before building |
| Multi-author + scheduling | Ghost (roles + native scheduling) is the only incumbent with both; Hugo has scheduling (`draft`/`publishDate`/`expiryDate`) but no roles | absent (README.md:123) | Front-matter `author`/`authors` field flows into `CellView` and a per-author listing view (`select({ authorId })`), plus a `publishDate`-gated build flag matching Hugo's own field names where the concept is identical | Scheduling is the cheaper half (Hugo's exact mechanism is a reasonable model to match); authorship needs a decision on whether it is a `Relation` (fits SAS §6.4's existing typed-edge model) or a new `Cell` field — a design question, not just missing code |
| Accessibility conformance-as-gate | No incumbent measured makes this a build-blocking default (Eleventy explicitly refuses to, in writing; Astro's testing docs show no built-in gate; Hugo/Ghost/Quartz don't disclose one) | **source-only**: fully specified (SAS §9.3, 16 checks with refusal codes) but only 1 of 16 (C-13, link integrity) is wired into `build.mjs` | `victor build` against a page with a known contrast failure produces refusal R-07 naming the measured ratio, and the same build with the failure fixed produces zero refusals | The largest gap between VICTOR's spec and VICTOR's shipped build — see §5's falsification note; wiring C-01–C-03/C-08–C-10/C-14/C-15 from the SAS into the build pipeline is the single highest-leverage next step toward the BEAT hypothesis this doc's own measurement could not yet confirm |
| Federation/ActivityPub | Ghost's is furthest along among incumbents (private beta, follow/be-followed/receive-replies) but explicitly unstable (federated data may be reset) | source-only: static fetchable documents spec'd (SAS §7.6), seam exists (`createPublicationActivityPubProvider()`), no evidence of an actual actor/outbox artifact being emitted by a real build this pass | One `victor build` output contains a valid, schema-conformant ActivityPub actor document at `/actor` for a configured site | README.md:123 already names this the honest state ("federation... remain to be composed or implemented"); Ghost's own beta instability means VICTOR is not meaningfully behind on *maturity*, only on *existence* |

## 4. BEAT hypotheses — stated, checked, and one falsified-this-pass

Per the skill: state the receiver-visible, measurable claim, then actively
search the measured incumbents for a counterexample before keeping it.

**H1 — Dual archive/garden projection from one content-addressed store.**
*Because* the catalog (SAS §6.5) is one value that both page-tree projections
(archive, taxonomy, pagination — §7.4 "page") and graph projections (atlas,
neighborhood — §7.4 "tile") read without either reading the other's output
(AD-01's one-model principle), VICTOR can serve a full conventional site
structure *and* a queryable relational surface from the same build, *while*
none of the five measured incumbents can without contradicting their own
architecture. **Checked against the portfolio:** Hugo, Ghost, Astro, and
Eleventy all confirmed page-tree/taxonomy/feed structure with no graph,
backlink, or relational-neighborhood surface disclosed in any fetched page.
Quartz confirmed the graph side (wikilinks, backlinks, local graph, full-text
search) plus only a partial conventional side ("folder and tag listings" —
no paginated archive, no per-taxonomy feed, no sitemap confirmed). **Not
falsified this pass** — no incumbent's docs showed both. This matches the
SAS's own driver 1 claim, but is now a measurement, not a citation of the
SAS's own prior claim about itself. Status: retained hypothesis, strengthened
by first external measurement.

**H2 — Conformance-as-build-gate accessibility.**
*Because* refusal is data (AD-04's constitutive principle) and the SAS
catalogs 16 build-time conformance checks with named refusal codes (§9.3),
VICTOR could make WCAG/ARIA conformance a release-blocking default no
measured incumbent enforces. **Checked against the portfolio:** confirmed —
Eleventy's own docs explicitly refuse this stance in writing ("automated
auditing systems are only a starting point"); Astro's testing guide shows
accessibility as opt-in author tooling, not a gate; Hugo, Ghost, and Quartz
disclose nothing. **But checked against VICTOR's own shipped code, this pass
falsifies the claim as a present-tense capability**: `build.mjs` wires exactly
one of the sixteen specified checks (C-13, link integrity, via
`static-site-conformance-service`); grep across `src/` finds no call site for
contrast, WCAG, or ARIA checking — theme contrast certification belongs to
`web-theming-service`, while VICTOR's ordinary rendering remains separate
from any per-page checker invoked by the build. **Status: not yet a BEAT
result — a specified, unbuilt advantage.** The gap between "no incumbent does
this" and "VICTOR does this" is exactly the C-01–C-03/C-08–C-10/C-14/C-15
wiring named in §3's accessibility row.

**H3 — TUFTE zero-JS tile surfaces.**
*Because* VICTOR's tile projections (atlas, neighborhood) are complete
server-rendered pages with TUFTE's browser layer as pure enhancement (SAS
§7.4, README.md:25), VICTOR could serve a relational graph view that works
identically with JavaScript disabled — a capability no measured graph-view
tool discloses. **Checked against the portfolio:** Quartz is the only
measured incumbent with a comparable graph surface; its docs (features and
graph-view pages) describe the feature but disclose nothing about rendering
technology or no-JS behavior — `unknown_reason: not stated in fetched pages`,
`next_evidence: Quartz component source, not yet read`. **No counterexample
found, but also no incumbent claim to falsify against** — this is weaker
support than H1 or H2 (an undisclosed unknown, not a measured absence).
Status: retained as a research hypothesis pending either a Quartz source
read or a VICTOR-side no-JS assay of its own atlas/neighborhood pages (the
latter is the cheaper, VICTOR-controlled evidence to gather first).

## 5. The one-line honest answer

**Can a publisher live entirely on VICTOR today:** not yet — no editor/admin
surface, no theme choice, two still-deferred dialect features (math,
raw HTML), and unprocessed images. Tables and SEO meta (OG/Twitter), absent
when this document was first measured, are closed as of 0.1.3; citations are
closed as of 0.1.5.
**VICTOR already meets or beats every measured incumbent on exactly one row this pass measured cleanly**: feed
format breadth (RSS+Atom+JSON Feed together — Hugo, Ghost, and Quartz each
ship RSS only; Astro and Eleventy require an opt-in package) and build
determinism (a stated, tested double-build guarantee no other measured
product discloses). VICTOR's two most load-bearing BEAT candidates — the
dual page-tree/graph projection (H1) and conformance-as-build-gate
accessibility (H2) — both survive the check against outside incumbents, but
H2 does not yet survive the check against VICTOR's own build pipeline: it is
specified, not shipped. The nearest receiver-visible wedge is therefore not
a new feature but **wiring the twelve already-specified, already-refusal-
coded conformance checks (C-01–C-03, C-08–C-10, C-14, C-15) that the SAS
names and the build does not yet call** — the smallest gap closure that
would convert H2 from a research hypothesis into the first assayed BEAT
result, and it requires no new design decision, only implementation against
a specification this document confirms is already complete.

## Sources

All fetched 2026-09-02 (UTC observed-at); `published_date: unknown` for every
docs page unless noted. Hugo: gohugo.io/documentation/, /content-management/
formats/, /templates/lookup-order/, /templates/internal/, /content-management/
front-matter/, /templates/rss/, /tools/search/. Ghost: docs.ghost.org/ (via
redirect from ghost.org/docs/), docs.ghost.org/llms.txt, docs.ghost.org/themes/
routing.md, ghost.org/marketplace/, activitypub.ghost.org/beta-plans/ (page's
internal references suggest ~2024 authorship; not independently confirmed —
`effective_date: unknown`). Astro: docs.astro.build/en/concepts/why-astro/,
/en/guides/images/, /en/guides/rss/, /en/guides/testing/. Eleventy:
www.11ty.dev/docs/, /docs/accessibility/. Quartz: quartz.jzhao.xyz/,
/features, /features/full-text-search, /features/graph-view (no rendering-
technology disclosure found), /plugins. VICTOR internal: README.md,
`content/text/documents/articles/notes/2026-08-26-victor-sas.md`,
`2026-08-26-note-on-victor-mandate.md`, `src/dialect.mjs`,
`@red-cup-engineering/web-theming-service/theming`,
`src/build.mjs`, TUFTE `src/publication/page.mjs` and `src/publication/feeds.mjs`, `test/*.test.mjs`,
`node_modules/@red-cup-engineering/static-site-conformance-service/README.md`.

## Addendum, 2026-09-16 (0.1.14): H2 moves from specified to partly shipped

The nearest wedge §5 named -- wiring the already-specified conformance checks
into the build -- is now real for seven of the sixteen: `src/conformance.mjs`
runs C-01 (doctype, title, unique ids), C-02 (ARIA-last: no explicit role
restating native semantics), C-03 (document language; contrast stays a
theme-level certification, C-08/C-14, which was already wired), C-09 (heading
hierarchy over the rendered page), C-10 (alt on every image; intrinsic
dimensions advised until VICTOR measures images), C-12 (JSON-LD parses and
types every node), and C-15 (orientation anatomy: title, one `h1`, `main`,
`nav`) over every HTML artifact, projector-supplied pages included, as a
build stage before asset fingerprinting. Each finding carries its SAS check id
and §9.4 code and blocks release like any other refusal; `conformance: false`
omits the stage.

The first assay of the gate against VICTOR's own output found a real anatomy
defect: cell, atlas, and neighborhood pages had no `nav` landmark under the
pinned TUFTE (0.8.2), so C-15's "where next" was unanswered on every published
page. Fixed in the same pass (the Explore tile is now a `nav`, atlas and
neighborhood pages carry the site menu and a `nav` of return links), and the
test suite now asserts VICTOR's own pages pass every wired check while a
deliberately broken projector page is refused with the exact codes.

Honest scope: C-01 and C-02 are machine subsets, not a WHATWG validator or a
full ARIA-in-HTML checker; C-04 (DOM/tab order), C-05 (CSS-off/JS-off), C-07
(page/data coherence), C-11 (feed schemas), and C-16 (live/frozen parity)
remain unwired. §2's accessibility row therefore moves from "spec'd, partially
wired (1 of 16)" to "8 of 16 wired as build-blocking checks"; the BEAT claim
in §4 stays a hypothesis until a representative property is built and
released through the gate.
