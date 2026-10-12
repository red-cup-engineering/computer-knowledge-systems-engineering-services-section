
import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";

const nonemptyStringSchema = { type: "string", minLength: 1 };
const stringSequenceSchema = { type: "array", items: nonemptyStringSchema };
const evidenceGradeSchema = { enum: ["strong", "medium", "weak"] };
const lensSchema = { enum: ["physical/material", "computing/term", "semiotic/intensional", "ludic/game"] };

export const termIntensionRequestSchema = {
  $id: "metroplat/term-intension/request",
  title: "TermIntensionRequest",
  description: "A deterministic local request to settle the secondary intension of a short term string from typed workspace evidence.",
  type: "object",
  required: ["query"],
  properties: {
    query: nonemptyStringSchema,
    root: { type: "string" },
    obsmetrologiaRoot: { type: "string" },
    pathPrefix: { type: "string" },
    limit: { type: "integer", minimum: 1 },
    includeBody: { type: "boolean" },
  },
  additionalProperties: false,
};

export const termIntensionNormalizedSchema = {
  type: "object",
  required: ["phrase", "lower", "tokens", "kebab", "snake", "camel", "pascal", "variants"],
  properties: {
    phrase: nonemptyStringSchema,
    lower: nonemptyStringSchema,
    tokens: stringSequenceSchema,
    kebab: nonemptyStringSchema,
    snake: nonemptyStringSchema,
    camel: nonemptyStringSchema,
    pascal: nonemptyStringSchema,
    variants: stringSequenceSchema,
  },
  additionalProperties: false,
};

export const termIntensionOccurrenceSchema = {
  type: "object",
  required: ["id", "source", "grade", "matchedFields", "attributes", "lenses", "evidence"],
  properties: {
    id: nonemptyStringSchema,
    source: { enum: ["concept-resolution", "markdown", "knowledge-vault", "typescript", "lean", "path-corpus"] },
    grade: evidenceGradeSchema,
    path: { type: "string" },
    module: { type: "string" },
    declaration: { type: "string" },
    symbol: { type: "string" },
    line: { type: "integer", minimum: 1 },
    matchedFields: stringSequenceSchema,
    attributes: stringSequenceSchema,
    lenses: { type: "array", items: lensSchema },
    excerpt: { type: "string" },
    evidence: stringSequenceSchema,
  },
  additionalProperties: false,
};

export const termIntensionAnchorSchema = {
  type: "object",
  required: ["term", "source", "target", "evidence"],
  properties: {
    term: nonemptyStringSchema,
    source: nonemptyStringSchema,
    target: nonemptyStringSchema,
    sharedAttribute: { type: "string" },
    evidence: stringSequenceSchema,
  },
  additionalProperties: false,
};

export const termIntensionLensReadingSchema = {
  type: "object",
  required: ["lens", "strong", "medium", "weak", "earnedAnchors", "missing", "status"],
  properties: {
    lens: lensSchema,
    strong: { type: "integer", minimum: 0 },
    medium: { type: "integer", minimum: 0 },
    weak: { type: "integer", minimum: 0 },
    earnedAnchors: stringSequenceSchema,
    missing: stringSequenceSchema,
    status: { enum: ["earned", "candidate", "thin", "absent"] },
  },
  additionalProperties: false,
};

export const termIntensionReadoutSchema = {
  $id: "metroplat/term-intension/readout",
  title: "TermIntensionReadout",
  description: "A term's settled secondary intension: typed occurrences as extent, shared FCA attributes as intent, per-register lens status, anchors, open obligations, and compact chat context.",
  type: "object",
  required: ["kind", "query", "normalized", "extent", "intent", "closedExtent", "occurrences", "lenses", "anchors", "open", "status", "contextInjection", "evidence"],
  properties: {
    kind: { const: "metroplat.term-intension.readout" },
    query: nonemptyStringSchema,
    normalized: termIntensionNormalizedSchema,
    extent: stringSequenceSchema,
    intent: stringSequenceSchema,
    closedExtent: stringSequenceSchema,
    occurrences: { type: "array", items: termIntensionOccurrenceSchema },
    lenses: { type: "array", items: termIntensionLensReadingSchema },
    anchors: { type: "array", items: termIntensionAnchorSchema },
    open: stringSequenceSchema,
    status: { enum: ["anchored", "polysemous", "open", "thin", "connotation"] },
    contextInjection: { type: "string" },
    evidence: stringSequenceSchema,
  },
  additionalProperties: false,
};

export const termIntensionRequestContract = schemaFrom(termIntensionRequestSchema);
export const termIntensionReadoutContract = schemaFrom(termIntensionReadoutSchema);
