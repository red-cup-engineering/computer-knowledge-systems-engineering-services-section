import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, "../scripts/corpus-normalizer.mjs");
const run = (...args) => execute(process.execPath, [cli, ...args], { encoding: "utf8" });

test("CLI completes one routed task only after its guarded transaction verifies", async () => {
  const root = await mkdtemp("/var/tmp/corpus-route-completion-cli-");
  const source = path.join(root, "source");
  const destination = path.join(root, "destination-services-section");
  const route = path.join(root, "route.ndjson");
  const plan = path.join(root, "task.ndjson");
  const overlay = path.join(root, "overlay");
  const receipt = path.join(root, "receipt.json");
  const completion = path.join(root, "completion.json");
  const term = path.join(source, "content/text/glossary/terms/hello.md");

  await mkdir(path.dirname(term), { recursive: true });
  await writeFile(term, "# Hello\n");
  await run("route", source, destination, "--output", route);
  const records = (await readFile(route, "utf8")).trim().split("\n").map(JSON.parse);
  const task = records.find(record => record.kind === "task" && record.form === "term");
  assert.ok(task?.id);

  await run("prepare-task", route, task.id, "--output", plan);
  await run("materialize", "--plan", plan, "--output", overlay);
  await run("apply", "--plan", plan, "--materialized", overlay);
  await run("receipt-task", route, task.id, "--artifact", plan, "--materialized", overlay, "--output", receipt);
  const result = JSON.parse((await run("complete-route", route, "--receipt", receipt, "--output", completion)).stdout);

  assert.equal(result.complete, true);
  assert.equal(result.taskCount, 1);
  assert.equal(JSON.parse(await readFile(completion, "utf8")).complete, true);
  assert.equal(await readFile(path.join(destination, "content/text/glossary/terms/hello.md"), "utf8"), "---\nidentity: hello\nname: hello\n---\n# Hello\n");
});
