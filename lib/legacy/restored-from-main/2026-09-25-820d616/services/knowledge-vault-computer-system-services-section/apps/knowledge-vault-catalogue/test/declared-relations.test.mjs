import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DECLARED_RELATIONS,
  eavtRowsOf,
  mergeDefects,
  pricePredicateRelation,
  readDeclaredRelationLedger,
  readDeclaredRelations,
  readPredicateIdentificationDeclarations,
  witnessOf,
} from "../scripts/declared-relations.mjs";

const root = fileURLToPath(new URL("fixtures/relations-vault/", import.meta.url));
const parent = "section/content/text/glossary/terms";
const child = "section/services/child/content/text/glossary/terms";
const sibling = "sibling/content/text/glossary/terms";
const constituents = ["bilattice", "articulation", "model", "belief", "orienting", "operation"];
const bamboo = `${parent}/bilattice-articulation-model-belief-orienting-operation.md`;
const parentPaths = [
  ...constituents.map((stem) => `${parent}/${stem}.md`),
  bamboo,
];

test("the DREW concept projection retains definition and TESS keyword relations", () => {
  assert.deepEqual(DECLARED_RELATIONS, { defines: "positive", "declares-keyword": "positive" });
  assert.equal(DECLARED_RELATIONS["instance-of"], undefined);
  assert.equal(DECLARED_RELATIONS.requires, undefined);
});

test("an admitted term's nested canonical relations become EAVT rows", async () => {
  const path = "relation-fixture/content/text/glossary/terms/work-unit.md";
  const ledger = await readDeclaredRelationLedger({ root, paths: [path] });
  assert.equal(ledger.defects.length, 0);
  assert.deepEqual(ledger.rows.map(({ a, v }) => [a, v]), [
    ["defines", "work-unit"],
    ["instance-of", "work"],
    ["requires", "skill-result"],
    ["properties", "meaning-settled=true"],
    ["properties", "execution-settled=false"],
    // Neither "work" nor "skill-result" is defined by any document in this one-path ledger: both
    // carrier-range relation values still name their gap, alongside the row that makes work-unit
    // findable by them.
    ["refused", { rule: "unresolved-term", relation: "instance-of", term: "work", message: "instance-of work did not resolve to a defined term" }],
    ["refused", { rule: "unresolved-term", relation: "requires", term: "skill-result", message: "requires skill-result did not resolve to a defined term" }],
  ]);
});

test("admitted terms define themselves and BAMBOO keywords remain one-way EAVT rows", async () => {
  const ledger = await readDeclaredRelationLedger({ root, paths: parentPaths });
  assert.equal(ledger.defects.length, 0);
  assert.equal(ledger.unresolved.length, 0);
  assert.equal(ledger.documents, 7);
  assert.deepEqual(
    ledger.rows.map(({ e, a, v }) => [e, a, v]),
    [
      ...constituents.map((stem) => [`${parent}/${stem}.md`, "defines", stem]),
      [bamboo, "defines", "bilattice-articulation-model-belief-orienting-operation"],
      ...constituents.map((stem) => [bamboo, "declares-keyword", stem]),
    ],
  );
});

test("primitive model defines itself and receives no materialized keyword backlink", async () => {
  const modelPath = `${parent}/model.md`;
  const source = await readFile(new URL(`fixtures/relations-vault/${modelPath}`, import.meta.url), "utf8");
  assert.doesNotMatch(source, /BAMBOO|bilattice-articulation-model-belief-orienting-operation|related:/iu);
  const ledger = await readDeclaredRelationLedger({ root, paths: parentPaths });
  assert.deepEqual(ledger.rows.filter(({ e }) => e === modelPath).map(({ a, v }) => [a, v]), [["defines", "model"]]);
  assert.deepEqual(
    ledger.rows.filter(({ a, v }) => a === "declares-keyword" && v === "model").map(({ e }) => e),
    [bamboo],
    "the reverse backlink remains derived from the compound row",
  );
});

test("keyword resolution uses the current glossary and then an ancestor without sibling leakage", async () => {
  const paths = [
    `${parent}/model.md`,
    `${parent}/operation.md`,
    `${child}/model.md`,
    `${child}/local-model-operation.md`,
    `${sibling}/sibling-model-operation.md`,
  ];
  const ledger = await readDeclaredRelationLedger({ root, paths });
  const local = ledger.rows.filter(({ e, a }) => e === `${child}/local-model-operation.md` && a === "declares-keyword");
  assert.deepEqual(local.map(({ v }) => v), ["model", "operation"]);
  assert.deepEqual(ledger.rows.filter(({ e }) => e === `${child}/model.md`).map(({ a, v }) => [a, v]), [["defines", "model"]]);
  // TESS's scope-aware keyword web still never leaks sibling -> ancestor edges: the sibling gets
  // its own typed "not-found-in-current-or-ancestor-scope" refusals from that mechanism. But the
  // corpus-wide `declares-keyword` row every document gets (this task's fix) is a separate,
  // global fact: "model" and "operation" ARE defined somewhere in this exact ledger (by
  // `${parent}/model.md` and `${parent}/operation.md`), so the sibling's own declared-keyword
  // rows for them carry no unresolved-term gap either.
  const siblingKeywordRows = ledger.rows.filter(({ e, a }) => e.startsWith(sibling) && a === "declares-keyword");
  assert.deepEqual(siblingKeywordRows.map(({ v }) => v), ["model", "operation"], "every document, including the sibling, gets its own corpus-wide declared-keyword rows");
  assert.deepEqual(
    ledger.unresolved.filter(({ path }) => path.startsWith(sibling)).map(({ keyword }) => keyword),
    ["model", "operation"],
    "TESS's ancestor-scope keyword web still separately reports these as unresolved within that scoped mechanism",
  );
  assert.deepEqual(
    ledger.rows.filter(({ e, a }) => e.startsWith(sibling) && a === "refused").map(({ a, v }) => [a, v.rule]),
    [["refused", "not-found-in-current-or-ancestor-scope"], ["refused", "not-found-in-current-or-ancestor-scope"]],
    "sibling's TESS-unresolved keywords surface as typed refusal rows, and (since model/operation resolve globally) never gain an unresolved-term gap of their own",
  );
});

test("authorized frontmatter relations admit every path under the flat global vocabulary, and compound keywords coexist", async () => {
  const local = "section/content/text/documents/local.md";
  const inherited = "section/services/child/content/text/documents/inherited.md";
  const siblingDocument = "sibling/content/text/documents/not-admitted.md";
  const paths = [...parentPaths, "section/content/text/glossary/terms/composed-of.md", local, inherited, siblingDocument];
  const ledger = await readDeclaredRelationLedger({ root, paths });
  // Every ordinary document also gets a `titled` row now (this task's fix), and none of
  // alpha/beta/gamma/delta is a term any document in this ledger `defines`, so each carrier-range
  // "composed-of" value also names its own unresolved-term gap.
  assert.deepEqual(
    ledger.rows.filter(({ e }) => e === local).map(({ a, v }) => [a, v]),
    [
      ["titled", "Local composition"],
      ["composed-of", "alpha"],
      ["composed-of", "beta"],
      ["refused", { rule: "unresolved-term", relation: "composed-of", term: "alpha", message: "composed-of alpha did not resolve to a defined term" }],
      ["refused", { rule: "unresolved-term", relation: "composed-of", term: "beta", message: "composed-of beta did not resolve to a defined term" }],
    ],
  );
  assert.deepEqual(
    ledger.rows.filter(({ e }) => e === inherited).map(({ a, v }) => [a, v]),
    [
      ["titled", "Inherited composition"],
      ["composed-of", "gamma"],
      ["refused", { rule: "unresolved-term", relation: "composed-of", term: "gamma", message: "composed-of gamma did not resolve to a defined term" }],
    ],
  );
  assert.deepEqual(
    ledger.rows.filter(({ e }) => e === siblingDocument).map(({ a, v }) => [a, v]),
    [
      ["titled", "Sibling metadata"],
      ["composed-of", "delta"],
      ["refused", { rule: "unresolved-term", relation: "composed-of", term: "delta", message: "composed-of delta did not resolve to a defined term" }],
    ],
    "relation authority is a flat global vocabulary (2026-09-01 redesign): every path is authorized for the same predicates, with no vault-location scoping",
  );
  assert.deepEqual(ledger.rows.filter(({ e }) => e === bamboo).map(({ a }) => a), ["defines", ...Array(6).fill("declares-keyword")]);
  assert.equal(ledger.rows.some(({ a }) => a === "metadata-only"), false);
  assert.equal(ledger.defects.length, 0);
});

test("one term reading uses the whole admitted path set for keyword resolution", async () => {
  const reading = await readDeclaredRelations({ root, path: bamboo, paths: parentPaths });
  assert.equal(reading.defect, null);
  assert.equal(reading.unresolved.length, 0);
  assert.deepEqual(reading.rows.filter(({ a }) => a === "declares-keyword").map(({ v }) => v), constituents);
});

test("a row witness changes with source bytes and not with wall-clock time", () => {
  assert.equal(witnessOf("same"), witnessOf("same"));
  assert.notEqual(witnessOf("same"), witnessOf("changed"));
  assert.deepEqual(
    eavtRowsOf([{ path: bamboo, relation: "declares-keyword", concept: "model" }], "w1"),
    [{ e: bamboo, a: "declares-keyword", v: "model", t: "w1" }],
  );
});

test("the composition boundary collapses identical defects and preserves distinct evidence", () => {
  const missing = { path: "missing.md", reason: "ENOENT" };
  assert.deepEqual(mergeDefects(
    [missing],
    [missing, { path: "missing.md", reason: "invalid YAML" }],
    [{ path: "compound.md", reason: "unresolved", keyword: "model" }],
    [{ path: "compound.md", reason: "unresolved", keyword: "operation" }],
  ), [
    missing,
    { path: "missing.md", reason: "invalid YAML" },
    { path: "compound.md", reason: "unresolved", keyword: "model" },
    { path: "compound.md", reason: "unresolved", keyword: "operation" },
  ]);
});

test("missing term files are reported rather than silently omitted", async () => {
  const absent = `${parent}/absent.md`;
  const ledger = await readDeclaredRelationLedger({ root, paths: [absent] });
  assert.deepEqual(ledger.rows.map(({ e, a }) => [e, a]), [[absent, "refused"]]);
  assert.equal(ledger.rows[0].v.rule, "defect");
  assert.deepEqual(ledger.defects.map(({ path }) => path), [absent]);
});

test("a term with one unauthorized frontmatter key yields exactly one refused row for it, while another term's authorized relations still admit normally alongside it in the same ledger", async () => {
  const unauthorized = "refusal-fixture/content/text/glossary/terms/unauthorized-key.md";
  const ledger = await readDeclaredRelationLedger({ root, paths: [...parentPaths, unauthorized] });
  const refused = ledger.rows.filter(({ e, a }) => e === unauthorized && a === "refused");
  // term-carrier's recognizeTermMarkdown legitimately raises two findings for one unauthorized
  // key (rule "unknown-key" from the frontmatter scan, rule "record" from admitTermRecord); both
  // are distinct evidence and neither is dropped, so exactly one row carries the "unknown-key" rule.
  const unknownKeyRows = refused.filter(({ v }) => v.rule === "unknown-key");
  assert.equal(unknownKeyRows.length, 1);
  assert.ok(unknownKeyRows[0].v.message.includes("invented-key"));
  // BAMBOO's own authorized declares-keyword relations, read in the very same ledger call, admit
  // normally: one term's refusal never contaminates another term's authorized rows.
  assert.deepEqual(
    ledger.rows.filter(({ e }) => e === bamboo).map(({ a }) => a),
    ["defines", ...Array(6).fill("declares-keyword")],
    "an unrelated term's refusal does not disturb BAMBOO's authorized relations in the same ledger",
  );
});

test("readPredicateIdentificationDeclarations reads the term contract's seeded ledger", async () => {
  const declarations = await readPredicateIdentificationDeclarations();
  assert.deepEqual(declarations, [{ a: "part-of", kind: "mld", b: "component-of", carrier: "data/records/schema/glossary/term/relation-predicates.json" }]);
});

test("pricePredicateRelation prices part-of/component-of as mld at 1, is unreachable for an unrelated pair, and reaches a predicate to itself at 0", async () => {
  const identified = await pricePredicateRelation({ from: "part-of", to: "component-of" });
  assert.equal(identified.price, 1);
  assert.equal(identified.kind, "mld");
  assert.equal(identified.type, "PredicateIdentificationPrice");

  const unrelated = await pricePredicateRelation({ from: "cites", to: "see-also" });
  assert.equal(unrelated.price, null);
  assert.equal(unrelated.path, null);
  assert.equal(unrelated.kind, null);

  const reflexive = await pricePredicateRelation({ from: "cites", to: "cites" });
  assert.equal(reflexive.price, 0);
});
