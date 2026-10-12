import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { archiveLimitDefaults, inspectArchive, materializeArchiveToTemp } from "./archive.mjs";
import { treeManifest } from "./tree-manifest.mjs";

export const archiveInventorySchema = "corpus-normalizer.archive-inventory.v1";
export const archiveRunSchema = "corpus-normalizer.archive-run.v1";
const runManifestPath = (root) => `${path.resolve(root)}.corpus-normalizer-archive-run.json`;
const fail = (message) => { throw new Error(message); };

async function hashFile(file) { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); }
async function writeLine(stream, line) { if (!stream.write(line)) await new Promise((resolve, reject) => { stream.once("drain", resolve); stream.once("error", reject); }); }
async function close(stream) { await new Promise((resolve, reject) => { stream.once("error", reject); stream.end(resolve); }); }
const line = (record) => `${JSON.stringify(record)}\n`;
function requireHostTemp(output) {
  const roots = new Set([path.resolve(tmpdir()), path.resolve("/var/tmp")]);
  if (![...roots].some((root) => output.startsWith(`${root}${path.sep}`))) fail("archive output must be an explicit child of a host temp root");
}
function canonicalOptions(options = {}) {
  const result = Object.fromEntries(Object.entries(archiveLimitDefaults).map(([key, value]) => [key, options[key] ?? value]));
  if (options.highWaterMark !== undefined) result.highWaterMark = options.highWaterMark;
  return result;
}

async function archiveRecords(archive, options = {}) {
  const archivePath = path.resolve(archive); const archiveSha256 = await hashFile(archivePath); const info = await inspectArchive(archivePath, options);
  const records = [{ type: "header", schema: archiveInventorySchema, archive: archivePath, archiveSha256, wrapper: info.wrapper, members: info.members.length }];
  for (const member of info.members) records.push({ type: "member", archivePath: member.path, memberType: member.type, size: member.size, mode: member.mode, ...(member.hash ? { sha256: member.hash } : {}) });
  return { archivePath, archiveSha256, info, records };
}
function recordsDigest(records) { const hash = createHash("sha256"); for (const record of records) hash.update(line(record)); return { hash: hash.digest("hex"), count: records.length }; }
async function treeDigest(root) { const hash = createHash("sha256"); let count = 0; for await (const record of treeManifest(root)) { hash.update(line(record)); count += 1; } return { hash: hash.digest("hex"), count }; }

export async function writeArchiveInventory(archive, output, options = {}) {
  const outputPath = path.resolve(output); if (outputPath === path.resolve(archive)) fail("archive inventory output must differ from carrier");
  if (await lstat(outputPath).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error))) fail("archive inventory output must be absent");
  const scanned = await archiveRecords(archive, options); await mkdir(path.dirname(outputPath), { recursive: true }); const temporary = `${outputPath}.${randomUUID()}.tmp`; const stream = createWriteStream(temporary, { encoding: "utf8" });
  try { for (const record of scanned.records) await writeLine(stream, line(record)); await close(stream); await rename(temporary, outputPath); return { output: outputPath, ...recordsDigest(scanned.records) }; }
  catch (error) { stream.destroy(); await rm(temporary, { force: true }); throw error; }
}

export async function unpackArchive(archive, outputRoot, options = {}) {
  const output = path.resolve(outputRoot); const manifestFile = runManifestPath(output); const normalizedOptions = canonicalOptions(options);
  requireHostTemp(output);
  if (await lstat(output).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error))) fail("archive temp root must be absent");
  if (await lstat(manifestFile).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error))) fail("archive run manifest must be absent");
  let temporaryManifest;
  try {
    const scanned = await archiveRecords(archive, normalizedOptions); const inventory = recordsDigest(scanned.records);
    const extracted = await materializeArchiveToTemp(scanned.archivePath, output, { ...normalizedOptions, stripWrapper: options.stripWrapper === true });
    const tree = await treeDigest(output);
    const manifest = { schema: archiveRunSchema, archive: scanned.archivePath, archiveSha256: scanned.archiveSha256, inventory, output, tree, stripWrapper: options.stripWrapper === true, wrapper: scanned.info.wrapper, strippedComponents: extracted.stripCount, options: normalizedOptions };
    temporaryManifest = `${manifestFile}.${randomUUID()}.tmp`; await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"); await rename(temporaryManifest, manifestFile); temporaryManifest = null;
    return { output, manifest: manifestFile, members: scanned.info.members.length, tree };
  } catch (error) { await rm(output, { recursive: true, force: true }); await rm(manifestFile, { force: true }); if (temporaryManifest) await rm(temporaryManifest, { force: true }); throw error; }
}

export async function verifyArchiveCarrier(manifestFile) {
  const manifest = JSON.parse(await readFile(path.resolve(manifestFile), "utf8"));
  if (manifest.schema !== archiveRunSchema || !manifest.archive || !manifest.output || !manifest.inventory || !manifest.tree || typeof manifest.stripWrapper !== "boolean" || !manifest.options) fail("invalid archive run manifest");
  const archiveSha256 = await hashFile(manifest.archive); if (archiveSha256 !== manifest.archiveSha256) fail("archive carrier hash mismatch");
  const scanned = await archiveRecords(manifest.archive, manifest.options); const inventory = recordsDigest(scanned.records); if (JSON.stringify(inventory) !== JSON.stringify(manifest.inventory)) fail("archive inventory mismatch");
  const expectedStrip = manifest.stripWrapper && scanned.info.wrapper ? 1 : 0; if (manifest.strippedComponents !== expectedStrip || manifest.wrapper !== scanned.info.wrapper) fail("archive wrapper manifest mismatch");
  return { valid: true, archive: manifest.archive, output: manifest.output, members: scanned.info.members.length };
}
export async function verifyArchive(manifestFile) {
  const verified = await verifyArchiveCarrier(manifestFile); const manifest = JSON.parse(await readFile(path.resolve(manifestFile), "utf8")); const tree = await treeDigest(manifest.output); if (JSON.stringify(tree) !== JSON.stringify(manifest.tree)) fail("archive output tree mismatch"); return { ...verified, tree };
}
