#!/usr/bin/env node
import { readBibliography } from "../src/bibliography-operations.mjs";

export { readBibliography } from "../src/bibliography-operations.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(await readBibliography(process.argv[2]), null, 2)}\n`);
}
