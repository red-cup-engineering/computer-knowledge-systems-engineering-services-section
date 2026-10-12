#!/usr/bin/env node
/**
 * organize-knowledge-vault-serve  -  HTTP/OpenAPI/MCP/web projection.
 */
import { fileURLToPath } from "node:url";
import { induceBins, serve } from "@emsenn/relating";

function pathArg(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--path") return argv[i + 1];
    const eq = arg.match(/^(?:--path|path)=(.*)$/);
    if (eq) return eq[1];
  }
  return undefined;
}

async function main(): Promise<void> {
  const { actions, legs } = await import(new URL("../actions.mjs", import.meta.url).href);
  const { resolveKnowledgeVaultRoot } = await import(new URL("../corpus/index.mjs", import.meta.url).href) as {
    resolveKnowledgeVaultRoot: (explicit?: string) => string;
  };
  const corpus = resolveKnowledgeVaultRoot(pathArg(process.argv.slice(2)));
  process.env["ORGANIZING_KNOWLEDGE_VAULT_PATH"] = corpus;
  const port = Number(process.env["PORT"] ?? 8789);
  const dataRoot = process.env["ORGANIZING_KNOWLEDGE_VAULT_DATA"];
  const induced = induceBins(legs, { packageName: "@emsenn/organizing-a-knowledge-vault" });
  const server = serve(actions, {
    induced,
    title: "@emsenn/organizing-a-knowledge-vault",
    ...(dataRoot === undefined ? {} : { dataRoot }),
    caller: { transport: "http" },
  });
  server.listen(port, () => {
    process.stdout.write(`organize-knowledge-vault-serve: ${induced.actions.length} operations over corpus ${JSON.stringify(corpus)} on http://localhost:${port}/\n`);
  });
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    process.stderr.write(`organize-knowledge-vault-serve: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
