import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { neocitiesUploadHashForm, neocitiesUploadHashRequest, planNeocitiesDeployment, safeNeocitiesPath } from '../src/neocities.mjs';

const sha1 = (value) => createHash('sha1').update(value, 'utf8').digest('hex');
const index = '<h1>hello</h1>\n';
const css = 'body { font-family: sans-serif; }\n';
const artifacts = () => new Map([['index.html', index], ['css/site.css', css]]);

test('the upload_hash request hashes each artifact in path order, and bytes hash as text does', () => {
  const request = neocitiesUploadHashRequest(artifacts());
  assert.deepEqual(request.files, { 'css/site.css': sha1(css), 'index.html': sha1(index) });
  assert.deepEqual(Object.keys(request.files), ['css/site.css', 'index.html']);
  assert.equal(neocitiesUploadHashRequest({ 'index.html': Buffer.from(index) }).files['index.html'], sha1(index));
  const form = neocitiesUploadHashForm(request);
  assert.equal(form.get('index.html'), sha1(index));
});

test('a response plans changed uploads and never a deletion', () => {
  const plan = planNeocitiesDeployment(artifacts(), { result: 'success', files: { 'index.html': true, 'css/site.css': false } });
  assert.deepEqual(plan.changed, ['css/site.css']);
  assert.deepEqual(plan.unchanged, ['index.html']);
  assert.deepEqual(plan.deletions, []);
  assert.equal(plan.destructive, false);
  assert.match(plan.inventoryDigest, /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u);
  const other = planNeocitiesDeployment(new Map([['index.html', 'x']]), { result: 'success', files: { 'index.html': false } });
  assert.notEqual(other.inventoryDigest, plan.inventoryDigest);
});

test('a response that misses, adds or mistypes a path is refused', () => {
  assert.throws(() => planNeocitiesDeployment(artifacts(), { result: 'success', files: { 'index.html': true } }), /do not match/u);
  assert.throws(() => planNeocitiesDeployment(artifacts(), { result: 'success', files: { 'index.html': true, 'css/site.css': 'yes' } }), /boolean/u);
  assert.throws(() => planNeocitiesDeployment(artifacts(), { result: 'error', files: {} }), /successful/u);
});

test('unsafe output paths are refused', () => {
  for (const bad of ['', '/etc/passwd', '../x', 'a/../b', 'a//b', 'a\\b', './a']) assert.throws(() => safeNeocitiesPath(bad), /unsafe/u);
  assert.equal(safeNeocitiesPath('a/b.html'), 'a/b.html');
});
