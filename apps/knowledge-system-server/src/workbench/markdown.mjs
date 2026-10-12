/**
 * @packageDocumentation
 *
 * filesystem/services/markdown-workbench - file-backed Markdown workbench.
 *
 * This is the host-boundary action for working with a real Markdown file:
 * read it through filesystem, optionally apply structured Markdown edits as a
 * dry run or a journal admission, and return before/after workbench readouts.
 */
import path from "node:path";
import { canonicalJson } from "@red-cup-engineering/json-services-section";

import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";
import { schemaFrom } from "@red-cup-engineering/relating/carriers/schema";
import { applyMarkdownEdit, isMarkdownEditRequest, markdownEditRequestKind } from "@red-cup-engineering/markdown-engineering-services-section/apply-markdown-edit";
import { differentiateMarkdownDocuments } from "@red-cup-engineering/markdown-engineering-services-section/differentiate-markdown-documents";
import { readMarkdownWorkbench } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-workbench";
import { splitMarkdownFrontmatterFence } from "@red-cup-engineering/markdown-engineering-services-section/split-markdown-frontmatter-fence";
import { } from "@red-cup-engineering/json-services-section";
import { existsSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "@red-cup-engineering/computer-system-engine/filesystem";

/** The resource reader and writer this workbench runs through. A host that journals its file
 *  reads and writes (MetroPlat) passes them as `binding.resources`; otherwise the workbench reads
 *  the Markdown file and applies the edit to it directly. */
function resourcesOf(binding) {
  if (binding.resources !== undefined) return binding.resources;
  const at = (target) => path.resolve(binding.dataRoot ?? process.cwd(), target);
  return Object.freeze({
    readAtRoot: async (_binding, { path: target }) => Object.freeze({
      type: "markdown",
      items: [Object.freeze({ workbench: readMarkdownWorkbench(readFileSync(at(target), "utf8"), { coordinate: target }) })],
    }),
    writeAtRoot: (_binding, { path: target, claim }) => {
      const text = existsSync(at(target)) ? readFileSync(at(target), "utf8") : claim.initialText ?? "";
      const applied = applyMarkdownEdit(text, claim);
      writeFileAtomic(at(target), applied.text);
      return Object.freeze({ observation: applied.receipt });
    },
  });
}

const markdownFileWorkbenchRequestSchema = {
  $id: "metroplat/filesystem/markdown-file-workbench-request",
  title: "MarkdownFileWorkbenchRequest",
  description: "Request to inspect and optionally transform one Markdown file path.",
  type: "object",
  required: ["path"],
  additionalProperties: false,
  properties: {
    path: { type: "string", minLength: 1 },
    operations: {
      type: "array",
      items: {
        type: "object",
        required: ["operation"],
        additionalProperties: true,
        properties: {
          operation: { type: "string" },
        },
      },
    },
    write: { type: "boolean" },
    createIfMissing: { type: "boolean" },
    initialText: { type: "string" },
    token: { type: "string" },
    at: { type: "string" },
  },
};

const markdownFileWorkbenchResponseSchema = {
  $id: "metroplat/filesystem/markdown-file-workbench-response",
  title: "MarkdownFileWorkbenchResponse",
  description: "Before/after workbench readouts and optional write receipt for one Markdown file path.",
  type: "object",
  required: ["kind", "path", "before", "text", "changed", "persisted"],
  additionalProperties: true,
  properties: {
    kind: { const: "metroplat.markdown.file-workbench-response" },
    path: { type: "string" },
    before: { type: "object", additionalProperties: true },
    after: { type: "object", additionalProperties: true },
    edit: { type: "object", additionalProperties: true },
    writeReceipt: { type: "object", additionalProperties: true },
    text: { type: "string" },
    changed: { type: "boolean" },
    persisted: { type: "boolean" },
  },
};

const markdownCorpusWorkbenchRequestSchema = {
  $id: "metroplat/filesystem/markdown-corpus-workbench-request",
  title: "MarkdownCorpusWorkbenchRequest",
  description: "Request to inspect and optionally transform every selected Markdown file under a root directory.",
  type: "object",
  required: ["root"],
  additionalProperties: false,
  properties: {
    root: { type: "string", minLength: 1 },
    paths: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    maxDepth: { type: "number" },
    maxFiles: { type: "number" },
    operations: markdownFileWorkbenchRequestSchema.properties.operations,
    write: { type: "boolean" },
    includeText: { type: "boolean" },
    token: { type: "string" },
    at: { type: "string" },
  },
};

const markdownCorpusWorkbenchResponseSchema = {
  $id: "metroplat/filesystem/markdown-corpus-workbench-response",
  title: "MarkdownCorpusWorkbenchResponse",
  description: "Aggregate readout for multi-file Markdown workbench inspection or transformation.",
  type: "object",
  required: ["kind", "root", "files", "changedFiles", "persistedFiles", "summary", "results"],
  additionalProperties: true,
  properties: {
    kind: { const: "metroplat.markdown.corpus-workbench-response" },
    root: { type: "string" },
    files: { type: "number" },
    changedFiles: { type: "number" },
    persistedFiles: { type: "number" },
    summary: { type: "object", additionalProperties: true },
    results: { type: "array", items: { type: "object", additionalProperties: true } },
  },
};

const markdownMetadataWorkbenchRequestSchema = {
  $id: "metroplat/filesystem/markdown-metadata-workbench-request",
  title: "MarkdownMetadataWorkbenchRequest",
  description: "Request to index, query, and optionally migrate Markdown frontmatter under a root directory.",
  type: "object",
  required: ["root"],
  additionalProperties: false,
  properties: {
    root: { type: "string", minLength: 1 },
    paths: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    maxDepth: { type: "number" },
    maxFiles: { type: "number" },
    where: {
      type: "object",
      additionalProperties: false,
      properties: {
        key: { type: "string", minLength: 1 },
        exists: { type: "boolean" },
        equals: {},
        includes: {},
      },
    },
    operations: markdownFileWorkbenchRequestSchema.properties.operations,
    write: { type: "boolean" },
    includeFrontmatter: { type: "boolean" },
    token: { type: "string" },
    at: { type: "string" },
  },
};

const markdownMetadataWorkbenchResponseSchema = {
  $id: "metroplat/filesystem/markdown-metadata-workbench-response",
  title: "MarkdownMetadataWorkbenchResponse",
  description: "Frontmatter field index, selector matches, and optional metadata migration results for Markdown files.",
  type: "object",
  required: ["kind", "root", "files", "matchedFiles", "changedFiles", "persistedFiles", "fields", "results"],
  additionalProperties: true,
  properties: {
    kind: { const: "metroplat.markdown.metadata-workbench-response" },
    root: { type: "string" },
    files: { type: "number" },
    matchedFiles: { type: "number" },
    changedFiles: { type: "number" },
    persistedFiles: { type: "number" },
    fields: { type: "object", additionalProperties: true },
    results: { type: "array", items: { type: "object", additionalProperties: true } },
  },
};

const markdownSearchWorkbenchRequestSchema = {
  $id: "metroplat/filesystem/markdown-search-workbench-request",
  title: "MarkdownSearchWorkbenchRequest",
  description: "Request to search and structurally filter Markdown files under a root directory.",
  type: "object",
  required: ["root"],
  additionalProperties: false,
  properties: {
    root: { type: "string", minLength: 1 },
    paths: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    maxDepth: { type: "number" },
    maxFiles: { type: "number" },
    query: { type: "string" },
    pattern: { type: "string" },
    flags: { type: "string" },
    scope: { enum: ["source", "body"] },
    caseSensitive: { type: "boolean" },
    where: markdownMetadataWorkbenchRequestSchema.properties.where,
    heading: { type: "string" },
    feature: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string" },
        target: { type: "string" },
        key: { type: "string" },
        value: { type: "string" },
      },
    },
    maxMatchesPerFile: { type: "number" },
    includeText: { type: "boolean" },
  },
};

const markdownSearchWorkbenchResponseSchema = {
  $id: "metroplat/filesystem/markdown-search-workbench-response",
  title: "MarkdownSearchWorkbenchResponse",
  description: "Corpus search results with source coordinates and structural Markdown filters.",
  type: "object",
  required: ["kind", "root", "files", "matchedFiles", "matches", "results"],
  additionalProperties: true,
  properties: {
    kind: { const: "metroplat.markdown.search-workbench-response" },
    root: { type: "string" },
    files: { type: "number" },
    matchedFiles: { type: "number" },
    matches: { type: "number" },
    results: { type: "array", items: { type: "object", additionalProperties: true } },
  },
};

const markdownDiffWorkbenchRequestSchema = {
  $id: "metroplat/filesystem/markdown-diff-workbench-request",
  title: "MarkdownDiffWorkbenchRequest",
  description: "Request to compare Markdown texts, files, or a proposed structured edit against a Markdown document.",
  type: "object",
  additionalProperties: false,
  properties: {
    root: { type: "string" },
    path: { type: "string", minLength: 1 },
    beforePath: { type: "string", minLength: 1 },
    beforeText: { type: "string" },
    afterPath: { type: "string", minLength: 1 },
    afterText: { type: "string" },
    operations: markdownFileWorkbenchRequestSchema.properties.operations,
    contextLines: { type: "number" },
  },
};

const markdownDiffWorkbenchResponseSchema = {
  $id: "metroplat/filesystem/markdown-diff-workbench-response",
  title: "MarkdownDiffWorkbenchResponse",
  description: "Markdown-aware text, frontmatter, structure, feature, validation, and normalization diff readout.",
  type: "object",
  required: ["kind", "changed", "diff"],
  additionalProperties: true,
  properties: {
    kind: { const: "metroplat.markdown.diff-workbench-response" },
    beforePath: { type: "string" },
    afterPath: { type: "string" },
    changed: { type: "boolean" },
    diff: { type: "object", additionalProperties: true },
  },
};

const markdownRefactorWorkbenchRequestSchema = {
  $id: "metroplat/filesystem/markdown-refactor-workbench-request",
  title: "MarkdownRefactorWorkbenchRequest",
  description: "Request to select Markdown files under a root, apply structured edits, and return per-file markdown-aware diffs.",
  type: "object",
  required: ["root", "operations"],
  additionalProperties: false,
  properties: {
    root: { type: "string", minLength: 1 },
    paths: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    maxDepth: { type: "number" },
    maxFiles: { type: "number" },
    where: markdownMetadataWorkbenchRequestSchema.properties.where,
    query: { type: "string" },
    pattern: { type: "string" },
    flags: { type: "string" },
    scope: { enum: ["source", "body"] },
    caseSensitive: { type: "boolean" },
    heading: { type: "string" },
    feature: markdownSearchWorkbenchRequestSchema.properties.feature,
    maxMatchesPerFile: { type: "number" },
    operations: markdownFileWorkbenchRequestSchema.properties.operations,
    write: { type: "boolean" },
    includeText: { type: "boolean" },
    token: { type: "string" },
    at: { type: "string" },
    contextLines: { type: "number" },
  },
};

const markdownRefactorWorkbenchResponseSchema = {
  $id: "metroplat/filesystem/markdown-refactor-workbench-response",
  title: "MarkdownRefactorWorkbenchResponse",
  description: "Selected-file Markdown refactor result with per-file diffs and optional journal admissions.",
  type: "object",
  required: ["kind", "root", "files", "matchedFiles", "changedFiles", "persistedFiles", "results"],
  additionalProperties: true,
  properties: {
    kind: { const: "metroplat.markdown.refactor-workbench-response" },
    root: { type: "string" },
    files: { type: "number" },
    matchedFiles: { type: "number" },
    changedFiles: { type: "number" },
    persistedFiles: { type: "number" },
    results: { type: "array", items: { type: "object", additionalProperties: true } },
  },
};

export const markdownFileWorkbenchRequestContract = schemaFrom(markdownFileWorkbenchRequestSchema);
export const markdownFileWorkbenchResponseContract = schemaFrom(markdownFileWorkbenchResponseSchema);
export const markdownCorpusWorkbenchRequestContract = schemaFrom(markdownCorpusWorkbenchRequestSchema);
export const markdownCorpusWorkbenchResponseContract = schemaFrom(markdownCorpusWorkbenchResponseSchema);
export const markdownMetadataWorkbenchRequestContract = schemaFrom(markdownMetadataWorkbenchRequestSchema);
export const markdownMetadataWorkbenchResponseContract = schemaFrom(markdownMetadataWorkbenchResponseSchema);
export const markdownSearchWorkbenchRequestContract = schemaFrom(markdownSearchWorkbenchRequestSchema);
export const markdownSearchWorkbenchResponseContract = schemaFrom(markdownSearchWorkbenchResponseSchema);
export const markdownDiffWorkbenchRequestContract = schemaFrom(markdownDiffWorkbenchRequestSchema);
export const markdownDiffWorkbenchResponseContract = schemaFrom(markdownDiffWorkbenchResponseSchema);
export const markdownRefactorWorkbenchRequestContract = schemaFrom(markdownRefactorWorkbenchRequestSchema);
export const markdownRefactorWorkbenchResponseContract = schemaFrom(markdownRefactorWorkbenchResponseSchema);

const MARKDOWN_FILE = /\.(?:md|markdown)$/iu;
const DEFAULT_CORPUS_FILE_LIMIT = 256;

function bump(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function valueKey(value) {
  if (typeof value === "string") return value;
  return canonicalJson(value);
}

function valuesEqual(left, right) {
  return left !== undefined && canonicalJson(left) === canonicalJson(right);
}

function valueIncludes(value, included) {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.some((entry) => valuesEqual(entry, included));
  return valuesEqual(value, included);
}

function markdownFilePath(name) {
  return MARKDOWN_FILE.test(name);
}

function editRequestOf(request)

 {
  if (request.operations === undefined) return undefined;
  const editRequest = Object.freeze({
    kind: markdownEditRequestKind,
    operations: request.operations,
    ...(request.createIfMissing === undefined ? {} : { createIfMissing: request.createIfMissing }),
    ...(request.initialText === undefined ? {} : { initialText: request.initialText }),
  });
  if (!isMarkdownEditRequest(editRequest)) {
    throw new TypeError("markdown-file-workbench operations must be valid metroplat markdown edit operations");
  }
  return editRequest;
}

function workbenchOfReadItem(path, item) {
  const record = item !== null && typeof item === "object" && !Array.isArray(item)
    ? item
    : undefined;
  const workbench = record?.["workbench"];
  if (workbench !== null && typeof workbench === "object" && !Array.isArray(workbench)) {
    return workbench;
  }
  throw new TypeError(`markdown-file-workbench: read did not return a markdown workbench for ${path}`);
}

async function readMarkdownFileWorkbench(binding, path) {
  const read = await resourcesOf(binding).readAtRoot(binding, { path });
  if (read.type !== "markdown" && read.type !== "site-note" && read.type !== "agents-doc") {
    throw new TypeError(`markdown-file-workbench: ${path} read as ${read.type}, not markdown`);
  }
  return workbenchOfReadItem(path, read.items[0]);
}

function initialWorkbench(request) {
  return readMarkdownWorkbench(request.initialText ?? "", { coordinate: request.path });
}

export async function runMarkdownFileWorkbench(
  binding,
  request,
) {
  const editRequest = editRequestOf(request);
  const before = request.createIfMissing === true && request.initialText !== undefined
    ? initialWorkbench(request)
    : await readMarkdownFileWorkbench(binding, request.path);
  if (editRequest === undefined) {
    return Object.freeze({
      kind: "metroplat.markdown.file-workbench-response",
      path: request.path,
      before,
      text: before.source.text,
      changed: false,
      persisted: false,
    });
  }
  if (request.write === true) {
    const writeReceipt = resourcesOf(binding).writeAtRoot(binding, {
      path: request.path,
      claim: editRequest,
      ...(request.token === undefined ? {} : { token: request.token }),
      ...(request.at === undefined ? {} : { at: request.at }),
    });
    const after = await readMarkdownFileWorkbench(binding, request.path);
    const edit = writeReceipt.observation !== undefined
      && typeof writeReceipt.observation === "object"
      && !Array.isArray(writeReceipt.observation)
      && (writeReceipt.observation)["kind"] === "metroplat.markdown.edit-receipt"
      ? writeReceipt.observation
      : undefined;
    return Object.freeze({
      kind: "metroplat.markdown.file-workbench-response",
      path: request.path,
      before,
      after,
      ...(edit === undefined ? {} : { edit }),
      writeReceipt,
      text: after.source.text,
      changed: after.source.text !== before.source.text,
      persisted: true,
    });
  }
  const applied = applyMarkdownEdit(before.source.text, editRequest);
  const after = readMarkdownWorkbench(applied.text, { coordinate: request.path });
  return Object.freeze({
    kind: "metroplat.markdown.file-workbench-response",
    path: request.path,
    before,
    after,
    edit: applied.receipt,
    text: applied.text,
    changed: applied.text !== before.source.text,
    persisted: false,
  });
}

function resolveWithinRoot(root, requested) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, requested);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new TypeError(`markdown-corpus-workbench: ${requested} escapes ${resolvedRoot}`);
  }
  return resolved;
}

function corpusPaths(request, options

) {
  const root = path.resolve(request.root);
  const files = request.paths === undefined
    ? options.walkFiles(root, {
      ...(request.maxDepth === undefined ? {} : { maxDepth: request.maxDepth }),
      pruneDirectory: (name) => name === ".git" || name === "node_modules" || name === "dist",
      includeFile: (name) => markdownFilePath(name),
      skipSymbolicLinks: true,
    })
    : request.paths.map((entry) => resolveWithinRoot(root, entry));
  const markdown = files.filter((filePath) => markdownFilePath(filePath));
  const limit = request.maxFiles ?? DEFAULT_CORPUS_FILE_LIMIT;
  return Object.freeze(markdown.slice(0, limit));
}

function summarize(
  root,
  responses,
  includeText,
) {
  const byRule = {};
  const frontmatterKeys = {};
  const featureTypes = {};
  let bytes = 0;
  let lines = 0;
  let findings = 0;
  let headings = 0;
  const results = responses.map((response) => {
    const final = response.after ?? response.before;
    bytes += final.source.bytes;
    lines += final.source.lines;
    findings += final.validation.findings.length;
    headings += final.structure.headings.length;
    for (const finding of final.validation.findings) bump(byRule, finding.rule);
    for (const key of Object.keys(final.frontmatter)) bump(frontmatterKeys, key);
    for (const feature of final.features) bump(featureTypes, feature.type);
    return Object.freeze({
      path: path.relative(root, response.path).split(path.sep).join("/"),
      changed: response.changed,
      persisted: response.persisted,
      beforeBytes: response.before.source.bytes,
      ...(response.after === undefined ? {} : { afterBytes: response.after.source.bytes }),
      findings: final.validation.findings.length,
      headings: final.structure.headings.length,
      features: final.features.length,
      ...(includeText ? { text: response.text } : {}),
    });
  });
  return Object.freeze({
    summary: Object.freeze({
      bytes,
      lines,
      findings,
      byRule: Object.freeze(byRule),
      frontmatterKeys: Object.freeze(frontmatterKeys),
      featureTypes: Object.freeze(featureTypes),
      headings,
    }),
    results: Object.freeze(results),
  });
}

export async function runMarkdownCorpusWorkbench(
  binding,
  request,
) {
  const root = path.resolve(request.root);
  const responses = [];
  for (const filePath of corpusPaths(request, binding)) {
    responses.push(await runMarkdownFileWorkbench(binding, {
      path: filePath,
      ...(request.operations === undefined ? {} : { operations: request.operations }),
      ...(request.write === undefined ? {} : { write: request.write }),
      ...(request.at === undefined ? {} : { at: request.at }),
      ...(request.token === undefined ? {} : { token: `${request.token}-${responses.length + 1}` }),
    }));
  }
  const { summary, results } = summarize(root, responses, request.includeText === true);
  return Object.freeze({
    kind: "metroplat.markdown.corpus-workbench-response",
    root,
    files: responses.length,
    changedFiles: responses.filter((response) => response.changed).length,
    persistedFiles: responses.filter((response) => response.persisted).length,
    summary,
    results,
  });
}


function metadataMatches(frontmatter, selector) {
  if (selector === undefined || selector.key === undefined) return true;
  const value = frontmatter[selector.key];
  if (selector.exists !== undefined && selector.exists !== (value !== undefined)) return false;
  if (selector.equals !== undefined && !valuesEqual(value, selector.equals)) return false;
  if (selector.includes !== undefined && !valueIncludes(value, selector.includes)) return false;
  return true;
}

function fieldIndex(readouts) {
  const fields = {};
  for (const readout of readouts) {
    for (const [key, value] of Object.entries(readout.frontmatter)) {
      const entry = fields[key] ?? { files: 0, types: {}, values: {} };
      entry.files += 1;
      bump(entry.types, valueType(value));
      if (Array.isArray(value)) {
        for (const item of value) bump(entry.values, valueKey(item));
      } else {
        bump(entry.values, valueKey(value));
      }
      fields[key] = entry;
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, Object.freeze({
    files: value.files,
    types: Object.freeze(value.types),
    values: Object.freeze(value.values),
  })])));
}

function bodyOffset(text) {
  const fence = splitMarkdownFrontmatterFence(text);
  return fence === null ? 0 : Math.max(0, text.length - fence.body.length);
}

function lineColumnAt(text, offset) {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return Object.freeze({ line, column });
}

function lineTextAt(text, offset) {
  const start = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const end = text.indexOf("\n", offset);
  return text.slice(start, end < 0 ? text.length : end);
}

function queryMatches(
  source,
  scoped,
  scope,
  baseOffset,
  request,
) {
  const query = request.query;
  if (query === undefined || query === "") return Object.freeze([]);
  const matches = [];
  const needle = request.caseSensitive === true ? query : query.toLowerCase();
  const haystack = request.caseSensitive === true ? scoped : scoped.toLowerCase();
  const limit = request.maxMatchesPerFile ?? 64;
  for (let offset = haystack.indexOf(needle); offset >= 0 && matches.length < limit; offset = haystack.indexOf(needle, offset + Math.max(1, needle.length))) {
    const sourceOffset = baseOffset + offset;
    const coordinates = lineColumnAt(source, sourceOffset);
    matches.push(Object.freeze({
      kind: "query",
      scope,
      line: coordinates.line,
      column: coordinates.column,
      startOffset: sourceOffset,
      endOffset: sourceOffset + query.length,
      text: scoped.slice(offset, offset + query.length),
      lineText: lineTextAt(source, sourceOffset),
    }));
  }
  return Object.freeze(matches);
}

function patternFlags(flags) {
  const chars = new Set((flags ?? "").replace(/[^dgimsuvy]/gu, "").split(""));
  chars.add("g");
  chars.add("u");
  return [...chars].join("");
}

function patternMatches(
  source,
  scoped,
  scope,
  baseOffset,
  request,
) {
  if (request.pattern === undefined || request.pattern === "") return Object.freeze([]);
  const expression = new RegExp(request.pattern, patternFlags(request.flags));
  const matches = [];
  const limit = request.maxMatchesPerFile ?? 64;
  for (const match of scoped.matchAll(expression)) {
    if (matches.length >= limit) break;
    const offset = match.index;
    const text = match[0];
    const sourceOffset = baseOffset + offset;
    const coordinates = lineColumnAt(source, sourceOffset);
    matches.push(Object.freeze({
      kind: "pattern",
      scope,
      line: coordinates.line,
      column: coordinates.column,
      startOffset: sourceOffset,
      endOffset: sourceOffset + text.length,
      text,
      lineText: lineTextAt(source, sourceOffset),
    }));
    if (text === "") expression.lastIndex += 1;
  }
  return Object.freeze(matches);
}

function textMatches(readout, request) {
  const scope = request.scope ?? "source";
  const source = readout.source.text;
  const base = scope === "body" ? bodyOffset(source) : 0;
  const scoped = scope === "body" ? readout.body : source;
  return Object.freeze([
    ...queryMatches(source, scoped, scope, base, request),
    ...patternMatches(source, scoped, scope, base, request),
  ].sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset));
}

function headingMatches(readout, heading) {
  if (heading === undefined || heading === "") return true;
  const wanted = heading.toLowerCase();
  return readout.structure.headings.some((entry) =>
    entry.title.toLowerCase().includes(wanted)
      || entry.path.join(" / ").toLowerCase().includes(wanted));
}

function featureText(feature, key) {
  if (key === "target" && "target" in feature) return feature.target;
  if (key === "key" && "key" in feature) return feature.key;
  if (key === "value" && "value" in feature) return feature.value;
  return undefined;
}

function featureMatches(readout, selector) {
  if (selector === undefined) return true;
  return readout.features.some((feature) => {
    if (selector.type !== undefined && feature.type !== selector.type) return false;
    if (selector.target !== undefined && featureText(feature, "target") !== selector.target) return false;
    if (selector.key !== undefined && featureText(feature, "key") !== selector.key) return false;
    if (selector.value !== undefined && featureText(feature, "value") !== selector.value) return false;
    return true;
  });
}

function hasTextNeedle(request) {
  return (request.query !== undefined && request.query !== "") || (request.pattern !== undefined && request.pattern !== "");
}

export async function runMarkdownSearchWorkbench(
  binding,
  request,
) {
  const root = path.resolve(request.root);
  const results = [];
  let files = 0;
  let matches = 0;
  for (const filePath of corpusPaths(request, binding)) {
    files += 1;
    const response = await runMarkdownFileWorkbench(binding, { path: filePath });
    const readout = response.before;
    if (!metadataMatches(readout.frontmatter, request.where)) continue;
    if (!headingMatches(readout, request.heading)) continue;
    if (!featureMatches(readout, request.feature)) continue;
    const fileMatches = textMatches(readout, request);
    if (hasTextNeedle(request) && fileMatches.length === 0) continue;
    matches += fileMatches.length;
    results.push(Object.freeze({
      path: path.relative(root, filePath).split(path.sep).join("/"),
      matches: fileMatches,
      frontmatterKeys: Object.freeze(Object.keys(readout.frontmatter).sort()),
      headings: Object.freeze(readout.structure.headings.map((entry) => entry.path.join(" / "))),
      featureTypes: Object.freeze([...new Set(readout.features.map((feature) => feature.type))].sort()),
      ...(request.includeText === true ? { text: readout.source.text } : {}),
    }));
  }
  return Object.freeze({
    kind: "metroplat.markdown.search-workbench-response",
    root,
    files,
    matchedFiles: results.length,
    matches,
    results: Object.freeze(results),
  });
}

function resolveRequestPath(root, requested) {
  if (path.isAbsolute(requested)) return requested;
  if (root !== undefined) return resolveWithinRoot(path.resolve(root), requested);
  return path.resolve(requested);
}

async function beforeDiffSide(
  binding,
  request,
) {
  if (request.beforeText !== undefined) {
    return Object.freeze({ text: request.beforeText, label: request.beforePath ?? request.path ?? "before.md" });
  }
  const requested = request.beforePath ?? request.path;
  if (requested === undefined) {
    throw new TypeError("markdown-diff-workbench requires beforeText, beforePath, or path");
  }
  const resolved = resolveRequestPath(request.root, requested);
  const workbench = await readMarkdownFileWorkbench(binding, resolved);
  return Object.freeze({ text: workbench.source.text, label: requested, path: resolved });
}

async function afterDiffSide(
  binding,
  request,
  before,
) {
  if (request.operations !== undefined) {
    const editRequest = editRequestOf({ path: before.path ?? before.label, operations: request.operations });
    if (editRequest === undefined) throw new TypeError("markdown-diff-workbench operations were not available");
    if (before.path !== undefined) {
      const response = await runMarkdownFileWorkbench(binding, { path: before.path, operations: request.operations });
      return Object.freeze({ text: response.text, label: `${before.label} + operations`, path: before.path });
    }
    const applied = applyMarkdownEdit(before.text, editRequest);
    return Object.freeze({ text: applied.text, label: `${before.label} + operations` });
  }
  if (request.afterText !== undefined) {
    return Object.freeze({ text: request.afterText, label: request.afterPath ?? "after.md" });
  }
  const requested = request.afterPath;
  if (requested === undefined) {
    throw new TypeError("markdown-diff-workbench requires afterText, afterPath, or operations");
  }
  const resolved = resolveRequestPath(request.root, requested);
  const workbench = await readMarkdownFileWorkbench(binding, resolved);
  return Object.freeze({ text: workbench.source.text, label: requested, path: resolved });
}

export async function runMarkdownDiffWorkbench(
  binding,
  request,
) {
  const before = await beforeDiffSide(binding, request);
  const after = await afterDiffSide(binding, request, before);
  const diff = differentiateMarkdownDocuments(before.text, after.text, {
    beforeLabel: before.label,
    afterLabel: after.label,
    ...(request.contextLines === undefined ? {} : { contextLines: request.contextLines }),
  });
  return Object.freeze({
    kind: "metroplat.markdown.diff-workbench-response",
    ...(before.path === undefined ? {} : { beforePath: before.path }),
    ...(after.path === undefined ? {} : { afterPath: after.path }),
    changed: diff.changed,
    diff,
  });
}

function selectionMatches(
  readout,
  request,
) {
  if (!metadataMatches(readout.frontmatter, request.where)) {
    return Object.freeze({ matched: false, matches: Object.freeze([]) });
  }
  if (!headingMatches(readout, request.heading)) {
    return Object.freeze({ matched: false, matches: Object.freeze([]) });
  }
  if (!featureMatches(readout, request.feature)) {
    return Object.freeze({ matched: false, matches: Object.freeze([]) });
  }
  const matches = textMatches(readout, request);
  if (hasTextNeedle(request) && matches.length === 0) {
    return Object.freeze({ matched: false, matches });
  }
  return Object.freeze({ matched: true, matches });
}

function refactorSelectionRequest(request) {
  return Object.freeze({
    root: request.root,
    ...(request.paths === undefined ? {} : { paths: request.paths }),
    ...(request.maxDepth === undefined ? {} : { maxDepth: request.maxDepth }),
    ...(request.maxFiles === undefined ? {} : { maxFiles: request.maxFiles }),
    ...(request.query === undefined ? {} : { query: request.query }),
    ...(request.pattern === undefined ? {} : { pattern: request.pattern }),
    ...(request.flags === undefined ? {} : { flags: request.flags }),
    ...(request.scope === undefined ? {} : { scope: request.scope }),
    ...(request.caseSensitive === undefined ? {} : { caseSensitive: request.caseSensitive }),
    ...(request.where === undefined ? {} : { where: request.where }),
    ...(request.heading === undefined ? {} : { heading: request.heading }),
    ...(request.feature === undefined ? {} : { feature: request.feature }),
    ...(request.maxMatchesPerFile === undefined ? {} : { maxMatchesPerFile: request.maxMatchesPerFile }),
  });
}

export async function runMarkdownRefactorWorkbench(
  binding,
  request,
) {
  const root = path.resolve(request.root);
  const selectionRequest = refactorSelectionRequest(request);
  const results = [];
  let files = 0;
  let matchedFiles = 0;
  for (const filePath of corpusPaths(request, binding)) {
    files += 1;
    const before = await runMarkdownFileWorkbench(binding, { path: filePath });
    const selected = selectionMatches(before.before, selectionRequest);
    if (!selected.matched) continue;
    matchedFiles += 1;
    const edited = await runMarkdownFileWorkbench(binding, {
      path: filePath,
      operations: request.operations,
      ...(request.write === undefined ? {} : { write: request.write }),
      ...(request.at === undefined ? {} : { at: request.at }),
      ...(request.token === undefined ? {} : { token: `${request.token}-${matchedFiles}` }),
    });
    const diff = differentiateMarkdownDocuments(before.before.source.text, edited.text, {
      beforeLabel: path.relative(root, filePath).split(path.sep).join("/"),
      afterLabel: `${path.relative(root, filePath).split(path.sep).join("/")} + operations`,
      ...(request.contextLines === undefined ? {} : { contextLines: request.contextLines }),
    });
    results.push(Object.freeze({
      path: path.relative(root, filePath).split(path.sep).join("/"),
      matches: selected.matches,
      changed: edited.changed,
      persisted: edited.persisted,
      beforeBytes: before.before.source.bytes,
      afterBytes: edited.after?.source.bytes ?? edited.before.source.bytes,
      diff,
      ...(request.includeText === true ? { beforeText: before.before.source.text, afterText: edited.text } : {}),
    }));
  }
  return Object.freeze({
    kind: "metroplat.markdown.refactor-workbench-response",
    root,
    files,
    matchedFiles,
    changedFiles: results.filter((result) => result.changed).length,
    persistedFiles: results.filter((result) => result.persisted).length,
    results: Object.freeze(results),
  });
}

export async function runMarkdownMetadataWorkbench(
  binding,
  request,
) {
  const root = path.resolve(request.root);
  const results = [];
  const finalReadouts = [];
  let matchedFiles = 0;
  for (const filePath of corpusPaths(request, binding)) {
    const before = await runMarkdownFileWorkbench(binding, { path: filePath });
    const matched = metadataMatches(before.before.frontmatter, request.where);
    matchedFiles += matched ? 1 : 0;
    const response = matched && request.operations !== undefined
      ? await runMarkdownFileWorkbench(binding, {
        path: filePath,
        operations: request.operations,
        ...(request.write === undefined ? {} : { write: request.write }),
        ...(request.at === undefined ? {} : { at: request.at }),
        ...(request.token === undefined ? {} : { token: `${request.token}-${matchedFiles}` }),
      })
      : before;
    const final = response.after ?? response.before;
    finalReadouts.push(final);
    results.push(Object.freeze({
      path: path.relative(root, filePath).split(path.sep).join("/"),
      matched,
      changed: response.changed,
      persisted: response.persisted,
      keys: Object.freeze(Object.keys(final.frontmatter).sort()),
      ...(request.includeFrontmatter === true ? { frontmatter: final.frontmatter } : {}),
    }));
  }
  return Object.freeze({
    kind: "metroplat.markdown.metadata-workbench-response",
    root,
    files: results.length,
    matchedFiles,
    changedFiles: results.filter((result) => result.changed).length,
    persistedFiles: results.filter((result) => result.persisted).length,
    fields: fieldIndex(finalReadouts),
    results: Object.freeze(results),
  });
}

export function markdownFileWorkbenchOperations(binding) {
  return Object.freeze([
    operation({
      verb: "markdown-file-workbench",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Inspect, dry-run edit, or persistently edit one Markdown file through MetroPlat.",
      description: "Domain: MarkdownFileWorkbenchRequest. Codomain: MarkdownFileWorkbenchResponse. Reads the file through filesystem, applies structured Markdown edit operations as a dry run unless write=true, and uses filesystem write for persisted edits so filesystem changes remain journaled.",
      domain: markdownFileWorkbenchRequestContract,
      codomain: markdownFileWorkbenchResponseContract,
      relation: "projection",
      run: (input) =>
        runMarkdownFileWorkbench(binding, input),
    }),
    operation({
      verb: "markdown-corpus-workbench",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Inspect, dry-run edit, or persistently edit selected Markdown files under a directory.",
      description: "Domain: MarkdownCorpusWorkbenchRequest. Codomain: MarkdownCorpusWorkbenchResponse. Discovers Markdown files under a root or uses explicit root-relative paths, applies the same file workbench to each file, and returns aggregate validation, frontmatter, feature, heading, and change summaries.",
      domain: markdownCorpusWorkbenchRequestContract,
      codomain: markdownCorpusWorkbenchResponseContract,
      relation: "projection",
      run: (input) =>
        runMarkdownCorpusWorkbench(binding, input),
    }),
    operation({
      verb: "markdown-metadata-workbench",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Index, query, dry-run migrate, or persistently migrate Markdown frontmatter under a directory.",
      description: "Domain: MarkdownMetadataWorkbenchRequest. Codomain: MarkdownMetadataWorkbenchResponse. Discovers Markdown files under a root, builds a JSON frontmatter field/value index, applies an optional selector, and runs structured Markdown edit operations over matched files through the file workbench.",
      domain: markdownMetadataWorkbenchRequestContract,
      codomain: markdownMetadataWorkbenchResponseContract,
      relation: "projection",
      run: (input) =>
        runMarkdownMetadataWorkbench(binding, input),
    }),
    operation({
      verb: "markdown-search-workbench",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Search and structurally filter Markdown files under a directory.",
      description: "Domain: MarkdownSearchWorkbenchRequest. Codomain: MarkdownSearchWorkbenchResponse. Discovers Markdown files under a root, filters through the markdown workbench's frontmatter, headings, and extension features, and returns source-coordinate text or regex matches without requiring shell search tools.",
      domain: markdownSearchWorkbenchRequestContract,
      codomain: markdownSearchWorkbenchResponseContract,
      relation: "projection",
      run: (input) =>
        runMarkdownSearchWorkbench(binding, input),
    }),
    operation({
      verb: "markdown-diff-workbench",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Compare Markdown texts, files, or proposed structured edits with markdown-aware deltas.",
      description: "Domain: MarkdownDiffWorkbenchRequest. Codomain: MarkdownDiffWorkbenchResponse. Produces unified text hunks plus frontmatter, heading, extension-feature, validation, and normalization deltas so agents can audit markdown changes without shell diff tools or manual file inspection.",
      domain: markdownDiffWorkbenchRequestContract,
      codomain: markdownDiffWorkbenchResponseContract,
      relation: "projection",
      run: (input) =>
        runMarkdownDiffWorkbench(binding, input),
    }),
    operation({
      verb: "markdown-refactor-workbench",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Select Markdown files, apply structured edits, and return per-file markdown-aware diffs.",
      description: "Domain: MarkdownRefactorWorkbenchRequest. Codomain: MarkdownRefactorWorkbenchResponse. Discovers Markdown files under a root, selects them with the same metadata/text/heading/feature filters as the search workbench, applies structured Markdown edit operations as dry-run or journal admissions, and returns one markdown-aware diff per selected file.",
      domain: markdownRefactorWorkbenchRequestContract,
      codomain: markdownRefactorWorkbenchResponseContract,
      relation: "projection",
      run: (input) =>
        runMarkdownRefactorWorkbench(binding, input),
    }),
  ]);
}
