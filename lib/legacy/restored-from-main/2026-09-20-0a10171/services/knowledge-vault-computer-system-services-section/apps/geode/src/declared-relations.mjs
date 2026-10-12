import { createHash } from "node:crypto";
import { basename, extname, posix } from "node:path";
import { assertRow, dedupe } from "@red-cup-engineering/eavt";
import { pricePredicateIdentification } from "@red-cup-engineering/price-predicate-identification-service";
import { indexGlossaryKeywordWeb } from "@red-cup-engineering/term-engineering-services-section/keyword-web";
import { readPredicateIdentifications } from "@red-cup-engineering/term-engineering-services-section/predicate-identifications";
import { admitTermMarkdownInVault, recognizeTermMarkdownInVault, resolveTermRelationAuthority } from "@red-cup-engineering/term-engineering-services-section/relations";
import { relationPredicateRange } from "@red-cup-engineering/term-engineering-services-section/carrier";
import { readMarkdownFile } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-file";
import { readMarkdownFrontmatter } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-frontmatter";

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
 * @red-cup-engineering/price-predicate-identification-service).
 * @param {{from: string, to: string}} request
 * @returns {Promise<object>} A PredicateIdentificationPrice record, path/price/kind null when unreachable.
 */
export async function pricePredicateRelation({ from, to } = {}) {
  const ledger = await predicateIdentificationLedger();
  return pricePredicateIdentification({ declarations: ledger.declarations, from, to });
}

const CONCEPT = /^[a-z][a-z0-9_/-]{0,80}$/u;

function conceptOf(value) {
  if (typeof value !== "string") return null;
  const folded = value.trim().replace(/^['"]|['"]$/gu, "").toLowerCase().replace(/\s+/gu, "-");
  return CONCEPT.test(folded) ? folded : null;
}

function conceptsOf(value) {
  if (Array.isArray(value)) return value.flat(Infinity).map(conceptOf).filter(Boolean);
  const single = conceptOf(value);
  return single ? [single] : [];
}

function relationValues(relation, value) {
  if (relationPredicateRange(relation) !== "literal") return conceptsOf(value);
  const values = Array.isArray(value) ? value.flat(Infinity) : [value];
  return values.filter((item) => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}

export function declaredRelationsOf({ path, frontmatter, relationKeys = [] } = {}) {
  if (typeof path !== "string" || path === "") throw new TypeError("path is required");
  const assertions = [];
  let unnamed = 0;
  for (const relation of relationKeys) {
    const declared = frontmatter?.[relation];
    if (declared === undefined || declared === null) continue;
    const named = relationValues(relation, declared);
    const total = Array.isArray(declared) ? declared.flat(Infinity).length : 1;
    unnamed += total - named.length;
    for (const concept of named) assertions.push(Object.freeze({ path, relation, concept, polarity: "positive" }));
  }
  return Object.freeze({ assertions: Object.freeze(assertions), unnamed });
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

export function witnessOf(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
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
 * into the 58 authorized relation predicates or into `declares-keyword`.
 */
function refusedRow(path, rule, message, witness) {
  return Object.freeze({ e: path, a: "refused", v: Object.freeze({ rule, message }), t: witness });
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
 * Compile admitted term carriers into the one-way compound -> keyword web.
 *
 * Only a compound's comma-separated `keywords` field creates rows. TESS resolves each keyword
 * against the current glossary term directory and then its ancestor term directories. Ordinary
 * Markdown frontmatter and glossary filenames do not become relation vocabularies.
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
      // A term carrier's nested `relations:` map is normalized and admitted by the term contract.
      // Other Markdown carriers retain the established top-level relation reading.
      const declared = declaredRelationsOf({
        path: document.path,
        frontmatter: document.termRecord
          ? { ...document.frontmatter, ...document.termRecord.relations }
          : document.frontmatter,
        relationKeys: document.termRecord
          ? Object.keys(document.termRecord.relations ?? {})
          : authority.relationKeysByPath[document.path] ?? [],
      });
      unnamed += declared.unnamed;
      // Admission establishes that this carrier defines its own ruled identity.  Project that
      // fact here, rather than requiring each primitive term to invent a reciprocal relation or
      // leaving DREW to infer an identity from a compound that happens to mention it.
      if (document.termRecord) {
        rows.push(Object.freeze({
          e: document.path,
          a: "defines",
          v: document.termRecord.identity,
          t: witnessOf(document.text),
        }));
      }
      for (const assertion of declared.assertions) {
        rows.push(eavtRowsOf([assertion], witnessOf(document.text))[0]);
      }
      if (document.termScoped) {
        const witness = witnessOf(document.text);
        for (const found of document.findings) rows.push(refusedRow(document.path, found.rule, found.message, witness));
        if (declared.unnamed > 0) rows.push(refusedRow(document.path, "unnamed", `${declared.unnamed} relation assertion(s) named no concept`, witness));
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

  const dedupedRows = Object.freeze(dedupe(rows).map(assertRow));
  const documents = new Set(dedupedRows.map(({ e }) => e)).size;
  return Object.freeze({
    type: "GeodeDeclaredRelationLedger",
    schemaVersion: "geode-declared-relations/v1",
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
