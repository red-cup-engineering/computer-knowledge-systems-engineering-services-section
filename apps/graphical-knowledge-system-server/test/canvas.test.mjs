import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readCanvas, resolveCanvas, writeCanvas } from "../src/canvas.mjs";

const fixturePath = fileURLToPath(new URL("fixtures/canvas/example.canvas", import.meta.url));

const row = (e, a, v) => Object.freeze({ e, a, v, t: "w" });

// Same shape concept-diagram.test.mjs uses: order.md both specializes and contrasts
// partial-order with total-order (a held cell), lattice.md's depends-on is an ordinary edge on
// the same focus concept, and chain.md/well-order.md add two more ordinary incoming cells.


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

test("writeCanvas refuses a value that is not a GeodeCanvas", () => {
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
