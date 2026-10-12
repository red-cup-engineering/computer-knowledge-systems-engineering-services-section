import { createRelationCatalog } from "./relation-catalog.mjs";
import { createGeodeDeclaredRelationsAdapter } from "./geode-relation-adapters.mjs";
import { callRelationWebMcpTool } from "./relation-web-mcp.mjs";
import { evaluateSparql, triplesToTurtle } from "@red-cup-engineering/agentic-knowledge-engine";

export { relationWebMcpTools } from "./relation-web-mcp.mjs";

import { DECLARED_RELATIONS, readDeclaredRelationLedger } from "./declared-relations.mjs";

/**
 * Glossary concepts and the compound keyword declarations that name them.
 *
 * The ledger is bipartite: a compound term document declares keyword filename stems. The reverse
 * backlink is projected in memory from those rows; no primitive term file receives reciprocal
 * frontmatter or prose.
 */

function relationMap(witnesses) {
  return new Map(witnesses.map(({ relation, documents }) => [relation, [...documents]]));
}

function geodeIndexFromDrew(projection) {
  const definedBy = new Map(projection.definitions.map(({ concept, documents }) => [concept, [...documents]]));
  const declaredBy = new Map(projection.declarations.map(({ concept, witnesses }) => [concept, new Map(
    witnesses.map(({ relation, documents }) => [relation, new Set(documents)]),
  )]));
  const conceptsOfDocument = new Map(projection.documents.map(({ document, concepts }) => [document, new Set(concepts)]));
  const cells = new Map(projection.cells.map((cell) => [`${cell.subject}\t${cell.object}`, {
    from: cell.subject,
    to: cell.object,
    positive: relationMap(cell.positive),
    negative: relationMap(cell.negative),
  }]));
  return Object.freeze({
    type: "GeodeConceptIndex",
    schemaVersion: "geode-concept-index/v1",
    concepts: projection.concepts.length,
    cellCount: cells.size,
    held: projection.cells.filter((cell) => cell.reading === "stable").length,
    contested: projection.definitions.filter(({ documents }) => documents.length > 1).length,
    definedBy,
    declaredBy,
    cells,
    conceptsOfDocument,
  });
}

/**
 * Rows DREW's concept-assertion projection may see. `refused` is its own predicate family
 * (DREW no-collapse law) and is explicitly withheld here; a refusals-family DREW projection is
 * deferred, named future work. The ledger result itself keeps every refused row (v1 custody).
 */
function nonRefusedRows(rows) {
  return rows.filter(({ a }) => a !== "refused");
}

function drewIndexOfRows(rows) {
  const adapter = createGeodeDeclaredRelationsAdapter({ polarityByRelation: DECLARED_RELATIONS });
  const drew = createRelationCatalog({ adapters: [adapter] });
  drew.observeResource({
    adapter: adapter.name,
    resource: Object.freeze({ kind: "geode-declared-relation-rows" }),
    revision: Object.freeze({ rows: rows.length }),
    value: Object.freeze({ rows: nonRefusedRows(rows), unnamed: 0, defects: Object.freeze([]) }),
  });
  return geodeIndexFromDrew(drew.project({ type: "definition-mediated-index" }));
}

/**
 * Index one ledger of EAVT rows.
 *
 * Concept identity here is the bare declared name. Deciding that two differently spelled names
 * are the same concept is a further judgement with its own evidence, and belongs to the derived
 * equality in `@lenticule-science/metrologic/equality`, not to this index.
 */
export function indexConcepts(rows) {
  return drewIndexOfRows(rows);
}

function witnessesOf(byRelation) {
  return Object.freeze([...byRelation].map(([relation, documents]) => Object.freeze({
    relation,
    documents: Object.freeze([...documents]),
  })).sort((left, right) => left.relation.localeCompare(right.relation)));
}

/**
 * Everything the corpus declares about one concept.
 *
 * A cell witnessed both positively and negatively is reported as `held` rather than resolved to
 * one side. `total-order` is a `specialization` of `partial-order` and `contrasts-with` it, and
 * both witnesses are correct; a graph that had to choose would have to be wrong.
 */
export function projectConcept(index, name) {
  if (typeof name !== "string" || name === "") throw new TypeError("name is required");
  const definers = index.definedBy.get(name) ?? [];
  const outgoing = [];
  const incoming = [];
  for (const cell of index.cells.values()) {
    if (cell.from !== name && cell.to !== name) continue;
    const projected = Object.freeze({
      from: cell.from,
      to: cell.to,
      positive: witnessesOf(cell.positive),
      negative: witnessesOf(cell.negative),
      held: cell.positive.size > 0 && cell.negative.size > 0,
    });
    (cell.from === name ? outgoing : incoming).push(projected);
  }
  const naming = index.declaredBy.get(name) ?? new Map();
  const keywordBacklinks = Object.freeze([...(naming.get("declares-keyword") ?? [])]);
  return Object.freeze({
    type: "GeodeConceptReading",
    schemaVersion: "geode-concept/v1",
    name,
    known: definers.length > 0 || naming.size > 0,
    // More than one definer is more than one positive witness, not a contradiction. It says the
    // corpus has several claimed authorities for this concept, which is worth seeing and is a
    // different fact from a cell being held.
    definedBy: Object.freeze([...definers]),
    contested: definers.length > 1,
    namedBy: witnessesOf(naming),
    keywordBacklinks,
    outgoing: Object.freeze(outgoing.sort((left, right) => left.to.localeCompare(right.to))),
    incoming: Object.freeze(incoming.sort((left, right) => left.from.localeCompare(right.from))),
    held: Object.freeze(outgoing.concat(incoming).filter((cell) => cell.held)),
  });
}

/**
 * A concept index over the whole vault or an already-compiled ledger, built once, on demand.
 *
 * The live-vault path reads every admitted carrier's frontmatter. The release path accepts that
 * immutable ledger directly and performs no filesystem read. Either way, every caller joins the
 * same build rather than starting another.
 */
export function createConceptIndex({ root, paths, ledger: suppliedLedger } = {}) {
  if (suppliedLedger === undefined && (typeof root !== "string" || root === "")) throw new TypeError("root is required");
  if (suppliedLedger === undefined && typeof paths !== "function") throw new TypeError("paths must be a function");
  if (suppliedLedger !== undefined) {
    if (suppliedLedger?.type !== "GeodeDeclaredRelationLedger") throw new TypeError("ledger must be a Geode declared relation ledger");
    if (suppliedLedger.schemaVersion !== "geode-declared-relations/v1") throw new TypeError("unsupported Geode declared relation ledger schema");
    if (!Array.isArray(suppliedLedger.rows) || !Array.isArray(suppliedLedger.defects)) throw new TypeError("ledger must carry rows and defects");
  }
  let building = null;
  let index = null;
  let ledger = null;
  let drew = null;

  function build() {
    if (building) return building;
    building = (async () => {
      ledger = suppliedLedger ?? await readDeclaredRelationLedger({ root, paths: paths() });
      const adapter = createGeodeDeclaredRelationsAdapter({ polarityByRelation: DECLARED_RELATIONS });
      drew = createRelationCatalog({ adapters: [adapter] });
      drew.observeResource({
        adapter: adapter.name,
        resource: Object.freeze({ kind: "geode-declared-relation-ledger" }),
        revision: Object.freeze({ rows: ledger.rows.length, documents: ledger.documents }),
        value: Object.freeze({ ...ledger, rows: nonRefusedRows(ledger.rows) }),
      });
      index = geodeIndexFromDrew(drew.project({ type: "definition-mediated-index" }));
      return index;
    })();
    return building;
  }

  return Object.freeze({
    get ready() { return index !== null; },
    get ledger() { return ledger; },
    build,
    invalidate() { building = null; index = null; ledger = null; drew = null; },
    async concept(name) {
      await build();
      const reading = drew.project({ type: "definition-mediated-concept", name });
      const keywordBacklinks = reading.namedBy
        .find(({ relation }) => relation === "declares-keyword")?.documents ?? Object.freeze([]);
      return Object.freeze({
        ...reading,
        type: "GeodeConceptReading",
        schemaVersion: "geode-concept/v1",
        keywordBacklinks: Object.freeze([...keywordBacklinks]),
      });
    },
    async callDrewTool(name, args = {}) {
      await build();
      return callRelationWebMcpTool(drew, name, args);
    },
    async sparql(query, { limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new RangeError("SPARQL result limit must be from 1 through 500");
      await build();
      const reading = evaluateSparql(ledger.rows, query);
      const bindings = Object.freeze(reading.bindings.slice(0, limit));
      const triples = Object.freeze(reading.triples.slice(0, limit));
      return Object.freeze({
        ...reading,
        bindings,
        triples,
        turtle: triplesToTurtle(triples),
        totalBindings: reading.bindings.length,
        totalTriples: reading.triples.length,
        truncated: reading.bindings.length > limit || reading.triples.length > limit,
      });
    },
    async summary() {
      const built = await build();
      return Object.freeze({
        type: "GeodeConceptIndexSummary",
        concepts: built.concepts,
        cells: built.cellCount,
        held: built.held,
        contested: built.contested,
        rows: ledger.rows.length,
        documents: ledger.documents,
        unnamed: ledger.unnamed,
        defects: ledger.defects.length,
      });
    },
  });
}
