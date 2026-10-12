// VaultMaze served live over a vault, the way a reader opens notes: the world (rooms, doors,
// halls, layout, the anonymous surface) is read once from the vault's files, the note bodies are
// dropped, and a room's record is rendered from its own file when someone opens it. Nothing is
// built ahead: the same release a VICTOR build writes (./projector.mjs) is answered route by
// route, and the browser application reads it unchanged.
//
// Reading the whole vault to derive the world takes several times the memory the world keeps, so
// the scan and the derivation run in a child process that returns only the compressed release and
// each room's metadata (nothing, when the release it would return is the one already served), and
// exits, handing its memory back; the server keeps what it answers with. The child is the first
// process the kernel ends under memory pressure: it is the one whose work is cheapest to redo.
//
// What it derives is cached under the code that derived it, never under where the vault sits: a
// release moves the same notes to a new directory, and its server reuses every parse its code still
// produces. A parse is kept per reader (the module graph that parses a note) and per note content;
// the release per the whole runtime's module graph, its notes and its settings.

import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { dirname, relative, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { deserialize, serialize } from 'node:v8';
import { gunzipSync, gzipSync } from 'node:zlib';
import { moduleClosureDigest } from '@red-cup-engineering/javascript-node-services-section/module-closure';
import { ADAPTERS, readVaultRooms, vaultRoomFiles } from '@red-cup-engineering/markdown-engineering-services-section/vault-dialect/vault-rooms';
import { createVaultRoomRenderer } from '@red-cup-engineering/web-page-tiling-engine/publication';
import { generateCardsForRoom } from '@red-cup-engineering/education-platform-service/cards';
import { roomTitleLookup } from '@red-cup-engineering/education-platform-service/compile';
import { textRepr } from '@red-cup-engineering/http-services-section/representation';
import { normalizeVaultMazeProjection, roomDocument, vaultMazeRelease } from './projector.mjs';

const TYPES = new Map([
  ['.json', 'application/json; charset=utf-8'],
  ['.jsonld', 'application/ld+json; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.xml', 'application/rss+xml; charset=utf-8'],
  ['.atom', 'application/atom+xml; charset=utf-8'],
]);
const typeOf = (path) => TYPES.get(path.slice(path.lastIndexOf('.'))) ?? 'application/octet-stream';
const ROOM = /^\/vault\/(public\/)?rooms\/([0-9a-f]{64})\.json$/u;
const CACHE_VERSION = 3;
const VAULT_ROOMS = '@red-cup-engineering/markdown-engineering-services-section/vault-dialect/vault-rooms';

let codeIdentities;
/** The code that reads a note (`reader`) and the code that derives and serves the release (`runtime`). */
export const vaultMazeCode = () => codeIdentities ??= Object.freeze({
  reader: moduleClosureDigest([import.meta.resolve(VAULT_ROOMS)]).digest,
  runtime: moduleClosureDigest([import.meta.url]).digest,
});

const vaultConfig = (catalog) => ({ id: catalog.wing ?? 'vault', ...(catalog.attributeFields ? { attributeFields: catalog.attributeFields } : {}) });
const readRooms = (root, catalog) => readVaultRooms(root, vaultConfig(catalog), { ...(catalog.source ? { dialect: catalog.source } : {}), excludeGlobs: catalog.exclude ?? [] });

const digest = (value) => createHash('sha256').update(value).digest('hex');
const statRecord = (file) => {
  const stat = statSync(file, { bigint: true });
  return { size: String(stat.size), mtimeNs: String(stat.mtimeNs), ctimeNs: String(stat.ctimeNs) };
};
const sameStat = (left, right) => left !== undefined && right !== undefined
  && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;

function scanSources(root, catalog, previous = {}) {
  const { files } = vaultRoomFiles(root, { ...(catalog.source ? { dialect: catalog.source } : {}), excludeGlobs: catalog.exclude ?? [] });
  const scanned = [];
  for (const file of [...files].sort()) {
    const path = relative(root, file);
    const stat = statRecord(file);
    const contentHash = sameStat(previous[path]?.stat, stat)
      ? previous[path].contentHash
      : digest(readFileSync(file));
    scanned.push({ path, stat, contentHash });
  }
  return scanned;
}

function readVersioned(file) {
  try {
    const entry = deserialize(readFileSync(file));
    return entry.version === CACHE_VERSION ? entry : undefined;
  } catch {
    return undefined;
  }
}

function atomicWrite(file, value) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, serialize(value), { mode: 0o600 });
  renameSync(temporary, file);
}

const withoutSourceRevision = (projection) => {
  const { sourceRevision: _sourceRevision, ...derivationProjection } = projection;
  return derivationProjection;
};
const quickInputKey = ({ catalog, site, projection }, sources, code) => digest(JSON.stringify({
  code: code.runtime, catalog, site, projection: normalizeVaultMazeProjection(projection),
  sources: sources.map(({ path, contentHash }) => [path, contentHash]),
}));
const parsedRoot = (cacheDir, code) => join(cacheDir, 'parsed', code.reader);
const tracePath = (cacheDir, code, contentHash, contextHash) => join(parsedRoot(cacheDir, code), contentHash, `${contextHash}.v8`);

// Parses of notes no longer in the vault, and every parse an earlier reader made, are dropped
// (with the location-keyed `files/` tree of cache version 2) while the server answers.
async function pruneParsed(cacheDir, code, sources) {
  const remove = (path) => rm(path, { recursive: true, force: true });
  await remove(join(cacheDir, 'files'));
  const parsed = join(cacheDir, 'parsed');
  for (const reader of await readdir(parsed).catch(() => [])) if (reader !== code.reader) await remove(join(parsed, reader));
  const current = new Set(sources.map((source) => source.contentHash));
  for (const contentHash of await readdir(parsedRoot(cacheDir, code)).catch(() => [])) {
    if (!current.has(contentHash)) await remove(join(parsedRoot(cacheDir, code), contentHash));
  }
}

function readRoomsIncrementally({ root, catalog, cacheDir, sources, code }) {
  const selection = vaultRoomFiles(root, { ...(catalog.source ? { dialect: catalog.source } : {}), excludeGlobs: catalog.exclude ?? [] });
  const adapter = selection.adapter;
  const sourceByPath = new Map(sources.map((source) => [source.path, source]));
  const context = { catalog, dialect: selection.detection.dialect };
  const original = adapter.parseRoom;
  let parsedFiles = 0;
  ADAPTERS[selection.detection.dialect] = {
    ...adapter,
    parseRoom(parseRoot, file, wingId, config) {
      const path = relative(root, file);
      const source = sourceByPath.get(path);
      const contextHash = digest(JSON.stringify({ ...context, path }));
      const fileCache = source === undefined ? undefined : tracePath(cacheDir, code, source.contentHash, contextHash);
      const cached = fileCache === undefined ? undefined : readVersioned(fileCache);
      if (cached?.contentHash === source.contentHash && cached.contextHash === contextHash) {
        if (cached.outcome === 'error') {
          const error = new Error(cached.error.message);
          error.name = cached.error.name;
          throw error;
        }
        return cached.parsed;
      }
      parsedFiles += 1;
      try {
        const parsed = original(parseRoot, file, wingId, config);
        if (fileCache !== undefined && digest(readFileSync(file)) === source.contentHash) {
          atomicWrite(fileCache, { version: CACHE_VERSION, contentHash: source.contentHash, contextHash, outcome: 'parsed', parsed });
        }
        return parsed;
      } catch (error) {
        if (fileCache !== undefined && digest(readFileSync(file)) === source.contentHash) {
          atomicWrite(fileCache, {
            version: CACHE_VERSION, contentHash: source.contentHash, contextHash, outcome: 'error',
            error: { name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : String(error) },
          });
        }
        throw error;
      }
    },
  };
  try {
    return { read: readRooms(root, catalog), parsedFiles };
  } finally {
    ADAPTERS[selection.detection.dialect] = adapter;
  }
}

const assemblyInputKey = ({ read, names, site, projection, code }) => digest(serialize({
  code: code?.runtime ?? null, rooms: read.rooms, doors: read.doors, names, site,
  projection: normalizeVaultMazeProjection(projection),
}));

/** The release of a vault, compressed, with each room's metadata: what the server keeps. */
export async function deriveVaultMazeRelease({ root, catalog, site, projection, cacheDir, sources, cachedAssemblyKey, code = cacheDir === undefined ? undefined : vaultMazeCode() }, { assemble = vaultMazeRelease } = {}) {
  const started = performance.now();
  const increment = cacheDir === undefined
    ? { read: readRooms(root, catalog), parsedFiles: sources?.length ?? 0 }
    : readRoomsIncrementally({ root, catalog, cacheDir, sources, code });
  const { read, parsedFiles } = increment;
  const readAt = performance.now();
  const { nameOf } = createVaultRoomRenderer(root, catalog, read);
  const names = Object.fromEntries(read.rooms.map((room) => [room.id, nameOf(room.id)]));
  const namedAt = performance.now();
  const assemblyKey = assemblyInputKey({ read, names, site, projection, code });
  if (cacheDir !== undefined && assemblyKey === cachedAssemblyKey) {
    const cached = readVersioned(join(cacheDir, 'release.v9'));
    if (cached?.assemblyKey === assemblyKey) {
      return { derived: cached.derived, assemblyKey, parsedFiles, phases: {
        filesAndParsingMs: readAt - started, namingMs: namedAt - readAt, assemblyMs: 0, totalMs: namedAt - started,
      }, assemblyReused: true };
    }
  }
  const release = await assemble({ vault: { root, config: vaultConfig(catalog), rooms: read.rooms, doors: read.doors, names }, site, updated: new Date().toISOString(), options: projection });
  const derived = {
    documents: release.documents.map((document) => [`/${document.path}`, gzipSync(document.body)]),
    // Card text is regenerated from the room's own file when it is opened; the answer modes are
    // not, since choosing distractors reads the whole vault, so they are kept by card id.
    records: release.rooms.map(({ id, key, visibility, detail }) => {
      const { cards = [], ...kept } = detail;
      const answerModes = Object.fromEntries(cards.filter((card) => card.choices || card.accepts)
        .map(({ id: cardId, choices, accepts }) => [cardId, { ...(choices ? { choices } : {}), ...(accepts ? { accepts } : {}) }]));
      return [key, id, visibility, gzipSync(JSON.stringify({ ...kept, answerModes }))];
    }),
    rooms: read.rooms.map(({ body: _body, ...room }) => room),
    doors: read.doors,
    dialect: read.dialect,
  };
  const assembledAt = performance.now();
  return { derived, assemblyKey, parsedFiles, phases: {
    filesAndParsingMs: readAt - started, namingMs: namedAt - readAt,
    assemblyMs: assembledAt - namedAt, totalMs: assembledAt - started,
  }, assemblyReused: false };
}

/**
 * Bring the cached release of the vault at `root` up to its notes: scan them, and derive a
 * release only when the notes, the settings or the code moved since the cached one. `served` is
 * the assembly key of the release the caller already answers with; when the cache still holds
 * exactly that, nothing is returned but `{ current: true }`. Every read of the whole vault happens
 * here, so a server runs it in a child process and keeps answering while it does.
 */
export async function refreshVaultMazeRelease({ root, catalog, site, projection, cacheDir, served }, { assemble } = {}) {
  if (cacheDir === undefined) return { current: false, ...await deriveVaultMazeRelease({ root, catalog, site, projection }, { assemble }) };
  const input = { root, catalog, site, projection };
  const indexFile = join(cacheDir, 'index.v8');
  const releaseFile = join(cacheDir, 'release.v9');
  const code = vaultMazeCode();
  const previousIndex = readVersioned(indexFile);
  const sources = scanSources(root, catalog, previousIndex?.files ?? {});
  const quickKey = quickInputKey(input, sources, code);
  if (served !== undefined && previousIndex?.quickKey === quickKey && previousIndex.assemblyKey === served) return { current: true };
  const result = await deriveVaultMazeRelease({ ...input, cacheDir, sources, code, cachedAssemblyKey: previousIndex?.assemblyKey }, { assemble });
  // A note that changed while it was read leaves the cache as it was, so the next refresh reads it again.
  const current = scanSources(root, catalog, Object.fromEntries(sources.map((source) => [source.path, source])));
  if (quickInputKey(input, current, code) === quickKey) {
    if (!result.assemblyReused) atomicWrite(releaseFile, { version: CACHE_VERSION, assemblyKey: result.assemblyKey, derived: result.derived });
    atomicWrite(indexFile, {
      version: CACHE_VERSION, quickKey, assemblyKey: result.assemblyKey,
      files: Object.fromEntries(sources.map((source) => [source.path, { stat: source.stat, contentHash: source.contentHash }])),
    });
    await pruneParsed(cacheDir, code, sources).catch((error) => process.emitWarning(`VaultMaze parse cache was not pruned: ${error.message}`));
  }
  // The release the caller already holds is not sent back to it.
  return result.assemblyKey === served ? { ...result, derived: undefined, current: true } : { ...result, current: false };
}

const DERIVE_FLAG = '--vaultmaze-derive-release';
if (process.argv.includes(DERIVE_FLAG) && typeof process.send === 'function') {
  // The derivation is the most memory this server ever asks for and the easiest to do again, so
  // under memory pressure it is the process to end, before the server it works for.
  try { writeFileSync('/proc/self/oom_score_adj', '1000'); } catch { /* not Linux, or not permitted */ }
  process.once('message', async (options) => {
    process.send(await refreshVaultMazeRelease(options), () => process.exit(0));
  });
}

function deriveInChild(options) {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), [DERIVE_FLAG], { serialization: 'advanced', stdio: 'inherit' });
    child.once('message', resolve);
    child.once('error', reject);
    child.once('exit', (code, signal) => { if (code !== 0) reject(new Error(`VaultMaze release derivation exited ${code ?? signal}`)); });
    child.send(options);
  });
}

function stampSourceRevision(derived, sourceRevision) {
  if (sourceRevision === undefined) return derived;
  return {
    ...derived,
    documents: derived.documents.map(([path, bytes]) => {
      if (path !== '/vault/manifest.json') return [path, bytes];
      const manifest = JSON.parse(gunzipSync(bytes).toString());
      return [path, gzipSync(JSON.stringify({ ...manifest, sourceRevision }))];
    }),
  };
}

/** What the server answers with, built from one derived release. */
function servedRelease(root, catalog, derived) {
  const renderer = createVaultRoomRenderer(root, catalog, { rooms: derived.rooms, doors: derived.doors, dialect: derived.dialect });
  const roomsById = new Map(derived.rooms.map((room) => [room.id, room]));
  const titleOf = roomTitleLookup(derived.rooms);
  const hardDoorsTo = new Map();
  for (const door of derived.doors) if (door.weight === 'hard') hardDoorsTo.set(door.to, [...(hardDoorsTo.get(door.to) ?? []), door]);
  const documents = new Map(derived.documents.map(([path, bytes]) => [path, Buffer.from(bytes)]));
  const records = new Map(derived.records.map(([key, id, visibility, detail]) => [key, { key, id, visibility, detail: Buffer.from(detail) }]));
  return { renderer, roomsById, titleOf, hardDoorsTo, documents, records };
}

/**
 * Serve VaultMaze over the vault at `root`. `catalog` is the vault catalog's settings (wing,
 * source dialect, exclude globs, attribute fields), `site` its { baseIri, language }, and
 * `projection` the VaultMaze projection options. Returns an application of resources for the
 * one web server, the media map room bodies name (for /.well-known/ni/), and the room count.
 *
 * With a cache, a server that has a release answers with it at once and refreshes it beside
 * itself (`refreshed` settles when that is done), as a reader opens the notes they have while the
 * vault syncs: the notes move continuously, and a server that waited for every one of them to be
 * read again before answering would not be answering for minutes after each restart. Only a
 * server with no release yet waits for its first.
 */
export async function createVaultMazeRuntime({ root, catalog = {}, site, projection = {}, sourceRevision, cacheDir, instrumentation = {}, derive = deriveInChild }) {
  const revision = sourceRevision === undefined ? projection.sourceRevision : sourceRevision;
  const input = { root, catalog, site, projection: withoutSourceRevision(projection) };
  const cached = cacheDir === undefined ? undefined : readVersioned(join(cacheDir, 'release.v9'));
  let servedKey = cached?.assemblyKey;
  let state = cached === undefined ? undefined : servedRelease(root, catalog, stampSourceRevision(cached.derived, revision ?? null));
  const adopt = (result) => {
    if (result.parsedFiles !== undefined) {
      instrumentation.onDerivation?.(result);
      for (let offset = 0; offset < result.parsedFiles; offset += 1) instrumentation.onFileParsed?.();
    }
    if (result.current) return;
    servedKey = result.assemblyKey;
    state = servedRelease(root, catalog, stampSourceRevision(result.derived, revision ?? null));
  };
  const refreshing = derive({ ...input, cacheDir, served: servedKey }).then(adopt);
  if (state === undefined) await refreshing;
  const refreshed = refreshing.catch((error) => process.emitWarning(`VaultMaze kept its cached release: ${error.message}`));

  const answer = (ctx, path, gzipped) => String(ctx.req?.headers?.['accept-encoding'] ?? '').includes('gzip')
    ? textRepr(gzipped, { type: typeOf(path), headers: { 'content-encoding': 'gzip', vary: 'accept-encoding' }, cacheControl: { noStore: true } })
    : textRepr(gunzipSync(gzipped), { type: typeOf(path), headers: { vary: 'accept-encoding' }, cacheControl: { noStore: true } });
  // A room's body and study cards come from its own file, now.
  const roomBody = (record) => {
    const { renderer, roomsById, titleOf, hardDoorsTo } = state;
    const room = roomsById.get(record.id);
    const body = renderer.bodyOf(room);
    const { answerModes = {}, ...kept } = JSON.parse(gunzipSync(record.detail).toString());
    const cards = generateCardsForRoom({ ...room, body }, hardDoorsTo.get(room.id) ?? [], titleOf)
      .map((card) => ({ ...card, ...answerModes[card.id] }));
    const detail = { ...kept, cards };
    return gzipSync(roomDocument({ detail }, renderer.render(room, body)));
  };
  const application = {
    resources: [{
      id: 'vaultmaze.release',
      match: (path) => state.documents.has(path) || (path === '/' && state.documents.has('/index.html')) || ROOM.test(path) ? {} : false,
      methods: ['GET', 'HEAD'],
      handler: (ctx) => {
        const path = ctx.url.pathname === '/' ? '/index.html' : ctx.url.pathname;
        const room = ROOM.exec(path);
        if (!room) return answer(ctx, path, state.documents.get(path));
        const record = state.records.get(room[2]);
        if (record === undefined || (room[1] && record.visibility !== 'public')) return textRepr('{"error":"no such room"}\n', { status: 404, type: 'application/json; charset=utf-8' });
        return answer(ctx, path, roomBody(record));
      },
    }],
  };
  return Object.freeze({
    application,
    get media() { return state.renderer.media; },
    get rooms() { return state.records.size; },
    refreshed,
  });
}
