---
title: Graph API Consolidation
description: Refactoring plan to consolidate graph infrastructure into a single API module with atomic functions, automatic generation, and code deduplication.
date-created: 2026-04-03
type: note
name: graph-api-consolidation
keywords:
  - graph-api
  - infrastructure-consolidation
  - auto-generation
  - code-deduplication
  - pure-functions
specialization: plan
date-completed: 2026-04-03
department: engineering
project: generative-harness
in-service-of: lib/emsenn/services/561-group/services/561-group-services-section
---

## User prompt (2026-04-03)

> I noticed that nothing helped you generate a graph when one didn't exist. let's make a plan to redo how we work with our graphs so there's one set of tools for working on graphs and others just parameterize it, use it as an "api", and those tools make sure to generate a graph if one doesn't exist yet. we want atomic pure functions for scripts, atomic everything

## The problem

The graph infrastructure has two layers that both read `knowledge-graph.json` directly:

1. **Datascript layer** — `generate-library-graph.js` (full rebuild), `query-library-graph.js` (Datalog queries), `patch-graph.js` (single-file upsert)
2. **EAVT layer** — `datastore.js` (flat index, used by 12+ tools: briefing, plan-status, project-status, tracking-status, dispatch-work, domain-survey, critical-path, plan-variance, create-record, check-record, generate-soul, compose-environment)

Both layers crash if `knowledge-graph.json` doesn't exist. Shared functions are duplicated across files: `parseFrontmatter` x3, `deriveDomain` x2, `deriveContentRole` x2, `GRAPH_PATH` x4.

## The solution

One module (`graph.js`) that IS the graph API. Every other tool parameterizes it. The module:
- Exports atomic pure functions for parsing, derivation, entity building
- Exports `ensureGraph()` that auto-generates when the graph is missing
- Exports `loadDatascript()` and `loadEAVT()` that call `ensureGraph()` first
- Is the single source of truth for constants, schema, and shared logic

## Phases

### Phase 1: Build the module
1. **extract-shared-primitives** — `parseFrontmatter`, `deriveDomain`, `deriveContentRole` into `graph.js`
2. **extract-graph-generation** — `generateGraph()` as pure function in `graph.js`
3. **ensure-graph-auto-generation** — `ensureGraph()` that generates when missing
4. **graph-load-functions** — `loadDatascript()` and `loadEAVT()` that call `ensureGraph` first
5. **slim-generate-library-graph** — CLI wrapper becomes ~15 lines

### Phase 2: Migrate consumers
6. **migrate-datastore-to-graph-api** — `datastore.js` delegates to `graph.js`
7. **migrate-query-to-graph-api** — `query-library-graph.js` uses `graph.js`
8. **migrate-patch-to-graph-api** — `patch-graph.js` uses `graph.js`

### Phase 3: Verify
9. **verify-graph-cold-start** — delete graph, run briefing, it works

## Success criteria

- [ ] One canonical `parseFrontmatter()`, `deriveDomain()`, `deriveContentRole()`
- [ ] Zero direct references to `knowledge-graph.json` path outside `graph.js`
- [ ] `ensureGraph()` auto-generates when graph is missing
- [ ] All existing tools work unchanged (same CLI interface, same output)
- [ ] Delete `knowledge-graph.json` + run `briefing.js` = success
