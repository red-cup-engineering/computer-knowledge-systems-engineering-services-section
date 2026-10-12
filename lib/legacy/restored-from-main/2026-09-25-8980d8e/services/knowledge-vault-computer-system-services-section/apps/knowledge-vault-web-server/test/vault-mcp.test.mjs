import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createGeodeWorkspace } from "../src/workspace.mjs";
import { callVaultMcpTool, vaultMcpTools } from "../src/vault-mcp.mjs";

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
  const workspace = await createGeodeWorkspace({ root });
  const { structuredContent } = await callVaultMcpTool(workspace, "vault_relations", { predicate: "keywords", object: "operation" });
  assert.deepEqual(structuredContent.relations.map((row) => row.subject).sort(), [dualNote, otherNote]);
});

test("vault_query runs SPARQL over the tellings as EAVT rows", async () => {
  const workspace = await createGeodeWorkspace({ root });
  const ask = (where) => callVaultMcpTool(workspace, "vault_query", { query: { kind: "knowing.sparql.query", type: "ask", where } });
  assert.equal((await ask([{ s: proofPathNote, p: "keywords", o: "model" }])).structuredContent.ask, true);
  assert.equal((await ask([{ s: otherNote, p: "keywords", o: "model" }])).structuredContent.ask, false);
});

test("vault_search reads document bodies and ranks the documents holding every word", async () => {
  const workspace = await createGeodeWorkspace({ root });
  const { structuredContent } = await callVaultMcpTool(workspace, "vault_search", { query: "purpose-bounded representation" });
  assert.equal(structuredContent.results[0].path, modelPath);
  assert.match(structuredContent.results[0].snippet, /purpose-bounded/u);
});

test("vault_names finds documents by a folded name, and by prefix", async () => {
  const workspace = await createGeodeWorkspace({ root });
  assert.deepEqual((await callVaultMcpTool(workspace, "vault_names", { name: "MODEL" })).structuredContent.results.map((row) => row.path), [modelPath]);
  assert.ok((await callVaultMcpTool(workspace, "vault_names", { name: "oper", prefix: true })).structuredContent.results.some((row) => row.path === operationPath));
});

test("values naming a document are passages to it; names nothing answers to are questions", async () => {
  const workspace = await createGeodeWorkspace({ root });
  const passages = await workspace.passages();
  assert.ok(passages.some((passage) => passage.sourcePath === proofPathNote && passage.targetPath === modelPath && passage.predicate === "keywords"));
  const { structuredContent } = await callVaultMcpTool(workspace, "vault_questions", {});
  assert.ok(structuredContent.some((question) => question.term === "proof-path" && question.documents.includes(proofPathNote)));
});

test("vault_edit and vault_merge write the archive, carrying names and links along", async (t) => {
  const copy = await mkdtemp(join(tmpdir(), "geode-mcp-"));
  t.after(() => rm(copy, { recursive: true, force: true }));
  await cp(root, copy, { recursive: true });
  const workspace = await createGeodeWorkspace({ root: copy });
  const edited = await callVaultMcpTool(workspace, "vault_edit", { path: otherNote, edits: [{ find: "something else entirely", replace: "operations after all" }] });
  assert.equal(edited.structuredContent.changed, true);
  assert.equal((await callVaultMcpTool(workspace, "vault_search", { query: "operations after all" })).structuredContent.results[0].path, otherNote);
  const merged = await callVaultMcpTool(workspace, "vault_merge", { into: dualNote, from: [otherNote] });
  assert.deepEqual(merged.structuredContent.removed, [otherNote]);
  assert.ok(merged.structuredContent.aliases.includes("Unrelated Notes"));
  assert.equal(workspace.paths.includes(otherNote), false);
});

test("vault_read returns one document's frontmatter, body, and rendered html", async () => {
  const workspace = await createGeodeWorkspace({ root });
  const { structuredContent } = await callVaultMcpTool(workspace, "vault_read", { path: modelPath });
  assert.equal(structuredContent.path, modelPath);
  assert.match(structuredContent.body, /purpose-bounded/u);
  assert.match(structuredContent.html, /<[a-z]/u);
});

test("vault_browse lists admitted paths beneath a prefix without parsing bodies", async () => {
  const workspace = await createGeodeWorkspace({ root });
  const { structuredContent } = await callVaultMcpTool(workspace, "vault_browse", { prefix: "notes" });
  assert.equal(structuredContent.kind, "vault.browse");
  assert.deepEqual(structuredContent.items.map((item) => item.path).sort(), [dualNote, otherNote, proofPathNote]);
});

test("callVaultMcpTool refuses an unknown tool name", async () => {
  const workspace = await createGeodeWorkspace({ root });
  await assert.rejects(() => callVaultMcpTool(workspace, "vault_delete", {}), /unknown vault MCP tool/u);
});

test("callVaultMcpTool no longer knows drew_* or pam_* tool names -- that catalogue is off the face entirely", async () => {
  const workspace = await createGeodeWorkspace({ root });
  await assert.rejects(() => callVaultMcpTool(workspace, "drew_relations", {}), /unknown vault MCP tool/u);
  await assert.rejects(() => callVaultMcpTool(workspace, "pam_query", {}), /unknown vault MCP tool/u);
});
