import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { indexConcepts, projectConcept } from "../src/concept-index.mjs";
import { canvasFromConcept, canvasFromDocument, readCanvas, resolveCanvas, writeCanvas } from "../src/canvas.mjs";

const fixturePath = fileURLToPath(new URL("fixtures/canvas/example.canvas", import.meta.url));

const row = (e, a, v) => Object.freeze({ e, a, v, t: "w" });

// Same shape concept-diagram.test.mjs uses: order.md both specializes and contrasts
// partial-order with total-order (a held cell), lattice.md's depends-on is an ordinary edge on
// the same focus concept, and chain.md/well-order.md add two more ordinary incoming cells.
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
const conceptLookup = (name) => projectConcept(index, name);

test("a valid canvas round-trips through readCanvas/writeCanvas without loss", async () => {
  const original = await readFile(fixturePath, "utf8");
  const canvas = readCanvas(original);
  const rewritten = writeCanvas(canvas);
  assert.deepEqual(JSON.parse(rewritten), JSON.parse(original));
  // The wrapper this module adds is not part of the file format and must not leak into it.
  const plain = JSON.parse(rewritten);
  assert.equal("type" in plain, false);
  assert.equal("schemaVersion" in plain, false);
});

test("readCanvas accepts an already-parsed object as well as JSON text", async () => {
  const text = await readFile(fixturePath, "utf8");
  const fromText = readCanvas(text);
  const fromObject = readCanvas(JSON.parse(text));
  assert.deepEqual(fromText.nodes, fromObject.nodes);
  assert.deepEqual(fromText.edges, fromObject.edges);
});

test("every JSON Canvas node type is admitted, keeping its type-specific field", () => {
  const canvas = readCanvas(JSON.stringify({
    nodes: [
      { id: "t", type: "text", x: 0, y: 0, width: 10, height: 10, text: "hello" },
      { id: "f", type: "file", x: 0, y: 0, width: 10, height: 10, file: "a.md" },
      { id: "l", type: "link", x: 0, y: 0, width: 10, height: 10, url: "https://example.invalid" },
      { id: "g", type: "group", x: 0, y: 0, width: 10, height: 10, label: "a group" },
    ],
    edges: [],
  }));
  const byId = Object.fromEntries(canvas.nodes.map((node) => [node.id, node]));
  assert.equal(byId.t.text, "hello");
  assert.equal(byId.f.file, "a.md");
  assert.equal(byId.l.url, "https://example.invalid");
  assert.equal(byId.g.label, "a group");
  assert.deepEqual(canvas.nodes.map((node) => node.type), ["text", "file", "link", "group"]);
});

test("both canvas colour forms are accepted: hex and the six presets", () => {
  for (const color of ["#a1b2c3", "1", "6"]) {
    assert.doesNotThrow(() => readCanvas(JSON.stringify({
      nodes: [{ id: "t", type: "text", x: 0, y: 0, width: 10, height: 10, text: "x", color }],
      edges: [],
    })));
  }
  assert.throws(() => readCanvas(JSON.stringify({
    nodes: [{ id: "t", type: "text", x: 0, y: 0, width: 10, height: 10, text: "x", color: "7" }],
    edges: [],
  })), /color/u);
});

test("malformed input is refused precisely, not just rejected", () => {
  assert.throws(() => readCanvas("not json"), SyntaxError);
  assert.throws(() => readCanvas("[]"), { name: "TypeError", message: /expected an object/u });
  assert.throws(() => readCanvas(JSON.stringify({ nodes: "nope", edges: [] })), /"nodes" must be an array/u);
  assert.throws(() => readCanvas(JSON.stringify({ nodes: [{ type: "text", x: 0, y: 0, width: 1, height: 1, text: "x" }], edges: [] })), /"id" is required/u);
  assert.throws(() => readCanvas(JSON.stringify({
    nodes: [{ id: "a", type: "shape", x: 0, y: 0, width: 1, height: 1 }], edges: [],
  })), /"type" must be one of/u);
  assert.throws(() => readCanvas(JSON.stringify({
    nodes: [{ id: "a", type: "text", x: 0.5, y: 0, width: 1, height: 1, text: "x" }], edges: [],
  })), /"x" must be an integer/u);
  assert.throws(() => readCanvas(JSON.stringify({
    nodes: [{ id: "a", type: "text", x: 0, y: 0, width: -1, height: 1, text: "x" }], edges: [],
  })), { name: "RangeError", message: /must not be negative/u });
  assert.throws(() => readCanvas(JSON.stringify({
    nodes: [
      { id: "a", type: "text", x: 0, y: 0, width: 1, height: 1, text: "x" },
      { id: "a", type: "text", x: 0, y: 0, width: 1, height: 1, text: "y" },
    ], edges: [],
  })), /duplicate node id/u);
  assert.throws(() => readCanvas(JSON.stringify({
    nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 1, height: 1, text: "x" }],
    edges: [{ id: "e", fromNode: "a", toNode: "missing" }],
  })), { name: "RangeError", message: /names no node in this canvas/u });
  assert.throws(() => readCanvas(JSON.stringify({
    nodes: [{ id: "a", type: "text", x: 0, y: 0, width: 1, height: 1, text: "x" }],
    edges: [{ id: "e", fromNode: "a", toNode: "a", fromSide: "diagonal" }],
  })), /"fromSide" must be one of/u);
  assert.throws(() => readCanvas(JSON.stringify({
    nodes: [{ id: "a", type: "file", x: 0, y: 0, width: 1, height: 1 }], edges: [],
  })), /"file" is required/u);
});

test("writeCanvas refuses a value that is not an OpalCanvas", () => {
  assert.throws(() => writeCanvas(null), TypeError);
  assert.throws(() => writeCanvas({}), TypeError);
  assert.throws(() => writeCanvas({ nodes: [] }), TypeError);
});

test("a file node resolves to a real admitted document path", async () => {
  const canvas = readCanvas(await readFile(fixturePath, "utf8"));
  const admit = (path) => {
    if (path !== "order.md") throw new RangeError(`unknown Bare Cedar Fog document: ${path}`);
    return Object.freeze({ path, vaultId: "notes" });
  };
  const reading = await resolveCanvas(canvas, { admit });
  const fileNode = reading.nodes.find((node) => node.id === "file-1");
  assert.deepEqual(fileNode.resolution.document, { path: "order.md", admitted: true });

  // A file node naming a path the workspace does not carry resolves honestly, not silently.
  const canvasWithBadPath = readCanvas(JSON.stringify({
    nodes: [{ id: "f", type: "file", x: 0, y: 0, width: 1, height: 1, file: "nowhere.md" }],
    edges: [],
  }));
  const badReading = await resolveCanvas(canvasWithBadPath, { admit });
  assert.deepEqual(badReading.nodes[0].resolution.document, { path: "nowhere.md", admitted: false });
});

test("without an admit function, a file node's path is reported but not claimed as admitted", async () => {
  const canvas = readCanvas(JSON.stringify({
    nodes: [{ id: "f", type: "file", x: 0, y: 0, width: 1, height: 1, file: "./order.md" }],
    edges: [],
  }));
  const reading = await resolveCanvas(canvas);
  assert.deepEqual(reading.nodes[0].resolution.document, { path: "order.md", admitted: null });
});

test("a node names a concept the corpus knows where one is findable", async () => {
  const canvas = readCanvas(JSON.stringify({
    nodes: [
      { id: "t", type: "text", x: 0, y: 0, width: 1, height: 1, text: "Total Order" },
      { id: "u", type: "text", x: 0, y: 0, width: 1, height: 1, text: "nothing-like-this-exists" },
    ],
    edges: [],
  }));
  const reading = await resolveCanvas(canvas, { concept: conceptLookup });
  const known = reading.nodes.find((node) => node.id === "t");
  const unknown = reading.nodes.find((node) => node.id === "u");
  assert.equal(known.resolution.concept.name, "total-order");
  assert.equal(unknown.resolution.concept, null);
});

test("a drawn edge is never confused with a declared relation, even when they agree", async () => {
  // partial-order --specialization--> total-order is not itself a real cell (the real, held
  // cell runs the other way, total-order -> partial-order): drawing it and labelling it
  // "specialization" must not manufacture a corpus relation that does not exist.
  const noAgreement = readCanvas(JSON.stringify({
    nodes: [
      { id: "a", type: "text", x: 0, y: 0, width: 1, height: 1, text: "chain" },
      { id: "b", type: "text", x: 0, y: 0, width: 1, height: 1, text: "well-order" },
    ],
    edges: [{ id: "e", fromNode: "a", toNode: "b", label: "specialization" }],
  }));
  const noAgreementReading = await resolveCanvas(noAgreement, { concept: conceptLookup });
  assert.equal(noAgreementReading.corpusRelations.length, 0);
  assert.deepEqual(noAgreementReading.edges[0], { id: "e", fromNode: "a", toNode: "b", label: "specialization", kind: "drawn" });

  // total-order -> partial-order genuinely is a held cell. Draw it, label it arbitrarily.
  const agreement = readCanvas(JSON.stringify({
    nodes: [
      { id: "a", type: "text", x: 0, y: 0, width: 1, height: 1, text: "total-order" },
      { id: "b", type: "text", x: 0, y: 0, width: 1, height: 1, text: "partial-order" },
    ],
    edges: [{ id: "e", fromNode: "a", toNode: "b", label: "a person's own words, not a relation name" }],
  }));
  const agreementReading = await resolveCanvas(agreement, { concept: conceptLookup });
  // The drawn edge is untouched by what the corpus knows...
  assert.deepEqual(agreementReading.edges[0], {
    id: "e", fromNode: "a", toNode: "b", label: "a person's own words, not a relation name", kind: "drawn",
  });
  assert.equal("positive" in agreementReading.edges[0], false);
  assert.equal("held" in agreementReading.edges[0], false);
  // ...and the corpus relation, reported separately, is untouched by what was drawn: it carries
  // the real witnesses and is held, regardless of the drawn edge's own label or even its
  // presence.
  assert.equal(agreementReading.corpusRelations.length, 1);
  const [relation] = agreementReading.corpusRelations;
  assert.equal(relation.from, "total-order");
  assert.equal(relation.to, "partial-order");
  assert.equal(relation.held, true);
  assert.deepEqual(relation.positive.map((w) => w.relation), ["specialization"]);
  assert.deepEqual(relation.negative.map((w) => w.relation), ["contrasts-with"]);
  assert.equal("id" in relation, false, "a corpus relation carries no canvas identity of its own");
  assert.equal("fromNode" in relation, false);
});

test("a canvas generated from a concept carries relation names on its edges", () => {
  const canvas = canvasFromConcept(totalOrder());
  const labels = canvas.edges.map((edge) => edge.label).sort();
  assert.deepEqual(labels, ["contrasts-with", "depends-on", "specialization", "specialization", "specialization"]);
  // Every edge is a valid JSON Canvas edge in its own right.
  const revalidated = readCanvas(writeCanvas(canvas));
  assert.equal(revalidated.edges.length, canvas.edges.length);
});

test("a held cell survives into the generated canvas distinguishably", () => {
  const canvas = canvasFromConcept(totalOrder());
  const heldEdges = canvas.edges.filter((edge) => edge.fromNode === "concept:total-order" && edge.toNode === "concept:partial-order");
  assert.equal(heldEdges.length, 2, "both the positive and negative witness become edges");
  for (const edge of heldEdges) {
    assert.equal(edge.opal.kind, "held");
    assert.equal(edge.color, "5");
  }
  const ordinary = canvas.edges.find((edge) => edge.fromNode === "concept:partial-order" && edge.toNode === "concept:total-order");
  assert.equal(ordinary.opal.kind, "asserts");
  assert.notEqual(ordinary.color, heldEdges[0].color, "held is a different colour than an ordinary positive witness");
});

test("the focus node is coloured and marked distinctly from its neighbours", () => {
  const canvas = canvasFromConcept(totalOrder());
  const focus = canvas.nodes.find((node) => node.id === "concept:total-order");
  const neighbour = canvas.nodes.find((node) => node.id === "concept:partial-order");
  assert.ok(focus.color);
  assert.equal(neighbour.color, undefined);
  assert.ok(focus.opal.focus);
  assert.equal(neighbour.opal.focus, false);
  assert.notEqual(focus.text, focus.opal.name, "the focus text carries the marker and detail, not just the bare name");
  assert.equal(neighbour.text, neighbour.opal.name);
});

test("truncation is reported, not silently applied", () => {
  const untruncated = canvasFromConcept(totalOrder(), { limit: 50 });
  assert.equal(untruncated.truncated, false);
  assert.equal(untruncated.nodes.length, 4, "total-order, partial-order, chain, well-order");

  const truncated = canvasFromConcept(totalOrder(), { limit: 2 });
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.nodes.length, 2);
  assert.ok(truncated.nodes.some((node) => node.id === "concept:total-order"), "the focus concept is never dropped");
});

test("a concept with no cells produces a valid, non-throwing canvas of one node", () => {
  const reading = projectConcept(index, "nothing-says-this");
  const canvas = canvasFromConcept(reading);
  assert.equal(canvas.nodes.length, 1);
  assert.deepEqual(canvas.edges, []);
  assert.equal(canvas.truncated, false);
  // Still real, admittable JSON Canvas.
  assert.doesNotThrow(() => readCanvas(writeCanvas(canvas)));
});

test("canvasFromConcept refuses a value that is not an OpalConceptReading", () => {
  assert.throws(() => canvasFromConcept(null), TypeError);
  assert.throws(() => canvasFromConcept({}), TypeError);
  assert.throws(() => canvasFromConcept({ name: "", outgoing: [], incoming: [] }), TypeError);
});

test("canvasFromConcept refuses an invalid limit rather than clamping or ignoring it", () => {
  const reading = totalOrder();
  assert.throws(() => canvasFromConcept(reading, { limit: 0 }), TypeError);
  assert.throws(() => canvasFromConcept(reading, { limit: -1 }), TypeError);
  assert.throws(() => canvasFromConcept(reading, { limit: 1.5 }), TypeError);
});

test("canvasFromDocument lays out a document as a file node connected to the concepts it defines", () => {
  const canvas = canvasFromDocument("chain.md", index);
  const fileNode = canvas.nodes.find((node) => node.id === "file:chain.md");
  assert.equal(fileNode.type, "file");
  assert.equal(fileNode.file, "chain.md");
  const conceptNode = canvas.nodes.find((node) => node.id === "concept:chain");
  assert.ok(conceptNode);
  const edge = canvas.edges.find((e) => e.fromNode === "file:chain.md" && e.toNode === "concept:chain");
  assert.equal(edge.label, "defines");
  assert.equal(edge.opal.relation, "defines");
  assert.deepEqual(edge.opal.documents, ["chain.md"]);
  assert.doesNotThrow(() => readCanvas(writeCanvas(canvas)));
});

test("canvasFromDocument refuses a value that is not an OpalConceptIndex", () => {
  assert.throws(() => canvasFromDocument("chain.md", null), TypeError);
  assert.throws(() => canvasFromDocument("chain.md", {}), TypeError);
  assert.throws(() => canvasFromDocument("", index), TypeError);
});
