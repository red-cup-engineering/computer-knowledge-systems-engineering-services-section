import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GeodeRevisionConflict, projectGeodeWorkspace } from "./workspace.mjs";
import { projectGeodeEditor } from "./tufte.mjs";
import { conceptDiagram, writeMermaid } from "./concept-diagram.mjs";
import { handleGeodeVocabularyRequest, ownsGeodeVocabularyRequest } from "./vocabulary.mjs";

const DEFAULT_PUBLIC_DIRECTORY = fileURLToPath(new URL("../public/", import.meta.url));
const DEFAULT_TUFTE_BROWSER_FILE = fileURLToPath(import.meta.resolve("@red-cup-engineering/tufte/browser"));
const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/app.js", "app.js"],
  ["/styles.css", "styles.css"],
  ["/tufte-browser.mjs", DEFAULT_TUFTE_BROWSER_FILE],
]);
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
]);

function commonHeaders() {
  return {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "cross-origin-opener-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function sendJson(status, value) {
  return new Response(`${JSON.stringify(value)}\n`, {
    status,
    headers: { ...commonHeaders(), "content-type": "application/json; charset=utf-8" },
  });
}

function sendError(error) {
  const status = error instanceof RangeError ? 404 : error instanceof TypeError ? 400 : 500;
  return sendJson(status, { error: status === 500 ? "internal error" : error.message });
}

async function readJson(request, { limit = 4 * 1024 * 1024 } = {}) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > limit) throw new RangeError("request body is too large");
  let value;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new TypeError("request body must be JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("request body must be a JSON object");
  return value;
}

const DREW_READ_TOOLS = new Set(["drew_catalog", "drew_relations", "drew_entity", "drew_project", "drew_explain", "drew_diagnostics"]);

function sparqlTerm(value) {
  return typeof value === "string" && /^\?[A-Za-z][A-Za-z0-9_]*$/u.test(value)
    ? Object.freeze({ kind: "knowing.sparql.variable", name: value.slice(1) })
    : value;
}

function sparqlPatterns(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 4) throw new TypeError("where and construct must contain from one through four triple patterns");
  return Object.freeze(values.map((pattern) => {
    if (!pattern || typeof pattern !== "object" || Array.isArray(pattern) || !("s" in pattern) || !("p" in pattern) || !("o" in pattern)) {
      throw new TypeError("each triple pattern requires s, p, and o");
    }
    return Object.freeze({ s: sparqlTerm(pattern.s), p: sparqlTerm(pattern.p), o: sparqlTerm(pattern.o) });
  }));
}

function projectNote(reading) {
  return Object.freeze({ ...reading, editor: projectGeodeEditor(reading) });
}

async function performAction(workspace, envelope) {
  if (envelope.action !== "geode.note.replace") throw new TypeError(`unknown action: ${envelope.action}`);
  const value = envelope.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("action value must be an object");
  const receipt = await workspace.replace({
    path: value.path,
    markdown: value.markdown,
    expectedRevision: envelope.revision,
  });
  return Object.freeze({
    type: "GeodeActionReceipt",
    schemaVersion: "geode-action/v1",
    action: envelope.action,
    status: "committed",
    path: receipt.path,
    previousRevision: receipt.previousRevision,
    revision: receipt.revision,
    changed: receipt.changed,
    bytes: receipt.bytes,
    note: projectNote(receipt.document),
    workspace: projectGeodeWorkspace(workspace.snapshot),
  });
}

async function serveStatic(publicDirectory, pathname) {
  const filename = STATIC_FILES.get(pathname);
  if (!filename) return null;
  const filepath = filename === DEFAULT_TUFTE_BROWSER_FILE ? filename : resolve(publicDirectory, filename);
  try {
    return new Response(await readFile(filepath), { headers: {
      ...commonHeaders(),
      "content-type": CONTENT_TYPES.get(extname(filepath)) ?? "application/octet-stream",
    } });
  } catch {
    return sendJson(404, { error: "asset not found" });
  }
}

export function createGeodeFetchHandler({ workspace, publicDirectory = DEFAULT_PUBLIC_DIRECTORY } = {}) {
  if (!workspace || typeof workspace.read !== "function") throw new TypeError("workspace is required");
  return async function handleGeodeRequest(request) {
    try {
      const url = new URL(request.url);
      if (ownsGeodeVocabularyRequest(request)) {
        const vocabulary = await handleGeodeVocabularyRequest(request, { workspace });
        if (vocabulary) return vocabulary;
      }
      if (request.method === "GET" && url.pathname === "/api/workspace") {
        return sendJson(200, projectGeodeWorkspace(workspace.snapshot));
      }
      if (request.method === "GET" && url.pathname === "/api/search") {
        return sendJson(200, { results: await workspace.search(url.searchParams.get("q") ?? "") });
      }
      if (request.method === "GET" && url.pathname === "/api/browse") {
        if (typeof workspace.browse !== "function") throw new RangeError("this workspace does not provide directory browsing");
        return sendJson(200, await workspace.browse(url.searchParams.get("prefix") ?? ""));
      }
      if (request.method === "GET" && url.pathname === "/api/concept") {
        if (typeof workspace.concept !== "function") throw new RangeError("this workspace does not index concepts");
        const name = url.searchParams.get("name");
        if (!name) throw new TypeError("name is required");
        return sendJson(200, await workspace.concept(name));
      }
      if (request.method === "GET" && url.pathname === "/api/concept-diagram") {
        if (typeof workspace.concept !== "function") throw new RangeError("this workspace does not index concepts");
        const name = url.searchParams.get("name");
        if (!name) throw new TypeError("name is required");
        const limitParam = url.searchParams.get("limit");
        const reading = await workspace.concept(name);
        const diagram = conceptDiagram(reading, limitParam === null ? {} : { limit: Number(limitParam) });
        return sendJson(200, {
          name: reading.name,
          mermaid: writeMermaid(diagram),
          nodes: diagram.objects.length,
          edges: diagram.morphisms.length,
          truncated: diagram.truncated,
        });
      }
      if (request.method === "GET" && url.pathname === "/api/concepts") {
        if (typeof workspace.conceptSummary !== "function") throw new RangeError("this workspace does not index concepts");
        return sendJson(200, await workspace.conceptSummary());
      }
      if (request.method === "POST" && url.pathname === "/api/graph/query") {
        if (typeof workspace.callGraphTool !== "function") throw new RangeError("this workspace does not expose its relation web");
        const offered = await readJson(request);
        if (!DREW_READ_TOOLS.has(offered.tool)) throw new TypeError("unknown graph tool");
        const result = await workspace.callGraphTool(offered.tool, offered.arguments ?? {});
        return sendJson(200, result.structuredContent);
      }
      if (request.method === "POST" && url.pathname === "/api/sparql") {
        if (typeof workspace.sparql !== "function") throw new RangeError("this workspace does not expose structured SPARQL");
        const offered = await readJson(request);
        if (!["select", "ask", "construct"].includes(offered.type)) throw new TypeError("type must be select, ask, or construct");
        return sendJson(200, await workspace.sparql(Object.freeze({
          kind: "knowing.sparql.query",
          type: offered.type,
          ...(offered.select === undefined ? {} : { select: Object.freeze([...offered.select]) }),
          where: sparqlPatterns(offered.where),
          ...(offered.construct === undefined ? {} : { construct: sparqlPatterns(offered.construct) }),
        }), { limit: offered.limit ?? 100 }));
      }
      if (request.method === "POST" && url.pathname === "/api/feltos") {
        if (typeof workspace.feltosSummary !== "function") throw new RangeError("this workspace does not expose a FeltOS graph composition");
        const offered = await readJson(request);
        if (offered.operation === "summary") return sendJson(200, await workspace.feltosSummary());
        if (offered.operation === "relations") return sendJson(200, await workspace.feltosRelations(offered.pattern ?? {}, { limit: offered.limit ?? 100 }));
        if (offered.operation === "entity") {
          if (typeof offered.term !== "string" || offered.term === "") throw new TypeError("term is required");
          return sendJson(200, await workspace.feltosEntity(offered.term, { predicate: offered.predicate, direction: offered.direction ?? "both", limit: offered.limit ?? 100 }));
        }
        if (offered.operation === "diagnostics") return sendJson(200, await workspace.feltosDiagnostics({ limit: offered.limit ?? 100 }));
        throw new TypeError("unknown FeltOS operation");
      }
      if (request.method === "GET" && url.pathname === "/api/relations") {
        if (typeof workspace.relations !== "function") throw new RangeError("this workspace derives backlinks with the document");
        const path = url.searchParams.get("path");
        if (!path) throw new TypeError("path is required");
        return sendJson(200, await workspace.relations(path));
      }
      if (request.method === "GET" && url.pathname === "/api/note") {
        const path = url.searchParams.get("path");
        if (!path) throw new TypeError("path is required");
        return sendJson(200, projectNote(await workspace.read(path)));
      }
      if (request.method === "POST" && url.pathname === "/api/action") {
        try {
          return sendJson(200, await performAction(workspace, await readJson(request)));
        } catch (error) {
          if (!(error instanceof GeodeRevisionConflict)) throw error;
          return sendJson(409, {
            id: "note-editor",
            title: "Edit refused",
            lifecycle: "imminent",
            live: "assertive",
            content: error.message,
            fields: { markdown: "The file changed outside this editing revision. Your draft was not written." },
            path: error.relativePath,
            expectedRevision: error.expectedRevision,
            currentRevision: error.currentRevision,
          });
        }
      }
      if (request.method === "POST" && url.pathname === "/api/refresh") {
        await workspace.refresh();
        return sendJson(200, projectGeodeWorkspace(workspace.snapshot));
      }
      if (request.method === "GET") {
        const asset = await serveStatic(publicDirectory, url.pathname);
        if (asset !== null) return asset;
      }
      return sendJson(404, { error: "not found" });
    } catch (error) {
      return sendError(error);
    }
  };
}

const GEODE_ROUTES = new Set([...STATIC_FILES.keys(), "/api/workspace", "/api/search", "/api/browse", "/api/concept", "/api/concept-diagram", "/api/concepts", "/api/graph/query", "/api/sparql", "/api/feltos", "/api/relations", "/api/note", "/api/action", "/api/refresh"]);

export function ownsGeodeRequest(request) {
  return GEODE_ROUTES.has(new URL(request.url).pathname) || ownsGeodeVocabularyRequest(request);
}

/** Mount Geode as a lower application in VICTOR's website runtime. */
export function createGeodeVictorApplicationFactory(options = {}) {
  const fetchHandler = createGeodeFetchHandler(options);
  return (context) => {
    if (!context || typeof context.fetchApplication !== "function") throw new TypeError("Geode requires a VICTOR application context");
    return context.fetchApplication(fetchHandler, {
      matches: ownsGeodeRequest,
    });
  };
}
