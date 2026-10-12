#!/usr/bin/env node
/**
 * organize-knowledge-vault  -  CLI dispatcher for knowledge-vault actions.
 */
import { fileURLToPath } from "node:url";
import { induceBins } from "@emsenn/relating";

async function readStdin(): Promise<string> {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main(): Promise<number> {
  const { actions } = await import(new URL("../actions.mjs", import.meta.url).href);
  const { dispatch } = induceBins(actions, { packageName: "@emsenn/organizing-a-knowledge-vault" });
  const stdin = await readStdin();
  const dataRoot = process.env["ORGANIZING_KNOWLEDGE_VAULT_DATA"];
  const result = dispatch(process.argv.slice(2), stdin, {
    program: "organize-knowledge-vault",
    caller: { transport: "cli" },
    ...(dataRoot === undefined ? {} : { dataRoot }),
  });
  if (result.stdout !== "") process.stdout.write(result.stdout);
  if (result.stderr !== "") process.stderr.write(result.stderr);
  return result.code;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`organize-knowledge-vault: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
