import { isAbsolute, normalize, relative, sep } from "node:path";
import { createGeodeWorkspace } from "./workspace.mjs";
import { renderTufteDocument } from "@red-cup-engineering/web-page-tiling-engine";

function record(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value;
}

function nonEmptyString(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value;
}

function admittedRegion(value) {
  if (typeof value !== "string") throw new TypeError("region must be a string");
  if (value === "") return "";
  if (isAbsolute(value) || value.split(/[\\/]/u).includes("..") || normalize(value) !== value) {
    throw new RangeError("region must be a normalized relative path within root");
  }
  return value;
}

function stringArray(value, path) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`${path} must be an array of strings`);
  }
  return Object.freeze([...value]);
}

function immutableJson(value, path = "victorRelease") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain finite JSON numbers`);
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map((entry, index) => immutableJson(entry, `${path}[${index}]`)));
  const offered = record(value, path);
  const copied = {};
  for (const [key, entry] of Object.entries(offered)) copied[key] = immutableJson(entry, `${path}.${key}`);
  return Object.freeze(copied);
}

/**
 * Keep Victor at a release-metadata boundary. This accepts a plain immutable
 * release record without importing Victor's application barrel or asking an
 * authoring client to know how a release was built.
 */
export function adaptVictorReleaseMetadata(release) {
  if (release === undefined || release === null) return null;
  return immutableJson(release);
}

/** Validate the one admitted filesystem boundary for a browser authoring session. */
/** A file the archive keeps between processes (its document observations, its full-text index): an absolute path, or none. */
function stateFile(value, field) {
  if (value === undefined || value === null) return null;
  const file = nonEmptyString(value, field);
  if (!isAbsolute(file)) throw new RangeError(`${field} must be an absolute path`);
  return normalize(file);
}

export function validateGeodeAuthoringConfig(offered) {
  const config = record(offered, "authoring config");
  const allowed = new Set(["root", "region", "excludes", "observations", "fullText", "victorRelease"]);
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) throw new TypeError(`authoring config has unknown field: ${key}`);
  }
  const root = nonEmptyString(config.root, "root");
  if (!isAbsolute(root)) throw new RangeError("root must be an absolute path");
  const normalizedRoot = normalize(root);
  const region = admittedRegion(config.region ?? "");
  // This also rejects a platform-specific region which resolves outside root.
  if (region !== "" && relative(normalizedRoot, normalize(`${normalizedRoot}${sep}${region}`)).split(sep).includes("..")) {
    throw new RangeError("region must remain within root");
  }
  return Object.freeze({
    root: normalizedRoot,
    region,
    excludes: stringArray(config.excludes ?? [], "excludes"),
    observations: stateFile(config.observations, "observations"),
    fullText: stateFile(config.fullText, "fullText"),
    victorRelease: adaptVictorReleaseMetadata(config.victorRelease),
  });
}

function requireReading(reading) {
  if (
    reading === null || typeof reading !== "object" || reading.type !== "CairnDocumentReading"
    || typeof reading.path !== "string" || typeof reading.title !== "string"
    || typeof reading.markdown !== "string" || typeof reading.revision !== "string"
  ) {
    throw new TypeError("reading must be a CAIRN document reading");
  }
  return reading;
}

/** Project one admitted Geode reading into TUFTE's portable editor-document model. */
export function projectGeodeEditorDocument(reading, { victorRelease = null } = {}) {
  requireReading(reading);
  const release = adaptVictorReleaseMetadata(victorRelease);
  return Object.freeze({
    kind: "tufte.projection",
    schemaVersion: "geode-editor-document/v1",
    title: reading.title,
    subtitle: reading.path,
    eyebrow: "GEODE authoring",
    revision: reading.revision,
    ...(release === null ? {} : { victorRelease: release }),
    tiles: Object.freeze([
      Object.freeze({
        id: "document-preview",
        title: "Preview",
        role: "now",
        span: 8,
        // Geode is the sole Markdown-to-HTML authority. TUFTE owns the enclosing document.
        html: reading.html,
      }),
      Object.freeze({
        id: "document-source",
        title: "Source",
        role: "aside",
        span: 4,
        form: Object.freeze({
          id: "replace-document",
          // A same-origin path, not a URI scheme: TUFTE's admitTufteUrl resolves a form
          // action against the document origin for both the native-fallback submit and the
          // enhanced-forms same-origin check, so a bare "geode:..." string parses as an
          // (inadmissible) opaque-origin URI instead of naming this action.
          action: "/geode:replace-document/v1",
          method: "post",
          revision: reading.revision,
          fields: Object.freeze([Object.freeze({
            id: "markdown", name: "markdown", kind: "textarea", label: "Markdown", value: reading.markdown,
            required: true,
          })]),
          submitters: Object.freeze([Object.freeze({ id: "replace", label: "Save revision", kind: "submit" })]),
        }),
      }),
    ]),
  });
}

/** Render the editor projection with TUFTE without giving TUFTE write authority. */
export function renderGeodeEditorDocument(reading, options = {}) {
  const projection = projectGeodeEditorDocument(reading, { victorRelease: options.victorRelease });
  return renderTufteDocument(projection, {
    documentTitle: options.documentTitle ?? `${reading.title} — GEODE`,
    ...(options.actionEndpoint === undefined ? {} : { actionEndpoint: options.actionEndpoint }),
  });
}

/**
 * Construct a root- and region-bound authoring capability. Paths are never
 * accepted at construction again, so callers can only read or replace notes
 * that Geode admitted from this fixed workspace snapshot.
 */
export async function createGeodeAuthoring(offeredConfig) {
  const config = validateGeodeAuthoringConfig(offeredConfig);
  const workspace = await createGeodeWorkspace({
    root: config.root,
    region: config.region,
    excludes: config.excludes,
    observations: config.observations,
    fullText: config.fullText,
  });
  return Object.freeze({
    type: "GeodeAuthoring",
    schemaVersion: "geode-authoring/v1",
    get snapshot() { return workspace.snapshot; },
    get paths() { return workspace.paths; },
    /** The CAIRN archive the workbench reads, for other faces over the same checkout. */
    get archive() { return workspace.archive; },
    completeSnapshot(options) { return workspace.completeSnapshot(options); },
    browse(prefix, options) { return workspace.browse(prefix, options); },
    relations(path) { return workspace.relations(path); },
    get victorRelease() { return config.victorRelease; },
    read(path) { return workspace.read(path); },
    search(query, options) { return workspace.search(query, options); },
    replace(request) { return workspace.replace(request); },
    refresh() { return workspace.refresh(); },
    concept(name) { return workspace.concept(name); },
    conceptSummary() { return workspace.conceptSummary(); },
    callGraphTool(name, args) { return workspace.callGraphTool(name, args); },
    sparql(query, options) { return workspace.sparql(query, options); },
    feltosSummary() { return workspace.feltosSummary(); },
    feltosRelations(pattern, options) { return workspace.feltosRelations(pattern, options); },
    feltosEntity(term, options) { return workspace.feltosEntity(term, options); },
    feltosDiagnostics(options) { return workspace.feltosDiagnostics(options); },
    async editorDocument(path) {
      return projectGeodeEditorDocument(await workspace.read(path), { victorRelease: config.victorRelease });
    },
    async renderEditorDocument(path, options) {
      return renderGeodeEditorDocument(await workspace.read(path), {
        ...options,
        victorRelease: config.victorRelease,
      });
    },
  });
}
