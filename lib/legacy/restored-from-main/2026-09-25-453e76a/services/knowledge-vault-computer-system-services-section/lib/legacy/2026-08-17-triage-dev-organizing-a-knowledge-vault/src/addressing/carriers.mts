/**
 * addressing/carriers  -  TypeBox declarations for corpus filepath addressing.
 */
import { carrierFrom } from "@emsenn/relating";

export const addressedNameMatchSchema = { $id: "organizing/knowledge-vault/addressing/name-match", title: "AddressedNameMatch", description: "One filepath-address match inside the corpus memorystore.", type: "object", required: ["path", "kind"], properties: { path: { description: "the corpus-relative path whose address matched the query", type: "string" }, kind: { description: "the kind of addressed corpus entry", anyOf: [{ const: "directory" }, { const: "file" }, { const: "other" }] } }, additionalProperties: false } as const;

export const addressedNameMatchCarrier = carrierFrom(addressedNameMatchSchema);

export interface AddressedNameMatch {
  readonly path: string;
  readonly kind: "directory" | "file" | "other";
}

export const addressedNameSearchSchema = { $id: "organizing/knowledge-vault/addressing/name-search", title: "AddressedNameSearch", description: "find-name's codomain: bounded filepath lookup over the corpus memorystore.", type: "object", required: ["kind", "query", "scanned", "results", "truncated"], properties: { kind: { const: "organizing.knowledge-vault.addressing.name-search" }, query: { description: "the normalized name query", type: "string" }, scanned: { minimum: 0, description: "the number of corpus entries scanned", type: "integer" }, results: { description: "matching corpus-relative paths", type: "array", items: addressedNameMatchCarrier.schema }, truncated: { description: "whether result or scan bounds truncated the search", type: "boolean" } }, additionalProperties: false } as const;

export const addressedNameSearchCarrier = carrierFrom(addressedNameSearchSchema);

export interface FindAddressedNameResult {
  readonly kind: "organizing.knowledge-vault.addressing.name-search";
  readonly query: string;
  readonly scanned: number;
  readonly results: ReadonlyArray<AddressedNameMatch>;
  readonly truncated: boolean;
}

export const addressedTextHitSchema = { $id: "organizing/knowledge-vault/addressing/text-hit", title: "AddressedTextHit", description: "One lexical evidence hit inside a corpus resource.", type: "object", required: ["path", "line", "context"], properties: { path: { description: "the corpus-relative markdown resource path", type: "string" }, line: { minimum: 1, description: "the 1-based line number of the first hit in the resource", type: "integer" }, context: { description: "a compact textual witness around the hit", type: "string" } }, additionalProperties: false } as const;

export const addressedTextHitCarrier = carrierFrom(addressedTextHitSchema);

export interface GrepAddressedTextHit {
  readonly path: string;
  readonly line: number;
  readonly context: string;
}

export const addressedTextSearchSchema = { $id: "organizing/knowledge-vault/addressing/text-search", title: "AddressedTextSearch", description: "grep-text's codomain: bounded lexical evidence over the corpus memorystore.", type: "object", required: ["kind", "query", "path", "filesScanned", "hits", "truncated", "scanTruncated"], properties: { kind: { const: "organizing.knowledge-vault.addressing.text-search" }, query: { description: "the normalized text query", type: "string" }, path: { description: "the corpus-relative region that was searched", type: "string" }, filesScanned: { minimum: 0, description: "the number of markdown resources scanned", type: "integer" }, hits: { description: "lexical evidence hits", type: "array", items: addressedTextHitCarrier.schema }, truncated: { description: "whether the hit limit truncated the search", type: "boolean" }, scanTruncated: { description: "whether the scan limit truncated corpus resource admission", type: "boolean" } }, additionalProperties: false } as const;

export const addressedTextSearchCarrier = carrierFrom(addressedTextSearchSchema);

export interface GrepAddressedTextResult {
  readonly kind: "organizing.knowledge-vault.addressing.text-search";
  readonly query: string;
  readonly path: string;
  readonly filesScanned: number;
  readonly hits: ReadonlyArray<GrepAddressedTextHit>;
  readonly truncated: boolean;
  readonly scanTruncated: boolean;
}
