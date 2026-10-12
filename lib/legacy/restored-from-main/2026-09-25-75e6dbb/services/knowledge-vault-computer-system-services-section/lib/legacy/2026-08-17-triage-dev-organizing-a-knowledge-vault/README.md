# @emsenn/organizing-a-knowledge-vault

The organizing downstream specialization for mounted `content/` knowledge-vault trees.

This package owns the corpus boundary for a knowledge vault: modeling the expected root affordances, resolving topic proof paths, browsing generated frontiers, reading markdown resources through relating's codecs, bounded name/text addressing, preparing frontmatter documents, projecting topic health/inspection/ gap/concept-map carriers, and admitting bounded corpus regions as knowing memory/research.

`@emsenn/knowing` keeps the epistemic core: proof search, concept formation, memory, and research carriers.
This package specializes those capabilities to a concrete filepath-tree law for knowledge vaults.
In this package, the corpus is the persistent memorystore.

The expected knowledge-vault root is the repository `content/` tree.
Its durable root affordances are `scripts/`, `content/`, `_archive/`, `_triage/`, and `docs/`.
When a vault uses Diataxis placement, the package recognizes `docs/explanations/`, `docs/references/`, `docs/guides/`, and `docs/tutorials/`; those paths do not have to sit under a term-local `docs/` directory.
`inspect-root` reports the stable package prefixes, expected affordance paths, and observed top-level prefixes present in the mounted root; path confinement uses the stable/observed union so site-specific roots are discovered instead of being baked into the universal root law.
When no explicit `--path` is provided, `resolveKnowledgeVaultRoot` walks up from the current workspace context and mounts the nearest workspace `content/` directory.
`ORGANIZING_KNOWLEDGE_VAULT_PATH` overrides that default.

`@emsenn/organizing` supplies the gluing read: `organize-corpus` reads a bounded corpus region as a three-face social boundary (membership, markdown conformance, tags/placement) and returns an `organizing.organization`.

The `./addressing` subpath exposes `findAddressedName` and `grepAddressedText` for bounded, confined corpus lookup.
These are concrete filepath-corpus helpers; `@emsenn/knowing` receives already gathered resources as memory.

The `./corpus` subpath owns corpus reading, cataloging, and document-type law.
Its direct read APIs and memory-backed actions use the same bounded-read law: `corpusReadBounds` clamps resource limits and scan limits before touching the persistent memorystore.
Use `--limit` and `--maxScan` to bound action reads.
The `./mutating` subpath prepares markdown documents and dated triage deposits, plans normalization endomorphisms, and owns the knowledge-vault topic projection carriers: `topic-inspection`, `topic-gap-measurement`, `topic-concept-map`, and `topic-guidance`.
These projections keep upstream knowing readings as evidence while exposing corpus dashboards and placement actions as the public package contract.
Its placement morphisms (`targetPathForDocument`, `normalizeCorpusPlacementTopic`, and `documentOperationKind`) let agents ask where a document would land before preparing or writing it; observed content roots are preserved, while support prefixes such as `dev/` remain available for notes without becoming topic roots.
The `./holography` subpath projects corpus-backed memory and mutation carriers into transport-neutral dashboard summaries, including the `memory-health` projection carrier used by `inspect-health`.
The `./actions` subpath exposes the relating dispatcher verbs without requiring consumers to import the whole package root.
The `./agents` subpath exposes first-class relating resources and prompts for coding agents: Markdown orientation and path-law resources, JSON profile and workflow resources, and an `orient-knowledge-vault-agent` prompt.
The HTTP/MCP server induces those legs alongside the actions so AI clients can discover repository expectations before invoking tools.
Mutating actions are dry-run by default; pass `--write true` when the dispatcher should write to the persistent memorystore.

```sh
echo topic/note | organize-knowledge-vault locate --path content
echo topic | organize-knowledge-vault browse --path content
echo note | organize-knowledge-vault find-name --path content --limit 20
echo concept | organize-knowledge-vault grep-text --path content --region content --limit 20
echo "" | organize-knowledge-vault catalog --path content --limit 100
echo "" | organize-knowledge-vault settle-memory --path content --limit 50 --maxScan 1000
echo concept | organize-knowledge-vault inspect-topic --path content --region content --limit 100
echo concept | organize-knowledge-vault concept-map --path content --region content --limit 100
echo concept | organize-knowledge-vault measure-gap --path content --region content --limit 100
echo content | organize-knowledge-vault inspect-health --path content --limit 100
echo content | organize-knowledge-vault normalization-plan --path content --limit 100
echo concept | organize-knowledge-vault topic-guidance --path content --region content --limit 100
echo "" | organize-knowledge-vault organize-corpus --path content --limit 50 --identity content-corpus
echo '{"content":"# Incoming Note\n\nA bounded deposit."}' | organize-knowledge-vault upload-triage-file --path content --write true
echo "" | organize-knowledge-vault build-document-types --path content
echo '{"typePath":"docs/references/document-types/specification","at":"topic","name":"Topic Specification","description":"Normative notes"}' | organize-knowledge-vault realize-document-type --path content --write true
echo topic/docs/dev/specification.md | organize-knowledge-vault audit-document-type --path content
```

The document-type workflow is the corpus-specific typed resource law: claim schema fragments into a confined assertion log, project that log into a JSON Schema using `@emsenn/relating/codecs/schema`, realize markdown through `@emsenn/relating/codecs/markdown`, and audit existing corpus resources against filename, placement, and frontmatter law.
