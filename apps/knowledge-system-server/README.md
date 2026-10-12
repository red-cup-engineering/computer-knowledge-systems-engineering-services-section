# knowledge-system-server (CAIRN)

CAIRN is **Content Archive Inspection, Revision, and Navigation**. It is the
headless command application and JavaScript API for working with admitted
digital content archives.

A content archive may contain text, images, audio, video, datasets, compound
documents, or formats not invented yet. CAIRN's contract therefore concerns
addresses, media and structural
metadata, relationships, readings, queries, revisions, and receipts. It does
not require a browser, VICTOR, TUFTE, GEODE, or VaultMaze.

The Markdown adapter uses the Markdown engine for path enumeration, document observation,
relation derivation, and revision-safe file writes. Opening enumerates paths; a reading observes
one file. Metadata and relation queries explicitly observe the admitted corpus, retaining compact
records and revision evidence without caching document bodies. A write updates only its record.
The default inventory admits up to 100,000 Markdown candidates and reports truncation explicitly.

CAIRN also owns the cell-catalog boundary used by publishing and graphical
consumers. `./content-reader` observes regular filesystem records with digest
and dependency evidence; `./catalog` admits publication cells, assembles
redirects, incoming relations and name resolution; `./cell` exports the shared
cell vocabulary; and `./vault-catalog` admits Markdown-vault rooms and doors as
cells. Route spelling remains a presentation policy supplied by the consumer,
so CAIRN never imports a publisher or renderer.

## Command application

```sh
cairn summary --root /path/to/archive
cairn list --root /path/to/archive --limit 50
cairn search --root /path/to/archive --query topology
cairn search --root /path/to/archive --query "quoted prose" --mode text
cairn read --root /path/to/archive --path notes/tufte.md
cairn replace --root /path/to/archive --path notes/tufte.md \
  --expected-revision sha256:... --file revised.md
```

Every successful command writes schema-bearing JSON. Replacement requires the
revision that was actually read; a stale writer receives a refusal instead of
overwriting newer content.

## Application composition

GEODE is the Graphical Entity Ontology Difference Engine built over CAIRN and
served by VICTOR through TUFTE. VaultMaze is a separate navigational-learning
application over admitted CAIRN resources. L-Space is a situated application
that selects GEODE or VaultMaze according to verified principal authority and
user configuration.

The predecessor application package mixed all of those duties. CAIRN
deliberately does not.

## Vocabulary routes

`src/vocabulary.mjs` answers the anonymous `/ns/term/<identity>` and
`/ns/predicate/<name>` routes with JSON-LD, Turtle, or an HTML redirect. A term's
graph answers under the house surface policy, through the term owner's
`glossaryAudienceAdmits`: only a carrier whose own frontmatter says
`visibility: public` and states no `consent-status` is served; any other term
is an unknown identity (404), its admission findings included. A browser is
redirected to the term's public room, or else to its room behind admission.
