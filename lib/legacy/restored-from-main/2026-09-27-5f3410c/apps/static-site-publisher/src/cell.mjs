// The cell vocabulary every catalog dialect shares: the closed publication
// type list, the status list, and the canonical AST form an address is taken
// over. Dialect-specific admission lives in catalog.mjs and vault-catalog.mjs.

export const CONTENT_TYPES = Object.freeze(['article', 'note', 'letter', 'glossary-term', 'glossary-topic', 'record', 'index', 'page', 'paper', 'chapter']);
export const STATUSES = Object.freeze(['potential', 'active', 'stable', 'absurd']);

// The AST is the canonical body form; strip render-time-only artifacts.
export function astForAddress(blocks) {
  return JSON.parse(JSON.stringify(blocks, (k, v) => (v === undefined ? null : v)));
}

// A route segment: ASCII, lowercase, and drawn from the characters a cell name
// may carry. Combining marks are dropped after compatibility decomposition, so
// "Lakȟótiyapi" routes as "lakhotiyapi"; every other run of characters outside
// the vocabulary becomes one hyphen.
export function routeSegment(text) {
  const slug = String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return slug || 'untitled';
}

/** A route name: slash-joined route segments of a vault-relative path. */
export function routeName(path) {
  return String(path).split('/').filter((segment) => segment.length > 0).map(routeSegment).join('/');
}

export function withoutBytes(record) {
  const { bytes: _bytes, ...descriptor } = record;
  return Object.freeze(descriptor);
}
