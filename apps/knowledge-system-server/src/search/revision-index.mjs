/**
 * src/search/revision-index - CAIRN's durable archive index: every revision of every document
 * any source has held (a repository's whole history, deleted documents included; other
 * repositories and machines; transcripts), full-text searchable, kept as a reading of a semantic
 * store root (`revision-journal.mjs`) ranked by its own term index (`term-index.mjs`).
 *
 * A body is keyed by its git blob id, so the same text from any source is indexed once and a
 * later pass reads only what is new. Occurrences say where a body stood: source, path, the
 * revision that wrote or deleted it, and when. Historical index custody is refused before native
 * opening; explicit offline receiving owns conversion into a distinct destination.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";
import { gitBlobReader, gitRefTips, gitRevisions } from "@red-cup-engineering/computer-code-development-engine/git/history";
import { gitBlobIdOf } from "@red-cup-engineering/git-services-section/git-object-id";
import { eavtRecord } from "@red-cup-engineering/eavt-services-section/row";
import { claudeCodeSessionChronicleFromJsonl, claudeSessionAuthoredChronicle } from "@red-cup-engineering/feltos/agents/sessions/claude-code/codec";
import { codexSessionAuthoredChronicle, codexSessionChronicleOfContent } from "@red-cup-engineering/feltos/agents/sessions/codex/codec";
import { assertNativeIndexCustody } from "./native-index-custody.mjs";
import { openRevisionJournal, snippetOf } from "./revision-journal.mjs";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const BATCH = 500;

/** The index file a host uses unless it names another; its journal is kept beside it (`<file>.journal`). */
export const defaultRevisionIndexFile = (environment = process.env) =>
  environment.CAIRN_REVISION_INDEX ?? path.join(environment.XDG_STATE_HOME ?? path.join(homedir(), ".local", "state"), "561-group", "cairn", "revisions.sqlite");


function titleOf(text, file) {
  const front = /^---\n([\s\S]*?)\n---/u.exec(text)?.[1];
  const declared = front && /^(?:title|name):\s*["']?(.+?)["']?\s*$/mu.exec(front)?.[1];
  return declared ?? /^#\s+(.+)$/mu.exec(text)?.[1] ?? path.posix.basename(file ?? "");
}

/** What was said in one session transcript, as "role: text" paragraphs, through the harness's own codec. */
export function transcriptText(harness, content) {
  const chronicle = harness === "codex"
    ? codexSessionAuthoredChronicle(codexSessionChronicleOfContent(content))
    : claudeSessionAuthoredChronicle(claudeCodeSessionChronicleFromJsonl({ content }));
  return chronicle.statements.map((row) => {
    const { v, t } = eavtRecord(row);
    return `${v.boundary?.event ?? "said"} (${t}): ${v.material.raw}`;
  }).join("\n\n");
}

function* jsonlFiles(root) {
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) yield* jsonlFiles(full);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) yield full;
  }
}

/** The archive index kept at `file`'s journal (`<file>.journal`, or `root` when named). */
export function openRevisionIndex(file = defaultRevisionIndexFile(), { root = `${file}.journal` } = {}) {
  assertNativeIndexCustody(file);
  const store = openRevisionJournal({ root });

  function admitBody(id, bytes, file) {
    if (store.hasBody(id) || bytes.length > MAX_BODY_BYTES || bytes.includes(0)) return false;
    const text = bytes.toString("utf8");
    return store.admitBody(id, titleOf(text, file), bytes.length, text);
  }

  const index = Object.freeze({
    file,
    root: store.root,
    /** Read one repository's history since its last pass, as `source`. */
    async ingestGit(repository, { source = repository, pathspecs = ["*.md"], onProgress } = {}) {
      const reader = gitBlobReader(repository);
      const tips = await gitRefTips(repository);
      const exclude = [];
      for (const tip of store.cursorOf(source)) if (await reader.read(tip) !== undefined) exclude.push(tip);
      let revisions = 0, bodies = 0;
      try {
        for await (const revision of gitRevisions(repository, { pathspecs, exclude })) {
          store.occur(revision.blob, source, revision.path, revision.commit, revision.at, revision.deleted);
          if (!revision.deleted && !store.hasBody(revision.blob)) {
            const bytes = await reader.read(revision.blob);
            if (bytes !== undefined && admitBody(revision.blob, bytes, revision.path)) bodies += 1;
          }
          if (++revisions % BATCH === 0) { store.flush(); onProgress?.({ source, revisions, bodies }); }
        }
        store.setCursor(source, tips);
        store.flush();
      } catch (error) {
        store.discard();
        throw error;
      } finally {
        await reader.close();
      }
      return Object.freeze({ source, revisions, bodies });
    },
    /** Admit documents that live outside git (transcripts, exports), each `{ source, path, revision, at, text }`. */
    admitDocuments(documents) {
      let bodies = 0;
      try {
        for (const document of documents) {
          const bytes = Buffer.from(document.text, "utf8");
          const id = gitBlobIdOf(bytes);
          store.occur(id, document.source, document.path, document.revision ?? id, document.at ?? null, false);
          if (admitBody(id, bytes, document.path)) bodies += 1;
        }
        store.flush();
      } catch (error) {
        store.discard();
        throw error;
      }
      return Object.freeze({ bodies });
    },
    /** Admit every session transcript under a root not yet read at its current size, as `source`. */
    admitTranscripts(root, { harness, source = `${harness}:${root}` }) {
      let sessions = 0, bodies = 0;
      for (const file of jsonlFiles(root)) {
        const { size, mtime } = statSync(file);
        const relative = path.relative(root, file), revision = `size:${size}`;
        if (store.seen(source, relative, revision)) continue;
        let text;
        try { text = transcriptText(harness, readFileSync(file, "utf8")); } catch { continue; }
        if (text.length === 0) continue;
        bodies += index.admitDocuments([{ source, path: relative, revision, at: mtime.toISOString(), text }]).bodies;
        sessions += 1;
      }
      return Object.freeze({ source, sessions, bodies });
    },
    /**
     * The best-matching bodies for a query, each with where it stood and whether it was deleted
     * there. Words match folded (case and diacritics away); a word the tokenizer would split
     * ("ActivityPub++", "x402-v2") must also appear verbatim. `raw` takes the query as an FTS5
     * expression (words, prefix*, "phrases", AND, OR, NOT, parentheses; other FTS5 syntax is
     * refused). `score` is BM25 as FTS5 gave it: lower is better.
     */
    search(query, { limit = 20, raw = false } = {}) {
      const wanted = Math.min(Math.max(1, limit), 200);
      const verbatim = raw ? [] : query.split(/\s+/u).filter((word) => /[^\p{L}\p{N}]/u.test(word)).map((word) => word.replace(/^"|"$/gu, "")).filter(Boolean);
      // One hit per document: its revisions share a title and a latest file name.
      const documents = new Map();
      for (const hit of raw ? store.match(query, { limit: wanted * 10 }) : store.search(query, { limit: wanted * 10 })) {
        if (verbatim.length > 0) {
          const text = store.textOf(hit.key);
          if (!verbatim.every((word) => text.includes(word))) continue;
        }
        const title = store.title(hit.key), occurrences = store.occurrencesOf(hit.key);
        const key = `${title}\u0000${path.posix.basename(occurrences[0]?.path ?? hit.key)}`;
        const known = documents.get(key);
        if (known === undefined) documents.set(key, { id: hit.key, title, score: -hit.score, revisions: 1, occurrences });
        else known.revisions += 1;
        if (documents.size === wanted && known === undefined) break;
      }
      return Object.freeze([...documents.values()].slice(0, wanted).map(({ id, title, score, revisions, occurrences }) =>
        Object.freeze({ id, title, score, snippet: snippetOf(store.textOf(id), raw ? query.replace(/\b(?:AND|OR|NOT)\b|[*"()]/gu, " ") : query), revisions, occurrences })));
    },
    /** One body's text and occurrences. */
    read(id) {
      const title = store.title(id);
      return title === undefined ? undefined : Object.freeze({ id, title, text: store.textOf(id), occurrences: store.occurrencesOf(id) });
    },
    /** How much the index holds, per source. */
    summary() {
      return Object.freeze({ file, root: store.root, bodies: store.size, sources: store.sources() });
    },
    close: () => {},
  });
  return index;
}

/** The index's verbs for the one node's catalog: archive-search, archive-read, archive-summary, archive-ingest-git, archive-ingest-transcripts. */
export function revisionIndexOperations(binding = {}) {
  let opened;
  const index = () => (opened ??= openRevisionIndex(binding.revisionIndexFile ?? defaultRevisionIndexFile()));
  const record = (input) => (input !== null && typeof input === "object" && !Array.isArray(input) ? input : {});
  return Object.freeze([
    operation({
      verb: "archive-search", inputFormat: "json", outputFormat: "json",
      summary: "Search every revision of every document the archive has held, deleted ones included.",
      description: "Domain: { query, limit?, raw? }. Words match folded, and a word holding punctuation must also appear verbatim; raw takes an FTS5 expression (words, prefix*, phrases, AND, OR, NOT, parentheses).",
      run: (input) => index().search(String(record(input).query ?? ""), { limit: record(input).limit, raw: record(input).raw === true }),
    }),
    operation({
      verb: "archive-read", inputFormat: "json", outputFormat: "json",
      summary: "Read one archived body by its blob id, with every place it stood.",
      description: "Domain: { id }.",
      run: (input) => index().read(String(record(input).id ?? "")) ?? null,
    }),
    operation({
      verb: "archive-summary", inputFormat: "json", outputFormat: "json",
      summary: "How many bodies the archive index holds, per source.",
      description: "Domain: {}.",
      run: () => index().summary(),
    }),
    operation({
      verb: "archive-ingest-git", inputFormat: "json", outputFormat: "json",
      summary: "Read a repository's history into the archive index since its last pass.",
      description: "Domain: { repository, source?, pathspecs? }.",
      run: (input) => index().ingestGit(String(record(input).repository ?? binding.dataRoot), {
        ...(typeof record(input).source === "string" ? { source: record(input).source } : {}),
        ...(Array.isArray(record(input).pathspecs) ? { pathspecs: record(input).pathspecs } : {}),
      }),
    }),
    operation({
      verb: "archive-ingest-transcripts", inputFormat: "json", outputFormat: "json",
      summary: "Read what was said in every agent session transcript under a root into the archive index.",
      description: "Domain: { root, harness: \"codex\" | \"claude\", source? }.",
      run: (input) => index().admitTranscripts(String(record(input).root ?? ""), {
        harness: record(input).harness === "codex" ? "codex" : "claude",
        ...(typeof record(input).source === "string" ? { source: record(input).source } : {}),
      }),
    }),
  ]);
}
