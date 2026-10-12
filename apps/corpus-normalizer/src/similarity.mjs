import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { scratchDirectory } from "./temp.mjs";

export const similaritySchemaVersion = "corpus-normalizer.similarity.v1";
export const similarityPolicyVersion = "corpus-normalizer.similarity-policy.v1";
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fileDigest = async (file) => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
const write = async (stream, value) => { if (!stream.write(`${JSON.stringify(value)}\n`)) await new Promise((resolve) => stream.once("drain", resolve)); };
const close = (stream) => new Promise((resolve, reject) => stream.end(resolve).once("error", reject));
async function* lines(file) { const input = readline.createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity }); for await (const line of input) if (line.trim()) yield JSON.parse(line); }

export function normalizeDocument(value) {
  let text = value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (text.startsWith("---\n")) { const end = text.indexOf("\n---\n", 4); if (end >= 0) text = `${text.slice(4, end).split("\n").filter((line) => !/^(?:date|created|modified|updated|lastmod|aliases|permalink|slug):/i.test(line.trim())).join("\n")}\n${text.slice(end + 5)}`; }
  return text.replace(/<!--.*?-->/gs, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().toLowerCase();
}
export function documentBody(value) { let text = value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"); if (text.startsWith("---\n")) { const end = text.indexOf("\n---\n", 4); if (end >= 0) text = text.slice(end + 5); } return text.replace(/<!--.*?-->/gs, " ").trim(); }
export function tokensFor(value) { return value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []; }
export function filenameStem(value) { return path.basename(value, path.extname(value)).toLowerCase().replace(/(?:^|[-_])(?:19|20)\d{2}(?:[-_]\d{2}){0,2}(?:[-_]|$)/g, "-").replace(/\s*\(\d+\)$/g, "").replace(/(?:^|[-_])(?:archive|content|documents?|notes?|terms?|concepts?|topics?)(?:[-_]|$)/g, "-").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, ""); }
export function simHash64(tokens) { const weights = Array(64).fill(0); const counts = new Map(); for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1); for (const [token, count] of counts) { const hash = createHash("sha256").update(token).digest(); for (let bit = 0; bit < 64; bit += 1) weights[bit] += (hash[Math.floor(bit / 8)] & (1 << (bit % 8))) ? count : -count; } let result = 0n; for (let bit = 0; bit < 64; bit += 1) if (weights[bit] >= 0) result |= 1n << BigInt(bit); return result.toString(16).padStart(16, "0"); }
export function jaccard(left, right) { const a = new Set(left); const b = new Set(right); let common = 0; for (const token of a) if (b.has(token)) common += 1; return a.size + b.size - common === 0 ? 1 : common / (a.size + b.size - common); }

async function externalSort(input, output, compare, { chunkSize = 4096, mergeFanIn = 32, tempDirectory } = {}) {
  const scratch = await scratchDirectory(tempDirectory); await mkdir(scratch, { recursive: true }); const work = await mkdtemp(path.join(scratch, "corpus-normalizer-sim-sort-"));
  async function spill(chunk, index) { const file = path.join(work, `run-${index}.ndjson`); const stream = createWriteStream(file); chunk.sort(compare); for (const item of chunk) await write(stream, item); await close(stream); return file; }
  async function merge(files, outputFile) { const iterators = files.map((file) => lines(file)[Symbol.asyncIterator]()); const current = await Promise.all(iterators.map((iterator) => iterator.next())); const stream = createWriteStream(outputFile); try { for (;;) { let winner = -1; for (let i = 0; i < current.length; i += 1) if (!current[i].done && (winner < 0 || compare(current[i].value, current[winner].value) < 0)) winner = i; if (winner < 0) break; await write(stream, current[winner].value); current[winner] = await iterators[winner].next(); } await close(stream); } catch (error) { stream.destroy(); throw error; } }
  try { let records = []; let runs = []; let run = 0; for await (const item of lines(input)) { records.push(item); if (records.length >= chunkSize) { runs.push(await spill(records, run++)); records = []; } } if (records.length) runs.push(await spill(records, run)); if (!runs.length) { await close(createWriteStream(output)); return; } for (let pass = 0; runs.length > 1; pass += 1) { const next = []; for (let i = 0; i < runs.length; i += mergeFanIn) { const out = path.join(work, `merge-${pass}-${i}.ndjson`); await merge(runs.slice(i, i + mergeFanIn), out); next.push(out); } await Promise.all(runs.map((file) => rm(file, { force: true }))); runs = next; } await rm(output, { force: true }); await (await import("node:fs/promises")).rename(runs[0], output); } finally { await rm(work, { recursive: true, force: true }); }
}

async function* inputRecords(input) {
  if (typeof input === "string") { for await (const item of lines(input)) yield item; return; }
  if (input && typeof input.pipe === "function") { const inputLines = readline.createInterface({ input, crlfDelay: Infinity }); for await (const line of inputLines) if (line.trim()) yield JSON.parse(line); return; }
  for await (const item of input) yield typeof item === "string" ? { path: item } : item;
}
function sourceOf(record, root) {
  const value = record.sourcePath ?? record.absolutePath ?? record.path ?? record.input;
  if (typeof value !== "string" || !value) throw new Error("similarity input requires a non-empty sourcePath, path, or string path");
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value); const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("source path escapes root");
  return resolved;
}
function evidence(type, fields) { return { schema: similaritySchemaVersion, policy: similarityPolicyVersion, type, ...fields }; }

/**
 * Read-only evidence generator. Descriptors are spilled and sorted externally;
 * it never proposes, merges, deletes, or rewrites corpus material.
 */
export async function analyzeSimilarity(input, options = {}) {
  const root = path.resolve(options.root ?? process.cwd()); const threshold = options.threshold ?? 0.9; const maxBucket = options.maxBucket ?? 200; const maxCandidates = options.maxCandidates ?? 2_000_000; const maxBodyBytes = options.maxBodyBytes ?? 10 * 1024 * 1024; const maxRecords = options.maxRecords ?? 100_000; const tokenCacheLimit = options.tokenCacheLimit ?? 1000; const sortOptions = { chunkSize: options.sortChunkSize ?? 4096, mergeFanIn: options.mergeFanIn ?? 32, tempDirectory: options.tempDirectory };
  if (!(threshold >= 0 && threshold <= 1) || !Number.isInteger(maxBucket) || maxBucket < 2 || !Number.isInteger(maxCandidates) || maxCandidates < 1 || !Number.isInteger(maxBodyBytes) || maxBodyBytes < 1 || !Number.isInteger(maxRecords) || maxRecords < 1 || !Number.isInteger(tokenCacheLimit) || tokenCacheLimit < 1) throw new Error("invalid similarity bounds");
  const scratch = await scratchDirectory(options.tempDirectory); let createdScratch = false; try { await lstat(scratch); } catch (error) { if (error.code !== "ENOENT") throw error; createdScratch = true; } await mkdir(scratch, { recursive: true }); const temporary = await mkdtemp(path.join(scratch, "corpus-normalizer-similarity-")); const descriptors = path.join(temporary, "descriptors.ndjson"); const overflows = []; const results = []; const tokenCache = new Map();
  try {
    const stream = createWriteStream(descriptors); let count = 0;
    for await (const inputRecord of inputRecords(input)) {
      if (count >= maxRecords) { overflows.push(evidence("record-limit-overflow", { maxRecords })); break; }
      let sourcePath; const displayPath = inputRecord.path ?? inputRecord.input ?? inputRecord.sourcePath ?? inputRecord.absolutePath ?? null;
      try { sourcePath = sourceOf(inputRecord, root); } catch (error) { overflows.push(evidence("source-path-rejected", { path: displayPath, reason: error.message })); continue; }
      let stat; try { stat = await lstat(sourcePath); } catch (error) { overflows.push(evidence("source-unavailable", { path: displayPath, reason: error.code ?? String(error) })); continue; }
      if (!stat.isFile()) { overflows.push(evidence("source-not-file", { path: displayPath })); continue; }
      const actualHash = await fileDigest(sourcePath); if (!options.trustSourceHash && inputRecord.sha256 && inputRecord.sha256 !== actualHash) { overflows.push(evidence("stale-source-hash", { path: displayPath, expectedSha256: inputRecord.sha256, actualSha256: actualHash })); continue; }
      if (stat.size > maxBodyBytes) { overflows.push(evidence("body-byte-overflow", { path: displayPath, bytes: stat.size, maxBodyBytes })); await write(stream, { path: displayPath, sourcePath, sha256: actualHash, metadataOnly: Boolean(inputRecord.metadataOnly), overflow: true }); count += 1; continue; }
      const raw = await readFile(sourcePath); let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(raw); } catch { overflows.push(evidence("non-text-source", { path: displayPath, reason: "invalid-utf8" })); continue; }
      const normalized = normalizeDocument(text); const body = documentBody(text); const bodyNormalized = normalizeDocument(body); const bodyTokens = tokensFor(bodyNormalized); const metadataOnly = bodyTokens.length === 0 || (inputRecord.metadataOnly === true && typeof inputRecord.metadataOnlyReason === "string" && inputRecord.metadataOnlyReason.trim().length > 0); const tokens = tokensFor(normalized); await write(stream, { path: displayPath, sourcePath, sha256: actualHash, metadataOnly, normalizedTextSha256: digest(normalized), normalizedBodySha256: digest(bodyNormalized), filenameStem: filenameStem(displayPath), simHash64: simHash64(tokens) }); count += 1;
    }
    await close(stream);
    async function groups(field, type, include = () => true) { const sorted = path.join(temporary, `${field}.ndjson`); await externalSort(descriptors, sorted, (a, b) => order(a[field] ?? "", b[field] ?? "") || order(a.path, b.path), sortOptions); let key = null; let paths = []; for await (const item of lines(sorted)) { if (!item[field] || !include(item)) continue; if (key !== null && key !== item[field]) { if (paths.length > 1) results.push(evidence(type, { fingerprint: key, paths })); paths = []; } key = item[field]; paths.push(item.path); } if (paths.length > 1) results.push(evidence(type, { fingerprint: key, paths })); }
    await groups("sha256", "exact-bytes"); await groups("normalizedTextSha256", "exact-normalized-text"); await groups("normalizedBodySha256", "exact-normalized-body", (item) => !item.metadataOnly);
    const candidatesFile = path.join(temporary, "candidates.ndjson"); const candidateWriter = createWriteStream(candidatesFile); for await (const item of lines(descriptors)) if (!item.overflow && !item.metadataOnly) { if (item.filenameStem) await write(candidateWriter, { key: `stem:${item.filenameStem}`, item }); for (let band = 0; band < 4; band += 1) await write(candidateWriter, { key: `sim:${band}:${item.simHash64.slice(band * 4, band * 4 + 4)}`, item }); } await close(candidateWriter);
    const sortedCandidates = path.join(temporary, "candidates-sorted.ndjson"); await externalSort(candidatesFile, sortedCandidates, (a, b) => order(a.key, b.key) || order(a.item.path, b.item.path), sortOptions);
    const pairs = new Map(); let bucketKey = null; let bucket = []; let candidateLimitReached = false;
    async function inspectBucket() { if (!bucket.length) return; if (bucket.length > maxBucket) { results.push(evidence("candidate-bucket-overflow", { bucket: bucketKey, count: bucket.length, paths: bucket.slice(0, 20).map((item) => item.path).sort(order) })); return; } if (candidateLimitReached) return; for (let left = 0; left < bucket.length; left += 1) for (let right = left + 1; right < bucket.length; right += 1) { const items = [bucket[left], bucket[right]].sort((a, b) => order(a.path, b.path)); const pair = items.map((item) => item.path).join("\0"); if (pairs.size >= maxCandidates && !pairs.has(pair)) { candidateLimitReached = true; results.push(evidence("candidate-limit-overflow", { maxCandidates })); return; } pairs.set(pair, items); } }
    for await (const candidate of lines(sortedCandidates)) { if (bucketKey !== null && bucketKey !== candidate.key) { await inspectBucket(); bucket = []; } bucketKey = candidate.key; bucket.push(candidate.item); } await inspectBucket();
    async function tokens(item) { if (!tokenCache.has(item.path)) { if (tokenCache.size >= tokenCacheLimit) tokenCache.delete(tokenCache.keys().next().value); tokenCache.set(item.path, tokensFor(normalizeDocument(await readFile(item.sourcePath, "utf8")))); } return tokenCache.get(item.path); }
    const parent = new Map(); const find = (item) => { if (!parent.has(item)) parent.set(item, item); while (parent.get(item) !== item) { parent.set(item, parent.get(parent.get(item))); item = parent.get(item); } return item; }; const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(b > a ? b : a, b > a ? a : b); }; const edges = [];
    for (const pair of [...pairs.keys()].sort(order)) { const [left, right] = pairs.get(pair); if (left.normalizedTextSha256 === right.normalizedTextSha256) continue; const similarity = jaccard(await tokens(left), await tokens(right)); if (similarity >= threshold) { unite(left.path, right.path); edges.push({ leftPath: left.path, rightPath: right.path, similarity }); } }
    const families = new Map(); for (const edge of edges) for (const member of [edge.leftPath, edge.rightPath]) { const rootKey = find(member); const family = families.get(rootKey) ?? new Set(); family.add(member); families.set(rootKey, family); }
    for (const family of families.values()) { const paths = [...family].sort(order); const members = new Set(paths); const observed = edges.filter((edge) => members.has(edge.leftPath) && members.has(edge.rightPath)).map((edge) => edge.similarity); results.push(evidence("near-text-family", { threshold, minimumObservedSimilarity: Number(Math.min(...observed).toFixed(6)), paths })); }
    return [...results, ...overflows].sort((a, b) => order(`${a.type}\0${(a.paths ?? [a.path]).join("\0")}`, `${b.type}\0${(b.paths ?? [b.path]).join("\0")}`));
  } finally { await rm(temporary, { recursive: true, force: true }); if (createdScratch) await rm(scratch, { recursive: true, force: true }); }
}

export async function writeSimilarityEvidence(input, output, options = {}) {
  const inputPath = typeof input === "string" ? path.resolve(input) : null; const outputPath = path.resolve(output);
  if (inputPath === outputPath) throw new Error("similarity output must differ from input");
  await mkdir(path.dirname(outputPath), { recursive: true }); const stream = createWriteStream(outputPath, { encoding: "utf8" });
  try {
    const evidenceRecords = await analyzeSimilarity(input, options);
    for (const record of evidenceRecords) await write(stream, record);
    await close(stream);
    return { output: outputPath, count: evidenceRecords.length };
  } catch (error) { stream.destroy(); await rm(outputPath, { force: true }); throw error; }
}
