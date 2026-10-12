import assert from "node:assert/strict";
import test from "node:test";
import { indexConcepts, projectConcept } from "../src/concept-index.mjs";
import { conceptDiagram, conceptDiagramMermaid, writeMermaid } from "../src/concept-diagram.mjs";

const row = (e, a, v) => Object.freeze({ e, a, v, t: "w" });

// order.md both specializes and contrasts partial-order with total-order: a held cell, witnessed
// both ways. lattice.md's depends-on is an ordinary, unheld cell on the same focus concept.
// chain.md and well-order.md add two more ordinary incoming cells, so a diagram of total-order
// has one held neighbour (partial-order) and three ordinary neighbours (partial-order again via
// depends-on, chain, well-order) to exercise truncation against.
const ROWS = Object.freeze([
  row("order.md", "defines", "total-order"),
  row("order.md", "specialization", "partial-order"),
  row("order.md", "contrasts-with", "partial-order"),
  row("lattice.md", "defines", "partial-order"),
  row("lattice.md", "depends-on", "total-order"),
  row("chain.md", "defines", "chain"),
  row("chain.md", "specialization", "total-order"),
  row("well-order.md", "defines", "well-order"),
  row("well-order.md", "specialization", "total-order"),
]);

const index = indexConcepts(ROWS);
const totalOrder = () => projectConcept(index, "total-order");

test("relation names appear as edge labels, not just as a generic link", () => {
  const diagram = conceptDiagram(totalOrder());
  const labels = diagram.morphisms.map((morphism) => morphism.label).sort();
  assert.deepEqual(labels, ["contrasts-with", "depends-on", "specialization", "specialization", "specialization"]);
  // And the labels survive into the rendered text, which is the point of labelling them at all.
  const mermaid = writeMermaid(diagram);
  assert.match(mermaid, /depends-on/u);
  assert.match(mermaid, /specialization/u);
  assert.match(mermaid, /contrasts-with/u);
});

test("a held cell's edges are kinded distinctly from an ordinary cell's", () => {
  const diagram = conceptDiagram(totalOrder());
  const held = diagram.morphisms.filter((morphism) => morphism.from === "total-order" && morphism.to === "partial-order");
  assert.equal(held.length, 2, "both the positive and negative witness of the held pair become edges");
  for (const morphism of held) assert.equal(morphism.kind, "held");

  const ordinary = diagram.morphisms.find((morphism) => morphism.from === "partial-order" && morphism.to === "total-order");
  assert.equal(ordinary.label, "depends-on");
  assert.notEqual(ordinary.kind, "held", "an unheld cell's edge must not be marked held");
  assert.equal(ordinary.kind, "asserts");

  // The distinction is not just internal bookkeeping: it survives into the rendered text, since
  // writeMermaid prints `kind: label` onto every edge. `chain` and `well-order` also specialize
  // total-order (ordinarily, unheld, on different pairs), so "asserts: specialization" legitimately
  // appears too — what must never appear is that same wording on the total-order/partial-order
  // pair specifically, since that pair's specialization is held.
  const mermaid = writeMermaid(diagram);
  assert.match(mermaid, /held: specialization/u);
  assert.match(mermaid, /held: contrasts-with/u);
  assert.match(mermaid, /asserts: depends-on/u);
  assert.doesNotMatch(mermaid, /total_order -->\|asserts: specialization\| partial_order/u);
});

test("the focus concept is a visibly different kind of node than its neighbours", () => {
  const diagram = conceptDiagram(totalOrder());
  const focus = diagram.objects.find((object) => object.id === "total-order");
  const neighbour = diagram.objects.find((object) => object.id === "partial-order");
  assert.ok(focus);
  assert.ok(neighbour);
  assert.notEqual(focus.kind, neighbour.kind);
  // The kind difference feeds the house codec's colour-by-kind palette for other renderings, but
  // Mermaid's plain `[label]` boxes do not vary by kind, so the focus label itself carries a
  // marker too — otherwise the rendered Mermaid text would show two identical-looking boxes.
  assert.notEqual(focus.label, focus.id);
  assert.equal(neighbour.label, neighbour.id);
});

test("truncation is reported, not silently applied", () => {
  const untruncated = conceptDiagram(totalOrder(), { limit: 50 });
  assert.equal(untruncated.truncated, false);
  assert.equal(untruncated.objects.length, 4, "total-order, partial-order, chain, well-order");

  const truncated = conceptDiagram(totalOrder(), { limit: 2 });
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.objects.length, 2, "the limit is honoured, not just noted");
  assert.ok(truncated.objects.some((object) => object.id === "total-order"), "the focus concept is never dropped");
  // Nothing here claims the limit was met without saying so.
  assert.notEqual(untruncated.objects.length, truncated.objects.length);
});

test("a concept with no cells produces a valid, non-throwing empty diagram", () => {
  const reading = projectConcept(index, "nothing-says-this");
  assert.equal(reading.known, false);
  const diagram = conceptDiagram(reading);
  assert.equal(diagram.objects.length, 1, "only the focus concept, unknown or not");
  assert.deepEqual(diagram.morphisms, []);
  assert.equal(diagram.truncated, false);
  // The empty diagram must still be real Mermaid, not an exception in disguise.
  const mermaid = writeMermaid(diagram);
  assert.match(mermaid, /graph TD/u);
  assert.match(mermaid, /nothing-says-this/u);
});

test("conceptDiagramMermaid composes the projection and the house codec's rendering", () => {
  const reading = totalOrder();
  assert.equal(conceptDiagramMermaid(reading), writeMermaid(conceptDiagram(reading)));
});

test("a reading that is not a GeodeConceptReading is refused, not guessed at", () => {
  assert.throws(() => conceptDiagram(null), TypeError);
  assert.throws(() => conceptDiagram({}), TypeError);
  assert.throws(() => conceptDiagram({ name: "x" }), TypeError);
  assert.throws(() => conceptDiagram({ name: "", outgoing: [], incoming: [] }), TypeError);
});

test("an invalid limit is refused rather than silently clamped or ignored", () => {
  const reading = totalOrder();
  assert.throws(() => conceptDiagram(reading, { limit: 0 }), TypeError);
  assert.throws(() => conceptDiagram(reading, { limit: -1 }), TypeError);
  assert.throws(() => conceptDiagram(reading, { limit: 1.5 }), TypeError);
  assert.throws(() => conceptDiagram(reading, { limit: "10" }), TypeError);
});
