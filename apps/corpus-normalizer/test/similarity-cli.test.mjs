import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile); const here = path.dirname(fileURLToPath(import.meta.url)); const cli = path.resolve(here, "../scripts/corpus-normalizer.mjs");
const run = (...args) => execute(process.execPath, [cli, ...args], { encoding: "utf8" });

test("similarity CLI emits deterministic exact, near, overflow, and stale evidence", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-sim-cli-");
  const bodies = {
    "exact-a.md": "identical compact evidence\n",
    "exact-b.md": "identical compact evidence\n",
    "near-notes.md": "alpha beta gamma delta epsilon zeta eta theta iota kappa\n",
    "near_notes.md": "alpha beta gamma delta epsilon zeta eta theta iota lambda\n",
    "large.md": "x".repeat(200),
    "stale.md": "stale witness\n",
  };
  await Promise.all(Object.entries(bodies).map(([name, body]) => writeFile(path.join(root, name), body)));
  const input = path.join(root, "input.ndjson"); const records = Object.keys(bodies).sort().map((name) => ({ path: name, sourcePath: path.join(root, name), ...(name === "stale.md" ? { sha256: "0".repeat(64) } : {}) }));
  await writeFile(input, `${records.map(JSON.stringify).join("\n")}\n`);
  const first = path.join(root, "first.ndjson"); const second = path.join(root, "second.ndjson"); const scratch = path.join(root, "scratch");
  const options = ["--root", root, "--threshold", "0.8", "--max-bucket", "20", "--max-candidates", "100", "--max-body-bytes", "80", "--token-cache", "2", "--temp-dir", scratch];
  const result = JSON.parse((await run("analyze-similarity", input, "--output", first, ...options)).stdout); assert.equal(result.output, first);
  await run("analyze-similarity", input, "--output", second, ...options);
  assert.equal(await readFile(first, "utf8"), await readFile(second, "utf8")); assert.equal(existsSync(scratch), false);
  const evidence = (await readFile(first, "utf8")).trim().split("\n").map(JSON.parse); const types = new Set(evidence.map((item) => item.type));
  for (const type of ["exact-bytes", "exact-normalized-text", "near-text-family", "body-byte-overflow", "stale-source-hash"]) assert.equal(types.has(type), true, `missing ${type}`);
  const trusted = path.join(root, "trusted.ndjson"); await run("analyze-similarity", input, "--output", trusted, ...options, "--trust-source-hash"); assert.equal((await readFile(trusted, "utf8")).includes("stale-source-hash"), false);
});

test("similarity CLI rejects unknown, duplicate, and invalid bounded options", async () => {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-sim-cli-invalid-"); const input = path.join(root, "input.ndjson"); await writeFile(input, "");
  await assert.rejects(() => run("analyze-similarity", input, "--root", root, "--output", path.join(root, "out"), "--threshold", "1.1"), /threshold/);
  await assert.rejects(() => run("analyze-similarity", input, "--root", root, "--output", path.join(root, "out"), "--max-bucket", "1"), /at least 2/);
  await assert.rejects(() => run("analyze-similarity", input, "--root", root, "--output", path.join(root, "out"), "--output", path.join(root, "other")), /duplicate/);
  await assert.rejects(() => run("analyze-similarity", input, "--root", root, "--output", path.join(root, "out"), "--mystery"), /unknown/);
  await assert.rejects(() => run("analyze-similarity", input, "--output", path.join(root, "out")), /Usage/);
});
