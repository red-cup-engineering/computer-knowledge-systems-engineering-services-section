# CAIRN

CAIRN is **Content Archive Inspection, Revision, and Navigation**. It is the
headless command application and JavaScript API for working with admitted
digital content archives.

A content archive is more general than a knowledge vault. It may contain text,
images, audio, video, datasets, compound documents, or formats not invented
yet. CAIRN's contract therefore concerns addresses, media and structural
metadata, relationships, readings, queries, revisions, and receipts. It does
not require a browser, VICTOR, TUFTE, GEODE, or VaultMaze.

The current discrete adapter is Markdown. It composes the existing directory,
document-index, graph, frontmatter, file-reading, and revision-safe file-writing
services. That adapter is an exemplar, not a claim that all content is Markdown.
Additional archive adapters must preserve the same typed admission and revision
boundaries without coercing their content into Markdown-shaped data.

## Command application

```sh
cairn summary --root /path/to/archive
cairn list --root /path/to/archive --limit 50
cairn search --root /path/to/archive --query topology
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

The old Knowledge Vault package mixed all of those duties. CAIRN deliberately
does not.
