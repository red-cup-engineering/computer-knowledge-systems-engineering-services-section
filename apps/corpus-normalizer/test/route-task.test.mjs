import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { applyBibliography, materializeBibliography } from "../src/bibliography-transaction.mjs";
import { readPlanLines } from "../src/plan.mjs";
import { prepareRouteTask } from "../src/route-task.mjs";
import { collectRoutePlan, writeRoutePlan } from "../src/router.mjs";

function tar(name, content) {
  const body = Buffer.from(content); const header = Buffer.alloc(512); Buffer.from(name).copy(header, 0); Buffer.from("0000644\0").copy(header, 100); Buffer.from(`${body.length.toString(8).padStart(11, "0")}\0`).copy(header, 124); Buffer.from("00000000000\0").copy(header, 136); header.fill(32, 148, 156); header[156] = "0".charCodeAt(0); Buffer.from("ustar\0").copy(header, 257); Buffer.from("00").copy(header, 263); const checksum = header.reduce((sum, byte) => sum + byte, 0); Buffer.from(`${checksum.toString(8).padStart(6, "0")}\0 `).copy(header, 148); return Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512), Buffer.alloc(1024)]);
}

test("prepares one authenticated bibliography task and retirement remains transaction-owned", async () => {
  const root = await mkdtemp("/var/tmp/route-task-"); const source = path.join(root, "source"); const destination = path.join(root, "out-services-section"); const route = path.join(root, "route.ndjson"); const prepared = path.join(root, "bibliography.ndjson");
  await mkdir(source); await writeFile(path.join(source, "a.md"), "---\ncitation-key: a\nbibtex-type: article\ntitle: A\n---\n"); await writeFile(path.join(source, "b.bib"), "@book{b,title={B}}\n");
  await writeRoutePlan(source, destination, route); const records = await collectRoutePlan(source, destination); const task = records.find(record => record.kind === "task" && record.form === "bibliography");
  const result = await prepareRouteTask(route, task.id, prepared); assert.equal(result.form, "bibliography"); const planRecords = []; for await (const record of readPlanLines(prepared)) planRecords.push(record); assert.deepEqual(planRecords.filter(record => record.type === "source").map(record => record.source), ["a.md", "b.bib"]);
  const projection = path.join(root, "projection"); await materializeBibliography(prepared, projection); await applyBibliography(prepared, projection); assert.equal(existsSync(path.join(destination, "bibliography.bib")), true); assert.equal(existsSync(path.join(source, "a.md")), false); assert.equal(existsSync(path.join(source, "b.bib")), false);
});

test("refuses invalid, tampered, and drifting route tasks without output", async () => {
  const root = await mkdtemp("/var/tmp/route-task-refuse-"); const source = path.join(root, "source"); const destination = path.join(root, "out-services-section"); const route = path.join(root, "route.ndjson"); await mkdir(path.join(source, "content", "text", "glossary", "terms"), { recursive: true }); await writeFile(path.join(source, "content", "text", "glossary", "terms", "x.md"), "# X\n"); await writeFile(path.join(source, "bad.bin"), Buffer.from([0])); await writeRoutePlan(source, destination, route);
  const records = await collectRoutePlan(source, destination); const invalid = records.find(record => record.kind === "task" && record.form === "invalid"); await assert.rejects(() => prepareRouteTask(route, invalid.id, path.join(root, "invalid.ndjson")), /invalid route task/); await assert.rejects(() => prepareRouteTask(route, "task:missing", path.join(root, "missing.ndjson")), /unknown/);
  const text = await readFile(route, "utf8"); await writeFile(route, text.replace('"kind":"header"', '"kind":"task"')); await assert.rejects(() => prepareRouteTask(route, invalid.id, path.join(root, "tampered.ndjson")), /invalid route plan/);
});

test("prepares archive inspection as an atomic inventory artifact", async () => {
  const root = await mkdtemp("/var/tmp/route-task-archive-"); const source = path.join(root, "source"); const destination = path.join(root, "out-services-section"); const route = path.join(root, "route.ndjson"); const output = path.join(root, "archive.ndjson"); await mkdir(source); await writeFile(path.join(source, "safe.tar"), tar("wrapped/item.txt", "x")); await writeRoutePlan(source, destination, route);
  const task = (await collectRoutePlan(source, destination)).find(record => record.kind === "task" && record.form === "archive-inspect"); const result = await prepareRouteTask(route, task.id, output); assert.equal(result.members, 1); assert.equal(JSON.parse(await readFile(output, "utf8")).members[0].path, "wrapped/item.txt");
});
