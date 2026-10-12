/**
 * corpus/memory  -  admit the persistent corpus memorystore as knowing memory.
 *
 * knowing owns the memory carrier and readings. This package owns the concrete
 * filepath-tree admission boundary: confined corpus discovery, bounded scanning,
 * and handing gathered resources to knowing.
 */
import { admitDocument, admitMemory, type MemoryCarrier, type MemoryDocument } from "@emsenn/knowing/memory";
import type { Resource } from "./documents.mjs";
import { gatherResources } from "./documents.mjs";
import { corpusReadBounds } from "./bounds.mjs";

export interface CorpusBoundaryDocument {
  readonly path: string;
  readonly text: string;
}

export interface AdmitCorpusMemoryOptions {
  readonly limit?: number | string;
  readonly maxScan?: number | string;
}

export function admitCorpusMemory(root: string, region = "", options: AdmitCorpusMemoryOptions = {}): MemoryCarrier {
  const { limit, maxScan } = corpusReadBounds(options.limit, options.maxScan);
  return admitMemory(root, gatherResources(root, region, limit, maxScan));
}

export function admitCorpusResource(root: string, resource: Resource): MemoryDocument {
  return admitDocument(root, resource);
}

export function admitCorpusResources(root: string, resources: readonly Resource[]): MemoryCarrier {
  return admitMemory(root, resources);
}

export function corpusResourceFromBoundaryDocument(document: CorpusBoundaryDocument): Resource {
  return Object.freeze({
    path: document.path,
    content: document.text,
  });
}

export function admitCorpusBoundaryDocument(root: string, document: CorpusBoundaryDocument): MemoryDocument {
  return admitCorpusResource(root, corpusResourceFromBoundaryDocument(document));
}

export function admitCorpusBoundaryDocuments(root: string, documents: readonly CorpusBoundaryDocument[]): MemoryCarrier {
  return admitCorpusResources(root, documents.map(corpusResourceFromBoundaryDocument));
}
