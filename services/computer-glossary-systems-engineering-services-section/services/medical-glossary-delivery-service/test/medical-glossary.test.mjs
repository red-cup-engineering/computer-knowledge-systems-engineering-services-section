import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveMedicalGlossaryIndex } from "../scripts/derive-medical-glossary-index.mjs";
import {
  medicalTermNeighborhood,
  resolveMedicalTerm,
  searchMedicalGlossary,
  validateMedicalGlossarySearch,
  validateMedicalTermIdentity,
} from "../src/medical-glossary.mjs";
import committedIndex from "../data/records/glossary-index-records/glossary-index.json" with { type: "json" };

test("re-deriving the index from this section's own tree reproduces the committed index byte-for-byte", async () => {
  const { index } = await deriveMedicalGlossaryIndex();
  assert.equal(JSON.stringify(index), JSON.stringify(committedIndex));
  const onDisk = await readFile(new URL("../data/records/glossary-index-records/glossary-index.json", import.meta.url), "utf8");
  assert.equal(onDisk, `${JSON.stringify(index, null, 2)}\n`);
});

test("resolveMedicalTerm('catatonia') returns a record carrying a DOI-bearing reference", () => {
  const record = resolveMedicalTerm("catatonia");
  assert.equal(record.identity, "catatonia");
  assert.equal(record.name, "Catatonia");
  assert.equal(record.references.rogers2025.doi, "10.1186/s12888-025-06857-6");
});

test("resolveMedicalTerm throws RangeError on an unknown identity and TypeError on a malformed one", () => {
  assert.throws(() => resolveMedicalTerm("no-such-medical-term"), RangeError);
  assert.throws(() => resolveMedicalTerm("Not_Kebab"), TypeError);
});

test("medicalTermNeighborhood('catatonia') carries an incoming subtype-of relation from malignant-catatonia", () => {
  const neighborhood = medicalTermNeighborhood("catatonia");
  assert.equal(neighborhood.record.identity, "catatonia");
  const incomingSubtype = neighborhood.incoming.find(({ predicate, from }) => predicate === "subtype-of" && from === "malignant-catatonia");
  assert.ok(incomingSubtype, JSON.stringify(neighborhood.incoming));
  assert.equal(incomingSubtype.record.identity, "malignant-catatonia");
});

test("searchMedicalGlossary ranks the exact term first, over both a string query and the market's {q, limit} object", () => {
  const byString = searchMedicalGlossary("catatonia");
  assert.equal(byString[0].identity, "catatonia");
  assert.ok(byString.length > 1);
  const byObject = searchMedicalGlossary({ q: "catatonia", limit: "2" });
  assert.equal(byObject.length, 2);
  assert.equal(byObject[0].identity, "catatonia");
});

test("validateMedicalTermIdentity and validateMedicalGlossarySearch refuse malformed input with TypeError/RangeError", () => {
  assert.equal(validateMedicalTermIdentity("catatonia"), "catatonia");
  assert.throws(() => validateMedicalTermIdentity("Not_Kebab"), TypeError);
  assert.throws(() => validateMedicalTermIdentity(42), TypeError);
  assert.deepEqual(validateMedicalGlossarySearch({ q: "catatonia" }), { q: "catatonia" });
  assert.throws(() => validateMedicalGlossarySearch({}), TypeError);
  assert.throws(() => validateMedicalGlossarySearch(null), TypeError);
  assert.throws(() => validateMedicalGlossarySearch({ q: "catatonia", limit: "0" }), RangeError);
  assert.throws(() => validateMedicalGlossarySearch({ q: "catatonia", limit: "101" }), RangeError);
});
