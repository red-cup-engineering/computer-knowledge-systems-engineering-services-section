import { presentedCategoryDiagram, writeMermaid } from "@red-cup-engineering/agentic-relation-engine/writing";

export { writeMermaid } from "@red-cup-engineering/agentic-relation-engine/writing";

/**
 * Project one concept reading (`GeodeConceptReading`, from `./concept-index.mjs`) to a
 * `PresentedCategoryDiagram` from the house diagram codec (`@red-cup-engineering/agentic-relation-engine`),
 * and render it as Mermaid.
 *
 * The projection is pure: a reading in, a diagram out. Layout, colour, and text are all owned by
 * the codec (`presentedCategoryDiagram` + `writeMermaid`); this module only decides which
 * concepts become objects, which cells become morphisms, and how their `kind` fields encode what
 * the corpus actually witnessed.
 *
 * ## Kind vocabulary, and why
 *
 * The codec ships a colour-by-kind palette (`diagramPalette` in
 * `@red-cup-engineering/agentic-relation-engine`'s `writing/diagram`) that a downstream SVG rendering keys off
 * `object.kind` for node shape/fill and would key off `morphism.kind` for edge styling. Mermaid
 * text does not consume that palette directly, but `writeMermaid` does print `kind` into every
 * edge's own label (`from -->|kind: label| to`), so the same field that would drive colour in SVG
 * also drives the one piece of text Mermaid actually shows. Two choices follow from that:
 *
 * - The focus concept gets node kind `"target"` (the palette's parallelogram, a different shape
 *   from every neighbour's `"term"` rounded box) so it reads as visually distinct from its
 *   neighbours in any renderer that honours `diagramPalette`, and its label carries a marker
 *   glyph so the distinction survives in Mermaid's plain boxes too, which do not vary by kind.
 * - An edge's `kind` carries polarity/held status, not the relation name — the relation name is
 *   the `label`, always, per cell (never folded away), so it is never lost regardless of kind.
 *   An ordinary cell's edges get kind `"asserts"` (positive witness) or `"contrasts"` (negative
 *   witness, i.e. `contrasts-with` with no positive counterpart for that pair). A *held* cell —
 *   witnessed both ways — instead gets kind `"held"` on every edge it contributes, positive and
 *   negative alike. That is the single most important fact this diagram can carry, so it gets
 *   its own kind rather than being inferred from seeing both `"asserts"` and `"contrasts"` edges
 *   between the same two nodes: the held-ness is asserted directly, once, per edge, exactly where
 *   `writeMermaid` will print it into the rendered text (`held: specialization`,
 *   `held: contrasts-with`) instead of leaving a reader to notice a coincidence of endpoints.
 */

const FOCUS_KIND = "target";
const NEIGHBOUR_KIND = "term";
const FOCUS_MARKER = "◆"; // ◆ — a glyph mermaid's plain `[label]` boxes cannot express with shape or colour alone.

function requireReading(reading) {
  if (
    reading === null || typeof reading !== "object" ||
    typeof reading.name !== "string" || reading.name === "" ||
    !Array.isArray(reading.outgoing) || !Array.isArray(reading.incoming)
  ) {
    throw new TypeError("reading must be a GeodeConceptReading");
  }
  return reading;
}

function requireLimit(options) {
  if (options.limit === undefined) return 50;
  const limit = options.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) {
    throw new TypeError("limit must be a positive integer");
  }
  return limit;
}

function focusDetail(reading) {
  if (!reading.known) return "not known to the corpus: named or defined nowhere.";
  const definers = reading.definedBy.length;
  const parts = [`defined by ${definers} document${definers === 1 ? "" : "s"}`];
  if (reading.contested) parts.push("contested");
  if (reading.held.length > 0) parts.push(`${reading.held.length} held cell${reading.held.length === 1 ? "" : "s"}`);
  return parts.join(", ");
}

/**
 * Cells in a fixed, deterministic order: outgoing before incoming, each already sorted by
 * `projectConcept` (by `to`, then by `from`, respectively). Truncation therefore always drops the
 * same cells for the same reading, rather than depending on Map/Set iteration order.
 */
function orderedCells(reading) {
  return [
    ...reading.outgoing.map((cell) => ({ cell, neighbour: cell.to })),
    ...reading.incoming.map((cell) => ({ cell, neighbour: cell.from })),
  ];
}

function morphismsOfCell(cell) {
  const morphisms = [];
  const kindOf = (polarity) => (cell.held ? "held" : polarity);
  for (const witness of cell.positive) {
    morphisms.push({
      id: `${cell.from}=>${cell.to}#positive:${witness.relation}`,
      from: cell.from,
      to: cell.to,
      kind: kindOf("asserts"),
      label: witness.relation,
      documents: witness.documents,
    });
  }
  for (const witness of cell.negative) {
    morphisms.push({
      id: `${cell.from}=>${cell.to}#negative:${witness.relation}`,
      from: cell.from,
      to: cell.to,
      kind: kindOf("contrasts"),
      label: witness.relation,
      documents: witness.documents,
    });
  }
  return morphisms;
}

/**
 * Project an `GeodeConceptReading` to a `PresentedCategoryDiagram` centred on its concept.
 *
 * Bounded by `options.limit` (default 50, a size past which Mermaid degrades in a browser),
 * counted in nodes including the focus concept itself. Cells are admitted in `orderedCells`
 * order until the next cell would need a neighbour the diagram has no room left for; that cell
 * and every later one are dropped, and the returned diagram carries `truncated: true` rather than
 * silently thinning the graph. A reading with no cells at all still produces a valid diagram: one
 * object (the focus concept) and no morphisms.
 */
export function conceptDiagram(reading, options = {}) {
  requireReading(reading);
  const limit = requireLimit(options);

  const objects = new Map();
  objects.set(reading.name, {
    id: reading.name,
    kind: FOCUS_KIND,
    label: `${FOCUS_MARKER} ${reading.name}`,
    detail: focusDetail(reading),
  });

  const morphisms = [];
  let truncated = false;
  for (const { cell, neighbour } of orderedCells(reading)) {
    const needsNewNode = !objects.has(neighbour);
    if (needsNewNode && objects.size >= limit) {
      truncated = true;
      continue;
    }
    if (needsNewNode) objects.set(neighbour, { id: neighbour, kind: NEIGHBOUR_KIND, label: neighbour });
    morphisms.push(...morphismsOfCell(cell));
  }

  const diagram = presentedCategoryDiagram({
    title: `concept: ${reading.name}`,
    description: `${objects.size} concept${objects.size === 1 ? "" : "s"} around ${reading.name}` +
      `${truncated ? `, truncated to a limit of ${limit}` : ""}.`,
    diagramKind: "class",
    objects: [...objects.values()],
    morphisms,
  });

  // `truncated` is not part of the codec's schema, but the schema declares
  // `additionalProperties: true` for exactly this reason: a diagram can carry caller-specific
  // metadata alongside the objects/morphisms the codec itself understands. Attaching it here
  // keeps `conceptDiagram` a single-return-value pure projection instead of a second ad hoc
  // return shape that every caller has to know about.
  return Object.freeze({ ...diagram, truncated });
}

/** `conceptDiagram` followed by the house codec's Mermaid rendering, for callers that just want text. */
export function conceptDiagramMermaid(reading, options = {}) {
  return writeMermaid(conceptDiagram(reading, options));
}
