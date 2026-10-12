import { grepAddressedText } from "@emsenn/organizing-a-knowledge-vault/addressing";

import { emsennContentRoot } from "./content-root.mts";

export type GrepTextRequest = Readonly<{
  query?: string;
  q?: string;
  pattern?: string;
  path?: string;
  root?: string;
  limit?: number | string;
  maxScan?: number | string;
}>;

export type GrepTextHit = Readonly<{
  path: string;
  line: number;
  context: string;
}>;

export type GrepTextResult = Readonly<{
  query: string;
  path: string;
  filesScanned: number;
  hits: readonly GrepTextHit[];
  truncated: boolean;
  scanTruncated: boolean;
}>;

/**
 * Grep line-anchored hits across the addressed markdown region.
 *
 * The bounded, confined `.md` walk is `@emsenn/organizing-a-knowledge-vault`'s addressing capability;
 * this is the thin request adapter (alias resolution + corpus root) over
 * `grepAddressedText`, not a second hand-rolled walk.
 */
export async function grepKnowledgeVaultText(request: GrepTextRequest): Promise<GrepTextResult> {
  const query = String(request.query ?? request.q ?? request.pattern ?? "").trim();
  if (query.length === 0) throw new Error("query is required");
  const root = emsennContentRoot(request.root);
  const result = grepAddressedText(root, {
    query,
    ...(request.path === undefined ? {} : { path: request.path }),
    ...(request.limit === undefined ? {} : { limit: request.limit }),
    ...(request.maxScan === undefined ? {} : { maxScan: request.maxScan }),
  });
  return {
    query: result.query,
    path: result.path,
    filesScanned: result.filesScanned,
    hits: result.hits.map((hit) => ({ path: hit.path, line: hit.line, context: hit.context })),
    truncated: result.truncated,
    scanTruncated: result.scanTruncated,
  };
}
