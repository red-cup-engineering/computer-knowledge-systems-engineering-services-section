# DREW application architecture

## Product boundary

DREW is a generalized relation-web workbench over native source observations.
It is not a universal parser, a generic triple database, or a replacement for
domain graph algorithms. A source owner observes its own substrate and submits
admitted relations plus defects. DREW catalogs those resource observations and
provides a common evidential web and typed projections.

The current module boundary is:

- `app`: adapter registry, resource refresh/tombstone journal, current-source
  composition, query, projection, explanation, diagnostics, and PAM view binding;
- `drew`: immutable relation-observation batches and occurrence-web carrier;
- `adapters`: compatibility with actual source-owner output contracts;
- `projections`: explicitly named compositions such as definition-mediated
  concept cells, never silent generic path inference;
- `pam` and `profiles`: optional valuations of a selected relation view;
- `mcp`: product-facing DREW tools plus separate PAM tools. Transport remains
  owned by an MCP host.

The aggregate graph is rebuildable cache. Markdown files, manifests, source code,
Guix modules, and source-owner receipts remain authoritative.

## Relation occurrence

Each admitted relation keeps subject, predicate, object, source resource and
revision, an occurrence address, and optional evidence/polarity/datum. In the
canonical web the occurrence is an entity linked to all three role terms. A
subject-to-object labeled edge and EAVT row are projections; neither replaces
the occurrence.

Empty admitted resources are valid. They distinguish “observed and asserted
nothing” from malformed/refused/unobserved. Diagnostics are first-class catalog
results and do not become invented negative edges.

## Refresh and composition

`observeResource` replaces the current materialization for one adapter/resource
key and appends a refresh record. `removeResource` appends a tombstone and removes
that resource from the current composition. `compose` deterministically rebuilds
the relation web from current entries. The in-memory journal proves the boundary;
durable storage and revision diff are still required.

## PAM boundary

PAM receives a declared DREW view, not the entire catalog by default. The first
profile retains independent for/against witnesses with FOUR knowledge join.
Reindexing is a valuation view operation, not a derived graph write. Closure is
not implemented until derivations have replayable receipts.

The formal sources contain distinct scalar-twist and truth-Heyting families.
DREW does not treat either as generic graph composition.

## No-collapse laws

- document links are not concept assertions;
- drawn Canvas edges are not corpus assertions;
- package-manifest declarations are not AST imports or lockfile resolutions;
- source identity, semantic identity, and entity equality are not interchangeable;
- SPO projections are lossy relative to EAVT/datoms with transaction evidence;
- operation admission is not predication settlement.
