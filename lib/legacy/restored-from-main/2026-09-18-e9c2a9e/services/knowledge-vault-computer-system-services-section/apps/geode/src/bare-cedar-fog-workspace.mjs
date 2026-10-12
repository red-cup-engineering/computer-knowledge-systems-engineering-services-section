import { basename, extname, posix } from "node:path";
import { readMarkdownFile } from "@red-cup-engineering/read-markdown-file-service";
import { readMarkdownFrontmatter } from "@red-cup-engineering/read-markdown-frontmatter-service";
import { renderMarkdownBlockHtml } from "@red-cup-engineering/render-markdown-block-html-service";
import { markdownFileRevision, writeMarkdownFile } from "@red-cup-engineering/write-markdown-file-service";
import { buildPathAliasIndex, deriveBacklinks, deriveDocumentEdges } from "./repository-graph.mjs";
import { createConceptIndex } from "./concept-index.mjs";

const DEFAULT_SEARCH_LIMIT = 50;

function collectionsFrom(census) {
  return Object.freeze(census.vaults.map((vault) => Object.freeze({
    id: vault.id,
    region: vault.region,
    description: vault.description,
    documents: vault.documents,
    generations: vault.generations,
  })));
}

/**
 * The repository-scale graph is derived per document, so no whole-vault edge total exists to
 * report. Nodes are known exactly — every admitted carrier is one. Counts that would require
 * parsing the whole corpus are reported as null rather than as zero, which would read as
 * "this vault has no links."
 */
function scaleGraph(census) {
  return Object.freeze({
    nodes: Object.freeze(Array.from({ length: census.totals.documents })),
    edges: null,
    externalUrls: Object.freeze([]),
    backlinks: Object.freeze({}),
    diagnostics: Object.freeze({ dangling: null, ambiguous: null }),
    derivation: "per-document",
  });
}

function snapshotFrom(census) {
  return Object.freeze({
    type: "GeodeWorkspaceSnapshot",
    schemaVersion: "geode-workspace/v1",
    observedAt: new Date().toISOString(),
    region: "",
    excludes: Object.freeze([".git", "node_modules"]),
    scanned: census.totals.documents,
    excluded: 0,
    available: census.totals.documents,
    truncated: false,
    documents: Object.freeze([]),
    graph: scaleGraph(census),
    profile: "bare-cedar-fog",
    collections: collectionsFrom(census),
    repository: Object.freeze({
      generations: census.totals.generations,
      extensions: census.totals.extensions,
      diagnostics: census.diagnostics,
      supplier: census.supplier,
    }),
  });
}

function titleFor(path, frontmatter, body) {
  const declared = [frontmatter?.title, frontmatter?.name, frontmatter?.id]
    .find((value) => typeof value === "string" && value.trim() !== "");
  if (declared) return declared.trim();
  const heading = body.match(/^#{1,6}[ \t]+(.+)$/mu)?.[1]?.trim();
  return heading || basename(path, extname(path));
}

function searchCards(matches) {
  const cards = new Map();
  for (const match of matches) {
    let card = cards.get(match.path);
    if (!card) {
      const headingTitle = match.text.match(/^\s*#{1,6}\s+(.+?)\s*$/u)?.[1];
      card = {
        path: match.path,
        title: headingTitle || basename(match.path, extname(match.path)),
        aliases: [], keywords: [], headings: [], properties: {}, incoming: 0, outgoing: 0,
        vaultId: match.vaultId,
        collection: match.vaultId,
        generation: match.generation,
        line: match.line,
        evidence: [],
      };
      cards.set(match.path, card);
    }
    if (card.evidence.length < 3) card.evidence.push(`line ${match.line}: ${match.text.trim()}`);
  }
  return Object.freeze([...cards.values()].map((card) => Object.freeze({
    ...card,
    aliases: Object.freeze(card.aliases),
    keywords: Object.freeze(card.keywords),
    headings: Object.freeze(card.headings),
    properties: Object.freeze(card.properties),
    evidence: Object.freeze(card.evidence),
  })));
}

/** Repository-relative browse prefix, refusing absolute paths and root escapes. */
function normalizeBrowsePrefix(value) {
  if (typeof value !== "string") throw new TypeError("prefix must be a string");
  if (value === "") return "";
  const normalized = posix.normalize(value.replace(/^\.\//u, "")).replace(/\/$/u, "");
  if (normalized === "." || normalized === "") return "";
  if (posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw new RangeError("browse prefix escapes root");
  }
  return normalized;
}

/**
 * Extend `run` for as long as every remaining path descends through one shared segment.
 * Stops at the first divergence, and at any level holding a document, so a collapsed run
 * always ends where a real choice begins.
 */
function collapseSingleChildRun(run, remainders) {
  const segments = [...run];
  let current = remainders;
  for (;;) {
    if (current.length === 0) return segments;
    let shared = null;
    for (const remainder of current) {
      const slash = remainder.indexOf("/");
      if (slash < 0) return segments;
      const segment = remainder.slice(0, slash);
      if (shared === null) shared = segment;
      else if (shared !== segment) return segments;
    }
    segments.push(shared);
    current = current.map((remainder) => remainder.slice(shared.length + 1));
  }
}

/** Repository-scale Geode workspace: census and search eagerly, carriers only on demand. */
export async function createBareCedarFogWorkspace({
  root,
  services,
  policy,
  policyPath,
  command,
  vaultRoot = "",
  searchLimit = DEFAULT_SEARCH_LIMIT,
} = {}) {
  if (typeof root !== "string" || root.trim() === "") throw new TypeError("root is required");
  const admittedVaultRoot = normalizeBrowsePrefix(vaultRoot);
  if (!Number.isSafeInteger(searchLimit) || searchLimit < 1 || searchLimit > 500) {
    throw new TypeError("searchLimit must be an integer from 1 through 500");
  }
  if (!services) throw new TypeError("services are required");
  const bcf = services;
  let snapshot;
  let admittedPaths = new Map();
  let aliasIndex = new Map();
  // Concepts are read from every carrier's frontmatter, which is far too slow to pay for at
  // startup. The index builds when something first asks for a concept.
  const concepts = createConceptIndex({ root, paths: () => [...admittedPaths.keys()] });
  let writeTail = Promise.resolve();

  const serviceOptions = {
    root,
    ...(policy === undefined ? {} : { policy }),
    ...(policyPath === undefined ? {} : { policyPath }),
    ...(command === undefined ? {} : { command }),
  };

  async function refresh() {
    const census = await bcf.observeBareCedarFogMarkdownVaults({ ...serviceOptions, includePaths: true });
    admittedPaths = new Map(census.vaults.flatMap((vault) => (vault.paths ?? []).map((path) => [path, vault.id])));
    aliasIndex = buildPathAliasIndex(admittedPaths.keys());
    concepts.invalidate();
    snapshot = snapshotFrom(census);
    return snapshot;
  }

  function admit(path) {
    if (typeof path !== "string" || path === "") throw new TypeError("path is required");
    const vaultId = admittedPaths.get(path);
    if (!vaultId) throw new RangeError(`unknown Bare Cedar Fog document: ${path}`);
    return Object.freeze({ path, vaultId });
  }

  async function read(path) {
    const admission = admit(path);
    const markdown = await readMarkdownFile({ root, path });
    let reading = { frontmatter: null, body: markdown };
    try { reading = readMarkdownFrontmatter(markdown); } catch { /* Malformed frontmatter remains source. */ }
    return Object.freeze({
      type: "GeodeDocumentReading",
      path,
      title: titleFor(path, reading.frontmatter, reading.body),
      properties: Object.freeze({ ...(reading.frontmatter ?? {}) }),
      relationKeys: Object.freeze([]),
      markdown,
      revision: markdownFileRevision(markdown),
      body: reading.body,
      html: renderMarkdownBlockHtml(reading.body),
      outgoing: (await deriveDocumentEdges({ root, path, index: aliasIndex })).edges,
      // Backlinks cost a bounded vault search and are served on demand, so opening a
      // document stays a single-file read no matter how large the repository is.
      backlinks: Object.freeze([]),
      backlinksDeferred: true,
      repository: Object.freeze({ vaultId: admission.vaultId }),
    });
  }

  async function search(query, { limit = searchLimit, vaultIds, generation } = {}) {
    if (typeof query !== "string") throw new TypeError("query must be a string");
    if (query.trim() === "") return Object.freeze([]);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > searchLimit) {
      throw new RangeError(`search limit exceeds configured bound of ${searchLimit}`);
    }
    const result = await bcf.searchBareCedarFogMarkdownVaults({
      ...serviceOptions,
      query,
      limit,
      ...(vaultIds === undefined ? {} : { vaultIds }),
      ...(generation === undefined ? {} : { generation }),
    });
    return searchCards(result.matches);
  }

  /** Backlinks to one document, proven by re-deriving each candidate source's edges. */
  async function backlinks(path, { documentLimit = 40 } = {}) {
    admit(path);
    return deriveBacklinks({
      root,
      path,
      index: aliasIndex,
      documentLimit,
      search: (options) => bcf.searchBareCedarFogMarkdownVaults({ ...serviceOptions, ...options }),
    });
  }

  function browse(prefix = "", { limit = 300, compress = true } = {}) {
    if (typeof prefix !== "string") throw new TypeError("prefix must be a string");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) throw new TypeError("invalid browse limit");
    const requested = prefix === "" ? admittedVaultRoot : normalizeBrowsePrefix(prefix);
    if (admittedVaultRoot && requested !== admittedVaultRoot && !requested.startsWith(`${admittedVaultRoot}/`)) {
      throw new RangeError("browse prefix escapes the vault root");
    }
    // Bucket every admitted path by its first segment below `requested`. Files list directly;
    // directories keep their remainders so a single-child run can be collapsed into one item.
    const directories = new Map();
    const files = [];
    const start = requested ? `${requested}/` : "";
    for (const [path, vaultId] of admittedPaths) {
      if (start && !path.startsWith(start)) continue;
      const remainder = start ? path.slice(start.length) : path;
      const slash = remainder.indexOf("/");
      if (slash < 0) {
        files.push({ kind: "document", path, name: basename(path), vaultId });
        continue;
      }
      const name = remainder.slice(0, slash);
      const bucket = directories.get(name);
      if (bucket) bucket.push(remainder.slice(slash + 1));
      else directories.set(name, [remainder.slice(slash + 1)]);
    }
    const items = [
      ...[...directories.entries()]
        .map(([name, remainders]) => {
          // A directory holding exactly one child, whose child holds exactly one child, and so on,
          // costs a click per level while carrying no choice. Collapse the run into a single item.
          // The proof path is preserved verbatim in `path`; only the number of clicks changes.
          const run = compress ? collapseSingleChildRun([name], remainders) : [name];
          const directoryPath = requested ? `${requested}/${run.join("/")}` : run.join("/");
          return {
            kind: "directory",
            path: directoryPath,
            name: run.join("/"),
            segments: run.length,
            count: remainders.length,
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name)),
      ...files.sort((left, right) => left.name.localeCompare(right.name)),
    ];
    return Object.freeze({
      type: "GeodeDirectoryListing",
      prefix: requested,
      vaultRoot: admittedVaultRoot,
      total: items.length,
      truncated: items.length > limit,
      items: Object.freeze(items.slice(0, limit).map((item) => Object.freeze(item))),
    });
  }

  async function replace(options = {}) {
    admit(options.path);
    const run = writeTail.then(async () => {
      const write = await writeMarkdownFile({
        root,
        path: options.path,
        text: options.markdown,
        mode: "replace",
        normalization: "preserve",
        expectedRevision: options.expectedRevision,
      });
      const document = await read(options.path);
      return Object.freeze({
        type: "GeodeMarkdownWriteReceipt",
        schemaVersion: "geode-markdown-write/v1",
        path: options.path,
        previousRevision: write.previousRevision,
        revision: write.revision,
        changed: write.changed,
        bytes: write.bytes,
        document,
      });
    });
    writeTail = run.catch(() => {});
    return run;
  }

  await refresh();
  return Object.freeze({
    get snapshot() { return snapshot; },
    admit,
    backlinks,
    browse,
    concept(name) { return concepts.concept(name); },
    conceptSummary() { return concepts.summary(); },
    get conceptsReady() { return concepts.ready; },
    read,
    replace,
    refresh,
    search,
  });
}
