// Per-reader review state. The shared vault is read-only; what a reader has
// reviewed belongs to that reader, keyed by a pseudonymous subject hash that
// the admission boundary supplies and this module never derives.

/** The one table review state lives in, for any SQLite-shaped store. */
export const REVIEW_STORE_SCHEMA = `CREATE TABLE IF NOT EXISTS vaultmaze_reviews (
  subject_hash TEXT NOT NULL,
  card_id TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  stability REAL NOT NULL CHECK (stability >= 0),
  difficulty REAL NOT NULL CHECK (difficulty >= 0),
  PRIMARY KEY (subject_hash, card_id)
);
CREATE INDEX IF NOT EXISTS vaultmaze_reviews_due ON vaultmaze_reviews (subject_hash, reviewed_at);`;

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
 * A store over any database exposing the D1 statement shape:
 * `prepare(sql).bind(...values)` with `all()` returning `{ results }` and
 * `run()` executing. Cloudflare D1 and the Node SQLite adapter both do.
 */
export function createReviewStore(database) {
  if (!database || typeof database.prepare !== 'function') throw new TypeError('a review store needs a database with prepare()');
  return Object.freeze({
    async list(subjectHash) {
      const subject = requireSubject(subjectHash);
      const result = await database.prepare(
        'SELECT card_id, reviewed_at, rating, stability, difficulty FROM vaultmaze_reviews WHERE subject_hash = ? ORDER BY card_id',
      ).bind(subject).all();
      return result.results.map((row) => Object.freeze({
        cardId: row.card_id, reviewedAt: row.reviewed_at, rating: row.rating, stability: row.stability, difficulty: row.difficulty,
      }));
    },
    async put(subjectHash, record) {
      const subject = requireSubject(subjectHash);
      const admitted = validateReviewRecord(record);
      if (admitted === null) throw new TypeError('not a review record');
      await database.prepare(`INSERT INTO vaultmaze_reviews (subject_hash, card_id, reviewed_at, rating, stability, difficulty)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (subject_hash, card_id) DO UPDATE SET
          reviewed_at = excluded.reviewed_at, rating = excluded.rating, stability = excluded.stability, difficulty = excluded.difficulty`)
        .bind(subject, admitted.cardId, admitted.reviewedAt, admitted.rating, admitted.stability, admitted.difficulty).run();
    },
  });
}
