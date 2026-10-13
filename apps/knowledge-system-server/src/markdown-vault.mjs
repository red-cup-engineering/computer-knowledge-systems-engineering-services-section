import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { findPackageJSON } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isPromise } from "node:util/types";
import { basename, extname, join } from "node:path";
import { confinePath } from "@red-cup-engineering/computer-filepath-engineering-services-section/filepath";
import { searchImmutableRoomIndex } from "@red-cup-engineering/markdown-engineering-services-section/vault/room-index-search";
import { createTextIndex } from "@red-cup-engineering/markdown-engineering-services-section/vault/text-index";
import { openFullTextIndex } from "@red-cup-engineering/markdown-engineering-services-section/vault/full-text-index";
import { projectMarkdownAssertions } from "@red-cup-engineering/markdown-engineering-services-section/project-markdown-assertions";
import { TellingLog } from "@red-cup-engineering/signchain/log";
import { tm } from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation";
import { posix } from "node:path";
import { browseDocuments } from "@red-cup-engineering/markdown-engineering-services-section/vault/directory-listing";
import { DEFAULT_MARKDOWN_VAULT_EXCLUDES, observeMarkdownVaultDirectory } from "@red-cup-engineering/markdown-engineering-services-section/observe-markdown-vault-directory";

/** Directories an archive never reads as knowledge: version control, installed packages, build
 * output, and test fixtures (sample vaults kept beside the code that reads them). */
export const ARCHIVE_EXCLUDES = Object.freeze([...DEFAULT_MARKDOWN_VAULT_EXCLUDES, "dist", "fixtures"]);
import { deriveMarkdownVaultGraph } from "@red-cup-engineering/markdown-engineering-services-section/derive-markdown-vault-graph";
import { readMarkdownFile } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-file";
import { readMarkdownDocument } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-document";
import { MarkdownFileRevisionConflict, markdownFileRevision, writeMarkdownFile } from "@red-cup-engineering/markdown-engineering-services-section/write-markdown-file";
import { removeMarkdownFile } from "@red-cup-engineering/markdown-engineering-services-section/remove-markdown-file";
import { mutateMarkdownFrontmatter } from "@red-cup-engineering/markdown-engineering-services-section/mutate-markdown-frontmatter";
import { applyMarkdownDocumentMoves } from "@red-cup-engineering/markdown-engineering-services-section/move-markdown-documents";
import { applyMarkdownDuplicateConsolidation, planMarkdownDocumentMerge } from "@red-cup-engineering/markdown-engineering-services-section/consolidate-markdown-duplicates";

export const CairnRevisionConflict = MarkdownFileRevisionConflict;

/** A name as it is looked up: case, spacing, and punctuation folded ("Formal concept analysis" finds formal-concept-analysis). */
export function nameKey(name) {
  return String(name).trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "");
}

/**
 * The locale a document is filed in: the section that holds it, read down the section chain
 * (`a-section/services/b-section/services/...`) to the first segment that is neither a section
 * nor `services`. A document no section holds is filed in its directory.
 */
export function localeOf(path) {
  const segments = path.split("/");
  let owner = -1;
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (/-section$/u.test(segments[index])) owner = index;
    else if (segments[index] !== "services" && owner >= 0) break;
  }
  return owner < 0 ? posix.dirname(path) : segments.slice(0, owner + 1).join("/");
}

const PLACE_NAMES = new Set(["readme", "index", "_index"]);
const LINK_KINDS = Object.freeze({ "markdown-link": "link", "markdown-image": "image", wikilink: "link", transclusion: "embed" });

// One frozen SEN mark per surface: an archive tells the same keys, values and paths hundreds of
// thousands of times, and a mark is a value, so every telling of it can share one.
const marks = new Map();
function markOf(surface) {
  const text = String(surface);
  let held = marks.get(text);
  if (!held) { held = Object.freeze(tm.mark(text)); marks.set(text, held); }
  return held;
}

/** A document's statements as Markdown assertions: its frontmatter, its resolved links, its tags. */
function assertionsOf(record, edges) {
  const links = edges.filter((edge) => LINK_KINDS[edge.kind] && edge.status !== "external")
    .map((edge) => ({ kind: LINK_KINDS[edge.kind], target: edge.status === "resolved" ? edge.targetPath : edge.target }));
  const tags = (record.features ?? []).filter((feature) => feature.type === "hashtag").map((feature) => feature.tag);
  return projectMarkdownAssertions({ frontmatter: record.frontmatter ?? null, links, tags, subject: record.path, coordinate: record.revision }).assertions;
}
const LINK_PREDICATES = new Set(["link", "embed", "image"]);
const freeze = (values) => Object.freeze([...values]);
function strings(value) {
  return typeof value === "string" ? (value.trim() ? [value.trim()] : []) : Array.isArray(value) ? value.flatMap(strings) : [];
}
function summary(record, graph) {
  const frontmatter = record.frontmatter ?? {};
  const headings = record.headings.map((heading) => heading.text ?? heading.title).filter(Boolean);
  const declared = [frontmatter.title, frontmatter.name, frontmatter.id].find((value) => typeof value === "string" && value.trim());
  const declaredDescription = [frontmatter.description, frontmatter.summary].find((value) => typeof value === "string" && value.trim());
  return Object.freeze({
    path: record.path,
    revision: record.revision,
    title: declared?.trim() ?? headings[0] ?? basename(record.path, extname(record.path)),
    description: declaredDescription?.trim() ?? null,
    aliases: freeze(strings(frontmatter.aliases ?? frontmatter.alias)),
    keywords: freeze(strings(frontmatter.keywords ?? frontmatter.tags)),
    headings: freeze(headings),
    properties: frontmatter,
    diagnostics: record.diagnostics,
    incoming: graph ? graph.backlinks[record.path]?.length ?? 0 : null,
    outgoing: graph ? graph.outgoingCounts[record.path] ?? 0 : null,
  });
}

// `match: "any"`: a document matching one query token still appears; `searchImmutableRoomIndex`
// already ranks documents that match more tokens higher (see MATCHED_TOKEN_WEIGHT), so this is
// the inclusive, ranked search the vault surface documents itself as offering. `match: "all"`
// required every token to be found somewhere in a document's metadata, which silently emptied
// results for any multi-word query that was not a near-exact match.
export function searchCairnSnapshot(snapshot, query, { limit = 100 } = {}) {
  if (snapshot?.type !== "CairnVaultSnapshot") throw new TypeError("snapshot must be a CAIRN vault snapshot");
  if (snapshot.complete === false && snapshot.observationsComplete !== true) throw new TypeError("search requires complete document observations; use vault.search");
  if (typeof query !== "string") throw new TypeError("query must be a string");
  if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError("limit must be a nonnegative safe integer");
  if (query.trim() === "") return snapshot.documents.slice(0, limit);
  if (limit === 0) return [];
  return searchImmutableRoomIndex(snapshot.documents, { query: query.trim(), match: "any", limit }).results
    .map(({ room, score }) => Object.freeze({ ...room, score }));
}

export function projectCairnSnapshot(snapshot) {
  if (snapshot?.type !== "CairnVaultSnapshot") throw new TypeError("snapshot must be a CAIRN vault snapshot");
  return Object.freeze({ ...snapshot, graph: Object.freeze({
    nodes: snapshot.graph.nodes.length,
    edges: snapshot.graph.edges?.length ?? null,
    externalUrls: snapshot.graph.externalUrls?.length ?? null,
    diagnostics: snapshot.graph.diagnostics,
    observationDiagnostics: snapshot.graph.observationDiagnostics ?? [],
    complete: snapshot.graph.complete,
  }) });
}

/**
 * One filesystem inventory and one revision-aware observation catalogue. Opening and refreshing
 * enumerate paths; reading observes one carrier. Metadata and graph queries explicitly demand
 * the complete admitted set. Bodies are never retained in the catalogue. An own write replaces
 * one observation, while refresh/stat validation detects external changes before complete queries.
 */
/**
 * The reader an observation was made by: a digest of this module and of the Markdown reader
 * package's sources, so a release that changes how documents are read reparses them. (The reader's
 * own codecs, YAML and TOML, are outside the digest.)
 */
let observationReaderDigest;
function observationReader() {
  return observationReaderDigest ??= (async () => {
    const hash = createHash("sha256").update(await readFile(fileURLToPath(import.meta.url)));
    const sources = join(dirname(findPackageJSON(import.meta.resolve("@red-cup-engineering/markdown-engineering-services-section/read-markdown-document"))), "src");
    for (const name of (await readdir(sources, { recursive: true })).filter((name) => name.endsWith(".mjs")).sort()) {
      hash.update(`\0${name}\0`).update(await readFile(join(sources, name)));
    }
    return hash.digest("hex");
  })();
}

/**
 * Read an observation record: a header naming its reader, then one JSON line per document
 * observation, as `writeObservations` leaves it. A missing or unreadable record, or one another
 * reader made, is no record.
 */
async function readObservations(file) {
  const held = new Map();
  const input = createReadStream(file, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let header = true;
  try {
    for await (const line of lines) {
      if (header) {
        header = false;
        if (JSON.parse(line).reader !== await observationReader()) return held;
        continue;
      }
      if (!line) continue;
      try {
        const record = JSON.parse(line);
        if (typeof record.path === "string" && typeof record.signature === "string") held.set(record.path, Object.freeze({ ...record, headings: record.headings ?? record.structure?.headings ?? [] }));
      } catch { /* A torn line is no observation. */ }
    }
    return held;
  } catch { return new Map(); }
  finally { lines.close(); input.destroy(); }
}

/** Write an observation record whole, then move it into place, so a reader never sees half of one. */
async function writeObservations(file, records) {
  await mkdir(dirname(file), { recursive: true });
  const partial = `${file}.${process.pid}.partial`;
  const header = JSON.stringify({ reader: await observationReader() });
  // A record's headings are its structure's; the line keeps them once.
  const line = ({ headings, ...record }) => JSON.stringify(headings === record.structure?.headings ? record : { ...record, headings });
  const output = await open(partial, "w");
  try {
    await output.writeFile(header + "\n");
    for (const record of records.values()) if (record.revision !== null) await output.writeFile(line(record) + "\n");
  } finally { await output.close(); }
  await rename(partial, file);
}

/**
 * `observations`, when given, is a file where the vault keeps its document observations between
 * processes: an observation is reused unread while its file's signature (device, inode, size,
 * and times) is unchanged, and reused unparsed while its bytes still have the recorded revision,
 * so reopening a large vault, or the same vault moved, reparses only what changed. The record is
 * a replaceable cache of what the files say, never a source of it.
 *
 * `fullText`, when given, is a file where the vault keeps its full-text index between
 * processes, so a reopened vault reindexes only documents whose revision changed. Without it
 * the index lives for the process. Either way a text search reads only the documents that
 * moved since the last one.
 */
export async function openMarkdownVault({ root, region = "", excludes = ARCHIVE_EXCLUDES, limit = 100_000, maxScan = 100_000, observations = null, fullText: fullTextFile = null, admitPath = () => true } = {}) {
  if (typeof root !== "string" || root.trim() === "") throw new TypeError("root is required");
  if (typeof admitPath !== "function") throw new TypeError("admitPath must be a function");
  let inventory;
  let paths = new Set();
  const records = new Map();
  let graph = null;
  let version = 0;
  let writeTail = Promise.resolve();
  let observingAll = null;
  let observedAt;
  // Observations another process recorded, reused while their files are unchanged.
  const held = observations ? await readObservations(observations) : new Map();
  let recordStale = false;
  async function keepObservations() {
    if (!observations || !recordStale) return;
    recordStale = false;
    await writeObservations(observations, records);
  }
  // Navigation over the archive's text, kept current by the revision each path was indexed at.
  const text = createTextIndex();
  const textRevisions = new Map();
  let texting = null;
  // Ranked search over the archive's full text, kept current the same way.
  const fullText = openFullTextIndex({ file: fullTextFile ?? ":memory:" });
  let fullTexting = null;
  let fullTextReady = false;
  let fullTextGeneration = 0;
  const invalidateFullText = () => { fullTextReady = false; fullTextGeneration += 1; };
  // The archive's tellings, rebuilt when the graph they read from is.
  let tellings = null, tellingsGraph = null;
  let nameTable = null, nameVersion = -1;

  function admit(path) {
    if (typeof path !== "string" || !paths.has(path)) {
      const error = new RangeError(`unknown document: ${path}`);
      try { confinePath({ root, path }); error.reason = "not-found"; }
      catch { error.reason = "outside-repository-root"; }
      throw error;
    }
    return Object.freeze({ path });
  }
  function invalidate() { graph = null; version += 1; observedAt = new Date().toISOString(); }
  async function signature(path) {
    const value = await stat(join(root, path), { bigint: true });
    return `${value.dev}:${value.ino}:${value.size}:${value.mtimeNs}:${value.ctimeNs}`;
  }
  async function observe(path, { source = false } = {}) {
    admit(path);
    const before = await signature(path);
    let prior = records.get(path);
    if (!prior && held.has(path)) {
      // A kept observation names its document's revision: the same bytes at a new inode (a
      // release, a fresh checkout) are confirmed by reading them, not by parsing them again.
      prior = held.get(path);
      held.delete(path);
      if (prior.signature === before) records.set(path, prior);
    }
    if (!source && prior?.signature === before) return prior;
    const markdown = await readMarkdownFile({ root, path });
    const revision = markdownFileRevision(markdown);
    if (fullText.revisionOf(path) !== undefined && fullText.revisionOf(path) !== revision) invalidateFullText();
    const normalized = markdown.replace(/\r\n?/gu, "\n");
    let record = prior;
    let body;
    if (prior?.revision !== revision) {
      const parsed = readMarkdownDocument(markdown, { onInvalidFrontmatter: "diagnose" });
      body = parsed.body;
      record = Object.freeze({ path, revision, signature: before, frontmatter: parsed.frontmatter,
        bodyOffset: normalized.endsWith(body) ? normalized.length - body.length : null,
        format: parsed.format, structure: parsed.structure, headings: parsed.structure.headings, features: parsed.features, diagnostics: freeze(parsed.diagnostics ?? []) });
      records.set(path, record);
      recordStale = true;
      invalidate();
    } else {
      body = record.bodyOffset === null ? readMarkdownDocument(markdown, { onInvalidFrontmatter: "diagnose" }).body : normalized.slice(record.bodyOffset);
      if (prior.signature !== before) {
        record = Object.freeze({ ...prior, signature: before });
        records.set(path, record);
        recordStale = true;
      }
    }
    return source ? { record, markdown, body } : record;
  }
  async function observeOrDiagnose(path) {
    try { await observe(path); }
    catch (error) {
      const diagnostics = freeze([{ code: "unreadable-document", message: error.message }]);
      const prior = records.get(path);
      if (prior?.diagnostics?.[0]?.code !== diagnostics[0].code || prior.diagnostics[0].message !== diagnostics[0].message) {
        records.set(path, Object.freeze({ path, revision: null, frontmatter: Object.freeze({}), headings: [], features: [], diagnostics }));
        invalidate();
      }
    }
  }
  async function observeAll() {
    if (observingAll) return observingAll;
    observingAll = (async () => {
      const selected = [...paths];
      for (let offset = 0; offset < selected.length; offset += 64) {
        await Promise.all(selected.slice(offset, offset + 64).map(observeOrDiagnose));
      }
      await keepObservations();
    })();
    try { await observingAll; } finally { observingAll = null; }
  }

  /** Observe the admitted set once; queries answer from it until refresh or an own write. */
  async function ensureObserved() { if (records.size !== paths.size) await observeAll(); }
  function snapshot() {
    const inventoryComplete = !inventory.truncated && inventory.diagnostics.length === 0;
    const complete = records.size === paths.size && inventoryComplete && [...records.values()].every((record) => record.diagnostics.length === 0);
    return Object.freeze({
      type: "CairnVaultSnapshot", schemaVersion: "cairn-vault/v1", vaultKind: "markdown",
      observedAt, version, region: inventory.region, excludes: inventory.excludes,
      scanned: inventory.scanned, excluded: inventory.excluded, available: inventory.available,
      truncated: inventory.truncated, inventoryComplete, inventoryDiagnostics: inventory.diagnostics, complete, observationsComplete: records.size === paths.size,
      documents: freeze([...records.values()].map((record) => summary(record, graph)).sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path))),
      graph: graph ?? Object.freeze({ nodes: freeze(paths), edges: null, externalUrls: null, backlinks: null, diagnostics: null, complete: false }),
    });
  }
  async function refresh() {
    invalidateFullText();
    inventory = await observeMarkdownVaultDirectory({ root, region, excludes, limit, maxScan, admitPath });
    const next = new Set(inventory.paths);
    for (const path of records.keys()) if (!next.has(path)) records.delete(path);
    paths = next;
    for (const path of textRevisions.keys()) if (!paths.has(path)) { text.remove(path); textRevisions.delete(path); }
    // Retain observations only when filesystem evidence still identifies the same revision.
    const held = [...records];
    for (let offset = 0; offset < held.length; offset += 64) {
      await Promise.all(held.slice(offset, offset + 64).map(async ([path, record]) => {
        try { if (await signature(path) === record.signature) return; } catch { /* The next observation records the diagnostic. */ }
        records.delete(path);
      }));
    }
    invalidate();
    return snapshot();
  }
  async function completeSnapshot({ relations = true } = {}) {
    await observeAll();
    if (relations && !graph) {
      const derived = deriveMarkdownVaultGraph({ documents: [...records.values()] });
      const outgoingCounts = Object.create(null);
      for (const edge of derived.edges) outgoingCounts[edge.sourcePath] = (outgoingCounts[edge.sourcePath] ?? 0) + 1;
      const observationDiagnostics = freeze([
        ...inventory.diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic, stage: "admission" })),
        ...[...records.values()].flatMap((record) => record.diagnostics.map((diagnostic) => Object.freeze({ path: record.path, ...diagnostic, stage: "document" }))),
      ]);
      graph = Object.freeze({ ...derived, outgoingCounts: Object.freeze(outgoingCounts), observationDiagnostics, complete: !inventory.truncated && observationDiagnostics.length === 0 });
    }
    return snapshot();
  }
  async function relations(path) {
    admit(path);
    await completeSnapshot();
    return Object.freeze({ outgoing: freeze(graph.edges.filter((edge) => edge.sourcePath === path)),
      backlinks: freeze(graph.backlinks[path] ?? []), unresolved: freeze(graph.edges.filter((edge) => edge.status === "ambiguous" && edge.candidates.includes(path))),
      diagnostics: graph.observationDiagnostics, complete: graph.complete, truncated: inventory.truncated });
  }
  async function read(path, { carrier = false } = {}) {
    const { record, markdown, body } = await observe(path, { source: true });
    const fields = graph ? { outgoing: freeze(graph.edges.filter((edge) => edge.sourcePath === path)), backlinks: freeze(graph.backlinks[path] ?? []) } : { outgoing: null, backlinks: null };
    return Object.freeze({ type: "CairnDocumentReading", schemaVersion: "cairn-document/v1", vaultKind: "markdown", ...summary(record, graph), markdown, body, ...fields, relationsDeferred: !graph, relationsComplete: graph?.complete ?? false,
      ...(carrier ? { carrier: Object.freeze({ path, source: { lines: markdown.replace(/\r\n?/gu, "\n").split("\n") }, format: record.format, frontmatter: record.frontmatter, structure: record.structure, diagnostics: record.diagnostics }) } : {}) });
  }
  /** Run one write after every earlier one, whether or not those succeeded. */
  function serialized(operation) {
    const recorded = async () => { const result = await operation(); await keepObservations(); return result; };
    const running = writeTail.then(recorded, recorded);
    writeTail = running.catch(() => {});
    return running;
  }
  /**
   * A write surface for the file-level operations of the Markdown engineering package that
   * notes which paths it wrote and removed, so the catalogue re-observes exactly those.
   */
  function tracker() {
    const written = new Set(), removed = new Set();
    return {
      written, removed,
      read: ({ path }) => readMarkdownFile({ root, path }),
      write: async (options) => { const receipt = await writeMarkdownFile({ ...options, root }); written.add(options.path); removed.delete(options.path); return receipt; },
      remove: async ({ path }) => { await removeMarkdownFile({ root, path }); removed.add(path); written.delete(path); },
      exists: async ({ path }) => { try { await stat(join(root, path)); return true; } catch { return false; } },
      async settle() {
        invalidateFullText();
        for (const path of removed) { paths.delete(path); records.delete(path); text.remove(path); textRevisions.delete(path); }
        for (const path of written) { paths.add(path); records.delete(path); await observe(path); await retext(path); }
        invalidate();
      },
    };
  }
  function admitNew(path) {
    if (typeof path !== "string" || !/\.(?:md|markdown)$/iu.test(path)) throw new TypeError("path must name a Markdown file");
    confinePath({ root, path });
    const accepted = admitPath(path);
    if (typeof accepted !== "boolean") {
      if (isPromise(accepted)) Promise.prototype.then.call(accepted, undefined, () => {});
      throw new TypeError("admitPath must return a boolean");
    }
    if (!accepted) throw new RangeError("document is outside the admitted knowledge scope");
    if (paths.has(path)) throw new RangeError(`document already exists: ${path}`);
  }
  // — text: the archive's words and shingles, for search and for finding what says one thing —
  async function retext(path) {
    const record = records.get(path);
    if (!record || record.revision === null) { text.remove(path); textRevisions.delete(path); return; }
    if (textRevisions.get(path) === record.revision) return;
    // A document's text signature depends only on its revision, so its observation keeps it.
    const known = record.textSignature === undefined ? undefined : record.textSignature === null ? null : Uint32Array.from(record.textSignature);
    text.add(path, await readMarkdownFile({ root, path }), { signature: known });
    textRevisions.set(path, record.revision);
    if (record.textSignature === undefined) {
      const signature = text.signatureOf(path);
      records.set(path, Object.freeze({ ...record, textSignature: signature ? [...signature] : null }));
      recordStale = true;
    }
  }
  /** Index every observed document's text not yet indexed at its current revision. */
  async function ensureText() {
    await ensureObserved();
    if (texting) return texting;
    texting = (async () => {
      const pending = [...records.keys()].filter((path) => textRevisions.get(path) !== records.get(path).revision);
      for (let offset = 0; offset < pending.length; offset += 128) await Promise.all(pending.slice(offset, offset + 128).map((path) => retext(path).catch(() => {})));
      await keepObservations();
    })();
    try { await texting; } finally { texting = null; }
  }
  /** Index admitted source bytes without semantically parsing every document first.
   * Search observes its matching notes; graph and metadata queries retain their own complete
   * observation requirement. A refresh or own write invalidates this reading of the corpus. */
  async function ensureFullText() {
    if (fullTexting) return fullTexting;
    if (fullTextReady) return;
    const generation = fullTextGeneration;
    fullTexting = (async () => {
      const gone = fullText.paths().filter((path) => !paths.has(path));
      if (gone.length) fullText.revise(({ remove }) => { for (const path of gone) remove(path); });
      const selected = [...paths];
      for (let offset = 0; offset < selected.length; offset += 64) {
        const read = await Promise.all(selected.slice(offset, offset + 64).map(async (path) => {
          try {
            const markdown = await readMarkdownFile({ root, path });
            const revision = markdownFileRevision(markdown);
            return fullText.revisionOf(path) === revision ? null : { path, revision, markdown };
          } catch { return { path, unreadable: true }; }
        }));
        fullText.revise(({ put, remove }) => {
          for (const row of read) {
            if (!row) continue;
            if (row.unreadable) remove(row.path);
            else put(row.path, row.revision, row.markdown);
          }
        });
      }
      fullTextReady = generation === fullTextGeneration;
    })();
    try { await fullTexting; } finally { fullTexting = null; }
  }
  async function searchTexts(queries, { limit = 25 } = {}) {
    const distinct = [...new Set(queries)];
    if (limit === 0) return distinct.map(() => []);
    await ensureFullText();
    return distinct.map((query) => fullText.search(query, { limit }));
  }
  async function searchText(query, options) {
    return (await searchTexts([query], options))[0] ?? [];
  }
  // — names: what each document answers to —
  function namesOf(record) {
    const frontmatter = record.frontmatter ?? {};
    const rows = [];
    for (const key of ["title", "name", "id"]) for (const name of strings(frontmatter[key])) rows.push([name, key]);
    for (const name of strings(frontmatter.aliases ?? frontmatter.alias)) rows.push([name, "alias"]);
    let stem = basename(record.path, extname(record.path));
    if (PLACE_NAMES.has(stem.toLowerCase())) stem = basename(posix.dirname(record.path));
    rows.push([stem, "stem"]);
    return rows;
  }
  async function names() {
    await ensureObserved();
    if (nameTable && nameVersion === version) return nameTable;
    nameTable = new Map();
    for (const record of records.values()) {
      const seen = new Set();
      for (const [name, kind] of namesOf(record)) {
        const key = nameKey(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const rows = nameTable.get(key);
        const row = Object.freeze({ path: record.path, name, kind });
        if (rows) rows.push(row); else nameTable.set(key, [row]);
      }
    }
    nameVersion = version;
    return nameTable;
  }
  // — tellings: what the documents say (their Markdown assertions), as SEN-mark triples in a SignChain telling log —
  async function told() {
    const current = await completeSnapshot();
    if (tellings && tellingsGraph === current.graph) return tellings;
    const outgoing = new Map();
    for (const edge of current.graph.edges) { const list = outgoing.get(edge.sourcePath); if (list) list.push(edge); else outgoing.set(edge.sourcePath, [edge]); }
    const log = new TellingLog();
    for (const record of records.values()) {
      if (record.revision === null) continue;
      for (const { e, a, v, t } of assertionsOf(record, outgoing.get(record.path) ?? [])) log.tell({ subject: markOf(e), predicate: markOf(a), object: markOf(v) }, t);
    }
    tellings = log; tellingsGraph = current.graph;
    return log;
  }
  // — passages and questions: what the tellings' values name, read against the archive's names —
  let reading = null, readingLog = null;
  function sharedDepth(left, right) {
    const a = left.split("/"), b = right.split("/");
    let depth = 0;
    while (depth < a.length && depth < b.length && a[depth] === b[depth]) depth += 1;
    return depth;
  }
  /** The documents answering to `surface` filed nearest `fromPath` (the deepest shared locale), itself excluded. */
  function nearestNamed(table, surface, fromPath) {
    const candidates = (table.get(nameKey(surface)) ?? []).map((row) => row.path).filter((path) => path !== fromPath);
    if (candidates.length === 0) return [];
    const from = localeOf(fromPath);
    const depths = candidates.map((path) => sharedDepth(from, localeOf(path)));
    const best = Math.max(...depths);
    return [...new Set(candidates.filter((path, index) => depths[index] === best))];
  }
  /**
   * Passages: each telling whose value names a document (a link's target path, or a value some
   * document answers to, read as the nearest such document). Questions: link targets that exist
   * nowhere, and values naming nothing under predicates whose values mostly do name documents --
   * the names the archive uses as terms and has not written.
   */
  async function readPassages() {
    const log = await told();
    if (reading && readingLog === log) return reading;
    const table = await names();
    const passages = [], unnamed = [], predicateUse = new Map();
    for (const row of log.rows) {
      const source = row.subject[1], predicate = row.predicate[1], value = row.object[1];
      const use = predicateUse.get(predicate) ?? { values: 0, naming: 0 };
      use.values += 1;
      if (LINK_PREDICATES.has(predicate)) {
        if (paths.has(value)) { passages.push(Object.freeze({ sourcePath: source, targetPath: value, predicate, term: null })); use.naming += 1; }
        else unnamed.push({ source, predicate, value, link: true });
      } else {
        const targets = nearestNamed(table, value, source);
        if (targets.length > 0) { use.naming += 1; for (const target of targets) passages.push(Object.freeze({ sourcePath: source, targetPath: target, predicate, term: value })); }
        else unnamed.push({ source, predicate, value, link: false });
      }
      predicateUse.set(predicate, use);
    }
    const asking = new Map();
    for (const { source, predicate, value, link } of unnamed) {
      const use = predicateUse.get(predicate);
      if (!link && use.naming / use.values < 0.5) continue;
      const question = asking.get(value) ?? { term: value, relations: new Set(), documents: new Set() };
      question.relations.add(predicate); question.documents.add(source);
      asking.set(value, question);
    }
    const questions = [...asking.values()].map(({ term, relations, documents }) => Object.freeze({ term, relations: freeze([...relations].sort()), documents: freeze([...documents].sort()) }))
      .sort((left, right) => right.documents.length - left.documents.length || left.term.localeCompare(right.term, "en"));
    reading = Object.freeze({ passages: freeze(passages), questions: freeze(questions) }); readingLog = log;
    return reading;
  }
  function receipt(type, fields) { return Object.freeze({ type, schemaVersion: "cairn-revision/v1", ...fields }); }
  function replace({ path, markdown, expectedRevision } = {}) {
    admit(path);
    if (typeof markdown !== "string") throw new TypeError("markdown must be a string");
    return serialized(async () => {
      const write = await writeMarkdownFile({ root, path, text: markdown, mode: "replace", normalization: "preserve", expectedRevision });
      const document = await read(path);
      await retext(path);
      return receipt("CairnRevisionReceipt", { path, previousRevision: write.previousRevision, revision: document.revision, changed: write.changed, bytes: write.bytes, document });
    });
  }
  /** Create a document that does not exist yet. */
  function create({ path, markdown } = {}) {
    admitNew(path);
    if (typeof markdown !== "string") throw new TypeError("markdown must be a string");
    return serialized(async () => {
      const write = await writeMarkdownFile({ root, path, text: markdown, mode: "create", normalization: "preserve" });
      paths.add(path);
      const document = await read(path);
      invalidate();
      await retext(path);
      return receipt("CairnRevisionReceipt", { path, previousRevision: null, revision: document.revision, changed: true, bytes: write.bytes, document });
    });
  }
  /**
   * Replace exact passages of a document: each edit's `find` must occur exactly once (or, with
   * `all`, at least once), or nothing is written. Guarded like `replace` by the revision read.
   */
  function edit({ path, edits, expectedRevision } = {}) {
    admit(path);
    if (!Array.isArray(edits) || edits.length === 0) throw new TypeError("edits must be a nonempty array");
    return serialized(async () => {
      const { markdown, record } = await observe(path, { source: true });
      let text = markdown;
      edits.forEach(({ find, replace: replacement, all = false }, position) => {
        if (typeof find !== "string" || find === "" || typeof replacement !== "string") throw new TypeError(`edit ${position}: find must be a nonempty string and replace a string`);
        const count = text.split(find).length - 1;
        if (count === 0) throw new RangeError(`edit ${position}: text not found`);
        if (count > 1 && !all) throw new RangeError(`edit ${position}: text occurs ${count} times; give more context or set all`);
        text = all ? text.split(find).join(replacement) : text.replace(find, () => replacement);
      });
      const write = await writeMarkdownFile({ root, path, text, mode: "replace", normalization: "preserve", expectedRevision: expectedRevision ?? record.revision });
      const document = await read(path);
      await retext(path);
      return receipt("CairnRevisionReceipt", { path, previousRevision: write.previousRevision, revision: document.revision, changed: write.changed, bytes: write.bytes, document });
    });
  }
  /** Set and delete frontmatter keys, keeping every other byte of the document. */
  function setProperties({ path, set = {}, remove = [], expectedRevision } = {}) {
    admit(path);
    return serialized(async () => {
      const { markdown, record } = await observe(path, { source: true });
      let text = markdown;
      for (const [key, value] of Object.entries(set)) text = mutateMarkdownFrontmatter(text, { mode: "set", key, value });
      for (const key of remove) text = mutateMarkdownFrontmatter(text, { mode: "delete", key });
      const write = await writeMarkdownFile({ root, path, text, mode: "replace", normalization: "preserve", expectedRevision: expectedRevision ?? record.revision });
      const document = await read(path);
      await retext(path);
      return receipt("CairnRevisionReceipt", { path, previousRevision: write.previousRevision, revision: document.revision, changed: write.changed, bytes: write.bytes, document });
    });
  }
  /** Move (or rename) documents; every link to a moved document, and every link in it, follows. */
  function move({ moves } = {}) {
    const admitted = new Map();
    for (const [from, to] of moves instanceof Map ? moves : Object.entries(moves ?? {})) { admit(from); admitNew(to); admitted.set(from, to); }
    if (admitted.size === 0) throw new TypeError("moves must name at least one document");
    return serialized(async () => {
      const surface = tracker();
      const snapshot = await completeSnapshot();
      const result = await applyMarkdownDocumentMoves({ root, moves: admitted, scan: async () => ({ graph: snapshot.graph }), ...surface });
      await surface.settle();
      return receipt("CairnMoveReceipt", { ...result, moves: Object.freeze(Object.fromEntries(admitted)), written: freeze([...surface.written].sort()), removed: freeze([...surface.removed].sort()) });
    });
  }
  /**
   * Merge documents that say one thing into one home: the home gains what only they say (under
   * "Earlier material"), their names as aliases and the frontmatter keys it lacks; every link to
   * them is pointed at the home; they are removed.
   */
  function merge({ into, from } = {}) {
    admit(into);
    const retired = [...new Set(Array.isArray(from) ? from : [from])].filter((path) => path !== into);
    if (retired.length === 0) throw new TypeError("from must name at least one other document");
    for (const path of retired) admit(path);
    return serialized(async () => {
      const surface = tracker();
      const snapshot = await completeSnapshot();
      const involved = new Set([into, ...retired]);
      const texts = new Map(await Promise.all([...involved].map(async (path) => [path, await readMarkdownFile({ root, path })])));
      const plan = planMarkdownDocumentMerge({ home: { path: into, text: texts.get(into) }, retired: retired.map((path) => ({ path, text: texts.get(path) })) });
      const result = await applyMarkdownDuplicateConsolidation({
        root, ...surface, admit: (path) => involved.has(path), plan: () => plan,
        scan: async () => ({ complete: !snapshot.truncated, documents: [...involved].map((path) => ({ path })), graph: snapshot.graph }),
      });
      await surface.settle();
      return receipt("CairnMergeReceipt", { ...result, into, from: freeze(retired), aliases: plan.groups[0]?.aliases ?? [], appended: plan.groups[0]?.append !== null,
        written: freeze([...surface.written].sort()), removed: freeze([...surface.removed].sort()) });
    });
  }
  await refresh();
  return Object.freeze({ type: "CairnContentVault", schemaVersion: "cairn-content-vault/v1", vaultKind: "markdown",
    get snapshot() { return snapshot(); }, get paths() { return freeze(paths); }, get version() { return version; },
    admit, read, replace, create, edit, setProperties, move, merge, refresh, completeSnapshot, relations,
    browse(prefix = "", options) { return browseDocuments(paths, region, prefix, options); },
    async search(query, { mode = "metadata", limit = 100 } = {}) {
      if (mode === "metadata") return searchCairnSnapshot(await completeSnapshot({ relations: false }), query, { limit });
      if (mode !== "text") throw new TypeError("search mode must be metadata or text");
      if (typeof query !== "string") throw new TypeError("query must be a string");
      if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError("limit must be a nonnegative safe integer");
      if (!query.trim() || limit === 0) return [];
      const hits = await searchText(query, { limit });
      return freeze(await Promise.all(hits.filter((hit) => paths.has(hit.path)).map(async (hit) => {
        const { record, markdown } = await observe(hit.path, { source: true });
        const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
        const lines = markdown.split(/\r?\n/u);
        const at = lines.findIndex((line) => words.every((word) => line.toLowerCase().includes(word)));
        const line = at >= 0 ? at : lines.findIndex((line) => line.toLowerCase().includes(words[0]));
        return Object.freeze({ ...summary(record, graph), score: hit.score, line: line + 1, evidence: freeze([lines[line]?.trim().slice(0, 240) ?? ""]) });
      })));
    },
    /** Documents answering to a name (title, name, id, alias, or file stem), folded; `prefix` for a quick switcher. */
    async names(name, { prefix = false, limit = 50 } = {}) {
      const table = await names();
      const key = nameKey(name);
      if (!key) return freeze([]);
      const rows = prefix ? [...table].filter(([candidate]) => candidate.startsWith(key)).sort((x, y) => x[0].length - y[0].length || x[0].localeCompare(y[0])).flatMap(([, found]) => found)
        : table.get(key) ?? [];
      return freeze(rows.slice(0, limit).map((row) => Object.freeze({ ...row, title: summary(records.get(row.path), graph).title })));
    },
    /** Documents that say this document's title or aliases in their text, each marked linked (it already links here) or not. */
    async mentions(path, { limit = 50 } = {}) {
      const record = await observe(path);
      const said = [...new Set([summary(record, graph).title, ...strings(record.frontmatter?.aliases ?? record.frontmatter?.alias)])].filter((name) => name.length >= 3);
      await completeSnapshot();
      const linked = new Set((graph.backlinks[path] ?? []).map((edge) => edge.sourcePath));
      const found = new Map();
      const results = await searchTexts(said, { limit: limit * 2 });
      for (const hits of results) for (const hit of hits) if (hit.path !== path && !found.has(hit.path)) found.set(hit.path, hit.score);
      return freeze([...found].sort((x, y) => y[1] - x[1]).slice(0, limit).map(([other]) => Object.freeze({ path: other, title: summary(records.get(other), graph).title, linked: linked.has(other) })));
    },
    /** Documents whose text overlaps this one's, by MinHash estimate of shared five-word shingles. */
    async similar(path, { limit = 20, minimum = 0.2 } = {}) {
      admit(path);
      await ensureText();
      return freeze(text.similar(path, { limit, minimum }).filter((row) => records.has(row.path)).map((row) => Object.freeze({ ...summary(records.get(row.path), graph), overlap: row.overlap })));
    },
    /** The estimated overlap of two documents' texts (null when either is too short to sign). */
    async overlap(left, right) { await ensureText(); return text.overlap(left, right); },
    /** Groups of documents that say one thing, each pair overlapping by at least `minimum`. */
    async clusters({ minimum = 0.6, prefix = "", limit = 50 } = {}) { await ensureText(); return freeze(text.clusters({ minimum, prefix, limit }).map(freeze)); },
    /** The archive's tellings: a SignChain telling log of what its documents say, as SEN-mark triples. */
    tellings: told,
    /** Tellings whose values name documents, as passages from the teller to the named document. */
    async passages() { return (await readPassages()).passages; },
    /** Names the archive uses as terms and nothing answers to, most-asked first; optionally only those asked beneath a path prefix. */
    async questions({ prefix = "", limit = 50 } = {}) {
      const { questions } = await readPassages();
      return freeze(questions.map((question) => prefix ? { ...question, documents: question.documents.filter((path) => path.startsWith(prefix)) } : question)
        .filter((question) => question.documents.length > 0).slice(0, limit));
    },
    /** The tellings a document makes. */
    async statements(path) { admit(path); return (await told()).where({ subject: tm.mark(path) }); },
    async resolveLink(sourcePath, target) {
      admit(sourcePath);
      await observeAll();
      const documents = [...records.values()].map((record) => ({ ...record, features: record.path === sourcePath ? [{ type: "wikilink", target }] : [] }));
      const resolved = deriveMarkdownVaultGraph({ documents, frontmatterReferenceKeys: [] }).edges[0];
      return resolved?.status === "resolved" ? resolved.targetPath : null;
    },
  });
}

