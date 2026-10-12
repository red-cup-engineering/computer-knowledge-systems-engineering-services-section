// CAIRN's MCP surface over one archive: reading it (search, names, browse, read), what its
// documents say (its tellings, read as relations, cells, SPARQL, questions, readings and
// concepts), and writing it (write, edit, properties, move, merge). Each tool reads its archive
// from the request context (`context.archive`, the archive or a function opening it); write
// tools are hidden where `context.canWrite` is false. `search` and `fetch` are the pair a
// general assistant (ChatGPT's connectors and deep research) expects of a knowledge source.

const objectSchema = (properties, required = []) => Object.freeze({
  type: "object",
  properties: Object.freeze(properties),
  required: Object.freeze(required),
  additionalProperties: false,
});

const term = Object.freeze({ type: "string", description: "A mark's surface: a document path, a frontmatter key or link kind, or a value." });

const VAULT_TOOL_DESCRIPTORS = Object.freeze([
  Object.freeze({
    name: "vault_query",
    description: "Run a structured SPARQL query (select/ask/construct) over the archive's tellings read as EAVT rows (e: document path, a: key or link kind, v: value or target path, t: revision). Results are bounded by limit and report whether they were truncated.",
    inputSchema: objectSchema({ query: { type: "object", description: "A knowing.sparql.query term: {kind, type, ...}." }, limit: { type: "integer", minimum: 1, maximum: 500, default: 100 } }, ["query"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_relations",
    description: "The archive's tellings matching a pattern of subject (a document path), predicate (a frontmatter key, or link/embed/image/tag), and object (a value or target path) -- any combination, all optional -- in order, bounded by limit.",
    inputSchema: objectSchema({ subject: term, predicate: term, object: term, limit: { type: "integer", minimum: 1, maximum: 500, default: 100 } }),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_search",
    description: "Full-text search over every admitted document's body, cut into heading sections and ranked by BM25 (title and heading matches weigh more than body matches). Words match as prefixes, \"quoted phrases\" match exactly, and AND/OR/NOT combine terms (adjacent words are ANDed). Returns one row per matching section: path, title, heading, line, score, and a snippet with matches in «guillemets» -- fetch a path with vault_read for the whole document.",
    inputSchema: objectSchema({ query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100, default: 25 } }, ["query"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_names",
    description: "The documents that answer to a name: a declared title, name, or id, an alias, or the file stem, matched case-insensitively. With prefix, every name beginning with the text (a quick switcher). Where one name answers to documents in several locales, those are the name's readings -- one word in several registers (lawful polysemy) or one thing filed several times (aliasing to resolve); vault_similar tells the two apart.",
    inputSchema: objectSchema({ name: { type: "string" }, prefix: { type: "boolean", default: false }, limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } }, ["name"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_similar",
    description: "Documents whose text overlaps one document's, whatever they are named: the estimated Jaccard overlap of their five-word shingles (MinHash), best first. Overlap near 1 is a copy; 0.5-0.9 is one note written more than once; below that, shared passages. Documents under about twenty shingles have no signature.",
    inputSchema: objectSchema({ path: { type: "string" }, minimum: { type: "number", minimum: 0, maximum: 1, default: 0.2 }, limit: { type: "integer", minimum: 1, maximum: 200, default: 20 } }, ["path"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_topic",
    description: "Everything the archive knows about one topic and what it lacks, as a working dossier: its homes (glossary documents answering to the name) and namesakes, the documents whose tellings point at it and those that only mention it in their text, its neighbourhood (the documents around it counted by type, keyword and locale -- a concept map), whether the archive asks it as an unanswered question, and the gaps this shows: no-home, several-homes (one locale: aliases; several: registers), copies among its readings, unlinked-mentions, asked. suggestedHome is a filing path for a home when it has none (in the given locale, or the one most documents around it live in).",
    inputSchema: objectSchema({ name: { type: "string" }, locale: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200, default: 25 } }, ["name"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_readings",
    description: "One name's readings: every document answering to it (title, name, id, alias, or file name, folded), each with its locale (the section it is filed in -- its register), how many claims it makes and the census of its tellings' knowledge readings, and every pair judged: copies (texts overlap: merge), same-concept (their claims mostly coincide though texts differ), related (some text or claims shared: a link saying how they differ is owed), or unconnected (nothing shared -- no evidence either way: read both). Shared claims are listed per pair as [predicate, object] SEN marks.",
    inputSchema: objectSchema({ name: { type: "string" } }, ["name"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_term_concepts",
    description: "The concepts one locale's glossary documents generate (formal concept analysis over the archive's tellings: documents as objects, their claims -- predicate with object supplied -- as attributes, read over claims two or more documents share and through predicates whose values there mostly name documents). aliases: documents no claim tells apart. broader: documents whose every claim another also makes. The locale is a section path as vault_readings reports it.",
    inputSchema: objectSchema({ locale: { type: "string" }, minimumClaims: { type: "integer", minimum: 1, default: 2 } }, ["locale"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_cells",
    description: "The archive's tellings where one mark stands in a role, gathered into cells. Every statement a document makes is told as a triple of SEN marks -- (path, key, value) for frontmatter, (path, link, target path) for a link -- witnessed by the document's revision. role subject: what is said of the mark; predicate: what is said through it; object: who says something of it. Give a document path, a name (each document answering to it, and the bare name as a value), or a bare mark. Each group carries the census of its cells' knowledge readings (SignChain) and how many cells rest on one witness.",
    inputSchema: objectSchema({ path: { type: "string" }, name: { type: "string" }, mark: { type: "string" }, role: { type: "string", enum: ["subject", "predicate", "object"], default: "subject" }, limit: { type: "integer", minimum: 1, maximum: 5000, default: 500 } }),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_statements",
    description: "What one document says, as the cells of its tellings: each frontmatter value and each link as (path, key or link kind, value or target) SEN marks.",
    inputSchema: objectSchema({ path: { type: "string" } }, ["path"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_mentions",
    description: "Sections elsewhere in the vault that say one document's title or aliases in their text, each marked linked (the section's document already links it) or not -- the unlinked ones are where a link, or a merge, is owed.",
    inputSchema: objectSchema({ path: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200, default: 50 } }, ["path"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_clusters",
    description: "Groups of documents that say one thing: every pair of documents under a path prefix whose texts overlap by at least minimum (MinHash estimate), joined into groups, largest first. Large groups of unrelated titles are usually shared boilerplate (generated stubs, templates) -- itself something to condense.",
    inputSchema: objectSchema({ prefix: { type: "string" }, minimum: { type: "number", minimum: 0.3, maximum: 1, default: 0.6 }, limit: { type: "integer", minimum: 1, maximum: 500, default: 50 } }),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_read",
    description: "Read one admitted document by vault-relative path: its frontmatter, Markdown source and body, headings, and revision (the expectedRevision a vault_write or vault_edit guards on).",
    inputSchema: objectSchema({ path: { type: "string" } }, ["path"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_questions",
    description: "The names the archive uses as terms and nothing answers to: link targets that exist nowhere, and values naming no document under keys whose values mostly do name documents. Ranked by how many documents ask each, with the keys it is asked through and the asking documents; optionally only those asked beneath a path prefix. A document answering to the name answers the question.",
    inputSchema: objectSchema({ prefix: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 500, default: 50 } }),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_cell",
    description: "The EAVT cell reading of one document's tellings (e: its path), optionally of one attribute: asserted and current rows, and the settled, contested, and proof readings over them.",
    inputSchema: objectSchema({ entity: { type: "string" }, attribute: { type: "string" } }, ["entity"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_fiber",
    description: "The fiber of one frontmatter key within a locale (a vault path prefix): every value the locale's documents give it, with how many documents give each. A reading of the frontmatter as written, not of admitted claims.",
    inputSchema: objectSchema({ key: { type: "string" }, locale: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 500, default: 50 } }, ["key"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_divergences",
    description: "Where a locale (a vault path prefix) diverges from its own frontmatter practice, firmest first: value divergences (a key most documents give one value, some give otherwise) and absence divergences (a key most documents of one type carry, some of that type lack). Questions the practice raises, not refusals.",
    inputSchema: objectSchema({ locale: { type: "string" }, minimum: { type: "integer", minimum: 2, default: 5 }, dominance: { type: "number", minimum: 0.5, maximum: 1, default: 0.8 }, limit: { type: "integer", minimum: 1, maximum: 500, default: 50 } }),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_key_affinities",
    description: "Pairs of frontmatter keys whose fibers share name-like values within a locale, with the shared count and share, each key's document count, and how many documents carry both. Keys sharing much that rarely meet are likely one predicate under several names.",
    inputSchema: objectSchema({ locale: { type: "string" }, minimum: { type: "integer", minimum: 2, default: 5 }, overlap: { type: "number", minimum: 0, maximum: 1, default: 0.3 }, limit: { type: "integer", minimum: 1, maximum: 500, default: 50 } }),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_browse",
    description: "Browse admitted document paths beneath a prefix without parsing document bodies. Single-child directory runs collapse to one navigable path.",
    inputSchema: objectSchema({ prefix: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 } }),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_write",
    description: "Write one whole document: create it when it does not exist, or replace it when it does. A replacement must carry the expectedRevision a vault_read returned, and is refused if the file changed since. Prefer vault_edit for changing part of a document.",
    inputSchema: objectSchema({ path: { type: "string" }, markdown: { type: "string" }, expectedRevision: { type: "string" } }, ["path", "markdown"]),
    annotations: Object.freeze({ readOnlyHint: false, destructiveHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_edit",
    description: "Replace exact passages of one document. Each edit's find must occur exactly once (or, with all, at least once), else nothing is written; edits apply in order. Refused if the file changed since expectedRevision (default: the revision the edit read).",
    inputSchema: objectSchema({ path: { type: "string" }, edits: { type: "array", minItems: 1, items: objectSchema({ find: { type: "string" }, replace: { type: "string" }, all: { type: "boolean", default: false } }, ["find", "replace"]) }, expectedRevision: { type: "string" } }, ["path", "edits"]),
    annotations: Object.freeze({ readOnlyHint: false, destructiveHint: true, idempotentHint: false }),
  }),
  Object.freeze({
    name: "vault_properties",
    description: "Set and delete frontmatter keys of one document, keeping every other byte. Values are YAML-shaped JSON: strings, numbers, booleans, lists, maps.",
    inputSchema: objectSchema({ path: { type: "string" }, set: { type: "object" }, remove: { type: "array", items: { type: "string" } }, expectedRevision: { type: "string" } }, ["path"]),
    annotations: Object.freeze({ readOnlyHint: false, destructiveHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "vault_move",
    description: "Move or rename documents (moves: {from: to}). Every relative link and wikilink to a moved document is pointed at its new path, and its own relative links are rebased. A destination that exists is refused.",
    inputSchema: objectSchema({ moves: { type: "object", additionalProperties: { type: "string" } } }, ["moves"]),
    annotations: Object.freeze({ readOnlyHint: false, destructiveHint: true, idempotentHint: false }),
  }),
  Object.freeze({
    name: "vault_merge",
    description: "Merge documents that say one thing into one home, the condensing move: the home gains the paragraphs only the others say (under \"Earlier material\", to be integrated by a following vault_edit), their titles and aliases as its aliases, and frontmatter keys it lacks; every link to them is pointed at the home; they are removed. Read both first (vault_similar shows overlap); the judgment that they are one thing is yours.",
    inputSchema: objectSchema({ into: { type: "string" }, from: { type: "array", minItems: 1, items: { type: "string" } } }, ["into", "from"]),
    annotations: Object.freeze({ readOnlyHint: false, destructiveHint: true, idempotentHint: false }),
  }),
]);

const archiveOf = async (context) => (typeof context?.archive === "function" ? context.archive() : context?.archive);
const WRITES = new Set(["vault_write", "vault_edit", "vault_properties", "vault_move", "vault_merge"]);

/** A write receipt without the rewritten document: the path and revision say where it is. */
function written({ document, ...receipt }) {
  return Object.freeze({ ...receipt, title: document?.title ?? null });
}

const RUN = Object.freeze({
  async vault_query(archive, args) { return Object.freeze({ ...(await archive.sparql(args.query, { limit: args.limit ?? 100 })), kind: "vault.query" }); },
  async vault_relations(archive, { limit = 100, ...pattern }) { return Object.freeze({ kind: "vault.relations", ...(await archive.relationsWhere({ ...pattern, limit })) }); },
  async vault_search(archive, args) {
    const found = await archive.search(args.query, { mode: "text", limit: args.limit ?? 25 });
    const results = found.map(({ path, title, heading, line, score, evidence }) => ({ path, title, heading, line, score, snippet: evidence?.[0] ?? null }));
    return Object.freeze({ kind: "vault.search", query: args.query, total: results.length, results });
  },
  async vault_names(archive, args) {
    const results = await archive.names(args.name, { prefix: args.prefix ?? false, limit: args.limit ?? 50 });
    return Object.freeze({ kind: "vault.names", name: args.name, total: results.length, results });
  },
  async vault_similar(archive, args) {
    const found = await archive.similar(args.path, { minimum: args.minimum ?? 0.2, limit: args.limit ?? 20 });
    return Object.freeze({ kind: "vault.similar", path: args.path, results: found.map(({ path, title, overlap }) => ({ path, title, overlap: Number(overlap.toFixed(3)) })) });
  },
  vault_topic: (archive, args) => archive.topic(args.name, { locale: args.locale, limit: args.limit ?? 25 }),
  vault_readings: (archive, args) => archive.readings(args.name),
  vault_term_concepts: (archive, args) => archive.termConcepts({ locale: args.locale, minimumClaims: args.minimumClaims ?? 2 }),
  vault_cells: (archive, args) => archive.cellsAbout({ path: args.path, name: args.name, mark: args.mark, role: args.role ?? "subject", limit: args.limit ?? 500 }),
  vault_statements: (archive, args) => archive.statements(args.path),
  async vault_mentions(archive, args) {
    const results = await archive.mentions(args.path, { limit: args.limit ?? 50 });
    return Object.freeze({ kind: "vault.mentions", path: args.path, total: results.length, results });
  },
  async vault_clusters(archive, args) {
    const clusters = await archive.clusters({ prefix: args.prefix ?? "", minimum: args.minimum ?? 0.6, limit: args.limit ?? 50 });
    return Object.freeze({ kind: "vault.clusters", total: clusters.length, clusters });
  },
  vault_read: (archive, args) => archive.read(args.path),
  vault_questions: (archive, args) => archive.questions({ prefix: args.prefix ?? "", limit: args.limit ?? 50 }),
  vault_cell: (archive, args) => archive.cell({ entity: args.entity, attribute: args.attribute }),
  vault_fiber: (archive, args) => archive.fiber({ key: args.key, locale: args.locale ?? "", limit: args.limit ?? 50 }),
  vault_divergences: (archive, args) => archive.divergences({ locale: args.locale ?? "", minimum: args.minimum ?? 5, dominance: args.dominance ?? 0.8, limit: args.limit ?? 50 }),
  vault_key_affinities: (archive, args) => archive.keyAffinities({ locale: args.locale ?? "", minimum: args.minimum ?? 5, overlap: args.overlap ?? 0.3, limit: args.limit ?? 50 }),
  vault_browse: (archive, args) => Object.freeze({ kind: "vault.browse", ...archive.browse(args.prefix ?? "", { limit: args.limit ?? 100 }) }),
  async vault_write(archive, args) {
    const receipt = archive.paths.includes(args.path)
      ? await archive.replace({ path: args.path, markdown: args.markdown, expectedRevision: args.expectedRevision })
      : await archive.create({ path: args.path, markdown: args.markdown });
    return written(receipt);
  },
  vault_edit: async (archive, args) => written(await archive.edit({ path: args.path, edits: args.edits, expectedRevision: args.expectedRevision })),
  vault_properties: async (archive, args) => written(await archive.setProperties({ path: args.path, set: args.set ?? {}, remove: args.remove ?? [], expectedRevision: args.expectedRevision })),
  vault_move: (archive, args) => archive.move({ moves: args.moves }),
  async vault_merge(archive, args) { const { document: _document, ...receipt } = await archive.merge({ into: args.into, from: args.from }); return receipt; },
});

/** The vault surface: CAIRN's archive and what its documents say, read and written. */
export const vaultMcpTools = Object.freeze(VAULT_TOOL_DESCRIPTORS.map((descriptor) => Object.freeze({
  ...descriptor,
  ...(WRITES.has(descriptor.name) ? { visible: (context) => context?.canWrite !== false } : {}),
  handler: async (args, context) => RUN[descriptor.name](await archiveOf(context), args),
})));

/** One vault tool called directly over an archive, as its CallToolResult. */
export async function callVaultMcpTool(archive, name, args = {}) {
  if (RUN[name] === undefined) throw new Error(`unknown vault MCP tool: ${name}`);
  const value = await RUN[name](archive, args);
  return Object.freeze({ content: Object.freeze([{ type: "text", text: JSON.stringify(value, null, 2) }]), structuredContent: value });
}

/**
 * The search-and-fetch pair: `search` answers a query with ranked documents ({id, title, url}),
 * `fetch` returns one document's full text by id. The id is the vault path; `documentUrl(path)`
 * names where a reader can open it.
 */
export function searchAndFetchTools({ documentUrl = () => undefined } = {}) {
  const url = (path) => documentUrl(path) ?? undefined;
  return Object.freeze([
    Object.freeze({
      name: "search",
      title: "Search the knowledge garden",
      description: "Search every document by its text, titles and headings. Returns the best-matching documents, each with an id to pass to fetch, its title, a URL and a snippet.",
      inputSchema: objectSchema({ query: { type: "string", description: "Words or \"a quoted phrase\" to look for." } }, ["query"]),
      annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true, openWorldHint: false }),
      handler: async ({ query }, context) => {
        const archive = await archiveOf(context);
        const seen = new Map();
        for (const hit of await archive.search(query, { mode: "text", limit: 60 })) {
          if (!seen.has(hit.path)) seen.set(hit.path, { id: hit.path, title: hit.title ?? hit.path, ...(url(hit.path) === undefined ? {} : { url: url(hit.path) }), text: hit.evidence?.[0] ?? hit.heading ?? "" });
          if (seen.size === 20) break;
        }
        return { results: [...seen.values()] };
      },
    }),
    Object.freeze({
      name: "fetch",
      title: "Read one document",
      description: "Read one document in full by the id search returned: its title, Markdown text, URL and metadata.",
      inputSchema: objectSchema({ id: { type: "string", description: "A document id from search (its path in the garden)." } }, ["id"]),
      annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true, openWorldHint: false }),
      handler: async ({ id }, context) => {
        const document = await (await archiveOf(context)).read(id);
        return { id, title: document.title ?? id, text: document.markdown ?? document.body ?? "", ...(url(id) === undefined ? {} : { url: url(id) }), metadata: { revision: document.revision ?? null, description: document.description ?? null, keywords: document.keywords ?? [], aliases: document.aliases ?? [] } };
      },
    }),
  ]);
}

/**
 * Every note as an MCP resource: \`<scheme>://notes/{path}\` (the path URL-encoded) reads the note's
 * Markdown. \`documentUrl(path)\` names where a reader can open it.
 */
export function noteResourceTemplates({ scheme = "vault", title = "Notes", documentUrl = () => undefined } = {}) {
  return Object.freeze([Object.freeze({
    uriTemplate: `${scheme}://notes/{path}`,
    name: "note",
    title,
    description: "One note by its path in the garden (URL-encoded), as Markdown.",
    mimeType: "text/markdown",
    read: async (_uri, { path }, context) => {
      const archive = await archiveOf(context);
      const document = await archive.read(path);
      const url = documentUrl(path);
      return { mimeType: "text/markdown", text: document.markdown ?? document.body ?? "", ...(url === undefined ? {} : { _meta: { url } }) };
    },
  })]);
}

/** Prompts over the garden: explain one note, find what a topic lacks, and connect two notes. */
export function gardenPrompts() {
  const user = (text) => ({ role: "user", content: { type: "text", text } });
  return Object.freeze([
    Object.freeze({
      name: "explain-note",
      title: "Explain a note",
      description: "Read one note and explain it plainly, with what it links to and what links to it.",
      arguments: [{ name: "path", description: "The note's path (from search)", required: true }],
      get: ({ path }) => [user(`Read the note at "${path}" with fetch, then its relations with vault_relations (as subject and as object). Explain what the note says in plain words, what it depends on, and what depends on it. Quote the note where it matters.`)],
    }),
    Object.freeze({
      name: "find-gaps",
      title: "Find what a topic lacks",
      description: "Survey one topic across the garden and say what is missing, duplicated or unconnected.",
      arguments: [{ name: "topic", description: "A term or name", required: true }],
      get: ({ topic }) => [user(`Use vault_topic on "${topic}", then vault_readings and vault_mentions for the documents it names. Report: whether the topic has one home, where it is written more than once, which mentions are not yet links, and what the garden asks about it without answering (vault_questions). End with the three changes that would help most.`)],
    }),
    Object.freeze({
      name: "connect-notes",
      title: "Connect two notes",
      description: "Find how two notes relate, directly or through others.",
      arguments: [{ name: "from", description: "One note's path", required: true }, { name: "to", description: "The other note's path", required: true }],
      get: ({ from, to }) => [user(`Read "${from}" and "${to}" with fetch. Use vault_relations and vault_similar on each to find what they share: links, keywords, overlapping text, or notes between them. Describe the connection, and say whether a direct link between them is owed.`)],
    }),
  ]);
}
