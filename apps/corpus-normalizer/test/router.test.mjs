import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { collectRoutePlan, routePlan, routerSchemaVersion, validateRouteRecords } from "../src/router.mjs";

test("nested router partitions mixed material into existing form tasks with complete accounting", async () => {
  const root = await mkdtemp("/var/tmp/corpus-router-"); const source = path.join(root, "incoming"); const destination = path.join(root, "out-services-section");
  for (const directory of [["services", "hydrology-services-section"], ["apps", "rain-app"], ["content", "text", "glossary", "topics"], ["content", "text", "documents", "articles", "notes"], ["node_modules", "ignored"]]) await mkdir(path.join(source, ...directory), { recursive: true });
  await writeFile(path.join(source, "services", "hydrology-services-section", "package.json"), '{"name":"hydrology"}\n'); await writeFile(path.join(source, "apps", "rain-app", "package.json"), '{"name":"rain"}\n');
  await writeFile(path.join(source, "content", "text", "glossary", "topics", "runoff.md"), "# Runoff\n"); await writeFile(path.join(source, "content", "text", "documents", "articles", "notes", "2026-01-02-rain.md"), "rain\n");
  await writeFile(path.join(source, "bibliography.bib"), "@book{x,title={X}}\n"); await writeFile(path.join(source, "bundle.tar"), "not inspected here"); await writeFile(path.join(source, "opaque.bin"), Buffer.from([0, 255])); await writeFile(path.join(source, "node_modules", "ignored", "x.js"), "ignored");
  const records = await collectRoutePlan(source, destination); const tasks = records.filter(record => record.kind === "task"); const accounting = records.filter(record => record.kind === "accounting");
  assert.deepEqual(records[0], { schema: routerSchemaVersion, kind: "header", sourceRoot: source, destination, options: { maxRecords: 100000, maxTasks: 10000, chunkSize: 128 } }); assert.equal(validateRouteRecords(records).valid, true);
  assert.deepEqual(tasks.map(record => record.form).sort(), ["application", "archive-inspect", "bibliography", "invalid", "note", "service-section", "term"]);
  assert.equal(tasks.find(record => record.form === "service-section").destination, path.join(destination, "services", "hydrology-services-section")); assert.equal(tasks.find(record => record.form === "application").destination, path.join(destination, "apps", "rain-app")); assert.equal(tasks.find(record => record.form === "term").destination, path.join(destination, "content", "text", "glossary", "terms"));
  assert.equal(accounting.length, new Set(accounting.map(record => record.path)).size); assert.equal(accounting.find(record => record.path === "node_modules").membership.excluded, "generated-output"); assert.equal(accounting.some(record => record.path.endsWith("node_modules/ignored/x.js")), false);
  const again = []; for await (const record of routePlan(source, destination)) again.push(record); assert.deepEqual(records, again);
});

test("route validator requires one first header while headers do not consume inventory capacity", async () => {
  const root = await mkdtemp("/var/tmp/corpus-router-header-"); await writeFile(path.join(root, "only.bin"), Buffer.from([1])); const destination = path.join(root, "out-services-section");
  const records = await collectRoutePlan(root, destination, { maxRecords: 2 }); assert.equal(records[0].kind, "header"); assert.equal(records.filter(record => record.kind === "accounting").length, 2); assert.equal(validateRouteRecords(records).valid, true);
  assert.equal(validateRouteRecords(records.slice(1)).valid, false); assert.equal(validateRouteRecords([...records.slice(1), records[0]]).valid, false);
});

test("nested router refuses unbounded work and non-service destinations", async () => {
  const root = await mkdtemp("/var/tmp/corpus-router-caps-"); await writeFile(path.join(root, "a.txt"), "ambiguous"); await writeFile(path.join(root, "b.bin"), Buffer.from([0]));
  await assert.rejects(() => collectRoutePlan(root, path.join(root, "not-a-section")), /must end/); await assert.rejects(() => collectRoutePlan(root, path.join(root, "out-services-section"), { maxTasks: 1 }), /maxTasks/); await assert.rejects(() => collectRoutePlan(root, path.join(root, "out-services-section"), { maxRecords: 1 }), /maxRecords/);
});

test("router admits only parser-supported bibliography evidence and preserves deep ownership", async () => {
  const root = await mkdtemp("/var/tmp/corpus-router-evidence-"); const destination = path.join(root, "out-services-section");
  await mkdir(path.join(root, "services", "outer-services-section", "services", "inner-services-section"), { recursive: true });
  await mkdir(path.join(root, "content", "text", "documents", "articles", "bibliographies", "sources"), { recursive: true });
  await writeFile(path.join(root, "services", "outer-services-section", "services", "inner-services-section", "inside.txt"), "owned by inner\n");
  await writeFile(path.join(root, "paper.md"), "---\ncitation-key: rain-2026\nbibtex-type: article\n---\n"); await writeFile(path.join(root, "citation.cff"), "cff-version: 1.2.0\n"); await writeFile(path.join(root, "archive.zip"), "zip"); await writeFile(path.join(root, "titled.md"), "# A rather generic title\n"); await writeFile(path.join(root, "content", "text", "documents", "articles", "bibliographies", "sources", "rain.pdf"), Buffer.from([0, 255]));
  const records = await collectRoutePlan(root, destination); const tasks = records.filter(record => record.kind === "task");
  const bibliography = tasks.find(record => record.form === "bibliography"); assert.deepEqual(bibliography.sourcePaths, ["paper.md"]);
  for (const sourcePath of ["citation.cff", "archive.zip", "titled.md"]) assert.equal(tasks.find(record => record.sourcePaths.includes(sourcePath)).form, "invalid");
  assert.equal(tasks.find(record => record.form === "reference-source").sourcePaths[0].endsWith("rain.pdf"), true);
  const inner = tasks.find(record => record.form === "service-section" && record.sourcePaths[0].endsWith("inner-services-section")); assert.equal(records.find(record => record.kind === "accounting" && record.path.endsWith("inner-services-section/inside.txt")).membership.taskId, inner.id);
});
