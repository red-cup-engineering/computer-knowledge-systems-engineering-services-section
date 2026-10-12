import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';

import { generateActorKeyMaterial } from '@red-cup-engineering/activitypub-services-section/keys';
import { importActorKeyPairs } from '@red-cup-engineering/activitypub-services-section';
import { createPublicationActivityPubProvider } from '@red-cup-engineering/activitypub-services-section/publication';
import { matchesActivityPubRequest } from '@red-cup-engineering/activitypub-services-section/app';
import { publicationActivityPubApplication } from '@red-cup-engineering/activitypub-server/publication';
import { indiewebApplications } from '@red-cup-engineering/indieweb-server';
import { parseCell } from '@red-cup-engineering/knowledge-system-server/catalog';
import { createVictorApplication, ownsVictorTarget } from '../src/runtime.mjs';

const source = (title) => `---\ntitle: ${title}\ndate-created: 2026-08-27\ntype: note\ntags:\n- living-web\n---\n\nBody.`;

function buildResult(names) {
  const cells = new Map(names.map((name) => [name, parseCell(name, source(name))]));
  return {
    artifacts: new Map([['index.html', '<!doctype html><title>site</title>']]),
    artifactRecords: new Map(),
    catalog: { cells, redirects: new Map(), incoming: new Map() },
    site: { name: 'Living Site', baseIri: 'https://site.example/', language: 'en', menu: [], license: 'Test' },
    report: { releasable: true, refusals: [] },
  };
}

test('VICTOR mounts the IndieWeb server and ActivityPub beside the site, both reading it live', async () => {
  const keyPairs = await importActorKeyPairs(await generateActorKeyMaterial());
  const activityCustody = [];
  const mentionCustody = [];
  let activityOptions;
  const factory = async (context) => [
    ...indiewebApplications(context, {
      verifyToken: async (token) => token === 'valid' ? { me: 'https://site.example/', scope: 'create update' } : null,
      micropub: { write: async () => ({ url: 'https://site.example/new/' }) },
      webmention: {
        custody: async (record) => { mentionCustody.push(record); },
        verify: async (sourceUrl, targetUrl) => ({
          status: 'verified', verified: true, retract: false, type: 'mention', linkCount: 1,
          httpStatus: 200, source: sourceUrl, target: targetUrl,
        }),
      },
    }),
    await publicationActivityPubApplication(context, {
      createProvider(options) {
        activityOptions = options;
        return createPublicationActivityPubProvider(options);
      },
      identifier: 'site', actorName: 'Living Site', summary: 'Published documents.',
      keyPairs,
      custody: async (arrival) => { activityCustody.push(arrival); },
      authorizeInbox: async () => true,
    }),
  ];

  const app = await createVictorApplication(buildResult(['one']), factory, { observability: false, probes: false });
  assert.ok(app.resources.some(({ id }) => id === 'webmention.receiver'));
  assert.ok(app.resources.some(({ id }) => id === 'activitypub.actor'));
  assert.ok(app.resources.some(({ id }) => id === 'micropub.endpoint'));
  const micropubEndpoint = app.resources.find(({ id }) => id === 'micropub.endpoint');
  const micropubConfig = await micropubEndpoint.handler({
    req: { method: 'GET', headers: { authorization: 'Bearer valid' } },
    url: new URL('https://site.example/micropub?q=config'),
  });
  assert.equal(micropubConfig.status, 200);
  assert.equal((await activityOptions.listPublications()).length, 1);
  await activityOptions.inbox.onActivity({ jsonLd: { type: 'Like' } });
  assert.equal(activityCustody.length, 1);

  const receiver = app.resources.find(({ id }) => id === 'webmention.receiver');
  const request = Readable.from(['source=https%3A%2F%2Fsource.example%2Fpost&target=https%3A%2F%2Fsite.example%2F']);
  Object.assign(request, { headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  const response = await receiver.handler({ req: request });
  assert.equal(response.status, 202);
  assert.equal(mentionCustody.length, 1);
  assert.equal(mentionCustody[0].observation.relations[0].object, 'https://site.example/');

  app.updateBuild(buildResult(['one', 'two']));
  assert.equal((await activityOptions.listPublications()).length, 2, 'ActivityPub observes VICTOR rebuilds');
});

test('the ActivityPub mount predicate claims provider routes without swallowing site pages', () => {
  for (const path of ['/.well-known/webfinger', '/.well-known/nodeinfo', '/nodeinfo/2.1', '/inbox', '/actors/site', '/actors/site/outbox']) {
    assert.equal(matchesActivityPubRequest(new Request(`https://site.example${path}`), 'site'), true, path);
  }
  assert.equal(matchesActivityPubRequest(new Request('https://site.example/articles/one/'), 'site'), false);
  assert.equal(matchesActivityPubRequest(new Request('https://site.example/actors/someone-else'), 'site'), false);
});

test('Webmention target ownership follows the current artifact inventory', () => {
  let current = buildResult(['one']);
  current.artifacts.set('one/index.html', 'one');
  const owns = ownsVictorTarget(() => current);
  assert.equal(owns(new URL('https://site.example/one/')), true);
  assert.equal(owns(new URL('https://site.example/one')), true);
  assert.equal(owns(new URL('https://site.example/absent/')), false);
  assert.equal(owns(new URL('https://foreign.example/one/')), false);
  current = buildResult(['two']);
  current.artifacts.set('two/index.html', 'two');
  assert.equal(owns(new URL('https://site.example/one/')), false);
  assert.equal(owns(new URL('https://site.example/two/')), true);
});

test('lower applications refuse configurations they cannot honour', async () => {
  const context = { site: { baseIri: 'https://site.example/' }, listPublications: () => [], ownsTarget: () => true };
  await assert.rejects(publicationActivityPubApplication(context, { createProvider: () => ({}) }), /fetch/);
  await assert.rejects(publicationActivityPubApplication(context, { createProvider: () => ({ fetch() {} }), createApplication: () => null }), /HTTP application/);
  assert.throws(() => indiewebApplications(context, { micropub: { write: async () => ({}) } }), /verifyToken/);
  assert.throws(() => indiewebApplications({}, { webmention: { custody: async () => {} } }), /ownsTarget/);
});
