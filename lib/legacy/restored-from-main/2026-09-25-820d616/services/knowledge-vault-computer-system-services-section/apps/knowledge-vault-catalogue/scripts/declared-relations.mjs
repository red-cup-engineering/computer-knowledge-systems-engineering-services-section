import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";
import { basename, extname, posix } from "node:path";
import { eavtRow, unique } from "@red-cup-engineering/eavt";
import { pricePredicateIdentification } from "@red-cup-engineering/term-engineering-services-section/price-predicate-identification";
import { indexGlossaryKeywordWeb } from "@red-cup-engineering/term-engineering-services-section/keyword-web";
import { readPredicateIdentifications } from "@red-cup-engineering/term-engineering-services-section/predicate-identifications";
import { admitTermMarkdownInVault, recognizeTermMarkdownInVault, resolveTermRelationAuthority } from "@red-cup-engineering/term-engineering-services-section/relations";
import { projectDocumentTermRows, unresolvedTermGaps } from "@red-cup-engineering/term-engineering-services-section/document-term-relations";
import { readMarkdownFile } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-file";
import { readMarkdownFrontmatter } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-frontmatter";
import { admitNoteFrontmatter, NOTE_CONTRACT } from "./note-contract.mjs";
import { existsSync } from "node:fs";
import { slugify } from "@red-cup-engineering/computer-text-content-engineering-services-section/slugify-text";

const RELATIVE_NOTE_LINK = /\]\(([^)\s#:]+\.md)(?:#[^)]*)?\)/gu;

/**
 * The notes a document links to that exist nowhere: each is a page the corpus points at and
 * has not written, named by its file name read as a term.
 */
function unresolvedLinksOf(root, path, text) {
  const gaps = new Map();
  for (const match of text.matchAll(RELATIVE_NOTE_LINK)) {
    let target = match[1];
    try { target = decodeURIComponent(target); } catch { /* Keep the literal target. */ }
    const resolved = posix.normalize(posix.join(posix.dirname(path), target));
    if (resolved.startsWith("../") || existsSync(posix.join(root, resolved))) continue;
    const term = slugify(basename(target, extname(target)));
    if (term && !gaps.has(term)) gaps.set(term, target);
  }
  return gaps;
}

/**
 * The TESS keyword-web relation polarity used by DREW's concept projection.
 *
 * The EAVT query ledger does not use this as an allowlist: term carriers are admitted by the
 * upstream term contract and their authorized relations remain queryable beside these rows.
 */
export const DECLARED_RELATIONS = Object.freeze({ defines: "positive", "declares-keyword": "positive" });

let predicateIdentificationLedgerPromise;

/** The term contract's predicate-identification ledger, read once and cached for the process lifetime. */
function predicateIdentificationLedger() {
  predicateIdentificationLedgerPromise ??= readPredicateIdentifications();
  return predicateIdentificationLedgerPromise;
}

/**
 * The raw predicate-identification declarations (`{a, kind, b, carrier}[]`), for direct
 * (non-chained) SKOS mapping triples between two predicate IRIs.
 * @returns {Promise<{a: string, kind: "mld"|"equal", b: string, carrier: string}[]>}
 */
export async function readPredicateIdentificationDeclarations() {
  const ledger = await predicateIdentificationLedger();
  return ledger.declarations;
}

/**
 * Price the cheapest chain identifying one authorized relation predicate with another, through
 * the term contract's predicate-identification ledger (an "mld" chain prices as skos:closeMatch,
 * an all-"equal" chain as skos:exactMatch — see
 * @red-cup-engineering/term-engineering-services-section/price-predicate-identification).
 * @param {{from: string, to: string}} request
 * @returns {Promise<object>} A PredicateIdentificationPrice record, path/price/kind null when unreachable.
 */
export async function pricePredicateRelation({ from, to } = {}) {
  const ledger = await predicateIdentificationLedger();
  return pricePredicateIdentification({ declarations: ledger.declarations, from, to });
}

const TERM_DIRECTORY_MARKERS = Object.freeze([
  "/content/text/glossary/terms/",
  "/content/glossary/terms/",
]);

function glossaryTermAddress(path) {
  const normalized = posix.normalize(path).replace(/^\.\//u, "");
  for (const marker of TERM_DIRECTORY_MARKERS) {
    const marked = `/${normalized}`;
    const index = marked.indexOf(marker);
    if (index < 0) continue;
    const owner = marked.slice(1, index);
    const filename = marked.slice(index + marker.length);
    if (filename === "" || filename.includes("/") || extname(filename).toLowerCase() !== ".md") return null;
    return Object.freeze({
      path: normalized,
      owner,
      directory: marked.slice(1, index + marker.length - 1),
      filename,
      stem: basename(filename, extname(filename)),
    });
  }
  return null;
}

function isCurrentOrAncestorScope(candidate, current) {
  return candidate.owner === current.owner
    || (candidate.owner !== "" && current.owner.startsWith(`${candidate.owner}/`));
}

function ancestorScopes(current, scopes) {
  return scopes
    .filter((candidate) => isCurrentOrAncestorScope(candidate, current))
    .sort((left, right) => right.owner.length - left.owner.length
      || left.directory.localeCompare(right.directory, "en"));
}

/** A refused key's value as the refusal row carries it: scalars as strings, lists and maps as JSON text. */
function refusedValueOf(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value !== "object") return String(value);
  return JSON.stringify(value);
}

export function witnessOf(text) {
  return sha256Hex(text).slice(0, 16);
}

export function eavtRowsOf(assertions, witness) {
  return Object.freeze(assertions.map((assertion) => Object.freeze({
    e: assertion.path,
    a: assertion.relation,
    v: assertion.concept,
    t: witness,
  })));
}

/**
 * One typed refusal row. `refused` is its own predicate family (DREW no-collapse): never mixed
 * into the authorized relation predicates or into `declares-keyword`.
 */
function refusedRow(path, rule, message, witness, extra = {}) {
  return Object.freeze({ e: path, a: "refused", v: Object.freeze({ rule, message, ...extra }), t: witness });
}

/**
 * One `unresolved-term` refusal row per corpus gap: a `declares-keyword` or carrier-range
 * relation value that names no document's `defines` row anywhere in this ledger. The row still
 * stands (the document is findable by that name via `vault_search`/`vault_term`); this refusal
 * is the separate, additional fact that nothing defines it yet.
 */
function unresolvedTermRow(gap, witness) {
  return refusedRow(
    gap.path,
    "unresolved-term",
    `${gap.relation} ${gap.term} did not resolve to a defined term`,
    witness,
    { relation: gap.relation, term: gap.term },
  );
}

/** Collapse the same supplier observation without erasing distinct evidence for one carrier. */
export function mergeDefects(...groups) {
  const merged = [];
  const identities = new Set();
  for (const defect of groups.flat()) {
    const identity = JSON.stringify([defect.path, defect.reason, defect.keyword ?? null]);
    if (identities.has(identity)) continue;
    identities.add(identity);
    merged.push(defect);
  }
  return Object.freeze(merged);
}

async function readTermScopes({ root, paths, batch }) {
  const scopesByDirectory = new Map();
  const defects = [];
  const termAddresses = paths.map(glossaryTermAddress).filter(Boolean);
  for (let index = 0; index < termAddresses.length; index += batch) {
    const readings = await Promise.all(termAddresses.slice(index, index + batch).map(async (address) => {
      try {
        return Object.freeze({ ...address, text: await readMarkdownFile({ root, path: address.path }) });
      } catch (error) {
        defects.push(Object.freeze({ path: address.path, reason: error.message }));
        return null;
      }
    }));
    for (const reading of readings.filter(Boolean)) {
      let scope = scopesByDirectory.get(reading.directory);
      if (scope === undefined) {
        scope = { directory: reading.directory, owner: reading.owner, documents: [] };
        scopesByDirectory.set(reading.directory, scope);
      }
      scope.documents.push(reading);
    }
  }
  const scopes = [...scopesByDirectory.values()];
  for (const scope of scopes) scope.documents.sort((left, right) => left.filename.localeCompare(right.filename, "en"));
  return Object.freeze({ scopes, defects });
}

/**
 * Compile every admitted document into the declared-relation ledger.
 *
 * Every document contributes rows, not only glossary term carriers: one `declares-keyword` row
 * per frontmatter `keywords` entry, one `titled` row for its `title`, and one row per frontmatter
 * key that is an authorized relation predicate whose value names a term
 * (`@red-cup-engineering/term-engineering-services-section/document-term-relations`). A term
 * carrier's nested `relations:` map is normalized and admitted by the term contract and scopes
 * that document's relation-predicate rows to its own admitted keys; TESS additionally resolves a
 * compound's `keywords` against the current glossary term directory and then its ancestor term
 * directories, materializing the compound -> primitive-term keyword web (a second, scope-aware
 * mechanism beside the corpus-wide `declares-keyword` rows every document already gets).
 *
 * A keyword or relation value that names no document's `defines` row anywhere in this ledger
 * still produces its row (the document remains findable by that name) plus a typed
 * `unresolved-term` refusal row naming the gap. A Markdown link to a note that exists nowhere is an
 * `unresolved-link` refusal naming the missing page as a term, so it is asked as a question too.
 *
 * Admission is rule-based, never extracted. A note that is not a glossary term record is held to
 * the note contract (`note-contract.mjs`): each way its frontmatter falls short is a typed
 * `note-contract` refusal row, and each frontmatter key the contract does not authorize (neither a
 * note key nor a relation predicate) is an `unauthorized-key` refusal row carrying the key and its
 * value, so what the corpus says outside the vocabulary stays in the ledger as a refusal rather
 * than entering it as a claim. A note's `references` are its citations: one `cites` row per work,
 * from the note to the work's citekey.
 *
 * Row identity and dedupe are `@red-cup-engineering/eavt`'s own (`dedupe`, `assertRow`) —
 * content-addressed over the whole {e,a,v,t} row, G-Set semantics, first occurrence kept.
 */
export async function readDeclaredRelationLedger({ root, paths, batch = 64 } = {}) {
  if (typeof root !== "string" || root === "") throw new TypeError("root is required");
  if (!Array.isArray(paths)) throw new TypeError("paths must be an array");
  if (!Number.isSafeInteger(batch) || batch < 1) throw new TypeError("batch must be a positive safe integer");

  const [reading, authority] = await Promise.all([
    readTermScopes({ root, paths, batch }),
    resolveTermRelationAuthority({ root, paths, batch }),
  ]);
  const rows = [];
  const unresolved = [];
  const defects = [...reading.defects];
  const definedTerms = new Set();
  const projectedAssertions = [];
  const witnessByPath = new Map();
  let unnamed = 0;

  for (let index = 0; index < paths.length; index += batch) {
    const readings = await Promise.all(paths.slice(index, index + batch).map(async (path) => {
      try {
        const text = await readMarkdownFile({ root, path });
        const parsed = readMarkdownFrontmatter(text);
        const termScoped = glossaryTermAddress(path) !== null;
        const recognized = termScoped ? await recognizeTermMarkdownInVault({ path, text }) : null;
        let termRecord = null;
        if (termScoped && recognized?.admitted) {
          termRecord = await admitTermMarkdownInVault({ path, text });
        }
        return Object.freeze({ path, text, frontmatter: parsed.frontmatter, termScoped, termRecord, findings: recognized?.findings ?? [] });
      } catch (error) {
        return Object.freeze({ path, defect: Object.freeze({ path, reason: error.message }) });
      }
    }));
    for (const document of readings) {
      if (document.defect) {
        if (!defects.some(({ path, reason }) => path === document.defect.path && reason === document.defect.reason)) defects.push(document.defect);
        continue;
      }
      const witness = witnessOf(document.text);
      witnessByPath.set(document.path, witness);
      // A term carrier's nested `relations:` map is normalized and admitted by the term contract.
      // Other Markdown carriers retain the established top-level relation reading.
      const projected = projectDocumentTermRows({
        path: document.path,
        frontmatter: document.termRecord
          ? { ...document.frontmatter, ...document.termRecord.relations }
          : document.frontmatter,
        relationKeys: document.termRecord
          ? Object.keys(document.termRecord.relations ?? {})
          : authority.relationKeysByPath[document.path] ?? [],
      });
      unnamed += projected.unnamed;
      // Admission establishes that this carrier defines its own ruled identity.  Project that
      // fact here, rather than requiring each primitive term to invent a reciprocal relation or
      // leaving DREW to infer an identity from a compound that happens to mention it.
      if (document.termRecord) {
        rows.push(Object.freeze({
          e: document.path,
          a: "defines",
          v: document.termRecord.identity,
          t: witness,
        }));
        definedTerms.add(document.termRecord.identity);
      }
      for (const assertion of projected.assertions) {
        rows.push(eavtRowsOf([assertion], witness)[0]);
        projectedAssertions.push(assertion);
      }
      if (!document.termScoped) {
        for (const found of admitNoteFrontmatter(document.frontmatter).findings) rows.push(refusedRow(document.path, found.rule, found.message, witness));
        for (const [key, value] of Object.entries(document.frontmatter ?? {})) {
          if (Object.hasOwn(NOTE_CONTRACT.properties, key)) continue;
          rows.push(refusedRow(document.path, "unauthorized-key", `${key} is not a note key or an authorized relation predicate`, witness, { key, value: refusedValueOf(value) }));
        }
      }
      const references = document.frontmatter?.references;
      if (references && typeof references === "object" && !Array.isArray(references)) {
        for (const citekey of Object.keys(references)) rows.push(Object.freeze({ e: document.path, a: "cites", v: citekey, t: witness }));
      }
      for (const [term, target] of unresolvedLinksOf(root, document.path, document.text)) {
        rows.push(refusedRow(document.path, "unresolved-link", `link ${target} names no document`, witness, { relation: "links-to", term }));
      }
      if (document.termScoped) {
        for (const found of document.findings) rows.push(refusedRow(document.path, found.rule, found.message, witness));
        if (projected.unnamed > 0) rows.push(refusedRow(document.path, "unnamed", `${projected.unnamed} relation assertion(s) named no concept`, witness));
      }
    }
  }

  for (const current of reading.scopes) {
    const currentStems = new Set(current.documents.map(({ stem }) => stem));
    const scopes = ancestorScopes(current, reading.scopes).map((scope, depth) => ({
      directory: scope.directory,
      documents: scope.documents
        .filter(({ stem }) => depth === 0 || !currentStems.has(stem))
        .map(({ filename, text }) => ({ filename, text })),
    }));
    let web;
    try {
      web = indexGlossaryKeywordWeb(scopes);
    } catch (error) {
      defects.push(Object.freeze({ path: current.directory, reason: error.message }));
      continue;
    }
    const currentByStem = new Map(current.documents.map((document) => [document.stem, document]));
    for (const edge of web.edges) {
      const source = currentByStem.get(edge.from);
      if (source === undefined) continue;
      rows.push(Object.freeze({
        e: source.path,
        a: edge.relation,
        v: edge.to,
        t: witnessOf(source.text),
      }));
    }
    for (const missing of web.unresolved) {
      const source = currentByStem.get(missing.from);
      if (source === undefined) continue;
      unresolved.push(Object.freeze({ path: source.path, keyword: missing.keyword, reason: missing.reason }));
      rows.push(refusedRow(source.path, missing.reason, `keyword ${missing.keyword} did not resolve to a defined term`, witnessOf(source.text)));
    }
  }

  const mergedDefects = mergeDefects(defects);
  for (const defect of mergedDefects) {
    if (glossaryTermAddress(defect.path) === null) continue;
    rows.push(refusedRow(defect.path, "defect", defect.reason, witnessOf(defect.reason)));
  }

  // The corpus-wide gap: a declares-keyword or carrier-range relation value naming no document's
  // `defines` row anywhere in this ledger. Computed once every document's `defines` row is known,
  // never per-document (a keyword can name a term defined by any other admitted document).
  for (const gap of unresolvedTermGaps(projectedAssertions, definedTerms)) {
    rows.push(unresolvedTermRow(gap, witnessByPath.get(gap.path)));
  }

  const dedupedRows = Object.freeze(unique(rows).map(eavtRow));
  const documents = new Set(dedupedRows.map(({ e }) => e)).size;
  return Object.freeze({
    type: "GeodeDeclaredRelationLedger",
    schemaVersion: "geode-declared-relations/v3",
    rows: dedupedRows,
    documents,
    scanned: paths.length,
    unnamed,
    defects: mergedDefects,
    unresolved: Object.freeze(unresolved),
  });
}

/**
 * Read the keyword rows for one admitted term while resolving through the supplied vault paths.
 */
export async function readDeclaredRelations({ root, path, paths = [path], batch = 64 } = {}) {
  if (typeof path !== "string" || path === "") throw new TypeError("path is required");
  const ledger = await readDeclaredRelationLedger({ root, paths, batch });
  const rows = Object.freeze(ledger.rows.filter(({ e }) => e === path));
  return Object.freeze({
    path,
    assertions: Object.freeze(rows.map((row) => Object.freeze({
      path: row.e,
      relation: row.a,
      concept: row.v,
      polarity: "positive",
    }))),
    rows,
    unnamed: 0,
    defect: ledger.defects.find((item) => item.path === path) ?? null,
    unresolved: Object.freeze(ledger.unresolved.filter((item) => item.path === path)),
  });
}

/**
 * Read a ledger as passages and questions.
 *
 * A relation row whose value is a term some document `defines` is a passage from the asserting
 * document to that defining document. A term defined in several sections is read in the nearest
 * one, the same current-then-ancestor scoping the keyword web uses: the definers sharing the
 * longest owning-section path with the asserting document. Definers tied at that nearness each
 * receive a passage, since more than one definer is more than one witness, not a contradiction. An
 * `unresolved-term` refusal is a question: a name the corpus uses and nothing yet defines.
 * Questions are grouped by term and ranked by how many documents ask them, which is the order
 * directed relational research takes them up in: the gap most of the field leans on first.
 */
/** The section a document is owned by: its path up to the `content/` tree that holds it. */
function owningSection(path) {
  const at = `/${path}`.lastIndexOf("/content/");
  return at < 0 ? posix.dirname(path).split("/") : path.slice(0, Math.max(0, at - 1)).split("/");
}

function nearestDefiners(asserting, definers) {
  if (definers.length < 2) return definers;
  const own = owningSection(asserting);
  const shared = (path) => {
    const section = owningSection(path);
    let depth = 0;
    while (depth < own.length && depth < section.length && own[depth] === section[depth]) depth += 1;
    return depth;
  };
  const nearest = Math.max(...definers.map(shared));
  return definers.filter((path) => shared(path) === nearest);
}

export function readLedgerPassages(ledger) {
  const definers = new Map();
  for (const { e, a, v } of ledger.rows) {
    if (a !== "defines" || typeof v !== "string") continue;
    definers.set(v, [...(definers.get(v) ?? []), e]);
  }
  const passages = [];
  const asking = new Map();
  for (const { e, a, v } of ledger.rows) {
    if (a === "refused") {
      if (v?.rule !== "unresolved-term" && v?.rule !== "unresolved-link") continue;
      const question = asking.get(v.term) ?? { term: v.term, relations: new Set(), documents: new Set() };
      question.relations.add(v.relation);
      question.documents.add(e);
      asking.set(v.term, question);
      continue;
    }
    if (a === "defines" || typeof v !== "string") continue;
    for (const target of nearestDefiners(e, definers.get(v) ?? [])) {
      if (target !== e) passages.push(Object.freeze({ sourcePath: e, targetPath: target, predicate: a, term: v }));
    }
  }
  const questions = [...asking.values()]
    .map(({ term, relations, documents }) => Object.freeze({
      term,
      relations: Object.freeze([...relations].sort()),
      documents: Object.freeze([...documents].sort()),
    }))
    .sort((left, right) => right.documents.length - left.documents.length || left.term.localeCompare(right.term, "en"));
  return Object.freeze({ passages: Object.freeze(passages), questions: Object.freeze(questions) });
}
