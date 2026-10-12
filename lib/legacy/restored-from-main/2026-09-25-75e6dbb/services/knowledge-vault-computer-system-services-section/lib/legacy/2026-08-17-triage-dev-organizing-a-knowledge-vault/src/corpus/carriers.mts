/**
 * corpus/carriers  -  TypeBox carrier declarations for the persistent memorystore.
 *
 * The schema is authored here once. Its `$id` is the category object, its
 * handwritten TypeScript interfaces are the public surface, and relating registers the carrier.
 */
import { carrierFrom } from "@emsenn/relating";

export const corpusNodeSchema = { $id: "organizing/knowledge-vault/corpus/node", title: "CorpusNode", description: "locate's codomain (and the element of browse's frontier): one node of the corpus proof tree.", type: "object", required: ["kind", "address", "slug", "role", "hasDocument"], properties: { kind: { const: "organizing.knowledge-vault.corpus.node" }, address: { description: "the meaningful proof path (slugs only, joints elided), e.g. \"topic/utterance\"", type: "string" }, slug: { description: "the node's own slug (basename of its directory)", type: "string" }, role: { description: "morphism (a gerund), object (a codomain), or joint (a `content/` holder)", anyOf: [{ const: "morphism" }, { const: "object" }, { const: "joint" }] }, hasDocument: { description: "whether the canonical `slug/slug.md` document is present", type: "boolean" }, title: { description: "the node's title, from frontmatter (when documented)", type: "string" }, description: { description: "the node's description, from frontmatter (when documented)", type: "string" }, tags: { description: "the node's tags, from frontmatter (when documented)", type: "array", items: { type: "string" } } }, additionalProperties: false } as const;

export const corpusNodeCarrier = carrierFrom(corpusNodeSchema);

export interface CorpusNode {
  readonly kind: "organizing.knowledge-vault.corpus.node";
  readonly address: string;
  readonly slug: string;
  readonly role: "morphism" | "object" | "joint";
  readonly hasDocument: boolean;
  readonly title?: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
}

export const frontierSchema = { $id: "organizing/knowledge-vault/corpus/frontier", title: "Frontier", description: "browse's codomain: the one-step generated frontier of a corpus topic.", type: "object", required: ["kind", "topic", "nodes"], properties: { kind: { const: "organizing.knowledge-vault.corpus.frontier" }, topic: { description: "the topic whose frontier was generated (empty string = the corpus root)", type: "string" }, nodes: { description: "the generated frontier: the corpus nodes the topic generates in one step", type: "array", items: corpusNodeCarrier.schema } }, additionalProperties: false } as const;

export const frontierCarrier = carrierFrom(frontierSchema);

export interface Frontier {
  readonly kind: "organizing.knowledge-vault.corpus.frontier";
  readonly topic: string;
  readonly nodes: ReadonlyArray<CorpusNode>;
}

export const corpusDocumentSchema = { $id: "organizing/knowledge-vault/corpus/document", title: "CorpusDocument", description: "read's codomain: a corpus resource decoded by relating's markdown codec.", type: "object", required: ["kind", "path", "title", "description", "authors", "tags", "topic", "subject", "format", "conformant", "frontmatter", "body", "preview", "bytes", "assertions"], properties: { kind: { const: "organizing.knowledge-vault.corpus.document" }, path: { description: "the corpus-relative path of the resource (the codec witness)", type: "string" }, title: { description: "the display title derived from frontmatter or path", type: "string" }, description: { description: "the frontmatter description/summary/abstract, when present", type: "string" }, authors: { description: "normalized author/creator values", type: "array", items: { type: "string" } }, tags: { description: "normalized tag/topic values", type: "array", items: { type: "string" } }, topic: { description: "the broad topic inferred from the corpus path", type: "string" }, subject: { description: "the subject the markdown codec assigns the document", type: "string" }, format: { description: "the frontmatter format the codec recognized", anyOf: [{ const: "yaml" }, { const: "toml" }, { type: "null" }] }, conformant: { description: "whether the frontmatter conforms", type: "boolean" }, frontmatter: { description: "the decoded frontmatter record", type: "object", additionalProperties: {} }, body: { description: "the decoded document body", type: "string" }, preview: { description: "a compact text preview derived from the decoded body", type: "string" }, bytes: { minimum: 0, description: "the UTF-8 byte length of the addressed resource", type: "integer" }, assertions: { minimum: 0, description: "the number of EAVT assertions the codec derived", type: "integer" } }, additionalProperties: false } as const;

export const corpusDocumentCarrier = carrierFrom(corpusDocumentSchema);

export interface CorpusDocument {
  readonly kind: "organizing.knowledge-vault.corpus.document";
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly authors: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly topic: string;
  readonly subject: string;
  readonly format: "yaml" | "toml" | null;
  readonly conformant: boolean;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly body: string;
  readonly preview: string;
  readonly bytes: number;
  readonly assertions: number;
}

export const listEntrySchema = { $id: "organizing/knowledge-vault/corpus/list-entry", title: "ListEntry", description: "One confined filesystem entry in a corpus listing.", type: "object", required: ["name", "path", "kind"], properties: { name: { type: "string" }, path: { description: "the corpus-relative address of this entry", type: "string" }, kind: { anyOf: [{ const: "directory" }, { const: "file" }, { const: "other" }] } }, additionalProperties: false } as const;

export const listEntryCarrier = carrierFrom(listEntrySchema);

export interface ListEntry {
  readonly name: string;
  readonly path: string;
  readonly kind: "directory" | "file" | "other";
}

export const listingSchema = { $id: "organizing/knowledge-vault/corpus/listing", title: "Listing", description: "list's codomain: a bounded inspection of a corpus address.", type: "object", required: ["kind", "path", "targetKind", "limit", "total", "truncated", "entries"], properties: { kind: { const: "organizing.knowledge-vault.corpus.listing" }, path: { description: "the addressed path, relative to the corpus root", type: "string" }, targetKind: { description: "the filesystem kind of the addressed path", anyOf: [{ const: "directory" }, { const: "file" }, { const: "other" }] }, limit: { minimum: 1, description: "the entry limit applied to directory listings", type: "integer" }, total: { minimum: 0, description: "the total immediate entries before limit truncation", type: "integer" }, truncated: { description: "whether the listing was truncated by the entry limit", type: "boolean" }, entries: { description: "the immediate entries, sorted by name", type: "array", items: listEntryCarrier.schema } }, additionalProperties: false } as const;

export const listingCarrier = carrierFrom(listingSchema);

export interface Listing {
  readonly kind: "organizing.knowledge-vault.corpus.listing";
  readonly path: string;
  readonly targetKind: "directory" | "file" | "other";
  readonly limit: number;
  readonly total: number;
  readonly truncated: boolean;
  readonly entries: ReadonlyArray<ListEntry>;
}

const knowledgeVaultRootPathSchema = { additionalProperties: false, type: "object", required: ["path", "description", "present"], properties: { path: { description: "the vault-root-relative affordance path", type: "string" }, description: { description: "what this root affordance is expected to hold", type: "string" }, present: { description: "whether this affordance exists under the inspected root", type: "boolean" } } } as const;

export const knowledgeVaultRootSchema = { $id: "organizing/knowledge-vault/corpus/root", title: "KnowledgeVaultRoot", description: "The expected root affordances of a mounted content/ knowledge vault.", type: "object", required: ["kind", "root", "expectedPaths", "stablePrefixes", "observedPrefixes", "missingPaths", "allowedPrefixes"], properties: { kind: { const: "organizing.knowledge-vault.corpus.root" }, root: { type: "string" }, expectedPaths: { type: "array", items: knowledgeVaultRootPathSchema }, stablePrefixes: { type: "array", items: { description: "universal root prefixes expected by the knowledge-vault package law", type: "string" } }, observedPrefixes: { type: "array", items: { description: "existing top-level corpus prefixes discovered under the inspected root", type: "string" } }, missingPaths: { type: "array", items: { description: "expected affordance paths absent from the inspected root", type: "string" } }, allowedPrefixes: { type: "array", items: { description: "stable expected prefixes plus observed top-level prefixes allowed for confined addressing", type: "string" } } }, additionalProperties: false } as const;

export const knowledgeVaultRootCarrier = carrierFrom(knowledgeVaultRootSchema);

export interface KnowledgeVaultRoot {
  readonly kind: "organizing.knowledge-vault.corpus.root";
  readonly root: string;
  readonly expectedPaths: ReadonlyArray<Readonly<{ path: string; description: string; present: boolean }>>;
  readonly stablePrefixes: readonly string[];
  readonly observedPrefixes: readonly string[];
  readonly missingPaths: readonly string[];
  readonly allowedPrefixes: readonly string[];
}

const catalogDocumentSchema = { $id: "organizing/knowledge-vault/corpus/catalog-document", title: "CatalogDocument", description: "One cataloged corpus document: frontmatter facets plus filesystem metadata.", additionalProperties: false, type: "object", required: ["path", "title", "description", "authors", "tags", "topic", "modifiedAt", "bytes"], properties: { path: { description: "the corpus-relative markdown resource path", type: "string" }, title: { description: "the display title derived from frontmatter or path", type: "string" }, description: { description: "the frontmatter description/summary/abstract, when present", type: "string" }, authors: { description: "normalized author/creator values", type: "array", items: { type: "string" } }, tags: { description: "normalized tag/topic values", type: "array", items: { type: "string" } }, topic: { description: "the broad topic inferred from the corpus path", type: "string" }, modifiedAt: { description: "the resource mtime as an ISO timestamp", type: "string" }, bytes: { minimum: 0, description: "the UTF-8 byte length of the resource", type: "integer" } } } as const;

export const catalogDocumentCarrier = carrierFrom(catalogDocumentSchema);

export interface CatalogDocument {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly authors: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly topic: string;
  readonly modifiedAt: string;
  readonly bytes: number;
}

export const publishedCorpusDocumentSchema = { $id: "organizing/knowledge-vault/corpus/published-document", title: "PublishedCorpusDocument", description: "A corpus markdown document admitted as a public-site publication resource.", type: "object", required: ["kind", "path", "slug", "title", "description", "publicationKind", "authors", "tags", "topic", "modifiedAt", "bytes", "frontmatter", "body"], properties: { kind: { const: "organizing.knowledge-vault.corpus.published-document" }, path: { description: "the corpus-relative markdown resource path", type: "string" }, slug: { description: "the stable public slug induced from the corpus path", type: "string" }, title: { description: "the display title derived from frontmatter or path", type: "string" }, description: { description: "the frontmatter description/summary/abstract, when present", type: "string" }, publicationKind: { description: "the publication kind induced from frontmatter and corpus placement", type: "string" }, authors: { type: "array", items: { type: "string" } }, tags: { type: "array", items: { type: "string" } }, topic: { type: "string" }, modifiedAt: { type: "string" }, bytes: { minimum: 0, type: "integer" }, frontmatter: { type: "object", additionalProperties: {} }, body: { type: "string" } }, additionalProperties: false } as const;

export const publishedCorpusDocumentCarrier = carrierFrom(publishedCorpusDocumentSchema);

export interface PublishedCorpusDocument {
  readonly kind: "organizing.knowledge-vault.corpus.published-document";
  readonly path: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly publicationKind: string;
  readonly authors: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly topic: string;
  readonly modifiedAt: string;
  readonly bytes: number;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly body: string;
}

const catalogGroupSchema = { $id: "organizing/knowledge-vault/corpus/catalog-group", title: "CatalogGroup", description: "A catalog facet group over corpus documents.", additionalProperties: false, type: "object", required: ["name", "count", "documents"], properties: { name: { description: "the normalized facet value", type: "string" }, count: { minimum: 0, description: "the number of documents in the facet group", type: "integer" }, documents: { description: "a bounded sample of documents in the group", type: "array", items: catalogDocumentSchema } } } as const;

export const catalogGroupCarrier = carrierFrom(catalogGroupSchema);

export interface CatalogGroup {
  readonly name: string;
  readonly count: number;
  readonly documents: ReadonlyArray<CatalogDocument>;
}

export const catalogSchema = { $id: "organizing/knowledge-vault/corpus/catalog", title: "Catalog", description: "A bounded faceted catalog over the corpus memorystore.", type: "object", required: ["kind", "path", "scanned", "total", "truncated", "documents", "latest", "authors", "topics"], properties: { kind: { const: "organizing.knowledge-vault.corpus.catalog" }, path: { description: "the corpus-relative region cataloged", type: "string" }, scanned: { minimum: 0, description: "the number of markdown resources scanned", type: "integer" }, total: { minimum: 0, description: "the number of catalogable documents found", type: "integer" }, truncated: { description: "whether the scan bound truncated the catalog", type: "boolean" }, documents: { description: "the bounded document list", type: "array", items: catalogDocumentSchema }, latest: { description: "the most recently modified documents", type: "array", items: catalogDocumentSchema }, authors: { description: "documents grouped by author/creator", type: "array", items: catalogGroupSchema }, topics: { description: "documents grouped by inferred topic and tags", type: "array", items: catalogGroupSchema } }, additionalProperties: false } as const;

export const catalogCarrier = carrierFrom(catalogSchema);

export interface Catalog {
  readonly kind: "organizing.knowledge-vault.corpus.catalog";
  readonly path: string;
  readonly scanned: number;
  readonly total: number;
  readonly truncated: boolean;
  readonly documents: ReadonlyArray<CatalogDocument>;
  readonly latest: ReadonlyArray<CatalogDocument>;
  readonly authors: ReadonlyArray<CatalogGroup>;
  readonly topics: ReadonlyArray<CatalogGroup>;
}

export const catalogFacetSchema = { $id: "organizing/knowledge-vault/corpus/catalog-facet", title: "CatalogFacet", description: "A bounded facet view over a corpus catalog.", type: "object", required: ["kind", "facet", "name", "path", "scanned", "total", "truncated", "matchedCount", "group", "documents", "similar"], properties: { kind: { const: "organizing.knowledge-vault.corpus.catalog-facet" }, facet: { description: "the facet kind", anyOf: [{ const: "author" }, { const: "topic" }] }, name: { description: "the requested or matched facet name", type: "string" }, path: { description: "the corpus-relative region cataloged", type: "string" }, scanned: { minimum: 0, type: "integer" }, total: { minimum: 0, type: "integer" }, truncated: { type: "boolean" }, matchedCount: { minimum: 0, type: "integer" }, group: { description: "the exact normalized group, when present", anyOf: [catalogGroupSchema, { type: "null" }] }, documents: { description: "matching documents, bounded", type: "array", items: catalogDocumentSchema }, similar: { description: "nearby facet groups", type: "array", items: catalogGroupSchema } }, additionalProperties: false } as const;

export const catalogFacetCarrier = carrierFrom(catalogFacetSchema);

export interface CatalogFacet {
  readonly kind: "organizing.knowledge-vault.corpus.catalog-facet";
  readonly facet: "author" | "topic";
  readonly name: string;
  readonly path: string;
  readonly scanned: number;
  readonly total: number;
  readonly truncated: boolean;
  readonly matchedCount: number;
  readonly group: CatalogGroup | null;
  readonly documents: ReadonlyArray<CatalogDocument>;
  readonly similar: ReadonlyArray<CatalogGroup>;
}

const documentTypeLocationSchema = { $id: "organizing/knowledge-vault/corpus/document-type-location", title: "DocumentTypeLocation", description: "The confined corpus location of a schema-backed document type.", additionalProperties: false, type: "object", required: ["root", "typePath", "slug", "schemaId", "logPath", "schemaPath"], properties: { root: { description: "the absolute or caller-supplied corpus root", type: "string" }, typePath: { description: "the corpus-relative directory carrying the document type log and schema", type: "string" }, slug: { description: "the document type slug", type: "string" }, schemaId: { description: "the projected JSON Schema $id", type: "string" }, logPath: { description: "the corpus-relative JSONL assertion log path", type: "string" }, schemaPath: { description: "the corpus-relative projected schema path", type: "string" } } } as const;

export const documentTypeLocationCarrier = carrierFrom(documentTypeLocationSchema);

export interface DocumentTypeLocation {
  readonly root: string;
  readonly typePath: string;
  readonly slug: string;
  readonly schemaId: string;
  readonly logPath: string;
  readonly schemaPath: string;
}

export const documentTypeClaimSchema = { $id: "organizing/knowledge-vault/corpus/document-type-claim", title: "DocumentTypeClaim", description: "A schema fragment claimed into a document type assertion log.", type: "object", required: ["kind", "location", "added", "total"], properties: { kind: { const: "organizing.knowledge-vault.corpus.document-type-claim" }, location: documentTypeLocationSchema, added: { minimum: 0, type: "integer" }, total: { minimum: 0, type: "integer" } }, additionalProperties: false } as const;

export const documentTypeClaimCarrier = carrierFrom(documentTypeClaimSchema);

export interface DocumentTypeClaim {
  readonly kind: "organizing.knowledge-vault.corpus.document-type-claim";
  readonly location: DocumentTypeLocation;
  readonly added: number;
  readonly total: number;
}

const contradictionSchema = { additionalProperties: false, type: "object", required: ["e", "a", "values", "assertions"], properties: { e: { type: "string" }, a: { type: "string" }, values: { type: "array", items: {} }, assertions: { type: "array", items: {} } } } as const;

export const documentTypeProjectionSchema = { $id: "organizing/knowledge-vault/corpus/document-type-projection", title: "DocumentTypeProjection", description: "A document type assertion log settled into a projected JSON Schema or contradictions.", type: "object", required: ["kind", "location", "written", "schema", "contradictions"], properties: { kind: { const: "organizing.knowledge-vault.corpus.document-type-projection" }, location: documentTypeLocationSchema, written: { type: "boolean" }, schema: { anyOf: [{ type: "object", additionalProperties: {} }, { type: "null" }] }, contradictions: { type: "array", items: contradictionSchema } }, additionalProperties: false } as const;

export const documentTypeProjectionCarrier = carrierFrom(documentTypeProjectionSchema);

export interface DocumentTypeProjection {
  readonly kind: "organizing.knowledge-vault.corpus.document-type-projection";
  readonly location: DocumentTypeLocation;
  readonly written: boolean;
  readonly schema: Readonly<Record<string, unknown>> | null;
  readonly contradictions: ReadonlyArray<unknown>;
}

export const documentTypeRealizationSchema = { $id: "organizing/knowledge-vault/corpus/document-type-realization", title: "DocumentTypeRealization", description: "A markdown document realized from a projected document type schema; dry-run by default.", type: "object", required: ["kind", "path", "text", "frontmatter", "written"], properties: { kind: { const: "organizing.knowledge-vault.corpus.document-type-realization" }, path: { description: "the corpus-relative path prepared or written", type: "string" }, text: { description: "the realized markdown text", type: "string" }, frontmatter: { type: "object", additionalProperties: {} }, written: { type: "boolean" } }, additionalProperties: false } as const;

export const documentTypeRealizationCarrier = carrierFrom(documentTypeRealizationSchema);

export interface DocumentTypeRealization {
  readonly kind: "organizing.knowledge-vault.corpus.document-type-realization";
  readonly path: string;
  readonly text: string;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly written: boolean;
}

export const documentTypeAuditSchema = { $id: "organizing/knowledge-vault/corpus/document-type-audit", title: "DocumentTypeAudit", description: "A corpus markdown resource checked against a projected document type schema.", type: "object", required: ["kind", "conformant", "violations", "typePath", "thing"], properties: { kind: { const: "organizing.knowledge-vault.corpus.document-type-audit" }, conformant: { type: "boolean" }, violations: { type: "array", items: { type: "string" } }, typePath: { anyOf: [{ type: "string" }, { type: "null" }] }, thing: { anyOf: [{ type: "string" }, { type: "null" }] } }, additionalProperties: false } as const;

export const documentTypeAuditCarrier = carrierFrom(documentTypeAuditSchema);

export interface DocumentTypeAudit {
  readonly kind: "organizing.knowledge-vault.corpus.document-type-audit";
  readonly conformant: boolean;
  readonly violations: ReadonlyArray<string>;
  readonly typePath: string | null;
  readonly thing: string | null;
}
