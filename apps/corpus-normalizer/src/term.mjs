import { createHash } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { opendir } from "node:fs/promises";
import { migrateLegacyTermMarkdown, recognizeTermMarkdown } from "@red-cup-engineering/term-engineering-services-section/carrier";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const canonicalFilename = (base) => base.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const validateTermFilename = (file) => /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(file);

function frontmatter(text) {
  const repaired = text.startsWith("\ufeff---\n") ? text.slice(1) : text;
  if (!repaired.startsWith("---\n")) return { fields: {}, body: repaired, repair: text !== repaired ? "removed UTF-8 BOM before YAML frontmatter" : null, warning: null };
  const close = repaired.indexOf("\n---", 4);
  if (close < 0) return { fields: {}, body: repaired, repair: null, warning: "unterminated YAML frontmatter" };
  let header = repaired.slice(4, close); const repairs = text !== repaired ? ["removed UTF-8 BOM before YAML frontmatter"] : [];
  const repairedLines = [];
  for (const line of header.split("\n")) {
    if (!/^\{.*\}$/.test(line.trim())) { repairedLines.push(line); continue; }
    try {
      const value = JSON.parse(line); if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("not object");
      repairedLines.push(...Object.entries(value).map(([key, item]) => `${key}: ${JSON.stringify(item)}`)); repairs.push("expanded inline JSON metadata object in YAML frontmatter");
    } catch { repairedLines.push(line); }
  }
  header = repairedLines.join("\n");
  const fields = {}; let active = null;
  for (const line of header.split("\n")) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (match) { active = match[1].toLowerCase(); fields[active] = match[2] ? match[2].replace(/^['"]|['"]$/g, "") : []; }
    else if (/^\s+-\s+(.+)$/.test(line) && active && Array.isArray(fields[active])) fields[active].push(/^\s+-\s+(.+)$/.exec(line)[1].replace(/^['"]|['"]$/g, ""));
    else if (line.trim() && !/^\s/.test(line) && !/^-\s/.test(line)) return { fields, body: repaired, repair: null, warning: `unparseable YAML frontmatter line: ${line}` };
  }
  const repairedSource = `---\n${header}${repaired.slice(close)}`;
  return { fields, body: repaired.slice(close + 4), repair: repairs.join("; ") || null, repairedSource, warning: null };
}

function firstOrg(text, directive) { return new RegExp(`^#\\+${directive}:\\s*(.+)$`, "im").exec(text)?.[1]?.trim() ?? null; }

/** Actual glossary evidence: Markdown defines/name/title; Org name/title/index; heading; filename. */
export function deriveTermIdentity(source, extension, filename) {
  if (extension === ".org") {
    for (const field of ["name", "title", "index"]) { const value = firstOrg(source, field); if (value) return { value, evidence: `Org #+${field}` }; }
  } else {
    const parsed = frontmatter(source);
    for (const field of ["defines", "name", "title"]) if (parsed.fields[field]) return { value: Array.isArray(parsed.fields[field]) ? parsed.fields[field][0] : parsed.fields[field], evidence: `YAML ${field}` };
    const heading = /^#{1,6}\s+(.+)$/m.exec(parsed.body)?.[1]?.trim(); if (heading) return { value: heading, evidence: "Markdown heading" };
  }
  return { value: path.basename(filename, extension), evidence: "source filename fallback" };
}

export function normalizeTermSource(source, extension) {
  const normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd() + "\n";
  if (extension !== ".md") return { content: normalized, repair: null, warning: null };
  const parsed = frontmatter(normalized);
  return { content: parsed.repairedSource ?? (normalized.startsWith("\ufeff") ? normalized.slice(1) : normalized), repair: parsed.repair, warning: parsed.warning };
}

export async function proposeTerm(sourcePath, destination) {
  const extension = path.extname(sourcePath).toLowerCase();
  if (![".md", ".org"].includes(extension)) throw new Error("term candidates must be Markdown or Org");
  const raw = await readFile(sourcePath); const source = raw.toString("utf8"); const normalized = normalizeTermSource(source, extension);
  const filename = `${canonicalFilename(path.basename(sourcePath, extension))}.md`;
  if (!validateTermFilename(filename)) throw new Error("term filename has no canonical form");
  if (extension === ".md") {
    const migrated = migrateLegacyTermMarkdown({ text: normalized.content, filename });
    // The carrier is identified by its filename stem; what it defines, and the definition itself apart
    // from that carrier identity, are what make two sources one term.
    const defines = deriveTermIdentity(normalized.content, extension, filename);
    const { identity: carrier, ...definition } = migrated.record;
    // A name the owner defaulted from the filename stem says nothing about the definition itself.
    const explicit = frontmatter(normalized.content).fields;
    if (definition.name === carrier && explicit.name === undefined && explicit.title === undefined && explicit.defines === undefined) delete definition.name;
    const definitionSha256 = sha256(JSON.stringify(Object.fromEntries(Object.entries(definition).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))));
    return { action: "write", output: path.join(destination, filename), content: migrated.markdown, sourceContentSha256: sha256(raw), proposedContentSha256: sha256(migrated.markdown), identity: carrier, identityEvidence: "canonical filename", definesIdentity: defines.value.normalize("NFKC").trim().toLowerCase(), definesEvidence: defines.evidence, definitionSha256, repair: normalized.repair, warnings: [] };
  }
  const identity = deriveTermIdentity(normalized.content, extension, filename);
  return { action: "write", output: path.join(destination, filename), content: normalized.content, sourceContentSha256: sha256(raw), proposedContentSha256: sha256(normalized.content), identity: identity.value.normalize("NFKC").trim().toLowerCase(), identityEvidence: identity.evidence, repair: normalized.repair, warnings: normalized.warning ? [normalized.warning] : [] };
}

export function inspectTermFile(source, filename) {
  const extension = path.extname(filename).toLowerCase(); const normalized = normalizeTermSource(source, extension);
  return { ...normalized, identity: deriveTermIdentity(normalized.content, extension, filename) };
}

export async function validateTerm(root) {
  const errors = []; const warnings = []; let count = 0; let handle;
  try { handle = await opendir(root); } catch { return { valid: false, errors: [`term root does not exist: ${root}`], warnings, count }; }
  for await (const entry of handle) { if (!entry.isFile()) { errors.push(`term root must be flat; found non-file ${entry.name}`); continue; } if (!validateTermFilename(entry.name)) { errors.push(`noncanonical term filename: ${entry.name}`); continue; } const source = await readFile(path.join(root, entry.name), "utf8"); if (!source.trim()) errors.push(`empty term file: ${entry.name}`); else { const recognized = recognizeTermMarkdown({ text: source, filename: entry.name }); if (!recognized.admitted) errors.push(`invalid term ${entry.name}: ${recognized.findings.map(({ message }) => message).join("; ")}`); } count += 1; }
  return { valid: errors.length === 0, errors, warnings, count };
}
