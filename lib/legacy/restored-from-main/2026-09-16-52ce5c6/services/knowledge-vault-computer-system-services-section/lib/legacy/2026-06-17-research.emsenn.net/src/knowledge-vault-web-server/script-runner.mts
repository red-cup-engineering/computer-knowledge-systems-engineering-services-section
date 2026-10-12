import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import type { EAVT } from "@emsenn/relating/writing";
import { induceBins } from "@emsenn/relating";
import { actions as organizingVaultActions } from "@emsenn/organizing-a-knowledge-vault/actions";
import { admitCorpusBoundaryDocument, admitCorpusBoundaryDocuments, type CorpusBoundaryDocument } from "@emsenn/organizing-a-knowledge-vault/corpus";
import { planNormalizationEndomorphism } from "@emsenn/organizing-a-knowledge-vault/mutating";

import {
  assertAndFold,
  callKnowledgeVaultBoundary,
  createCorpusClientForRoot,
  findKnowledgeVaultName,
  foldFacts,
  grepKnowledgeVaultText,
  listKnowledgeVaultPath,
  readFacts,
  readKnowledgeVaultDocument,
  emsennContentRoot,
} from "../organizing-with-a-knowledge-vault/index.mts";

type JsonRecord = Record<string, unknown>;
type JsonOperation = (request: JsonRecord) => unknown | Promise<unknown>;

const corpusOperations = {
  "read-file": readKnowledgeVaultDocument,
  "list-path": listKnowledgeVaultPath,
  "find-name": findKnowledgeVaultName,
  "grep-text": grepKnowledgeVaultText,
} as const;

export async function readJsonRequest(): Promise<JsonRecord> {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  return objectRecord(input.trim().length > 0 ? JSON.parse(input) : {}) ?? {};
}

export function parseArgv(argv: readonly string[] = process.argv.slice(2)): JsonRecord {
  const out: JsonRecord = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (typeof arg !== "string" || !arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = scalar(next);
    index += 1;
  }
  return out;
}

export function mergeRequestAndArgv(request: unknown, argv: readonly string[] = process.argv.slice(2)): JsonRecord {
  return { ...(objectRecord(request) ?? {}), ...parseArgv(argv) };
}

export function runJsonOperation(metaUrl: string, operation: JsonOperation): void {
  if (process.argv[1] === undefined || metaUrl !== pathToFileURL(path.resolve(process.argv[1])).href) return;
  readJsonRequest()
    .then((request) => operation(mergeRequestAndArgv(request)))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${path.basename(process.argv[1] ?? "script")}: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}

export function runCorpusBin(metaUrl: string, operation: keyof typeof corpusOperations): void {
  const fn = corpusOperations[operation];
  runJsonOperation(metaUrl, (request) => fn(request as never));
}

export function runBoundaryBin(metaUrl: string, operation: string): void {
  runJsonOperation(metaUrl, (request) => {
    const root = path.resolve(typeof request.root === "string" ? request.root : emsennContentRoot());
    const client = createCorpusClientForRoot(root);
    return callKnowledgeVaultBoundary(operation, request, client);
  });
}

export function runOrganizingVaultBin(metaUrl: string, verb: "inspect-root" | "settle-memory" | "observe"): void {
  runJsonOperation(metaUrl, (request) => {
    const root = path.resolve(typeof request.root === "string" ? request.root : emsennContentRoot());
    const region = typeof request.region === "string"
      ? request.region
      : typeof request.path === "string"
        ? request.path
        : "";
    const argv = [verb, "--path", root];
    if (typeof request.limit === "number" || typeof request.limit === "string") argv.push("--limit", String(request.limit));
    const { dispatch } = induceBins(organizingVaultActions, { packageName: "@emsenn/organizing-a-knowledge-vault" });
    const result = dispatch(argv, region, {
      program: "organize-knowledge-vault",
      caller: { transport: "research.emsenn.net.script", bin: verb },
    });
    if (result.code !== 0) throw new Error(result.stderr.trim() || `organizing knowledge vault action failed: ${verb}`);
    return JSON.parse(result.stdout);
  });
}

export function runOrganizingVaultAdmissionBin(metaUrl: string, operation: "document" | "memory"): void {
  runJsonOperation(metaUrl, (request) => {
    const root = typeof request.root === "string" ? request.root : "research.emsenn.net";
    if (operation === "document") {
      const document = isBoundaryDocument(request.document)
        ? request.document
        : isBoundaryDocument(request)
          ? request
          : undefined;
      if (document === undefined) throw new Error("document is required");
      return admitCorpusBoundaryDocument(root, document);
    }
    const documents = boundaryDocumentsFromRequest(request);
    if (documents.length === 0) throw new Error("documents must include at least one boundary document");
    return admitCorpusBoundaryDocuments(root, documents);
  });
}

export function runOrganizingVaultNormalizationEndomorphismBin(metaUrl: string): void {
  runJsonOperation(metaUrl, (request) => {
    const name = typeof request.endomorphism === "string" ? request.endomorphism : "identity";
    const documents = boundaryDocumentsFromRequest(request);
    if (documents.length === 0) throw new Error("documents must include at least one boundary document");
    const root = typeof request.root === "string" ? request.root : "research.emsenn.net";
    const memory = admitCorpusBoundaryDocuments(root, documents);
    const planned = planNormalizationEndomorphism(memory, name);
    if (planned === null) throw new Error(`unsupported corpus normalization endomorphism: ${name}`);
    return planned;
  });
}

export function runNoOrganizingVaultStrategyBin(metaUrl: string): void {
  runJsonOperation(metaUrl, () => {
    throw new Error("endomorphism strategies belonged to the retired computing carrier surface; use corpus normalization plans or observations instead");
  });
}

export function runTripleStoreBin(metaUrl: string, operation: "assert-fact" | "read-facts"): void {
  runJsonOperation(metaUrl, async (request) => {
    const domain = String(request.domain ?? "").trim();
    if (domain.length === 0) throw new Error("domain is required");
    if (operation === "assert-fact") {
      const facts = Array.isArray(request.facts) ? request.facts as EAVT[] : [];
      return assertAndFold(domain, facts);
    }
    return foldFacts(domain, await readFacts(domain));
  });
}

function isBoundaryDocument(value: unknown): value is CorpusBoundaryDocument {
  return objectRecord(value) !== null && typeof (value as { path?: unknown }).path === "string" && typeof (value as { text?: unknown }).text === "string";
}

function boundaryDocumentsFromRequest(request: JsonRecord): readonly CorpusBoundaryDocument[] {
  const documents = Array.isArray(request.documents) ? request.documents.filter(isBoundaryDocument) : [];
  if (documents.length > 0) return Object.freeze(documents);
  return isBoundaryDocument(request.document) ? Object.freeze([request.document]) : Object.freeze([]);
}

function objectRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function scalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    return JSON.parse(value);
  }
  return value;
}
