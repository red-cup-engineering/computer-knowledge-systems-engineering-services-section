import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute=promisify(execFile),here=path.dirname(fileURLToPath(import.meta.url)),cli=path.resolve(here,"../scripts/corpus-normalizer.mjs");
const run=(...args)=>execute(process.execPath,[cli,...args],{encoding:"utf8"});
async function roots(candidateFiles,liveFiles){const root=await mkdtemp("/var/tmp/corpus-normalizer-tree-cli-");const candidate=path.join(root,"candidate"),live=path.join(root,"live");for(const [base,files] of [[candidate,candidateFiles],[live,liveFiles]]){await mkdir(base);for(const [name,body] of Object.entries(files)){const target=path.join(base,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,body);}}return{root,candidate,live};}
async function compare(fixture,name,extra=[]){const output=path.join(fixture.root,`${name}.ndjson`);const result=JSON.parse((await run("compare-trees",fixture.candidate,fixture.live,"--form","application","--output",output,...extra)).stdout);return{output,result,records:(await readFile(output,"utf8")).trim().split("\n").map(JSON.parse)};}

test("tree comparison CLI reports exact, subset, additive, and divergent evidence with successful exits",async()=>{
  let fixture=await roots({"a.txt":"a\n"},{"a.txt":"a\n"});const exact=await compare(fixture,"exact");assert.equal(exact.result.summary.relation,"exact-tree");const repeat=await compare(fixture,"repeat");assert.equal(await readFile(exact.output,"utf8"),await readFile(repeat.output,"utf8"));assert.equal(exact.records.at(-1).type,"summary");
  fixture=await roots({"a.txt":"a\n"},{"a.txt":"a\n","b.txt":"b\n"});assert.equal((await compare(fixture,"subset")).result.summary.relation,"candidate-covered-subset");
  fixture=await roots({"a.txt":"a\n","b.txt":"b\n"},{"a.txt":"a\n"});assert.equal((await compare(fixture,"additive")).result.summary.relation,"additive-no-conflicts");
  fixture=await roots({"a.txt":"candidate\n"},{"a.txt":"live\n"});const divergent=await compare(fixture,"divergent",["--max-changed-text-bytes","64"]);assert.equal(divergent.result.summary.relation,"divergent");assert.equal(divergent.records[0].status,"changed-content");
});

test("tree comparison CLI requires explicit form, honors generated inclusion, and validates all options",async()=>{
  const fixture=await roots({"a.txt":"same\n","node_modules/x.js":"candidate\n"},{"a.txt":"same\n","node_modules/x.js":"live\n"});
  assert.equal((await compare(fixture,"filtered")).result.summary.relation,"exact-tree");assert.equal((await compare(fixture,"included",["--include-generated"])).result.summary.relation,"divergent");
  const output=path.join(fixture.root,"bad.ndjson");await assert.rejects(()=>run("compare-trees",fixture.candidate,fixture.live,"--output",output),/Usage/);await assert.rejects(()=>run("compare-trees",fixture.candidate,fixture.live,"--form","term","--output",output),/form must/);await assert.rejects(()=>run("compare-trees",fixture.candidate,fixture.live,"--form","application","--output",output,"--max-records","0"),/at least 1/);await assert.rejects(()=>run("compare-trees",fixture.candidate,fixture.live,"--form","application","--output",output,"--max-changed-text-bytes","-1"),/must be an integer/);await assert.rejects(()=>run("compare-trees",fixture.candidate,fixture.live,"--form","application","--output",output,"--mystery"),/unknown tree comparison option/);
});

test("tree comparison CLI removes partial output on bounded operational failure and refuses existing output",async()=>{
  const fixture=await roots({"a.txt":"a","b.txt":"b"},{"a.txt":"a","b.txt":"b"});const output=path.join(fixture.root,"bounded.ndjson");await assert.rejects(()=>run("compare-trees",fixture.candidate,fixture.live,"--form","service-section","--output",output,"--max-records","1"),/exceeded maxRecords/);assert.equal(existsSync(output),false);
  await writeFile(output,"keep\n");await assert.rejects(()=>run("compare-trees",fixture.candidate,fixture.live,"--form","service-section","--output",output),/must be absent/);assert.equal(await readFile(output,"utf8"),"keep\n");
});
