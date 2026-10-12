import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { admitCarrierFrontmatter, CARRIER_KINDS, carrierKindContract } from "../src/carrier-kinds.mjs";
import { carrierKindOf, kindOf, roleOf, sectionOf } from "../src/carrier-path.mjs";
import { projectCarrierKindSchemas } from "../src/carrier-kind-schemas.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCIENCE = join(ROOT, "../../../../../../../../../science-services-section/services/information-science-services-section/services/knowledge-services-section/services/knowledge-organization-services-section/schemas/carriers");

test("each projected carrier-kind schema equals its knowledge-organization science source", () => {
  for (const kind of CARRIER_KINDS) {
    const read = (directory) => JSON.parse(readFileSync(join(directory, `${kind}.schema.json`), "utf8"));
    assert.deepEqual(read(join(ROOT, "schemas/carriers")), read(SCIENCE), kind);
  }
});

test("the projection refuses a schema whose $id is not carriers/<kind>", async () => {
  const written = [];
  const operations = { list: () => ["note.schema.json"], read: () => JSON.stringify({ $id: "vault/note" }), write: (path, bytes) => written.push([path, bytes]) };
  await assert.rejects(projectCarrierKindSchemas({ source: "/s", destination: "/d" }, operations), /not carriers\/note/u);
  assert.deepEqual(written, []);
});

test("the kind is the artifact-role directory's", () => {
  const path = "services/a-section/content/text/documents/articles/notes/2026/09/30/x.md";
  assert.equal(sectionOf(path), "services/a-section");
  assert.equal(roleOf(path, "services/a-section"), "content/text/documents/articles/notes");
  assert.equal(carrierKindOf(path), "note");
  assert.equal(carrierKindOf("services/a-section/content/text/glossary/terms/x.md"), "term");
  assert.equal(kindOf("", "README"), "readme");
});

test("a note's frontmatter is admitted by the note schema and refused with keyword:key rules", () => {
  const lawful = { title: "T", description: "What it is about.", "date-created": "2026-09-30", keywords: ["carrier-kind"], references: { smith2020: { authors: ["Smith"], title: "A work", year: 2020 } } };
  assert.deepEqual(admitCarrierFrontmatter("note", lawful), { admitted: true, findings: [] });
  const refused = admitCarrierFrontmatter("note", { title: "T", "date-created": 2026, keywords: ["Not Kebab"], visibility: "secret" });
  assert.equal(refused.admitted, false);
  assert.deepEqual([...new Set(refused.findings.map(({ rule }) => rule))].sort(), ["enum:visibility", "pattern:keywords", "required:description", "type:date-created"]);
});

test("every relation predicate is a key whose value names carriers", () => {
  const contract = carrierKindContract("note");
  const carrierRange = Object.entries(contract.properties).find(([, schema]) => Array.isArray(schema.oneOf));
  assert.ok(carrierRange, "the vocabulary authorizes at least one carrier-range predicate");
  const base = { title: "T", description: "D.", "date-created": "2026-09-30" };
  assert.equal(admitCarrierFrontmatter("note", { ...base, [carrierRange[0]]: ["a-term"] }).admitted, true);
  assert.deepEqual(admitCarrierFrontmatter("note", { ...base, [carrierRange[0]]: [] }).findings.map(({ rule }) => rule), [`oneOf:${carrierRange[0]}`], "one finding, not one per alternative");
  assert.throws(() => carrierKindContract("concept"), /no carrier-kind schema/u);
});

test("a note's repair plan derives missing fields from what the note already says", async () => {
  const { planNoteFrontmatterRepair } = await import("../src/note-repair.mjs");
  const plan = planNoteFrontmatterRepair({
    path: "services/a-section/content/text/documents/articles/notes/2026/09/30/2026-09-30-a-note.md",
    text: "",
    frontmatter: { keywords: ["Carrier Kind"], references: { smith2020: { authors: ["Smith"], title: "Kept", year: 2020 }, "A loose title": {} } },
    body: "# A Note\n\nThis paragraph says what the note is about, at enough length to count. A second sentence.\n",
  });
  assert.deepEqual(plan.set, {
    title: "A Note",
    "date-created": "2026-09-30",
    description: "This paragraph says what the note is about, at enough length to count.",
    keywords: ["carrier-kind"],
    cites: ["A loose title"],
    references: { smith2020: { authors: ["Smith"], title: "Kept", year: 2020 } },
  });
  assert.equal(admitCarrierFrontmatter("note", plan.set).admitted, true, "the plan's fields satisfy the schema they repair toward");
});
