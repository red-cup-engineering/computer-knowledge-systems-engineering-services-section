#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { readdirSync } from "node:fs";
import { openMarkdownVault, projectCairnSnapshot } from "../src/markdown-vault.mjs";
import { revisionIndexOperations } from "../src/search/revision-index.mjs";

function usage(message) {
  if (message) process.stderr.write(`CAIRN: ${message}\n\n`);
  process.stderr.write(`Usage:
  cairn summary --root PATH [--region PATH]
  cairn list --root PATH [--region PATH] [--limit N]
  cairn search --root PATH --query TEXT [--limit N] [--mode metadata|text]
  cairn read --root PATH --path VAULT_PATH
  cairn replace --root PATH --path VAULT_PATH --expected-revision SHA256 (--file PATH | --stdin)
  cairn archive search WORDS... [--limit N]
  cairn archive read BLOB_ID
  cairn archive summary
  cairn archive ingest-git REPOSITORY [--source NAME]
  cairn archive ingest-mirrors DIRECTORY
  cairn archive ingest-transcripts ROOT --harness codex|claude [--source NAME]

The archive commands read and grow the revision index: every revision of every
document any source has held, deleted ones included. They run the same
archive-* operations the MetroPlat catalog serves.

CAIRN is Content Archive Inspection, Revision, and Navigation.
The current admitted content-vault adapter is Markdown; other adapters must
provide the same snapshot, read, search, and revision-safe replace boundary.
`);
  process.exitCode = message ? 2 : 0;
}

function parse(argv) {
  const [command, ...rest] = argv;
  const options = {
    root: argument("--root", rest),
    region: argument("--region", rest),
    limit: argument("--limit", rest),
    query: argument("--query", rest),
    mode: argument("--mode", rest),
    path: argument("--path", rest),
    "expected-revision": argument("--expected-revision", rest),
    file: argument("--file", rest),
    stdin: rest.includes("--stdin"),
  };
  return { command, options };
}

function positiveLimit(value, fallback) {
  if (value === undefined) return fallback;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("--limit must be a positive integer");
  return limit;
}


/** The archive commands: each is one archive-* operation, or a sequence of them. */
async function archive([sub, ...rest]) {
  const verbs = new Map(revisionIndexOperations().map((operation) => [operation.verb, operation]));
  const run = (verb, input) => verbs.get(verb).execute(input);
  const words = rest.filter((word, index) => !word.startsWith("--") && !rest[index - 1]?.startsWith("--"));
  const source = argument("--source", rest);
  switch (sub) {
    case "search": {
      const hits = await run("archive-search", { query: words.join(" "), limit: positiveLimit(argument("--limit", rest), 20) });
      return hits.map((hit) => ({ id: hit.id, title: hit.title, revisions: hit.revisions, snippet: hit.snippet,
        where: hit.occurrences.slice(0, 4).map((o) => `${o.source}:${o.path} ${o.first?.slice(0, 10)}..${o.last?.slice(0, 10)}${o.deleted ? " (deleted)" : ""}`) }));
    }
    case "read": return run("archive-read", { id: words[0] });
    case "summary": return run("archive-summary", {});
    case "ingest-git": return run("archive-ingest-git", { repository: resolve(words[0]), ...(source ? { source } : {}) });
    case "ingest-transcripts": return run("archive-ingest-transcripts", { root: resolve(words[0]), harness: argument("--harness", rest), ...(source ? { source } : {}) });
    case "ingest-mirrors": {
      const root = resolve(words[0]), results = [];
      for (const owner of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
        for (const repository of readdirSync(resolve(root, owner.name)).filter((name) => name.endsWith(".git"))) {
          const result = await run("archive-ingest-git", { repository: resolve(root, owner.name, repository), source: `github:${owner.name}/${repository.slice(0, -4)}` });
          process.stderr.write(`${JSON.stringify(result)}\n`);
          results.push(result);
        }
      }
      return results;
    }
    default: throw new TypeError(`unknown archive command: ${sub}`);
  }
}

async function main() {
  const { command, options } = parse(process.argv.slice(2));
  if (!command || command === "help" || command === "--help") return usage();
  if (command === "archive") {
    process.stdout.write(`${JSON.stringify(await archive(process.argv.slice(3)), null, 2)}\n`);
    return;
  }
  if (!options.root) throw new TypeError("--root is required");
  const vault = await openMarkdownVault({
    root: resolve(options.root),
    region: options.region ?? "",
  });
  let result;
  switch (command) {
    case "summary":
      result = projectCairnSnapshot(vault.snapshot);
      break;
    case "list":
      result = await vault.search("", { limit: positiveLimit(options.limit, 100) });
      break;
    case "search":
      if (!options.query) throw new TypeError("--query is required");
      result = await vault.search(options.query, { limit: positiveLimit(options.limit, 100), mode: options.mode ?? "metadata" });
      break;
    case "read":
      if (!options.path) throw new TypeError("--path is required");
      result = await vault.read(options.path);
      break;
    case "replace": {
      if (!options.path) throw new TypeError("--path is required");
      if (!options["expected-revision"]) throw new TypeError("--expected-revision is required");
      if (Boolean(options.file) === Boolean(options.stdin)) {
        throw new TypeError("replace requires exactly one of --file or --stdin");
      }
      const markdown = options.file ? await readFile(resolve(options.file), "utf8") : await (async () => { process.stdin.setEncoding("utf8"); let text = ""; for await (const chunk of process.stdin) text += chunk; return text; })();
      result = await vault.replace({
        path: options.path,
        markdown,
        expectedRevision: options["expected-revision"],
      });
      break;
    }
    default:
      throw new TypeError(`unknown command: ${command}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.name}: ${error.message}\n`);
  process.exitCode = 1;
});
