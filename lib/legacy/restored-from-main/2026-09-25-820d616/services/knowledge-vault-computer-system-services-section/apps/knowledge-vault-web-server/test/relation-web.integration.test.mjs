import assert from "node:assert/strict";
import test from "node:test";

import { createRelationCatalog } from "../src/relation-catalog.mjs";
import { createGeodeDeclaredRelationsAdapter, workspaceContentGraphAdapter } from "../src/relation-adapters.mjs";
import { createPam, replayPam } from "@red-cup-engineering/computer-networking-engineering-services-section/signgraph/pam";
import { converse, triple } from "@red-cup-engineering/computer-data-engineering-services-section/signcell/cell";
import { fourScalarTwist } from "@lenticule-science/metrologic/articulation/predicating/positing/four-scalar-twist";
import { eavtRelations, javascriptModuleClaims, markdownFrontmatterClaims, observeClaims } from "@red-cup-engineering/computer-networking-engineering-services-section/signgraph/relation-adapters";
import { createRelationWeb as createDrew, replayRelationWeb as replayDrew } from "@red-cup-engineering/computer-networking-engineering-services-section/signgraph/relation-web";

test("DREW observes directed relations below PAM and replays them exactly", () => {
  const web = createDrew();
  const input = {
    source: { substrate: "test", revision: 1 },
    relations: [{ subject: "ada", predicate: "knows", object: "logic" }],
  };
  const first = web.observe(input);
  const duplicate = web.observe(input);

  assert.equal(first.admitted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(web.query().length, 1);
  assert.equal(web.snapshot().web.nodes.length, 4); // occurrence plus three role terms
  assert.equal(web.snapshot().web.edges.length, 3);
  assert.equal(web.snapshot().edgeProjection.edges.length, 1);
  assert.match(web.query()[0].address, /#relation=0$/u);
  assert.deepEqual(replayDrew(web.events()).snapshot(), web.snapshot());
});

test("the scalar twist family is named separately from cell moves and delegates to articulating", () => {
  assert.equal(fourScalarTwist.fusion("absurd", "absurd"), "active");
  assert.equal(fourScalarTwist.fusion("stable", "potential"), "potential");
  assert.match(fourScalarTwist.residuation("potential", "active", "stable").kind, /:witness$/u);
});

test("DREW freezes JSON observations and refuses one id for different content", () => {
  const web = createDrew();
  const subject = { id: "ada" };
  web.observe({ id: "observation:1", source: "test", relations: [{ subject, predicate: "knows", object: "logic" }] });
  subject.id = "mutated";

  assert.deepEqual(web.query()[0].subject, { id: "ada" });
  assert.throws(() => web.observe({
    id: "observation:1",
    source: "test",
    relations: [{ subject: "grace", predicate: "knows", object: "logic" }],
  }), /already names different content/u);
  assert.throws(() => web.observe({ source: "test", relations: [{ subject: () => true, predicate: "p", object: "o" }] }), /JSON value/u);
});

test("DREW journals substrate refusals without fabricating relation cells", () => {
  const web = createDrew();
  const refusal = web.refuse({
    source: { substrate: "markdown", resource: "broken.md" },
    refusal: { reason: "frontmatter did not parse" },
  });

  assert.equal(refusal.event.admission.status, "refused");
  assert.equal(web.events().length, 1);
  assert.equal(web.query().length, 0);
  assert.deepEqual(replayDrew(web.events()).snapshot(), web.snapshot());
});

test("PAM interprets independent DREW evidence without making DREW depend on PAM", () => {
  const web = createDrew();
  web.observe({
    source: "observer:one",
    relations: [{ subject: "ada", predicate: "knows", object: "logic", polarity: "for" }],
  });
  web.observe({
    source: "observer:two",
    relations: [{ subject: "ada", predicate: "knows", object: "logic", polarity: "against" }],
  });

  assert.equal(web.query().length, 2);
  assert.equal("reading" in web.query()[0], false);

  const pam = createPam({ web });
  const reading = pam.read({ subject: "ada", predicate: "knows", object: "logic" });
  assert.equal(reading.reading, "stable");
  assert.equal(reading.settlement.status, "not-run");
  assert.equal(reading.evidence.for.length, 1);
  assert.equal(reading.evidence.against.length, 1);
});

test("DREW remains value-algebra neutral and PAM profiles interpret observation data", () => {
  const web = createDrew();
  web.observe({
    source: "observer:datum",
    relations: [{ subject: "ada", predicate: "knows", object: "logic", datum: "against" }],
  });

  assert.equal(web.query()[0].datum, "against");
  assert.equal(createPam({ web }).query()[0].reading, "active");
});

test("PAM messages are reified as idempotent DREW observation batches", () => {
  const pam = createPam();
  const message = {
    sender: "agent:ada",
    claims: [{ subject: "ada", predicate: "writes", object: "notes" }],
  };
  const first = pam.dispatch(message);
  const duplicate = pam.dispatch(message);

  assert.equal(first.admitted, true);
  assert.equal(first.readings[0].reading, "potential");
  assert.equal(duplicate.duplicate, true);
  assert.equal(pam.web.events().length, 1);
  assert.deepEqual(replayPam(pam.messages()).query(), pam.query());
});

test("substrate adapters project observed records without doing substrate I/O", () => {
  const markdown = markdownFrontmatterClaims([
    { id: "a.md", frontmatter: { relates: ["b.md", "c.md"], title: "A" } },
  ], { relations: { relates: "for" } });
  const javascript = javascriptModuleClaims([
    { id: "a.mjs", imports: ["b.mjs"], exports: ["run"] },
  ]);
  const eavt = eavtRelations([{ e: "a.md", a: "contrasts-with", v: "b", t: "digest" }], {
    polarityByAttribute: { "contrasts-with": "against" },
  });

  assert.equal(markdown.length, 2);
  assert.equal(eavt[0].datum, "against");
  assert.deepEqual(javascript.map((claim) => claim.predicate), ["imports", "exports"]);

  const web = createDrew();
  observeClaims(web, { source: "fixture", claims: [...markdown, ...javascript] });
  assert.equal(web.query().length, 4);
});

test("PAM exposes the live cell maps as valuation reindexing, not derived writes", () => {
  const pam = createPam();
  pam.dispatch({
    sender: "test",
    claims: [{ subject: "b", predicate: "relates", object: "a" }],
  });

  const converseTriple = (value) => triple(converse(value));
  assert.deepEqual(converseTriple({ subject: "a", predicate: "relates", object: "b" }), {
    subject: "b", predicate: "relates", object: "a",
  });
  const reading = pam.reindex(converseTriple, { name: "converse" })
    .read({ subject: "a", predicate: "relates", object: "b" });
  assert.equal(reading.witness.reading, "potential");
  assert.equal(pam.web.query().length, 1); // a reindexed read does not assert a converse cell
});

test("the DREW app composes current native resources and retains refresh history", () => {
  const app = createRelationCatalog({ adapters: [workspaceContentGraphAdapter] });
  const first = app.observeResource({
    adapter: "workspace-content-graph/v1",
    resource: "workspace.json",
    revision: "ni:first",
    value: { relations: [{
      kind: "workspace.oriented-relation.carrier",
      id: "ni:relation-1",
      subject: "package:a",
      predicate: "depends-on",
      object: "package:b",
      witnessIdentifiers: ["ni:manifest"],
    }] },
  });
  app.observeResource({
    adapter: "workspace-content-graph/v1",
    resource: "workspace.json",
    revision: "ni:second",
    value: { relations: [{
      kind: "workspace.oriented-relation.carrier",
      id: "ni:relation-2",
      subject: "package:a",
      predicate: "depends-on",
      object: "package:c",
      witnessIdentifiers: ["ni:lockfile"],
    }] },
  });

  assert.equal(first.changed, true);
  assert.equal(app.catalog().resources.length, 1);
  assert.equal(app.history().length, 2);
  assert.deepEqual(app.queryRelations().map((relation) => relation.object), ["package:c"]);
  assert.deepEqual(app.queryRelations()[0].evidence.witnessIdentifiers, ["ni:lockfile"]);
  assert.equal(app.project({ type: "eavt" })[0].e, "package:a");
});

test("Geode's real EAVT contract becomes witnessed cells without losing defects", () => {
  const adapter = createGeodeDeclaredRelationsAdapter({
    polarityByRelation: { defines: "positive", specialization: "positive", "contrasts-with": "negative" },
  });
  const app = createRelationCatalog({ adapters: [adapter] });
  app.observeResource({
    adapter: adapter.name,
    resource: "geode-ledger",
    revision: "scan:1",
    value: {
      type: "GeodeDeclaredRelationLedger",
      schemaVersion: "geode-declared-relations/v1",
      rows: [
        { e: "order.md", a: "defines", v: "total-order", t: "digest-a" },
        { e: "order.md", a: "specialization", v: "partial-order", t: "digest-a" },
        { e: "order.md", a: "contrasts-with", v: "partial-order", t: "digest-a" },
      ],
      unnamed: 2,
      defects: [{ path: "broken.md", reason: "frontmatter did not parse" }],
    },
  });

  const [cell] = app.project({ type: "definition-mediated-cells" });
  assert.equal(cell.subject, "total-order");
  assert.equal(cell.object, "partial-order");
  assert.equal(cell.reading, "stable");
  assert.deepEqual(cell.for.map((witness) => witness.predicate), ["specialization"]);
  assert.deepEqual(cell.against.map((witness) => witness.predicate), ["contrasts-with"]);
  assert.equal(app.diagnostics().length, 2);
  assert.equal(app.pam().read({ subject: "order.md", predicate: "contrasts-with", object: "partial-order" }).reading, "active");

  const index = app.project({ type: "definition-mediated-index" });
  assert.deepEqual(index.concepts, ["partial-order", "total-order"]);
  assert.deepEqual(index.definitions, [{ concept: "total-order", documents: ["order.md"] }]);
  assert.deepEqual(index.documents, [{ document: "order.md", concepts: ["total-order"] }]);
  assert.deepEqual(index.declarations.find((entry) => entry.concept === "partial-order").witnesses, [
    { relation: "contrasts-with", documents: ["order.md"] },
    { relation: "specialization", documents: ["order.md"] },
  ]);
  assert.equal(index.cells[0].reading, "stable");
});

test("Geode declaration observation identity ignores enumeration order and retains changed evidence", () => {
  const adapter = createGeodeDeclaredRelationsAdapter();
  const app = createRelationCatalog({ adapters: [adapter] });
  const rows = [
    { e: "z.md", a: "defines", v: "alpha", t: "source-z" },
    { e: "a.md", a: "specialization", v: "alpha", t: "source-a" },
  ];
  const observe = (reading) => app.observeResource({
    adapter: adapter.name,
    resource: { kind: "geode-declared-relation-ledger" },
    revision: { rows: 2, documents: 2 },
    value: { rows: reading },
  });

  const first = observe(rows);
  const originalRelations = app.queryRelations();
  const reordered = observe([...rows].reverse());
  assert.equal(reordered.changed, false);
  assert.equal(reordered.entry.observationId, first.entry.observationId);
  assert.deepEqual(app.queryRelations(), originalRelations);

  const revised = observe([{ ...rows[0], t: "changed-source-z" }, rows[1]]);
  assert.equal(revised.changed, true);
  assert.notEqual(revised.entry.observationId, first.entry.observationId);
  assert.equal(app.queryRelations({ subject: "z.md" })[0].evidence.frontmatterDigest, "changed-source-z");
});

test("a PAM reading with no window option matches today's unwindowed output exactly", () => {
  const web = createDrew();
  web.observe({ source: "s1", relations: [{ subject: "a", predicate: "knows", object: "logic", polarity: "for" }] });
  web.observe({ source: "s2", relations: [{ subject: "a", predicate: "knows", object: "logic", polarity: "against" }] });
  const pam = createPam({ web });

  const cell = { subject: "a", predicate: "knows", object: "logic" };
  assert.deepEqual(pam.read(cell, {}), pam.read(cell));
  assert.deepEqual(pam.query({}, {}), pam.query({}));
  assert.deepEqual(pam.query(), pam.query({}));
});

test("windowed PAM readings partition the observed rows on append order (interim, not the real sigma/Delta nucleus)", () => {
  const web = createDrew();
  web.observe({ source: "s1", relations: [{ subject: "a", predicate: "p1", object: "1" }] });
  web.observe({ source: "s2", relations: [{ subject: "a", predicate: "p2", object: "2" }] });
  web.observe({ source: "s3", relations: [{ subject: "a", predicate: "p3", object: "3" }] });
  web.observe({ source: "s4", relations: [{ subject: "a", predicate: "p4", object: "4" }] });
  const pam = createPam({ web });

  const cutoff = web.query().find((row) => row.object === "2");
  const full = pam.query();
  const untilCutoff = pam.query({}, { until: cutoff });
  const afterCutoff = pam.query({}, { after: cutoff });

  const untilAddresses = new Set(untilCutoff.map((reading) => reading.cellAddress));
  const afterAddresses = new Set(afterCutoff.map((reading) => reading.cellAddress));
  const fullAddresses = new Set(full.map((reading) => reading.cellAddress));

  assert.equal(untilCutoff.length, 2); // rows 1 and 2
  assert.equal(afterCutoff.length, 2); // rows 3 and 4
  for (const address of untilAddresses) assert.equal(afterAddresses.has(address), false);
  assert.deepEqual(new Set([...untilAddresses, ...afterAddresses]), fullAddresses);
  assert.throws(() => pam.query({}, { until: cutoff, after: cutoff }), /only one of until or after/u);
});

test("refused payloads cannot enter relation evidence by observation or replay", () => {
  const web = createDrew();
  const input = { source: "refused", admission: { status: "refused" }, relations: [{ subject: "s", predicate: "p", object: "o" }] };
  assert.throws(() => web.observe(input), /refused observation batches cannot carry relations/);
  assert.equal(web.events().length, 0);
  assert.equal(web.query().length, 0);
  assert.throws(() => replayDrew([{ ...input, type: "drew.observation-batch", id: "refused", ordinal: 0 }]), /refused observation batches cannot carry relations/);
});
