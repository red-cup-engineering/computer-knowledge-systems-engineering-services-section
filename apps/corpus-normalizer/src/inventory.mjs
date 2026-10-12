import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdtemp, opendir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { detectRepresentation, isGenerated } from "./detect.mjs";
import { scratchDirectory } from "./temp.mjs";

const packageMarkers = new Set(["package.json", "pyproject.toml", "Cargo.toml", "go.mod"]);
const unitId = (relativePath) => `unit:${relativePath}`;
const kind = (entry) => entry.isDirectory() ? "directory" : entry.isFile() ? "file" : entry.isSymbolicLink() ? "symlink" : "other";

async function hasPackageMarker(directory) {
  const handle = await opendir(directory);
  try { for await (const entry of handle) if (entry.isFile() && packageMarkers.has(entry.name)) return true; }
  finally { await handle.close().catch(() => {}); }
  return false;
}

async function symlinkDetails(absolutePath) {
  try {
    const resolved = await realpath(absolutePath); const stat = await lstat(resolved);
    return { realPath: resolved, packageSourcePointer: stat.isDirectory() && await hasPackageMarker(resolved) };
  } catch { return { realPath: null, packageSourcePointer: false }; }
}

function directoryUnit(relativePath, representation, inheritedUnit) {
  if (isGenerated(relativePath)) return { id: unitId(relativePath), root: relativePath, kind: "generated" };
  if (["service-section", "glossary-terms-root", "text-triage-root", "notes-root", "package-root"].includes(representation)) return { id: unitId(relativePath), root: relativePath, kind: representation };
  return inheritedUnit;
}

async function writeRun(items, directory) {
  const file = path.join(directory, `run-${Math.random().toString(36).slice(2)}.ndjson`);
  const stream = createWriteStream(file, { encoding: "utf8" });
  for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) if (!stream.write(`${JSON.stringify(item)}\n`)) await new Promise((resolve) => stream.once("drain", resolve));
  await new Promise((resolve, reject) => stream.end(resolve).once("error", reject));
  return file;
}

async function* runLines(file) {
  const lines = readline.createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) if (line) yield JSON.parse(line);
}

async function mergeRuns(files, output) {
  const iterators = files.map((file) => runLines(file)[Symbol.asyncIterator]());
  const current = await Promise.all(iterators.map((iterator) => iterator.next()));
  const stream = createWriteStream(output, { encoding: "utf8" });
  while (true) {
    let selected = -1;
    for (let index = 0; index < current.length; index += 1) if (!current[index].done && (selected < 0 || current[index].value.name.localeCompare(current[selected].value.name) < 0)) selected = index;
    if (selected < 0) break;
    if (!stream.write(`${JSON.stringify(current[selected].value)}\n`)) await new Promise((resolve) => stream.once("drain", resolve));
    current[selected] = await iterators[selected].next();
  }
  await new Promise((resolve, reject) => stream.end(resolve).once("error", reject));
}

/**
 * Deterministically orders a directory with external sorted runs. At most
 * chunkSize records are kept before spilling; multi-pass merge limits open runs.
 */
export async function* orderedEntries(directory, chunkSize = 128, stats = null) {
  const temp = await mkdtemp(path.join(await scratchDirectory(), "corpus-normalizer-order-"));
  try {
    const runs = []; let chunk = [];
    const handle = await opendir(directory);
    for await (const entry of handle) {
      chunk.push({ name: entry.name, type: kind(entry) });
      if (chunk.length === chunkSize) { stats && (stats.maxChunkObserved = Math.max(stats.maxChunkObserved ?? 0, chunk.length)); runs.push(await writeRun(chunk, temp)); chunk = []; }
    }
    if (chunk.length) { stats && (stats.maxChunkObserved = Math.max(stats.maxChunkObserved ?? 0, chunk.length)); runs.push(await writeRun(chunk, temp)); }
    if (!runs.length) return;
    let active = runs; let pass = 0;
    while (active.length > 1) {
      const next = [];
      for (let index = 0; index < active.length; index += 32) {
        const batch = active.slice(index, index + 32);
        const merged = path.join(temp, `merge-${pass}-${index}.ndjson`);
        await mergeRuns(batch, merged); await Promise.all(batch.map((file) => rm(file)));
        next.push(merged);
      }
      active = next; pass += 1;
    }
    yield* runLines(active[0]);
  } finally { await rm(temp, { recursive: true, force: true }); }
}

/** Reusable bounded, lexical tree walk. Symlinks are yielded for callers to reject. */
export async function* walkOrderedTree(root, { chunkSize = 128, stats = null, shouldTraverse = null } = {}) {
  const absolute = path.resolve(root);
  async function* visit(directory, relative = "") {
    for await (const entry of orderedEntries(directory, chunkSize, stats)) {
      const child = path.join(directory, entry.name); const childRelative = path.join(relative, entry.name); const stat = await lstat(child); const type = kind(stat);
      yield { absolutePath: child, path: childRelative, type, mode: stat.mode & 0o777 };
      if (type === "directory" && (!shouldTraverse || shouldTraverse({ absolutePath: child, path: childRelative, type, mode: stat.mode & 0o777 }))) yield* visit(child, childRelative);
    }
  }
  yield* visit(absolute);
}

export async function* inventory(source, { chunkSize = 128 } = {}) {
  const root = path.resolve(source); const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) {
    const type = rootStat.isFile() ? "file" : rootStat.isSymbolicLink() ? "symlink" : "other";
    const relativePath = path.basename(root); const record = { absolutePath: root, relativePath, type, size: rootStat.size, representation: detectRepresentation({ relativePath, type }), unit: { id: unitId(relativePath), root: relativePath, kind: detectRepresentation({ relativePath, type }) }, boundaryAncestry: [] };
    if (type === "symlink") Object.assign(record, await symlinkDetails(root)); yield record; return;
  }
  const rootUnit = path.basename(root).endsWith("-services-section") ? { id: unitId("."), root: ".", kind: "service-section" } : await hasPackageMarker(root) ? { id: unitId("."), root: ".", kind: "package-root" } : null;
  yield { absolutePath: root, relativePath: ".", type: "directory", size: rootStat.size, representation: rootUnit?.kind === "service-section" ? "service-section" : "source-root", unit: rootUnit, boundaryAncestry: rootUnit ? [rootUnit] : [] };
  yield* walk(root, root, rootUnit, rootUnit ? [rootUnit] : [], chunkSize);
}

async function* walk(root, directory, inheritedUnit, ancestry, chunkSize) {
  for await (const entry of orderedEntries(directory, chunkSize)) {
    const absolutePath = path.join(directory, entry.name); const relativePath = path.relative(root, absolutePath) || ".";
    let representation = detectRepresentation({ relativePath, type: entry.type });
    if (entry.type === "directory" && representation === "directory" && await hasPackageMarker(absolutePath)) representation = "package-root";
    const unit = entry.type === "directory" ? directoryUnit(relativePath, representation, inheritedUnit) : inheritedUnit ?? { id: unitId(relativePath), root: relativePath, kind: representation };
    const record = { absolutePath, relativePath, type: entry.type, size: null, representation, unit, boundaryAncestry: ancestry, unitRepresentative: Boolean(unit?.root === "." && representation === "package-manifest") };
    if (entry.type === "symlink") Object.assign(record, await symlinkDetails(absolutePath)); yield record;
    if (entry.type === "directory" && !isGenerated(relativePath)) { const nextAncestry = unit && unit !== inheritedUnit ? [...ancestry, unit] : ancestry; yield* walk(root, absolutePath, unit, nextAncestry, chunkSize); }
  }
}
