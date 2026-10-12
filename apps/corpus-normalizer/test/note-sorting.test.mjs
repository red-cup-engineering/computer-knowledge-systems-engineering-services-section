import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { keywordNotes, matchSections, moveSortingTable, noteFiles, serviceSections, sortingTable } from "../src/note-sorting.mjs";

test("compresses notes, matches live sections, and moves a chosen row", async () => {
  const root = await mkdtemp("/tmp/note-sorting-");
  const inbox = path.join(root, "inbox"), services = path.join(root, "services"), owner = path.join(services, "hive-services-section");
  await import("node:fs/promises").then(({ mkdir }) => Promise.all([mkdir(inbox), mkdir(owner, { recursive: true })]));
  const source = path.join(inbox, "2026-08-20-hive-consensus.md");
  await writeFile(source, "# Hive consensus\n\nHive witnesses settle blockchain consensus.\n");
  await writeFile(path.join(owner, "package.json"), JSON.stringify({ description: "Hive blockchain engineering" }));
  const notes = await keywordNotes(await noteFiles([inbox]), 8), sections = await serviceSections([services]);
  assert.equal(notes.length, 1);
  assert.equal(matchSections(notes[0], sections)[0].path, owner);
  const table = sortingTable(notes, sections).replace(/\t\n$/u, `\t${owner}\n`);
  assert.equal(await moveSortingTable(table), 1);
  assert.match(await readFile(path.join(owner, "content/text/documents/articles/notes/2026/08/20/2026-08-20-hive-consensus.md"), "utf8"), /Hive witnesses/u);
});
