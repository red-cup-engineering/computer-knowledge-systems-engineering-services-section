import path from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, opendir, readFile } from "node:fs/promises";
import { parseBibtex } from "./bibtex.mjs";
import { isGenerated } from "./detect.mjs";
import { validateNote } from "./note.mjs";
import { validateTerm } from "./term.mjs";
import { validateTriageText } from "./triage-text.mjs";

const manifests = new Set(["package.json", "pyproject.toml", "Cargo.toml", "go.mod"]);
const glossaryTerms = ["content", "text", "glossary", "terms"];
const triage = ["content", "text", "triage"];
const notes = ["content", "text", "documents", "articles", "notes"];
const forbiddenContentDirectories = new Set(["recovered-research", "topics", "provenance", "process", "processes", "archive", "_archive"]);
const digest = async (file) => { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); };
const parts = (relative) => relative ? relative.split(path.sep) : [];
const hasSuffix = (value, suffix) => suffix.every((part, index) => value[value.length - suffix.length + index] === part);
const includesParts = (value, sequence) => value.some((_part, index) => sequence.every((expected, offset) => value[index + offset] === expected));
const underContent = (value) => value.includes("content");
const underNotes = (value) => includesParts(value, notes);

export function accepts(entry) { return entry.type === "file" && entry.unit?.kind === "service-section"; }
export function includeExisting(entry) { return !isGenerated(entry.path); }
export async function propose(entry, destination) { const stat = await lstat(entry.absolutePath); const hash = await digest(entry.absolutePath); return { action: "copy", output: path.join(destination, entry.relativePath), sourceContentSha256: hash, proposedContentSha256: hash, identity: entry.relativePath.split(path.sep).join("/"), mode: stat.mode & 0o777, warnings: [] }; }

async function appendValidation(label, directory, validator, errors, warnings) {
  const result = await validator(directory);
  for (const error of result.errors) errors.push(`${label}: ${error}`);
  // Destination validation is not a repair pass: repairable source warnings are
  // still malformed authored output and therefore fail closed here.
  for (const warning of result.warnings) errors.push(`${label}: ${warning}`);
  warnings.push(...result.warnings.map((warning) => `${label}: ${warning}`));
}

async function validatePackage(file, relative, errors) {
  let manifest;
  try { manifest = JSON.parse(await readFile(file, "utf8")); } catch { errors.push(`invalid package.json: ${relative}`); return; }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) { errors.push(`invalid package.json: ${relative}`); return; }
  if (typeof manifest.name !== "string" || !manifest.name.trim()) errors.push(`package.json requires name: ${relative}`);
  // Scoped 561-group packages conventionally carry a human description; an
  // unscoped package may be a deliberately minimal local implementation.
  if (typeof manifest.name === "string" && manifest.name.startsWith("@561-group/") && (typeof manifest.description !== "string" || !manifest.description.trim())) errors.push(`package.json requires description: ${relative}`);
}

/** Read-only destination contract for authored service-section composition. */
export async function validate(root, { projected = false } = {}) {
  const errors = []; const warnings = []; let modeledFiles = 0; let modeledDirs = 0; let ignoredRoots = 0; let manifestCount = 0;
  const absoluteRoot = path.resolve(root);
  if (!projected && !path.basename(absoluteRoot).endsWith("-services-section")) errors.push("service section root must end with -services-section");

  async function inspectBoundary(directory, relative) {
    const relativeParts = parts(relative);
    if (hasSuffix(relativeParts, glossaryTerms)) await appendValidation("glossary terms", directory, validateTerm, errors, warnings);
    else if (hasSuffix(relativeParts, triage)) await appendValidation("triage text", directory, validateTriageText, errors, warnings);
    else if (hasSuffix(relativeParts, notes)) await appendValidation("notes", directory, validateNote, errors, warnings);
  }

  async function walk(directory, relative = "") {
    await inspectBoundary(directory, relative);
    let handle;
    try { handle = await opendir(directory); } catch { errors.push(`service section root does not exist: ${root}`); return; }
    for await (const entry of handle) {
      const child = path.join(directory, entry.name); const childRelative = path.join(relative, entry.name); const childParts = parts(childRelative);
      if (entry.isDirectory() && isGenerated(childRelative)) { ignoredRoots += 1; continue; }
      const stat = await lstat(child);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) { errors.push(`unsupported service node: ${childRelative}`); continue; }
      if (stat.isDirectory()) {
        modeledDirs += 1;
        const parentParts = parts(relative);
        if (parentParts.at(-1) === "services" && !entry.name.endsWith("-services-section")) errors.push(`service child must end with -services-section: ${childRelative}`);
        if (underContent(childParts) && !underNotes(childParts) && (forbiddenContentDirectories.has(entry.name) || /^\d{4}(?:[-_/]\d{2})?(?:[-_/]\d{2})?$/.test(entry.name))) errors.push(`active content contains opaque process/provenance directory: ${childRelative}`);
        await walk(child, childRelative);
        continue;
      }
      modeledFiles += 1;
      if (manifests.has(entry.name)) {
        manifestCount += 1;
        const text = await readFile(child, "utf8");
        if (!text.trim()) errors.push(`empty manifest: ${childRelative}`);
        if (entry.name === "package.json") await validatePackage(child, childRelative, errors);
      }
      if (entry.name === "bibliography.bib") {
        try { parseBibtex(await readFile(child, "utf8")); } catch (error) { errors.push(`invalid bibliography.bib: ${childRelative}: ${error.message}`); }
      }
    }
  }

  await walk(absoluteRoot);
  return { valid: errors.length === 0, errors, warnings, modeledFiles, modeledDirs, ignoredRoots, manifests: manifestCount };
}
