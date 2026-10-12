import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GeodeRevisionConflict, projectGeodeWorkspace } from "./workspace.mjs";
import { projectGeodeEditor } from "./tufte.mjs";
import { cellsDiagram, writeMermaid } from "./concept-diagram.mjs";
import { createCairnFetchHandler, ownsCairnRequest, readJson } from "@red-cup-engineering/knowledge-system-server/server";
import { fetchApplication } from "@red-cup-engineering/computer-web-server/compose";

const DEFAULT_PUBLIC_DIRECTORY = fileURLToPath(new URL("../public/", import.meta.url));
const DEFAULT_TUFTE_BROWSER_FILE = fileURLToPath(import.meta.resolve("@red-cup-engineering/web-page-tiling-engine/browser"));
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

/**
 * GEODE over fetch: the note as TUFTE shows and edits it, the concept diagram, and the browser
 * application; every other archive route is CAIRN's API over the same archive.
 */
export function createGeodeFetchHandler({ workspace, publicDirectory = DEFAULT_PUBLIC_DIRECTORY, basePath = "" } = {}) {
  if (!workspace || typeof workspace.read !== "function") throw new TypeError("workspace is required");
  const cairn = createCairnFetchHandler({ archive: workspace.archive });
  return async function handleGeodeRequest(request) {
    try {
      let url = new URL(request.url);
      if (basePath) {
        if (!url.pathname.startsWith(`${basePath}/`)) return sendJson(404, { error: "not found" });
        url.pathname = url.pathname.slice(basePath.length);
        request = new Request(url, request);
      }
      if (request.method === "GET" && url.pathname === "/api/concept-diagram") {
        const name = url.searchParams.get("name");
        if (!name) throw new TypeError("name is required");
        const limitParam = url.searchParams.get("limit");
        const focus = (await workspace.names(name))[0]?.path ?? name;
        const [said, saying] = await Promise.all([workspace.cellsAbout({ path: focus, role: "subject" }), workspace.cellsAbout({ path: focus, role: "object" })]);
        const diagram = cellsDiagram({ focus, cells: [...said.groups[0].cells, ...saying.groups[0].cells] }, limitParam === null ? {} : { limit: Number(limitParam) });
        return sendJson(200, { name, focus, mermaid: writeMermaid(diagram), nodes: diagram.objects.length, edges: diagram.morphisms.length, truncated: diagram.truncated });
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
      if (ownsCairnRequest(request)) return cairn(request);
      if (request.method === "GET") {
        const asset = await serveStatic(publicDirectory, url.pathname);
        if (asset !== null) {
          if (basePath && (url.pathname === "/" || url.pathname === "/index.html")) {
            const html = (await asset.text()).replaceAll('="/', `="${basePath}/`)
              .replace("<head>", `<head><base href="${basePath}/">`)
              .replace("data-tufte ", `data-tufte data-api-prefix="${basePath}" `);
            return new Response(html, { status: asset.status, headers: asset.headers });
          }
          return asset;
        }
      }
      return sendJson(404, { error: "not found" });
    } catch (error) {
      return sendError(error);
    }
  };
}

const GEODE_ROUTES = new Set([...STATIC_FILES.keys(), "/api/concept-diagram", "/api/note", "/api/action"]);

export function ownsGeodeRequest(request) {
  return GEODE_ROUTES.has(new URL(request.url).pathname) || ownsCairnRequest(request);
}

/** GEODE as an application of the one web server: its routes and CAIRN's, over one workspace. */
export function geodeApplication(options = {}) {
  const basePath = options.basePath ?? "";
  if (basePath && !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u.test(basePath)) throw new TypeError("basePath must be a normalized route prefix");
  return fetchApplication(createGeodeFetchHandler(options), { matches: (request) => {
    if (!basePath) return ownsGeodeRequest(request);
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${basePath}/`)) return false;
    url.pathname = url.pathname.slice(basePath.length);
    return ownsGeodeRequest(new Request(url, { method: request.method }));
  } });
}

/** GEODE mounted beside a VICTOR website (the same application; VICTOR's context is not needed). */
export function createGeodeVictorApplicationFactory(options = {}) {
  return () => geodeApplication(options);
}
