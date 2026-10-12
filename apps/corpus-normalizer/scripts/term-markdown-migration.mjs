#!/usr/bin/env node
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { materializeTermMarkdownMigration, planTermMarkdownMigration } from "../src/term-markdown-migration.mjs";

const usage = "Usage: term-markdown-migration plan ROOT --output PLAN.json [--pandoc EXECUTABLE]\n       term-markdown-migration materialize PLAN.json --output EMPTY_DIRECTORY";
function argumentsFor(args) {
  const [command, first, flag, output, ...rest] = args;
  if (!command || !first || flag !== "--output" || !output) throw new Error(usage);
  const result = { command, first, output };
  if (rest.length) { if (rest.length !== 2 || rest[0] !== "--pandoc" || command !== "plan") throw new Error(usage); result.pandoc = rest[1]; }
  if (!["plan", "materialize"].includes(command)) throw new Error(usage); return result;
}
const args = argumentsFor(process.argv.slice(2));
if (args.command === "plan") {
  const output = path.resolve(args.output); await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.tmp`; try { await writeFile(temporary, `${JSON.stringify(await planTermMarkdownMigration(args.first, { pandoc: args.pandoc }), null, 2)}\n`); await rename(temporary, output); } catch (error) { await rm(temporary, { force: true }); throw error; }
  process.stdout.write(`${JSON.stringify({ output, action: "planned" })}\n`);
} else {
  const receipt = await materializeTermMarkdownMigration(JSON.parse(await readFile(args.first, "utf8")), args.output);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}
