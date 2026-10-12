#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { writeBibliography } from "../src/bibliography-operations.mjs";

export { writeBibliography } from "../src/bibliography-operations.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(await writeBibliography(JSON.parse(readFileSync(0, "utf8"))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
