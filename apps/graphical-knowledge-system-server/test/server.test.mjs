import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createGeodeWorkspace } from "../src/workspace.mjs";
import { createGeodeFetchHandler } from "../src/server.mjs";
import { createGeodeWebsite } from "../src/website.mjs";

const root = fileURLToPath(new URL("fixtures/vault/", import.meta.url));

async function request(handler, url, method = "GET", body) {
  const response = await handler(new Request(`https://geode.example${url}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  }));
  const responseBody = await response.text();
  return Object.freeze({
    status: response.status,
    headers: Object.freeze(Object.fromEntries(response.headers)),
    body: responseBody,
    get json() { return JSON.parse(responseBody); },
  });
}

async function withHandler(run) {
  const workspace = await createGeodeWorkspace({ root });
  await run(createGeodeFetchHandler({ workspace }));
}

test("serves the web interface and confined workspace API", async () => {
  await withHandler(async (handler) => {
    const page = await request(handler, "/");
    assert.equal(page.status, 200);
    assert.match(page.body, /<h1>GEODE<\/h1>/u);

    const workspaceResponse = await request(handler, "/api/workspace");
    assert.equal(workspaceResponse.status, 200);
    assert.equal(workspaceResponse.headers["x-content-type-options"], "nosniff");
    const workspace = workspaceResponse.json;
    assert.equal(workspace.available, 3);
    assert.equal(workspace.documents.length, 0, "opening the API does not read bodies");
    assert.equal(workspace.complete, false);
    const browse = await request(handler, "/api/browse");
    assert.equal(browse.status, 200);
    assert.ok(browse.json.items.some(({ path }) => path === "home.md"));
    assert.equal("root" in workspace, false);

    const noteResponse = await request(handler, "/api/note?path=home.md");
    assert.equal(noteResponse.status, 200);
    assert.equal(noteResponse.json.title, "Home");
    assert.match(noteResponse.json.revision, /^sha256:[a-f0-9]{64}$/u);
    assert.match(noteResponse.json.editor.html, /data-tufte-action="geode.note.replace"/u);

    const tufte = await request(handler, "/tufte-browser.mjs");
    assert.equal(tufte.status, 200);
    assert.equal(tufte.headers["content-type"], "text/javascript; charset=utf-8");
    assert.match(tufte.body, /connectTufteDocument/u);

    const escapeResponse = await request(handler, `/api/note?path=${encodeURIComponent("../secret.md")}`);
    assert.equal(escapeResponse.status, 404);
  });
});

async function withWebsite(run) {
  const workspace = await createGeodeWorkspace({ root });
  const website = await createGeodeWebsite({ workspace, victor: {
    site: { name: "Geode", baseIri: "https://geode.example/" },
    runtime: { observability: false, probes: false },
  } });
  try {
    const { port } = await website.start({ host: "127.0.0.1", port: 0 });
    await run(`http://127.0.0.1:${port}`, website);
  } finally { await website.close(0); }
}

test("serves as a downstream VICTOR website application", async () => {
  await withWebsite(async (base, website) => {
    const response = await fetch(`${base}/api/workspace`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).type, "CairnVaultSnapshot");
    const atlas = await fetch(`${base}/atlas/`);
    assert.equal(atlas.status, 200);
    assert.match(await atlas.text(), /data-tufte/u);
    await website.rebuild();
  });
});

test("admits a TUFTE Markdown action and refuses a stale revision without overwriting", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "geode-server-write-"));
  await cp(root, temporary, { recursive: true });
  try {
    const workspace = await createGeodeWorkspace({ root: temporary });
    const handler = createGeodeFetchHandler({ workspace });
    const opened = (await request(handler, "/api/note?path=home.md")).json;
    const envelope = {
      action: "geode.note.replace",
      form: "note-editor-form",
      submitter: "save-note",
      revision: opened.revision,
      value: { path: opened.path, markdown: `${opened.markdown}\nAction edit.\n` },
    };
    const saved = await request(handler, "/api/action", "POST", envelope);
    assert.equal(saved.status, 200);
    assert.equal(saved.json.type, "GeodeActionReceipt");
    assert.equal(saved.json.status, "committed");
    assert.notEqual(saved.json.revision, opened.revision);
    assert.match(saved.json.note.editor.html, new RegExp(saved.json.revision, "u"));
    assert.equal("root" in saved.json.workspace, false);

    const refused = await request(handler, "/api/action", "POST", envelope);
    assert.equal(refused.status, 409);
    assert.equal(refused.json.id, "note-editor");
    assert.match(refused.json.fields.markdown, /not written/u);
    assert.equal((await workspace.read("home.md")).revision, saved.json.revision);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
