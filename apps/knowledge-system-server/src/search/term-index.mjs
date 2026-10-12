/**
 * src/search/term-index - ranked word search over keyed documents, the archive search's own readout.
 *
 * A term index is derived from the documents put into it: each put is recorded in the store as a
 * `revision-term` record holding the document's key, revision, length in words and word counts, and
 * the index (postings, lengths, counts) is read from those records when it opens and kept current as
 * documents are put. A document's text is never kept here, only its word counts. Without `root` the
 * index lives for the process.
 *
 * Ranking is Okapi BM25 (`k1` 1.2, `b` 0.75, the inverse document frequency floored just above
 * zero for words most documents hold); a query matches the documents holding every one of its
 * words, best first, ties by key. `tokenize` decides what a word is.
 */
import { each, put } from "@red-cup-engineering/semiotic-eavt-services-section/store";

/** The store type a term index keeps its puts under. */
export const TERM_TYPE = "revision-term";

/** The words of a text: lowercase letter-and-digit runs, diacritics kept. */
export function words(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** The words of a text with diacritics folded away ("Pheží" reads as "phezi"). */
export function foldedWords(text) {
  return words(String(text).normalize("NFD").replace(/\p{M}+/gu, ""));
}

/** The bytes a line of lines takes as a record carries it (a JSON string inside a JSON record). */
export const carriedBytes = (line) => Buffer.byteLength(JSON.stringify(line));
/** What one record's lines may take: canonical JSON of a string at most doubles it, and a record is 64 KiB. */
export const RECORD_LINES_BYTES = 24 * 1024;

const sortedCounts = (counts) => [...counts].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([term, count]) => `${term}\t${count}`).join("\n");
function countsOf(carrier) {
  const counts = new Map();
  if (carrier === "") return counts;
  for (const line of carrier.split("\n")) {
    const tab = line.lastIndexOf("\t");
    const count = Number(line.slice(tab + 1));
    if (tab < 1 || !Number.isInteger(count) || count < 1) throw new TypeError("term index counts are word<TAB>count lines");
    counts.set(line.slice(0, tab), count);
  }
  return counts;
}

/** A put's lines: one, or several when its counts alone pass a record's bound (`[key, revision, length, counts, true]` continues). */
function putLines({ key, revision, length, counts }) {
  const lines = [], part = [];
  let bytes = 0;
  const flush = () => {
    lines.push(JSON.stringify(lines.length === 0 ? [key, revision, length, part.join("\n")] : [key, revision, length, part.join("\n"), true]));
    part.length = 0;
    bytes = 0;
  };
  for (const line of sortedCounts(counts).split("\n")) {
    const size = carriedBytes(line) + 4;
    if (bytes + size > RECORD_LINES_BYTES / 2 && part.length > 0) flush();
    part.push(line);
    bytes += size;
  }
  flush();
  return lines;
}

/** Whether `words` occur as one run, in order, among `text`'s words. */
function holdsRun(text, words) {
  outer: for (let start = 0; start + words.length <= text.length; start += 1) {
    for (let at = 0; at < words.length; at += 1) if (text[start + at] !== words[at]) continue outer;
    return true;
  }
  return false;
}

/** A query in the FTS5 subset `match` answers, as a tree; null when it asks for nothing. */
function parseQuery(expression, tokenize) {
  const tokens = [];
  const pattern = /\s*(?:(\()|(\))|"((?:[^"]|"")*)"(\*)?|([^\s()"]+))/gyu;
  let found;
  pattern.lastIndex = 0;
  while (pattern.lastIndex < expression.length && (found = pattern.exec(expression)) !== null) {
    if (found[0].trim() === "") break;
    if (found[1]) tokens.push({ kind: "open" });
    else if (found[2]) tokens.push({ kind: "close" });
    else if (found[3] !== undefined) tokens.push({ kind: "phrase", text: found[3].replaceAll('""', '"'), prefix: Boolean(found[4]) });
    else {
      const word = found[5];
      if (["AND", "OR", "NOT"].includes(word)) tokens.push({ kind: word });
      else if (/[:^+]/u.test(word) || word === "NEAR" || /^NEAR\(/u.test(word)) throw new TypeError(`unsupported FTS5 query syntax: ${word}`);
      else tokens.push({ kind: "phrase", text: word.endsWith("*") ? word.slice(0, -1) : word, prefix: word.endsWith("*") });
    }
  }
  if (pattern.lastIndex < expression.length && expression.slice(pattern.lastIndex).trim() !== "") throw new TypeError(`unparsed FTS5 query: ${expression.slice(pattern.lastIndex)}`);
  let at = 0;
  const peek = () => tokens[at], take = () => tokens[at++];
  const leaf = (token) => {
    const words = tokenize(token.text);
    if (words.length === 0) return null;
    if (!token.prefix) return { kind: "phrase", words };
    const prefix = { kind: "prefix", prefix: words.at(-1) };
    return words.length === 1 ? prefix : { kind: "and", parts: [{ kind: "phrase", words: words.slice(0, -1) }, prefix] };
  };
  const primary = () => {
    const token = take();
    if (token === undefined) throw new TypeError("FTS5 query ends where a term was expected");
    if (token.kind === "open") {
      const inner = or();
      if (take()?.kind !== "close") throw new TypeError("FTS5 query has an unclosed parenthesis");
      return inner;
    }
    if (token.kind === "phrase") return leaf(token);
    throw new TypeError(`FTS5 query has ${token.kind} where a term was expected`);
  };
  const not = () => {
    let node = primary();
    while (peek()?.kind === "NOT") { take(); const without = primary(); if (node === null) throw new TypeError("NOT needs something to remove from"); if (without !== null) node = { kind: "not", from: node, without }; }
    return node;
  };
  const and = () => {
    const parts = [not()];
    while (peek() !== undefined && peek().kind !== "OR" && peek().kind !== "close") { if (peek().kind === "AND") take(); parts.push(not()); }
    const kept = parts.filter((part) => part !== null);
    return kept.length === 0 ? null : kept.length === 1 ? kept[0] : { kind: "and", parts: kept };
  };
  const or = () => {
    const parts = [and()];
    while (peek()?.kind === "OR") { take(); parts.push(and()); }
    const kept = parts.filter((part) => part !== null);
    return kept.length === 0 ? null : kept.length === 1 ? kept[0] : { kind: "or", parts: kept };
  };
  if (tokens.length === 0) return null;
  const tree = or();
  if (at < tokens.length) throw new TypeError("FTS5 query has an unmatched closing parenthesis");
  return tree;
}

/** A term index over `root`'s store (or in memory without a root). */
export function createTermIndex({ root, tokenize = words, k1 = 1.2, b = 0.75 } = {}) {
  const documents = new Map();     // key -> { revision, length, counts: Map<word, count> }
  const postings = new Map();      // word -> Set<key>
  let totalLength = 0;
  let sequence = 0;

  function drop(key) {
    const held = documents.get(key);
    if (!held) return;
    for (const term of held.counts.keys()) {
      const keys = postings.get(term);
      keys.delete(key);
      if (keys.size === 0) postings.delete(term);
    }
    totalLength -= held.length;
    documents.delete(key);
  }
  function hold({ key, revision, length, counts }) {
    drop(key);
    documents.set(key, { revision, length, counts });
    for (const term of counts.keys()) {
      const keys = postings.get(term);
      if (keys) keys.add(key); else postings.set(term, new Set([key]));
    }
    totalLength += length;
  }
  function extend({ key, revision, counts }) {
    const held = documents.get(key);
    if (held?.revision !== revision) throw new TypeError(`a term index continuation follows no put of ${key} at ${revision}`);
    for (const [term, count] of counts) {
      held.counts.set(term, count);
      const keys = postings.get(term);
      if (keys) keys.add(key); else postings.set(term, new Set([key]));
    }
  }
  if (root !== undefined && root !== null) {
    const entries = [...each(root, TERM_TYPE)].map(({ record }) => record).sort((left, right) => left.sequence - right.sequence);
    for (const entry of entries) {
      sequence = Math.max(sequence, entry.sequence + 1);
      for (const line of entry.documents.split("\n")) {
        const [key, revision, length, counts, continued = false] = JSON.parse(line);
        if (continued) extend({ key, revision, counts: countsOf(counts) }); else hold({ key, revision, length, counts: countsOf(counts) });
      }
    }
  }

  function measure(text) {
    const counts = new Map();
    let length = 0;
    for (const term of tokenize(text)) {
      if (term === "" || /[\t\n]/u.test(term)) throw new TypeError("a term index word is not empty and holds no tab or line break");
      counts.set(term, (counts.get(term) ?? 0) + 1);
      length += 1;
    }
    return { length, counts };
  }
  function record(lines) {
    const batch = [];
    let bytes = 0;
    const flush = () => {
      if (batch.length === 0) return;
      put(root, TERM_TYPE, { sequence, documents: batch.join("\n") });
      sequence += 1;
      batch.length = 0;
      bytes = 0;
    };
    for (const line of lines) {
      const size = carriedBytes(line) + 4;
      if (bytes + size > RECORD_LINES_BYTES) flush();
      batch.push(line);
      bytes += size;
    }
    flush();
  }

  /** A key's BM25 score over the terms it holds of `terms`. */
  function scoreOf(key, terms) {
    const document = documents.get(key), count = documents.size, average = totalLength / count;
    const norm = k1 * (1 - b + (b * document.length) / average);
    let score = 0;
    for (const term of terms) {
      const frequency = document.counts.get(term);
      if (!frequency) continue;
      const weight = Math.max(Math.log((count - postings.get(term).size + 0.5) / (postings.get(term).size + 0.5)), 1e-6);
      score += (weight * frequency * (k1 + 1)) / (frequency + norm);
    }
    return score;
  }
  const ranked = (hits, limit) => hits
    .sort((left, right) => right.score - left.score || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .slice(0, limit).map((hit) => Object.freeze(hit));

  return Object.freeze({
    /** The revision `key` was indexed at, or undefined. */
    revisionOf: (key) => documents.get(key)?.revision,
    /** Every indexed key. */
    keys: () => [...documents.keys()],
    /** Apply puts together: `change` receives `put(key, revision, text)`; the last put of a key is kept. */
    revise(change) {
      const last = new Map();
      change({
        put(key, revision, text) {
          if (typeof key !== "string" || key === "") throw new TypeError("a term index key is a non-empty string");
          last.delete(key);
          last.set(key, { key, revision: String(revision), ...measure(text) });
        },
      });
      const puts = [...last.values()];
      if (root !== undefined && root !== null) record(puts.flatMap(putLines));
      for (const document of puts) hold(document);
    },
    /** Keys whose documents hold every word of the query, best first by BM25. */
    search(query, { limit = 25 } = {}) {
      const terms = [...new Set(tokenize(query))];
      if (terms.length === 0 || limit === 0 || documents.size === 0) return [];
      const sets = terms.map((term) => postings.get(term));
      if (sets.some((keys) => keys === undefined)) return [];
      sets.sort((left, right) => left.size - right.size);
      const hits = [];
      for (const key of sets[0]) if (sets.every((keys) => keys.has(key))) hits.push({ key, score: scoreOf(key, terms) });
      return ranked(hits, limit);
    },
    /**
     * Keys matching a query in the subset of SQLite FTS5's query syntax that a term index can
     * answer: words, `prefix*`, `"phrases"`, `AND`, `OR`, `NOT` (binding tighter than AND, AND
     * tighter than OR, juxtaposition as AND) and parentheses, ranked by BM25 over the words the
     * query asks for. A phrase is matched word for word against `textOf(key)` when the caller can
     * give a key's text; without it a phrase asks only for its words. Column filters, NEAR and
     * the `^` and `+` operators are refused, not ignored.
     */
    match(expression, { limit = 25, textOf } = {}) {
      if (limit === 0 || documents.size === 0) return [];
      const tree = parseQuery(String(expression), tokenize);
      if (tree === null) return [];
      const asked = new Set();
      const evaluate = (node, positive) => {
        switch (node.kind) {
          case "or": return node.parts.reduce((all, part) => { for (const key of evaluate(part, positive)) all.add(key); return all; }, new Set());
          case "and": {
            const [first, ...rest] = node.parts.map((part) => evaluate(part, positive));
            return new Set([...first].filter((key) => rest.every((keys) => keys.has(key))));
          }
          case "not": {
            const kept = evaluate(node.from, positive), removed = evaluate(node.without, false);
            return new Set([...kept].filter((key) => !removed.has(key)));
          }
          case "prefix": {
            const keys = new Set();
            for (const [term, holders] of postings) {
              if (!term.startsWith(node.prefix)) continue;
              if (positive) asked.add(term);
              for (const key of holders) keys.add(key);
            }
            return keys;
          }
          case "phrase": {
            const sets = node.words.map((term) => postings.get(term) ?? new Set());
            if (positive) for (const term of node.words) asked.add(term);
            sets.sort((left, right) => left.size - right.size);
            const keys = new Set([...sets[0]].filter((key) => sets.every((held) => held.has(key))));
            if (node.words.length < 2 || typeof textOf !== "function") return keys;
            return new Set([...keys].filter((key) => holdsRun(tokenize(textOf(key)), node.words)));
          }
          default: throw new TypeError(`unknown query node ${node.kind}`);
        }
      };
      const keys = evaluate(tree, true), terms = [...asked];
      return ranked([...keys].map((key) => ({ key, score: scoreOf(key, terms) })), limit);
    },
    get size() { return documents.size; },
  });
}
