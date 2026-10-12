/**
 * A read-only, lexical comparison of two authored trees.  This reports byte and
 * syntax evidence; it deliberately makes no claim that two changed programs or
 * documents mean the same thing.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { isGenerated } from "./detect.mjs";
import { formFor } from "./forms.mjs";
import { orderedEntries } from "./inventory.mjs";

const DEFAULT_MAX_CHANGED_TEXT_BYTES = 256 * 1024;
const DEFAULT_MAX_RECORDS = 10_000;
const textExtensions = new Set([".md", ".mdx", ".org", ".txt", ".rst", ".html", ".htm", ".css", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".xml", ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx", ".py"]);
const codeExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".tsx", ".jsx", ".py"]);

const slash = (value) => value.split(path.sep).join("/");
const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sorted = (values) => [...values].sort(compareCodeUnits);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const normalizedText = (value) => value.replace(/\r\n?/g, "\n");
const lineCount = (value) => value === "" ? 0 : (value.endsWith("\n") ? value.slice(0, -1) : value).split("\n").length;
const decodeUtf8 = (value) => new TextDecoder("utf-8", { fatal: true }).decode(value);

function regularType(stat) {
  if (stat.isFile()) return "file";
  if (stat.isDirectory()) return "directory";
  if (stat.isSymbolicLink()) return "symlink";
  return "other";
}

async function digest(file) {
  const result = createHash("sha256");
  for await (const chunk of createReadStream(file)) result.update(chunk);
  return result.digest("hex");
}

function resolveInclude(options, root) {
  if (options.includeGenerated === true) return () => true;
  const requested = options.form;
  const form = typeof requested === "string" ? formFor(requested) : requested;
  const handler = form && typeof form.includeExisting === "function" ? form :
    path.basename(path.resolve(root)).endsWith("-services-section") ? formFor("service-section") : formFor("application");
  return handler?.includeExisting ?? ((entry) => !isGenerated(entry.path));
}

async function* authoredInventory(root, options) {
  const absoluteRoot = path.resolve(root);
  const rootStat = await lstat(absoluteRoot);
  if (regularType(rootStat) !== "directory") throw new Error(`unsupported tree root: ${root}`);
  const include = resolveInclude(options, absoluteRoot);
  async function* visit(directory, relative = "") {
    for await (const item of orderedEntries(directory, options.chunkSize ?? 128, options.stats ?? null)) {
      const name = item.name;
      const absolutePath = path.join(directory, name);
      const relativePath = path.join(relative, name);
      const stat = await lstat(absolutePath);
      const type = regularType(stat);
      const entry = { path: slash(relativePath), absolutePath, type, mode: stat.mode & 0o777, size: stat.size };
      if (!include(entry)) continue;
      if (!['file', 'directory'].includes(type)) throw new Error(`unsupported tree node: ${entry.path}`);
      if (type === "file") entry.hash = await digest(absolutePath);
      yield entry;
      if (type === "directory") yield* visit(absolutePath, relativePath);
    }
  }
  yield* visit(absoluteRoot);
}

function setDelta(candidate, live) {
  const candidateSet = new Set(candidate); const liveSet = new Set(live);
  return { additions: sorted([...candidateSet].filter((value) => !liveSet.has(value))), removals: sorted([...liveSet].filter((value) => !candidateSet.has(value))) };
}

function flattenJson(value, prefix = "", output = new Map()) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) { output.set(prefix || "$", JSON.stringify(value)); return output; }
  const keys = Object.keys(value).sort(compareCodeUnits);
  if (!keys.length) output.set(prefix || "$", "{}");
  for (const key of keys) flattenJson(value[key], prefix ? `${prefix}.${key}` : key, output);
  return output;
}

function jsonEvidence(candidate, live) {
  try {
    const candidateValues = flattenJson(JSON.parse(candidate)); const liveValues = flattenJson(JSON.parse(live));
    const additions = sorted([...candidateValues.keys()].filter((key) => !liveValues.has(key)));
    const removals = sorted([...liveValues.keys()].filter((key) => !candidateValues.has(key)));
    const changes = sorted([...candidateValues.keys()].filter((key) => liveValues.has(key) && candidateValues.get(key) !== liveValues.get(key)));
    return { json: { additions, removals, changes } };
  } catch { return { json: { parseError: true } }; }
}

function objectDelta(candidate = {}, live = {}) {
  const asObject = (value) => value === undefined ? {} : value && typeof value === "object" && !Array.isArray(value) ? value : { $: value };
  const candidateObject = asObject(candidate); const liveObject = asObject(live);
  const additions = {}; const removals = {}; const changes = {};
  for (const key of sorted(Object.keys(candidateObject))) {
    if (!(key in liveObject)) additions[key] = candidateObject[key];
    else if (JSON.stringify(candidateObject[key]) !== JSON.stringify(liveObject[key])) changes[key] = { candidate: candidateObject[key], live: liveObject[key] };
  }
  for (const key of sorted(Object.keys(liveObject))) if (!(key in candidateObject)) removals[key] = liveObject[key];
  return { additions, removals, changes };
}

function packageEvidence(candidate, live) {
  try {
    const c = JSON.parse(candidate); const l = JSON.parse(live);
    const detail = { name: { candidate: c.name ?? null, live: l.name ?? null }, version: { candidate: c.version ?? null, live: l.version ?? null } };
    for (const key of ["scripts", "dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "bin", "exports"]) if (c[key] !== undefined || l[key] !== undefined) detail[key] = objectDelta(c[key], l[key]);
    return { package: detail };
  } catch { return { package: { parseError: true } }; }
}

function symbols(source, extension) {
  const imports = new Set(); const exports = new Set(); const definitions = new Set();
  if (extension === ".py") {
    for (const match of source.matchAll(/^\s*(?:from\s+([\w.]+)\s+import\s+([^#\n]+)|import\s+([^#\n]+))/gm)) imports.add(match[1] ? `${match[1]}:${match[2].trim()}` : match[3].trim());
    for (const match of source.matchAll(/^\s*(?:async\s+def|def|class)\s+([A-Za-z_]\w*)/gm)) definitions.add(match[1]);
  } else {
    for (const match of source.matchAll(/\b(?:import\s+(?:[^'";]+?\s+from\s+)?|require\()\s*[(']([^'")]+)['"]/g)) imports.add(match[1]);
    for (const match of source.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)|\bexport\s*\{([^}]+)\}/g)) { if (match[1]) exports.add(match[1]); if (match[2]) for (const name of match[2].split(",")) exports.add(name.trim().split(/\s+as\s+/)[0]); }
    for (const match of source.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm)) definitions.add(match[1]);
  }
  return { imports: sorted(imports), exports: sorted(exports), definitions: sorted(definitions) };
}

function symbolEvidence(candidate, live, extension) {
  const c = symbols(candidate, extension); const l = symbols(live, extension);
  return { symbols: { imports: setDelta(c.imports, l.imports), exports: setDelta(c.exports, l.exports), definitions: setDelta(c.definitions, l.definitions) } };
}

async function changedEvidence(candidate, live, maxChangedTextBytes) {
  const extension = path.extname(candidate.path).toLowerCase();
  const evidence = { hashes: { candidate: candidate.hash, live: live.hash } };
  if (!textExtensions.has(extension)) return evidence;
  if (candidate.size > maxChangedTextBytes || live.size > maxChangedTextBytes) return { ...evidence, bounded: false, reason: "maxChangedTextBytes" };
  let candidateRaw; let liveRaw;
  try { [candidateRaw, liveRaw] = (await Promise.all([readFile(candidate.absolutePath), readFile(live.absolutePath)])).map(decodeUtf8); }
  catch { return { ...evidence, bounded: false, reason: "invalid-text" }; }
  const candidateText = normalizedText(candidateRaw); const liveText = normalizedText(liveRaw);
  Object.assign(evidence, { bounded: true, normalizedTextHashes: { candidate: hash(candidateText), live: hash(liveText) }, lineCounts: { candidate: lineCount(candidateText), live: lineCount(liveText) } });
  if (extension === ".json") Object.assign(evidence, jsonEvidence(candidateText, liveText));
  if (path.basename(candidate.path) === "package.json") Object.assign(evidence, packageEvidence(candidateText, liveText));
  if (codeExtensions.has(extension)) Object.assign(evidence, symbolEvidence(candidateText, liveText, extension));
  return evidence;
}

function relation(summary) {
  if (summary.changedContent || summary.changedModeType) return "divergent";
  if (!summary.candidateOnly && !summary.liveOnly) return "exact-tree";
  if (!summary.candidateOnly && !summary.exact) return "live-only-superset";
  if (!summary.candidateOnly) return "candidate-covered-subset";
  if (!summary.liveOnly) return "additive-no-conflicts";
  return "divergent";
}

/** Streams deterministic path records followed by one summary record. */
export async function* streamTreeComparison(candidateRoot, liveRoot, options = {}) {
  const maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
  const maxChangedTextBytes = options.maxChangedTextBytes ?? DEFAULT_MAX_CHANGED_TEXT_BYTES;
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) throw new Error("maxRecords must be a positive safe integer");
  if (!Number.isSafeInteger(maxChangedTextBytes) || maxChangedTextBytes < 0) throw new Error("maxChangedTextBytes must be a non-negative safe integer");
  const candidate = authoredInventory(candidateRoot, options)[Symbol.asyncIterator]();
  const live = authoredInventory(liveRoot, options)[Symbol.asyncIterator]();
  let c = await candidate.next(); let l = await live.next(); let records = 0;
  const summary = { exact: 0, candidateOnly: 0, liveOnly: 0, changedContent: 0, changedModeType: 0, candidateFiles: 0, candidateDirectories: 0, liveFiles: 0, liveDirectories: 0 };
  const countCandidate = (entry) => { if (entry.type === "file") summary.candidateFiles += 1; else summary.candidateDirectories += 1; };
  const countLive = (entry) => { if (entry.type === "file") summary.liveFiles += 1; else summary.liveDirectories += 1; };
  try {
    while (!c.done || !l.done) {
      if (++records > maxRecords) throw new Error(`comparison exceeded maxRecords (${maxRecords}); refusing partial result`);
      let record;
      if (l.done || (!c.done && compareCodeUnits(c.value.path, l.value.path) < 0)) { record = { path: c.value.path, status: "candidate-only", candidate: { type: c.value.type, mode: c.value.mode, hash: c.value.hash } }; summary.candidateOnly += 1; countCandidate(c.value); c = await candidate.next(); }
      else if (c.done || compareCodeUnits(c.value.path, l.value.path) > 0) { record = { path: l.value.path, status: "live-only", live: { type: l.value.type, mode: l.value.mode, hash: l.value.hash } }; summary.liveOnly += 1; countLive(l.value); l = await live.next(); }
      else {
        const candidateValue = c.value; const liveValue = l.value;
        if (candidateValue.type !== liveValue.type || candidateValue.mode !== liveValue.mode) { record = { path: candidateValue.path, status: "changed-mode-type", candidate: { type: candidateValue.type, mode: candidateValue.mode, hash: candidateValue.hash }, live: { type: liveValue.type, mode: liveValue.mode, hash: liveValue.hash } }; summary.changedModeType += 1; }
        else if (candidateValue.type === "file" && candidateValue.hash !== liveValue.hash) { record = { path: candidateValue.path, status: "changed-content", candidate: { type: candidateValue.type, mode: candidateValue.mode, hash: candidateValue.hash }, live: { type: liveValue.type, mode: liveValue.mode, hash: liveValue.hash }, evidence: await changedEvidence(candidateValue, liveValue, maxChangedTextBytes) }; summary.changedContent += 1; }
        else { record = { path: candidateValue.path, status: "exact", type: candidateValue.type, mode: candidateValue.mode, hash: candidateValue.hash }; summary.exact += 1; }
        countCandidate(candidateValue); countLive(liveValue); c = await candidate.next(); l = await live.next();
      }
      yield record;
    }
  } finally { await candidate.return?.(); await live.return?.(); }
  yield { type: "summary", records, ...summary, relation: relation(summary), semanticEquivalence: "not-assessed" };
}

/** Collects the streamed records; use streamTreeComparison for unbounded consumers. */
export async function compareTrees(candidateRoot, liveRoot, options = {}) {
  const records = []; let summary;
  for await (const record of streamTreeComparison(candidateRoot, liveRoot, options)) if (record.type === "summary") summary = record; else records.push(record);
  return { summary, records };
}

export async function writeTreeComparisonNdjson(candidateRoot, liveRoot, writable, options = {}) {
  let writerError = null; let resolveFailure;
  const failure = new Promise((resolve) => { resolveFailure = resolve; });
  const onError = (error) => { writerError ??= error; resolveFailure(error); };
  writable.once("error", onError);
  try {
    for await (const record of streamTreeComparison(candidateRoot, liveRoot, options)) {
      if (writerError) throw writerError;
      if (!writable.write(`${JSON.stringify(record)}\n`)) {
        await Promise.race([new Promise((resolve) => writable.once("drain", resolve)), failure]);
        if (writerError) throw writerError;
      }
    }
  } finally { writable.off("error", onError); }
}
