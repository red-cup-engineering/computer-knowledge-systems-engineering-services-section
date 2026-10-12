#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { moveSortingTable } from "../src/note-sorting.mjs";
if (process.argv.length !== 3) { process.stderr.write("usage: move-sorted-notes SORTING.tsv\n"); process.exit(2); }
process.stdout.write(`moved ${await moveSortingTable(await readFile(process.argv[2], "utf8"))} notes\n`);
