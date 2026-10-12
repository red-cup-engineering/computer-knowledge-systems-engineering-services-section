import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createGeodeTypedFieldInput, deriveGeodeLedgerFromTypedField, deriveGeodeWorkspaceFromTypedField } from "../src/typed-field-input.mjs";

const profile = JSON.parse(readFileSync(new URL("../../../../../../../../../../../../science-services-section/services/philosophy-services-section/services/relationality-services-section/data/records/shared-typed-substrate-profile.json", import.meta.url), "utf8"));
const snapshot = Object.freeze({
  type: "GeodeWorkspaceSnapshot",
  schemaVersion: "geode-workspace/v1",
  documents: Object.freeze([Object.freeze({ path: "order.md", title: "Order", aliases: Object.freeze([]), keywords: Object.freeze([]), headings: Object.freeze([]) })]),
  graph: Object.freeze({ edges: Object.freeze([]) }),
});
const ledger = Object.freeze({
  type: "GeodeDeclaredRelationLedger",
  schemaVersion: "geode-declared-relations/v1",
  rows: Object.freeze([Object.freeze({ e: "order.md", a: "defines", v: "total-order", t: "fixture-witness" })]),
  documents: 1,
  scanned: 1,
  unnamed: 0,
  defects: Object.freeze([]),
  unresolved: Object.freeze([]),
});

test("typed GEODE input deterministically preserves observed workspace and ledger projections", () => {
  const first = createGeodeTypedFieldInput({ snapshot, ledger, profile });
  const second = createGeodeTypedFieldInput({ snapshot, ledger, profile });
  assert.deepEqual(first, second);
  assert.equal(first.things.length, 1);
  assert.equal(first.relationalFieldDocument.statements.length, 1);
  assert.deepEqual(deriveGeodeWorkspaceFromTypedField(first), snapshot);
  assert.deepEqual(deriveGeodeLedgerFromTypedField(first), ledger);
  assert.deepEqual(first.refusals, profile.refusals);
});

test("typed GEODE input refuses a profile that erases the scientific universal-term refusals", () => {
  assert.throws(
    () => createGeodeTypedFieldInput({ snapshot, ledger, profile: { ...profile, refusals: Object.freeze([]) } }),
    /universal-term refusals/u,
  );
});

test("typed GEODE input refuses the retired engineering package binding", () => {
  assert.throws(
    () => createGeodeTypedFieldInput({
      snapshot,
      ledger,
      profile: {
        ...profile,
        typeEngineBinding: { ...profile.typeEngineBinding, package: "@red-cup-engineering/computer-data-type-engine" },
      },
    }),
    /shared typed substrate profile is incompatible/u,
  );
});
