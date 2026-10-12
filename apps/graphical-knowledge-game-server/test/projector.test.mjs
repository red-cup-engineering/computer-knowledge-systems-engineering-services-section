import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { build } from "@red-cup-engineering/static-site-publisher/build";
import { createVaultMazeProjector, normalizeVaultMazeProjection, roomVisibility } from '../src/projector.mjs';
import { buildTilingGridLayout } from '../src/compose.mjs';
import { voxelizeWorld, chunkVoxelView } from '@red-cup-engineering/education-platform-service/voxels';

const SITE = { name: 'Vault', baseIri: 'https://vault.example/', language: 'en' };
const EMPTY_ARCHIVE = async () => ({
  tellings: async () => new Map(),
  passages: async () => [],
  questions: async () => [],
});

// One public room, one authenticated room that requires it, one undated room.
async function vaultFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vaultmaze-projector-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  await mkdir(join(contentDir, 'services', 'physics-services-section'), { recursive: true });
  await writeFile(join(contentDir, 'welcome.md'), `---\ntitle: Welcome\ndate-created: 2026-01-02\nvisibility: public\ntags:\n  - opening\n---\n\nThe open door. See [[Mass]].\n`);
  await writeFile(join(contentDir, 'services', 'physics-services-section', 'mass.md'), `---\ntitle: Mass\ntype: concept\nrequires: ../../welcome.md\n---\n\nWhat a body has. Defined against [[Welcome]].\n`);
  await writeFile(join(contentDir, 'services', 'physics-services-section', 'notes.md'), `---\ntype: note\n---\n\nUndated and unremarkable.\n`);
  return contentDir;
}

// Two glossary terms in one section: a public one that names its private neighbour, and the neighbour.
async function glossaryFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vaultmaze-glossary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const terms = join(root, 'services', 'physics-services-section', 'content', 'text', 'glossary', 'terms');
  await mkdir(terms, { recursive: true });
  await writeFile(join(terms, 'mass.md'), `---\nname: Mass\ndescription: How much matter a body has.\nvisibility: public\ndate-created: 2026-01-02\nmeasures: [inertia]\n---\n\nThe measure of a body's resistance to acceleration.\n`);
  await writeFile(join(terms, 'inertia.md'), `---\nname: Inertia\n---\n\nA body's tendency to keep its state of motion.\n`);
  return root;
}

async function projectFixture(t, options = {}, fixture = vaultFixture) {
  const contentDir = await fixture(t);
  return build({
    contentDir,
    site: SITE,
    home: false,
    archives: false,
    search: false,
    tufte: false,
    // VICTOR's asset transformer fingerprints the application module and rewrites
    // the shell's reference to it; that is VICTOR's contract, tested there.
    assets: false,
    catalog: { dialect: 'vault', wing: 'fixture' },
    projectors: [createVaultMazeProjector({ title: 'Fixture Vault', ...options }, { openVault: EMPTY_ARCHIVE })],
  });
}

test('the projection is a releasable VICTOR site whose root is the VaultMaze shell', async (t) => {
  const result = await projectFixture(t);
  assert.equal(result.report.releasable, true, JSON.stringify(result.report.refusals.slice(0, 3)));
  const shell = result.artifacts.get('index.html');
  assert.match(shell, /<meta name="application-name" content="Fixture Vault">/);
  assert.match(shell, /<script type="module" src="\/app.js">/);
  for (const path of ['app.js', 'vaultmaze.css', 'js/types.mjs', 'js/srs.mjs', 'js/stability.mjs', 'js/lightcone.mjs', 'js/answer.mjs', 'js/walk-rules.mjs', 'js/gaming-rules.mjs', 'js/canonical-json.mjs', 'js/portable-sha256.mjs', 'js/abrash-grid.mjs', 'js/abrash-raycaster.mjs', 'js/abrash-framebuffer.mjs', 'js/abrash-math.mjs', 'js/room-index-search.mjs', 'js/tufte-browser.mjs']) {
    assert.ok(result.artifacts.has(path), `${path} is projected`);
  }
  assert.match(result.artifacts.get('js/lightcone.mjs'), /from ['"]\.\/srs\.mjs['"]/, 'engine imports are retargeted to the projected modules');
  assert.doesNotMatch(result.artifacts.get('app.js'), /function\s+recallProbability|function\s+reviewCard/, 'the application does not carry a second scheduler');
});

test('every relative browser module import resolves to a projected runtime artifact', async (t) => {
  const result = await projectFixture(t); const unresolved = [];
  assert.equal(result.report.releasable, true, JSON.stringify(result.report.refusals.slice(0, 3)));
  for (const [path, body] of result.artifacts) {
    if (!/\.(?:js|mjs)$/u.test(path)) continue;
    for (const match of body.matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/gu)) {
      const target = new URL(match[1], `https://vault.example/${path}`).pathname.slice(1);
      if (!result.artifacts.has(target)) unresolved.push(`${path} -> ${match[1]}`);
    }
  }
  assert.deepEqual(unresolved, []);
});

test('the room release is content-addressed, routed, rendered by VICTOR, and split by visibility', async (t) => {
  const result = await projectFixture(t);
  const index = JSON.parse(result.artifacts.get('vault/index.json'));
  assert.equal(index.schemaVersion, 'vaultmaze-index/v1');
  assert.equal(index.rooms.length, 3);
  const welcome = index.rooms.find((room) => room.id === 'welcome.md');
  assert.match(welcome.key, /^[a-f0-9]{64}$/u);
  assert.equal(welcome.route, '/welcome/');
  assert.equal(welcome.visibility, 'public');
  assert.equal(welcome.collection, 'root');
  const mass = index.rooms.find((room) => room.id === 'services/physics-services-section/mass.md');
  assert.equal(mass.visibility, 'authenticated');
  assert.equal(mass.collection, 'services/physics-services-section');
  assert.deepEqual(Object.keys(mass.tufte).sort(), ['id', 'spaceElementId', 'topology', 'x', 'y']);

  const detail = JSON.parse(result.artifacts.get(`vault/rooms/${mass.key}.json`));
  assert.equal(detail.schemaVersion, 'vaultmaze-room/v1');
  assert.equal('body' in detail.room, false, 'the room carries no second copy of its prose');
  assert.match(detail.renderedBody, /href="\/welcome\/"[^>]*>Welcome</, 'VICTOR rendered the body and resolved the wikilink to a route');
  assert.ok(detail.doors.some((door) => door.direction === 'incoming' && door.from === 'welcome.md' && door.weight === 'hard'));
  assert.ok(Array.isArray(detail.cards));
  assert.deepEqual(detail.gate.prerequisiteRoomIds, ['welcome.md']);

  const publicIndex = JSON.parse(result.artifacts.get('vault/public/index.json'));
  assert.deepEqual(publicIndex.rooms.map((room) => room.id), ['welcome.md']);
  const publicRoomFiles = [...result.artifacts.keys()].filter((path) => path.startsWith('vault/public/rooms/'));
  assert.deepEqual(publicRoomFiles, [`vault/public/rooms/${welcome.key}.json`]);
});

test('the anonymous surface names no authenticated room, and the public feeds carry only dated public rooms', async (t) => {
  const result = await projectFixture(t);
  const surface = JSON.parse(result.artifacts.get('vault/public/surface.json'));
  assert.equal(surface.schemaVersion, 'vaultmaze-surface/v1');
  assert.equal(surface.counts.publicRooms, 1);
  assert.equal(surface.policy.defaultRoomVisibility, 'authenticated');
  assert.match(surface.release, /^[a-f0-9]{64}$/u);
  const serialized = JSON.stringify(surface);
  assert.equal(serialized.includes('mass.md'), false);
  assert.equal(serialized.includes('Undated'), false);
  const feed = JSON.parse(result.artifacts.get('vault/public/feed.json'));
  assert.deepEqual(feed.items.map((item) => item.title), ['Welcome']);
  assert.ok(result.artifacts.has('vault/public/feed.xml'));
  assert.ok(result.artifacts.has('vault/public/feed.atom'));
});

test('the manifest, halls, and garden describe the release the browser will read', async (t) => {
  const result = await projectFixture(t);
  const manifest = JSON.parse(result.artifacts.get('vault/manifest.json'));
  assert.equal(manifest.schemaVersion, 'vaultmaze-release/v1');
  assert.equal(manifest.title, 'Fixture Vault');
  assert.equal(manifest.baseUrl, 'https://vault.example/');
  assert.equal(manifest.counts.rooms, 3);
  assert.equal(manifest.counts.publicRooms, 1);
  assert.equal(manifest.index, '/vault/index.json');
  assert.equal(manifest.roomTemplate, '/vault/rooms/{sha256-room-id}.json');
  assert.equal(manifest.voxels, '/vault/views/voxels/index.json');
  const halls = JSON.parse(result.artifacts.get('vault/views/halls.json'));
  assert.equal(halls.schemaVersion, 'vaultmaze-halls/v1');
  assert.equal(halls.release, manifest.release);
  const garden = JSON.parse(result.artifacts.get('vault/views/garden.json'));
  assert.equal(garden.title, 'Fixture Vault');
  assert.equal(garden.revision, manifest.release);
  assert.ok(garden.tiles.some((tile) => tile.id === 'catalogue-atlas'));
  assert.ok(garden.tiles.some((tile) => tile.view === 'collection' && tile.collectionId === 'services/physics-services-section'));
  const voxelIndex = JSON.parse(result.artifacts.get('vault/views/voxels/index.json'));
  assert.equal(voxelIndex.schemaVersion, 'vaultmaze-voxels/v1');
  assert.ok(voxelIndex.chunks.length > 0);
  for (const key of voxelIndex.chunks) assert.ok(result.artifacts.has(`vault/views/voxels/${key}.json`));
});

test('the public glossary vocabulary carries only public terms, at the 561 Group\'s IRIs, each naming its public page', async (t) => {
  const result = await projectFixture(t, { glossary: { sectionPath: 'services/science-services-section' } }, glossaryFixture);
  assert.equal(result.report.releasable, true, JSON.stringify(result.report.refusals.slice(0, 3)));
  const surface = JSON.parse(result.artifacts.get('vault/public/surface.json'));
  assert.equal(surface.glossary, '/vault/public/glossary.jsonld');
  assert.equal(surface.counts.glossaryTerms, 1);
  assert.equal(JSON.parse(result.artifacts.get('vault/manifest.json')).glossary, '/vault/public/glossary.jsonld');
  const glossary = JSON.parse(result.artifacts.get('vault/public/glossary.jsonld'));
  assert.equal(glossary.schema, 'computer-glossary-skos.v3');
  assert.equal(glossary.audience, 'public');
  const concepts = glossary['@graph'].filter((node) => node['@type'].includes('skos:Concept'));
  assert.deepEqual(concepts.map((concept) => concept['@id']), ['https://561.group/knowledge/science-services-section/physics-services-section/mass']);
  const index = JSON.parse(result.artifacts.get('vault/index.json'));
  const mass = index.rooms.find((room) => room.id.endsWith('/mass.md'));
  assert.equal(concepts[0].url, `https://vault.example/#/public/${mass.key}`);
  assert.equal(concepts[0]['skos:definition'], "The measure of a body's resistance to acceleration.");
  assert.equal(JSON.stringify(glossary).includes('Inertia'), false, 'an authenticated term never reaches the public vocabulary');
});

test('a synthetic 20,000-room tiling view is chunked within the release budget', () => {
  const count = 20_000;
  const rooms = Array.from({ length: count }, (_, index) => ({ id: `notes/${String(index).padStart(5, '0')}.md` }));
  const world = { wingId: 'large', rooms, doors: [], halls: [], warnings: [] };
  const started = performance.now();
  const chunked = chunkVoxelView(voxelizeWorld(world, buildTilingGridLayout(world, 96)));
  const elapsed = performance.now() - started;
  const bytes = Buffer.byteLength(JSON.stringify(chunked));
  console.log(`# 20,000-room voxels: ${chunked.index.chunks.length} chunks, ${bytes} bytes, ${elapsed.toFixed(1)} ms`);
  assert.ok(elapsed < 10_000, `derivation took ${elapsed.toFixed(1)} ms`);
});

test('two builds of the same vault are the same release', async (t) => {
  const first = await projectFixture(t);
  const second = await projectFixture(t);
  assert.equal(JSON.parse(first.artifacts.get('vault/manifest.json')).release, JSON.parse(second.artifacts.get('vault/manifest.json')).release);
  assert.equal(first.artifacts.get('vault/index.json'), second.artifacts.get('vault/index.json'));
});

test('the projection refuses a catalog that is not a vault, and its options are typed', async (t) => {
  const contentDir = await vaultFixture(t);
  await assert.rejects(
    () => build({ contentDir, site: SITE, home: false, archives: false, search: false, tufte: false, projectors: [createVaultMazeProjector({ title: 'X' })] })
      .then((result) => { const refused = result.report.refusals.find((r) => r.code === 'BPC-004' && /vault catalog/u.test(r.data?.details?.message ?? '')); if (refused) throw new Error(refused.data.details.message); return result; }),
    /vault catalog/u,
  );
  assert.throws(() => normalizeVaultMazeProjection({ title: '' }), /title/u);
  assert.throws(() => normalizeVaultMazeProjection({ columns: 0 }), /columns/u);
  assert.throws(() => normalizeVaultMazeProjection({ participation: { targetRetention: 2 } }), /targetRetention/u);
  assert.throws(() => normalizeVaultMazeProjection({ surface: { defaultRoomVisibility: 'secret' } }), /defaultRoomVisibility/u);
  const options = normalizeVaultMazeProjection({ title: 'T', vocabulary: { SPACE: 'Custom' } });
  assert.equal(options.vocabulary.SPACE, 'Custom');
  assert.equal(options.vocabulary.TUFTE, 'Tiling User Form Topology Engine');
  assert.equal(roomVisibility({ frontmatter: { visibility: 'public' } }), 'public');
  assert.equal(roomVisibility({ frontmatter: { visibility: 'public', 'consent-status': 'protocol-gated' } }), 'authenticated');
  assert.equal(roomVisibility({ frontmatter: { visibility: 'Public' } }), 'authenticated');
  assert.equal(roomVisibility({ frontmatter: {} }), 'authenticated');
  assert.equal(options.glossary.sectionPath, '');
  assert.throws(() => normalizeVaultMazeProjection({ glossary: { sectionPath: '/services' } }), /sectionPath/u);
});
