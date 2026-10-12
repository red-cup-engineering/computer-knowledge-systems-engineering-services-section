import { posix } from "node:path";
import { openMarkdownVault } from "@red-cup-engineering/cairn";
import { renderMarkdownBlockHtml } from "@red-cup-engineering/render-markdown-block-html-service";
import { CairnRevisionConflict } from "@red-cup-engineering/cairn";
import { createConceptIndex } from "./concept-index.mjs";
import { readScopedRelationGlossary, relationsForPath } from "./declared-relations.mjs";
import { createOpalWorkspaceFaeGraph } from "./fae-workspace-graph.mjs";

export const GeodeRevisionConflict = CairnRevisionConflict;
export const OpalRevisionConflict = GeodeRevisionConflict;

function scoreDocument(document, query) {
  const folded = query.toLocaleLowerCase();
  const title = document.title.toLocaleLowerCase();
  const path = document.path.toLocaleLowerCase();
  const fields = [title, path, ...document.aliases, ...document.keywords, ...document.headings]
    .map((value) => value.toLocaleLowerCase());
  if (title === folded) return 100;
  if (title.startsWith(folded)) return 90;
  if (fields.some((value) => value === folded)) return 80;
  if (fields.some((value) => value.startsWith(folded))) return 70;
  if (fields.some((value) => value.includes(folded))) return 50;
  const terms = folded.split(/\s+/u).filter(Boolean);
  return terms.length > 0 && terms.every((term) => fields.some((value) => value.includes(term))) ? 30 : 0;
}

export function searchOpalSnapshot(snapshot, query, { limit = 100 } = {}) {
  if (!snapshot || snapshot.type !== "OpalWorkspaceSnapshot") throw new TypeError("snapshot must be an Opal workspace snapshot");
  if (typeof query !== "string") throw new TypeError("query must be a string");
  if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError("limit must be a nonnegative safe integer");
  const trimmed = query.trim();
  if (trimmed === "") return snapshot.documents.slice(0, limit);
  return snapshot.documents
    .map((document) => ({ document, score: scoreDocument(document, trimmed) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title))
    .slice(0, limit)
    .map(({ document }) => document);
}

export function projectOpalWorkspace(snapshot) {
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
    documents: snapshot.documents,
    graph: Object.freeze({
      nodes: snapshot.graph.nodes.length,
      // A per-document graph has no whole-vault edge total; null says so rather than claiming zero.
      edges: snapshot.graph.edges === null ? null : snapshot.graph.edges.length,
      externalUrls: snapshot.graph.externalUrls.length,
      diagnostics: snapshot.graph.diagnostics,
      ...(snapshot.graph.derivation ? { derivation: snapshot.graph.derivation } : {}),
    }),
  });
}

export async function createOpalWorkspace({
  root,
  region = "",
  excludes,
  limit = 50_000,
  maxScan = 100_000,
} = {}) {
  if (typeof root !== "string" || root.trim() === "") throw new TypeError("root is required");
  let snapshot;
  let cairn;
  let admittedPaths = new Set();
  let relationGlossary = Object.freeze([]);
  const concepts = createConceptIndex({ root, paths: () => [...admittedPaths] });
  let faeGraphPromise = null;

  async function refresh() {
    if (cairn === undefined) {
      cairn = await openMarkdownVault({ root, region, excludes, limit, maxScan });
    } else {
      await cairn.refresh();
    }
    const glossary = await readScopedRelationGlossary({
      root,
      paths: cairn.snapshot.documents.map(({ path }) => path),
    });
    relationGlossary = glossary.entries;
    snapshot = Object.freeze({
      ...cairn.snapshot,
      type: "OpalWorkspaceSnapshot",
      schemaVersion: "opal-workspace/v1",
    });
    admittedPaths = new Set(snapshot.documents.map((document) => document.path));
    concepts.invalidate();
    faeGraphPromise = null;
    return snapshot;
  }

  async function read(path) {
    if (typeof path !== "string" || !admittedPaths.has(path)) throw new RangeError(`unknown document: ${path}`);
    const reading = await cairn.read(path);
    return Object.freeze({
      ...reading,
      type: "OpalDocumentReading",
      relationKeys: Object.freeze(Object.keys(relationsForPath(path, relationGlossary))),
      html: renderMarkdownBlockHtml(reading.body),
    });
  }

  let writeTail = Promise.resolve();

  function serializeWrite(operation) {
    const running = writeTail.then(operation, operation);
    writeTail = running.catch(() => {});
    return running;
  }

  async function replace({ path, markdown, expectedRevision } = {}) {
    if (typeof path !== "string" || !admittedPaths.has(path)) throw new RangeError(`unknown document: ${path}`);
    if (typeof markdown !== "string") throw new TypeError("markdown must be a string");
    return serializeWrite(async () => {
      const write = await cairn.replace({
        path,
        markdown,
        expectedRevision,
      });
      const glossary = await readScopedRelationGlossary({
        root,
        paths: cairn.snapshot.documents.map(({ path: admittedPath }) => admittedPath),
      });
      relationGlossary = glossary.entries;
      snapshot = Object.freeze({
        ...cairn.snapshot,
        type: "OpalWorkspaceSnapshot",
        schemaVersion: "opal-workspace/v1",
      });
      admittedPaths = new Set(snapshot.documents.map((document) => document.path));
      concepts.invalidate();
      faeGraphPromise = null;
      const document = await read(path);
      return Object.freeze({
        type: "OpalMarkdownWriteReceipt",
        schemaVersion: "opal-markdown-write/v1",
        path,
        previousRevision: write.previousRevision,
        revision: document.revision,
        changed: write.changed,
        bytes: write.bytes,
        document,
      });
    });
  }

  await refresh();
  function faeGraph() {
    if (faeGraphPromise === null) faeGraphPromise = createOpalWorkspaceFaeGraph(snapshot);
    return faeGraphPromise;
  }
  return Object.freeze({
    get snapshot() { return snapshot; },
    read,
    replace,
    refresh,
    concept(name) { return concepts.concept(name); },
    conceptSummary() { return concepts.summary(); },
    get conceptsReady() { return concepts.ready; },
    callGraphTool(name, args) { return concepts.callDrewTool(name, args); },
    sparql(query, options) { return concepts.sparql(query, options); },
    async faeSummary() { return (await faeGraph()).summary(); },
    async faeRelations(pattern, options) { return (await faeGraph()).relations(pattern, options); },
    async faeEntity(term, options) { return (await faeGraph()).entity(term, options); },
    async faeDiagnostics(options) { return (await faeGraph()).diagnostics(options); },
    search(query, options) { return searchOpalSnapshot(snapshot, query, options); },
    resolveLink(sourcePath, targetPath) {
      if (typeof sourcePath !== "string" || typeof targetPath !== "string") return null;
      const bare = targetPath.split("#", 1)[0];
      if (bare === "") return sourcePath;
      const candidate = posix.normalize(posix.join(posix.dirname(sourcePath), bare)).replace(/^\.\//u, "");
      return admittedPaths.has(candidate) ? candidate : null;
    },
  });
}

export const createGeodeWorkspace = createOpalWorkspace;
export const projectGeodeWorkspace = projectOpalWorkspace;
export const searchGeodeSnapshot = searchOpalSnapshot;
