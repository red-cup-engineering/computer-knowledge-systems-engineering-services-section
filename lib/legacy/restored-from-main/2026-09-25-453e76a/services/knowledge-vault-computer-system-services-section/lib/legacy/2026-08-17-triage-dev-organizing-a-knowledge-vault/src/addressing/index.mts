/**
 * addressing  -  bounded corpus filepath lookup.
 *
 * The corpus is the persistent memorystore. This subpath owns concrete filepath
 * addressing over that store: bounded name lookup and bounded lexical evidence
 * search. Confinement and markdown resource reading come from relating's content
 * reader; this package only specializes those primitives to the corpus surface.
 */
import path from "node:path";
import { statSync, type Stats } from "node:fs";
import { confine, listContentEntries, readContentTree, type ContentEntry } from "@emsenn/relating/ledger";
import { knowledgeVaultPathAllowedInRoot, normalizeKnowledgeVaultPath } from "../corpus/root.mjs";
export {
  addressedNameMatchCarrier,
  addressedNameSearchCarrier,
  addressedTextHitCarrier,
  addressedTextSearchCarrier,
  type AddressedNameMatch,
  type FindAddressedNameResult,
  type GrepAddressedTextHit,
  type GrepAddressedTextResult,
} from "./carriers.mjs";
import type { AddressedNameMatch, FindAddressedNameResult, GrepAddressedTextHit, GrepAddressedTextResult } from "./carriers.mjs";

export interface AddressingOptions {
  readonly path?: string;
  readonly limit?: number | string;
  readonly maxScan?: number | string;
}

export interface FindAddressedNameOptions extends AddressingOptions {
  readonly query: string;
}

export interface GrepAddressedTextOptions extends AddressingOptions {
  readonly query: string;
}

export function topicQueryVariants(topic: string): readonly string[] {
  const tokens = topicTokens(topic);
  const pairs = tokens.length > 1
    ? tokens.slice(0, -1).map((token, index) => [token, tokens[index + 1]!] as const)
    : [];
  return uniqueStrings([
    topic,
    tokens.join(" "),
    ...pairs.flatMap(([left, right]) => [`${left} ${right}`, `${left}-${right}`]),
    ...tokens.filter((token) => token.length >= 5).slice(0, 4),
  ].map((value) => value.trim()).filter((value) => value.length >= 2)).slice(0, 10);
}

export function pathQueryVariants(topic: string): readonly string[] {
  const tokens = topicTokens(topic);
  return uniqueStrings([
    topic,
    tokens.join("-"),
    ...tokens.filter((token) => token.length >= 5).slice(0, 4),
  ].map((value) => value.trim()).filter((value) => value.length >= 2)).slice(0, 6);
}

export function topicTokens(topic: string): readonly string[] {
  const stop = new Set(["a", "an", "and", "are", "as", "at", "by", "for", "from", "in", "into", "is", "of", "on", "or", "the", "to", "with"]);
  return Object.freeze((topic.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => !stop.has(token)));
}

export function parseAddressedPaths(value: unknown): readonly string[] {
  const raw = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
  return Object.freeze(raw
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter((item) => item.length > 0));
}

function bound(value: number | string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function relativePath(root: string, full: string): string {
  return path.relative(path.resolve(root), full).split(path.sep).join("/");
}

function addressedPath(root: string, relative: string): string {
  const normalized = normalizeKnowledgeVaultPath(relative);
  if (normalized === null) throw new TypeError("addressed path must be a relative corpus path");
  if (normalized !== "" && !knowledgeVaultPathAllowedInRoot(root, normalized)) {
    throw new TypeError("addressed path must stay in an allowed corpus prefix");
  }
  return relativePath(root, confine(root, normalized));
}

const joinRel = (base: string, child: string): string => (base === "" ? child : `${base}/${child}`);

function statOrNull(target: string): Stats | null {
  try {
    return statSync(target);
  } catch {
    return null;
  }
}

function lineNumber(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function context(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 160);
  const end = Math.min(text.length, index + length + 160);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return Object.freeze(out);
}

export function findAddressedName(root: string, options: FindAddressedNameOptions): FindAddressedNameResult {
  const query = options.query.trim();
  if (query === "") throw new TypeError("find-addressed-name: query is required");
  const start = addressedPath(root, options.path ?? "");
  const limit = bound(options.limit, 50, 500);
  const maxScan = bound(options.maxScan, 5000, 50_000);
  const needle = query.toLowerCase();
  const frontier: string[] = [start];
  const results: AddressedNameMatch[] = [];
  let scanned = 0;
  let scanTruncated = false;

  while (frontier.length > 0 && results.length < limit) {
    const current = frontier.shift();
    if (current === undefined) break;
    let entries: readonly ContentEntry[];
    try {
      entries = listContentEntries(root, current);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (scanned >= maxScan) {
        scanTruncated = true;
        break;
      }
      scanned += 1;
      const entryPath = joinRel(current, entry.name);
      if (entryPath.toLowerCase().includes(needle)) results.push(Object.freeze({ path: entryPath, kind: entry.kind }));
      if (entry.kind === "directory") frontier.push(entryPath);
      if (results.length >= limit) break;
    }
    if (scanTruncated) break;
  }

  return Object.freeze({
    kind: "organizing.knowledge-vault.addressing.name-search",
    query,
    scanned,
    results: Object.freeze(results),
    truncated: results.length >= limit || scanTruncated,
  });
}

export function grepAddressedText(root: string, options: GrepAddressedTextOptions): GrepAddressedTextResult {
  const query = options.query.trim();
  if (query === "") throw new TypeError("grep-addressed-text: query is required");
  const region = addressedPath(root, options.path ?? "");
  const limit = bound(options.limit, 50, 500);
  const maxScan = bound(options.maxScan, 5000, 50_000);
  const resources = readContentTree(root, region, { limit: maxScan, maxScan });
  const needle = query.toLowerCase();
  const hits: GrepAddressedTextHit[] = [];
  let filesScanned = 0;

  for (const resource of resources) {
    if (hits.length >= limit) break;
    filesScanned += 1;
    const index = resource.content.toLowerCase().indexOf(needle);
    if (index < 0) continue;
    hits.push(Object.freeze({
      path: resource.path,
      line: lineNumber(resource.content, index),
      context: context(resource.content, index, query.length),
    }));
  }

  const fullRegion = confine(root, region);
  const st = statOrNull(fullRegion);
  const scanTruncated = resources.length >= maxScan;
  return Object.freeze({
    kind: "organizing.knowledge-vault.addressing.text-search",
    query,
    path: st?.isFile() === true ? relativePath(root, path.dirname(fullRegion)) : region,
    filesScanned,
    hits: Object.freeze(hits),
    truncated: hits.length >= limit,
    scanTruncated,
  });
}
