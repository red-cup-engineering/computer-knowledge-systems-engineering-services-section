import { documentBacklinkQueries, readDocument } from "@emsenn/organizing-a-knowledge-vault/corpus";

import { emsennContentRoot } from "./content-root.mts";

export type ReadRequest = { path: string; root?: string };

export type ReadResult = {
  path: string;
  title: string;
  description: string;
  authors: readonly string[];
  tags: readonly string[];
  topic: string;
  frontmatter: Record<string, unknown>;
  format: string;
  body: string;
  preview: string;
  bytes: number;
};

export async function readKnowledgeVaultDocument(request: ReadRequest): Promise<ReadResult> {
  const relative = String(request.path ?? "").trim();
  if (relative.length === 0) throw new Error("path is required");
  const root = emsennContentRoot(request.root);
  const document = readDocument(root, relative);
  return {
    path: document.path,
    title: document.title,
    description: document.description,
    authors: document.authors,
    tags: document.tags,
    topic: document.topic,
    frontmatter: document.frontmatter as Record<string, unknown>,
    format: document.format ?? "none",
    body: document.body,
    preview: document.preview,
    bytes: document.bytes,
  };
}

export function knowledgeVaultBacklinkQueries(document: Pick<ReadResult, "path" | "title">): readonly string[] {
  return documentBacklinkQueries(document);
}
