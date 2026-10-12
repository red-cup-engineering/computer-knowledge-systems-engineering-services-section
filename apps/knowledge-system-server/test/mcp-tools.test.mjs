import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openArchive } from "../src/archive.mjs";
import { callVaultMcpTool, vaultMcpTools } from "../src/mcp-tools.mjs";

const root = fileURLToPath(new URL("fixtures/term-graph-vault/", import.meta.url));
const modelPath = "content/text/glossary/terms/model.md";
const operationPath = "content/text/glossary/terms/operation.md";
const proofPathNote = "notes/proof-path-note.md";
const dualNote = "notes/dual-note.md";
const otherNote = "notes/other-note.md";

test("vaultMcpTools names the archive read, tellings, and write surface; reads are read-only and writes are not", () => {
  const names = vaultMcpTools.map((tool) => tool.name);
  for (const name of ["vault_search", "vault_names", "vault_read", "vault_browse", "vault_relations", "vault_query", "vault_cells", "vault_statements", "vault_questions", "vault_readings", "vault_write", "vault_edit", "vault_move", "vault_merge"]) assert.ok(names.includes(name), name);
  assert.equal(names.includes("vault_term"), false);
  for (const tool of vaultMcpTools) assert.equal(tool.annotations.readOnlyHint, !["vault_write", "vault_edit", "vault_properties", "vault_move", "vault_merge"].includes(tool.name), tool.name);
});

test("vault_relations reads the documents' tellings by subject, predicate, and object pattern", async () => {
  const archive = await openArchive({ root });
  const { structuredContent } = await callVaultMcpTool(archive, "vault_relations", { predicate: "keywords", object: "operation" });
  assert.deepEqual(structuredContent.relations.map((row) => row.subject).sort(), [dualNote, otherNote]);
});

test("vault_query runs SPARQL over the tellings as EAVT rows", async () => {
  const archive = await openArchive({ root });
  const ask = (where) => callVaultMcpTool(archive, "vault_query", { query: { kind: "knowing.sparql.query", type: "ask", where } });
  assert.equal((await ask([{ s: proofPathNote, p: "keywords", o: "model" }])).structuredContent.ask, true);
  assert.equal((await ask([{ s: otherNote, p: "keywords", o: "model" }])).structuredContent.ask, false);
});

test("vault_search reads document bodies and ranks the documents holding every word", async () => {
  const archive = await openArchive({ root });
  const { structuredContent } = await callVaultMcpTool(archive, "vault_search", { query: "purpose-bounded representation" });
  assert.equal(structuredContent.results[0].path, modelPath);
  assert.match(structuredContent.results[0].snippet, /purpose-bounded/u);
});

test("vault_names finds documents by a folded name, and by prefix", async () => {
  const archive = await openArchive({ root });
  assert.deepEqual((await callVaultMcpTool(archive, "vault_names", { name: "MODEL" })).structuredContent.results.map((row) => row.path), [modelPath]);
  assert.ok((await callVaultMcpTool(archive, "vault_names", { name: "oper", prefix: true })).structuredContent.results.some((row) => row.path === operationPath));
});

test("values naming a document are passages to it; names nothing answers to are questions", async () => {
  const archive = await openArchive({ root });
  const passages = await archive.passages();
  assert.ok(passages.some((passage) => passage.sourcePath === proofPathNote && passage.targetPath === modelPath && passage.predicate === "keywords"));
  const { structuredContent } = await callVaultMcpTool(archive, "vault_questions", {});
  assert.ok(structuredContent.some((question) => question.term === "proof-path" && question.documents.includes(proofPathNote)));
});

test("vault_edit and vault_merge write the archive, carrying names and links along", async (t) => {
  const copy = await mkdtemp(join(tmpdir(), "geode-mcp-"));
  t.after(() => rm(copy, { recursive: true, force: true }));
  await cp(root, copy, { recursive: true });
  const archive = await openArchive({ root: copy });
  const edited = await callVaultMcpTool(archive, "vault_edit", { path: otherNote, edits: [{ find: "something else entirely", replace: "operations after all" }] });
  assert.equal(edited.structuredContent.changed, true);
  assert.equal((await callVaultMcpTool(archive, "vault_search", { query: "operations after all" })).structuredContent.results[0].path, otherNote);
  const merged = await callVaultMcpTool(archive, "vault_merge", { into: dualNote, from: [otherNote] });
  assert.deepEqual(merged.structuredContent.removed, [otherNote]);
  assert.ok(merged.structuredContent.aliases.includes("Unrelated Notes"));
  assert.equal(archive.paths.includes(otherNote), false);
});

test("vault_topic gathers a topic's homes, pointers, neighbourhood and gaps", async () => {
  const archive = await openArchive({ root });
  const model = (await callVaultMcpTool(archive, "vault_topic", { name: "model" })).structuredContent;
  assert.deepEqual(model.homes.map((home) => home.path), [modelPath]);
  assert.ok(model.pointing.some((row) => row.path === dualNote && row.through.includes("keywords")));
  assert.equal(model.suggestedHome, null);
  const proofPath = (await callVaultMcpTool(archive, "vault_topic", { name: "proof-path" })).structuredContent;
  assert.deepEqual(proofPath.gaps.map((gap) => gap.gap).sort(), ["asked", "no-home"]);
  assert.match(proofPath.suggestedHome, /content\/text\/glossary\/terms\/proof-path\.md$/u);
});

test("vault_read returns one document's frontmatter and body", async () => {
  const archive = await openArchive({ root });
  const { structuredContent } = await callVaultMcpTool(archive, "vault_read", { path: modelPath });
  assert.equal(structuredContent.path, modelPath);
  assert.match(structuredContent.body, /purpose-bounded/u);
});

test("vault_browse lists admitted paths beneath a prefix without parsing bodies", async () => {
  const archive = await openArchive({ root });
  const { structuredContent } = await callVaultMcpTool(archive, "vault_browse", { prefix: "notes" });
  assert.equal(structuredContent.kind, "vault.browse");
  assert.deepEqual(structuredContent.items.map((item) => item.path).sort(), [dualNote, otherNote, proofPathNote]);
});

test("callVaultMcpTool refuses an unknown tool name", async () => {
  const archive = await openArchive({ root });
  await assert.rejects(() => callVaultMcpTool(archive, "vault_delete", {}), /unknown vault MCP tool/u);
});

test("callVaultMcpTool no longer knows drew_* or pam_* tool names -- that catalogue is off the face entirely", async () => {
  const archive = await openArchive({ root });
  await assert.rejects(() => callVaultMcpTool(archive, "drew_relations", {}), /unknown vault MCP tool/u);
  await assert.rejects(() => callVaultMcpTool(archive, "pam_query", {}), /unknown vault MCP tool/u);
});

test("search and fetch answer a general assistant: ranked documents by id, then one document's text", async () => {
  const { createMcpServer } = await import("@red-cup-engineering/mcp-engineering-services-section/server");
  const { searchAndFetchTools } = await import("../src/mcp-tools.mjs");
  const archive = await openArchive({ root });
  const server = createMcpServer({ name: "garden", version: "1", tools: [...searchAndFetchTools({ documentUrl: (path) => `https://garden.test/${path}` }), ...vaultMcpTools] });
  const call = (name, args, context = { archive }) => server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, context);
  const found = (await call("search", { query: "representation" })).result.structuredContent.results;
  assert.ok(found.length > 0);
  assert.ok(found.every((hit) => typeof hit.id === "string" && hit.url === `https://garden.test/${hit.id}`));
  const fetched = (await call("fetch", { id: modelPath })).result.structuredContent;
  assert.equal(fetched.id, modelPath);
  assert.match(fetched.text, /\S/u);
  const listed = async (context) => (await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, context)).result.tools.map((tool) => tool.name);
  assert.equal((await listed({ archive, canWrite: false })).includes("vault_write"), false);
  assert.equal((await listed({ archive })).includes("vault_write"), true);
});

test("notes are resources by template, and the garden's prompts compose", async () => {
  const { createMcpServer } = await import("@red-cup-engineering/mcp-engineering-services-section/server");
  const { gardenPrompts, noteResourceTemplates } = await import("../src/mcp-tools.mjs");
  const archive = await openArchive({ root });
  const server = createMcpServer({ name: "garden", version: "1", resourceTemplates: noteResourceTemplates({ scheme: "garden", documentUrl: (path) => `https://garden.test/${path}` }), prompts: gardenPrompts() });
  const call = (method, params) => server.handleMessage({ jsonrpc: "2.0", id: 1, method, params }, { archive });
  assert.equal((await call("resources/templates/list", {})).result.resourceTemplates[0].uriTemplate, "garden://notes/{path}");
  const read = (await call("resources/read", { uri: `garden://notes/${encodeURIComponent(modelPath)}` })).result.contents[0];
  assert.equal(read.mimeType, "text/markdown");
  assert.match(read.text, /\S/u);
  assert.equal(read._meta.url, `https://garden.test/${modelPath}`);
  assert.deepEqual((await call("prompts/list", {})).result.prompts.map((prompt) => prompt.name), ["explain-note", "find-gaps", "connect-notes"]);
  assert.match((await call("prompts/get", { name: "explain-note", arguments: { path: modelPath } })).result.messages[0].content.text, new RegExp(modelPath.replaceAll(".", "\\."), "u"));
});
