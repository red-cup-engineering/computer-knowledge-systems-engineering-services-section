# GEODE architecture

## First-principles model

An GEODE vault is not a database owned by the application.
It is an admitted region of a filesystem whose Markdown carriers are authoritative evidence.
Documents, headings, properties, links, transclusions, and later relational constructs are observed from those carriers.
Search indexes, backlinks, graph layouts, Bases-like views, and agent context packs are projections that can be discarded and rebuilt.

The model follows the repository's science:

- files are durable, inspectable carriers;
- headings and blocks are addressable substructures;
- frontmatter is semantic annotation;
- links are evidenced relations rather than decoration;
- directories provide namespaces, not meaning by themselves;
- stable handles may address files, sections, headings, blocks, queries, canvases, or operations;
- interaction surfaces are projections over handles and relations;
- each write should expose its contract and retain a witness.

## Layer boundaries

```text
authoritative carriers
  filesystem, Markdown, attachments, JSON Canvas, view definitions
        |
observation services
  bounded walk, read, parse, index, link resolution, diagnostics
        |
GEODE kernel
  handles, workspace snapshots, commands, policies, transactions, receipts
        |
projections
  search, backlinks, graph, properties, collections, context, publication
        |
adapters
  TUFTE browser forms, specialized editor/3D islands, CLI, MCP/OpenAPI, sync, publish
```

Dependencies point inward.
No UI component receives raw filesystem authority, and no adapter becomes a second source of vault truth.

## Mutation model

The read-only first slice establishes the observation boundary before writes exist.
The first write-capable slice must introduce all of the following together:

1. a command naming intent and admitted targets;
2. a precondition containing the observed version or content hash;
3. a proposed patch rather than an implicit mutation;
4. a preview that a human or authorized agent can inspect;
5. an atomic, path-confined commit;
6. a receipt containing before and after identities;
7. a tested inverse or explicit declaration that no inverse exists;
8. index invalidation and deterministic refresh.

Autosave may later automate approval for a narrow class of editor commands, but it may not erase this transaction boundary.

## Extension model

GEODE will support extensions, but not ambient-authority scripts.
An extension declares commands, views, codecs, settings, and required capabilities in a manifest.
Filesystem, network, process, model, credential, and mutation authorities are individually granted and revocable.
The same declaration projects human settings, command-palette entries, CLI help, and agent-readable resources.

## Hosting model

The web interface is the canonical GEODE interface, not a temporary mockup.
It is projected through TUFTE, the Tiling User Form Topology Engine, and may run as a normal site, an installed PWA, or inside a desktop or mobile package.
TUFTE owns the form topology, accessible interaction lifecycle, and action/receipt/refusal presentation.
GEODE owns document semantics and mutation policy; specialized text-editing or QwzSpace surfaces remain capability-bounded islands inside TUFTE forms.

The kernel is independently admitted, then exposed as a Fetch application inside VICTOR's website runtime. VICTOR owns network serving, rebuilds, release composition, observability, health, and protocol applications. TUFTE supplies the web rendering and application framework. GEODE owns the research-work semantics and mutation authority.

The CAIRN-admitted workspace graph is also projectable through FeltOS without a second filesystem observation. GEODE supplies resolved Markdown edges and diagnostics, FeltOS composes the provider view, and DREW supplies relation occurrence identity and provenance. This composition is available through the workspace API and the bounded `/api/feltos` network face.
This separation preserves one web interface while avoiding dependence on uneven browser directory permissions, browser worker lifetime, or origin-private storage that other local tools cannot inspect.

A future desktop wrapper bundles the web interface and local kernel; it does not create another application architecture.
Electron-versus-Tauri therefore remains a distribution decision constrained by measured integration and performance requirements, not a knowledge-model decision.

The upstream dependency and collaboration doctrine is recorded in [upstream dependency map](./upstream-dependency-map.md).

## Separate Obsidian product

The Obsidian engineering section owns Obsidian-specific services and its plugin app.
GEODE may reuse generic capabilities proven there—context packs, proposal review, receipts, checkpoints, connector projection—but cannot import the Obsidian API or model itself as an Obsidian plugin.
