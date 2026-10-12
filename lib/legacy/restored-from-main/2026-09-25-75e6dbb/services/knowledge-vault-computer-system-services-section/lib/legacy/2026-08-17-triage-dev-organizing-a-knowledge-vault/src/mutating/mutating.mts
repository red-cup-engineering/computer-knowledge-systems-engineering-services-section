/**
 * mutating  -  the document-write surface, DERIVED from @emsenn/relating's
 * markdown codec.
 *
 * Simple document writes use relating's markdown codec; content-corpus document
 * preparation and updates use @emsenn/content's frontmatter/reference codecs.
 * Every filesystem operation is DRY-RUN BY DEFAULT: it
 * returns the prepared `{ path, text }` and writes only when `write` is set, and every
 * path is confined to the corpus root. The corpus memorystore (content/) is a strict
 * Indigenous-knowledge project with its own placement law; this package prepares
 * documents, it does not place them unbidden.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  conformRecord,
  decodeFrontMatterDocument,
  decodeReferences,
  encodeFrontMatterDocument,
  type ReferenceDialect,
  setReferences,
  type CslItem,
} from "@emsenn/content/codecs";
import { createMarkdown, type JsonValue } from "@emsenn/relating/writing";
import { confine } from "@emsenn/relating/ledger";
import { readDocument } from "../corpus/documents.mjs";
import { knowledgeVaultAllowedPrefixes, knowledgeVaultPathAllowedInRoot } from "../corpus/root.mjs";
import {
  documentOperationKind,
  documentTypeForOperationKind,
  normalizeCorpusPlacementTopic,
  targetPathForDocument,
} from "./placement.mjs";

/** A frontmatter record: the relating markdown codec's frontmatter shape. */
type FrontMatterRecord = Readonly<Record<string, JsonValue>>;

import type {
  DocumentOperationKind,
  DocumentBodyMutation,
  DocumentFrontmatterMutation,
  DocumentPreparation,
  DocumentPreparationLint,
  PreparedDocument,
  RelationalHullStage0Boundary,
  RelationalHullStage0BoundaryFile,
  TriageBatchUpload,
  TriageUpload,
} from "./carriers.mjs";
export type { PreparedDocument, RelationalHullStage0Boundary, RelationalHullStage0BoundaryFile, TriageBatchUpload, TriageUpload };

const MAX_TRIAGE_BYTES = 2_000_000;
export const RELATIONAL_HULL_STAGE0_BOUNDARY_PATH = "content/triaging/inbox";

/** Build a frontmatter record from the conventional fields plus any extra given. */
function buildFrontMatter(input: Readonly<Record<string, unknown>>): FrontMatterRecord {
  const record: Record<string, JsonValue> = {};
  if (typeof input["title"] === "string" && input["title"].trim() !== "") record["title"] = input["title"].trim();
  const tags = input["tags"];
  if (Array.isArray(tags)) record["tags"] = tags.filter((t): t is string => typeof t === "string");
  else if (typeof tags === "string" && tags.trim() !== "") record["tags"] = tags.split(",").map((t) => t.trim()).filter(Boolean);
  const extra = input["frontMatter"];
  if (extra !== null && typeof extra === "object" && !Array.isArray(extra)) Object.assign(record, extra as Readonly<Record<string, JsonValue>>);
  return Object.freeze(record);
}

/** Confined-write a prepared document under the corpus root. */
function place(root: string, relative: string, text: string): void {
  const full = confine(root, relative);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text, "utf8");
}

/**
 * prepare/create a document: encode `{ path, title, tags, body }` into a
 * frontmatter document via relating's markdown codec. Dry-run unless `write` is true.
 */
export function createDocument(root: string, input: Readonly<Record<string, unknown>>, write: boolean): PreparedDocument {
  const relative = typeof input["path"] === "string" ? input["path"].trim() : "";
  if (relative === "") throw new TypeError("create-document: a path is required");
  if (!knowledgeVaultPathAllowedInRoot(root, relative)) throw new TypeError("create-document: path must stay in an allowed corpus prefix");
  confine(root, relative);
  const body = typeof input["body"] === "string" ? input["body"] : "";
  const text = createMarkdown({ ...buildFrontMatter(input), body }, { bodyKey: "body" });
  if (write) place(root, relative, text);
  return Object.freeze({ kind: "organizing.knowledge-vault.mutating.prepared" as const, path: relative, text, written: write });
}

/**
 * Update a document's frontmatter: decode the existing document, merge the patch
 * over its frontmatter (via relating's markdown codec), re-encode. Dry-run unless `write`.
 */
export function updateFrontmatter(root: string, input: Readonly<Record<string, unknown>>, write: boolean): PreparedDocument {
  const relative = typeof input["path"] === "string" ? input["path"].trim() : "";
  if (relative === "") throw new TypeError("update-frontmatter: a path is required");
  if (!knowledgeVaultPathAllowedInRoot(root, relative)) throw new TypeError("update-frontmatter: path must stay in an allowed corpus prefix");
  const existing = readDocument(root, relative);
  const patch = buildFrontMatter(input);
  const merged = Object.freeze({ ...existing.frontmatter, ...patch });
  const text = createMarkdown({ ...merged, body: existing.body }, { bodyKey: "body" });
  if (write) place(root, relative, text);
  return Object.freeze({ kind: "organizing.knowledge-vault.mutating.prepared" as const, path: relative, text, written: write });
}

export interface TriageUploadInput {
  readonly content: string | Buffer;
  readonly filename?: string;
}

export interface TriageUploadOptions {
  readonly now?: Date;
  readonly write?: boolean;
}

export function prepareTriageUpload(root: string, input: TriageUploadInput, options: TriageUploadOptions = {}): TriageUpload {
  const data = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, "utf8");
  if (data.length === 0) throw new Error("content is required");
  if (data.length > MAX_TRIAGE_BYTES) throw new Error(`content exceeds ${MAX_TRIAGE_BYTES} bytes`);
  const now = options.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const [year, month, date] = day.split("-") as [string, string, string];
  const directory = `_triage/${year}/${month}/${date}`;
  const relative = uniqueTriagePath(root, directory, `${day}-${generatedSlug(data, input.filename)}`);
  if (options.write === true) {
    const full = confine(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, data, { flag: "wx" });
  }
  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.triage-upload" as const,
    path: relative,
    bytes: data.length,
    written: options.write === true,
  });
}

export function prepareTriageBatchUpload(root: string, inputs: readonly TriageUploadInput[], options: TriageUploadOptions = {}): TriageBatchUpload {
  if (inputs.length === 0) throw new Error("content or files are required");
  const files = inputs.map((input) => prepareTriageUpload(root, input, options));
  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.triage-batch-upload" as const,
    files: Object.freeze(files),
    count: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    written: options.write === true,
  });
}

export interface RelationalHullStage0BoundaryOptions {
  readonly limit?: number | string;
}

export interface RelationalHullStage0BoundaryFileInput {
  readonly content: string | Buffer;
  readonly filename?: string;
}

export interface RelationalHullStage0BoundaryFileOptions {
  readonly now?: Date;
  readonly write?: boolean;
}

export function scanRelationalHullStage0Boundary(
  root: string,
  options: RelationalHullStage0BoundaryOptions = {},
): RelationalHullStage0Boundary {
  const boundary = RELATIONAL_HULL_STAGE0_BOUNDARY_PATH;
  const full = confine(root, boundary);
  const limit = boundedBoundaryLimit(options.limit, 100);
  let entries: readonly RelationalHullStage0BoundaryFile[] = Object.freeze([]);
  try {
    entries = Object.freeze(readdirSync(full, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => boundaryFileCarrier(root, boundary, entry.name))
      .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt) || left.name.localeCompare(right.name)));
  } catch {
    return Object.freeze({
      kind: "organizing.knowledge-vault.mutating.relational-hull-stage0-boundary" as const,
      stage: 0,
      boundary,
      root,
      present: false,
      total: 0,
      truncated: false,
      files: Object.freeze([]),
    });
  }
  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.relational-hull-stage0-boundary" as const,
    stage: 0,
    boundary,
    root,
    present: true,
    total: entries.length,
    truncated: entries.length > limit,
    files: Object.freeze(entries.slice(0, limit)),
  });
}

export function prepareRelationalHullStage0BoundaryFile(
  root: string,
  input: RelationalHullStage0BoundaryFileInput,
  options: RelationalHullStage0BoundaryFileOptions = {},
): RelationalHullStage0BoundaryFile {
  const data = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, "utf8");
  if (data.length === 0) throw new Error("content is required");
  if (data.length > MAX_TRIAGE_BYTES) throw new Error(`content exceeds ${MAX_TRIAGE_BYTES} bytes`);
  const boundary = RELATIONAL_HULL_STAGE0_BOUNDARY_PATH;
  const now = options.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const relative = uniqueTriagePath(root, boundary, `${day}-${generatedSlug(data, input.filename)}`);
  if (options.write === true) {
    const full = confine(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, data, { flag: "wx" });
  }
  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.relational-hull-stage0-boundary-file" as const,
    stage: 0,
    boundary,
    path: relative,
    name: path.posix.basename(relative),
    bytes: data.length,
    modifiedAt: now.toISOString(),
    mediaType: "text/markdown; charset=utf-8",
    written: options.write === true,
  });
}

export interface PrepareCorpusDocumentOptions {
  readonly allowedPrefixes?: readonly string[];
  readonly exists?: (targetPath: string) => boolean;
}

export function prepareCorpusDocument(
  root: string,
  input: Readonly<Record<string, unknown>>,
  options: PrepareCorpusDocumentOptions = {},
): DocumentPreparation {
  const lint: DocumentPreparationLint[] = [];
  const topic = stringField(input["topic"] ?? input["path"]);
  const title = stringField(input["title"]);
  const markdownBody = typeof input["body"] === "string" ? input["body"] : "";
  const kind = documentOperationKind(input["kind"]);
  if (topic.length === 0) lint.push(Object.freeze({ severity: "error", rule: "missing-topic", message: "`topic` is required" }));
  if (title.length === 0) lint.push(Object.freeze({ severity: "error", rule: "missing-title", message: "`title` is required" }));
  if (markdownBody.trim().length === 0) lint.push(Object.freeze({ severity: "error", rule: "missing-body", message: "`body` is required" }));
  if (kind === null) lint.push(Object.freeze({ severity: "error", rule: "invalid-kind", message: "kind must be one of explanation, term, guide, reference, specification, tutorial" }));
  if (!/^#\s+/m.test(markdownBody)) lint.push(Object.freeze({ severity: "warning", rule: "body-missing-h1", message: "body has no Markdown H1 heading" }));

  const documentKind = kind ?? "explanation";
  const requestedTargetPath = stringField(input["targetPath"]);
  const allowedPrefixes = options.allowedPrefixes ?? knowledgeVaultAllowedPrefixes(root);
  const targetPath = targetPathForDocument({
    topic,
    kind: documentKind,
    title,
    ...(requestedTargetPath.length > 0 ? { targetPath: requestedTargetPath } : {}),
    allowedPrefixes,
  });
  if (targetPath === null) {
    lint.push(Object.freeze({ severity: "error", rule: "invalid-target-path", message: "target path must stay in an allowed corpus prefix and end with .md" }));
  } else {
    confine(root, targetPath);
  }

  const tags = canonicalTags(input["tags"]);
  if (input["tags"] !== undefined && tags.length === 0) {
    lint.push(Object.freeze({ severity: "warning", rule: "tags-empty", message: "`tags` was provided but no string tags were readable" }));
  }
  const aliases = stringListField(input["aliases"]);
  const extra = recordField(input["frontmatter"]);
  const references = cslItemsField(input["references"]);
  if (input["references"] !== undefined && references.length === 0) {
    lint.push(Object.freeze({ severity: "warning", rule: "references-empty", message: "`references` was provided but no CSL items with a `type` were readable" }));
  }

  const frontmatter: Record<string, unknown> = {
    ...extra,
    title,
    type: documentTypeForOperationKind(documentKind),
  };
  if (tags.length > 0) frontmatter["tags"] = tags;
  if (aliases.length > 0) frontmatter["aliases"] = aliases;
  const status = stringField(input["status"]);
  if (status.length > 0) frontmatter["status"] = status;

  let textValue = "";
  try {
    textValue = encodeFrontMatterDocument({ frontMatter: Object.freeze(frontmatter), body: markdownBody });
    decodeFrontMatterDocument(textValue);
    if (references.length > 0) {
      textValue = setReferences(textValue, references);
      const decodedReferences = decodeReferences(textValue);
      if (decodedReferences.dialect !== "csl" && decodedReferences.dialect !== "empty") {
        lint.push(Object.freeze({ severity: "error", rule: "references-not-csl", message: "references did not encode as canonical CSL/citeproc" }));
      }
    }
  } catch (error) {
    lint.push(Object.freeze({
      severity: "error",
      rule: "frontmatter-not-encodable",
      message: error instanceof Error ? error.message : String(error),
    }));
  }

  if (targetPath !== null) {
    for (const finding of conformRecord(targetPath, Object.freeze(frontmatter))) {
      lint.push(Object.freeze({ severity: finding.severity, rule: finding.rule, message: finding.message }));
    }
  }

  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.document-preparation" as const,
    topic: normalizeCorpusPlacementTopic(topic, allowedPrefixes),
    documentKind,
    path: targetPath ?? "",
    targetPath: targetPath ?? "",
    exists: targetPath === null ? false : options.exists?.(targetPath) ?? existsSync(confine(root, targetPath)),
    frontmatter: Object.freeze(frontmatter),
    references,
    text: textValue,
    lint: Object.freeze(lint),
  });
}

export function hasDocumentPreparationErrors(prepared: Pick<DocumentPreparation, "lint">): boolean {
  return prepared.lint.some((item) => item.severity === "error");
}

export interface PrepareCorpusFrontmatterUpdateOptions {
  readonly dryRun?: boolean;
}

export function prepareCorpusFrontmatterUpdate(
  documentPath: string,
  existingText: string,
  input: Readonly<Record<string, unknown>>,
  options: PrepareCorpusFrontmatterUpdateOptions = {},
): DocumentFrontmatterMutation {
  const existingReferences = decodeReferences(existingText);
  const normalizeReferences = booleanField(input["normalizeReferences"], false);
  if (normalizeReferences && input["references"] === undefined && existingReferences.dialect === "mixed") {
    throw new Error("existing references are not readable enough to normalize without an explicit references array");
  }
  const decoded = decodeFrontMatterDocument(withoutReferencesBlock(existingText));
  const set = recordField(input["set"]);
  const frontmatter: Record<string, unknown> = { ...decoded.frontMatter, ...set };
  if (frontmatter["tags"] !== undefined) frontmatter["tags"] = canonicalTags(frontmatter["tags"]);
  for (const field of stringListField(input["unset"])) {
    if (field === "references") throw new Error("references must be updated with the references field, not unset");
    delete frontmatter[field];
  }
  const addTags = stringListField(input["addTags"]);
  const removeTags = stringListField(input["removeTags"]);
  if (addTags.length > 0 || removeTags.length > 0) {
    frontmatter["tags"] = mergeTags(frontmatter["tags"], addTags, removeTags);
  }

  let textValue = encodeFrontMatterDocument({ frontMatter: Object.freeze(frontmatter), body: decoded.body });
  const references = input["references"] === undefined ? existingReferences.items : cslItemsField(input["references"]);
  const shouldNormalizeExisting = normalizeReferences && existingReferences.dialect !== "none";
  if (references.length > 0 || input["references"] !== undefined || existingReferences.dialect === "empty" || shouldNormalizeExisting) {
    textValue = setReferences(textValue, references);
  }
  const nextReferences = decodeReferences(textValue);
  const dryRun = options.dryRun ?? true;
  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.document-frontmatter-mutation" as const,
    path: documentPath,
    dryRun,
    written: false,
    frontmatter: Object.freeze(frontmatter),
    findings: Object.freeze(conformRecord(documentPath, Object.freeze(frontmatter)).map(mutationFinding)),
    references: Object.freeze({
      beforeDialect: existingReferences.dialect,
      afterDialect: nextReferences.dialect,
      itemCount: nextReferences.items.length,
      canonical: canonicalReferenceDialect(nextReferences.dialect),
      normalizeRequested: normalizeReferences,
      replacementRequested: input["references"] !== undefined,
    }),
    text: textValue,
  });
}

export interface PrepareCorpusBodyUpdateOptions {
  readonly dryRun?: boolean;
}

export function prepareCorpusBodyUpdate(
  documentPath: string,
  existingText: string,
  nextBody: string,
  options: PrepareCorpusBodyUpdateOptions = {},
): DocumentBodyMutation {
  if (nextBody.trim().length === 0) throw new Error("body must be a non-empty string");
  const existingReferences = decodeReferences(existingText);
  const decoded = decodeFrontMatterDocument(withoutReferencesBlock(existingText));
  let textValue = encodeFrontMatterDocument({
    frontMatter: decoded.frontMatter,
    body: nextBody.endsWith("\n") ? nextBody : `${nextBody}\n`,
  });
  if (existingReferences.items.length > 0 || existingReferences.dialect === "empty") {
    textValue = setReferences(textValue, existingReferences.items);
  }
  const dryRun = options.dryRun ?? true;
  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.document-body-mutation" as const,
    path: documentPath,
    dryRun,
    written: false,
    frontmatter: decoded.frontMatter,
    findings: Object.freeze(conformRecord(documentPath, decoded.frontMatter).map(mutationFinding)),
    references: Object.freeze({
      beforeDialect: existingReferences.dialect,
      itemCount: existingReferences.items.length,
      preserved: true,
    }),
    text: textValue,
  });
}

function uniqueTriagePath(root: string, directory: string, basename: string): string {
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const relative = `${directory}/${basename}${suffix}.md`;
    if (!existsSync(confine(root, relative))) {
      return relative;
    }
  }
  throw new Error("could not allocate a unique triage path");
}

function boundaryFileCarrier(root: string, boundary: typeof RELATIONAL_HULL_STAGE0_BOUNDARY_PATH, name: string): RelationalHullStage0BoundaryFile {
  const relative = `${boundary}/${name}`;
  const stats = statSync(confine(root, relative));
  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.relational-hull-stage0-boundary-file" as const,
    stage: 0,
    boundary,
    path: relative,
    name,
    bytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    mediaType: mediaTypeForBoundaryFile(name),
  });
}

function mediaTypeForBoundaryFile(name: string): string {
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "text/markdown; charset=utf-8";
  if (name.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (name.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function boundedBoundaryLimit(value: number | string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(1_000, Math.floor(parsed)));
}

function generatedSlug(data: Buffer, filename?: string): string {
  const basis = filenameBasis(filename) || titleBasis(data.toString("utf8"));
  const words = basis.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const readable = words.slice(0, 8).join("-");
  const digest = createHash("sha256").update(data).digest("hex").slice(0, 10);
  return [readable || "triage", digest].join("-");
}

function filenameBasis(filename: string | undefined): string {
  if (filename === undefined) return "";
  const parsed = path.parse(filename.replace(/\\/g, "/"));
  return parsed.name.trim() || parsed.base.trim();
}

function titleBasis(content: string): string {
  const heading = content.split("\n").map((line) => line.trim()).find((line) => /^#\s+/.test(line));
  if (heading !== undefined) return heading.replace(/^#\s+/, "").trim();
  return content.split("\n").map((line) => line.trim()).find((line) => line.length > 0) ?? "triage";
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringListField(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return Object.freeze(value
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter((item) => item.length > 0));
  }
  if (typeof value === "string") return Object.freeze(value.split(",").map((item) => item.trim()).filter((item) => item.length > 0));
  return Object.freeze([]);
}

function canonicalTag(value: string): string {
  return (value.trim().replace(/^#+/, "").toLowerCase().match(/[a-z0-9]+/g) ?? []).join("-");
}

function canonicalTags(value: unknown): readonly string[] {
  return Object.freeze([...new Set(stringListField(value).map(canonicalTag).filter((tag) => tag.length > 0))].sort((left, right) => left.localeCompare(right)));
}

function recordField(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cslItemsField(value: unknown): readonly CslItem[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.filter((item): item is CslItem =>
    item !== null
    && typeof item === "object"
    && !Array.isArray(item)
    && typeof (item as Record<string, unknown>)["type"] === "string"));
}

function booleanField(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function mergeTags(current: unknown, add: readonly string[], remove: readonly string[]): readonly string[] {
  const tags = new Set(canonicalTags(current));
  for (const tag of add.map(canonicalTag).filter((tag) => tag.length > 0)) tags.add(tag);
  for (const tag of remove.map(canonicalTag).filter((tag) => tag.length > 0)) tags.delete(tag);
  return Object.freeze([...tags].sort((left, right) => left.localeCompare(right)));
}

function withoutReferencesBlock(documentText: string): string {
  const lines = documentText.split("\n");
  if (stripLineCr(lines[0] ?? "") !== "---") return documentText;
  let close = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (stripLineCr(lines[i] ?? "") === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) return documentText;
  let refStart = -1;
  for (let i = 1; i < close; i += 1) {
    if (/^references:(\s|$)/.test(stripLineCr(lines[i] ?? ""))) {
      refStart = i;
      break;
    }
  }
  if (refStart === -1) return documentText;
  let refEnd = close;
  for (let i = refStart + 1; i < close; i += 1) {
    const line = stripLineCr(lines[i] ?? "");
    if (line !== "" && !/^\s/.test(line)) {
      refEnd = i;
      break;
    }
  }
  return [...lines.slice(0, refStart), ...lines.slice(refEnd)].join("\n");
}

function stripLineCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function canonicalReferenceDialect(value: ReferenceDialect): boolean {
  return value === "csl" || value === "empty" || value === "none";
}

function mutationFinding(value: ReturnType<typeof conformRecord>[number]) {
  return Object.freeze({
    ...(value.path === undefined ? {} : { path: value.path }),
    rule: value.rule,
    severity: value.severity,
    message: value.message,
  });
}
