// Hand-authored type declarations mirroring the JSON Schema contracts and
// runtime shapes in ../src/*.mjs. Written by hand (not derived through
// FromJsonSchema<typeof ...>) because this package ships plain .mjs, per
// this section's own convention (services/vault-compiler pairs .mjs source
// with hand-written .d.ts). Field-for-field, these mirror the shapes
// originally authored in metroplat's `src/integrations/knowledge-vaults/`.

// ── vault-note ────────────────────────────────────────────────────────────

export type ReferenceDialect = "csl" | "citekey-map" | "empty" | "none" | "mixed";

export interface VaultNoteReadRequest {
  readonly kind: "metroplat.knowledge-vault.note-read-request";
  readonly vaultRoot: string;
  readonly notePath: string;
}

export interface VaultInternalTarget {
  readonly field: string;
  readonly kind: "citation" | "relation";
  readonly value: string;
}

export interface VaultNoteProjection {
  readonly kind: "metroplat.knowledge-vault.note-projection";
  readonly vaultRoot: string;
  readonly notePath: string;
  readonly title: string;
  readonly format: "yaml" | "toml" | "none";
  readonly conformant: boolean;
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
  readonly assertionCount: number;
  readonly referenceDialect: ReferenceDialect;
  readonly references: readonly Record<string, unknown>[];
  readonly internalTargets: readonly VaultInternalTarget[];
  readonly citedReferenceIds: readonly string[];
}

export interface VaultNoteWriteRequest {
  readonly kind: "metroplat.knowledge-vault.note-write-request";
  readonly vaultRoot: string;
  readonly notePath: string;
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
  readonly normalizeReferences?: boolean;
}

export interface VaultNoteWriteReceipt {
  readonly kind: "metroplat.knowledge-vault.note-write-receipt";
  readonly vaultRoot: string;
  readonly notePath: string;
  readonly bytes: number;
  readonly referenceCount: number;
  readonly referenceDialect: ReferenceDialect;
}

export interface VaultReadRequest {
  readonly kind: "metroplat.knowledge-vault.read-request";
  readonly vaultRoot: string;
  readonly contentPath?: string;
}

export interface VaultIngestionProfileNoteIndexEntry {
  readonly path: string;
  readonly title: string;
  readonly url: string;
  readonly kind: "article" | "page";
  readonly linkCount: number;
  readonly unresolvedLinkCount: number;
  readonly referenceCount: number;
  readonly referenceDialect: ReferenceDialect;
}

export interface VaultNonConformingEntry {
  readonly path: string;
  readonly error: string;
}

export interface VaultIngestionProfile {
  readonly kind: "metroplat.knowledge-vault.ingestion-profile";
  readonly vaultRoot: string;
  readonly contentPath?: string;
  readonly files: number;
  readonly notes: number;
  readonly articles: number;
  readonly pages: number;
  readonly links: number;
  readonly unresolvedLinks: number;
  readonly referenceItems: number;
  readonly referencingNotes: number;
  readonly matter: Record<string, unknown>;
  readonly notesIndex: readonly VaultIngestionProfileNoteIndexEntry[];
  readonly nonConforming: readonly VaultNonConformingEntry[];
}

export interface VaultQueryRequest {
  readonly kind: "metroplat.knowledge-vault.query-request";
  readonly vaultRoot: string;
  readonly contentPath?: string;
  readonly entity?: string;
  readonly attribute?: string;
  readonly text?: string;
  readonly limit?: number;
}

export interface VaultQueryEavtRow {
  readonly e: unknown;
  readonly a: unknown;
  readonly v: unknown;
  readonly t: unknown;
}

export interface VaultQueryBodyMatch {
  readonly path: string;
  readonly count: number;
}

export interface VaultQueryResult {
  readonly kind: "metroplat.knowledge-vault.query-result";
  readonly vaultRoot: string;
  readonly contentPath?: string;
  readonly notes: number;
  readonly rows: number;
  readonly matchedRows: number;
  readonly returnedRows: number;
  readonly attributes: Record<string, number>;
  readonly results: readonly VaultQueryEavtRow[];
  readonly bodyMatches: readonly VaultQueryBodyMatch[];
  readonly nonConforming: readonly VaultNonConformingEntry[];
}

export declare const vaultNoteReadRequestSchema: Readonly<Record<string, unknown>>;
export declare const vaultNoteProjectionSchema: Readonly<Record<string, unknown>>;
export declare const vaultNoteWriteRequestSchema: Readonly<Record<string, unknown>>;
export declare const vaultNoteWriteReceiptSchema: Readonly<Record<string, unknown>>;
export declare const vaultReadRequestSchema: Readonly<Record<string, unknown>>;
export declare const vaultIngestionProfileSchema: Readonly<Record<string, unknown>>;
export declare const vaultQueryRequestSchema: Readonly<Record<string, unknown>>;
export declare const vaultQueryResultSchema: Readonly<Record<string, unknown>>;

export interface SchemaContract<T> {
  readonly kind: "schema-contract";
  readonly id: string;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly references: readonly SchemaContract<unknown>[];
  validate(candidate: unknown): boolean;
  assert(candidate: unknown, context?: string): T;
  errors(candidate: unknown): readonly string[];
}

export declare const vaultNoteReadRequestContract: SchemaContract<VaultNoteReadRequest>;
export declare const vaultNoteProjectionContract: SchemaContract<VaultNoteProjection>;
export declare const vaultNoteWriteRequestContract: SchemaContract<VaultNoteWriteRequest>;
export declare const vaultNoteWriteReceiptContract: SchemaContract<VaultNoteWriteReceipt>;
export declare const vaultReadRequestContract: SchemaContract<VaultReadRequest>;
export declare const vaultIngestionProfileContract: SchemaContract<VaultIngestionProfile>;
export declare const vaultQueryRequestContract: SchemaContract<VaultQueryRequest>;
export declare const vaultQueryResultContract: SchemaContract<VaultQueryResult>;

// ── vault-website-publish ────────────────────────────────────────────────

export interface VaultWebsitePublishRequest {
  readonly kind: "metroplat.vault-website-publish.publish-request";
  readonly vaultRoot: string;
  readonly outputRoot: string;
  readonly websiteUrl: string;
  readonly title: string;
  readonly description?: string;
  readonly language?: string;
  readonly author?: string;
  readonly websiteName?: string;
  readonly basePath?: string;
  readonly postsPath?: string;
  readonly includeDrafts?: boolean;
  readonly theme?: "living-web-indieweb" | false;
}

export interface VaultWebsitePublishReceipt {
  readonly kind: "metroplat.vault-website-publish.publish-receipt";
  readonly vaultRoot: string;
  readonly outputRoot: string;
  readonly contentFiles: number;
  readonly articles: number;
  readonly pages: number;
  readonly outputFiles: number;
  readonly paths: readonly string[];
}

export declare const vaultWebsitePublishRequestSchema: Readonly<Record<string, unknown>>;
export declare const vaultWebsitePublishReceiptSchema: Readonly<Record<string, unknown>>;
export declare const vaultWebsitePublishRequestContract: SchemaContract<VaultWebsitePublishRequest>;
export declare const vaultWebsitePublishReceiptContract: SchemaContract<VaultWebsitePublishReceipt>;

// ── diataxis ──────────────────────────────────────────────────────────────

export type DiataxisModeName = "tutorial" | "how-to" | "explanation" | "reference";

export interface ChargeValue {
  readonly kind: string;
  readonly name: string;
  readonly coordinates: readonly { readonly name: string }[];
}

export interface DiataxisMode {
  readonly kind: "diataxis.mode";
  readonly name: DiataxisModeName;
  readonly charge: ChargeValue;
  readonly application: boolean;
  readonly cognition: boolean;
}

export interface DiataxisDualityEdge {
  readonly kind: "diataxis.duality-edge";
  readonly duality: "lookup" | "doing" | "antipode";
  readonly from: DiataxisMode;
  readonly to: DiataxisMode;
}

export interface DiataxisReading {
  readonly kind: "diataxis.reading";
  readonly modes: readonly DiataxisMode[];
  readonly lookupDual: readonly DiataxisDualityEdge[];
  readonly doingDual: readonly DiataxisDualityEdge[];
  readonly antipode: readonly DiataxisDualityEdge[];
}

export interface DiataxisTextEvidence {
  readonly kind: "diataxis.text-evidence";
  readonly orderedStepLines: number;
  readonly codeBlockCount: number;
  readonly tableRowCount: number;
  readonly proseLineCount: number;
  readonly totalLineCount: number;
  readonly hasGoalFraming: boolean;
}

export interface DiataxisCoverageItem {
  readonly kind: "diataxis.coverage.item";
  readonly id: string;
  readonly mode: DiataxisModeName;
  readonly title?: string;
  readonly source?: string;
}

export interface DiataxisCoverageSurface {
  readonly kind: "diataxis.coverage.surface";
  readonly id: string;
  readonly items: readonly DiataxisCoverageItem[];
  readonly requiredModes?: readonly DiataxisModeName[];
}

export interface DiataxisCoverageModeRead {
  readonly kind: "diataxis.coverage.mode-classification";
  readonly mode: DiataxisModeName;
  readonly charge: string;
  readonly application: boolean;
  readonly cognition: boolean;
  readonly count: number;
  readonly loci: readonly string[];
}

export interface DiataxisCoverageFaceRead {
  readonly kind: "diataxis.coverage.face-read";
  readonly face: "diagonal" | "off-diagonal";
  readonly modes: readonly DiataxisModeName[];
  readonly count: number;
  readonly complete: boolean;
  readonly missing: readonly DiataxisModeName[];
  readonly loci: readonly string[];
}

export interface DiataxisCoverageWitness {
  readonly kind: "diataxis.coverage:witness";
  readonly surface: string;
  readonly requiredModes: readonly DiataxisModeName[];
  readonly itemCount: number;
  readonly diagonalComplete: boolean;
  readonly offDiagonalComplete: boolean;
}

export interface DiataxisCoverageObstruction {
  readonly kind: "diataxis.coverage-obstruction";
  readonly surface: string;
  readonly requiredModes: readonly DiataxisModeName[];
  readonly missingModes: readonly DiataxisModeName[];
  readonly diagonalComplete: boolean;
  readonly offDiagonalComplete: boolean;
}

export interface DiataxisCoverageClassification {
  readonly kind: "diataxis.coverage.classification";
  readonly surface: string;
  readonly itemCount: number;
  readonly requiredModes: readonly DiataxisModeName[];
  readonly coveredModes: readonly DiataxisModeName[];
  readonly missingModes: readonly DiataxisModeName[];
  readonly modes: readonly DiataxisCoverageModeRead[];
  readonly diagonal: DiataxisCoverageFaceRead;
  readonly offDiagonal: DiataxisCoverageFaceRead;
  readonly judgment: DiataxisCoverageWitness | DiataxisCoverageObstruction;
}

export declare const diataxisModeNames: readonly DiataxisModeName[];
export declare function isDiataxisModeName(value: string): value is DiataxisModeName;
export declare function asDiataxisModeName(value: string): DiataxisModeName;
export declare function diataxisMode(name: DiataxisModeName): DiataxisMode;
export declare const diataxisModes: readonly DiataxisMode[];
export declare function diataxisModeName(mode: DiataxisMode): DiataxisModeName;
export declare function chargeValueOfDiataxisMode(mode: DiataxisMode | DiataxisModeName): ChargeValue;
export declare function diataxisModeOfCharge(value: ChargeValue | string): DiataxisMode;
export declare function diataxisApplication(mode: DiataxisMode | DiataxisModeName): boolean;
export declare function diataxisCognition(mode: DiataxisMode | DiataxisModeName): boolean;
export declare function diataxisLookupDual(mode: DiataxisMode | DiataxisModeName): DiataxisMode;
export declare function diataxisDoingDual(mode: DiataxisMode | DiataxisModeName): DiataxisMode;
export declare function diataxisAntipode(mode: DiataxisMode | DiataxisModeName): DiataxisMode;
export declare function diataxisReading(): DiataxisReading;
export declare function diataxisTextEvidence(body: string): DiataxisTextEvidence;
export declare function diataxisModeOfText(body: string, explicitMode?: string): DiataxisModeName;
export declare function diataxisCoverageItem(
  mode: DiataxisModeName,
  id: string,
  options?: { readonly title?: string; readonly source?: string },
): DiataxisCoverageItem;
export declare function diataxisCoverageSurface(
  id: string,
  items: readonly DiataxisCoverageItem[],
  options?: { readonly requiredModes?: readonly DiataxisModeName[] },
): DiataxisCoverageSurface;
export declare function diataxisCoverageClassification(surface: DiataxisCoverageSurface): DiataxisCoverageClassification;
export declare function diataxisCoverageOfDocuments(
  id: string,
  documents: readonly { readonly path: string; readonly body: string; readonly title?: string; readonly explicitMode?: string }[],
  options?: { readonly requiredModes?: readonly DiataxisModeName[] },
): DiataxisCoverageClassification;

export declare const diataxisCoverageSurfaceContract: SchemaContract<DiataxisCoverageSurface>;
export declare const diataxisCoverageClassificationContract: SchemaContract<DiataxisCoverageClassification>;
