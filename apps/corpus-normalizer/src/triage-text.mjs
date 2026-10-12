import path from "node:path";
import { readFile } from "node:fs/promises";
import { canonicalFilename, sha256 } from "./term.mjs";

const extensions = new Set([".md", ".org", ".html", ".txt", ".tex"]);
export async function proposeTriageText(sourcePath, destination) {
  const extension = path.extname(sourcePath).toLowerCase();
  if (!extensions.has(extension)) throw new Error(`unsupported triage text extension: ${extension}`);
  const raw = await readFile(sourcePath); const content = raw.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd() + "\n";
  if (!content.trim()) throw new Error("triage text is empty");
  const name = canonicalFilename(path.basename(sourcePath, extension));
  if (!name) throw new Error("triage filename has no canonical form");
  return { action: "write", output: path.join(destination, `${name}${extension}`), content, sourceContentSha256: sha256(raw), proposedContentSha256: sha256(content), identity: `${name}${extension}`, identityEvidence: "source basename", warnings: [] };
}

export async function validateTriageText(root) {
  const { opendir, readFile } = await import("node:fs/promises"); const errors = []; const warnings = []; let count = 0;
  let handle; try { handle = await opendir(root); } catch { return { valid: false, errors: [`triage root does not exist: ${root}`], warnings, count }; }
  for await (const entry of handle) { const ext = path.extname(entry.name).toLowerCase(); if (!entry.isFile()) errors.push(`triage root must be flat; found ${entry.name}`); else if (!extensions.has(ext) || `${canonicalFilename(path.basename(entry.name, ext))}${ext}` !== entry.name) errors.push(`noncanonical triage filename: ${entry.name}`); else if (!(await readFile(path.join(root, entry.name), "utf8")).trim()) errors.push(`empty triage text: ${entry.name}`); count += 1; }
  return { valid: errors.length === 0, errors, warnings, count };
}
