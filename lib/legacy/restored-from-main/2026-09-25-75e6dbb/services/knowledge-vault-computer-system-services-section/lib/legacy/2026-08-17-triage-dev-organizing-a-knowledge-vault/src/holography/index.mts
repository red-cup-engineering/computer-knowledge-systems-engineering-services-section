/**
 * holography  -  readable projections of corpus memorystore carriers.
 *
 * These folds are deliberately transport-neutral: web/MCP/script adapters can
 * render them however they like, while the package owns the stable projection
 * from knowing memory and knowledge-vault mutation carriers.
 */
import { inspectMemoryHealth, type MemoryCarrier, type MemoryHealth } from "@emsenn/knowing/memory";
import { carrierFrom } from "@emsenn/relating";
import type { NormalizationPlan } from "../mutating/carriers.mjs";

const memoryHealthDashboardSchema = { additionalProperties: false, type: "object", required: ["kind", "documents", "withFrontMatter", "withoutFrontMatter", "unreadableFrontMatter", "withTitle", "withoutUsableTitle", "findingRules"], properties: { kind: { const: "organizing.knowledge-vault.holography.memory-health-dashboard" }, documents: { minimum: 0, type: "integer" }, withFrontMatter: { minimum: 0, type: "integer" }, withoutFrontMatter: { minimum: 0, type: "integer" }, unreadableFrontMatter: { minimum: 0, type: "integer" }, withTitle: { minimum: 0, type: "integer" }, withoutUsableTitle: { minimum: 0, type: "integer" }, findingRules: { type: "array", items: { additionalProperties: false, type: "object", required: ["rule", "count"], properties: { rule: { type: "string" }, count: { minimum: 0, type: "integer" } } } } } } as const;

export const memoryHealthProjectionSchema = { $id: "organizing/knowledge-vault/holography/memory-health", title: "MemoryHealthProjection", description: "A corpus memorystore health projection with a readable dashboard and upstream carrier evidence.", type: "object", required: ["kind", "admittedPaths", "dashboard", "carrierReading"], properties: { kind: { const: "organizing.knowledge-vault.holography.memory-health" }, admittedPaths: { type: "array", items: { type: "string" } }, dashboard: memoryHealthDashboardSchema, carrierReading: {} }, additionalProperties: false } as const;

export const memoryHealthProjectionCarrier = carrierFrom(memoryHealthProjectionSchema);

export interface MemoryHealthDashboard {
  readonly kind: "organizing.knowledge-vault.holography.memory-health-dashboard";
  readonly documents: number;
  readonly withFrontMatter: number;
  readonly withoutFrontMatter: number;
  readonly unreadableFrontMatter: number;
  readonly withTitle: number;
  readonly withoutUsableTitle: number;
  readonly findingRules: ReadonlyArray<Readonly<{ rule: string; count: number }>>;
}

export interface MemoryHealthProjection {
  readonly kind: "organizing.knowledge-vault.holography.memory-health";
  readonly admittedPaths: readonly string[];
  readonly dashboard: MemoryHealthDashboard;
  readonly carrierReading: MemoryHealth;
}

export interface NormalizationPlanDashboard {
  readonly kind: "organizing.knowledge-vault.holography.normalization-plan-dashboard";
  readonly documents: number;
  readonly items: number;
  readonly byRule: NormalizationPlan["byRule"];
  readonly repairs: ReadonlyArray<NormalizationPlan["items"][number]>;
}

export function memoryHealthProjection(memory: MemoryCarrier): MemoryHealthProjection {
  const health = inspectMemoryHealth(memory);
  return Object.freeze({
    kind: "organizing.knowledge-vault.holography.memory-health" as const,
    admittedPaths: Object.freeze(memory.documents.map((document) => document.path)),
    dashboard: memoryHealthDashboard(health),
    carrierReading: health,
  });
}

export function memoryHealthDashboard(health: MemoryHealth): MemoryHealthDashboard {
  const documents = health.documents;
  return Object.freeze({
    kind: "organizing.knowledge-vault.holography.memory-health-dashboard" as const,
    documents,
    withFrontMatter: health.withFrontMatter,
    withoutFrontMatter: Math.max(0, documents - health.withFrontMatter),
    unreadableFrontMatter: health.conformance.errors,
    withTitle: health.withTitle,
    withoutUsableTitle: Math.max(0, documents - health.withTitle),
    findingRules: Object.freeze([
      Object.freeze({ rule: "errors", count: health.conformance.errors }),
      Object.freeze({ rule: "warnings", count: health.conformance.warnings }),
      Object.freeze({ rule: "info", count: health.conformance.info }),
    ]),
  });
}

export function normalizationPlanDashboard(plan: NormalizationPlan, limit = 80): NormalizationPlanDashboard {
  return Object.freeze({
    kind: "organizing.knowledge-vault.holography.normalization-plan-dashboard" as const,
    documents: plan.documents,
    items: plan.items.length,
    byRule: plan.byRule,
    repairs: Object.freeze(plan.items.slice(0, Math.max(0, Math.trunc(limit)))),
  });
}
