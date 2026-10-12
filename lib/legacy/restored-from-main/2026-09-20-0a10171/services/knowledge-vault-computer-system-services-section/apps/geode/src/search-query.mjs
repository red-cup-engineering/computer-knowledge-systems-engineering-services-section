import { posix } from "node:path";
import { tagsOf } from "./document-structure.mjs";
import { readMarkdownStructure } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-structure";

/**
 * A query parser, planner, and executor for Geode search.
 *
 * `parseSearchQuery` reads a search-box string into a frozen, typed query tree: boolean
 * `AND`/`OR`/`NOT` with parentheses and precedence, quoted phrases, `/regex/` literals, and the
 * field operators `path:`, `file:`, `tag:`, `line:(...)`, `section:(...)`, and `[key: value]`
 * property matches. `planSearchQuery` turns that tree into an explicit, inspectable plan: which
 * clauses become ripgrep passes (supplier work, run once each, deduplicated by signature), which
 * become local post-filters over the admitted path universe or frontmatter (this module's work,
 * because ripgrep cannot combine separate patterns with boolean logic in one pass), and in what
 * order. `executeSearchQuery` runs that plan against injected effectors and returns results where
 * every path carries the clauses that matched it, where, and with what evidence.
 *
 * Effector contract for `executeSearchQuery({ plan, search, paths, readFrontmatter, readDocument })`:
 *   - `search({ query, regularExpression, caseSensitive })` -> matches array (or `{ matches }`),
 *     each match shaped `{ path, line, column, text }` — the same shape
 *     `searchMarkdownVaults` returns. One call per entry in `plan.passes`.
 *   - `paths()` -> array of admitted repository-relative paths (or a promise of one). Called at
 *     most once, only when `plan.requiresPathUniverse` is true, and its result is shared by every
 *     clause that needs it (a NOT's complement, or a path:/file:/tag:/property leaf with nothing
 *     to post-filter against).
 *   - `readFrontmatter(path)` -> that document's frontmatter object, or a nullish value if it has
 *     none (or a promise of either). Called per candidate path, only for tag:/property clauses,
 *     and cached per path within one execution.
 *   - `readDocument(path)` -> complete Markdown source. Required only for section: and tag: queries;
 *     matching documents are read once; headings and tag eligibility use the shared Markdown observation.
 *
 * Design honesty, stated once here rather than scattered: NOT can only be answered by subtracting
 * a matched set from a known universe, never by a search that only ever returns hits, so every NOT
 * fetches `paths()` — once, shared, not per candidate. `line:`/`section:` scope co-occurrence to a
 * single physical line or heading-delimited block; because that requires knowing where a match
 * falls relative to other matches in the same document, `NOT` and the per-document fields
 * `path:`/`file:`/`[key: value]` are refused inside that scope at parse time — pointed at with a
 * precise position — rather than silently approximated.
 */

// ---------------------------------------------------------------------------------------------
// Errors and small shared helpers
// ---------------------------------------------------------------------------------------------

/** A parse error that names exactly where in the query text it went wrong. */
export class SearchQueryParseError extends Error {
  constructor(reason, position, text) {
    const caret = `${" ".repeat(position)}^`;
    super(`${reason} at position ${position}\n${text}\n${caret}`);
    this.name = "SearchQueryParseError";
    this.reason = reason;
    this.position = position;
    this.text = text;
  }
}

function escapeRegExpChars(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function push(map, key, value) {
  const held = map.get(key);
  if (held) held.push(value);
  else map.set(key, [value]);
}

// ---------------------------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------------------------

const SIMPLE_FIELDS = new Set(["path", "file", "tag"]);
const SCOPE_FIELDS = new Set(["line", "section"]);
const WHITESPACE = /\s/u;
const STOP_CHARS = "()[]\"/";

function isStop(char) {
  return char === undefined || WHITESPACE.test(char) || STOP_CHARS.includes(char);
}

/** Scan a quoted phrase starting at `text[i] === '"'`. Supports `\"` and `\\`. */
function scanQuoted(text, i) {
  let j = i + 1;
  let value = "";
  for (;;) {
    if (j >= text.length) throw new SearchQueryParseError("unterminated quoted phrase", i, text);
    const char = text[j];
    if (char === "\\" && (text[j + 1] === "\"" || text[j + 1] === "\\")) { value += text[j + 1]; j += 2; continue; }
    if (char === "\"") return { value, end: j + 1 };
    value += char;
    j += 1;
  }
}

/** Scan a `/regex/flags` literal starting at `text[i] === '/'`. Only the `i` flag is admitted. */
function scanRegex(text, i) {
  let j = i + 1;
  let pattern = "";
  for (;;) {
    if (j >= text.length) throw new SearchQueryParseError("unterminated regex literal", i, text);
    const char = text[j];
    if (char === "\\" && text[j + 1] === "/") { pattern += "/"; j += 2; continue; }
    if (char === "/") { j += 1; break; }
    pattern += char;
    j += 1;
  }
  let flags = "";
  while (j < text.length && /[a-z]/iu.test(text[j])) {
    if (text[j] !== "i") throw new SearchQueryParseError(`unsupported regex flag '${text[j]}' (only 'i' is admitted)`, j, text);
    flags += text[j];
    j += 1;
  }
  if (pattern === "") throw new SearchQueryParseError("regex literal must not be empty", i, text);
  return { pattern, flags, end: j };
}

/** Scan a `[key: value]` property block starting at `text[i] === '['`. */
function scanProperty(text, i) {
  const close = text.indexOf("]", i);
  if (close < 0) throw new SearchQueryParseError("unterminated property brackets, expected ']'", i, text);
  const content = text.slice(i + 1, close);
  const colon = content.indexOf(":");
  if (colon < 0) throw new SearchQueryParseError("a property must have the form [key: value]", i, text);
  const key = content.slice(0, colon).trim();
  let value = content.slice(colon + 1).trim();
  if (key === "") throw new SearchQueryParseError("property key must not be empty", i + 1, text);
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) value = value.slice(1, -1);
  if (value === "") throw new SearchQueryParseError("property value must not be empty", i, text);
  return { key, value, end: close + 1 };
}

/** Scan a `path:`/`file:`/`tag:` value: a quoted phrase, or a run stopping at whitespace or ')'. */
function scanFieldValue(text, i) {
  if (text[i] === "\"") {
    const { value, end } = scanQuoted(text, i);
    return { value, end };
  }
  let j = i;
  while (j < text.length && text[j] !== ")" && !WHITESPACE.test(text[j])) j += 1;
  return { value: text.slice(i, j), end: j };
}

/**
 * Scan one bareword. Stops at whitespace, a bracket/paren/quote/slash, or a colon.
 * A colon is only special when the word before it is a reserved field name (`path`, `file`,
 * `tag`, `line`, `section`); otherwise it is ordinary word text and scanning continues through it
 * — so `depends-on` and `status:draft` (not a reserved field) both read as one literal term.
 */
function scanBareword(text, i) {
  let j = i;
  while (j < text.length && text[j] !== ":" && !isStop(text[j])) j += 1;
  const segment = text.slice(i, j);
  if (text[j] !== ":") return { kind: "word", text: segment, end: j };
  const lower = segment.toLowerCase();
  if (SIMPLE_FIELDS.has(lower) || SCOPE_FIELDS.has(lower)) return { kind: "reserved", name: lower, end: j + 1 };
  let k = j;
  while (k < text.length && !isStop(text[k])) k += 1;
  return { kind: "word", text: text.slice(i, k), end: k };
}

function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (WHITESPACE.test(char)) { i += 1; continue; }
    if (char === "(") { tokens.push({ type: "LPAREN", start: i, end: i + 1 }); i += 1; continue; }
    if (char === ")") { tokens.push({ type: "RPAREN", start: i, end: i + 1 }); i += 1; continue; }
    if (char === "-") { tokens.push({ type: "MINUS", start: i, end: i + 1 }); i += 1; continue; }
    if (char === "\"") {
      const { value, end } = scanQuoted(text, i);
      tokens.push({ type: "PHRASE", value, start: i, end });
      i = end;
      continue;
    }
    if (char === "/") {
      const { pattern, flags, end } = scanRegex(text, i);
      tokens.push({ type: "REGEX", pattern, flags, start: i, end });
      i = end;
      continue;
    }
    if (char === "[") {
      const { key, value, end } = scanProperty(text, i);
      tokens.push({ type: "PROPERTY", key, value, start: i, end });
      i = end;
      continue;
    }
    if (char === "]") throw new SearchQueryParseError("unexpected ']' with no matching '['", i, text);
    const scanned = scanBareword(text, i);
    if (scanned.kind === "reserved") {
      if (SCOPE_FIELDS.has(scanned.name)) {
        if (text[scanned.end] !== "(") {
          throw new SearchQueryParseError(`'${scanned.name}:' must be followed by '(' — expected a scoped sub-query`, scanned.end, text);
        }
        tokens.push({ type: "SCOPE_OPEN", field: scanned.name, start: i, end: scanned.end + 1 });
        i = scanned.end + 1;
        continue;
      }
      const { value, end } = scanFieldValue(text, scanned.end);
      if (value === "") throw new SearchQueryParseError(`'${scanned.name}:' requires a value`, scanned.end, text);
      tokens.push({ type: "FIELD", field: scanned.name, value, start: i, end });
      i = end;
      continue;
    }
    const word = scanned.text;
    if (word === "") throw new SearchQueryParseError(`unexpected character '${char}'`, i, text);
    if (word === "AND") tokens.push({ type: "AND", start: i, end: scanned.end });
    else if (word === "OR") tokens.push({ type: "OR", start: i, end: scanned.end });
    else if (word === "NOT") tokens.push({ type: "NOT", start: i, end: scanned.end });
    else tokens.push({ type: "WORD", value: word, start: i, end: scanned.end });
    i = scanned.end;
  }
  tokens.push({ type: "EOF", start: text.length, end: text.length });
  return tokens;
}

// ---------------------------------------------------------------------------------------------
// Parser: recursive descent, precedence NOT > AND > OR, with implicit AND between adjacent terms
// ---------------------------------------------------------------------------------------------

const PRIMARY_STARTERS = new Set(["LPAREN", "PHRASE", "WORD", "REGEX", "FIELD", "PROPERTY", "SCOPE_OPEN", "NOT", "MINUS"]);

function node(fields) { return Object.freeze(fields); }

function mergeChain(type, left, right) {
  const clauses = [];
  clauses.push(...(left.type === type ? left.clauses : [left]));
  clauses.push(...(right.type === type ? right.clauses : [right]));
  return node({ type, clauses: Object.freeze(clauses) });
}

function makeParser(text) {
  const tokens = tokenize(text);
  let index = 0;
  const peek = () => tokens[index];
  const advance = () => tokens[index++];
  const expect = (type, what) => {
    const token = peek();
    if (token.type !== type) throw new SearchQueryParseError(`expected ${what}`, token.start, text);
    return advance();
  };

  function parseOr(ctx) {
    let left = parseAnd(ctx);
    while (peek().type === "OR") { advance(); left = mergeChain("or", left, parseAnd(ctx)); }
    return left;
  }

  function parseAnd(ctx) {
    let left = parseNot(ctx);
    for (;;) {
      if (peek().type === "AND") { advance(); left = mergeChain("and", left, parseNot(ctx)); continue; }
      if (PRIMARY_STARTERS.has(peek().type)) { left = mergeChain("and", left, parseNot(ctx)); continue; }
      break;
    }
    return left;
  }

  function parseNot(ctx) {
    const token = peek();
    if (token.type === "NOT" || token.type === "MINUS") {
      if (!ctx.allowNot) {
        throw new SearchQueryParseError("NOT is not supported inside line:/section: scope — there is no way to know every line or section that does not match without reading whole files", token.start, text);
      }
      advance();
      return node({ type: "not", clause: parseNot(ctx) });
    }
    return parsePrimary(ctx);
  }

  function parsePrimary(ctx) {
    const token = peek();
    switch (token.type) {
      case "LPAREN": {
        advance();
        const inner = parseOr(ctx);
        expect("RPAREN", "')'");
        return inner;
      }
      case "PHRASE":
        advance();
        return node({ type: "term", value: token.value, quoted: true });
      case "WORD":
        advance();
        return node({ type: "term", value: token.value, quoted: false });
      case "REGEX":
        advance();
        return node({ type: "regex", pattern: token.pattern, flags: token.flags });
      case "FIELD": {
        advance();
        if (ctx.insideScope && (token.field === "path" || token.field === "file")) {
          throw new SearchQueryParseError(`'${token.field}:' names a whole document, which is not meaningful inside line:/section: scope`, token.start, text);
        }
        return node({ type: "field", field: token.field, value: token.value });
      }
      case "PROPERTY": {
        advance();
        if (ctx.insideScope) {
          throw new SearchQueryParseError("[key: value] properties belong to a whole document, which is not meaningful inside line:/section: scope", token.start, text);
        }
        return node({ type: "property", key: token.key, value: token.value });
      }
      case "SCOPE_OPEN": {
        advance();
        if (ctx.insideScope) {
          throw new SearchQueryParseError(`'${token.field}:' cannot be nested inside line:/section: scope`, token.start, text);
        }
        const inner = parseOr({ allowNot: false, insideScope: true });
        expect("RPAREN", "')' to close the scoped sub-query");
        return node({ type: token.field, clause: inner });
      }
      default:
        throw new SearchQueryParseError(`unexpected token${token.value ? ` '${token.value}'` : ""}`, token.start, text);
    }
  }

  return { parseOr, peek };
}

/**
 * Parse search-box text into a frozen, typed query tree.
 * Throws `TypeError` for a non-string or empty input, `SearchQueryParseError` (with `.position`
 * pointing at the offending character) for anything the grammar refuses.
 */
export function parseSearchQuery(text) {
  if (typeof text !== "string") throw new TypeError("query text must be a string");
  if (text.trim() === "") throw new SearchQueryParseError("query is empty", 0, text);
  const parser = makeParser(text);
  const tree = parser.parseOr({ allowNot: true, insideScope: false });
  const trailing = parser.peek();
  if (trailing.type !== "EOF") throw new SearchQueryParseError(`unexpected '${trailing.value ?? trailing.type.toLowerCase()}'`, trailing.start, text);
  return tree;
}

// ---------------------------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------------------------

function normalizeTagValue(value) { return value.replace(/^#/u, ""); }

/**
 * Turn a parsed query tree into an explicit plan: named ripgrep passes (supplier work), the
 * annotated tree describing how each node combines them (this module's work), and whether a full
 * path-universe fetch is needed and why.
 */
export function planSearchQuery(tree) {
  if (!tree || typeof tree !== "object" || typeof tree.type !== "string") {
    throw new TypeError("tree must be a query node from parseSearchQuery");
  }
  let counter = 0;
  const nextId = () => `n${counter++}`;
  const passes = [];
  const passSignatures = new Map();
  let requiresPathUniverse = false;
  let universeReason = null;
  let requiresHeadings = false;
  let requiresTags = false;

  function markUniverse(reason) {
    if (!requiresPathUniverse) { requiresPathUniverse = true; universeReason = reason; }
  }

  function addPass(kind, spec) {
    const signature = `${kind}\t${spec.query}\t${spec.regularExpression}\t${spec.caseSensitive}`;
    const cached = passSignatures.get(signature);
    if (cached) return cached;
    const id = `p${passes.length}`;
    passes.push(Object.freeze({ id, kind, ...spec }));
    passSignatures.set(signature, id);
    return id;
  }

  function walk(source, scope) {
    switch (source.type) {
      case "and":
      case "or":
        return node({ id: nextId(), type: source.type, scope, clauses: Object.freeze(source.clauses.map((c) => walk(c, scope))) });
      case "not": {
        markUniverse("a NOT clause is answered by subtracting its matches from the full admitted path universe");
        return node({ id: nextId(), type: "not", scope, clause: walk(source.clause, scope) });
      }
      case "term": {
        const passId = addPass("ripgrep", { query: source.value, regularExpression: false, caseSensitive: false, purpose: source.quoted ? "phrase" : "term" });
        return node({ id: nextId(), type: "term", scope, value: source.value, quoted: source.quoted, passId });
      }
      case "regex": {
        const caseSensitive = !source.flags.includes("i");
        const passId = addPass("ripgrep", { query: source.pattern, regularExpression: true, caseSensitive, purpose: "regex" });
        return node({ id: nextId(), type: "regex", scope, pattern: source.pattern, flags: source.flags, passId });
      }
      case "field": {
        if (source.field === "tag") {
          requiresTags = true;
          const tag = normalizeTagValue(source.value);
          const passId = addPass("ripgrep", { query: `#${tag}`, regularExpression: false, caseSensitive: false, purpose: "tag-inline" });
          const readsFrontmatter = scope === "document";
          if (readsFrontmatter) markUniverse("tag: also checks frontmatter tags/keywords, which is read per candidate over the full admitted path universe");
          return node({ id: nextId(), type: "field", field: "tag", scope, value: source.value, passId, readsFrontmatter });
        }
        markUniverse(`${source.field}: is a post-filter over paths with no ripgrep pass of its own, so it scans the full admitted path universe once`);
        return node({ id: nextId(), type: "field", field: source.field, scope, value: source.value });
      }
      case "property":
        markUniverse("[key: value] reads frontmatter, so it scans the full admitted path universe once");
        return node({ id: nextId(), type: "property", scope, key: source.key, value: source.value });
      case "line":
      case "section": {
        if (source.type === "section") requiresHeadings = true;
        return node({ id: nextId(), type: source.type, scope, clause: walk(source.clause, source.type) });
      }
      default:
        throw new TypeError(`unknown query node type: ${source.type}`);
    }
  }

  const planTree = walk(tree, "document");
  const notes = [
    "passes (kind \"ripgrep\") are supplier work: one process invocation each, returning line-level matches with path/line/column/text; identical passes are deduplicated by signature.",
    "and/or/not combination, and every path:/file:/tag:/[key: value] check, is local post-processing over those matches plus the injected path universe and frontmatter reader — ripgrep cannot combine separate patterns with boolean logic in one pass.",
  ];
  if (requiresPathUniverse) notes.push(`paths() is fetched once and shared by every clause that needs it: ${universeReason}.`);
  if (requiresTags) notes.push("tag: text matches are candidates; readDocument confirms tag syntax outside headings and code through the shared document observations.");
  if (requiresHeadings) notes.push("section: scoping reads only matching documents through readDocument; the shared Markdown observation identifies the nearest preceding heading (or preamble), excluding metadata and fenced examples.");

  return Object.freeze({
    type: "GeodeSearchQueryPlan",
    schemaVersion: "geode-search-query-plan/v1",
    query: tree,
    tree: planTree,
    passes: Object.freeze(passes),
    requiresHeadings,
    requiresTags,
    requiresPathUniverse,
    universeReason,
    notes: Object.freeze(notes),
  });
}

// ---------------------------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------------------------

function globToPredicate(value) {
  const folded = value.toLowerCase();
  if (!folded.includes("*")) return (candidate) => candidate.toLowerCase().includes(folded);
  const pattern = `^${folded.split("*").map(escapeRegExpChars).join(".*")}$`;
  const regexp = new RegExp(pattern, "u");
  return (candidate) => regexp.test(candidate.toLowerCase());
}

/** A plain, id-free description of a clause, for evidence readability (e.g. under a NOT). */
function describeClause(planNode) {
  switch (planNode.type) {
    case "term": return { type: "term", value: planNode.value, quoted: planNode.quoted };
    case "regex": return { type: "regex", pattern: planNode.pattern, flags: planNode.flags };
    case "field": return { type: "field", field: planNode.field, value: planNode.value };
    case "property": return { type: "property", key: planNode.key, value: planNode.value };
    case "and":
    case "or": return { type: planNode.type, clauses: planNode.clauses.map(describeClause) };
    case "not": return { type: "not", clause: describeClause(planNode.clause) };
    case "line":
    case "section": return { type: planNode.type, clause: describeClause(planNode.clause) };
    default: return { type: planNode.type };
  }
}

function collectTagLikeValues(frontmatter) {
  if (!frontmatter || typeof frontmatter !== "object") return [];
  return [frontmatter.tags, frontmatter.keywords].flat(Infinity).filter((value) => typeof value === "string");
}

/**
 * Run a plan's ripgrep passes and local post-filters through injected effectors, and return every
 * matched document with the clauses that matched it, where, and with what evidence. See the
 * module doc comment above for the exact effector contract.
 */
export async function executeSearchQuery({ plan, search, paths, readFrontmatter, readDocument }) {
  if (!plan || plan.type !== "GeodeSearchQueryPlan") throw new TypeError("plan must come from planSearchQuery");
  if (typeof search !== "function") throw new TypeError("search must be a function");
  if (typeof paths !== "function") throw new TypeError("paths must be a function");
  if (typeof readFrontmatter !== "function") throw new TypeError("readFrontmatter must be a function");

  if ((plan.requiresHeadings || plan.requiresTags) && typeof readDocument !== "function") throw new TypeError("section: and tag: queries require readDocument");

  const passResults = new Map();
  await Promise.all(plan.passes.map(async (pass) => {
    const raw = await search({ query: pass.query, regularExpression: pass.regularExpression, caseSensitive: pass.caseSensitive });
    passResults.set(pass.id, Array.isArray(raw) ? raw : (raw?.matches ?? []));
  }));

  let universePromise = null;
  function universe() {
    if (!universePromise) {
      universePromise = Promise.resolve(paths()).then((list) => {
        if (!Array.isArray(list)) throw new TypeError("paths() must return (or resolve to) an array of path strings");
        return Object.freeze([...list]);
      });
    }
    return universePromise;
  }

  const frontmatterCache = new Map();
  function frontmatterOf(path) {
    if (!frontmatterCache.has(path)) {
      frontmatterCache.set(path, Promise.resolve(readFrontmatter(path)).catch(() => null));
    }
    return frontmatterCache.get(path);
  }

  const sourceCache = new Map();
  function sourceOf(path) {
    if (!sourceCache.has(path)) sourceCache.set(path, Promise.resolve().then(() => readDocument(path)));
    return sourceCache.get(path);
  }
  const tagsCache = new Map();
  function tagsAt(path) {
    if (!tagsCache.has(path)) tagsCache.set(path, sourceOf(path).then((source) => tagsOf(source).tags));
    return tagsCache.get(path);
  }

  const headingsByPath = new Map();
  if (plan.requiresHeadings) {
    const sectionPasses = new Set();
    function collectSectionPasses(node) {
      if (node.scope === "section" && node.passId) sectionPasses.add(node.passId);
      for (const clause of node.clauses ?? []) collectSectionPasses(clause);
      if (node.clause) collectSectionPasses(node.clause);
    }
    collectSectionPasses(plan.tree);
    const candidates = new Set([...sectionPasses].flatMap((id) => (passResults.get(id) ?? []).map(({ path }) => path)));
    for (const path of candidates) {
      const source = await sourceOf(path);
      headingsByPath.set(path, readMarkdownStructure(source).headings.map(({ line }) => line));
    }
  }

  function sectionMarkerFor(path, line) {
    const list = headingsByPath.get(path) ?? [];
    let boundary = 0;
    for (const headingLine of list) {
      if (headingLine <= line) boundary = headingLine;
      else break;
    }
    return boundary;
  }

  function keyFor(scope, path, line) {
    if (scope === "document") return path;
    if (scope === "line") return `${path}\t${line}`;
    return `${path}\t${sectionMarkerFor(path, line)}`;
  }

  function evalTerm(planNode) {
    const map = new Map();
    for (const match of passResults.get(planNode.passId) ?? []) {
      const key = keyFor(planNode.scope, match.path, match.line);
      push(map, key, {
        nodeId: planNode.id,
        kind: "content",
        clause: describeClause(planNode),
        evidence: [{ path: match.path, line: match.line, column: match.column, text: match.text }],
      });
    }
    return map;
  }

  async function evalPathLike(planNode) {
    const list = await universe();
    const predicate = globToPredicate(planNode.value);
    const map = new Map();
    for (const path of list) {
      const candidate = planNode.field === "file" ? posix.basename(path) : path;
      if (predicate(candidate)) {
        map.set(path, [{ nodeId: planNode.id, kind: planNode.field, clause: describeClause(planNode), evidence: [{ path, matched: candidate }] }]);
      }
    }
    return map;
  }

  async function evalTag(planNode) {
    const map = new Map();
    const folded = normalizeTagValue(planNode.value).toLowerCase();
    for (const match of passResults.get(planNode.passId) ?? []) {
      const observed = await tagsAt(match.path);
      if (!observed.some(({ name, lines }) => name.toLowerCase() === folded && lines.includes(match.line))) continue;
      const key = keyFor(planNode.scope, match.path, match.line);
      push(map, key, {
        nodeId: planNode.id,
        kind: "tag-inline",
        clause: describeClause(planNode),
        evidence: [{ path: match.path, line: match.line, column: match.column, text: match.text }],
      });
    }
    if (planNode.readsFrontmatter) {
      const list = await universe();
      const folded = normalizeTagValue(planNode.value).toLowerCase();
      await Promise.all(list.map(async (path) => {
        const frontmatter = await frontmatterOf(path);
        if (collectTagLikeValues(frontmatter).some((value) => value.toLowerCase() === folded)) {
          push(map, path, { nodeId: planNode.id, kind: "tag-frontmatter", clause: describeClause(planNode), evidence: [{ path, property: "tags", value: planNode.value }] });
        }
      }));
    }
    return map;
  }

  async function evalProperty(planNode) {
    const list = await universe();
    const map = new Map();
    await Promise.all(list.map(async (path) => {
      const frontmatter = await frontmatterOf(path);
      if (!frontmatter || typeof frontmatter !== "object" || !(planNode.key in frontmatter)) return;
      const actual = frontmatter[planNode.key];
      const matched = Array.isArray(actual)
        ? actual.some((value) => String(value).toLowerCase() === planNode.value.toLowerCase())
        : String(actual).toLowerCase() === planNode.value.toLowerCase();
      if (matched) map.set(path, [{ nodeId: planNode.id, kind: "property", clause: describeClause(planNode), evidence: [{ path, key: planNode.key, value: actual }] }]);
    }));
    return map;
  }

  async function evalNot(planNode) {
    const list = await universe();
    const childMap = await evalNode(planNode.clause);
    const map = new Map();
    for (const path of list) {
      if (!childMap.has(path)) {
        map.set(path, [{ nodeId: planNode.id, kind: "not", clause: describeClause(planNode.clause), evidence: [{ path, note: "no match found for the negated clause" }] }]);
      }
    }
    return map;
  }

  async function evalAnd(planNode) {
    const childMaps = await Promise.all(planNode.clauses.map(evalNode));
    const [first, ...rest] = childMaps;
    const map = new Map();
    for (const [key, entries] of first) {
      const merged = [...entries];
      let held = true;
      for (const other of rest) {
        const found = other.get(key);
        if (!found) { held = false; break; }
        merged.push(...found);
      }
      if (held) map.set(key, merged);
    }
    return map;
  }

  async function evalOr(planNode) {
    const childMaps = await Promise.all(planNode.clauses.map(evalNode));
    const map = new Map();
    for (const child of childMaps) {
      for (const [key, entries] of child) {
        const held = map.get(key);
        if (held) held.push(...entries); else map.set(key, [...entries]);
      }
    }
    return map;
  }

  async function evalScope(planNode) {
    const childMap = await evalNode(planNode.clause);
    const map = new Map();
    for (const [key, entries] of childMap) {
      const [path, marker] = key.split("\t");
      const label = planNode.type === "line" ? { line: Number(marker) } : { sectionStart: Number(marker) };
      push(map, path, { nodeId: planNode.id, kind: planNode.type, clause: describeClause(planNode), evidence: [{ ...label, matches: entries }] });
    }
    return map;
  }

  function evalNode(planNode) {
    switch (planNode.type) {
      case "and": return evalAnd(planNode);
      case "or": return evalOr(planNode);
      case "not": return evalNot(planNode);
      case "term":
      case "regex": return evalTerm(planNode);
      case "field": return planNode.field === "tag" ? evalTag(planNode) : evalPathLike(planNode);
      case "property": return evalProperty(planNode);
      case "line":
      case "section": return evalScope(planNode);
      default: throw new TypeError(`cannot execute plan node type: ${planNode.type}`);
    }
  }

  const rootMap = await evalNode(plan.tree);
  const results = [...rootMap.entries()]
    .map(([path, matches]) => Object.freeze({
      type: "GeodeSearchQueryResult",
      path,
      matches: Object.freeze(matches.map((entry) => Object.freeze({ ...entry, evidence: Object.freeze(entry.evidence.map((row) => Object.freeze(row))) }))),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return Object.freeze(results);
}
