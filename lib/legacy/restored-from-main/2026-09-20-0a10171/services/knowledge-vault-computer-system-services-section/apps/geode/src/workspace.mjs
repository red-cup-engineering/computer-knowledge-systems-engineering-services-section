import { searchImmutableRoomIndex } from "@red-cup-engineering/cairn/room-index-search";
import { openMarkdownVault } from "@red-cup-engineering/cairn";
import { renderMarkdownBlockHtml } from "@red-cup-engineering/markdown-engineering-services-section/render-markdown-block-html";
import { CairnRevisionConflict } from "@red-cup-engineering/cairn";

export const GeodeRevisionConflict = CairnRevisionConflict;

export function searchGeodeSnapshot(snapshot, query, { limit = 100 } = {}) {
  if (!snapshot || snapshot.type !== "GeodeWorkspaceSnapshot") throw new TypeError("snapshot must be a Geode workspace snapshot");
  if (snapshot.complete === false && snapshot.observationsComplete !== true) throw new TypeError("search requires complete observations; use workspace.search");
  if (typeof query !== "string") throw new TypeError("query must be a string");
  if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError("limit must be a nonnegative safe integer");
  const trimmed = query.trim();
  if (trimmed === "") return snapshot.documents.slice(0, limit);
  if (limit === 0) return [];
  return searchImmutableRoomIndex(snapshot.documents, { query: trimmed, match: "all", limit })
    .results.map(({ room }) => room);
}

export function projectGeodeWorkspace(snapshot) {
  return Object.freeze({
    type: snapshot.type,
    schemaVersion: snapshot.schemaVersion,
    observedAt: snapshot.observedAt,
    region: snapshot.region,
    excludes: snapshot.excludes,
    scanned: snapshot.scanned,
    excluded: snapshot.excluded,
    available: snapshot.available,
    truncated: snapshot.truncated,
    ...(snapshot.profile ? { profile: snapshot.profile } : {}),
    ...(snapshot.collections ? { collections: snapshot.collections } : {}),
    ...(snapshot.repository ? { repository: snapshot.repository } : {}),
    complete: snapshot.complete,
    observationsComplete: snapshot.observationsComplete,
    documents: snapshot.documents,
    graph: Object.freeze({
      nodes: snapshot.graph.nodes.length,
      // A per-document graph has no whole-vault edge total; null says so rather than claiming zero.
      edges: snapshot.graph.edges === null ? null : snapshot.graph.edges.length,
      externalUrls: snapshot.graph.externalUrls?.length ?? null,
      diagnostics: snapshot.graph.diagnostics,
      complete: snapshot.graph.complete,
      ...(snapshot.graph.derivation ? { derivation: snapshot.graph.derivation } : {}),
    }),
  });
}

/** The graphical view of CAIRN's one document catalogue. */
export async function createGeodeWorkspace(options = {}) {
  const { root } = options;
  const cairn = await openMarkdownVault(options);
  let concepts;
  let conceptsPromise;
  async function conceptIndex() {
    conceptsPromise ??= import("./concept-index.mjs").then(({ createConceptIndex }) => {
      concepts = createConceptIndex({ root, paths: () => cairn.paths });
      conceptVersion = cairn.version;
      return concepts;
    }).catch((error) => { conceptsPromise = null; throw error; });
    await conceptsPromise;
    invalidateConcepts();
    return concepts;
  }
  let conceptVersion = cairn.version;
  let feltosVersion = -1;
  let feltosGraphPromise;
  const asGeode = (snapshot) => Object.freeze({ ...snapshot, type: "GeodeWorkspaceSnapshot", schemaVersion: "geode-workspace/v1" });
  function invalidateConcepts() {
    if (conceptVersion === cairn.version) return;
    concepts?.invalidate();
    conceptVersion = cairn.version;
  }
  async function read(path) {
    const reading = await cairn.read(path);
    invalidateConcepts();
    return Object.freeze({ ...reading, type: "GeodeDocumentReading", relationKeys: Object.freeze([]), html: renderMarkdownBlockHtml(reading.body) });
  }
  async function feltosGraph() {
    const snapshot = await cairn.completeSnapshot();
    if (!feltosGraphPromise || feltosVersion !== snapshot.version) {
      feltosVersion = snapshot.version;
      feltosGraphPromise = import("./feltos-workspace-graph.mjs").then(({ createGeodeWorkspaceFeltosGraph }) => createGeodeWorkspaceFeltosGraph(asGeode(snapshot)));
    }
    return feltosGraphPromise;
  }
  return Object.freeze({
    get snapshot() { return asGeode(cairn.snapshot); },
    get paths() { return cairn.paths; },
    admit: cairn.admit,
    read,
    async replace(options) {
      const receipt = await cairn.replace(options);
      invalidateConcepts();
      return Object.freeze({ ...receipt, type: "GeodeMarkdownWriteReceipt", schemaVersion: "geode-markdown-write/v1", document: Object.freeze({ ...receipt.document, type: "GeodeDocumentReading", relationKeys: Object.freeze([]), html: renderMarkdownBlockHtml(receipt.document.body) }) });
    },
    async refresh() { await cairn.refresh(); invalidateConcepts(); return asGeode(cairn.snapshot); },
    async completeSnapshot(options) { return asGeode(await cairn.completeSnapshot(options)); },
    relations: cairn.relations,
    browse(prefix, options) { return Object.freeze({ ...cairn.browse(prefix, options), type: "GeodeDirectoryListing" }); },
    search: cairn.search,
    resolveLink: cairn.resolveLink,
    async concept(name) { return (await conceptIndex()).concept(name); },
    async conceptSummary() { return (await conceptIndex()).summary(); },
    get conceptsReady() { invalidateConcepts(); return concepts?.ready ?? false; },
    async callGraphTool(name, args) { return (await conceptIndex()).callDrewTool(name, args); },
    async sparql(query, options) { return (await conceptIndex()).sparql(query, options); },
    async feltosSummary() { return (await feltosGraph()).summary(); },
    async feltosRelations(pattern, options) { return (await feltosGraph()).relations(pattern, options); },
    async feltosEntity(term, options) { return (await feltosGraph()).entity(term, options); },
    async feltosDiagnostics(options) { return (await feltosGraph()).diagnostics(options); },
  });
}
