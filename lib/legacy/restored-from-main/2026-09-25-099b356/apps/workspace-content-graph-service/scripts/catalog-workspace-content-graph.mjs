#!/usr/bin/env node
import { catalogWorkspaceContentGraph } from "../src/workspace-content-graph.mjs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const source = Buffer.concat(chunks).toString("utf8");
if (Buffer.byteLength(source, "utf8") > 16_777_216) throw new TypeError("observed workspace carrier exceeds 16777216 UTF-8 bytes");
const input = JSON.parse(source);
process.stdout.write(`${JSON.stringify(catalogWorkspaceContentGraph(input))}\n`);
