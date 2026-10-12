import { compositor, provider } from "@red-cup-engineering/fae";

export const OPAL_DOCUMENT_TYPE = "urn:opal:markdown-document";
export const OPAL_TYPE = "urn:opal:type";
export const OPAL_TITLE = "urn:opal:title";

function freeze(values) { return Object.freeze([...values]); }

/**
 * Seat Opal's already-admitted Markdown graph as one FAE provider.
 * FAE observes this projection; it never rescans or reparses Opal's corpus.
 */
export async function createOpalWorkspaceFaeGraph(snapshot) {
  if (snapshot?.type !== "OpalWorkspaceSnapshot") throw new TypeError("snapshot must be an Opal workspace snapshot");
  if (!Array.isArray(snapshot.graph?.edges)) throw new TypeError("snapshot must carry a whole-workspace edge projection");

  const edgesBySource = Map.groupBy(snapshot.graph.edges, (edge) => edge.sourcePath);
  const opalProvider = provider.defineProvider({
    id: "urn:red-cup-engineering:opal:workspace-provider",
    async observe() {
      const resources = snapshot.documents.map((document) => {
        const diagnostics = [];
        const cells = [
          Object.freeze({ subject: document.path, predicate: OPAL_TYPE, object: OPAL_DOCUMENT_TYPE }),
          Object.freeze({ subject: document.path, predicate: OPAL_TITLE, object: document.title }),
        ];
        for (const edge of edgesBySource.get(document.path) ?? []) {
          if (edge.status !== "resolved" || typeof edge.targetPath !== "string") {
            diagnostics.push(Object.freeze({
              code: `opal-link-${edge.status}`,
              message: `Opal did not resolve ${edge.kind} ${JSON.stringify(edge.target)} from ${document.path}`,
              edge: Object.freeze({ sourcePath: edge.sourcePath, kind: edge.kind, target: edge.target, status: edge.status, candidates: edge.candidates ?? [] }),
            }));
            continue;
          }
          cells.push(Object.freeze({
            subject: edge.sourcePath,
            predicate: edge.kind,
            object: edge.targetPath,
            evidence: Object.freeze({
              kind: "opal.markdown-link-resolution",
              target: edge.target,
              fragment: edge.fragment ?? null,
              span: edge.span ?? null,
            }),
          }));
        }
        return Object.freeze({
          resource: `urn:opal:document:${encodeURIComponent(document.path)}`,
          focus: document.path,
          observedAt: snapshot.observedAt,
          cells: freeze(cells),
          diagnostics: freeze(diagnostics),
        });
      });
      return Object.freeze({ resources: freeze(resources), diagnostics: Object.freeze([]) });
    },
  });

  const composition = await compositor.composeProviders([opalProvider]);
  return Object.freeze({
    summary() {
      return Object.freeze({
        type: "OpalFaeWorkspaceGraphSummary",
        providers: composition.providers,
        resources: composition.resources.length,
        relations: composition.relationWeb.query().length,
        diagnostics: composition.diagnostics.length,
        authority: "Opal admission projected through FAE; DREW owns aggregate occurrence identity and provenance",
      });
    },
    relations(pattern = {}, { limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new RangeError("FAE relation limit must be from 1 through 500");
      const relations = compositor.queryRelations(composition, pattern);
      return Object.freeze({ type: "OpalFaeRelationQuery", total: relations.length, truncated: relations.length > limit, relations: freeze(relations.slice(0, limit)) });
    },
    entity(term, { predicate, direction = "both", limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new RangeError("FAE entity limit must be from 1 through 500");
      const reading = compositor.neighborhoodOf(composition, term, { predicate, direction });
      return Object.freeze({
        type: "OpalFaeEntityReading", term,
        incomingTotal: reading.incoming.length, outgoingTotal: reading.outgoing.length,
        truncated: reading.incoming.length > limit || reading.outgoing.length > limit,
        incoming: freeze(reading.incoming.slice(0, limit)), outgoing: freeze(reading.outgoing.slice(0, limit)),
      });
    },
    diagnostics({ limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new RangeError("FAE diagnostic limit must be from 1 through 500");
      return Object.freeze({ type: "OpalFaeDiagnostics", total: composition.diagnostics.length, truncated: composition.diagnostics.length > limit, diagnostics: freeze(composition.diagnostics.slice(0, limit)) });
    },
  });
}
