# GEODE roadmap

## Phase 0 — foundation

- Establish product invariants and the Obsidian/GEODE boundary.
- Maintain a versioned capability ledger.
- Compose existing Markdown directory, index, graph, file, frontmatter, and rendering services.
- Ship the read-only local workspace slice with automated tests.

## Phase 1 — trustworthy authoring

- Consume the upstream digest-guarded Markdown transaction contract rather than implementing filesystem mutation inside GEODE. The replace-at-revision alpha path is implemented; broader transaction operations remain.
- Add a structured editor adapter without making editor state authoritative.
- Implement proposal, diff, atomic commit, witness receipt, undo, and recovery contracts.
- Add create, rename, move, delete-to-trash, attachments, templates, and daily notes.
- Add filesystem watching with content-identity conflict detection.

## Phase 1.5 — collaborative documents

- Specify document-operation admission and convergence laws before selecting an OT, CRDT, or ordered-authority realization.
- Add TUFTE collaborator, draft, acknowledgement, conflict, and history forms around the specialized editor island.
- Support presence, attributed edits, causal undo, resumable sessions, and history playback.
- Materialize admitted shared state into ordinary Markdown checkpoints and reconcile external filesystem revisions without silent loss.
- Project collaboration acts into witness evidence without requiring that every operation itself be SEAVT.

## Phase 2 — retrieval and structure

- Implement an explainable query language covering content, paths, properties, tasks, blocks, sections, and graph relations.
- Add quick switcher, command palette, global and local graph projections, unlinked mentions, outline, tags, and property management.
- Introduce stable block/heading handles without making nonstandard syntax mandatory.

## Phase 3 — spatial and tabular views

- Read and write open JSON Canvas.
- Introduce an open GEODE view format for table, list, card, calendar, and map projections.
- Keep view files declarative and all view indexes derivable.

## Phase 4 — extension and automation platform

- Build capability-scoped extension manifests and a sandbox boundary.
- Project commands once into UI, keyboard, CLI, MCP, OpenAPI, and agent resources.
- Port generic cockpit capabilities: bounded context, missions, proposals, receipts, queues, checkpoints, and handoffs.

## Phase 5 — distribution

- Select and package a desktop shell from measured requirements.
- Add mobile and web/PWA shells over the same kernel.
- Add provider-independent encrypted sync and reproducible publishing adapters.
- Publish migration and compatibility tools for Obsidian vaults, settings, Bases, and Canvas.

## Continuous gates

Every phase carries accessibility, keyboard navigation, performance budgets, corruption and recovery tests, path confinement, deterministic projection tests, and benchmark evidence.
