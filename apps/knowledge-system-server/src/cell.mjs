// The cell vocabulary every catalog dialect shares: the closed publication
// type list, the status list, and the canonical AST form an address is taken
// over. Dialect-specific admission lives in catalog.mjs and vault-catalog.mjs.

export const CONTENT_TYPES = Object.freeze(['article', 'note', 'letter', 'glossary-term', 'glossary-topic', 'record', 'index', 'page', 'paper', 'chapter']);
export const STATUSES = Object.freeze(['potential', 'active', 'stable', 'absurd']);

// The AST is the canonical body form; strip render-time-only artifacts.
export function astForAddress(blocks) {
  return JSON.parse(JSON.stringify(blocks, (k, v) => (v === undefined ? null : v)));
}

export function withoutBytes(record) {
  const { bytes: _bytes, ...descriptor } = record;
  return Object.freeze(descriptor);
}
