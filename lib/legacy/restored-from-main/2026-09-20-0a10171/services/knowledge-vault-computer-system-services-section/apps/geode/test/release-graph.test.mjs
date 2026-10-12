import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readDeclaredRelationLedger } from "../src/declared-relations.mjs";
import { createGeodeReleaseGraph } from "../src/release-graph.mjs";
import { createGeodeTypedFieldInput } from "../src/typed-field-input.mjs";
import { createGeodeWorkspace } from "../src/workspace.mjs";

const root = fileURLToPath(new URL("fixtures/relations-vault/", import.meta.url));
const profile = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../../../../../../../../../../../../science-services-section/services/philosophy-services-section/services/relationality-services-section/data/records/shared-typed-substrate-profile.json", import.meta.url), "utf8")));
const variable = (name) => Object.freeze({ kind: "knowing.sparql.variable", name });
const pattern = (s, p, o) => Object.freeze({ s, p, o });

async function liveAndRelease() {
  const live = await createGeodeWorkspace({ root });
  await live.completeSnapshot();
  const ledger = await readDeclaredRelationLedger({
    root,
    paths: live.snapshot.documents.map(({ path }) => path),
  });
  const release = await createGeodeReleaseGraph({ snapshot: live.snapshot, ledger });
  return { live, release };
}

test("opens a compiled snapshot and ledger without a filesystem root", async () => {
  const { release } = await liveAndRelease();
  assert.equal(release.type, "GeodeReleaseGraph");
  assert.equal(release.conceptsReady, true);
  assert.ok(release.conceptCount > 0);
  assert.equal((await release.conceptSummary()).rows, release.ledger.rows.length);
});

test("compiled concept and SPARQL reads equal the live workspace", async () => {
  const { live, release } = await liveAndRelease();
  assert.deepEqual(await release.concept("total-order"), await live.concept("total-order"));

  const queries = [
    Object.freeze({
      kind: "knowing.sparql.query",
      type: "select",
      select: Object.freeze(["document"]),
      where: Object.freeze([pattern(variable("document"), "defines", "total-order")]),
    }),
    Object.freeze({
      kind: "knowing.sparql.query",
      type: "ask",
      where: Object.freeze([pattern("order.md", "defines", "total-order")]),
    }),
    Object.freeze({
      kind: "knowing.sparql.query",
      type: "construct",
      where: Object.freeze([pattern(variable("document"), "defines", variable("concept"))]),
      construct: Object.freeze([pattern(variable("concept"), "defined-by", variable("document"))]),
    }),
  ];
  for (const query of queries) {
    assert.deepEqual(await release.sparql(query), await live.sparql(query));
  }
});

test("typed-field release input deterministically derives the existing query and release views", async () => {
  const { live, release } = await liveAndRelease();
  const typedField = createGeodeTypedFieldInput({ snapshot: live.snapshot, ledger: release.ledger, profile });
  const replay = await createGeodeReleaseGraph({ typedField });
  assert.deepEqual(replay.snapshot, release.snapshot);
  assert.deepEqual(replay.ledger, release.ledger);
  assert.deepEqual(await replay.concept("total-order"), await release.concept("total-order"));
  const query = Object.freeze({ kind: "knowing.sparql.query", type: "ask", where: Object.freeze([pattern("order.md", "defines", "total-order")]) });
  assert.deepEqual(await replay.sparql(query), await release.sparql(query));
  assert.deepEqual(await replay.feltosRelations({ predicate: "urn:geode:type" }), await release.feltosRelations({ predicate: "urn:geode:type" }));
  assert.deepEqual(typedField.refusals, profile.refusals, "science profile refusals propagate unchanged");
  assert.throws(() => createGeodeTypedFieldInput({ snapshot: live.snapshot, ledger: release.ledger, profile: { ...profile, refusals: [] } }), /universal-term refusals/u);
});

test("compiled releases defer and memoize FeltOS graph construction", async () => {
  const live = await createGeodeWorkspace({ root });
  await live.completeSnapshot();
  const ledger = await readDeclaredRelationLedger({ root, paths: live.snapshot.documents.map(({ path }) => path) });
  let constructions = 0;
  let open;
  const gate = new Promise((resolve) => { open = resolve; });
  const feltos = {
    summary: () => ({ type: "summary" }),
    relations: () => ({ type: "relations" }),
    entity: () => ({ type: "entity" }),
    diagnostics: () => ({ diagnostics: [], total: 0, truncated: false }),
  };
  const release = await createGeodeReleaseGraph({
    snapshot: live.snapshot,
    ledger,
    createFeltosGraph: async () => { constructions += 1; await gate; return feltos; },
  });

  await release.concept("total-order");
  await release.sparql({ kind: "knowing.sparql.query", type: "ask", where: Object.freeze([pattern("order.md", "defines", "total-order")]) });
  assert.equal(constructions, 0);

  const first = release.feltosSummary();
  const second = release.feltosRelations({});
  assert.equal(constructions, 1);
  open();
  await Promise.all([first, second]);
  await release.feltosEntity("order.md");
  assert.equal(constructions, 1);
});

test("compiled FeltOS reads equal the live snapshot projection", async () => {
  const { live, release } = await liveAndRelease();
  assert.deepEqual(await release.feltosSummary(), await live.feltosSummary());
  assert.deepEqual(
    await release.feltosRelations({ predicate: "urn:geode:type" }),
    await live.feltosRelations({ predicate: "urn:geode:type" }),
  );
  assert.deepEqual(
    await release.feltosEntity("order.md"),
    await live.feltosEntity("order.md"),
  );
});

test("compiled DREW tools use the same observed ledger as the live workspace", async () => {
  const { live, release } = await liveAndRelease();
  for (const [name, args] of [
    ["drew_catalog", {}],
    ["drew_relations", { subject: "total-order" }],
    ["drew_entity", { term: "total-order" }],
    ["drew_project", { type: "definition-mediated-concept", name: "total-order" }],
    ["drew_diagnostics", {}],
  ]) {
    assert.deepEqual(
      (await release.callGraphTool(name, args)).structuredContent,
      (await live.callGraphTool(name, args)).structuredContent,
      name,
    );
  }

  const relations = (await release.callGraphTool("drew_relations", {})).structuredContent.relations;
  assert.ok(relations.length > 0);
  const explained = await release.callGraphTool("drew_explain", { address: relations[0].address });
  assert.equal(explained.structuredContent.address, relations[0].address);
});

test("compiled graph diagnostics remain visible beside FeltOS diagnostics", async () => {
  const { live } = await liveAndRelease();
  const snapshot = Object.freeze({
    ...live.snapshot,
    graph: Object.freeze({
      ...live.snapshot.graph,
      diagnostics: Object.freeze({ dangling: 2, ambiguous: 1 }),
    }),
  });
  const ledger = await readDeclaredRelationLedger({ root, paths: live.snapshot.documents.map(({ path }) => path) });
  const release = await createGeodeReleaseGraph({ snapshot, ledger });
  const diagnostics = await release.feltosDiagnostics();
  assert.ok(diagnostics.diagnostics.some(({ code, count }) => code === "geode-release-dangling" && count === 2));
  assert.ok(diagnostics.diagnostics.some(({ code, count }) => code === "geode-release-ambiguous" && count === 1));
});

test("rejects mismatched compiled graph carriers", async () => {
  await assert.rejects(
    () => createGeodeReleaseGraph({ snapshot: {}, ledger: {} }),
    /Geode workspace snapshot/u,
  );
});
