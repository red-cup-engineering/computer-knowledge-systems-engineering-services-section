import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

const execute = promisify(execFile); const here = path.dirname(fileURLToPath(import.meta.url)); const cli = path.resolve(here, "../scripts/corpus-normalizer.mjs");
const run = (...args) => execute(process.execPath, [cli, ...args], { encoding: "utf8" });
function field(buffer, offset, length, value) { Buffer.from(value, "ascii").copy(buffer, offset, 0, length); }
function tarFile(name, body, mode = 0o644) { const content=Buffer.from(body),header=Buffer.alloc(512);field(header,0,100,name);field(header,100,8,`${mode.toString(8).padStart(7,"0")}\0`);field(header,108,8,"0000000\0");field(header,116,8,"0000000\0");field(header,124,12,`${content.length.toString(8).padStart(11,"0")}\0`);field(header,136,12,"00000000000\0");header.fill(32,148,156);header[156]=48;field(header,257,6,"ustar\0");field(header,263,2,"00");const checksum=header.reduce((sum,byte)=>sum+byte,0);field(header,148,8,`${checksum.toString(8).padStart(6,"0")}\0 `);return Buffer.concat([header,content,Buffer.alloc((512-content.length%512)%512)]); }
const tar = (...members) => Buffer.concat([...members, Buffer.alloc(1024)]);

test("archive CLI inspects tar/tgz deterministically, unpacks to host temp, and verifies bound carrier and tree", async () => {
  const root=await mkdtemp("/var/tmp/corpus-normalizer-archive-cli-");const raw=tar(tarFile("wrapper/z.txt","z"),tarFile("wrapper/bin/tool",Buffer.from([0,255,1]),0o755));const archive=path.join(root,"carrier.tar"),compressed=path.join(root,"carrier.tgz");await writeFile(archive,raw);await writeFile(compressed,gzipSync(raw));
  const first=path.join(root,"first.ndjson"),second=path.join(root,"second.ndjson"),compressedInventory=path.join(root,"compressed.ndjson");await run("inspect-archive",archive,"--output",first,"--high-water-mark","37");await run("inspect-archive",archive,"--output",second,"--high-water-mark","37");await run("inspect-archive",compressed,"--output",compressedInventory);
  assert.equal(await readFile(first,"utf8"),await readFile(second,"utf8"));const inventory=(await readFile(first,"utf8")).trim().split("\n").map(JSON.parse);assert.equal(inventory[0].type,"header");assert.equal(inventory[0].members,2);assert.equal(inventory.slice(1).every((record)=>record.type==="member"&&!Object.hasOwn(record,"content")),true);
  const output=path.join(root,"unpacked");const unpacked=JSON.parse((await run("unpack-archive",compressed,"--output",output,"--strip-wrapper","--max-members","5","--high-water-mark","31")).stdout);assert.deepEqual(await readFile(path.join(output,"bin/tool")),Buffer.from([0,255,1]));const manifest=JSON.parse(await readFile(unpacked.manifest,"utf8"));assert.equal(manifest.archive,compressed);assert.equal(manifest.stripWrapper,true);assert.equal(typeof manifest.inventory.hash,"string");assert.equal(typeof manifest.tree.hash,"string");assert.equal(JSON.parse((await run("verify-archive","--manifest",unpacked.manifest)).stdout).valid,true);
});

test("archive CLI refuses occupied output and detects tree, carrier, and manifest tampering without retiring carrier", async () => {
  const make=async()=>{const root=await mkdtemp("/var/tmp/corpus-normalizer-archive-cli-tamper-");const archive=path.join(root,"carrier.tar"),output=path.join(root,"unpacked");await writeFile(archive,tar(tarFile("wrapper/a.txt","a")));const result=JSON.parse((await run("unpack-archive",archive,"--output",output,"--strip-wrapper")).stdout);return{root,archive,output,...result};};
  const occupied=await mkdtemp("/var/tmp/corpus-normalizer-archive-cli-occupied-");const archive=path.join(occupied,"carrier.tar"),output=path.join(occupied,"output");await writeFile(archive,tar(tarFile("a","a")));await mkdir(output);await writeFile(path.join(output,"keep"),"keep\n");await assert.rejects(()=>run("unpack-archive",archive,"--output",output),/must be absent/);assert.equal(await readFile(path.join(output,"keep"),"utf8"),"keep\n");
  const treeTamper=await make();await writeFile(path.join(treeTamper.output,"a.txt"),"changed\n");await assert.rejects(()=>run("verify-archive","--manifest",treeTamper.manifest),/tree mismatch/);assert.equal(existsSync(treeTamper.archive),true);
  const carrierTamper=await make();await writeFile(carrierTamper.archive,Buffer.from([1,2,3]));await assert.rejects(()=>run("verify-archive","--manifest",carrierTamper.manifest),/carrier hash mismatch/);
  const manifestTamper=await make();const manifest=JSON.parse(await readFile(manifestTamper.manifest,"utf8"));manifest.tree.count+=1;await writeFile(manifestTamper.manifest,JSON.stringify(manifest));await assert.rejects(()=>run("verify-archive","--manifest",manifestTamper.manifest),/tree mismatch/);
});

test("archive CLI strictly rejects unknown and invalid limit options and cleans failed inspection", async () => {
  const root=await mkdtemp("/var/tmp/corpus-normalizer-archive-cli-invalid-");const archive=path.join(root,"carrier.tar"),inventory=path.join(root,"inventory.ndjson");await writeFile(archive,tar(tarFile("a","abc")));
  await assert.rejects(()=>run("inspect-archive",archive,"--output",inventory,"--max-member-bytes","0"),/positive safe integer/);assert.equal(existsSync(inventory),false);
  await assert.rejects(()=>run("inspect-archive",archive,"--output",inventory,"--unknown"),/unknown archive option/);
  await assert.rejects(()=>run("inspect-archive",archive,"--output",inventory,"--strip-wrapper"),/unknown archive option/);
});
