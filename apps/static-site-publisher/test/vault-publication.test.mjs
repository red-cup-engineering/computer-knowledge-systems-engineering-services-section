import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../src/build.mjs';
import { normalizeProjectConfig, DEFAULT_CATALOG } from '../src/config.mjs';
import { assembleCatalog } from '@red-cup-engineering/knowledge-system-server/catalog';
import { routeName } from '@red-cup-engineering/web-page-tiling-engine/publication';

const SITE = { name: 'Vault', baseIri: 'https://vault.example/' };

// A small house-dialect vault: one dated, titled note; one untitled, undated
// note of an open type that declares the first as a prerequisite through a
// frontmatter path field and links to it in the body; one draft to exclude.
async function vaultFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'victor-vault-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  await mkdir(join(contentDir, 'notes'), { recursive: true });
  await mkdir(join(contentDir, 'drafts'), { recursive: true });
  await writeFile(join(contentDir, 'intro.md'), `---
title: Intro
date-created: 2026-01-02
tags:
  - opening
---

The opening room.
`);
  await writeFile(join(contentDir, 'notes', 'no-title.md'), `---
type: concept
requires: ../intro.md
---

See [the intro](../intro.md#top) and [[intro]].
`);
  await writeFile(join(contentDir, 'drafts', 'later.md'), `---
title: Later
---

Not yet.
`);
  return contentDir;
}

test('the vault dialect admits an untitled, undated note of an open type as a page', async (t) => {
  const contentDir = await vaultFixture(t);
  const result = await build({ contentDir, site: SITE, catalog: { dialect: 'vault', exclude: ['drafts'] } });

  assert.equal(result.report.releasable, true, JSON.stringify(result.report.refusals));
  const cell = result.catalog.cells.get('notes/no-title');
  assert.ok(cell, 'the untitled note is a cell');
  assert.equal(cell.title, 'no-title');
  assert.equal(cell.type, 'concept');
  assert.equal(cell.status, 'active');
  assert.equal(cell.dateCreated, undefined);
  assert.ok(result.artifacts.has('notes/no-title/index.html'));
  assert.ok(result.artifacts.has('intro/index.html'));
  assert.equal(result.catalog.cells.has('drafts/later'), false, 'excluded segments are not admitted');
});

test('the publication dialect still refuses the same note, so the vault dialect is an admission, not a loosening', async (t) => {
  const contentDir = await vaultFixture(t);
  const result = await build({ contentDir, site: SITE });
  assert.equal(result.report.releasable, false);
  assert.ok(result.report.refusals.some((r) => r.code === 'R-03' && r.subject === 'notes/no-title'));
});

test('vault doors become typed relations and backlinks, and document links become cell routes', async (t) => {
  const contentDir = await vaultFixture(t);
  const result = await build({ contentDir, site: SITE, catalog: { dialect: 'vault', exclude: ['drafts'] } });

  const cell = result.catalog.cells.get('notes/no-title');
  assert.ok(cell.relations.some((r) => r.type === 'requires' && r.to === 'intro' && r.provenance === 'vault-door:hard'));
  assert.ok(cell.relations.some((r) => r.type === 'links' && r.to === 'intro'));
  assert.ok((result.catalog.incoming.get('intro') ?? []).some((r) => r.type === 'requires' && r.from === 'notes/no-title'));

  const page = result.artifacts.get('notes/no-title/index.html');
  assert.match(page, /href="\/intro\/#top"/, 'the relative .md link is rewritten to the cell route with its fragment');
  assert.doesNotMatch(page, /href="\.\.\/intro\.md/);
  const introPage = result.artifacts.get('intro/index.html');
  assert.match(introPage, /href="\/notes\/no-title\/"/, 'the prerequisite lists its dependent as a backlink');
});

test('undated vault cells are pages, not publications: they render but never enter feeds or archives', async (t) => {
  const contentDir = await vaultFixture(t);
  const result = await build({ contentDir, site: SITE, catalog: { dialect: 'vault', exclude: ['drafts'] } });

  const feedPath = [...result.artifacts.keys()].find((path) => /feed.*\.json$/u.test(path));
  assert.ok(feedPath, 'a JSON feed is projected');
  const feed = JSON.parse(result.artifacts.get(feedPath));
  assert.deepEqual(feed.items.map((item) => item.url), ['https://vault.example/intro/']);
  assert.equal(result.report.publishedCount, 2, 'both cells are published pages');
  assert.match(result.artifacts.get('notes/no-title/index.html'), /status active/);
  assert.doesNotMatch(result.artifacts.get('notes/no-title/index.html'), /Created undefined/);
});

test('the compiled World travels with the catalog for projectors that read doors, halls, and cards', async (t) => {
  const contentDir = await vaultFixture(t);
  const catalog = await assembleCatalog(contentDir, { catalog: { dialect: 'vault', exclude: ['drafts'], wing: 'fixture' }, routeName });
  assert.equal(catalog.vault.config.id, 'fixture');
  assert.equal(catalog.vault.rooms.length, 2);
  assert.equal(catalog.vault.dialect, 'house');
  assert.ok(catalog.vault.doors.some((door) => door.from === 'intro.md' && door.to === 'notes/no-title.md' && door.weight === 'hard'));
});

test('the catalog configuration is closed and typed', () => {
  assert.deepEqual(normalizeProjectConfig({}).config.catalog, DEFAULT_CATALOG);

  const vault = normalizeProjectConfig({ catalog: { dialect: 'vault', exclude: ['drafts'], wing: 'w', source: 'house', attributeFields: ['type'] } });
  assert.deepEqual(vault.refusals, []);
  assert.deepEqual(vault.config.catalog, { dialect: 'vault', source: 'house', wing: 'w', exclude: ['drafts'], attributeFields: ['type'] });

  const unknownDialect = normalizeProjectConfig({ catalog: { dialect: 'nope' } });
  assert.ok(unknownDialect.refusals.some((r) => r.subject === 'config.catalog.dialect'));
  assert.deepEqual(unknownDialect.config.catalog, DEFAULT_CATALOG);

  const publicationWithVaultKeys = normalizeProjectConfig({ catalog: { source: 'house' } });
  assert.ok(publicationWithVaultKeys.refusals.some((r) => r.subject === 'config.catalog.source' && /only a vault catalog/u.test(r.reason)));

  const badExclude = normalizeProjectConfig({ catalog: { dialect: 'vault', exclude: 'drafts' } });
  assert.ok(badExclude.refusals.some((r) => r.subject === 'config.catalog.exclude'));

  const unknownKey = normalizeProjectConfig({ catalog: { dialect: 'vault', mystery: true } });
  assert.ok(unknownKey.refusals.some((r) => r.subject === 'config.catalog.mystery'));
});

test('tufte: false omits the atlas and neighborhood projections and the links that would name them', async (t) => {
  const contentDir = await vaultFixture(t);
  const withTufte = await build({ contentDir, site: SITE, catalog: { dialect: 'vault', exclude: ['drafts'] } });
  assert.ok(withTufte.artifacts.has('atlas/index.html'));
  assert.ok(withTufte.artifacts.has('intro/neighborhood/index.html'));

  const without = await build({ contentDir, site: SITE, tufte: false, catalog: { dialect: 'vault', exclude: ['drafts'] } });
  assert.equal(without.report.releasable, true, JSON.stringify(without.report.refusals));
  assert.equal(without.artifacts.has('atlas/index.html'), false);
  assert.equal([...without.artifacts.keys()].some((path) => path.includes('/neighborhood/')), false);
  assert.doesNotMatch(without.artifacts.get('intro/index.html'), /\/neighborhood\/|\/atlas\//);
  assert.doesNotMatch(without.artifacts.get('sitemap.xml'), /neighborhood|atlas/);
  assert.ok(normalizeProjectConfig({ tufte: 'no' }).refusals.some((r) => r.subject === 'config.tufte'));
  assert.equal(normalizeProjectConfig({}).config.tufte, true);
});

test('vault cell names are routes: prose file names slug per segment, and links authored in prose still resolve', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-vault-routes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  await mkdir(join(contentDir, 'People & Places'), { recursive: true });
  // A link URL cannot carry parentheses in this dialect, as in the vault compiler; the
  // punctuation is exercised through the wikilink and the route.
  await writeFile(join(contentDir, 'People & Places', "Aaron Bushnell & Co (2024), it's.md"), `---\ntitle: Aaron\n---\n\nSee [[Lakȟótiyapi]] and [the file](../Lakȟótiyapi.md).\n`);
  await writeFile(join(contentDir, 'Lakȟótiyapi.md'), `---\ntitle: Lakota\n---\n\nSee [[Aaron Bushnell & Co (2024), it's]].\n`);
  const result = await build({ contentDir, site: SITE, tufte: false, catalog: { dialect: 'vault' } });

  assert.equal(result.report.releasable, true, JSON.stringify(result.report.refusals.slice(0, 3)));
  assert.deepEqual([...result.catalog.cells.keys()].sort(), ['lakhotiyapi', 'people-places/aaron-bushnell-co-2024-it-s']);
  assert.ok(result.artifacts.has('people-places/aaron-bushnell-co-2024-it-s/index.html'));
  assert.ok([...result.artifacts.keys()].every((path) => !/[\s&'(),]/u.test(path)), 'no artifact path carries prose punctuation');
  const lakota = result.artifacts.get('lakhotiyapi/index.html');
  assert.match(lakota, /href="\/people-places\/aaron-bushnell-co-2024-it-s\/"[^>]*>Aaron</, 'the wikilink authored in prose resolves to the route');
  const aaron = result.artifacts.get('people-places/aaron-bushnell-co-2024-it-s/index.html');
  assert.match(aaron, /href="\/lakhotiyapi\/"[^>]*>Lakota</, 'the wikilink to a diacritic name resolves to its ASCII route');
  assert.match(aaron, /href="\/lakhotiyapi\/">the file</, 'the document link resolves to the route');
  assert.equal(result.catalog.cells.get('people-places/aaron-bushnell-co-2024-it-s').source.provenance.href.includes('People%20&%20Places'), true, 'provenance keeps the real path');
});

test('under the vault dialect a body the publication dialect would refuse is advised and rendered, not refused', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-vault-advise-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  await mkdir(contentDir, { recursive: true });
  await writeFile(join(contentDir, 'skips.md'), `---\ntitle: Skips\n---\n\n## Contents\n\n#### Deep\n\nCites [@missing] and shows ![pic](data:image/png;base64,AAAA).\n\n\`\`\`\nuntagged\n\`\`\`\n`);
  const result = await build({ contentDir, site: SITE, tufte: false, catalog: { dialect: 'vault' } });

  assert.equal(result.report.releasable, true, JSON.stringify(result.report.refusals.slice(0, 3)));
  const advised = result.report.advisories.filter((a) => a.subject === 'skips').map((a) => a.code);
  assert.ok(advised.includes('R-10'), 'the heading skip is reported');
  assert.ok(advised.includes('R-03'), 'the unknown citation is reported');
  assert.ok(advised.includes('A-06'), 'the untagged fence is reported');
  const page = result.artifacts.get('skips/index.html');
  assert.match(page, /<h2 id="contents-2">Contents<\/h2>/, 'a body heading never claims the shell tile id');
  assert.match(page, /<h3 id="deep">Deep<\/h3>/, 'the rendered outline closes the skipped level');
  assert.doesNotMatch(page, /data:image/);
  assert.match(page, /<span class="potential-image">pic<\/span>/);
});

test('a relative link without extension is a document reference: resolved it routes, unresolved it is a potential link, never a dangling anchor', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-vault-relative-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  await mkdir(contentDir, { recursive: true });
  await writeFile(join(contentDir, 'Free Palestine.md'), `---\ntitle: Free Palestine\n---\n\nA cause.\n`);
  await writeFile(join(contentDir, 'aaron.md'), `---\ntitle: Aaron\n---\n\nHe said [Free Palestine](Free Palestine) and [this](Stop Cop City) and [that](self-immolating|self-immolated#x).\n`);
  const result = await build({ contentDir, site: SITE, tufte: false, catalog: { dialect: 'vault' } });
  assert.equal(result.report.releasable, true, JSON.stringify(result.report.refusals.slice(0, 3)));
  const page = result.artifacts.get('aaron/index.html');
  assert.match(page, /href="\/free-palestine\/"[^>]*>Free Palestine</);
  assert.match(page, /<span class="potential-link">this<sup/);
  assert.match(page, /<span class="potential-link">that<sup/);
  assert.doesNotMatch(page, /href="Stop Cop City"|href="self-immolating/);
});

test('two files that reduce to one route are both served, deterministically, with an advisory instead of a refusal', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-vault-collide-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  await mkdir(contentDir, { recursive: true });
  await writeFile(join(contentDir, 'Digital Computer.md'), `---\ntitle: Digital Computer\n---\n\nOne.\n`);
  await writeFile(join(contentDir, 'digital-computer.md'), `---\ntitle: digital computer\n---\n\nTwo, linking [[Digital Computer]].\n`);
  const result = await build({ contentDir, site: SITE, tufte: false, catalog: { dialect: 'vault' } });
  assert.equal(result.report.releasable, true, JSON.stringify(result.report.refusals.slice(0, 3)));
  assert.deepEqual([...result.catalog.cells.keys()].sort(), ['digital-computer', 'digital-computer-2']);
  assert.equal(result.catalog.cells.get('digital-computer').title, 'Digital Computer', 'room-id order decides: "Digital Computer.md" sorts before "digital-computer.md"');
  assert.ok(result.report.advisories.some((a) => a.code === 'A-08' && a.subject === 'digital-computer-2'));
  assert.ok(result.artifacts.has('digital-computer-2/index.html'));
});

test('an authored reference the site cannot honor is advised under a vault and refused under a publication, and the policy is explicit', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-vault-authored-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  await mkdir(contentDir, { recursive: true });
  await writeFile(join(contentDir, 'note.md'), `---\ntitle: Note\ndate-created: 2026-01-01\ntype: note\n---\n\nSee [directive](/018) and ![shot](screenshot.png).\n`);
  const vault = await build({ contentDir, site: SITE, tufte: false, catalog: { dialect: 'vault' } });
  assert.equal(vault.report.releasable, true, JSON.stringify(vault.report.refusals.slice(0, 3)));
  assert.equal(vault.report.advisories.filter((a) => a.code === 'SSC-106').length, 2, 'the path and the sibling image are both reported');
  const publication = await build({ contentDir, site: SITE, tufte: false, home: false, archives: false, search: false });
  assert.equal(publication.report.releasable, false);
  assert.ok(publication.report.refusals.some((r) => r.code === 'SSC-106'));
  const strictVault = await build({ contentDir, site: SITE, tufte: false, catalog: { dialect: 'vault' }, conformance: { authoredReferences: 'refuse' } });
  assert.equal(strictVault.report.releasable, false);
  const badPolicy = await build({ contentDir, site: SITE, tufte: false, catalog: { dialect: 'vault' }, conformance: { authoredReferences: 'maybe' } });
  assert.ok(badPolicy.report.refusals.some((r) => r.subject === 'config.conformance.authoredReferences'));
});

test('a projector renders a cell through the build context and finds each room by name', async (t) => {
  const contentDir = await vaultFixture(t);
  let seen = null;
  const projector = { name: 'probe', priority: 90, project(context) { seen = context; return { artifacts: [] }; } };
  const result = await build({ contentDir, site: SITE, tufte: false, catalog: { dialect: 'vault', exclude: ['drafts'] }, projectors: [projector] });
  assert.equal(result.report.releasable, true);
  assert.equal(typeof seen.renderCell, 'function');
  assert.equal(seen.catalog.vault.names['notes/no-title.md'], 'notes/no-title');
  const cell = seen.catalog.cells.get(seen.catalog.vault.names['intro.md']);
  assert.match(seen.renderCell(cell), /<p>The opening room\.<\/p>/);
});
