import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createVaultMazeApplication } from '../src/application.mjs';
import { createMemoryReviewStore, createReviewStore, validateReviewRecord } from '../src/review-store.mjs';

const SUBJECT = 'f'.repeat(64);
const record = { cardId: 'c1', reviewedAt: 20692, rating: 3, stability: 2.5, difficulty: 5 };

function context(method, body, subject = SUBJECT) {
  const request = new Request('https://vault.example/api/v1/reviews', {
    method,
    ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  return { request, url: new URL(request.url), params: {}, locals: { subject } };
}

test('the application is one resource that reads and writes a reader\'s own reviews', async () => {
  const reviews = createMemoryReviewStore();
  const application = createVaultMazeApplication({ reviews, subjectOf: (ctx) => ctx.locals.subject });
  assert.equal(application.resources.length, 1);
  const [resource] = application.resources;
  assert.equal(resource.match, '/api/v1/reviews');
  assert.deepEqual([...resource.methods], ['GET', 'PUT']);

  const empty = await resource.handler(context('GET'));
  assert.equal(empty.status, 200);
  assert.deepEqual(JSON.parse(empty.body), { reviews: [] });

  const stored = await resource.handler(context('PUT', record));
  assert.equal(stored.status, 201);
  const listed = await resource.handler(context('GET'));
  assert.deepEqual(JSON.parse(listed.body), { reviews: [record] });

  const another = await resource.handler(context('GET', undefined, 'e'.repeat(64)));
  assert.deepEqual(JSON.parse(another.body), { reviews: [] }, 'review state is private per subject');
});

test('nobody admitted means nothing read and nothing written', async () => {
  const reviews = createMemoryReviewStore();
  const application = createVaultMazeApplication({ reviews, subjectOf: () => null });
  const [resource] = application.resources;
  const read = await resource.handler(context('GET'));
  assert.equal(read.status, 401);
  assert.match(read.headers['www-authenticate'], /Bearer/u);
  const write = await resource.handler(context('PUT', record));
  assert.equal(write.status, 401);
  assert.deepEqual(await reviews.list(SUBJECT), []);
});

test('a review is validated as the browser submits it, and nothing is coerced', async () => {
  const reviews = createMemoryReviewStore();
  const [resource] = createVaultMazeApplication({ reviews, subjectOf: () => SUBJECT }).resources;
  assert.equal((await resource.handler(context('PUT', 'not json'))).status, 400);
  for (const bad of [
    { ...record, rating: 5 }, { ...record, rating: '3' }, { ...record, reviewedAt: 1.5 }, { ...record, reviewedAt: 0 },
    { ...record, stability: -1 }, { ...record, difficulty: Number.NaN }, { ...record, cardId: '' }, [],
  ]) {
    const response = await resource.handler(context('PUT', bad));
    assert.equal(response.status, 400, JSON.stringify(bad));
  }
  assert.deepEqual(validateReviewRecord({ ...record, extra: true }), record, 'unknown fields are not stored');
  assert.deepEqual(await reviews.list(SUBJECT), []);
});

test('the deployment review store reads from a state-root semantic record journal', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vaultmaze-review-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = createReviewStore({ root });
  assert.deepEqual(await store.list(SUBJECT), []);
  await assert.rejects(() => store.list('not-a-subject'), /pseudonym/u);
  await assert.rejects(() => store.put(SUBJECT, { ...record, rating: 5 }), /not a review record/u);
});
