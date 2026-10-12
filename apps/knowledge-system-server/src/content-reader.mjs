// Read regular Markdown files below one root as opaque byte records with file
// evidence. Parsing belongs to the dialect; this only lists and reads.

import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256Base64Url } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

export const CONTENT_READER_CONTRACT_VERSION = 'content-reader/v1';

function contained(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === '' || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== '..' && !isAbsolute(fromRoot));
}

async function walk(root, directory, extensions, records) {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    const id = relative(root, absolutePath).split(sep).join('/');
    if (entry.isSymbolicLink()) throw new Error(`symbolic links are not permitted in a content source tree: ${id}`);
    if (entry.isDirectory()) await walk(root, absolutePath, extensions, records);
    else if (entry.isFile() && extensions.some((extension) => id.toLowerCase().endsWith(extension))) records.push({ id, absolutePath });
  }
}

async function materialize(root, { id, absolutePath }) {
  const status = await lstat(absolutePath);
  if (status.isSymbolicLink() || !status.isFile()) throw new Error(`source record is not a regular file: ${id}`);
  const canonical = await realpath(absolutePath);
  if (!contained(root, canonical)) throw new Error(`source record escapes its configured root: ${id}`);
  const bytes = await readFile(canonical);
  const sha256 = sha256Base64Url(bytes);
  const href = pathToFileURL(canonical).href;
  const rootHref = pathToFileURL(root).href;
  const descriptor = Object.freeze({
    contractVersion: CONTENT_READER_CONTRACT_VERSION,
    id,
    extension: id.slice(id.lastIndexOf('.')).toLowerCase(),
    provenance: Object.freeze({ kind: 'filesystem', root: rootHref, href, sha256, byteLength: bytes.byteLength }),
    dependencies: Object.freeze([Object.freeze({ kind: 'filesystem-directory', href: rootHref }), Object.freeze({ kind: 'filesystem-file', href, sha256 })]),
  });
  return { descriptor, bytes };
}

/** A reader over regular files below one root: listRecords() and readRecord(record). */
export async function createFilesystemContentReader({ root, extensions = ['.md'] } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root)) throw new TypeError('root must be an absolute filesystem path');
  const canonicalRoot = await realpath(resolve(root));
  const allowed = extensions.map((extension) => extension.toLowerCase());
  async function listRecords() {
    const candidates = [];
    await walk(canonicalRoot, canonicalRoot, allowed, candidates);
    return Object.freeze(await Promise.all(candidates.map(async (candidate) => (await materialize(canonicalRoot, candidate)).descriptor)));
  }
  async function readRecord(record) {
    const id = typeof record === 'string' ? record : record?.id;
    if (typeof id !== 'string' || id.startsWith('/') || id.split('/').some((part) => part === '' || part === '.' || part === '..')) throw new TypeError('record id must be a slash-separated relative source path');
    const absolutePath = resolve(canonicalRoot, ...id.split('/'));
    if (!contained(canonicalRoot, absolutePath)) throw new TypeError('record id escapes the configured root');
    const { descriptor, bytes } = await materialize(canonicalRoot, { id, absolutePath });
    return Object.freeze({ ...descriptor, bytes: new Uint8Array(bytes) });
  }
  return Object.freeze({ contractVersion: CONTENT_READER_CONTRACT_VERSION, kind: 'filesystem-content-reader', root: pathToFileURL(canonicalRoot).href, extensions: Object.freeze(allowed), listRecords, readRecord });
}
