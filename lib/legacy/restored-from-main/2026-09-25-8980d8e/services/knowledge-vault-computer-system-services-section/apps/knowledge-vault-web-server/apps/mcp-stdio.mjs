#!/usr/bin/env node
// GEODE's MCP face: the vault surface (`vaultMcpTools`) over one GEODE workspace, opened lazily
// over GEODE_MCP_ROOT (default: the current working directory). The archive is read on first
// need; protocol plumbing (JSON-RPC framing, stdio transport) is the house's one MCP server face.
//
// Usage: GEODE_MCP_ROOT=/path/to/vault node apps/mcp-stdio.mjs
import { resolve } from "node:path";
import { createMcpServer } from "@red-cup-engineering/mcp-engineering-services-section/mcp-json-rpc";
// Imported directly from their owning modules, not the `../src/index.mjs` barrel: this stdio
// face needs none of the workspace/vocabulary/server surface the barrel also
// statically pulls in, so importing it directly keeps this process's dependency graph to what
// it actually mounts.
import { callVaultMcpTool, vaultMcpTools } from "../src/vault-mcp.mjs";
import { createGeodeWorkspace } from "../src/workspace.mjs";

const VERSION = "0.1.0";
let workspacePromise;
const root = resolve(process.env.GEODE_MCP_ROOT ?? process.cwd());
const workspace = () => (workspacePromise ??= createGeodeWorkspace({ root }));

const tools = vaultMcpTools.map((tool) => ({ ...tool, handler: async (args) => callVaultMcpTool(await workspace(), tool.name, args) }));

const server = createMcpServer({ name: "knowledge-vault-web-server", version: VERSION, tools });
await server.serveStdio();
process.stderr.write("[knowledge-vault-web-server] MCP stdio ready\n");
