import { resolveReadingLinks, retainDocumentEmbeds } from '@red-cup-engineering/knowledge-system-server/vault-catalog';
import { createImmutableContentCustody } from '@red-cup-engineering/immutable-content-custody-service';
import { createFileStore } from '@red-cup-engineering/immutable-content-custody-service/file-store';
import { niResource } from '@red-cup-engineering/http-services-section/ni';
import { createGeminiNotebookBucketResource } from '@red-cup-engineering/gemini-notebook-services-section/gemini-notebook-buckets';
import { handleVocabularyRequest, ownsVocabularyRequest } from '@red-cup-engineering/knowledge-system-server/vocabulary';
import { parseBody, renderBody } from '@red-cup-engineering/markdown-engineering-services-section/relational-markdown';
import { createHash } from 'node:crypto';
import { createGeodeWorkspace } from '@red-cup-engineering/graphical-knowledge-system-server/workspace';
import { createGeodeFetchHandler } from '@red-cup-engineering/graphical-knowledge-system-server/server';
import { fetchApplication } from '@red-cup-engineering/computer-web-server/compose';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createVaultMazeApplication } from '@red-cup-engineering/graphical-knowledge-game-server/application';
import { createReviewStore } from '@red-cup-engineering/graphical-knowledge-game-server/review-store';
import { join, resolve } from 'node:path';
import { openArchive } from '@red-cup-engineering/knowledge-system-server/archive';
import { selectDeclaredDirectoryRoot, assertDeclaredDirectoryRoot } from '@red-cup-engineering/computer-file-engineering-services-section/declared-directory-root';
import { searchAndFetchTools, vaultMcpTools } from '@red-cup-engineering/knowledge-system-server/mcp-tools';
import { textRepr } from '@red-cup-engineering/http-services-section/representation';

import { EXCLUDED_SEGMENTS, lSpaceReaderPolicy, publicSourceVisible } from '../src/l-space-reader-policy.mjs';
const escape = (value) => String(value ?? '').replace(/[&<>"']/gu, (c) => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const documentPath = (id) => `/knowledge?document=${encodeURIComponent(id)}`;
/** A browser reading of the existing CAIRN topic operation. These are sourced
 * documentary relations, not automatically authorized work or RDF entailments.
 * This is the human counterpart of the already-installed lspace_vault_topic.
 * All linked paths come from the same admitted archive as /knowledge?document.
 */
function renderSourceTermDossier(topic) {
  if (!topic || topic.type !== 'CairnTopic' || !Array.isArray(topic.homes)
    || !Array.isArray(topic.namesakes) || !Array.isArray(topic.pointing)
    || !Array.isArray(topic.gaps)) throw new TypeError('an admitted CairnTopic reading is required');
  const source = (path, title = path) =>
    `<a href="${escape(documentPath(path))}">${escape(title)}</a>`;
  const items = (rows, render, empty) =>
    rows.length ? `<ul>${rows.map(item=>`<li>${render(item)}</li>`).join('')}</ul>`
      : `<p>${escape(empty)}</p>`;
  const cite = item => `${source(item.path, item.title ?? item.path)}${item.locale ? ` <small>(${escape(item.locale)})</small>` : ''}`;
  const links = (topic.mentioning ?? []).map(path=>source(path));
  const mentions = topic.mentioningCount ?? links.length;
  const neighbourhood = topic.neighbourhood ?? {};
  const facet = (label, values = []) =>
    values.length ? `<h4>${escape(label)}</h4>${items(values,
      value=>`${escape(value.value)} (${escape(value.count)})`, 'No values')}` : '';
  const gaps = topic.gaps.map(gap=>`<strong>${escape(gap.gap)}</strong> — ${escape(gap.reason)}`);
  return `<article><h2>Language-space readings of “${escape(topic.name)}”</h2>
    <p>Read source-claimed relations and their contexts. A document, repeated word, or frontmatter key does not establish a proof, a current office appointment, or a received action.</p>
    <section><h3>Source-owned glossary homes</h3>${items(topic.homes,cite,'No qualified glossary home answers to this name.')}</section>
    <section><h3>Other readings of this name</h3>${items(topic.namesakes,cite,'No additional namesakes.')}</section>
    <section><h3>Documents that refer to it through a named relation (${escape(topic.pointingCount ?? topic.pointing.length)})</h3>
      ${items(topic.pointing,item=>`${source(item.path)} — ${escape(item.through.join(', '))}`,'No source relation references found.')}</section>
    <section><h3>Textual mentions without an identified typed relation (${escape(mentions)})</h3>
      ${items(links,item=>item,'No additional textual mentions.')}</section>
    <section><h3>Context of nearby documents (${escape(neighbourhood.documents ?? 0)})</h3>
      ${facet('Source types',neighbourhood.byType)}
      ${facet('Keywords',neighbourhood.byKeyword)}
      ${facet('Source locales',neighbourhood.byLocale)}</section>
    <section><h3>Open source-resolution questions</h3>${items(gaps,item=>item,'No source-resolution gap found by this reading.')}</section>
    <p><small>Counts describe the selected admitted corpus, not truth or independent evidence. Check source revisions, authority, competing testimony, and exact receiver conditions before relying on a claim.</small></p>
  </article>`;
}
const page = (body) => textRepr(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>L-Space · MetroPlat</title></head><body><nav><a href="/play">MetroPlat</a> · <a href="/knowledge">L-Space</a></nav><main><h1>L-Space</h1><form action="/knowledge" method="get"><label>Search source documents <input name="query" type="search" required></label><button>Search</button></form><form action="/knowledge" method="get"><label>Explore a term and its source relations <input name="name" type="search" required></label><button>Explore</button></form>${body}</main></body></html>`, {type: 'text/html; charset=utf-8', cacheControl: {noStore:true}});

/** One installed, read-only archive projection. The FeltOS entrance admits both
 * people and machine clients; this application opens no listener or OAuth server.
 * Search URLs, HTTP reading and MCP fetch retain the same document id/revision. */
export function lSpaceMetroplat({config, admission, configuration = {}, archive: suppliedArchive}) {
  if (typeof configuration.root !== 'string' || !configuration.root.trim()) {
    throw new TypeError('L-Space requires its corpus root in the installed application configuration');
  }
  const root = selectDeclaredDirectoryRoot(config.repositoryRoot, configuration.root, { override: process.env.METROPLAT_LSPACE_CORPUS_ROOT });
  const sciencePrefix=configuration.sciencePrefix;
  const readerPolicy = lSpaceReaderPolicy({sciencePrefix, excludes: configuration.excludes});
  const authorRoot=sciencePrefix ? resolve(root,sciencePrefix) : root;
  const environmentFile = configuration.environmentFileKey && process.env[configuration.environmentFileKey];
  const settings = environmentFile ? parseEnv(readFileSync(environmentFile, 'utf8')) : {};
  const reviewRoot = configuration.reviewRoot ?? settings.LSPACE_STATE_DIR;
  const reviews = reviewRoot ? createVaultMazeApplication({
    reviews:createReviewStore({root:resolve(reviewRoot)}),
    subjectOf:async context => {
      const principal=await admission?.identifyContext(context);
      if (!principal) return null;
      // A delegated human grant retains its issuer's pseudonym. A machine
      // principal is not assigned a human's learning history.
      const hash=principal.provider === 'bearer'
        ? /^(?:google|password|hive):([a-f0-9]{64})$/u.exec(principal.subjectHash)?.[1]
        : principal.subjectHash;
      return typeof hash === 'string' && /^[a-f0-9]{64}$/u.test(hash) ? hash : null;
    },
  }) : undefined;
  const mediaRoot=configuration.mediaRoot ?? settings.LSPACE_MEDIA_ROOT ?? join(reviewRoot ?? config.stateDir,'media');
  const custody=createImmutableContentCustody({store:createFileStore(mediaRoot),maximumBytes:1024**3});
  const ni=niResource(custody);
  const media={resources:[{...ni,handler:async context=>await admission?.identifyContext(context)
    ? ni.handler(context) : new Response('Reader admission required',{status:401,headers:{'cache-control':'no-store'}})}]};
  let opened;
  const archive = () => suppliedArchive ?? (opened ??= Promise.resolve().then(() => assertDeclaredDirectoryRoot(root, { requiredChild: sciencePrefix })).then(() => openArchive({
    root, ...readerPolicy,
    observations: join(config.stateDir, 'knowledge', 'observations.jsonl'),
    fullText: join(config.stateDir, 'knowledge', 'full-text.sqlite'),
  })).then(held=>sciencePrefix ? Object.freeze({...held,
    get paths(){return held.paths;}, get snapshot(){return held.snapshot;}, get version(){return held.version;},
    read:async id=>{
      // Existing science ids remain usable; canonical ids now name their Group context.
      return held.read(held.paths.includes(id) ? id : sciencePrefix+'/'+id);
    },
  }) : held).catch(error => {opened=undefined; throw error;}));
  const authoringRoot = configuration.authoringRoot ?? settings.GEODE_AUTHORING_ROOT;
  const authoringRegion = configuration.authoringRegion ?? settings.GEODE_AUTHORING_REGION ?? '';
  let workbench;
  const isAuthor = async context => {
    const principal=await admission?.identifyContext(context);
    if (!principal || principal.provider === 'bearer') return false;
    let held={};
    try {held=JSON.parse(readFileSync(join(reviewRoot, 'author.json'),'utf8'));} catch {}
    const email=settings.LSPACE_AUTHOR_EMAIL ?? held.email;
    if (principal.provider === 'google' && typeof email === 'string'
      && principal.email?.trim().toLowerCase() === email.trim().toLowerCase()) return true;
    const subjects=settings.LSPACE_AUTHOR_SUBJECTS?.split(',').map(value=>value.trim())
      ?? (Array.isArray(held.subjects) ? held.subjects : []);
    return ['password','hive'].includes(principal.provider) && subjects.some(subject=>typeof subject === 'string'
      && subject.startsWith(principal.provider+':')
      && createHash('sha256').update(subject).digest('hex') === principal.subjectHash);
  };
  const authoring = authoringRoot && resolve(authoringRoot) === authorRoot && authoringRegion === ''
    ? fetchApplication(async (request, context) => {
      if (!await isAuthor(context)) return new Response('Author access required',{status:403,headers:{'cache-control':'no-store'}});
      assertDeclaredDirectoryRoot(root, { requiredChild: sciencePrefix });
      workbench ??= createGeodeWorkspace(sciencePrefix ? {root:authorRoot,excludes:readerPolicy.excludes} : {archive:await archive()}).then(workspace=>createGeodeFetchHandler({workspace,basePath:'/geode'})).catch(error=>{workbench=undefined;throw error;});
      const response=await (await workbench)(request);
      if (sciencePrefix && !['GET','HEAD'].includes(request.method) && response.ok) await (await archive()).refresh();
      return response;
    }, {matches:request=>new URL(request.url).pathname.startsWith('/geode/')}) : undefined;
  const bucketResource = settings.LSPACE_NOTEBOOK_BUCKETS === 'false' ? undefined : createGeminiNotebookBucketResource();
  const notebooks = bucketResource ? {resources:[{...bucketResource,
    handler:async context => await isAuthor(context)
      ? bucketResource.handler(context)
      : new Response('Author access required',{status:403,headers:{'cache-control':'no-store'}}),
  }]} : undefined;
  const vocabulary=fetchApplication(async request=>handleVocabularyRequest(request,{
    archive:await archive(), baseUrl:configuration.vocabularyBaseUrl ?? config.publicBaseUrl,
    documentUrl:(document,{public:published,identity})=>new URL(
      published && publicSourceVisible(document)
        ? `/knowledge/public?document=${encodeURIComponent(document.path)}`
        : `/knowledge?name=${encodeURIComponent(identity)}`,config.publicBaseUrl).href,
  }), {matches:ownsVocabularyRequest});
  const roomDocument = async room => /^[a-f0-9]{64}$/u.test(room ?? '')
    ? (await archive()).paths.find(path=>[path,...(sciencePrefix && path.startsWith(sciencePrefix+'/') ? [path.slice(sciencePrefix.length+1)] : [])].some(id=>createHash('sha256').update(id).digest('hex') === room)) : undefined;
  const historicalEntry={resources:[{
    id:'lspace.historical-entry',match:'/knowledge/entry',methods:['GET'],public:true,
    handler:()=>page('<p><a href="/knowledge">Enter the knowledge corpus</a></p><script src="/knowledge/entry.js"></script>'),
  },{
    id:'lspace.historical-entry-script',match:'/knowledge/entry.js',methods:['GET'],public:true,
    handler:()=>textRepr(`const room=new RegExp('^#/(room|public)/([a-f0-9]{64})$','u').exec(location.hash);location.replace(room ? '/knowledge'+(room[1]==='public'?'/public':'')+'?room='+room[2] : '/knowledge');`,{type:'text/javascript; charset=utf-8',cacheControl:{noStore:true}}),
  }]};
  const reader = {archive, canWrite:false};
  // Omit write descriptors entirely: visibility is not an authorization check.
  const descriptors = [
    ...searchAndFetchTools({documentUrl: id => new URL(documentPath(id), config.publicBaseUrl).href}),
    ...vaultMcpTools.filter(tool => !tool.visible || tool.visible(reader)),
  ];
  const tools = descriptors.map(tool => ({
    ...tool, name:`lspace_${tool.name}`, handler: input => tool.handler(input, reader),
  }));
  const call = (name, input) => tools.find(tool => tool.name === `lspace_${name}`).handler(input);
  const reading = {resources:[{
    id:'lspace.metroplat', match:'/knowledge', methods:['GET'],
    handler:async context => {
      const {url}=context;
      try {
        if (url.searchParams.has('room')) {
          const document=await roomDocument(url.searchParams.get('room'));
          return document ? new Response(null,{status:303,headers:{location:documentPath(document),'cache-control':'no-store'}})
            : {...page('<p>The referenced document is unavailable.</p>'),status:404};
        }
        const id=url.searchParams.get('document');
        if (id) {
          const note=await call('fetch',{id});
          const source=await (await archive()).read(id);
          const sourceId=source.path ?? id;
          const sharing=publicSourceVisible(source)
            ? `<p><a href="/knowledge/public?document=${escape(encodeURIComponent(id))}">Public reading link</a></p>` : '';
          const parsed=await resolveReadingLinks(parseBody(source.body ?? ''),{document:sourceId,archive:await archive(),documentUrl:target=>new URL(documentPath(target),config.publicBaseUrl).href});
          const rendered=renderBody(await retainDocumentEmbeds(parsed,{root,document:sourceId,custody,excludes:readerPolicy.excludes}), {resolve:target=>({href:`/knowledge?name=${encodeURIComponent(target)}`,type:'knowledge-name',title:target})});
          return page(`<article><h2>${escape(note.title)}</h2><p>${escape(note.id)}</p>${sharing}<section>${rendered}</section><details><summary>Full source document</summary><pre style="white-space:pre-wrap">${escape(note.text)}</pre></details><details><summary>Source metadata</summary><pre>${escape(JSON.stringify(note.metadata,null,2))}</pre></details></article>`);
        }
        const name=url.searchParams.get('name');
        if (name) {
          // A bounded lexical lookup is not a place to parse user HTML or
          // arbitrarily large full-text expressions. Preserve prior source links.
          if (name.length > 256 || /[<>\\0]/u.test(name)) {
            return {...page('<p role="alert">This is not an admissible term name.</p>'),status:400};
          }
          const dossier=await call('vault_topic',{name,limit:25});
          return page(renderSourceTermDossier(dossier));
        }
        const query=url.searchParams.get('query');
        if (!query) {
          const authorLink=authoring && await isAuthor(context) ? '<p><a href="/geode/">Author workbench</a></p>' : '';
          const notebookLink=notebooks && await isAuthor(context) ? '<p><a href="/buckets/">Author notebooks</a></p>' : '';
          return page('<p>Search, then open a result to read its full source document here.</p>'+authorLink+notebookLink);
        }
        const found=await call('search',{query});
        return page(`<h2>Results for ${escape(query)}</h2><ul>${found.results.map(note=>`<li><a href="${escape(documentPath(note.id))}">${escape(note.title)}</a><p>${escape(note.text)}</p></li>`).join('')}</ul>`);
      } catch {
        return {...page('<p role="alert">The corpus could not be read. Its source or archive is unavailable.</p>'),status:503};
      }
    },
  }]};
  const publicReading = {resources:[{
    id:'lspace.public-reading', match:'/knowledge/public', methods:['GET'], public:true,
    handler:async ({url}) => {
      const unavailable = () => ({...page('<p>The public document is unavailable.</p>'),status:404});
      const id=url.searchParams.get('document') ?? await roomDocument(url.searchParams.get('room'));
      if (!id) return unavailable();
      try {
        const document=await (await archive()).read(id);
        // Publication belongs to the source, never to a URL or a prior search.
        if (!publicSourceVisible(document)) return unavailable();
        return page(`<article><h2>${escape(document.title ?? id)}</h2><pre style="white-space:pre-wrap">${escape(document.markdown ?? document.body ?? '')}</pre></article>`);
      } catch {return unavailable();}
    },
  }]};
  const readerEmails=new Set((settings.LSPACE_ALLOWED_EMAILS ?? configuration.readerEmails ?? '').split(',').map(email=>email.trim().toLowerCase()).filter(Boolean));
  const readerAccess={
    admitEmail:email=>typeof email === 'string' && readerEmails.has(email.trim().toLowerCase()),
    allowsRequest:(path,method)=>['GET','HEAD'].includes(method) && (path === '/knowledge' || path === '/knowledge/public' || path.startsWith('/.well-known/ni/'))
      || path === '/api/v1/reviews',
    allowsTool:name=>tools.some(tool=>tool.name === name),
  };
  return {readerAccess,applications:[historicalEntry,reading,publicReading,vocabulary,media,...(notebooks ? [notebooks] : []),...(reviews ? [reviews] : []),...(authoring ? [authoring] : [])],tools};
}
