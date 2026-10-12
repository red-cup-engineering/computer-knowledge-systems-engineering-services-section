import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { collectReferencesFrom } from "../src/bibliography-collect.mjs";
import { reconcileReferences } from "../src/bibliography-reconcile.mjs";
import { projectBibtex } from "../src/bibliography-bibtex.mjs";

let root;
before(() => {
  root = mkdtempSync(join(tmpdir(), "bibliography-engineering-corpus-"));
  mkdirSync(join(root, "glossary", "terms"), { recursive: true });
  mkdirSync(join(root, "bibliographies"), { recursive: true });
  mkdirSync(join(root, "node_modules", "ignored"), { recursive: true });

  writeFileSync(join(root, "glossary", "terms", "agon.md"), [
    "---",
    "name: agon",
    "references:",
    "  caillois1958:",
    "    authors: [Caillois, Roger]",
    "    title: Les jeux et les hommes",
    "    year: 1958",
    "---",
    "",
    "Agon is competitive play.",
    "",
  ].join("\n"));

  writeFileSync(join(root, "bibliographies", "caillois1958.md"), [
    "---",
    "type: bibliography",
    "key: caillois1958",
    "reference-type: book",
    "authors: [Caillois, Roger]",
    "year: 1958",
    "title: Les jeux et les hommes",
    "---",
    "",
    "# Caillois 1958",
    "",
    "Why this is central.",
    "",
  ].join("\n"));

  writeFileSync(join(root, "bibliographies", "orphan1999.md"), [
    "---",
    "type: bibliography",
    "key: orphan1999",
    "reference-type: article",
    "authors: [Nobody, N.]",
    "year: 1999",
    "title: Never cited",
    "---",
    "",
    "# Orphan",
    "",
    "Nobody cites this.",
    "",
  ].join("\n"));

  writeFileSync(join(root, "node_modules", "ignored", "should-not-be-walked.md"), "---\nreferences:\n  fake1999:\n    authors: [x]\n    title: t\n    year: 1999\n---\nbody\n");
});
after(() => { rmSync(root, { recursive: true, force: true }); });

test("collectReferencesFrom walks the corpus and skips node_modules", () => {
  const collected = collectReferencesFrom(root);
  assert.equal(collected.triples.length, 1);
  assert.equal(collected.triples[0].citekey, "caillois1958");
  assert.equal(collected.carriers.length, 2);
  assert.ok(!collected.triples.some((triple) => triple.citekey === "fake1999"));
  assert.deepEqual(collected.citations, []);
});

test("reconcileReferences over the fixture finds one orphan and zero of everything else", () => {
  const collected = collectReferencesFrom(root);
  const health = reconcileReferences(collected);
  assert.deepEqual(health.conflicts, []);
  assert.deepEqual(health.probableDuplicates, []);
  assert.deepEqual(health.uncoveredCitekeys, []);
  assert.deepEqual(health.citekeysWithoutCarrier, []);
  assert.equal(health.orphanCarriers.length, 1);
  assert.equal(health.orphanCarriers[0].citekey, "orphan1999");
});

test("projectBibtex over the fixture includes both citekeys, sorted, deterministically", () => {
  const collected = collectReferencesFrom(root);
  const first = projectBibtex(collected);
  const second = projectBibtex(collectReferencesFrom(root));
  assert.equal(first, second);
  assert.ok(first.indexOf("caillois1958") < first.indexOf("orphan1999"));
});
