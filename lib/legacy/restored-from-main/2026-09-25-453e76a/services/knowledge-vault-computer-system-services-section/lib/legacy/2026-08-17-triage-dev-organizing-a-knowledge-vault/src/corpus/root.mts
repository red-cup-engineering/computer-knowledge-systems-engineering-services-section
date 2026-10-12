/**
 * corpus/root  -  expected shape of a knowledge-vault root.
 *
 * The knowledge-vault root is the mounted `content/` directory itself. A vault
 * may contain topic trees, but the stable root affordances are scripts,
 * content, archive, triage, and Diataxis docs.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { confine } from "@emsenn/relating/ledger";
import type { KnowledgeVaultRoot } from "./carriers.mjs";

export const KNOWLEDGE_VAULT_ROOT_PATHS: readonly string[] = Object.freeze([
  "scripts",
  "content",
  "_archive",
  "_triage",
  "docs",
]);

export const KNOWLEDGE_VAULT_DOCS_PATHS: readonly string[] = Object.freeze([
  "docs/explanations",
  "docs/references",
  "docs/guides",
  "docs/tutorials",
]);

export const KNOWLEDGE_VAULT_PATH_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  scripts: "Executable and scriptable affordances for working with the vault.",
  content: "The generated knowledge tree: topic/content joints and canonical node documents.",
  _archive: "Archived material retained under the vault root.",
  _triage: "Incoming or unresolved material awaiting placement.",
  docs: "Diataxis documentation: explanations, references, guides, and tutorials.",
  "docs/explanations": "Diataxis explanations: concept-first orientation for the vault.",
  "docs/references": "Diataxis references: precise lookup material and schema-backed records.",
  "docs/guides": "Diataxis guides: goal-oriented operating paths through the vault.",
  "docs/tutorials": "Diataxis tutorials: learning sequences for acquiring vault practices.",
});

export const KNOWLEDGE_VAULT_ALLOWED_PREFIXES: readonly string[] = Object.freeze([
  ...KNOWLEDGE_VAULT_ROOT_PATHS,
]);

export const KNOWLEDGE_VAULT_SUPPORT_PREFIXES: readonly string[] = Object.freeze([
  "dev",
  "docs",
  "scripts",
  "_archive",
  "_triage",
]);

export type ResolveKnowledgeVaultRootOptions = Readonly<{
  start?: string;
  env?: NodeJS.ProcessEnv;
  envName?: string;
}>;

/**
 * Resolve the mounted knowledge-vault root. By convention, that root is a
 * workspace `content/` directory, not the package directory and not the project
 * root that contains it.
 */
export function resolveKnowledgeVaultRoot(
  explicit?: string,
  options: ResolveKnowledgeVaultRootOptions = {},
): string {
  const trimmed = explicit?.trim();
  if (trimmed !== undefined && trimmed.length > 0) return path.resolve(trimmed);
  const env = options.env ?? process.env;
  const envName = options.envName ?? "ORGANIZING_KNOWLEDGE_VAULT_PATH";
  const configured = env[envName]?.trim();
  if (configured !== undefined && configured.length > 0) return path.resolve(configured);
  const start = path.resolve(options.start ?? process.cwd());
  let dir = start;
  while (true) {
    const candidate = path.join(dir, "content");
    if (existsSync(path.join(dir, "pnpm-workspace.yaml")) && existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(start, "content");
}

export function describeKnowledgeVaultPath(value: string): string {
  const normalized = normalizeKnowledgeVaultPath(value);
  if (normalized === null) return "";
  return KNOWLEDGE_VAULT_PATH_DESCRIPTIONS[normalized] ?? "";
}

export function knowledgeVaultRoot(root: string): KnowledgeVaultRoot {
  const observedPrefixes = knowledgeVaultObservedPrefixes(root);
  const allowedPrefixes = knowledgeVaultAllowedPrefixes(root);
  const expectedPaths = Object.freeze([
    ...KNOWLEDGE_VAULT_ROOT_PATHS,
    ...KNOWLEDGE_VAULT_DOCS_PATHS,
  ].map((path) => Object.freeze({
    path,
    description: describeKnowledgeVaultPath(path),
    present: pathExists(root, path),
  })));
  return Object.freeze({
    kind: "organizing.knowledge-vault.corpus.root" as const,
    root,
    expectedPaths,
    stablePrefixes: KNOWLEDGE_VAULT_ALLOWED_PREFIXES,
    observedPrefixes,
    missingPaths: Object.freeze(expectedPaths.filter((entry) => !entry.present).map((entry) => entry.path)),
    allowedPrefixes,
  });
}

export function knowledgeVaultObservedPrefixes(root: string): readonly string[] {
  try {
    return Object.freeze(readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith(".") && name !== "node_modules")
      .sort((a, b) => a.localeCompare(b)));
  } catch {
    return Object.freeze([]);
  }
}

export function knowledgeVaultAllowedPrefixes(root: string): readonly string[] {
  return Object.freeze(uniqueStrings([
    ...KNOWLEDGE_VAULT_ALLOWED_PREFIXES,
    ...knowledgeVaultObservedPrefixes(root),
  ]));
}

export function normalizeKnowledgeVaultPath(value: string): string | null {
  const trimmed = String(value).trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (trimmed.length === 0) return "";
  if (path.posix.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed)) return null;
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.includes("..")) return null;
  return parts.join("/");
}

export function knowledgeVaultPathAllowed(
  value: string,
  prefixes: readonly string[] = KNOWLEDGE_VAULT_ALLOWED_PREFIXES,
): boolean {
  const normalized = normalizeKnowledgeVaultPath(value);
  if (normalized === null || normalized.length === 0) return false;
  return prefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

export function knowledgeVaultPathAllowedInRoot(root: string, value: string): boolean {
  return knowledgeVaultPathAllowed(value, knowledgeVaultAllowedPrefixes(root));
}

export function confineKnowledgeVaultPath(
  root: string,
  value: string,
  prefixes: readonly string[] = knowledgeVaultAllowedPrefixes(root),
): string | null {
  const normalized = normalizeKnowledgeVaultPath(value);
  if (normalized === null || !knowledgeVaultPathAllowed(normalized, prefixes)) return null;
  try {
    return confine(root, normalized);
  } catch {
    return null;
  }
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function pathExists(root: string, relative: string): boolean {
  try {
    statSync(confine(root, relative));
    return true;
  } catch {
    return false;
  }
}
