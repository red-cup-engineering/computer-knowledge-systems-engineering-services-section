import { collectMarkdownPaths, listEntries } from "@emsenn/organizing-a-knowledge-vault/corpus";

import { emsennContentRoot } from "./content-root.mts";

export type ListPathRequest = Readonly<{
  path?: string;
  root?: string;
  limit?: number | string;
}>;

export type ListPathEntry = Readonly<{
  name: string;
  path: string;
  kind: "directory" | "file" | "other";
}>;

export type ListPathResult = Readonly<{
  path: string;
  kind: "directory" | "file" | "other";
  entries: readonly ListPathEntry[];
  total: number;
  truncated: boolean;
}>;

export type MarkdownPathCollectionResult = Readonly<{
  path: string;
  paths: readonly string[];
  directoriesVisited: number;
  truncated: boolean;
}>;

export async function listKnowledgeVaultPath(request: ListPathRequest): Promise<ListPathResult> {
  const relative = String(request.path ?? "").trim();
  const root = emsennContentRoot(request.root);
  const listing = listEntries(root, relative, {
    ...(request.limit === undefined ? {} : { limit: request.limit }),
  });
  return {
    path: listing.path,
    kind: listing.targetKind,
    entries: listing.entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      kind: entry.kind,
    })),
    total: listing.total,
    truncated: listing.truncated,
  };
}

export async function collectKnowledgeVaultMarkdownPaths(request: ListPathRequest & Readonly<{
  fileLimit?: number;
  directoryLimit?: number;
}>): Promise<MarkdownPathCollectionResult> {
  const relative = String(request.path ?? "").trim();
  const root = emsennContentRoot(request.root);
  return collectMarkdownPaths(root, relative, {
    ...(request.limit === undefined ? {} : { listingLimit: request.limit }),
    ...(request.fileLimit === undefined ? {} : { fileLimit: request.fileLimit }),
    ...(request.directoryLimit === undefined ? {} : { directoryLimit: request.directoryLimit }),
  });
}
