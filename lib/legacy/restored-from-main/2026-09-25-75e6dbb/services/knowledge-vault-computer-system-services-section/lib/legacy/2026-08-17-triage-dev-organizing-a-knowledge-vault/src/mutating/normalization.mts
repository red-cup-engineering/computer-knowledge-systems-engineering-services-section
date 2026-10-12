/**
 * mutating/normalization  -  dry-run plans for corpus memorystore cleanup.
 *
 * The planner consumes admitted knowing memory. It does not discover files and it
 * does not write: discovery belongs to corpus admission, while application goes
 * through explicit frontmatter/document mutations.
 */
import type { MemoryCarrier } from "@emsenn/knowing/memory";
import type { NormalizationItem, NormalizationPlan } from "./carriers.mjs";

type MemoryDocument = MemoryCarrier["documents"][number];
type MemoryFinding = MemoryDocument["findings"][number];

export type FrontmatterOperation = Readonly<{
  path: string;
  set?: Readonly<Record<string, unknown>>;
  unset?: readonly string[];
  addTags?: readonly string[];
  removeTags?: readonly string[];
  normalizeReferences?: boolean;
  dryRun: boolean;
}>;

export type PreparedNormalizationOperation = Readonly<{
  item: NormalizationItem;
  operation?: FrontmatterOperation;
  review?: Readonly<{ reason: string }>;
}>;

export type NormalizationEndomorphismName = "identity" | "fold-genre-vocabulary";

export type NormalizationEndomorphism = Readonly<{
  kind: "organizing.knowledge-vault.mutating.normalization-endomorphism";
  name: NormalizationEndomorphismName;
  memory: MemoryCarrier;
  plan: NormalizationPlan;
}>;

export type PrepareNormalizationOperationsOptions = Readonly<{
  dryRun?: boolean;
  rule?: string;
}>;

const NONSTANDARD_RELATION_FIELDS: readonly string[] = Object.freeze([
  "chapters",
  "cites",
  "closes",
  "component-of",
  "contrasts-with",
  "depends-on",
  "derived_from",
  "derives-from",
  "discusses",
  "enables",
  "explores",
  "extends",
  "instantiated-by",
  "instantiates",
  "introduces",
  "part-of",
  "realizes",
  "recaps",
  "requires",
  "see-also",
  "sources",
]);

export function planMemoryNormalization(memory: MemoryCarrier): NormalizationPlan {
  const items: NormalizationItem[] = [];
  for (const document of memory.documents) {
    if (!hasUsableFrontMatterValue(document.frontMatter["title"])) {
      items.push(Object.freeze({
        kind: "organizing.knowledge-vault.mutating.normalization-item" as const,
        path: document.path,
        rule: "missing-title",
        severity: "warning" as const,
        action: "add-title" as const,
        field: "title",
        target: inferredTitle(document.path),
        reason: "Document has no usable `title`; topic inspection cannot use it as a concept home.",
        source: "missing-title" as const,
      }));
    }
    if (!hasUsableFrontMatterValue(document.frontMatter["tags"])) {
      items.push(Object.freeze({
        kind: "organizing.knowledge-vault.mutating.normalization-item" as const,
        path: document.path,
        rule: "missing-tags",
        severity: "info" as const,
        action: "add-tags-list" as const,
        field: "tags",
        target: inferredTags(document.path),
        reason: "Document has no usable `tags`; faceted review and topic clustering have no declared vocabulary hook.",
        source: "missing-tags" as const,
      }));
    }
    const currentTags = stringArray(document.frontMatter["tags"]);
    const normalizedTags = canonicalTags(document.frontMatter["tags"]);
    if (currentTags.length > 0 && !sameStrings(currentTags, normalizedTags)) {
      items.push(Object.freeze({
        kind: "organizing.knowledge-vault.mutating.normalization-item" as const,
        path: document.path,
        rule: "tags-noncanonical",
        severity: "info" as const,
        action: "rewrite-field" as const,
        field: "tags",
        current: currentTags,
        target: normalizedTags,
        reason: "Tags must be canonical lowercase kebab tokens.",
        source: "frontmatter-normalization" as const,
      }));
    }
    const typeValue = stringValue(document.frontMatter["type"]);
    const kindValue = stringValue(document.frontMatter["kind"]);
    const classValue = stringValue(document.frontMatter["class"]);
    if (typeValue !== undefined && kindValue !== undefined && canonicalGenre(typeValue) !== canonicalGenre(kindValue)) {
      items.push(Object.freeze({
        kind: "organizing.knowledge-vault.mutating.normalization-item" as const,
        path: document.path,
        rule: "genre-conflict",
        severity: "warning" as const,
        action: "resolve-conflict" as const,
        field: "type",
        current: Object.freeze({ type: typeValue, kind: kindValue }),
        target: "one canonical `type` value",
        reason: "`type` and `kind` both classify the document but disagree; choose one canonical `type` value before applying genre folds.",
        source: "frontmatter-normalization" as const,
      }));
    } else if (typeValue === undefined && kindValue !== undefined) {
      items.push(Object.freeze({
        kind: "organizing.knowledge-vault.mutating.normalization-item" as const,
        path: document.path,
        rule: "genre-variant-key",
        severity: "info" as const,
        action: "rename-key" as const,
        field: "kind",
        current: kindValue,
        target: Object.freeze({ type: canonicalGenre(kindValue) }),
        reason: "`kind` is a genre dialect; fold it into canonical `type` frontmatter.",
        source: "frontmatter-normalization" as const,
      }));
    } else if (typeValue === undefined && classValue !== undefined) {
      items.push(Object.freeze({
        kind: "organizing.knowledge-vault.mutating.normalization-item" as const,
        path: document.path,
        rule: "genre-class-without-type",
        severity: "info" as const,
        action: "add-field" as const,
        field: "type",
        current: classValue,
        target: canonicalGenre(classValue),
        reason: "`class` gives a genre-like classification but no canonical `type` is present.",
        source: "frontmatter-normalization" as const,
      }));
    }
    for (const field of NONSTANDARD_RELATION_FIELDS) {
      const tags = canonicalTags(document.frontMatter[field]);
      if (tags.length === 0) continue;
      items.push(Object.freeze({
        kind: "organizing.knowledge-vault.mutating.normalization-item" as const,
        path: document.path,
        rule: "nonstandard-relation-field",
        severity: "warning" as const,
        action: "move-field-values-to-tags" as const,
        field,
        current: document.frontMatter[field],
        target: tags,
        reason: `\`${field}\` is local relation dialect, not canonical frontmatter; move readable values to tags and remove the field.`,
        source: "frontmatter-normalization" as const,
      }));
    }
    for (const finding of document.findings) {
      items.push(normalizationItemFromFinding(document, finding));
    }
  }
  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.normalization-plan" as const,
    root: memory.root,
    documents: memory.documents.length,
    items: Object.freeze(items),
    byRule: countItemsByRule(items),
  });
}

export function emptyNormalizationPlan(memory: MemoryCarrier): NormalizationPlan {
  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.normalization-plan" as const,
    root: memory.root,
    documents: memory.documents.length,
    items: Object.freeze([]),
    byRule: Object.freeze([]),
  });
}

export function filterNormalizationPlanRules(plan: NormalizationPlan, rules: readonly string[]): NormalizationPlan {
  const wanted = new Set(rules);
  const items = Object.freeze(plan.items.filter((item) => wanted.has(item.rule)));
  return Object.freeze({
    ...plan,
    items,
    byRule: countItemsByRule(items),
  });
}

export function planNormalizationEndomorphism(memory: MemoryCarrier, name: string): NormalizationEndomorphism | null {
  const normalized = normalizeEndomorphismName(name);
  if (normalized === null) return null;
  const plan = normalized === "identity"
    ? emptyNormalizationPlan(memory)
    : filterNormalizationPlanRules(planMemoryNormalization(memory), ["genre-variant-key", "genre-class-without-type", "genre-conflict"]);
  return Object.freeze({
    kind: "organizing.knowledge-vault.mutating.normalization-endomorphism" as const,
    name: normalized,
    memory,
    plan,
  });
}

export function prepareNormalizationOperations(
  items: readonly NormalizationItem[],
  options: PrepareNormalizationOperationsOptions = {},
): readonly PreparedNormalizationOperation[] {
  const rule = options.rule?.trim() ?? "";
  const dryRun = options.dryRun ?? true;
  const syntaxBlockedPaths = new Set(items
    .filter((item) => item.action === "repair-frontmatter" || item.rule === "frontmatter-parse-error")
    .map((item) => item.path));
  return Object.freeze(items
    .filter((item) => rule.length === 0 || item.rule === rule)
    .map((item) => prepareNormalizationOperation(item, dryRun, syntaxBlockedPaths)));
}

export function prepareNormalizationOperation(
  item: NormalizationItem,
  dryRun: boolean,
  syntaxBlockedPaths: ReadonlySet<string> = new Set<string>(),
): PreparedNormalizationOperation {
  if (syntaxBlockedPaths.has(item.path) && item.action !== "repair-frontmatter") {
    return Object.freeze({
      item,
      review: Object.freeze({
        reason: "frontmatter syntax repair must happen before structured document operations can mutate this path",
      }),
    });
  }
  if (item.action === "add-title" && typeof item.target === "string" && item.target.trim().length > 0) {
    return Object.freeze({ item, operation: Object.freeze({ path: item.path, set: Object.freeze({ title: item.target.trim() }), dryRun }) });
  }
  if (item.action === "add-tags-list") {
    const tags = normalizationStringArray(item.target);
    if (tags.length > 0) return Object.freeze({ item, operation: Object.freeze({ path: item.path, addTags: tags, dryRun }) });
  }
  if (item.action === "move-field-values-to-tags" && item.field !== undefined) {
    const tags = normalizationStringArray(item.target);
    if (tags.length > 0) return Object.freeze({ item, operation: Object.freeze({ path: item.path, addTags: tags, unset: Object.freeze([item.field]), dryRun }) });
  }
  if (item.action === "rewrite-field" && item.field !== undefined && item.target !== undefined) {
    return Object.freeze({ item, operation: Object.freeze({ path: item.path, set: Object.freeze({ [item.field]: item.target }), dryRun }) });
  }
  if (item.action === "rename-key" && item.field !== undefined) {
    const target = objectRecord(item.target);
    const type = target?.["type"];
    if (typeof type === "string" && type.trim().length > 0) {
      return Object.freeze({ item, operation: Object.freeze({ path: item.path, set: Object.freeze({ type: type.trim() }), unset: item.field === "type" ? Object.freeze([]) : Object.freeze([item.field]), dryRun }) });
    }
  }
  if (item.action === "add-field" && item.field !== undefined && typeof item.target === "string" && item.target.trim().length > 0) {
    return Object.freeze({ item, operation: Object.freeze({ path: item.path, set: Object.freeze({ [item.field]: item.target.trim() }), dryRun }) });
  }
  if (item.action === "normalize-references") {
    return Object.freeze({ item, operation: Object.freeze({ path: item.path, normalizeReferences: true, dryRun }) });
  }
  return Object.freeze({
    item,
    review: Object.freeze({
      reason: normalizationReviewReason(item),
    }),
  });
}

function normalizationItemFromFinding(document: MemoryDocument, finding: MemoryFinding): NormalizationItem {
  const shared = {
    kind: "organizing.knowledge-vault.mutating.normalization-item" as const,
    path: document.path,
    rule: finding.rule,
    severity: finding.severity,
    reason: finding.message,
    source: "finding" as const,
    finding,
  };
  switch (finding.rule) {
    case "broken-frontmatter":
    case "frontmatter-parse-error":
    case "non-conformant-frontmatter":
      return Object.freeze({
        ...shared,
        action: "repair-frontmatter" as const,
        reason: "Front matter cannot be decoded or does not satisfy the codec law; repair syntax before structured document operations mutate this path.",
      });
    case "missing-title":
      return Object.freeze({
        ...shared,
        action: "add-title" as const,
        field: "title",
        target: inferredTitle(document.path),
      });
    case "tags-not-list":
      return Object.freeze({
        ...shared,
        action: "rewrite-field" as const,
        field: "tags",
        current: document.frontMatter["tags"],
        target: Array.isArray(document.frontMatter["tags"]) ? document.frontMatter["tags"] : [document.frontMatter["tags"]],
      });
    case "references-non-csl":
      return Object.freeze({
        ...shared,
        action: "normalize-references" as const,
        field: "references",
        current: "citekey-map",
        target: "CSL/citeproc sequence",
      });
    case "broken-internal-reference":
      return Object.freeze({
        ...shared,
        action: "review-reference" as const,
        target: "addressable corpus path or stable id",
      });
    default:
      return Object.freeze({
        ...shared,
        action: "review-finding" as const,
      });
  }
}

function countItemsByRule(items: readonly NormalizationItem[]): readonly Readonly<{ rule: string; count: number }>[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.rule, (counts.get(item.rule) ?? 0) + 1);
  return Object.freeze([...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([rule, count]) => Object.freeze({ rule, count })));
}

function normalizeEndomorphismName(value: string): NormalizationEndomorphismName | null {
  const name = value.trim().toLowerCase();
  if (name === "identity" || name === "fold-genre-vocabulary") return name;
  return null;
}

function hasUsableFrontMatterValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}

function stringArray(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return Object.freeze(value
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter((item) => item.length > 0));
  }
  if (typeof value === "string" && value.trim().length > 0) return Object.freeze([value.trim()]);
  return Object.freeze([]);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function canonicalGenre(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function canonicalTag(value: string): string {
  return (value.trim().replace(/^#+/, "").toLowerCase().match(/[a-z0-9]+/g) ?? []).join("-");
}

function canonicalTags(value: unknown): readonly string[] {
  return Object.freeze([...new Set(stringArray(value)
    .map(canonicalTag)
    .filter((tag) => tag.length > 0))].sort((left, right) => left.localeCompare(right)));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizationStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter((item) => item.length > 0));
}

function normalizationReviewReason(item: NormalizationItem): string {
  if (item.action === "repair-frontmatter") return "frontmatter syntax must be repaired before structured tooling can rewrite it";
  if (item.action === "review-reference") return "broken internal references need target selection before mutation";
  if (item.action === "move-field-values-to-tags") return "nonstandard frontmatter relation values need readable string values before they can be moved into tags";
  if (item.action === "resolve-conflict") return "conflicting genre fields need a canonical value selected";
  if (item.action === "split-field") return "split-field repairs need human or agent judgment about the destination fields";
  if (item.action === "add-field") return "the planner target is descriptive, not a concrete field value";
  return "no deterministic corpus document operation is available for this candidate";
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function titleCaseTopic(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferredTitle(documentPath: string): string {
  const basename = (documentPath.split("/").at(-1) ?? documentPath).replace(/\.[^.]+$/, "");
  return titleCaseTopic(basename.replace(/[-_]+/g, " "));
}

function inferredTags(documentPath: string): readonly string[] {
  const ignored = new Set(["content", "docs", "scripts", "triage", "archive", "domains", "theories", "prose", "texts"]);
  const tags = documentPath
    .replace(/\.[^.]+$/, "")
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 2 && !ignored.has(segment) && !/^\d+$/.test(segment))
    .slice(0, 6);
  return Object.freeze([...new Set(tags)]);
}
