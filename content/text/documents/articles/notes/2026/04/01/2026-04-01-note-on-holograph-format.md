---
title: Datascript for Holograph Format
description: Explains the decision to migrate holograph knowledge graph from TTL to Datascript, with performance benchmarks and implementation changes.
date-created: 2026-04-01
type: note
name: holograph-format
keywords:
  - datascript
  - knowledge-graph
  - datalog
  - eav-model
  - ttl-migration
specialization: plan
date-completed: 2026-04-01
project: generative-harness
in-service-of: lib/emsenn/services/561-group/services/561-group-services-section
---

## Decision: Datascript

Migrated from TTL (Turtle/RDF) to **Datascript** — an in-memory Datalog database.

**Why Datascript:**
- Zero external dependencies (vendored single JS file)
- EAV (entity-attribute-value) model maps directly to frontmatter-as-facts
- Datalog queries replace regex string matching — supports joins, aggregation, rules
- 20MB TTL → 6.5MB JSON (serialized Datascript DB)
- Same load-and-query pattern as before, but with real indexes and query power
- Used by Roam and Logseq for the same use case (frontmatter over a knowledge base)

**Alternatives considered:** Cozo (heavier, WASM), SQLite+CTEs (no graph model), DuckDB+PGQ (overkill), LevelGraph (aging), SurrealDB/TypeDB (server model), custom JSONL (no rules).

## What changed

- `generate-library-graph.js` — outputs `knowledge-graph.json` (serialized Datascript DB) instead of `knowledge-graph.ttl`
- `query-library-graph.js` — uses Datascript queries instead of regex parsing; added raw `query` command for arbitrary Datalog
- `vendor/datascript-1.7.8.min.js` — vendored Datascript runtime (462KB)
- `/library-graph` command updated

## Future

- Add Datalog **rules** for transitive domain membership, constraint validation
- Explore whether persistent barcode can be expressed as a Datalog program
- Consider whether the holograph structure (boundary/bulk/projection) suggests derived-fact rules

## Related

- `relational-holograph.md` — the math of boundary-recovers-bulk
- `persistent-barcode.md` — tracking how obstructions persist across depth
