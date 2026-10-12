import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { readBibliography, writeBibliography } from "../src/bibliography-operations.mjs";

let directory;
before(() => { directory = mkdtempSync(join(tmpdir(), "bibliography-engineering-test-")); });
after(() => { rmSync(directory, { recursive: true, force: true }); });

const BIBLIOGRAPHY = Object.freeze({
  type: "bibliography",
  key: "euler1736",
  "reference-type": "article",
  authors: Object.freeze(["Euler, Leonhard"]),
  year: 1736,
  title: "Solutio problematis ad geometriam situs pertinentis",
  body: "# Euler 1736\n\nThe founding paper of graph theory.\n",
});

test("writeBibliography writes an admissible carrier and readBibliography recognizes it", async () => {
  const written = await writeBibliography({ bibliographyDirectory: directory, bibliography: BIBLIOGRAPHY });
  assert.equal(written.disposition, "written");
  assert.equal(written.filename, "euler1736.md");
  assert.equal(written.admitted.admitted, true);

  const read = await readBibliography(join(directory, "euler1736.md"));
  assert.equal(read.recognized.admitted, true);
  assert.equal(read.recognized.key, "euler1736");
});

test("writeBibliography refuses to overwrite without an explicit flag", async () => {
  await assert.rejects(writeBibliography({ bibliographyDirectory: directory, bibliography: BIBLIOGRAPHY }), /already exists/u);
});

test("writeBibliography overwrites when overwrite is explicit", async () => {
  const written = await writeBibliography({
    bibliographyDirectory: directory,
    bibliography: { ...BIBLIOGRAPHY, title: "Solutio problematis ad geometriam situs pertinentis (revised)" },
    overwrite: true,
  });
  assert.equal(written.disposition, "written");
  const read = await readBibliography(join(directory, "euler1736.md"));
  assert.match(read.text, /revised/u);
});

test("writeBibliography refuses a malformed record before touching disk", async () => {
  await assert.rejects(writeBibliography({ bibliographyDirectory: directory, bibliography: { ...BIBLIOGRAPHY, key: "not-a-real-key" } }));
});
