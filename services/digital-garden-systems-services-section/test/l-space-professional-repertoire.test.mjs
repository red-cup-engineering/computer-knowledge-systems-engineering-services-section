import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { servedResponseFromRepr } from '@red-cup-engineering/http-services-section/representation';
import { lSpaceMetroplat } from '../apps/l-space-metroplat.mjs';

const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
async function corpus(t) {
  const root = await mkdtemp(join(tmpdir(), 'lspace-professional-source-'));
  t.after(() => rm(root,{recursive:true,force:true}));
  const entries = {
    offices: [{id:'source-librarian',name:'source librarian',
      'normative-structure':'Keep one source-qualified reading, not an appointment.',
      'bears-duty':['emsenn/duty/read-an-original'], 'provides-skill':['source-reading'],
      'deontic-profile':{'read-a-source':'duty'}}],
    duties: [{id:'read-an-original',name:'read an original',work:'check-the-source',skills:['source-reading']}],
    works: [{id:'check-the-source',name:'check the source',from:'unverified',to:'source-checked',cost:'reading originals'}],
  };
  const catalog = {id:'union-professional-repertoire',owner:'union-officer-academy',
    appointmentAuthority:false,counts:{},offices:[],duties:[],works:[]};
  const mount = join(root,'operations');
  for(const [kind,records]of Object.entries(entries)) {
    catalog.counts[kind] = records.length;
    for(const record of records){
      const rel='content/professional-repertoire/'+kind+'/'+record.id+'.json';
      const bytes=Buffer.from(JSON.stringify(record));
      const file=join(mount,rel);
      await mkdir(dirname(file),{recursive:true});
      await writeFile(file,bytes);
      catalog[kind].push({id:record.id,canonicalPath:rel,digest:sha(bytes)});
    }
  }
  const catalogFile=join(mount,'content/catalogs/professional-repertoire.json');
  await mkdir(dirname(catalogFile),{recursive:true});
  await writeFile(catalogFile,JSON.stringify(catalog));
  return {root,mount,catalogFile,entries};
}
const source = {repository:'coesite-operations/operations-services-section',commit:'a'.repeat(40),pathPrefix:'services/agent-services-section'};
function install(root, {sourceSelection = source,admitted = true, configured = true}={}) {
  return lSpaceMetroplat({
    config:{repositoryRoot:root,stateDir:join(root,'state'),publicBaseUrl:'https://l-space.example'},
    configuration:{root:'unopened-science',sciencePrefix:'science-services-section',
      ...(configured?{professionalRepertoire:{path:'operations',source:sourceSelection}}:{})},
    admission:{identifyContext:async()=>admitted?{provider:'test',subjectHash:'b'.repeat(64)}:null},
    archive:{paths:[],read:async()=>{throw new Error('not reached');}},
  });
}
function resource(app) {
  return app.applications.flatMap(item=>item.resources??[])
    .find(item=>item.id==='lspace.professional-repertoire');
}
const request=(res,path)=>res.handler({url:new URL('https://l-space.example'+path)});
test('one original Operations office, its duty and its work are actually read through L-Space and machine JSON-LD',async t=>{
  const fixture=await corpus(t);
  const app=install(fixture.root);
  const res=resource(app);
  assert.ok(res);
  assert.equal(res.match,'/knowledge/professional-repertoire');
  assert.equal(res.public,undefined,'not a public route');
  assert.equal(app.readerAccess.allowsRequest('/knowledge/professional-repertoire','GET'),true);
  const html=await servedResponseFromRepr(await request(res,'/knowledge/professional-repertoire?duty=read-an-original'),'GET');
  assert.equal(html.status,200);
  assert.match(html.body,/source librarian/);
  assert.match(html.body,/source-checked/);
  assert.match(html.body,/not appointed offices/iu);
  assert.match(html.body,/No result confers appointment/);
  const json=await servedResponseFromRepr(await request(res,'/knowledge/professional-repertoire?format=jsonld'),'GET');
  assert.equal(json.status,200);
  const parsed=JSON.parse(json.body);
  assert.equal(parsed['@graph'].length,4);
  const position=parsed['@graph'].find(x=>x['@type']==='agsv:RepertoireNormativePosition');
  assert.equal(position['agsv:positionProposition'],'read-a-source');
  assert.equal(position['agsv:positionKind'],'duty');
  const office=parsed['@graph'].find(x=>x['@type']==='agsv:RepertoireOfficeForm');
  assert.equal(office['agsv:officeFormReferencesDuty'][0]['@id'],
    'https://561.group/knowledge/professional-repertoire/duties/read-an-original');
  assert.match(office['prov:wasDerivedFrom']['@id'],/^ni:\/\/\/sha-256;/u);
  assert.equal(JSON.stringify(parsed).includes('agsv:Incumbency'),false);
});
test('anonymous access and absent source selection do not even look at the Operations corpus',async t=>{
  const {root}=await corpus(t);
  assert.equal(resource(install(root,{configured:false})),undefined);
  const app=install(root,{admitted:false});
  const reply=await request(resource(app),'/knowledge/professional-repertoire?format=jsonld');
  assert.equal(reply.status,401);
  assert.match(await reply.text(),/admission required/);
});
test('source-digest drift, missing original and malformed query fail without a fake empty catalog',async t=>{
  const {root,catalogFile}=await corpus(t);
  const bad=install(root);
  const res=resource(bad);
  const wrong=await servedResponseFromRepr(await request(res,'/knowledge/professional-repertoire?duty=../private'),'GET');
  assert.equal(wrong.status,400);
  await writeFile(catalogFile,'{"id":"invalid"}');
  const failed=await servedResponseFromRepr(await request(res,'/knowledge/professional-repertoire'),'GET');
  assert.equal(failed.status,503);
  assert.match(failed.body,/unavailable, incomplete or has changed/);
  assert.throws(()=>install(root,{sourceSelection:{repository:'not-a-repo',commit:''}}),TypeError);
});
