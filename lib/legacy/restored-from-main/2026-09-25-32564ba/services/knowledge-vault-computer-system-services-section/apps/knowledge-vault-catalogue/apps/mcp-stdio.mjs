#!/usr/bin/env node
// CAIRN's MCP face: the vault surface (`vaultMcpTools`) over one archive, opened lazily over
// CAIRN_MCP_ROOT (default: the current working directory) and read on first need. Protocol
// plumbing (JSON-RPC framing, stdio transport) is the house's one MCP server face.
//
// Usage: CAIRN_MCP_ROOT=/path/to/vault node apps/mcp-stdio.mjs
import { resolve } from "node:path";
import { createMcpServer } from "@red-cup-engineering/mcp-engineering-services-section/mcp-json-rpc";
import { callVaultMcpTool, vaultMcpTools } from "../src/vault-mcp.mjs";
import { openArchive } from "../src/archive.mjs";

const VERSION = "0.1.0";
let archivePromise;
const root = resolve(process.env.CAIRN_MCP_ROOT ?? process.cwd());
const archive = () => (archivePromise ??= openArchive({ root }));

const tools = vaultMcpTools.map((tool) => ({ ...tool, handler: async (args) => callVaultMcpTool(await archive(), tool.name, args) }));

const server = createMcpServer({ name: "knowledge-vault-catalogue", version: VERSION, tools });
await server.serveStdio();
process.stderr.write("[knowledge-vault-catalogue] MCP stdio ready\n");
