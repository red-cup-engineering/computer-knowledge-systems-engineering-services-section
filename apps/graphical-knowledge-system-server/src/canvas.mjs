/**
 * JSON Canvas (jsoncanvas.org, spec version 1.0) read and write, plus two projections that
 * connect a canvas to what the archive's documents say.
 *
 * `readCanvas` and `writeCanvas` admit and emit the format faithfully: all four node types
 * (`text`, `file`, `link`, `group`), every field the spec defines for each, both edge-colour
 * forms, and the four optional edge fields. A `.canvas` file is untrusted input, so `readCanvas`
 * refuses malformed structure precisely.
 *
 * `resolveCanvas` resolves a drawn canvas's `file` nodes to admitted documents and reports, in a
 * separate array, what the archive's tellings say between documents a drawn edge connects. A
 * drawn edge is never read as a telling: a person connecting two boxes is not a document saying
 * something, so `edges` carries only what was drawn and `corpusRelations` only what was told.
 * `canvasFromCells` runs the other way: a generated canvas laying out one mark and the cells
 * around it, each generated edge carrying its telling in a `geode` property.
 */
const NODE_TYPES = new Set(["text", "file", "link", "group"]);
const SIDES = new Set(["top", "right", "bottom", "left"]);
const ENDS = new Set(["none", "arrow"]);
const BACKGROUND_STYLES = new Set(["cover", "ratio", "repeat"]);
const CANVAS_COLOR = /^#[0-9a-fA-F]{6}$|^[1-6]$/u;

// ---------------------------------------------------------------------------------------------
// Reading: parse untrusted JSON Canvas input into a validated, frozen `GeodeCanvas`.
// ---------------------------------------------------------------------------------------------

function requireRecord(value, context) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${context}: expected an object`);
  }
  return value;
}

function requireNonEmptyString(record, key, context) {
  const value = record[key];
  if (typeof value !== "string" || value === "") {
    throw new TypeError(`${context}: "${key}" is required and must be a non-empty string`);
  }
  return value;
}

function requireInteger(record, key, context) {
  const value = record[key];
  if (!Number.isInteger(value)) throw new TypeError(`${context}: "${key}" must be an integer`);
  return value;
}

function checkOptionalString(record, key, context) {
  if (!(key in record) || record[key] === undefined) return;
  if (typeof record[key] !== "string") throw new TypeError(`${context}: "${key}" must be a string if present`);
}

function checkOptionalEnum(record, key, allowed, context) {
  if (!(key in record) || record[key] === undefined) return;
  const value = record[key];
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new TypeError(`${context}: "${key}" must be one of ${[...allowed].join(", ")} (got ${JSON.stringify(value)})`);
  }
}

function checkOptionalColor(record, context) {
  if (!("color" in record) || record.color === undefined) return;
  if (typeof record.color !== "string" || !CANVAS_COLOR.test(record.color)) {
    throw new TypeError(`${context}: "color" must be a hex colour ("#rrggbb") or a preset "1".."6" (got ${JSON.stringify(record.color)})`);
  }
}

/** One node, admitted per its declared `type`. Unknown extra keys are preserved verbatim. */
function readNode(value, index) {
  const context = `node ${index}`;
  const record = requireRecord(value, context);
  const id = requireNonEmptyString(record, "id", context);
  const type = requireNonEmptyString(record, "type", context);
  if (!NODE_TYPES.has(type)) {
    throw new TypeError(`${context}: "type" must be one of ${[...NODE_TYPES].join(", ")} (got ${JSON.stringify(type)})`);
  }
  const x = requireInteger(record, "x", context);
  const y = requireInteger(record, "y", context);
  const width = requireInteger(record, "width", context);
  const height = requireInteger(record, "height", context);
  if (width < 0 || height < 0) throw new RangeError(`${context}: "width" and "height" must not be negative`);
  checkOptionalColor(record, context);

  if (type === "text") {
    requireNonEmptyString(record, "text", context);
  } else if (type === "file") {
    requireNonEmptyString(record, "file", context);
    checkOptionalString(record, "subpath", context);
  } else if (type === "link") {
    requireNonEmptyString(record, "url", context);
  } else if (type === "group") {
    checkOptionalString(record, "label", context);
    checkOptionalString(record, "background", context);
    checkOptionalEnum(record, "backgroundStyle", BACKGROUND_STYLES, context);
  }

  return Object.freeze({ ...record, id, type, x, y, width, height });
}

/** One edge, refused if it names an id this canvas has no node for. */
function readEdge(value, index, nodeIds) {
  const context = `edge ${index}`;
  const record = requireRecord(value, context);
  const id = requireNonEmptyString(record, "id", context);
  const fromNode = requireNonEmptyString(record, "fromNode", context);
  const toNode = requireNonEmptyString(record, "toNode", context);
  if (!nodeIds.has(fromNode)) throw new RangeError(`${context}: "fromNode" ${JSON.stringify(fromNode)} names no node in this canvas`);
  if (!nodeIds.has(toNode)) throw new RangeError(`${context}: "toNode" ${JSON.stringify(toNode)} names no node in this canvas`);
  checkOptionalEnum(record, "fromSide", SIDES, context);
  checkOptionalEnum(record, "toSide", SIDES, context);
  checkOptionalEnum(record, "fromEnd", ENDS, context);
  checkOptionalEnum(record, "toEnd", ENDS, context);
  checkOptionalColor(record, context);
  checkOptionalString(record, "label", context);
  return Object.freeze({ ...record, id, fromNode, toNode });
}

/**
 * Parse and admit one JSON Canvas document: a JSON string (as read from a `.canvas` file) or an
 * already-parsed value. Refuses, with a precise reason, anything that is not valid per the 1.0
 * spec: a non-object top level, `nodes`/`edges` that are not arrays, a node missing a
 * type-required field or carrying an invalid enum/colour/id, a duplicate node or edge id, or an
 * edge naming an endpoint that is not one of this canvas's own nodes.
 */
export function readCanvas(source) {
  let raw = source;
  if (typeof source === "string") {
    try {
      raw = JSON.parse(source);
    } catch (error) {
      throw new SyntaxError(`canvas: invalid JSON (${error.message})`);
    }
  }
  const record = requireRecord(raw, "canvas");
  const rawNodes = record.nodes ?? [];
  const rawEdges = record.edges ?? [];
  if (!Array.isArray(rawNodes)) throw new TypeError('canvas: "nodes" must be an array');
  if (!Array.isArray(rawEdges)) throw new TypeError('canvas: "edges" must be an array');

  const nodes = rawNodes.map(readNode);
  const nodeIds = new Set();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) throw new RangeError(`canvas: duplicate node id ${JSON.stringify(node.id)}`);
    nodeIds.add(node.id);
  }

  const edges = rawEdges.map((value, index) => readEdge(value, index, nodeIds));
  const edgeIds = new Set();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) throw new RangeError(`canvas: duplicate edge id ${JSON.stringify(edge.id)}`);
    edgeIds.add(edge.id);
  }

  return Object.freeze({
    type: "GeodeCanvas",
    schemaVersion: "geode-canvas/v1",
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
  });
}

function isCanvasLike(value) {
  return value !== null && typeof value === "object" && Array.isArray(value.nodes) && Array.isArray(value.edges);
}

/**
 * Serialise an `GeodeCanvas` (from `readCanvas` or `canvasFromConcept`/`canvasFromDocument`) back
 * to a JSON Canvas file's text: exactly `{ nodes, edges }`, none of this module's own wrapper
 * fields (`type`, `schemaVersion`). A canvas read and then written back round-trips without loss:
 * `readCanvas` keeps every field a node or edge carried, known or not, so nothing written here
 * was invented on the way in.
 */
export function writeCanvas(canvas) {
  if (!isCanvasLike(canvas)) throw new TypeError("canvas must be a GeodeCanvas with nodes and edges arrays");
  return JSON.stringify({ nodes: canvas.nodes, edges: canvas.edges }, null, 2);
}

// ---------------------------------------------------------------------------------------------
// Resolving: a drawn canvas's nodes, connected to real document/concept handles.
// ---------------------------------------------------------------------------------------------

/**
 * Resolve a canvas's `file` nodes to documents (`admit` throws for a path the archive does not
 * carry) and report what the archive's tellings say between documents a drawn edge connects
 * (`told(path)` gives the cells a document says, as SEN marks). Either may be omitted.
 */
export async function resolveCanvas(canvas, { admit, told } = {}) {
  if (!isCanvasLike(canvas)) throw new TypeError("canvas must be a GeodeCanvas with nodes and edges arrays");
  if (admit !== undefined && typeof admit !== "function") throw new TypeError("admit must be a function");
  if (told !== undefined && typeof told !== "function") throw new TypeError("told must be a function");
  const pathOfNode = new Map();
  const nodes = [];
  for (const node of canvas.nodes) {
    let document = null;
    if (node.type === "file") {
      const path = node.file.replace(/^\.\//u, "");
      let admitted = null;
      if (typeof admit === "function") { try { admit(path); admitted = true; pathOfNode.set(node.id, path); } catch { admitted = false; } }
      document = Object.freeze({ path, admitted });
    }
    nodes.push(Object.freeze({ id: node.id, type: node.type, resolution: Object.freeze({ document }) }));
  }
  const edges = canvas.edges.map((edge) => Object.freeze({
    id: edge.id, fromNode: edge.fromNode, toNode: edge.toNode,
    ...(edge.label === undefined ? {} : { label: edge.label }),
    ...(edge.color === undefined ? {} : { color: edge.color }),
    kind: "drawn",
  }));
  const corpusRelations = [];
  if (typeof told === "function") {
    const seen = new Set();
    for (const edge of canvas.edges) {
      const from = pathOfNode.get(edge.fromNode), to = pathOfNode.get(edge.toNode);
      if (!from || !to || from === to || seen.has(`${from}\t${to}`)) continue;
      seen.add(`${from}\t${to}`);
      for (const cell of await told(from)) if (cell.object[1] === to) corpusRelations.push(Object.freeze({ from, to, predicate: cell.predicate[1], for: cell.for, against: cell.against }));
    }
  }
  return Object.freeze({ type: "GeodeCanvasReading", schemaVersion: "geode-canvas-reading/v2", nodes: Object.freeze(nodes), edges: Object.freeze(edges), corpusRelations: Object.freeze(corpusRelations) });
}

const NODE_WIDTH = 280, NODE_HEIGHT = 90, ROW_GAP = 60, COLUMN_GAP = 60;
const FOCUS_COLOR = "6";

/**
 * A canvas laying out `focus` (a mark's surface) at the centre and each mark a cell joins it to
 * around it, at most `limit` edges; each edge is labelled by its predicate and carries its
 * telling (`geode`: predicate and witnesses). A mark that is an admitted document path
 * (`isDocument`) is a `file` node, any other a `text` node.
 */
export function canvasFromCells({ focus, cells, isDocument = () => false }, { limit = 50 } = {}) {
  if (typeof focus !== "string" || focus === "") throw new TypeError("focus must be a mark's surface");
  if (!Array.isArray(cells)) throw new TypeError("cells must be an array");
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("limit must be a positive integer");
  const shown = cells.slice(0, limit);
  const idOf = new Map();
  const nodes = [];
  const place = (surface, column, row, isFocus) => {
    if (idOf.has(surface)) return idOf.get(surface);
    const id = `n${idOf.size}`;
    idOf.set(surface, id);
    const geometry = { x: column * (NODE_WIDTH + COLUMN_GAP), y: row * (NODE_HEIGHT + ROW_GAP), width: NODE_WIDTH, height: NODE_HEIGHT };
    nodes.push(Object.freeze(isDocument(surface) ? { id, type: "file", file: surface, ...geometry, ...(isFocus ? { color: FOCUS_COLOR } : {}) }
      : { id, type: "text", text: surface, ...geometry, ...(isFocus ? { color: FOCUS_COLOR } : {}) }));
    return id;
  };
  place(focus, 1, 0, true);
  const edges = [];
  shown.forEach((cell, index) => {
    const from = cell.subject[1], to = cell.object[1];
    const other = from === focus ? to : from;
    place(other, from === focus ? 2 : 0, index, false);
    edges.push(Object.freeze({ id: `e${index}`, fromNode: idOf.get(from), toNode: idOf.get(to), label: cell.predicate[1],
      geode: Object.freeze({ predicate: cell.predicate[1], for: cell.for, against: cell.against }) }));
  });
  return Object.freeze({ nodes: Object.freeze(nodes), edges: Object.freeze(edges), truncated: cells.length > shown.length });
}
