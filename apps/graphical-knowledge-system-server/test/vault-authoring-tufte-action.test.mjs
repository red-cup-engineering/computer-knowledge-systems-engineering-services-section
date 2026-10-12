import assert from "node:assert/strict";
import test from "node:test";
import { renderGeodeEditorDocument } from "../src/vault-authoring.mjs";

const reading = Object.freeze({
  type: "CairnDocumentReading",
  path: "home.md",
  title: "Home",
  markdown: "Welcome.\n",
  html: "<p>Welcome.</p>",
  revision: "rev-1",
});

test("the replace-document form's action is a same-origin path TUFTE admits, not a bare URI scheme", () => {
  const html = renderGeodeEditorDocument(reading);
  // Regression: a bare "geode:replace-document/v1" parses as an absolute URI with an
  // unsupported "geode:" scheme (opaque origin), which admitTufteUrl rejects and which a
  // real browser could neither fetch (same-origin check) nor navigate to (unregistered
  // scheme). A leading "/" makes it a genuine same-origin path while keeping the same
  // action name.
  assert.match(html, /action="\/geode:replace-document\/v1"/u);
  assert.doesNotMatch(html, /action="geode:replace-document\/v1"/u);
});
