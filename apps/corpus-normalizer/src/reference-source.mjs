import path from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, opendir, readFile } from "node:fs/promises";
import { sha256 } from "./term.mjs";

const extensions = new Set([".pdf", ".epub", ".html", ".htm", ".md", ".org", ".txt", ".tex", ".ris"]);
const opaqueExtensions = new Set([".pdf", ".epub"]);
const decoder = new TextDecoder("utf-8", { fatal: true });
export const maxReferenceSourceTextBytes = 16 * 1024 * 1024;

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export function canonicalReferenceSourceFilename(name) {
  const extension = path.extname(name).toLowerCase();
  const base = path.basename(name, path.extname(name)).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base && extensions.has(extension) ? `${base}${extension}` : "";
}

export function validateReferenceSourceFilename(name) {
  const extension = path.extname(name).toLowerCase();
  return extensions.has(extension) && /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:pdf|epub|html|htm|md|org|txt|tex|ris)$/.test(name);
}

function normalizedText(raw) {
  const text = decoder.decode(raw);
  if (text.includes("\0")) throw new Error("reference source text must not contain NUL bytes");
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n*$/, "\n");
}

export async function proposeReferenceSource(sourcePath, destination) {
  const stat = await lstat(sourcePath);
  if (!stat.isFile()) throw new Error("reference source must be a regular file");
  if (stat.size === 0) throw new Error("reference source is empty");
  if (stat.mode & 0o111) throw new Error("reference source must not be executable");
  const filename = canonicalReferenceSourceFilename(path.basename(sourcePath));
  if (!filename) throw new Error("reference source filename has no canonical form or supported extension");
  const extension = path.extname(filename);
  if (opaqueExtensions.has(extension)) {
    const digest = await hashFile(sourcePath);
    return { action: "copy", output: path.join(destination, filename), sourceContentSha256: digest, proposedContentSha256: digest, identity: filename, identityEvidence: "canonical source basename", mode: stat.mode & 0o777, warnings: [] };
  }
  if (stat.size > maxReferenceSourceTextBytes) throw new Error(`reference source text exceeds ${maxReferenceSourceTextBytes} byte limit`);
  const raw = await readFile(sourcePath);
  const common = { output: path.join(destination, filename), sourceContentSha256: sha256(raw), identity: filename, identityEvidence: "canonical source basename", warnings: [] };
  const content = normalizedText(raw);
  return { action: "write", ...common, content, proposedContentSha256: sha256(content) };
}

export async function validateReferenceSource(root) {
  const errors = []; const warnings = []; let count = 0; let handle;
  try { handle = await opendir(root); } catch { return { valid: false, errors: [`reference source root does not exist: ${root}`], warnings, count }; }
  for await (const entry of handle) {
    const file = path.join(root, entry.name);
    if (!entry.isFile()) { errors.push(`reference source root must be flat with regular files only: ${entry.name}`); continue; }
    const stat = await lstat(file); count += 1;
    if (stat.size === 0) errors.push(`empty reference source: ${entry.name}`);
    if (stat.mode & 0o111) errors.push(`executable reference source: ${entry.name}`);
    if (!validateReferenceSourceFilename(entry.name)) { errors.push(`noncanonical or unsupported reference source filename: ${entry.name}`); continue; }
    if (!opaqueExtensions.has(path.extname(entry.name))) {
      if (stat.size > maxReferenceSourceTextBytes) { errors.push(`reference source text exceeds ${maxReferenceSourceTextBytes} byte limit: ${entry.name}`); continue; }
      try {
        const raw = await readFile(file); const normalized = normalizedText(raw);
        if (!raw.equals(Buffer.from(normalized))) warnings.push(`reference source has repairable line endings or final newline: ${entry.name}`);
      } catch (error) { errors.push(error.message === "reference source text must not contain NUL bytes" ? `reference source text contains NUL bytes: ${entry.name}` : `reference source is not strict UTF-8 text: ${entry.name}`); }
    }
  }
  return { valid: errors.length === 0, errors, warnings, count };
}
