// Term-graph search over the declared-relation ledger's EAVT rows -- the MCP face's `vault_search`
// surface. This never reads a document body: it tokenizes the query and matches tokens against
// term names, keyword values, and title words already sitting in `ledger.rows`.

function tokenize(text) {
  return text.toLowerCase().split(/[\s-]+/u).filter(Boolean);
}

/**
 * Rank every document the ledger names by how many distinct query tokens it matches.
 *
 * The query is tokenized on whitespace and hyphens, so a query token such as "path" matches a
 * declared value stored as the compound token "proof-path". A document matching only one token
 * still appears; documents matching more tokens rank ahead of it. Refusal rows never contribute
 * (a gap is not a declaration), and `titled` rows contribute title words to matching but are
 * never themselves offered as a "matched term".
 *
 * @param {{rows: {e: string, a: string, v: unknown}[]}} ledger
 * @param {string} query
 * @param {{limit?: number}} [options]
 * @returns {{path: string, title: string|null, matchedTerms: string[], score: number}[]}
 */
export function searchDeclaredRelationLedger(ledger, query, { limit = 25 } = {}) {
  if (!ledger || !Array.isArray(ledger.rows)) throw new TypeError("ledger must carry rows");
  if (typeof query !== "string") throw new TypeError("query must be a string");
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("limit must be a positive safe integer");

  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return Object.freeze([]);

  const titleByDocument = new Map();
  const termsByDocument = new Map();
  for (const row of ledger.rows) {
    if (row.a === "refused" || typeof row.v !== "string") continue;
    if (row.a === "titled") { titleByDocument.set(row.e, row.v); continue; }
    let terms = termsByDocument.get(row.e);
    if (!terms) { terms = new Set(); termsByDocument.set(row.e, terms); }
    terms.add(row.v);
  }

  const documents = new Set([...titleByDocument.keys(), ...termsByDocument.keys()]);
  const hits = [];
  for (const path of documents) {
    const terms = termsByDocument.get(path) ?? new Set();
    const title = titleByDocument.get(path) ?? null;
    const matchedTokens = new Set();
    const matchedTerms = new Set();
    for (const term of terms) {
      for (const word of tokenize(term)) {
        if (queryTokens.has(word)) { matchedTokens.add(word); matchedTerms.add(term); }
      }
    }
    if (title !== null) {
      for (const word of tokenize(title)) if (queryTokens.has(word)) matchedTokens.add(word);
    }
    if (matchedTokens.size === 0) continue;
    hits.push(Object.freeze({ path, title, matchedTerms: Object.freeze([...matchedTerms].sort()), score: matchedTokens.size }));
  }
  hits.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  return Object.freeze(hits.slice(0, limit));
}
