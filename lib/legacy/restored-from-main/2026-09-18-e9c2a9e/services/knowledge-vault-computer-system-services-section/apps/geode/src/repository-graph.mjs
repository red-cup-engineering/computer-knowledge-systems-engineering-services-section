import { posix } from "node:path";
import { deriveMarkdownVaultGraph, DEFAULT_FRONTMATTER_REFERENCE_KEYS } from "@red-cup-engineering/markdown-vault-graph-services-section";
import { observeMarkdownDocumentIndex } from "@red-cup-engineering/observe-markdown-document-index-service";

const MARKDOWN_EXTENSION = /\.(?:md|markdown)$/iu;
const EXTERNAL_TARGET = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu;
const REGEX_METACHARACTERS = /[\\.+*?()|[\]{}^$]/gu;

/** Same normalization the graph service applies before indexing an alias. */
function indexKey(value) {
  const normalized = posix
    .normalize(value.replaceAll("\\", "/"))
    .replace(/^\.\//u, "")
    .replace(/^\/+|\/+$/gu, "");
  return normalized === "." ? "" : normalized.toLowerCase();
}

function withoutExtension(path) {
  return path.replace(MARKDOWN_EXTENSION, "");
}

/**
 * Alias index over admitted paths alone: path, path without extension, and bare basename.
 *
 * This is deliberately narrower than the graph service's own index, which additionally reads
 * each document's declared frontmatter aliases. Holding 114,000 parsed frontmatters is what
 * caps a whole-vault-in-memory application; holding 114,000 paths does not. Declared aliases
 * therefore do not resolve at repository scale, and a link that only names one reads as
 * dangling rather than being silently attributed.
 */
export function buildPathAliasIndex(paths) {
  const index = new Map();
  const add = (value, path) => {
    const key = indexKey(value);
    if (key === "") return;
    const held = index.get(key);
    if (held === undefined) index.set(key, path);
    else if (typeof held === "string") { if (held !== path) index.set(key, new Set([held, path])); }
    else held.add(path);
  };
  for (const path of paths) {
    const bare = withoutExtension(path);
    add(path, path);
    add(bare, path);
    add(posix.basename(bare), path);
  }
  return index;
}

function lookupCount(index, key) {
  const held = index.get(indexKey(key));
  return held === undefined ? 0 : typeof held === "string" ? 1 : held.size;
}

function lookup(index, key) {
  const held = index.get(indexKey(key));
  if (held === undefined) return [];
  return typeof held === "string" ? [held] : [...held];
}

/** Raw link targets a document declares, before any resolution. */
function rawTargetsOf(document, frontmatterReferenceKeys) {
  const targets = [];
  for (const feature of document.features ?? []) {
    if (["wikilink", "transclusion", "markdown-link"].includes(feature.type)) targets.push(feature.target);
  }
  for (const key of frontmatterReferenceKeys) {
    const value = document.frontmatter?.[key];
    const values = typeof value === "string" ? [value] : Array.isArray(value) ? value.flat(Infinity) : [];
    for (const entry of values) {
      if (typeof entry !== "string" || entry.trim() === "") continue;
      targets.push(entry.trim().match(/^\[\[([\s\S]+)\]\]$/u)?.[1] ?? entry.trim());
    }
  }
  return targets;
}

/**
 * Every path the graph service could resolve `raw` to, found through the same five keys it
 * derives. Supplying a superset is safe: unreferenced stubs contribute nodes and no edges.
 */
function candidatePathsFor({ sourcePath, raw, index }) {
  const trimmed = raw.trim().replace(/^<|>$/gu, "");
  if (EXTERNAL_TARGET.test(trimmed)) return [];
  const hash = trimmed.indexOf("#");
  let target = hash < 0 ? trimmed : trimmed.slice(0, hash);
  try { target = decodeURIComponent(target); } catch { /* Retain the literal malformed target. */ }
  const relative = target === "" ? sourcePath : posix.join(posix.dirname(sourcePath), target);
  const keys = [target, withoutExtension(target), relative, withoutExtension(relative), posix.basename(withoutExtension(target))];
  return keys.flatMap((key) => lookup(index, key));
}

/**
 * Derive one document's edges against the whole corpus without indexing the whole corpus.
 *
 * The document itself is indexed for real; every path its links could name is admitted as a
 * bare stub. The graph service then resolves exactly as it would over the full vault, so
 * `resolved`, `ambiguous`, and `dangling` keep their ordinary meanings.
 */
export async function deriveDocumentEdges({ root, path, index, frontmatterReferenceKeys = DEFAULT_FRONTMATTER_REFERENCE_KEYS }) {
  const [indexed] = await observeMarkdownDocumentIndex({ root, paths: [path] });
  if (!indexed) return Object.freeze({ edges: Object.freeze([]), document: null });
  const stubs = new Set();
  for (const raw of rawTargetsOf(indexed, frontmatterReferenceKeys)) {
    for (const candidate of candidatePathsFor({ sourcePath: path, raw, index })) stubs.add(candidate);
  }
  stubs.delete(path);
  const graph = deriveMarkdownVaultGraph({
    documents: [indexed, ...[...stubs].map((stubPath) => ({ path: stubPath }))],
    frontmatterReferenceKeys,
  });
  return Object.freeze({
    edges: Object.freeze(graph.edges.filter((edge) => edge.sourcePath === path)),
    document: indexed,
  });
}

/**
 * Link-shaped mentions of `name`, in wikilink, Markdown-link, or frontmatter-reference position.
 *
 * The name must occupy a whole final path segment. Accepting it as a bare substring instead
 * costs correctness at repository scale as well as time: a common name such as `README` then
 * matches tens of thousands of links to other documents, and the bounded set of sources
 * actually examined is drawn arbitrarily from those.
 *
 * The name is also the pattern's only literal, and it is placed where the search tool can see
 * it. A pattern that opens with alternated link syntax reads the same to a person and costs an
 * order of magnitude more, because there is then no literal to scan for and every byte of the
 * corpus must go through the automaton.
 */
export function backlinkPattern(name) {
  const literal = name.replace(REGEX_METACHARACTERS, (character) => `\\${character}`);
  return `(?:^|[\\s(\\[/'"])${literal}(?:\\.(?:md|markdown|mdx))?(?:$|[\\s)\\]#|'",])`;
}

/**
 * Backlinks proven rather than pattern-matched.
 *
 * A bounded search finds documents whose text mentions this one in link position; each of those
 * is then indexed and its edges derived, so a reported backlink is an edge that actually
 * resolves here. Mentions that turn out to name a different document are reported separately
 * as unresolved rather than being counted as links.
 */
export async function deriveBacklinks({ root, path, index, search, documentLimit = 40, frontmatterReferenceKeys = DEFAULT_FRONTMATTER_REFERENCE_KEYS }) {
  const name = posix.basename(withoutExtension(path));
  // The same whole-final-segment test the search pattern applies, so what is reported as an
  // unresolved mention is drawn from the same population the search was allowed to find.
  const namesThisDocument = (target) => posix.basename(withoutExtension(target.split(/[#|]/u, 1)[0].trim())) === name;
  const found = await search({ query: backlinkPattern(name), regularExpression: true, limit: 500 });
  const sources = [];
  for (const match of found.matches) {
    if (match.path === path) continue;
    if (!sources.includes(match.path)) sources.push(match.path);
    if (sources.length >= documentLimit) break;
  }
  const backlinks = [];
  const unresolved = [];
  for (const source of sources) {
    const derived = await deriveDocumentEdges({ root, path: source, index, frontmatterReferenceKeys });
    for (const edge of derived.edges) {
      if (edge.status === "resolved" && edge.targetPath === path) {
        backlinks.push(Object.freeze({
          sourcePath: source,
          kind: edge.kind,
          target: edge.target,
          fragment: edge.fragment,
          evidence: edge.span?.text ?? edge.target,
        }));
      } else if (edge.status !== "external" && namesThisDocument(edge.target)) {
        unresolved.push(Object.freeze({ sourcePath: source, kind: edge.kind, target: edge.target, status: edge.status, candidates: edge.candidates }));
      }
    }
  }
  return Object.freeze({
    backlinks: Object.freeze(backlinks),
    unresolved: Object.freeze(unresolved),
    searchedDocuments: sources.length,
    // How many documents in the whole vault answer to this bare name. One means a link naming it
    // can only mean this document; many means most such links are ambiguous, which is why a
    // document called README can be widely mentioned and still have few provable backlinks.
    nameCarriers: lookupCount(index, name),
    truncated: found.truncated || sources.length >= documentLimit,
  });
}
