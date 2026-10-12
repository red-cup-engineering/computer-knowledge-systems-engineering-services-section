import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, opendir, readFile, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseBibtex } from "./bibtex.mjs";
import { planBibliography } from "./bibliography-plan.mjs";
import { readPlanLines } from "./plan.mjs";

const schema = "corpus-normalizer.bibliography-run.v1";
const manifestPath = (output) => `${path.resolve(output)}.corpus-normalizer-bibliography-run.json`;
const fail = (message) => { throw new Error(message); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const overlaps = (left, right) => left === right || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`);

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
const hashText = (text) => createHash("sha256").update(text).digest("hex");
async function writeLine(stream, record) {
  if (!stream.write(`${JSON.stringify(record)}\n`)) await new Promise((resolve, reject) => {
    stream.once("drain", resolve); stream.once("error", reject);
  });
}
async function close(stream) {
  await new Promise((resolve, reject) => { stream.once("error", reject); stream.end(resolve); });
}
function safeSourcePath(root, relative) {
  const resolved = path.resolve(root, relative);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) fail(`unsafe bibliography source path: ${relative}`);
  return resolved;
}
async function targetState(target) {
  try { return { state: "present", sha256: await hashFile(target) }; }
  catch (error) { if (error.code === "ENOENT") return { state: "absent", sha256: null }; throw error; }
}

export async function writeBibliographyPlan(source, destination, planFile, options) {
  const sourceRoot = path.resolve(source);
  const output = path.resolve(planFile);
  if (output === sourceRoot || output.startsWith(`${sourceRoot}${path.sep}`)) fail("bibliography plan file must be outside source root");
  await mkdir(path.dirname(output), { recursive: true });
  const stream = createWriteStream(output, { encoding: "utf8" });
  let count = 0;
  try {
    for await (const record of planBibliography(source, destination, options)) {
      await writeLine(stream, record); count += 1;
    }
    await close(stream);
    return { output, count, sha256: await hashFile(output) };
  } catch (error) {
    stream.destroy(); await rm(output, { force: true }); throw error;
  }
}

async function assertAbsentOrEmpty(output) {
  try {
    const handle = await opendir(output);
    try { for await (const _ of handle) fail(`bibliography materialize output must be absent or empty: ${output}`); }
    finally { await handle.close().catch(() => {}); }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}

async function scanPlan(planFile) {
  let header = null;
  let aggregate = null;
  let records = 0;
  const sourceRecords = new Map();
  for await (const record of readPlanLines(planFile)) {
    records += 1;
    if (aggregate) fail("bibliography aggregate must be the final plan record");
    if (records === 1) {
      if (record.type !== "header" || record.schema !== "corpus-normalizer.bibliography-plan.v1") fail("not a bibliography plan");
      if (!record.sourceRoot || !record.destination || !record.existingTarget) fail("bibliography plan header is incomplete");
      if (path.basename(record.destination) !== "bibliography.bib") fail("bibliography plan destination is unsafe");
      header = { ...record, sourceRoot: path.resolve(record.sourceRoot), destination: path.resolve(record.destination) };
      continue;
    }
    if (!header) fail("bibliography plan has no header");
    if (record.status === "invalid") fail(`bibliography plan has invalid record: ${record.source ?? record.identity ?? record.type}`);
    if (record.type === "source") {
      if (!record.sourceHash || typeof record.source !== "string") fail("bibliography source record is incomplete");
      if (sourceRecords.has(record.source)) fail(`duplicate bibliography source record: ${record.source}`);
      sourceRecords.set(record.source, { source: record.source, sourceHash: record.sourceHash, dispositions: [] });
    } else if (record.type === "citation" || record.type === "directive") {
      const source = sourceRecords.get(record.source);
      if (!source || !["proposed", "exact-covered"].includes(record.disposition) || !record.identity || !record.sha256) fail("bibliography member record is incomplete");
      source.dispositions.push({ type: record.type, identity: record.identity, sha256: record.sha256, disposition: record.disposition });
    } else if (record.type === "aggregate") {
      aggregate = record;
    } else {
      fail(`unsupported bibliography plan record: ${record.type}`);
    }
  }
  if (!header || !aggregate || aggregate.status !== "proven" || typeof aggregate.content !== "string" || !aggregate.sha256) fail("bibliography plan lacks a proven aggregate");
  if (hashText(aggregate.content) !== aggregate.sha256) fail("bibliography aggregate content hash mismatch");
  if (aggregate.destination !== header.destination) fail("bibliography aggregate destination mismatch");
  return { header, aggregate, records, sources: [...sourceRecords.values()], planHash: await hashFile(planFile) };
}

async function authenticateSources(scanned, { allowMissing = false, skipDestination = false } = {}) {
  for (const source of scanned.sources) {
    const absolute = safeSourcePath(scanned.header.sourceRoot, source.source);
    if (skipDestination && absolute === scanned.header.destination) continue;
    try {
      if (await hashFile(absolute) !== source.sourceHash) fail(`bibliography source changed since plan: ${source.source}`);
    } catch (error) {
      if (allowMissing && error.code === "ENOENT") continue;
      throw error;
    }
  }
}
async function authenticateTargetBefore(scanned, { allowAfter = false } = {}) {
  const current = await targetState(scanned.header.destination);
  if (same(current, scanned.header.existingTarget)) return current;
  if (allowAfter && current.state === "present" && current.sha256 === scanned.aggregate.sha256) return current;
  fail("bibliography destination changed since plan");
}
async function readManifest(output) { return JSON.parse(await readFile(manifestPath(output), "utf8")); }
function expectedManifest(scanned, planFile, output) {
  return {
    schema,
    plan: path.resolve(planFile),
    planHash: scanned.planHash,
    sourceRoot: scanned.header.sourceRoot,
    destination: scanned.header.destination,
    targetBefore: scanned.header.existingTarget,
    output: path.resolve(output),
    projected: { path: path.join(path.resolve(output), "bibliography.bib"), sha256: scanned.aggregate.sha256 },
    sources: scanned.sources,
    records: scanned.records,
  };
}
async function authenticateManifest(scanned, planFile, output) {
  const manifest = await readManifest(output);
  const expected = expectedManifest(scanned, planFile, output);
  if (!same(manifest, expected)) fail("bibliography run manifest does not match plan");
  const projected = expected.projected.path;
  if (await hashFile(projected) !== expected.projected.sha256) fail("projected bibliography changed after materialization");
  try { parseBibtex(await readFile(projected, "utf8")); } catch (error) { fail(`projected bibliography is invalid: ${error.message}`); }
  return expected;
}

export async function materializeBibliography(planFile, outputRoot) {
  const output = path.resolve(outputRoot);
  const runManifest = manifestPath(output);
  await assertAbsentOrEmpty(output);
  try {
    const scanned = await scanPlan(planFile);
    await authenticateSources(scanned);
    await authenticateTargetBefore(scanned);
    parseBibtex(scanned.aggregate.content);
    await mkdir(output, { recursive: true });
    const projected = path.join(output, "bibliography.bib");
    await writeFile(projected, scanned.aggregate.content, "utf8");
    if (await hashFile(projected) !== scanned.aggregate.sha256) fail("projected bibliography hash mismatch");
    parseBibtex(await readFile(projected, "utf8"));
    const manifest = expectedManifest(scanned, planFile, output);
    await writeFile(runManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return { output, bibliography: projected, manifest: runManifest, sha256: scanned.aggregate.sha256 };
  } catch (error) {
    await rm(output, { recursive: true, force: true }); await rm(runManifest, { force: true }); throw error;
  }
}

async function atomicWrite(target, source) {
  let mode = 0o644;
  try { mode = (await lstat(target)).mode & 0o777; } catch (error) { if (error.code !== "ENOENT") throw error; }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.corpus-normalizer-${randomUUID()}.tmp`);
  try { await copyFile(source, temporary); await chmod(temporary, mode); await rename(temporary, target); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

async function pruneEmptyWithin(directory, sourceRoot) {
  let current = path.resolve(directory); const boundary = path.resolve(sourceRoot);
  while (current === boundary || current.startsWith(`${boundary}${path.sep}`)) {
    try { await rmdir(current); } catch { break; }
    if (current === boundary) break;
    current = path.dirname(current);
  }
}
async function retireSources(scanned) {
  for (const source of scanned.sources) {
    const absolute = safeSourcePath(scanned.header.sourceRoot, source.source);
    if (overlaps(absolute, scanned.header.destination)) continue;
    try {
      if (await hashFile(absolute) !== source.sourceHash) fail(`bibliography source changed before retirement: ${source.source}`);
      await unlink(absolute); await pruneEmptyWithin(path.dirname(absolute), scanned.header.sourceRoot);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

export async function verifyBibliography(planFile, outputRoot) {
  const output = path.resolve(outputRoot);
  const scanned = await scanPlan(planFile);
  const manifest = await authenticateManifest(scanned, planFile, output);
  await authenticateSources(scanned, { allowMissing: true, skipDestination: true });
  const current = await targetState(scanned.header.destination);
  if (current.state !== "present" || current.sha256 !== manifest.projected.sha256) fail("bibliography target hash mismatch");
  try { parseBibtex(await readFile(scanned.header.destination, "utf8")); } catch (error) { fail(`bibliography target is invalid: ${error.message}`); }
  return { valid: true, destination: scanned.header.destination, sha256: current.sha256, sources: scanned.sources.length };
}

export async function applyBibliography(planFile, outputRoot) {
  const output = path.resolve(outputRoot);
  let scanned = await scanPlan(planFile);
  let manifest = await authenticateManifest(scanned, planFile, output);
  const target = await authenticateTargetBefore(scanned, { allowAfter: true });
  const completingInterruptedRun = target.sha256 === scanned.aggregate.sha256;
  await authenticateSources(scanned, { allowMissing: completingInterruptedRun, skipDestination: completingInterruptedRun });
  if (target.sha256 !== scanned.aggregate.sha256) await atomicWrite(scanned.header.destination, manifest.projected.path);
  await verifyBibliography(planFile, output);
  // Re-read both artifacts and source state after the write before deleting anything.
  scanned = await scanPlan(planFile);
  manifest = await authenticateManifest(scanned, planFile, output);
  await authenticateTargetBefore(scanned, { allowAfter: true });
  await authenticateSources(scanned, { allowMissing: completingInterruptedRun, skipDestination: true });
  await retireSources(scanned);
  return verifyBibliography(planFile, output);
}

export async function validateBibliography(root) {
  const file = path.resolve(root); const errors = []; const warnings = [];
  let entries = 0; let directives = 0;
  if (path.basename(file) !== "bibliography.bib") errors.push("bibliography path must end with bibliography.bib");
  if (!errors.length) {
    try {
      const stat = await lstat(file); if (!stat.isFile()) throw new Error("bibliography path is not a regular file");
      const bytes = await readFile(file); if (bytes.includes(0)) throw new Error("bibliography contains NUL bytes");
      let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("bibliography is not valid UTF-8"); }
      const parsed = parseBibtex(text); entries = parsed.entries.length; directives = parsed.directives.length;
    } catch (error) { errors.push(String(error.message)); }
  }
  return { valid: errors.length === 0, count: entries, entries, directives, errors, warnings };
}

export async function explainBibliographyPlan(planFile, output = process.stdout) {
  const statuses = { proven: 0, invalid: 0 }; const types = {}; const dispositions = {}; let records = 0;
  for await (const record of readPlanLines(planFile)) {
    records += 1; types[record.type] = (types[record.type] ?? 0) + 1;
    if (record.status) statuses[record.status] = (statuses[record.status] ?? 0) + 1;
    if (record.disposition) dispositions[record.disposition] = (dispositions[record.disposition] ?? 0) + 1;
    if (record.status === "invalid") output.write(`${JSON.stringify({ type: "review", record })}\n`);
  }
  output.write(`${JSON.stringify({ type: "summary", schema: "corpus-normalizer.bibliography-plan.v1", records, statuses, types, dispositions })}\n`);
}
