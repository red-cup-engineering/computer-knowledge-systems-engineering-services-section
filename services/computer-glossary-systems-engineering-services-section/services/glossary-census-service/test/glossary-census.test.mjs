import assert from "node:assert/strict";
import test from "node:test";
import { projectGlossaryIndex } from "@red-cup-engineering/term-engineering-services-section/glossary-index";
import { censusGlossaryIndex } from "../src/glossary-census.mjs";

const body = "An operation is a well-defined unit of work with a stated input and output that a system carries out.";
const at = (scheme, identity, text) => ({ path: `${scheme}/content/text/glossary/terms/${identity}.md`, filename: `${identity}.md`, text });

function index() {
  return projectGlossaryIndex({ root: "/glossary", documents: [
    at("services/alpha-services-section", "operation", `---\nname: Operation\n---\n${body}\n`),
    at("services/beta-services-section", "operation", `---\nname: Operation\n---\n${body}\n`),
    at("services/beta-services-section", "stub", "---\nname: Stub\n---\n"),
    at("services/beta-services-section", "titled", `---\ntitle: Titled\n---\n${body}\n`),
  ] });
}

test("censusGlossaryIndex counts admission per scheme, refusals by rule, stubs, and shared identities", () => {
  const { record, rows } = censusGlossaryIndex(index(), { date: "2026-09-30" });
  assert.equal(record.schema, "computer-glossary-census.v1");
  assert.equal(record.carriers, 4);
  assert.equal(record.admitted, 2);
  assert.equal(record.refused, 2);
  assert.equal(record.stubs, 1);
  assert.deepEqual(record.schemes["services/beta-services-section"], { carriers: 3, admitted: 1 });
  assert.deepEqual(record.sharedIdentities, { operation: ["services/alpha-services-section", "services/beta-services-section"] });
  assert.ok(record.refusalsByRule["unknown-key"] >= 1);
  assert.deepEqual(rows[0], ["path", "scheme", "identity", "admitted", "rules"]);
  assert.equal(rows.length, 5);
  assert.equal(JSON.stringify(censusGlossaryIndex(index(), { date: "2026-09-30" })), JSON.stringify({ record, rows }));
});
