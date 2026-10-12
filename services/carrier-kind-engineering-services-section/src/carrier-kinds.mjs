/**
 * Admission of a carrier's frontmatter by the schema its kind names. The schemas are the
 * knowledge-organization science section's (`schemas/carriers/`), projected here
 * byte-for-byte by `project-carrier-kind-schemas`; this module only compiles them. Each schema
 * borrows aliases, keywords, references and provenance from the term schema, and every predicate
 * of the relation vocabulary is admitted as a relation key whose value is one carrier identity or
 * a list of them.
 * @packageDocumentation
 */
import { compileJsonSchema } from "@red-cup-engineering/json-schema-services-section/validation";
import TERM_SCHEMA from "@red-cup-engineering/term-engineering-services-section/term.schema.json" with { type: "json" };
import RELATION_PREDICATES from "@red-cup-engineering/term-engineering-services-section/relation-predicates.json" with { type: "json" };
import NOTE_SCHEMA from "../schemas/carriers/note.schema.json" with { type: "json" };

/** Each carrier kind that has a schema, by the kind its artifact-role directory states. */
export const CARRIER_KIND_SCHEMAS = Object.freeze({ note: NOTE_SCHEMA });
export const CARRIER_KINDS = Object.freeze(Object.keys(CARRIER_KIND_SCHEMAS).sort());

const identities = Object.freeze({ type: "string", minLength: 1 });
const RELATION_KEYS = Object.freeze(Object.fromEntries(Object.entries(RELATION_PREDICATES).map(([predicate, { range }]) => [
  predicate,
  range === "carrier" ? { oneOf: [identities, { type: "array", minItems: 1, items: identities }] } : {},
])));

/**
 * The contract a kind's carriers are admitted under: its schema, with every relation predicate
 * the vocabulary authorizes as a property the schema's own properties override.
 * @param {string} kind
 */
export function carrierKindContract(kind) {
  const schema = CARRIER_KIND_SCHEMAS[kind];
  if (schema === undefined) throw new TypeError(`no carrier-kind schema for ${JSON.stringify(kind)}; kinds with one: ${CARRIER_KINDS.join(", ")}`);
  return Object.freeze({ ...schema, properties: { ...RELATION_KEYS, ...schema.properties } });
}

const compiled = new Map();
function compiledContract(kind) {
  if (!compiled.has(kind)) compiled.set(kind, compileJsonSchema(carrierKindContract(kind), { references: [TERM_SCHEMA] }));
  return compiled.get(kind);
}

/** One issue's rule: the schema keyword that failed and the top-level key it failed on. */
function ruleOf(issue) {
  const key = issue.path.split("/")[1] ?? (issue.keyword === "required" ? /'([^']+)'/u.exec(issue.message)?.[1] : undefined);
  return key === undefined ? issue.keyword : `${issue.keyword}:${key.replaceAll("~1", "/").replaceAll("~0", "~")}`;
}

/**
 * Check one carrier's frontmatter against the schema its kind names. A value no alternative of a
 * `oneOf` admits is one finding on that `oneOf`, not one per alternative it missed.
 * @param {string} kind
 * @param {Record<string, unknown>} frontmatter
 * @returns {{admitted: boolean, findings: ReadonlyArray<{rule: string, message: string}>}}
 */
export function admitCarrierFrontmatter(kind, frontmatter) {
  const result = compiledContract(kind).validate(frontmatter ?? {});
  const issues = result.issues ?? [];
  const alternatives = issues.filter(({ keyword }) => keyword === "oneOf" || keyword === "anyOf").map(({ path }) => path);
  const decisive = issues.filter((issue) => issue.keyword === "oneOf" || issue.keyword === "anyOf" || !alternatives.some((path) => issue.path === path || issue.path.startsWith(`${path}/`)));
  const findings = decisive.map((issue) => Object.freeze({ rule: ruleOf(issue), message: `${issue.path || "/"} ${issue.message ?? issue.keyword}`.trim() }));
  return Object.freeze({ admitted: result.valid, findings: Object.freeze(findings) });
}
