/** Corpus custody and working strata are not admitted reading documents. */
export const EXCLUDED_SEGMENTS = Object.freeze(['legacy', 'triage', 'private', 'dev', 'test', 'fixtures', 'dist', 'sites', 'lib']);

/** Read-only source publication eligibility, shared by L-Space's public URLs
 * and human/MCP link projections. A claimed `visibility: public` is necessary;
 * a source's consent-status field withholds publication until its true owning
 * authority resolves the restriction. This pure test is not a license grant. */
export function publicSourceVisible(document) {
  const properties=document?.properties;
  return properties?.visibility === 'public'
    && !Object.hasOwn(properties, 'consent-status');
}

/** The existing MetroPlat archive selection, shared with exact-source preparation.
 * This pure policy does not acquire/materialize a corpus or admit a principal. */
export function lSpaceReaderPolicy({sciencePrefix, excludes} = {}) {
  if (sciencePrefix !== undefined && (
    typeof sciencePrefix !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(sciencePrefix) ||
    sciencePrefix === '.' || sciencePrefix === '..'
  )) throw new TypeError('sciencePrefix must name one declared corpus section');

  // Corpus custody and private strata cannot be disabled by caller exclusions.
  const additions = excludes ?? [];
  if (!Array.isArray(additions) || additions.some(segment =>
    typeof segment !== 'string' || !segment.trim() || segment === '.' || segment === '..' ||
    /[\\/\0]/u.test(segment))) {
    throw new TypeError('excludes must be an array of relative single path segments');
  }
  const extra = [...new Set(additions.filter(segment => !EXCLUDED_SEGMENTS.includes(segment)))];
  const effectiveExcludes = extra.length ? Object.freeze([...EXCLUDED_SEGMENTS, ...extra]) : EXCLUDED_SEGMENTS;
  return Object.freeze({
    excludes: effectiveExcludes,
    // A content/text directory is not evidence that its *parent section* was
    // authorized. The former unanchored shortcut crossed principal boundaries.
    // Refuse traversal, absolute paths and ambiguous separators before any
    // archive/index/search/fetch consumer can observe a document.
    admitPath: path => typeof path === 'string'
      && !path.startsWith('/') && !path.includes('\\') && !path.includes('\0')
      && path.split('/').every(segment => segment && segment !== '.' && segment !== '..')
      && (sciencePrefix === undefined || path.startsWith(`${sciencePrefix}/`)),
  });
}
