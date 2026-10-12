import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { verifySetOfReferences } from "../scripts/verify-set-of-references.mjs";

function crossrefResponse(doi, { title, year, ok = true, status = 200 }) {
  if (!ok) {
    return { ok: false, status, json: async () => ({}) };
  }
  return {
    ok: true,
    status,
    json: async () => ({
      message: {
        DOI: doi,
        type: "journal-article",
        title: [title],
        author: [{ family: "Author", given: "A." }],
        issued: { "date-parts": [[year]] },
      },
    }),
  };
}

/**
 * Build a fetchImpl over a `{doi: {title, year, ok?, status?}}` fixture map,
 * keyed by the bare doi requested.
 */
function fetchImplFor(fixtures) {
  return async (url) => {
    const requested = String(url).replace(/^https:\/\/api\.crossref\.org\/works\//u, "").split("?")[0];
    const fixture = fixtures[requested];
    if (fixture === undefined) throw new Error(`no fixture for doi ${requested}`);
    return crossrefResponse(requested, fixture);
  };
}

function row({ citekey, title, year, doi, path }) {
  return { citekey, title, year, doi, path };
}

test("verifySetOfReferences reports agreed when title and year match CrossRef", async () => {
  const fetchImpl = fetchImplFor({ "10.1/agreed": { title: "A Study Of Things", year: 2020 } });
  const report = await verifySetOfReferences([row({ citekey: "author2020", title: "A Study Of Things", year: 2020, doi: "10.1/agreed" })], { fetchImpl });
  assert.equal(report.type, "ReferenceVerificationSet");
  assert.equal(report.version, 1);
  assert.equal(report.rowCount, 1);
  assert.equal(report.agreed, 1);
  assert.equal(report.defectCount, 0);
  assert.deepEqual(report.defects, []);
});

test("verifySetOfReferences reports title-mismatch when CrossRef's title diverges in the first 40 normalized characters", async () => {
  const fetchImpl = fetchImplFor({ "10.1/mismatch": { title: "A Completely Different And Unrelated Title About Nothing Alike", year: 2020 } });
  const report = await verifySetOfReferences([row({ citekey: "author2020", title: "A Study Of Things", year: 2020, doi: "10.1/mismatch" })], { fetchImpl });
  assert.equal(report.defectCount, 1);
  assert.equal(report.agreed, 0);
  assert.equal(report.defects[0].status, "title-mismatch");
  assert.equal(report.defects[0].citekey, "author2020");
  assert.equal(report.defects[0].resolvedTitle, "A Completely Different And Unrelated Title About Nothing Alike");
});

test("verifySetOfReferences reports year-mismatch when the title agrees but the year does not", async () => {
  const fetchImpl = fetchImplFor({ "10.1/year": { title: "A Study Of Things", year: 1999 } });
  const report = await verifySetOfReferences([row({ citekey: "author2020", title: "A Study Of Things", year: 2020, doi: "10.1/year" })], { fetchImpl });
  assert.equal(report.defectCount, 1);
  assert.equal(report.defects[0].status, "year-mismatch");
  assert.equal(report.defects[0].resolvedYear, 1999);
});

test("verifySetOfReferences reports unresolved when CrossRef returns a non-OK response", async () => {
  const fetchImpl = fetchImplFor({ "10.1/missing": { ok: false, status: 404 } });
  const report = await verifySetOfReferences([row({ citekey: "author2020", title: "A Study Of Things", year: 2020, doi: "10.1/missing" })], { fetchImpl });
  assert.equal(report.defectCount, 1);
  assert.equal(report.defects[0].status, "unresolved");
  assert.match(report.defects[0].reason, /404/u);
});

test("verifySetOfReferences reports no-doi as neither agreed nor a defect", async () => {
  const fetchImpl = fetchImplFor({});
  const report = await verifySetOfReferences([row({ citekey: "author2020", title: "A Study Of Things", year: 2020 })], { fetchImpl });
  assert.equal(report.rowCount, 1);
  assert.equal(report.agreed, 0);
  assert.equal(report.defectCount, 0);
  assert.deepEqual(report.defects, []);
});

test("verifySetOfReferences exits the row-array shape with a mixed set correctly totalled", async () => {
  const fetchImpl = fetchImplFor({
    "10.1/agreed": { title: "A Study Of Things", year: 2020 },
    "10.1/mismatch": { title: "Nothing Whatsoever In Common Here At All", year: 2020 },
  });
  const rows = [
    row({ citekey: "a2020", title: "A Study Of Things", year: 2020, doi: "10.1/agreed" }),
    row({ citekey: "b2020", title: "A Study Of Things", year: 2020, doi: "10.1/mismatch" }),
    row({ citekey: "c2020", title: "A Study Of Things", year: 2020 }),
  ];
  const report = await verifySetOfReferences(rows, { fetchImpl });
  assert.equal(report.rowCount, 3);
  assert.equal(report.agreed, 1);
  assert.equal(report.defectCount, 1);
});

test("verifySetOfReferences refuses a malformed row array", async () => {
  await assert.rejects(() => verifySetOfReferences([{ citekey: "no-title-2020" }]), /title/u);
});

test("verifySetOfReferences refuses input that is neither an array nor a {scope} object", async () => {
  await assert.rejects(() => verifySetOfReferences({ notScope: true }), /scope/u);
});

let root;
before(() => {
  root = mkdtempSync(join(tmpdir(), "bibliography-verify-corpus-"));
  mkdirSync(join(root, "glossary", "terms"), { recursive: true });
  writeFileSync(join(root, "glossary", "terms", "agon.md"), [
    "---",
    "name: agon",
    "references:",
    "  caillois1958:",
    "    authors: [Caillois, Roger]",
    "    title: Les jeux et les hommes",
    "    year: 1958",
    "    doi: 10.1/caillois",
    "---",
    "",
    "Agon is competitive play.",
    "",
  ].join("\n"));
});
after(() => { rmSync(root, { recursive: true, force: true }); });

test("verifySetOfReferences collects a scope's own references: maps when given {scope}", async () => {
  const fetchImpl = fetchImplFor({ "10.1/caillois": { title: "Les jeux et les hommes", year: 1958 } });
  const report = await verifySetOfReferences({ scope: root }, { fetchImpl });
  assert.equal(report.rowCount, 1);
  assert.equal(report.agreed, 1);
});

test("verifySetOfReferences honors includeGlobs when collecting a scope", async () => {
  const report = await verifySetOfReferences({ scope: root, includeGlobs: ["nonexistent/**"] }, { fetchImpl: fetchImplFor({}) });
  assert.equal(report.rowCount, 0);
});
