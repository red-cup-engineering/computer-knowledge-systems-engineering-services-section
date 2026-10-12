import { tm } from "@red-cup-engineering/computer-code-engineering-services-section/semiotic-expression-notation";
import { telling } from "@red-cup-engineering/computer-code-engineering-services-section/signchain/log";

/**
 * What an archive's documents say, as SignChain tellings: each statement a document makes is a
 * triple of SEN marks -- the document's path, the key or link kind, the value or link target --
 * told for, witnessed by the document's revision. Nothing is interpreted: which term a mark
 * names is read downstream from these tellings.
 */

// One frozen mark per surface: an archive tells the same keys, values and paths hundreds of
// thousands of times, and a mark is a value, so every telling of it can share one.
const marks = new Map();
function markOf(surface) {
  let held = marks.get(surface);
  if (!held) { held = Object.freeze(tm.mark(surface)); marks.set(surface, held); }
  return held;
}

const LINK_KINDS = Object.freeze({ "markdown-link": "link", "markdown-image": "image", wikilink: "link", transclusion: "embed" });

function leaves(key, value) {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value.flatMap((item) => leaves(key, item));
  if (value instanceof Date) return [[key, value.toISOString().slice(0, 10)]];
  if (typeof value === "object") return Object.entries(value).flatMap(([inner, item]) => leaves(`${key}/${inner}`, item));
  return [[key, String(value)]];
}

/**
 * The tellings one document makes: a telling per frontmatter value, per link (to the path it
 * resolves to, or its written target), and per hashtag. `edges` are the document's outgoing
 * edges in the archive graph.
 */
export function documentTellings({ path, revision, frontmatter = {}, features = [], edges = [] }) {
  const subject = markOf(path);
  const out = [];
  const say = (predicate, object) => out.push(telling({ subject, predicate: markOf(predicate), object: markOf(object) }, revision));
  for (const [top, value] of Object.entries(frontmatter ?? {})) for (const [key, surface] of leaves(top, value)) say(key, surface);
  for (const edge of edges) {
    const kind = LINK_KINDS[edge.kind];
    if (kind && edge.status !== "external") say(kind, edge.status === "resolved" ? edge.targetPath : edge.target);
  }
  for (const feature of features) if (feature.type === "hashtag") say("tag", feature.tag);
  return out;
}

/** The surface of a SEN mark (`["mark", text]`), or null for any other term. */
export const markText = (term) => Array.isArray(term) && term[0] === "mark" ? term[1] : null;
