import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, "../scripts/corpus-normalizer.mjs");
const run = async (...args) => (await execute(process.execPath, [cli, ...args], { encoding: "utf8" })).stdout.trim();

test("single CLI dispatches the complete bibliography lifecycle and idempotent completion", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-bib-cli-");
  const source = path.join(root, "source"); const destination = path.join(root, "library", "bibliography.bib"); const plan = path.join(root, "plan.ndjson"); const projection = path.join(root, "projection");
  await mkdir(source); await writeFile(path.join(source, "a.bib"), "% retained\n@book{A,title={A}}\n"); await writeFile(path.join(source, "b.bib"), "@article{B,title={B}}\n");

  const planned = JSON.parse(await run("plan", source, destination, "--output", plan)); assert.ok(planned.count >= 6);
  const explanation = (await run("explain", plan)).split("\n").map(JSON.parse).at(-1); assert.equal(explanation.type, "summary"); assert.equal(explanation.schema, "corpus-normalizer.bibliography-plan.v1"); assert.equal(explanation.statuses.invalid, 0); assert.equal(explanation.statuses.proven > 0, true);
  const materialized = JSON.parse(await run("materialize", "--plan", plan, "--output", projection)); assert.equal(materialized.bibliography, path.join(projection, "bibliography.bib"));
  assert.equal(JSON.parse(await run("apply", "--plan", plan, "--materialized", projection)).valid, true);
  assert.equal(JSON.parse(await run("verify", "--plan", plan, "--materialized", projection)).valid, true);
  const validation = JSON.parse(await run("validate", "--form", "bibliography", "--root", destination)); assert.deepEqual({ valid: validation.valid, count: validation.count, errors: validation.errors, warnings: validation.warnings }, { valid: true, count: 2, errors: [], warnings: [] });
  assert.equal(existsSync(source), false); assert.match(await readFile(destination, "utf8"), /@book\{A/);
  assert.equal(JSON.parse(await run("apply", "--plan", plan, "--materialized", projection)).valid, true);
  assert.equal(JSON.parse(await run("verify", "--plan", plan, "--materialized", projection)).valid, true);
});
