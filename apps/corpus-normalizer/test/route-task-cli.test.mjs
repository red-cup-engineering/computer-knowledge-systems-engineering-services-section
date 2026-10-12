import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile); const here = path.dirname(fileURLToPath(import.meta.url)); const cli = path.resolve(here, "../scripts/corpus-normalizer.mjs");
const run = (...args) => execute(process.execPath, [cli, ...args], { encoding: "utf8" });
async function write(root, relative, content) { const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content); return target; }
async function ndjson(file) { return (await readFile(file, "utf8")).trimEnd().split("\n").map(line => JSON.parse(line)); }
function tar(name, content) {
  const body = Buffer.from(content); const header = Buffer.alloc(512); Buffer.from(name).copy(header, 0); Buffer.from("0000644\0").copy(header, 100); Buffer.from(`${body.length.toString(8).padStart(11, "0")}\0`).copy(header, 124); Buffer.from("00000000000\0").copy(header, 136); header.fill(32, 148, 156); header[156] = "0".charCodeAt(0); Buffer.from("ustar\0").copy(header, 257); Buffer.from("00").copy(header, 263); const checksum = header.reduce((sum, byte) => sum + byte, 0); Buffer.from(`${checksum.toString(8).padStart(6, "0")}\0 `).copy(header, 148); return Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512), Buffer.alloc(1024)]);
}

test("prepare-task CLI selects one authenticated handler artifact through a mixed route lifecycle", async () => {
  const scratch = await mkdtemp("/var/tmp/corpus-prepare-task-cli-"); const source = path.join(scratch, "source"); const destination = path.join(scratch, "target-services-section"); const route = path.join(scratch, "route.ndjson");
  await write(source, "content/text/glossary/topics/gravity.md", "---\nname: Gravity\n---\nGravity bends spacetime.\n");
  await write(source, "alpha.bib", "@article{alpha, title={Alpha}}\n");
  await write(source, "beta.md", "---\ncitation-key: beta\nbibtex-type: book\ntitle: Beta\n---\n");
  await write(source, "safe.tar", tar("wrapper/item.txt", "archive payload\n"));
  await write(source, "unknown.bin", Buffer.from([0, 1]));
  await run("route", source, destination, "--output", route, "--chunk-size", "2");
  const explanation = JSON.parse((await run("explain-route", route)).stdout); assert.equal(explanation.summary.unresolvedInvalidTasks.length, 1);
  const tasks = (await ndjson(route)).filter(record => record.kind === "task"); const selected = form => tasks.find(task => task.form === form);

  const termPlan = path.join(scratch, "term.ndjson"); const term = JSON.parse((await run("prepare-task", route, selected("term").id, "--output", termPlan)).stdout);
  assert.deepEqual(term.artifact, { kind: "normalization-plan", path: termPlan, schema: "corpus-normalizer.decision.v2" }); assert.match(term.nextCommands[0], /corpus-normalizer explain/); await run("explain", termPlan);

  const bibliographyPlan = path.join(scratch, "bibliography.ndjson"); const bibliography = JSON.parse((await run("prepare-task", route, selected("bibliography").id, "--output", bibliographyPlan)).stdout);
  assert.deepEqual(bibliography.artifact, { kind: "bibliography-plan", path: bibliographyPlan, schema: "corpus-normalizer.bibliography-plan.v1" });
  assert.deepEqual((await ndjson(bibliographyPlan)).filter(record => record.type === "source").map(record => record.source), ["alpha.bib", "beta.md"]);
  const projected = path.join(scratch, "projected-bibliography"); await run("materialize", "--plan", bibliographyPlan, "--output", projected); await run("apply", "--plan", bibliographyPlan, "--materialized", projected); const verified = JSON.parse((await run("verify", "--plan", bibliographyPlan, "--materialized", projected)).stdout);
  assert.equal(verified.valid, true); assert.equal(existsSync(path.join(destination, "bibliography.bib")), true); assert.equal(existsSync(path.join(source, "alpha.bib")), false); assert.equal(existsSync(path.join(source, "beta.md")), false);

  const archiveInventory = path.join(scratch, "archive.ndjson"); const archive = JSON.parse((await run("prepare-task", route, selected("archive-inspect").id, "--output", archiveInventory)).stdout);
  assert.deepEqual(archive.artifact, { kind: "archive-inventory", path: archiveInventory, schema: "corpus-normalizer.archive-inventory.v1" }); assert.equal((await ndjson(archiveInventory))[0].members[0].path, "wrapper/item.txt");

  const refused = path.join(scratch, "invalid.ndjson"); await assert.rejects(() => run("prepare-task", route, selected("invalid").id, "--output", refused), /invalid route task/); assert.equal(existsSync(refused), false);
});

test("prepare-task CLI is strict and refuses occupied outputs without alteration", async () => {
  const scratch = await mkdtemp("/var/tmp/corpus-prepare-task-refuse-"); const source = path.join(scratch, "source"); const destination = path.join(scratch, "target-services-section"); const route = path.join(scratch, "route.ndjson"); await write(source, "content/text/glossary/terms/a.md", "# A\n"); await run("route", source, destination, "--output", route); const task = (await ndjson(route)).find(record => record.kind === "task");
  const occupied = path.join(scratch, "occupied.ndjson"); await writeFile(occupied, "caller data\n"); await assert.rejects(() => run("prepare-task", route, task.id, "--output", occupied), /must be absent/); assert.equal(await readFile(occupied, "utf8"), "caller data\n");
  await assert.rejects(() => run("prepare-task", route, task.id, "--wrong", path.join(scratch, "wrong.ndjson")), /Usage/);
  await assert.rejects(() => run("prepare-task", route, task.id, "--output", path.join(source, "inside.ndjson")), /outside the source root/);
});
