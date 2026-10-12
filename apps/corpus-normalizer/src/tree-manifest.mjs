import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { createReadStream } from "node:fs";
import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { walkOrderedTree } from "./inventory.mjs";

async function fileDigest(file) { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); }
export async function* treeManifest(root, options = {}) {
  const rootStat = await lstat(path.resolve(root));
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error(`unsupported tree root: ${root}`);
  for await (const entry of walkOrderedTree(root, { ...options, shouldTraverse: options.includeExisting })) {
    if (options.includeExisting && !options.includeExisting(entry)) continue;
    if (entry.type === "symlink" || !["directory", "file"].includes(entry.type)) throw new Error(`unsupported tree node: ${entry.path}`);
    yield entry.type === "file" ? { path: entry.path, type: "file", mode: entry.mode, hash: await fileDigest(entry.absolutePath) } : { path: entry.path, type: "directory", mode: entry.mode };
  }
}
export async function writeTreeManifest(root, output, options = {}) {
  const stream = createWriteStream(output); const hash = createHash("sha256"); let count = 0;
  const stats = { maxChunkObserved: 0 };
  try {
    for await (const entry of treeManifest(root, { ...options, stats })) { const line = `${JSON.stringify(entry)}\n`; hash.update(line); if (!stream.write(line)) await new Promise((resolve, reject) => { stream.once("drain", resolve); stream.once("error", reject); }); count += 1; }
    await new Promise((resolve, reject) => { stream.once("error", reject); stream.end(resolve); });
    return { hash: hash.digest("hex"), count, maxChunkObserved: stats.maxChunkObserved };
  } catch (error) {
    stream.destroy(); await rm(output, { force: true }); throw error;
  }
}
export async function verifyTreeManifest(root, file, options = {}) {
  const input = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity }); const actual = treeManifest(root, options)[Symbol.asyncIterator](); const hash = createHash("sha256"); let count = 0;
  try {
    for await (const line of input) { if (!line) continue; hash.update(`${line}\n`); const expected = JSON.parse(line); const next = await actual.next(); if (next.done || JSON.stringify(next.value) !== JSON.stringify(expected)) return { valid: false, count }; count += 1; }
    if (!(await actual.next()).done) return { valid: false, count };
    const result = { valid: true, hash: hash.digest("hex"), count };
    if ((options.hash && options.hash !== result.hash) || (options.count !== undefined && options.count !== result.count)) return { valid: false, count };
    return result;
  } finally { input.close(); await actual.return?.(); }
}
