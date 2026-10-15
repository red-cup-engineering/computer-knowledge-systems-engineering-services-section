#!/usr/bin/env node
import { parseCitations } from "../src/citation-text.mjs";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-operation-engineering-services-section/operation";

export { parseCitation, parseCitationFragment, passesConfidence } from "../src/citation-text.mjs";

/**
 * Parse a blob of free-text citation lines into a keyed depth-1
 * `references:` map, defaulting to `minConfidence: "low"` so best-effort
 * parses surface for human review via the returned findings rather than
 * being silently dropped (the CLI/operational default; callers wanting
 * only unambiguous parses pass `minConfidence: "high"`).
 *
 * @param {string} text - free-text citation lines, one citation per line or "- " item.
 * @param {{now?: Date, minConfidence?: string, taken?: Set<string>}} [options]
 * @returns {{references: object, items: object, confidence: object, findings: Array<object>}} frozen, see `parseCitations`.
 */
export function parseSetOfCitations(text, options = {}) {
  return parseCitations(text, { minConfidence: "low", ...options });
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "parse-set-of-citations", description: "Parse a blob of free-text citation lines into a keyed depth-1 `references:` map, defaulting to `minConfidence: \"low\"` so best-effort parses surface for human review via the returned findings rather than being silently dropped (the CLI/operational default; callers wanting only unambiguous parses pass `minConfidence: \"high\"`).", operation: parseSetOfCitations }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
