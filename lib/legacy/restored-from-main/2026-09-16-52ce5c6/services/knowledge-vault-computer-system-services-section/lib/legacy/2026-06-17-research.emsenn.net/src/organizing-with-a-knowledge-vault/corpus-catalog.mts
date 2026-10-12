import {
  catalogCorpus,
  compareCatalogDocumentsByTitle,
  facetCorpusCatalog,
  popularCatalogDocuments,
  relatedCatalogDocuments,
  searchCatalogDocuments,
  type Catalog as CorpusCatalog,
  type CatalogDocument as CorpusCatalogDocument,
  type CatalogFacet as CorpusCatalogFacet,
  type CatalogFacetKind as CorpusFacetKind,
  type CatalogGroup as CorpusCatalogGroup,
} from "@emsenn/organizing-a-knowledge-vault/corpus";

import { emsennContentRoot } from "./content-root.mts";

export type { CorpusCatalogDocument, CorpusCatalogGroup, CorpusFacetKind };

export type CorpusCatalogRequest = Readonly<{
  root?: string;
  path?: string;
  limit?: number | string;
  maxScan?: number | string;
}>;

export type CorpusCatalogView = Readonly<{
  path: string;
  scanned: number;
  total: number;
  truncated: boolean;
  documents: readonly CorpusCatalogDocument[];
  latest: readonly CorpusCatalogDocument[];
  authors: readonly CorpusCatalogGroup[];
  topics: readonly CorpusCatalogGroup[];
}>;

export type CorpusFacetRequest = Readonly<{
  root?: string;
  path?: string;
  kind?: string;
  name?: string;
  q?: string;
  limit?: number | string;
  maxScan?: number | string;
}>;

export type CorpusFacetResult = Readonly<{
  kind: CorpusFacetKind;
  name: string;
  path: string;
  scanned: number;
  total: number;
  truncated: boolean;
  matchedCount: number;
  group: CorpusCatalogGroup | null;
  documents: readonly CorpusCatalogDocument[];
  similar: readonly CorpusCatalogGroup[];
}>;

export async function corpusCatalog(request: CorpusCatalogRequest = {}): Promise<CorpusCatalogView> {
  return siteCatalog(catalogCorpus(emsennContentRoot(request.root), {
    ...(request.path === undefined ? {} : { path: request.path }),
    ...(request.limit === undefined ? {} : { limit: request.limit }),
    ...(request.maxScan === undefined ? {} : { maxScan: request.maxScan }),
  }));
}

export async function corpusFacet(request: CorpusFacetRequest = {}): Promise<CorpusFacetResult> {
  return siteFacet(facetCorpusCatalog(emsennContentRoot(request.root), {
    ...(request.path === undefined ? {} : { path: request.path }),
    ...(request.kind === undefined ? {} : { kind: request.kind }),
    ...(request.name === undefined ? {} : { name: request.name }),
    ...(request.q === undefined ? {} : { q: request.q }),
    ...(request.limit === undefined ? {} : { limit: request.limit }),
    ...(request.maxScan === undefined ? {} : { maxScan: request.maxScan }),
  }));
}

export function searchCorpusCatalogView(catalog: CorpusCatalogView, query: string, limit = 50): readonly CorpusCatalogDocument[] {
  return searchCatalogDocuments(catalog.documents, query, limit);
}

export function popularCorpusDocuments(catalog: CorpusCatalogView, limit = 100): readonly CorpusCatalogDocument[] {
  return popularCatalogDocuments(catalog.documents, limit);
}

export function relatedCorpusDocuments(source: {
  readonly path: string;
  readonly topic: string;
  readonly tags: readonly string[];
  readonly authors: readonly string[];
}, catalog: CorpusCatalogView, limit = 8): readonly CorpusCatalogDocument[] {
  return relatedCatalogDocuments(source, catalog.documents, limit);
}

export { compareCatalogDocumentsByTitle as compareCorpusDocumentsByTitle };

function siteCatalog(catalog: CorpusCatalog): CorpusCatalogView {
  return Object.freeze({
    path: catalog.path,
    scanned: catalog.scanned,
    total: catalog.total,
    truncated: catalog.truncated,
    documents: catalog.documents,
    latest: catalog.latest,
    authors: catalog.authors,
    topics: catalog.topics,
  });
}

function siteFacet(facet: CorpusCatalogFacet): CorpusFacetResult {
  return Object.freeze({
    kind: facet.facet,
    name: facet.name,
    path: facet.path,
    scanned: facet.scanned,
    total: facet.total,
    truncated: facet.truncated,
    matchedCount: facet.matchedCount,
    group: facet.group,
    documents: facet.documents,
    similar: facet.similar,
  });
}
