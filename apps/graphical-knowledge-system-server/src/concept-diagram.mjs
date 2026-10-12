/**
 * Draw one mark and the cells around it as a presented-category diagram, rendered as Mermaid
 * by SignGraph: the focus, each mark a cell joins it to, and one arrow per cell labelled by its
 * predicate, subject to object.
 */
import { writeMermaid } from "@red-cup-engineering/signgraph/diagram";

function requireRecord(value, context) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${context}: expected object`);
  return value;
}

function stringField(record, key, fallback = "") {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function optionalStringField(record, key) {
  const value = record[key];
  return typeof value === "string" && value !== "" ? { [key]: value } : {};
}

function diagramObjectFrom(value, index) {
  const record = requireRecord(value, `diagram object ${index}`);
  const id = stringField(record, "id");
  const kind = stringField(record, "kind", "object");
  const label = stringField(record, "label", id);
  if (id === "") throw new TypeError(`diagram object ${index}: id is required`);
  return Object.freeze({ ...record, id, kind, label, ...optionalStringField(record, "detail"), ...optionalStringField(record, "href") });
}

function diagramMorphismFrom(value, index) {
  const record = requireRecord(value, `diagram morphism ${index}`);
  const from = stringField(record, "from");
  const to = stringField(record, "to");
  const kind = stringField(record, "kind", "edge");
  const label = stringField(record, "label", kind);
  if (from === "" || to === "") throw new TypeError(`diagram morphism ${index}: from and to are required`);
  return Object.freeze({ ...record, ...optionalStringField(record, "id"), from, to, kind, label });
}

/** Build one `PresentedCategoryDiagram`: a title/description, and normalized objects/morphisms. */
function presentedCategoryDiagram(input) {
  return Object.freeze({
    kind: "relating.diagram.presented-category",
    ...(input.diagramKind === undefined ? {} : { diagramKind: input.diagramKind }),
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.description === undefined ? {} : { description: input.description }),
    objects: Object.freeze(input.objects.map(diagramObjectFrom)),
    morphisms: Object.freeze(input.morphisms.map(diagramMorphismFrom)),
  });
}

// writeMermaid, and the canonical/cleanId/mermaidQuote helpers it alone used, now live at
// @red-cup-engineering/relating/writing (src/writing/diagram.mjs), imported above -- this
// module's own port of it (see the file banner) is retired in favour of the source it named.
export { writeMermaid };

const FOCUS_MARKER = "◆";

/**
 * The diagram of `focus` (a mark's surface) and `cells` (cells whose subject or object is it,
 * SEN marks in each position), at most `limit` arrows.
 */
export function cellsDiagram({ focus, cells }, { limit = 50 } = {}) {
  if (typeof focus !== "string" || focus === "") throw new TypeError("focus must be a mark's surface");
  if (!Array.isArray(cells)) throw new TypeError("cells must be an array");
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError("limit must be a positive integer");
  const shown = cells.slice(0, limit);
  const objects = new Map([[focus, { id: focus, kind: "target", label: `${FOCUS_MARKER} ${focus}` }]]);
  const morphisms = [];
  for (const cell of shown) {
    const from = cell.subject[1], to = cell.object[1];
    for (const end of [from, to]) if (!objects.has(end)) objects.set(end, { id: end, kind: "term", label: end });
    morphisms.push({ from, to, kind: "cell", label: cell.predicate[1] });
  }
  return Object.freeze({ ...presentedCategoryDiagram({ diagramKind: "cells", title: focus, objects: [...objects.values()], morphisms }), truncated: cells.length > shown.length });
}
