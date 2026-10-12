import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { materializeTermMarkdownMigration, planTermMarkdownMigration, verifyTermMarkdownMigration } from "../src/term-markdown-migration.mjs";

async function fixture() { const root = await mkdtemp("/var/tmp/term-markdown-migration-"); const terms = path.join(root, "terms"); await mkdir(path.join(terms, "alternate-representations"), { recursive: true }); return { root, terms }; }

test("plans Pandoc Org conversion through the term owner while keeping provenance outside the carrier", async () => {
  const { terms } = await fixture();
  await writeFile(path.join(terms, "computer-file.org"), "#+title: Computer File\n#+name: computer-file\n#+alias: digital file\n#+description: A stored sequence of data. It is used in computing.\n\nA [[file:disk.org][disk]] stores a file.\n");
  await writeFile(path.join(terms, "alternate-representations", "2025-01-01-computer-file.md"), "old witness\n");
  const plan = await planTermMarkdownMigration(terms);
  assert.equal(plan.inputs.length, 1); assert.equal(plan.alternateRepresentations.length, 1);
  const item = plan.inputs[0]; assert.equal(item.output, "computer-file.md"); assert.equal(item.conversion, "pandoc-org-to-gfm");
  assert.match(item.content, /^name: Computer File/m); assert.match(item.content, /digital file/); assert.doesNotMatch(item.content, /source-format|source-sha256|Additional witnessed formulation|old witness/); assert.match(item.content, /disk\.md/);
  assert.equal(plan.alternateRepresentations[0].role, "witnessed-out-of-carrier");
  const overlay = path.join(path.dirname(terms), "overlay"); const receipt = await materializeTermMarkdownMigration(plan, overlay); assert.equal(receipt.valid, true); assert.equal((await verifyTermMarkdownMigration(plan, overlay)).valid, true);
});

test("normalizes Markdown while retaining body, aliases, and source receipt without inventing metadata", async () => {
  const { terms } = await fixture();
  await writeFile(path.join(terms, "the-thing.md"), "---\ntitle: The Thing\naliases:\n  - thing\n---\n\nSee [[other.org]].\n");
  const plan = await planTermMarkdownMigration(terms); const item = plan.inputs[0];
  assert.equal(item.output, "the-thing.md"); assert.match(item.content, /^name: The Thing/m); assert.doesNotMatch(item.content, /^description:/m); assert.match(item.content, /\[\[other\.org\]\]/); assert.match(item.sourceContentSha256, /^[a-f0-9]{64}$/);
});

test("preserves filename identity even when names repeat and rejects noncanonical nested material", async () => {
  const { terms } = await fixture();
  await writeFile(path.join(terms, "one.md"), "---\nname: Same Term\n---\nOne witnessed body.\n"); await writeFile(path.join(terms, "two.md"), "---\nname: Same Term\n---\nAnother witnessed body.\n");
  assert.deepEqual((await planTermMarkdownMigration(terms)).inputs.map(({ output }) => output), ["one.md", "two.md"]);
  const second = await fixture(); await mkdir(path.join(second.terms, "stray"));
  await assert.rejects(() => planTermMarkdownMigration(second.terms), /admits only direct Markdown\/Org/);
});

test("receipts fail closed when an input changes after planning", async () => {
  const { terms } = await fixture(); const file = path.join(terms, "term.md"); await writeFile(file, "---\nname: Term\n---\nBody\n"); const plan = await planTermMarkdownMigration(terms); await writeFile(file, "changed\n");
  await assert.rejects(() => materializeTermMarkdownMigration(plan, path.join(path.dirname(terms), "overlay")), /source changed/);
});
