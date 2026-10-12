import path from "node:path";

import {
  htmlRepr,
  jsonRepr,
  readMultipartBody,
  textRepr,
  type App,
  type Context,
} from "@emsenn/http-server";

import {
  knowledgeVaultPathAllowed,
  normalizeKnowledgeVaultPath,
} from "@emsenn/organizing-a-knowledge-vault/corpus";

import {
  collectKnowledgeVaultMarkdownPaths,
  createCorpusClientForRoot,
  grepKnowledgeVaultText,
  knowledgeVaultBacklinkQueries,
  knowledgeVaultConceptMap,
  knowledgeVaultHealth,
  corpusCatalog,
  corpusFacet,
  popularCorpusDocuments,
  relatedCorpusDocuments,
  searchCorpusCatalogView,
  compareCorpusDocumentsByTitle,
  directoryGraphSvg,
  listKnowledgeVaultPath,
  readKnowledgeVaultDocument,
  emsennContentRoot,
  uploadTriageFiles,
  type DirectoryGraphEdge,
  type DirectoryGraphNode,
  type GrepTextHit,
  type GrepTextResult,
  type CorpusCatalogView,
  type CorpusCatalogDocument,
  type CorpusCatalogGroup,
  type CorpusFacetKind,
  type ListPathEntry,
  type ListPathResult,
  type ReadResult,
  type UploadTriageFileInput,
} from "../organizing-with-a-knowledge-vault/index.mts";

const ROOT_PATH = "";
const TRIAGE_PATH = "_triage";
const CATALOG_CACHE_MS = 300_000;
const CATALOG_MAX_SCAN = 5_000;
const FACET_DOCUMENT_LIMIT = 250;
const TRIAGE_FILE_LIMIT = 40;
const TRIAGE_DIRECTORY_LIMIT = 200;
const PUBLIC_ORIGIN = "https://research.emsenn.net";
let catalogCache: Readonly<{ root: string; expires: number; catalog: CorpusCatalogView }> | null = null;
let catalogWarmup: Promise<CorpusCatalogView> | null = null;

export type KnowledgeVaultWebUxOptions = Readonly<{
  root?: string;
}>;

export function createKnowledgeVaultWebUx(options: KnowledgeVaultWebUxOptions = {}): App {
  const root = options.root ?? emsennContentRoot();
  void cachedCorpusCatalogView(root).catch(() => undefined);
  return Object.freeze({
    resources: Object.freeze([
      {
        id: "research-library.home",
        route: "/",
        match: "/",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async () => {
          const model = await homeModel(root);
          return htmlRepr(layout({
            title: "research.emsenn.net",
            current: "home",
            body: renderHome(model),
          }));
        },
      },
      {
        id: "research-library.browse",
        route: "/library",
        match: "/library",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async (ctx: Context) => {
          const requested = cleanPath(ctx.url.searchParams.get("path") ?? ROOT_PATH) || ROOT_PATH;
          const model = await browseModel(root, requested);
          return htmlRepr(layout({
            title: titleForPath(requested),
            current: "browse",
            body: renderBrowse(model),
          }));
        },
      },
      {
        id: "research-library.search",
        route: "/search",
        match: "/search",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async (ctx: Context) => {
          const q = (ctx.url.searchParams.get("q") ?? "").trim();
          const scope = cleanPath(ctx.url.searchParams.get("path") ?? ROOT_PATH) || ROOT_PATH;
          const result = await searchModel(root, q, scope);
          return htmlRepr(layout({
            title: q.length > 0 ? `Search: ${q}` : "Search",
            current: "search",
            body: renderSearch(q, scope, result),
          }));
        },
      },
      {
        id: "research-library.concept",
        route: "/concept",
        match: "/concept",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async (ctx: Context) => {
          const q = (ctx.url.searchParams.get("q") ?? ctx.url.searchParams.get("topic") ?? "").trim();
          const scope = cleanPath(ctx.url.searchParams.get("path") ?? ROOT_PATH) || ROOT_PATH;
          const result = await conceptModel(root, q, scope);
          return htmlRepr(layout({
            title: q.length > 0 ? `Concept: ${q}` : "Concept",
            current: "concept",
            body: renderConcept(result),
          }));
        },
      },
      {
        id: "research-library.reader",
        route: "/read",
        match: "/read",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async (ctx: Context) => {
          const requested = cleanPath(ctx.url.searchParams.get("path") ?? "");
          if (requested.length === 0) return textRepr("path is required", { status: 400, type: "text/plain; charset=utf-8" });
          const document = await readKnowledgeVaultDocument({ root, path: requested });
          const parent = parentDir(document.path);
          const [catalog, backlinks, siblings] = await Promise.all([
            cachedCorpusCatalogView(root),
            backlinkHits(root, document),
            listKnowledgeVaultPath({ root, path: parent.length > 0 ? parent : ROOT_PATH, limit: 500 }).catch(() => null),
          ]);
          return htmlRepr(layout({
            title: document.title,
            current: "read",
            body: renderRead(document, relatedCorpusDocuments(document, catalog), backlinks, siblings?.entries ?? []),
          }));
        },
      },
      {
        id: "research-library.random",
        route: "/random",
        match: "/random",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async () => {
          const catalog = await cachedCorpusCatalogView(root);
          if (catalog.documents.length === 0) return textRepr("no library files found", { status: 404, type: "text/plain; charset=utf-8" });
          const selected = catalog.documents[Math.floor(Math.random() * catalog.documents.length)]!;
          return htmlRepr(redirectPage(selected.path));
        },
      },
      {
        id: "research-library.titles",
        route: "/titles",
        match: "/titles",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async () => {
          const catalog = await cachedCorpusCatalogView(root);
          return htmlRepr(layout({
            title: "Titles",
            current: "titles",
            body: renderTitles(catalog.documents),
          }));
        },
      },
      {
        id: "research-library.authors",
        route: "/authors",
        match: "/authors",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async () => {
          const catalog = await cachedCorpusCatalogView(root);
          return htmlRepr(layout({
            title: "Authors",
            current: "authors",
            body: renderAuthors(catalog.authors),
          }));
        },
      },
      {
        id: "research-library.author",
        route: "/author",
        match: "/author",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async (ctx: Context) => {
          const name = (ctx.url.searchParams.get("name") ?? ctx.url.searchParams.get("q") ?? "").trim();
          const model = await facetModel(root, "author", name);
          return htmlRepr(layout({
            title: model.name.length > 0 ? `Author: ${model.name}` : "Author",
            current: "authors",
            body: renderFacet(model),
          }));
        },
      },
      {
        id: "research-library.topics",
        route: "/topics",
        match: "/topics",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async () => {
          const catalog = await cachedCorpusCatalogView(root);
          return htmlRepr(layout({
            title: "Topics",
            current: "topics",
            body: renderTopics(catalog.topics),
          }));
        },
      },
      {
        id: "research-library.topic",
        route: "/topic",
        match: "/topic",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async (ctx: Context) => {
          const name = (ctx.url.searchParams.get("name") ?? ctx.url.searchParams.get("q") ?? "").trim();
          const model = await facetModel(root, "topic", name);
          return htmlRepr(layout({
            title: model.name.length > 0 ? `Topic: ${model.name}` : "Topic",
            current: "topics",
            body: renderFacet(model),
          }));
        },
      },
      {
        id: "research-library.latest",
        route: "/latest",
        match: "/latest",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async () => {
          const catalog = await cachedCorpusCatalogView(root);
          return htmlRepr(layout({
            title: "Latest entries",
            current: "latest",
            body: renderCatalogList("Latest entries", "Recently modified library texts.", catalog.latest),
          }));
        },
      },
      {
        id: "research-library.popular",
        route: "/popular",
        match: "/popular",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async () => {
          const catalog = await cachedCorpusCatalogView(root);
          const popular = popularCorpusDocuments(catalog);
          return htmlRepr(layout({
            title: "Popular texts",
            current: "popular",
            body: renderCatalogList(
              "Popular texts",
              "High-signal texts ranked by document size and catalog metadata. This is a deterministic corpus ranking, not reader tracking.",
              popular,
            ),
          }));
        },
      },
      {
        id: "research-library.add",
        route: "/add",
        match: "/add",
        methods: ["GET"],
        produces: ["text/html"],
        handler: () => htmlRepr(layout({
          title: "Add a new text",
          current: "add",
          body: renderAddText(),
        })),
      },
      {
        id: "research-library.upload-triage-file.multipart",
        route: "/scripts/upload-triage-file",
        match: (pathname: string, ctx: Context) => {
          if (pathname !== "/scripts/upload-triage-file" || ctx.req.method !== "POST") return false;
          return isMultipartRequest(ctx) ? {} : false;
        },
        methods: ["POST"],
        produces: ["application/json"],
        handler: async (ctx: Context) => {
          try {
            const form = await readMultipartBody(ctx.req, { maxBytes: 20_000_000 });
            const inputs = uploadInputsFromMultipart(form);
            const result = await uploadTriageFiles(inputs, new Date(), root);
            return jsonRepr(result);
          } catch (error: unknown) {
            return jsonRepr({ error: error instanceof Error ? error.message : String(error) }, 400);
          }
        },
      },
      {
        id: "research-library.triage",
        route: "/triage",
        match: "/triage",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async () => {
          const model = await triageModel(root);
          return htmlRepr(layout({
            title: "Triage intake",
            current: "triage",
            body: renderTriage(model),
          }));
        },
      },
      {
        id: "research-library.health",
        route: "/health",
        match: "/health",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async (ctx: Context) => {
          const requested = cleanPath(ctx.url.searchParams.get("path") ?? ROOT_PATH) || ROOT_PATH;
          const limit = ctx.url.searchParams.get("limit") ?? "24";
          const model = await healthModel(root, requested, limit);
          return htmlRepr(layout({
            title: "Vault health",
            current: "health",
            body: renderHealth(model),
          }));
        },
      },
      {
        id: "research-library.feed",
        route: "/feed.xml",
        match: "/feed.xml",
        methods: ["GET"],
        produces: ["application/rss+xml"],
        handler: async () => {
          const catalog = await cachedCorpusCatalogView(root);
          return textRepr(renderRss(catalog.latest), { type: "application/rss+xml; charset=utf-8" });
        },
      },
      {
        id: "research-library.sitemap",
        route: "/sitemap.xml",
        match: "/sitemap.xml",
        methods: ["GET"],
        produces: ["application/xml"],
        handler: async () => {
          const catalog = await cachedCorpusCatalogView(root);
          return textRepr(renderSitemap(catalog), { type: "application/xml; charset=utf-8" });
        },
      },
      {
        id: "research-library.robots",
        route: "/robots.txt",
        match: "/robots.txt",
        methods: ["GET"],
        produces: ["text/plain"],
        handler: async () => textRepr(`User-agent: *
Allow: /
Sitemap: ${absoluteUrl("/sitemap.xml")}
`, { type: "text/plain; charset=utf-8" }),
      },
      {
        id: "research-library.admin",
        route: "/admin",
        match: "/admin",
        methods: ["GET"],
        produces: ["text/html"],
        handler: async () => {
          const model = await adminModel(root);
          return htmlRepr(layout({
            title: "Owner workbench",
            current: "admin",
            body: renderAdmin(model),
          }));
        },
      },
    ]),
  });
}

function isMultipartRequest(ctx: Context): boolean {
  const raw = ctx.req.headers["content-type"];
  const contentType = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  return contentType.toLowerCase().startsWith("multipart/form-data");
}

function uploadInputsFromMultipart(
  form: Awaited<ReturnType<typeof readMultipartBody>>,
): readonly UploadTriageFileInput[] {
  const inputs: UploadTriageFileInput[] = [];
  for (const part of form.parts) {
    if (part.name === "content" && part.data.length > 0) {
      inputs.push({ content: part.data });
    }
  }
  for (const part of form.parts) {
    if ((part.name === "files" || part.name === "file") && part.filename !== undefined && part.data.length > 0) {
      inputs.push({ content: part.data, filename: part.filename });
    }
  }
  return Object.freeze(inputs);
}

type HomeModel = Readonly<{
  roots: readonly ListPathEntry[];
  total: number;
  scanned: number;
  truncated: boolean;
  authorGroups: number;
  topicGroups: number;
  latest: readonly CorpusCatalogDocument[];
  authors: readonly CorpusCatalogGroup[];
  topics: readonly CorpusCatalogGroup[];
}>;

type SearchModel = Readonly<{
  query: string;
  path: string;
  catalogMatches: readonly CorpusCatalogDocument[];
  text: GrepTextResult;
}>;

type FacetModel = Readonly<{
  kind: CorpusFacetKind;
  name: string;
  group: CorpusCatalogGroup | null;
  documents: readonly CorpusCatalogDocument[];
  matchedCount: number;
  similar: readonly CorpusCatalogGroup[];
  total: number;
  scanned: number;
  truncated: boolean;
}>;

type BrowseModel = Readonly<{
  path: string;
  listing: ListPathResult;
  catalog: CorpusCatalogView;
  directories: readonly ListPathEntry[];
  immediateDocuments: readonly CorpusCatalogDocument[];
  latest: readonly CorpusCatalogDocument[];
  authors: readonly CorpusCatalogGroup[];
  topics: readonly CorpusCatalogGroup[];
}>;

type ConceptModel = Readonly<{
  query: string;
  path: string;
  result: unknown;
  error: string;
}>;

type TriageFile = Readonly<{
  path: string;
  title: string;
  preview: string;
  bytes: number;
  format: string;
}>;

type TriageModel = Readonly<{
  path: string;
  files: readonly TriageFile[];
  directoriesVisited: number;
  truncated: boolean;
  error: string;
}>;

type AdminModel = Readonly<{
  total: number;
  scanned: number;
  truncated: boolean;
  authorGroups: number;
  topicGroups: number;
  latest: readonly CorpusCatalogDocument[];
  popular: readonly CorpusCatalogDocument[];
  triage: TriageModel;
}>;

type HealthModel = Readonly<{
  path: string;
  limit: number;
  result: unknown;
  error: string;
}>;

type BacklinkHit = Readonly<{
  path: string;
  line: number;
  context: string;
  query: string;
}>;

type TocEntry = Readonly<{
  level: number;
  title: string;
  id: string;
}>;

async function homeModel(root: string): Promise<HomeModel> {
  const [library, catalog] = await Promise.all([
    listKnowledgeVaultPath({ root, path: ROOT_PATH, limit: 200 }),
    cachedCorpusCatalogView(root),
  ]);
  return Object.freeze({
    roots: Object.freeze(library.entries.filter((entry) => entry.kind === "directory")),
    total: catalog.total,
    scanned: catalog.scanned,
    truncated: catalog.truncated,
    authorGroups: catalog.authors.length,
    topicGroups: catalog.topics.length,
    latest: Object.freeze(catalog.latest.slice(0, 12)),
    authors: Object.freeze(catalog.authors.slice(0, 12)),
    topics: Object.freeze(catalog.topics.slice(0, 18)),
  });
}

async function browseModel(root: string, requested: string): Promise<BrowseModel> {
  const [listing, catalog] = await Promise.all([
    listKnowledgeVaultPath({ root, path: requested, limit: 500 }),
    corpusCatalog({ root, path: requested, limit: 500, maxScan: 2_000 }),
  ]);
  const documentsByPath = new Map(catalog.documents.map((document) => [document.path, document]));
  return Object.freeze({
    path: requested,
    listing,
    catalog,
    directories: Object.freeze(listing.entries.filter((entry) => entry.kind === "directory")),
    immediateDocuments: Object.freeze(listing.entries.flatMap((entry) => {
      if (entry.kind !== "file" || !entry.path.endsWith(".md")) return [];
      const document = documentsByPath.get(entry.path);
      return document === undefined ? [] : [document];
    })),
    latest: Object.freeze(catalog.latest.slice(0, 12)),
    authors: Object.freeze(catalog.authors.slice(0, 10)),
    topics: Object.freeze(catalog.topics.slice(0, 16)),
  });
}

async function facetModel(root: string, kind: CorpusFacetKind, name: string): Promise<FacetModel> {
  const facet = await corpusFacet({
    root,
    path: ROOT_PATH,
    kind,
    name,
    limit: FACET_DOCUMENT_LIMIT,
    maxScan: CATALOG_MAX_SCAN,
  });
  return Object.freeze({
    kind: facet.kind,
    name: facet.name,
    group: facet.group,
    documents: facet.documents,
    matchedCount: facet.matchedCount,
    similar: facet.similar,
    total: facet.total,
    scanned: facet.scanned,
    truncated: facet.truncated,
  });
}

async function conceptModel(root: string, query: string, scope: string): Promise<ConceptModel> {
  if (query.length < 2) return Object.freeze({ query, path: scope, result: null, error: "" });
  try {
  const client = createCorpusClientForRoot(root);
    const result = await knowledgeVaultConceptMap({ topic: query, path: scope, limit: 24, documents: 16 }, client);
    return Object.freeze({ query, path: scope, result, error: "" });
  } catch (error: unknown) {
    return Object.freeze({
      query,
      path: scope,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function triageModel(root: string): Promise<TriageModel> {
  try {
    const collected = await collectKnowledgeVaultMarkdownPaths({
      root,
      path: TRIAGE_PATH,
      limit: 1_000,
      fileLimit: TRIAGE_FILE_LIMIT,
      directoryLimit: TRIAGE_DIRECTORY_LIMIT,
    });
    const files = await Promise.all(collected.paths.map(async (pathValue): Promise<TriageFile> => {
      const document = await readKnowledgeVaultDocument({ root, path: pathValue });
      return Object.freeze({
        path: document.path,
        title: document.title,
        preview: document.preview,
        bytes: document.bytes,
        format: document.format,
      });
    }));
    return Object.freeze({
      path: TRIAGE_PATH,
      files: Object.freeze(files),
      directoriesVisited: collected.directoriesVisited,
      truncated: collected.truncated,
      error: "",
    });
  } catch (error: unknown) {
    return Object.freeze({
      path: TRIAGE_PATH,
      files: Object.freeze([] as TriageFile[]),
      directoriesVisited: 0,
      truncated: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function adminModel(root: string): Promise<AdminModel> {
  const [catalog, triage] = await Promise.all([
    cachedCorpusCatalogView(root),
    triageModel(root),
  ]);
  return Object.freeze({
    total: catalog.total,
    scanned: catalog.scanned,
    truncated: catalog.truncated,
    authorGroups: catalog.authors.length,
    topicGroups: catalog.topics.length,
    latest: Object.freeze(catalog.latest.slice(0, 8)),
    popular: Object.freeze(popularCorpusDocuments(catalog, 8)),
    triage,
  });
}

async function healthModel(root: string, requestedPath: string, limitInput: string): Promise<HealthModel> {
  const limit = clampInteger(limitInput, 24, 1, 40);
  try {
  const client = createCorpusClientForRoot(root);
    const result = await knowledgeVaultHealth({ path: requestedPath, limit }, client);
    return Object.freeze({ path: requestedPath, limit, result, error: "" });
  } catch (error: unknown) {
    return Object.freeze({
      path: requestedPath,
      limit,
      result: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function searchModel(root: string, q: string, scope: string): Promise<SearchModel> {
  if (q.length === 0) {
    return Object.freeze({
      query: "",
      path: scope,
      catalogMatches: Object.freeze([]),
      text: emptyGrepResult(scope),
    });
  }
  const catalog = await cachedCorpusCatalogView(root);
  const catalogMatches = searchCorpusCatalogView(catalog, q, 50);
  const text = await grepKnowledgeVaultText({ root, q, path: scope, limit: 15, maxScan: 750 });
  return Object.freeze({
    query: q,
    path: scope,
    catalogMatches: Object.freeze(catalogMatches),
    text,
  });
}

function emptyGrepResult(scope: string): GrepTextResult {
  return Object.freeze({
    query: "",
    path: scope,
    filesScanned: 0,
    hits: Object.freeze([] as GrepTextHit[]),
    truncated: false,
    scanTruncated: false,
  });
}

async function cachedCorpusCatalogView(root: string): Promise<CorpusCatalogView> {
  const now = Date.now();
  if (catalogCache !== null && catalogCache.root === root && catalogCache.expires > now) return catalogCache.catalog;
  if (catalogWarmup !== null) return catalogWarmup;
  catalogWarmup = corpusCatalog({ root, path: ROOT_PATH, limit: 5_000, maxScan: CATALOG_MAX_SCAN })
    .then((catalog) => {
      catalogCache = Object.freeze({ root, expires: Date.now() + CATALOG_CACHE_MS, catalog });
      return catalog;
    })
    .finally(() => {
      catalogWarmup = null;
    });
  return catalogWarmup;
}

async function backlinkHits(root: string, document: ReadResult): Promise<readonly BacklinkHit[]> {
  const queries = knowledgeVaultBacklinkQueries(document);
  const seen = new Set<string>();
  const hits: BacklinkHit[] = [];
  for (const query of queries) {
    const result = await grepKnowledgeVaultText({ root, path: ROOT_PATH, q: query, limit: 12, maxScan: 2_000 }).catch(() => null);
    if (result === null) continue;
    for (const hit of result.hits) {
      if (hit.path === document.path) continue;
      const key = `${hit.path}:${hit.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(Object.freeze({ ...hit, query }));
      if (hits.length >= 12) return Object.freeze(hits);
    }
  }
  return Object.freeze(hits);
}

function renderHome(model: HomeModel): string {
  return `
<section class="hero">
  <div>
    <p class="kicker">Knowledge vault</p>
    <h1>research.emsenn.net</h1>
    <p class="lede">Search, browse, and read the emsenn.net personal knowledge vault from the same knowledge-vault surface that powers OpenAPI and MCP.</p>
  </div>
  <form class="searchbar" action="/search" method="get">
    <input name="q" type="search" placeholder="Search the library" autocomplete="off">
    <button type="submit">Search</button>
  </form>
</section>
<section class="catalog-strip" aria-label="Library summary">
  <a href="/titles"><strong>${formatCount(model.total)}</strong><span>texts cataloged</span></a>
  <a href="/authors"><strong>${formatCount(model.authorGroups)}</strong><span>author groups</span></a>
  <a href="/topics"><strong>${formatCount(model.topicGroups)}</strong><span>topic groups</span></a>
  <a href="/library?path="><strong>${formatCount(model.roots.length)}</strong><span>root paths</span></a>
</section>
${model.truncated ? `<p class="muted">Catalog scan stopped at ${formatCount(model.scanned)} files; use search or a narrower path for deeper retrieval.</p>` : ""}
<section>
  <div class="section-head">
    <h2>Topic Map</h2>
    <div class="link-row"><a href="/topics">All topics</a><a href="/popular">Popular texts</a><a href="/library?path=">Browse paths</a></div>
  </div>
  <div class="topic-grid">${model.topics.map(renderGroupChip).join("") || model.roots.map(renderRootChip).join("")}</div>
</section>
<section class="split-grid">
  <div>
    <div class="section-head">
      <h2>Authors</h2>
      <a href="/authors">Author index</a>
    </div>
    <div class="group-list compact">${model.authors.map(renderCompactAuthorGroup).join("") || "<p class=\"muted\">No authors found.</p>"}</div>
  </div>
  <div>
    <div class="section-head">
      <h2>Root Paths</h2>
      <a href="/library?path=">Directory browser</a>
    </div>
    <div class="group-list compact">${model.roots.slice(0, 12).map(renderCompactRoot).join("") || "<p class=\"muted\">No root paths found.</p>"}</div>
  </div>
</section>
<section>
  <div class="section-head">
    <h2>Latest entries</h2>
    <div class="link-row"><a href="/titles">Titles</a><a href="/authors">Authors</a><a href="/topics">Topics</a><a href="/latest">Latest</a><a href="/popular">Popular</a><a href="/random">Random</a><a href="/feed.xml">RSS</a><a href="/sitemap.xml">Sitemap</a><a href="/add">Add a new text</a></div>
  </div>
  <ul class="text-list">${model.latest.map(renderDocumentListItem).join("") || "<li><span>No entries found.</span></li>"}</ul>
</section>`;
}

function renderGroupChip(group: CorpusCatalogGroup): string {
  return `<a class="topic" href="${topicHref(group.name)}"><strong>${escapeHtml(group.name)}</strong><span>${group.count} texts</span></a>`;
}

function renderAuthorChip(group: CorpusCatalogGroup): string {
  return `<a class="topic" href="${authorHref(group.name)}"><strong>${escapeHtml(group.name)}</strong><span>${group.count} texts</span></a>`;
}

function renderRootChip(entry: ListPathEntry): string {
  return `<a class="topic" href="${browseHref(entry.path)}"><strong>${escapeHtml(titleForPath(entry.path))}</strong><span>${escapeHtml(entry.path)}</span></a>`;
}

function renderCompactGroup(group: CorpusCatalogGroup): string {
  return `<a class="compact-row" href="${topicHref(group.name)}"><span>${escapeHtml(group.name)}</span><strong>${group.count}</strong></a>`;
}

function renderCompactAuthorGroup(group: CorpusCatalogGroup): string {
  return `<a class="compact-row" href="${authorHref(group.name)}"><span>${escapeHtml(group.name)}</span><strong>${group.count}</strong></a>`;
}

function renderCompactRoot(entry: ListPathEntry): string {
  return `<a class="compact-row" href="${browseHref(entry.path)}"><span>${escapeHtml(titleForPath(entry.path))}</span><strong>${escapeHtml(entry.kind)}</strong></a>`;
}

function renderBrowse(model: BrowseModel): string {
  const listing = model.listing;
  return `
<section>
  ${breadcrumbs(listing.path)}
  <div class="section-head">
    <div>
      <p class="kicker">Library section</p>
      <h1>${escapeHtml(titleForPath(listing.path))}</h1>
      <p class="muted">${escapeHtml(listing.path)}${model.catalog.truncated ? ` · catalog scan stopped at ${formatCount(model.catalog.scanned)} files` : ""}</p>
    </div>
    <form class="inline-search" action="/search" method="get">
      <input type="hidden" name="path" value="${escapeAttr(listing.path)}">
      <input name="q" type="search" placeholder="Search here">
      <button type="submit">Search</button>
    </form>
  </div>
  <div class="reader-actions">
    <a href="${conceptHref(titleForPath(listing.path))}">Concept reading</a>
    <a href="/titles">All titles</a>
    <a href="/topics">All topics</a>
    <a href="/random">Random text</a>
  </div>
</section>
${renderDirectoryGraph(listing.path, "directory", listing.entries)}
<section class="catalog-strip" aria-label="Section summary">
  <a href="#texts"><strong>${formatCount(model.catalog.total)}</strong><span>texts in section</span></a>
  <a href="#directories"><strong>${formatCount(model.directories.length)}</strong><span>child sections</span></a>
  <a href="#topics"><strong>${formatCount(model.catalog.topics.length)}</strong><span>local topics</span></a>
  <a href="#authors"><strong>${formatCount(model.catalog.authors.length)}</strong><span>local author groups</span></a>
</section>
<section class="split-grid">
  <div id="directories">
    <div class="section-head">
      <h2>Child Sections</h2>
      <span class="muted">${formatCount(model.directories.length)} shown</span>
    </div>
    <div class="group-list compact">${model.directories.map(renderCompactRoot).join("") || "<p class=\"muted\">No child sections found.</p>"}</div>
  </div>
  <div id="topics">
    <div class="section-head">
      <h2>Local Topics</h2>
      <a href="/topics">Topic index</a>
    </div>
    <div class="group-list compact">${model.topics.map(renderCompactGroup).join("") || "<p class=\"muted\">No local topics found.</p>"}</div>
  </div>
</section>
<section id="texts" class="split-grid">
  <div>
    <div class="section-head">
      <h2>Direct Texts</h2>
      <span class="muted">${formatCount(model.immediateDocuments.length)} in this directory</span>
    </div>
    <ul class="text-list">${model.immediateDocuments.map(renderDocumentListItem).join("") || "<li><span>No Markdown texts directly in this section.</span></li>"}</ul>
  </div>
  <div>
    <div class="section-head">
      <h2>Recent in Section</h2>
      <a href="${searchHref(titleForPath(listing.path))}">Search title</a>
    </div>
    <ul class="text-list">${model.latest.map(renderDocumentListItem).join("") || "<li><span>No cataloged texts found in this section.</span></li>"}</ul>
  </div>
</section>
<section id="authors">
  <div class="section-head">
    <h2>Local Authors</h2>
    <a href="/authors">Author index</a>
  </div>
  <div class="group-list">${model.authors.map(renderAuthorGroup).join("") || "<p class=\"muted\">No local authors found.</p>"}</div>
</section>
<section>
  <div class="section-head">
    <h2>Raw Entries</h2>
    <a href="/scripts/list-path">List-path script</a>
  </div>
  <ul class="browser-list">${listing.entries.map(renderEntry).join("") || "<li><span>This directory is empty.</span></li>"}</ul>
</section>`;
}

function renderEntry(entry: ListPathEntry): string {
  const href = entry.kind === "directory" ? browseHref(entry.path) : readHref(entry.path);
  return `<li><a href="${href}">${entry.kind === "directory" ? "Directory" : "Text"} ${escapeHtml(titleForPath(entry.path))}</a><span>${escapeHtml(entry.path)}</span></li>`;
}

function renderSearch(
  q: string,
  scope: string,
  result: SearchModel,
): string {
  return `
<section>
  <h1>Search</h1>
  <form class="searchbar compact" action="/search" method="get">
    <input name="q" type="search" value="${escapeAttr(q)}" placeholder="Search the library" autocomplete="off">
    <input name="path" value="${escapeAttr(scope)}" aria-label="Search path">
    <button type="submit">Search</button>
  </form>
  ${q.length === 0 ? "<p class=\"muted\">Enter a query to search the corpus.</p>" : `<p class="muted">${result.catalogMatches.length} catalog matches and ${result.text.hits.length} text hits across ${result.text.filesScanned} scanned files.</p>`}
  ${result.catalogMatches.length === 0 ? "" : `
  <h2>Catalog matches</h2>
  <ul class="text-list">${result.catalogMatches.map(renderDocumentListItem).join("")}</ul>`}
  <h2>Text matches</h2>
  <ul class="search-results">${result.text.hits.map((hit) => `
    <li>
      <a href="${readHref(hit.path)}">${escapeHtml(titleForPath(hit.path))}</a>
      <p>${escapeHtml(hit.context)}</p>
      <span>${escapeHtml(hit.path)}:${hit.line}</span>
    </li>`).join("")}</ul>
</section>`;
}

function renderConcept(model: ConceptModel): string {
  const root = objectRecord(model.result);
  const dashboard = objectRecord(root?.["dashboard"]);
  const resources = objectRecord(root?.["resources"]);
  const admittedPaths = stringArray(dashboard?.["admittedPaths"]);
  const conceptHomes = recordArray(dashboard?.["conceptHomes"]);
  const gaps = stringArray(dashboard?.["gaps"]);
  const gapAxes = recordArray(dashboard?.["gapAxes"]);
  const evidence = recordArray(dashboard?.["sampleEvidence"]);
  const sourceDocuments = recordArray(resources?.["sourceDocuments"]);
  const suggestedActions = recordArray(dashboard?.["suggestedActions"]);
  const suggestedScaffolds = recordArray(dashboard?.["suggestedScaffolds"]);
  return `
<section>
  <h1>Concept Reading</h1>
  <form class="searchbar compact" action="/concept" method="get">
    <input name="q" type="search" value="${escapeAttr(model.query)}" placeholder="Concept or topic" autocomplete="off">
    <input name="path" value="${escapeAttr(model.path)}" aria-label="Concept path">
    <button type="submit">Read</button>
  </form>
  ${model.query.length < 2 ? "<p class=\"muted\">Enter a concept to inspect source evidence, concept homes, gaps, and suggested next operations.</p>" : ""}
  ${model.error.length > 0 ? `<p class="muted">No concept reading returned: ${escapeHtml(model.error)}</p>` : ""}
</section>
${root === undefined ? "" : `
<section>
  <p class="kicker">Bounded carrier reading</p>
  <h1>${escapeHtml(stringField(root, "topic") || model.query)}</h1>
  <div class="catalog-strip">
    <a href="#sources"><strong>${formatCount(admittedPaths.length)}</strong><span>admitted paths</span></a>
    <a href="#homes"><strong>${formatCount(conceptHomes.length)}</strong><span>concept homes</span></a>
    <a href="#gaps"><strong>${formatCount(gaps.length)}</strong><span>gaps</span></a>
    <a href="#evidence"><strong>${formatCount(evidence.length)}</strong><span>evidence hits</span></a>
  </div>
</section>
<section id="homes" class="split-grid">
  <div>
    <div class="section-head">
      <h2>Concept Homes</h2>
      <a href="${searchHref(model.query)}">Search text</a>
    </div>
    <ul class="text-list">${conceptHomes.map(renderPathFinding).join("") || "<li><span>No dedicated concept home found.</span></li>"}</ul>
  </div>
  <div id="gaps">
    <div class="section-head">
      <h2>Gap Axes</h2>
      <a href="/scripts/measure-gap">Script</a>
    </div>
    <ul class="axis-list">${gapAxes.map(renderGapAxis).join("") || "<li><span>No gap axes returned.</span></li>"}</ul>
  </div>
</section>
<section id="sources">
  <div class="section-head">
    <h2>Source Documents</h2>
    <a href="/scripts/concept-map">Script</a>
  </div>
  <ul class="text-list">${sourceDocuments.map(renderConceptResource).join("") || admittedPaths.map(renderPathOnly).join("") || "<li><span>No admitted paths returned.</span></li>"}</ul>
</section>
<section class="split-grid">
  <div>
    <h2>Gaps</h2>
    <ul class="text-list">${gaps.map((gap) => `<li><span>${escapeHtml(gap)}</span></li>`).join("") || "<li><span>No top-level gaps reported.</span></li>"}</ul>
  </div>
  <div>
    <h2>Suggested Operations</h2>
    <ul class="text-list">${suggestedActions.map(renderSuggestedAction).join("") || suggestedScaffolds.map(renderSuggestedScaffold).join("") || "<li><span>No suggested operations returned.</span></li>"}</ul>
  </div>
</section>
<section id="evidence">
  <div class="section-head">
    <h2>Sample Evidence</h2>
    <a href="${searchHref(model.query)}">Full search</a>
  </div>
  <ul class="search-results">${evidence.map(renderEvidenceHit).join("") || "<li><span>No evidence sample returned.</span></li>"}</ul>
</section>`}`;
}

function renderTriage(model: TriageModel): string {
  return `
<section>
  <p class="kicker">Owner workbench</p>
  <h1>Triage Intake</h1>
  <p class="lede">Recent raw material deposited into <code>${escapeHtml(model.path)}</code> by web, OpenAPI, or MCP clients.</p>
  <div class="reader-actions">
    <a href="/scripts/upload-triage-file">Upload</a>
    <a href="${browseHref(model.path)}">Browse tree</a>
    <a href="/scripts/nominate-placement">Nominate placement</a>
    <a href="/scripts/prepare-document">Prepare document</a>
  </div>
</section>
<section class="catalog-strip" aria-label="Triage summary">
  <a href="#files"><strong>${formatCount(model.files.length)}</strong><span>recent files</span></a>
  <a href="${browseHref(model.path)}"><strong>${formatCount(model.directoriesVisited)}</strong><span>directories visited</span></a>
  <a href="/scripts/upload-triage-file"><strong>1</strong><span>upload tool</span></a>
  <a href="/computer"><strong>HTTP</strong><span>script transport</span></a>
</section>
${model.error.length > 0 ? `<p class="muted">Could not read triage intake: ${escapeHtml(model.error)}</p>` : ""}
${model.truncated ? `<p class="muted">Triage intake is bounded to ${formatCount(TRIAGE_FILE_LIMIT)} files and ${formatCount(TRIAGE_DIRECTORY_LIMIT)} directories.</p>` : ""}
<section id="files">
  <div class="section-head">
    <h2>Recent Material</h2>
    <a href="${browseHref(model.path)}">Directory browser</a>
  </div>
  <ul class="text-list">${model.files.map(renderTriageFile).join("") || "<li><span>No triage markdown files found.</span></li>"}</ul>
</section>
<section>
  <h2>Placement nomination</h2>
  <pre class="triage-result" data-triage-action-result>Select a triage file to request a placement nomination.</pre>
</section>
<script>
(() => {
  const result = document.querySelector("[data-triage-action-result]");
  if (!result) return;
  document.addEventListener("click", async (event) => {
    const button = event.target && event.target.closest ? event.target.closest("[data-nominate-placement]") : null;
    if (!button) return;
    const path = button.getAttribute("data-nominate-placement") || "";
    if (path === "") return;
    result.textContent = "Nomination requested for " + path + "...";
    try {
      const response = await fetch("/scripts/nominate-placement", {
        method: "POST",
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify({ path }),
      });
      const text = await response.text();
      result.textContent = text || (response.ok ? "No nomination returned." : "Nomination failed.");
    } catch (error) {
      result.textContent = String(error && error.message ? error.message : error);
    }
  });
})();
</script>`;
}

function renderTriageFile(file: TriageFile): string {
  return `<li><a href="${readHref(file.path)}">${escapeHtml(file.title)}</a>${file.preview.length > 0 ? `<p>${escapeHtml(file.preview)}</p>` : ""}<span>${escapeHtml(file.format)} · ${formatCount(file.bytes)} bytes · ${escapeHtml(file.path)}</span><div class="reader-actions"><a href="${readHref(file.path)}">Read</a><button type="button" data-nominate-placement="${escapeAttr(file.path)}">Nominate placement</button></div></li>`;
}

function renderHealth(model: HealthModel): string {
  const root = objectRecord(model.result);
  const dashboard = objectRecord(root?.["dashboard"]);
  const source = objectRecord(root?.["source"]);
  const admittedPaths = stringArray(root?.["admittedPaths"]);
  const samples = objectRecord(dashboard?.["samples"]);
  const documents = numberField(dashboard, "documents");
  const withFrontmatter = numberField(dashboard, "withFrontMatter");
  const withoutFrontmatter = numberField(dashboard, "withoutFrontMatter");
  const withoutTitle = numberField(dashboard, "withoutUsableTitle");
  const withoutTags = Math.max(0, documents - numberField(dashboard, "withTags"));
  return `
<section>
  <p class="kicker">Owner workbench</p>
  <h1>Vault Health</h1>
  <form class="searchbar compact" action="/health" method="get">
    <input name="path" value="${escapeAttr(model.path)}" aria-label="Health path">
    <input name="limit" value="${escapeAttr(String(model.limit))}" inputmode="numeric" aria-label="Document limit">
    <button type="submit">Inspect</button>
  </form>
  <div class="reader-actions">
    <a href="/scripts/inspect-health">Script</a>
    <a href="/scripts/plan-normalization">Plan normalization</a>
    <a href="/scripts/normalize-corpus">Normalize corpus</a>
    <a href="${browseHref(model.path)}">Browse path</a>
  </div>
  ${model.error.length > 0 ? `<p class="muted">Health reading failed: ${escapeHtml(model.error)}</p>` : ""}
</section>
${root === undefined ? "" : `
<section class="catalog-strip" aria-label="Vault health summary">
  <a href="#admitted"><strong>${formatCount(documents)}</strong><span>documents sampled</span></a>
  <a href="#issues"><strong>${formatCount(withFrontmatter)}</strong><span>with frontmatter</span></a>
  <a href="#issues"><strong>${formatCount(withoutTitle)}</strong><span>missing titles</span></a>
  <a href="#issues"><strong>${formatCount(withoutTags)}</strong><span>missing tags</span></a>
</section>
<section class="split-grid">
  <div>
    <h2>Reading Scope</h2>
    <ul class="axis-list">
      <li><span>source</span><strong>${escapeHtml(stringField(source, "kind") || "sample")}</strong></li>
      <li><span>path</span><strong>${escapeHtml(stringField(source, "path") || model.path)}</strong></li>
      <li><span>limit</span><strong>${escapeHtml(String(source?.["limit"] ?? model.limit))}</strong></li>
      <li><span>without frontmatter</span><strong>${formatCount(withoutFrontmatter)}</strong></li>
    </ul>
  </div>
  <div id="issues">
    <h2>Issue Samples</h2>
    <ul class="text-list">
      ${renderSampleGroup("Unreadable frontmatter", stringArray(samples?.["unreadableFrontMatter"]))}
      ${renderSampleGroup("Without usable title", stringArray(samples?.["withoutUsableTitle"]))}
      ${renderSampleGroup("Without frontmatter", stringArray(samples?.["withoutFrontMatter"]))}
    </ul>
  </div>
</section>
<section id="admitted">
  <div class="section-head">
    <h2>Admitted Paths</h2>
    <a href="/scripts/read-file">Read script</a>
  </div>
  <ul class="text-list">${admittedPaths.map(renderPathOnly).join("") || "<li><span>No admitted paths returned.</span></li>"}</ul>
</section>`}`;
}

function renderSampleGroup(label: string, paths: readonly string[]): string {
  if (paths.length === 0) return `<li><span>${escapeHtml(label)}</span><span>None in this sample.</span></li>`;
  return paths.map((pathValue) => `<li><span>${escapeHtml(label)}</span><a href="${readHref(pathValue)}">${escapeHtml(pathValue)}</a></li>`).join("");
}

function renderPathFinding(value: Readonly<Record<string, unknown>>): string {
  const pathValue = stringField(value, "path");
  const title = stringField(value, "title") || titleForPath(pathValue);
  const role = stringField(value, "role");
  return `<li><a href="${readHref(pathValue)}">${escapeHtml(title)}</a><span>${escapeHtml([role, pathValue].filter(Boolean).join(" · "))}</span></li>`;
}

function renderGapAxis(value: Readonly<Record<string, unknown>>): string {
  const axis = stringField(value, "axis") || "axis";
  const status = stringField(value, "status") || "unknown";
  const count = Number(value["items"] ?? 0);
  return `<li><span>${escapeHtml(axis)}</span><strong>${escapeHtml(status)} · ${formatCount(Number.isFinite(count) ? count : 0)}</strong></li>`;
}

function renderConceptResource(value: Readonly<Record<string, unknown>>): string {
  const pathValue = stringField(value, "path");
  const title = stringField(value, "title") || titleForPath(pathValue);
  const role = stringField(value, "role");
  const kind = stringField(value, "kind");
  const description = stringField(value, "description");
  const tags = stringArray(value["tags"]).slice(0, 5).join(", ");
  return `<li><a href="${readHref(pathValue)}">${escapeHtml(title)}</a>${description.length > 0 ? `<p>${escapeHtml(description)}</p>` : ""}<span>${escapeHtml([role, kind, tags, pathValue].filter(Boolean).join(" · "))}</span></li>`;
}

function renderPathOnly(pathValue: string): string {
  return `<li><a href="${readHref(pathValue)}">${escapeHtml(titleForPath(pathValue))}</a><span>${escapeHtml(pathValue)}</span></li>`;
}

function renderSuggestedAction(value: Readonly<Record<string, unknown>>): string {
  const kind = stringField(value, "kind") || "operation";
  const reason = stringField(value, "reason");
  const payload = objectRecord(value["payload"]);
  const pathValue = stringField(payload, "path");
  return `<li><span>${escapeHtml(kind)}</span>${reason.length > 0 ? `<p>${escapeHtml(reason)}</p>` : ""}<span>${escapeHtml(pathValue)}</span></li>`;
}

function renderSuggestedScaffold(value: Readonly<Record<string, unknown>>): string {
  const title = stringField(value, "title") || "Scaffold";
  const pathValue = stringField(value, "path");
  const kind = stringField(value, "kind");
  return `<li><span>${escapeHtml(title)}</span><p>${escapeHtml(pathValue)}</p><span>${escapeHtml(kind)}</span></li>`;
}

function renderEvidenceHit(value: Readonly<Record<string, unknown>>): string {
  const pathValue = stringField(value, "path");
  const line = Number(value["line"] ?? value["lineNumber"] ?? 0);
  const text = stringField(value, "context") || stringField(value, "line");
  const suffix = Number.isFinite(line) && line > 0 ? `:${line}` : "";
  return `<li><a href="${readHref(pathValue)}">${escapeHtml(titleForPath(pathValue))}</a><p>${escapeHtml(text)}</p><span>${escapeHtml(pathValue)}${suffix}</span></li>`;
}

function renderFacet(model: FacetModel): string {
  const label = model.kind === "author" ? "Author" : "Topic";
  const indexHref = model.kind === "author" ? "/authors" : "/topics";
  const searchPlaceholder = model.kind === "author" ? "Author name" : "Topic or tag";
  const formAction = model.kind === "author" ? "/author" : "/topic";
  const conceptAction = model.kind === "topic" && model.name.length > 0
    ? `<a href="${conceptHref(model.name)}">Concept reading</a>`
    : "";
  return `
<section>
      <p class="kicker">${escapeHtml(label)} catalog</p>
  <div class="section-head">
    <div>
      <h1>${model.name.length > 0 ? escapeHtml(model.name) : escapeHtml(label)}</h1>
      <p class="muted">${model.name.length > 0 ? `${formatCount(model.matchedCount)} matched texts in the current catalog sample.` : `Choose a ${label.toLowerCase()} to inspect its texts.`}${model.truncated ? ` Catalog scan stopped at ${formatCount(model.scanned)} files.` : ""}</p>
    </div>
    <form class="inline-search" action="${formAction}" method="get">
      <input name="name" type="search" value="${escapeAttr(model.name)}" placeholder="${escapeAttr(searchPlaceholder)}">
      <button type="submit">Open</button>
    </form>
  </div>
  <div class="reader-actions">
    <a href="${indexHref}">${label} index</a>
    <a href="${searchHref(model.name)}">Search text</a>
    ${conceptAction}
  </div>
</section>
<section class="catalog-strip" aria-label="${escapeAttr(label)} summary">
  <a href="#texts"><strong>${formatCount(model.matchedCount)}</strong><span>matched texts</span></a>
  <a href="${indexHref}"><strong>${formatCount(model.group?.count ?? 0)}</strong><span>indexed count</span></a>
  <a href="/titles"><strong>${formatCount(model.total)}</strong><span>cataloged texts</span></a>
  <a href="#related"><strong>${formatCount(model.similar.length)}</strong><span>nearby facets</span></a>
</section>
${model.name.length > 0 && model.group === null ? `<p class="muted">No exact ${escapeHtml(label.toLowerCase())} facet named "${escapeHtml(model.name)}" was found. Text search may still find passing mentions.</p>` : ""}
<section id="texts">
  <div class="section-head">
    <h2>Texts</h2>
    <div class="link-row"><span class="muted">Showing ${formatCount(model.documents.length)} of ${formatCount(model.matchedCount)}</span><a href="${searchHref(model.name)}">Search mentions</a></div>
  </div>
  <ul class="text-list">${model.documents.map(renderDocumentListItem).join("") || `<li><span>No texts matched this ${escapeHtml(label.toLowerCase())}.</span></li>`}</ul>
</section>
<section id="related">
  <div class="section-head">
    <h2>Nearby Facets</h2>
    <a href="${indexHref}">Full index</a>
  </div>
  <div class="topic-grid">${model.similar.map((group) => model.kind === "author" ? renderAuthorChip(group) : renderGroupChip(group)).join("") || "<p class=\"muted\">No nearby facets found.</p>"}</div>
</section>`;
}

function renderCatalogList(title: string, description: string, documents: readonly CorpusCatalogDocument[]): string {
  return `
<section>
  <div class="section-head">
    <div>
      <h1>${escapeHtml(title)}</h1>
      <p class="muted">${escapeHtml(description)}</p>
    </div>
    <form class="inline-search" action="/search" method="get">
      <input name="q" type="search" placeholder="Search texts">
      <button type="submit">Search</button>
    </form>
  </div>
  <ul class="text-list">${documents.map(renderDocumentListItem).join("") || "<li><span>No documents found.</span></li>"}</ul>
</section>`;
}

function renderTitles(documents: readonly CorpusCatalogDocument[]): string {
  const groups = titleGroups(documents);
  return `
<section>
  <div class="section-head">
    <div>
      <h1>Titles</h1>
      <p class="muted">Alphabetical index of library texts.</p>
    </div>
    <form class="inline-search" action="/search" method="get">
      <input name="q" type="search" placeholder="Search titles">
      <button type="submit">Search</button>
    </form>
  </div>
  <nav class="letter-nav" aria-label="Title initials">${groups.map((group) => `<a href="#titles-${escapeAttr(group.key)}">${escapeHtml(group.label)}</a>`).join("")}</nav>
</section>
${groups.map((group) => `
<section class="title-group" id="titles-${escapeAttr(group.key)}">
  <div class="section-head">
    <h2>${escapeHtml(group.label)}</h2>
    <span class="muted">${formatCount(group.documents.length)} texts</span>
  </div>
  <ul class="text-list">${group.documents.map(renderDocumentListItem).join("")}</ul>
</section>`).join("")}`;
}

function titleGroups(documents: readonly CorpusCatalogDocument[]): readonly Readonly<{ key: string; label: string; documents: readonly CorpusCatalogDocument[] }>[] {
  const groups = new Map<string, CorpusCatalogDocument[]>();
  for (const document of documents) {
    const key = titleInitial(document.title);
    const group = groups.get(key) ?? [];
    group.push(document);
    groups.set(key, group);
  }
  return Object.freeze([...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => Object.freeze({
      key,
      label: key === "0" ? "#" : key,
      documents: Object.freeze(group),
    })));
}

function titleInitial(title: string): string {
  const first = title.trim().match(/[A-Za-z0-9]/)?.[0] ?? "0";
  return /[0-9]/.test(first) ? "0" : first.toUpperCase();
}

function renderAuthors(groups: readonly CorpusCatalogGroup[]): string {
  const letters = authorInitialGroups(groups);
  return `
<section>
  <div class="section-head">
    <div>
      <h1>Authors</h1>
      <p class="muted">Alphabetical index of named contributors and attributed source paths.</p>
    </div>
    <form class="inline-search" action="/search" method="get">
      <input name="q" type="search" placeholder="Search authors">
      <button type="submit">Search</button>
    </form>
  </div>
  <nav class="letter-nav" aria-label="Author initials">${letters.map((group) => `<a href="#authors-${escapeAttr(group.key)}">${escapeHtml(group.label)}</a>`).join("")}</nav>
</section>
${letters.map((letter) => `
<section class="title-group" id="authors-${escapeAttr(letter.key)}">
  <div class="section-head">
    <h2>${escapeHtml(letter.label)}</h2>
    <span class="muted">${formatCount(letter.authors.length)} authors · ${formatCount(letter.textCount)} texts</span>
  </div>
  <div class="group-list">${letter.authors.map(renderAuthorGroup).join("")}</div>
</section>`).join("") || "<section><p class=\"muted\">No authors found.</p></section>"}`;
}

function authorInitialGroups(groups: readonly CorpusCatalogGroup[]): readonly Readonly<{ key: string; label: string; textCount: number; authors: readonly CorpusCatalogGroup[] }>[] {
  const letters = new Map<string, CorpusCatalogGroup[]>();
  for (const group of groups) {
    const key = titleInitial(group.name);
    const bucket = letters.get(key) ?? [];
    bucket.push(group);
    letters.set(key, bucket);
  }
  return Object.freeze([...letters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, authors]) => {
      const sortedAuthors = Object.freeze([...authors]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((author) => Object.freeze({
          ...author,
        documents: Object.freeze([...author.documents].sort(compareCorpusDocumentsByTitle)),
        })));
      return Object.freeze({
        key,
        label: key === "0" ? "#" : key,
        textCount: sortedAuthors.reduce((sum, author) => sum + author.count, 0),
        authors: sortedAuthors,
      });
    }));
}

function renderAuthorGroup(group: CorpusCatalogGroup): string {
  return `
    <details>
      <summary><strong>${escapeHtml(group.name)}</strong><span>${formatCount(group.count)} texts</span></summary>
      <div class="reader-actions"><a href="${authorHref(group.name)}">Author page</a><a href="${searchHref(group.name)}">Search text</a></div>
      <ul class="text-list">${group.documents.map(renderDocumentListItem).join("")}</ul>
    </details>`;
}

function renderTopics(groups: readonly CorpusCatalogGroup[]): string {
  const letters = topicInitialGroups(groups);
  return `
<section>
  <div class="section-head">
    <div>
      <h1>Topics</h1>
      <p class="muted">Subject index from top-level paths and document tags.</p>
    </div>
    <form class="inline-search" action="/concept" method="get">
      <input name="q" type="search" placeholder="Read a topic">
      <button type="submit">Read</button>
    </form>
  </div>
  <nav class="letter-nav" aria-label="Topic initials">${letters.map((group) => `<a href="#topics-${escapeAttr(group.key)}">${escapeHtml(group.label)}</a>`).join("")}</nav>
</section>
${letters.map((letter) => `
<section class="title-group" id="topics-${escapeAttr(letter.key)}">
  <div class="section-head">
    <h2>${escapeHtml(letter.label)}</h2>
    <span class="muted">${formatCount(letter.topics.length)} topics · ${formatCount(letter.textCount)} texts</span>
  </div>
  <div class="group-list">${letter.topics.map(renderTopicGroup).join("")}</div>
</section>`).join("") || "<section><p class=\"muted\">No topics found.</p></section>"}`;
}

function topicInitialGroups(groups: readonly CorpusCatalogGroup[]): readonly Readonly<{ key: string; label: string; textCount: number; topics: readonly CorpusCatalogGroup[] }>[] {
  const letters = new Map<string, CorpusCatalogGroup[]>();
  for (const group of groups) {
    const key = titleInitial(group.name);
    const bucket = letters.get(key) ?? [];
    bucket.push(group);
    letters.set(key, bucket);
  }
  return Object.freeze([...letters.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, topics]) => {
      const sortedTopics = Object.freeze([...topics]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((topic) => Object.freeze({
          ...topic,
        documents: Object.freeze([...topic.documents].sort(compareCorpusDocumentsByTitle)),
        })));
      return Object.freeze({
        key,
        label: key === "0" ? "#" : key,
        textCount: sortedTopics.reduce((sum, topic) => sum + topic.count, 0),
        topics: sortedTopics,
      });
    }));
}

function renderTopicGroup(group: CorpusCatalogGroup): string {
  return `
    <details>
      <summary><strong>${escapeHtml(group.name)}</strong><span>${formatCount(group.count)} texts</span></summary>
      <div class="reader-actions"><a href="${topicHref(group.name)}">Topic page</a><a href="${conceptHref(group.name)}">Concept reading</a><a href="${searchHref(group.name)}">Search text</a></div>
      <ul class="text-list">${group.documents.map(renderDocumentListItem).join("")}</ul>
    </details>`;
}

function renderAddText(): string {
  return `
<section>
  <p class="kicker">Corpus intake</p>
  <h1>Add a new text</h1>
  <p class="lede">Submit Markdown material into the research triage queue. The browser posts to the same <code>upload-triage-file</code> script endpoint used by OpenAPI and MCP.</p>
</section>
<section class="add-panel">
  <form data-add-text-form action="/scripts/upload-triage-file" method="post" enctype="multipart/form-data">
    <label>Markdown content<textarea name="content" spellcheck="true" placeholder="# Title&#10;&#10;Paste or draft the text here."></textarea></label>
    <label>Markdown files<input name="files" type="file" multiple></label>
    <div class="reader-actions">
      <button type="submit">Upload to triage</button>
      <a href="/scripts/upload-triage-file">Script endpoint</a>
      <a href="/triage">Triage intake</a>
    </div>
  </form>
  <pre data-add-text-result>Waiting for content.</pre>
</section>
<script>
(() => {
  const form = document.querySelector("[data-add-text-form]");
  const result = document.querySelector("[data-add-text-result]");
  if (!form || !result) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const source = new FormData(form);
    const content = String(source.get("content") || "");
    const files = source.getAll("files").filter((value) => value instanceof File && value.size > 0);
    if (content.length === 0 && files.length === 0) {
      result.textContent = "Content or at least one file is required.";
      return;
    }
    const data = new FormData();
    if (content.length > 0) data.append("content", new Blob([content], { type: "text/markdown" }), "textarea.md");
    for (const file of files) data.append("files", file, file.name);
    result.textContent = "Uploading...";
    try {
      const response = await fetch("/scripts/upload-triage-file", {
        method: "POST",
        headers: { "accept": "application/json" },
        body: data,
      });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch {}
      if (!response.ok) {
        result.textContent = text || "Upload failed.";
        return;
      }
      if (body && Array.isArray(body.files)) {
        const links = body.files
          .filter((file) => file && typeof file.path === "string")
          .map((file) => "<a href=\\"" + "/read?path=" + encodeURIComponent(file.path) + "\\">" + escapeHtml(file.path) + "</a>");
        result.innerHTML = links.length === 1 ? "Uploaded to " + links[0] : "Uploaded " + links.length + " files:<br>" + links.join("<br>");
      } else if (body && typeof body.path === "string") {
        result.innerHTML = "Uploaded to <a href=\\"" + "/read?path=" + encodeURIComponent(body.path) + "\\">" + escapeHtml(body.path) + "</a>";
      } else {
        result.textContent = text;
      }
    } catch (error) {
      result.textContent = String(error && error.message ? error.message : error);
    }
  });
  function escapeHtml(value) {
    return String(value).replace(/[&<>\\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\"": "&quot;" }[char]));
  }
})();
</script>`;
}

function renderGroups(title: string, description: string, groups: readonly CorpusCatalogGroup[]): string {
  return `
<section>
  <h1>${escapeHtml(title)}</h1>
  <p class="muted">${escapeHtml(description)}</p>
  <div class="group-list">${groups.map((group) => `
    <details>
      <summary><strong>${escapeHtml(group.name)}</strong><span>${group.count} texts</span></summary>
      <ul class="text-list">${group.documents.map(renderDocumentListItem).join("")}</ul>
    </details>`).join("") || "<p class=\"muted\">No groups found.</p>"}</div>
</section>`;
}

function renderDocumentListItem(document: CorpusCatalogDocument): string {
  const meta = [
    document.authors.length > 0 ? document.authors.join(", ") : "",
    document.topic,
    document.modifiedAt.slice(0, 10),
  ].filter(Boolean).join(" · ");
  return `<li><a href="${readHref(document.path)}">${escapeHtml(document.title)}</a>${document.description.length > 0 ? `<p>${escapeHtml(document.description)}</p>` : ""}<span>${escapeHtml(meta)} · ${escapeHtml(document.path)}</span></li>`;
}

function renderRead(
  document: ReadResult,
  related: readonly CorpusCatalogDocument[] = [],
  backlinks: readonly BacklinkHit[] = [],
  siblings: readonly ListPathEntry[] = [],
): string {
  const title = document.title;
  const directory = path.dirname(document.path).split(path.sep).join("/");
  const toc = markdownTableOfContents(document.body);
  const graph = renderDirectoryGraph(document.path, "file", siblings);
  return `
<article class="reader">
  ${breadcrumbs(directory)}
  <p class="kicker">${escapeHtml(document.path)}</p>
  <h1>${escapeHtml(title)}</h1>
  <div class="reader-actions">
    <a href="${browseHref(directory)}">Directory</a>
    <a href="${conceptHref(title)}">Concept</a>
    <a href="${searchHref(title)}">Search</a>
    <a href="/scripts/read-file">Script</a>
    <a href="/scripts/update-frontmatter">Edit metadata</a>
  </div>
  <p class="reader-meta">${escapeHtml(document.format)} frontmatter · ${formatCount(document.bytes)} bytes</p>
  ${renderFrontmatter(document.frontmatter)}
  ${renderTableOfContents(toc)}
  <div class="document-body">${renderMarkdown(document.body)}</div>
</article>
${graph}
<section>
  <div class="section-head">
    <h2>What links here</h2>
    <a href="${searchHref(title)}">Search title</a>
  </div>
  <ul class="search-results">${backlinks.map(renderBacklinkHit).join("") || "<li><span>No incoming references found in the bounded scan.</span></li>"}</ul>
</section>
<section>
  <div class="section-head">
    <h2>Related texts</h2>
    <div class="link-row"><a href="${conceptHref(title)}">Concept reading</a><a href="${searchHref(title)}">Search title</a></div>
  </div>
  <ul class="text-list">${related.map(renderDocumentListItem).join("") || "<li><span>No related texts found in the current catalog sample.</span></li>"}</ul>
</section>`;
}

const DIRECTORY_GRAPH_LIMIT = 40;

/**
 * Render the SVG section showing where a path sits in the content directory
 * tree: a directory and what it holds, or a file beside its siblings. Returns ""
 * when there is nothing around the path to draw.
 */
function renderDirectoryGraph(
  focusPath: string,
  focusKind: "directory" | "file",
  entries: readonly ListPathEntry[],
): string {
  const parent = parentDir(focusPath);
  const container = focusKind === "directory" ? focusPath : parent;
  const nodes: DirectoryGraphNode[] = [];
  const edges: DirectoryGraphEdge[] = [];
  const seen = new Set<string>();
  const addNode = (id: string, kind: "directory" | "file", current: boolean): void => {
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({ id, label: pathName(id), kind, current, href: kind === "directory" ? browseHref(id) : readHref(id) });
  };
  addNode(focusPath, focusKind, true);
  if (parent.length > 0) {
    addNode(parent, "directory", false);
    edges.push({ from: parent, to: focusPath });
  }
  let shown = 0;
  for (const entry of entries) {
    if (entry.kind === "other" || entry.path === focusPath) continue;
    if (container.length === 0) break;
    if (shown >= DIRECTORY_GRAPH_LIMIT) break;
    shown += 1;
    addNode(entry.path, entry.kind, false);
    edges.push({ from: container, to: entry.path });
  }
  const svg = directoryGraphSvg(nodes, edges, `Directory structure around ${pathName(focusPath)}`);
  if (svg.length === 0) return "";
  const more = entries.filter((entry) => entry.kind !== "other" && entry.path !== focusPath).length - shown;
  return `<section>
  <div class="section-head">
    <h2>Directory</h2>
    <span class="muted">where this sits in <code>content/</code>${more > 0 ? ` · ${formatCount(more)} more not shown` : ""} — click to browse</span>
  </div>
  <figure class="directory-graph">${svg}</figure>
</section>`;
}

function parentDir(value: string): string {
  const directory = path.dirname(value).split(path.sep).join("/");
  return directory === "." || directory === value ? "" : directory;
}

function pathName(value: string): string {
  return (value.split("/").filter(Boolean).at(-1) ?? value).replace(/\.md$/, "");
}

function renderBacklinkHit(hit: BacklinkHit): string {
  return `<li><a href="${readHref(hit.path)}">${escapeHtml(titleForPath(hit.path))}</a><p>${escapeHtml(hit.context)}</p><span>${escapeHtml(hit.path)}:${hit.line} · ${escapeHtml(hit.query)}</span></li>`;
}

function renderFrontmatter(frontmatter: Record<string, unknown>): string {
  const entries = Object.entries(frontmatter).filter(([key]) => key !== "title");
  if (entries.length === 0) return "";
  return `<dl class="frontmatter">${entries.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${renderFrontmatterValue(key, value)}</dd></div>`).join("")}</dl>`;
}

function renderFrontmatterValue(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    const items = value.flatMap((item) => frontmatterScalarLinks(key, item));
    if (items.length > 0) return `<span class="chip-list">${items.join("")}</span>`;
    return escapeHtml(formatValue(value));
  }
  const items = frontmatterScalarLinks(key, value);
  if (items.length > 0) return `<span class="chip-list">${items.join("")}</span>`;
  return escapeHtml(formatValue(value));
}

function frontmatterScalarLinks(key: string, value: unknown): string[] {
  if (value === null || typeof value === "object") return [];
  const raw = cleanWikiToken(String(value));
  if (raw.length === 0) return [];
  if (/^https?:\/\//i.test(raw)) return [`<a class="chip" href="${escapeAttr(raw)}">${escapeHtml(raw)}</a>`];
  if (looksLikeVaultPath(raw) && (raw.endsWith(".md") || keyMatches(key, ["source", "sources", "reference", "references", "path", "paths"]))) {
    return [`<a class="chip" href="${readHref(raw)}">${escapeHtml(raw)}</a>`];
  }
  if (keyMatches(key, ["tag", "tags", "topic", "topics", "alias", "aliases", "concept", "concepts", "category", "categories"])) {
    return [`<a class="chip" href="${topicHref(raw)}">${escapeHtml(raw)}</a>`];
  }
  if (keyMatches(key, ["author", "authors", "creator", "creators"])) {
    return [`<a class="chip" href="${authorHref(raw)}">${escapeHtml(raw)}</a>`];
  }
  return [];
}

function keyMatches(key: string, names: readonly string[]): boolean {
  const normalized = key.toLowerCase().replace(/[_-]+/g, "");
  return names.some((name) => normalized === name.toLowerCase().replace(/[_-]+/g, ""));
}

function cleanWikiToken(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
}

function looksLikeVaultPath(value: string): boolean {
  return !value.includes("://") && knowledgeVaultPathAllowed(value);
}

function renderAdmin(model: AdminModel): string {
  return `
<section>
  <p class="kicker">Owner workbench</p>
  <h1>Publish and maintain the corpus</h1>
  <p class="lede">Review intake, prepare new texts, edit existing records, and maintain corpus health through the same HTTP script transport used by OpenAPI and MCP.</p>
</section>
<section class="catalog-strip" aria-label="Owner summary">
  <a href="/titles"><strong>${formatCount(model.total)}</strong><span>texts cataloged</span></a>
  <a href="/triage"><strong>${formatCount(model.triage.files.length)}</strong><span>triage files</span></a>
  <a href="/authors"><strong>${formatCount(model.authorGroups)}</strong><span>author groups</span></a>
  <a href="/topics"><strong>${formatCount(model.topicGroups)}</strong><span>topic groups</span></a>
</section>
${model.truncated ? `<p class="muted">Catalog scan stopped at ${formatCount(model.scanned)} files; maintenance views use bounded reads.</p>` : ""}
${model.triage.error.length > 0 ? `<p class="muted">Triage could not be read: ${escapeHtml(model.triage.error)}</p>` : ""}
<section class="split-grid">
  <div>
    <div class="section-head">
      <h2>Editorial Queue</h2>
      <div class="link-row"><a href="/triage">Open triage</a><a href="/add">Add text</a></div>
    </div>
    <ul class="text-list">${model.triage.files.slice(0, 8).map(renderAdminTriageItem).join("") || "<li><span>No triage material waiting.</span></li>"}</ul>
  </div>
  <div>
    <div class="section-head">
      <h2>Publishing</h2>
      <a href="/scripts/create-document">Create document</a>
    </div>
    <div class="admin-grid">
        <a class="admin-card" href="/scripts/prepare-document"><strong>Prepare</strong><span>Draft a structured corpus document from raw material.</span></a>
      <a class="admin-card" href="/scripts/create-document"><strong>Create</strong><span>Write a prepared document into the corpus.</span></a>
      <a class="admin-card" href="/scripts/update-body"><strong>Edit body</strong><span>Replace or revise a document body through the script transport.</span></a>
      <a class="admin-card" href="/scripts/update-frontmatter"><strong>Edit metadata</strong><span>Update title, authors, tags, and other frontmatter.</span></a>
    </div>
  </div>
</section>
<section class="split-grid">
  <div>
    <div class="section-head">
      <h2>Recent Activity</h2>
      <a href="/latest">Latest</a>
    </div>
    <ul class="text-list">${model.latest.map(renderDocumentListItem).join("") || "<li><span>No recent entries found.</span></li>"}</ul>
  </div>
  <div>
    <div class="section-head">
      <h2>High-Signal Texts</h2>
      <a href="/popular">Popular</a>
    </div>
    <ul class="text-list">${model.popular.map(renderDocumentListItem).join("") || "<li><span>No ranked entries found.</span></li>"}</ul>
  </div>
</section>
<section>
  <div class="section-head">
    <h2>Maintenance and Transports</h2>
    <a href="/computer">Computer</a>
  </div>
  <div class="admin-grid">
    <a class="admin-card" href="/triage"><strong>Triage intake</strong><span>Review recent files under _triage.</span></a>
    <a class="admin-card" href="/scripts/upload-triage-file"><strong>Upload triage</strong><span>One content field into _triage/YYYY/MM/DD.</span></a>
    <a class="admin-card" href="/health"><strong>Vault health</strong><span>Review metadata gaps and normalization candidates.</span></a>
    <a class="admin-card" href="/scripts/plan-normalization"><strong>Plan normalization</strong><span>Preview bounded cleanup before applying changes.</span></a>
    <a class="admin-card" href="/scripts/normalize-corpus"><strong>Normalize</strong><span>Plan or apply bounded cleanup.</span></a>
    <a class="admin-card" href="/scripts/openapi.json"><strong>OpenAPI</strong><span>Inspect the HTTP contract external agents use.</span></a>
    <a class="admin-card" href="/scripts/mcp"><strong>MCP</strong><span>Remote tool transport for connected agents.</span></a>
    <a class="admin-card" href="/computer"><strong>Computer</strong><span>Full package-bin catalog, OpenAPI, and MCP links.</span></a>
  </div>
</section>`;
}

function renderAdminTriageItem(file: TriageFile): string {
  return `<li><a href="${readHref(file.path)}">${escapeHtml(file.title)}</a><p>${escapeHtml(file.preview)}</p><span>${escapeHtml(file.path)} · ${formatCount(file.bytes)} bytes</span></li>`;
}

function layout(input: Readonly<{ title: string; current: string; body: string }>): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)} | research.emsenn.net</title>
<style>${CSS}</style>
</head>
<body>
<header class="site-header">
  <a class="brand" href="/">research.emsenn.net</a>
  <nav>
    ${navLink("home", "/", "Home", input.current)}
    ${navLink("browse", "/library?path=", "Topics", input.current)}
    ${navLink("titles", "/titles", "Titles", input.current)}
    ${navLink("authors", "/authors", "Authors", input.current)}
    ${navLink("concept", "/concept", "Concepts", input.current)}
    ${navLink("latest", "/latest", "Latest", input.current)}
    ${navLink("popular", "/popular", "Popular", input.current)}
    ${navLink("search", "/search", "Search", input.current)}
    ${navLink("add", "/add", "Add", input.current)}
    ${navLink("triage", "/triage", "Triage", input.current)}
    ${navLink("health", "/health", "Health", input.current)}
    ${navLink("admin", "/admin", "Admin", input.current)}
    ${navLink("computer", "/computer", "Computer", input.current)}
  </nav>
</header>
<main>${input.body}</main>
<footer><a href="/feed.xml">RSS</a><a href="/sitemap.xml">Sitemap</a><a href="/scripts/openapi.json">OpenAPI</a><a href="/scripts/mcp">MCP</a><a href="/computer">Package-bin computer</a></footer>
</body>
</html>`;
}

function navLink(id: string, href: string, label: string, current: string): string {
  return `<a href="${href}"${id === current ? " aria-current=\"page\"" : ""}>${label}</a>`;
}

function breadcrumbs(target: string): string {
  const parts = cleanPath(target).split("/").filter(Boolean);
  const links = parts.map((_, index) => {
    const pathValue = parts.slice(0, index + 1).join("/");
    return `<a href="${browseHref(pathValue)}">${escapeHtml(titleForSegment(parts[index]!))}</a>`;
  });
  return `<nav class="breadcrumbs"><a href="/">Home</a>${links.map((link) => `<span>/</span>${link}`).join("")}</nav>`;
}

function redirectPage(selected: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${readHref(selected)}"><title>Random text</title></head><body><p><a href="${readHref(selected)}">Open random text</a></p></body></html>`;
}

function markdownTableOfContents(markdown: string): readonly TocEntry[] {
  const entries: TocEntry[] = [];
  const headingId = headingIdFactory();
  let inCode = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading === null) continue;
    const title = heading[2]!.trim();
    entries.push(Object.freeze({
      level: heading[1]!.length,
      title,
      id: headingId(title),
    }));
  }
  return Object.freeze(entries);
}

function renderTableOfContents(entries: readonly TocEntry[]): string {
  if (entries.length === 0) return "";
  return `
  <nav class="toc" aria-label="Table of contents">
    <h2>Table of Contents</h2>
    <ol>${entries.map((entry) => `<li class="toc-level-${entry.level}"><a href="#${escapeAttr(entry.id)}">${escapeHtml(entry.title)}</a></li>`).join("")}</ol>
  </nav>`;
}

function renderMarkdown(markdown: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let inCode = false;
  let code: string[] = [];
  const headingId = headingIdFactory();
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushCode = () => {
    out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    code = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1]!.length;
      const title = heading[2]!.trim();
      out.push(`<h${level} id="${escapeAttr(headingId(title))}">${escapeHtml(title)}</h${level}>`);
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      out.push(`<p class="bullet">${escapeHtml(bullet[1]!)}</p>`);
      continue;
    }
    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  if (inCode) flushCode();
  return out.join("\n");
}

function headingIdFactory(): (title: string) => string {
  const seen = new Map<string, number>();
  return (title: string): string => {
    const base = title
      .toLowerCase()
      .replace(/[`*_#[\]()]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}

function titleForPath(value: string): string {
  const segment = value.split("/").filter(Boolean).at(-1) ?? "vault";
  return titleForSegment(segment.replace(/\.md$/, ""));
}

function titleForSegment(segment: string): string {
  return segment.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function browseHref(pathValue: string): string {
  return `/library?path=${encodeURIComponent(pathValue)}`;
}

function readHref(pathValue: string): string {
  return `/read?path=${encodeURIComponent(pathValue)}`;
}

function authorHref(name: string): string {
  return `/author?name=${encodeURIComponent(name)}`;
}

function topicHref(name: string): string {
  return `/topic?name=${encodeURIComponent(name)}`;
}

function conceptHref(query: string): string {
  return `/concept?q=${encodeURIComponent(query)}`;
}

function searchHref(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function cleanPath(value: string): string {
  return normalizeKnowledgeVaultPath(value) ?? "";
}

function objectRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function recordArray(value: unknown): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    const record = objectRecord(item);
    return record === undefined ? [] : [record];
  }) : [];
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringField(record: Readonly<Record<string, unknown>> | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function numberField(record: Readonly<Record<string, unknown>> | undefined, key: string): number {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function renderRss(documents: readonly CorpusCatalogDocument[]): string {
  const items = documents.slice(0, 25).map((document) => `
  <item>
    <title>${escapeXml(document.title)}</title>
    <link>${escapeXml(absoluteUrl(readHref(document.path)))}</link>
    <guid isPermaLink="false">${escapeXml(document.path)}</guid>
    <pubDate>${new Date(document.modifiedAt).toUTCString()}</pubDate>
    <description>${escapeXml(document.description || document.path)}</description>
  </item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>research.emsenn.net latest entries</title>
  <link>${escapeXml(absoluteUrl("/"))}</link>
  <description>Latest entries from the emsenn.net personal knowledge vault.</description>${items}
</channel>
</rss>`;
}

function renderSitemap(catalog: CorpusCatalogView): string {
  const staticUrls = [
    "/",
    "/library?path=",
    "/titles",
    "/authors",
    "/topics",
    "/author",
    "/topic",
    "/latest",
    "/popular",
    "/random",
    "/feed.xml",
  ];
  const urls = [
    ...staticUrls.map((href) => sitemapUrl(href)),
    ...catalog.authors.slice(0, 300).map((group) => sitemapUrl(authorHref(group.name))),
    ...catalog.topics.slice(0, 300).map((group) => sitemapUrl(topicHref(group.name))),
    ...catalog.documents.map((document) => sitemapUrl(readHref(document.path), document.modifiedAt.slice(0, 10))),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
}

function sitemapUrl(href: string, lastmod = ""): string {
  return `
  <url>
    <loc>${escapeXml(absoluteUrl(href))}</loc>${lastmod.length > 0 ? `
    <lastmod>${escapeXml(lastmod)}</lastmod>` : ""}
  </url>`;
}

function absoluteUrl(href: string): string {
  return `${PUBLIC_ORIGIN}${href.startsWith("/") ? href : `/${href}`}`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    "\"": "&quot;",
  })[char] ?? char);
}

const CSS = `
:root{color-scheme:light;--bg:#f6f4ee;--paper:#fffdfa;--ink:#1f2528;--muted:#687076;--line:#d8d2c5;--accent:#8f2f23;--accent-2:#245a5a;--soft:#ebe5d8}
.directory-graph{margin:0;overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:#10242a;padding:8px}
.directory-graph svg{max-width:100%;height:auto;display:block;margin:0 auto}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 ui-serif,Georgia,serif}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.site-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 28px;border-bottom:1px solid var(--line);background:rgba(255,253,250,.95);backdrop-filter:blur(8px)}
.brand{font:700 18px/1 ui-sans-serif,system-ui,sans-serif;color:var(--ink)}
nav{display:flex;flex-wrap:wrap;gap:12px}
nav a{font:600 13px/1 ui-sans-serif,system-ui,sans-serif;color:var(--muted)}
nav a[aria-current=page]{color:var(--accent)}
main{max-width:1120px;margin:0 auto;padding:34px 24px 48px;display:grid;gap:36px}
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,420px);gap:28px;align-items:end;padding:28px 0 12px}
.kicker{margin:0 0 6px;color:var(--accent-2);font:700 12px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}
h1{font-size:42px;line-height:1.08;margin:0 0 12px;letter-spacing:0}
h2{font-size:24px;line-height:1.15;margin:0;letter-spacing:0}
.lede{max-width:760px;margin:0;color:#41494d;font-size:18px}
.searchbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;background:var(--paper);border:1px solid var(--line);padding:8px;border-radius:8px}
.searchbar.compact{grid-template-columns:minmax(0,1fr) minmax(140px,220px) auto;margin:16px 0}
.inline-search{display:flex;gap:8px;align-items:center}
input,textarea{width:100%;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);font:15px/1.3 ui-sans-serif,system-ui,sans-serif;padding:10px 12px}
textarea{min-height:360px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.45}
button{border:0;border-radius:6px;background:var(--accent);color:white;font:700 14px/1 ui-sans-serif,system-ui,sans-serif;padding:10px 14px;cursor:pointer}
.add-panel{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,360px);gap:16px;align-items:start}
.add-panel form{display:grid;gap:12px}
.add-panel label{display:grid;gap:8px;color:var(--muted);font:700 13px/1 ui-sans-serif,system-ui,sans-serif}
.add-panel pre{white-space:pre-wrap;overflow:auto;margin:0;padding:14px;border:1px solid var(--line);border-radius:8px;background:var(--paper);font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.triage-result{white-space:pre-wrap;overflow:auto;max-height:520px;margin:0;padding:14px;border:1px solid var(--line);border-radius:8px;background:var(--paper);font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.catalog-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.catalog-strip a{display:grid;gap:2px;padding:12px;border-top:3px solid var(--accent-2);background:var(--paper);color:var(--ink)}
.catalog-strip strong{font:700 24px/1 ui-sans-serif,system-ui,sans-serif}
.catalog-strip span{color:var(--muted);font:12px/1.3 ui-sans-serif,system-ui,sans-serif}
.section-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px}
.link-row{display:flex;flex-wrap:wrap;gap:10px;font:600 13px/1 ui-sans-serif,system-ui,sans-serif}
.letter-nav{display:flex;flex-wrap:wrap;gap:6px;margin-top:18px}
.letter-nav a{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;border:1px solid var(--line);border-radius:6px;background:var(--paper);font:700 13px/1 ui-sans-serif,system-ui,sans-serif;color:var(--accent-2)}
.title-group{scroll-margin-top:78px}
.topic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
.topic,.admin-card{display:grid;gap:6px;padding:14px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink)}
.topic{font:700 15px/1.2 ui-sans-serif,system-ui,sans-serif}
.topic span{color:var(--muted);font:13px/1.35 ui-sans-serif,system-ui,sans-serif}
.split-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}
.text-list,.browser-list,.search-results,.axis-list{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.text-list li,.browser-list li,.search-results li,.axis-list li{display:grid;gap:4px;padding:12px 0;border-bottom:1px solid var(--line)}
.text-list span,.browser-list span,.search-results span,.axis-list span,.muted{color:var(--muted);font:13px/1.4 ui-sans-serif,system-ui,sans-serif}
.axis-list li{grid-template-columns:minmax(0,1fr) auto;align-items:center}
.axis-list strong{font:700 12px/1 ui-sans-serif,system-ui,sans-serif;color:var(--accent-2);text-transform:uppercase}
.browser-list a,.search-results a{font-weight:700}
.breadcrumbs{display:flex;gap:8px;margin-bottom:14px;color:var(--muted)}
.reader{max-width:820px;margin:0 auto;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:28px}
.reader h1{font-size:38px}
.reader-actions{display:flex;gap:14px;margin:0 0 18px;font:13px/1 ui-sans-serif,system-ui,sans-serif}
.reader-meta{margin:0 0 14px;color:var(--muted);font:13px/1.3 ui-sans-serif,system-ui,sans-serif}
.toc{margin:20px 0;padding:14px;border:1px solid var(--line);border-radius:8px;background:var(--soft)}
.toc h2{font-size:18px;margin:0 0 10px}
.toc ol{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.toc li{font:14px/1.25 ui-sans-serif,system-ui,sans-serif}
.toc-level-2{padding-left:14px}
.toc-level-3,.toc-level-4{padding-left:28px}
.frontmatter{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:18px 0;padding:14px;background:var(--soft);border-radius:8px}
.frontmatter div{display:grid;gap:2px}
.frontmatter dt{font:700 12px/1 ui-sans-serif,system-ui,sans-serif;color:var(--muted)}
.frontmatter dd{margin:0;font:14px/1.35 ui-sans-serif,system-ui,sans-serif}
.chip-list{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-flex;max-width:100%;padding:4px 7px;border:1px solid color-mix(in srgb, var(--accent-2) 35%, var(--line));border-radius:6px;background:var(--paper);color:var(--accent-2);font:700 12px/1.15 ui-sans-serif,system-ui,sans-serif;overflow-wrap:anywhere}
.document-body h1,.document-body h2,.document-body h3,.document-body h4{margin:28px 0 8px}
.document-body p{margin:0 0 14px}
.document-body pre{overflow:auto;background:#222;color:#f8f2e8;border-radius:8px;padding:14px}
.bullet{padding-left:18px;position:relative}
.bullet:before{content:"";position:absolute;left:2px;top:.75em;width:5px;height:5px;border-radius:50%;background:var(--accent)}
.admin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-top:18px}
.group-list{display:grid;gap:10px;margin-top:18px}
.group-list.compact{margin-top:0;gap:0;border-top:1px solid var(--line)}
.compact-row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid var(--line);color:var(--ink);font:14px/1.25 ui-sans-serif,system-ui,sans-serif}
.compact-row strong{color:var(--muted);font:700 12px/1.25 ui-sans-serif,system-ui,sans-serif;text-transform:uppercase}
.group-list details{background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:12px}
.group-list summary{cursor:pointer;display:flex;justify-content:space-between;gap:12px;font:15px/1.2 ui-sans-serif,system-ui,sans-serif}
.group-list summary span{color:var(--muted)}
.admin-card strong{font:700 16px/1.2 ui-sans-serif,system-ui,sans-serif}
.admin-card span{color:var(--muted);font:13px/1.35 ui-sans-serif,system-ui,sans-serif}
footer{display:flex;justify-content:center;gap:16px;padding:26px;color:var(--muted);font:13px/1 ui-sans-serif,system-ui,sans-serif}
@media(max-width:760px){.site-header{align-items:flex-start;flex-direction:column;padding:14px 18px}.hero,.split-grid,.add-panel{grid-template-columns:1fr}.catalog-strip{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:24px 16px}.searchbar.compact{grid-template-columns:1fr}.section-head{align-items:flex-start;flex-direction:column}.reader{padding:18px}h1,.reader h1{font-size:32px}}
`;
