import { createReadStream } from "node:fs";
import { mkdir, open, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { emsennDataRoot } from "./content-root.mts";
import { extensionType } from "@emsenn/relating/writing/http";
import {
  decodeFrontMatterDocument,
} from "@emsenn/content/codecs";
import {
  confineKnowledgeVaultPath,
  knowledgeVaultAllowedPrefixes,
  knowledgeVaultRoot,
  normalizeKnowledgeVaultPath,
} from "@emsenn/organizing-a-knowledge-vault/corpus";
import {
  hasDocumentPreparationErrors,
  prepareCorpusBodyUpdate,
  prepareCorpusDocument,
  prepareCorpusFrontmatterUpdate,
  type DocumentPreparation,
} from "@emsenn/organizing-a-knowledge-vault/mutating";

const DEFAULT_TEXT_BYTES = 12_000;
const DEFAULT_SEARCH_LIMIT = 50;
const MAX_SEARCH_LIMIT = 500;
const DEFAULT_SEARCH_MAX_SCAN = 50_000;
const MAX_SEARCH_MAX_SCAN = 100_000;
const DEFAULT_DRAFT_MAX_FILES = 24;
const MAX_DRAFT_MAX_FILES = 80;
const DEFAULT_DRAFT_MAX_BYTES = 80_000;
const MAX_DRAFT_MAX_BYTES = 240_000;
const MAX_DIRECTORY_LIMIT = 1000;
function allowedRepoPrefixes(root: string): readonly string[] {
  return knowledgeVaultAllowedPrefixes(repoPath(root));
}
const TAXONOMY_ID_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  "udc-id": "Universal Decimal Classification notation",
  "msc-id": "Mathematics Subject Classification identifier",
  "arxiv-id": "arXiv category identifier",
  "acm-ccs-id": "ACM Computing Classification System identifier",
  "mesh-id": "Medical Subject Headings identifier",
  "aat-id": "Art and Architecture Thesaurus identifier",
  "lcc-id": "Library of Congress Classification identifier",
});
const TEXT_EXTENSIONS = new Set([
  ".css", ".csv", ".html", ".htm", ".js", ".json", ".jsonl", ".md", ".mjs",
  ".nq", ".rdf", ".sh", ".svg", ".mts", ".ttl", ".txt", ".xml", ".yaml", ".yml",
]);
const DRAFT_SOURCE_EXTENSIONS = new Set([".md", ".json"]);
const DRAFT_DOCUMENT_KINDS = new Set(["explanation", "tutorial", "guide", "reference"]);
const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_NVIDIA_MODEL = "meta/llama-3.1-70b-instruct";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

function repoPath(root: string, ...segments: string[]): string {
  return path.resolve(root, ...segments);
}

function clampInteger(value: string | null | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function decodePathParam(value = ""): string | null {
  try {
    return decodeURIComponent(String(value).replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

export function confinedPath(base: string, relativePath = ""): string | null {
  if (relativePath === null) return null;
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  if (path.isAbsolute(normalized)) return null;
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  if (parts.includes("..")) return null;
  const full = path.resolve(base, ...parts);
  return full === base || full.startsWith(`${base}${path.sep}`) ? full : null;
}

export function relativePosix(base: string, full: string): string {
  return path.relative(base, full).split(path.sep).join("/");
}

function topicPath(root: string, requested = ""): { topicalRoot: string; full: string; relative: string } | null {
  const topicalRoot = repoPath(root, "content");
  const full = confinedPath(topicalRoot, requested);
  return full ? { topicalRoot, full, relative: relativePosix(topicalRoot, full) } : null;
}

export function repoConfinedPath(root: string, requested = ""): string | null {
  const decoded = decodePathParam(requested);
  if (decoded === null) return null;
  return confineKnowledgeVaultPath(repoPath(root), decoded, allowedRepoPrefixes(root));
}

async function exists(full: string): Promise<boolean> {
  try {
    await stat(full);
    return true;
  } catch {
    return false;
  }
}

async function fileHash(full: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(full);
    stream.on("data", (chunk) => hash.update(chunk as Buffer));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export type FileRecord = {
  name: string;
  path: string;
  filesystemKind: "directory" | "file" | "other";
  size: number;
  modifiedAt: string;
  mediaType?: string;
  sha256?: string;
};

async function fileRecord(root: string, full: string, options: { hash?: boolean } = {}): Promise<FileRecord> {
  const st = await stat(full);
  const record: FileRecord = {
    name: path.basename(full),
    path: relativePosix(root, full),
    filesystemKind: st.isDirectory() ? "directory" : st.isFile() ? "file" : "other",
    size: st.size,
    modifiedAt: st.mtime.toISOString(),
  };
  if (st.isFile()) {
    record.mediaType = extensionType(full) as string;
    if (options.hash) record.sha256 = await fileHash(full);
  }
  return record;
}

/** A directory's own orientation document — the "start here" file. Surfaced so
 *  agents and humans listing a topic can read the overview before descending,
 *  rather than guessing which sibling is the index. */
export type IndexFile = {
  name: string;
  path: string;
  title?: string;
  description?: string;
};

export type DirectoryListing = {
  entries: readonly FileRecord[];
  truncated: boolean;
  totalImmediateEntries: number;
  index?: IndexFile;
};

/** Picks a directory's overview/index markdown from its immediate children, by
 *  convention priority: `<dirname>.md`, then `index.md`/`_index.md`, then a
 *  README. Returns the chosen file's name plus title/description from its front
 *  matter when present. Best-effort: directories without such a file get none. */
async function detectIndexFile(
  root: string,
  full: string,
  childNames: readonly string[],
): Promise<IndexFile | undefined> {
  const lower = new Map(childNames.map((name) => [name.toLowerCase(), name]));
  const dirBase = path.basename(full).toLowerCase();
  const candidates = [`${dirBase}.md`, "index.md", "_index.md", "readme.md"];
  let chosen: string | undefined;
  for (const candidate of candidates) {
    const actual = lower.get(candidate);
    if (actual !== undefined) { chosen = actual; break; }
  }
  if (chosen === undefined) return undefined;
  const childPath = path.join(full, chosen);
  const index: IndexFile = { name: chosen, path: relativePosix(root, childPath) };
  const parsed = await readFrontmatter(childPath).catch(() => null);
  const title = parsed?.frontmatter["title"];
  const description = parsed?.frontmatter["description"];
  if (typeof title === "string" && title) index.title = title;
  if (typeof description === "string" && description) index.description = description;
  return index;
}

export async function directoryListing(
  root: string,
  full: string,
  options: { limit?: number | string | null; countChildren?: boolean } = {},
): Promise<DirectoryListing> {
  const entries = await readdir(full, { withFileTypes: true });
  const limit = clampInteger(String(options.limit ?? ""), MAX_DIRECTORY_LIMIT, MAX_DIRECTORY_LIMIT);
  const sorted = entries.sort((left, right) => left.name.localeCompare(right.name));
  const selected = sorted.slice(0, limit);
  const records = await Promise.all(
    selected.map(async (entry) => {
      const child = path.join(full, entry.name);
      const record = await fileRecord(root, child);
      if (entry.isDirectory() && options.countChildren) {
        const childEntries = await readdir(child, { withFileTypes: true }).catch(() => []);
        (record as FileRecord & { immediateDirectoryCount?: number; immediateFileCount?: number }).immediateDirectoryCount =
          childEntries.filter((item) => item.isDirectory()).length;
        (record as FileRecord & { immediateDirectoryCount?: number; immediateFileCount?: number }).immediateFileCount =
          childEntries.filter((item) => item.isFile()).length;
      }
      return record;
    }),
  );
  const fileNames = sorted.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const index = await detectIndexFile(root, full, fileNames);
  return {
    entries: records,
    truncated: sorted.length > selected.length,
    totalImmediateEntries: sorted.length,
    ...(index ? { index } : {}),
  };
}

export type TextSample = {
  encoding: "utf8";
  bytesRead: number;
  truncated: boolean;
  text: string;
};

export async function readSample(full: string, maxBytes = DEFAULT_TEXT_BYTES): Promise<TextSample | null> {
  if (!TEXT_EXTENSIONS.has(path.extname(full).toLowerCase())) return null;
  const buffer = await readFile(full);
  const slice = buffer.subarray(0, Math.min(buffer.length, maxBytes));
  return {
    encoding: "utf8",
    bytesRead: slice.length,
    truncated: buffer.length > slice.length,
    text: slice.toString("utf8"),
  };
}

export type FrontmatterResult = {
  frontmatter: Readonly<Record<string, unknown>>;
  taxonomyIds: Record<string, string[]>;
};

export async function readFrontmatter(full: string): Promise<FrontmatterResult | null> {
  if (path.extname(full).toLowerCase() !== ".md") return null;
  const fileText = await readFile(full, "utf8");
  if (!fileText.startsWith("---\n") && !fileText.startsWith("---\r\n")) return null;
  const decoded = (() => {
    try {
      return decodeFrontMatterDocument(withoutReferencesBlock(fileText));
    } catch {
      return null;
    }
  })();
  if (decoded === null) return null;
  const frontmatter = decoded.frontMatter;
  const taxonomyIds = Object.fromEntries(
    Object.keys(TAXONOMY_ID_FIELDS)
      .filter((field) => frontmatter[field] !== undefined)
      .map((field) => [field, frontMatterStringList(frontmatter[field])]),
  );
  return { frontmatter, taxonomyIds };
}

function frontMatterStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

type DraftDocumentKind = "explanation" | "tutorial" | "guide" | "reference";

type DraftSource = Readonly<{
  path: string;
  bytes: number;
  truncated: boolean;
  text: string;
}>;

type DraftProvider = "nvidia" | "openai" | "custom";

type DraftModelConfig = Readonly<{
  provider: DraftProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
}>;

export function draftProvider(value: unknown): DraftProvider {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (provider === "openai" || provider === "custom") return provider;
  return "nvidia";
}

export function draftModelConfig(provider: DraftProvider): DraftModelConfig {
  if (provider === "openai") {
    return {
      provider,
      baseUrl: (process.env["OPENAI_BASE_URL"] ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, ""),
      model: process.env["OPENAI_MODEL"] ?? "",
      apiKey: process.env["OPENAI_API_KEY"] ?? "",
    };
  }
  if (provider === "custom") {
    return {
      provider,
      baseUrl: (process.env["DRAFT_BASE_URL"] ?? "").replace(/\/+$/, ""),
      model: process.env["DRAFT_MODEL"] ?? "",
      apiKey: process.env["DRAFT_API_KEY"] ?? "",
    };
  }
  return {
    provider,
    baseUrl: (process.env["NVIDIA_NIM_BASE_URL"] ?? DEFAULT_NVIDIA_BASE_URL).replace(/\/+$/, ""),
    model: process.env["NVIDIA_NIM_MODEL"] ?? DEFAULT_NVIDIA_MODEL,
    apiKey: process.env["NVIDIA_API_KEY"] ?? process.env["NVIDIA_NIM_API_KEY"] ?? process.env["API_KEY_NVIDIA_NIM"] ?? "",
  };
}

function draftKind(value: unknown): DraftDocumentKind | null {
  const kind = typeof value === "string" ? value.trim().toLowerCase() : "explanation";
  return DRAFT_DOCUMENT_KINDS.has(kind) ? kind as DraftDocumentKind : null;
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
  const scalar = stringField(value);
  return scalar.length > 0 ? Object.freeze([scalar]) : Object.freeze([]);
}

function booleanField(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function integerField(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

async function collectDraftSources(
  root: string,
  full: string,
  options: { maxFiles: number; maxBytes: number },
): Promise<{ sources: DraftSource[]; filesSeen: number; truncated: boolean }> {
  const st = await stat(full);
  const files: string[] = [];
  const visit = async (current: string): Promise<void> => {
    if (files.length >= options.maxFiles) return;
    const currentStat = await stat(current).catch(() => null);
    if (!currentStat) return;
    if (currentStat.isFile()) {
      const ext = path.extname(current).toLowerCase();
      const base = path.basename(current).toLowerCase();
      if (DRAFT_SOURCE_EXTENSIONS.has(ext) && (ext === ".md" || base === "package.json")) files.push(current);
      return;
    }
    if (!currentStat.isDirectory()) return;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= options.maxFiles) return;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      await visit(path.join(current, entry.name));
    }
  };

  if (st.isFile()) await visit(full);
  else if (st.isDirectory()) await visit(full);

  let remaining = options.maxBytes;
  const sources: DraftSource[] = [];
  for (const file of files) {
    if (remaining <= 0) break;
    const buffer = await readFile(file).catch(() => null);
    if (buffer === null) continue;
    const slice = buffer.subarray(0, Math.min(buffer.length, remaining));
    remaining -= slice.length;
    sources.push({
      path: relativePosix(root, file),
      bytes: slice.length,
      truncated: buffer.length > slice.length,
      text: slice.toString("utf8"),
    });
  }
  return {
    sources,
    filesSeen: files.length,
    truncated: files.length >= options.maxFiles || remaining <= 0 || sources.some((source) => source.truncated),
  };
}

async function collectDraftSourcesFromPaths(
  root: string,
  paths: readonly string[],
  options: { maxFiles: number; maxBytes: number },
): Promise<{ sources: DraftSource[]; filesSeen: number; truncated: boolean }> {
  const files: string[] = [];
  for (const requested of paths) {
    if (files.length >= options.maxFiles) break;
    const full = repoConfinedPath(root, requested);
    if (full === null) continue;
    const st = await stat(full).catch(() => null);
    if (!st?.isFile()) continue;
    if (!DRAFT_SOURCE_EXTENSIONS.has(path.extname(full).toLowerCase())) continue;
    files.push(full);
  }
  let remaining = options.maxBytes;
  const sources: DraftSource[] = [];
  for (const file of files) {
    if (remaining <= 0) break;
    const buffer = await readFile(file).catch(() => null);
    if (buffer === null) continue;
    const slice = buffer.subarray(0, Math.min(buffer.length, remaining));
    remaining -= slice.length;
    sources.push({
      path: relativePosix(root, file),
      bytes: slice.length,
      truncated: buffer.length > slice.length,
      text: slice.toString("utf8"),
    });
  }
  return {
    sources,
    filesSeen: files.length,
    truncated: files.length >= options.maxFiles || remaining <= 0 || sources.some((source) => source.truncated),
  };
}

function buildDraftPrompt(args: {
  path: string;
  kind: DraftDocumentKind;
  concept: string;
  audience: string;
  sources: readonly DraftSource[];
  context: unknown;
}): { system: string; user: string } {
  const conceptLine = args.concept ? `Target concept: ${args.concept}` : `Target topic path: ${args.path}`;
  const sourceBlocks = args.sources.map((source) => [
    `--- SOURCE: ${source.path} (${source.bytes} bytes${source.truncated ? ", truncated" : ""}) ---`,
    source.text.trim(),
  ].join("\n")).join("\n\n");
  const contextBlock = args.context === undefined
    ? ""
    : JSON.stringify(args.context, null, 2).slice(0, 12_000);
  return {
    system: [
      "You are the research.emsenn.net drafting engine.",
      "Your job is to turn local corpus evidence into clear curriculum prose for humans and agents already working inside this repository.",
      "Write only from supplied source excerpts and supplied topic context.",
      "Preserve local terms of art instead of replacing them with generic public-literature language.",
      "When a synthesis is plausible but not directly stated by the sources, mark it as a synthesis.",
      "Do not invent frontmatter, citations, dependencies, authority records, source files, or claims of completion.",
      "Use ordinary Markdown body links to source paths and neighboring concepts when useful.",
      "Prefer concrete reading paths, definitions, operational tests, and caveats over marketing prose.",
    ].join(" "),
    user: [
      `Write a ${args.kind} draft for the knowledge-vault corpus.`,
      conceptLine,
      `Topic path: ${args.path}`,
      args.audience ? `Audience: ${args.audience}` : "Audience: developers and researchers already working in this corpus.",
      "",
      "Draft contract:",
      "- Return Markdown body only, beginning with one H1.",
      "- Explain what the concept does in this corpus before comparing it to public/common meanings.",
      "- Include a short reading path that links the strongest supplied sources.",
      "- Include caveats or open questions when the sources are incomplete.",
      "- Do not include YAML frontmatter.",
      "",
      ...(contextBlock.length > 0 ? [
        "Topic context from research tooling:",
        "",
        contextBlock,
        "",
      ] : []),
      "Use these source files:",
      "",
      sourceBlocks || "(No source files were collected.)",
    ].join("\n"),
  };
}

export async function callDraftModel(config: DraftModelConfig, prompt: { system: string; user: string }): Promise<string> {
  if (config.baseUrl.length === 0 || config.model.length === 0 || config.apiKey.length === 0) {
    throw new Error(`draft provider ${config.provider} is not configured`);
  }
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`model endpoint failed: ${response.status} ${await response.text()}`);
  const payload = await response.json() as { choices?: { message?: { content?: unknown } }[] };
  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim() === "") throw new Error("model endpoint returned no text");
  return text.trim();
}

async function prepareDocumentOperation(root: string, body: Readonly<Record<string, unknown>>): Promise<DocumentPreparation> {
  return prepareCorpusDocument(root, body, {
    allowedPrefixes: allowedRepoPrefixes(root),
  });
}

function withoutReferencesBlock(documentText: string): string {
  const lines = documentText.split("\n");
  if (stripLineCr(lines[0] ?? "") !== "---") return documentText;
  let close = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (stripLineCr(lines[i] ?? "") === "---") { close = i; break; }
  }
  if (close === -1) return documentText;
  let refStart = -1;
  for (let i = 1; i < close; i += 1) {
    if (/^references:(\s|$)/.test(stripLineCr(lines[i] ?? ""))) { refStart = i; break; }
  }
  if (refStart === -1) return documentText;
  let refEnd = close;
  for (let i = refStart + 1; i < close; i += 1) {
    const line = stripLineCr(lines[i] ?? "");
    if (line !== "" && !/^\s/.test(line)) { refEnd = i; break; }
  }
  return [...lines.slice(0, refStart), ...lines.slice(refEnd)].join("\n");
}

function stripLineCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

const GREP_TEXT_BYTES_MAX = 2_000_000;
const GREP_DEFAULT_LIMIT = 40;
const GREP_MAX_LIMIT = 200;
const GREP_DEFAULT_MAX_FILES = 100_000;
const GREP_MAX_MAX_FILES = 200_000;
const GREP_READ_CONCURRENCY = 64;
const GREP_DEFAULT_EXTENSIONS = Object.freeze([".md", ".txt"]);

function grepTerms(rawQuery: string): { terms: string[]; phrase: boolean } {
  const trimmed = rawQuery.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const inner = trimmed.slice(1, -1).toLowerCase();
    return { terms: inner ? [inner] : [], phrase: true };
  }
  const terms = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return { terms, phrase: false };
}

export type SearchHit = {
  path: string;
  lineNumber: number;
  line: string;
};

export type ContentSearchResult = {
  query: unknown;
  filesScanned: number;
  filesMatched: number;
  limit: number;
  maxFiles: number;
  hits: SearchHit[];
  truncated: boolean;
  scanTruncated: boolean;
};

export async function contentSearch(
  base: string,
  options: {
    query?: unknown;
    startPaths: string[];
    limit?: number | string | null;
    maxFiles?: number | string | null;
    perFile?: number | string | null;
    extensions?: readonly string[];
  },
): Promise<ContentSearchResult> {
  const limit = clampInteger(String(options.limit ?? ""), GREP_DEFAULT_LIMIT, GREP_MAX_LIMIT);
  const maxFiles = clampInteger(String(options.maxFiles ?? ""), GREP_DEFAULT_MAX_FILES, GREP_MAX_MAX_FILES);
  const perFile = clampInteger(String(options.perFile ?? ""), 5, 50);
  const extensions = (options.extensions ?? GREP_DEFAULT_EXTENSIONS).map((ext) => ext.toLowerCase());
  const { terms } = grepTerms(String(options.query ?? ""));
  const roots = options.startPaths.filter(Boolean);

  const eligible: string[] = [];
  const stack: { full: string; isDir: boolean }[] = roots
    .slice()
    .reverse()
    .map((full) => ({ full, isDir: true }));
  let enumTruncated = false;
  while (stack.length > 0) {
    const { full: current, isDir } = stack.pop()!;
    if (isDir) {
      const children = await readdir(current, { withFileTypes: true }).catch(() => []);
      children.sort((left, right) => right.name.localeCompare(left.name));
      for (const child of children) {
        if (child.isDirectory()) stack.push({ full: path.join(current, child.name), isDir: true });
        else if (child.isFile()) stack.push({ full: path.join(current, child.name), isDir: false });
      }
      continue;
    }
    if (!extensions.includes(path.extname(current).toLowerCase())) continue;
    if (eligible.length >= maxFiles) {
      enumTruncated = true;
      break;
    }
    eligible.push(current);
  }

  const hits: SearchHit[] = [];
  let filesScanned = 0;
  let filesMatched = 0;
  let nextUnexamined = 0;
  if (terms.length > 0) {
    for (let start = 0; start < eligible.length && hits.length < limit; start += GREP_READ_CONCURRENCY) {
      const batch = eligible.slice(start, start + GREP_READ_CONCURRENCY);
      const bodies = await Promise.all(batch.map((file) => readFile(file, "utf8").catch(() => null)));
      for (let offset = 0; offset < batch.length; offset += 1) {
        if (hits.length >= limit) break;
        nextUnexamined = start + offset + 1;
        const body = bodies[offset]!;
        if (body === null) continue;
        const current = batch[offset]!;
        if (body.length > GREP_TEXT_BYTES_MAX) continue;
        filesScanned += 1;
        const lowerBody = body.toLowerCase();
        if (!terms.every((term) => lowerBody.includes(term))) continue;
        const lines = body.split("\n");
        let fromThisFile = 0;
        for (let index = 0; index < lines.length && fromThisFile < perFile && hits.length < limit; index += 1) {
          const lowerLine = lines[index]!.toLowerCase();
          if (!terms.every((term) => lowerLine.includes(term))) continue;
          hits.push({
            path: relativePosix(base, current),
            lineNumber: index + 1,
            line: lines[index]!.trim().slice(0, 400),
          });
          fromThisFile += 1;
        }
        if (fromThisFile > 0) filesMatched += 1;
      }
    }
  }
  return {
    query: options.query,
    filesScanned,
    filesMatched,
    limit,
    maxFiles,
    hits,
    truncated: hits.length >= limit,
    scanTruncated: enumTruncated || nextUnexamined < eligible.length,
  };
}

export type NameSearchResult = {
  path: string;
  filesystemKind: "directory" | "file" | "other";
  size: number;
  modifiedAt: string;
};

export type WalkNamesResult = {
  query: string;
  scanned: number;
  limit: number;
  maxScan: number;
  results: NameSearchResult[];
  truncated: boolean;
  scanTruncated: boolean;
};

export async function walkNames(
  base: string,
  options: {
    query: string;
    startPaths: string[];
    limit?: number | string | null;
    maxScan?: number | string | null;
  },
): Promise<WalkNamesResult> {
  const limit = clampInteger(String(options.limit ?? ""), DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);
  const maxScan = clampInteger(String(options.maxScan ?? ""), DEFAULT_SEARCH_MAX_SCAN, MAX_SEARCH_MAX_SCAN);
  const query = options.query.toLowerCase();
  const results: NameSearchResult[] = [];
  let scanned = 0;
  let frontier = options.startPaths.slice();
  while (frontier.length > 0 && results.length < limit && scanned < maxScan) {
    const nextLevel: string[] = [];
    for (const current of frontier) {
      if (results.length >= limit || scanned >= maxScan) break;
      let st;
      try {
        st = await stat(current);
      } catch {
        continue;
      }
      scanned += 1;
      const relative = relativePosix(base, current);
      if (relative.toLowerCase().includes(query)) {
        results.push({
          path: relative,
          filesystemKind: st.isDirectory() ? "directory" : st.isFile() ? "file" : "other",
          size: st.size,
          modifiedAt: st.mtime.toISOString(),
        });
      }
      if (!st.isDirectory()) continue;
      const children = await readdir(current, { withFileTypes: true }).catch(() => []);
      children.sort((left, right) => left.name.localeCompare(right.name));
      for (const child of children) nextLevel.push(path.join(current, child.name));
    }
    frontier = nextLevel;
  }
  return {
    query: options.query,
    scanned,
    limit,
    maxScan,
    results,
    truncated: results.length >= limit,
    scanTruncated: scanned >= maxScan,
  };
}

export type CorpusOperationResult = Readonly<{
  status: number;
  json: unknown;
}>;

function ok(json: unknown, status = 200): CorpusOperationResult {
  return Object.freeze({ status, json });
}

function corpusNotFound(message = "not found"): CorpusOperationResult {
  return ok({ error: "not_found", message }, 404);
}

function corpusBadRequest(message: string): CorpusOperationResult {
  return ok({ error: "bad_request", message }, 400);
}

function corpusServerError(message: string, extra: Record<string, unknown> = {}): CorpusOperationResult {
  return ok({ error: "server_error", message, ...extra }, 502);
}

export function corpusConfinedPath(
  root: string,
  requested: string,
  dataRoot = emsennDataRoot(),
): { full: string; base: string } | null {
  const decoded = decodePathParam(requested);
  if (decoded === null) return null;
  const relative = normalizeKnowledgeVaultPath(decoded);
  if (relative === null || relative.length === 0) return null;
  const full = confineKnowledgeVaultPath(repoPath(root), relative, allowedRepoPrefixes(root));
  if (full === null) return null;
  const dataBase = path.dirname(path.resolve(dataRoot));
  const base = relative === "data" || relative.startsWith("data/") ? dataBase : repoPath(root);
  const scoped = base === repoPath(root) ? full : confinedPath(base, relative);
  return scoped ? { full: scoped, base } : null;
}

export async function corpusRootsOperation(root: string): Promise<CorpusOperationResult> {
  const modeled = knowledgeVaultRoot(repoPath(root));
  return ok({
    kind: "corpus.topical-roots",
    closedSet: true,
    count: modeled.expectedPaths.length,
    roots: modeled.expectedPaths.map((entry) => ({
      slug: entry.path,
      path: entry.path,
      description: entry.description,
      present: entry.present,
    })),
    stablePrefixes: modeled.stablePrefixes,
    observedPrefixes: modeled.observedPrefixes,
    missingPaths: modeled.missingPaths,
    allowedPrefixes: modeled.allowedPrefixes,
    carrierReading: modeled,
  });
}

export async function corpusTopicsOperation(
  root: string,
  query: Readonly<Record<string, string>>,
): Promise<CorpusOperationResult> {
  const topicalRoot = repoPath(root, "content");
  const requested = query["path"] ?? "";
  const target = topicPath(root, requested);
  if (!target) return corpusBadRequest("path must stay inside content");
  const st = await stat(target.full).catch(() => null);
  if (!st) return corpusNotFound(`topic path not found: ${requested}`);
  if (!st.isDirectory()) return corpusBadRequest("topic listing path must be a directory");
  const listing = await directoryListing(topicalRoot, target.full, {
    countChildren: query["counts"] === "1",
    ...(query["limit"] === undefined ? {} : { limit: query["limit"] }),
  });
  return ok({
    kind: "corpus.topic-listing",
    path: target.relative,
    repoPath: target.relative ? `content/${target.relative}` : "content",
    ...listing,
  });
}

export async function corpusFileOperation(
  root: string,
  requested: string,
  query: Readonly<Record<string, string>> = {},
): Promise<CorpusOperationResult> {
  const confined = corpusConfinedPath(root, requested);
  if (!confined) return corpusBadRequest(`file path must begin with ${allowedRepoPrefixes(root).join(", ")}`);
  const full = confined.full;
  const st = await stat(full).catch(() => null);
  if (!st) return corpusNotFound("file not found");
  const record = await fileRecord(confined.base, full, {
    hash: st.isFile() && query["hash"] === "1",
  });
  if (!st.isFile()) {
    const listing = await directoryListing(confined.base, full, {
      countChildren: query["counts"] === "1",
      ...(query["limit"] === undefined ? {} : { limit: query["limit"] }),
    });
    return ok({ kind: "corpus.path", ...record, ...listing });
  }
  const sample = query["sample"] === "1"
    ? await readSample(full, clampInteger(query["bytes"], DEFAULT_TEXT_BYTES, 200_000))
    : null;
  const frontmatter = await readFrontmatter(full);
  return ok({
    kind: "corpus.file",
    ...record,
    ...(frontmatter ? { ...frontmatter } : {}),
    ...(sample ? { sample } : {}),
  });
}

function startPathsFromQuery(root: string, query: Readonly<Record<string, string>>): string[] {
  const scope = String(query["path"] ?? "").trim();
  if (scope) {
    const repoScoped = repoConfinedPath(root, scope);
    const topicScoped = topicPath(root, scope);
    return [repoScoped ?? topicScoped?.full].filter((item): item is string => item !== undefined && item !== null);
  }
  return String(query["roots"] ?? allowedRepoPrefixes(root).join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((prefix) => {
      const full = repoConfinedPath(root, prefix);
      return full === null ? [] : [full];
    });
}

export async function corpusSearchOperation(
  root: string,
  query: Readonly<Record<string, string>>,
): Promise<CorpusOperationResult> {
  const q = String(query["q"] ?? "").trim();
  if (q.length < 2) return corpusBadRequest("q must be at least two characters");
  const startPaths = startPathsFromQuery(root, query);
  if (startPaths.length === 0) return corpusBadRequest(`search path must stay inside ${allowedRepoPrefixes(root).join(", ")}`);
  return ok({
    kind: "corpus.path-search",
    ...(await walkNames(root, {
      query: q,
      startPaths,
      ...(query["limit"] === undefined ? {} : { limit: query["limit"] }),
      ...(query["maxScan"] === undefined ? {} : { maxScan: query["maxScan"] }),
    })),
  });
}

export async function corpusGrepOperation(
  root: string,
  query: Readonly<Record<string, string>>,
): Promise<CorpusOperationResult> {
  const q = String(query["q"] ?? "").trim();
  if (q.length < 2) return corpusBadRequest("q must be at least two characters");
  const startPaths = startPathsFromQuery(root, query);
  if (startPaths.length === 0) return corpusBadRequest(`grep path must stay inside ${allowedRepoPrefixes(root).join(", ")}`);
  const extensions = String(query["ext"] ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => (item.startsWith(".") ? item : `.${item}`));
  return ok({
    kind: "corpus.content-search",
    ...(await contentSearch(root, {
      query: q,
      startPaths,
      ...(extensions.length > 0 ? { extensions } : {}),
      ...(query["limit"] === undefined ? {} : { limit: query["limit"] }),
      ...(query["maxFiles"] === undefined ? {} : { maxFiles: query["maxFiles"] }),
      ...(query["perFile"] === undefined ? {} : { perFile: query["perFile"] }),
    })),
  });
}

export async function corpusDocumentPrepareOperation(
  root: string,
  body: Readonly<Record<string, unknown>>,
): Promise<CorpusOperationResult> {
  const prepared = await prepareDocumentOperation(root, body);
  return ok(prepared, hasDocumentPreparationErrors(prepared) ? 422 : 200);
}

export async function corpusDocumentCreateOperation(
  root: string,
  body: Readonly<Record<string, unknown>>,
): Promise<CorpusOperationResult> {
  const prepared = await prepareDocumentOperation(root, body);
  if (hasDocumentPreparationErrors(prepared)) return ok(prepared, 422);
  const full = repoConfinedPath(root, prepared.targetPath);
  if (full === null) return corpusBadRequest("prepared target path escaped the corpus");
  if (await exists(full)) return ok({ ...prepared, error: "target_exists", message: "document-create never overwrites an existing path" }, 409);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, prepared.text, { encoding: "utf8", flag: "wx" });
  return ok({
    ...prepared,
    kind: "corpus.document-operation.create",
    written: true,
  }, 201);
}

export async function corpusDocumentFrontmatterOperation(
  root: string,
  body: Readonly<Record<string, unknown>>,
): Promise<CorpusOperationResult> {
  const requested = stringField(body["path"]);
  if (requested === "") return corpusBadRequest("path is required");
  const full = repoConfinedPath(root, requested);
  if (full === null) return corpusBadRequest(`path must begin with ${allowedRepoPrefixes(root).join(", ")}`);
  const st = await stat(full).catch(() => null);
  if (!st || !st.isFile()) return corpusNotFound("file not found");
  if (path.extname(full).toLowerCase() !== ".md") return corpusBadRequest("frontmatter operations require a .md file");
  const existing = await readFile(full, "utf8").catch(() => null);
  if (existing === null) return corpusNotFound("file not readable");
  const repoPathValue = relativePosix(root, full);
  const dryRun = booleanField(body["dryRun"], true);
  let prepared;
  try {
    prepared = prepareCorpusFrontmatterUpdate(repoPathValue, existing, body, { dryRun });
  } catch (error) {
    return corpusBadRequest(`front matter update is not encodable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!dryRun) await writeFile(full, prepared.text, { encoding: "utf8" });
  return ok({ ...prepared, written: !dryRun });
}

export async function corpusDocumentBodyOperation(
  root: string,
  body: Readonly<Record<string, unknown>>,
): Promise<CorpusOperationResult> {
  const requested = stringField(body["path"]);
  if (requested === "") return corpusBadRequest("path is required");
  const nextBody = typeof body["body"] === "string" ? body["body"] : "";
  if (nextBody.trim().length === 0) return corpusBadRequest("body must be a non-empty string");
  const full = repoConfinedPath(root, requested);
  if (full === null) return corpusBadRequest(`path must begin with ${allowedRepoPrefixes(root).join(", ")}`);
  const st = await stat(full).catch(() => null);
  if (!st || !st.isFile()) return corpusNotFound("file not found");
  if (path.extname(full).toLowerCase() !== ".md") return corpusBadRequest("body operations require a .md file");
  const existing = await readFile(full, "utf8").catch(() => null);
  if (existing === null) return corpusNotFound("file not readable");
  const repoPathValue = relativePosix(root, full);
  const dryRun = booleanField(body["dryRun"], true);
  let prepared;
  try {
    prepared = prepareCorpusBodyUpdate(repoPathValue, existing, nextBody, { dryRun });
  } catch (error) {
    return corpusBadRequest(`body update is not encodable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!dryRun) await writeFile(full, prepared.text, { encoding: "utf8" });
  return ok({ ...prepared, written: !dryRun });
}

export async function corpusDraftOperation(
  root: string,
  body: Readonly<Record<string, unknown>>,
): Promise<CorpusOperationResult> {
  const requested = stringField(body["path"]);
  const requestedPaths = stringListField(body["paths"]);
  if (requested === "" && requestedPaths.length === 0) return corpusBadRequest("path or paths is required");
  const kind = draftKind(body["kind"]);
  if (kind === null) return corpusBadRequest("kind must be one of explanation, tutorial, guide, reference");
  const maxFiles = integerField(body["maxFiles"], DEFAULT_DRAFT_MAX_FILES, MAX_DRAFT_MAX_FILES);
  const maxBytes = integerField(body["maxBytes"], DEFAULT_DRAFT_MAX_BYTES, MAX_DRAFT_MAX_BYTES);
  const concept = stringField(body["concept"]);
  const audience = stringField(body["audience"]);
  const provider = draftProvider(body["provider"]);
  const context = body["context"];
  let sourcePath: string;
  let bundle: Awaited<ReturnType<typeof collectDraftSources>>;
  if (requestedPaths.length > 0) {
    bundle = await collectDraftSourcesFromPaths(root, requestedPaths, { maxFiles, maxBytes });
    sourcePath = requested || requestedPaths[0] || "content";
  } else {
    const full = repoConfinedPath(root, requested);
    if (!full) return corpusBadRequest(`path must begin with ${allowedRepoPrefixes(root).join(", ")}`);
    const st = await stat(full).catch(() => null);
    if (!st) return corpusNotFound("draft source path not found");
    if (!st.isDirectory() && !st.isFile()) return corpusBadRequest("draft source path must be a file or directory");
    bundle = await collectDraftSources(root, full, { maxFiles, maxBytes });
    sourcePath = relativePosix(root, full);
  }
  const prompt = buildDraftPrompt({
    path: sourcePath,
    kind,
    concept,
    audience,
    sources: bundle.sources,
    context,
  });
  const config = draftModelConfig(provider);
  const generate = booleanField(body["generate"], true);
  let draft: string | null = null;
  let generation: "disabled" | "not_configured" | "generated" = "disabled";
  if (generate) {
    if (config.apiKey === "" || config.model === "" || config.baseUrl === "") generation = "not_configured";
    else {
      try {
        draft = await callDraftModel(config, prompt);
        generation = "generated";
      } catch (error) {
        return corpusServerError("draft model request failed", {
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return ok({
    kind: "corpus.draft",
    path: sourcePath,
    documentKind: kind,
    ...(concept ? { concept } : {}),
    generation,
    model: {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      configured: config.apiKey !== "" && config.model !== "" && config.baseUrl !== "",
    },
    sourceBudget: {
      maxFiles,
      maxBytes,
      filesSeen: bundle.filesSeen,
      filesIncluded: bundle.sources.length,
      truncated: bundle.truncated,
    },
    sources: bundle.sources.map((source) => ({
      path: source.path,
      bytes: source.bytes,
      truncated: source.truncated,
    })),
    prompt,
    ...(draft !== null ? { draft } : {}),
  });
}
