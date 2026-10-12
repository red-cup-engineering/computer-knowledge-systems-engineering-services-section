// The vault MCP surface over one GEODE workspace: CAIRN's archive read (search, names, browse,
// read), what its documents say (its tellings, read as relations, cells, SPARQL, questions,
// readings and concepts), and its writes (write, edit, properties, move, merge).

export { vaultMcpTools } from "./mcp-tools.mjs";

function result(value) {
  return Object.freeze({
    content: Object.freeze([{ type: "text", text: JSON.stringify(value, null, 2) }]),
    structuredContent: value,
  });
}

/** A write receipt without the rewritten document's body: the path and revision say where it is. */
function written({ document, ...receipt }) {
  return Object.freeze({ ...receipt, title: document?.title ?? null });
}

export async function callVaultMcpTool(workspace, name, args = {}) {
  if (name === "vault_query") {
    const reading = await workspace.sparql(args.query, { limit: args.limit ?? 100 });
    return result(Object.freeze({ ...reading, kind: "vault.query" }));
  }
  if (name === "vault_relations") {
    const { limit = 100, ...pattern } = args;
    return result(Object.freeze({ kind: "vault.relations", ...(await workspace.relationsWhere({ ...pattern, limit })) }));
  }
  if (name === "vault_search") {
    const found = await workspace.search(args.query, { mode: "text", limit: args.limit ?? 25 });
    const results = found.map(({ path, title, heading, line, score, evidence }) => ({ path, title, heading, line, score, snippet: evidence?.[0] ?? null }));
    return result(Object.freeze({ kind: "vault.search", query: args.query, total: results.length, results }));
  }
  if (name === "vault_names") {
    const results = await workspace.names(args.name, { prefix: args.prefix ?? false, limit: args.limit ?? 50 });
    return result(Object.freeze({ kind: "vault.names", name: args.name, total: results.length, results }));
  }
  if (name === "vault_similar") {
    const found = await workspace.similar(args.path, { minimum: args.minimum ?? 0.2, limit: args.limit ?? 20 });
    return result(Object.freeze({ kind: "vault.similar", path: args.path, results: found.map(({ path, title, overlap }) => ({ path, title, overlap: Number(overlap.toFixed(3)) })) }));
  }
  if (name === "vault_readings") return result(await workspace.readings(args.name));
  if (name === "vault_term_concepts") return result(await workspace.termConcepts({ locale: args.locale, minimumClaims: args.minimumClaims ?? 2 }));
  if (name === "vault_cells") return result(await workspace.cellsAbout({ path: args.path, name: args.name, mark: args.mark, role: args.role ?? "subject", limit: args.limit ?? 500 }));
  if (name === "vault_statements") return result(await workspace.statements(args.path));
  if (name === "vault_mentions") {
    const results = await workspace.mentions(args.path, { limit: args.limit ?? 50 });
    return result(Object.freeze({ kind: "vault.mentions", path: args.path, total: results.length, results }));
  }
  if (name === "vault_clusters") {
    const clusters = await workspace.clusters({ prefix: args.prefix ?? "", minimum: args.minimum ?? 0.6, limit: args.limit ?? 50 });
    return result(Object.freeze({ kind: "vault.clusters", total: clusters.length, clusters }));
  }
  if (name === "vault_read") {
    const reading = await workspace.read(args.path);
    return result(reading);
  }
  if (name === "vault_questions") {
    return result(await workspace.questions({ prefix: args.prefix ?? "", limit: args.limit ?? 50 }));
  }
  if (name === "vault_cell") {
    return result(await workspace.cell({ entity: args.entity, attribute: args.attribute }));
  }
  if (name === "vault_fiber") {
    return result(await workspace.fiber({ key: args.key, locale: args.locale ?? "", limit: args.limit ?? 50 }));
  }
  if (name === "vault_divergences") {
    return result(await workspace.divergences({ locale: args.locale ?? "", minimum: args.minimum ?? 5, dominance: args.dominance ?? 0.8, limit: args.limit ?? 50 }));
  }
  if (name === "vault_key_affinities") {
    return result(await workspace.keyAffinities({ locale: args.locale ?? "", minimum: args.minimum ?? 5, overlap: args.overlap ?? 0.3, limit: args.limit ?? 50 }));
  }
  if (name === "vault_browse") {
    return result(Object.freeze({ kind: "vault.browse", ...workspace.browse(args.prefix ?? "", { limit: args.limit ?? 100 }) }));
  }
  if (name === "vault_write") {
    const exists = workspace.paths.includes(args.path);
    const receipt = exists
      ? await workspace.replace({ path: args.path, markdown: args.markdown, expectedRevision: args.expectedRevision })
      : await workspace.create({ path: args.path, markdown: args.markdown });
    return result(written(receipt));
  }
  if (name === "vault_edit") return result(written(await workspace.edit({ path: args.path, edits: args.edits, expectedRevision: args.expectedRevision })));
  if (name === "vault_properties") return result(written(await workspace.setProperties({ path: args.path, set: args.set ?? {}, remove: args.remove ?? [], expectedRevision: args.expectedRevision })));
  if (name === "vault_move") return result(await workspace.move({ moves: args.moves }));
  if (name === "vault_merge") {
    const { document, ...receipt } = await workspace.merge({ into: args.into, from: args.from });
    return result(receipt);
  }
  throw new Error(`unknown vault MCP tool: ${name}`);
}
