#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { renderBibliographyMarkdown } from "../src/bibliography-carrier.mjs";

export { renderBibliographyMarkdown } from "../src/bibliography-carrier.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  process.stdout.write(renderBibliographyMarkdown(input));
}
