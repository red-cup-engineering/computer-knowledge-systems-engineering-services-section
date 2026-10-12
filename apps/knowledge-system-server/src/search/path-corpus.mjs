/**
 * @packageDocumentation
 *
 * src/search/path-corpus - bounded semantic readout over files under a path.
 *
 * This is not an embedding service. It is the deterministic substrate an
 * embedding/RAG layer can stand on: a finite term-vector readout over path
 * names, markdown headings, TypeScript/JavaScript/Lean declarations, imports,
 * and bounded file heads, with per-file evidence and query scores.
 */
import path from "node:path";

import { classifyLegibility } from "@red-cup-engineering/computer-system-engine/addressing/legibility";
import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";
import { codecAdmissibleExtensions } from "@red-cup-engineering/computer-system-engine/addressing/codec-legibility";

import { visitFileCensus } from "@red-cup-engineering/computer-code-development-engine/monitoring/filesystem/file-census/service";
import { artifactTier } from "@red-cup-engineering/eavt-services-section/statement";

const DEFAULT_LIMIT = 24;
const DEFAULT_MAX_FILES = 512;
const DEFAULT_MAX_BYTES_PER_FILE = 24 * 1024;
const TERM_LIMIT = 32;
const CONCEPT_LIMIT = 32;
const EXCERPT_LIMIT = 420;

const INDEXABLE_EXTENSIONS = new Set([
  "md", "markdown", "txt",
  "ts", "mts", "cts", "tsx", "js", "mjs", "cjs", "jsx",
  "lean",
  "json", "jsonl",
  "yaml", "yml", "toml",
]);

const STOP_TERMS = new Set([
  "about", "after", "again", "also", "and", "are", "because", "before",
  "being", "between", "const", "export", "from", "function", "import",
  "into", "readonly", "return", "that", "the", "their", "there", "this",
  "through", "type", "undefined", "with",
]);

const WORD_PATTERN = /[a-z0-9][a-z0-9_-]{2,}/giu;
const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/gu;

function inputRecord(input) {
  return input !== null && typeof input === "object" && !Array.isArray(input) ? input : {};
}

function optionalPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : undefined;
}

function relativePath(root, full) {
  const relative = path.relative(root, full).split(path.sep).join("/");
  return relative === "" ? "." : relative;
}

function confinedReadoutPath(root, id) {
  if (id === undefined || id.trim() === "" || id === ".") return root;
  const target = path.resolve(root, id);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  return target;
}

function normalizeTerms(text) {
  const seen = new Set();
  const expanded = text.replace(CAMEL_BOUNDARY, "$1 $2").toLowerCase();
  for (const match of expanded.matchAll(WORD_PATTERN)) {
    const term = match[0].replace(/^_+|_+$/gu, "");
    if (term.length < 3 || STOP_TERMS.has(term)) continue;
    seen.add(term);
  }
  return Object.freeze([...seen]);
}

function languageOf(extension) {
  if (extension === "md" || extension === "markdown") return "markdown";
  if (["ts", "mts", "cts", "tsx"].includes(extension)) return "typescript";
  if (["js", "mjs", "cjs", "jsx"].includes(extension)) return "javascript";
  if (extension === "lean") return "lean4";
  if (extension === "json" || extension === "jsonl") return "json";
  if (extension === "yaml" || extension === "yml") return "yaml";
  return extension === "(none)" ? "unknown" : extension;
}

function roleOf(relative, extension) {
  if (relative === "README.md" || relative.endsWith("/README.md")) return "orientation";
  if (relative.includes("/dev/content/notes/") || relative.includes("/notes/")) return "research-note";
  if (relative.startsWith(`${artifactTier("log").pathSegment}/`)) return "journal-log";
  if (relative.startsWith("data/state/")) return "settled-state";
  if (relative.startsWith("data/records/")) return "record";
  if (relative.startsWith("content/")) return "content";
  if (extension === "lean") return "proof-source";
  if (["ts", "mts", "cts", "tsx", "js", "mjs", "cjs", "jsx"].includes(extension)) return "source-module";
  if (extension === "md" || extension === "markdown") return "text";
  return "carrier";
}

function addWeighted(
  terms,
  source,
  values,
  weight,
) {
  for (const value of values) {
    const entry = terms.get(value) ?? { weight: 0, sources: new Set() };
    entry.weight += weight;
    entry.sources.add(source);
    terms.set(value, entry);
  }
}

function markdownHeadings(content) {
  return Object.freeze(content.split("\n")
    .map((line) => /^(?:#{1,6})\s+(.+)$/u.exec(line.trim())?.[1]?.trim())
    .filter((value) => value !== undefined && value.length > 0)
    .slice(0, 12));
}

function codeSymbols(content, extension) {
  const symbols = new Set();
  if (["ts", "mts", "cts", "tsx", "js", "mjs", "cjs", "jsx"].includes(extension)) {
    for (const match of content.matchAll(/\b(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gu)) {
      symbols.add(match[1]);
    }
    for (const match of content.matchAll(/\bimport\s+(?:type\s+)?(?:\{([^}]+)\}|([A-Za-z_$][A-Za-z0-9_$]*))/gu)) {
      for (const name of normalizeTerms(`${match[1] ?? ""} ${match[2] ?? ""}`)) symbols.add(name);
    }
  }
  if (extension === "lean") {
    for (const match of content.matchAll(/\b(?:theorem|lemma|def|structure|class|inductive)\s+([A-Za-z_][A-Za-z0-9_'.]*)/gu)) {
      symbols.add(match[1]);
    }
  }
  return Object.freeze([...symbols].slice(0, 32));
}

function excerptOf(content, queryTerms) {
  const compact = content.replace(/\s+/gu, " ").trim();
  if (compact.length <= EXCERPT_LIMIT) return compact;
  const lower = compact.toLowerCase();
  const first = queryTerms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, first - Math.floor(EXCERPT_LIMIT / 4));
  return `${start === 0 ? "" : "..."}${compact.slice(start, start + EXCERPT_LIMIT)}...`;
}

function pathMatchScore(relative, queryTerms) {
  if (queryTerms.length === 0) return 0;
  const pathTerms = new Set(normalizeTerms(relative));
  return queryTerms.reduce((sum, term) => sum + (pathTerms.has(term) || relative.toLowerCase().includes(term) ? 1 : 0), 0);
}

function compareCandidates(left, right) {
  return right.pathScore - left.pathScore || left.relative.localeCompare(right.relative);
}

function worseCandidate(left, right) {
  return compareCandidates(left, right) > 0;
}

/** A bounded max-heap whose root is the least useful retained candidate. */
function retainCandidate(heap, candidate, limit) {
  const sink = (index) => {
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let worst = index;
      if (left < heap.length && worseCandidate(heap[left], heap[worst])) worst = left;
      if (right < heap.length && worseCandidate(heap[right], heap[worst])) worst = right;
      if (worst === index) return;
      [heap[index], heap[worst]] = [heap[worst], heap[index]];
      index = worst;
    }
  };
  if (heap.length < limit) {
    heap.push(candidate);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!worseCandidate(heap[index], heap[parent])) break;
      [heap[index], heap[parent]] = [heap[parent], heap[index]];
      index = parent;
    }
    return;
  }
  if (compareCandidates(candidate, heap[0]) >= 0) return;
  heap[0] = candidate;
  sink(0);
}

function documentOf(root, file, queryTerms, maxBytesPerFile, options) {
  const relative = relativePath(root, file.full);
  const stat = options.statPathOrNull(file.full);
  if (stat === null || !stat.isFile()) return undefined;
  let content = "";
  try {
    content = options.readFileHeadUtf8(file.full, maxBytesPerFile);
  } catch {
    content = "";
  }

  const materialClass = classifyLegibility(relative, file.extension, codecAdmissibleExtensions);
  const language = languageOf(file.extension);
  const role = roleOf(relative, file.extension);
  const headings = language === "markdown" ? markdownHeadings(content) : Object.freeze([]);
  const symbols = codeSymbols(content, file.extension);
  const termWeights = new Map();

  addWeighted(termWeights, "path", normalizeTerms(relative), 4);
  addWeighted(termWeights, "tree", normalizeTerms(file.tree), 2);
  addWeighted(termWeights, "class", normalizeTerms(`${materialClass} ${language} ${role}`), 2);
  addWeighted(termWeights, "heading", headings.flatMap(normalizeTerms), 5);
  addWeighted(termWeights, "symbol", symbols.flatMap(normalizeTerms), 5);
  addWeighted(termWeights, "content", normalizeTerms(content), 1);

  const terms = Object.freeze([...termWeights.entries()]
    .sort((left, right) => right[1].weight - left[1].weight || left[0].localeCompare(right[0]))
    .slice(0, TERM_LIMIT)
    .map(([term, value]) => Object.freeze({
      term,
      weight: value.weight,
      sources: Object.freeze([...value.sources].sort()),
    })));
  const termSet = new Set(terms.map((term) => term.term));
  const matchedTerms = Object.freeze(queryTerms.filter((term) =>
    termSet.has(term) || relative.toLowerCase().includes(term) || content.toLowerCase().includes(term)));
  const missingTerms = Object.freeze(queryTerms.filter((term) => !matchedTerms.includes(term)));
  const score = queryTerms.length === 0
    ? terms.reduce((sum, term) => sum + term.weight, 0)
    : matchedTerms.reduce((sum, term) => {
        const exact = terms.find((entry) => entry.term === term)?.weight ?? 0;
        const weak = exact === 0 && (relative.toLowerCase().includes(term) || content.toLowerCase().includes(term)) ? 1 : 0;
        return sum + exact + weak;
      }, 0);

  return Object.freeze({
    kind: "metroplat.path-corpus.document",
    path: relative,
    tree: file.tree,
    extension: file.extension,
    materialClass,
    bytes: stat.size,
    language,
    role,
    symbols,
    headings,
    terms,
    score,
    matchedTerms,
    missingTerms,
    excerpt: excerptOf(content, queryTerms),
    evidence: Object.freeze([
      `path:${relative}`,
      `tree:${file.tree}`,
      `extension:${file.extension}`,
      `material-class:${materialClass}`,
      `language:${language}`,
      `role:${role}`,
      `bytes:${stat.size}`,
      `head-bytes:${Math.min(maxBytesPerFile, stat.size)}`,
      `matched-terms:${matchedTerms.length}`,
      `score:${score}`,
    ]),
  });
}

function conceptsOf(documents) {
  const concepts = new Map();
  for (const document of documents) {
    for (const term of document.terms) {
      const entry = concepts.get(term.term) ?? { weight: 0, paths: new Set() };
      entry.weight += term.weight;
      entry.paths.add(document.path);
      concepts.set(term.term, entry);
    }
  }
  return Object.freeze([...concepts.entries()]
    .sort((left, right) => right[1].weight - left[1].weight || right[1].paths.size - left[1].paths.size || left[0].localeCompare(right[0]))
    .slice(0, CONCEPT_LIMIT)
    .map(([term, value]) => Object.freeze({
      term,
      documents: value.paths.size,
      weight: value.weight,
      examples: Object.freeze([...value.paths].sort().slice(0, 4)),
    })));
}

/** Read a bounded, queryable semantic term-vector corpus for files under `root`. */
export function readPathCorpus(root, options) {
  const rootAbs = path.resolve(root);
  const query = options.query?.trim();
  const queryTerms = normalizeTerms(query ?? "");
  const limit = options.limit ?? DEFAULT_LIMIT;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxBytesPerFile = options.maxBytesPerFile ?? DEFAULT_MAX_BYTES_PER_FILE;
  let filesSeen = 0;
  let indexableFiles = 0;
  const candidateHeap = [];
  visitFileCensus(rootAbs, (file) => {
    filesSeen += 1;
    if (!INDEXABLE_EXTENSIONS.has(file.extension)) return;
    indexableFiles += 1;
    const relative = relativePath(rootAbs, file.full);
    retainCandidate(candidateHeap, { file, relative, pathScore: pathMatchScore(relative, queryTerms) }, maxFiles);
  }, options);
  const candidates = candidateHeap.sort(compareCandidates);
  const indexed = candidates.flatMap(({ file }) => {
    const document = documentOf(rootAbs, file, queryTerms, maxBytesPerFile, options);
    return document === undefined ? [] : [document];
  });
  const ranked = Object.freeze([...indexed]
    .sort((left, right) => right.score - left.score || right.matchedTerms.length - left.matchedTerms.length || left.path.localeCompare(right.path))
    .slice(0, limit));

  return Object.freeze({
    kind: "metroplat.path-corpus.read",
    operation: "read-path-corpus",
    root: rootAbs,
    ...(query === undefined || query.length === 0 ? {} : { query }),
    queryTerms,
    filesSeen,
    candidateFiles: candidates.length,
    filesIndexed: indexed.length,
    truncated: candidates.length < indexableFiles,
    documents: ranked,
    concepts: conceptsOf(ranked),
    evidence: Object.freeze([
      `root:${rootAbs}`,
      `files-seen:${filesSeen}`,
      `candidate-files:${candidates.length}`,
      `indexable-files:${indexableFiles}`,
      `files-indexed:${indexed.length}`,
      `query-terms:${queryTerms.length}`,
      `limit:${limit}`,
      `max-files:${maxFiles}`,
      `max-bytes-per-file:${maxBytesPerFile}`,
      `truncated:${candidates.length < indexableFiles}`,
      "vector:deterministic-term-weight",
    ]),
  });
}

export function pathCorpusOperations(binding) {
  return Object.freeze([
    operation({
      verb: "path-corpus",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Read a bounded semantic file-vector corpus under a root.",
      description: "Domain: { root?, id?, query?, limit?, maxFiles?, maxBytesPerFile? }. id selects a confined subpath under root.",
      run: (input) => {
        const record = inputRecord(input);
        const root = typeof record["root"] === "string" && record["root"].length > 0 ? record["root"] : binding.dataRoot;
        const id = typeof record["id"] === "string" ? record["id"] : undefined;
        const target = confinedReadoutPath(root, id);
        if (target === undefined) throw new RangeError(`path-corpus: id escapes root: ${id}`);
        const limit = optionalPositiveInteger(record["limit"]);
        const maxFiles = optionalPositiveInteger(record["maxFiles"]);
        const maxBytesPerFile = optionalPositiveInteger(record["maxBytesPerFile"]);
        return readPathCorpus(target, {
          ...binding,
          ...(typeof record["query"] === "string" ? { query: record["query"] } : {}),
          ...(limit === undefined ? {} : { limit }),
          ...(maxFiles === undefined ? {} : { maxFiles }),
          ...(maxBytesPerFile === undefined ? {} : { maxBytesPerFile }),
        });
      },
    }),
  ]);
}
