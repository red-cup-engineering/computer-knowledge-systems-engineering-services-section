/**
 * Emsenn knowledge-vault boundary adapters.
 *
 * Category map:
 * - Package subcategory: research-site adapters over addressed markdown corpus roots.
 * - Domain object: bounded corpus, boundary, and persistence requests.
 * - Codomain object: addressed documents, boundary observations, normalization
 *   effects, and fact snapshots.
 *
 * Corpus, memory, mutation, and holography work lives downstream in
 * `@emsenn/organizing-a-knowledge-vault`.
 */

export {
  createCorpusClientForRoot,
  type CorpusClient,
} from "./corpus-client.mts";

export {
  type CorpusOperationResult,
} from "./corpus-operations.mts";

export {
  findKnowledgeVaultName,
  type FindNameMatch,
  type FindNameRequest,
  type FindNameResult,
} from "./find-name.mts";

export {
  grepKnowledgeVaultText,
  type GrepTextHit,
  type GrepTextRequest,
  type GrepTextResult,
} from "./grep-text.mts";

export {
  collectKnowledgeVaultMarkdownPaths,
  listKnowledgeVaultPath,
  type MarkdownPathCollectionResult,
  type ListPathEntry,
  type ListPathRequest,
  type ListPathResult,
} from "./list-path.mts";

export {
  corpusCatalog,
  corpusFacet,
  popularCorpusDocuments,
  relatedCorpusDocuments,
  searchCorpusCatalogView,
  compareCorpusDocumentsByTitle,
  type CorpusCatalogView,
  type CorpusCatalogDocument,
  type CorpusCatalogGroup,
  type CorpusCatalogRequest,
  type CorpusFacetKind,
  type CorpusFacetRequest,
  type CorpusFacetResult,
} from "./corpus-catalog.mts";

export {
  directoryGraphSvg,
  type DirectoryGraphEdge,
  type DirectoryGraphNode,
} from "./directory-graph-svg.mts";

export {
  knowledgeVaultBacklinkQueries,
  readKnowledgeVaultDocument,
  type ReadRequest,
  type ReadResult,
} from "./read-file.mts";

export {
  callKnowledgeVaultBoundary,
  knowledgeVaultConceptMap,
  knowledgeVaultHealth,
  knowledgeVaultInspectTopic,
  knowledgeVaultMeasureGap,
  knowledgeVaultNormalizationPlan,
  knowledgeVaultNormalize,
  type KnowledgeVaultBoundaryOperation,
} from "./knowledge-vault-boundary.mts";

export {
  assertAndFold,
  assertFacts,
  foldFacts,
  readFacts,
  type FactSnapshot,
} from "./triple-store.mts";

export {
  emsennContentRoot,
  emsennDataRoot,
} from "./content-root.mts";

export {
  uploadTriageFile,
  uploadTriageFiles,
  type UploadTriageFileInput,
  type UploadTriageFileRequest,
  type UploadTriageFileResult,
  type UploadTriageFilesResult,
} from "./upload-triage-file.mts";
