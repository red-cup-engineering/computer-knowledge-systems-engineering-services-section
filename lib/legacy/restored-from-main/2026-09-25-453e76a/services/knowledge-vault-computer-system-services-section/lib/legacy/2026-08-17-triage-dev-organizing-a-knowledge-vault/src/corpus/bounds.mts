/**
 * corpus/bounds - shared bounded-read law for the persistent memorystore.
 */

export const DEFAULT_CORPUS_LIMIT = 200;
export const DEFAULT_CORPUS_MAX_SCAN = 20_000;
export const MAX_CORPUS_LIMIT = 5_000;
export const MAX_CORPUS_SCAN = 80_000;
export const DEFAULT_CORPUS_LIST_LIMIT = 200;
export const MAX_CORPUS_LIST_LIMIT = 1_000;

export interface CorpusReadBounds {
  readonly limit: number;
  readonly maxScan: number;
}

export function corpusReadBounds(limit: number | string | undefined, maxScan: number | string | undefined): CorpusReadBounds {
  return Object.freeze({
    limit: bound(limit, DEFAULT_CORPUS_LIMIT, MAX_CORPUS_LIMIT),
    maxScan: bound(maxScan, DEFAULT_CORPUS_MAX_SCAN, MAX_CORPUS_SCAN),
  });
}

export function corpusListLimit(limit: number | string | undefined): number {
  return bound(limit, DEFAULT_CORPUS_LIST_LIMIT, MAX_CORPUS_LIST_LIMIT);
}

function bound(value: number | string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}
