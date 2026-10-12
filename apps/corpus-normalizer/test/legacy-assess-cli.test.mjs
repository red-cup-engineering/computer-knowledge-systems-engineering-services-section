import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute=promisify(execFile),here=path.dirname(fileURLToPath(import.meta.url)),cli=path.resolve(here,"../scripts/corpus-normalizer.mjs");const run=(...args)=>execute(process.execPath,[cli,...args],{encoding:"utf8"});
async function tree(root,files){await mkdir(root,{recursive:true});for(const[name,body]of Object.entries(files)){const target=path.join(root,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,body);}return root;}
async function fixture(candidateFiles,liveFiles){const root=await mkdtemp("/var/tmp/corpus-normalizer-legacy-cli-");return{root,candidate:await tree(path.join(root,"candidate"),candidateFiles),live:await tree(path.join(root,"live"),liveFiles),legacy:await tree(path.join(root,"legacy"),{})};}
const required=(item,output)=>["assess-legacy",item.candidate,item.live,item.legacy,"--form","application","--date","2026-08-19","--slug","demo","--output",output];

test("legacy CLI emits deterministic live coverage, fusion, and review decisions with zero review exit",async()=>{
  let item=await fixture({"a":"a"},{"a":"a"}),output=path.join(item.root,"assessment.json");let result=JSON.parse((await run(...required(item,output))).stdout);assert.equal(result.decision,"covered-by-live");assert.equal(JSON.parse(await readFile(output,"utf8")).status,"proven");
  item=await fixture({"a":"a","b":"b"},{"a":"a"});output=path.join(item.root,"assessment.json");result=JSON.parse((await run(...required(item,output))).stdout);assert.equal(result.decision,"fuse-into-live");
  item=await fixture({"a":"candidate"},{"a":"live"});await tree(path.join(item.legacy,"2026-01-01-demo"),{"a":"old"});const first=path.join(item.root,"first.json"),second=path.join(item.root,"second.json");result=JSON.parse((await run(...required(item,first))).stdout);assert.equal(result.decision,"retain-divergent-review");assert.equal(result.status,"review");await run(...required(item,second));assert.equal(await readFile(first,"utf8"),await readFile(second,"utf8"));
});

test("legacy CLI scopes noncanonical mirrored containers only through explicit family-path",async()=>{
  const item=await fixture({"a":"candidate"},{"a":"live"});await tree(path.join(item.legacy,"apps","demo","2026-01-01-demo"),{"a":"candidate"});const rejected=path.join(item.root,"rejected.json");await assert.rejects(()=>run(...required(item,rejected)),/invalid direct legacy family name: apps/);assert.equal(existsSync(rejected),false);
  const output=path.join(item.root,"scoped.json");const args=required(item,output);args.push("--family-path","apps/demo");const result=JSON.parse((await run(...args)).stdout);assert.equal(result.decision,"covered-by-legacy");assert.equal(JSON.parse(await readFile(output,"utf8")).familyRoot,path.join(item.legacy,"apps","demo"));
});

test("legacy CLI reports compared collision evidence and enforces total bounds atomically",async()=>{
  const item=await fixture({"a":"candidate","new":"new"},{"a":"live"});await tree(path.join(item.legacy,"2026-08-19-demo"),{"a":"candidate"});const output=path.join(item.root,"collision.json");const result=JSON.parse((await run(...required(item,output))).stdout);assert.equal(result.decision,"replace-covered-legacy-family");assert.equal(JSON.parse(await readFile(output,"utf8")).proposedLegacyCollision.state,"compared-matching-witness");
  const bounded=await fixture({"a":"candidate","new":"new"},{"a":"live"});await tree(path.join(bounded.legacy,"2025-01-01-demo"),{"a":"one"});await tree(path.join(bounded.legacy,"2026-01-01-demo"),{"a":"two"});const refused=path.join(bounded.root,"refused.json"),args=required(bounded,refused);args.push("--max-total-comparison-records","5","--max-records","10","--max-witnesses","5","--chunk-size","2","--temp-dir",path.join(bounded.root,"scratch"));await assert.rejects(()=>run(...args),/maxTotalComparisonRecords/);assert.equal(existsSync(refused),false);
});

test("legacy CLI strictly requires canonical metadata, form, output, and bounded options",async()=>{
  const item=await fixture({"a":"a"},{"a":"a"}),output=path.join(item.root,"out.json");await assert.rejects(()=>run("assess-legacy",item.candidate,item.live,item.legacy,"--date","2026-08-19","--slug","demo","--output",output),/Usage/);await assert.rejects(()=>run(...required(item,output).map((value)=>value==="application"?"term":value)),/form must/);const badDate=required(item,output);badDate[badDate.indexOf("2026-08-19")]="2026-02-30";await assert.rejects(()=>run(...badDate),/date must/);const bound=required(item,output);bound.push("--max-total-comparison-records","0");await assert.rejects(()=>run(...bound),/at least 1/);const unknown=required(item,output);unknown.push("--mystery");await assert.rejects(()=>run(...unknown),/unknown legacy assessment option/);
});
