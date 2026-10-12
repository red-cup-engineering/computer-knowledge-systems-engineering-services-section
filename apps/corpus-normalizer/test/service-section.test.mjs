import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { validate } from "../src/service-section.mjs";

async function service(files = {}) {
  const root = await mkdtemp("/var/tmp/corpus-normalizer-service-contract-");
  const section = path.join(root, "fixture-services-section"); await mkdir(section);
  for (const [relative, content] of Object.entries(files)) { const file = path.join(section, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content); }
  return section;
}
async function audit(files) { const root = await service(files); const result = await validate(root); await rm(path.dirname(root), { recursive: true, force: true }); return result; }

test("accepts sparse authored services and nested hydrology service boundaries", async () => {
  const sparse = await audit({ "package.json": JSON.stringify({ name: "sparse" }), "readme.md": "# Sparse\n", "node_modules/ignored/index.js": "not inspected\n" });
  assert.equal(sparse.valid, true); assert.equal(sparse.ignoredRoots, 1);
  const hydrology = await audit({
    "package.json": JSON.stringify({ name: "hydrology" }),
    "services/hydrology-services-section/content/text/glossary/terms/water.md": "# Water\n",
    "services/hydrology-services-section/bibliography.bib": "@article{water, title = {Water}}\n",
  });
  assert.equal(hydrology.valid, true, hydrology.errors.join("\n"));
});

test("rejects old active-content dump shapes and non-service children", async () => {
  const result = await audit({
    "content/text/glossary/terms/topics/old.md": "# Old\n",
    "content/text/glossary/topics/old.md": "# Old\n",
    "content/text/triage/recovered-research/old.md": "old\n",
    "content/text/2026/field.md": "old\n",
    "services/not-a-service/readme.md": "old\n",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("glossary terms: term root must be flat")));
  assert.ok(result.errors.some((error) => error.includes("recovered-research")));
  assert.ok(result.errors.some((error) => error.includes("content/text/2026")));
  assert.ok(result.errors.some((error) => error.includes("service child must end with -services-section")));
});

test("delegates package, term frontmatter, note, and bibliography contracts", async () => {
  const result = await audit({
    "package.json": JSON.stringify({ name: "@561-group/missing-description" }),
    "content/text/glossary/terms/bad.md": "---\nthis is not YAML\n---\n# Bad\n",
    "content/text/documents/articles/notes/2026/bad.md": "# Bad\n",
    "bibliography.bib": "@article{broken, title = {Broken}\n",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("package.json requires description")));
  assert.ok(result.errors.some((error) => error.includes("glossary terms: invalid term bad.md: yaml:")));
  assert.ok(result.errors.some((error) => error.includes("notes: note has invalid layout")));
  assert.ok(result.errors.some((error) => error.includes("invalid bibliography.bib")));
});
