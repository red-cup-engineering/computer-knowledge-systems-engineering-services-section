/**
 * corpus/catalog  -  bounded faceted catalog over the persistent memorystore.
 */
import { statSync } from "node:fs";
import { confine } from "@emsenn/relating/ledger";
import { gatherResources, readDocument } from "./documents.mjs";
import { corpusReadBounds, MAX_CORPUS_LIMIT } from "./bounds.mjs";
import type { Catalog, CatalogDocument, CatalogFacet, CatalogGroup } from "./carriers.mjs";

const DEFAULT_PATH = "";
const DEFAULT_LIMIT = 1_000;
const DEFAULT_FACET_LIMIT = 250;

export type CatalogFacetKind = "author" | "topic";

export interface CatalogCorpusOptions {
  readonly path?: string;
  readonly limit?: number | string;
  readonly maxScan?: number | string;
}

export interface FacetCorpusCatalogOptions extends CatalogCorpusOptions {
  readonly kind?: string;
  readonly name?: string;
  readonly q?: string;
}

export type {
  Catalog,
  CatalogDocument,
  CatalogFacet,
  CatalogGroup,
};

export interface CatalogRelationSource {
  readonly path: string;
  readonly topic: string;
  readonly tags: readonly string[];
  readonly authors: readonly string[];
}

export function catalogCorpus(root: string, options: CatalogCorpusOptions = {}): Catalog {
  const requested = cleanPath(String(options.path ?? DEFAULT_PATH)) || DEFAULT_PATH;
  const { limit, maxScan } = corpusReadBounds(options.limit ?? DEFAULT_LIMIT, options.maxScan);
  const resources = gatherResources(root, requested, maxScan, maxScan);
  const documents = resources
    .map((resource) => documentRecord(root, resource.path))
    .filter((document): document is CatalogDocument => document !== null)
    .sort((left, right) => left.title.localeCompare(right.title) || left.path.localeCompare(right.path));

  return Object.freeze({
    kind: "organizing.knowledge-vault.corpus.catalog" as const,
    path: requested,
    scanned: resources.length,
    total: documents.length,
    truncated: resources.length >= maxScan,
    documents: Object.freeze(documents.slice(0, limit)),
    latest: Object.freeze([...documents].sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt)).slice(0, 50)),
    authors: groupBy(documents, (document) => document.authors),
    topics: groupBy(documents, (document) => [document.topic, ...document.tags]),
  });
}

export function facetCorpusCatalog(root: string, options: FacetCorpusCatalogOptions = {}): CatalogFacet {
  const facet = facetKind(options.kind);
  const name = String(options.name ?? options.q ?? "").trim();
  const { limit } = corpusReadBounds(options.limit ?? DEFAULT_FACET_LIMIT, undefined);
  const catalog = catalogCorpus(root, {
    ...(options.path === undefined ? {} : { path: options.path }),
    limit: MAX_CORPUS_LIMIT,
    ...(options.maxScan === undefined ? {} : { maxScan: options.maxScan }),
  });
  const normalized = normalizeFacetName(name);
  const groups = facet === "author" ? catalog.authors : catalog.topics;
  const group = groups.find((candidate) => normalizeFacetName(candidate.name) === normalized) ?? null;
  const matches = normalized.length === 0
    ? []
    : catalog.documents
      .filter((document) => facet === "author" ? documentHasAuthor(document, normalized) : documentHasTopic(document, normalized))
      .sort((left, right) => left.title.localeCompare(right.title) || left.path.localeCompare(right.path));
  return Object.freeze({
    kind: "organizing.knowledge-vault.corpus.catalog-facet" as const,
    facet,
    name: group?.name ?? name,
    path: catalog.path,
    scanned: catalog.scanned,
    total: catalog.total,
    truncated: catalog.truncated,
    matchedCount: matches.length,
    group,
    documents: Object.freeze(matches.slice(0, limit)),
    similar: Object.freeze(groups
      .filter((candidate) => normalizeFacetName(candidate.name) !== normalized)
      .filter((candidate) => normalized.length === 0 || normalizeFacetName(candidate.name).includes(normalized) || normalized.includes(normalizeFacetName(candidate.name)))
      .slice(0, 12)),
  });
}

export function catalogDocumentMatches(document: CatalogDocument, query: string): boolean {
  const needle = query.toLowerCase().trim();
  if (needle === "") return false;
  return [
    document.title,
    document.description,
    document.topic,
    document.path,
    ...document.authors,
    ...document.tags,
  ].some((value) => value.toLowerCase().includes(needle));
}

export function searchCatalogDocuments(documents: readonly CatalogDocument[], query: string, limit = 50): readonly CatalogDocument[] {
  return Object.freeze(documents.filter((document) => catalogDocumentMatches(document, query)).slice(0, Math.max(0, Math.floor(limit))));
}

export function catalogDocumentPopularity(document: CatalogDocument): number {
  return Math.log10(Math.max(1, document.bytes))
    + (document.description.length > 0 ? 2 : 0)
    + Math.min(2, document.tags.length * 0.4)
    + Math.min(1.5, document.authors.length * 0.5)
    + (document.topic.length > 0 ? 0.5 : 0);
}

export function compareCatalogDocumentsByTitle(left: CatalogDocument, right: CatalogDocument): number {
  return left.title.localeCompare(right.title) || left.path.localeCompare(right.path);
}

export function popularCatalogDocuments(documents: readonly CatalogDocument[], limit = 100): readonly CatalogDocument[] {
  return Object.freeze([...documents]
    .sort((left, right) => catalogDocumentPopularity(right) - catalogDocumentPopularity(left) || right.bytes - left.bytes || compareCatalogDocumentsByTitle(left, right))
    .slice(0, Math.max(0, Math.floor(limit))));
}

export function relatedCatalogDocuments(source: CatalogRelationSource, documents: readonly CatalogDocument[], limit = 8): readonly CatalogDocument[] {
  const tags = new Set(source.tags.map(normalizeFacetName));
  const authors = new Set(source.authors.map(normalizeFacetName));
  const directory = directoryOf(source.path);
  return Object.freeze(documents
    .filter((document) => document.path !== source.path)
    .map((document) => Object.freeze({ document, score: relatedCatalogDocumentScore(document, tags, authors, source.topic, directory) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.document.bytes - left.document.bytes || compareCatalogDocumentsByTitle(left.document, right.document))
    .slice(0, Math.max(0, Math.floor(limit)))
    .map(({ document }) => document));
}

function documentRecord(root: string, relative: string): CatalogDocument | null {
  let document;
  let modifiedAt: string;
  try {
    document = readDocument(root, relative);
    modifiedAt = statSync(confine(root, relative)).mtime.toISOString();
  } catch {
    return null;
  }
  return Object.freeze({
    path: document.path,
    title: document.title,
    description: document.description,
    authors: document.authors,
    tags: document.tags,
    topic: document.topic,
    modifiedAt,
    bytes: document.bytes,
  });
}

function groupBy(
  documents: readonly CatalogDocument[],
  values: (document: CatalogDocument) => readonly string[],
): readonly CatalogGroup[] {
  const groups = new Map<string, CatalogDocument[]>();
  for (const document of documents) {
    for (const raw of values(document)) {
      const name = cleanWikiLink(raw);
      if (name.length === 0) continue;
      const group = groups.get(name) ?? [];
      group.push(document);
      groups.set(name, group);
    }
  }
  return Object.freeze([...groups.entries()]
    .map(([name, group]) => Object.freeze({
      name,
      count: group.length,
      documents: Object.freeze(group.slice(0, 25)),
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 300));
}

function cleanWikiLink(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
}

function facetKind(value: unknown): CatalogFacetKind {
  const normalized = String(value ?? "topic").toLowerCase().trim();
  if (normalized === "author" || normalized === "authors" || normalized === "creator" || normalized === "creators") return "author";
  return "topic";
}

function documentHasAuthor(document: CatalogDocument, normalized: string): boolean {
  return document.authors.some((author) => normalizeFacetName(author) === normalized);
}

function documentHasTopic(document: CatalogDocument, normalized: string): boolean {
  return [document.topic, ...document.tags].some((topic) => normalizeFacetName(topic) === normalized);
}

function relatedCatalogDocumentScore(
  document: CatalogDocument,
  tags: ReadonlySet<string>,
  authors: ReadonlySet<string>,
  topic: string,
  directory: string,
): number {
  const sharedTags = document.tags.map(normalizeFacetName).filter((tag) => tags.has(tag)).length;
  const sharedAuthors = document.authors.map(normalizeFacetName).filter((author) => authors.has(author)).length;
  return (sharedTags * 4)
    + (sharedAuthors * 3)
    + (document.topic === topic ? 2 : 0)
    + (directory !== "" && document.path.startsWith(`${directory}/`) ? 1 : 0)
    + Math.min(1, Math.log10(Math.max(1, document.bytes)) / 8);
}

function normalizeFacetName(value: string): string {
  return cleanWikiLink(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function directoryOf(value: string): string {
  const parts = value.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function cleanPath(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\\/g, "/");
}
