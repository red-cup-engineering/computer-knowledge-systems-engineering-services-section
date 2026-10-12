import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile); const here = path.dirname(fileURLToPath(import.meta.url)); const cli = path.resolve(here, "../scripts/corpus-normalizer.mjs");
const run = (...args) => execute(process.execPath, [cli, ...args], { encoding: "utf8" });

test("single CLI validates the documented reference-source form", async () => {
  const root = await mkdtemp("/var/tmp/corpus-reference-cli-validate-"); await writeFile(path.join(root, "source.pdf"), Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 0xff])); await writeFile(path.join(root, "citation.ris"), "TY  - BOOK\nER  -\n");
  const result = JSON.parse((await run("validate", "--form", "reference-source", "--root", root)).stdout); assert.deepEqual(result, { valid: true, errors: [], warnings: [], count: 2 });
  await assert.rejects(() => run("validate", "--form", "reference", "--root", root), /term\|triage-text\|note\|reference-source\|application\|service-section\|bibliography/);
});

test("CLI usage exposes the complete guarded route lifecycle", async () => {
  await assert.rejects(
    () => run("not-a-command"),
    error => ["receipt-task", "retire-archive", "complete-route"].every(command => error.stderr.includes(`corpus-normalizer ${command}`)),
  );
});
