/**
 * The nested router is deliberately only a planner.  It says which existing
 * form owns a smallest safe unit; it never copies, extracts, or repairs it.
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { isGenerated } from "./detect.mjs";
import { walkOrderedTree } from "./inventory.mjs";

export const routerSchemaVersion = "corpus-normalizer.router.v1";
const textExtensions = new Set([".md", ".mdx", ".org", ".txt", ".rst", ".html", ".tex"]);
const archiveExtensions = /\.(?:tgz|tar\.gz|tar)$/i;
const forbiddenRoots = new Set(["recovered-research", "provenance", "process", "processes"]);
const slash = value => value.split(path.sep).join("/");
// Code-unit ordering is locale-independent, and hence stable across hosts.
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const id = (form, key) => `task:${form}:${createHash("sha256").update(`${form}\0${key}`).digest("hex").slice(0, 20)}`;
const under = (parts, sequence) => sequence.every((part, index) => parts[index] === part);
const isDescendant = (candidate, root) => candidate === root || candidate.startsWith(`${root}/`);
function nearestAncestorTask(relative, roots) {
  let candidate = relative;
  while (candidate && candidate !== ".") {
    const found = roots.get(candidate); if (found) return found;
    const index = candidate.lastIndexOf("/"); candidate = index < 0 ? "." : candidate.slice(0, index);
  }
  return null;
}
async function hasProjectManifest(directory) {
  for (const name of ["package.json", "pyproject.toml", "Cargo.toml", "go.mod"]) {
    try { if ((await lstat(path.join(directory, name))).isFile()) return true; } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return false;
}

function assertLimit(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer`);
}
/** Validate a materialized route stream without reading or mutating its paths. */
export function validateRouteRecords(records) {
  const errors = []; let index = 0; let headers = 0;
  for (const record of records) {
    if (!record || record.schema !== routerSchemaVersion) errors.push(`record ${index} has an unsupported schema`);
    if (record?.kind === "header") {
      headers += 1;
      if (index !== 0) errors.push("route header must be the first record");
      if (!record.sourceRoot || !record.destination || !record.options) errors.push("route header requires sourceRoot, destination, and options");
    }
    index += 1;
  }
  if (headers !== 1) errors.push(`route requires exactly one header; found ${headers}`);
  return { valid: errors.length === 0, errors, records: index };
}
export const validateRoutePlan = validateRouteRecords;
function task(form, key, destination, sourcePaths, reason, preconditions = [], status = "supported") {
  return { schema: routerSchemaVersion, kind: "task", id: id(form, key), form, destination, sourcePaths: [...sourcePaths].sort(lexical), reason, preconditions, status };
}
function pathParts(relative) { return relative === "." ? [] : slash(relative).split("/"); }
function modeledForm(relative) {
  const parts = pathParts(relative);
  if (under(parts, ["content", "text", "glossary", "terms"]) || under(parts, ["content", "text", "glossary", "topics"])) return "term";
  if (under(parts, ["content", "text", "triage"])) return "triage-text";
  if (under(parts, ["content", "text", "documents", "articles", "notes"])) return "note";
  if (under(parts, ["content", "text", "documents", "articles", "bibliographies", "sources"])) return "reference-source";
  return null;
}
async function evidenceForm(entry) {
  const ext = path.extname(entry.relativePath).toLowerCase();
  if (!textExtensions.has(ext)) return null;
  // Evidence is bounded: routing must not turn a very large alleged text file
  // into an unbounded parser just to find a convenient destination.
  if (entry.size > 1024 * 1024) return null;
  const source = await readFile(entry.absolutePath, "utf8");
  if (/^#\+\s*(?:name|index):\s*\S/im.test(source) || /^---[\s\S]{0,16384}?^(?:defines|name):\s*\S/im.test(source)) return "term";
  if (/(?:^|\n)(?:#\+date:|date(?:-created)?:\s*\d{4}-\d{2}-\d{2})/im.test(source) || /(?:^|[-_])\d{4}-\d{2}-\d{2}(?:[-_]|$)/.test(path.basename(entry.relativePath))) return "note";
  return null;
}
async function isBibliographyInput(entry) {
  const ext = path.extname(entry.relativePath).toLowerCase();
  if (ext === ".bib") return true;
  if (!new Set([".md", ".org"]).has(ext) || entry.size > 1024 * 1024) return false;
  const source = await readFile(entry.absolutePath, "utf8");
  return ext === ".org"
    ? /^#\+citation-key:\s*\S/im.test(source) && /^#\+bibtex-type:\s*\S/im.test(source)
    : /^---[\s\S]{0,16384}?^citation-key:\s*\S[\s\S]{0,16384}?^bibtex-type:\s*\S/im.test(source);
}

/**
 * Stream a deterministic routing plan.  `destination` must be the authority
 * root of a service section; all child destinations are derived from it.
 */
export async function* routePlan(source, destination, options = {}) {
  const maxRecords = options.maxRecords ?? 100000;
  const maxTasks = options.maxTasks ?? 10000;
  const chunkSize = options.chunkSize ?? 128;
  assertLimit("maxRecords", maxRecords); assertLimit("maxTasks", maxTasks); assertLimit("chunkSize", chunkSize);
  const sourceRoot = path.resolve(source); const destinationRoot = path.resolve(destination);
  if (!path.basename(destinationRoot).endsWith("-services-section")) throw new Error("nested router destination must end with -services-section");
  const rootStat = await lstat(sourceRoot);
  if (!rootStat.isDirectory()) throw new Error("nested router source must be a directory");
  const entries = [{ absolutePath: sourceRoot, relativePath: ".", type: "directory", size: rootStat.size }];
  for await (const item of walkOrderedTree(sourceRoot, { chunkSize, shouldTraverse: entry => !isGenerated(entry.path) })) {
    if (entries.length >= maxRecords) throw new Error(`routing inventory exceeds maxRecords (${maxRecords})`);
    const stat = await lstat(item.absolutePath);
    entries.push({ absolutePath: item.absolutePath, relativePath: slash(item.path), type: item.type, size: stat.size });
  }

  // This header is deliberately outside the inventory budget: maxRecords
  // bounds source paths, while the header describes the resulting stream.
  yield { schema: routerSchemaVersion, kind: "header", sourceRoot, destination: destinationRoot, options: { maxRecords, maxTasks, chunkSize } };

  // The plan intentionally retains at most maxRecords entries and maxTasks
  // tasks.  Those explicit limits are the honest memory bound for grouping.
  const tasks = []; const add = candidate => { if (tasks.length >= maxTasks) throw new Error(`routing plan exceeds maxTasks (${maxTasks})`); tasks.push(candidate); return candidate; };
  const directoryTasks = new Map();
  // Cohesive directories win before their descendants are considered.  This
  // is the essential partitioning rule: package and service boundaries are not
  // flattened into faux text tasks.
  for (const entry of entries) {
    if (entry.type !== "directory" || entry.relativePath === ".") continue;
    const parts = pathParts(entry.relativePath); const name = parts.at(-1); const parent = parts.at(-2);
    let candidate = null;
    if (forbiddenRoots.has(name)) candidate = task("invalid", entry.relativePath, null, [entry.relativePath], "recovered-research, provenance, and process trees require explicit policy", ["explicit routing policy"], "invalid");
    else if (parent === "services" && name.endsWith("-services-section")) candidate = task("service-section", entry.relativePath, path.join(destinationRoot, "services", name), [entry.relativePath], "nested services section is a cohesive unit", ["service-section handler validates source root"]);
    else if (parent === "apps" && await hasProjectManifest(entry.absolutePath)) candidate = task("application", entry.relativePath, path.join(destinationRoot, "apps", name), [entry.relativePath], "application directory is a cohesive package", ["application handler validates package"]);
    else if (parent === "apps") candidate = task("invalid", entry.relativePath, null, [entry.relativePath], "apps/name is not a package without an explicit project manifest", ["explicit routing policy or package manifest"], "invalid");
    if (candidate) directoryTasks.set(entry.relativePath, add(candidate));
  }
  const bibliography = [];
  for (const entry of entries) {
    if (entry.relativePath === "." || entry.type === "directory" || nearestAncestorTask(entry.relativePath, directoryTasks)) continue;
    const base = path.basename(entry.relativePath).toLowerCase();
    if (entry.type === "symlink" || entry.type !== "file") { add(task("invalid", entry.relativePath, null, [entry.relativePath], "symlinks and special filesystem nodes have no safe corpus representation", [], "invalid")); continue; }
    if (await isBibliographyInput(entry)) { bibliography.push(entry.relativePath); continue; }
    if (archiveExtensions.test(base)) { add(task("archive-inspect", entry.relativePath, null, [entry.relativePath], "archive must be safely expanded into a temporary root and recursively rerouted", ["safe temporary expansion", "recursive routePlan on extracted root"])); continue; }
    if (/\.zip$/i.test(base)) { add(task("invalid", entry.relativePath, null, [entry.relativePath], "zip is not a supported archive carrier; archive inspection accepts tar or tgz only", ["explicit zip policy"], "invalid")); continue; }
    if (isGenerated(entry.relativePath)) continue;
    let form = modeledForm(entry.relativePath);
    if (!form) form = await evidenceForm(entry);
    if (form) add(task(form, entry.relativePath, form === "term" ? path.join(destinationRoot, "content", "text", "glossary", "terms") : form === "triage-text" ? path.join(destinationRoot, "content", "text", "triage") : form === "reference-source" ? path.join(destinationRoot, "content", "text", "documents", "articles", "bibliographies", "sources") : path.join(destinationRoot, "content", "text", "documents", "articles", "notes"), [entry.relativePath], form === "term" ? "explicit glossary path or term identity metadata" : form === "note" ? "explicit notes path or date evidence" : form === "reference-source" ? "explicit reference-source path" : "explicit triage path", [`${form} form handler` ]));
    else add(task("invalid", entry.relativePath, null, [entry.relativePath], textExtensions.has(path.extname(entry.relativePath).toLowerCase()) ? "ambiguous text has no modeled path or explicit identity evidence" : "unknown binary or reference representation is not invented into a form", ["explicit routing policy"], "invalid"));
  }
  if (bibliography.length) add(task("bibliography", "bibliography.bib", path.join(destinationRoot, "bibliography.bib"), bibliography, "BibTeX or explicit citation-key plus bibtex-type metadata is aggregated by the bibliography handler", ["bibliography aggregate handler"]));
  const taskRoots = new Map(directoryTasks);
  for (const candidate of tasks) for (const sourcePath of candidate.sourcePaths) taskRoots.set(sourcePath, candidate);
  tasks.sort((a, b) => lexical(a.id, b.id));
  for (const candidate of tasks) yield candidate;
  // The accounting stream is emitted after tasks so a consumer can index task
  // ids without buffering the inventory.  Every record has exactly one owner.
  for (const entry of entries) {
    const owner = nearestAncestorTask(entry.relativePath, taskRoots);
    const generated = entry.relativePath !== "." && isGenerated(entry.relativePath);
    yield { schema: routerSchemaVersion, kind: "accounting", path: entry.relativePath, sourcePath: entry.absolutePath, inputType: entry.type, membership: generated ? { excluded: "generated-output" } : owner ? { taskId: owner.id } : { accounted: "container" } };
  }
}

export const route = routePlan;
export const planRoute = routePlan;
export async function collectRoutePlan(source, destination, options) { const records = []; for await (const record of routePlan(source, destination, options)) records.push(record); return records; }
export async function writeRoutePlan(source, destination, output, options) {
  const writer = createWriteStream(output, { encoding: "utf8" });
  try { for await (const record of routePlan(source, destination, options)) if (!writer.write(`${JSON.stringify(record)}\n`)) await new Promise(resolve => writer.once("drain", resolve)); await new Promise((resolve, reject) => writer.end(resolve).once("error", reject)); } catch (error) { writer.destroy(); throw error; }
}
export const writeRoute = writeRoutePlan;
