import { readFile, realpath } from 'node:fs/promises';
// The vault catalog dialect. Every document of the vault beneath the content
// root is a cell, read through CAIRN's dialect adapters: the title falls back to
// the file name, the date is optional, the type is open, and the prerequisite
// and link doors between rooms become typed relations. Nothing here walks the
// tree a second time; CAIRN's reading is the only source of rooms and doors.

import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath, sep } from 'node:path';
import { makeNiUri, niUriWithContentType } from '@red-cup-engineering/uri-services-section/ni-uri';
import { extensionType } from '@red-cup-engineering/computer-serialized-content-engineering-services-section/services/http-data-services-section/src/media-type';
import { cslReference } from '@red-cup-engineering/csl-json-services-section/record-formatting';
import { pathToFileURL } from 'node:url';
import { readVaultRooms } from '@red-cup-engineering/markdown-engineering-services-section/vault-dialect/vault-rooms';
import { asList } from '@red-cup-engineering/markdown-engineering-services-section/vault-dialect/frontmatter';
import { buildDocIndex, resolveDocLink } from '@red-cup-engineering/markdown-engineering-services-section/vault-dialect/docindex';
import { parseBody } from '@red-cup-engineering/markdown-engineering-services-section/relational-markdown';
import { semanticId } from '@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address';
import { STATUSES, astForAddress } from './cell.mjs';

export const VAULT_SOURCES = Object.freeze(['house', 'obsidian', 'org']);
const DOCUMENT_LINK = /\.md(#.*)?$/iu;
const RELATION_KEY_SEPARATOR = '\u001f';

/** A room's cell name: its vault-relative path, without the extension, as a route. */
export function vaultCellName(roomId, routeName) {
  if (typeof routeName !== 'function') throw new TypeError('vault admission requires a routeName function supplied by its presentation consumer');
  return routeName(roomId.replace(/\.md$/iu, ''));
}

function isoDate(room) {
  const offered = room.dateCreated ?? room.frontmatter?.['date-created'];
  if (offered instanceof Date && !Number.isNaN(offered.valueOf())) return offered.toISOString().slice(0, 10);
  if (typeof offered !== 'string') return undefined;
  const match = offered.match(/^(\d{4}-\d{2}-\d{2})/u);
  return match ? match[1] : undefined;
}

// Rewrite relative document links inside the parsed body to cell routes, in
// place: the AST was parsed for this cell alone and is not shared. Its shape is
// not assumed: any object token of kind 'link' whose href names a Markdown
// document is a candidate, wherever it sits.
const ABSOLUTE_OR_FRAGMENT = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/iu;

function rewriteDocumentLinks(value, rewrite) {
  if (Array.isArray(value)) {
    for (const entry of value) rewriteDocumentLinks(entry, rewrite);
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  if (value.kind === 'link' && typeof value.href === 'string' && !ABSOLUTE_OR_FRAGMENT.test(value.href)) {
    // A relative link is a document reference by another syntax. Resolved, it
    // becomes the cell's route; unresolved, it becomes a wikilink token, which
    // renders as a potential link exactly as an unresolved wikilink does.
    const href = rewrite(value.href);
    if (href !== null) {
      value.href = href;
    } else {
      const target = value.href.replace(/#.*$/u, '').replace(/\.md$/iu, '');
      const label = value.label;
      for (const key of Object.keys(value)) delete value[key];
      Object.assign(value, { kind: 'wikilink', target, label });
    }
    return value;
  }
  for (const entry of Object.values(value)) rewriteDocumentLinks(entry, rewrite);
  return value;
}

// A relative embed names a file beside its note (an image, a recording, a
// document). The file is named by its content, the embed is rewritten to that
// ni name with its type, and the catalog's media map says where the bytes are,
// so the site serves them at /.well-known/ni/ whatever route the note takes.
function rewriteEmbeds(value, embed) {
  if (Array.isArray(value)) {
    for (const entry of value) rewriteEmbeds(entry, embed);
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  if (value.kind === 'image' && typeof value.src === 'string' && !ABSOLUTE_OR_FRAGMENT.test(value.src)) {
    value.src = embed(value.src) ?? value.src;
    return value;
  }
  for (const entry of Object.values(value)) rewriteEmbeds(entry, embed);
  return value;
}

function embedRewriter(root, media) {
  const named = new Map();
  return (roomId) => (src) => {
    let path;
    try { path = resolvePath(root, dirname(roomId), decodeURIComponent(src.replace(/[?#].*$/u, ''))); } catch { return null; }
    if (!path.startsWith(`${root}${sep}`)) return null;
    if (!named.has(path)) {
      let ni = null;
      try { if (statSync(path).isFile()) ni = makeNiUri(readFileSync(path)); } catch { ni = null; }
      named.set(path, ni);
      if (ni !== null) media.set(ni, path);
    }
    const ni = named.get(path);
    return ni === null ? null : niUriWithContentType(ni, extensionType(path));
  };
}

function documentLinkRewriter(index, nameOf) {
  return (roomId) => (href) => {
    const fragment = href.match(/(#.*)$/u)?.[1] ?? '';
    const path = href.replace(/#.*$/u, '');
    const candidate = DOCUMENT_LINK.test(href) ? href : `${path}.md${fragment}`;
    const resolution = resolveDocLink(candidate, roomId, index, DOCUMENT_LINK);
    return resolution.kind === 'resolved' ? `/${nameOf(resolution.roomId)}/${fragment}` : null;
  };
}

// Route names for every room, deterministic and unique: when two distinct
// files reduce to one route, the later file in room-id order takes a numeric
// suffix and the collision is reported. A vault must not lose its release to a
// pair of files that differ only in case or punctuation.
function routeNames(rooms, advisories, routeName) {
  const byName = new Map();
  for (const room of rooms) {
    const name = vaultCellName(room.id, routeName);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(room.id);
  }
  const nameOf = new Map();
  for (const [name, ids] of byName) {
    ids.sort();
    ids.forEach((id, index) => {
      const assigned = index === 0 ? name : `${name}-${index + 1}`;
      nameOf.set(id, assigned);
      if (index > 0) {
        advisories.push({ code: 'A-08', subject: assigned, reason: `route "${name}" is also claimed by "${ids[0]}"; this cell is served at "${assigned}"` });
      }
    });
  }
  return (roomId) => nameOf.get(roomId) ?? vaultCellName(roomId, routeName);
}

function dedupeRelations(relations) {
  const seen = new Set();
  return relations.filter((relation) => {
    const key = `${relation.type}${RELATION_KEY_SEPARATOR}${relation.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function vaultCell(room, { root, doorsByDependent, rewriteFor, embedFor, advisories, nameOf }) {
  const frontMatter = room.frontmatter ?? {};
  const name = nameOf(room.id);
  const status = STATUSES.includes(frontMatter.status) ? frontMatter.status : 'active';
  const references = frontMatter.references && typeof frontMatter.references === 'object' && !Array.isArray(frontMatter.references)
    ? Object.fromEntries(Object.entries(frontMatter.references).map(([key, reference]) => [key, cslReference(reference)])) : {};
  const parsed = parseBody(room.body, { references });
  const rewrite = rewriteFor(room.id);
  rewriteDocumentLinks(parsed.blocks, rewrite);
  rewriteDocumentLinks(parsed.footnotes, rewrite);
  rewriteEmbeds(parsed.blocks, embedFor(room.id));
  rewriteEmbeds(parsed.footnotes, embedFor(room.id));
  // The vault admits prose as it is. What the publication dialect would refuse
  // in a body is reported against the cell and rendered anyway.
  for (const finding of [...parsed.refusals, ...parsed.advisories]) {
    advisories.push({ ...finding, subject: name, ...(finding.site ? { site: finding.site } : {}) });
  }
  const cellValue = {
    name,
    type: room.kind,
    status,
    title: room.title,
    eyebrow: typeof frontMatter.eyebrow === 'string' ? frontMatter.eyebrow : undefined,
    summary: room.description,
    dateCreated: isoDate(room),
    tags: asList(frontMatter.tags).map(String),
    references,
  };
  const relations = parsed.relations.map((relation) => ({ ...relation, from: name }));
  for (const door of doorsByDependent.get(room.id) ?? []) {
    relations.push({
      type: door.weight === 'hard' ? 'requires' : 'links',
      to: nameOf(door.from),
      from: name,
      literal: false,
      provenance: `vault-door:${door.weight}`,
    });
  }
  return {
    ...cellValue,
    // The address covers the canonical AST; the copy it is taken over is not retained.
    address: semanticId({ ...cellValue, blocks: astForAddress(parsed.blocks) }),
    parsed,
    relations: dedupeRelations(relations),
    frontMatter,
    aliases: Object.freeze([...room.aliases]),
    source: Object.freeze({ provenance: Object.freeze({ href: pathToFileURL(resolvePath(root, room.id)).href }) }),
  };
}

/**
 * Admit every room of a vault as a cell. Returns the cells plus the vault's
 * rooms, doors, and wing configuration for projectors that make more of them
 * (VaultMaze makes its world).
 */
export function admitVaultCells(rootDir, catalog, { refusals, advisories, routeName }) {
  const root = resolvePath(rootDir);
  const config = { id: catalog.wing ?? 'vault', ...(catalog.attributeFields ? { attributeFields: catalog.attributeFields } : {}) };
  const read = readVaultRooms(root, config, { ...(catalog.source ? { dialect: catalog.source } : {}), excludeGlobs: catalog.exclude ?? [] });
  for (const warning of read.warnings) {
    const at = warning.indexOf(': ');
    advisories.push({
      code: 'A-01',
      subject: at === -1 ? 'vault' : vaultCellName(warning.slice(0, at), routeName),
      reason: at === -1 ? warning : warning.slice(at + 2),
    });
  }
  const doorsByDependent = new Map();
  for (const door of read.doors) {
    if (!doorsByDependent.has(door.to)) doorsByDependent.set(door.to, []);
    doorsByDependent.get(door.to).push(door);
  }
  const nameOf = routeNames(read.rooms, advisories, routeName);
  const rewriteFor = documentLinkRewriter(buildDocIndex(read.rooms), nameOf);
  const media = new Map();
  const embedFor = embedRewriter(root, media);
  const cells = new Map();
  for (const room of read.rooms) {
    const cell = vaultCell(room, { root, doorsByDependent, rewriteFor, embedFor, advisories, nameOf });
    if (cells.has(cell.name)) {
      refusals.push({ code: 'R-01', subject: cell.name, reason: `two sources carry the name "${cell.name}"` });
      continue;
    }
    cells.set(cell.name, cell);
  }
  const names = Object.freeze(Object.fromEntries(read.rooms.map((room) => [room.id, nameOf(room.id)])));
  return {
    cells,
    extra: Object.freeze({
      vault: Object.freeze({ root, config, rooms: read.rooms, doors: read.doors, warnings: read.warnings, names, dialect: read.dialect, dialectReason: read.dialectReason, media }),
    }),
  };
}

/**
 * Render one room of a vault on demand, exactly as the vault catalog renders it in a build: the
 * body parsed for this room alone, its document links rewritten to room routes, its embeds to
 * media addresses, and its wikilinks resolved against every room's name. Only the indexes a build
 * derives from room metadata are kept (route names, the document-link index, doors, titles), never
 * a body or a parsed tree, so a server can answer a room without building the vault.
 * `read` is the vault's reading (readVaultRooms); `render(room)` reads the room's file when no
 * body is given.
 */
export function createVaultRoomCellReader(rootDir, catalog, read, { routeName } = {}) {
  const root = resolvePath(rootDir);
  const advisories = [];
  const doorsByDependent = new Map();
  for (const door of read.doors) {
    if (!doorsByDependent.has(door.to)) doorsByDependent.set(door.to, []);
    doorsByDependent.get(door.to).push(door);
  }
  const nameOf = routeNames(read.rooms, advisories, routeName);
  const rewriteFor = documentLinkRewriter(buildDocIndex(read.rooms), nameOf);
  const media = new Map();
  const embedFor = embedRewriter(root, media);
  return Object.freeze({
    media,
    nameOf,
    /** The room's body as the vault reads it: its file, frontmatter removed. */
    bodyOf(room) {
      return readFileSync(resolvePath(root, room.id), 'utf8').replace(/^---\n[\s\S]*?\n---\n?/u, '');
    },
    cell(room, body = this.bodyOf(room)) {
      return vaultCell({ ...room, body }, { root, doorsByDependent, rewriteFor, embedFor, advisories: [], nameOf });
    },
  });
}

/** Retain local note embeds as exact bytes without building a second room catalog. */
export async function retainDocumentEmbeds(parsed, {root, document, custody, excludes = []}) {
  const boundary = await realpath(root);
  async function visit(value) {
    if (Array.isArray(value)) {for (const entry of value) await visit(entry);return;}
    if (!value || typeof value !== 'object') return;
    if (value.kind === 'image' && typeof value.src === 'string' && !ABSOLUTE_OR_FRAGMENT.test(value.src)) {
      let path;
      try {
        path = await realpath(resolvePath(boundary, dirname(document), decodeURIComponent(value.src.replace(/[?#].*$/u, ''))));
        if (!path.startsWith(boundary + sep) || path.slice(boundary.length+1).split(sep).some(segment=>excludes.includes(segment))) throw new Error('outside admitted corpus');
      } catch {
        value.kind='text';value.text=`[Attachment unavailable: ${value.alt ?? value.src}]`;return;
      }
      const bytes=await readFile(path), ni=makeNiUri(bytes), mediaType=extensionType(path);
      await custody.put({ni,bytes,mediaType});
      value.src=niUriWithContentType(ni,mediaType);return;
    }
    for (const entry of Object.values(value)) await visit(entry);
  }
  await visit(parsed);return parsed;
}
