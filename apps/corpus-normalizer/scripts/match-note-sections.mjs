#!/usr/bin/env node
import { keywordNotes, noteFiles, serviceSections, sortingTable } from "../src/note-sorting.mjs";
const args = process.argv.slice(2), roots = [];
for (let index = 0; index < args.length; index += 1) if (args[index] === "--services-root") roots.push(args[++index]);
const inputs = args.filter((value, index, values) => value !== "--services-root" && values[index - 1] !== "--services-root");
if (!inputs.length || !roots.length) { process.stderr.write("usage: match-note-sections FILE_OR_DIRECTORY... --services-root ROOT [--services-root ROOT...]\n"); process.exit(2); }
process.stdout.write(sortingTable(await keywordNotes(await noteFiles(inputs), 18), await serviceSections(roots)));
