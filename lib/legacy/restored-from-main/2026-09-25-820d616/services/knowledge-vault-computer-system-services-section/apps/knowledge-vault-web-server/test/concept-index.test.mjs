import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createConceptIndex, indexConcepts, projectConcept } from "../src/concept-index.mjs";
import { readDeclaredRelationLedger } from "@red-cup-engineering/knowledge-vault-catalogue/declared-relations";

const root = fileURLToPath(new URL("../../knowledge-vault-catalogue/test/fixtures/relations-vault/", import.meta.url));
const row = (compound, keyword) => Object.freeze({
  e: compound,
  a: "declares-keyword",
  v: keyword,
  t: "w",
});
const compound = "section/content/text/glossary/terms/bilattice-articulation-model-belief-orienting-operation.md";
const ROWS = Object.freeze([
  row(compound, "bilattice"),
  row(compound, "articulation"),
  row(compound, "model"),
  row(compound, "belief"),
  row(compound, "orienting"),
  row(compound, "operation"),
]);

test("compound keyword rows name primitive concepts without defining them", () => {
  const index = indexConcepts(ROWS);
  const model = projectConcept(index, "model");
  assert.equal(model.known, true);
  assert.deepEqual(model.definedBy, []);
  assert.deepEqual(model.namedBy, [{ relation: "declares-keyword", documents: [compound] }]);
});

test("an admitted glossary term projects its identity as a definition", async () => {
  const path = "section/content/text/glossary/terms/model.md";
  const ledger = await readDeclaredRelationLedger({ root, paths: [path] });
  const model = projectConcept(indexConcepts(ledger.rows), "model");
  assert.equal(model.known, true);
  assert.deepEqual(model.definedBy, [path]);
  assert.deepEqual(model.namedBy, []);
});

test("reverse keyword backlinks are derived in memory", () => {
  const model = projectConcept(indexConcepts(ROWS), "model");
  assert.deepEqual(model.keywordBacklinks, [compound]);
  assert.equal(model.outgoing.length, 0);
  assert.equal(model.incoming.length, 0);
});

test("a primitive absent from every compound reads as unknown", () => {
  const reading = projectConcept(indexConcepts(ROWS), "unmentioned");
  assert.equal(reading.known, false);
  assert.deepEqual(reading.keywordBacklinks, []);
});

test("an index over the real fixture vault builds once and shares its TESS projection", async () => {
  const parent = "section/content/text/glossary/terms";
  const paths = [
    "bilattice", "articulation", "model", "belief", "orienting", "operation",
  ].map((stem) => `${parent}/${stem}.md`);
  paths.push(compound);
  let calls = 0;
  const index = createConceptIndex({ root, paths: () => { calls += 1; return paths; } });
  const [model, operation] = await Promise.all([index.concept("model"), index.concept("operation")]);
  assert.equal(calls, 1);
  assert.deepEqual(model.keywordBacklinks, [compound]);
  assert.deepEqual(operation.keywordBacklinks, [compound]);
  assert.equal(index.ready, true);
});

test("the summary reports the keyword web cost and survives serialization", async () => {
  const parent = "section/content/text/glossary/terms";
  const paths = [
    "bilattice", "articulation", "model", "belief", "orienting", "operation",
  ].map((stem) => `${parent}/${stem}.md`);
  paths.push(compound);
  const summary = await createConceptIndex({ root, paths: () => paths }).summary();
  assert.equal(summary.rows, 13);
  assert.equal(summary.documents, 7);
  assert.equal(summary.defects, 0);
  assert.ok(summary.concepts >= 6);
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), summary);
});

test("a vault containing refusals still builds a concept index whose graph carries no refused-family relation, while the ledger still returns the refusal rows", async () => {
  const parent = "section/content/text/glossary/terms";
  const constituentPaths = [
    "bilattice", "articulation", "model", "belief", "orienting", "operation",
  ].map((stem) => `${parent}/${stem}.md`);
  const unauthorized = "refusal-fixture/content/text/glossary/terms/unauthorized-key.md";
  const paths = [...constituentPaths, compound, unauthorized];

  const ledger = await readDeclaredRelationLedger({ root, paths });
  assert.ok(ledger.rows.some(({ a }) => a === "refused"), "the standalone ledger read still carries refusal rows");

  const index = createConceptIndex({ root, paths: () => paths });
  const built = await index.build();
  assert.ok(index.ledger.rows.some(({ a }) => a === "refused"), "the ledger held by the built index still carries refusals (v1 custody)");

  for (const cell of built.cells.values()) {
    assert.equal([...cell.positive.keys(), ...cell.negative.keys()].includes("refused"), false, "no cell witnesses a refused-family relation");
  }
  for (const witnesses of built.declaredBy.values()) {
    assert.equal([...witnesses.keys()].includes("refused"), false, "no concept is named by a refused-family relation");
  }
  const model = await index.concept("model");
  assert.equal(model.namedBy.every(({ relation }) => relation !== "refused"), true, "refused rows never enter the concept-assertion projection");
});

test("invalidating an index makes the next reader rebuild it", async () => {
  const parent = "section/content/text/glossary/terms";
  const paths = [`${parent}/model.md`];
  let calls = 0;
  const index = createConceptIndex({ root, paths: () => { calls += 1; return paths; } });
  await index.concept("model");
  index.invalidate();
  assert.equal(index.ready, false);
  await index.concept("model");
  assert.equal(calls, 2);
});
