import { posix } from "node:path";
import { address } from "@red-cup-engineering/computer-data-engineering-services-section/signcell/cell";
import { nameKey } from "./vault-index.mjs";

/**
 * A vault read as SignCell cells. Every statement a document makes is a triple
 * (subject, predicate, object): a frontmatter entry is (document, key, value), a link is
 * (document, link, target). Each position is a term wherever the vault has one -- the key
 * `see-also` is itself a term when some document answers to that name, so predicates carry
 * statements of their own and the cells mesh -- and a bare mark (its surface) wherever it
 * does not. The document making the statement is its witness, named by the digest of what its
 * body says, so copies of one text are one witness however often they are filed.
 *
 * Terms are `{ term, in }`: a folded name read in a locale (the section a document is filed
 * in, its register). Marks are `{ mark }`. Nothing here decides what a statement means.
 */

/**
 * The locale a document is filed in: the section that holds it, read down the section chain
 * (`a-section/services/b-section/services/...`) to the first segment that is neither a section
 * nor `services`. A document no section holds is filed in its directory.
 */
export function localeOf(path) {
  const segments = path.split("/");
  let owner = -1;
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (/-section$/u.test(segments[index])) owner = index;
    else if (segments[index] !== "services" && owner >= 0) break;
  }
  return owner < 0 ? posix.dirname(path) : segments.slice(0, owner + 1).join("/");
}

const PLACE_NAMES = new Set(["readme", "index", "_index"]);

/** The term a document is: its file name (its directory's, for a README or index) read in its locale. */
export function termOf(path) {
  let stem = posix.basename(path).replace(/\.(?:md|markdown)$/iu, "");
  if (PLACE_NAMES.has(stem.toLowerCase())) stem = posix.basename(posix.dirname(path));
  return Object.freeze({ term: nameKey(stem), in: localeOf(path) });
}

export const markOf = (surface) => Object.freeze({ mark: String(surface) });

/** The canonical text of a term or mark, for indexing and comparison. */
export const termText = (value) => value.term !== undefined ? JSON.stringify({ term: value.term, in: value.in }) : JSON.stringify({ mark: value.mark });

function sharedDepth(left, right) {
  const a = left.split("/"), b = right.split("/");
  let depth = 0;
  while (depth < a.length && depth < b.length && a[depth] === b[depth]) depth += 1;
  return depth;
}

/**
 * A name resolver over the vault's names (`name key -> paths answering to it`). A surface
 * resolves to the term of the document answering to its folded name that is filed nearest the
 * speaker (the deepest shared locale; a glossary carrier before any other at one depth). A
 * surface no document answers to, or that two equally near terms answer to, stays a mark.
 */
export function createTermResolver(names) {
  const cache = new Map();
  return function resolve(surface, fromPath) {
    const key = nameKey(surface);
    const paths = key ? names.get(key) : undefined;
    if (!paths || paths.length === 0) return markOf(surface);
    const from = localeOf(fromPath);
    const cacheKey = `${key}\u0000${from}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? markOf(surface);
    let best = null, bestScore = -1, tied = false;
    for (const path of paths) {
      const term = termOf(path);
      const score = sharedDepth(from, term.in) * 2 + (path.includes("/glossary/") ? 1 : 0);
      if (score > bestScore) { best = term; bestScore = score; tied = false; }
      else if (score === bestScore && termText(term) !== termText(best)) tied = true;
    }
    const resolved = tied ? null : best;
    cache.set(cacheKey, resolved);
    return resolved ?? markOf(surface);
  };
}

function leaves(key, value) {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value.flatMap((item) => leaves(key, item));
  if (value instanceof Date) return [[key, value.toISOString().slice(0, 10)]];
  if (typeof value === "object") return Object.entries(value).flatMap(([inner, item]) => leaves(`${key}/${inner}`, item));
  return [[key, String(value)]];
}

const LINK_PREDICATES = Object.freeze({ "markdown-link": "link", "markdown-image": "image", wikilink: "link", transclusion: "embed" });

/**
 * The statements one document makes, as `{ subject, predicate, object, address }` triples.
 * `edges` are the document's outgoing edges from the vault graph (link targets resolved there);
 * `resolve` is a term resolver.
 */
export function documentStatements({ path, frontmatter = {}, features = [], edges = [], resolve }) {
  const subject = termOf(path);
  const out = [];
  const targets = new Map();
  for (const edge of edges) if (edge.status === "resolved" && edge.kind === "frontmatter-reference") targets.set(`${edge.key}\u0000${edge.target}`, edge.targetPath);
  const say = (predicate, object) => {
    const triple = { subject, predicate, object };
    out.push(Object.freeze({ ...triple, address: address(triple) }));
  };
  for (const [top, value] of Object.entries(frontmatter ?? {})) {
    for (const [key, surface] of leaves(top, value)) {
      const target = targets.get(`${top}\u0000${surface}`);
      say(resolve(key, path), target ? termOf(target) : surface.length <= 200 ? resolve(surface, path) : markOf(surface));
    }
  }
  for (const edge of edges) {
    const predicate = LINK_PREDICATES[edge.kind];
    if (!predicate || edge.status === "external") continue;
    say(resolve(predicate, path), edge.status === "resolved" ? termOf(edge.targetPath) : markOf(edge.target));
  }
  for (const feature of features) if (feature.type === "hashtag") say(resolve("tag", path), resolve(feature.tag, path));
  const seen = new Set();
  return Object.freeze(out.filter((statement) => !seen.has(statement.address) && seen.add(statement.address)));
}
