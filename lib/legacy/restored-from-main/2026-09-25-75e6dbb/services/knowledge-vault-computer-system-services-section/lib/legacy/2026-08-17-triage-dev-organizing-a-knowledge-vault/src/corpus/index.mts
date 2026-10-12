/**
 * corpus  -  the persistent memorystore as a directed category.
 *
 * The on-disk corpus (content/) is organized generator/generated: every parent
 * directory GENERATES its child, so the directory tree IS the directed knowledge
 * relation the learning verbs traverse. This subpath rolls up the scoped readers
 * that admit that category as carriers  -  node resolution, the generator chain
 * (ancestry), the generated frontier (children), and the canonical document.
 */
export {
  corpusReadBounds,
  DEFAULT_CORPUS_LIMIT,
  DEFAULT_CORPUS_MAX_SCAN,
  DEFAULT_CORPUS_LIST_LIMIT,
  MAX_CORPUS_LIMIT,
  MAX_CORPUS_LIST_LIMIT,
  MAX_CORPUS_SCAN,
  type CorpusReadBounds,
} from "./bounds.mjs";

export {
  corpusNodeCarrier,
  frontierCarrier,
  corpusDocumentCarrier,
  listEntryCarrier,
  listingCarrier,
  catalogDocumentCarrier,
  catalogGroupCarrier,
  catalogCarrier,
  catalogFacetCarrier,
  publishedCorpusDocumentCarrier,
  documentTypeLocationCarrier,
  documentTypeClaimCarrier,
  documentTypeProjectionCarrier,
  documentTypeRealizationCarrier,
  documentTypeAuditCarrier,
  knowledgeVaultRootCarrier,
  type Catalog,
  type CatalogDocument,
  type CatalogFacet,
  type CatalogGroup,
  type PublishedCorpusDocument,
  type DocumentTypeLocation,
  type DocumentTypeClaim,
  type DocumentTypeProjection,
  type DocumentTypeRealization,
  type DocumentTypeAudit,
  type Frontier,
  type ListEntry,
  type Listing,
  type CorpusDocument,
  type CorpusNode,
  type KnowledgeVaultRoot,
} from "./carriers.mjs";

export {
  KNOWLEDGE_VAULT_ALLOWED_PREFIXES,
  KNOWLEDGE_VAULT_DOCS_PATHS,
  KNOWLEDGE_VAULT_PATH_DESCRIPTIONS,
  KNOWLEDGE_VAULT_ROOT_PATHS,
  KNOWLEDGE_VAULT_SUPPORT_PREFIXES,
  confineKnowledgeVaultPath,
  describeKnowledgeVaultPath,
  knowledgeVaultAllowedPrefixes,
  knowledgeVaultObservedPrefixes,
  knowledgeVaultRoot,
  knowledgeVaultPathAllowed,
  knowledgeVaultPathAllowedInRoot,
  normalizeKnowledgeVaultPath,
  resolveKnowledgeVaultRoot,
  type ResolveKnowledgeVaultRootOptions,
} from "./root.mjs";

export {
  knowledgeVaultRig,
  knowledgeVaultRigCarrier,
  knowledgeVaultNewscableRig,
  knowledgeVaultNewswireRig,
  knowledgeVaultRigging,
  knowledgeVaultRiggingCarrier,
  knowledgeVaultRiggingTerm,
  knowledgeVaultRigTerm,
  type KnowledgeVaultRig,
  type KnowledgeVaultRigging,
  type KnowledgeVaultRigInput,
  type KnowledgeVaultNewscableRigInput,
  type KnowledgeVaultNewswireRigInput,
} from "./rigging.mjs";

export {
  resolveNode,
  requireNode,
  claim,
  ancestry,
  children,
  generator,
  references,
  document,
  UnknownTopic,
  type ResolvedNode,
  type NodeRole,
} from "./store.mjs";

// The corpus reading boundary  -  resources decoded into documents by relating's
// markdown codec, plus confined listing and gathering. The disk store is the
// persistent memorystore.
export {
  readDocument,
  documentTitle,
  firstFrontmatterString,
  frontmatterStrings,
  titleFromPath,
  topicFromPath,
  documentPreview,
  corpusDocumentKind,
  documentBacklinkQueries,
  draftKindForCorpusDocumentKind,
  isTriagePath,
  normalizeCorpusDocumentKind,
  listEntries,
  collectMarkdownPaths,
  gatherResources,
  type BacklinkQueryDocument,
  type CorpusDocumentKind,
  type CollectMarkdownPathsOptions,
  type ListEntriesOptions,
  type MarkdownPathCollection,
  type Resource,
} from "./documents.mjs";

export {
  admitCorpusMemory,
  admitCorpusBoundaryDocument,
  admitCorpusBoundaryDocuments,
  admitCorpusResource,
  admitCorpusResources,
  corpusResourceFromBoundaryDocument,
  type AdmitCorpusMemoryOptions,
  type CorpusBoundaryDocument,
} from "./memory.mjs";

export {
  corpusBoundary,
  organizeCorpus,
  type OrganizeCorpusOptions,
  type Organization,
  type SocialBoundary,
} from "./organizing.mjs";

export {
  catalogCorpus,
  facetCorpusCatalog,
  catalogDocumentMatches,
  catalogDocumentPopularity,
  compareCatalogDocumentsByTitle,
  popularCatalogDocuments,
  relatedCatalogDocuments,
  searchCatalogDocuments,
  type CatalogCorpusOptions,
  type CatalogFacetKind,
  type CatalogRelationSource,
  type FacetCorpusCatalogOptions,
} from "./catalog.mjs";

export {
  publishedCorpusDocument,
  publishedCorpusDocuments,
  inferPublicationKind,
  slugifyPublicationPath,
  type PublishedCorpusDocumentsOptions,
} from "./publication.mjs";

export {
  locateDocumentType,
  claimDocumentType,
  projectDocumentType,
  buildBuiltinDocumentTypes,
  realizeDocumentType,
  auditDocumentType,
  type DocumentTypeOptions,
  type RealizeDocumentTypeOptions,
  type AuditDocumentTypeOptions,
} from "./document-types.mjs";
