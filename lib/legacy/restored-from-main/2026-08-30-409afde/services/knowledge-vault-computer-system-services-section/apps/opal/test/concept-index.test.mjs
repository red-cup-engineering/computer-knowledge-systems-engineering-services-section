import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createConceptIndex, indexConcepts, projectConcept } from "../src/concept-index.mjs";
import * as opal from "../src/index.mjs";

const root = fileURLToPath(new URL("fixtures/relations-vault/", import.meta.url));
const row = (e, a, v) => Object.freeze({ e, a, v, t: "w" });

test("the package entry exports the concept APIs", () => {
  assert.equal(opal.indexConcepts, indexConcepts);
  assert.equal(opal.projectConcept, projectConcept);
  assert.equal(opal.createConceptIndex, createConceptIndex);
});

// Two documents, both defining, one of which holds a pair both ways.
const ROWS = Object.freeze([
  row("order.md", "defines", "total-order"),
  row("order.md", "specialization", "partial-order"),
  row("order.md", "contrasts-with", "partial-order"),
  row("lattice.md", "defines", "partial-order"),
  row("lattice.md", "depends-on", "total-order"),
  row("other.md", "defines", "partial-order"),
  row("loose.md", "requires", "total-order"),
]);

test("concepts are named by documents and need no file of their own", () => {
  const index = indexConcepts(ROWS);
  // `loose.md` names total-order without defining anything; the concept still exists.
  assert.ok(index.concepts >= 2);
  assert.deepEqual([...index.definedBy.get("total-order")], ["order.md"]);
});

test("a concept several documents define is contested, which is not a contradiction", () => {
  const reading = projectConcept(indexConcepts(ROWS), "partial-order");
  assert.deepEqual([...reading.definedBy].sort(), ["lattice.md", "other.md"]);
  assert.equal(reading.contested, true);
  // Two definers are two positive witnesses about authorship, not evidence against anything.
  // Being contested is independent of any cell being held: the one held cell this concept takes
  // part in is held because of `contrasts-with`, and would be held with a single definer too.
  for (const cell of reading.held) {
    assert.ok(cell.negative.some((witness) => witness.relation === "contrasts-with"));
  }
  const uncontested = projectConcept(indexConcepts(ROWS.filter((r) => r.e !== "other.md")), "partial-order");
  assert.equal(uncontested.contested, false);
  assert.equal(uncontested.held.length, reading.held.length);
});

test("a pair witnessed positively and negatively is held, not resolved", () => {
  const reading = projectConcept(indexConcepts(ROWS), "total-order");
  const cell = reading.outgoing.find((entry) => entry.to === "partial-order");
  assert.equal(cell.held, true);
  assert.deepEqual(cell.positive.map((w) => w.relation), ["specialization"]);
  assert.deepEqual(cell.negative.map((w) => w.relation), ["contrasts-with"]);
  // Both witnesses keep the document that supplied them.
  assert.deepEqual(cell.negative[0].documents, ["order.md"]);
});

test("witnesses are kept apart by polarity rather than reduced to a verdict", () => {
  const index = indexConcepts(ROWS);
  assert.equal(index.held, 1);
  // The count and the cells themselves are separate members; a Map serialises to {} and would
  // silently report no cells at all if it stood where the count belongs.
  assert.equal(index.cellCount, index.cells.size);
  const cell = index.cells.get("total-order\tpartial-order");
  assert.ok(cell.positive.size > 0 && cell.negative.size > 0);
});

test("a concept reads its incoming cells as well as its outgoing ones", () => {
  const reading = projectConcept(indexConcepts(ROWS), "total-order");
  const incoming = reading.incoming.find((entry) => entry.from === "partial-order");
  assert.deepEqual(incoming.positive.map((w) => w.relation), ["depends-on"]);
});

test("a document that defines nothing still contributes the concepts it names", () => {
  const reading = projectConcept(indexConcepts(ROWS), "total-order");
  const requires = reading.namedBy.find((entry) => entry.relation === "requires");
  assert.deepEqual(requires.documents, ["loose.md"]);
  // But it composes no concept-to-concept cell, having no concept of its own to compose from.
  assert.equal(reading.incoming.some((entry) => entry.from === "loose.md"), false);
});

test("a concept nothing mentions reads as unknown rather than failing", () => {
  const reading = projectConcept(indexConcepts(ROWS), "nothing-says-this");
  assert.equal(reading.known, false);
  assert.deepEqual(reading.definedBy, []);
  assert.deepEqual(reading.outgoing, []);
});

test("an index over the real fixture vault builds once and is shared", async () => {
  let calls = 0;
  const paths = () => { calls += 1; return ["order.md", "bare.md", "vague.md"]; };
  const index = createConceptIndex({ root, paths });
  assert.equal(index.ready, false);
  const [first, second] = await Promise.all([index.concept("total-order"), index.concept("partial-order")]);
  assert.equal(calls, 1, "concurrent callers join one build rather than starting another");
  assert.equal(index.ready, true);
  assert.deepEqual(first.definedBy, ["order.md"]);
  assert.equal(second.known, true);
});

test("the summary reports what the ledger cost as well as what it found", async () => {
  const index = createConceptIndex({ root, paths: () => ["order.md", "broken.md", "vague.md"] });
  const summary = await index.summary();
  assert.equal(summary.defects, 1, "broken.md's frontmatter is counted, not hidden");
  assert.equal(typeof summary.cells, "number");
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), summary, "the summary must survive serialisation");
  assert.ok(summary.rows > 0);
  assert.ok(summary.concepts > 0);
});

test("invalidating an index makes the next reader rebuild it", async () => {
  let calls = 0;
  const paths = () => { calls += 1; return ["order.md"]; };
  const index = createConceptIndex({ root, paths });
  await index.concept("total-order");
  index.invalidate();
  assert.equal(index.ready, false);
  await index.concept("total-order");
  assert.equal(calls, 2);
});
