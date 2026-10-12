import { estimateShingleOverlap, markdownShingleSignature, markdownSignatureBands } from "@red-cup-engineering/markdown-engineering-services-section/consolidate-markdown-duplicates";

/** The words of a text: lowercase letter-and-digit runs. */
export function words(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

const K1 = 1.2, B = 0.75;

/**
 * An archive's text held for navigation: an inverted index ranked by BM25, and MinHash
 * signatures banded for finding documents that say one thing. In memory, rebuilt from the
 * archive's files; nothing here is authoritative.
 */
export function createTextIndex() {
  const documents = [];            // id -> { path, length, signature, live }
  const byPath = new Map();        // path -> id
  const postings = new Map();      // word -> [id, tf, id, tf, ...]
  const bands = new Map();         // band -> Set<id>
  let totalLength = 0, live = 0;

  function remove(path) {
    const id = byPath.get(path);
    if (id === undefined) return;
    const document = documents[id];
    document.live = false;
    totalLength -= document.length; live -= 1;
    for (const band of document.bands) bands.get(band)?.delete(id);
    byPath.delete(path);
  }
  function add(path, text) {
    remove(path);
    const id = documents.length;
    const all = words(text);
    const counts = new Map();
    for (const word of all) counts.set(word, (counts.get(word) ?? 0) + 1);
    for (const [word, tf] of counts) { const list = postings.get(word); if (list) list.push(id, tf); else postings.set(word, [id, tf]); }
    const signature = markdownShingleSignature(text);
    const own = signature ? markdownSignatureBands(signature) : [];
    for (const band of own) { const set = bands.get(band); if (set) set.add(id); else bands.set(band, new Set([id])); }
    documents.push({ path, length: all.length, signature, bands: own, live: true });
    byPath.set(path, id);
    totalLength += all.length; live += 1;
  }
  /** Documents holding every word of the query, best first by BM25. */
  function search(query, { limit = 25 } = {}) {
    const terms = [...new Set(words(query))];
    if (terms.length === 0 || live === 0) return [];
    const lists = terms.map((term) => postings.get(term) ?? []);
    if (lists.some((list) => list.length === 0)) return [];
    const average = totalLength / live;
    const scores = new Map(), hits = new Map();
    lists.forEach((list) => {
      const df = list.length / 2;
      const idf = Math.log(1 + (live - df + 0.5) / (df + 0.5));
      for (let index = 0; index < list.length; index += 2) {
        const id = list[index], tf = list[index + 1], document = documents[id];
        if (!document.live) continue;
        const score = idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * document.length / average));
        scores.set(id, (scores.get(id) ?? 0) + score);
        hits.set(id, (hits.get(id) ?? 0) + 1);
      }
    });
    return [...scores].filter(([id]) => hits.get(id) === terms.length).sort((a, b) => b[1] - a[1]).slice(0, limit)
      .map(([id, score]) => Object.freeze({ path: documents[id].path, score }));
  }
  function signatureOf(path) { const id = byPath.get(path); return id === undefined ? null : documents[id].signature; }
  /** The estimated overlap of two documents' texts, or null when either is too short to sign. */
  function overlap(left, right) {
    const a = signatureOf(left), b = signatureOf(right);
    return a && b ? estimateShingleOverlap(a, b) : null;
  }
  /** Documents whose text overlaps `path`'s, best first. */
  function similar(path, { limit = 20, minimum = 0.2 } = {}) {
    const id = byPath.get(path);
    if (id === undefined || !documents[id].signature) return [];
    const candidates = new Set();
    for (const band of documents[id].bands) for (const other of bands.get(band) ?? []) if (other !== id) candidates.add(other);
    return [...candidates].map((other) => ({ path: documents[other].path, overlap: estimateShingleOverlap(documents[id].signature, documents[other].signature) }))
      .filter((row) => row.overlap >= minimum).sort((a, b) => b.overlap - a.overlap || a.path.localeCompare(b.path)).slice(0, limit);
  }
  /** Groups of documents under `prefix` whose texts pairwise overlap by at least `minimum`, joined, largest first. */
  function clusters({ minimum = 0.6, prefix = "", limit = 50 } = {}) {
    const parent = new Map();
    const find = (value) => { while (parent.get(value) !== value) { parent.set(value, parent.get(parent.get(value))); value = parent.get(value); } return value; };
    const checked = new Set();
    for (const members of bands.values()) {
      const inside = [...members].filter((id) => documents[id].path.startsWith(prefix));
      if (inside.length < 2 || inside.length > 64) continue;
      for (let i = 0; i < inside.length; i += 1) for (let j = i + 1; j < inside.length; j += 1) {
        const key = inside[i] < inside[j] ? `${inside[i]}:${inside[j]}` : `${inside[j]}:${inside[i]}`;
        if (checked.has(key)) continue;
        checked.add(key);
        if (estimateShingleOverlap(documents[inside[i]].signature, documents[inside[j]].signature) < minimum) continue;
        for (const member of [inside[i], inside[j]]) if (!parent.has(member)) parent.set(member, member);
        parent.set(find(inside[i]), find(inside[j]));
      }
    }
    const groups = new Map();
    for (const member of parent.keys()) { const root = find(member); groups.set(root, [...(groups.get(root) ?? []), documents[member].path]); }
    return [...groups.values()].map((group) => group.sort()).sort((a, b) => b.length - a.length || a[0].localeCompare(b[0])).slice(0, limit);
  }
  return Object.freeze({ add, remove, search, overlap, similar, clusters, has: (path) => byPath.has(path), get size() { return live; } });
}
