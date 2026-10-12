import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { identifyContentAddressedRow, unique } from "@red-cup-engineering/eavt";
import { eavtRowsOf, readDeclaredRelationLedger, witnessOf } from "../scripts/declared-relations.mjs";

const root = fileURLToPath(new URL("fixtures/relations-vault/", import.meta.url));

// Exercises the row-identity/dedupe mechanism directly against eavtRowsOf + eavt's own
// rowId/dedupe, the same composition readDeclaredRelationLedger uses internally.

test("distinct e/a/v assertions never collide on eavt row identity", () => {
  const witness = witnessOf("one carrier's bytes");
  const rows = eavtRowsOf([
    { path: "a.md", relation: "declares-keyword", concept: "alpha" },
    { path: "a.md", relation: "declares-keyword", concept: "beta" },
    { path: "b.md", relation: "declares-keyword", concept: "alpha" },
  ], witness);
  const ids = rows.map((row) => identifyContentAddressedRow({ row }).identity);
  assert.equal(new Set(ids).size, ids.length, "each distinct triple must mint a distinct row id");
  assert.equal(unique(rows).length, rows.length, "dedupe must not collapse distinct assertions");
});

test("re-reading the same carrier twice dedupes to identical eavt row identity", () => {
  const text = "the same carrier's bytes, read a second time";
  const assertion = { path: "c.md", relation: "declares-keyword", concept: "gamma" };
  const firstReading = eavtRowsOf([assertion], witnessOf(text))[0];
  const secondReading = eavtRowsOf([assertion], witnessOf(text))[0];
  assert.equal(identifyContentAddressedRow({ row: firstReading }).identity, identifyContentAddressedRow({ row: secondReading }).identity, "re-reading unchanged bytes must reproduce the same row id");
  assert.deepEqual(unique([firstReading, secondReading]), [firstReading], "G-Set dedupe keeps one row, order-preserving");
});

test("readDeclaredRelationLedger dedupes a carrier re-declared twice, end to end", async () => {
  const local = "section/content/text/documents/local.md";
  const ledger = await readDeclaredRelationLedger({ root, paths: [local, local] });
  assert.deepEqual(ledger.defects, []);
  assert.deepEqual(
    ledger.rows.map(({ a, v }) => [a, v]),
    [
      ["titled", "Local composition"],
      ["composed-of", "alpha"],
      ["composed-of", "beta"],
      ["refused", { rule: "unresolved-term", relation: "composed-of", term: "alpha", message: "composed-of alpha did not resolve to a defined term" }],
      ["refused", { rule: "unresolved-term", relation: "composed-of", term: "beta", message: "composed-of beta did not resolve to a defined term" }],
    ],
    "every distinct assertion on one carrier survives once, and the repeated path dedupes rather than doubling them",
  );
});
