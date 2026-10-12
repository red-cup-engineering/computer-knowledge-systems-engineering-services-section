import { evaluateSparql, triplesToTurtle } from "@red-cup-engineering/computer-triplet-serialized-content-engineering-services-section/sparql-over-eavt";
import { askEavtCell } from "@red-cup-engineering/eavt-services-section/ask-eavt-cell";
import { queryTripleFragment } from "@red-cup-engineering/http-services-section/triple-pattern-fragments";
import { tm } from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation";
import { compareReadings, generatedConcepts, relationalPredicates, settledness, witnessing } from "@red-cup-engineering/signgraph/mesh";
import { readDivergences, readFiber, readKeyAffinities } from "@red-cup-engineering/markdown-engineering-services-section/vault/fibration";
import { localeOf, nameKey, openMarkdownVault } from "./markdown-vault.mjs";

/**
 * CAIRN's archive: one Markdown vault (read, navigated, revised) and what its documents say,
 * read as its tellings -- relations by pattern, SPARQL, cells about a mark, one name's readings,
 * a locale's generated concepts, passages and questions, and the frontmatter fibration. Every
 * interface (the HTTP API, MCP, GEODE, VaultMaze) reads the archive through this one object.
 */
export async function openArchive(options = {}) {
  const vault = await openMarkdownVault(options);
  // The tellings as plain EAVT rows (the marks' surfaces), for SPARQL and cell questions.
  let eavt = null, eavtLog = null;
  async function eavtRows() {
    const log = await vault.tellings();
    if (eavtLog !== log) { eavt = log.rows.map((row) => Object.freeze({ e: row.subject[1], a: row.predicate[1], v: row.object[1], t: row.witness })); eavtLog = log; }
    return eavt;
  }
  const documents = async () => (await vault.completeSnapshot({ relations: false })).documents;
  const archive = Object.freeze({
    type: "CairnArchive",
    get snapshot() { return vault.snapshot; },
    get paths() { return vault.paths; },
    get version() { return vault.version; },
    admit: vault.admit, read: vault.read, browse: vault.browse, search: vault.search, names: vault.names,
    relations: vault.relations, resolveLink: vault.resolveLink, refresh: vault.refresh, completeSnapshot: vault.completeSnapshot,
    mentions: vault.mentions, similar: vault.similar, overlap: vault.overlap, clusters: vault.clusters,
    tellings: vault.tellings, passages: vault.passages, questions: vault.questions,
    replace: vault.replace, create: vault.create, edit: vault.edit, setProperties: vault.setProperties, move: vault.move, merge: vault.merge,
    /** The tellings matching a pattern of subject, predicate, and object surfaces (any omitted), in order. */
    async relationsWhere({ subject, predicate, object, limit = 100 } = {}) {
      const pattern = Object.fromEntries(Object.entries({ subject, predicate, object }).filter(([, value]) => value !== undefined).map(([role, value]) => [role, tm.mark(value)]));
      const rows = (await vault.tellings()).where(pattern);
      return Object.freeze({ total: rows.length, truncated: rows.length > limit,
        relations: Object.freeze(rows.slice(0, limit).map((row) => Object.freeze({ subject: row.subject[1], predicate: row.predicate[1], object: row.object[1], witness: row.witness }))) });
    },
    /** One Triple Pattern Fragments page of the tellings matching `s`, `p`, `o` (any omitted). */
    async fragment({ s, p, o, page, limit, base, path } = {}) {
      const pattern = Object.fromEntries(Object.entries({ s, p, o }).filter(([, value]) => value !== undefined && value !== ""));
      const where = Object.fromEntries(Object.entries({ subject: pattern.s, predicate: pattern.p, object: pattern.o }).filter(([, value]) => value !== undefined).map(([role, value]) => [role, tm.mark(value)]));
      const triples = (await vault.tellings()).where(where).map((row) => ({ s: row.subject[1], p: row.predicate[1], o: row.object[1] }));
      return queryTripleFragment(triples, pattern, { ...(base ? { base } : {}), ...(path ? { path } : {}), ...(page === undefined ? {} : { page }), ...(limit === undefined ? {} : { limit }) });
    },
    /** A structured SPARQL query over the tellings as EAVT rows. */
    async sparql(query, { limit = 100 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new RangeError("SPARQL result limit must be from 1 through 500");
      const reading = evaluateSparql(await eavtRows(), query);
      const bindings = Object.freeze(reading.bindings.slice(0, limit)), triples = Object.freeze(reading.triples.slice(0, limit));
      return Object.freeze({ ...reading, bindings, triples, turtle: triplesToTurtle(triples), totalBindings: reading.bindings.length, totalTriples: reading.triples.length,
        truncated: reading.bindings.length > limit || reading.triples.length > limit });
    },
    /** The EAVT cell reading of one document's tellings, optionally one attribute. */
    async cell({ entity, attribute } = {}) {
      const rows = (await eavtRows()).filter((row) => row.e === entity);
      return askEavtCell({ rows, entity, ...(attribute ? { attribute } : {}) });
    },
    /** How much the archive says: documents, tellings, passages, questions. */
    async summary() {
      const log = await vault.tellings();
      return Object.freeze({ type: "CairnArchiveSummary", documents: vault.paths.length, tellings: log.size,
        passages: (await vault.passages()).length, questions: (await vault.questions({ limit: Number.MAX_SAFE_INTEGER })).length });
    },
    /** The cells one document states, with their census. */
    async statements(path) {
      vault.admit(path);
      const cells = (await vault.tellings()).cells({ subject: tm.mark(path) });
      return Object.freeze({ type: "CairnStatements", path, settledness: settledness(cells), cells });
    },
    /**
     * The tellings where a mark stands in a role, gathered into cells: what is said of it
     * (subject), what is said through it (predicate), or who says something of it (object). The
     * mark is a document \`path\`, a \`name\` (each document answering to it, and the bare name), or a bare \`mark\`.
     */
    async cellsAbout({ path, name, mark, role = "subject", limit = 500 } = {}) {
      const log = await vault.tellings();
      const surfaces = path ? [path] : mark !== undefined ? [mark] : [...new Set([...(await vault.names(name)).map((row) => row.path), name])];
      return Object.freeze({ type: "CairnCells", groups: Object.freeze(surfaces.map((surface) => {
        const cells = log.cells({ [role]: tm.mark(surface) }).slice(0, limit);
        return Object.freeze({ mark: surface, role, settledness: settledness(cells), witnessing: witnessing(cells), cells });
      })) });
    },
    /** One name's readings: the documents answering to it, each with what it says, every pair compared on the mesh. */
    async readings(name) {
      const log = await vault.tellings();
      const paths = [...new Set((await vault.names(name)).map((row) => row.path))];
      const readings = paths.map((path) => ({ key: path, locale: localeOf(path), cells: log.cells({ subject: tm.mark(path) }) }));
      const overlaps = new Map();
      for (let i = 0; i < paths.length; i += 1) for (let j = i + 1; j < paths.length; j += 1) overlaps.set(`${paths[i]}\u0000${paths[j]}`, await vault.overlap(paths[i], paths[j]));
      return Object.freeze({ type: "CairnTermReadings", name,
        ...compareReadings({ readings, overlap: (x, y) => overlaps.get(`${x}\u0000${y}`) ?? overlaps.get(`${y}\u0000${x}`) ?? null }) });
    },
    /**
     * The concepts the glossary documents filed in one locale generate on the mesh, read through
     * the predicates whose values there mostly name documents: aliases and broader terms.
     */
    async termConcepts({ locale, minimumClaims = 2 } = {}) {
      const log = await vault.tellings();
      const subjects = (await documents()).filter((document) => document.path.includes("/glossary/") && localeOf(document.path) === locale)
        .map((document) => ({ key: document.path, cells: log.cells({ subject: tm.mark(document.path) }) }));
      const admitted = new Set(vault.paths);
      const reach = new Map();
      for (const { cells } of subjects) for (const cell of cells) {
        const key = JSON.stringify(cell.predicate), row = reach.get(key) ?? { predicate: key, cells: 0, termObjects: 0 };
        row.cells += 1;
        if (admitted.has(cell.object[1]) || (await vault.names(cell.object[1])).length > 0) row.termObjects += 1;
        reach.set(key, row);
      }
      return Object.freeze({ type: "CairnTermConcepts", locale, ...generatedConcepts({ subjects, predicates: relationalPredicates([...reach.values()]), minimumClaims }) });
    },
    /**
     * What the archive knows of one topic and what it lacks: the glossary documents that are its
     * homes and the other documents answering to its name, the documents whose tellings point
     * at it and those that only mention it in their text, its neighbourhood by type and keyword
     * (the documents around it, as a concept map), whether the archive asks it as an unanswered
     * question, and the gaps all of this shows -- no home, several homes (one locale: aliases;
     * several: registers), copies among its readings, unlinked mentions -- with a filing path
     * for a home when it has none.
     */
    async topic(name, { locale, limit = 25 } = {}) {
      const key = nameKey(name);
      if (!key) throw new TypeError("name must name something");
      const log = await vault.tellings();
      const answering = await vault.names(name, { limit: 200 });
      const homes = answering.filter((row) => row.path.includes("/glossary/"));
      const namesakes = answering.filter((row) => !row.path.includes("/glossary/"));
      const surfaces = new Set([name, ...answering.map((row) => row.path), ...answering.map((row) => row.name)]);
      const pointing = new Map();
      for (const surface of surfaces) for (const row of log.where({ object: tm.mark(surface) })) {
        const source = row.subject[1];
        if (answering.some((home) => home.path === source)) continue;
        pointing.set(source, [...new Set([...(pointing.get(source) ?? []), row.predicate[1]])]);
      }
      const answeringPaths = new Set(answering.map((row) => row.path));
      const mentioning = (await vault.search(name, { mode: "text", limit: 200 })).map((hit) => hit.path).filter((path) => !answeringPaths.has(path));
      const unlinked = mentioning.filter((path) => !pointing.has(path));
      const around = [...new Set([...answeringPaths, ...pointing.keys(), ...mentioning])];
      const byPath = new Map((await documents()).map((document) => [document.path, document]));
      const tally = (values) => [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map())]
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, limit).map(([value, count]) => ({ value, count }));
      const neighbourhood = {
        documents: around.length,
        byType: tally(around.map((path) => byPath.get(path)?.properties?.type ?? "untyped")),
        byKeyword: tally(around.flatMap((path) => byPath.get(path)?.keywords ?? [])),
        byLocale: tally(around.map((path) => localeOf(path))),
      };
      const readings = answering.length > 1 ? await archive.readings(name) : null;
      const question = (await vault.questions({ limit: Number.MAX_SAFE_INTEGER })).find((row) => nameKey(row.term) === key) ?? null;
      const gaps = [];
      if (homes.length === 0) gaps.push({ gap: "no-home", reason: "no glossary document answers to this name" });
      if (homes.length > 1) {
        const locales = new Set(homes.map((home) => localeOf(home.path)));
        gaps.push({ gap: "several-homes", reason: locales.size < homes.length ? "several glossary documents in one locale answer to it: aliases to merge or tell apart" : "glossary documents in several locales answer to it: one word in several registers, or one concept filed twice", homes: homes.map((home) => home.path) });
      }
      const copies = readings?.pairs.filter((pair) => pair.verdict === "copies") ?? [];
      if (copies.length > 0) gaps.push({ gap: "copies", reason: "readings whose texts overlap: one thing filed more than once", pairs: copies.map((pair) => [pair.left, pair.right]) });
      if (unlinked.length > 0) gaps.push({ gap: "unlinked-mentions", reason: "documents say it without linking a home", documents: unlinked.slice(0, limit) });
      if (question) gaps.push({ gap: "asked", reason: "documents use it as a term and nothing answers", documents: question.documents.slice(0, limit) });
      const homeLocale = locale ?? neighbourhood.byLocale[0]?.value;
      return Object.freeze({
        type: "CairnTopic", name, key,
        homes: homes.map((home) => ({ path: home.path, title: home.title, locale: localeOf(home.path) })),
        namesakes: namesakes.map((row) => ({ path: row.path, title: row.title, kind: row.kind })),
        pointing: [...pointing].slice(0, limit).map(([path, through]) => ({ path, through })),
        pointingCount: pointing.size,
        mentioning: mentioning.slice(0, limit), mentioningCount: mentioning.length,
        neighbourhood, question, gaps,
        suggestedHome: homes.length === 0 && homeLocale ? `${homeLocale}/content/text/glossary/terms/${key}.md` : null,
      });
    },
    /** The values one frontmatter key takes within a locale. */
    async fiber(options) { return readFiber({ documents: await documents(), ...options }); },
    /** Where a locale diverges from its own frontmatter practice. */
    async divergences(options) { return readDivergences({ documents: await documents(), ...options }); },
    /** Frontmatter keys whose values coincide within a locale. */
    async keyAffinities(options) { return readKeyAffinities({ documents: await documents(), ...options }); },
  });
  return archive;
}
