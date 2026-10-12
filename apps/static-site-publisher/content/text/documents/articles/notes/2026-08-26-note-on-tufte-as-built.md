---
title: TUFTE As Built (0.4.1)
date-created: 2026-08-26
tags:
- tufte
- victor
- api
- rendering
- accessibility
---


TUFTE is the Tiling User Form Topology Engine. Version 0.4.1 is implemented as a zero-dependency, server-first HTML tile renderer with a browser patch and interaction layer. It does not yet supply the breadth expected from a world-class browser application framework; those absences are product gaps, not architectural refusals. The package is `@red-cup-engineering/web-tufte-gui-services-section`, distributed through the group's internal npm registry, which also preserves every published version from 0.2.0 onward. The published artifact is the checked-in `.mjs` and `.d.mts` files themselves — the type declarations are hand-written, there is no build step, and the verify script syntax-checks every module. This note records the 0.4.1 contract VICTOR depended on; the governing mandate is broader.

## API

The package has exactly two entry points plus a CLI.

The root entry (Node- and CLI-safe) exports `renderTufteDocument(model, options)` (a complete `<!doctype html>` page: masthead, skip link, `prefers-reduced-motion` rule, dark-only base styles with five theme-alias custom properties for the house shelf-chrome convention), `renderTufteFragment(model)` (a bare `<div class="tufte-grid">` with none of that scaffolding, for embedding in a page that owns its own shell), `normalizeTufteModel(model)`, `diffTufteProjection(prev, next)`, `confidenceBadgeTile(...)`, and `disclosurePanelTile(...)`.

The `./browser` entry (DOM-only) exports `connectTufteDocument(root, opts)`, `applyTufteProjectionPatch(root, patches, opts)`, `applyTufteReceipt(root, body)`, and the Wave1 additions: `connectTufteNavigation(root, opts)`, `applyTufteFieldErrors(form, tile)`, and `withPendingLifecycle(root, ids, action)`.

The CLI `render-tufte-document` reads one JSON model on stdin and writes HTML on stdout.

## Document model

A tile is a plain object with fields `id`, `title`, `eyebrow`, `role`, `lifecycle`, `confidence`, `side`, `span` (2–12, CSS grid columns), `live` ("polite", "assertive", or absent), and either `content` (auto-escaped text) or `html` (trusted markup; `html` wins when both are present). `normalizeTufteModel` coerces every semantic field through the safe-token rule `/^[a-z][a-z0-9-]*$/i`, deduplicates ids deterministically by array index (`a` becomes `a-2`), and clamps `span`. Unknown fields survive normalization untouched but are invisible to `diffTufteProjection`, which diffs only its closed field list — storing domain data on a tile and expecting a live update to notice it is a documented trap.

Only part of the vocabulary has CSS. Styled today: roles `now`, `rail`, `aside`; lifecycles `imminent` and (since Wave1) `pending`; confidence `low`; sides `lake` and `land` (names borrowed from the North Shore consumer's own domain, and acknowledged as not domain-neutral). Every other value, including every documented default, renders unstyled.

The trust boundary is stated in the README: `tile.html`, `mastheadHtml`, `footerHtml`, `headHtml`, and `clientScript` are trusted fragments; everything else is auto-escaped.

## Patch and interaction semantics

Live updates are a patch primitive, not a virtual DOM. `diffTufteProjection` emits `update`, `insert`, `remove`, and `reorder` operations. `applyTufteProjectionPatch` replaces the whole tile body on any content change — never sub-node diffing — and places structural operations by the authored `afterId`, never by observed DOM position, which is what keeps tab order equal to authored order even mid-reorder. The documented cost: patching a tile containing an in-progress form wipes typed state, so read-mostly tiles are the safe use case.

`tick` is an opaque caller-supplied ordering token that gates stale patches to no-ops; TUFTE never owns a clock. `revision` is a display string with no gating semantics.

The action loop: a click or submit on `[data-tufte-action]` dispatches `tufte:action`, POSTs `{action, value, revision}`; success dispatches `tufte:receipt` (nothing applies it automatically — the app's listener calls `applyTufteReceipt`); failure dispatches `tufte:refusal` carrying `{message}` plus `.tile` when the server's error body is tile-shaped JSON. Refusal is dispatched data, first-class beside receipt.

Wave1 added: `connectTufteNavigation` (documents-as-routes without a router — an `<a data-tufte-nav>` fetches JSON, diffs, patches, pushes state; a plain `<a href>` is untouched, so zero-JS navigation is the floor); `applyTufteFieldErrors` (a `tile.fields` convention producing inline `aria-invalid`/`aria-describedby`); `withPendingLifecycle`; `tile.live` and `focusOnInsert` (focus moves to a newly inserted tile's heading); and opt-in `options.transition` wrapping structural patches in `document.startViewTransition`.

## Accessibility: guaranteed and gapped

Guaranteed by test: authored order equals DOM and tab order always, including through structural patches and `grid-auto-flow: dense` visual repacking; automatic `aria-labelledby` per tile; skip link and reduced-motion on full documents; auto-escaping of title, eyebrow, and content.

Named gaps: no `aria-live` region exists unless an app opts a tile in via `live`; whole-tile-body replace can destroy focus and typed state; `role`, `lifecycle`, `confidence`, and `side` carry zero ARIA semantics — they are data attributes only, so a screen reader learns nothing unless the same fact is also visible text; `side`'s only signal is border color; and dense-grid visual adjacency is not the same claim as keyboard-sequential order (the docs warn against conflating them). There is no progressive-disclosure primitive; it was deliberately deferred behind an evidence gate.

VICTOR's four standing change requests, to be filed through that evidence gate as TUFTE work: ARIA semantics for the typed vocabulary; styles for the documented default values; a non-color signal for `side`; the disclosure primitive.

## The 0.4.0 lessons

Version 0.4.0 shipped two defects that the competitive-position document (2026-08-20) reports in full. `findTileById` regressed from an O(1) selector query to an O(n) array scan, taking a 1,000-tile, 200-tick update from 69.9ms (0.3.1) to 655–817ms — briefly slower than HTMX's real network round trip. Separately, a cross-realm `AbortSignal` bug silently broke the entire action/refusal loop under jsdom while all 72 tests stayed green, because the hand-rolled DOM test double never modeled realm-sensitive constructors. Both were fixed in 0.4.1 (169–235× faster than 0.4.0; 12–20× faster than 0.3.1). The lessons, which the SAS encodes as its error philosophy: fake-DOM-only test suites can mask a full capability outage, and a green count is not a capability claim. The Wave1 client runtime also grew from 14.8KB to 35KB unminified (4.5KB to 10.9KB gzip); the document flags this honestly and recommends tree-shakeable sub-exports.

## Consumers and their pins

play.561.group is pinned to 0.3.1 (never touched by the 0.4.0 regression). The North Shore Scenic Railroad transit PWA is pinned to 0.2.0 and vendors `tufte-browser.mjs` into its deploy overlay by script rather than installing at deploy time; upgrading a live, healthy pilot is treated as a deliberate step of its own. The Lenticule knowledge vault is the deepest consumer: it uses TUFTE as a deterministic 96-column tiling grid for the L-Space entrance, having explicitly rejected force-directed layout as "not an honest default" for a ten-thousand-room corpus, and treats tile order as the semantic reading and tab order.

## Documentation pattern

TUFTE's handbook is doctested: every code sample in it carries a doctest identifier and is executed by the test suite, so the documentation cannot drift from the code. TUFTE's examples include the same leaderboard application built twice — once in TUFTE, once in hand-rolled vanilla DOM — so lines, bytes, and performance are compared honestly against the do-nothing alternative. VICTOR adopts both patterns for its own handbook and examples.
