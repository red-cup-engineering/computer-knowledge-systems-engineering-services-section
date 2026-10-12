import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeCanonical } from '@red-cup-engineering/cbor-services-section';
import { semanticId } from '@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address';
import { parseCell, makeResolver } from '@red-cup-engineering/knowledge-system-server/catalog';
import { routeName, renderAtlasPage, renderNeighborhoodPage, renderPage, renderIndexPage } from '@red-cup-engineering/web-page-tiling-engine/publication';
import { renderBody } from '@red-cup-engineering/markdown-engineering-services-section/relational-markdown';
import { build, writeArtifacts, writeBuildReport } from '../src/build.mjs';
import { normalizeProjectConfig, normalizeSite } from '../src/config.mjs';
import { loadProjectConfig } from '../src/read-project-config.mjs';
import { mediaTypeFor } from '../src/assets.mjs';
import { createVictorApplication } from '../src/runtime.mjs';
import { createVictorWebsite } from '../src/website.mjs';
import { verifyWebReleaseDirectory, verifyWebReleaseManifest } from '@red-cup-engineering/web-release-candidate-service';

const CHOUTKA_REF = `  choutka2022:
    id: choutka2022
    type: article-journal
    title: Unexplained post-acute infection syndromes
    author:
      - given: Jan
        family: Choutka
      - given: Akiko
        family: Iwasaki
    container-title: Nature Medicine
    volume: "28"
    issue: "5"
    page: 911-923
    issued:
      date-parts:
        - - 2022
    DOI: 10.1038/s41591-022-01810-6
`;
const NASEM_REF = `  nasem2024workshop:
    id: nasem2024workshop
    type: report
    title: "Toward a Common Research Agenda"
    author:
      - literal: National Academies of Sciences, Engineering, and Medicine
    publisher: National Academies Press
    issued:
      date-parts:
        - - 2024
`;
const REFERENCES_BLOCK = `references:\n${CHOUTKA_REF}`;
const TWO_REFERENCES_BLOCK = `references:\n${CHOUTKA_REF}${NASEM_REF}`;

const CELL = (body, extra = '') => `---
${/^title:/m.test(extra) ? "" : "title: A Test Cell\n"}${/^date-created:/m.test(extra) ? "" : "date-created: 2026-08-26\n"}${/^type:/m.test(extra) ? "" : "type: note\n"}tags:
- testing
${extra}---

${body}`;

test('cbor is deterministic regardless of key order', () => {
  const a = encodeCanonical({ b: 1, a: 'x' });
  const b = encodeCanonical({ a: 'x', b: 1 });
  assert.deepEqual(a, b);
  assert.match(semanticId({ a: 1 }), /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/);
});

test('a cell parses, addresses, and asserts relations from its body', () => {
  const cell = parseCell('notes/test', CELL('A [[target-cell]] link and a field.\n\nsupports:: [[other-cell]]\n'));
  assert.equal(cell.title, 'A Test Cell');
  assert.match(cell.address, /^ni:\/\/\/sha-256;/);
  const rels = cell.relations.map((r) => `${r.type}->${r.to}`);
  assert.ok(rels.includes('links->target-cell'));
  assert.ok(rels.includes('supports->other-cell'));
});

test('the same source yields the same address; a changed body changes it', () => {
  const a = parseCell('n', CELL('Same words.'));
  const b = parseCell('n', CELL('Same words.'));
  const c = parseCell('n', CELL('Different words.'));
  assert.equal(a.address, b.address);
  assert.notEqual(a.address, c.address);
});

test('missing title and non-ISO dates are refusals R-03', () => {
  const refusals = [];
  parseCell('n', '---\ndate-created: 2026-08-26\n---\nbody', refusals);
  parseCell('m', '---\ntitle: X\ndate-created: Aug 26 2026\n---\nbody', refusals);
  assert.equal(refusals.filter((r) => r.code === 'R-03').length, 2);
});

test('republication front matter validates its URLs, dates, ordering, and required site date', () => {
  const refusals = [];
  parseCell('bad-url', CELL('Body.', 'first-published-at: relative/path\nrepublished: 2026-09-27\n'), refusals);
  parseCell('bad-archive', CELL('Body.', 'archived-at: not-a-url\n'), refusals);
  parseCell('bad-date', CELL('Body.', 'republished: 2026-02-30\n'), refusals);
  parseCell('too-early', CELL('Body.', 'republished: 2020-01-01\n'), refusals);
  parseCell('missing-republication', CELL('Body.', 'first-published-at: https://old.example/work/\n'), refusals);
  assert.ok(refusals.some((r) => r.subject === 'bad-url' && /first-published-at/.test(r.reason)));
  assert.ok(refusals.some((r) => r.subject === 'bad-archive' && /archived-at/.test(r.reason)));
  assert.ok(refusals.some((r) => r.subject === 'bad-date' && /not an ISO date/.test(r.reason)));
  assert.ok(refusals.some((r) => r.subject === 'too-early' && /earlier than date-created/.test(r.reason)));
  assert.ok(refusals.some((r) => r.subject === 'missing-republication' && /requires republished/.test(r.reason)));
  assert.ok(refusals.every((r) => r.code === 'R-03'));
});

test('a republished page carries prose, h-entry properties, and JSON-LD provenance', () => {
  const cell = parseCell('essay', CELL('Republished body.', [
    'date-created: 2020-09-26',
    'first-published-at: https://edavis.netlify.app/blog/essay/',
    'archived-at: https://web.archive.org/web/20201001000000/https://edavis.netlify.app/blog/essay/',
    'republished: 2026-09-27',
    '',
  ].join('\n')));
  const site = { name: 'Site', baseIri: 'https://site.example/', language: 'en', menu: [], license: 'Test' };
  const page = renderPage(cell, { site, cells: new Map([[cell.name, cell]]), incoming: new Map(), resolve: () => null });
  assert.match(page, /<h1 class="p-name">A Test Cell<\/h1>/);
  assert.match(page, /<article class="h-entry"/);
  assert.match(page, /First published <time class="dt-published" datetime="2020-09-26">26 September 2020<\/time> at <a class="u-url" href="https:\/\/edavis\.netlify\.app\/blog\/essay\/">edavis\.netlify\.app<\/a> \(<a href="https:\/\/web\.archive\.org\/web\/20201001000000\/https:\/\/edavis\.netlify\.app\/blog\/essay\/">archived copy<\/a>\); republished here <time class="dt-updated" datetime="2026-09-27">27 September 2026<\/time>/);
  assert.match(page, /<data class="u-url" value="https:\/\/site\.example\/essay\/"><\/data>/);
  assert.match(page, /"datePublished":"2020-09-26"/);
  assert.match(page, /"dateModified":"2026-09-27"/);
  assert.match(page, /"isBasedOn":"https:\/\/edavis\.netlify\.app\/blog\/essay\/"/);
  assert.match(page, /"archivedAt":"https:\/\/web\.archive\.org\/web\/20201001000000\/https:\/\/edavis\.netlify\.app\/blog\/essay\/"/);
});

test('a founding date refuses an unwitnessed older publication but not a draft or witnessed work', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-founding-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'old.md'), CELL('Old.', 'date-created: 2020-09-26\n'));
  await writeFile(join(root, 'draft.md'), CELL('Draft.', 'date-created: 2020-09-26\nstatus: potential\n'));
  let result = await build({ contentDir: root, site: { founded: '2026-09-27' } });
  assert.ok(result.report.refusals.some((r) => r.code === 'R-03' && r.subject === 'old' && /2020-09-26.*2026-09-27/.test(r.reason)));
  assert.equal(result.report.refusals.some((r) => r.subject === 'draft' && /founding/.test(r.reason)), false);
  await writeFile(join(root, 'old.md'), CELL('Old.', 'date-created: 2020-09-26\narchived-at: https://web.archive.org/web/20201001000000/https://old.example/\n'));
  result = await build({ contentDir: root, site: { founded: '2026-09-27' } });
  assert.equal(result.report.refusals.some((r) => r.subject === 'old' && /founding/.test(r.reason)), false);
});

test('site founded is an optional validated ISO date', () => {
  assert.equal(normalizeSite({ founded: '2026-09-27' }).site.founded, '2026-09-27');
  const invalid = normalizeSite({ founded: '2026-02-30' });
  assert.equal(invalid.site.founded, undefined);
  assert.ok(invalid.refusals.some((r) => r.code === 'R-15' && /site\.founded/.test(r.reason)));
});

test('feeds preserve first publication and use republication as the modification date', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-republication-feeds-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'essay.md'), CELL('Body.', 'date-created: 2020-09-26\nfirst-published-at: https://old.example/essay/\nrepublished: 2026-09-27\n'));
  const result = await build({ contentDir: root, site: { baseIri: 'https://site.example/' } });
  assert.match(result.artifacts.get('feed.atom.xml'), /<published>2020-09-26T00:00:00Z<\/published>/);
  assert.match(result.artifacts.get('feed.atom.xml'), /<updated>2026-09-27T00:00:00Z<\/updated>/);
  const json = JSON.parse(result.artifacts.get('feed.json'));
  assert.equal(json.items[0].date_published, '2020-09-26T00:00:00Z');
  assert.equal(json.items[0].date_modified, '2026-09-27T00:00:00Z');
  assert.match(result.artifacts.get('feed.rss.xml'), /<pubDate>Sat, 26 Sep 2020 00:00:00 GMT<\/pubDate>/);
});

test('a skipped heading level is refusal R-10', () => {
  const refusals = [];
  parseCell('n', CELL('# Fine\n\n### Skipped\n'), refusals);
  assert.ok(refusals.some((r) => r.code === 'R-10'));
});

test('unresolved wikilinks render as potential links, resolved ones as typed anchors', () => {
  const cell = parseCell('n', CELL('See [[absent-thing]] and [[real-thing|the real one]].'));
  const cells = new Map([['real-thing', { name: 'real-thing', type: 'note', title: 'Real' }]]);
  const out = renderBody(cell.parsed, { resolve: makeResolver(cells, new Map(), { routeName }) });
  assert.match(out, /<span class="potential-link">absent-thing<sup/);
  assert.match(out, /<a href="\/real-thing\/" data-cell-type="note">the real one<\/a>/);
});

test('footnotes render as zero-JS sidenotes with checkbox disclosure', () => {
  const cell = parseCell('n', CELL('A claim.[^1]\n\n[^1]: The margin note.\n'));
  const out = renderBody(cell.parsed, { resolve: () => null });
  assert.match(out, /<label for="sn-1" class="sidenote-toggle">/);
  assert.match(out, /<input type="checkbox" id="sn-1" class="sidenote-state" \/>/);
  assert.match(out, /<span class="sidenote" role="note"><sup>1<\/sup> The margin note\.<\/span>/);
});

test('callouts carry visible text labels', () => {
  const cell = parseCell('n', CELL('> [!caution] Hot surface\n> Do not touch.\n'));
  const out = renderBody(cell.parsed, { resolve: () => null });
  assert.match(out, /<aside class="callout callout-caution"><p class="callout-label">Caution<span class="callout-title">: Hot surface<\/span><\/p>/);
});

test('GFM pipe tables render as semantic tables with alignment and inline markup', () => {
  const cell = parseCell('n', CELL(
    '| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | **b** | [[target-cell]] |\n| c | d | e |\n'
  ));
  const out = renderBody(cell.parsed, { resolve: () => null });
  assert.match(out, /<figure class="table-scroll"><table><thead><tr>/);
  assert.match(out, /<th scope="col" style="text-align:left">Left<\/th>/);
  assert.match(out, /<th scope="col" style="text-align:center">Center<\/th>/);
  assert.match(out, /<th scope="col" style="text-align:right">Right<\/th>/);
  assert.match(out, /<td style="text-align:center"><strong>b<\/strong><\/td>/);
  assert.match(out, /<td style="text-align:right"><span class="potential-link">target-cell/);
  assert.match(out, /<td style="text-align:left">c<\/td><td style="text-align:center">d<\/td><td style="text-align:right">e<\/td>/);
});

test('a table can immediately follow a paragraph without a blank line and round-trips through the AST', () => {
  const cell = parseCell('n', CELL('A lead-in paragraph.\n| H1 | H2 |\n| --- | --- |\n| x | y |\n'));
  const table = cell.parsed.blocks.find((b) => b.kind === 'table');
  assert.ok(table, 'expected a table block');
  assert.deepEqual(table.align, [null, null]);
  assert.equal(table.rows.length, 1);
  const out = renderBody(cell.parsed, { resolve: () => null });
  assert.match(out, /<p>A lead-in paragraph\.<\/p>/);
  assert.match(out, /<table>/);
});

test('table cells escape HTML by default, matching the dialect\'s escape-all-HTML posture', () => {
  const cell = parseCell('n', CELL('| H |\n| --- |\n| <script>alert(1)</script> |\n'));
  const out = renderBody(cell.parsed, { resolve: () => null });
  assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(out, /<script>/);
});

test('a lone dash line with no header pipe stays an ordinary paragraph, not a table', () => {
  const cell = parseCell('n', CELL('Heading text\n---\nMore text.\n'));
  assert.equal(cell.parsed.blocks.some((b) => b.kind === 'table'), false);
});

test('a citation resolves to an author-year anchor with a margin reference and a literal cites relation', () => {
  const cell = parseCell('n', CELL('A claim needs support [@choutka2022].', REFERENCES_BLOCK));
  const out = renderBody(cell.parsed, { resolve: () => null });
  assert.match(out, /\(<a class="citation" href="#ref-choutka2022">Choutka &amp; Iwasaki 2022<\/a>\)/);
  assert.match(out, /<label for="sn-1" class="sidenote-toggle">/);
  assert.match(out, /<span class="sidenote" role="note"><sup>1<\/sup> Jan Choutka and Akiko Iwasaki\. "Unexplained post-acute infection syndromes\." <cite>Nature Medicine<\/cite> 28, no\. 5 \(2022\): 911-923\.<\/span>/);
  assert.equal(cell.parsed.citations.length, 1);
  assert.equal(cell.parsed.citations[0].key, 'choutka2022');
  assert.ok(cell.relations.some((r) => r.type === 'cites' && r.to === 'choutka2022' && r.literal === true));
});

test('a citation locator appears in the anchor label', () => {
  const cell = parseCell('n', CELL('See the finding [@choutka2022, p. 12].', REFERENCES_BLOCK));
  const out = renderBody(cell.parsed, { resolve: () => null });
  assert.match(out, /<a class="citation" href="#ref-choutka2022">Choutka &amp; Iwasaki 2022, p\. 12<\/a>/);
});

test('a citation group renders one anchor per key inside a shared parenthetical', () => {
  const cell = parseCell('n', CELL('Two sources agree [@choutka2022; @nasem2024workshop].', TWO_REFERENCES_BLOCK));
  const out = renderBody(cell.parsed, { resolve: () => null });
  assert.match(out, /\(<a class="citation" href="#ref-choutka2022">Choutka &amp; Iwasaki 2022<\/a>; <a class="citation" href="#ref-nasem2024workshop">National Academies of Sciences, Engineering, and Medicine 2024<\/a>\)/);
  assert.equal(cell.parsed.citations.length, 2);
});

test('citations dedupe into one references-used entry per key, in first-citation order', () => {
  const body = 'First mention [@nasem2024workshop] then again [@choutka2022] then repeat [@nasem2024workshop].';
  const cell = parseCell('n', CELL(body, TWO_REFERENCES_BLOCK));
  assert.deepEqual(cell.parsed.citations.map((c) => c.key), ['nasem2024workshop', 'choutka2022']);
});

test('an unknown citation key is refusal R-03, naming the cell and the key', () => {
  const refusals = [];
  parseCell('notes/orphan-cite', CELL('This cites nothing real [@missingkey].'), refusals);
  const found = refusals.find((r) => r.code === 'R-03' && /missingkey/.test(r.reason));
  assert.ok(found);
  assert.equal(found.subject, 'notes/orphan-cite');
});

test('a chapter without part-of or order is refusal R-03', () => {
  const refusals = [];
  parseCell('books/example/ch1', CELL('Body.', 'type: chapter\n'), refusals);
  assert.ok(refusals.some((r) => /part-of/.test(r.reason)));
  assert.ok(refusals.some((r) => /order/.test(r.reason)));
});

test('a valid chapter asserts a part-of relation and carries its order', () => {
  const cell = parseCell('books/example/ch1', CELL('Body.', 'type: chapter\npart-of: books/example\norder: 1\n'));
  assert.equal(cell.type, 'chapter');
  assert.equal(cell.order, 1);
  assert.equal(cell.partOf, 'books/example');
  assert.ok(cell.relations.some((r) => r.type === 'part-of' && r.to === 'books/example' && r.literal === false));
});

test('paper is an accepted content type', () => {
  const refusals = [];
  const cell = parseCell('books/example', CELL('Body.', 'type: paper\n'), refusals);
  assert.equal(cell.type, 'paper');
  assert.equal(refusals.length, 0);
});

test('a paper is one index entry that links its chapters in order; chapters are not separately listed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-chapters-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  await mkdir(contentDir, { recursive: true });
  await writeFile(join(contentDir, 'paper.md'), CELL('The paper body.', 'type: paper\n'));
  await writeFile(join(contentDir, 'ch2.md'), CELL('Chapter two.', 'type: chapter\npart-of: paper\norder: 2\n'));
  await writeFile(join(contentDir, 'ch1.md'), CELL('Chapter one.', 'type: chapter\npart-of: paper\norder: 1\n'));

  const result = await build({ contentDir, site: { baseIri: 'https://chapters.example/' } });
  assert.equal(result.report.releasable, true);
  assert.ok(result.artifacts.has('paper/index.html'));
  assert.ok(result.artifacts.has('ch1/index.html'));
  assert.ok(result.artifacts.has('ch2/index.html'));

  const index = result.artifacts.get('index.html');
  // Top-level listing entries carry a trailing listing-order span; nested
  // chapter-list entries (asserted separately below) do not.
  const listingItems = [...index.matchAll(/<li><a href="\/([^"]+)\/">[^<]*<\/a> <span class="listing-order">/g)].map((m) => m[1]);
  assert.deepEqual(listingItems, ['paper']);
  const chapterListMatch = index.match(/<ol class="chapter-list">(.*?)<\/ol>/s);
  assert.ok(chapterListMatch, 'chapter list rendered under the paper entry');
  const chapterHrefs = [...chapterListMatch[1].matchAll(/href="\/([^"]+)\/"/g)].map((m) => m[1]);
  assert.deepEqual(chapterHrefs, ['ch1', 'ch2']);

  assert.match(result.artifacts.get('paper/index.html'), /"@type":"ScholarlyArticle"/);
  assert.match(result.artifacts.get('ch1/index.html'), /"@type":"Chapter"/);
  assert.equal(result.report.advisories.some((a) => a.code === 'A-04' && a.subject === 'ch1'), false);
});

test('an unknown citation key blocks the build as an R-03 refusal', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-cite-refusal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  await mkdir(contentDir, { recursive: true });
  await writeFile(join(contentDir, 'page.md'), CELL('Cites [@absent].'));
  const result = await build({ contentDir, site: { baseIri: 'https://cite.example/' } });
  assert.equal(result.report.releasable, false);
  assert.ok(result.report.refusals.some((r) => r.code === 'R-03' && /absent/.test(r.reason) && r.subject === 'page'));
});

test('a page with citations renders a References section in citation order', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-references-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  await mkdir(contentDir, { recursive: true });
  await writeFile(join(contentDir, 'page.md'), CELL('Evidence [@choutka2022].', REFERENCES_BLOCK));
  const result = await build({ contentDir, site: { baseIri: 'https://refs.example/' } });
  assert.equal(result.report.releasable, true);
  const html = result.artifacts.get('page/index.html');
  assert.match(html, /<section class="reference-list"/);
  assert.match(html, /<li id="ref-choutka2022">/);
});

test('a configured build writes a deployable static site with discovery and error artifacts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  const outDir = join(root, 'dist');
  await mkdir(join(contentDir, 'notes'), { recursive: true });
  await writeFile(join(contentDir, 'notes', 'hello.md'), CELL('Hello from a complete build.', 'renamed-from:\n- notes/old-hello\n- ancient/hello\n'));
  await writeFile(join(contentDir, 'draft.md'), CELL('Not public yet.', 'status: potential\n'));

  const site = {
    name: 'Ordinary Example',
    baseIri: 'https://example.test/',
    language: 'en-US',
    menu: [{ label: 'Home', href: '/' }],
    license: 'CC BY 4.0',
  };
  const result = await build({
    contentDir, site,
    discovery: {
      webmention: '/webmention', micropub: '/micropub',
      indieauthMetadata: '/.well-known/oauth-authorization-server',
      me: 'https://social.example/@ordinary',
    },
  });

  assert.equal(result.report.releasable, true);
  assert.equal(result.report.cellCount, 2);
  assert.equal(result.report.publishedCount, 1);
  assert.equal(result.report.redirectCount, 2);
  assert.equal(result.catalog.cells.get('notes/hello').source.contractVersion, 'content-reader/v1');
  assert.equal(result.catalog.cells.get('notes/hello').title, 'A Test Cell');
  assert.equal(result.catalog.cells.get('notes/hello').source.id, 'notes/hello.md');
  assert.match(result.catalog.cells.get('notes/hello').source.provenance.href, /notes\/hello\.md$/);
  assert.equal(result.report.artifactProvenance['notes/hello/index.html'].projector, 'victor-page-tree');
  for (const path of ['index.html', 'notes/hello/index.html', 'notes/hello/neighborhood/index.html', 'notes/old-hello/index.html', 'ancient/hello/index.html', 'atlas/index.html', 'asset-manifest.json', 'feed.rss.xml', 'feed.atom.xml', 'feed.json', 'search/index.html', 'search/search-index.json', 'search/search.mjs', 'sitemap.xml', 'robots.txt', '404.html', 'redirects.json', 'release-manifest.json']) {
    assert.ok(result.artifacts.has(path), `missing ${path}`);
  }
  assert.equal(result.artifacts.has('report.json'), false, 'the build report is not a public artifact');
  assert.equal(result.artifacts.has('draft/index.html'), false);
  const catalogPage = result.artifacts.get('notes/hello/index.html');
  assert.match(catalogPage, /<link rel="canonical" href="https:\/\/example\.test\/notes\/hello\/"\s*\/?>/);
  assert.match(catalogPage, /<main class="tufte-shell"[^>]*data-tufte/);
  assert.match(catalogPage, /<section class="tufte-tile" id="catalog-cell"/);
  assert.match(catalogPage, /<article class="h-entry" data-pagefind-body data-cell-type="note" data-cell-status="active">/);
  assert.match(catalogPage, /"identifier":"ni:\/\/\/sha-256;/);
  assert.match(result.artifacts.get('sitemap.xml'), /<loc>https:\/\/example\.test\/notes\/hello\/<\/loc>/);
  assert.match(result.artifacts.get('sitemap.xml'), /<loc>https:\/\/example\.test\/atlas\/<\/loc>/);
  assert.match(result.artifacts.get('sitemap.xml'), /<loc>https:\/\/example\.test\/notes\/hello\/neighborhood\/<\/loc>/);
  assert.doesNotMatch(result.artifacts.get('sitemap.xml'), /draft/);
  assert.doesNotMatch(result.artifacts.get('sitemap.xml'), /old-hello/);
  assert.match(result.artifacts.get('notes/old-hello/index.html'), /https:\/\/example\.test\/notes\/hello\//);
  assert.deepEqual(JSON.parse(result.artifacts.get('redirects.json')), {
    'notes/old-hello': 'notes/hello',
    'ancient/hello': 'notes/hello',
  });
  assert.equal(makeResolver(result.catalog.cells, result.catalog.redirects)('notes/old-hello').href, '/notes/hello/');
  assert.equal(result.artifacts.get('robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: https://example.test/sitemap.xml\n');
  assert.match(result.artifacts.get('404.html'), /<meta[^>]*name="robots"[^>]*content="noindex"/);
  assert.match(result.artifacts.get('notes/hello/index.html'), /type="application\/rss\+xml"/);
  assert.match(result.artifacts.get('notes/hello/index.html'), /type="application\/feed\+json"/);
  assert.match(result.artifacts.get('notes/hello/index.html'), /rel="webmention" href="\/webmention"/);
  assert.match(result.artifacts.get('notes/hello/index.html'), /rel="micropub" href="\/micropub"/);
  assert.match(result.artifacts.get('notes/hello/index.html'), /rel="indieauth-metadata"/);
  assert.match(result.artifacts.get('notes/hello/index.html'), /rel="me" href="https:\/\/social\.example\/@ordinary"/);
  assert.equal(result.artifactRecords.get('feed.rss.xml').mediaType, 'application/rss+xml; charset=utf-8');
  assert.equal(result.artifactRecords.get('feed.json').mediaType, 'application/feed+json; charset=utf-8');
  assert.equal(JSON.parse(result.artifacts.get('search/search-index.json')).documentCount > 0, true);
  const assetManifest = JSON.parse(result.artifacts.get('asset-manifest.json'));
  assert.equal(JSON.stringify(assetManifest).includes('report.json'), false);
  const stylesheet = assetManifest.assets.find(({ source }) => source === 'styles.css');
  assert.ok(result.artifacts.has(stylesheet.path));
  assert.equal(result.artifacts.has('styles.css'), false);
  assert.ok(result.artifacts.get('index.html').includes(`href="/${stylesheet.path}" integrity="sha384-`));
  assert.equal(result.report.browserAssets.transformedCount, 1);
  const releaseManifest = JSON.parse(result.artifacts.get('release-manifest.json'));
  assert.equal(releaseManifest.artifacts.some(({ path }) => path === 'report.json'), false);
  assert.equal(releaseManifest.kind, 'web-release-manifest');
  assert.equal(releaseManifest.metadata.victor.catalogHash, result.catalog.hash);
  assert.equal(result.report.releaseCandidate.digest, releaseManifest.digest);
  assert.equal(result.report.staticSiteConformance.valid, true);
  assert.equal(result.report.staticSiteConformance.documentCount > 0, true);
  assert.equal(verifyWebReleaseManifest({ manifest: releaseManifest, artifacts: result.artifactRecords }).valid, true);

  await writeArtifacts(result.artifacts, outDir);
  const reportPath = await writeBuildReport(result.report, outDir);
  assert.equal(reportPath, `${outDir}.report.json`);
  assert.equal(JSON.parse(await readFile(reportPath, 'utf8')).catalogHash, result.report.catalogHash);
  assert.equal(await readFile(join(outDir, 'report.json'), 'utf8').catch(() => null), null);
  const directoryVerification = await verifyWebReleaseDirectory({ manifest: releaseManifest, root: outDir });
  assert.equal(directoryVerification.valid, true);
  assert.equal(directoryVerification.verifiedFileCount, releaseManifest.artifactCount);
  assert.equal(await readFile(join(outDir, 'robots.txt'), 'utf8'), result.artifacts.get('robots.txt'));
  assert.match(await readFile(join(outDir, 'notes', 'hello', 'index.html'), 'utf8'), /Hello from a complete build/);
});

test('TUFTE atlas and neighborhood pages preserve useful source order and working links', () => {
  const a = parseCell('notes/a', CELL('See [[notes/b]].'));
  const b = parseCell('notes/b', CELL('Linked page.', 'title: Linked Cell\n'));
  const c = parseCell('notes/c', CELL('See [[notes/a]].', 'title: Incoming Cell\n'));
  const cells = new Map([[a.name, a], [b.name, b], [c.name, c]]);
  const incoming = new Map([
    [a.name, [{ type: 'links', from: c.name }]],
    [b.name, [{ type: 'links', from: a.name }]],
  ]);
  const site = {
    name: 'Tile Test', baseIri: 'https://tiles.example/', language: 'en',
    menu: [{ label: 'home', href: '/' }], license: 'Test license',
  };

  const atlas = renderAtlasPage([a, b, c], { site });
  assert.match(atlas, /data-tufte/);
  assert.ok(atlas.indexOf('id="cell-notes-a"') < atlas.indexOf('id="cell-notes-b"'));
  assert.match(atlas, /href="\/notes\/b\/"/);

  const neighborhood = renderNeighborhoodPage(a, { site, cells, incoming });
  assert.ok(neighborhood.indexOf('id="cell-notes-a"') < neighborhood.indexOf('id="cell-notes-b"'));
  assert.ok(neighborhood.indexOf('id="cell-notes-b"') < neighborhood.indexOf('id="cell-notes-c"'));
  assert.match(neighborhood, /outgoing · links/);
  assert.match(neighborhood, /incoming · links/);
  assert.match(neighborhood, /href="\/notes\/a\/"/);
});

test('OpenGraph and Twitter-card meta are emitted from the cell/front-matter model', () => {
  const withImage = parseCell('notes/hero', CELL('A cell with a lead image.', 'summary: A short summary.\nimage: /images/hero.png\n'));
  const withoutImage = parseCell('notes/plain', CELL('A cell with no image.', 'summary: No picture here.\n'));
  const cells = new Map([[withImage.name, withImage], [withoutImage.name, withoutImage]]);
  const site = {
    name: 'Social Test', baseIri: 'https://social.example/', language: 'en',
    menu: [{ label: 'home', href: '/' }], license: 'Test license',
  };

  const withImagePage = renderPage(withImage, { site, cells, incoming: new Map(), resolve: () => null });
  assert.match(withImagePage, /<meta property="og:title" content="A Test Cell">/);
  assert.match(withImagePage, /<meta property="og:type" content="article">/);
  assert.match(withImagePage, /<meta property="og:url" content="https:\/\/social\.example\/notes\/hero\/">/);
  assert.match(withImagePage, /<meta property="og:description" content="A short summary\.">/);
  assert.match(withImagePage, /<meta property="og:image" content="https:\/\/social\.example\/images\/hero\.png">/);
  assert.match(withImagePage, /<meta name="twitter:card" content="summary_large_image">/);

  const withoutImagePage = renderPage(withoutImage, { site, cells, incoming: new Map(), resolve: () => null });
  assert.doesNotMatch(withoutImagePage, /og:image/);
  assert.match(withoutImagePage, /<meta name="twitter:card" content="summary">/);
});

test('site-level pages carry website-typed OpenGraph meta from the site config', () => {
  const cell = parseCell('notes/only', CELL('Just one cell.'));
  const site = {
    name: 'Index Social Test', baseIri: 'https://index.example/', language: 'en',
    menu: [{ label: 'home', href: '/' }], license: 'Test license',
  };
  const index = renderIndexPage([cell], { site });
  assert.match(index, /<meta property="og:title" content="Index Social Test">/);
  assert.match(index, /<meta property="og:type" content="website">/);
  assert.match(index, /<meta property="og:url" content="https:\/\/index\.example\/">/);
  assert.match(index, /<meta name="twitter:card" content="summary">/);
});

test('publication archives provide complete, paged, section, and taxonomy routes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-archives-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'notes'), { recursive: true });
  await mkdir(join(root, 'letters'), { recursive: true });
  await writeFile(join(root, 'notes', 'a.md'), CELL('A.'));
  await writeFile(join(root, 'notes', 'b.md'), CELL('B.', 'title: B\nstatus: potential\n'));
  await writeFile(join(root, 'letters', 'c.md'), CELL('C.', 'title: C\ntype: letter\n'));

  const result = await build({ contentDir: root, drafts: true, archives: { pageSize: 2 }, site: { baseIri: 'https://archives.example/' } });
  for (const path of [
    'index.html', 'page/2/index.html', 'archive/index.html',
    'notes/index.html', 'notes/archive/index.html', 'letters/index.html',
    'sections/index.html', 'tags/index.html', 'tags/testing/index.html',
    'types/index.html', 'types/note/index.html', 'statuses/index.html', 'statuses/potential/index.html',
  ]) assert.ok(result.artifacts.has(path), `missing ${path}`);

  assert.match(result.artifacts.get('index.html'), /Page 1 of 2/);
  assert.doesNotMatch(result.artifacts.get('index.html'), /href="\/notes\/b\/"/);
  assert.match(result.artifacts.get('page/2/index.html'), /href="\/notes\/b\/"/);
  assert.match(result.artifacts.get('page/2/index.html'), /rel="canonical" href="https:\/\/archives\.example\/page\/2\/"/);
  assert.match(result.artifacts.get('page/2/index.html'), /rel="prev" href="https:\/\/archives\.example\/"/);
  assert.match(result.artifacts.get('archive/index.html'), /All 3 publications are shown on this page/);
  assert.match(result.artifacts.get('tags/index.html'), /href="\/tags\/testing\/"/);
  assert.match(result.artifacts.get('sitemap.xml'), /https:\/\/archives\.example\/notes\/archive\//);
  assert.equal(result.report.publicationArchives.pageSize, 2);
  assert.equal(result.report.publicationArchives.collisionCount, 0);

  const disabled = await build({ contentDir: root, drafts: true, archives: false, search: false });
  assert.equal(disabled.report.publicationArchives.enabled, false);
  assert.equal(disabled.artifacts.has('archive/index.html'), false);
  assert.equal(disabled.artifacts.has('search/index.html'), false);
  assert.equal(disabled.artifacts.has('search/search-index.json'), false);
  assert.match(disabled.artifacts.get('index.html'), /href="\/notes\/b\/"/);
  assert.doesNotMatch(disabled.artifacts.get('index.html'), /href="\/search\/"/);
});

test('archive route collisions are actionable and preserve the cell artifact', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-archive-collision-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'tags.md'), CELL('This cell owns the tags route.'));
  const result = await build({ contentDir: root });
  assert.equal(result.report.releasable, false);
  assert.ok(result.report.refusals.some(({ code, subject }) => code === 'WPA-001' && subject === 'tags/index.html'));
  assert.match(result.artifacts.get('tags/index.html'), /This cell owns the tags route/);
});

test('project configuration loads from an ordinary JavaScript module', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'static-site-publisher.config.mjs');
  await writeFile(file, `export default { publicDir: './public', site: { name: 'Configured Site', baseIri: 'https://configured.example/' } };\n`);
  const config = await loadProjectConfig(file);
  assert.equal(config.site.name, 'Configured Site');
  assert.equal(config.site.baseIri, 'https://configured.example/');
  assert.equal(config.publicDir, join(root, 'public'));
});

test('a downstream application becomes a served, rebuildable TUFTE website through VICTOR alone', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-website-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cellPath = join(root, 'welcome.md');
  await writeFile(cellPath, CELL('First website revision.'));

  const website = await createVictorWebsite({
    contentDir: root,
    site: { name: 'Framework Site', baseIri: 'http://127.0.0.1/' },
    search: false,
    assets: false,
    release: false,
    applications: {
      resources: [{
        id: 'downstream-domain-resource',
        match: '/api/domain',
        methods: ['GET'],
        handler: () => ({
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ owner: 'downstream-application' }),
        }),
      }],
    },
    runtime: { observability: false, probes: false },
  });
  t.after(() => website.close(0));
  const running = await website.start({ host: '127.0.0.1', port: 0 });
  const origin = `http://127.0.0.1:${running.port}`;

  const domain = await fetch(`${origin}/api/domain`);
  assert.deepEqual(await domain.json(), { owner: 'downstream-application' });
  assert.match(await (await fetch(`${origin}/atlas/`)).text(), /data-tufte/);
  assert.match(await (await fetch(`${origin}/welcome/`)).text(), /First website revision/);

  await writeFile(cellPath, CELL('Second website revision.'));
  const rebuilt = await website.rebuild();
  assert.equal(website.getBuild(), rebuilt);
  assert.match(await (await fetch(`${origin}/welcome/`)).text(), /Second website revision/);
});

test('project configuration has a versioned closed schema with actionable diagnostics', () => {
  const valid = normalizeProjectConfig({
    configVersion: 1,
    publicDir: '/tmp/public',
    site: { name: 'Example' },
    applications: () => [],
  });
  assert.equal(valid.config.configVersion, 1);
  assert.equal(valid.config.publicDir, '/tmp/public');
  assert.equal(valid.config.home, true);
  assert.deepEqual(valid.refusals, []);

  const invalid = normalizeProjectConfig({ configVersion: 7, publicDir: '', mystery: true, applications: 42, reader: {}, projectors: {} });
  assert.deepEqual(invalid.refusals.map((item) => item.subject).sort(), [
    'config.applications', 'config.configVersion', 'config.mystery', 'config.projectors', 'config.publicDir', 'config.reader',
  ]);
  assert.equal(invalid.config.publicDir, undefined);
  assert.equal(invalid.config.applications, undefined);
  assert.equal(normalizeProjectConfig({ home: false }).config.home, false);
  assert.equal(normalizeProjectConfig({ home: 'index' }).config.home, 'index');
  assert.ok(normalizeProjectConfig({ home: 3 }).refusals.some(({ subject }) => subject === 'config.home'));
  assert.ok(normalizeProjectConfig({ home: '' }).refusals.some(({ subject }) => subject === 'config.home'));
  const limits = normalizeProjectConfig({ release: { maxBytes: 4 * 1024 ** 3, maxFiles: 250_000 } });
  assert.deepEqual(limits.refusals, []);
  assert.deepEqual(limits.config.release, { maxBytes: 4 * 1024 ** 3, maxFiles: 250_000 });
  const badLimit = normalizeProjectConfig({ release: { maxBytes: -1, maxFiles: 1.5 } });
  assert.deepEqual(badLimit.refusals.map(({ subject }) => subject).sort(), ['config.release.maxBytes', 'config.release.maxFiles']);
  assert.deepEqual(badLimit.config.release, {}, 'a refused limit is dropped, not carried into the release');

  const invalidArchives = normalizeProjectConfig({ archives: { pageSize: 0, extra: true } });
  assert.deepEqual(invalidArchives.refusals.map(({ subject }) => subject).sort(), [
    'config.archives.extra', 'config.archives.pageSize',
  ]);
  assert.equal(invalidArchives.config.archives.pageSize, 20);
  assert.deepEqual(normalizeProjectConfig({ archives: { pageSize: 7 } }).config.archives, { pageSize: 7 });
  assert.equal(normalizeProjectConfig({ archives: false }).config.archives, false);
  assert.equal(normalizeProjectConfig({ search: false }).config.search, false);
  assert.deepEqual(normalizeProjectConfig({ search: { stopWords: ['the'] } }).config.search, { stopWords: ['the'] });
  assert.ok(normalizeProjectConfig({ search: 42 }).refusals.some(({ subject }) => subject === 'config.search'));
  assert.equal(normalizeProjectConfig({ assets: false }).config.assets, false);
  assert.deepEqual(normalizeProjectConfig({ assets: { hashLength: 16 } }).config.assets, { hashLength: 16 });
  assert.ok(normalizeProjectConfig({ assets: 42 }).refusals.some(({ subject }) => subject === 'config.assets'));
  assert.equal(normalizeProjectConfig({ release: false }).config.release, false);
  assert.deepEqual(normalizeProjectConfig({ release: { profile: 'preview' } }).config.release, { profile: 'preview' });
  assert.ok(normalizeProjectConfig({ release: 42 }).refusals.some(({ subject }) => subject === 'config.release'));
  assert.deepEqual(normalizeProjectConfig({ discovery: { webmention: '/webmention', me: ['https://social.example/me'] } }).config.discovery, {
    webmention: '/webmention', me: ['https://social.example/me'],
  });
  assert.deepEqual(normalizeProjectConfig({ discovery: { webmention: 'javascript:alert(1)', unknown: '/' } }).refusals.map(({ subject }) => subject).sort(), [
    'config.discovery.unknown', 'config.discovery.webmention',
  ]);
});

test('public assets are copied byte-for-byte and receive useful media types', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  const publicDir = join(root, 'public');
  const outDir = join(root, 'dist');
  await mkdir(contentDir);
  await mkdir(join(publicDir, 'images'), { recursive: true });
  await writeFile(join(contentDir, 'page.md'), CELL('Body.'));
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
  await writeFile(join(publicDir, 'images', 'sample.png'), image);
  await writeFile(join(publicDir, 'app.webmanifest'), '{"name":"Example"}\n');

  const result = await build({ contentDir, publicDir });
  assert.equal(result.report.releasable, true);
  assert.deepEqual(result.artifacts.get('images/sample.png'), image);
  assert.ok(result.report.artifactHashes['images/sample.png']);
  assert.equal(mediaTypeFor('images/sample.png'), 'image/png');
  assert.equal(mediaTypeFor('app.webmanifest'), 'application/manifest+json; charset=utf-8');
  assert.equal(mediaTypeFor('unknown.bin'), 'application/octet-stream');

  await writeArtifacts(result.artifacts, outDir);
  assert.deepEqual(await readFile(join(outDir, 'images', 'sample.png')), image);
});

test('completed release conformance refuses broken internal artifact links', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-links-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  const publicDir = join(root, 'public');
  await mkdir(contentDir);
  await mkdir(publicDir);
  await writeFile(join(contentDir, 'page.md'), CELL('Body.'));
  await writeFile(join(publicDir, 'broken.html'), '<!doctype html><a href="/missing/">Missing</a>');
  const result = await build({ contentDir, publicDir });
  assert.equal(result.report.releasable, false);
  assert.equal(result.report.staticSiteConformance.valid, false);
  assert.ok(result.report.refusals.some(({ code, subject }) => code === 'SSC-106' && subject === 'broken.html'));
});

test('an optional second-phase PWA projector derives a manifest and worker from the completed release', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-pwa-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'page.md'), CELL('Available offline.'));
  const result = await build({
    contentDir: root,
    site: { name: 'PWA Example', baseIri: 'https://pwa.example/' },
    pwa: {
      manifest: {
        name: 'PWA Example',
        shortName: 'Example',
        startUrl: '/',
        themeColor: '#6e1e3c',
        backgroundColor: '#fbfaf7',
      },
      offlineFallback: '/',
    },
  });
  assert.equal(result.report.releasable, true);
  const manifest = JSON.parse(result.artifacts.get('manifest.webmanifest'));
  assert.equal(manifest.name, 'PWA Example');
  assert.equal(manifest.start_url, '/');
  assert.match(result.artifacts.get('service-worker.js'), /const PRECACHE=.*\/page\//);
  assert.equal(result.artifactRecords.get('service-worker.js').provenance.projector, 'progressive-web-app');
  assert.deepEqual(result.report.projectorOrder.slice(-2), [
    { name: 'progressive-web-app', priority: 110 },
    { name: 'web-release-candidate', priority: 120 },
  ]);
  assert.match(result.report.artifactHashes['service-worker.js'], /^[A-Za-z0-9_-]{43}$/);
});

test('a public asset cannot overwrite a generated artifact', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-asset-conflict-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = join(root, 'content');
  const publicDir = join(root, 'public');
  await mkdir(contentDir);
  await mkdir(publicDir);
  await writeFile(join(contentDir, 'page.md'), CELL('Body.'));
  await writeFile(join(publicDir, 'index.html'), 'replacement');

  const result = await build({ contentDir, publicDir });
  assert.equal(result.report.releasable, false);
  assert.notEqual(result.artifacts.get('index.html'), 'replacement');
  assert.ok(result.report.refusals.some((item) => item.code === 'R-01' && item.subject === 'index.html'));
});

test('redirect aliases cannot claim current cells or generated routes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-redirect-conflict-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'one.md'), CELL('One.', 'renamed-from:\n- two\n- atlas\n'));
  await writeFile(join(root, 'two.md'), CELL('Two.', 'title: Two\n'));
  const result = await build({ contentDir: root });
  assert.equal(result.report.releasable, false);
  assert.ok(result.report.refusals.some((item) => item.code === 'R-01' && item.subject === 'two'));
  assert.ok(result.report.refusals.some((item) => item.code === 'R-01' && item.subject === 'atlas/index.html'));
  assert.match(result.artifacts.get('atlas/index.html'), /data-tufte/);
});

test('independent projectors contribute provenance-bearing artifacts and fail closed on collision', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-projectors-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'page.md'), CELL('Body.'));
  const projectors = [
    {
      name: 'example-manifest', priority: 70,
      project: ({ catalog }) => ({
        artifacts: [{ path: 'catalog-count.json', body: `${JSON.stringify({ count: catalog.cells.size })}\n`, source: 'example:catalog' }],
      }),
    },
    {
      name: 'example-collision', priority: 80,
      project: () => ({ artifacts: new Map([['index.html', 'must not replace the page tree']]) }),
    },
  ];
  const result = await build({ contentDir: root, projectors });
  assert.equal(result.artifacts.get('catalog-count.json'), '{"count":1}\n');
  assert.equal(result.artifactRecords.get('catalog-count.json').provenance.projector, 'example-manifest');
  assert.equal(result.artifactRecords.get('catalog-count.json').provenance.source, 'example:catalog');
  assert.match(result.artifacts.get('index.html'), /A VICTOR Site/);
  assert.equal(result.report.releasable, false);
  assert.ok(result.report.refusals.some((item) => item.code === 'R-01' && item.subject === 'index.html'));
  assert.deepEqual(result.report.projectorOrder.slice(-6), [
    { name: 'example-collision', priority: 80 },
    { name: 'victor-public-assets', priority: 100 },
    { name: 'rendered-html-conformance', priority: 101 },
    { name: 'browser-asset-inventory', priority: 102 },
    { name: 'public-site-search', priority: 105 },
    { name: 'web-release-candidate', priority: 120 },
  ]);
});

test('home false reserves the root route for an independent projector', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-custom-home-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'page.md'), CELL('Body.'));
  const result = await build({
    contentDir: root,
    home: false,
    projectors: [{
      name: 'custom-home', priority: 15,
      project: () => ({ artifacts: [{ path: 'index.html', body: CUSTOM_HOME, source: 'custom:home' }] }),
    }],
  });
  assert.equal(result.report.releasable, true);
  assert.equal(result.artifacts.get('index.html'), CUSTOM_HOME);
  assert.equal(result.artifactRecords.get('index.html').provenance.projector, 'custom-home');
});

test('a named home cell owns the root route', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-named-home-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'welcome.md'), '---\ntitle: Welcome\ndate-created: 2026-01-01\ntype: index\n---\n\nThe home body.\n');
  await writeFile(join(root, 'page.md'), CELL('Body.'));
  const result = await build({ contentDir: root, home: 'welcome' });
  assert.equal(result.report.releasable, true);
  assert.match(result.artifacts.get('index.html'), /The home body\./);
  assert.ok(result.artifacts.has('welcome/index.html'));
  const missing = await build({ contentDir: root, home: 'absent' });
  assert.ok(missing.report.refusals.some(({ subject }) => subject === 'config.home'));
});

// A custom root page is held to the same anatomy as VICTOR's own pages.
const CUSTOM_HOME = '<!doctype html><html lang="en"><head><title>Custom home</title></head><body><main><h1>Custom home</h1><nav aria-label="Site"><a href="/atlas/">Atlas</a></nav></main></body></html>';

test('rendered-HTML conformance runs over every HTML artifact and names the SAS check and refusal code', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-html-conformance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'page.md'), CELL('Body with ![a picture](/pic.png) and text.'));
  const broken = [
    '<!doctype html><html><head><title>Broken</title>',
    '<script type="application/ld+json">{"@context":"https://schema.org","name":"untyped"}</script>',
    '</head><body><main id="content"><h1 id="dup">One</h1><h3>Skipped</h3><p id="dup">twice</p>',
    '<nav role="navigation"><a href="/"><img src="/x.png"></a></nav></main></body></html>',
  ].join('');
  const result = await build({
    contentDir: root,
    projectors: [{ name: 'broken-page', priority: 15, project: () => ({ artifacts: [{ path: 'broken/index.html', body: broken, source: 'custom:broken' }] }) }],
  });
  const findings = result.report.refusals.filter((item) => item.subject === 'broken/index.html');
  const codes = (check) => findings.filter((item) => item.data.check === check).map((item) => item.code);
  assert.deepEqual(codes('C-01'), ['R-13'], 'duplicate ids are C-01/R-13');
  assert.deepEqual(codes('C-02'), ['R-14'], 'a redundant explicit role is C-02/R-14');
  assert.deepEqual(codes('C-09'), ['R-10'], 'a skipped heading level on the rendered page is C-09/R-10');
  assert.deepEqual(codes('C-10'), ['R-11'], 'an image without alt is C-10/R-11');
  assert.deepEqual(codes('C-12'), ['R-12'], 'a JSON-LD node without @type is C-12/R-12');
  const advisories = result.report.advisories.filter((item) => item.subject === 'broken/index.html');
  assert.ok(advisories.some((item) => item.code === 'A-03' && item.data.check === 'C-03'), 'a missing lang attribute is a C-03 advisory');
  assert.ok(advisories.some((item) => item.code === 'A-03' && /accessible name/.test(item.reason)), 'a link with no accessible name is advised');
  assert.equal(result.report.releasable, false);
  assert.equal(result.report.htmlConformance.enabled, true);
  assert.equal(result.report.htmlConformance.valid, false);
  assert.ok(result.report.htmlConformance.documentCount >= 4);
  assert.ok(result.report.htmlConformance.checks.find((check) => check.id === 'C-09').flaggedDocuments === 1);

  // VICTOR's own pages pass every check: the gate is a real assay, not a new refusal source.
  const own = result.report.refusals.filter((item) => item.subject !== 'broken/index.html' && item.data?.check);
  assert.deepEqual(own, []);
  assert.ok(result.report.advisories.some((item) => item.subject === 'page/index.html' && item.data?.check === 'C-10' && /intrinsic/.test(item.reason)), 'an image without dimensions on an own page is advised, not refused, because VICTOR does not yet measure images');
  assert.match(result.artifacts.get('page/index.html'), /<nav aria-label="Explore">/);
  assert.match(result.artifacts.get('atlas/index.html'), /<nav aria-label="Return">/);

  const disabled = await build({ contentDir: root, conformance: false });
  assert.deepEqual(disabled.report.htmlConformance, { enabled: false });
});

test('the VICTOR runtime composes lower HTTP applications, redirects, and release artifacts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'published.md'), CELL('Published body.', 'renamed-from:\n- old-name\n- earlier-name\n'));
  await writeFile(join(root, 'draft.md'), CELL('Draft body.', 'status: potential\n'));
  const result = await build({
    contentDir: root,
    drafts: true,
    site: { baseIri: 'https://runtime.example/' },
  });
  let publicationCount;
  let listPublications;
  const app = await createVictorApplication(result, (context) => {
    const { publications } = context;
    publicationCount = publications.length;
    listPublications = context.listPublications;
    return {
      resources: [{
        match: '/health', methods: ['GET'],
        handler: () => ({ status: 200, type: 'text/plain; charset=utf-8', body: 'lower app' }),
      }, {
        id: 'lower-alias', match: '/old-name', methods: ['GET', 'HEAD'],
        handler: () => ({ status: 200, type: 'text/plain; charset=utf-8', body: 'application wins' }),
      }],
    };
  });
  assert.equal(publicationCount, 1, 'potential cells must not leak into runtime publication adapters');

  assert.ok(app.resources.length > 6, 'projected release addresses are concrete router resources');
  assert.equal(app.middlewares.length, 4, 'shared correlation, trace, timing, and metrics middleware are active');
  assert.ok(app.observability.registry, 'the runtime exposes its private metrics surface to operators');
  const health = app.resources.find((resource) => resource.match === '/healthz');
  const ready = app.resources.find((resource) => resource.match === '/readyz');
  const lower = app.resources.find((resource) => resource.match === '/health');
  const redirect = app.resources.find((resource) => resource.id === 'victor-redirect:old-name');
  const artifactResource = app.resources.at(-1);
  assert.equal(lower.handler().body, 'lower app');
  const healthReport = JSON.parse((await health.handler({})).body);
  assert.equal(healthReport.status, 'pass');
  assert.equal('charge' in healthReport, false, 'normal operational output does not expose theory extensions');
  const readyReport = JSON.parse((await ready.handler({})).body);
  assert.equal(readyReport.status, 'pass');
  assert.equal(redirect.route, '/old-name');
  assert.equal(redirect.match('/old-name'), true);
  assert.equal(redirect.match('/old-name/'), true);
  assert.equal(redirect.match('/old-name/child'), false);
  assert.deepEqual(await redirect.handler({ url: new URL('https://runtime.example/old-name/'), params: {} }), {
    status: 301, headers: { location: '/published/' }, body: '',
  });

  const oldNameClaims = app.routeManifest.filter((route) => route.pattern.replace(/\/$/, '') === '/old-name');
  assert.deepEqual(oldNameClaims.map((route) => route.source), ['application', 'redirect', 'artifact']);
  assert.equal(oldNameClaims[1].shadowedBy, 'lower-alias');
  assert.equal(oldNameClaims[2].shadowedBy, 'lower-alias');
  assert.ok(Object.isFrozen(app.routeManifest));

  const applicationIndex = app.resources.findIndex((resource) => resource.id === 'lower-alias');
  const redirectIndex = app.resources.findIndex((resource) => resource.id === 'victor-redirect:old-name');
  const artifactFallbackIndex = app.resources.length - 1;
  assert.ok(applicationIndex < redirectIndex && redirectIndex < artifactFallbackIndex);
  const earlierRedirect = app.resources.find((resource) => resource.id === 'victor-redirect:earlier-name');
  assert.deepEqual(await earlierRedirect.handler({ url: new URL('https://runtime.example/earlier-name/'), params: {} }), {
    status: 301, headers: { location: '/published/' }, body: '',
  });
  const projectedArtifact = await artifactResource.handler({
    req: { url: '/published/' }, url: new URL('https://runtime.example/published/'), params: {},
  });
  assert.equal(projectedArtifact.status ?? 200, 200);
  assert.match(projectedArtifact.body, /Published body/);
  const artifact = artifactResource.handler({
    req: { url: '/' }, url: new URL('https://runtime.example/'),
  });
  assert.equal(artifact.type, 'text/html; charset=utf-8');
  assert.equal(artifact.cacheControl, 'public, max-age=0, must-revalidate');
  assert.match(artifact.etag, /^"[a-f0-9]{40}"$/);
  assert.match(artifact.body, /A VICTOR Site/);
  const rss = artifactResource.handler({ req: { url: '/feed.rss.xml' }, url: new URL('https://runtime.example/feed.rss.xml') });
  assert.equal(rss.type, 'application/rss+xml; charset=utf-8');
  assert.match(rss.body, /<rss version="2\.0"/);
  const jsonFeed = artifactResource.handler({ req: { url: '/feed.json' }, url: new URL('https://runtime.example/feed.json') });
  assert.equal(jsonFeed.type, 'application/feed+json; charset=utf-8');
  assert.equal(JSON.parse(jsonFeed.body).version, 'https://jsonfeed.org/version/1.1');

  await writeFile(join(root, 'draft.md'), CELL('Now published.', 'status: active\n'));
  const updated = await build({
    contentDir: root,
    drafts: true,
    site: { baseIri: 'https://runtime.example/' },
  });
  app.updateBuild(updated);
  assert.equal(listPublications().length, 2, 'lower applications should observe rebuilds without being recreated');

  const observable = await createVictorApplication(updated, undefined, {
    observability: { metrics: { path: '/operations/metrics' } },
  });
  assert.equal(observable.resources[0].match, '/operations/metrics');
  assert.ok(observable.observability.registry);

  const quiet = await createVictorApplication(updated, undefined, { observability: false });
  assert.equal(quiet.middlewares.length, 0);
  assert.equal(quiet.observability, undefined);

  const withoutProbes = await createVictorApplication(updated, undefined, { probes: false });
  assert.equal(withoutProbes.resources.some((resource) => resource.match === '/healthz'), false);
});

test('invalid deployment configuration produces an ordinary actionable refusal', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'victor-invalid-site-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'page.md'), CELL('Body.'));
  const invalidBuild = await build({ contentDir: root, site: { baseIri: 'not a URL' } });
  const { report } = invalidBuild;
  assert.equal(report.releasable, false);
  assert.ok(report.refusals.some((item) => item.code === 'R-15' && /absolute HTTP/.test(item.reason)));

  const invalidRelease = await build({ contentDir: root, release: { excludePaths: 42 } });
  assert.equal(invalidRelease.report.releasable, false);
  assert.ok(invalidRelease.report.refusals.some((item) => item.code === 'WRC-008'));

  const app = await createVictorApplication(invalidBuild);
  const ready = app.resources.find((resource) => resource.match === '/readyz');
  const response = await ready.handler({});
  assert.equal(response.status, 503);
  const readiness = JSON.parse(response.body);
  assert.equal(readiness.status, 'fail');
  assert.ok(readiness.checks.some((check) => check.name === 'release' && check.status === 'fail'));
});
