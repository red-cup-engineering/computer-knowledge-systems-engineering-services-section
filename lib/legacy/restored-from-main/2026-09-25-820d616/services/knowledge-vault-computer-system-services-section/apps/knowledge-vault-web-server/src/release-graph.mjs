import { createConceptIndex } from "./concept-index.mjs";
import { createGeodeWorkspaceFeltosGraph } from "./feltos-workspace-graph.mjs";
import { deriveGeodeLedgerFromTypedField, deriveGeodeWorkspaceFromTypedField } from "./typed-field-input.mjs";

function validateSnapshot(snapshot) {
  if (snapshot?.type !== "GeodeWorkspaceSnapshot") throw new TypeError("snapshot must be a Geode workspace snapshot");
  if (snapshot.schemaVersion !== "geode-workspace/v1") throw new TypeError("unsupported Geode workspace snapshot schema");
  if (!Array.isArray(snapshot.documents)) throw new TypeError("snapshot must carry documents");
  if (!Array.isArray(snapshot.graph?.edges)) throw new TypeError("snapshot must carry a whole-workspace edge projection");
}

function validateLedger(ledger) {
  if (ledger?.type !== "GeodeDeclaredRelationLedger") throw new TypeError("ledger must be a Geode declared relation ledger");
  if (ledger.schemaVersion !== "geode-declared-relations/v1") throw new TypeError("unsupported Geode declared relation ledger schema");
  if (!Array.isArray(ledger.rows) || !Array.isArray(ledger.defects)) throw new TypeError("ledger must carry rows and defects");
}

function releaseDiagnostics(snapshot) {
  const diagnostics = snapshot.graph.diagnostics;
  if (Array.isArray(diagnostics)) return diagnostics;
  if (!diagnostics || typeof diagnostics !== "object") return [];
  return Object.entries(diagnostics)
    .filter(([, count]) => Number.isSafeInteger(count) && count > 0)
    .map(([code, count]) => Object.freeze({
      code: `geode-release-${code}`,
      message: `The compiled Geode release reports ${count} ${code} graph ${count === 1 ? "diagnostic" : "diagnostics"}`,
      count,
      source: "GeodeWorkspaceSnapshot.graph.diagnostics",
    }));
}

/**
 * Open the immutable graph data compiled into a Geode release.
 *
 * This path performs no directory walk and reads no Markdown. It builds the query indexes once
 * from the supplied snapshot and declared-relation ledger, then shares them across every caller.
 */
export async function createGeodeReleaseGraph({ snapshot, ledger, typedField, createFeltosGraph = createGeodeWorkspaceFeltosGraph } = {}) {
  if (typedField !== undefined) {
    if (snapshot !== undefined || ledger !== undefined) throw new TypeError("typed-field release input cannot be mixed with snapshot or ledger projections");
    snapshot = deriveGeodeWorkspaceFromTypedField(typedField);
    ledger = deriveGeodeLedgerFromTypedField(typedField);
  }
  validateSnapshot(snapshot);
  validateLedger(ledger);

  const concepts = createConceptIndex({ ledger });
  const conceptIndex = await concepts.build();
  const compiledDiagnostics = Object.freeze(releaseDiagnostics(snapshot));
  let feltosPromise;
  const feltos = () => (feltosPromise ??= createFeltosGraph(snapshot));

  return Object.freeze({
    type: "GeodeReleaseGraph",
    schemaVersion: "geode-release-graph/v1",
    snapshot,
    ledger,
    concept(name) { return concepts.concept(name); },
    conceptSummary() { return concepts.summary(); },
    callGraphTool(name, args) { return concepts.callDrewTool(name, args); },
    sparql(query, options) { return concepts.sparql(query, options); },
    async feltosSummary() { return (await feltos()).summary(); },
    async feltosRelations(pattern, options) { return (await feltos()).relations(pattern, options); },
    async feltosEntity(term, options) { return (await feltos()).entity(term, options); },
    async feltosDiagnostics(options = {}) {
      const observed = (await feltos()).diagnostics(options);
      const limit = options.limit ?? 100;
      const diagnostics = Object.freeze([...compiledDiagnostics, ...observed.diagnostics]);
      return Object.freeze({
        ...observed,
        total: compiledDiagnostics.length + observed.total,
        truncated: diagnostics.length > limit || observed.truncated,
        diagnostics: Object.freeze(diagnostics.slice(0, limit)),
      });
    },
    get conceptsReady() { return concepts.ready; },
    get conceptCount() { return conceptIndex.concepts; },
  });
}
