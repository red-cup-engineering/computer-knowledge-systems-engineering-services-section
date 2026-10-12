import * as compositor from "@red-cup-engineering/flatfile-resource-graph-service/compositor";
import * as provider from "@red-cup-engineering/flatfile-resource-graph-service/provider";

export const GEODE_DOCUMENT_TYPE = "urn:geode:markdown-document";
export const GEODE_TYPE = "urn:geode:type";
export const GEODE_TITLE = "urn:geode:title";

function freeze(values) { return Object.freeze([...values]); }

/**
 * Seat GEODE's already-admitted CAIRN workspace graph as one FeltOS flatfile provider.
 * FeltOS observes this projection; it never rescans or reparses GEODE's corpus.
 */
export async function createGeodeWorkspaceFeltosGraph(snapshot) {
  if (snapshot?.type !== "GeodeWorkspaceSnapshot") throw new TypeError("snapshot must be a Geode workspace snapshot");
  if (!Array.isArray(snapshot.graph?.edges)) throw new TypeError("snapshot must carry a whole-workspace edge projection");

  const edgesBySource = Map.groupBy(snapshot.graph.edges, (edge) => edge.sourcePath);
  const geodeProvider = provider.defineProvider({
    id: "urn:red-cup-engineering:geode:workspace-provider",
    async observe() {
      const resources = snapshot.documents.map((document) => {
        const diagnostics = [];
        const cells = [
          Object.freeze({ subject: document.path, predicate: GEODE_TYPE, object: GEODE_DOCUMENT_TYPE }),
          Object.freeze({ subject: document.path, predicate: GEODE_TITLE, object: document.title }),
        ];
        for (const edge of edgesBySource.get(document.path) ?? []) {
          if (edge.status !== "resolved" || typeof edge.targetPath !== "string") {
            diagnostics.push(Object.freeze({
              code: `geode-link-${edge.status}`,
              message: `Geode did not resolve ${edge.kind} ${JSON.stringify(edge.target)} from ${document.path}`,
              edge: Object.freeze({ sourcePath: edge.sourcePath, kind: edge.kind, target: edge.target, status: edge.status, candidates: edge.candidates ?? [] }),
            }));
            continue;
          }
          cells.push(Object.freeze({
            subject: edge.sourcePath,
            predicate: edge.kind,
            object: edge.targetPath,
            evidence: Object.freeze({
              kind: "geode.markdown-link-resolution",
              target: edge.target,
              fragment: edge.fragment ?? null,
              span: edge.span ?? null,
            }),
          }));
        }
        return Object.freeze({
          resource: `urn:geode:document:${encodeURIComponent(document.path)}`,
          focus: document.path,
          observedAt: snapshot.observedAt,
          cells: freeze(cells),
          diagnostics: freeze(diagnostics),
        });
      });
      return Object.freeze({ resources: freeze(resources), diagnostics: Object.freeze([]) });
    },
  });

  const composition = await compositor.composeProviders([geodeProvider]);
  return Object.freeze({
    summary() {
      return Object.freeze({
        type: "GeodeFeltosWorkspaceGraphSummary",
        providers: composition.providers,
        resources: composition.resources.length,
        relations: composition.relationWeb.query().length,
        diagnostics: composition.diagnostics.length,
        authority: "GEODE's CAIRN-admitted workspace projected through FeltOS; DREW owns aggregate occurrence identity and provenance",
      });
    },
    relations(pattern = {}, { limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new RangeError("FeltOS relation limit must be from 1 through 500");
      const relations = compositor.queryRelations(composition, pattern);
      return Object.freeze({ type: "GeodeFeltosRelationQuery", total: relations.length, truncated: relations.length > limit, relations: freeze(relations.slice(0, limit)) });
    },
    entity(term, { predicate, direction = "both", limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new RangeError("FeltOS entity limit must be from 1 through 500");
      const reading = compositor.neighborhoodOf(composition, term, { predicate, direction });
      return Object.freeze({
        type: "GeodeFeltosEntityReading", term,
        incomingTotal: reading.incoming.length, outgoingTotal: reading.outgoing.length,
        truncated: reading.incoming.length > limit || reading.outgoing.length > limit,
        incoming: freeze(reading.incoming.slice(0, limit)), outgoing: freeze(reading.outgoing.slice(0, limit)),
      });
    },
    diagnostics({ limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new RangeError("FeltOS diagnostic limit must be from 1 through 500");
      return Object.freeze({ type: "GeodeFeltosDiagnostics", total: composition.diagnostics.length, truncated: composition.diagnostics.length > limit, diagnostics: freeze(composition.diagnostics.slice(0, limit)) });
    },
  });
}
