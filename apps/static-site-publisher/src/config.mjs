export const DEFAULT_SITE = Object.freeze({
  name: 'A VICTOR Site',
  baseIri: 'https://example.invalid/',
  language: 'en',
  menu: Object.freeze([{ label: 'home', href: '/' }]),
  license: 'All rights reserved',
  showRecordMetadata: true,
  // The title of the tile that holds a page's own content.
  cellLabel: 'Publication',
});

export const PROJECT_CONFIG_VERSION = 1;
const PROJECT_CONFIG_KEYS = new Set(['configVersion', 'site', 'theme', 'publicDir', 'reader', 'projectors', 'applications', 'pwa', 'home', 'archives', 'search', 'assets', 'discovery', 'release', 'conformance', 'catalog', 'tufte']);

/** The publication dialect is the default catalog: title, date, and a known type are required. */
export const DEFAULT_CATALOG = Object.freeze({ dialect: 'publication' });
const CATALOG_DIALECTS = new Set(['publication', 'vault']);
const VAULT_CATALOG_KEYS = new Set(['source', 'wing', 'exclude', 'attributeFields']);
const VAULT_SOURCES = new Set(['house', 'obsidian', 'org']);

function stringList(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim() !== '');
}

/**
 * Normalize the catalog dialect selection. A vault catalog admits every
 * frontmattered Markdown file through the shared vault compiler; the optional
 * keys name the compiler's source dialect, the wing id, excluded path segments,
 * and the frontmatter fields that form concept halls.
 */
export function normalizeCatalog(supplied) {
  const refusals = [];
  if (supplied === undefined) return { catalog: DEFAULT_CATALOG, refusals };
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) {
    refusals.push({ code: 'R-15', subject: 'config.catalog', reason: 'catalog must be an object' });
    return { catalog: DEFAULT_CATALOG, refusals };
  }
  const dialect = supplied.dialect ?? 'publication';
  if (!CATALOG_DIALECTS.has(dialect)) {
    refusals.push({ code: 'R-15', subject: 'config.catalog.dialect', reason: `dialect must be one of ${[...CATALOG_DIALECTS].join(', ')}` });
    return { catalog: DEFAULT_CATALOG, refusals };
  }
  for (const key of Object.keys(supplied)) {
    if (key === 'dialect') continue;
    if (!VAULT_CATALOG_KEYS.has(key)) {
      refusals.push({ code: 'R-15', subject: `config.catalog.${key}`, reason: 'unknown catalog configuration key' });
    } else if (dialect !== 'vault') {
      refusals.push({ code: 'R-15', subject: `config.catalog.${key}`, reason: 'only a vault catalog takes this key' });
    }
  }
  if (dialect !== 'vault') return { catalog: DEFAULT_CATALOG, refusals };

  const catalog = { dialect: 'vault' };
  if (supplied.source !== undefined) {
    if (VAULT_SOURCES.has(supplied.source)) catalog.source = supplied.source;
    else refusals.push({ code: 'R-15', subject: 'config.catalog.source', reason: `source must be one of ${[...VAULT_SOURCES].join(', ')}` });
  }
  if (supplied.wing !== undefined) {
    if (typeof supplied.wing === 'string' && supplied.wing.trim() !== '') catalog.wing = supplied.wing;
    else refusals.push({ code: 'R-15', subject: 'config.catalog.wing', reason: 'wing must be a non-empty string' });
  }
  if (supplied.exclude !== undefined) {
    if (stringList(supplied.exclude)) catalog.exclude = Object.freeze([...supplied.exclude]);
    else refusals.push({ code: 'R-15', subject: 'config.catalog.exclude', reason: 'exclude must be an array of path segment globs' });
  }
  if (supplied.attributeFields !== undefined) {
    if (stringList(supplied.attributeFields)) catalog.attributeFields = Object.freeze([...supplied.attributeFields]);
    else refusals.push({ code: 'R-15', subject: 'config.catalog.attributeFields', reason: 'attributeFields must be an array of frontmatter field names' });
  }
  return { catalog: Object.freeze(catalog), refusals };
}

export function normalizeProjectConfig(input = {}) {
  const refusals = [];
  const supplied = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (supplied !== input) {
    refusals.push({ code: 'R-15', subject: 'config', reason: 'project configuration must be an object' });
  }
  for (const key of Object.keys(supplied)) {
    if (!PROJECT_CONFIG_KEYS.has(key)) {
      refusals.push({ code: 'R-15', subject: `config.${key}`, reason: 'unknown project configuration key' });
    }
  }

  const configVersion = supplied.configVersion ?? PROJECT_CONFIG_VERSION;
  if (configVersion !== PROJECT_CONFIG_VERSION) {
    refusals.push({
      code: 'R-15', subject: 'config.configVersion',
      reason: `configVersion must be ${PROJECT_CONFIG_VERSION}; received ${String(configVersion)}`,
    });
  }

  let publicDir = supplied.publicDir;
  if (publicDir !== undefined && (typeof publicDir !== 'string' || !publicDir.trim())) {
    refusals.push({ code: 'R-15', subject: 'config.publicDir', reason: 'publicDir must be a non-empty path string' });
    publicDir = undefined;
  }

  let applications = supplied.applications;
  const applicationValues = Array.isArray(applications) ? applications : [applications];
  if (applications !== undefined && typeof applications !== 'function' && applicationValues.some((item) => !item || typeof item !== 'object')) {
    refusals.push({
      code: 'R-15', subject: 'config.applications',
      reason: 'applications must be an HTTP application, an array of applications, or a factory function',
    });
    applications = undefined;
  }

  let reader = supplied.reader;
  if (reader !== undefined && (!reader || typeof reader.listRecords !== 'function' || typeof reader.readRecord !== 'function')) {
    refusals.push({
      code: 'R-15', subject: 'config.reader',
      reason: 'reader must implement listRecords() and readRecord(record)',
    });
    reader = undefined;
  }

  let projectors = supplied.projectors;
  if (projectors !== undefined && !Array.isArray(projectors)) {
    refusals.push({ code: 'R-15', subject: 'config.projectors', reason: 'projectors must be an array' });
    projectors = undefined;
  }

  let pwa = supplied.pwa;
  if (pwa !== undefined && pwa !== false && (!pwa || typeof pwa !== 'object' || Array.isArray(pwa))) {
    refusals.push({ code: 'R-15', subject: 'config.pwa', reason: 'pwa must be false or a progressive web app configuration object' });
    pwa = undefined;
  }

  let home = supplied.home;
  if (home !== undefined && typeof home !== 'boolean' && !(typeof home === 'string' && home.trim() !== '')) {
    refusals.push({ code: 'R-15', subject: 'config.home', reason: 'home must be true, false, or the non-empty name of the cell that owns the root route' });
    home = false;
  }

  // The TUFTE atlas and per-cell neighborhood pages are projections over the
  // catalog; the TUFTE renderer itself is not optional. A catalog of tens of
  // thousands of cells may decline to double its page count.
  let tufte = supplied.tufte;
  if (tufte !== undefined && typeof tufte !== 'boolean') {
    refusals.push({ code: 'R-15', subject: 'config.tufte', reason: 'tufte must be a boolean' });
    tufte = undefined;
  }

  let search = supplied.search;
  if (search !== undefined && search !== false && (!search || typeof search !== 'object' || Array.isArray(search))) {
    refusals.push({ code: 'R-15', subject: 'config.search', reason: 'search must be false or a public site search configuration object' });
    search = {};
  }

  let assets = supplied.assets;
  if (assets !== undefined && assets !== false && (!assets || typeof assets !== 'object' || Array.isArray(assets))) {
    refusals.push({ code: 'R-15', subject: 'config.assets', reason: 'assets must be false or a browser asset transformation configuration object' });
    assets = {};
  }

  let release = supplied.release;
  if (release !== undefined && release !== false && (!release || typeof release !== 'object' || Array.isArray(release))) {
    refusals.push({ code: 'R-15', subject: 'config.release', reason: 'release must be false or a web release candidate configuration object' });
    release = {};
  }
  if (release && typeof release === 'object') {
    // The release directory's declared size: the verifier's limits. A site that
    // releases a page and a record for every note of a forest says so here.
    for (const limit of ['maxFiles', 'maxBytes']) {
      const value = release[limit];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        refusals.push({ code: 'R-15', subject: `config.release.${limit}`, reason: `release.${limit} must be a non-negative safe integer` });
        release = Object.fromEntries(Object.entries(release).filter(([key]) => key !== limit));
      }
    }
  }

  let conformance = supplied.conformance;
  if (conformance !== undefined && conformance !== false && (!conformance || typeof conformance !== 'object' || Array.isArray(conformance))) {
    refusals.push({ code: 'R-15', subject: 'config.conformance', reason: 'conformance must be false or a rendered-HTML conformance configuration object' });
    conformance = {};
  }

  const normalizedArchives = normalizeArchives(supplied.archives);
  refusals.push(...normalizedArchives.refusals);
  const normalizedDiscovery = normalizeDiscovery(supplied.discovery);
  refusals.push(...normalizedDiscovery.refusals);
  const normalizedCatalog = normalizeCatalog(supplied.catalog);
  refusals.push(...normalizedCatalog.refusals);

  return {
    config: {
      configVersion: PROJECT_CONFIG_VERSION,
      site: supplied.site,
      theme: supplied.theme,
      publicDir,
      catalog: normalizedCatalog.catalog,
      reader,
      projectors,
      applications,
      pwa: pwa === false ? undefined : pwa,
      home: home ?? true,
      tufte: tufte ?? true,
      search: search === false ? false : (search ?? {}),
      assets: assets === false ? false : (assets ?? {}),
      release: release === false ? false : (release ?? {}),
      conformance: conformance === false ? false : (conformance ?? {}),
      discovery: normalizedDiscovery.discovery,
      archives: normalizedArchives.archives.enabled
        ? Object.freeze({ pageSize: normalizedArchives.archives.pageSize })
        : false,
    },
    refusals,
  };
}

export function normalizeDiscovery(input) {
  const refusals = [];
  if (input === undefined || input === false) return { discovery: Object.freeze({}), refusals };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { discovery: Object.freeze({}), refusals: [{ code: 'R-15', subject: 'config.discovery', reason: 'discovery must be false or an object' }] };
  }
  const allowed = new Set(['webmention', 'micropub', 'indieauthMetadata', 'me']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) refusals.push({ code: 'R-15', subject: `config.discovery.${key}`, reason: 'unknown discovery link key' });
  }
  const discovery = {};
  for (const key of ['webmention', 'micropub', 'indieauthMetadata']) {
    if (input[key] === undefined) continue;
    if (validDiscoveryHref(input[key])) discovery[key] = input[key];
    else refusals.push({ code: 'R-15', subject: `config.discovery.${key}`, reason: 'discovery links must be root-relative or absolute HTTP(S) URLs' });
  }
  if (input.me !== undefined) {
    const values = Array.isArray(input.me) ? input.me : [input.me];
    if (values.every(validDiscoveryHref)) discovery.me = Object.freeze([...new Set(values)]);
    else refusals.push({ code: 'R-15', subject: 'config.discovery.me', reason: 'me must contain root-relative or absolute HTTP(S) URLs' });
  }
  return { discovery: Object.freeze(discovery), refusals };
}

function validDiscoveryHref(value) {
  if (typeof value !== 'string' || !value) return false;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

export function normalizeArchives(input) {
  const refusals = [];
  if (input === false) return { archives: Object.freeze({ enabled: false, pageSize: 20 }), refusals };
  const supplied = input === undefined ? {} : input;
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) {
    return {
      archives: Object.freeze({ enabled: true, pageSize: 20 }),
      refusals: [{ code: 'R-15', subject: 'config.archives', reason: 'archives must be false or an object' }],
    };
  }
  for (const key of Object.keys(supplied)) {
    if (key !== 'pageSize') refusals.push({ code: 'R-15', subject: `config.archives.${key}`, reason: 'unknown archive configuration key' });
  }
  let pageSize = supplied.pageSize ?? 20;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    refusals.push({ code: 'R-15', subject: 'config.archives.pageSize', reason: 'pageSize must be a positive safe integer' });
    pageSize = 20;
  }
  return { archives: Object.freeze({ enabled: true, pageSize }), refusals };
}

export function normalizeSite(input = {}) {
  const refusals = [];
  const supplied = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const site = { ...DEFAULT_SITE, ...supplied };

  if (typeof site.name !== 'string' || !site.name.trim()) {
    refusals.push({ code: 'R-15', subject: 'site', reason: 'site.name must be a non-empty string' });
    site.name = DEFAULT_SITE.name;
  }

  try {
    const base = new URL(site.baseIri);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('protocol');
    if (base.pathname !== '/' || base.search || base.hash) {
      refusals.push({ code: 'R-15', subject: 'site', reason: 'site.baseIri must currently be an origin URL ending in /; subpath deployment is not supported yet' });
      site.baseIri = DEFAULT_SITE.baseIri;
    } else {
      site.baseIri = base.href;
    }
  } catch {
    refusals.push({ code: 'R-15', subject: 'site', reason: 'site.baseIri must be an absolute HTTP(S) URL' });
    site.baseIri = DEFAULT_SITE.baseIri;
  }

  if (typeof site.language !== 'string' || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(site.language)) {
    refusals.push({ code: 'R-15', subject: 'site', reason: 'site.language must be a language tag such as en or en-US' });
    site.language = DEFAULT_SITE.language;
  }

  if (!Array.isArray(site.menu) || site.menu.some((item) =>
    !item || typeof item.label !== 'string' || !item.label.trim() || typeof item.href !== 'string' || !item.href.trim())) {
    refusals.push({ code: 'R-15', subject: 'site', reason: 'site.menu must be an array of non-empty { label, href } links' });
    site.menu = [...DEFAULT_SITE.menu];
  }

  if (typeof site.license !== 'string' || !site.license.trim()) {
    refusals.push({ code: 'R-15', subject: 'site', reason: 'site.license must be a non-empty string' });
    site.license = DEFAULT_SITE.license;
  }

  if (typeof site.showRecordMetadata !== 'boolean') {
    refusals.push({ code: 'R-15', subject: 'site', reason: 'site.showRecordMetadata must be a boolean' });
    site.showRecordMetadata = DEFAULT_SITE.showRecordMetadata;
  }

  if (site.cellLabel === undefined) site.cellLabel = DEFAULT_SITE.cellLabel;
  else if (typeof site.cellLabel !== 'string' || !site.cellLabel.trim()) {
    refusals.push({ code: 'R-15', subject: 'site', reason: 'site.cellLabel must be a non-empty string' });
    site.cellLabel = DEFAULT_SITE.cellLabel;
  }

  // The line above each page's title; without one a page shows its cell type.
  if (site.eyebrow !== undefined && (typeof site.eyebrow !== 'string' || !site.eyebrow.trim())) {
    refusals.push({ code: 'R-15', subject: 'site', reason: 'site.eyebrow must be a non-empty string' });
    delete site.eyebrow;
  }

  if (site.founded !== undefined && !isIsoDate(site.founded)) {
    refusals.push({ code: 'R-15', subject: 'site', reason: 'site.founded must be an ISO date' });
    delete site.founded;
  }

  return { site, refusals };
}

/** Whether a value is a real calendar date written YYYY-MM-DD. */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
