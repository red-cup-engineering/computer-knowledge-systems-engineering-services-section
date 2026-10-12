/**
 * corpus/documents  -  reading the corpus through relating's content reader + markdown codec.
 *
 * knowing re-enacts NONE of the I/O: the fs walking and confinement are relating's
 * (`@emsenn/relating/ledger`  -  the one effectful binding), and decoding is
 * relating's markdown codec. This package names the result as corpus carriers. A document is a
 * holography `Resource` decoded by `markdownDataform`; listing and gathering are the
 * reader's confined enumeration. (The former hand-rolled fs walk + the `find` path-scan are
 * gone  -  reading the corpus belongs to relating's capability surface; `find` is proof search.)
 */
import { confine, readContentResource, listContentEntries, readContentTree } from "@emsenn/relating/ledger";
import { statSync } from "node:fs";
import { markdown, type JsonValue } from "@emsenn/relating/writing";
import type { Resource } from "@emsenn/relating/writing/projector";
import type { CorpusDocument, Listing, ListEntry } from "./carriers.mjs";
import { corpusListLimit, corpusReadBounds } from "./bounds.mjs";
import { knowledgeVaultPathAllowedInRoot, normalizeKnowledgeVaultPath } from "./root.mjs";

export type { Resource, CorpusDocument, Listing, ListEntry };

/**
 * read : address  -  the document decoded by relating's markdown codec. The addressed `.md`
 * is read as a holography Resource and run through `markdownDataform`, so the carrier is the
 * *decoded* document (subject, frontmatter, body, byte length, conformance verdict,
 * and the EAVT assertions the codec derives). The corpus-relative path is the codec witness.
 */
export function readDocument(root: string, relative: string): CorpusDocument {
  const resource = readContentResource(root, requireReadableCorpusPath(root, relative, "read document path"));
  const dataform = markdown.markdownDataform(resource.content, { witness: resource.path });
  const body = dataform.body;
  const frontmatter = dataform.frontmatter as Readonly<Record<string, unknown>>;
  return Object.freeze({
    kind: "organizing.knowledge-vault.corpus.document" as const,
    path: resource.path,
    title: documentTitle(resource.path, frontmatter),
    description: firstFrontmatterString(frontmatter, ["description", "summary", "abstract"]),
    authors: Object.freeze(frontmatterStrings(frontmatter["authors"] ?? frontmatter["author"] ?? frontmatter["creator"])),
    tags: Object.freeze(frontmatterStrings(frontmatter["tags"] ?? frontmatter["tag"] ?? frontmatter["topics"])),
    topic: topicFromPath(resource.path),
    subject: dataform.subject,
    format: dataform.format,
    conformant: dataform.conformant,
    frontmatter: frontmatter as Readonly<Record<string, JsonValue>>,
    body,
    preview: documentPreview(body),
    bytes: Buffer.byteLength(resource.content, "utf8"),
    assertions: dataform.assertions.length,
  });
}

export function documentTitle(relative: string, frontmatter: Readonly<Record<string, unknown>>): string {
  const title = frontmatter["title"];
  return typeof title === "string" && title.trim().length > 0 ? cleanDisplayText(title) : titleFromPath(relative);
}

export function firstFrontmatterString(record: Readonly<Record<string, unknown>>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return cleanDisplayText(value);
  }
  return "";
}

export function frontmatterStrings(value: unknown): readonly string[] {
  if (Array.isArray(value)) return Object.freeze(value.flatMap(frontmatterStrings));
  if (typeof value === "string") return Object.freeze(value.split(",").map(cleanDisplayText).filter(Boolean));
  return Object.freeze([]);
}

export function topicFromPath(value: string): string {
  const parts = value.split("/").filter(Boolean);
  if (parts[0] === "content" && parts[1] !== undefined) return parts[1];
  if (parts[0] === "docs") return rootDiataxisTopic(parts);
  return parts[0] ?? "content";
}

function rootDiataxisTopic(parts: readonly string[]): string {
  if (parts.length >= 4 && parts[2] !== undefined) return parts[2];
  const leaf = parts.at(-1)?.replace(/\.[^.]+$/, "") ?? "docs";
  return leaf
    .replace(/^introduction-to-/, "")
    .replace(/^using-/, "")
    || "docs";
}

export function titleFromPath(value: string): string {
  const segment = value.split("/").filter(Boolean).at(-1)?.replace(/\.md$/, "") ?? "Untitled";
  return segment.replace(/--\d+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function documentPreview(body: string, length = 220): string {
  const text = body.split(/\r?\n/)
    .map((line) => line.replace(/^#+\s+/, "").trim())
    .filter((line) => line.length > 0)
    .join(" ");
  return text.length > length ? `${text.slice(0, Math.max(0, length - 3)).trimEnd()}...` : text;
}

export type CorpusDocumentKind = "term" | "explanation" | "guide" | "reference" | "specification" | "tutorial" | "triage" | "source";

export function corpusDocumentKind(relative: string, frontmatter: Readonly<Record<string, unknown>> = {}): CorpusDocumentKind {
  const type = typeof frontmatter["type"] === "string" ? frontmatter["type"].trim().toLowerCase() : "";
  if (["term", "explanation", "guide", "reference", "specification", "tutorial"].includes(type)) {
    return type as Exclude<CorpusDocumentKind, "triage" | "source">;
  }
  if (relative.includes("/terms/")) return "term";
  if (relative.includes("/guides/")) return "guide";
  if (relative.includes("/explanations/")) return "explanation";
  if (relative.includes("/references/")) return "reference";
  if (relative.includes("/specifications/")) return "specification";
  if (relative.includes("/tutorials/")) return "tutorial";
  if (isTriagePath(relative)) return "triage";
  return "source";
}

export function normalizeCorpusDocumentKind(value: unknown): Exclude<CorpusDocumentKind, "triage" | "source"> {
  const kind = typeof value === "string" ? value.trim().toLowerCase() : "explanation";
  return ["explanation", "term", "guide", "reference", "specification", "tutorial"].includes(kind)
    ? kind as Exclude<CorpusDocumentKind, "triage" | "source">
    : "explanation";
}

export function draftKindForCorpusDocumentKind(kind: string): Exclude<CorpusDocumentKind, "triage" | "source"> {
  if (kind === "term") return "explanation";
  if (kind === "specification") return "reference";
  return normalizeCorpusDocumentKind(kind);
}

export function isTriagePath(relative: string): boolean {
  return relative === "_triage"
    || relative.startsWith("_triage/")
    || relative.includes("/_triage/")
    || relative === "triage"
    || relative.startsWith("triage/")
    || relative.includes("/triage/")
    || relative === "triaging"
    || relative.startsWith("triaging/")
    || relative.includes("/triaging/");
}

export type BacklinkQueryDocument = Pick<CorpusDocument, "path" | "title">;

export function documentBacklinkQueries(document: BacklinkQueryDocument): readonly string[] {
  const title = document.title.trim();
  const basename = document.path.split("/").at(-1)?.replace(/\.md$/, "") ?? "";
  return uniqueStrings([
    document.path,
    `[[${title}]]`,
    `[[${basename}]]`,
    `](${document.path})`,
    title,
    basename,
  ].map((item) => item.trim()).filter((item) => item.length >= 3));
}

function cleanDisplayText(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

export interface ListEntriesOptions {
  readonly limit?: number | string;
}

export interface CollectMarkdownPathsOptions {
  readonly fileLimit?: number;
  readonly directoryLimit?: number;
  readonly listingLimit?: number | string;
}

export interface MarkdownPathCollection {
  readonly path: string;
  readonly paths: readonly string[];
  readonly directoriesVisited: number;
  readonly truncated: boolean;
}

/** list : address  -  bounded inspection at the fs grain, through relating confinement. */
export function listEntries(root: string, relative: string, options: ListEntriesOptions = {}): Listing {
  const path = requireReadableCorpusPath(root, relative, "list path");
  const limit = corpusListLimit(options.limit);
  const st = statSync(confine(root, path));
  const targetKind = st.isDirectory() ? "directory" : st.isFile() ? "file" : "other";
  if (targetKind !== "directory") {
    return Object.freeze({
      kind: "organizing.knowledge-vault.corpus.listing" as const,
      path,
      targetKind,
      limit,
      total: 0,
      truncated: false,
      entries: Object.freeze([]),
    });
  }

  const allEntries = listContentEntries(root, path);
  const entries: ListEntry[] = allEntries.slice(0, limit).map((entry) => Object.freeze({
    name: entry.name,
    path: [path, entry.name].filter(Boolean).join("/"),
    kind: entry.kind,
  }));
  return Object.freeze({
    kind: "organizing.knowledge-vault.corpus.listing" as const,
    path,
    targetKind,
    limit,
    total: allEntries.length,
    truncated: allEntries.length > limit,
    entries: Object.freeze(entries),
  });
}

export function collectMarkdownPaths(root: string, relative: string, options: CollectMarkdownPathsOptions = {}): MarkdownPathCollection {
  const path = requireReadableCorpusPath(root, relative, "collect path");
  const fileLimit = boundedPositiveInteger(options.fileLimit, 200);
  const directoryLimit = boundedPositiveInteger(options.directoryLimit, 1_000);
  const listingLimit = options.listingLimit ?? 1_000;
  const directories = [path];
  const paths = new Set<string>();
  let directoriesVisited = 0;

  while (directories.length > 0 && paths.size < fileLimit && directoriesVisited < directoryLimit) {
    const current = directories.pop()!;
    directoriesVisited += 1;
    const listing = maybeListEntries(root, current, { limit: listingLimit });
    if (listing === null) continue;
    for (const entry of [...listing.entries].sort((left, right) => right.path.localeCompare(left.path))) {
      if (entry.kind === "directory") directories.push(entry.path);
      else if (entry.kind === "file" && entry.path.endsWith(".md")) paths.add(entry.path);
      if (paths.size >= fileLimit) break;
    }
  }

  return Object.freeze({
    path,
    paths: Object.freeze([...paths].sort((left, right) => right.localeCompare(left)).slice(0, fileLimit)),
    directoriesVisited,
    truncated: directories.length > 0 || paths.size >= fileLimit,
  });
}

/**
 * Gather corpus resources (`{ path, content }`) from an addressed region, bounded  -  the
 * discovery the memory carrier deliberately does not do itself (relating's bounded
 * content-tree read). Feeds `admitMemory`, which decodes each resource via the markdown codec.
 */
export function gatherResources(root: string, relative: string, limit = 200, maxScan = 20_000): readonly Resource[] {
  return readContentTree(root, requireReadableCorpusPath(root, relative, "gather path"), corpusReadBounds(limit, maxScan));
}

function maybeListEntries(root: string, relative: string, options: ListEntriesOptions): Listing | null {
  try {
    return listEntries(root, relative, options);
  } catch {
    return null;
  }
}

function boundedPositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function requireReadableCorpusPath(root: string, value: string, label: string): string {
  const normalized = normalizeKnowledgeVaultPath(value);
  if (normalized === null) throw new TypeError(`${label} must be a relative corpus path`);
  if (normalized !== "" && !knowledgeVaultPathAllowedInRoot(root, normalized)) {
    throw new TypeError(`${label} must stay in an allowed corpus prefix`);
  }
  return normalized;
}
