import { createHash } from "node:crypto";
import { readMarkdownFile } from "@red-cup-engineering/read-markdown-file-service";
import { readMarkdownFrontmatter } from "@red-cup-engineering/read-markdown-frontmatter-service";
import {
  DEFAULT_MARKDOWN_VAULT_RELATION_KEYS,
  markdownVaultGlossaryScopeOf,
  readMarkdownVaultRelationGlossary,
  resolveMarkdownVaultRelationKeys,
  resolveMarkdownVaultRelationKeysForPath,
} from "@red-cup-engineering/resolve-markdown-vault-relation-keys-service";

/**
 * Compatibility relations measured in the existing corpus. Scoped glossary terms extend this
 * set at read time; this object is the baseline, not a closed relation vocabulary.
 *
 * The set is measured, not assumed: a census of all 114,779 Markdown carriers found 113,661
 * assertions under these keys. Two spellings that a generic Markdown vault would expect are
 * deliberately absent — `dependsOn` occurs in zero documents here (this corpus writes
 * `depends-on`) and `parent` in ten, so reading those instead reads almost nothing.
 *
 * `contrasts-with` is the one negative relation. It is what makes a cell able to hold both
 * witnesses at once, which is the difference between a graph that can only say "linked" and one
 * that can say "held".
 */
export const DECLARED_RELATIONS = DEFAULT_MARKDOWN_VAULT_RELATION_KEYS;

/** A concept name as this corpus writes them: a bare slug, never a path or a sentence. */
const CONCEPT = /^[a-z][a-z0-9_/-]{1,80}$/u;

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

/**
 * The assertions one document declares.
 *
 * Values that are not concept names — prose, URLs, citation objects — are counted rather than
 * coerced. A relation whose object cannot be named is not an edge, and guessing one would put a
 * claim in the ledger that no document made.
 */
export function declaredRelationsOf({ path, frontmatter, relations = DECLARED_RELATIONS } = {}) {
  if (typeof path !== "string" || path === "") throw new TypeError("path is required");
  const assertions = [];
  let unnamed = 0;
  for (const [relation, polarity] of Object.entries(relations)) {
    const declared = frontmatter?.[relation];
    if (declared === undefined || declared === null) continue;
    const named = conceptsOf(declared);
    const total = Array.isArray(declared) ? declared.flat(Infinity).length : 1;
    unnamed += total - named.length;
    for (const concept of named) assertions.push(Object.freeze({ path, relation, concept, polarity }));
  }
  return Object.freeze({ assertions: Object.freeze(assertions), unnamed });
}

/** Compatibility aliases for callers which previously imported these from Opal. */
export const glossaryScopeOf = markdownVaultGlossaryScopeOf;
export const readScopedRelationGlossary = readMarkdownVaultRelationGlossary;
export function relationsForPath(path, entries = []) {
  return resolveMarkdownVaultRelationKeysForPath({ path, entries, baseRelations: DECLARED_RELATIONS });
}

/**
 * EAVT rows: entity is the declaring document, attribute the relation, value the concept named.
 *
 * `t` is a digest of the frontmatter that witnessed the assertion, so a row's identity changes
 * exactly when the declaration does. Wall-clock time would make the same corpus produce
 * different rows on every scan, and a scan ordinal would make an unrelated edit renumber
 * everything downstream of it.
 */
export function eavtRowsOf(assertions, witness) {
  return Object.freeze(assertions.map((assertion) => Object.freeze({
    e: assertion.path,
    a: assertion.relation,
    v: assertion.concept,
    t: witness,
  })));
}

export function witnessOf(frontmatterText) {
  return createHash("sha256").update(frontmatterText, "utf8").digest("hex").slice(0, 16);
}

/**
 * Read one document's declared relations.
 *
 * Frontmatter this repository's YAML reader refuses is reported as a defect rather than skipped.
 * It refuses roughly 3.9% of the corpus — chiefly indentation it will not accept, JSON-object
 * frontmatter written by other tools, and `\u` escapes in double-quoted scalars — and those
 * documents' relations are lost until the reader is fixed. Swallowing that would make an
 * incomplete ledger look complete.
 */
export async function readDeclaredRelations({ root, path, relations = DECLARED_RELATIONS } = {}) {
  if (typeof root !== "string" || root === "") throw new TypeError("root is required");
  if (typeof path !== "string" || path === "") throw new TypeError("path is required");
  const markdown = await readMarkdownFile({ root, path });
  let reading;
  try {
    reading = readMarkdownFrontmatter(markdown);
  } catch (error) {
    return Object.freeze({
      path,
      assertions: Object.freeze([]),
      rows: Object.freeze([]),
      unnamed: 0,
      defect: Object.freeze({ path, reason: error.message }),
    });
  }
  if (!reading.frontmatter) {
    return Object.freeze({ path, assertions: Object.freeze([]), rows: Object.freeze([]), unnamed: 0, defect: null });
  }
  const declared = declaredRelationsOf({ path, frontmatter: reading.frontmatter, relations });
  const witness = witnessOf(markdown.slice(0, markdown.length - reading.body.length));
  return Object.freeze({
    path,
    assertions: declared.assertions,
    rows: eavtRowsOf(declared.assertions, witness),
    unnamed: declared.unnamed,
    defect: null,
  });
}

/**
 * Read many documents into one ledger.
 *
 * Reads run in bounded batches: the corpus is large enough that opening every carrier at once
 * exhausts file handles long before it exhausts memory.
 */
export async function readDeclaredRelationLedger({ root, paths, batch = 64 } = {}) {
  if (!Array.isArray(paths)) throw new TypeError("paths must be an array");
  const rows = [];
  const resolvedKeys = await resolveMarkdownVaultRelationKeys({ root, paths, baseRelations: DECLARED_RELATIONS, batch });
  const defects = [...resolvedKeys.defects];
  let unnamed = 0;
  let documents = 0;
  for (let index = 0; index < paths.length; index += batch) {
    const readings = await Promise.all(paths.slice(index, index + batch)
      .map((path) => readDeclaredRelations({
        root,
        path,
        relations: resolvedKeys.relationsByPath[path],
      }).catch((error) => Object.freeze({
        path, assertions: [], rows: [], unnamed: 0, defect: Object.freeze({ path, reason: error.message }),
      }))));
    for (const reading of readings) {
      if (reading.defect && !defects.some((defect) => defect.path === reading.defect.path
        && defect.reason === reading.defect.reason)) defects.push(reading.defect);
      if (reading.rows.length > 0) documents += 1;
      unnamed += reading.unnamed;
      rows.push(...reading.rows);
    }
  }
  return Object.freeze({
    type: "OpalDeclaredRelationLedger",
    schemaVersion: "opal-declared-relations/v1",
    rows: Object.freeze(rows),
    documents,
    scanned: paths.length,
    unnamed,
    defects: Object.freeze(defects),
  });
}
