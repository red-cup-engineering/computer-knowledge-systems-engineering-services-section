// Per-reader review state. The shared vault is read-only; what a reader has
// reviewed belongs to that reader, keyed by a pseudonymous subject hash that
// the admission boundary supplies and this module never derives. Reviews are
// records of the store under the deployment's state root.

import { each, put } from '@red-cup-engineering/semiotic-eavt-services-section/store';

/**
 * Admit one review record as the browser submits it, or return null. Nothing
 * is coerced: a rating outside 1..4, a non-integer day, or a negative
 * stability is not a review.
 */
export function validateReviewRecord(offered) {
  if (!offered || typeof offered !== 'object' || Array.isArray(offered)) return null;
  const { cardId, reviewedAt, rating, stability, difficulty } = offered;
  const valid = typeof cardId === 'string' && cardId.length > 0
    && Number.isSafeInteger(reviewedAt) && reviewedAt > 0
    && Number.isInteger(rating) && rating >= 1 && rating <= 4
    && Number.isFinite(stability) && stability >= 0
    && Number.isFinite(difficulty) && difficulty >= 0;
  return valid ? Object.freeze({ cardId, reviewedAt, rating, stability, difficulty }) : null;
}

function requireSubject(subjectHash) {
  if (typeof subjectHash !== 'string' || !/^[a-f0-9]{64}$/u.test(subjectHash)) {
    throw new TypeError('a review subject is a 64-character hexadecimal pseudonym');
  }
  return subjectHash;
}

/** An in-process store for tests and single-reader previews. */
export function createMemoryReviewStore() {
  const rows = new Map();
  return Object.freeze({
    async list(subjectHash) {
      const subject = requireSubject(subjectHash);
      return [...(rows.get(subject)?.values() ?? [])].sort((a, b) => a.cardId.localeCompare(b.cardId));
    },
    async put(subjectHash, record) {
      const subject = requireSubject(subjectHash);
      const admitted = validateReviewRecord(record);
      if (admitted === null) throw new TypeError('not a review record');
      if (!rows.has(subject)) rows.set(subject, new Map());
      rows.get(subject).set(admitted.cardId, admitted);
    },
  });
}

/**
 * The review store of a deployment: each review a `vaultmaze-review` record of the store under
 * `root` (its state directory), and a reader's reviews the latest record per card.
 */
export function createReviewStore({ root }) {
  if (typeof root !== 'string' || root === '') throw new TypeError('a review store needs a state root');
  return Object.freeze({
    async list(subjectHash) {
      const subject = requireSubject(subjectHash);
      const latest = new Map();
      for (const { record } of each(root, 'vaultmaze-review')) {
        if (record.subject !== subject) continue;
        const prior = latest.get(record.cardId);
        if (!prior || record.reviewedAt >= prior.reviewedAt) latest.set(record.cardId, record);
      }
      return [...latest.values()].sort((a, b) => a.cardId.localeCompare(b.cardId)).map(({ cardId, reviewedAt, rating, stability, difficulty }) => Object.freeze({ cardId, reviewedAt, rating, stability, difficulty }));
    },
    async put(subjectHash, record) {
      const subject = requireSubject(subjectHash);
      const admitted = validateReviewRecord(record);
      if (admitted === null) throw new TypeError('not a review record');
      put(root, 'vaultmaze-review', { subject, ...admitted });
    },
  });
}
