// The vault as bases and claims.
//
// A base is any token the vault uses: a document, a frontmatter value, a cited work, a term's
// identity. A claim is an oriented relation between two bases, typed by the frontmatter key that
// asserts it and witnessed by the document that asserts it: `file -> key -> value`, the file on
// the left, the value on the right. A claim about a claim's base is a claim too, so a cited work
// named under `references:` is a base with claims of its own, and every document that cites it
// witnesses them.
//
// Nothing here validates. A claim holds because a document asserts it; what the graph reports is
// how each claim stands among the others: its settlement (the two-sided evidence the charge
// algebra reads), its bases' modes (absurd, possible, necessary, determined), and where a locale's
// practice diverges from what the locale mostly says. The schema is what practice has made
// dominant, recovered from the fibers of each key, not imposed from outside.
import { chargeNameOfSides } from "@lenticule-science/metrologic/articulation/predicating/positing/bilattice-charge";

/** The settlement corner each charge value names, in the words of the settlement reading. */
const CORNER_OF_CHARGE = Object.freeze({ absurd: "neither", potential: "true-only", active: "false-only", stable: "both" });

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

function tokenOf(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, value.getUTCHours() || value.getUTCMinutes() ? 19 : 10);
  if (typeof value === "string") { const token = value.trim(); return token === "" ? null : token; }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return null;
}

/**
 * The claims a document's frontmatter asserts, each `{e, a, v}` with the document (or a base the
 * document names) on the left.
 *
 * A scalar value is one claim; a list is one claim per item. A map whose entries are maps names
 * bases of its own (a `references:` map names cited works): the document claims each under the
 * key, and each entry's fields are claims with that base on the left. A map whose entries are
 * values is a map of predicates (`relations:`, `provenance:`): each entry is a claim typed by its
 * own key. A map inside a list is a base local to the document. `skip` names keys another reading
 * already projects.
 */
export function frontmatterClaimsOf(path, frontmatter, { skip = [] } = {}) {
  const claims = [];
  const skipped = new Set(skip);
  const flatten = (left, key, value, local) => {
    if (Array.isArray(value)) { value.forEach((item, index) => flatten(left, key, item, `${local}/${key}[${index}]`)); return; }
    if (isPlainObject(value)) {
      for (const [entry, inner] of Object.entries(value)) {
        if (isPlainObject(inner)) {
          claims.push({ e: left, a: key, v: entry });
          for (const [field, fieldValue] of Object.entries(inner)) flatten(entry, field, fieldValue, entry);
        } else if (Array.isArray(inner) && inner.some(isPlainObject)) {
          inner.forEach((item, index) => {
            const base = `${local}/${entry}[${index}]`;
            claims.push({ e: left, a: entry, v: base });
            if (isPlainObject(item)) for (const [field, fieldValue] of Object.entries(item)) flatten(base, field, fieldValue, base);
            else flatten(left, entry, item, local);
          });
        } else flatten(left, entry, inner, local);
      }
      return;
    }
    const token = tokenOf(value);
    if (token !== null) claims.push({ e: left, a: key, v: token });
  };
  for (const [key, value] of Object.entries(frontmatter ?? {})) {
    if (skipped.has(key)) continue;
    if (Array.isArray(value) && value.some(isPlainObject)) {
      value.forEach((item, index) => {
        const base = `${path}#${key}[${index}]`;
        if (!isPlainObject(item)) { flatten(path, key, item, path); return; }
        claims.push({ e: path, a: key, v: base });
        for (const [field, fieldValue] of Object.entries(item)) flatten(base, field, fieldValue, base);
      });
      continue;
    }
    flatten(path, key, value, path);
  }
  return claims;
}

/**
 * Index a declared-relation ledger as a claim graph: its relation rows and its frontmatter claims,
 * each witnessed by the document whose content address the row carries. Refusals are not claims.
 */
export function readClaimGraph(ledger) {
  const witnessPath = new Map(Object.entries(ledger.witnesses ?? {}));
  const seen = new Set();
  const claims = [];
  for (const row of [...ledger.rows, ...(ledger.claims ?? [])]) {
    if (row.a === "refused" || typeof row.v !== "string" || typeof row.e !== "string") continue;
    const witness = witnessPath.get(row.t) ?? (row.e.endsWith(".md") ? row.e : String(row.t));
    const id = `${row.e}\u0000${row.a}\u0000${row.v}\u0000${witness}`;
    if (seen.has(id)) continue;
    seen.add(id);
    claims.push(Object.freeze({ left: row.e, key: row.a, right: row.v, witness }));
  }
  const group = (select) => {
    const index = new Map();
    for (const claim of claims) { const at = select(claim); const list = index.get(at); if (list) list.push(claim); else index.set(at, [claim]); }
    return index;
  };
  const byLeft = group((claim) => claim.left);
  const byRight = group((claim) => claim.right);
  const byKey = group((claim) => claim.key);
  // A document names a base when it defines it, or gives it as its title, name, identity or an
  // alias; the documents naming a base articulate it. Names are compared as slugs, so the note
  // titled "Act" names the base `act`.
  const definers = new Map();
  for (const key of NAMING_KEYS) for (const claim of byKey.get(key) ?? []) {
    if (!claim.left.endsWith(".md")) continue;
    const at = slugOf(claim.right);
    const list = definers.get(at) ?? [];
    if (!list.includes(claim.left)) list.push(claim.left);
    definers.set(at, list);
  }
  return Object.freeze({ claims, byLeft, byRight, byKey, definers, documents: new Set(witnessPath.values()) });
}

const EMPTY = Object.freeze([]);

/** The keys by which a document names the base it is about. */
const NAMING_KEYS = Object.freeze(["defines", "titled", "title", "name", "identity", "aliases"]);

/** A name as a comparable slug. */
function slugOf(name) {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "");
}

/** The documents that name a base. */
export function definersOf(graph, base) {
  return graph.definers.get(slugOf(base)) ?? EMPTY;
}

/** The claims that articulate a base: those with it on the left, and those of every document that defines it. */
function articulationOf(graph, base) {
  const own = graph.byLeft.get(base) ?? EMPTY;
  const definers = definersOf(graph, base);
  return definers.length === 0 ? own : [...own, ...definers.flatMap((path) => graph.byLeft.get(path) ?? EMPTY)];
}

/** The distinct documents other than the base's own that relate to it: witnesses of the claims holding it on the right. */
function relatingWitnesses(graph, base) {
  const own = new Set([base, ...definersOf(graph, base)]);
  const witnesses = new Set();
  for (const { witness } of graph.byRight.get(base) ?? EMPTY) if (!own.has(witness)) witnesses.add(witness);
  return witnesses;
}

/** Whether a base says anything of itself: claims of its own, or a document naming it. */
function isArticulated(graph, base) {
  return (graph.byLeft.get(base)?.length ?? 0) > 0 || definersOf(graph, base).length > 0;
}

/**
 * A base's mode on the inquiry trajectory, absurd -> possible -> necessary -> determined.
 *
 * Absurd: nothing else relates to it, and nothing it says reaches anything articulated; it holds
 * because it is asserted. Possible: other documents lean on it, and nothing says what it is; it
 * is opened, not shaped (these are the questions inquiry takes up). Necessary: what it says
 * reaches bases that are themselves articulated, so the field forces its shape, but nothing else
 * yet relates to it. Determined: it reaches articulated bases and other documents relate to it,
 * so it is held in place by its relations to other claims, given the absurdities they rest on.
 */
export function modeOfBase(graph, base) {
  const articulation = articulationOf(graph, base);
  const relatedBy = relatingWitnesses(graph, base).size;
  let reaching = 0;
  for (const { right } of articulation) if (right !== base && isArticulated(graph, right)) reaching += 1;
  const mode = articulation.length === 0
    ? (relatedBy === 0 ? "absurd" : "possible")
    : reaching === 0 ? (relatedBy === 0 ? "absurd" : "possible") : relatedBy === 0 ? "necessary" : "determined";
  return Object.freeze({ mode, relatedBy, articulatedBy: articulation.length, reaching });
}

/**
 * How one claim settles: the documents that affirm it and those that deny it, read by the charge
 * algebra. A document denies a claim when it gives the same base, under the same key, exactly one
 * other value; a document naming several values names a set and denies none of them.
 */
export function settleClaim(graph, { left, key, right }) {
  const asserted = articulationOf(graph, left).filter((claim) => claim.key === key);
  const valuesByWitness = new Map();
  for (const claim of asserted) valuesByWitness.set(claim.witness, [...(valuesByWitness.get(claim.witness) ?? []), claim.right]);
  const affirming = [];
  const denying = [];
  for (const [witness, values] of valuesByWitness) {
    if (values.includes(right)) affirming.push(witness);
    else if (values.length === 1) denying.push(Object.freeze({ witness, value: values[0] }));
  }
  const charge = chargeNameOfSides(affirming.length > 0, denying.length > 0);
  return Object.freeze({ charge, corner: CORNER_OF_CHARGE[charge], affirming: Object.freeze(affirming.sort()), denying: Object.freeze(denying) });
}

const summarize = (claims, limit) => Object.freeze(claims.slice(0, limit).map(({ left, key, right, witness }) => Object.freeze({ left, key, right, witness })));

/**
 * Read a base: its mode, the claims that determine it (holding it on the right) and the claims
 * that derive from it (holding it on the left, its definers' included), each list capped.
 */
export function readBase(graph, base, { limit = 50 } = {}) {
  const determining = graph.byRight.get(base) ?? EMPTY;
  const deriving = articulationOf(graph, base);
  return Object.freeze({
    kind: "vault.base",
    base,
    ...modeOfBase(graph, base),
    definedBy: Object.freeze([...definersOf(graph, base)]),
    determining: Object.freeze({ total: determining.length, byKey: countBy(determining, ({ key }) => key), claims: summarize(determining, limit) }),
    deriving: Object.freeze({ total: deriving.length, claims: summarize(deriving, limit) }),
  });
}

function countBy(list, select) {
  const counts = new Map();
  for (const item of list) counts.set(select(item), (counts.get(select(item)) ?? 0) + 1);
  return Object.freeze(Object.fromEntries([...counts].sort((left, right) => right[1] - left[1]).slice(0, 25)));
}

/** Bases related to a base by any claim, either way round, skipping hubs too wide to walk through. */
function neighbours(graph, base, hub) {
  const out = new Map();
  for (const claim of graph.byLeft.get(base) ?? EMPTY) if (!out.has(claim.right)) out.set(claim.right, claim);
  for (const claim of graph.byRight.get(base) ?? EMPTY) if (!out.has(claim.left)) out.set(claim.left, claim);
  for (const [next] of out) if ((graph.byLeft.get(next)?.length ?? 0) + (graph.byRight.get(next)?.length ?? 0) > hub) out.delete(next);
  return out;
}

/** Shortest chains of claims joining two bases, up to `depth` claims long. */
function chains(graph, from, to, { depth = 3, hub = 400, limit = 5 } = {}) {
  const found = [];
  let frontier = [[from, []]];
  const visited = new Set([from]);
  for (let step = 0; step < depth && found.length === 0; step += 1) {
    const next = [];
    for (const [base, path] of frontier) {
      for (const [neighbour, claim] of neighbours(graph, base, hub)) {
        const extended = [...path, claim];
        if (neighbour === to) { found.push(summarize(extended, depth)); if (found.length >= limit) return found; continue; }
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        next.push([neighbour, extended]);
      }
    }
    frontier = next.slice(0, 5000);
  }
  return found;
}

/**
 * Read a claim. A claim the vault holds comes with its settlement and what supports it: the
 * claims that determine each of its bases. A claim the vault does not hold comes with the
 * structure that would support it: what the left base already says under that key, which other
 * bases hold the right base under that key, how the practice of bases like the left one carries
 * the key, and the chains of claims that already join the two bases.
 */
export function readClaim(graph, { left, key, right }, { limit = 25 } = {}) {
  const held = articulationOf(graph, left).filter((claim) => claim.key === key && claim.right === right);
  const settlement = settleClaim(graph, { left, key, right });
  const bases = Object.freeze({ left: modeOfBase(graph, left), right: modeOfBase(graph, right) });
  if (held.length > 0) {
    return Object.freeze({
      kind: "vault.claim",
      held: true,
      claim: Object.freeze({ left, key, right }),
      settlement,
      bases,
      support: Object.freeze({
        left: summarize(graph.byRight.get(left) ?? EMPTY, limit),
        right: summarize(articulationOf(graph, right), limit),
      }),
    });
  }
  const leftSays = articulationOf(graph, left).filter((claim) => claim.key === key);
  const othersHold = (graph.byRight.get(right) ?? EMPTY).filter((claim) => claim.key === key);
  const kinds = [...new Set(articulationOf(graph, left).filter((claim) => claim.key === "type").map((claim) => claim.right))];
  const practice = kinds.map((kind) => {
    const peers = new Set((graph.byRight.get(kind) ?? EMPTY).filter((claim) => claim.key === "type").map((claim) => claim.left));
    let carrying = 0;
    for (const peer of peers) if ((graph.byLeft.get(peer) ?? EMPTY).some((claim) => claim.key === key)) carrying += 1;
    return Object.freeze({ type: kind, peers: peers.size, carryingKey: carrying });
  });
  return Object.freeze({
    kind: "vault.claim",
    held: false,
    claim: Object.freeze({ left, key, right }),
    settlement,
    bases,
    wouldSupport: Object.freeze({
      leftSays: summarize(leftSays, limit),
      othersHold: Object.freeze({ total: othersHold.length, claims: summarize(othersHold, limit) }),
      practice: Object.freeze(practice),
      chains: Object.freeze(chains(graph, left, right)),
    }),
  });
}

/** A document's own frontmatter claims: those it witnesses with itself on the left. */
function ownClaims(graph, locale) {
  const own = [];
  for (const claim of graph.claims) if (claim.left === claim.witness && claim.witness.startsWith(locale)) own.push(claim);
  return own;
}

/**
 * The fiber of one key within a locale (a path prefix): every value the locale's documents give
 * it, with how many documents give each, most given first.
 */
export function readFiber(graph, { key, locale = "", limit = 50 } = {}) {
  const counts = new Map();
  const documents = new Set();
  for (const claim of graph.byKey.get(key) ?? EMPTY) {
    if (claim.left !== claim.witness || !claim.witness.startsWith(locale)) continue;
    documents.add(claim.witness);
    counts.set(claim.right, (counts.get(claim.right) ?? 0) + 1);
  }
  const values = [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"));
  return Object.freeze({
    kind: "vault.fiber",
    key,
    locale,
    documents: documents.size,
    distinctValues: values.length,
    values: Object.freeze(values.slice(0, limit).map(([value, count]) => Object.freeze({ value, documents: count }))),
  });
}

/**
 * Where a locale diverges from its own practice. A value divergence: a key most of the locale's
 * documents give one value (at least `dominance` of those giving a single value, over at least
 * `minimum` documents), which some document gives otherwise. An absence divergence: a key most
 * documents of one `type` in the locale carry, which some document of that type lacks. Neither is
 * an error; each is a question the practice raises, the firmest practice first.
 */
export function readDivergences(graph, { locale = "", minimum = 5, dominance = 0.8, limit = 50, sample = 10 } = {}) {
  const own = ownClaims(graph, locale);
  const valuesByDocumentKey = new Map();
  const keysByDocument = new Map();
  const typesByDocument = new Map();
  for (const claim of own) {
    const at = `${claim.witness}\u0000${claim.key}`;
    valuesByDocumentKey.set(at, [...(valuesByDocumentKey.get(at) ?? []), claim.right]);
    (keysByDocument.get(claim.witness) ?? keysByDocument.set(claim.witness, new Set()).get(claim.witness)).add(claim.key);
    if (claim.key === "type") (typesByDocument.get(claim.witness) ?? typesByDocument.set(claim.witness, []).get(claim.witness)).push(claim.right);
  }
  const divergences = [];
  const singleByKey = new Map();
  for (const [at, values] of valuesByDocumentKey) {
    if (values.length !== 1) continue;
    const [document, key] = at.split("\u0000");
    const counts = singleByKey.get(key) ?? new Map();
    const holders = counts.get(values[0]) ?? [];
    holders.push(document);
    counts.set(values[0], holders);
    singleByKey.set(key, counts);
  }
  for (const [key, counts] of singleByKey) {
    const total = [...counts.values()].reduce((sum, holders) => sum + holders.length, 0);
    const [dominant, holders] = [...counts].sort((left, right) => right[1].length - left[1].length)[0];
    if (holders.length < minimum || holders.length / total < dominance || holders.length === total) continue;
    for (const [value, others] of counts) {
      if (value === dominant) continue;
      divergences.push(Object.freeze({ kind: "value", key, dominant, dominantDocuments: holders.length, of: total, value, documents: Object.freeze(others.slice(0, sample)), diverging: others.length }));
    }
  }
  const documentsByType = new Map();
  for (const [document, types] of typesByDocument) for (const type of types) (documentsByType.get(type) ?? documentsByType.set(type, []).get(type)).push(document);
  for (const [type, documents] of documentsByType) {
    if (documents.length < minimum) continue;
    const carriers = new Map();
    for (const document of documents) for (const key of keysByDocument.get(document) ?? []) carriers.set(key, (carriers.get(key) ?? 0) + 1);
    for (const [key, count] of carriers) {
      if (count === documents.length || count / documents.length < dominance) continue;
      const lacking = documents.filter((document) => !keysByDocument.get(document)?.has(key));
      divergences.push(Object.freeze({ kind: "absence", key, type, carrying: count, of: documents.length, documents: Object.freeze(lacking.slice(0, sample)), diverging: lacking.length }));
    }
  }
  divergences.sort((left, right) => (right.dominantDocuments ?? right.carrying) - (left.dominantDocuments ?? left.carrying) || left.key.localeCompare(right.key, "en"));
  return Object.freeze({ kind: "vault.divergences", locale, documents: keysByDocument.size, total: divergences.length, truncated: divergences.length > limit, divergences: Object.freeze(divergences.slice(0, limit)) });
}

/** A value shaped like a name, rather than a datum taken as given: no date, number, address, path or sentence. */
function isNameLike(base) {
  return base.length <= 60 && !/^(true|false|null|yes|no)$/iu.test(base) && !/^[\d\s:.+TZ/-]+$/u.test(base) && !/^[a-z][a-z0-9+.-]*:\/\//iu.test(base)
    && !base.includes("/") && !/[.!?]\s|[.!?]$/u.test(base) && base.split(/\s+/u).length <= 6;
}

/**
 * The questions the vault is asking: its possible bases. Each is a name more than one document
 * leans on, through more than one kind of claim, and nothing articulates: no document names it
 * and it has no claims of its own. A value only one key ever takes (a `status`, a `visibility`)
 * is that key's vocabulary rather than a question;
 * inquiry takes them up most-asked first. Data taken as given (dates, numbers, addresses, prose)
 * are absurdities the vault rests on rather than questions it asks, and are left out. With a
 * `prefix`, only documents beneath it are counted as asking.
 */
export function readQuestions(graph, { prefix = "", limit = 50 } = {}) {
  const questions = [];
  for (const [base, determining] of graph.byRight) {
    if (!isNameLike(base) || definersOf(graph, base).length > 0 || graph.byLeft.has(base)) continue;
    const documents = new Set();
    const keys = new Set();
    for (const claim of determining) {
      if (!claim.witness.startsWith(prefix)) continue;
      documents.add(claim.witness);
      keys.add(claim.key);
    }
    if (documents.size < 2 || keys.size < 2) continue;
    questions.push({ term: base, relations: Object.freeze([...keys].sort()), documents: Object.freeze([...documents].sort()) });
  }
  questions.sort((left, right) => right.documents.length - left.documents.length || left.term.localeCompare(right.term, "en"));
  return Object.freeze({ kind: "vault.questions", prefix, total: questions.length, truncated: questions.length > limit, questions: Object.freeze(questions.slice(0, limit).map(Object.freeze)) });
}

/**
 * The relations between keys that the fibers show: pairs of keys whose fibers share values
 * within a locale. Each pair reports how many values the two fibers share (as a share of the
 * smaller fiber) and how many documents carry both keys. Keys that share much and rarely meet in
 * one document are likely one key under several names, a convention drifting; keys that often
 * meet with the same value restate each other. Either is a relation between the predicates
 * themselves, the structure the base of the fibration gains once keys are related.
 */
export function readKeyAffinities(graph, { locale = "", minimum = 5, overlap = 0.3, limit = 50 } = {}) {
  const valuesByKey = new Map();
  const documentsByKey = new Map();
  for (const claim of graph.claims) {
    if (claim.left !== claim.witness || !claim.witness.startsWith(locale) || !isNameLike(claim.right)) continue;
    (valuesByKey.get(claim.key) ?? valuesByKey.set(claim.key, new Set()).get(claim.key)).add(claim.right);
    (documentsByKey.get(claim.key) ?? documentsByKey.set(claim.key, new Set()).get(claim.key)).add(claim.witness);
  }
  const keysByValue = new Map();
  for (const [key, values] of valuesByKey) {
    if (values.size < minimum) continue;
    for (const value of values) (keysByValue.get(value) ?? keysByValue.set(value, []).get(value)).push(key);
  }
  const shared = new Map();
  for (const keys of keysByValue.values()) {
    if (keys.length < 2 || keys.length > 40) continue;
    for (let i = 0; i < keys.length; i += 1) for (let j = i + 1; j < keys.length; j += 1) {
      const pair = keys[i] < keys[j] ? `${keys[i]}\u0000${keys[j]}` : `${keys[j]}\u0000${keys[i]}`;
      shared.set(pair, (shared.get(pair) ?? 0) + 1);
    }
  }
  const affinities = [];
  for (const [pair, count] of shared) {
    const [left, right] = pair.split("\u0000");
    const share = count / Math.min(valuesByKey.get(left).size, valuesByKey.get(right).size);
    if (share < overlap) continue;
    let together = 0;
    const [fewer, more] = documentsByKey.get(left).size <= documentsByKey.get(right).size ? [left, right] : [right, left];
    for (const document of documentsByKey.get(fewer)) if (documentsByKey.get(more).has(document)) together += 1;
    affinities.push(Object.freeze({ keys: Object.freeze([left, right]), sharedValues: count, share: Math.round(share * 100) / 100, documents: Object.freeze([documentsByKey.get(left).size, documentsByKey.get(right).size]), together }));
  }
  affinities.sort((a, b) => b.sharedValues * b.share - a.sharedValues * a.share);
  return Object.freeze({ kind: "vault.key-affinities", locale, total: affinities.length, truncated: affinities.length > limit, affinities: Object.freeze(affinities.slice(0, limit)) });
}
