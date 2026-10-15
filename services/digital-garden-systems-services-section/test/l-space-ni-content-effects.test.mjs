import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createFileStore,createPathContent} from '@red-cup-engineering/immutable-content-custody-service/file-store';
import {createImmutableContentCustody} from '@red-cup-engineering/immutable-content-custody-service';
import {niResource} from '@red-cup-engineering/http-services-section/ni';
import {createHttpServer} from '@red-cup-engineering/http-services-section/node-server';
import {toWebRequest,sendWebResponse} from '@red-cup-engineering/http-services-section/web-bridge';
const niOf=body=>'ni:///sha-256;'+createHash('sha256').update(body).digest('base64url');

test('the actual NI HTTP consumer exposes exact held bytes, refuses corrupt HEAD and ranges, and accepts a verified replacement',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ni-content-effects-'));let server;
 try{
  const bytes=Buffer.from('Exact resource e\u0301 😀\n'.repeat(15000)),ni=niOf(bytes);
  const custody=createImmutableContentCustody({store:createFileStore(root)});
  const reference=await custody.put({ni,bytes,mediaType:'text/plain; charset=utf-8'});
  const resource=niResource(custody);
  server=createHttpServer({handle:async(req,res)=>{
   try{await sendWebResponse(await resource.handler({request:toWebRequest(req,{response:res})}),res,{method:req.method});}
   catch{res.writeHead(500,{'content-type':'text/plain'}).end('Content commitment refused');}
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/.well-known/ni/sha-256/'+ni.split(';')[1];
  const whole=await fetch(url);assert.equal(whole.status,200);assert.deepEqual(Buffer.from(await whole.arrayBuffer()),bytes);
  const range=await fetch(url,{headers:{range:'bytes=7-63'}});assert.equal(range.status,206);
  assert.equal(range.headers.get('content-range'),'bytes 7-63/'+bytes.length);assert.deepEqual(Buffer.from(await range.arrayBuffer()),bytes.subarray(7,64));
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(bytes.length));
  const etag=head.headers.get('etag'),corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]=88;writeFileSync(join(root,'objects',reference.key),corrupt);
  for(const options of [{method:'HEAD'},{headers:{range:'bytes=7-63'}},{headers:{'if-none-match':etag}}]){
   const refused=await fetch(url,options);assert.equal(refused.status,500);assert(!String(await refused.text()).includes('Exact resource'));
  }
  await custody.put({ni,bytes,mediaType:'text/plain; charset=utf-8'});
  const restored=await fetch(url,{headers:{range:'bytes=7-63'}});assert.equal(restored.status,206);assert.deepEqual(Buffer.from(await restored.arrayBuffer()),bytes.subarray(7,64));
 }finally{if(server)await server.closeGracefully(0);rmSync(root,{recursive:true,force:true});}
});

test('a file-backed NI locator checks current bytes and supports the empty byte carrier',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ni-locator-'));
 try{
  const file=join(root,'empty.txt');writeFileSync(file,'');const ni=niOf(Buffer.alloc(0));
  const resource=niResource(createPathContent(value=>value===ni?file:undefined));
  const request=new Request('https://example.invalid/.well-known/ni/sha-256/'+ni.split(';')[1]);
  const empty=await resource.handler({request});assert.equal(empty.status,200);assert.equal(empty.headers.get('content-length'),'0');assert.equal(await empty.text(),'');
  writeFileSync(file,'A different edition');
  await assert.rejects(resource.handler({request}),/declared ni identity/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

