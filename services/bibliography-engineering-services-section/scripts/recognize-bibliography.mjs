#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { recognizeBibliographyMarkdown } from "../src/bibliography-carrier.mjs";

export { recognizeBibliographyMarkdown } from "../src/bibliography-carrier.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  process.stdout.write(`${JSON.stringify(recognizeBibliographyMarkdown(input), null, 2)}\n`);
}
