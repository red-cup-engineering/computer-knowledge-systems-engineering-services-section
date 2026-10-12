import { canonicalJson } from "@red-cup-engineering/json-services-section/canonical-json";

const freezeList = (values) => Object.freeze([...values]);

function assertObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function polarityOf(value) {
  if (value === "positive" || value === "for") return "for";
  if (value === "negative" || value === "against") return "against";
  return undefined;
}

/**
 * Adapter for the records already produced by Geode's declared-relations module.
 * It does not parse Markdown or guess unnamed concepts; Geode keeps that policy.
 */
export function createGeodeDeclaredRelationsAdapter({ polarityByRelation = {} } = {}) {
  return Object.freeze({
    name: "geode-declared-relations/v1",
    observe(input) {
      const reading = assertObject(input, "Geode declared-relation reading");
      if (!Array.isArray(reading.rows)) throw new TypeError("Geode reading.rows must be an array");
      const relations = reading.rows.map((row, index) => {
        assertObject(row, `Geode reading.rows[${index}]`);
        if (row.e === undefined || row.a === undefined || row.v === undefined || row.t === undefined) {
          throw new TypeError(`Geode reading.rows[${index}] requires e, a, v, and t`);
        }
        const declaredPolarity = polarityOf(polarityByRelation[row.a]);
        return Object.freeze({
          subject: row.e,
          predicate: row.a,
          object: row.v,
          ...(declaredPolarity ? { polarity: declaredPolarity } : {}),
          evidence: Object.freeze({
            kind: "geode.frontmatter-declaration",
            document: row.e,
            frontmatterDigest: row.t,
          }),
        });
      });
      // The ledger is a G-Set of witnessed declarations. Filesystem traversal
      // and release document presentation order are not observation chronology.
      // Canonical enumeration retains the witness while giving identical source
      // evidence the same catalog observation and relation occurrence addresses.
      const orderedRelations = relations.map((relation) => ({ relation, key: canonicalJson(relation) }))
        .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
        .map(({ relation }) => relation);
      const diagnostics = [
        ...(reading.defect ? [{ kind: "geode.frontmatter-defect", ...reading.defect }] : []),
        ...(reading.defects ?? []).map((defect) => ({ kind: "geode.frontmatter-defect", ...defect })),
        ...((reading.unnamed ?? 0) > 0 ? [{
          kind: "geode.unnamed-relation-targets",
          count: reading.unnamed,
          message: "Values Geode refused to coerce into concept identifiers",
        }] : []),
      ];
      return Object.freeze({ relations: freezeList(orderedRelations), diagnostics: freezeList(diagnostics) });
    },
  });
}

/** Adapter for workspace-content-graph-service's oriented relation carriers. */
export const workspaceContentGraphAdapter = Object.freeze({
  name: "workspace-content-graph/v1",
  observe(input) {
    const graph = assertObject(input, "workspace content graph");
    if (!Array.isArray(graph.relations)) throw new TypeError("workspace content graph.relations must be an array");
    const relations = graph.relations.map((carrier, index) => {
      assertObject(carrier, `workspace content graph.relations[${index}]`);
      if (carrier.subject === undefined || carrier.predicate === undefined || carrier.object === undefined) {
        throw new TypeError(`workspace content graph.relations[${index}] requires subject, predicate, and object`);
      }
      return Object.freeze({
        subject: carrier.subject,
        predicate: carrier.predicate,
        object: carrier.object,
        evidence: Object.freeze({
          kind: carrier.kind ?? "workspace.oriented-relation.carrier",
          carrierIdentifier: carrier.id ?? null,
          witnessIdentifiers: freezeList(carrier.witnessIdentifiers ?? []),
        }),
      });
    });
    const diagnostics = [
      ...(graph.obstructions ?? []),
      ...(graph.refusals ?? []),
      ...(graph.diagnostics ?? []),
    ].map((diagnostic) => Object.freeze({ kind: diagnostic.kind ?? "workspace-content-graph.diagnostic", ...diagnostic }));
    return Object.freeze({ relations: freezeList(relations), diagnostics: freezeList(diagnostics) });
  },
});
