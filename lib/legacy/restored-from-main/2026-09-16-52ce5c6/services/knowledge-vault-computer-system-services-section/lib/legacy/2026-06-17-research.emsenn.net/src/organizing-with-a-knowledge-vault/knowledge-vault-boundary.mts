import type { CorpusClient } from "./corpus-client.mts";
import { callDraftModel, draftModelConfig, draftProvider } from "./corpus-operations.mts";
import {
  gateObstruction,
  gateWitness,
  productionMove,
  productionStrategyReading,
  type GateJudgment,
  type ProductionMove,
} from "@emsenn/producing-content";
import { admitCorpusBoundaryDocuments, draftKindForCorpusDocumentKind, isTriagePath, normalizeCorpusDocumentKind, type CorpusBoundaryDocument } from "@emsenn/organizing-a-knowledge-vault/corpus";
import { parseAddressedPaths, pathQueryVariants, topicQueryVariants } from "@emsenn/organizing-a-knowledge-vault/addressing";
import { memoryHealthProjection, normalizationPlanDashboard } from "@emsenn/organizing-a-knowledge-vault/holography";
import {
  buildNominationPrompt,
  conceptMapDraftContext,
  conceptMapDraftPaths,
  conceptMapTags,
  planTopicConceptMap,
  parseNominationResponse,
  planMemoryNormalization,
  planTopicGapMeasurement,
  planTopicInspection,
  prepareNormalizationOperations,
  type FrontmatterOperation,
  type PreparedNormalizationOperation,
  type TopicConceptMapInput,
} from "@emsenn/organizing-a-knowledge-vault/mutating";

export type KnowledgeVaultBoundaryOperation =
  | "knowledge_vault_inspect_topic"
  | "knowledge_vault_concept_map"
  | "knowledge_vault_measure_gap"
  | "knowledge_vault_health"
  | "knowledge_vault_normalization_plan"
  | "knowledge_vault_normalize"
  | "document_compose"
  | "document_draft"
  | "document_prepare"
  | "document_create"
  | "document_update_frontmatter"
  | "document_update_body"
  | "nominate_placement"
  | "corpus_grep"
  | "corpus_find"
  | "corpus_list"
  | "corpus_read";

export async function callKnowledgeVaultBoundary(
  name: string,
  args: Readonly<Record<string, unknown>>,
  client: CorpusClient,
): Promise<unknown> {
  if (name === "knowledge_vault_inspect_topic") return knowledgeVaultInspectTopic(args, client);
  if (name === "knowledge_vault_concept_map") return knowledgeVaultConceptMap(args, client);
  if (name === "knowledge_vault_measure_gap") return knowledgeVaultMeasureGap(args, client);
  if (name === "knowledge_vault_health") return knowledgeVaultHealth(args, client);
  if (name === "knowledge_vault_normalization_plan") return knowledgeVaultNormalizationPlan(args, client);
  if (name === "knowledge_vault_normalize") return knowledgeVaultNormalize(args, client);
  if (name === "document_compose") return documentCompose(args, client);
  if (name === "document_draft") return documentDraft(args, client);
  if (name === "document_prepare") return documentPrepare(args, client);
  if (name === "document_create") return documentCreate(args, client);
  if (name === "document_update_frontmatter") return documentUpdateFrontmatter(args, client);
  if (name === "document_update_body") return documentUpdateBody(args, client);
  if (name === "nominate_placement") return nominatePlacement(args, client);
  if (name === "corpus_grep") return corpusGrep(args, client);
  if (name === "corpus_find") return corpusFind(args, client);
  if (name === "corpus_list") return corpusList(args, client);
  if (name === "corpus_read") return corpusRead(args, client);
  throw new Error(`unknown tool: ${name}`);
}

export async function knowledgeVaultHealth(
  args: Readonly<Record<string, unknown>>,
  client: CorpusClient,
): Promise<unknown> {
  const explicit = parseAddressedPaths(args["paths"]);
  const limit = clampNumber(args["limit"], 24, 1, 40);
  const paths = explicit.length > 0
    ? explicit.slice(0, 40)
    : await collectCorpusFiles(client, typeof args["path"] === "string" ? args["path"] : "", limit);
  if (paths.length === 0) throw new Error("paths must include at least one corpus file path");
  const documents = await Promise.all(paths.map((path) => boundaryDocument(path, client)));
  const health = memoryHealthProjection(admitBoundaryMemory(documents));
  return {
    kind: "research.knowledge-vault.health",
    source: explicit.length > 0 ? { kind: "explicit-paths" } : { kind: "directory-sample", path: typeof args["path"] === "string" ? args["path"] : "", limit },
    admittedPaths: health.admittedPaths,
    dashboard: health.dashboard,
    carrierReading: health.carrierReading,
  };
}

export async function knowledgeVaultNormalizationPlan(
  args: Readonly<Record<string, unknown>>,
  client: CorpusClient,
): Promise<unknown> {
  const explicit = parseAddressedPaths(args["paths"]);
  const limit = clampNumber(args["limit"], 24, 1, 40);
  const paths = explicit.length > 0
    ? explicit.slice(0, 40)
    : await collectCorpusFiles(client, typeof args["path"] === "string" ? args["path"] : "", limit);
  if (paths.length === 0) throw new Error("paths must include at least one corpus file path");
  const documents = await Promise.all(paths.map((path) => boundaryDocument(path, client)));
  const plan = planMemoryNormalization(admitBoundaryMemory(documents));
  return {
    kind: "research.knowledge-vault.normalization-plan",
    source: explicit.length > 0 ? { kind: "explicit-paths" } : { kind: "directory-sample", path: typeof args["path"] === "string" ? args["path"] : "", limit },
    admittedPaths: documentPaths(documents),
    dashboard: normalizationPlanDashboard(plan),
    carrierReading: plan,
  };
}

export async function knowledgeVaultNormalize(
  args: Readonly<Record<string, unknown>>,
  client: CorpusClient,
): Promise<unknown> {
  const explicit = parseAddressedPaths(args["paths"]);
  const limit = clampNumber(args["limit"], 24, 1, 40);
  const paths = explicit.length > 0
    ? explicit.slice(0, 40)
    : await collectCorpusFiles(client, typeof args["path"] === "string" ? args["path"] : "", limit);
  if (paths.length === 0) throw new Error("paths must include at least one corpus file path");
  const documents = await Promise.all(paths.map((path) => boundaryDocument(path, client)));
  const plan = planMemoryNormalization(admitBoundaryMemory(documents));
  const rule = typeof args["rule"] === "string" && args["rule"].trim().length > 0 ? args["rule"].trim() : "";
  const dryRun = typeof args["dryRun"] === "boolean" ? args["dryRun"] : true;
  const prepared = prepareNormalizationOperations(plan.items, {
    dryRun,
    ...(rule.length > 0 ? { rule } : {}),
  });
  const operations = prepared.filter((item): item is PreparedNormalizationOperation & { readonly operation: FrontmatterOperation } =>
    item.operation !== undefined);
  const applied = [];
  for (const preparedOperation of operations) {
    const response = await client.documentFrontmatter(preparedOperation.operation);
    const body = objectRecord(response.json);
    applied.push(Object.freeze({
      path: preparedOperation.operation.path,
      rule: preparedOperation.item.rule,
      action: preparedOperation.item.action,
      status: response.status,
      dryRun: body?.["dryRun"],
      written: body?.["written"],
      findings: body?.["findings"],
      references: body?.["references"],
      error: body?.["error"],
      message: body?.["message"],
    }));
  }
  return {
    kind: "research.knowledge-vault.normalize",
    dryRun,
    rule: rule.length > 0 ? rule : null,
    plan: {
      kind: "research.knowledge-vault.normalization-plan",
      source: explicit.length > 0 ? { kind: "explicit-paths" } : { kind: "directory-sample", path: typeof args["path"] === "string" ? args["path"] : "", limit },
      admittedPaths: documentPaths(documents),
      dashboard: normalizationPlanDashboard(plan),
    },
    candidates: prepared.length,
    operations: operations.map((item) => item.operation),
    review: prepared.filter((item) => item.review !== undefined),
    applied,
  };
}

export async function knowledgeVaultInspectTopic(
  args: Readonly<Record<string, unknown>>,
  client: CorpusClient,
): Promise<unknown> {
  const topic = String(args["topic"] ?? args["q"] ?? "").trim();
  if (topic.length < 2) throw new Error("topic must be at least two characters");
  const limit = clampNumber(args["limit"], 40, 1, 80);
  const documentLimit = clampNumber(args["documents"], 12, 1, 24);
  const scope = typeof args["path"] === "string" && args["path"].trim().length > 0 ? args["path"].trim() : "";
  const variants = topicQueryVariants(topic);
  const grepRuns = await Promise.all(variants.map((variant) => topicGrep(client, variant, scope, Math.max(8, Math.ceil(limit / 2)))));
  const pathRuns = await Promise.all(pathQueryVariants(topic).map((variant) => topicPathSearch(client, variant, scope, documentLimit)));
  const evidence = grepRuns.flatMap((run) => run.hits.map((hit) => ({ ...hit, query: run.query }))).slice(0, limit);
  const paths = uniqueStrings([
    ...evidence.map((hit) => hit.path),
    ...pathRuns.flatMap((run) => run.paths),
  ]).slice(0, documentLimit);
  const documents = await Promise.all(paths.map((path) => boundaryDocument(path, client)));
  const inspection = planTopicInspection(admitBoundaryMemory(documents), topic);
  return {
    kind: "research.knowledge-vault.topic",
    topic,
    dashboard: {
      ...inspection.dashboard,
      queryVariants: variants,
      pathQueries: pathRuns,
      hitCount: evidence.length,
      sampleEvidence: evidence.slice(0, 20),
    },
    carrierReadings: inspection.carrierReadings,
    searched: {
      kind: "corpus.content-search",
      grepRuns: grepRuns.map((run) => ({
        query: run.query,
        filesScanned: run.filesScanned,
        filesMatched: run.filesMatched,
        hits: run.hits.length,
        truncated: run.truncated,
        scanTruncated: run.scanTruncated,
      })),
    },
    admittedPaths: inspection.admittedPaths,
  };
}

type ConceptMapFile = Readonly<{
  document: CorpusBoundaryDocument;
  frontmatter: Readonly<Record<string, unknown>>;
}>;

export async function knowledgeVaultConceptMap(
  args: Readonly<Record<string, unknown>>,
  client: CorpusClient,
): Promise<unknown> {
  const topic = String(args["topic"] ?? args["q"] ?? "").trim();
  if (topic.length < 2) throw new Error("topic must be at least two characters");
  const explicit = parseAddressedPaths(args["paths"]);
  const limit = clampNumber(args["limit"], 40, 1, 80);
  const documentLimit = clampNumber(args["documents"], 16, 1, 32);
  const scope = typeof args["path"] === "string" && args["path"].trim().length > 0 ? args["path"].trim() : "";
  const variants = topicQueryVariants(topic);
  const grepRuns = explicit.length > 0
    ? []
    : await Promise.all(variants.map((variant) => topicGrep(client, variant, scope, Math.max(8, Math.ceil(limit / 2)))));
  const pathRuns = explicit.length > 0
    ? []
    : await Promise.all(pathQueryVariants(topic).map((variant) => topicPathSearch(client, variant, scope, documentLimit)));
  const evidence = grepRuns.flatMap((run) => run.hits.map((hit) => ({ ...hit, query: run.query }))).slice(0, limit);
  const paths = explicit.length > 0
    ? explicit.slice(0, documentLimit)
    : uniqueStrings([
        ...evidence.map((hit) => hit.path),
        ...pathRuns.flatMap((run) => run.paths),
      ]).slice(0, documentLimit);
  if (paths.length === 0) throw new Error("no corpus documents matched the requested topic");
  const files = await Promise.all(paths.map((path) => conceptMapFile(path, client)));
  const documents = files.map((file) => file.document);
  const memory = admitBoundaryMemory(documents);
  const map = planTopicConceptMap(memory, topic, files.map((file): TopicConceptMapInput => ({
    path: file.document.path,
    frontmatter: file.frontmatter,
  })));
  return {
    kind: "research.knowledge-vault.concept-map",
    topic,
    source: explicit.length > 0
      ? { kind: "explicit-paths" }
      : { kind: "topic-search", path: scope || "", queryVariants: variants, pathQueries: pathRuns },
    dashboard: {
      ...map.dashboard,
      sampleEvidence: evidence.slice(0, 20),
    },
    resources: map.resources,
    carrierReadings: map.carrierReadings,
    searched: {
      kind: "corpus.content-search",
      grepRuns: grepRuns.map((run) => ({
        query: run.query,
        filesScanned: run.filesScanned,
        filesMatched: run.filesMatched,
        hits: run.hits.length,
        truncated: run.truncated,
        scanTruncated: run.scanTruncated,
      })),
    },
    admittedPaths: map.admittedPaths,
  };
}

export async function knowledgeVaultMeasureGap(
  args: Readonly<Record<string, unknown>>,
  client: CorpusClient,
): Promise<unknown> {
  const topic = String(args["topic"] ?? args["q"] ?? "").trim();
  if (topic.length < 2) throw new Error("topic must be at least two characters");
  const limit = clampNumber(args["limit"], 40, 1, 80);
  const documentLimit = clampNumber(args["documents"], 12, 1, 24);
  const scope = typeof args["path"] === "string" && args["path"].trim().length > 0 ? args["path"].trim() : "";
  const variants = topicQueryVariants(topic);
  const grepRuns = await Promise.all(variants.map((variant) => topicGrep(client, variant, scope, Math.max(8, Math.ceil(limit / 2)))));
  const pathRuns = await Promise.all(pathQueryVariants(topic).map((variant) => topicPathSearch(client, variant, scope, documentLimit)));
  const evidence = grepRuns.flatMap((run) => run.hits.map((hit) => ({ ...hit, query: run.query }))).slice(0, limit);
  const paths = uniqueStrings([
    ...evidence.map((hit) => hit.path),
    ...pathRuns.flatMap((run) => run.paths),
  ]).slice(0, documentLimit);
  const documents = await Promise.all(paths.map((path) => boundaryDocument(path, client)));
  const measurement = planTopicGapMeasurement(admitBoundaryMemory(documents), topic);
  return {
    kind: "research.knowledge-vault.gap-measurement",
    topic,
    dashboard: {
      ...measurement.dashboard,
      queryVariants: variants,
      pathQueries: pathRuns,
      hitCount: evidence.length,
      sampleEvidence: evidence.slice(0, 20),
    },
    carrierReading: measurement.carrierReading,
    guidance: measurement.guidance,
    searched: {
      kind: "corpus.content-search",
      grepRuns: grepRuns.map((run) => ({
        query: run.query,
        filesScanned: run.filesScanned,
        filesMatched: run.filesMatched,
        hits: run.hits.length,
        truncated: run.truncated,
        scanTruncated: run.scanTruncated,
      })),
    },
    admittedPaths: measurement.admittedPaths,
  };
}

export async function corpusGrep(args: Readonly<Record<string, unknown>>, client: CorpusClient): Promise<unknown> {
  const q = String(args["query"] ?? args["q"] ?? "").trim();
  const query: Record<string, string> = { q };
  if (typeof args["path"] === "string") query["path"] = args["path"];
  if (typeof args["limit"] === "number") query["limit"] = String(args["limit"]);
  return (await client.grep(query)).json;
}

export async function corpusFind(args: Readonly<Record<string, unknown>>, client: CorpusClient): Promise<unknown> {
  const q = String(args["query"] ?? args["q"] ?? "").trim();
  const query: Record<string, string> = { q };
  if (typeof args["path"] === "string") query["path"] = args["path"];
  if (typeof args["limit"] === "number") query["limit"] = String(args["limit"]);
  return (await client.search(query)).json;
}

export async function corpusList(args: Readonly<Record<string, unknown>>, client: CorpusClient): Promise<unknown> {
  const p = typeof args["path"] === "string" ? args["path"].trim() : "";
  const query = typeof args["limit"] === "number"
    ? { counts: "1", limit: String(args["limit"]) }
    : { counts: "1" };
  return (await (p ? client.file(p, query) : client.roots())).json;
}

export async function corpusRead(args: Readonly<Record<string, unknown>>, client: CorpusClient): Promise<unknown> {
  const p = String(args["path"] ?? "").trim();
  const query: Record<string, string> = { sample: "1" };
  if (typeof args["bytes"] === "number") query["bytes"] = String(args["bytes"]);
  return (await client.file(p, query)).json;
}

export async function documentCompose(args: Readonly<Record<string, unknown>>, client: CorpusClient): Promise<unknown> {
  const topic = String(args["topic"] ?? args["q"] ?? args["concept"] ?? "").trim();
  if (topic.length < 2) throw new Error("topic must be at least two characters");
  const scope = String(args["scope"] ?? args["path"] ?? "").trim();
  const documentKind = normalizeCorpusDocumentKind(args["kind"]);
  const draftKind = draftKindForCorpusDocumentKind(documentKind);
  const title = String(args["title"] ?? "").trim() || titleCase(topic);
  const conceptMap = await knowledgeVaultConceptMap({
    topic,
    path: scope || undefined,
    limit: typeof args["limit"] === "number" ? args["limit"] : 32,
    documents: typeof args["documents"] === "number" ? args["documents"] : typeof args["maxFiles"] === "number" ? args["maxFiles"] : 10,
  }, client) as Record<string, unknown>;
  const draft = await documentDraft({
    topic,
    scope: scope || undefined,
    kind: draftKind,
    concept: typeof args["concept"] === "string" && args["concept"].trim().length > 0 ? args["concept"] : topic,
    audience: args["audience"],
    provider: args["provider"],
    documents: args["documents"],
    maxFiles: args["maxFiles"],
    maxBytes: args["maxBytes"],
    generate: booleanArg(args["generate"], false),
  }, client) as Record<string, unknown>;
  const draftBody = typeof draft["draft"] === "string" && draft["draft"].trim().length > 0 ? draft["draft"].trim() : "";
  const suppliedBody = typeof args["body"] === "string" && args["body"].trim().length > 0 ? args["body"].trim() : "";
  const sourcePaths = draftSources(draft);
  const tags = parseStringList(args["tags"]);
  const inferredTags = tags.length > 0 ? tags : conceptMapTags(conceptMap, topic);
  const documentBody = suppliedBody.length > 0
    ? suppliedBody
    : draftBody.length > 0
      ? draftBody
      : `# ${title}\n\nDraft generation is disabled or unavailable. Review the returned prompt and source bundle, then call document_draft with generate=true or provide a body to document_compose or document_prepare.\n`;
  const targetTopic = String(args["targetTopic"] ?? args["topicPath"] ?? scope ?? "").trim();
  const preparePayload: Record<string, unknown> = {
    topic: targetTopic.length > 0 ? targetTopic : "content",
    kind: documentKind,
    title,
    tags: inferredTags,
    aliases: parseStringList(args["aliases"]),
    status: String(args["status"] ?? "draft"),
    frontmatter: {
      sources: sourcePaths,
      draftedFromTopic: topic,
    },
    body: documentBody,
  };
  if (typeof args["targetPath"] === "string" && args["targetPath"].trim().length > 0) {
    preparePayload["targetPath"] = args["targetPath"].trim();
  }
  const prepared = await documentPrepare(preparePayload, client);
  const generated = draftBody.length > 0;
  const bodySource = suppliedBody.length > 0 ? "supplied" : generated ? "generated" : "scaffold";
  const gates = composeGateJudgments({ conceptMap, draft, prepared, generated });
  const nextMoves = composeNextMoves(prepared, preparePayload, bodySource, {
    topic,
    scope,
    kind: draftKind,
    concept: typeof args["concept"] === "string" && args["concept"].trim().length > 0 ? args["concept"] : topic,
    audience: args["audience"],
    provider: args["provider"],
    documents: args["documents"],
    maxFiles: args["maxFiles"],
    maxBytes: args["maxBytes"],
  });
  const production = productionStrategyReading({
    arena: "research.knowledge-vault.document-production",
    strategy: "knowledge-vault-document-draft",
    assignment: {
      topic,
      documentKind,
      title,
      targetTopic: preparePayload["topic"],
      tags: inferredTags,
      bodySource,
    },
    moves: [
      productionMove({ name: "knowledge_vault_concept_map", executed: true, payload: { topic, path: scope || undefined }, result: conceptMapSummary(conceptMap) }),
      productionMove({ name: "document_draft", executed: true, payload: { topic, scope: scope || undefined, kind: draftKind, generate: booleanArg(args["generate"], false) }, result: draftSummary(draft) }),
      productionMove({ name: "document_prepare", executed: prepared !== null, payload: preparePayload, result: prepareSummary(prepared) }),
    ],
    gates,
    nextMoves,
    evidence: {
      conceptMap,
      draft,
      prepared,
    },
  });
  return {
    kind: "research.document.compose",
    topic,
    documentKind,
    title,
    generated,
    bodySource,
    production,
    gates,
    conceptMap,
    draft,
    prepared,
    proposedDocument: preparePayload,
    nextActions: nextMoves,
  };
}

export async function documentDraft(args: Readonly<Record<string, unknown>>, client: CorpusClient): Promise<unknown> {
  const topic = String(args["topic"] ?? "").trim();
  const hasPath = typeof args["path"] === "string" && args["path"].trim().length > 0;
  const hasPaths = parseAddressedPaths(args["paths"]).length > 0;
  if (topic.length >= 2 && !hasPath && !hasPaths) {
    const conceptMap = await knowledgeVaultConceptMap({
      topic,
      path: typeof args["scope"] === "string" ? args["scope"] : typeof args["searchPath"] === "string" ? args["searchPath"] : undefined,
      limit: typeof args["limit"] === "number" ? args["limit"] : 32,
      documents: typeof args["documents"] === "number" ? args["documents"] : typeof args["maxFiles"] === "number" ? args["maxFiles"] : 10,
    }, client) as Record<string, unknown>;
    const paths = conceptMapDraftPaths(conceptMap, clampNumber(args["maxFiles"], 8, 1, 20));
    const response = (await client.draft({
      ...args,
      concept: typeof args["concept"] === "string" && args["concept"].trim().length > 0 ? args["concept"] : topic,
      paths,
      context: conceptMapDraftContext(conceptMap),
    })).json as Record<string, unknown>;
    return {
      ...response,
      topicContext: conceptMapDraftContext(conceptMap),
    };
  }
  return (await client.draft(args)).json;
}

export async function documentPrepare(args: Readonly<Record<string, unknown>>, client: CorpusClient): Promise<unknown> {
  return (await client.documentPrepare(args)).json;
}

export async function documentCreate(args: Readonly<Record<string, unknown>>, client: CorpusClient): Promise<unknown> {
  return (await client.documentCreate(args)).json;
}

export async function documentUpdateFrontmatter(args: Readonly<Record<string, unknown>>, client: CorpusClient): Promise<unknown> {
  return (await client.documentFrontmatter(args)).json;
}

export async function documentUpdateBody(args: Readonly<Record<string, unknown>>, client: CorpusClient): Promise<unknown> {
  return (await client.documentBody(args)).json;
}

export async function nominatePlacement(
  args: Readonly<Record<string, unknown>>,
  client: CorpusClient,
): Promise<unknown> {
  const path = String(args["path"] ?? "").trim();
  if (!isTriagePath(path)) throw new Error("path must begin with _triage/ or triage/");
  const bytes = typeof args["bytes"] === "number" ? String(args["bytes"]) : "16000";
  const file = (await client.file(path, { sample: "1", bytes })).json as {
    frontmatter?: Readonly<Record<string, unknown>>;
    sample?: { text?: string };
  };
  const text = file.sample?.text ?? "";
  if (text.trim().length === 0) throw new Error("triage document has no readable text sample");
  const title = titleFromTriage(file.frontmatter, path);
  const topics = await contentTopicSkeleton(client);
  const prompt = buildNominationPrompt({ title, text, topics });
  const config = draftModelConfig(draftProvider(args["provider"]));
  if (config.apiKey === "" || config.model === "" || config.baseUrl === "") {
    throw new Error(`nomination model provider ${config.provider} is not configured`);
  }
  const reply = await callDraftModel(config, prompt);
  const nomination = parseNominationResponse(reply);
  return {
    kind: "research.placement.nominate",
    source: { path },
    nomination,
    nextActions: Object.freeze([
      {
        kind: "prepare-document",
        reason: "Prepare a corpus document from the triage source after reading the uploaded content.",
        payload: {
          topic: nomination.topic,
          title: nomination.title,
          kind: nomination.kind,
          tags: nomination.tags,
        },
      },
    ]),
  };
}

async function contentTopicSkeleton(client: CorpusClient): Promise<readonly string[]> {
  const paths: string[] = [];
  const level1 = await topicDirectories(client, "");
  for (const first of level1) {
    paths.push(first);
    for (const second of await topicDirectories(client, first)) paths.push(second);
  }
  return uniqueStrings(paths);
}

async function topicDirectories(client: CorpusClient, topicPath: string): Promise<readonly string[]> {
  const response = await client.topics(topicPath.length > 0 ? { path: topicPath, limit: "200" } : { limit: "200" });
  const entries = (response.json as { entries?: readonly { filesystemKind?: string; path?: string }[] }).entries ?? [];
  return entries
    .filter((entry) => entry.filesystemKind === "directory" && typeof entry.path === "string")
    .map((entry) => entry.path as string);
}

function documentPaths(documents: readonly CorpusBoundaryDocument[]): readonly string[] {
  return Object.freeze(documents.map((document) => document.path));
}

function admitBoundaryMemory(documents: readonly CorpusBoundaryDocument[]) {
  return admitCorpusBoundaryDocuments("research.emsenn.net", documents);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseStringList(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return Object.freeze(value
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter((item) => item.length > 0));
  }
  if (typeof value !== "string") return Object.freeze([]);
  return Object.freeze(value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0));
}

function titleFromTriage(frontmatter: Readonly<Record<string, unknown>> | undefined, sourcePath: string): string {
  const title = frontmatter?.["title"];
  if (typeof title === "string" && title.trim().length > 0) return title.trim();
  const sourceName = frontmatter?.["source-name"];
  if (typeof sourceName === "string" && sourceName.trim().length > 0) return titleCase(sourceName.replace(/\.[^.]+$/, ""));
  const basename = sourcePath.split("/").at(-1)?.replace(/\.md$/, "") ?? "triage note";
  return titleCase(basename);
}

function preparedTargetPath(prepared: unknown): string | undefined {
  if (prepared !== null && typeof prepared === "object" && !Array.isArray(prepared)) {
    const record = prepared as Record<string, unknown>;
    return typeof record["targetPath"] === "string" && record["targetPath"].length > 0 ? record["targetPath"] : undefined;
  }
  return undefined;
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

async function topicGrep(
  client: CorpusClient,
  queryText: string,
  scope: string,
  limit: number,
): Promise<{
  query: string;
  filesScanned?: unknown;
  filesMatched?: unknown;
  truncated?: unknown;
  scanTruncated?: unknown;
  hits: readonly { path: string; lineNumber: number; line: string }[];
}> {
  const query: Record<string, string> = { q: queryText, limit: String(limit), perFile: "2" };
  if (scope.length > 0) query["path"] = scope;
  const result = (await client.grep(query)).json as {
    filesScanned?: unknown;
    filesMatched?: unknown;
    truncated?: unknown;
    scanTruncated?: unknown;
    hits?: readonly { path: string; lineNumber: number; line: string }[];
  };
  return {
    query: queryText,
    filesScanned: result.filesScanned,
    filesMatched: result.filesMatched,
    truncated: result.truncated,
    scanTruncated: result.scanTruncated,
    hits: result.hits ?? [],
  };
}

async function topicPathSearch(
  client: CorpusClient,
  queryText: string,
  scope: string,
  limit: number,
): Promise<{ query: string; paths: readonly string[] }> {
  const query: Record<string, string> = { q: queryText, limit: String(limit) };
  if (scope.length > 0) query["path"] = scope;
  const result = (await client.search(query)).json as {
    results?: readonly { path: string; filesystemKind?: string }[];
  };
  return {
    query: queryText,
    paths: Object.freeze((result.results ?? [])
      .filter((entry) => entry.filesystemKind !== "directory")
      .map((entry) => entry.path)),
  };
}

async function boundaryDocument(path: string, client: CorpusClient): Promise<CorpusBoundaryDocument> {
  const result = (await client.file(path, { sample: "1", bytes: "200000" })).json as {
    path?: string;
    sample?: { text?: string };
  };
  return {
    path: typeof result.path === "string" ? result.path : path,
    text: result.sample?.text ?? "",
  };
}

async function conceptMapFile(path: string, client: CorpusClient): Promise<ConceptMapFile> {
  const result = (await client.file(path, { sample: "1", bytes: "200000" })).json as {
    path?: string;
    frontmatter?: Readonly<Record<string, unknown>>;
    sample?: { text?: string };
  };
  const documentPath = typeof result.path === "string" ? result.path : path;
  return {
    document: {
      path: documentPath,
      text: result.sample?.text ?? "",
    },
    frontmatter: result.frontmatter ?? {},
  };
}

function booleanArg(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function draftSources(draft: Readonly<Record<string, unknown>>): readonly string[] {
  const sources = draft["sources"];
  if (!Array.isArray(sources)) return Object.freeze([]);
  return Object.freeze(sources
    .map((source) => source !== null && typeof source === "object" && !Array.isArray(source) ? (source as Record<string, unknown>)["path"] : "")
    .filter((path): path is string => typeof path === "string" && path.length > 0));
}

function composeGateJudgments(input: Readonly<{
  conceptMap: Readonly<Record<string, unknown>>;
  draft: Readonly<Record<string, unknown>>;
  prepared: unknown;
  generated: boolean;
}>): readonly GateJudgment[] {
  const sourceCount = draftSources(input.draft).length;
  const prompt = input.draft["prompt"];
  const promptReady = prompt !== null && typeof prompt === "object" && !Array.isArray(prompt);
  const gates = [
    sourceCount > 0
      ? gateWitness("research.sources.selected", [`${sourceCount} source(s) selected`])
      : gateObstruction("research.sources.selected", ["no draft sources were selected"]),
    promptReady
      ? gateWitness("research.prompt.ready", ["draft prompt returned for inspection"])
      : gateObstruction("research.prompt.ready", ["draft prompt was not returned"]),
    input.generated
      ? gateWitness("research.draft.generated", ["draft body returned by provider"])
      : gateObstruction("research.draft.generated", ["generation disabled or provider unavailable; inspect prompt before asking"]),
    prepareGate(input.prepared),
  ];
  return Object.freeze(gates);
}

function prepareGate(prepared: unknown): ReturnType<typeof gateWitness | typeof gateObstruction> {
  if (prepared === null || prepared === undefined) {
    return gateObstruction("research.document.prepare", ["document_prepare not run because no draft body was generated"]);
  }
  if (typeof prepared !== "object" || Array.isArray(prepared)) {
    return gateObstruction("research.document.prepare", ["document_prepare returned an unreadable response"]);
  }
  const lint = (prepared as Record<string, unknown>)["lint"];
  const errors = Array.isArray(lint)
    ? lint.filter((item) => item !== null && typeof item === "object" && !Array.isArray(item) && (item as Record<string, unknown>)["severity"] === "error")
    : [];
  return errors.length === 0
    ? gateWitness("research.document.prepare", ["document_prepare returned no error lint"])
    : gateObstruction("research.document.prepare", errors.map((item) => String((item as Record<string, unknown>)["message"] ?? "prepare error")));
}

function composeNextMoves(
  prepared: unknown,
  preparePayload: Readonly<Record<string, unknown>>,
  bodySource: string,
  draftPayload: Readonly<Record<string, unknown>>,
): readonly ProductionMove[] {
  if (bodySource === "scaffold") {
    return Object.freeze([
      productionMove({
        name: "document_draft",
        payload: { ...draftPayload, generate: true },
      }),
    ]);
  }
  const targetPath = preparedTargetPath(prepared);
  return Object.freeze([
    productionMove({
      name: "document_create",
      payload: targetPath === undefined ? preparePayload : { ...preparePayload, targetPath },
    }),
    ...(targetPath === undefined ? [] : [
      productionMove({
        name: "document_update_body",
        payload: {
          path: targetPath,
          body: preparePayload["body"],
          dryRun: true,
        },
      }),
    ]),
  ]);
}

function conceptMapSummary(conceptMap: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const dashboard = conceptMap["dashboard"];
  return Object.freeze({
    topic: conceptMap["topic"],
    admittedPaths: conceptMap["admittedPaths"],
    resourcesByKind: dashboard !== null && typeof dashboard === "object" && !Array.isArray(dashboard)
      ? (dashboard as Record<string, unknown>)["resourcesByKind"]
      : undefined,
    gaps: dashboard !== null && typeof dashboard === "object" && !Array.isArray(dashboard)
      ? (dashboard as Record<string, unknown>)["gaps"]
      : undefined,
  });
}

function draftSummary(draft: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.freeze({
    generation: draft["generation"],
    model: draft["model"],
    sourceBudget: draft["sourceBudget"],
    sources: draft["sources"],
    hasDraft: typeof draft["draft"] === "string" && draft["draft"].trim().length > 0,
  });
}

function prepareSummary(prepared: unknown): unknown {
  if (prepared === null || typeof prepared !== "object" || Array.isArray(prepared)) return prepared;
  const record = prepared as Record<string, unknown>;
  return Object.freeze({
    kind: record["kind"],
    path: record["path"],
    targetPath: record["targetPath"],
    exists: record["exists"],
    lint: record["lint"],
  });
}

async function collectCorpusFiles(client: CorpusClient, rootPath: string, limit: number): Promise<readonly string[]> {
  const start = rootPath.trim().length > 0 ? rootPath.trim() : "";
  const queue: string[] = [start];
  const files: string[] = [];
  const seen = new Set<string>();
  while (queue.length > 0 && files.length < limit) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const listing = (await client.file(current, { counts: "1" })).json as {
      filesystemKind?: string;
      path?: string;
      entries?: readonly { path: string; filesystemKind?: string }[];
    };
    if (listing.filesystemKind === "file") {
      files.push(listing.path ?? current);
      continue;
    }
    for (const entry of listing.entries ?? []) {
      if (files.length >= limit) break;
      if (entry.filesystemKind === "file") files.push(entry.path);
      else if (entry.filesystemKind === "directory") queue.push(entry.path);
    }
  }
  return Object.freeze(files);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return Object.freeze(out);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.trunc(value)))
    : fallback;
}
