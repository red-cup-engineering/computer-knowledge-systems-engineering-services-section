import { sparqlTerm } from "@red-cup-engineering/computer-triplet-serialized-content-engineering-services-section/sparql-over-eavt";
import { projectCairnSnapshot } from "./markdown-vault.mjs";
import { handleVocabularyRequest, ownsVocabularyRequest } from "./vocabulary.mjs";
import { negotiateType } from "@red-cup-engineering/http-services-section/negotiation";
import { fragmentJson, fragmentJsonLd, fragmentTurtle } from "@red-cup-engineering/http-services-section/triple-pattern-fragments";

const FRAGMENTS_PATH = "/fragments";
const FRAGMENT_TYPES = Object.freeze(["application/ld+json", "text/turtle", "application/json"]);

/** The tellings as Triple Pattern Fragments (Linked Data Fragments), negotiated between JSON-LD, Turtle and JSON. */
async function handleFragmentsRequest(request, archive) {
  const url = new URL(request.url);
  const number = (key) => url.searchParams.has(key) ? Number.parseInt(url.searchParams.get(key), 10) : undefined;
  const base = `${url.origin}/`;
  const page = await archive.fragment({ s: url.searchParams.get("s") ?? undefined, p: url.searchParams.get("p") ?? undefined, o: url.searchParams.get("o") ?? undefined,
    page: number("page"), limit: number("limit"), base, path: FRAGMENTS_PATH });
  const type = negotiateType(request.headers.get("accept") ?? undefined, FRAGMENT_TYPES) ?? "application/json";
  const body = type === "text/turtle" ? fragmentTurtle(page, { base })
    : `${JSON.stringify(type === "application/ld+json" ? fragmentJsonLd(page, { base }) : fragmentJson(page), null, 2)}\n`;
  return new Response(body, { status: 200, headers: { "content-type": `${type}; charset=utf-8`, vary: "Accept" } });
}

/**
 * CAIRN's HTTP API: the archive over fetch, and its terms and predicates as dereferenceable
 * `/ns/` IRIs, for any web-server mount (VICTOR, the house web
 * server) and for the interfaces built on it. JSON in and out; a RangeError is 404, a TypeError
 * 400, a revision conflict 409.
 */

function sendJson(status, value, headers = {}) {
  return new Response(`${JSON.stringify(value)}\n`, { status, headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", ...headers } });
}

export async function readJson(request, { limit = 4 * 1024 * 1024 } = {}) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > limit) throw new RangeError("request body is too large");
  let value;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new TypeError("request body must be JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("request body must be a JSON object");
  return value;
}

/** SPARQL triple patterns from `{s, p, o}` objects, `?name` strings read as variables. */
export function sparqlPatterns(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 4) throw new TypeError("where and construct must contain from one through four triple patterns");
  return Object.freeze(values.map((pattern) => {
    if (!pattern || typeof pattern !== "object" || Array.isArray(pattern) || !("s" in pattern) || !("p" in pattern) || !("o" in pattern)) throw new TypeError("each triple pattern requires s, p, and o");
    return Object.freeze({ s: sparqlTerm(pattern.s), p: sparqlTerm(pattern.p), o: sparqlTerm(pattern.o) });
  }));
}

const GET = new Map([
  ["/api/workspace", (archive) => projectCairnSnapshot(archive.snapshot)],
  ["/api/search", (archive, query) => archive.search(query.get("q") ?? "", { mode: query.get("mode") ?? "metadata", limit: Number(query.get("limit") ?? 100) }).then((results) => ({ results }))],
  ["/api/names", (archive, query) => archive.names(required(query, "name"), { prefix: query.get("prefix") === "true" }).then((results) => ({ results }))],
  ["/api/browse", (archive, query) => archive.browse(query.get("prefix") ?? "")],
  ["/api/document", (archive, query) => archive.read(required(query, "path"))],
  ["/api/relations", (archive, query) => archive.relations(required(query, "path"))],
  ["/api/statements", (archive, query) => archive.statements(required(query, "path"))],
  ["/api/concept", async (archive, query) => {
    const name = required(query, "name");
    const [said, saying] = await Promise.all([archive.cellsAbout({ name, role: "subject" }), archive.cellsAbout({ name, role: "object" })]);
    return { name, said: said.groups, saying: saying.groups };
  }],
  ["/api/concepts", (archive) => archive.summary()],
  ["/api/readings", (archive, query) => archive.readings(required(query, "name"))],
  ["/api/questions", (archive, query) => archive.questions({ prefix: query.get("prefix") ?? "", limit: Number(query.get("limit") ?? 50) })],
  ["/api/similar", (archive, query) => archive.similar(required(query, "path")).then((results) => ({ results }))],
]);
const POST = new Map([
  ["/api/sparql", async (archive, request) => {
    const offered = await readJson(request);
    if (!["select", "ask", "construct"].includes(offered.type)) throw new TypeError("type must be select, ask, or construct");
    return archive.sparql(Object.freeze({ kind: "knowing.sparql.query", type: offered.type,
      ...(offered.select === undefined ? {} : { select: Object.freeze([...offered.select]) }),
      where: sparqlPatterns(offered.where),
      ...(offered.construct === undefined ? {} : { construct: sparqlPatterns(offered.construct) }),
    }), { limit: offered.limit ?? 100 });
  }],
  ["/api/refresh", async (archive) => { await archive.refresh(); return projectCairnSnapshot(archive.snapshot); }],
]);

function required(query, key) {
  const value = query.get(key);
  if (!value) throw new TypeError(`${key} is required`);
  return value;
}

/** Whether CAIRN's API answers this request. */
export function ownsCairnRequest(request) {
  const { pathname } = new URL(request.url);
  return ownsVocabularyRequest(request) || (request.method === "GET" && (GET.has(pathname) || pathname === FRAGMENTS_PATH)) || (request.method === "POST" && POST.has(pathname));
}

/** CAIRN's API as a fetch handler over one archive (`openArchive`). */
export function createCairnFetchHandler({ archive } = {}) {
  if (!archive || archive.type !== "CairnArchive") throw new TypeError("archive must be a CAIRN archive");
  return async function handleCairnRequest(request) {
    try {
      const url = new URL(request.url);
      if (ownsVocabularyRequest(request)) return await handleVocabularyRequest(request, { archive });
      if (request.method === "GET" && url.pathname === FRAGMENTS_PATH) return await handleFragmentsRequest(request, archive);
      const route = request.method === "GET" ? GET.get(url.pathname) : request.method === "POST" ? POST.get(url.pathname) : undefined;
      if (!route) return sendJson(404, { error: "not found" });
      return sendJson(200, await route(archive, request.method === "GET" ? url.searchParams : request));
    } catch (error) {
      if (error?.name === "MarkdownFileRevisionConflict" || error?.expectedRevision !== undefined) return sendJson(409, { error: error.message, path: error.relativePath, expectedRevision: error.expectedRevision, currentRevision: error.currentRevision });
      const status = error instanceof RangeError ? 404 : error instanceof TypeError ? 400 : 500;
      return sendJson(status, { error: status === 500 ? "internal error" : error.message });
    }
  };
}
