import { basename } from "node:path";

/**
 * JSON Canvas (jsoncanvas.org, spec version 1.0) read and write, plus two projections that
 * connect a canvas to what this repository already knows.
 *
 * ## Meeting the spec
 *
 * `readCanvas` and `writeCanvas` admit and emit the format faithfully: all four node types
 * (`text`, `file`, `link`, `group`), every field the spec defines for each, both edge-colour
 * forms (`"#RRGGBB"` and the presets `"1"`.."6"`), and the four optional edge fields
 * (`fromSide`/`toSide`/`fromEnd`/`toEnd`). A `.canvas` file is untrusted input — read from disk,
 * possibly hand-edited — so `readCanvas` refuses malformed structure precisely (which field,
 * which node or edge, what was wrong) rather than trusting the shape, in the style of this app's
 * other admission checks (see `normalizeBrowsePrefix` in `workspace.mjs`).
 *
 * ## Beating it: two projections
 *
 * - `resolveCanvas` takes a canvas someone drew and resolves its nodes to real handles: a `file`
 *   node to an admitted document path, and — for any node whose text or filename names one — a
 *   concept the corpus knows (see `concept-index.mjs`). It never promotes a drawn edge into a
 *   corpus claim; see "Why a drawn edge is never a declared relation," below.
 * - `canvasFromConcept` and `canvasFromDocument` run the other way: from what
 *   `concept-index.mjs` already knows (an `GeodeConceptReading`, from `projectConcept`, or the
 *   raw index from `indexConcepts`) to a generated canvas laying out a neighbourhood. This is
 *   `concept-diagram.mjs`'s sibling and follows its choices where they transfer: the relation
 *   name is always the edge `label`, never folded away; a held cell (witnessed both positively
 *   and negatively — see `concept-index.mjs`) is marked distinctly rather than left for a reader
 *   to infer from a coincidence of endpoints; and the focus concept is visibly a different kind
 *   of node than its neighbours. What doesn't transfer is the mechanism: `concept-diagram.mjs`
 *   hands its objects/morphisms to the house diagram codec, which owns layout, colour, and text
 *   rendering. JSON Canvas *is* the layout — every node carries its own `x`/`y`/`width`/`height`
 *   — so this module lays nodes out itself, deterministically, rather than hand-rolling a second
 *   copy of that codec's job.
 *
 * ## Why a drawn edge is never a declared relation
 *
 * A JSON Canvas edge is a person moving boxes around and connecting two of them; a relation in
 * `declared-relations.mjs` is a claim a document's frontmatter makes, witnessed and provable. They
 * can agree, and often will — but agreement is not identity. A person can draw an edge labelled
 * "specialization" between two boxes that name concepts the corpus has never related to each
 * other, and the corpus can hold a cell between two concepts no canvas has ever drawn. Reading a
 * drawn edge's label as if it were evidence would put a claim in the corpus that no document
 * made; refusing to show what the corpus actually says just because nobody drew it would hide
 * evidence that exists. `resolveCanvas` does neither: a drawn edge is reported in `edges`,
 * unchanged, carrying only what was drawn (`kind: "drawn"`, its own label and colour if any); what
 * the corpus separately says about the same two resolved concepts — if anything — is reported in
 * `corpusRelations`, read straight from `concept-index.mjs`'s cells, never from the edge. The two
 * arrays never share a field: a `corpusRelations` entry carries `positive`/`negative`/`held`, an
 * `edges` entry never does, and neither is ever merged into the other.
 *
 * The inverse direction (`canvasFromConcept`, `canvasFromDocument`) marks its generated edges and
 * concept nodes with an `geode` property carrying exactly that provenance (relation, polarity,
 * witnessing documents). The JSON Canvas 1.0 spec defines a fixed set of fields per node/edge
 * type and says nothing about whether additional ones are permitted; reading that silence as
 * license (the common practice among the canvas-consuming tools that motivated the format —
 * unrecognised keys are data to preserve, not to reject) is how this module lets a reader of the
 * *file itself*, not just of this module's return values, tell a corpus-grounded edge from a
 * drawn one without guessing from label text.
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

// The same shape `declared-relations.mjs` requires of a concept name, mirrored here rather than
// imported: that module does not export its folding helper (`conceptOf`), and this territory may
// not add the export. Keeping the two in sync is a matter of watching that file, not of code
// sharing this module is free to add.
const CONCEPT_NAME = /^[a-z][a-z0-9_/-]{1,80}$/u;

function foldConceptCandidate(value) {
  if (typeof value !== "string" || value === "") return null;
  const folded = value.trim().replace(/^['"]|['"]$/gu, "").toLowerCase().replace(/\s+/gu, "-");
  return CONCEPT_NAME.test(folded) ? folded : null;
}

/**
 * What a node might be naming, before folding: a text node's own first line, a file node's
 * basename without extension, nothing for a link (a URL does not fold into a concept name) or a
 * group (a group is a container someone drew, not a claim about a single concept).
 */
function conceptCandidateOf(node) {
  if (node.type === "text") return node.text.split("\n", 1)[0] ?? "";
  if (node.type === "file") return basename(node.file).replace(/\.[^./]+$/u, "");
  return "";
}

async function resolveNode(node, { admit, concept }) {
  let document = null;
  if (node.type === "file") {
    const path = node.file.replace(/^\.\//u, "");
    if (typeof admit === "function") {
      try {
        admit(path);
        document = Object.freeze({ path, admitted: true });
      } catch {
        document = Object.freeze({ path: node.file, admitted: false });
      }
    } else {
      document = Object.freeze({ path, admitted: null });
    }
  }

  let resolvedConcept = null;
  if (typeof concept === "function") {
    const candidate = foldConceptCandidate(conceptCandidateOf(node));
    if (candidate) {
      const reading = await concept(candidate);
      if (reading?.known) resolvedConcept = Object.freeze({ name: candidate, definedBy: reading.definedBy });
    }
  }

  return Object.freeze({ document, concept: resolvedConcept });
}

/**
 * Resolve a canvas's nodes to real handles, and report — in a separate array, never merged —
 * what the corpus already says about any pair of resolved concepts a drawn edge happens to
 * connect. See the module header for why the two never merge.
 *
 * `admit` is a workspace's own admission check (`admit` on `createBareCedarFogWorkspace`'s
 * result): it must throw for a path this vault does not carry. `concept` is a lookup from a
 * concept name to its `GeodeConceptReading` (`workspace.concept`, or `(name) =>
 * projectConcept(index, name)` over a raw `GeodeConceptIndex`); it may be sync or async. Either or
 * both may be omitted — without `admit`, `file` nodes resolve to a normalised path with
 * `admitted: null` (unknown, not refused); without `concept`, no node resolves to a concept and
 * `corpusRelations` stays empty, because there is then nothing to consult.
 */
export async function resolveCanvas(canvas, { admit, concept } = {}) {
  if (!isCanvasLike(canvas)) throw new TypeError("canvas must be a GeodeCanvas with nodes and edges arrays");
  if (admit !== undefined && typeof admit !== "function") throw new TypeError("admit must be a function");
  if (concept !== undefined && typeof concept !== "function") throw new TypeError("concept must be a function");

  const conceptNameOfNode = new Map();
  const nodes = [];
  for (const node of canvas.nodes) {
    const resolution = await resolveNode(node, { admit, concept });
    if (resolution.concept) conceptNameOfNode.set(node.id, resolution.concept.name);
    nodes.push(Object.freeze({ id: node.id, type: node.type, resolution }));
  }

  // Drawn edges: exactly what the file said. Nothing the corpus knows is ever written onto one.
  const edges = canvas.edges.map((edge) => Object.freeze({
    id: edge.id,
    fromNode: edge.fromNode,
    toNode: edge.toNode,
    ...(edge.label === undefined ? {} : { label: edge.label }),
    ...(edge.color === undefined ? {} : { color: edge.color }),
    kind: "drawn",
  }));

  // What the corpus says about pairs a person happened to draw, read from `concept-index.mjs`'s
  // own cells — never from the drawn edge's label, which is not consulted here at all.
  const corpusRelations = [];
  if (typeof concept === "function") {
    const seen = new Set();
    for (const edge of canvas.edges) {
      const from = conceptNameOfNode.get(edge.fromNode);
      const to = conceptNameOfNode.get(edge.toNode);
      if (!from || !to || from === to || seen.has(`${from}\t${to}`)) continue;
      seen.add(`${from}\t${to}`);
      const reading = await concept(from);
      const cell = reading?.outgoing?.find((entry) => entry.to === to);
      if (cell) corpusRelations.push(Object.freeze({ from, to, positive: cell.positive, negative: cell.negative, held: cell.held }));
    }
  }

  return Object.freeze({
    type: "GeodeCanvasReading",
    schemaVersion: "geode-canvas-reading/v1",
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    corpusRelations: Object.freeze(corpusRelations),
  });
}

// ---------------------------------------------------------------------------------------------
// Generating: a canvas laying out a concept's or a document's corpus neighbourhood.
// ---------------------------------------------------------------------------------------------

const FOCUS_MARKER = "◆"; // the same glyph concept-diagram.mjs gives its focus node's label
const NODE_WIDTH = 280;
const NODE_HEIGHT = 90;
const ROW_GAP = 60;
const COLUMN_GAP = 60;

// Canvas presets ("1".."6"), not hex, so a viewer's own theme (Obsidian's canvas colour picker
// shows the six presets by name) is what a reader actually sees, rather than a fixed hex this
// module chose. Held gets its own colour rather than reusing asserts' or contrasts' — the same
// reasoning concept-diagram.mjs gives its `"held"` morphism kind: a held cell is not "somewhat
// positive," it is a different fact, and must not read as a weaker version of either polarity.
const CANVAS_COLOR_PRESET = Object.freeze({
  focus: "6", // purple
  asserts: "4", // green
  contrasts: "1", // red
  held: "5", // cyan — deliberately neither green nor red
});

function requireConceptReading(reading) {
  if (
    reading === null || typeof reading !== "object" ||
    typeof reading.name !== "string" || reading.name === "" ||
    !Array.isArray(reading.outgoing) || !Array.isArray(reading.incoming)
  ) {
    throw new TypeError("reading must be a GeodeConceptReading (see projectConcept in concept-index.mjs)");
  }
  return reading;
}

function requireCanvasLimit(options) {
  if (options.limit === undefined) return 50;
  const limit = options.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) {
    throw new TypeError("limit must be a positive integer");
  }
  return limit;
}

// Mirrors concept-diagram.mjs's private `focusDetail`, which is not exported and which this
// territory may not add an export to. Kept in sync by inspection, not by import.
function focusDetail(reading) {
  if (!reading.known) return "not known to the corpus: named or defined nowhere.";
  const definers = reading.definedBy.length;
  const parts = [`defined by ${definers} document${definers === 1 ? "" : "s"}`];
  if (reading.contested) parts.push("contested");
  if (reading.held.length > 0) parts.push(`${reading.held.length} held cell${reading.held.length === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function conceptNodeId(name) {
  return `concept:${name}`;
}

/** One text node for one concept, focus or neighbour, at a given column/row of the layout. */
function conceptNode({ name, column, row, isFocus, reading }) {
  return {
    id: conceptNodeId(name),
    type: "text",
    x: column * (NODE_WIDTH + COLUMN_GAP),
    y: row * (NODE_HEIGHT + ROW_GAP),
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    ...(isFocus ? { color: CANVAS_COLOR_PRESET.focus } : {}),
    text: isFocus ? `${FOCUS_MARKER} ${name}\n\n${focusDetail(reading)}` : name,
    // Not part of the JSON Canvas 1.0 spec (see the module header): marks this node as
    // corpus-grounded rather than drawn, and carries exactly the provenance a caller would
    // otherwise have to re-derive from `concept-index.mjs` itself.
    geode: isFocus
      ? Object.freeze({ kind: "concept", name, focus: true, known: reading.known, definedBy: reading.definedBy })
      : Object.freeze({ kind: "concept", name, focus: false }),
  };
}

function witnessEdges(cell, kindOf) {
  const edges = [];
  for (const witness of cell.positive) {
    edges.push({
      id: `${conceptNodeId(cell.from)}=>${conceptNodeId(cell.to)}#positive:${witness.relation}`,
      fromNode: conceptNodeId(cell.from),
      toNode: conceptNodeId(cell.to),
      label: witness.relation,
      color: CANVAS_COLOR_PRESET[kindOf("asserts")],
      geode: Object.freeze({ kind: kindOf("asserts"), relation: witness.relation, documents: witness.documents }),
    });
  }
  for (const witness of cell.negative) {
    edges.push({
      id: `${conceptNodeId(cell.from)}=>${conceptNodeId(cell.to)}#negative:${witness.relation}`,
      fromNode: conceptNodeId(cell.from),
      toNode: conceptNodeId(cell.to),
      label: witness.relation,
      color: CANVAS_COLOR_PRESET[kindOf("contrasts")],
      geode: Object.freeze({ kind: kindOf("contrasts"), relation: witness.relation, documents: witness.documents }),
    });
  }
  return edges;
}

/**
 * Cells in the same fixed order `concept-diagram.mjs` uses: outgoing before incoming, each
 * already sorted by `projectConcept` (by `to`, then by `from`). Truncation, and this generator's
 * layout, therefore always land the same way for the same reading.
 */
function orderedCells(reading) {
  return [
    ...reading.outgoing.map((cell) => ({ cell, neighbour: cell.to })),
    ...reading.incoming.map((cell) => ({ cell, neighbour: cell.from })),
  ];
}

/**
 * Project an `GeodeConceptReading` (`projectConcept`, in `concept-index.mjs`) to a canvas laying
 * out its neighbourhood: the focus concept as one node, every concept a cell connects it to as a
 * neighbour node one row below, and one edge per witness (so a held cell — witnessed both
 * positively and negatively — contributes two edges between the same pair, exactly as
 * `concept-diagram.mjs`'s morphisms do).
 *
 * Bounded by `options.limit` (default 50, counted in nodes including the focus), the same default
 * `concept-diagram.mjs` uses. Cells are admitted in `orderedCells` order until the next cell
 * would need a neighbour the canvas has no room left for; that cell and every later one are
 * dropped, and the returned canvas carries `truncated: true` rather than silently thinning the
 * layout.
 */
export function canvasFromConcept(reading, options = {}) {
  requireConceptReading(reading);
  const limit = requireCanvasLimit(options);

  const neighbours = [];
  const known = new Set([reading.name]);
  let truncated = false;
  const admittedCells = [];
  for (const { cell, neighbour } of orderedCells(reading)) {
    const isNew = !known.has(neighbour);
    if (isNew && known.size >= limit) {
      truncated = true;
      continue;
    }
    if (isNew) {
      known.add(neighbour);
      neighbours.push(neighbour);
    }
    admittedCells.push(cell);
  }

  const nodes = [conceptNode({ name: reading.name, column: 0, row: 0, isFocus: true, reading })];
  neighbours.forEach((neighbour, column) => {
    nodes.push(conceptNode({ name: neighbour, column, row: 1, isFocus: false }));
  });

  const edges = admittedCells.flatMap((cell) => witnessEdges(cell, (polarity) => (cell.held ? "held" : polarity)));

  return Object.freeze({
    type: "GeodeCanvas",
    schemaVersion: "geode-canvas/v1",
    nodes: Object.freeze(nodes.map((node) => Object.freeze(node))),
    edges: Object.freeze(edges.map((edge) => Object.freeze(edge))),
    truncated,
  });
}

function requireConceptIndex(index) {
  if (
    index === null || typeof index !== "object" ||
    !(index.conceptsOfDocument instanceof Map) || !(index.definedBy instanceof Map)
  ) {
    throw new TypeError("index must be a GeodeConceptIndex (see indexConcepts in concept-index.mjs)");
  }
  return index;
}

/**
 * Generate a canvas from one document's own neighbourhood, rather than one concept's: the
 * document as a `file` node, and every concept it `defines` (read from `index.conceptsOfDocument`
 * — the raw `GeodeConceptIndex` from `indexConcepts`, not a single reading, because no
 * `GeodeConceptReading` exposes the reverse document-to-concepts map this needs) as neighbour
 * nodes, connected by `defines` edges.
 *
 * Deliberately one hop, not a recursive union of each defined concept's own neighbourhood: doing
 * that honestly would mean merging several `canvasFromConcept` layouts without colliding their
 * node ids or coordinates, which is real additional work this cut does not take on.
 * `concept-diagram.mjs`, this module's sibling, does not project a document either — only a
 * concept — so staying one hop here keeps the two consistent rather than inventing a second
 * projection shape with no precedent in this app.
 */
export function canvasFromDocument(path, index, options = {}) {
  if (typeof path !== "string" || path === "") throw new TypeError("path is required");
  requireConceptIndex(index);
  const limit = requireCanvasLimit(options);

  const concepts = [...(index.conceptsOfDocument.get(path) ?? [])].sort();
  const fileId = `file:${path}`;
  const nodes = [{
    id: fileId,
    type: "file",
    x: 0,
    y: 0,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    file: path,
    geode: Object.freeze({ kind: "document", path, defines: Object.freeze([...concepts]) }),
  }];
  const edges = [];
  let truncated = false;
  concepts.forEach((concept, column) => {
    if (nodes.length >= limit) {
      truncated = true;
      return;
    }
    const id = conceptNodeId(concept);
    nodes.push({
      id,
      type: "text",
      x: column * (NODE_WIDTH + COLUMN_GAP),
      y: NODE_HEIGHT + ROW_GAP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      text: concept,
      geode: Object.freeze({ kind: "concept", name: concept, focus: false }),
    });
    edges.push({
      id: `${fileId}=>${id}#positive:defines`,
      fromNode: fileId,
      toNode: id,
      label: "defines",
      color: CANVAS_COLOR_PRESET.asserts,
      geode: Object.freeze({ kind: "asserts", relation: "defines", documents: Object.freeze([path]) }),
    });
  });

  return Object.freeze({
    type: "GeodeCanvas",
    schemaVersion: "geode-canvas/v1",
    nodes: Object.freeze(nodes.map((node) => Object.freeze(node))),
    edges: Object.freeze(edges.map((edge) => Object.freeze(edge))),
    truncated,
  });
}
