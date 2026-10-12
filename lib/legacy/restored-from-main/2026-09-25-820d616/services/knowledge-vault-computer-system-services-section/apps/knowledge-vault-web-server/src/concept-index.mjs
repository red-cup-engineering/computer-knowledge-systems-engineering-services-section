import { createRelationCatalog } from "./relation-catalog.mjs";
import { createGeodeDeclaredRelationsAdapter } from "./relation-adapters.mjs";
import { callRelationWebMcpTool } from "./relation-web-mcp.mjs";
import { evaluateSparql, triplesToTurtle } from "@red-cup-engineering/rdf-data-model-services-section/sparql-over-eavt";

import { DECLARED_RELATIONS, readDeclaredRelationLedger, readLedgerPassages } from "@red-cup-engineering/knowledge-vault-catalogue/declared-relations";
import { askEavtCell } from "@red-cup-engineering/eavt/ask-eavt-cell";

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
 *
 * `cache` (optional) is a `{load, save}` pair -- see `declared-relation-ledger-store.mjs` for the
 * real, disk-backed implementation -- consulted before paying the full-corpus build cost and
 * written to after paying it, keyed by `vaultVersion` and the admitted path set. Omitted (the
 * default), every build reads the vault fresh: this keeps every existing in-memory caller (tests,
 * canvas/concept-diagram, the release graph) exactly as before; only a caller that opts in gets
 * cross-process persistence and its stderr "loaded"/"rebuilt" line.
 */
export function createConceptIndex({ root, paths, ledger: suppliedLedger, vaultVersion, cache } = {}) {
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

  async function loadOrBuildLedger() {
    if (suppliedLedger !== undefined) return suppliedLedger;
    const documentPaths = paths();
    // `vaultVersion` may be a live accessor (mirroring `paths`, itself always a function) so a
    // long-lived workspace's own writes -- which bump the underlying vault's revision counter
    // after this index was first constructed -- are still read fresh at every build, never the
    // value captured at construction time.
    const version = typeof vaultVersion === "function" ? vaultVersion() : vaultVersion;
    const cached = cache ? await cache.load({ root, vaultVersion: version, paths: documentPaths }) : null;
    if (cached) {
      process.stderr.write(`[knowledge-vault-web-server] declared-relation ledger loaded from cache: ${cached.rows.length} rows, ${cached.documents} documents (${root})\n`);
      return cached;
    }
    const built = await readDeclaredRelationLedger({ root, paths: documentPaths });
    process.stderr.write(`[knowledge-vault-web-server] declared-relation ledger rebuilt: ${built.rows.length} rows, ${built.documents} documents (${root})\n`);
    if (cache) await cache.save({ root, vaultVersion: version, paths: documentPaths, ledger: built });
    return built;
  }

  function build() {
    if (building) return building;
    building = (async () => {
      ledger = await loadOrBuildLedger();
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
      const gaps = ledger.rows.filter((row) => row.a === "refused" && row.v?.rule === "unresolved-term" && row.v?.term === name);
      return Object.freeze({
        ...reading,
        type: "GeodeConceptReading",
        schemaVersion: "geode-concept/v1",
        keywordBacklinks: Object.freeze([...keywordBacklinks]),
        unresolvedGap: gaps.length > 0,
        unresolvedGapWitnesses: Object.freeze(gaps.map((row) => Object.freeze({ path: row.e, relation: row.v.relation, message: row.v.message }))),
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
    /**
     * Ask the ledger about one entity (a document path): its asserted and saturated row counts,
     * its settled section (the cells affirmed, denied, and held contradicted), whether it is
     * contested, its proof tree, and the closure regime of the fold -- the eavt substrate's own
     * answer (ks-01), over the entity's admitted rows. Refusals are not assertions and are left out.
     */
    async cell({ entity, attribute } = {}) {
      await build();
      const rows = ledger.rows.filter((row) => row.e === entity && row.a !== "refused" && typeof row.v === "string");
      const refusals = ledger.rows.filter((row) => row.e === entity && row.a === "refused").map((row) => row.v);
      return Object.freeze({ ...askEavtCell({ rows, entity, ...(attribute ? { attribute } : {}) }), refusals: Object.freeze(refusals) });
    },
    /** The corpus's open questions: names documents use that nothing defines, most asked first, optionally only those asked beneath a path prefix. */
    async questions({ prefix = "", limit = 50 } = {}) {
      await build();
      const asked = readLedgerPassages(ledger).questions
        .map((question) => prefix === "" ? question : Object.freeze({ ...question, documents: Object.freeze(question.documents.filter((path) => path.startsWith(prefix))) }))
        .filter((question) => question.documents.length > 0)
        .sort((left, right) => right.documents.length - left.documents.length || left.term.localeCompare(right.term, "en"));
      return Object.freeze({ kind: "vault.questions", prefix, total: asked.length, truncated: asked.length > limit, questions: Object.freeze(asked.slice(0, limit)) });
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
