#!/usr/bin/env node
import { keywordNotes, noteFiles } from "../src/note-sorting.mjs";
const at = process.argv.indexOf("--limit"), limit = at >= 0 ? Number(process.argv[at + 1]) : 18;
const inputs = process.argv.slice(2).filter((value, index, values) => value !== "--limit" && values[index - 1] !== "--limit");
if (!inputs.length || !Number.isSafeInteger(limit) || limit < 1) { process.stderr.write("usage: note-keywords [--limit N] FILE_OR_DIRECTORY...\n"); process.exit(2); }
for (const note of await keywordNotes(await noteFiles(inputs), limit)) process.stdout.write(`${JSON.stringify(note)}\n`);
