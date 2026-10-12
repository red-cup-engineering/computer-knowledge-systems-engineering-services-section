// The MCP face mounts only `vaultMcpTools` (`./mcp-tools.mjs`) now: PAM and the raw DREW tool
// catalog are no longer exposed as their own MCP tool family (see `apps/mcp-stdio.mjs`).
// `callRelationWebMcpTool` remains -- `concept-index.mjs` still calls it internally to answer
// `vault_relations`/`vault_term` against the declared-relation ledger's own DREW composition.

function result(value) {
  return Object.freeze({
    content: Object.freeze([{ type: "text", text: JSON.stringify(value, null, 2) }]),
    structuredContent: value,
  });
}

export function callRelationWebMcpTool(app, name, args = {}) {
  if (name === "drew_catalog") {
    const catalog = app.catalog();
    return result(Object.freeze({
      kind: catalog.kind,
      adapters: catalog.adapters,
      resources: Object.freeze(catalog.resources.map((entry) => Object.freeze({
        key: entry.key,
        source: entry.source,
        observationId: entry.observationId,
        relations: entry.relations.length,
        diagnostics: entry.diagnostics.length,
      }))),
    }));
  }
  if (name === "drew_relations") {
    const { limit = 100, ...pattern } = args;
    const relations = app.queryRelations(pattern);
    return result(Object.freeze({ kind: "drew.relation-query", total: relations.length, truncated: relations.length > limit, relations: Object.freeze(relations.slice(0, limit)) }));
  }
  if (name === "drew_entity") {
    const reading = app.entity(args.term);
    const limit = args.limit ?? 100;
    return result(Object.freeze({
      ...reading,
      incomingTotal: reading.incoming.length,
      outgoingTotal: reading.outgoing.length,
      truncated: reading.incoming.length > limit || reading.outgoing.length > limit,
      incoming: Object.freeze(reading.incoming.slice(0, limit)),
      outgoing: Object.freeze(reading.outgoing.slice(0, limit)),
    }));
  }
  if (name === "drew_project") {
    const { limit = 100, ...spec } = args;
    const projection = app.project(spec);
    if (!Array.isArray(projection)) return result(projection);
    return result(Object.freeze({ kind: "drew.projection", type: spec.type, total: projection.length, truncated: projection.length > limit, values: Object.freeze(projection.slice(0, limit)) }));
  }
  if (name === "drew_explain") return result(app.explain(args.address));
  if (name === "drew_diagnostics") return result(Object.freeze({ kind: "drew.diagnostics", diagnostics: app.diagnostics() }));
  throw new Error(`unknown DREW MCP tool: ${name}`);
}
