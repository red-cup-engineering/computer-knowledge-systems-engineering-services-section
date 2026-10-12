// Neocities deployment planning over a built site's artifacts (path -> bytes or text), the same
// map `build` returns. Dry-run only: it hashes the artifacts for the `upload_hash` request and
// reads the response into the changed and unchanged paths. It performs no network call, holds no
// API key and never plans a deletion; uploading a plan is the deployer's work.

import { createHash } from 'node:crypto';

const bytesOf = (content) => (typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content));
const sha1Hex = (content) => createHash('sha1').update(bytesOf(content)).digest('hex');
const byPath = (left, right) => left.localeCompare(right);

/** A Neocities-safe relative output path: no empty, absolute, backslash, `.` or `..` segment. */
export function safeNeocitiesPath(path) {
  if (typeof path !== 'string' || path.length === 0 || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    throw new TypeError(`neocities: unsafe output path ${JSON.stringify(path)}`);
  }
  if (path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new TypeError(`neocities: unsafe output path ${JSON.stringify(path)}`);
  }
  return path;
}

function entriesOf(artifacts) {
  const entries = artifacts instanceof Map ? [...artifacts.entries()] : Object.entries(artifacts ?? {});
  return entries.map(([path, content]) => [safeNeocitiesPath(path), content]).sort(([a], [b]) => byPath(a, b));
}

/** The `upload_hash` request: each path with the SHA-1 of its bytes, in path order. */
export function neocitiesUploadHashRequest(artifacts) {
  return Object.freeze({ files: Object.freeze(Object.fromEntries(entriesOf(artifacts).map(([path, content]) => [path, sha1Hex(content)]))) });
}

/** The form body of the `upload_hash` call: one `path=sha1` field per file. */
export function neocitiesUploadHashForm(request) {
  const form = new URLSearchParams();
  for (const path of Object.keys(request.files).sort(byPath)) form.append(path, request.files[path]);
  return form;
}

/** Read an `upload_hash` response (path -> already-present boolean) against the artifacts. */
export function planNeocitiesDeployment(artifacts, response) {
  if (response?.result !== 'success') throw new TypeError('planNeocitiesDeployment: upload_hash response must be successful');
  const request = neocitiesUploadHashRequest(artifacts);
  const expected = Object.keys(request.files);
  const observed = Object.keys(response.files ?? {}).sort(byPath);
  if (expected.length !== observed.length || expected.some((path, index) => path !== observed[index])) {
    throw new TypeError('planNeocitiesDeployment: upload_hash response paths do not match the artifacts');
  }
  for (const path of expected) {
    if (typeof response.files[path] !== 'boolean') throw new TypeError(`planNeocitiesDeployment: upload_hash state must be boolean for ${path}`);
  }
  const digest = createHash('sha256').update(expected.map((path) => `${path}\0${request.files[path]}\n`).join('')).digest('base64url');
  return Object.freeze({
    kind: 'static-site-publisher.neocities-deployment-plan',
    inventoryDigest: `ni:///sha-256;${digest}`,
    paths: Object.freeze(expected),
    changed: Object.freeze(expected.filter((path) => response.files[path] === false)),
    unchanged: Object.freeze(expected.filter((path) => response.files[path] === true)),
    deletions: Object.freeze([]),
    destructive: false,
  });
}
