import { normalizeTitle } from "@red-cup-engineering/csl-json-services-section";

const CITEKEY = /^[a-z][a-z0-9-]*[0-9]{4}[a-z0-9-]*$/u;

function normalizeAuthors(authors) {
  return [...(authors ?? [])].map((author) => String(author).toLowerCase().trim()).sort().join("|");
}
function signature(entry) {
  return `${normalizeTitle(entry.title)}::${entry.year ?? ""}::${normalizeAuthors(entry.authors)}`;
}
function carrierCitekey(carrier) {
  if (typeof carrier.recognized?.key === "string" && CITEKEY.test(carrier.recognized.key)) return carrier.recognized.key;
  const stem = carrier.path.split("/").pop().replace(/\.md$/u, "");
  return CITEKEY.test(stem) ? stem : null;
}
function carrierEntry(carrier) {
  const { authors, year, title } = carrier.recognized;
  if (!Array.isArray(authors) || authors.length === 0 || !Number.isInteger(year) || typeof title !== "string" || title.trim() === "") return null;
  return { authors, year, title, path: carrier.path, origin: "carrier" };
}

/**
 * Reconcile a scope's collected reference triples, bibliography carriers,
 * and inline body citations into the corpus's citation-health numbers:
 * conflicts, probable duplicates, uncovered citekeys, citekeys without a
 * carrier, and orphan carriers.
 *
 * Per the ruling model's citation channel (depth-1 `references:` map,
 * depth-2 bibliography carrier only when a source deserves more than a
 * citation), an ordinary depth-1-only citekey is healthy — it is not
 * required to have a carrier. `uncoveredCitekeys` therefore reports the
 * actual rule violation the model states: an inline `[@key]` body citation
 * whose key is absent from that same file's depth-1 `references:` map.
 * `citekeysWithoutCarrier` is informational only, kept separate so the
 * count stays visible without being read as a health failure.
 *
 * @param {{triples: Array<{citekey: string, reference: object, path: string}>, carriers: Array<{citekey: (string|null), path: string, recognized: object}>, citations?: Array<{path: string, citekey: string}>}} collected
 * @returns {{conflicts: Array<object>, probableDuplicates: Array<object>, uncoveredCitekeys: Array<object>, citekeysWithoutCarrier: Array<object>, orphanCarriers: Array<object>}} frozen.
 */
export function reconcileReferences({ triples, carriers, citations = [] }) {
  const byKey = new Map();
  for (const { citekey, reference, path } of triples) {
    if (!CITEKEY.test(citekey)) continue;
    const entries = byKey.get(citekey) ?? [];
    entries.push({ authors: reference.authors, year: reference.year, title: reference.title, path, origin: "reference" });
    byKey.set(citekey, entries);
  }
  const carrierKeys = new Set();
  for (const carrier of carriers) {
    const key = carrierCitekey(carrier);
    if (key === null) continue;
    carrierKeys.add(key);
    const entry = carrierEntry(carrier);
    if (entry === null) continue;
    const entries = byKey.get(key) ?? [];
    entries.push(entry);
    byKey.set(key, entries);
  }

  const conflicts = [];
  for (const [citekey, entries] of byKey) {
    const distinct = [];
    const seen = new Set();
    for (const entry of entries) {
      const sig = signature(entry);
      if (seen.has(sig)) continue;
      seen.add(sig);
      distinct.push(entry);
    }
    if (distinct.length > 1) {
      conflicts.push(Object.freeze({
        citekey,
        variants: Object.freeze(distinct.map((entry) => Object.freeze({ path: entry.path, origin: entry.origin, title: entry.title, year: entry.year, authors: Object.freeze([...entry.authors]) }))),
      }));
    }
  }
  conflicts.sort((a, b) => (a.citekey < b.citekey ? -1 : a.citekey > b.citekey ? 1 : 0));

  const canonicalByKey = new Map();
  for (const [citekey, entries] of byKey) {
    const canonical = entries.find((entry) => entry.origin === "carrier") ?? entries[0];
    canonicalByKey.set(citekey, canonical);
  }
  const clustersBySignature = new Map();
  for (const [citekey, entry] of canonicalByKey) {
    const clusterKey = `${normalizeTitle(entry.title)}::${entry.year ?? ""}`;
    const cluster = clustersBySignature.get(clusterKey) ?? [];
    cluster.push({ citekey, title: entry.title, year: entry.year, authors: entry.authors });
    clustersBySignature.set(clusterKey, cluster);
  }
  const probableDuplicates = [...clustersBySignature.values()]
    .filter((cluster) => cluster.length > 1)
    .map((cluster) => Object.freeze({ citekeys: Object.freeze(cluster.map(({ citekey }) => citekey).sort()), title: cluster[0].title, year: cluster[0].year }))
    .sort((a, b) => (a.citekeys[0] < b.citekeys[0] ? -1 : a.citekeys[0] > b.citekeys[0] ? 1 : 0));

  const citedKeys = new Set(triples.map(({ citekey }) => citekey).filter((citekey) => CITEKEY.test(citekey)));

  // Per-file depth-1 map: which citekeys does each path's own `references:`
  // entry declare. An inline citation is only "covered" against its own
  // file's map, per the model's stated rule.
  const depth1KeysByPath = new Map();
  for (const { citekey, path } of triples) {
    if (!CITEKEY.test(citekey)) continue;
    const keys = depth1KeysByPath.get(path) ?? new Set();
    keys.add(citekey);
    depth1KeysByPath.set(path, keys);
  }
  const uncoveredCitedFrom = new Map();
  for (const { path, citekey } of citations) {
    if (!CITEKEY.test(citekey)) continue;
    if (depth1KeysByPath.get(path)?.has(citekey)) continue;
    const paths = uncoveredCitedFrom.get(citekey) ?? new Set();
    paths.add(path);
    uncoveredCitedFrom.set(citekey, paths);
  }
  const uncoveredCitekeys = [...uncoveredCitedFrom.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([citekey, paths]) => Object.freeze({ citekey, citedFrom: Object.freeze([...paths].sort()) }));

  const citekeysWithoutCarrier = [...citedKeys]
    .filter((citekey) => !carrierKeys.has(citekey))
    .sort()
    .map((citekey) => Object.freeze({ citekey, citedFrom: Object.freeze(triples.filter((triple) => triple.citekey === citekey).map(({ path }) => path)) }));

  const orphanCarriers = [...carrierKeys]
    .filter((citekey) => !citedKeys.has(citekey))
    .sort()
    .map((citekey) => Object.freeze({ citekey, path: carriers.find((carrier) => carrierCitekey(carrier) === citekey)?.path }));

  return Object.freeze({
    conflicts: Object.freeze(conflicts),
    probableDuplicates: Object.freeze(probableDuplicates),
    uncoveredCitekeys: Object.freeze(uncoveredCitekeys),
    citekeysWithoutCarrier: Object.freeze(citekeysWithoutCarrier),
    orphanCarriers: Object.freeze(orphanCarriers),
  });
}
