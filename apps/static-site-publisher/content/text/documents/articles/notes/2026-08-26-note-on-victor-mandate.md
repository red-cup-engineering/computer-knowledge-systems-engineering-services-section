---
title: Note on the VICTOR Mandate
date-created: 2026-08-26
tags:
- victor
- website-server
- living-web
- tufte
- semantic-site-server
- content-addressing
- catalog
---


## The mandate

VICTOR — Voxelized Information Catalog Topos Orienting Relations — is Red Cup Engineering's website framework, holding one content-addressed catalog of related content and projecting it many ways: page-tree site, TUFTE browser applications, RDF (JSON-LD and Turtle), syndication feeds, and federation surfaces. The projections share one model and therefore cannot drift apart.

The mandate was identified by convergence of three independent surveys on 2026-08-26:

1. The L-Space cloud-topology deployment record (2026-08-21) defers exactly one interface: "typed semantic-neighborhood and multi-projection TUFTE explorer."
2. The market survey finds the largest structural gap in the website-server field is that page-tree publishers (Hugo, Astro, Ghost) and graph publishers (Quartz, TiddlyWiki, Obsidian Publish) almost never serve both from one content model.
3. The corpus's topos apparatus — `R = Sh(T,J)`, the seven closure conditions, the closure-cones H¹ gluing theorem — is the mathematics of one space supporting many consistent projections.

## Decisions recorded on 2026-08-26

- TUFTE expands as **Tiling User Form Topology Engine**. The four chosen words were restated on 2026-08-30: tiling, user, form, topology, engine.
- VICTOR absorbs the `semantic-site-server` code (currently under the web-services-section `lib/legacy/organizing-with-the-semantic-web` path, actively imported by experimental.561.group). The prior generational churn of site engines is understood as a consequence of limited attention budgets, not of flawed architecture; the code is sound to eat.
- VICTOR lives at `computer-systems-engineering-services-section/services/computer-systems-publishing-engineering-services-section/apps/victor/`, composing the publishing capabilities its parent section owns.
- VICTOR aims for next-generation web capability from the beginning, rather than staging standards conformance as a later phase.
- "Living Web" is not a W3C initiative; it is a 561 Group initiative. Its study lives in the Living Web Science Services Section (under computer-science-services-section). VICTOR's conformance targets are pinned to the real, current standards: the WHATWG HTML Living Standard, WCAG 2.2, and ARIA in HTML (W3C Recommendation, 2026-04-15), checked continuously at build time.

## Decisions recorded on 2026-08-30

VICTOR meets and beats current website frameworks. TUFTE must meet and beat current web rendering and application frameworks, and VICTOR consumes it as its user-interface engine. Domain applications are downstream of VICTOR when they are websites; they do not reconstruct the server, rendering, build, release, or live-rebuild stack from VICTOR's lower dependencies.

This package now exposes `createVictorWebsite()` as that downstream boundary. It forms the catalog and TUFTE projections, composes the domain HTTP application, serves through the shared upstream HTTP service, updates the running artifact inventory on rebuild, and drains the server and file watchers through one lifecycle. The CLI uses the same exported boundary.

## Inheritances

From the corpus's design theory, VICTOR inherits as floors, not goals:

- Pure-function server-first rendering to complete HTML; zero required client JS; zero-build, self-hosted, no third-party CDNs.
- Authored order equals DOM, tab, and reading order, as a tested invariant.
- WCAG 2.2 AAA contrast floors; visible focus; the plain-text-fallback test (the argument survives with CSS disabled and with JS disabled).
- Closed vocabularies grown only by earned addition (three independent cited uses).
- Refusal as first-class dispatched data.
- The Jiangshi criterion for any new structural joint: soft, local, reversible, evidenced by real use.

From the engineering survey, VICTOR adopts:

- Dual-mode serving from one reader and config: live server or crawl-and-freeze static projection (`buildApp` versus `projectSite`).
- Lattice-valued build reports (`meetBuilds`, `joinBuilds`, `residualBuild`) extended to carry conformance-check results.
- Doctested documentation in the TUFTE handbook pattern.
- Content-address-sharded static releases with a compact discovery index (the L-Space release pattern).
- The deployment-carrier pattern: the deploy target owns only provider configuration; all behavior lives in importable packages.
- Shadow-parity and rehearsed-rollback release checks (the koios.news pattern).

Two named cautions bound the scope: the 2026-08-04 dynamic-site accretion (ledger, payment, and agent-messaging infrastructure grown onto a home page, later stripped to a static page) and the retired `@emsenn/content` algebra (theory-laden abstraction over an ordinary content pipeline). The bilattice and topos mathematics ground the content model and merge semantics; the serving layer stays plain.

## Demands on TUFTE

VICTOR presses on TUFTE's own documented gaps: ARIA semantics for the typed vocabulary (`role`, `lifecycle`, `confidence`, `side` currently carry data-attributes only), styling for the documented default vocabulary values, a non-color signal for `side`, and the deferred progressive-disclosure primitive. Each addition passes through TUFTE's own evidence gate.

## Pending

- Retrieval of code and content living only on cold-red-gate (survey in progress as of this note's writing); findings feed the SAS.
- The SAS, HLD, and LLD notes follow in this directory.
