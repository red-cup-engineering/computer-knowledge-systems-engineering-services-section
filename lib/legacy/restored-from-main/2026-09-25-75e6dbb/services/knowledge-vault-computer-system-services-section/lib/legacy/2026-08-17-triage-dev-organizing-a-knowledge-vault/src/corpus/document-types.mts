/**
 * corpus/document-types - schema-backed markdown placement law for a corpus.
 *
 * The schema/event kernel lives in @emsenn/relating/writing. This module owns the
 * corpus-specific workflow that relating deliberately does not: confined type
 * directories, projected schema files, markdown realization, and existing-file
 * audit against placement/frontmatter law.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { confine } from "@emsenn/relating/ledger";
import {
  createMarkdown,
  documentTypeDefinitions,
  documentTypeFragment,
  markdownDocumentSchemaFragment,
  markdown,
  projectSchemaAssertions,
  schema,
  type JsonValue,
  type JsonSchema,
  type SchemaAssertion,
} from "@emsenn/relating/writing";
import type {
  DocumentTypeAudit,
  DocumentTypeClaim,
  DocumentTypeLocation,
  DocumentTypeProjection,
  DocumentTypeRealization,
} from "./carriers.mjs";
import { knowledgeVaultPathAllowedInRoot } from "./root.mjs";

const DEFAULT_BASE = "urn:organizing-a-knowledge-vault:/";
const DEFAULT_DOCUMENT_TYPES = "docs/references/document-types";
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export interface DocumentTypeOptions {
  readonly base?: string;
}

export interface RealizeDocumentTypeOptions {
  readonly at: string;
  readonly name: string;
  readonly description: string;
  readonly slug?: string;
  readonly date?: string;
  readonly values?: Readonly<Record<string, JsonValue>>;
  readonly write?: boolean;
}

export interface AuditDocumentTypeOptions {
  readonly typePath?: string;
  readonly catalogPath?: string;
}

export type {
  DocumentTypeAudit,
  DocumentTypeClaim,
  DocumentTypeLocation,
  DocumentTypeProjection,
  DocumentTypeRealization,
};

export function locateDocumentType(root: string, typePath: string, options: DocumentTypeOptions = {}): DocumentTypeLocation {
  const rel = requireAllowedCorpusPath(root, typePath, "document type path");
  const slug = path.posix.basename(rel);
  if (!SLUG_RE.test(slug)) throw new TypeError(`document type slug ${JSON.stringify(slug)} must match ${SLUG_RE}`);
  confine(root, rel);
  const base = options.base ?? DEFAULT_BASE;
  if (!base.endsWith("/")) throw new TypeError(`document type base must end in '/', got ${base}`);
  return Object.freeze({
    root,
    typePath: rel,
    slug,
    schemaId: `${base}${rel}/${slug}.schema.json`,
    logPath: `${rel}/${slug}.jsonl`,
    schemaPath: `${rel}/${slug}.schema.json`,
  });
}

export function claimDocumentType(root: string, typePath: string, fragment: unknown, options: DocumentTypeOptions & { readonly t: string }): DocumentTypeClaim {
  if (options.t.trim() === "") throw new TypeError("claim-document-type: t is required");
  const location = locateDocumentType(root, typePath, options);
  const added = schema.unfoldSchema(fragment, { base: location.schemaId, t: options.t });
  if (added.length === 0) throw new TypeError("claim-document-type: fragment unfolded to no schema assertions");
  const existing = existsSync(confine(root, location.logPath)) ? readAssertions(root, location.logPath) : [];
  const assertions = schema.mergeSchemaAssertions(existing, added);
  writeText(root, location.logPath, schema.serializeSchemaAssertions(assertions));
  return Object.freeze({
    kind: "organizing.knowledge-vault.corpus.document-type-claim" as const,
    location,
    added: added.length,
    total: assertions.length,
  });
}

export function projectDocumentType(root: string, typePath: string, options: DocumentTypeOptions = {}): DocumentTypeProjection {
  const location = locateDocumentType(root, typePath, options);
  const log = confine(root, location.logPath);
  if (!existsSync(log)) throw new Error(`project-document-type: no assertion log at ${location.logPath}`);
  const projected = projectSchemaAssertions(readAssertions(root, location.logPath), { id: location.schemaId });
  if (projected.contradictions.length > 0) {
    return Object.freeze({
      kind: "organizing.knowledge-vault.corpus.document-type-projection" as const,
      location,
      written: false,
      schema: null,
      contradictions: projected.contradictions,
    });
  }
  const document = projected.schema ?? {};
  const text = `${JSON.stringify(document, null, 2)}\n`;
  const full = confine(root, location.schemaPath);
  const written = !existsSync(full) || readFileSync(full, "utf8") !== text;
  if (written) writeText(root, location.schemaPath, text);
  return Object.freeze({
    kind: "organizing.knowledge-vault.corpus.document-type-projection" as const,
    location,
    written,
    schema: document,
    contradictions: Object.freeze([]),
  });
}

export function buildBuiltinDocumentTypes(root: string, options: DocumentTypeOptions & { readonly under?: string; readonly t?: string } = {}): readonly DocumentTypeProjection[] {
  const under = cleanPath(options.under ?? DEFAULT_DOCUMENT_TYPES);
  const out: DocumentTypeProjection[] = [];
  for (const definition of documentTypeDefinitions) {
    const typePath = `${under}/${definition.slug}`;
    const t = options.t ?? "tx-document-types";
    claimDocumentType(root, typePath, markdownDocumentSchemaFragment, { ...(options.base === undefined ? {} : { base: options.base }), t });
    claimDocumentType(root, typePath, documentTypeFragment(definition), { ...(options.base === undefined ? {} : { base: options.base }), t });
    out.push(projectDocumentType(root, typePath, { ...(options.base === undefined ? {} : { base: options.base }) }));
  }
  return Object.freeze(out);
}

export function realizeDocumentType(root: string, typePath: string, options: RealizeDocumentTypeOptions): DocumentTypeRealization {
  if (options.at.trim() === "") throw new TypeError("realize-document-type: at is required");
  if (options.name.trim() === "" || options.description.trim() === "") throw new TypeError("realize-document-type: name and description are required");
  const location = locateDocumentType(root, typePath);
  const document = readSchema(root, location.schemaPath);
  const placement = stringField(document, "x-trc-placement");
  if (placement === null) throw new Error("realize-document-type: schema lacks x-trc-placement");
  const filename = filenameFor(document, options);
  const pattern = stringField(document, "x-trc-filename");
  if (pattern !== null && !new RegExp(pattern).test(filename)) {
    throw new Error(`realize-document-type: filename ${JSON.stringify(filename)} does not match ${pattern}`);
  }
  const relativeDir = placement.replace(/\{thing\}/g, cleanPath(options.at));
  const relative = requireAllowedCorpusPath(root, `${relativeDir}/${filename}`, "realized document path");
  const frontmatter = Object.freeze({ name: options.name, description: options.description, ...(options.values ?? {}) });
  const errors = validateFrontmatter(document, frontmatter);
  if (errors.length > 0) throw new Error(`realize-document-type: frontmatter is not conformant: ${errors.join("; ")}`);
  const skeleton = stringField(document, "x-trc-body-skeleton") ?? "# {title}\n";
  const body = skeleton.replace(/\{title\}/g, options.name).replace(/\{name\}/g, options.name).replace(/\{date\}/g, options.date ?? "");
  const text = createMarkdown({ ...frontmatter, body }, { bodyKey: "body" });
  if (options.write === true) {
    const full = confine(root, relative);
    if (existsSync(full)) throw new Error(`realize-document-type: ${relative} already exists`);
    writeText(root, relative, text);
  } else {
    confine(root, relative);
  }
  return Object.freeze({
    kind: "organizing.knowledge-vault.corpus.document-type-realization" as const,
    path: relative,
    text,
    frontmatter,
    written: options.write === true,
  });
}

export function auditDocumentType(root: string, relative: string, options: AuditDocumentTypeOptions = {}): DocumentTypeAudit {
  const resourcePath = requireAllowedCorpusPath(root, relative, "audit resource path");
  const full = confine(root, resourcePath);
  if (!existsSync(full)) throw new Error(`audit-document-type: ${resourcePath} does not exist`);
  const resolved = options.typePath
    ? { typePath: cleanPath(options.typePath), schema: readSchema(root, locateDocumentType(root, options.typePath).schemaPath) }
    : detectDocumentType(root, resourcePath, requireAllowedCorpusPath(root, options.catalogPath ?? DEFAULT_DOCUMENT_TYPES, "document type catalog path"));
  if (resolved === null) {
    return Object.freeze({
      kind: "organizing.knowledge-vault.corpus.document-type-audit" as const,
      conformant: false,
      violations: Object.freeze(["no document type matches this path"]),
      typePath: null,
      thing: null,
    });
  }
  const violations: string[] = [];
  const file = path.posix.basename(resourcePath);
  const pattern = stringField(resolved.schema, "x-trc-filename");
  if (pattern !== null && !new RegExp(pattern).test(file)) violations.push(`filename ${JSON.stringify(file)} does not match x-trc-filename ${pattern}`);
  const placed = matchPlacement(stringField(resolved.schema, "x-trc-placement"), resourcePath);
  if (placed === null) violations.push(`directory does not match x-trc-placement ${String(resolved.schema["x-trc-placement"])}`);
  const parsed = markdown.parseMarkdown(readFileSync(full, "utf8"));
  if (parsed.frontmatter === null) violations.push("no YAML frontmatter");
  else violations.push(...validateFrontmatter(resolved.schema, parsed.frontmatter).map((error) => `frontmatter: ${error}`));
  return Object.freeze({
    kind: "organizing.knowledge-vault.corpus.document-type-audit" as const,
    conformant: violations.length === 0,
    violations: Object.freeze(violations),
    typePath: resolved.typePath,
    thing: placed?.thing ?? null,
  });
}

function readAssertions(root: string, relative: string): SchemaAssertion[] {
  return schema.parseSchemaAssertions(readFileSync(confine(root, relative), "utf8"));
}

function readSchema(root: string, relative: string): JsonSchema {
  const value = JSON.parse(readFileSync(confine(root, relative), "utf8")) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`schema ${relative} must be a JSON object`);
  return value as JsonSchema;
}

function writeText(root: string, relative: string, text: string): void {
  const full = confine(root, relative);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text, "utf8");
}

function filenameFor(document: JsonSchema, options: RealizeDocumentTypeOptions): string {
  const explicit = stringField(document, "x-trc-filename-template");
  if (explicit !== null) return fillTemplate(explicit, { date: options.date, slug: options.slug, name: options.name });
  switch (stringField(document, "x-trc-type")) {
    case "readme": return "README.md";
    case "agents-guide": return "AGENTS.md";
    case "claude-memory": return options.slug === "local" ? "CLAUDE.local.md" : "CLAUDE.md";
    case "heartbeat": return "HEARTBEAT.md";
    case "specification": return "specification.md";
    case "development-journal-entry": {
      if (!options.date) throw new TypeError("realize-document-type: date is required by development-journal-entry");
      return `${options.date}${options.slug ? `-${options.slug}` : ""}.md`;
    }
    case "development-document": return `${options.slug ?? slugify(options.name)}.md`;
    default: return `${options.slug ?? slugify(options.name)}.md`;
  }
}

function validateFrontmatter(document: JsonSchema, frontmatter: Readonly<Record<string, JsonValue>>): readonly string[] {
  const errors: string[] = [];
  const required = Array.isArray(document["required"]) ? document["required"].filter((value): value is string => typeof value === "string") : [];
  for (const key of required) if (!(key in frontmatter)) errors.push(`must have required property '${key}'`);
  const additional = document["additionalProperties"];
  const properties = recordField(document, "properties");
  if (additional === false) {
    for (const key of Object.keys(frontmatter)) if (!(key in properties)) errors.push(`must NOT have additional property '${key}'`);
  }
  for (const [key, rule] of Object.entries(properties)) {
    if (!(key in frontmatter)) continue;
    errors.push(...validateValue(key, frontmatter[key], rule));
  }
  return Object.freeze(errors);
}

function validateValue(key: string, value: JsonValue | undefined, rule: JsonValue): string[] {
  if (value === undefined || rule === null || typeof rule !== "object" || Array.isArray(rule)) return [];
  const schemaRecord = rule as Readonly<Record<string, JsonValue>>;
  const errors: string[] = [];
  const type = typeof schemaRecord["type"] === "string" ? schemaRecord["type"] : null;
  if (type !== null && !matchesType(value, type)) errors.push(`${key} must be ${type}`);
  if (typeof value === "string") {
    const minLength = typeof schemaRecord["minLength"] === "number" ? schemaRecord["minLength"] : null;
    const maxLength = typeof schemaRecord["maxLength"] === "number" ? schemaRecord["maxLength"] : null;
    const pattern = typeof schemaRecord["pattern"] === "string" ? schemaRecord["pattern"] : null;
    const format = typeof schemaRecord["format"] === "string" ? schemaRecord["format"] : null;
    if (minLength !== null && value.length < minLength) errors.push(`${key} must NOT have fewer than ${minLength} characters`);
    if (maxLength !== null && value.length > maxLength) errors.push(`${key} must NOT have more than ${maxLength} characters`);
    if (pattern !== null && !new RegExp(pattern).test(value)) errors.push(`${key} must match pattern ${pattern}`);
    if (format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`${key} must match format date`);
  }
  return errors;
}

function matchesType(value: JsonValue, type: string): boolean {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
}

function detectDocumentType(root: string, resourcePath: string, catalogPath: string): { readonly typePath: string; readonly schema: JsonSchema } | null {
  const start = confine(root, catalogPath);
  const hits: Array<{ typePath: string; schema: JsonSchema }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".schema.json")) {
        const rel = path.relative(path.resolve(root), full).split(path.sep).join("/");
        try {
          const found = readSchema(root, rel);
          const filename = path.posix.basename(resourcePath);
          const pattern = stringField(found, "x-trc-filename");
          if (matchPlacement(stringField(found, "x-trc-placement"), resourcePath) !== null && (pattern === null || new RegExp(pattern).test(filename))) {
            hits.push({ typePath: path.posix.dirname(rel), schema: found });
          }
        } catch {
          // Unreadable projected schemas are not candidates.
        }
      }
    }
  };
  if (!existsSync(start)) return null;
  walk(start);
  hits.sort((left, right) => String(right.schema["x-trc-placement"] ?? "").length - String(left.schema["x-trc-placement"] ?? "").length);
  return hits[0] ?? null;
}

function requireAllowedCorpusPath(root: string, value: string, label: string): string {
  const rel = cleanPath(value);
  if (rel === "" || !knowledgeVaultPathAllowedInRoot(root, rel)) {
    throw new TypeError(`${label} must stay in an allowed corpus prefix`);
  }
  confine(root, rel);
  return rel;
}

function matchPlacement(placement: string | null, resourcePath: string): { readonly tail: string; readonly thing: string } | null {
  if (placement === null) return null;
  const tail = cleanPath(placement.replace(/\{thing\}/g, ""));
  const dir = path.posix.dirname(cleanPath(resourcePath));
  if (tail !== "" && !dir.endsWith(tail)) return null;
  return { tail, thing: tail === "" ? dir : dir.slice(0, dir.length - tail.length).replace(/\/+$/g, "") };
}

function recordField(document: JsonSchema, key: string): Readonly<Record<string, JsonValue>> {
  const value = document[key];
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, JsonValue>> : {};
}

function stringField(document: JsonSchema, key: string): string | null {
  return typeof document[key] === "string" ? document[key] : null;
}

function fillTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template
    .replace(/\[([^\]]*)\]/g, (_, segment: string) => {
      const key = segment.match(/\{(\w[\w-]*)\}/)?.[1];
      return key && vars[key] ? segment : "";
    })
    .replace(/\{(\w[\w-]*)\}/g, (matched, key: string) => vars[key] ?? matched);
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "document";
}

function cleanPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}
