# knowledge-vault-web-server (GEODE)

GEODE is the **Graphical Entity Ontology Difference Engine**: Red Cup
Engineering's first-party graphical application for exploring, comparing, and
changing admitted content archives and their entity graphs.

Its mandate is to meet and beat the useful capabilities of Obsidian, Notion,
Roam, Logseq, and other research-note and knowledge-work applications without
shrinking itself to their shared feature intersection.

GEODE composes CAIRN for content-archive operations, FeltOS for shared workspace
graph composition, and TUFTE for user forms and topology. VICTOR remains an optional
website delivery adapter. Markdown is the first
CAIRN adapter and the current complete vertical slice; GEODE's product ontology
is not limited to Markdown.

GEODE is not an Obsidian plugin and does not depend on the Obsidian runtime or API.
Obsidian integration remains a separate concern of `computer-interface-system-services-section/services/obsidian-services-section`, which may ship an Obsidian plugin app of its own.

## Product invariants

1. Ordinary local files are authoritative; every index, graph, cache, projection, and UI state is replaceable.
2. Markdown remains inspectable, diffable, durable, and usable without GEODE.
3. Reading is broad but bounded; writing is explicit, confined, reviewable, and witnessed.
4. CAIRN archive operations remain independent of GEODE's browser, desktop, and mobile projections.
5. Relationships retain their kinds and evidence instead of collapsing into anonymous graph lines.
6. Human and agent operations share declared commands, contracts, receipts, and capability boundaries.
7. Accessibility and keyboard operation are architectural requirements, not final-pass polish.
8. Meet-or-beat claims require executable evidence in a versioned capability ledger.

## Current vertical slice

The current alpha slice crosses the first trustworthy authoring boundary:

```text
local Markdown directory
  -> bounded carrier admission
  -> structured document index
  -> typed link graph and backlinks
  -> safe Markdown rendering
  -> GEODE Fetch application mounted in VICTOR
  -> keyboard-searchable browser interface
  -> TUFTE Markdown source form
  -> SHA-256 revision precondition
  -> path-confined atomic replacement
  -> commit receipt or stale-revision refusal
```

The digest guard and atomic carrier write live in the upstream Markdown file service rather than in
GEODE. GEODE owns the edit command, admitted target, browser projection, and response policy.

Create an admitted workspace, then mount GEODE through a VICTOR website's `applications` option:

```js
import { createGeodeWorkspace } from "@red-cup-engineering/knowledge-vault-web-server/workspace";
import { createGeodeVictorApplicationFactory } from "@red-cup-engineering/knowledge-vault-web-server";

const workspace = await createGeodeWorkspace({ root: "/absolute/path/to/vault" });
const applications = createGeodeVictorApplicationFactory({ workspace });
```

GEODE is a website: VICTOR owns its build, runtime, release, network serving, observability, and protocol composition. TUFTE is the web rendering/application framework; GEODE supplies the knowledge-work application rather than assembling another website stack.

The VICTOR-mounted application exposes the same bounded relation capabilities used by downstream hosts: concept reads, DREW catalog/relation/entity/projection/diagnostic reads at `POST /api/graph/query`, FeltOS composition of GEODE's already-admitted CAIRN workspace graph at `POST /api/feltos`, and Knowing's structured SPARQL Basic Graph Pattern `SELECT`, `ASK`, and `CONSTRUCT` projection at `POST /api/sparql`. FeltOS does not rescan the corpus: it preserves GEODE's resolved-link evidence while DREW supplies aggregate occurrence identity and provenance. The SPARQL face accepts JSON triple patterns and can emit bounded Turtle for `CONSTRUCT`; it is deliberately not advertised as a textual, standards-complete SPARQL endpoint.

For an admitted authoring session, import `createGeodeAuthoring` from
`@red-cup-engineering/knowledge-vault-web-server/authoring`. The same entry exports
`validateGeodeAuthoringConfig`, `projectGeodeEditorDocument`, and
`renderGeodeEditorDocument`. An authoring session confines reads and revision-checked
writes to its configured root and region; its editor projection uses
`geode-editor-document/v1` and the `geode:replace-document/v1` action.

## Repository-scale navigation

Every GEODE workspace uses CAIRN's document catalogue. Opening enumerates Markdown paths without
reading document bodies. `root` fixes the filesystem boundary; optional `region` and `excludes`
narrow the inventory. Paths in listings, readings, and write receipts remain relative to `root`.

`browse(prefix, { compress: true })` collapses single-child directory runs until a branch or a
directory containing a document. Each result retains its full path. Use `{ compress: false }`
to inspect each directory level.

## Relations at repository scale

Reading observes one document. The catalogue retains metadata, features, diagnostics, and revision
evidence, without retaining full bodies. Literal search reads bounded text matches; metadata search
explicitly observes all admitted documents so declared aliases and headings remain discoverable.

`GET /api/relations?path=` explicitly requests alias-aware outgoing links, backlinks, and ambiguous
mentions. It observes the admitted corpus and derives the graph from those same records. A write
updates one record; later complete queries check filesystem revisions and reread changed documents.

Unobserved relations remain unknown until requested. Truncated inventories and unreadable or invalid
metadata make relation results incomplete, with diagnostics retained. `completeSnapshot()` explicitly
requests all observations and relations for downstream graph projections; the immediate `snapshot`
may contain only the documents read so far.

The web interface is GEODE's human interface, suitable for direct browser use, PWA installation, or bundling in a desktop or mobile package.
It talks to an independently hosted GEODE kernel: loopback for a local vault, or an authenticated remote kernel for a remote workspace.
No wrapper may acquire independent vault semantics.

## Documents

- [Architecture](docs/architecture.md)
- [Capability benchmark](docs/capability-benchmark.md)
- [Roadmap](docs/roadmap.md)
- [Collaboration law](docs/collaboration-law.md)
- [Upstream dependency map](docs/upstream-dependency-map.md)
- [Repository migration inventory](docs/repository-migration-inventory.md)
