import { identify as rowId } from "@red-cup-engineering/eavt";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/computer-code-engineering-services-section/semiotic-expression-notation/runtime";
import { admitRelationalFieldDocument } from "@red-cup-engineering/computer-data-engineering-services-section/type-system/relations";
import { isAcyclic, reachable } from "@red-cup-engineering/computer-networking-engineering-services-section/signgraph/graph";
import { catalogWorkspaceContentGraph, projectContentGraph, projectWorkspaceContentGraphTyped, projectWorkspaceFrontmatterClaimSections } from "../src/workspace-content-graph.mjs";

const termSchema = Object.freeze({
  $id: "emsenn/schema/term",
  type: "object",
  required: Object.freeze(["id", "name", "definition"]),
  additionalProperties: false,
  properties: Object.freeze({
    id: Object.freeze({ type: "string", minLength: 1 }),
    name: Object.freeze({ type: "string", minLength: 1 }),
    definition: Object.freeze({ type: "string", minLength: 1 }),
  }),
});

test("a glossary term presents predication generators without fabricating evidence or settlement", () => {
  const graph = catalogWorkspaceContentGraph({
    resources: [
      { path: "term.schema.json", content: JSON.stringify(termSchema) },
      { path: "friend.json", content: JSON.stringify({ id: "friend", name: "Friend", definition: "A person held in mutual affection." }) },
    ],
  });

  assert.equal(graph.glossaryUtteranceReadouts.length, 1);
  assert.equal(graph.version, 3);
  const [readout] = graph.glossaryUtteranceReadouts;
  assert.equal(readout.predicationGenerators.kind, "predication.site");
  assert.equal(readout.predicationGenerators.cells.length, 1);
  assert.equal(readout.predicationGenerators.specializations.length, 0);
  assert.equal(readout.predicationGenerators.cells[0].subject.mark.value, "Friend");
  assert.equal(readout.predicationGenerators.cells[0].predicate.mark.value, "A person held in mutual affection.");
  assert.equal(readout.predicationGenerators.cells[0].object.mark.value, "Friend");
  assert.equal(readout.correspondence.positing, "no-positive-or-negative-evidence-source-is-present");
  assert.equal(readout.correspondence.settling, "no-settling-operation-is-performed");

  const presentation = graph.relations.find(({ predicate: edgePredicate }) => edgePredicate === "urn:semiotic:presents-predication-generators");
  assert.equal(presentation?.subject, readout.articulation.id);
  assert.equal(presentation?.predicate, "urn:semiotic:presents-predication-generators");
  assert.equal(presentation?.object, readout.predicationGeneratorsNi);
  assert.equal(presentation?.kind, "workspace.oriented-relation.carrier");
  assert.deepEqual(presentation?.witnessIdentifiers, [readout.articulation.id]);
  assert.equal(Object.hasOwn(presentation, "coordinates"), false);
  assert.equal(Object.hasOwn(presentation, "reading"), false);
  assert.equal(Object.hasOwn(presentation, "positive"), false);
  assert.equal(Object.hasOwn(presentation, "negative"), false);
});

test("March 28 frontmatter becomes witnessed, EAVT-shaped claims without fabricated settlement", () => {
  const path = "notes/2026-03-28-1016h.md";
  const content = readFileSync(new URL("./fixtures/2026-03-28-frontmatter.md", import.meta.url), "utf8");
  const graph = catalogWorkspaceContentGraph({ resources: [{ path, content }] });

  assert.equal(graph.frontmatterClaims.length, 4);
  assert.equal(graph.denominator.frontmatterClaims, 4);
  const title = graph.frontmatterClaims.find(({ predicate }) => predicate === "title");
  assert.equal(title.subject, path);
  assert.equal(title.object, "emsenn's Log, 2026-03-28, 1016h");
  assert.deepEqual(Object.keys(title.eavt), ["e", "a", "v", "t"]);
  assert.deepEqual(title.eavt, {
    e: path,
    a: "title",
    v: title.object,
    t: {
      kind: "predication.independent-evidence",
      version: 1,
      side: "positive",
      by: title.sourceWitness.carrierBytesNi,
      witness: title.sourceWitness,
    },
  });
  assert.match(title.sourceWitness.carrierBytesNi, /^ni:\/\/\/sha-256;/u);
  assert.match(title.sourceWitness.carrierSemanticNi, /^ni:\/\/\/sha-256;/u);
  assert.deepEqual(title.evidenceCoordinates.positive, [title.sourceWitness.carrierBytesNi]);
  assert.deepEqual(title.evidenceCoordinates.negative, []);
  assert.equal(title.correspondence.disposition, "unsettled");
  assert.match(title.correspondence.identity, /without alias normalization/u);
  assert.match(title.correspondence.negativeEvidence, /no converse predicate/u);
  assert.match(title.correspondence.settling, /no FOUR fold/u);
  assert.match(title.correspondence.sheafification, /no sheaf operation/u);
});

test("frontmatter arrays remain separate claims and authored aliases are not collapsed", () => {
  const graph = catalogWorkspaceContentGraph({
    resources: [{ path: "terms/relation.md", content: "---\naliases: [Relation, relating]\n---\n\nA relation.\n" }],
  });
  const aliases = graph.frontmatterClaims.filter(({ predicate }) => predicate === "aliases");
  assert.deepEqual(aliases.map(({ object }) => object), ["Relation", "relating"]);
  assert.equal(new Set(aliases.map(({ id }) => id)).size, 2);
  assert.equal(aliases.every(({ correspondence }) => correspondence.disposition === "unsettled"), true);
});

test("independent opposing witnesses reach TOP without treating converse orientation as denial", () => {
  const path = "notes/2026-03-28-1016h.md";
  const content = readFileSync(new URL("./fixtures/2026-03-28-frontmatter.md", import.meta.url), "utf8");
  const graph = catalogWorkspaceContentGraph({ resources: [{ path, content }] });
  const positive = graph.frontmatterClaims.find(({ predicate }) => predicate === "title");
  const negativeWitness = {
    ...positive.sourceWitness,
    carrierBytesNi: "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  };
  const negativeBody = {
    ...positive,
    sourceWitness: negativeWitness,
    evidenceCoordinates: { positive: [], negative: [negativeWitness.carrierBytesNi] },
    eavt: {
      ...positive.eavt,
      t: {
        ...positive.eavt.t,
        side: "negative",
        by: negativeWitness.carrierBytesNi,
        witness: negativeWitness,
      },
    },
  };
  delete negativeBody.id;
  const negative = {
    id: identifyJsonSemanticContent({
      objectKind: "workspace.frontmatter-claim",
      value: negativeBody,
      witnessRoot: EMPTY_WITNESS_ROOT,
    }).token,
    ...negativeBody,
  };
  const projection = projectWorkspaceFrontmatterClaimSections({ ...graph, frontmatterClaims: [...graph.frontmatterClaims, negative] });
  const title = projection.sections.find(({ predicate }) => predicate === "title");

  assert.equal(title.settled, "stable");
  assert.deepEqual(title.evidenceRowIds.positive, [rowId(positive.eavt)]);
  assert.deepEqual(title.evidenceRowIds.negative, [rowId(negative.eavt)]);
  assert.deepEqual(title.sourceWitnesses.positive, [positive.sourceWitness]);
  assert.deepEqual(title.sourceWitnesses.negative, [negative.sourceWitness]);
  assert.equal(title.sourceWitnesses.positive.length, 1);
  assert.equal(title.sourceWitnesses.negative.length, 1);
  assert.deepEqual(new Set(title.chuRead.cells.map(({ value }) => value)), new Set(["potential", "active"]));
  assert.equal(title.subject, path);
  assert.equal(title.object, positive.object);
});

test("frontmatter section projection feature-detects old v3 graphs and rejects malformed additive carriers", () => {
  assert.equal(projectWorkspaceFrontmatterClaimSections({ type: "WorkspaceContentGraph", version: 3 }), null);
  assert.throws(
    () => projectWorkspaceFrontmatterClaimSections({ type: "WorkspaceContentGraph", version: 3, frontmatterClaims: {} }),
    /must be an array/u,
  );
});

test("an empty Markdown heading preserves its parsed document in the addressed graph", () => {
  const graph = catalogWorkspaceContentGraph({ resources: [{ path: "notes/empty-heading.md", content: "#\n\nBody.\n" }] });
  assert.equal(graph.resources.length, 1);
  assert.equal(graph.resources[0].path, "notes/empty-heading.md");
  assert.equal(Object.hasOwn(graph.resources[0], "document"), true, "the semantic envelope retains the admitted Markdown document");
  assert.equal(graph.relations.length, 0);
});

test("projectContentGraph turns relations into a SignGraph graph, reachable and acyclic per its real dependency edges", () => {
  const graph = catalogWorkspaceContentGraph({
    resources: [
      { path: "a/package.json", content: JSON.stringify({ name: "@example/a", version: "1.0.0", dependencies: { "@example/b": "1.0.0" } }) },
      { path: "b/package.json", content: JSON.stringify({ name: "@example/b", version: "1.0.0" }) },
    ],
  });
  const contentGraph = projectContentGraph(graph);
  assert.equal(contentGraph.edges().length, graph.relations.length);

  const dependencyGraph = projectContentGraph(graph, { kind: "urn:npm:dependencies" });
  assert.equal(isAcyclic(dependencyGraph), true, "the dependency-only projection has no cycle, unlike the mixed-kind graph with its realizes-actor/has-apex pair");
  const [dependencyEdge] = dependencyGraph.edges();
  assert.equal(dependencyEdge.from, "urn:npm:@example/a");
  assert.equal(dependencyEdge.to, "urn:npm:@example/b");
  assert.deepEqual([...reachable(dependencyGraph, "urn:npm:@example/a")], ["urn:npm:@example/b"]);
});

test("the supported typed projection preserves the observed graph and deterministically re-admits its Things and witnessed relations", () => {
  const resources = [
    { path: "package.json", content: JSON.stringify({ name: "@example/observed", version: "1.0.0", dependencies: { "@example/provider": "1.0.0" } }) },
    { path: "notes/example.md", content: "---\ntitle: Example\n---\n\n# Example\n" },
  ];
  const graph = catalogWorkspaceContentGraph({ resources });
  const reading = structuredClone(graph);
  const first = projectWorkspaceContentGraphTyped(graph);
  const second = projectWorkspaceContentGraphTyped(catalogWorkspaceContentGraph({ resources }));

  assert.deepEqual(graph, reading, "projection is a pure read of the existing observation");
  assert.deepEqual(first, second, "equal corpus observations produce equal Thing and statement identities");
  assert.deepEqual(first.things.map(({ id }) => id), second.things.map(({ id }) => id));
  assert.deepEqual(first.relationalFieldDocument.statements.map(({ id }) => id), second.relationalFieldDocument.statements.map(({ id }) => id));
  const replayed = admitRelationalFieldDocument(first.relations, structuredClone(first.relationalFieldDocument));
  assert.equal(replayed.ok, true, replayed.ok ? undefined : replayed.refusal.message);
  assert.equal(first.relationalFieldDocument.statements.length, graph.relations.reduce((count, relation) => count + relation.witnessIdentifiers.length, 0) + graph.frontmatterClaims.length);
  assert.deepEqual(catalogWorkspaceContentGraph({ resources }), reading, "legacy observable graph reading and source identities remain unchanged");
});
