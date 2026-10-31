# @red-cup-engineering/carrier-kind-engineering-services-section

Admits a content carrier's frontmatter by the schema its kind names.
It is the engineering side of wave 1.2 of [the corpus knowledge graph program](../../../../../../../../../science-services-section/services/information-science-services-section/services/knowledge-services-section/services/knowledge-organization-services-section/content/text/documents/articles/notes/2026/09/30/2026-09-30-the-corpus-knowledge-graph-program.md).

## One authority, projected

The carrier-kind schemas belong to the [knowledge organization science section](../../../../../../../../../science-services-section/services/information-science-services-section/services/knowledge-services-section/services/knowledge-organization-services-section/README.md), in `schemas/carriers/<kind>.schema.json` (`$id` `carriers/<kind>`).
This package holds byte-identical projections of them in `schemas/carriers/` and only compiles them; a test fails when a projection drifts from its source.

- `npm run project-science-schemas` copies each science schema here. A schema whose `$id` is not `carriers/<kind>` is refused.
- `npm run generate-ontology` regenerates the science section's `data/ontology/carriers/{ontology,shapes}.ttl` with `json-schema-to-owl-shacl-service`. The term schema is passed as a reference, so the note schema's borrowed keys resolve without minting a term class.

Schema class IRIs are `https://561.group/ns/schema/<$id>`, the namespace the Group's other generated ontologies use.
Where `/ns/` finally lives is the program's open question 2, decided in wave 3.1.

## Kinds

The kind comes from the artifact-role directory (the program's decision 5); `./carrier-path` reads it.
`carrierKindOf(path)` takes the first directory past the Group content containers (`content`, `text`, `documents`, `articles`, `glossary`, `media`) and makes it singular, so `articles/notes/2026/09/30/x.md` is a `note`.
`sectionOf`, `roleOf` and `kindOf` are the same functions the corpus census uses.

| Kind | Schema | Required |
|---|---|---|
| `note` | `carriers/note` | `title`, `description`, `date-created` |

Glossary terms and bibliography carriers keep their own owners: [term-engineering](../computer-glossary-systems-engineering-services-section/services/term-engineering-services-section/README.md) and [bibliography-engineering](../bibliography-engineering-services-section/README.md).

## Admission

`admitCarrierFrontmatter(kind, frontmatter)` returns `{admitted, findings}`.
The kind's schema is compiled with the term schema as a reference, because aliases, keywords, references and provenance are the term schema's.
Every predicate of the relation vocabulary is admitted as a key; a `carrier`-range predicate takes one identity or a non-empty list of them.

Each finding's `rule` is the failed schema keyword and the top-level key it failed on: `required:description`, `pattern:keywords`, `type:references`.
A value that no alternative of a `oneOf` admits gives one `oneOf:<key>` finding, not one per alternative.

## Repair plans

`./note-repair`'s `planNoteFrontmatterRepair({path, text, frontmatter, body, firstRecorded})` plans the edits that bring a note toward its schema, from what the note already says:

- a title from its first heading or file name;
- `date-created` from `date`, its dated path, or the date its carrier first appears in custody;
- a description from the first sentence of its first prose paragraph;
- keywords in kebab case;
- loose `references` entries moved to `cites`.

It invents nothing, and only plans. Applying a plan is a byte-preserving, revision-guarded fold (the program's decision 6).
