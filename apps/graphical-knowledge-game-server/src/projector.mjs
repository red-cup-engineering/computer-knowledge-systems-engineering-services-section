// The VaultMaze projector: the navigational-learning experience over a VICTOR
// vault catalog. It emits the browser application, the content-addressed room
// release that application reads, and the anonymous surface a deployment may
// serve without a session. It compiles nothing and serves nothing: the World
// comes from VICTOR's vault catalog, bodies are rendered by VICTOR, and the
// browser engine is projected from the packages that own it.

import { sha256Hex } from '@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity';
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { normalizeTufteModel } from '@red-cup-engineering/web-page-tiling-engine';
import { openMarkdownVault } from '@red-cup-engineering/knowledge-system-server/markdown-vault';
import { projectWebFeedArtifacts } from '@red-cup-engineering/computer-serialized-content-engineering-services-section/project-web-feed';
import { projectGlossaryIndex } from '@red-cup-engineering/term-engineering-services-section/glossary-index';
import { DEFAULT_KNOWLEDGE_BASE, glossaryAudienceAdmits, projectGlossarySkos } from '@red-cup-engineering/term-engineering-services-section/glossary-skos';
import { buildTilingGridLayout, spaceElements, tufteElements, vaultMazeManifest } from './compose.mjs';
import { buildLayout } from '@red-cup-engineering/education-platform-service/build-layout';
import { worldFromRooms } from '@red-cup-engineering/education-platform-service/compile';
import { voxelizeWorld, chunkVoxelView } from '@red-cup-engineering/education-platform-service/voxels';

/** Rooms past which the maze is not laid out as one map: the layout is quadratic in rooms. */
const MAP_ROOM_LIMIT = 1500;

const PUBLIC_ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const ENGINE_MODULES = Object.freeze(['types', 'srs', 'stability', 'lightcone', 'kata', 'walk', 'walk-rules', 'answer']);
const ABRASH_MODULES = Object.freeze(['grid', 'raycaster', 'framebuffer', 'math']);
const SEARCH_MODULE = 'room-index-search';
const TUFTE_MODULE = 'tufte-browser';
/** A glossary term carrier, wherever a section keeps one. */
const GLOSSARY_TERM = /(^|\/)content\/text\/glossary\/terms\/[^/]+\.md$/u;

const DEFAULT_VOCABULARY = Object.freeze({
  SPACE: 'Semantic Position Arranging Conceptual Elements',
  TUFTE: 'Tiling User Form Topology Engine',
});
const DEFAULT_SURFACE = Object.freeze({
  defaultRoomVisibility: 'authenticated',
  publicOptInField: 'visibility',
  publicOptInValue: 'public',
});
const DEFAULT_PARTICIPATION = Object.freeze({
  mode: 'vaultmaze',
  displayName: 'VaultMaze',
  engine: 'lantern-compatible/v1',
  defaultRoute: 'guided',
  directReadClaims: Object.freeze([]),
  accessibilityBypassClaims: Object.freeze([]),
  targetRetention: 0.9,
  familiar: Object.freeze({ enabled: false, retrievalMode: 'delegated-copy', costPolicy: 'deployment-defined' }),
});

function text(value, path, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${path} must be a non-empty string`);
  return value;
}

function stringList(value, path, fallback) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) throw new TypeError(`${path} must be an array of strings`);
  return Object.freeze([...value]);
}

function record(value, path) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  return value;
}

/** Normalize the projection's options; everything a deployment may say about its vault. */
export function normalizeVaultMazeProjection(offered = {}) {
  const options = record(offered, 'options');
  const title = text(options.title, 'title', 'VaultMaze');
  const offeredSurface = record(options.surface, 'surface');
  const surface = Object.freeze({
    defaultRoomVisibility: text(offeredSurface.defaultRoomVisibility, 'surface.defaultRoomVisibility', DEFAULT_SURFACE.defaultRoomVisibility),
    publicOptInField: text(offeredSurface.publicOptInField, 'surface.publicOptInField', DEFAULT_SURFACE.publicOptInField),
    publicOptInValue: text(offeredSurface.publicOptInValue, 'surface.publicOptInValue', DEFAULT_SURFACE.publicOptInValue),
  });
  if (surface.defaultRoomVisibility !== 'authenticated' && surface.defaultRoomVisibility !== 'public') {
    throw new TypeError('surface.defaultRoomVisibility must be "authenticated" or "public"');
  }
  const columns = options.columns ?? 96;
  if (!Number.isSafeInteger(columns) || columns < 1 || columns > 4096) throw new TypeError('columns must be an integer from 1 through 4096');
  const offeredParticipation = record(options.participation, 'participation');
  const participation = Object.freeze({
    ...DEFAULT_PARTICIPATION,
    displayName: text(offeredParticipation.displayName, 'participation.displayName', DEFAULT_PARTICIPATION.displayName),
    engine: text(offeredParticipation.engine, 'participation.engine', DEFAULT_PARTICIPATION.engine),
    directReadClaims: stringList(offeredParticipation.directReadClaims, 'participation.directReadClaims', DEFAULT_PARTICIPATION.directReadClaims),
    accessibilityBypassClaims: stringList(offeredParticipation.accessibilityBypassClaims, 'participation.accessibilityBypassClaims', DEFAULT_PARTICIPATION.accessibilityBypassClaims),
    targetRetention: offeredParticipation.targetRetention ?? DEFAULT_PARTICIPATION.targetRetention,
    familiar: Object.freeze({ ...DEFAULT_PARTICIPATION.familiar, ...record(offeredParticipation.familiar, 'participation.familiar') }),
  });
  if (typeof participation.targetRetention !== 'number' || participation.targetRetention <= 0 || participation.targetRetention > 1) {
    throw new TypeError('participation.targetRetention must be greater than 0 and at most 1');
  }
  const vocabulary = Object.freeze({ ...DEFAULT_VOCABULARY, ...record(options.vocabulary, 'vocabulary') });
  for (const [key, value] of Object.entries(vocabulary)) text(value, `vocabulary.${key}`);
  const offeredGlossary = record(options.glossary, 'glossary');
  // Where the vault sits in the 561 Group, so the glossary's concept IRIs are the ones the
  // group's own vocabulary names (`<base><section path>/<identity>`), not ones relative to this vault.
  const glossary = Object.freeze({
    sectionPath: offeredGlossary.sectionPath ?? '',
    base: text(offeredGlossary.base, 'glossary.base', DEFAULT_KNOWLEDGE_BASE),
  });
  if (typeof glossary.sectionPath !== 'string' || /^\/|\/$/u.test(glossary.sectionPath)) throw new TypeError('glossary.sectionPath must be a relative path with no leading or trailing /');
  const sourceRevision = options.sourceRevision ?? null;
  if (sourceRevision !== null && (typeof sourceRevision !== 'string' || sourceRevision === '')) throw new TypeError('sourceRevision must be a non-empty string or null');
  return Object.freeze({
    title,
    subtitle: text(options.subtitle, 'subtitle', 'A living projection of a knowledge vault.'),
    eyebrow: text(options.eyebrow, 'eyebrow', 'Digital garden'),
    description: text(options.description, 'description', `${title}: a knowledge garden.`),
    vocabulary,
    surface,
    columns,
    participation,
    glossary,
    sourceRevision,
  });
}

/** A room joins the anonymous surface only when its opt-in is compatible with the house public policy. */
export function roomVisibility(room, surface = DEFAULT_SURFACE) {
  const frontmatter = room?.frontmatter ?? {};
  const optedIn = frontmatter[surface.publicOptInField] === surface.publicOptInValue;
  if (!optedIn) return surface.defaultRoomVisibility;
  if (
    surface.publicOptInField === 'visibility'
    && surface.publicOptInValue === 'public'
    && !glossaryAudienceAdmits(frontmatter, 'public')
  ) return 'authenticated';
  return 'public';
}

const digest = (value) => sha256Hex(value);
const json = (value) => JSON.stringify(value);
const words = (value) => value.replace(/-services-section$/iu, '').replace(/[-_]+/gu, ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());

function summaryOf(room) {
  if (typeof room.description === 'string' && room.description.trim() !== '') return room.description.trim();
  for (const line of room.body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || /^(#|```|>|[-*]\s|\d+\.\s|\[\^|[a-z][a-z0-9-]*::\s)/u.test(trimmed)) continue;
    const prose = trimmed
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu, (_, target, label) => label ?? target)
      .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
      .replace(/[*_`]/gu, '');
    return prose.length > 220 ? `${prose.slice(0, 219)}…` : prose;
  }
  return '';
}

function collectionOf(roomId) {
  const parts = roomId.split('/');
  if (parts[0] === 'services' && parts[1]) return `services/${parts[1]}`;
  return parts.length > 1 ? parts[0] : 'root';
}

const collectionTitle = (collectionId) => words(collectionId.split('/').at(-1));
const hallTitle = (intent) => (intent.length ? intent.join(' · ') : 'Unnamed hall');

function rfc3339(value) {
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return `${value}T00:00:00Z`;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

const escapeHtml = (value) => String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');

async function shell(options) {
  const template = await readFile(resolve(PUBLIC_ROOT, 'index.html'), 'utf8');
  return template
    .replaceAll('{{title}}', escapeHtml(options.title))
    .replaceAll('{{description}}', escapeHtml(options.description))
    .replaceAll('{{eyebrow}}', escapeHtml(options.eyebrow));
}

// The browser engine is projected from the packages that own it, never copied
// by hand: the scheduler and light cone from the education platform, room
// search from CAIRN, the tile renderer from TUFTE.
export async function browserRuntime() {
  const engineRoot = dirname(fileURLToPath(import.meta.resolve('@red-cup-engineering/education-platform-service/srs')));
  const artifacts = [];
  for (const name of ENGINE_MODULES) {
    const source = await readFile(resolve(engineRoot, `${name}.mjs`), 'utf8');
    let body = source.replaceAll(/(from\s+["'])(\.\/[a-z-]+)\.js(["'])/gu, '$1$2.mjs$3');
    if (name === 'walk-rules') body = body.replace('@red-cup-engineering/gaming/running/rules', './gaming-rules.mjs');
    artifacts.push({
      path: `js/${name}.mjs`,
      body,
      source: `education-platform-service:${name}`,
    });
  }
  const abrashRoot = dirname(fileURLToPath(import.meta.resolve('@red-cup-engineering/abrash/grid')));
  for (const name of ABRASH_MODULES) artifacts.push({
    path: `js/abrash-${name}.mjs`,
    body: (await readFile(resolve(abrashRoot, `${name}.mjs`), 'utf8'))
      .replaceAll(/(from\s+["'])\.\/([a-z-]+)\.mjs(["'])/gu, '$1./abrash-$2.mjs$3'),
    source: `abrash:${name}`,
  });
  const gamingRoot = resolve(engineRoot, '../node_modules/@red-cup-engineering/gaming');
  const gamingRulesPath = resolve(gamingRoot, 'src/running/rules.mjs');
  const gamingRules = (await readFile(gamingRulesPath, 'utf8'))
    .replace('@red-cup-engineering/json-services-section/canonical-json', './canonical-json.mjs')
    .replace('@red-cup-engineering/cryptographic-computer-data-engineering-services-section/portable-sha256', './portable-sha256.mjs');
  artifacts.push({ path: 'js/gaming-rules.mjs', body: gamingRules, source: 'gaming:running/rules' });
  artifacts.push({ path: 'js/canonical-json.mjs', body: await readFile(resolve(gamingRoot, 'node_modules/@red-cup-engineering/json-services-section/scripts/canonical-json.mjs'), 'utf8'), source: 'json:canonical-json' });
  artifacts.push({ path: 'js/portable-sha256.mjs', body: await readFile(resolve(gamingRoot, 'node_modules/@red-cup-engineering/cryptographic-computer-data-engineering-services-section/src/portable-sha256.mjs'), 'utf8'), source: 'cryptography:portable-sha256' });
  artifacts.push({ path: `js/${SEARCH_MODULE}.mjs`, body: await readFile(fileURLToPath(import.meta.resolve('@red-cup-engineering/markdown-engineering-services-section/vault/room-index-search')), 'utf8'), source: 'cairn:room-index-search' });
  artifacts.push({ path: `js/${TUFTE_MODULE}.mjs`, body: await readFile(fileURLToPath(import.meta.resolve('@red-cup-engineering/web-page-tiling-engine/browser')), 'utf8'), source: 'tufte:browser' });
  for (const file of ['app.js', 'map.js', 'vaultmaze.css']) {
    artifacts.push({ path: file, body: await readFile(resolve(PUBLIC_ROOT, file), 'utf8'), source: `vaultmaze:${file}` });
  }
  return artifacts;
}

/**
 * The VaultMaze release of one vault: every document the browser reads about the world (index,
 * manifest, graph, views, the anonymous surface and its feeds, the shell and browser runtime) and,
 * for each room, the record it opens without its rendered body. A build renders every body; a
 * server renders one when it is asked for (./runtime.mjs). `vault` is { root, config, rooms,
 * doors, names } as VICTOR's vault catalog or readVaultRooms gives it, bodies still present.
 */
export async function vaultMazeRelease({ vault, site, updated, options: offered = {}, openVault = openMarkdownVault, observePhase = () => {} }) {
  let phaseAt = performance.now();
  const phase = (name) => {
    const now = performance.now();
    observePhase(name, now - phaseAt);
    phaseAt = now;
  };
  const options = normalizeVaultMazeProjection(offered);
  const { root, names } = vault;
  const world = worldFromRooms(vault, vault.config);
  phase('world');
  const wing = { id: world.wingId, visibility: options.surface.defaultRoomVisibility };
  const layout = buildTilingGridLayout(world, options.columns);
  // Above the force-directed limit, sorted path ids on the tiling grid keep sibling notes adjacent.
  // That is the honest locality available for a large vault, without pretending a quadratic solve ran.
  const voxelLayout = world.rooms.length <= MAP_ROOM_LIMIT ? buildLayout(world) : layout;
  const voxelChunks = chunkVoxelView(voxelizeWorld(world, voxelLayout));
  const space = spaceElements(world, wing);
  const tufte = tufteElements(world, wing, layout);
  const passage = vaultMazeManifest(world, options.participation);
  phase('layout');
  const gateByRoom = new Map(passage.gates.map((gate) => [gate.roomId, gate]));
  const cardsByRoom = new Map(world.rooms.map((room) => [room.id, []]));
  for (const card of world.cards) cardsByRoom.get(card.roomId)?.push(card);
  const doorsByRoom = new Map(world.rooms.map((room) => [room.id, []]));
  for (const door of world.doors) {
    doorsByRoom.get(door.from)?.push({ direction: 'outgoing', ...door });
    doorsByRoom.get(door.to)?.push({ direction: 'incoming', ...door });
  }

  const artifacts = [];
  const roomRecords = [];
  const index = [];
  const publicIndex = [];
  const publicRooms = [];
  const keyByRoomId = new Map();
  for (const [offset, room] of world.rooms.entries()) {
    const name = names[room.id];
    const key = digest(room.id);
    keyByRoomId.set(room.id, key);
    const visibility = roomVisibility(room, options.surface);
    const route = `/${name}/`;
    const entry = {
      id: room.id, key, route, title: room.title, kind: room.kind, summary: summaryOf(room),
      collection: collectionOf(room.id), visibility, space: space[offset], tufte: tufte[offset],
    };
    const { body: _body, ...roomWithoutBody } = room;
    const detail = {
      schemaVersion: 'vaultmaze-room/v1',
      room: roomWithoutBody,
      route,
      visibility,
      space: entry.space,
      tufte: entry.tufte,
      gate: gateByRoom.get(room.id),
      cards: cardsByRoom.get(room.id),
      doors: doorsByRoom.get(room.id),
    };
    index.push(entry);
    roomRecords.push({ id: room.id, name, key, visibility, detail });
    // The public tree receives only rooms whose own frontmatter opted in, so
    // the anonymous surface cannot widen by a routing mistake.
    if (visibility === 'public') {
      publicIndex.push(entry);
      publicRooms.push(room);
    }
  }
  phase('room-documents');

  const indexDocument = { schemaVersion: 'vaultmaze-index/v1', vocabulary: options.vocabulary, participation: options.participation, rooms: index };
  const release = digest(json({
    schemaVersion: 'vaultmaze-release-identity/v1',
    index: indexDocument,
    roomDigests: world.rooms.map((room) => digest(json(room))),
    doorDigest: digest(json(world.doors)),
  }));
  const generatedAt = updated;

  const halls = world.halls
    .map((hall) => ({
      id: hall.id, title: hallTitle(hall.intent), intent: hall.intent, stable: hall.stable, size: hall.rooms.length,
      rooms: hall.rooms.map((roomId) => ({ id: roomId, key: keyByRoomId.get(roomId) ?? null })),
    }))
    .filter((hall) => hall.size > 1)
    .sort((left, right) => right.size - left.size || left.title.localeCompare(right.title));
  const hallsDocument = {
    schemaVersion: 'vaultmaze-halls/v1', release,
    counts: { halls: halls.length, stable: halls.filter((hall) => hall.stable).length },
    halls,
  };

  const collectionCounts = new Map();
  for (const entry of index) collectionCounts.set(entry.collection, (collectionCounts.get(entry.collection) ?? 0) + 1);
  const garden = normalizeTufteModel({
    title: options.title,
    subtitle: options.subtitle,
    eyebrow: options.eyebrow,
    revision: release,
    tiles: [
      { id: 'catalogue-atlas', role: 'now', span: 8, title: 'Catalogue atlas', content: `${index.length.toLocaleString('en-US')} rooms arranged in their deterministic TUFTE catalogue positions.`, view: 'atlas' },
      { id: 'vault-measures', role: 'aside', span: 4, title: 'Vault measures', content: `${world.doors.length.toLocaleString('en-US')} doors · ${world.cards.length.toLocaleString('en-US')} study cards · ${world.halls.length.toLocaleString('en-US')} halls`, view: 'measures' },
      { id: 'halls', role: 'standard', span: 6, title: 'Halls', content: `${halls.length.toLocaleString('en-US')} concept halls, ${hallsDocument.counts.stable.toLocaleString('en-US')} of them rigid.`, view: 'halls' },
      ...[...collectionCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 24)
        .map(([collectionId, count]) => ({
          id: `collection-${digest(collectionId).slice(0, 12)}`, role: 'standard', span: count > 1000 ? 6 : 4,
          title: collectionTitle(collectionId), content: `${count.toLocaleString('en-US')} rooms`, view: 'collection', collectionId, count,
        })),
    ],
  });

  const surface = {
    schemaVersion: 'vaultmaze-surface/v1',
    title: options.title,
    baseUrl: site.baseIri,
    vocabulary: options.vocabulary,
    release,
    generatedAt,
    policy: options.surface,
    counts: { publicRooms: publicIndex.length },
    invitation: publicIndex.length === 0
      ? `${options.title} is open to its readers. No room has been published to the anonymous surface yet.`
      : `${publicIndex.length.toLocaleString('en-US')} rooms are readable without an account.`,
  };

  const feedItems = publicIndex
    .map((entry) => {
      const room = publicRooms.find((candidate) => candidate.id === entry.id);
      const published = rfc3339(room?.dateCreated ?? room?.frontmatter?.['date-created']);
      if (published === null) return null;
      const url = new URL(`#/public/${entry.key}`, site.baseIri).href;
      return { id: url, url, title: entry.title, summary: entry.summary, published, tags: entry.space.semanticPosition.tags ?? [] };
    })
    .filter(Boolean)
    .sort((left, right) => right.published.localeCompare(left.published));
  const feeds = projectWebFeedArtifacts({
    channel: { title: options.title, homePageUrl: site.baseIri, description: options.description, language: site.language ?? 'en' },
    items: feedItems,
    updated: generatedAt,
    paths: { rss: 'vault/public/feed.xml', atom: 'vault/public/feed.atom', json: 'vault/public/feed.json' },
  });

  // The public glossary vocabulary: the term carriers among the public rooms, read from their own
  // files and admitted by the term owner (never from the vault's flattened frontmatter), each
  // concept naming the public page that presents it.
  const pageByPath = new Map();
  const glossaryDocuments = await Promise.all(publicIndex.filter((entry) => GLOSSARY_TERM.test(entry.id)).map(async (entry) => {
    const path = options.glossary.sectionPath === '' ? entry.id : `${options.glossary.sectionPath}/${entry.id}`;
    pageByPath.set(path, new URL(`#/public/${entry.key}`, site.baseIri).href);
    return { path, filename: basename(entry.id), text: await readFile(resolve(root, entry.id), 'utf8') };
  }));
  const glossaryIndex = projectGlossaryIndex({ root: '.', documents: glossaryDocuments });
  const glossary = projectGlossarySkos(glossaryIndex, { base: options.glossary.base, audience: 'public', pageOf: (term) => pageByPath.get(term.path) });
  surface.glossary = '/vault/public/glossary.jsonld';
  surface.counts.glossaryTerms = glossary.accounting.concepts;
  phase('surface-documents');

  // The relation release: what CAIRN reads the rooms as saying -- tellings whose values name
  // other rooms, as passages to them, and names used as terms that no room answers to, as the
  // questions the corpus is asking.
  const rooms = new Set(world.rooms.map((room) => room.id));
  const archive = await openVault({ root });
  const tellingCount = (await archive.tellings()).size;
  const passages = (await archive.passages()).filter((passage) => rooms.has(passage.sourcePath) && rooms.has(passage.targetPath));
  const questions = (await archive.questions({ limit: Number.MAX_SAFE_INTEGER }))
    .map((question) => ({ ...question, documents: question.documents.filter((path) => rooms.has(path)) })).filter((question) => question.documents.length > 0);
  phase('archive-graph');
  const graphDocument = {
    schemaVersion: 'vaultmaze-graph/v2',
    release,
    counts: { tellings: tellingCount, passages: passages.length, questions: questions.length },
    snapshot: { documents: world.rooms.map((room) => room.id), graph: { edges: passages } },
    questions,
  };

  // What the daily walk and kata plan over in the browser: every room, door and card as a
  // compact tuple, never card text (a room's cards are read from its own record).
  const passageView = {
    schemaVersion: 'vaultmaze-passage/v1',
    release,
    rooms: world.rooms.map((room) => [room.id, keyByRoomId.get(room.id), room.dateCreated ?? null]),
    doors: world.doors.map((door) => [door.from, door.to, door.weight]),
    cards: world.cards.map((card) => [card.id, card.roomId, card.stability, card.difficulty]),
  };

  const manifest = {
    schemaVersion: 'vaultmaze-release/v1',
    release,
    sourceRevision: options.sourceRevision,
    generatedAt,
    title: options.title,
    baseUrl: site.baseIri,
    counts: {
      rooms: world.rooms.length, tellings: tellingCount, questions: questions.length, publicRooms: publicIndex.length, doors: world.doors.length, halls: world.halls.length,
      projectedHalls: halls.length, cards: world.cards.length, warnings: world.warnings.length,
    },
    index: '/vault/index.json',
    garden: '/vault/views/garden.json',
    halls: '/vault/views/halls.json',
    passage: '/vault/views/passage.json',
    layout: '/vault/views/layout.json',
    voxels: '/vault/views/voxels/index.json',
    surface: '/vault/public/surface.json',
    publicIndex: '/vault/public/index.json',
    roomTemplate: '/vault/rooms/{sha256-room-id}.json',
    publicRoomTemplate: '/vault/public/rooms/{sha256-room-id}.json',
    glossary: '/vault/public/glossary.jsonld',
    graph: '/vault/graph.json',
  };

  artifacts.push(
    { path: 'vault/index.json', body: json(indexDocument), source: 'vaultmaze:index' },
    { path: 'vault/manifest.json', body: json(manifest), source: 'vaultmaze:manifest' },
    { path: 'vault/graph.json', body: json(graphDocument), source: 'vaultmaze:graph' },
    { path: 'vault/views/garden.json', body: json(garden), source: 'vaultmaze:garden' },
    { path: 'vault/views/halls.json', body: json(hallsDocument), source: 'vaultmaze:halls' },
    { path: 'vault/views/passage.json', body: json(passageView), source: 'vaultmaze:passage' },
    { path: 'vault/views/layout.json', body: json(world.rooms.length <= MAP_ROOM_LIMIT ? { schemaVersion: 'vaultmaze-layout/v1', release, ...voxelLayout } : { schemaVersion: 'vaultmaze-layout/v1', release, positions: null, rooms: world.rooms.length, limit: MAP_ROOM_LIMIT }), source: 'vaultmaze:layout' },
    { path: 'vault/views/voxels/index.json', body: json(voxelChunks.index), source: 'vaultmaze:voxels:index' },
    ...Object.entries(voxelChunks.chunks).map(([key, chunk]) => ({ path: `vault/views/voxels/${key}.json`, body: json(chunk), source: `vaultmaze:voxels:${key}` })),
    { path: 'vault/public/surface.json', body: json(surface), source: 'vaultmaze:surface' },
    { path: 'vault/public/index.json', body: json({ schemaVersion: 'vaultmaze-public-index/v1', release, rooms: publicIndex }), source: 'vaultmaze:public-index' },
    ...feeds.artifacts.map((artifact) => ({ ...artifact, source: 'vaultmaze:public-feed' })),
    { path: 'vault/public/glossary.jsonld', body: json(glossary), source: 'vaultmaze:public-glossary' },
    { path: 'index.html', body: await shell(options), source: 'vaultmaze:shell' },
    ...await browserRuntime(),
  );
  phase('release-documents');
  return { documents: artifacts, rooms: roomRecords };
}

/** A room's record with its rendered body: what `/vault/rooms/<key>.json` answers. */
export const roomDocument = (record, renderedBody) => json({ ...record.detail, renderedBody: renderedBody ?? '<p>This room has no prose yet.</p>' });

/** Create the VICTOR projector for one vault deployment: the release, every room's body rendered. */
export function createVaultMazeProjector(offered = {}, { openVault = openMarkdownVault } = {}) {
  return Object.freeze({
    name: 'vaultmaze',
    priority: 15,
    async project(context) {
      const vault = context?.catalog?.vault;
      if (!vault || typeof context.renderCell !== 'function') {
        throw new TypeError('VaultMaze projects a VICTOR vault catalog: set catalog.dialect to "vault"');
      }
      const release = await vaultMazeRelease({ vault, site: context.site, updated: context.updated, options: offered, openVault });
      const artifacts = [...release.documents];
      for (const record of release.rooms) {
        const cell = context.catalog.cells.get(record.name);
        const body = roomDocument(record, cell ? context.renderCell(cell) : undefined);
        artifacts.push({ path: `vault/rooms/${record.key}.json`, body, source: `vaultmaze:room:${record.id}` });
        if (record.visibility === 'public') artifacts.push({ path: `vault/public/rooms/${record.key}.json`, body, source: `vaultmaze:public-room:${record.id}` });
      }
      return { artifacts };
    },
  });
}
