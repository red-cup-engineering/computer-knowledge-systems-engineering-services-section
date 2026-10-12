import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveKnowledgeVaultRoot } from "@emsenn/organizing-a-knowledge-vault/corpus";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Resolve the emsenn.net corpus root.
 *
 * Priority order:
 * 1. Explicit argument passed to the function.
 * 2. EMSENN_KNOWLEDGE_VAULT_ROOT env var.
 * 3. Package-local `content/` if it exists (sites/research.emsenn.net/content/).
 * 4. Workspace walk — stops at the directory carrying `pnpm-workspace.yaml`.
 */
export function emsennContentRoot(explicit?: string): string {
  const configured = process.env["EMSENN_KNOWLEDGE_VAULT_ROOT"]?.trim();
  if (explicit === undefined && (configured === undefined || configured.length === 0)) {
    const localContent = path.join(PACKAGE_ROOT, "content");
    if (existsSync(localContent)) return localContent;
  }
  return resolveKnowledgeVaultRoot(explicit, {
    start: PACKAGE_ROOT,
    envName: "EMSENN_KNOWLEDGE_VAULT_ROOT",
  });
}

/**
 * Resolve the emsenn.net data root.
 *
 * Reference data (the Turtle taxonomy vocabularies that back taxonomy-id front
 * matter) is a property of this serving package, not of the mounted knowledge
 * vault. The data therefore lives beside the package source at `data/`.
 */
export function emsennDataRoot(): string {
  return path.join(PACKAGE_ROOT, "data");
}
