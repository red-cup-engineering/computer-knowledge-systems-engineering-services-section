import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, "../scripts/corpus-normalizer.mjs");
const run = (...args) => execute(process.execPath, [cli, ...args], { encoding: "utf8" });

async function write(root, relative, content) {
  const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content); return target;
}
async function records(file) { return (await readFile(file, "utf8")).trimEnd().split("\n").map(line => JSON.parse(line)); }

test("route CLI writes a deterministic, fully accounted mixed-service dry run and explains unresolved work", async () => {
  const scratch = await mkdtemp("/var/tmp/corpus-router-cli-"); const source = path.join(scratch, "source"); const destination = path.join(scratch, "science-services-section");
  await write(source, "apps/widget/package.json", "{\"name\":\"widget\"}\n");
  await write(source, "apps/widget/src/index.js", "export default 1;\n");
  await write(source, "apps/loose/readme.md", "not a package\n");
  await write(source, "services/child-services-section/content/readme.md", "nested service\n");
  await write(source, "content/text/glossary/topics/gravity.md", "---\nname: Gravity\n---\nGravity.\n");
  await write(source, "content/text/triage/fragment.txt", "fragment\n");
  await write(source, "content/text/documents/articles/notes/2026-08-19-note.md", "note\n");
  await write(source, "citations.bib", "@article{one, title={One}}\n");
  await write(source, "carrier.tgz", "opaque carrier\n");
  await write(source, "unknown.bin", Buffer.from([0, 1, 2]));
  await write(source, "node_modules/ignored/deep.js", "generated\n");

  const first = path.join(scratch, "first.ndjson"); const second = path.join(scratch, "second.ndjson");
  const options = ["--max-records", "100", "--max-tasks", "30", "--chunk-size", "2"];
  const result = JSON.parse((await run("route", source, destination, "--output", first, ...options)).stdout);
  await run("route", source, destination, "--output", second, ...options);
  assert.equal(await readFile(first, "utf8"), await readFile(second, "utf8"));

  const plan = await records(first); const header = plan[0]; const summary = plan.at(-1); const tasks = plan.filter(record => record.kind === "task"); const accounting = plan.filter(record => record.kind === "accounting");
  assert.deepEqual(header, { schema: "corpus-normalizer.router.v1", kind: "header", sourceRoot: source, destination, options: { maxRecords: 100, maxTasks: 30, chunkSize: 2 } });
  assert.deepEqual(new Set(tasks.map(item => item.form)), new Set(["application", "service-section", "term", "triage-text", "note", "bibliography", "archive-inspect", "invalid"]));
  assert.equal(tasks.filter(item => item.form === "invalid").length, 2);
  const expectedPaths = [
    ".", "apps", "apps/loose", "apps/loose/readme.md", "apps/widget", "apps/widget/package.json", "apps/widget/src", "apps/widget/src/index.js",
    "carrier.tgz", "citations.bib", "content", "content/text", "content/text/documents", "content/text/documents/articles", "content/text/documents/articles/notes", "content/text/documents/articles/notes/2026-08-19-note.md",
    "content/text/glossary", "content/text/glossary/topics", "content/text/glossary/topics/gravity.md", "content/text/triage", "content/text/triage/fragment.txt",
    "node_modules", "services", "services/child-services-section", "services/child-services-section/content", "services/child-services-section/content/readme.md", "unknown.bin"
  ];
  assert.deepEqual(accounting.map(item => item.path), expectedPaths);
  assert.equal(accounting.find(item => item.path === "node_modules").membership.excluded, "generated-output");
  assert.equal(summary.taskCount, tasks.length); assert.equal(summary.accountingCount, expectedPaths.length); assert.equal(summary.unresolvedInvalidTasks.length, 2);
  assert.equal(result.taskCount, tasks.length); assert.equal(result.accountingCount, expectedPaths.length);

  const explanation = JSON.parse((await run("explain-route", first)).stdout);
  assert.deepEqual(explanation.header, header); assert.deepEqual(explanation.summary, summary);
  assert.deepEqual(Object.keys(summary.byForm), [...Object.keys(summary.byForm)].sort());
  assert.deepEqual(Object.keys(summary.byStatus), [...Object.keys(summary.byStatus)].sort());
});

test("route CLI strictly refuses invalid arguments, occupied output, and bounded partial plans", async () => {
  const scratch = await mkdtemp("/var/tmp/corpus-router-cli-refuse-"); const source = path.join(scratch, "source"); const destination = path.join(scratch, "target-services-section"); await write(source, "a.txt", "ambiguous\n"); await write(source, "b.bin", "binary\n");
  const bounded = path.join(scratch, "bounded.ndjson"); await assert.rejects(() => run("route", source, destination, "--output", bounded, "--max-records", "1"), /maxRecords/); assert.equal(existsSync(bounded), false);
  const occupied = path.join(scratch, "occupied.ndjson"); await writeFile(occupied, "mine\n"); await assert.rejects(() => run("route", source, destination, "--output", occupied), /must be absent/); assert.equal(await readFile(occupied, "utf8"), "mine\n");
  await assert.rejects(() => run("route", source, destination, "--output", path.join(scratch, "bad.ndjson"), "--max-tasks", "0"), /positive safe integer/);
  await assert.rejects(() => run("route", source, destination, "--output", path.join(scratch, "unknown.ndjson"), "--unknown", "1"), /unknown route option/);
  await assert.rejects(() => run("route", source, path.join(scratch, "not-a-section"), "--output", path.join(scratch, "wrong.ndjson")), /must end with -services-section/);
  await assert.rejects(() => run("explain-route", occupied), /invalid route JSON|router schema/);
});
