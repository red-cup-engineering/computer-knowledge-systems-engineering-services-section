import path from "node:path";
import { opendir, readFile } from "node:fs/promises";
import { canonicalFilename, sha256 } from "./term.mjs";
import { splitMarkdownFrontmatterFence } from "@red-cup-engineering/markdown-engineering-services-section/split-markdown-frontmatter-fence";

const extensions = new Set([".md", ".org", ".html"]);
const iso = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => {
  if (!iso.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const dateIn = (value) => /\b(\d{4}-\d{2}-\d{2})\b/.exec(value)?.[1] ?? null;

function contentDate(content, extension) {
  if (extension === ".org") return dateIn(/^#\+date:\s*(.+)$/im.exec(content)?.[1] ?? "");
  const header = splitMarkdownFrontmatterFence(content)?.raw ?? "";
  return dateIn(/^(?:date|date-created):\s*(.+)$/im.exec(header)?.[1] ?? "");
}

function ancestryDate(sourcePath) {
  const parts = path.resolve(sourcePath).split(path.sep);
  for (let index = parts.length - 2; index >= 2; index -= 1) {
    const candidate = `${parts[index - 2]}-${parts[index - 1]}-${parts[index]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate) && validDate(candidate)) return candidate;
  }
  return null;
}

export function deriveNoteDate(sourcePath, content, extension) {
  const filename = path.basename(sourcePath, extension); const fromName = /^(\d{4}-\d{2}-\d{2})(?:\b|[-_])/.exec(filename)?.[1];
  if (fromName && validDate(fromName)) return { value: fromName, evidence: "filename date prefix" };
  const fromContent = contentDate(content, extension); if (fromContent && validDate(fromContent)) return { value: fromContent, evidence: extension === ".org" ? "Org #+date" : "frontmatter date" };
  const fromAncestry = ancestryDate(sourcePath); if (fromAncestry) return { value: fromAncestry, evidence: "source YYYY/MM/DD ancestry" };
  return { value: null, evidence: "undated" };
}

export async function proposeNote(sourcePath, destination) {
  const extension = path.extname(sourcePath).toLowerCase(); if (!extensions.has(extension)) throw new Error(`unsupported note extension: ${extension}`);
  const raw = await readFile(sourcePath); const content = raw.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd() + "\n";
  if (!content.trim()) throw new Error("note is empty");
  const date = deriveNoteDate(sourcePath, content, extension); let base = path.basename(sourcePath, extension);
  if (date.value) base = base.replace(new RegExp(`^${date.value}(?:[\s_-]+)?`), "");
  const slug = canonicalFilename(base); if (!slug) throw new Error("note filename has no canonical form");
  const relative = date.value ? path.join(date.value.slice(0, 4), date.value.slice(5, 7), date.value.slice(8, 10), `${date.value}-${slug}${extension}`) : path.join("undated", `${slug}${extension}`);
  const output = path.join(destination, relative);
  return { action: "write", output, content, sourceContentSha256: sha256(raw), proposedContentSha256: sha256(content), identity: relative.split(path.sep).join("/"), identityEvidence: date.evidence, warnings: [] };
}

export async function validateNote(root) {
  const errors = []; const warnings = []; let count = 0;
  async function inspect(directory, relative = "") {
    let handle; try { handle = await opendir(directory); } catch { errors.push(`note root does not exist: ${root}`); return; }
    for await (const entry of handle) {
      const childRelative = path.join(relative, entry.name); const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) { errors.push(`unsupported note node: ${childRelative}`); continue; }
      if (entry.isDirectory()) {
        const directoryParts = childRelative.split(path.sep); const allowed = directoryParts.length === 1 && (entry.name === "undated" || /^\d{4}$/.test(entry.name)) || directoryParts.length === 2 && /^\d{4}$/.test(directoryParts[0]) && /^\d{2}$/.test(directoryParts[1]) || directoryParts.length === 3 && /^\d{4}$/.test(directoryParts[0]) && /^\d{2}$/.test(directoryParts[1]) && /^\d{2}$/.test(directoryParts[2]);
        if (!allowed) errors.push(`note has invalid directory: ${childRelative}`); await inspect(child, childRelative); continue;
      }
      const parts = childRelative.split(path.sep); const ext = path.extname(entry.name).toLowerCase();
      const undated = parts.length === 2 && parts[0] === "undated";
      const dated = parts.length === 4 && /^\d{4}$/.test(parts[0]) && /^\d{2}$/.test(parts[1]) && /^\d{2}$/.test(parts[2]);
      count += 1;
      if (!undated && !dated) { errors.push(`note has invalid layout: ${childRelative}`); continue; }
      if (!extensions.has(ext) || `${canonicalFilename(path.basename(entry.name, ext))}${ext}` !== entry.name) errors.push(`noncanonical note filename: ${childRelative}`);
      if (dated) { const date = `${parts[0]}-${parts[1]}-${parts[2]}`; if (!validDate(date) || !entry.name.startsWith(`${date}-`)) errors.push(`note date does not match directory: ${childRelative}`); }
      if (!(await readFile(child, "utf8")).trim()) errors.push(`empty note: ${childRelative}`);
    }
  }
  await inspect(root); return { valid: errors.length === 0, errors, warnings, count };
}
