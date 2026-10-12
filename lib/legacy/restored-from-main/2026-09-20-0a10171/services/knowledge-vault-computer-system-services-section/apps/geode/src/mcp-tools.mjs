const objectSchema = (properties, required = []) => Object.freeze({
  type: "object",
  properties: Object.freeze(properties),
  required: Object.freeze(required),
  additionalProperties: false,
});


const term = Object.freeze({ description: "Any JSON term" });
const cell = objectSchema({ subject: term, predicate: term, object: term }, ["subject", "predicate", "object"]);

export const pamMcpTools = Object.freeze([
  Object.freeze({
    name: "pam_dispatch",
    description: "Admit one reified message of for/against predicate claims into PAM.",
    inputSchema: objectSchema({ sender: term, id: { type: "string" }, claims: { type: "array", minItems: 1, items: { type: "object" } } }, ["sender", "claims"]),
    annotations: Object.freeze({ destructiveHint: false, idempotentHint: true }),
  }),
  Object.freeze({
    name: "pam_query",
    description: "Return PAM read witnesses matching a subject-predicate-object pattern.",
    inputSchema: objectSchema({ subject: term, predicate: term, object: term, reading: { enum: ["absurd", "potential", "active", "stable"] } }),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "pam_reindex_read",
    description: "Read a PAM valuation after precomposition with a named live cell move.",
    inputSchema: objectSchema({
      move: { enum: ["converse", "subject-projection", "object-projection"] },
      cell,
    }, ["move", "cell"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "drew_snapshot",
    description: "Project the current PAM replay artifact as a deterministic directed relation/entity graph.",
    inputSchema: objectSchema({}),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "drew_neighbors",
    description: "Return witnessed incoming and outgoing relations for one entity term.",
    inputSchema: objectSchema({ term, direction: { enum: ["incoming", "outgoing", "both"] }, predicate: term }, ["term"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
]);

/** Product-facing tools. A transport host can mount these without making PAM the entry point. */
export const relationWebMcpTools = Object.freeze([
  Object.freeze({
    name: "drew_catalog",
    description: "List registered substrate adapters and currently composed source resources.",
    inputSchema: objectSchema({}),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "drew_relations",
    description: "Query current witnessed relation occurrences by subject, predicate, or object.",
    inputSchema: objectSchema({ subject: term, predicate: term, object: term, limit: { type: "integer", minimum: 1, maximum: 500, default: 100 } }),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "drew_entity",
    description: "Read incoming and outgoing witnessed relations for one entity.",
    inputSchema: objectSchema({ term, limit: { type: "integer", minimum: 1, maximum: 500, default: 100 } }, ["term"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "drew_project",
    description: "Project the current web as a snapshot, relations, EAVT, or definition-mediated cells.",
    inputSchema: objectSchema({
      type: { enum: ["snapshot", "relations", "eavt", "definition-mediated-cells", "definition-mediated-index", "definition-mediated-concept"] },
      pattern: { type: "object" },
      name: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    }, ["type"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "drew_explain",
    description: "Explain one relation occurrence from its substrate source and witness.",
    inputSchema: objectSchema({ address: { type: "string" } }, ["address"]),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
  Object.freeze({
    name: "drew_diagnostics",
    description: "Return unresolved, refused, malformed, and other adapter diagnostics without fabricating edges.",
    inputSchema: objectSchema({}),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true }),
  }),
]);

