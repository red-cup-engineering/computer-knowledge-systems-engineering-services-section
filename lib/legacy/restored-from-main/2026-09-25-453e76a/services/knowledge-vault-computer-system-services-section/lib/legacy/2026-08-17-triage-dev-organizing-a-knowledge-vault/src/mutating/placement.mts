/**
 * mutating/placement  -  document placement morphisms for the corpus.
 *
 * This module owns the dry-run path law used by document preparation. It does not
 * write; it classifies a requested document operation into the corpus-relative
 * topic and target path an agent can inspect before committing anything.
 */
import path from "node:path";
import { knowledgeVaultPathAllowed, KNOWLEDGE_VAULT_SUPPORT_PREFIXES } from "../corpus/root.mjs";
import type { DocumentOperationKind } from "./carriers.mjs";

export const DOCUMENT_OPERATION_KINDS: readonly DocumentOperationKind[] = Object.freeze([
  "explanation",
  "term",
  "guide",
  "reference",
  "specification",
  "tutorial",
]);

const DOCUMENT_OPERATION_KIND_SET = new Set<DocumentOperationKind>(DOCUMENT_OPERATION_KINDS);
const SUPPORT_PREFIX_SET = new Set(KNOWLEDGE_VAULT_SUPPORT_PREFIXES);

export type TargetPathForDocumentInput = Readonly<{
  topic: string;
  kind: DocumentOperationKind;
  title: string;
  targetPath?: string;
  allowedPrefixes?: readonly string[];
}>;

export function documentOperationKind(value: unknown): DocumentOperationKind | null {
  const kind = typeof value === "string" ? value.trim() : "";
  return DOCUMENT_OPERATION_KIND_SET.has(kind as DocumentOperationKind) ? kind as DocumentOperationKind : null;
}

export function documentTypeForOperationKind(kind: DocumentOperationKind): string {
  return kind === "specification" ? "specification" : kind;
}

export function normalizeCorpusPlacementTopic(value: string, allowedPrefixes: readonly string[] = []): string {
  const trimmed = value.replace(/^\/+/, "").replace(/\/+$/, "");
  if (trimmed === "content" || trimmed.startsWith("content/")) return trimmed;
  if (trimmed === "docs" || trimmed.startsWith("docs/")) return trimmed;
  if (trimmed === "scripts" || trimmed.startsWith("scripts/")) return trimmed;
  if (trimmed === "_archive" || trimmed.startsWith("_archive/")) return trimmed;
  if (trimmed === "_triage" || trimmed.startsWith("_triage/")) return trimmed;
  const first = trimmed.split("/").filter(Boolean)[0];
  if (first !== undefined && allowedPrefixes.includes(first) && !SUPPORT_PREFIX_SET.has(first)) return trimmed;
  return `content/${trimmed}`;
}

export function targetPathForDocument(args: TargetPathForDocumentInput): string | null {
  if (args.targetPath !== undefined && args.targetPath.trim().length > 0) {
    const requested = normalizeRelativePath(args.targetPath);
    if (requested === null || !requested.endsWith(".md")) return null;
    return allowedByPrefix(requested, args.allowedPrefixes) ? requested : null;
  }
  const topicPath = normalizeRelativePath(normalizeCorpusPlacementTopic(args.topic, args.allowedPrefixes ?? []));
  if (topicPath === null || !allowedByPrefix(topicPath, args.allowedPrefixes)) return null;
  const slug = slugifyDocumentTitle(args.title);
  if (slug.length === 0) return null;
  const branch = documentBranch(args.kind);
  return branch.startsWith("docs/") ? `${branch}/${slug}.md` : `${topicPath}/${slug}.md`;
}

export function slugifyDocumentTitle(value: string): string {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).join("-");
}

function documentBranch(kind: DocumentOperationKind): string {
  switch (kind) {
    case "term":
      return "content";
    case "guide":
      return "docs/guides";
    case "reference":
      return "docs/references";
    case "specification":
      return "docs/references";
    case "tutorial":
      return "docs/tutorials";
    case "explanation":
      return "docs/explanations";
  }
}

function normalizeRelativePath(value: string): string | null {
  const decoded = value.replace(/^\/+/, "").replace(/\\/g, "/");
  const parts = decoded.split("/").filter(Boolean);
  if (parts.length === 0 || parts.includes("..") || path.isAbsolute(decoded)) return null;
  return parts.join("/");
}

function allowedByPrefix(value: string, prefixes: readonly string[] | undefined): boolean {
  if (prefixes === undefined || prefixes.length === 0) return true;
  return knowledgeVaultPathAllowed(value, prefixes);
}
