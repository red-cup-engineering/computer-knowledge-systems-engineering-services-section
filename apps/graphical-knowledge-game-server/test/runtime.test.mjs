import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createVaultMazeRuntime, refreshVaultMazeRelease } from '../src/runtime.mjs';

const note = (title, body) => `---
title: ${title}
type: note
---

${body}
`;
const manifestOf = (runtime) => {
  const response = runtime.application.resources[0].handler({
    url: new URL('https://example.test/vault/manifest.json'),
    req: { headers: {} },
  });
  return JSON.parse(Buffer.from(response.body).toString());
};

test('runtime verifies per-file traces, cuts off an unchanged release, and ignores its revision label', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'vaultmaze-runtime-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'vault');
  const cacheDir = join(directory, 'cache');
  await mkdir(root);
  const first = join(root, 'first.md');
  const second = join(root, 'second.md');
  await writeFile(first, note('First', 'The first room links to [[Second]].'));
  await writeFile(second, note('Second', 'The second room.'));

  let derivations = 0;
  let parsedFiles = 0;
  const instrumentation = {
    onDerivation: () => { derivations += 1; },
    onFileParsed: () => { parsedFiles += 1; },
  };
  const derive = (input) => refreshVaultMazeRelease(input, {
    assemble: async ({ vault, options }) => ({
      documents: [{ path: 'vault/manifest.json', body: JSON.stringify({ sourceRevision: options.sourceRevision ?? null }) }],
      rooms: vault.rooms.map((room) => ({
        id: room.id,
        key: createHash('sha256').update(room.id).digest('hex'),
        visibility: 'authenticated',
        detail: { room: { id: room.id }, cards: [] },
      })),
    }),
  });
  const options = {
    root,
    catalog: { wing: 'fixture', source: 'house' },
    site: { baseIri: 'https://example.test/', language: 'en' },
    projection: { title: 'Fixture' },
    cacheDir,
    instrumentation,
    derive,
  };

  const cold = await createVaultMazeRuntime({ ...options, sourceRevision: 'one' });
  assert.equal(cold.rooms, 2);
  assert.equal(manifestOf(cold).sourceRevision, 'one');
  assert.equal(derivations, 1);
  assert.equal(parsedFiles, 2);

  await (await createVaultMazeRuntime({ ...options, sourceRevision: 'one' })).refreshed;
  assert.equal(derivations, 1, 'an unchanged restart reuses the complete release');
  assert.equal(parsedFiles, 2);

  await writeFile(second, note('Second', 'The changed second room.'));
  const warm = await createVaultMazeRuntime({ ...options, sourceRevision: 'one' });
  assert.equal(warm.rooms, 2, 'a restart answers with the cached release while it refreshes');
  await warm.refreshed;
  assert.equal(derivations, 2);
  assert.equal(parsedFiles, 3, 'only the changed note is parsed again');

  const relabeled = await createVaultMazeRuntime({ ...options, sourceRevision: 'two' });
  await relabeled.refreshed;
  assert.equal(derivations, 2, 'the source revision is an output label, not a derivation input');
  assert.equal(parsedFiles, 3);
  assert.equal(manifestOf(relabeled).sourceRevision, 'two');
});
