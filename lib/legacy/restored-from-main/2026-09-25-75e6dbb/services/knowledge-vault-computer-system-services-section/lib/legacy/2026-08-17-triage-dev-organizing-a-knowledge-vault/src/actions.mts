/**
 * actions  -  knowledge-vault corpus verbs as one relating dispatcher surface.
 *
 * The package owns corpus path admission and proof-path navigation. The corpus is the
 * persistent memorystore; @emsenn/knowing supplies memory, proof, and research readings.
 */
import path from "node:path";
import { action as relatingAction, jsonResource, type Action, type JsonRecord, type JsonValue } from "@emsenn/relating";
import {
  research,
  knowing,
  introducing,
  studying,
  explaining,
  learning,
  tutoring,
  researchAction as knowingResearchAction,
  learningAction as knowingLearningAction,
  curriculumAction as knowingCurriculumAction,
  type SettledResearch,
} from "@emsenn/knowing/researching";
import {
  projectKnowledge,
  projectCell,
  projectSite,
  projectExplanation,
  projectNextStep,
} from "@emsenn/knowing/projecting";
import {
  settleMemory,
  observeMemory,
  type MemoryCarrier,
} from "@emsenn/knowing/memory";
import {
  requireNode,
  children,
  readDocument,
  listEntries,
  admitCorpusMemory,
  organizeCorpus,
  claimDocumentType,
  projectDocumentType,
  buildBuiltinDocumentTypes,
  realizeDocumentType,
  auditDocumentType,
  frontierCarrier,
  corpusNodeCarrier,
  corpusDocumentCarrier,
  listingCarrier,
  documentTypeClaimCarrier,
  documentTypeProjectionCarrier,
  documentTypeRealizationCarrier,
  documentTypeAuditCarrier,
  knowledgeVaultRoot,
  knowledgeVaultRootCarrier,
  corpusReadBounds,
  resolveKnowledgeVaultRoot,
} from "./corpus/index.mjs";
import { catalogCorpus, facetCorpusCatalog, catalogCarrier, catalogFacetCarrier } from "./corpus/index.mjs";
import { createDocument, updateFrontmatter, prepareTriageUpload, prepareRelationalHullStage0BoundaryFile, scanRelationalHullStage0Boundary, planStaticSitePublication, planMemoryNormalization, planTopicConceptMap, planTopicGapMeasurement, planTopicGuidance, planTopicInspection, preparedDocumentCarrier, triageUploadCarrier, relationalHullStage0BoundaryCarrier, relationalHullStage0BoundaryFileCarrier, staticSitePublishPlanCarrier, normalizationPlanCarrier, topicConceptMapCarrier, topicGapMeasurementCarrier, topicGuidanceCarrier, topicInspectionCarrier, type TopicConceptMapInput } from "./mutating/index.mjs";
import { findAddressedName, grepAddressedText, addressedNameSearchCarrier, addressedTextSearchCarrier, type AddressingOptions } from "./addressing/index.mjs";
import { memoryHealthProjection, memoryHealthProjectionCarrier } from "./holography/index.mjs";
import { agentPrompts, agentResources } from "./agents/index.mjs";

type JsonActionSpec = Omit<Parameters<typeof relatingAction>[0], "run"> & {
  readonly run: (input: JsonValue, args: JsonRecord) => JsonValue;
};

function requireJsonRecord(value: unknown, context: string): JsonRecord {
  const resource = jsonResource(value, context);
  if (resource === null || typeof resource !== "object" || Array.isArray(resource)) {
    throw new TypeError(`${context}: not a JSON object`);
  }
  return resource as JsonRecord;
}

function action(spec: JsonActionSpec): Action {
  return relatingAction({
    ...spec,
    run: (input: unknown, args: Record<string, unknown>): unknown =>
      spec.run(jsonResource(input, `${spec.verb} input`), requireJsonRecord(args, `${spec.verb} args`)),
  });
}

/** The resolved knowledge-vault root for this call. */
function corpusRoot(args: JsonRecord): string {
  const fromArg = typeof args["path"] === "string" && args["path"].trim() !== "" ? args["path"].trim() : undefined;
  return resolveKnowledgeVaultRoot(fromArg);
}

/** Admit a topic from the `string` wire or the `json` wire (`{topic}`). */
function admitTopic(input: JsonValue, verb: string): string {
  if (typeof input === "string") {
    const topic = input.trim();
    if (topic === "") throw new TypeError(`${verb}: a topic is required on stdin`);
    return topic;
  }
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const record = input as JsonRecord;
    for (const key of ["topic", "path", "slug", "address"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
  }
  throw new TypeError(`${verb}: expected a topic string or a { topic } object`);
}

function memoryRegion(input: JsonValue, args: JsonRecord): { root: string; region: string; limit: number; maxScan: number } {
  const region = typeof input === "string" ? input.trim() : typeof input === "object" && input !== null && !Array.isArray(input) && typeof (input as JsonRecord)["path"] === "string" ? String((input as JsonRecord)["path"]).trim() : "";
  const { limit, maxScan } = corpusReadBounds(argNumber(args["limit"]), argNumber(args["maxScan"]));
  return { root: corpusRoot(args), region, limit, maxScan };
}

function boundedNumber(value: JsonValue | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" && typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function argNumber(value: JsonValue | undefined): string | number | undefined {
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

function addressingQuery(input: JsonValue, verb: string, keys: readonly string[]): { query: string; region: string | undefined } {
  if (typeof input === "string") {
    const query = input.trim();
    if (query === "") throw new TypeError(`${verb}: a query is required on stdin`);
    return { query, region: undefined };
  }
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const record = input as JsonRecord;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") {
        const region = typeof record["path"] === "string" && record["path"].trim() !== "" ? record["path"].trim() : undefined;
        return { query: value.trim(), region };
      }
    }
  }
  throw new TypeError(`${verb}: expected a query string or a { query } object`);
}

function addressingOptions(input: JsonValue, args: JsonRecord, verb: string, keys: readonly string[]): AddressingOptions & { query: string } {
  const admitted = addressingQuery(input, verb, keys);
  const region = admitted.region ?? (typeof args["region"] === "string" && args["region"].trim() !== "" ? args["region"].trim() : undefined);
  return {
    query: admitted.query,
    ...(region === undefined ? {} : { path: region }),
    limit: boundedNumber(args["limit"], 50, 500),
    maxScan: boundedNumber(args["maxScan"], 5000, 50_000),
  };
}

function regionInput(input: JsonValue, args: JsonRecord): string | undefined {
  if (typeof input === "string" && input.trim() !== "") return input.trim();
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const value = (input as JsonRecord)["path"];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return typeof args["region"] === "string" && args["region"].trim() !== "" ? args["region"].trim() : undefined;
}

function regionResearch(input: JsonValue, args: JsonRecord): SettledResearch | null {
  const { root, region, limit, maxScan } = memoryRegion(input, args);
  return research(admitCorpusMemory(root, region, { limit, maxScan }));
}

function conceptMapInputs(memory: MemoryCarrier): readonly TopicConceptMapInput[] {
  return Object.freeze(memory.documents.map((document) => Object.freeze({
    path: document.path,
    frontmatter: document.frontMatter,
  })));
}

function unfoldingAction(verb: string, summary: string, codomain: string, codomainId: string, derive: (research: SettledResearch) => unknown): Action {
  return action({
    verb,
    inputFormat: "string",
    outputFormat: "json",
    options: ["path", "limit", "maxScan"],
    summary,
    description: `Domain: a knowledge-vault corpus region path (string wire, empty = root) or { path }; --path sets the corpus root, --limit bounds documents. Codomain: the ${codomain} as JSON (${codomainId}) from @emsenn/knowing.`,
    domainSchema: Object.freeze({ type: "string", description: "a knowledge-vault corpus region path (empty = root)" }),
    codomainSchema: Object.freeze({ $ref: codomainId }),
    run: (input: JsonValue, args: JsonRecord): JsonValue => {
      const settled = regionResearch(input, args);
      if (settled === null) throw new TypeError("no corpus resources to research");
      return jsonResource(derive(settled), codomain);
    },
  });
}

function memoryProjectionAction(verb: string, summary: string, codomain: string, codomainId: string, induced: Action): Action {
  return action({
    verb,
    inputFormat: "string",
    outputFormat: "json",
    options: ["path", "limit", "maxScan"],
    summary,
    description: `Domain: a knowledge-vault corpus region path (string wire, empty = root) or { path }; --path sets the corpus root, --limit bounds documents. Codomain: the ${codomain} as JSON (${codomainId}) from @emsenn/knowing.`,
    domainSchema: Object.freeze({ type: "string", description: "a knowledge-vault corpus region path (empty = root)" }),
    codomainSchema: Object.freeze({ $ref: codomainId }),
    run: (input: JsonValue, args: JsonRecord): JsonValue => {
      const { root, region, limit, maxScan } = memoryRegion(input, args);
      return jsonResource(induced.run(admitCorpusMemory(root, region, { limit, maxScan }), {}), codomain);
    },
  });
}

export const researchAction: Action = memoryProjectionAction("research", "Research a corpus region as a knowing research act.", "research act", "knowing/researching/research", knowingResearchAction);
export const knowAction: Action = unfoldingAction("know", "Know a corpus region: its settled regime, certification, and relations.", "knowledge", "knowing/researching/knowledge", (settled) => projectKnowledge(knowing(settled)));
export const introduceAction: Action = unfoldingAction("introduce", "Introduce a corpus region as the settled entry cell.", "introduction", "knowing/researching/cell", (settled) => projectCell(introducing(settled)));
export const studyAction: Action = unfoldingAction("study", "Study a corpus region by opening its settling trace.", "study", "knowing/researching/site", (settled) => projectSite(studying(introducing(settled))));
export const explainAction: Action = unfoldingAction("explain", "Explain a corpus region as a stepwise derivation.", "explanation", "knowing/researching/explanation", (settled) => projectExplanation(explaining(studying(introducing(settled)))));
export const learnAction: Action = memoryProjectionAction("learn", "Learn from a corpus region: the lessons its trace yields.", "learning", "knowing/researching/learning", knowingLearningAction);
export const teachAction: Action = memoryProjectionAction("teach", "Teach a corpus region: its lessons ordered for delivery.", "curriculum", "knowing/researching/curriculum", knowingCurriculumAction);
export const tutorAction: Action = unfoldingAction("tutor", "Tutor over a corpus region: the next single lesson.", "next step", "knowing/researching/next-step", (settled) => projectNextStep(tutoring(learning(studying(introducing(settled))))));

export const inspectRootAction: Action = action({
  verb: "inspect-root",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path"],
  summary: "Inspect expected and observed knowledge-vault root affordances.",
  description: "Domain: empty string. --path sets the knowledge-vault root. Codomain: stable package prefixes, expected root paths, observed top-level prefixes, missing paths, and the root-specific allowed corpus prefixes.",
  domainSchema: Object.freeze({ type: "string", description: "empty; the inspected root comes from --path or ORGANIZING_KNOWLEDGE_VAULT_PATH" }),
  codomain: knowledgeVaultRootCarrier,
  run: (_input: JsonValue, args: JsonRecord): JsonValue => jsonResource(knowledgeVaultRoot(corpusRoot(args)), "knowledge-vault root"),
});

export const browseAction: Action = action({
  verb: "browse",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path"],
  summary: "Browse the corpus at a topic: the nodes it generates in one step.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus topic proof path (empty = root)" }),
  codomain: frontierCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const topic = typeof input === "string" ? input.trim() : admitTopic(input, "browse");
    return jsonResource({ kind: "organizing.knowledge-vault.corpus.frontier", topic, nodes: children(corpusRoot(args), topic) }, "frontier");
  },
});

export const locateAction: Action = action({
  verb: "locate",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path"],
  summary: "Locate a topic by corpus proof path.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus topic proof path" }),
  codomain: corpusNodeCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const node = requireNode(corpusRoot(args), admitTopic(input, "locate"));
    return jsonResource(node, "corpus node");
  },
});

function admitAddress(input: JsonValue, verb: string): string {
  if (typeof input === "string") return input.trim();
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const value = (input as JsonRecord)["path"];
    if (typeof value === "string") return value.trim();
  }
  throw new TypeError(`${verb}: expected a path string or a { path } object`);
}

export const readAction: Action = action({
  verb: "read",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path"],
  summary: "Read one corpus document by address, decoded by the markdown codec.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus-relative resource path" }),
  codomain: corpusDocumentCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => jsonResource(readDocument(corpusRoot(args), admitAddress(input, "read")), "document"),
});

export const listAction: Action = action({
  verb: "list",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "limit"],
  summary: "List immediate entries at a corpus address.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus-relative address (empty = root)" }),
  codomain: listingCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const address = typeof input === "string" ? input.trim() : admitAddress(input, "list");
    return jsonResource(listEntries(corpusRoot(args), address, {
      ...(args["limit"] === undefined ? {} : { limit: argNumber(args["limit"]) ?? String(args["limit"]) }),
    }), "listing");
  },
});

export const findNameAction: Action = action({
  verb: "find-name",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "region", "limit", "maxScan"],
  summary: "Find addressed corpus entries by filepath name.",
  description: "Domain: a name query (string wire) or { query, path }. --path sets the corpus root; --region restricts the corpus-relative search region. Codomain: bounded filepath lookup over the corpus memorystore.",
  domainSchema: Object.freeze({ type: "string", description: "a name query for corpus filepath lookup" }),
  codomain: addressedNameSearchCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue =>
    jsonResource(findAddressedName(corpusRoot(args), addressingOptions(input, args, "find-name", ["query", "q", "name"])), "addressed name search"),
});

export const grepTextAction: Action = action({
  verb: "grep-text",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "region", "limit", "maxScan"],
  summary: "Find lexical evidence inside addressed corpus resources.",
  description: "Domain: a text query (string wire) or { query, path }. --path sets the corpus root; --region restricts the corpus-relative search region. Codomain: bounded lexical evidence over the corpus memorystore.",
  domainSchema: Object.freeze({ type: "string", description: "a text query for corpus lexical evidence" }),
  codomain: addressedTextSearchCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue =>
    jsonResource(grepAddressedText(corpusRoot(args), addressingOptions(input, args, "grep-text", ["query", "q", "pattern"])), "addressed text search"),
});

export const catalogAction: Action = action({
  verb: "catalog",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "region", "limit", "maxScan"],
  summary: "Catalog a corpus region as a bounded faceted memorystore view.",
  description: "Domain: a corpus region path (string wire, empty = corpus root) or { path }. --path sets the corpus root; --region also restricts the corpus-relative catalog region. Codomain: a bounded faceted corpus catalog.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus-relative region to catalog (empty = corpus root)" }),
  codomain: catalogCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const region = regionInput(input, args);
    const { limit, maxScan } = corpusReadBounds(argNumber(args["limit"]) ?? 1000, argNumber(args["maxScan"]));
    return jsonResource(catalogCorpus(corpusRoot(args), {
      ...(region === undefined ? {} : { path: region }),
      limit,
      maxScan,
    }), "corpus catalog");
  },
});

export const catalogFacetAction: Action = action({
  verb: "catalog-facet",
  inputFormat: "json",
  outputFormat: "json",
  options: ["path", "region", "kind", "name", "limit", "maxScan"],
  summary: "Read one author/topic facet from a corpus catalog.",
  description: "Domain: { name, kind?, path? } where kind is author or topic. --path sets the corpus root; --region restricts the corpus-relative catalog region. Codomain: a bounded catalog facet.",
  domainSchema: Object.freeze({ type: "object", description: "a catalog facet request { name, kind?, path? }" }),
  codomain: catalogFacetCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const record = input !== null && typeof input === "object" && !Array.isArray(input) ? input as JsonRecord : {};
    const name = typeof record["name"] === "string" && record["name"].trim() !== ""
      ? record["name"].trim()
      : typeof record["q"] === "string" && record["q"].trim() !== ""
        ? record["q"].trim()
        : typeof args["name"] === "string" ? args["name"].trim() : "";
    if (name === "") throw new TypeError("catalog-facet: a facet name is required");
    const kind = typeof record["kind"] === "string" ? record["kind"] : typeof args["kind"] === "string" ? args["kind"] : undefined;
    const region = regionInput(input, args);
    const { limit, maxScan } = corpusReadBounds(argNumber(args["limit"]) ?? 250, argNumber(args["maxScan"]));
    return jsonResource(facetCorpusCatalog(corpusRoot(args), {
      ...(region === undefined ? {} : { path: region }),
      ...(kind === undefined ? {} : { kind }),
      name,
      limit,
      maxScan,
    }), "corpus catalog facet");
  },
});

export const settleMemoryAction: Action = action({
  verb: "settle-memory",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "limit", "maxScan"],
  summary: "Admit a corpus region as knowing memory and build its proof.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus region path (empty = root)" }),
  codomainSchema: Object.freeze({ $ref: "knowing/memory/proof" }),
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const { root, region, limit, maxScan } = memoryRegion(input, args);
    return jsonResource(settleMemory(admitCorpusMemory(root, region, { limit, maxScan })), "memory proof");
  },
});

export const observeAction: Action = action({
  verb: "observe",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "limit", "maxScan"],
  summary: "Admit a corpus region as knowing memory and observe it.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus region path (empty = root)" }),
  codomainSchema: Object.freeze({ $ref: "knowing/memory/observation" }),
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const { root, region, limit, maxScan } = memoryRegion(input, args);
    return jsonResource(observeMemory(admitCorpusMemory(root, region, { limit, maxScan })), "memory observation");
  },
});

export const inspectTopicAction: Action = action({
  verb: "inspect-topic",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "limit", "maxScan", "region"],
  summary: "Inspect a topic across a corpus-backed memory.",
  domainSchema: Object.freeze({ type: "string", description: "a topic query" }),
  codomainSchema: Object.freeze({ $ref: "organizing/knowledge-vault/mutating/topic-inspection" }),
  codomain: topicInspectionCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const topic = typeof input === "string" ? input.trim() : admitTopic(input, "inspect-topic");
    if (topic === "") throw new TypeError("inspect-topic: a topic is required on stdin");
    const root = corpusRoot(args);
    const region = typeof args["region"] === "string" ? args["region"] : "";
    const { limit, maxScan } = corpusReadBounds(argNumber(args["limit"]) ?? 500, argNumber(args["maxScan"]) ?? 80_000);
    return jsonResource(planTopicInspection(admitCorpusMemory(root, region, { limit, maxScan }), topic), "topic inspection");
  },
});

export const conceptMapAction: Action = action({
  verb: "concept-map",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "limit", "maxScan", "region"],
  summary: "Map a topic across a corpus-backed memory.",
  domainSchema: Object.freeze({ type: "string", description: "a topic query" }),
  codomainSchema: Object.freeze({ $ref: "organizing/knowledge-vault/mutating/topic-concept-map" }),
  codomain: topicConceptMapCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const topic = typeof input === "string" ? input.trim() : admitTopic(input, "concept-map");
    if (topic === "") throw new TypeError("concept-map: a topic is required on stdin");
    const root = corpusRoot(args);
    const region = typeof args["region"] === "string" ? args["region"] : "";
    const { limit, maxScan } = corpusReadBounds(argNumber(args["limit"]) ?? 500, argNumber(args["maxScan"]) ?? 80_000);
    const memory = admitCorpusMemory(root, region, { limit, maxScan });
    return jsonResource(planTopicConceptMap(memory, topic, conceptMapInputs(memory)), "concept map");
  },
});

export const measureGapAction: Action = action({
  verb: "measure-gap",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "limit", "maxScan", "region"],
  summary: "Measure topic coverage and legibility across a corpus-backed memory.",
  domainSchema: Object.freeze({ type: "string", description: "a topic query" }),
  codomainSchema: Object.freeze({ $ref: "organizing/knowledge-vault/mutating/topic-gap-measurement" }),
  codomain: topicGapMeasurementCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const topic = typeof input === "string" ? input.trim() : admitTopic(input, "measure-gap");
    if (topic === "") throw new TypeError("measure-gap: a topic is required on stdin");
    const root = corpusRoot(args);
    const region = typeof args["region"] === "string" ? args["region"] : "";
    const { limit, maxScan } = corpusReadBounds(argNumber(args["limit"]) ?? 500, argNumber(args["maxScan"]) ?? 80_000);
    return jsonResource(planTopicGapMeasurement(admitCorpusMemory(root, region, { limit, maxScan }), topic), "gap measurement");
  },
});

export const inspectHealthAction: Action = action({
  verb: "inspect-health",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "limit", "maxScan"],
  summary: "Admit a corpus region as memory and read its frontmatter/conformance health.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus region path (empty = root)" }),
  codomainSchema: Object.freeze({ $ref: "organizing/knowledge-vault/holography/memory-health" }),
  codomain: memoryHealthProjectionCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const { root, region, limit, maxScan } = memoryRegion(input, args);
    return jsonResource(memoryHealthProjection(admitCorpusMemory(root, region, { limit, maxScan })), "memory health");
  },
});

export const normalizationPlanAction: Action = action({
  verb: "normalization-plan",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "limit", "maxScan"],
  summary: "Plan dry-run frontmatter/document normalizations for a corpus-backed memorystore.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus region path (empty = root)" }),
  codomainSchema: Object.freeze({ $ref: "organizing/knowledge-vault/mutating/normalization-plan" }),
  codomain: normalizationPlanCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const { root, region, limit, maxScan } = memoryRegion(input, args);
    return jsonResource(planMemoryNormalization(admitCorpusMemory(root, region, { limit, maxScan })), "normalization plan");
  },
});

export const topicGuidanceAction: Action = action({
  verb: "topic-guidance",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "limit", "maxScan", "region"],
  summary: "Plan corpus placement scaffolds and next actions for a topic.",
  domainSchema: Object.freeze({ type: "string", description: "a topic query" }),
  codomainSchema: Object.freeze({ $ref: "organizing/knowledge-vault/mutating/topic-guidance" }),
  codomain: topicGuidanceCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const topic = typeof input === "string" ? input.trim() : admitTopic(input, "topic-guidance");
    if (topic === "") throw new TypeError("topic-guidance: a topic is required on stdin");
    const root = corpusRoot(args);
    const region = typeof args["region"] === "string" ? args["region"] : "";
    const { limit, maxScan } = corpusReadBounds(argNumber(args["limit"]) ?? 500, argNumber(args["maxScan"]) ?? 80_000);
    return jsonResource(planTopicGuidance(admitCorpusMemory(root, region, { limit, maxScan }), topic), "topic guidance");
  },
});

export const organizeCorpusAction: Action = action({
  verb: "organize-corpus",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "limit", "maxScan", "identity"],
  summary: "Organize a corpus region through @emsenn/organizing.",
  description: "Domain: a corpus region path (empty = root). The corpus is read as a three-face social boundary: socializing = membership, computing = markdown conformance, gaming = tags/placement predicates. Codomain: @emsenn/organizing's organization carrier.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus region path (empty = root)" }),
  codomainSchema: Object.freeze({ $ref: "organizing/organization" }),
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const { root, region, limit, maxScan } = memoryRegion(input, args);
    const identity = typeof args["identity"] === "string" && args["identity"].trim() !== "" ? args["identity"].trim() : undefined;
    return jsonResource(organizeCorpus(root, region, { limit, maxScan, ...(identity === undefined ? {} : { identity }) }), "organization");
  },
});

function admitDocumentSpec(input: JsonValue, verb: string): JsonRecord {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`${verb}: expected a JSON object (e.g. { path, title, tags, body })`);
  }
  return input as JsonRecord;
}

function jsonRecord(input: JsonValue, verb: string): JsonRecord {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError(`${verb}: expected a JSON object`);
  return input as JsonRecord;
}

function kernelRoot(args: JsonRecord, fallback: string): string {
  const configured = typeof args["path"] === "string" && args["path"].trim() !== "" ? args["path"].trim() : fallback;
  return path.resolve(configured);
}

function typePathFrom(input: JsonValue, args: JsonRecord, verb: string): string {
  if (typeof input === "string" && input.trim() !== "") return input.trim();
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const record = input as JsonRecord;
    for (const key of ["typePath", "kindDir", "path"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
    }
  }
  const fromArg = args["typePath"] ?? args["kindDir"];
  if (typeof fromArg === "string" && fromArg.trim() !== "") return fromArg.trim();
  throw new TypeError(`${verb}: a document type path is required`);
}

export const createDocumentAction: Action = action({
  verb: "create-document",
  inputFormat: "json",
  outputFormat: "json",
  options: ["path", "write"],
  summary: "Prepare a corpus frontmatter document; place it only with --write.",
  domainSchema: Object.freeze({ type: "object", description: "a document spec { path, title?, tags?, body?, frontMatter? }" }),
  codomain: preparedDocumentCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue =>
    jsonResource(createDocument(corpusRoot(args), admitDocumentSpec(input, "create-document"), args["write"] === "true" || args["write"] === ""), "prepared document"),
});

export const updateFrontmatterAction: Action = action({
  verb: "update-frontmatter",
  inputFormat: "json",
  outputFormat: "json",
  options: ["path", "write"],
  summary: "Merge a frontmatter patch into a corpus document; apply only with --write.",
  domainSchema: Object.freeze({ type: "object", description: "a frontmatter patch spec { path, title?, tags?, frontMatter? }" }),
  codomain: preparedDocumentCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue =>
    jsonResource(updateFrontmatter(corpusRoot(args), admitDocumentSpec(input, "update-frontmatter"), args["write"] === "true" || args["write"] === ""), "prepared document"),
});

export const uploadTriageFileAction: Action = action({
  verb: "upload-triage-file",
  inputFormat: "json",
  outputFormat: "json",
  options: ["path", "write"],
  summary: "Prepare a dated triage file deposit; write only with --write.",
  domainSchema: Object.freeze({ type: "object", description: "{ content, filename? }" }),
  codomain: triageUploadCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const record = admitDocumentSpec(input, "upload-triage-file");
    const content = record["content"];
    if (typeof content !== "string") throw new TypeError("upload-triage-file: content is required");
    const filename = typeof record["filename"] === "string" && record["filename"].trim() !== "" ? record["filename"].trim() : undefined;
    return jsonResource(prepareTriageUpload(corpusRoot(args), {
      content,
      ...(filename === undefined ? {} : { filename }),
    }, { write: args["write"] === "true" || args["write"] === "" }), "triage upload");
  },
});

export type RelationalHullStage0ActionOptions = Readonly<{
  root: string;
}>;

export function relationalHullStage0BoundaryAction(options: RelationalHullStage0ActionOptions): Action {
  const root = path.resolve(options.root);
  return action({
    verb: "kernel-hull-stage0-boundary",
    inputFormat: "string",
    outputFormat: "json",
    options: ["path", "limit"],
    summary: "Read the kernel relational hull's stage-0 inbox boundary.",
    description: "Domain: empty string. --path may override the kernel root. Codomain: the stage-0 relational-hull boundary carrier over `$root/content/triaging/inbox/`.",
    domainSchema: Object.freeze({ type: "string", description: "empty; the boundary comes from the kernel root plus content/triaging/inbox" }),
    codomain: relationalHullStage0BoundaryCarrier,
    run: (_input: JsonValue, args: JsonRecord): JsonValue => {
      const limit = argNumber(args["limit"]);
      return jsonResource(scanRelationalHullStage0Boundary(kernelRoot(args, root), {
        ...(limit === undefined ? {} : { limit }),
      }), "relational hull stage-0 boundary");
    },
  });
}

export function addRelationalHullStage0BoundaryFileAction(options: RelationalHullStage0ActionOptions): Action {
  const root = path.resolve(options.root);
  return action({
    verb: "add-kernel-hull-stage0-file",
    inputFormat: "json",
    outputFormat: "json",
    options: ["path", "write"],
    summary: "Prepare a file for the kernel relational hull's stage-0 inbox boundary.",
    description: "Domain: { content, filename? }. --path may override the kernel root. Writes only with --write. Codomain: one stage-0 boundary file carrier under `$root/content/triaging/inbox/`.",
    domainSchema: Object.freeze({ type: "object", description: "{ content, filename? }" }),
    codomain: relationalHullStage0BoundaryFileCarrier,
    run: (input: JsonValue, args: JsonRecord): JsonValue => {
      const record = admitDocumentSpec(input, "add-kernel-hull-stage0-file");
      const content = record["content"];
      if (typeof content !== "string") throw new TypeError("add-kernel-hull-stage0-file: content is required");
      const filename = typeof record["filename"] === "string" && record["filename"].trim() !== "" ? record["filename"].trim() : undefined;
      return jsonResource(prepareRelationalHullStage0BoundaryFile(kernelRoot(args, root), {
        content,
        ...(filename === undefined ? {} : { filename }),
      }, { write: args["write"] === "true" || args["write"] === "" }), "relational hull stage-0 boundary file");
    },
  });
}

export function kernelRelationalHullStage0Actions(options: RelationalHullStage0ActionOptions): readonly Action[] {
  return Object.freeze([
    relationalHullStage0BoundaryAction(options),
    addRelationalHullStage0BoundaryFileAction(options),
  ]);
}

export const planStaticSitePublicationAction: Action = action({
  verb: "plan-static-site-publication",
  inputFormat: "json",
  outputFormat: "json",
  options: ["path"],
  summary: "Plan static-site publication for a knowledge vault through a downstream site repository.",
  description: "Domain: { site, baseUrl, siteRoot, outDir, branch, buildCommand, commitMessage, artifactPaths }. --path sets the knowledge-vault root. Codomain: a dry-run publication route with concrete inspect/build/commit/push commands.",
  domainSchema: Object.freeze({ type: "object", description: "a static-site publication plan request" }),
  codomain: staticSitePublishPlanCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue =>
    jsonResource(planStaticSitePublication(corpusRoot(args), jsonRecord(input, "plan-static-site-publication")), "static site publication plan"),
});

export const claimDocumentTypeAction: Action = action({
  verb: "claim-document-type",
  inputFormat: "json",
  outputFormat: "json",
  options: ["path", "base", "t"],
  summary: "Append a JSON Schema fragment to a corpus document type assertion log.",
  domainSchema: Object.freeze({ type: "object", description: "{ typePath, fragment, t, base? }" }),
  codomain: documentTypeClaimCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const record = jsonRecord(input, "claim-document-type");
    const fragment = record["fragment"];
    if (fragment === undefined) throw new TypeError("claim-document-type: fragment is required");
    const t = typeof record["t"] === "string" && record["t"].trim() !== "" ? record["t"].trim() : typeof args["t"] === "string" ? args["t"] : "";
    const base = typeof record["base"] === "string" ? record["base"] : typeof args["base"] === "string" ? args["base"] : undefined;
    return jsonResource(claimDocumentType(corpusRoot(args), typePathFrom(input, args, "claim-document-type"), fragment, { ...(base === undefined ? {} : { base }), t }), "document type claim");
  },
});

export const projectDocumentTypeAction: Action = action({
  verb: "project-document-type",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "typePath", "kindDir", "base"],
  summary: "Settle a corpus document type assertion log into a projected JSON Schema.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus-relative document type directory" }),
  codomain: documentTypeProjectionCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const base = typeof args["base"] === "string" ? args["base"] : undefined;
    return jsonResource(projectDocumentType(corpusRoot(args), typePathFrom(input, args, "project-document-type"), base === undefined ? {} : { base }), "document type projection");
  },
});

export const buildDocumentTypesAction: Action = action({
  verb: "build-document-types",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "under", "base", "t"],
  summary: "Build the built-in markdown document type catalog under the corpus.",
  domainSchema: Object.freeze({ type: "string", description: "optional corpus-relative document-types directory" }),
  codomainSchema: Object.freeze({ type: "array", items: { $ref: "organizing/knowledge-vault/corpus/document-type-projection" } }),
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const under = typeof input === "string" && input.trim() !== "" ? input.trim() : typeof args["under"] === "string" ? args["under"] : undefined;
    const base = typeof args["base"] === "string" ? args["base"] : undefined;
    const t = typeof args["t"] === "string" ? args["t"] : undefined;
    return jsonResource(buildBuiltinDocumentTypes(corpusRoot(args), { ...(under === undefined ? {} : { under }), ...(base === undefined ? {} : { base }), ...(t === undefined ? {} : { t }) }), "document type projections");
  },
});

export const realizeDocumentTypeAction: Action = action({
  verb: "realize-document-type",
  inputFormat: "json",
  outputFormat: "json",
  options: ["path", "write"],
  summary: "Realize a markdown document from a projected corpus document type schema.",
  domainSchema: Object.freeze({ type: "object", description: "{ typePath, at, name, description, slug?, date?, values? }" }),
  codomain: documentTypeRealizationCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const record = jsonRecord(input, "realize-document-type");
    const values = record["values"];
    return jsonResource(realizeDocumentType(corpusRoot(args), typePathFrom(input, args, "realize-document-type"), {
      at: typeof record["at"] === "string" ? record["at"] : "",
      name: typeof record["name"] === "string" ? record["name"] : "",
      description: typeof record["description"] === "string" ? record["description"] : "",
      ...(typeof record["slug"] === "string" ? { slug: record["slug"] } : {}),
      ...(typeof record["date"] === "string" ? { date: record["date"] } : {}),
      ...(values !== null && typeof values === "object" && !Array.isArray(values) ? { values: values as Readonly<Record<string, JsonValue>> } : {}),
      write: args["write"] === "true" || args["write"] === "",
    }), "document type realization");
  },
});

export const auditDocumentTypeAction: Action = action({
  verb: "audit-document-type",
  inputFormat: "string",
  outputFormat: "json",
  options: ["path", "typePath", "catalogPath"],
  summary: "Audit an existing markdown resource against a projected corpus document type schema.",
  domainSchema: Object.freeze({ type: "string", description: "a corpus-relative markdown resource path" }),
  codomain: documentTypeAuditCarrier,
  run: (input: JsonValue, args: JsonRecord): JsonValue => {
    const relative = typeof input === "string" ? input.trim() : admitAddress(input, "audit-document-type");
    const typePath = typeof args["typePath"] === "string" ? args["typePath"] : undefined;
    const catalogPath = typeof args["catalogPath"] === "string" ? args["catalogPath"] : undefined;
    return jsonResource(auditDocumentType(corpusRoot(args), relative, { ...(typePath === undefined ? {} : { typePath }), ...(catalogPath === undefined ? {} : { catalogPath }) }), "document type audit");
  },
});

export const actions: readonly Action[] = Object.freeze([
  researchAction,
  knowAction,
  introduceAction,
  studyAction,
  explainAction,
  teachAction,
  learnAction,
  tutorAction,
  inspectRootAction,
  browseAction,
  locateAction,
  readAction,
  listAction,
  findNameAction,
  grepTextAction,
  catalogAction,
  catalogFacetAction,
  settleMemoryAction,
  observeAction,
  conceptMapAction,
  inspectTopicAction,
  measureGapAction,
  inspectHealthAction,
  normalizationPlanAction,
  topicGuidanceAction,
  organizeCorpusAction,
  createDocumentAction,
  updateFrontmatterAction,
  uploadTriageFileAction,
  planStaticSitePublicationAction,
  claimDocumentTypeAction,
  projectDocumentTypeAction,
  buildDocumentTypesAction,
  realizeDocumentTypeAction,
  auditDocumentTypeAction,
]);

export const resources = agentResources;
export const prompts = agentPrompts;
export const legs = Object.freeze([
  ...actions,
  ...resources,
  ...prompts,
]);
