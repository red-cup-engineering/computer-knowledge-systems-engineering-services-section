import { mkdirSync } from "node:fs";
import { dirname, basename, extname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { estimateShingleOverlap, markdownBodyIdentity, markdownShingleSignature, markdownSignatureBands } from "@red-cup-engineering/markdown-engineering-services-section/consolidate-markdown-duplicates";

const SCHEMA = 4;

/** A name as it is looked up: case, spacing, and punctuation folded, so "Formal concept analysis" finds formal-concept-analysis. */
export function nameKey(name) {
  return String(name).trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "");
}

function strings(value) {
  return typeof value === "string" ? (value.trim() ? [value.trim()] : []) : Array.isArray(value) ? value.flatMap(strings) : [];
}

/** The names a document answers to: its declared title/name/id, aliases, and file stem. */
function namesOf(record) {
  const frontmatter = record.frontmatter ?? {};
  const rows = [];
  for (const key of ["title", "name", "id"]) for (const name of strings(frontmatter[key])) rows.push([name, key]);
  for (const name of strings(frontmatter.aliases ?? frontmatter.alias)) rows.push([name, "alias"]);
  rows.push([basename(record.path, extname(record.path)), "stem"]);
  const seen = new Set();
  return rows.filter(([name]) => { const key = nameKey(name); if (seen.has(key)) return false; seen.add(key); return true; });
}

/** A document's body cut at its headings: one searchable section per heading, plus the lead before the first. */
function sectionsOf(record, body) {
  const lines = body.split("\n");
  const offset = record.structure?.bodyStartLine ?? 1;
  const cuts = (record.headings ?? []).map((heading) => ({ line: heading.line, title: heading.path?.join(" › ") ?? heading.title }));
  const sections = [];
  let start = 0, title = "", line = offset;
  for (const cut of cuts) {
    const at = cut.line - offset;
    if (at < 0 || at > lines.length) continue;
    const text = lines.slice(start, at).join("\n").trim();
    if (text || title) sections.push({ title, line, body: text });
    start = at + 1; title = cut.title; line = cut.line;
  }
  const text = lines.slice(start).join("\n").trim();
  if (text || title) sections.push({ title, line, body: text });
  return sections;
}

/** An FTS5 query from free text: every word a prefix term, quoted phrases kept, operators passed through. */
export function ftsQuery(text) {
  const parts = [];
  for (const match of text.matchAll(/"([^"]+)"|(\S+)/gu)) {
    if (match[1]) { parts.push(`"${match[1].replace(/"/gu, "")}"`); continue; }
    const word = match[2];
    if (/^(AND|OR|NOT)$/u.test(word)) { parts.push(word); continue; }
    const clean = word.replace(/[^\p{L}\p{N}_-]/gu, "");
    for (const piece of clean.split(/[-_]+/u).filter(Boolean)) parts.push(`"${piece}"*`);
  }
  return parts.join(" ");
}

/**
 * CAIRN's persistent catalogue: the vault's own document observations, kept in SQLite beside
 * a full-text index of their sections, the names they answer to, and MinHash bands of their
 * text. The vault stays authoritative; a stored observation is reused only while the file's
 * signature is unchanged, so deleting the file loses nothing but warm-start time.
 */
export function openCairnIndex({ file } = {}) {
  if (typeof file !== "string" || file === "") throw new TypeError("file is required");
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
  const version = db.prepare("PRAGMA user_version").get().user_version;
  if (version !== SCHEMA) {
    db.exec(`DROP TABLE IF EXISTS fts; DROP TABLE IF EXISTS sections; DROP TABLE IF EXISTS names;
      DROP TABLE IF EXISTS bands; DROP TABLE IF EXISTS signatures; DROP TABLE IF EXISTS evidence;
      DROP TABLE IF EXISTS cells; DROP TABLE IF EXISTS documents;`);
    db.exec(`
      CREATE TABLE documents(path TEXT PRIMARY KEY, revision TEXT, signature TEXT, title TEXT, body TEXT, record TEXT NOT NULL);
      CREATE TABLE sections(id INTEGER PRIMARY KEY, path TEXT NOT NULL REFERENCES documents(path) ON DELETE CASCADE,
        title TEXT, heading TEXT, line INTEGER, body TEXT);
      CREATE INDEX section_path ON sections(path);
      CREATE VIRTUAL TABLE fts USING fts5(title, heading, body, content='sections', content_rowid='id',
        tokenize='unicode61 remove_diacritics 2');
      CREATE TRIGGER sections_ai AFTER INSERT ON sections BEGIN
        INSERT INTO fts(rowid, title, heading, body) VALUES (new.id, new.title, new.heading, new.body); END;
      CREATE TRIGGER sections_ad AFTER DELETE ON sections BEGIN
        INSERT INTO fts(fts, rowid, title, heading, body) VALUES ('delete', old.id, old.title, old.heading, old.body); END;
      CREATE TABLE names(path TEXT NOT NULL REFERENCES documents(path) ON DELETE CASCADE, name TEXT NOT NULL, key TEXT NOT NULL, kind TEXT);
      CREATE INDEX name_key ON names(key);
      CREATE TABLE signatures(path TEXT PRIMARY KEY REFERENCES documents(path) ON DELETE CASCADE, signature BLOB NOT NULL);
      CREATE TABLE bands(band TEXT NOT NULL, path TEXT NOT NULL REFERENCES documents(path) ON DELETE CASCADE);
      CREATE INDEX band_key ON bands(band);
      CREATE TABLE cells(address TEXT PRIMARY KEY, subject TEXT NOT NULL, predicate TEXT NOT NULL, object TEXT NOT NULL);
      CREATE INDEX cell_subject ON cells(subject);
      CREATE INDEX cell_predicate ON cells(predicate);
      CREATE INDEX cell_object ON cells(object);
      CREATE TABLE evidence(address TEXT NOT NULL, side TEXT NOT NULL, path TEXT NOT NULL, witness TEXT NOT NULL);
      CREATE INDEX evidence_address ON evidence(address);
      CREATE INDEX evidence_path ON evidence(path);
      CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
      PRAGMA user_version = ${SCHEMA};`);
  }
  const statements = {
    get: db.prepare("SELECT record FROM documents WHERE path = ? AND signature = ?"),
    getAny: db.prepare("SELECT record FROM documents WHERE path = ?"),
    paths: db.prepare("SELECT path FROM documents"),
    drop: db.prepare("DELETE FROM documents WHERE path = ?"),
    touch: db.prepare("UPDATE documents SET signature = ?, record = ? WHERE path = ?"),
    putDocument: db.prepare("INSERT INTO documents(path, revision, signature, title, body, record) VALUES (?, ?, ?, ?, ?, ?)"),
    bodies: db.prepare("SELECT path, body FROM documents"),
    allNames: db.prepare("SELECT key, path FROM names"),
    putCell: db.prepare("INSERT OR IGNORE INTO cells(address, subject, predicate, object) VALUES (?, ?, ?, ?)"),
    putEvidence: db.prepare("INSERT INTO evidence(address, side, path, witness) VALUES (?, ?, ?, ?)"),
    dropEvidence: db.prepare("DELETE FROM evidence WHERE path = ?"),
    getMeta: db.prepare("SELECT value FROM meta WHERE key = ?"),
    setMeta: db.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
    cellsWhere: Object.fromEntries(["subject", "predicate", "object"].map((role) => [role, db.prepare(`SELECT c.address, c.subject, c.predicate, c.object, e.side, e.path, e.witness FROM cells c JOIN evidence e ON e.address = c.address WHERE c.${role} = ? ORDER BY c.address LIMIT ?`)])),
    predicateReach: db.prepare(`SELECT predicate, count(*) AS cells, sum(object LIKE '{"term"%') AS termObjects FROM cells WHERE address IN (SELECT address FROM evidence) GROUP BY predicate`),
    cellsOfPath: db.prepare("SELECT c.address, c.subject, c.predicate, c.object, e.side, e.path, e.witness FROM evidence e JOIN cells c ON c.address = e.address WHERE e.path = ? ORDER BY c.address"),
    putSection: db.prepare("INSERT INTO sections(path, title, heading, line, body) VALUES (?, ?, ?, ?, ?)"),
    putName: db.prepare("INSERT INTO names(path, name, key, kind) VALUES (?, ?, ?, ?)"),
    putSignature: db.prepare("INSERT INTO signatures(path, signature) VALUES (?, ?)"),
    putBand: db.prepare("INSERT INTO bands(band, path) VALUES (?, ?)"),
    signature: db.prepare("SELECT signature FROM signatures WHERE path = ?"),
    bandsOf: db.prepare("SELECT band FROM bands WHERE path = ?"),
    sharing: db.prepare("SELECT path, count(*) AS shared FROM bands WHERE band IN (SELECT band FROM bands WHERE path = ?) AND path <> ? GROUP BY path"),
    named: db.prepare("SELECT n.path, n.name, n.kind, d.title FROM names n JOIN documents d ON d.path = n.path WHERE n.key = ? ORDER BY n.path"),
    namePrefix: db.prepare("SELECT n.path, n.name, n.kind, d.title FROM names n JOIN documents d ON d.path = n.path WHERE n.key >= ? AND n.key < ? ORDER BY length(n.key), n.path LIMIT ?"),
    search: db.prepare(`SELECT s.path, s.heading, s.line, d.title, bm25(fts, 8.0, 4.0, 1.0) AS score,
        snippet(fts, 2, '«', '»', '…', 24) AS snippet
      FROM fts JOIN sections s ON s.id = fts.rowid JOIN documents d ON d.path = s.path
      WHERE fts MATCH ? ORDER BY score LIMIT ?`),
    mentions: db.prepare(`SELECT s.path, s.heading, s.line, d.title, snippet(fts, 2, '«', '»', '…', 16) AS snippet
      FROM fts JOIN sections s ON s.id = fts.rowid JOIN documents d ON d.path = s.path
      WHERE fts MATCH ? AND s.path <> ? ORDER BY bm25(fts) LIMIT ?`),
  };
  let depth = 0;
  function transaction(work) {
    if (depth > 0) return work();
    depth += 1; db.exec("BEGIN");
    try { const result = work(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
    finally { depth -= 1; }
  }
  const revive = (row) => row ? JSON.parse(row.record) : null;

  return Object.freeze({
    file,
    transaction,
    /** The stored observation of `path` while its file signature is still `signature`, else null. */
    load(path, signature) { return revive(signature === undefined ? statements.getAny.get(path) : statements.get.get(path, signature)); },
    paths() { return statements.paths.all().map((row) => row.path); },
    /** Store an observation already stored under another signature (same revision, touched file). */
    touch(record) { statements.touch.run(record.signature, JSON.stringify(record), record.path); },
    /** Open (`begin`) and close (`commit`) one transaction around many puts, as a cold build does. */
    begin() { if (depth === 0) db.exec("BEGIN"); depth += 1; },
    commit() { depth -= 1; if (depth === 0) db.exec("COMMIT"); },
    /** Store an observation and index its body. */
    put(record, body) {
      transaction(() => {
        statements.drop.run(record.path);
        const title = strings(record.frontmatter?.title ?? record.frontmatter?.name)[0] ?? record.headings?.[0]?.title ?? basename(record.path, extname(record.path));
        statements.putDocument.run(record.path, record.revision, record.signature ?? null, title, typeof body === "string" ? markdownBodyIdentity(body).digest : null, JSON.stringify(record));
        if (typeof body === "string") {
          for (const section of sectionsOf(record, body)) statements.putSection.run(record.path, title, section.title, section.line, section.body);
          const signature = markdownShingleSignature(body);
          if (signature) {
            statements.putSignature.run(record.path, new Uint8Array(signature.buffer));
            for (const band of markdownSignatureBands(signature)) statements.putBand.run(band, record.path);
          }
        }
        for (const [name, kind] of namesOf(record)) statements.putName.run(record.path, name, nameKey(name), kind);
      });
    },
    drop(path) { statements.drop.run(path); statements.dropEvidence.run(path); },
    /** Each document's body digest: the witness it is when it states anything. */
    bodies() { return new Map(statements.bodies.all().map((row) => [row.path, row.body])); },
    /** Every name key with the paths answering to it. */
    nameTable() {
      const table = new Map();
      for (const { key, path } of statements.allNames.iterate()) { const paths = table.get(key); if (paths) paths.push(path); else table.set(key, [path]); }
      return table;
    },
    meta(key, value) { if (value === undefined) return statements.getMeta.get(key)?.value ?? null; statements.setMeta.run(key, String(value)); return value; },
    /** Replace the cells one document states: its evidence rows go, then each statement's cell is told for by its witness. */
    stateCells(path, cells, witness) {
      transaction(() => {
        statements.dropEvidence.run(path);
        for (const cell of cells) {
          statements.putCell.run(cell.address, cell.subject, cell.predicate, cell.object);
          statements.putEvidence.run(cell.address, cell.side ?? "for", path, witness);
        }
      });
    },
    /** Forget every cell and its evidence (before a full re-derivation). */
    clearCells() { db.exec("DELETE FROM evidence; DELETE FROM cells;"); },
    /** Evidence rows of the cells where a term or mark (canonical text) stands in `role`. */
    cellRows(role, text, { limit = 5000 } = {}) { return statements.cellsWhere[role].all(text, limit).map((row) => ({ ...row })); },
    /** For each predicate: how many cells it makes and how many of their objects are terms. */
    predicateReach() { return statements.predicateReach.all().map((row) => ({ ...row })); },
    /** Evidence rows of the cells one document states. */
    cellRowsOfPath(path) { return statements.cellsOfPath.all(path).map((row) => ({ ...row })); },
    /** Ranked sections matching free text (words are prefixes; "quoted phrases"; AND/OR/NOT). */
    search(query, { limit = 50 } = {}) {
      const match = ftsQuery(query);
      if (!match) return [];
      return statements.search.all(match, limit).map((row) => ({ ...row }));
    },
    /** Documents answering to `name` exactly (case-insensitive), or whose names start with it. */
    names(name, { prefix = false, limit = 50 } = {}) {
      const key = nameKey(name);
      if (!key) return [];
      if (!prefix) return statements.named.all(key).map((row) => ({ ...row }));
      return statements.namePrefix.all(key, `${key}￿`, limit).map((row) => ({ ...row }));
    },
    /** Sections outside `path` that say one of its names without necessarily linking it. */
    mentions(path, names, { limit = 50 } = {}) {
      const match = names.filter((name) => name.length >= 3).map((name) => `"${name.replace(/"/gu, "")}"`).join(" OR ");
      if (!match) return [];
      return statements.mentions.all(match, path, limit).map((row) => ({ ...row }));
    },
    /** The estimated overlap of two documents' texts, or null when either has no signature. */
    overlap(left, right) {
      const a = statements.signature.get(left), b = statements.signature.get(right);
      if (!a || !b) return null;
      return estimateShingleOverlap(new Uint32Array(new Uint8Array(a.signature).buffer), new Uint32Array(new Uint8Array(b.signature).buffer));
    },
    /** Documents whose text overlaps `path`'s, by MinHash estimate, best first. */
    similar(path, { limit = 20, minimum = 0.2 } = {}) {
      const own = statements.signature.get(path);
      if (!own) return [];
      const left = new Uint32Array(new Uint8Array(own.signature).buffer);
      const out = [];
      for (const { path: other } of statements.sharing.all(path, path)) {
        const row = statements.signature.get(other);
        const overlap = estimateShingleOverlap(left, new Uint32Array(new Uint8Array(row.signature).buffer));
        if (overlap >= minimum) out.push({ path: other, overlap });
      }
      return out.sort((a, b) => b.overlap - a.overlap || a.path.localeCompare(b.path)).slice(0, limit);
    },
    /** Every pair of documents whose text overlaps by at least `minimum`, grouped into clusters. */
    clusters({ minimum = 0.5, prefix = "", limit = 200 } = {}) {
      const rows = db.prepare("SELECT band, group_concat(path, char(31)) AS paths FROM bands WHERE path >= ? AND path < ? GROUP BY band HAVING count(*) > 1")
        .all(prefix, `${prefix}￿`);
      const parent = new Map();
      const find = (value) => { while (parent.get(value) !== value) { parent.set(value, parent.get(parent.get(value))); value = parent.get(value); } return value; };
      const signatures = new Map();
      const signatureOf = (path) => {
        if (!signatures.has(path)) signatures.set(path, new Uint32Array(new Uint8Array(statements.signature.get(path).signature).buffer));
        return signatures.get(path);
      };
      const checked = new Set();
      for (const { paths } of rows) {
        const members = paths.split("\u001f");
        if (members.length > 64) continue;
        for (let i = 0; i < members.length; i += 1) for (let j = i + 1; j < members.length; j += 1) {
          const key = members[i] < members[j] ? `${members[i]}\u0000${members[j]}` : `${members[j]}\u0000${members[i]}`;
          if (checked.has(key)) continue;
          checked.add(key);
          if (estimateShingleOverlap(signatureOf(members[i]), signatureOf(members[j])) < minimum) continue;
          for (const member of [members[i], members[j]]) if (!parent.has(member)) parent.set(member, member);
          parent.set(find(members[i]), find(members[j]));
        }
      }
      const groups = new Map();
      for (const member of parent.keys()) groups.set(find(member), [...(groups.get(find(member)) ?? []), member]);
      return [...groups.values()].map((members) => members.sort()).sort((a, b) => b.length - a.length || a[0].localeCompare(b[0])).slice(0, limit);
    },
    close() { db.close(); },
  });
}
