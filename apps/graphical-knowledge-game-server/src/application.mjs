// The VaultMaze HTTP application: the one resource a reader writes to. It is
// mounted in VICTOR's runtime through the shared HTTP application contract.
// Who the reader is comes from the admission boundary as a pseudonymous
// subject; this application never authenticates anyone.

import { toWebRequest } from '@red-cup-engineering/http-services-section/web-bridge';
import { validateReviewRecord } from './review-store.mjs';

const JSON_TYPE = 'application/json; charset=utf-8';

// The request as a Fetch Request from either context the house serves: the web
// context carries one; the native Node context's incoming message is bridged.
function requestOf(context) {
  return context.request instanceof Request ? context.request : toWebRequest(context.req, { url: context.url, ...(context.signal ? { signal: context.signal } : {}) });
}

function json(status, value, headers = {}) {
  return { status, headers: { 'content-type': JSON_TYPE, ...headers }, body: JSON.stringify(value) };
}

/**
 * @param {object} options
 * @param {{ list(subject: string): Promise<object[]>, put(subject: string, record: object): Promise<void> }} options.reviews
 * @param {(context: object) => Promise<string | null> | string | null} options.subjectOf
 *   The reader's pseudonymous subject for this request, or null when nobody is
 *   admitted. The admission application supplies it; a deployment with no
 *   admission supplies a function that returns null, and reviews stay closed.
 * @param {string} [options.path]
 */
export function createVaultMazeApplication({ reviews, subjectOf, path = '/api/v1/reviews' } = {}) {
  if (!reviews || typeof reviews.list !== 'function' || typeof reviews.put !== 'function') throw new TypeError('a review store with list() and put() is required');
  if (typeof subjectOf !== 'function') throw new TypeError('subjectOf(context) is required');
  if (typeof path !== 'string' || !path.startsWith('/')) throw new TypeError('path must be a root-relative route');

  return Object.freeze({
    resources: Object.freeze([Object.freeze({
      id: 'vaultmaze-reviews',
      match: path,
      methods: Object.freeze(['GET', 'PUT']),
      async handler(context) {
        const subject = await subjectOf(context);
        if (subject === null || subject === undefined) {
          return json(401, { error: 'access-required' }, { 'www-authenticate': 'Bearer realm="vaultmaze"' });
        }
        const request = requestOf(context);
        if (request.method === 'GET') {
          return json(200, { reviews: await reviews.list(subject) });
        }
        let offered;
        try { offered = await request.json(); } catch { return json(400, { error: 'invalid-json' }); }
        const record = validateReviewRecord(offered);
        if (record === null) return json(400, { error: 'invalid-review' });
        await reviews.put(subject, record);
        return json(201, { stored: true });
      },
    })]),
  });
}
