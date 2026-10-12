#!/usr/bin/env node
// CAIRN's MCP face over stdio: the vault tools and search/fetch over one archive, opened lazily
// over CAIRN_MCP_ROOT (default: the current working directory) and read on first need.
//
// Usage: CAIRN_MCP_ROOT=/path/to/vault node apps/mcp-stdio.mjs
import { join, resolve } from "node:path";
import { createMcpServer } from "@red-cup-engineering/mcp-engineering-services-section/server";
import { gardenPrompts, noteResourceTemplates, searchAndFetchTools, vaultMcpTools } from "../src/mcp-tools.mjs";
import { openArchive } from "../src/archive.mjs";
import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

let archivePromise;
const root = resolve(process.env.CAIRN_MCP_ROOT ?? process.cwd());
// Observations are kept between sessions beside the working directory's other replaceable state.
const observations = process.env.CAIRN_OBSERVATIONS ?? join(process.cwd(), ".cache", "cairn", `${sha256Hex(root).slice(0, 16)}.jsonl`);
const archive = () => (archivePromise ??= openArchive({ root, observations }));

const server = createMcpServer({ name: "knowledge-system-server", version: "0.1.0", tools: [...searchAndFetchTools(), ...vaultMcpTools], resourceTemplates: noteResourceTemplates(), prompts: gardenPrompts() });
server.serveStdio({ context: { archive } });
process.stderr.write("[knowledge-system-server] MCP stdio ready\n");
