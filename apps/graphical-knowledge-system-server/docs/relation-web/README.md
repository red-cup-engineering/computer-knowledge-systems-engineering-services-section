# DREW

DREW is the **Directed Relation Entity Web**: the generalized graph application
for working with the corpus's many witnessed triplet graphs without pretending
that all of those graphs mean the same thing.

```text
Markdown / JavaScript / Guix / package manifests / typed workspace resources
              |       native observers and admission policy
              v
       DREW resource catalog and observed relation web
              |       queries, provenance, diagnostics, typed projections
        +-----+--------------------+
        |                          |
        v                          v
  graph/codecs/renderers       PAM profile over a selected view
        |                          |
        +------------+-------------+
                     v
              MCP / CLI / UI / apps
```

DREW is the product and public entry point. Its relation web is under PAM: DREW
records what sources were observed, while Predicate Algebra Modeling reads a
declared relation space through an algebra profile. PAM is optional; a package
dependency DAG, backlink view, or provenance report need not become a PAM model.

The reusable `SignGraph (computer-networking-engineering-services-section/src/signgraph)` remains the neutral topology/algorithm
primitive under DREW. DREW adds source-resource identity, refresh/tombstone
history, witnessed relation occurrences, defects and refusals, composition of
current sources, explanations, and typed views.

## What works now

- `createDrewApp` registers native adapters, observes and refreshes resources,
  retains refresh history, and rebuilds the current aggregate relation web.
- Relation, entity, neighborhood, explanation, diagnostic, snapshot, EAVT, and
  definition-mediated concept-cell views are available from one app surface.
- The Geode adapter consumes Geode's real `{e,a,v,t}` declared-relation ledger,
  preserving frontmatter digests, malformed/unnamed diagnostics, and polarity.
- Geode's live concept lookup now runs through DREW, while Geode still owns
  Markdown parsing, concept vocabulary, UI, diagrams, and Canvas layout.
- The workspace-content-graph adapter consumes its real oriented relation
  carriers and retains carrier and witness identifiers.
- Product-facing MCP declarations expose catalog, relation, entity, projection,
  explanation, and diagnostic reads; PAM tools remain a separate namespace.
- PAM can interpret a selected DREW relation view with the finite FOUR profile.

This is the first consumer-backed slice, not a claim that graph consolidation is
finished. Durable persistence, filesystem/source watchers, a browser workbench,
real MCP transport mounting, JSNode/Metroplat migrations, revision diffing, and
a live Guix observer remain work. There is no verified active Guix graph observer
to call migrated yet.

## Product API

```js
import {
  createDrewApp,
  createGeodeDeclaredRelationsAdapter,
} from "@red-cup-engineering/drew";

const geode = createGeodeDeclaredRelationsAdapter({
  polarityByRelation: { defines: "positive", "contrasts-with": "negative" },
});
const drew = createDrewApp({ adapters: [geode] });

drew.observeResource({
  adapter: geode.name,
  resource: "geode-ledger",
  revision: "scan:42",
  value: { rows: [{ e: "order.md", a: "defines", v: "order", t: "digest" }] },
});

drew.queryRelations({ subject: "order.md" });
drew.project({ type: "definition-mediated-concept", name: "order" });
drew.diagnostics();

// Algebra is selected after the observed relation space exists.
const pam = drew.pam({ pattern: { subject: "order.md" } });
```

Read [architecture.md](architecture.md) for ownership and records,
[consumers.md](consumers.md) for migration boundaries, and
[source-ledger.md](source-ledger.md) for the theory/source audit.

Run `npm run check && npm test` here. Geode's compatibility migration is verified from its
own package with `npm run check && npm test`.
