import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { planBibliography } from "../src/bibliography-plan.mjs";

const collect = async (source, destination, options) => {
  const records = [];
  for await (const record of planBibliography(source, destination, options)) records.push(record);
  return records;
};
const byType = (records, type) => records.filter((record) => record.type === type);

test("bibliography plan has a bound header, source accounting, and deterministic member records", async () => {
  const root = await mkdtemp("/var/tmp/bib-plan-");
  const source = path.join(root, "source");
  const destination = path.join(root, "bibliography.bib");
  await mkdir(source);
  await writeFile(path.join(source, "b.bib"), "% keep\n@string{x={y}}\n@book{B,title={B}}\n");
  await writeFile(path.join(source, "a.md"), "---\ncitation-key: A\nbibtex-type: article\ntitle: A\n---\n");
  await writeFile(path.join(source, "c.org"), "#+citation_key: C\n#+bibtex_type: misc\n#+title: C\n");

  const plan = await collect(source, destination, { chunkSize: 2 });
  assert.deepEqual(plan[0], { type: "header", schema: "corpus-normalizer.bibliography-plan.v1", sourceRoot: source, destination, existingTarget: { state: "absent", sha256: null } });
  assert.equal(plan.at(-1).type, "aggregate"); assert.equal(plan.at(-1).status, "proven");
  assert.match(plan.at(-1).content, /@article\{A/); assert.match(plan.at(-1).content, /% keep/);
  assert.equal(byType(plan, "source").length, 3);
  assert.deepEqual(byType(plan, "citation").map((record) => [record.source, record.identity, record.disposition]), [["a.md", "a", "proposed"], ["b.bib", "b", "proposed"], ["c.org", "c", "proposed"]]);
  assert.deepEqual(byType(plan, "directive").map((record) => record.disposition), ["proposed", "proposed"]);
  assert.deepEqual(await collect(source, destination, { chunkSize: 2 }), plan);
});

test("existing exact citations and directives are covered while differing citations fail closed", async () => {
  const root = await mkdtemp("/var/tmp/bib-plan-"); const source = path.join(root, "source"); const destination = path.join(root, "bibliography.bib");
  await mkdir(source); const exact = "% retained\n@book{A,title={one}}\n";
  await writeFile(destination, exact); await writeFile(path.join(source, "a.bib"), exact);
  const exactPlan = await collect(source, destination);
  assert.equal(exactPlan[0].existingTarget.state, "present"); assert.equal(byType(exactPlan, "citation")[0].disposition, "exact-covered"); assert.equal(byType(exactPlan, "citation")[0].against, "destination"); assert.equal(byType(exactPlan, "directive")[0].disposition, "exact-covered"); assert.equal(exactPlan.at(-1).status, "proven");
  await writeFile(path.join(source, "a.bib"), "@book{A,title={two}}\n");
  const conflictPlan = await collect(source, destination);
  assert.equal(byType(conflictPlan, "citation")[0].disposition, "conflict-invalid"); assert.equal(conflictPlan.at(-1).status, "invalid"); assert.equal("content" in conflictPlan.at(-1), false);
});

test("file, citation, and directive limits fail independently while every path is accounted", async () => {
  const root = await mkdtemp("/var/tmp/bib-plan-"); const source = path.join(root, "source"); const destination = path.join(root, "bibliography.bib");
  await mkdir(source); await writeFile(path.join(source, "a.bib"), "% a\n@book{A,title={a}}\n"); await writeFile(path.join(source, "b.bib"), "% b\n@book{B,title={b}}\n");
  const fileLimited = await collect(source, destination, { maxFiles: 1 }); assert.equal(byType(fileLimited, "source").length, 2); assert.match(byType(fileLimited, "source").at(-1).error, /file limit/); assert.equal(fileLimited.at(-1).status, "invalid");
  const entryLimited = await collect(source, destination, { maxEntries: 1 }); assert.equal(byType(entryLimited, "citation").at(-1).error, "bibliography citation limit exceeded"); assert.equal(entryLimited.at(-1).status, "invalid");
  const directiveLimited = await collect(source, destination, { maxDirectives: 1 }); assert.equal(byType(directiveLimited, "directive").at(-1).error, "bibliography directive limit exceeded"); assert.equal(directiveLimited.at(-1).status, "invalid");
});

test("malformed and incompatible siblings do not prevent later source accounting", async () => {
  const root = await mkdtemp("/var/tmp/bib-plan-"); const source = path.join(root, "source"); const destination = path.join(root, "bibliography.bib");
  await mkdir(source); await writeFile(path.join(source, "a.bad"), "unsupported"); await writeFile(path.join(source, "b.bib"), "@book{B,title={good}}\n"); await writeFile(path.join(source, "c.bib"), "@book{C,title={unterminated}\n");
  const plan = await collect(source, destination);
  assert.deepEqual(byType(plan, "source").map((record) => record.source), ["a.bad", "b.bib", "c.bib"]); assert.equal(byType(plan, "citation")[0].identity, "b"); assert.equal(plan.at(-1).status, "invalid");
});

test("string directives use macro identity for exact coverage and conflicts", async () => {
  const root = await mkdtemp("/var/tmp/bib-plan-"); const source = path.join(root, "source"); const destination = path.join(root, "bibliography.bib");
  await mkdir(source); await writeFile(destination, "@string{Journal = {Example}}\n"); await writeFile(path.join(source, "exact.bib"), "@string{Journal = {Example}}\n");
  const exact = await collect(source, destination); assert.equal(byType(exact, "directive")[0].identity, "string:journal"); assert.equal(byType(exact, "directive")[0].disposition, "exact-covered"); assert.equal(exact.at(-1).status, "proven");
  await writeFile(path.join(source, "exact.bib"), "@string{journal = {Different}}\n");
  const conflict = await collect(source, destination); assert.equal(byType(conflict, "directive")[0].disposition, "conflict-invalid"); assert.equal(conflict.at(-1).status, "invalid");
});

test("source and aggregate byte limits plus strict textual admission fail closed", async () => {
  const root = await mkdtemp("/var/tmp/bib-plan-"); const source = path.join(root, "source"); const destination = path.join(root, "bibliography.bib"); await mkdir(source);
  const file = path.join(source, "a.bib"); await writeFile(file, "@book{A,title={A}}\n");
  const sourceLimited = await collect(source, destination, { maxSourceBytes: 4 }); assert.match(byType(sourceLimited, "source")[0].error, /source exceeds byte limit/); assert.equal(sourceLimited.at(-1).status, "invalid");
  const aggregateLimited = await collect(source, destination, { maxAggregateBytes: 4 }); assert.match(aggregateLimited.at(-1).error, /aggregate exceeds byte limit/);
  await writeFile(file, Buffer.from([0x40,0x62,0x6f,0x6f,0x6b,0x7b,0x41,0x2c,0x00,0x7d])); const nul = await collect(source, destination); assert.match(byType(nul, "source")[0].error, /NUL/);
  await writeFile(file, Buffer.from([0x40,0x62,0x6f,0x6f,0x6b,0x7b,0xff,0x7d])); const invalidUtf8 = await collect(source, destination); assert.match(byType(invalidUtf8, "source")[0].error, /valid UTF-8/);
  await assert.rejects(() => collect(source, destination, { maxSourceBytes: 0 }), /positive safe integer/);
  await assert.rejects(() => collect(source, destination, { maxAggregateBytes: Number.MAX_SAFE_INTEGER + 1 }), /positive safe integer/);
});
