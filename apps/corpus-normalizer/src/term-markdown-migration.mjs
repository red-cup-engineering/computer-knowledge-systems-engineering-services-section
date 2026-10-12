import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  planTermMigration,
  verifyMigrationMaterialization,
} from "@red-cup-engineering/term-engineering-services-section/migration";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function orgMetadata(source) {
  const values = new Map();
  for (const line of source.split(/\r?\n/gu)) {
    const match = /^(?:#\+([\w-]+)|:([\w-]+)):\s*(.*?)\s*$/iu.exec(line);
    if (!match) continue;
    const key = (match[1] ?? match[2]).toLowerCase();
    values.set(key, [...(values.get(key) ?? []), match[3]]);
  }
  // Org #+name identifies a block or witnessed definition, not the carrier.
  return Object.fromEntries([...values]
    .filter(([key]) => key !== "name")
    .map(([key, items]) => [key, items.length === 1 && key !== "alias" ? items[0] : items]));
}

function convertOrg(source, executable) {
  const result = spawnSync(executable, ["--from=org", "--to=gfm", "--wrap=none"], {
    input: source,
    encoding: "utf8",
  });
  if (result.error) throw new Error(`Pandoc is required for Org term migration: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Pandoc Org conversion failed (${result.status}): ${result.stderr.trim()}`);
  return result.stdout.replace(/(\[\[file:[^\]]+)\.org(\])/giu, "$1.md$2")
    .replace(/(\]\([^)]*)\.org(\))/giu, "$1.md$2")
    .replace(/(\[\[)([^\]]+)\.org(\]\])/giu, "$1$2.md$3");
}

async function migrationSources(sourceRoot) {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const sources = [];
  const sourcePaths = new Map();
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const input = path.join(sourceRoot, entry.name);
    if (entry.isFile() && [".md", ".org"].includes(path.extname(entry.name).toLowerCase())) {
      const text = await readFile(input, "utf8");
      const format = path.extname(entry.name).slice(1).toLowerCase();
      sources.push({ relativePath: entry.name, format, text, ...(format === "org" ? { metadata: orgMetadata(text) } : {}) });
      sourcePaths.set(entry.name, input);
      continue;
    }
    if (!entry.isDirectory() || entry.name !== "alternate-representations") {
      throw new Error(`term migration admits only direct Markdown/Org files and alternate-representations/: ${entry.name}`);
    }
    for (const witness of (await readdir(input, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      if (!witness.isFile() || path.extname(witness.name).toLowerCase() !== ".md") throw new Error(`alternate representation is not a Markdown file: ${witness.name}`);
      const relativePath = path.join(entry.name, witness.name);
      const text = await readFile(path.join(input, witness.name), "utf8");
      sources.push({ relativePath, text, role: "alternate-witness", alternateFor: witness.name.replace(/^\d{4}-\d{2}-\d{2}-/u, "") });
      sourcePaths.set(relativePath, path.join(input, witness.name));
    }
  }
  return { sources, sourcePaths };
}

/** Plan filesystem ingestion around the term owner's pure migration operation. */
export async function planTermMarkdownMigration(root, { pandoc = "pandoc" } = {}) {
  const sourceRoot = path.resolve(root);
  const { sources, sourcePaths } = await migrationSources(sourceRoot);
  const ownerPlan = planTermMigration(sources, { convertOrgToGfm: (source) => convertOrg(source, pandoc) });
  const alternateRepresentations = sources.filter(({ role }) => role === "alternate-witness").map((source) => ({
    sourcePath: sourcePaths.get(source.relativePath),
    relativePath: source.relativePath,
    sourceContentSha256: sha256(source.text),
    target: source.alternateFor,
    role: "witnessed-out-of-carrier",
  }));
  const inputs = ownerPlan.transactions.map((transaction) => ({
    input: transaction.source,
    sourcePath: sourcePaths.get(transaction.source),
    sourceContentSha256: transaction.sourceSha256,
    output: transaction.output,
    proposedContentSha256: transaction.outputSha256,
    content: transaction.markdown,
    action: "write",
    conversion: transaction.sourceFormat === "org" ? "pandoc-org-to-gfm" : "canonical-markdown",
  }));
  return {
    schema: "corpus-normalizer.term-markdown-migration.v2",
    sourceRoot,
    createdAt: null,
    ownerPlan,
    inputs,
    alternateRepresentations,
    receipts: inputs.map(({ input, sourceContentSha256, output, proposedContentSha256 }) => ({ input, sourceContentSha256, output, proposedContentSha256 })),
    invariants: [...ownerPlan.invariants, "filesystem sources are hash-checked before materialization"],
  };
}

export async function materializeTermMarkdownMigration(plan, outputRoot) {
  const output = path.resolve(outputRoot);
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error(`migration materialization root must be empty: ${output}`);
  for (const item of [...plan.inputs, ...plan.alternateRepresentations]) {
    if (sha256(await readFile(item.sourcePath)) !== item.sourceContentSha256) throw new Error(`source changed after migration plan: ${item.input ?? item.relativePath}`);
  }
  for (const item of plan.inputs) await writeFile(path.join(output, item.output), item.content, "utf8");
  return verifyTermMarkdownMigration(plan, output);
}

export async function verifyTermMarkdownMigration(plan, outputRoot) {
  const output = path.resolve(outputRoot);
  const observed = new Map();
  for (const entry of await readdir(output, { withFileTypes: true })) {
    if (entry.isFile()) observed.set(entry.name, await readFile(path.join(output, entry.name), "utf8"));
  }
  const result = verifyMigrationMaterialization(plan.ownerPlan, observed);
  return { valid: result.valid, errors: [...result.errors], receipts: plan.receipts };
}
