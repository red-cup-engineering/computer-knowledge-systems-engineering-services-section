// The catalog: cells, name map, relation index (forward + reverse), addresses.

import { splitFrontMatter, parseBody } from '@red-cup-engineering/markdown-engineering-services-section/relational-markdown';
import { semanticId } from '@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address';
import { CONTENT_TYPES, STATUSES, astForAddress, withoutBytes } from './cell.mjs';
import { admitVaultCells } from './vault-catalog.mjs';

const DEFAULT_CATALOG = Object.freeze({ dialect: 'publication' });

/** Whether a value is a real calendar date written YYYY-MM-DD. */
function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export async function assembleCatalog(rootDir, { reader, catalog = DEFAULT_CATALOG, routeName } = {}) {
  const refusals = [];
  const advisories = [];
  const admitted = catalog.dialect === 'vault'
    ? admitVaultCells(rootDir, catalog, { refusals, advisories, routeName })
    : await admitPublicationCells(rootDir, reader, { refusals, advisories });
  return finishCatalog(admitted, { refusals, advisories, routeName });
}

// The publication dialect: each Markdown record is a cell only when it carries
// the required title, date, and a known content type.
async function admitPublicationCells(rootDir, reader, { refusals, advisories }) {
  const cells = new Map();

  const sourceReader = reader;
  if (!sourceReader || typeof sourceReader.listRecords !== 'function' || typeof sourceReader.readRecord !== 'function') {
    throw new TypeError('content reader must implement listRecords() and readRecord(record); the publication dialect requires one (e.g. createFilesystemContentReader), supplied by the caller at the kernel edge');
  }
  const records = await sourceReader.listRecords();
  for (const record of records) {
    if (record.extension !== '.md') continue;
    // Prefer the canonical active Markdown reading when the lower reader offers
    // it. VICTOR still applies its own authoring dialect below; retaining both
    // readings makes that compatibility boundary explicit and inspectable.
    const materialized = typeof sourceReader.readMarkdownRecord === 'function'
      ? await sourceReader.readMarkdownRecord(record)
      : await sourceReader.readRecord(record);
    const name = record.id.replace(/\.md$/i, '').toLowerCase();
    let source;
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(materialized.bytes);
    } catch {
      refusals.push({ code: 'R-03', subject: name, reason: 'source is not valid UTF-8 text' });
      continue;
    }
    const cell = parseCell(name, source, refusals, advisories, materialized);
    if (cells.has(name)) {
      refusals.push({ code: 'R-01', subject: name, reason: `two sources carry the name "${name}"` });
      continue;
    }
    if (cell) cells.set(name, cell);
  }
  return { cells, extra: {} };
}

// Everything after admission is dialect-neutral: redirects, the reverse
// relation index, orphan advisories, chapters, the catalog hash.
function finishCatalog({ cells, extra }, { refusals, advisories, routeName }) {
  const redirects = redirectMap(cells, refusals);

  // reverse relation index
  const incoming = new Map();
  for (const cell of cells.values()) {
    for (const rel of cell.relations) {
      if (rel.literal) continue;
      const target = resolveName(cells, rel.to, redirects, { routeName });
      if (!target) {
        advisories.push({ code: 'A-01', subject: cell.name, reason: `wants absent cell "${rel.to}"` });
        continue;
      }
      if (!incoming.has(target)) incoming.set(target, []);
      incoming.get(target).push({ type: rel.type, from: cell.name });
    }
  }
  for (const cell of cells.values()) {
    if (!(incoming.get(cell.name) || []).length && cell.type !== 'index' && cell.type !== 'page' && cell.type !== 'chapter') {
      advisories.push({ code: 'A-04', subject: cell.name, reason: 'orphan cell: nothing links, cites, or relates to it' });
    }
  }

  const chaptersByPaper = chapterIndex(cells, redirects, routeName);

  const sortedAddresses = [...cells.values()].map((c) => c.address).sort();
  return {
    ...extra,
    cells, redirects, incoming, chaptersByPaper,
    hash: semanticId(sortedAddresses),
    report: { refusals, advisories },
  };
}

// A paper's ordered chapters, keyed by the paper's resolved cell name.
function chapterIndex(cells, redirects, routeName) {
  const chaptersByPaper = new Map();
  for (const cell of cells.values()) {
    if (cell.type !== 'chapter' || cell.partOf === undefined) continue;
    const paperName = resolveName(cells, cell.partOf, redirects, { routeName });
    if (!paperName) continue; // unresolved part-of already advised via the reverse relation index
    if (!chaptersByPaper.has(paperName)) chaptersByPaper.set(paperName, []);
    chaptersByPaper.get(paperName).push({ name: cell.name, title: cell.title, order: cell.order });
  }
  for (const chapters of chaptersByPaper.values()) chapters.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return chaptersByPaper;
}

export function parseCell(name, source, refusals = [], advisories = [], sourceRecord) {
  const { frontMatter, body } = splitFrontMatter(source);
  if (!frontMatter.title) {
    refusals.push({ code: 'R-03', subject: name, reason: 'front matter lacks the required title' });
    return null;
  }
  if (!frontMatter['date-created']) {
    refusals.push({ code: 'R-03', subject: name, reason: 'front matter lacks the required date-created' });
    return null;
  }
  if (!isIsoDate(frontMatter['date-created'])) {
    refusals.push({ code: 'R-03', subject: name, reason: `date-created "${frontMatter['date-created']}" is not an ISO date` });
    return null;
  }
  const firstPublishedAt = optionalAbsoluteHttpUrl(frontMatter['first-published-at'], 'first-published-at', name, refusals);
  const archivedAt = optionalAbsoluteHttpUrl(frontMatter['archived-at'], 'archived-at', name, refusals);
  const republished = optionalIsoDate(frontMatter.republished, 'republished', name, refusals);
  if (firstPublishedAt !== undefined && republished === undefined && frontMatter.republished === undefined) {
    refusals.push({ code: 'R-03', subject: name, reason: 'first-published-at requires republished' });
  }
  if (republished !== undefined && republished < frontMatter['date-created']) {
    refusals.push({ code: 'R-03', subject: name, reason: `republished "${republished}" is earlier than date-created "${frontMatter['date-created']}"` });
  }
  if (/^(overview|information|introduction|misc|about)$/i.test(frontMatter.title.trim())) {
    advisories.push({ code: 'A-02', subject: name, reason: `the title "${frontMatter.title}" is generic; headings function as a table of contents` });
  }
  const type = frontMatter.type || 'note';
  if (!CONTENT_TYPES.includes(type)) {
    refusals.push({ code: 'R-04', subject: name, reason: `unknown content type "${type}"` });
    return null;
  }
  const status = frontMatter.status && STATUSES.includes(frontMatter.status) ? frontMatter.status : 'active';
  const references = frontMatter.references && typeof frontMatter.references === 'object' && !Array.isArray(frontMatter.references)
    ? frontMatter.references : {};
  const parsed = parseBody(body, { references });
  refusals.push(...parsed.refusals.map((r) => ({ ...r, subject: name })));
  advisories.push(...parsed.advisories.map((a) => ({ ...a, subject: name })));

  let partOf, order;
  if (type === 'chapter') {
    const partOfRaw = frontMatter['part-of'];
    if (typeof partOfRaw !== 'string' || !partOfRaw.trim()) {
      refusals.push({ code: 'R-03', subject: name, reason: 'a chapter requires a non-empty front-matter part-of naming its paper' });
    } else {
      partOf = partOfRaw.trim().toLowerCase();
    }
    const orderRaw = frontMatter.order;
    const orderNumber = Number(orderRaw);
    if (orderRaw === undefined || orderRaw === '' || !Number.isInteger(orderNumber) || orderNumber < 1) {
      refusals.push({ code: 'R-03', subject: name, reason: `a chapter requires a positive integer front-matter order; got "${orderRaw}"` });
    } else {
      order = orderNumber;
    }
  }

  const cellValue = {
    name, type, status,
    title: frontMatter.title,
    eyebrow: frontMatter.eyebrow,
    summary: frontMatter.summary,
    dateCreated: frontMatter['date-created'],
    ...(firstPublishedAt === undefined ? {} : { firstPublishedAt }),
    ...(archivedAt === undefined ? {} : { archivedAt }),
    ...(republished === undefined ? {} : { republished }),
    tags: Array.isArray(frontMatter.tags) ? frontMatter.tags : [],
    references,
    blocks: astForAddress(parsed.blocks),
    ...(partOf === undefined ? {} : { partOf }),
    ...(order === undefined ? {} : { order }),
  };
  const relations = parsed.relations.map((r) => ({ ...r, from: name }));
  if (partOf !== undefined) relations.push({ type: 'part-of', to: partOf, from: name, literal: false, provenance: 'front-matter' });

  // The canonical AST copy is consumed by the address and not retained: the
  // rendered body reads parsed.blocks, and a second copy per cell is only weight.
  const { blocks: _blocks, ...retained } = cellValue;
  return {
    ...retained,
    address: semanticId(cellValue),
    parsed,
    relations,
    frontMatter,
    ...(sourceRecord === undefined ? {} : { source: withoutBytes(sourceRecord) }),
  };
}

function optionalAbsoluteHttpUrl(value, field, name, refusals) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    refusals.push({ code: 'R-03', subject: name, reason: `${field} "${String(value)}" is not an absolute HTTP(S) URL` });
    return undefined;
  }
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    return parsed.href;
  } catch {
    refusals.push({ code: 'R-03', subject: name, reason: `${field} "${value}" is not an absolute HTTP(S) URL` });
    return undefined;
  }
}

function optionalIsoDate(value, field, name, refusals) {
  if (value === undefined) return undefined;
  if (!isIsoDate(value)) {
    refusals.push({ code: 'R-03', subject: name, reason: `${field} "${String(value)}" is not an ISO date` });
    return undefined;
  }
  return value;
}



// Names indexed by their last path segment, rebuilt whenever the cell map has
// grown, so resolving a bare name is not a scan of every cell.
const NAME_INDEX = new WeakMap();
function nameIndex(cells) {
  const cached = NAME_INDEX.get(cells);
  if (cached && cached.size === cells.size) return cached.index;
  const index = new Map();
  for (const name of cells.keys()) {
    const base = name.split('/').pop();
    if (!index.has(base)) index.set(base, []);
    index.get(base).push(name);
  }
  NAME_INDEX.set(cells, { size: cells.size, index });
  return index;
}

export function resolveName(cells, target, redirects = new Map(), { routeName } = {}) {
  const literal = target.toLowerCase().trim();
  const routed = typeof routeName === 'function' ? routeName(literal) : literal;
  const attempts = literal === routed ? [literal] : [literal, routed];
  for (const t of attempts) {
    if (cells.has(t)) return t;
    if (redirects.has(t)) return redirects.get(t);
    const candidates = nameIndex(cells).get(t.split('/').pop()) ?? [];
    const matches = candidates.filter((n) => n === t || n.endsWith('/' + t) || !t.includes('/'));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

export function makeResolver(cells, redirects = new Map(), { homeName, routeName } = {}) {
  return (target) => {
    const name = resolveName(cells, target, redirects, { routeName });
    if (!name) return null;
    const cell = cells.get(name);
    return { href: name === homeName ? '/' : `/${name}/`, type: cell.type, title: cell.title };
  };
}

function redirectMap(cells, refusals) {
  const redirects = new Map();
  for (const cell of cells.values()) {
    const value = cell.frontMatter['renamed-from'];
    if (value === undefined) continue;
    const aliases = Array.isArray(value) ? value : [value];
    for (const raw of aliases) {
      const alias = typeof raw === 'string' ? raw.toLowerCase().replace(/^\/+|\/+$/g, '') : '';
      if (!alias || !/^[a-z0-9][a-z0-9._~/-]*$/.test(alias) || alias.includes('//') || alias.split('/').some((part) => part === '.' || part === '..')) {
        refusals.push({ code: 'R-03', subject: cell.name, reason: `renamed-from entry "${String(raw)}" is not a safe content name` });
      } else if (cells.has(alias)) {
        refusals.push({ code: 'R-01', subject: alias, reason: `redirect name is also carried by a current cell` });
      } else if (redirects.has(alias) && redirects.get(alias) !== cell.name) {
        refusals.push({ code: 'R-01', subject: alias, reason: `redirect name is claimed by both "${redirects.get(alias)}" and "${cell.name}"` });
      } else {
        redirects.set(alias, cell.name);
      }
    }
  }
  return redirects;
}
