import path from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, opendir, readFile } from "node:fs/promises";
import { isGenerated } from "./detect.mjs";

const manifests = new Set(["package.json", "pyproject.toml", "Cargo.toml", "go.mod"]);
const transientMetadata = new Set(["execution", "executionInfo", "widgets"]);
const sourceHash = async (file) => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
const contentHash = (content) => createHash("sha256").update(content).digest("hex");
const canonicalBase = (file) => path.basename(file, path.extname(file)).normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "notebook";
const normalizeText = (content) => content.replace(/\r\n?/g, "\n").trimEnd() + "\n";

function rewriteRules(rewriteMap) {
  if (rewriteMap == null) return [];
  if (typeof rewriteMap !== "object" || Array.isArray(rewriteMap)) throw new Error("rewrite map must be an object of exact Python module identifiers");
  return Object.entries(rewriteMap).map(([from, to]) => {
    if (typeof from !== "string" || typeof to !== "string" || !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(from) || !/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(to)) throw new Error("rewrite map entries must map exact Python module identifiers to exact Python module identifiers");
    return { from, to, expression: new RegExp(`^(\\s*(?:from|import)\\s+)${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\b)`, "gm") };
  });
}
function rewritePython(content, rules, replacements) {
  let result = content;
  for (const rule of rules) result = result.replace(rule.expression, (match, prefix) => { replacements.push({ from: rule.from, to: rule.to, rule: "python-import-identifier" }); return `${prefix}${rule.to}`; });
  return result;
}
function cleanMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return;
  for (const key of transientMetadata) delete metadata[key];
}
function normalizeNotebook(raw, rules) {
  let notebook;
  try { notebook = JSON.parse(raw); } catch { throw new Error("notebook is not valid JSON"); }
  if (!notebook || typeof notebook !== "object" || !Number.isInteger(notebook.nbformat) || !Array.isArray(notebook.cells)) throw new Error("notebook requires integer nbformat and cells array");
  const normalized = JSON.parse(JSON.stringify(notebook)); const replacements = [];
  cleanMetadata(normalized.metadata);
  for (const cell of normalized.cells) {
    if (!cell || typeof cell !== "object" || typeof cell.cell_type !== "string") throw new Error("notebook has malformed cell");
    cleanMetadata(cell.metadata);
    if (cell.cell_type === "code") { cell.execution_count = null; cell.outputs = []; if (typeof cell.source === "string") cell.source = rewritePython(cell.source, rules, replacements); else if (Array.isArray(cell.source)) cell.source = cell.source.map((line) => typeof line === "string" ? rewritePython(line, rules, replacements) : line); }
  }
  return { content: `${JSON.stringify(normalized, null, 2)}\n`, replacements };
}
function isJupytext(content) { return /(^|\n)#\s*%%(?:\s|\[|$)/.test(content) || /(^|\n)#\s*---[\s\S]{0,400}?\bjupytext\b/.test(content); }
function normalizeJupytext(raw, rules) {
  const content = normalizeText(raw); const replacements = []; const lines = content.split("\n"); let markdown = false;
  const rewritten = lines.map((line) => { if (/^#\s*%%/.test(line)) { markdown = /\[markdown\]/i.test(line); return line; } return markdown ? line : rewritePython(line, rules, replacements); }).join("\n");
  return { content: normalizeText(rewritten), replacements };
}

export function accepts(entry) { return entry.type === "file" && entry.unit?.kind === "package-root" && entry.unit.root === "."; }
export async function isStandaloneNotebook(entry) { if (entry.type !== "file") return false; if (path.extname(entry.absolutePath).toLowerCase() === ".ipynb") return true; if (path.extname(entry.absolutePath).toLowerCase() !== ".py") return false; return isJupytext(await readFile(entry.absolutePath, "utf8")); }
export async function destinationNotebookContract(destination) { const audit = await validate(destination); try { const stat = await lstat(path.join(destination, "notebooks")); return { valid: audit.valid && stat.isDirectory(), audit }; } catch { return { valid: false, audit }; } }
export async function propose(entry, destination) { const stat = await lstat(entry.absolutePath); const hash = await sourceHash(entry.absolutePath); return { action: "copy", output: path.join(destination, entry.relativePath), sourceContentSha256: hash, proposedContentSha256: hash, identity: entry.relativePath.split(path.sep).join("/"), mode: stat.mode & 0o777, warnings: [] }; }
export async function proposeNotebook(entry, destination, rewriteMap) {
  const extension = path.extname(entry.absolutePath).toLowerCase(); const raw = await readFile(entry.absolutePath, "utf8"); const rules = rewriteRules(rewriteMap); const normalized = extension === ".ipynb" ? normalizeNotebook(raw, rules) : normalizeJupytext(raw, rules); const output = path.join(destination, "notebooks", `${canonicalBase(entry.relativePath)}${extension}`);
  return { action: "write", output, sourceContentSha256: await sourceHash(entry.absolutePath), proposedContentSha256: contentHash(normalized.content), content: normalized.content, identity: path.relative(destination, output).split(path.sep).join("/"), replacements: normalized.replacements, warnings: [] };
}
export function includeExisting(entry) { return !isGenerated(entry.path); }
export async function auditNotebooks(root) {
  const directory = path.join(root, "notebooks"); const sources = []; const generatedSubdirs = []; const stems = new Map();
  try { const handle = await opendir(directory); for await (const entry of handle) { if (entry.isDirectory()) { generatedSubdirs.push(entry.name); continue; } if (!entry.isFile() || ![".ipynb", ".py"].includes(path.extname(entry.name).toLowerCase())) continue; sources.push(entry.name); const stem = path.basename(entry.name, path.extname(entry.name)); stems.set(stem, [...(stems.get(stem) ?? []), entry.name]); } } catch (error) { if (error.code === "ENOENT") return { exists: false, sources: [], pairedStems: [], generatedSubdirs: [] }; throw error; }
  return { exists: true, sources: sources.sort(), pairedStems: [...stems.entries()].filter(([, files]) => files.length > 1).map(([stem]) => stem).sort(), generatedSubdirs: generatedSubdirs.sort() };
}
export async function validate(root) { const errors = []; const warnings = []; let count = 0; let ignoredRoots = 0; let manifestCount = 0; async function walk(directory, relative = "") { const handle = await opendir(directory); for await (const entry of handle) { const child = path.join(directory, entry.name); const childRelative = path.join(relative, entry.name); if (entry.isDirectory() && isGenerated(childRelative)) { ignoredRoots += 1; continue; } const stat = await lstat(child); if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) { errors.push(`unsupported application node: ${childRelative}`); continue; } if (stat.isDirectory()) await walk(child, childRelative); else { count += 1; if (manifests.has(entry.name)) { manifestCount += 1; const text = await readFile(child, "utf8"); if (!text.trim()) errors.push(`empty manifest: ${childRelative}`); if (entry.name === "package.json") try { JSON.parse(text); } catch { errors.push(`invalid package.json: ${childRelative}`); } } } } }
  try { await walk(root); } catch { errors.push(`application root does not exist: ${root}`); } return { valid: errors.length === 0 && manifestCount > 0, errors: manifestCount ? errors : [...errors, "application has no project manifest"], warnings, count, modeledFiles: count, ignoredRoots, manifests: manifestCount };
}
