import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { assessLegacy, legacyFamilyName } from "../src/legacy-assess.mjs";

async function makeTree(root, files) { await mkdir(root, { recursive: true }); for (const [name, body] of Object.entries(files)) { const target=path.join(root,name); await mkdir(path.dirname(target),{recursive:true}); await writeFile(target,body); } return root; }
async function fixture(candidateFiles, liveFiles) { const root=await mkdtemp("/var/tmp/corpus-normalizer-legacy-assess-");const candidate=await makeTree(path.join(root,"candidate"),candidateFiles),live=await makeTree(path.join(root,"live"),liveFiles),legacy=await makeTree(path.join(root,"legacy"),{});return{root,candidate,live,legacy}; }
const options=(extra={})=>({form:"application",date:"2026-08-19",slug:"demo",...extra});

test("compare-first decisions cover live exact/subsets and route additive work to live without legacy",async()=>{
  let item=await fixture({"a.txt":"a\n"},{"a.txt":"a\n"});let result=await assessLegacy(item.candidate,item.live,item.legacy,options());assert.equal(result.decision,"covered-by-live");assert.equal(result.status,"proven");assert.equal(result.proposedLegacyPath,null);assert.equal(result.liveComparison.summary.relation,"exact-tree");assert.deepEqual(result.legacyComparisons,[]);
  item=await fixture({"a.txt":"a\n"},{"a.txt":"a\n","b.txt":"b\n"});result=await assessLegacy(item.candidate,item.live,item.legacy,options());assert.equal(result.decision,"covered-by-live");assert.equal(result.liveComparison.summary.relation,"candidate-covered-subset");
  item=await fixture({"a.txt":"a\n","b.txt":"b\n"},{"a.txt":"a\n"});result=await assessLegacy(item.candidate,item.live,item.legacy,options());assert.equal(result.decision,"fuse-into-live");assert.equal(result.status,"supported");assert.equal(result.proposedLegacyPath,null);assert.equal(existsSync(path.join(item.candidate,"b.txt")),true);
});

test("divergent candidates are covered by matching legacy or marked for reviewed family replacement",async()=>{
  let item=await fixture({"a.txt":"candidate\n"},{"a.txt":"live\n"});await makeTree(path.join(item.legacy,"2026-01-01-demo"),{"a.txt":"candidate\n"});await makeTree(path.join(item.legacy,"2025-01-01-other"),{"ignored.txt":"x"});let result=await assessLegacy(item.candidate,item.live,item.legacy,options());assert.equal(result.decision,"covered-by-legacy");assert.equal(result.selectedWitness.name,"2026-01-01-demo");assert.equal(result.legacyComparisons[0].comparison.summary.relation,"exact-tree");assert.equal(result.legacyComparisons[0].comparison.records[0].status,"exact");
  item=await fixture({"a.txt":"candidate\n","new.txt":"new\n"},{"a.txt":"live\n"});await makeTree(path.join(item.legacy,"2025-01-01-demo"),{"a.txt":"candidate\n"});await makeTree(path.join(item.legacy,"2026-01-01-demo"),{"a.txt":"candidate\n"});result=await assessLegacy(item.candidate,item.live,item.legacy,options());assert.equal(result.decision,"replace-covered-legacy-family");assert.equal(result.status,"review");assert.equal(result.selectedWitness.name,"2026-01-01-demo");assert.equal(result.proposedLegacyPath,path.join(item.legacy,"2026-08-19-demo"));assert.deepEqual(result.legacyComparisons.map(({witness})=>witness.name),["2025-01-01-demo","2026-01-01-demo"]);
});

test("uncovered divergence remains review-only at the canonical proposed family path",async()=>{
  const item=await fixture({"a.txt":"candidate\n"},{"a.txt":"live\n"});await makeTree(path.join(item.legacy,"2026-01-01-demo"),{"a.txt":"older divergent\n"});const first=await assessLegacy(item.candidate,item.live,item.legacy,options()),second=await assessLegacy(item.candidate,item.live,item.legacy,options());assert.deepEqual(second,first);assert.equal(first.decision,"retain-divergent-review");assert.equal(first.status,"review");assert.equal(first.proposedLegacyPath,path.join(item.legacy,"2026-08-19-demo"));assert.equal(first.liveComparison.summary.relation,"divergent");assert.equal(first.legacyComparisons[0].comparison.summary.relation,"divergent");
});

test("empty or missing live state requires explicit admission and mirrored family paths remain bounded",async()=>{
  const item=await fixture({"a.txt":"a\n"},{});await assert.rejects(()=>assessLegacy(item.candidate,item.live,item.legacy,options()),/empty live root requires/);assert.equal((await assessLegacy(item.candidate,item.live,item.legacy,options({allowEmptyLive:true}))).decision,"fuse-into-live");
  const missing=path.join(item.root,"missing-live"),scratch=path.join(item.root,"scratch");assert.equal((await assessLegacy(item.candidate,missing,item.legacy,options({allowEmptyLive:true,tempDirectory:scratch}))).decision,"fuse-into-live");assert.deepEqual(await readdir(scratch),[]);
  const mirror=path.join(item.legacy,"apps","demo");await makeTree(path.join(mirror,"2026-01-01-demo"),{"a.txt":"different\n"});const mirrored=await assessLegacy(item.candidate,missing,item.legacy,options({allowEmptyLive:true,mirroredRelativeFamilyPath:"apps/demo"}));assert.equal(mirrored.familyRoot,mirror);
});

test("canonical metadata, direct legacy names, symlinks, and witness bounds fail closed",async()=>{
  const item=await fixture({"a.txt":"candidate\n"},{"a.txt":"live\n"});assert.equal(legacyFamilyName("2026-08-19","demo-service"),"2026-08-19-demo-service");await assert.rejects(()=>assessLegacy(item.candidate,item.live,item.legacy,options({date:"2026-02-30"})),/date/);await assert.rejects(()=>assessLegacy(item.candidate,item.live,item.legacy,options({slug:"Demo"})),/slug/);await assert.rejects(()=>assessLegacy(item.candidate,item.live,item.legacy,options({mirroredRelativeFamilyPath:"../escape"})),/escapes/);
  await mkdir(path.join(item.legacy,"not-canonical"));await assert.rejects(()=>assessLegacy(item.candidate,item.live,item.legacy,options()),/invalid direct legacy family name/);
  const links=await fixture({"a.txt":"candidate\n"},{"a.txt":"live\n"});const target=await makeTree(path.join(links.root,"target"),{"a":"a"});await symlink(target,path.join(links.legacy,"2026-01-01-demo"));await assert.rejects(()=>assessLegacy(links.candidate,links.live,links.legacy,options()),/regular directory/);
  const bounded=await fixture({"a.txt":"candidate\n"},{"a.txt":"live\n"});await makeTree(path.join(bounded.legacy,"2025-01-01-demo"),{"a":"a"});await makeTree(path.join(bounded.legacy,"2026-01-01-demo"),{"a":"a"});await assert.rejects(()=>assessLegacy(bounded.candidate,bounded.live,bounded.legacy,options({maxWitnesses:1})),/exceeds maxWitnesses/);
  const recordBounded=await fixture({"a.txt":"a","b.txt":"b"},{"a.txt":"different","b.txt":"different"});await assert.rejects(()=>assessLegacy(recordBounded.candidate,recordBounded.live,recordBounded.legacy,options({maxRecords:1})),/exceeded maxRecords/);
});

test("aggregate comparison bounds and proposed-path collision evidence cover every witness",async()=>{
  const bounded=await fixture({"a.txt":"candidate\n","new.txt":"new\n"},{"a.txt":"live\n"});await makeTree(path.join(bounded.legacy,"2025-01-01-demo"),{"a.txt":"old one\n"});await makeTree(path.join(bounded.legacy,"2026-01-01-demo"),{"a.txt":"old two\n"});await assert.rejects(()=>assessLegacy(bounded.candidate,bounded.live,bounded.legacy,options({maxTotalComparisonRecords:5})),/maxTotalComparisonRecords/);
  const collision=await fixture({"a.txt":"candidate\n","new.txt":"new\n"},{"a.txt":"live\n"});await makeTree(path.join(collision.legacy,"2026-08-19-demo"),{"a.txt":"candidate\n"});const assessed=await assessLegacy(collision.candidate,collision.live,collision.legacy,options());assert.equal(assessed.decision,"replace-covered-legacy-family");assert.deepEqual(assessed.proposedLegacyCollision,{state:"compared-matching-witness",path:path.join(collision.legacy,"2026-08-19-demo"),type:"directory",witness:"2026-08-19-demo"});assert.equal(assessed.totalComparisonRecords,assessed.liveComparison.summary.records+assessed.legacyComparisons.reduce((sum,item)=>sum+item.comparison.summary.records,0));
});
