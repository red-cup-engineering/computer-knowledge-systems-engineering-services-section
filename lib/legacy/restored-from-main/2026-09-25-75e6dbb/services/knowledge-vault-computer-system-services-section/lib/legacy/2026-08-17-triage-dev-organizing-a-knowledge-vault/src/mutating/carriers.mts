/**
 * mutating/carriers  -  TypeBox carrier declarations for document mutations.
 */
import { carrierFrom } from "@emsenn/relating";

export const preparedDocumentSchema = { $id: "organizing/knowledge-vault/mutating/prepared-document", title: "PreparedDocument", description: "A prepared corpus document mutation, dry-run by default.", type: "object", required: ["kind", "path", "text", "written"], properties: { kind: { const: "organizing.knowledge-vault.mutating.prepared" }, path: { description: "the corpus-relative document path", type: "string" }, text: { description: "the prepared markdown document text", type: "string" }, written: { description: "whether the prepared document was written to disk", type: "boolean" } }, additionalProperties: false } as const;

export const preparedDocumentCarrier = carrierFrom(preparedDocumentSchema);

export interface PreparedDocument {
  readonly kind: "organizing.knowledge-vault.mutating.prepared";
  readonly path: string;
  readonly text: string;
  readonly written: boolean;
}

export const triageUploadSchema = { $id: "organizing/knowledge-vault/mutating/triage-upload", title: "TriageUpload", description: "A prepared or written triage file deposit under `_triage/YYYY/MM/DD/`.", type: "object", required: ["kind", "path", "bytes", "written"], properties: { kind: { const: "organizing.knowledge-vault.mutating.triage-upload" }, path: { description: "the corpus-relative triage markdown path", type: "string" }, bytes: { minimum: 0, description: "the byte length of the uploaded content", type: "integer" }, written: { description: "whether the triage file was written to disk", type: "boolean" } }, additionalProperties: false } as const;

export const triageUploadCarrier = carrierFrom(triageUploadSchema);

export interface TriageUpload {
  readonly kind: "organizing.knowledge-vault.mutating.triage-upload";
  readonly path: string;
  readonly bytes: number;
  readonly written: boolean;
}

export const triageBatchUploadSchema = { $id: "organizing/knowledge-vault/mutating/triage-batch-upload", title: "TriageBatchUpload", description: "A batch of prepared or written triage file deposits.", type: "object", required: ["kind", "files", "count", "bytes", "written"], properties: { kind: { const: "organizing.knowledge-vault.mutating.triage-batch-upload" }, files: { description: "the prepared or written triage files", type: "array", items: { additionalProperties: false, type: "object", required: ["kind", "path", "bytes", "written"], properties: { kind: { const: "organizing.knowledge-vault.mutating.triage-upload" }, path: { type: "string" }, bytes: { minimum: 0, type: "integer" }, written: { type: "boolean" } } } }, count: { minimum: 0, type: "integer" }, bytes: { minimum: 0, type: "integer" }, written: { type: "boolean" } }, additionalProperties: false } as const;

export const triageBatchUploadCarrier = carrierFrom(triageBatchUploadSchema);

export interface TriageBatchUpload {
  readonly kind: "organizing.knowledge-vault.mutating.triage-batch-upload";
  readonly files: ReadonlyArray<TriageUpload>;
  readonly count: number;
  readonly bytes: number;
  readonly written: boolean;
}

const relationalHullStage0BoundaryFileSchema = { additionalProperties: false, type: "object", required: ["kind", "stage", "boundary", "path", "name", "bytes", "modifiedAt"], properties: { kind: { const: "organizing.knowledge-vault.mutating.relational-hull-stage0-boundary-file" }, stage: { const: 0 }, boundary: { const: "content/triaging/inbox" }, path: { description: "the kernel-root-relative path of the admitted stage-0 boundary file", type: "string" }, name: { description: "the filesystem basename of the boundary file", type: "string" }, bytes: { minimum: 0, type: "integer" }, modifiedAt: { description: "the file mtime as an ISO timestamp", type: "string" }, mediaType: { type: "string" }, written: { type: "boolean" } } } as const;

export const relationalHullStage0BoundaryFileCarrier = carrierFrom({ ...relationalHullStage0BoundaryFileSchema, $id: "organizing/knowledge-vault/mutating/relational-hull-stage0-boundary-file", title: "RelationalHullStage0BoundaryFile", description: "One file admitted at a kernel's stage-0 relational-hull boundary: `content/triaging/inbox/`." } as const);

export interface RelationalHullStage0BoundaryFile {
  readonly kind: "organizing.knowledge-vault.mutating.relational-hull-stage0-boundary-file";
  readonly stage: 0;
  readonly boundary: "content/triaging/inbox";
  readonly path: string;
  readonly name: string;
  readonly bytes: number;
  readonly modifiedAt: string;
  readonly mediaType?: string;
  readonly written?: boolean;
}

export const relationalHullStage0BoundarySchema = { $id: "organizing/knowledge-vault/mutating/relational-hull-stage0-boundary", title: "RelationalHullStage0Boundary", description: "The stage-0 boundary carrier for a kernel relational hull: files under `content/triaging/inbox/`.", type: "object", required: ["kind", "stage", "boundary", "root", "present", "total", "truncated", "files"], properties: { kind: { const: "organizing.knowledge-vault.mutating.relational-hull-stage0-boundary" }, stage: { const: 0 }, boundary: { const: "content/triaging/inbox" }, root: { description: "the kernel root whose content/triaging/inbox boundary was read", type: "string" }, present: { description: "whether the boundary directory exists", type: "boolean" }, total: { minimum: 0, type: "integer" }, truncated: { type: "boolean" }, files: { type: "array", items: relationalHullStage0BoundaryFileSchema } }, additionalProperties: false } as const;

export const relationalHullStage0BoundaryCarrier = carrierFrom(relationalHullStage0BoundarySchema);

export interface RelationalHullStage0Boundary {
  readonly kind: "organizing.knowledge-vault.mutating.relational-hull-stage0-boundary";
  readonly stage: 0;
  readonly boundary: "content/triaging/inbox";
  readonly root: string;
  readonly present: boolean;
  readonly total: number;
  readonly truncated: boolean;
  readonly files: ReadonlyArray<RelationalHullStage0BoundaryFile>;
}

const publishCommandSchema = { additionalProperties: false, type: "object", required: ["label", "cwd", "command"], properties: { label: { type: "string" }, cwd: { type: "string" }, command: { type: "string" } } } as const;

const publishStepSchema = { additionalProperties: false, type: "object", required: ["label", "purpose", "commands"], properties: { label: { type: "string" }, purpose: { type: "string" }, commands: { type: "array", items: publishCommandSchema } } } as const;

export const staticSitePublishPlanSchema = { $id: "organizing/knowledge-vault/mutating/static-site-publish-plan", title: "StaticSitePublishPlan", description: "A dry-run-first plan for publishing a knowledge vault as static HTML through a downstream site repository.", type: "object", required: ["kind", "root", "site", "baseUrl", "siteRoot", "outDir", "branch", "commitMessage", "dryRun", "artifactPaths", "steps"], properties: { kind: { const: "organizing.knowledge-vault.mutating.static-site-publish-plan" }, root: { description: "the admitted knowledge-vault root", type: "string" }, site: { description: "the downstream site or host being published", type: "string" }, baseUrl: { description: "the public base URL for the staged/static site", type: "string" }, siteRoot: { description: "the repository path whose scripts render the static site", type: "string" }, outDir: { description: "the static HTML output directory", type: "string" }, branch: { description: "the git branch or deployment branch expected by the publisher", type: "string" }, commitMessage: { description: "the suggested commit message for the publish run", type: "string" }, dryRun: { type: "boolean" }, artifactPaths: { type: "array", items: { type: "string" } }, steps: { type: "array", items: publishStepSchema } }, additionalProperties: false } as const;

export const staticSitePublishPlanCarrier = carrierFrom(staticSitePublishPlanSchema);

export interface StaticSitePublishCommand {
  readonly label: string;
  readonly cwd: string;
  readonly command: string;
}

export interface StaticSitePublishStep {
  readonly label: string;
  readonly purpose: string;
  readonly commands: ReadonlyArray<StaticSitePublishCommand>;
}

export interface StaticSitePublishPlan {
  readonly kind: "organizing.knowledge-vault.mutating.static-site-publish-plan";
  readonly root: string;
  readonly site: string;
  readonly baseUrl: string;
  readonly siteRoot: string;
  readonly outDir: string;
  readonly branch: string;
  readonly commitMessage: string;
  readonly dryRun: boolean;
  readonly artifactPaths: ReadonlyArray<string>;
  readonly steps: ReadonlyArray<StaticSitePublishStep>;
}

const documentPreparationLintSchema = { additionalProperties: false, type: "object", required: ["severity", "rule", "message"], properties: { severity: { anyOf: [{ const: "error" }, { const: "warning" }, { const: "info" }] }, rule: { type: "string" }, message: { type: "string" } } } as const;

export const documentPreparationSchema = { $id: "organizing/knowledge-vault/mutating/document-preparation", title: "DocumentPreparation", description: "A prepared content-corpus document with placement, frontmatter, reference, and conformance lint.", type: "object", required: ["kind", "topic", "documentKind", "path", "targetPath", "exists", "frontmatter", "references", "text", "lint"], properties: { kind: { const: "organizing.knowledge-vault.mutating.document-preparation" }, topic: { type: "string" }, documentKind: { anyOf: [{ const: "explanation" }, { const: "term" }, { const: "guide" }, { const: "reference" }, { const: "specification" }, { const: "tutorial" }] }, path: { type: "string" }, targetPath: { type: "string" }, exists: { type: "boolean" }, frontmatter: { type: "object", additionalProperties: {} }, references: { type: "array", items: { type: "object", additionalProperties: {} } }, text: { type: "string" }, lint: { type: "array", items: documentPreparationLintSchema } }, additionalProperties: false } as const;

export const documentPreparationCarrier = carrierFrom(documentPreparationSchema);

export type DocumentOperationKind = "explanation" | "term" | "guide" | "reference" | "specification" | "tutorial";

export type DocumentPreparationLint = Readonly<{
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
}>;

export interface DocumentPreparation {
  readonly kind: "organizing.knowledge-vault.mutating.document-preparation";
  readonly topic: string;
  readonly documentKind: DocumentOperationKind;
  readonly path: string;
  readonly targetPath: string;
  readonly exists: boolean;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly references: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly text: string;
  readonly lint: readonly DocumentPreparationLint[];
}

const documentMutationFindingSchema = { additionalProperties: true, type: "object", required: ["rule", "severity", "message"], properties: { path: { type: "string" }, rule: { type: "string" }, severity: { anyOf: [{ const: "error" }, { const: "warning" }, { const: "info" }] }, message: { type: "string" } } } as const;

const documentReferenceMutationSchema = { additionalProperties: false, type: "object", required: ["beforeDialect", "itemCount"], properties: { beforeDialect: { type: "string" }, itemCount: { minimum: 0, type: "integer" }, afterDialect: { type: "string" }, canonical: { type: "boolean" }, normalizeRequested: { type: "boolean" }, replacementRequested: { type: "boolean" }, preserved: { type: "boolean" } } } as const;

export const documentFrontmatterMutationSchema = { $id: "organizing/knowledge-vault/mutating/document-frontmatter-mutation", title: "DocumentFrontmatterMutation", description: "A prepared or written corpus document frontmatter mutation.", type: "object", required: ["kind", "path", "dryRun", "written", "frontmatter", "findings", "references", "text"], properties: { kind: { const: "organizing.knowledge-vault.mutating.document-frontmatter-mutation" }, path: { type: "string" }, dryRun: { type: "boolean" }, written: { type: "boolean" }, frontmatter: { type: "object", additionalProperties: {} }, findings: { type: "array", items: documentMutationFindingSchema }, references: documentReferenceMutationSchema, text: { type: "string" } }, additionalProperties: false } as const;

export const documentFrontmatterMutationCarrier = carrierFrom(documentFrontmatterMutationSchema);

export const documentBodyMutationSchema = { $id: "organizing/knowledge-vault/mutating/document-body-mutation", title: "DocumentBodyMutation", description: "A prepared or written corpus document body mutation.", type: "object", required: ["kind", "path", "dryRun", "written", "frontmatter", "findings", "references", "text"], properties: { kind: { const: "organizing.knowledge-vault.mutating.document-body-mutation" }, path: { type: "string" }, dryRun: { type: "boolean" }, written: { type: "boolean" }, frontmatter: { type: "object", additionalProperties: {} }, findings: { type: "array", items: documentMutationFindingSchema }, references: documentReferenceMutationSchema, text: { type: "string" } }, additionalProperties: false } as const;

export const documentBodyMutationCarrier = carrierFrom(documentBodyMutationSchema);

export type DocumentReferenceMutation = Readonly<{
  beforeDialect: string;
  itemCount: number;
  afterDialect?: string;
  canonical?: boolean;
  normalizeRequested?: boolean;
  replacementRequested?: boolean;
  preserved?: boolean;
}>;

export type DocumentMutationFinding = Readonly<{
  path?: string;
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
}>;

export interface DocumentFrontmatterMutation {
  readonly kind: "organizing.knowledge-vault.mutating.document-frontmatter-mutation";
  readonly path: string;
  readonly dryRun: boolean;
  readonly written: boolean;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly findings: readonly DocumentMutationFinding[];
  readonly references: DocumentReferenceMutation;
  readonly text: string;
}

export interface DocumentBodyMutation {
  readonly kind: "organizing.knowledge-vault.mutating.document-body-mutation";
  readonly path: string;
  readonly dryRun: boolean;
  readonly written: boolean;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly findings: readonly DocumentMutationFinding[];
  readonly references: DocumentReferenceMutation;
  readonly text: string;
}

const normalizationFindingSchema = { additionalProperties: true, type: "object", required: ["rule", "severity", "message"], properties: { path: { type: "string" }, rule: { type: "string" }, severity: { anyOf: [{ const: "error" }, { const: "warning" }, { const: "info" }] }, message: { type: "string" } } } as const;

const normalizationItemSchema = { additionalProperties: false, type: "object", required: ["kind", "path", "rule", "severity", "action", "reason", "source"], properties: { kind: { const: "organizing.knowledge-vault.mutating.normalization-item" }, path: { type: "string" }, rule: { type: "string" }, severity: { anyOf: [{ const: "error" }, { const: "warning" }, { const: "info" }] }, action: { anyOf: [{ const: "repair-frontmatter" }, { const: "add-title" }, { const: "add-tags-list" }, { const: "move-field-values-to-tags" }, { const: "rewrite-field" }, { const: "rename-key" }, { const: "split-field" }, { const: "add-field" }, { const: "resolve-conflict" }, { const: "normalize-references" }, { const: "review-reference" }, { const: "review-finding" }] }, field: { type: "string" }, current: {}, target: {}, reason: { type: "string" }, source: { anyOf: [{ const: "finding" }, { const: "missing-title" }, { const: "missing-tags" }, { const: "frontmatter-normalization" }] }, finding: normalizationFindingSchema } } as const;

export const normalizationPlanSchema = { $id: "organizing/knowledge-vault/mutating/normalization-plan", title: "NormalizationPlan", description: "A dry-run plan of frontmatter/document mutations for a corpus-backed memorystore.", type: "object", required: ["kind", "root", "documents", "items", "byRule"], properties: { kind: { const: "organizing.knowledge-vault.mutating.normalization-plan" }, root: { description: "the admitted memorystore root", type: "string" }, documents: { minimum: 0, type: "integer" }, items: { type: "array", items: normalizationItemSchema }, byRule: { type: "array", items: { additionalProperties: false, type: "object", required: ["rule", "count"], properties: { rule: { type: "string" }, count: { minimum: 0, type: "integer" } } } } }, additionalProperties: false } as const;

export const normalizationPlanCarrier = carrierFrom(normalizationPlanSchema);

export type NormalizationAction =
  | "repair-frontmatter"
  | "add-title"
  | "add-tags-list"
  | "move-field-values-to-tags"
  | "rewrite-field"
  | "rename-key"
  | "split-field"
  | "add-field"
  | "resolve-conflict"
  | "normalize-references"
  | "review-reference"
  | "review-finding";

export interface NormalizationItem {
  readonly kind: "organizing.knowledge-vault.mutating.normalization-item";
  readonly path: string;
  readonly rule: string;
  readonly severity: "error" | "warning" | "info";
  readonly action: NormalizationAction;
  readonly field?: string;
  readonly current?: unknown;
  readonly target?: unknown;
  readonly reason: string;
  readonly source: "finding" | "missing-title" | "missing-tags" | "frontmatter-normalization";
  readonly finding?: unknown;
}

export interface NormalizationPlan {
  readonly kind: "organizing.knowledge-vault.mutating.normalization-plan";
  readonly root: string;
  readonly documents: number;
  readonly items: ReadonlyArray<NormalizationItem>;
  readonly byRule: ReadonlyArray<Readonly<{ rule: string; count: number }>>;
}

const topicScaffoldSchema = { additionalProperties: false, type: "object", required: ["kind", "path", "title", "type", "frontMatter", "body", "sourcePaths"], properties: { kind: { anyOf: [{ const: "term" }, { const: "introduction" }, { const: "guide" }] }, path: { type: "string" }, title: { type: "string" }, type: { type: "string" }, frontMatter: { type: "object", additionalProperties: {} }, body: { type: "string" }, sourcePaths: { type: "array", items: { type: "string" } } } } as const;

const topicSuggestedActionSchema = { additionalProperties: false, type: "object", required: ["kind", "reason", "payload"], properties: { kind: { type: "string" }, reason: { type: "string" }, payload: { type: "object", additionalProperties: {} } } } as const;

const topicPathRecordSchema = { additionalProperties: false, type: "object", required: ["path", "role"], properties: { path: { type: "string" }, role: { type: "string" } } } as const;

const topicGapAxisSchema = { additionalProperties: false, type: "object", required: ["axis", "status"], properties: { axis: { type: "string" }, status: { type: "string" } } } as const;

const memoryHealthDashboardSchema = { additionalProperties: false, type: "object", required: ["kind", "documents", "withFrontMatter", "withoutFrontMatter", "unreadableFrontMatter", "withTitle", "withoutUsableTitle", "findingRules"], properties: { kind: { const: "organizing.knowledge-vault.holography.memory-health-dashboard" }, documents: { minimum: 0, type: "integer" }, withFrontMatter: { minimum: 0, type: "integer" }, withoutFrontMatter: { minimum: 0, type: "integer" }, unreadableFrontMatter: { minimum: 0, type: "integer" }, withTitle: { minimum: 0, type: "integer" }, withoutUsableTitle: { minimum: 0, type: "integer" }, findingRules: { type: "array", items: { additionalProperties: false, type: "object", required: ["rule", "count"], properties: { rule: { type: "string" }, count: { minimum: 0, type: "integer" } } } } } } as const;

export const topicGuidanceSchema = { $id: "organizing/knowledge-vault/mutating/topic-guidance", title: "TopicGuidance", description: "Corpus-placement guidance for a topic over an admitted memorystore.", type: "object", required: ["kind", "topic", "slug", "targetRoot", "documentsInspected", "gaps", "gapAxes", "suggestedTargetPaths", "suggestedScaffolds", "suggestedActions", "normalizationItems"], properties: { kind: { const: "organizing.knowledge-vault.mutating.topic-guidance" }, topic: { type: "string" }, slug: { type: "string" }, targetRoot: { type: "string" }, documentsInspected: { minimum: 0, type: "integer" }, gaps: { type: "array", items: { type: "string" } }, gapAxes: { type: "array", items: topicGapAxisSchema }, suggestedTargetPaths: { type: "array", items: { type: "string" } }, suggestedScaffolds: { type: "array", items: topicScaffoldSchema }, suggestedActions: { type: "array", items: topicSuggestedActionSchema }, normalizationItems: { minimum: 0, type: "integer" } }, additionalProperties: false } as const;

export const topicGuidanceCarrier = carrierFrom(topicGuidanceSchema);

export const topicInspectionSchema = { $id: "organizing/knowledge-vault/mutating/topic-inspection", title: "TopicInspectionPlan", description: "A corpus topic inspection projected with knowledge-vault placement and health dashboards.", type: "object", required: ["kind", "topic", "admittedPaths", "dashboard", "carrierReadings"], properties: { kind: { const: "organizing.knowledge-vault.mutating.topic-inspection" }, topic: { type: "string" }, admittedPaths: { type: "array", items: { type: "string" } }, dashboard: { additionalProperties: false, type: "object", required: ["admittedPaths", "gaps", "conceptHomes", "exactTitleMatches", "pathMatches", "suggestedTargetPaths", "suggestedScaffolds", "suggestedActions", "health"], properties: { admittedPaths: { type: "array", items: { type: "string" } }, gaps: { type: "array", items: { type: "string" } }, conceptHomes: { type: "array", items: topicPathRecordSchema }, exactTitleMatches: { type: "array", items: topicPathRecordSchema }, pathMatches: { type: "array", items: topicPathRecordSchema }, suggestedTargetPaths: { type: "array", items: { type: "string" } }, suggestedScaffolds: { type: "array", items: topicScaffoldSchema }, suggestedActions: { type: "array", items: topicSuggestedActionSchema }, health: memoryHealthDashboardSchema } }, carrierReadings: { type: "object", additionalProperties: {} } }, additionalProperties: false } as const;

export const topicInspectionCarrier = carrierFrom(topicInspectionSchema);

export const topicGapMeasurementSchema = { $id: "organizing/knowledge-vault/mutating/topic-gap-measurement", title: "TopicGapMeasurementPlan", description: "A topic gap measurement projected with knowledge-vault guidance.", type: "object", required: ["kind", "topic", "admittedPaths", "dashboard", "carrierReading", "guidance"], properties: { kind: { const: "organizing.knowledge-vault.mutating.topic-gap-measurement" }, topic: { type: "string" }, admittedPaths: { type: "array", items: { type: "string" } }, dashboard: { additionalProperties: false, type: "object", required: ["admittedPaths", "documentsInspected", "measurement", "axes", "gaps", "suggestedActions", "sampleScaffolds"], properties: { admittedPaths: { type: "array", items: { type: "string" } }, documentsInspected: { minimum: 0, type: "integer" }, measurement: { additionalProperties: false, type: "object", required: ["conceptHomes", "conformanceFindings"], properties: { conceptHomes: { minimum: 0, type: "integer" }, conformanceFindings: { minimum: 0, type: "integer" } } }, axes: { type: "array", items: topicGapAxisSchema }, gaps: { type: "array", items: { type: "string" } }, suggestedActions: { type: "array", items: topicSuggestedActionSchema }, sampleScaffolds: { type: "array", items: topicScaffoldSchema } } }, carrierReading: {}, guidance: { additionalProperties: true, type: "object", required: ["kind"], properties: { kind: { const: "organizing.knowledge-vault.mutating.topic-guidance" } } } }, additionalProperties: false } as const;

export const topicGapMeasurementCarrier = carrierFrom(topicGapMeasurementSchema);

const conceptMapResourceSchema = { additionalProperties: false, type: "object", required: ["path", "title", "kind", "role", "tags", "aliases"], properties: { path: { type: "string" }, title: { type: "string" }, kind: { type: "string" }, role: { type: "string" }, tags: { type: "array", items: { type: "string" } }, aliases: { type: "array", items: { type: "string" } }, description: { type: "string" } } } as const;

const conceptMapResourceGroupsSchema = { additionalProperties: false, type: "object", required: ["terms", "guides", "explanations", "references", "specifications", "sourceDocuments", "other"], properties: { terms: { type: "array", items: conceptMapResourceSchema }, guides: { type: "array", items: conceptMapResourceSchema }, explanations: { type: "array", items: conceptMapResourceSchema }, references: { type: "array", items: conceptMapResourceSchema }, specifications: { type: "array", items: conceptMapResourceSchema }, sourceDocuments: { type: "array", items: conceptMapResourceSchema }, other: { type: "array", items: conceptMapResourceSchema } } } as const;

export const topicConceptMapSchema = { $id: "organizing/knowledge-vault/mutating/topic-concept-map", title: "TopicConceptMap", description: "A topic concept map over an admitted corpus memorystore.", type: "object", required: ["kind", "topic", "admittedPaths", "dashboard", "resources", "carrierReadings"], properties: { kind: { const: "organizing.knowledge-vault.mutating.topic-concept-map" }, topic: { type: "string" }, admittedPaths: { type: "array", items: { type: "string" } }, dashboard: { additionalProperties: false, type: "object", required: ["admittedPaths", "resourcesByKind", "topTags", "conceptHomes", "pathMatches", "gaps", "gapAxes", "suggestedActions", "suggestedScaffolds", "health"], properties: { admittedPaths: { type: "array", items: { type: "string" } }, resourcesByKind: { type: "array", items: { additionalProperties: false, type: "object", required: ["kind", "count"], properties: { kind: { type: "string" }, count: { minimum: 0, type: "integer" } } } }, topTags: { type: "array", items: { additionalProperties: false, type: "object", required: ["tag", "count"], properties: { tag: { type: "string" }, count: { minimum: 0, type: "integer" } } } }, conceptHomes: { type: "array", items: topicPathRecordSchema }, pathMatches: { type: "array", items: topicPathRecordSchema }, gaps: { type: "array", items: { type: "string" } }, gapAxes: { type: "array", items: topicGapAxisSchema }, suggestedActions: { type: "array", items: topicSuggestedActionSchema }, suggestedScaffolds: { type: "array", items: topicScaffoldSchema }, health: memoryHealthDashboardSchema } }, resources: conceptMapResourceGroupsSchema, carrierReadings: { type: "object", additionalProperties: {} } }, additionalProperties: false } as const;

export const topicConceptMapCarrier = carrierFrom(topicConceptMapSchema);

export interface TopicScaffold {
  readonly kind: "term" | "introduction" | "guide";
  readonly path: string;
  readonly title: string;
  readonly type: string;
  readonly frontMatter: Readonly<Record<string, unknown>>;
  readonly body: string;
  readonly sourcePaths: ReadonlyArray<string>;
}

export interface TopicSuggestedAction {
  readonly kind: string;
  readonly reason: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface TopicGuidance {
  readonly kind: "organizing.knowledge-vault.mutating.topic-guidance";
  readonly topic: string;
  readonly slug: string;
  readonly targetRoot: string;
  readonly documentsInspected: number;
  readonly gaps: ReadonlyArray<string>;
  readonly gapAxes: ReadonlyArray<Readonly<{ axis: string; status: string }>>;
  readonly suggestedTargetPaths: ReadonlyArray<string>;
  readonly suggestedScaffolds: ReadonlyArray<TopicScaffold>;
  readonly suggestedActions: ReadonlyArray<TopicSuggestedAction>;
  readonly normalizationItems: number;
}
