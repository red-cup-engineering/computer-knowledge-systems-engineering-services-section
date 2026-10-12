import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { assembleCatalog, makeResolver, parseCell } from '../src/catalog.mjs';
import { createFilesystemContentReader } from '../src/content-reader.mjs';

const routeName = (path) => String(path).split('/').filter(Boolean).map((part) => part
  .normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
  .replace(/[^a-z0-9._~-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'untitled').join('/');

const source = (body, extra = '') => `---\ntitle: A Cell\ndate-created: 2026-09-27\ntype: note\n${extra}---\n\n${body}`;

test('CAIRN admits publication cells and resolves their names', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cairn-catalog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'notes'));
  await writeFile(join(root, 'notes', 'one.md'), source('See [[two]].'));
  await writeFile(join(root, 'two.md'), '---\ntitle: Two\ndate-created: 2026-09-27\ntype: note\nrenamed-from: old-two\n---\n\nTwo.');
  const reader = await createFilesystemContentReader({ root });
  const catalog = await assembleCatalog(root, { reader, routeName });
  assert.equal(catalog.report.refusals.length, 0);
  assert.equal(catalog.cells.size, 2);
  assert.equal(makeResolver(catalog.cells, catalog.redirects, { routeName })('old-two').href, '/two/');
  assert.ok(catalog.incoming.get('two').some(({ from }) => from === 'notes/one'));
});

test('CAIRN publication admission retains source evidence without source bytes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cairn-reader-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'one.md'), source('Body.'));
  const reader = await createFilesystemContentReader({ root });
  const catalog = await assembleCatalog(root, { reader, routeName });
  const cell = catalog.cells.get('one');
  assert.equal(cell.source.id, 'one.md');
  assert.equal('bytes' in cell.source, false);
  assert.match(cell.source.provenance.sha256, /^[A-Za-z0-9_-]{43}$/u);
});

test('CAIRN vault admission keeps open vault types and compiler doors', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'cairn-vault-catalog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'notes'));
  await writeFile(join(root, 'intro.md'), '---\ntitle: Intro\n---\n\nOpening.\n');
  await writeFile(join(root, 'notes', 'concept.md'), '---\ntype: concept\nrequires: ../intro.md\n---\n\nSee [intro](../intro.md).\n');
  const catalog = await assembleCatalog(root, { catalog: { dialect: 'vault' }, routeName });
  assert.equal(catalog.report.refusals.length, 0);
  assert.equal(catalog.cells.get('notes/concept').type, 'concept');
  assert.ok(catalog.cells.get('notes/concept').relations.some(({ type, to }) => type === 'requires' && to === 'intro'));
  assert.equal(catalog.vault.rooms.length, 2);
});

test('parseCell exposes CAIRN cell admission independently of publishing', () => {
  const refusals = [];
  const cell = parseCell('note', source('Body.'), refusals);
  assert.equal(refusals.length, 0);
  assert.equal(cell.name, 'note');
  assert.match(cell.address, /^ni:\/\/\/sha-256;/u);
});
