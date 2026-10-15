import test from 'node:test';
import assert from 'node:assert/strict';
import {EXCLUDED_SEGMENTS, lSpaceReaderPolicy, publicSourceVisible} from '../src/l-space-reader-policy.mjs';

test('the shared reader policy preserves default exclusions exactly', () => {
  const policy = lSpaceReaderPolicy({sciencePrefix: 'science-services-section'});
  assert.deepEqual(EXCLUDED_SEGMENTS, ['legacy', 'triage', 'private', 'dev', 'test', 'fixtures', 'dist', 'sites', 'lib']);
  assert.equal(policy.excludes, EXCLUDED_SEGMENTS);
  assert.ok(Object.isFrozen(policy));
});

test('Science reader admits documents only beneath its declared section', () => {
  const {admitPath} = lSpaceReaderPolicy({sciencePrefix: 'science-services-section'});
  for (const path of [
    'science-services-section/services/l-space/README.md',
    'science-services-section/content/a.md',
    'science-services-section/content/text/a.md',
  ]) assert.equal(admitPath(path), true, path);
  for (const path of [
    'science-services-section', 'science-services-section-other/a.md',
    'another-section/content/a.md', 'another-section/content/text/a.md',
    'personal-services-section/content/text/canary.md',
    'content/text/a.md', 'README.md',
  ]) assert.equal(admitPath(path), false, path);
  // Exclusion is a distinct archive operation, never smuggled into this predicate.
  assert.equal(admitPath('science-services-section/private/a.md'), true);
});

test('Science reader rejects traversal, absolute, malformed and non-path inputs', () => {
  const {admitPath} = lSpaceReaderPolicy({sciencePrefix: 'science-services-section'});
  for (const path of [
    '', '/science-services-section/a.md',
    'science-services-section/../other/content/text/a.md',
    'science-services-section//a.md', 'science-services-section/./a.md',
    'science-services-section\\content\\a.md',
    'science-services-section/\0a.md', null, undefined, 17,
  ]) assert.equal(admitPath(path), false, String(path));
});

test('invalid configured prefixes fail closed instead of disabling section scope', () => {
  for (const sciencePrefix of [null, '', '.', '..', '../other', '/other',
    'science/../other', 'science\\other', 42]) {
    assert.throws(() => lSpaceReaderPolicy({sciencePrefix}),
      /sciencePrefix must name one declared corpus section/, String(sciencePrefix));
  }
});

test('unscoped readers remain available but reject unsafe paths', () => {
  const policy = lSpaceReaderPolicy();
  assert.equal(policy.admitPath('other/content/text/a.md'), true);
  assert.equal(lSpaceReaderPolicy({sciencePrefix: undefined}).admitPath('other/a.md'), true);
  for (const path of ['../other/a.md', '/other/a.md', 'other//a.md', 'other/./a.md']) {
    assert.equal(policy.admitPath(path), false, path);
  }
});

test('caller exclusions extend mandatory private and working safeguards', () => {
  const excludes = ['private', 'project-drafts'];
  const effective = lSpaceReaderPolicy({excludes}).excludes;
  assert.deepEqual(effective, [...EXCLUDED_SEGMENTS, 'project-drafts']);
  assert.notEqual(effective, excludes);
  assert.ok(Object.isFrozen(effective));
  assert.equal(lSpaceReaderPolicy({excludes: null}).excludes, EXCLUDED_SEGMENTS);
  assert.equal(lSpaceReaderPolicy({excludes: []}).excludes, EXCLUDED_SEGMENTS);
});

test('mandatory exclusions survive empty caller configuration', () => {
  const policy = lSpaceReaderPolicy({sciencePrefix: 'science-services-section', excludes: []});
  assert.deepEqual(policy.excludes, EXCLUDED_SEGMENTS);
  assert.ok(policy.excludes.includes('private'));
});

test('custom exclusions are additive, deduplicated and immutable', () => {
  const policy = lSpaceReaderPolicy({excludes: ['drafts', 'drafts']});
  assert.deepEqual(policy.excludes, [...EXCLUDED_SEGMENTS, 'drafts']);
  assert.ok(Object.isFrozen(policy.excludes));
});

test('changing caller arrays after policy construction cannot change settled exclusions', () => {
  const caller = ['drafts'];
  const policy = lSpaceReaderPolicy({excludes: caller});
  caller.splice(0, 1, 'other');
  assert.ok(policy.excludes.includes('drafts'));
  assert.ok(!policy.excludes.includes('other'));
  assert.throws(() => policy.excludes.pop(), TypeError);
});

test('invalid exclusion configurations fail closed', () => {
  for (const invalid of [false, 'private', {}, 42, ['../private'], [''], ['.'], ['..'], ['a/b'], ['a\\b'], [null]]) {
    assert.throws(() => lSpaceReaderPolicy({excludes: invalid}), TypeError);
  }
});

test('public metadata never overrules a present consent restriction or absent publication grant',()=>{
  const source=properties=>({properties});
  assert.equal(publicSourceVisible(source({visibility:'public'})),true);
  for(const v of [
    undefined,null,{},source({visibility:'authenticated'}),
    source({visibility:'public','consent-status':'pending'}),
    source({visibility:'public','consent-status':null}),
    source({visibility:'public','consent-status':false}),
    source({visibility:'public','consent-status':'declared-granted-but-not-independently-received'})
  ]) assert.equal(publicSourceVisible(v),false,JSON.stringify(v));
});
