/**
 * term-intension/concept-resolution — witness "this term already exists at
 * these schema addresses" facts, so later readouts can start from settled
 * anchors before recomputing a fresh sweep. A resolution is a `concept-resolution`
 * record of the store, read back with `conceptResolutionsAt`.
 */
import { requireJsonValue } from "@red-cup-engineering/json-services-section";
import { each, put } from "@red-cup-engineering/semiotic-eavt-services-section/store";

/** The store type of a resolved "term already exists at these schema addresses, sharing this attribute" fact. */
export const CONCEPT_RESOLUTION_TYPE = "concept-resolution";

/** Record one resolution; returns its address. */
export function recordConceptResolution(root, resolution, at) {
  return put(root, CONCEPT_RESOLUTION_TYPE, requireJsonValue(Object.freeze({
    term: resolution.term,
    canonicalFiles: Object.freeze([...resolution.canonicalFiles]),
    sharedAttribute: resolution.sharedAttribute,
    resolvedBy: resolution.resolvedBy,
    at,
  }), "concept resolution"));
}

/** A stored resolution as readouts take it, or undefined when it is not one. */
export function conceptResolutionOfRecord(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) return undefined;
  const term = typeof record.term === "string" ? record.term : undefined;
  const sharedAttribute = typeof record.sharedAttribute === "string" ? record.sharedAttribute : undefined;
  const resolvedBy = typeof record.resolvedBy === "string" ? record.resolvedBy : undefined;
  const canonicalFiles = Array.isArray(record.canonicalFiles)
    ? record.canonicalFiles.filter((entry) => typeof entry === "string")
    : undefined;
  if (term === undefined || sharedAttribute === undefined || resolvedBy === undefined || canonicalFiles === undefined) return undefined;
  return Object.freeze({ term, canonicalFiles: Object.freeze(canonicalFiles), sharedAttribute, resolvedBy });
}

/** Every resolution the root holds. */
export function* conceptResolutionsAt(root) {
  for (const { record } of each(root, CONCEPT_RESOLUTION_TYPE)) {
    const resolution = conceptResolutionOfRecord(record);
    if (resolution !== undefined) yield resolution;
  }
}
