# GEODE

GEODE is the **Graphical Entity Ontology Difference Engine**: Red Cup
Engineering's first-party graphical application for exploring, comparing, and
changing admitted content archives and their entity graphs.

Its mandate is to meet and beat the useful capabilities of Obsidian, Notion,
Roam, Logseq, and other research-note and knowledge-work applications without
shrinking itself to their shared feature intersection.

GEODE composes CAIRN for content-archive operations, VICTOR for the complete
website boundary, and TUFTE for user forms and topology. Markdown is the first
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
import { createGeodeWorkspace } from "@red-cup-engineering/geode/workspace";
import { createGeodeVictorApplicationFactory } from "@red-cup-engineering/geode";

const workspace = await createGeodeWorkspace({ root: "/absolute/path/to/vault" });
const applications = createGeodeVictorApplicationFactory({ workspace });
```

GEODE is a website: VICTOR owns its build, runtime, release, network serving, observability, and protocol composition. TUFTE is the web rendering/application framework; GEODE supplies the knowledge-work application rather than assembling another website stack.

The VICTOR-mounted application exposes the same bounded relation capabilities used by downstream hosts: concept reads, DREW catalog/relation/entity/projection/diagnostic reads at `POST /api/graph/query`, FAE composition of GEODE's already-admitted Markdown graph at `POST /api/fae`, and Knowing's structured SPARQL Basic Graph Pattern `SELECT`, `ASK`, and `CONSTRUCT` projection at `POST /api/sparql`. FAE does not rescan the corpus: it preserves GEODE's resolved-link evidence while DREW supplies aggregate occurrence identity and provenance. The SPARQL face accepts JSON triple patterns and can emit bounded Turtle for `CONSTRUCT`; it is deliberately not advertised as a textual, standards-complete SPARQL endpoint.

## Repository-scale navigation

The `bare-cedar-fog` workspace profile observes this repository through its vault policy and can be mounted through the same VICTOR application factory.

Two navigation controls exist, and neither changes what a path means.

`vaultRoot` sets the shallowest directory the explorer will show. It is a display and
navigation boundary only: `root` remains the confinement boundary, and every path in a
listing, reading, or write receipt stays repository-relative, so receipts remain comparable
with Git. Generic region and exclusion overrides are refused under this profile rather than silently
ignored, because the vault policy owns which regions are scanned.

Browse listings also collapse single-child directory runs. A directory holding exactly one
child, whose child holds exactly one child, costs a click per level while carrying no
choice; such a run is presented as a single item. The run stops at the first divergence and
at any directory that also holds a document, so a collapsed item always ends where a real
choice begins.

## Relations at repository scale

Applications of this kind hold the whole parsed vault in memory to answer "what links here."
That is what caps them: the ceiling is not the number of files but the number of files whose
text fits in one process. This profile holds paths and no bodies, and derives relations
per document instead.

Opening a document indexes that one document and resolves its links against a path alias index
built once per refresh, so `resolved`, `ambiguous`, and `dangling` keep their ordinary meanings
without the corpus ever being parsed. Because the index is built from paths, a link that names
only a document's declared frontmatter alias does not resolve; it reads as dangling rather than
being attributed by guess.

Backlinks are served separately, at `GET /api/backlinks?path=`, so opening a document stays a
single-file read. A bounded vault search finds documents mentioning this one in link position,
and each candidate's edges are then derived, so a reported backlink is an edge that actually
resolves here rather than a text match. Mentions that resolve elsewhere, or that are ambiguous,
are reported as their own kind and not counted as links.

The receipt carries `nameCarriers`: how many documents in the vault answer to this bare name.
It is why a widely mentioned `README` can have few provable backlinks: nearly every link using
it is ambiguous. Saying so is more useful than reporting zero.

This is display compression, not flattening. The full proof path rides in `path` unchanged,
and the factorization by which a resource was classified is retained in full — only the
number of clicks changes. Pass `{ compress: false }` to `browse` to observe the uncollapsed
tree.

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
