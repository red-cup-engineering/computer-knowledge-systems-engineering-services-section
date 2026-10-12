import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";
import { triplesToTurtle } from "@red-cup-engineering/computer-triplet-serialized-content-engineering-services-section/sparql-over-eavt";
import { AUTHORIZED_RELATION_PREDICATES, relationPredicateRange } from "@red-cup-engineering/term-engineering-services-section/carrier";
import { admitTermMarkdownInVault } from "@red-cup-engineering/term-engineering-services-section/relations";
import { glossaryAudienceAdmits } from "@red-cup-engineering/term-engineering-services-section/glossary-skos";

/**
 * GEODE's `/ns/` dereferenceable vocabulary: term and predicate IRIs generated live from the
 * admitted glossary record on every request, never a hand-declared ttl/JSON-LD file (Lot 4,
 * lenticule substrate, doctrine D5). Dual-regime law: the returned graph never carries an `ni:`
 * URI. A witness link to the content-addressed substrate is not computed here — no identity is
 * cheaply available to a single-document lookup without a full ledger build — so v1 omits it.
 */

const TERM_DIRECTORY_MARKERS = Object.freeze(["/content/text/glossary/terms/", "/content/glossary/terms/"]);
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDF_PROPERTY = "http://www.w3.org/1999/02/22-rdf-syntax-ns#Property";
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const SKOS_CONCEPT = "http://www.w3.org/2004/02/skos/core#Concept";
const SKOS_DEFINITION = "http://www.w3.org/2004/02/skos/core#definition";
const SKOS_ALT_LABEL = "http://www.w3.org/2004/02/skos/core#altLabel";
const DCTERMS_ABSTRACT = "http://purl.org/dc/terms/abstract";
const DCTERMS_ACCESS_RIGHTS = "http://purl.org/dc/terms/accessRights";
const DCTERMS_SUBJECT = "http://purl.org/dc/terms/subject";
const DCTERMS_SOURCE = "http://purl.org/dc/terms/source";
const SKOS_CLOSE_MATCH = "http://www.w3.org/2004/02/skos/core#closeMatch";
const SKOS_EXACT_MATCH = "http://www.w3.org/2004/02/skos/core#exactMatch";

const PREDICATE_AUTHORITY = new Map([
  ...AUTHORIZED_RELATION_PREDICATES.map((name) => [
    name,
    "@red-cup-engineering/term-engineering-services-section schemas/glossary/term/relation-predicates.json",
  ]),
]);

const NEGOTIABLE_TYPES = new Map([
  ["application/ld+json", "jsonld"],
  ["application/json", "jsonld"],
  ["text/turtle", "turtle"],
  ["text/html", "html"],
  ["application/xhtml+xml", "html"],
]);

/**
 * Rank an `Accept` header and pick one of `"jsonld" | "turtle" | "html"`. A missing header, a
 * bare `*\/*`, or no recognized type all fall back to `"html"` — the default-browser case.
 * @param {string|null|undefined} acceptHeader
 * @returns {"jsonld"|"turtle"|"html"}
 */
export function negotiateVocabularyFormat(acceptHeader) {
  if (typeof acceptHeader !== "string" || acceptHeader.trim() === "") return "html";
  const ranked = acceptHeader.split(",").map((part) => {
    const [rawType, ...params] = part.trim().split(";").map((piece) => piece.trim());
    const q = params.find((piece) => piece.startsWith("q="));
    const value = q ? Number(q.slice(2)) : 1;
    return { type: rawType.toLowerCase(), q: Number.isFinite(value) ? value : 1 };
  }).sort((left, right) => right.q - left.q);
  for (const { type } of ranked) {
    if (NEGOTIABLE_TYPES.has(type)) return NEGOTIABLE_TYPES.get(type);
    if (type === "*/*") return "html";
  }
  return "html";
}

/** The filename stem of a glossary term path, or null when `path` does not address one. */
function termIdentityOfPath(path) {
  const marked = `/${path}`;
  for (const marker of TERM_DIRECTORY_MARKERS) {
    const index = marked.indexOf(marker);
    if (index < 0) continue;
    const filename = marked.slice(index + marker.length);
    if (filename === "" || filename.includes("/") || !filename.toLowerCase().endsWith(".md")) return null;
    return filename.slice(0, -3);
  }
  return null;
}

/**
 * Every glossary term document whose filename stem equals `identity`, deterministically ordered.
 * @param {readonly {path: string}[]} documents
 * @param {string} identity
 */
export function findTermDocuments(documents, identity) {
  return Object.freeze(
    documents
      .filter((document) => termIdentityOfPath(document.path) === identity)
      .sort((left, right) => left.path.localeCompare(right.path, "en")),
  );
}

/**
 * The sha256 hex digest VaultMaze's release compiler uses as a room's content-address key
 * (`digest(room.id)`, `room.id` the vault-relative path) — recomputed here, never read from a
 * compiled release, so a term IRI resolves to its room without a release-build dependency.
 * @param {string} path
 */
export function roomKeyOf(path) {
  return sha256Hex(path);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

/**
 * JSON-LD for one admitted term. `@id` is the term IRI; each authorized relation becomes its own
 * property keyed by the full predicate IRI (`/ns/predicate/<name>`) so it expands to a real RDF
 * triple without a `relations` wrapper a plain JSON-LD processor would otherwise drop. References
 * and provenance stay separate named properties, never folded into a relation predicate.
 * @param {object} record admitted term record (`admitTermMarkdownInVault`'s return value)
 * @param {{baseUrl: string}} options
 */
export function buildTermJsonLd(record, { baseUrl }) {
  const relations = Object.fromEntries(
    Object.entries(record.relations ?? {}).map(([name, value]) => [`${baseUrl}/ns/predicate/${name}`, value]),
  );
  return Object.freeze({
    "@context": {
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      skos: "http://www.w3.org/2004/02/skos/core#",
      dcterms: "http://purl.org/dc/terms/",
      name: "rdfs:label",
      description: "dcterms:abstract",
      body: "skos:definition",
      aliases: "skos:altLabel",
      keywords: "dcterms:subject",
      "consent-status": "dcterms:accessRights",
      references: "dcterms:references",
      provenance: "dcterms:provenance",
    },
    "@id": `${baseUrl}/ns/term/${record.identity}`,
    "@type": "skos:Concept",
    name: record.name,
    ...(record.description === undefined ? {} : { description: record.description }),
    body: record.body,
    ...(record["consent-status"] === undefined ? {} : { "consent-status": record["consent-status"] }),
    ...(record.aliases?.length ? { aliases: record.aliases } : {}),
    ...(record.keywords?.length ? { keywords: record.keywords } : {}),
    ...relations,
    ...(record.references && Object.keys(record.references).length ? { references: record.references } : {}),
    ...(record.provenance && Object.keys(record.provenance).length ? { provenance: record.provenance } : {}),
  });
}

/** Turtle triples for one admitted term. References/provenance are administrative JSON, not RDF here. */
function termTriples(record, baseUrl) {
  const termIri = `${baseUrl}/ns/term/${record.identity}`;
  const triples = [
    { s: termIri, p: RDF_TYPE, o: SKOS_CONCEPT },
    { s: termIri, p: RDFS_LABEL, o: record.name },
    { s: termIri, p: SKOS_DEFINITION, o: record.body },
  ];
  if (record.description !== undefined) triples.push({ s: termIri, p: DCTERMS_ABSTRACT, o: record.description });
  if (record["consent-status"] !== undefined) triples.push({ s: termIri, p: DCTERMS_ACCESS_RIGHTS, o: record["consent-status"] });
  for (const alias of record.aliases ?? []) triples.push({ s: termIri, p: SKOS_ALT_LABEL, o: alias });
  for (const keyword of record.keywords ?? []) triples.push({ s: termIri, p: DCTERMS_SUBJECT, o: keyword });
  for (const [name, value] of Object.entries(record.relations ?? {})) {
    const predicateIri = `${baseUrl}/ns/predicate/${name}`;
    for (const one of Array.isArray(value) ? value : [value]) triples.push({ s: termIri, p: predicateIri, o: one?.["@id"] ?? one });
  }
  return triples;
}

async function resolvedTermRecord(record, workspace, baseUrl) {
  const cache = new Map();
  const relations = {};
  for (const [name, value] of Object.entries(record.relations ?? {})) {
    if (relationPredicateRange(name) !== "carrier") {
      relations[name] = value;
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    const resolved = await Promise.all(values.map(async (item) => {
      if (typeof item !== "string") return item;
      if (cache.has(item)) return cache.get(item);
      const candidates = findTermDocuments(workspace.paths.map((path) => ({ path })), item);
      // Carrier-range predicates always name a term IRI.  Whether that IRI is currently
      // dereferenceable is a separate availability fact; serializing it as a literal would
      // change an object-property assertion into data and lose the admitted predicate's range.
      if (candidates.length !== 1) {
        const output = { "@id": `${baseUrl}/ns/term/${encodeURIComponent(item)}` };
        cache.set(item, output); return output;
      }
      const admitted = [];
      for (const candidate of candidates) {
        try { const reading = await workspace.read(candidate.path); admitted.push(await admitTermMarkdownInVault({ path: candidate.path, text: reading.markdown })); } catch { /* literal */ }
      }
      const output = admitted.length === 1
        ? { "@id": `${baseUrl}/ns/term/${admitted[0].identity}` }
        : { "@id": `${baseUrl}/ns/term/${encodeURIComponent(item)}` };
      cache.set(item, output); return output;
    }));
    relations[name] = Array.isArray(value) ? resolved : resolved[0];
  }
  return { ...record, relations };
}

/** JSON-LD for one authorized relation predicate. */
export function buildPredicateJsonLd({ name, authority, baseUrl, identifications = [] }) {
  const closeMatch = identifications.filter(({ property }) => property === SKOS_CLOSE_MATCH).map(({ other }) => `${baseUrl}/ns/predicate/${other}`);
  const exactMatch = identifications.filter(({ property }) => property === SKOS_EXACT_MATCH).map(({ other }) => `${baseUrl}/ns/predicate/${other}`);
  return Object.freeze({
    "@context": {
      rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      rdfs: "http://www.w3.org/2000/01/rdf-schema#",
      dcterms: "http://purl.org/dc/terms/",
      skos: "http://www.w3.org/2004/02/skos/core#",
      label: "rdfs:label",
      source: "dcterms:source",
      closeMatch: "skos:closeMatch",
      exactMatch: "skos:exactMatch",
    },
    "@id": `${baseUrl}/ns/predicate/${name}`,
    "@type": "rdf:Property",
    label: name,
    source: authority,
    ...(closeMatch.length ? { closeMatch } : {}),
    ...(exactMatch.length ? { exactMatch } : {}),
  });
}

function predicateTriples({ name, authority, baseUrl, identifications = [] }) {
  const iri = `${baseUrl}/ns/predicate/${name}`;
  const triples = [
    { s: iri, p: RDF_TYPE, o: RDF_PROPERTY },
    { s: iri, p: RDFS_LABEL, o: name },
    { s: iri, p: DCTERMS_SOURCE, o: authority },
  ];
  for (const { other, property } of identifications) triples.push({ s: iri, p: property, o: `${baseUrl}/ns/predicate/${other}` });
  return triples;
}

function renderPredicateHtml({ name, authority, baseUrl }) {
  const iri = `${baseUrl}/ns/predicate/${name}`;
  return `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${escapeHtml(name)} — GEODE predicate</title></head>\n<body>\n<h1>${escapeHtml(name)}</h1>\n<p>Authorized relation predicate.</p>\n<dl>\n<dt>IRI</dt><dd>${escapeHtml(iri)}</dd>\n<dt>Authority</dt><dd>${escapeHtml(authority)}</dd>\n</dl>\n</body>\n</html>\n`;
}

function jsonLdResponse(document) {
  return new Response(`${JSON.stringify(document, null, 2)}\n`, {
    status: 200,
    headers: { "content-type": "application/ld+json; charset=utf-8", "cache-control": "no-store" },
  });
}
function turtleResponse(triples) {
  return new Response(triplesToTurtle(triples), {
    status: 200,
    headers: { "content-type": "text/turtle; charset=utf-8", "cache-control": "no-store" },
  });
}
function htmlResponse(status, body) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
function jsonResponse(status, value) {
  return new Response(`${JSON.stringify(value)}\n`, { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function notFound(identity) {
  return jsonResponse(404, { error: "unknown identity", identity });
}

/**
 * `/ns/` is anonymous, so a term's graph answers under the house surface policy: only a carrier
 * whose own frontmatter says `visibility: public`, and that states no `consent-status`, is
 * served (the term owner's `glossaryAudienceAdmits`, the same rule the public glossary
 * vocabulary follows). Any other term is unknown here, so nothing about it, not even its
 * admission findings, reaches an anonymous reader. The HTML redirect carries no content and
 * still sends a browser to the term's room, which the admission gate guards.
 */
async function handleTermRequest(identity, { workspace, baseUrl, accept, documentUrl }) {
  const matches = findTermDocuments(workspace.paths.map((path) => ({ path })), identity);
  if (matches.length === 0) return notFound(identity);
  const documents = await Promise.all(matches.map((match) => workspace.read(match.path)));
  const published = documents.find((document) => document.properties?.visibility === "public");
  const format = negotiateVocabularyFormat(accept);
  if (format === "html") {
    const document = published ?? documents[0];
    const location = documentUrl?.(document, {public:published !== undefined, identity})
      ?? `${baseUrl}/#/${published ? "public" : "room"}/${roomKeyOf(document.path)}`;
    return new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });
  }
  if (published === undefined) return notFound(identity);
  let record;
  try {
    record = await admitTermMarkdownInVault({ path: published.path, text: published.markdown });
  } catch (error) {
    if (!Array.isArray(error.findings)) throw error;
    return jsonResponse(422, { error: error.message, identity, findings: error.findings });
  }
  if (!glossaryAudienceAdmits(record, "public")) return notFound(identity);
  const projected = await resolvedTermRecord(record, workspace, baseUrl);
  return format === "turtle" ? turtleResponse(termTriples(projected, baseUrl)) : jsonLdResponse(buildTermJsonLd(projected, { baseUrl }));
}

async function handlePredicateRequest(name, { baseUrl, accept }) {
  const authority = PREDICATE_AUTHORITY.get(name);
  if (authority === undefined) return notFound(name);
  const format = negotiateVocabularyFormat(accept);
  if (format === "html") return htmlResponse(200, renderPredicateHtml({ name, authority, baseUrl }));
  if (format === "turtle") return turtleResponse(predicateTriples({ name, authority, baseUrl }));
  return jsonLdResponse(buildPredicateJsonLd({ name, authority, baseUrl }));
}

/**
 * The `/ns/term/<identity>` and `/ns/predicate/<name>` dereference handler. Returns `null` when
 * `request` addresses neither route, so a caller can fall through to its own routing. Returns a
 * 503 when no archive is given (e.g. a Cloudflare Worker with no live archive binding) rather
 * than throwing.
 * @param {Request} request
 * @param {{archive: object|null|undefined, baseUrl?: string}} options
 * @returns {Promise<Response|null>}
 */
export async function handleVocabularyRequest(request, { archive, baseUrl, documentUrl } = {}) {
  const url = new URL(request.url);
  const termMatch = /^\/ns\/term\/([^/]+)$/u.exec(url.pathname);
  const predicateMatch = termMatch ? null : /^\/ns\/predicate\/([^/]+)$/u.exec(url.pathname);
  if (!termMatch && !predicateMatch) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return jsonResponse(405, { error: "method not allowed" });
  const origin = baseUrl ?? url.origin;
  const accept = request.headers.get("accept");
  if (!archive || typeof archive.read !== "function") return jsonResponse(503, { error: "vocabulary unavailable" });
  if (termMatch) return handleTermRequest(decodeURIComponent(termMatch[1]), { workspace: archive, baseUrl: origin, accept, documentUrl });
  return handlePredicateRequest(decodeURIComponent(predicateMatch[1]), { baseUrl: origin, accept });
}

/** True when `request` addresses a `/ns/term/` or `/ns/predicate/` route. */
export function ownsVocabularyRequest(request) {
  const { pathname } = new URL(request.url);
  return /^\/ns\/(?:term|predicate)\/[^/]+$/u.test(pathname);
}
