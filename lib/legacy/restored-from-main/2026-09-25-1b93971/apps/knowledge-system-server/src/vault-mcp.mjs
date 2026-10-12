// CAIRN's MCP surface over one archive: reading it (search, names, browse, read), what its
// documents say (its tellings, read as relations, cells, SPARQL, questions, readings and
// concepts), and writing it (write, edit, properties, move, merge).

export { vaultMcpTools } from "./mcp-tools.mjs";

function result(value) {
  return Object.freeze({
    content: Object.freeze([{ type: "text", text: JSON.stringify(value, null, 2) }]),
    structuredContent: value,
  });
}

/** A write receipt without the rewritten document: the path and revision say where it is. */
function written({ document, ...receipt }) {
  return Object.freeze({ ...receipt, title: document?.title ?? null });
}

export async function callVaultMcpTool(archive, name, args = {}) {
  if (name === "vault_query") {
    const reading = await archive.sparql(args.query, { limit: args.limit ?? 100 });
    return result(Object.freeze({ ...reading, kind: "vault.query" }));
  }
  if (name === "vault_relations") {
    const { limit = 100, ...pattern } = args;
    return result(Object.freeze({ kind: "vault.relations", ...(await archive.relationsWhere({ ...pattern, limit })) }));
  }
  if (name === "vault_search") {
    const found = await archive.search(args.query, { mode: "text", limit: args.limit ?? 25 });
    const results = found.map(({ path, title, heading, line, score, evidence }) => ({ path, title, heading, line, score, snippet: evidence?.[0] ?? null }));
    return result(Object.freeze({ kind: "vault.search", query: args.query, total: results.length, results }));
  }
  if (name === "vault_names") {
    const results = await archive.names(args.name, { prefix: args.prefix ?? false, limit: args.limit ?? 50 });
    return result(Object.freeze({ kind: "vault.names", name: args.name, total: results.length, results }));
  }
  if (name === "vault_similar") {
    const found = await archive.similar(args.path, { minimum: args.minimum ?? 0.2, limit: args.limit ?? 20 });
    return result(Object.freeze({ kind: "vault.similar", path: args.path, results: found.map(({ path, title, overlap }) => ({ path, title, overlap: Number(overlap.toFixed(3)) })) }));
  }
  if (name === "vault_topic") return result(await archive.topic(args.name, { locale: args.locale, limit: args.limit ?? 25 }));
  if (name === "vault_readings") return result(await archive.readings(args.name));
  if (name === "vault_term_concepts") return result(await archive.termConcepts({ locale: args.locale, minimumClaims: args.minimumClaims ?? 2 }));
  if (name === "vault_cells") return result(await archive.cellsAbout({ path: args.path, name: args.name, mark: args.mark, role: args.role ?? "subject", limit: args.limit ?? 500 }));
  if (name === "vault_statements") return result(await archive.statements(args.path));
  if (name === "vault_mentions") {
    const results = await archive.mentions(args.path, { limit: args.limit ?? 50 });
    return result(Object.freeze({ kind: "vault.mentions", path: args.path, total: results.length, results }));
  }
  if (name === "vault_clusters") {
    const clusters = await archive.clusters({ prefix: args.prefix ?? "", minimum: args.minimum ?? 0.6, limit: args.limit ?? 50 });
    return result(Object.freeze({ kind: "vault.clusters", total: clusters.length, clusters }));
  }
  if (name === "vault_read") {
    const reading = await archive.read(args.path);
    return result(reading);
  }
  if (name === "vault_questions") {
    return result(await archive.questions({ prefix: args.prefix ?? "", limit: args.limit ?? 50 }));
  }
  if (name === "vault_cell") {
    return result(await archive.cell({ entity: args.entity, attribute: args.attribute }));
  }
  if (name === "vault_fiber") {
    return result(await archive.fiber({ key: args.key, locale: args.locale ?? "", limit: args.limit ?? 50 }));
  }
  if (name === "vault_divergences") {
    return result(await archive.divergences({ locale: args.locale ?? "", minimum: args.minimum ?? 5, dominance: args.dominance ?? 0.8, limit: args.limit ?? 50 }));
  }
  if (name === "vault_key_affinities") {
    return result(await archive.keyAffinities({ locale: args.locale ?? "", minimum: args.minimum ?? 5, overlap: args.overlap ?? 0.3, limit: args.limit ?? 50 }));
  }
  if (name === "vault_browse") {
    return result(Object.freeze({ kind: "vault.browse", ...archive.browse(args.prefix ?? "", { limit: args.limit ?? 100 }) }));
  }
  if (name === "vault_write") {
    const exists = archive.paths.includes(args.path);
    const receipt = exists
      ? await archive.replace({ path: args.path, markdown: args.markdown, expectedRevision: args.expectedRevision })
      : await archive.create({ path: args.path, markdown: args.markdown });
    return result(written(receipt));
  }
  if (name === "vault_edit") return result(written(await archive.edit({ path: args.path, edits: args.edits, expectedRevision: args.expectedRevision })));
  if (name === "vault_properties") return result(written(await archive.setProperties({ path: args.path, set: args.set ?? {}, remove: args.remove ?? [], expectedRevision: args.expectedRevision })));
  if (name === "vault_move") return result(await archive.move({ moves: args.moves }));
  if (name === "vault_merge") {
    const { document, ...receipt } = await archive.merge({ into: args.into, from: args.from });
    return result(receipt);
  }
  throw new Error(`unknown vault MCP tool: ${name}`);
}
