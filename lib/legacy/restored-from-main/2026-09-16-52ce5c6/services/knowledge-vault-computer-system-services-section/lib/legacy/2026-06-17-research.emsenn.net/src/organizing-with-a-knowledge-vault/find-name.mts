import { findAddressedName } from "@emsenn/organizing-a-knowledge-vault/addressing";

import { emsennContentRoot } from "./content-root.mts";

export type FindNameRequest = { query?: string; name?: string; q?: string; path?: string; limit?: number | string; maxScan?: number | string; root?: string };

export type FindNameMatch = { path: string; kind: "directory" | "file" | "other" };

export type FindNameResult = {
  query: string;
  scanned: number;
  results: FindNameMatch[];
  truncated: boolean;
};

/**
 * Find corpus entries whose path contains a name substring.
 *
 * The bounded, confined filesystem walk is `@emsenn/organizing-a-knowledge-vault`'s addressing
 * capability — organizing-a-knowledge-vault owns it now; this is the thin request adapter (alias
 * resolution + corpus root) over `findAddressedName`, not a second hand-rolled walk.
 */
export async function findKnowledgeVaultName(request: FindNameRequest): Promise<FindNameResult> {
  const query = String(request.query ?? request.name ?? request.q ?? "").trim();
  if (query.length === 0) throw new Error("query is required");
  const root = emsennContentRoot(request.root);
  const found = findAddressedName(root, {
    query,
    ...(request.path === undefined ? {} : { path: request.path }),
    ...(request.limit === undefined ? {} : { limit: request.limit }),
    ...(request.maxScan === undefined ? {} : { maxScan: request.maxScan }),
  });
  return {
    query: found.query,
    scanned: found.scanned,
    results: found.results.map((match) => ({ path: match.path, kind: match.kind })),
    truncated: found.truncated,
  };
}
