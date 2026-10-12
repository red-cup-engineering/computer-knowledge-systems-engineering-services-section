import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { constituteContentAddressedEntity } from "@red-cup-engineering/eavt";
import { askEavtTraceCell } from "@red-cup-engineering/eavt/ask-eavt-cell";
import { buildCarrierRows, parseProvenanceRowsTsv } from "../src/provenance-census.mjs";
import { relateCarrierProvenanceRows, resolveRequest } from "../scripts/relate-set-of-carrier-provenance-rows.mjs";

const TSV_HEADER = [
  "relativePath",
  "subsection",
  "authorsRaw",
  "authorsClass",
  "status",
  "type",
  "referencesMapSize",
  "hasProvenanceObject",
  "hasRecordedBy",
  "hasCollectedBy",
  "hasSourcePath",
  "ownerMarkerCount",
  "locatedMarkerCount",
  "leanCitationCount",
  "legacyCitationCount",
  "inlineCitationCount",
  "grade",
].join("\t");

const FIXTURE_ROWS = [
  ["fixtures/a.md", "fixture-section", '["emsenn"]', "emsenn", "", "", "0", "false", "false", "false", "false", "0", "0", "0", "0", "0", "owner-authored"],
  ["fixtures/b.md", "fixture-section", "", "agent", "draft", "note", "2", "true", "true", "false", "true", "0", "0", "1", "0", "3", "agent-cited"],
  ["fixtures/c.md", "fixture-section", "", "absent", "", "", "0", "false", "false", "false", "false", "0", "0", "0", "0", "0", "agent-uncited"],
];

const CHECKED_AT = "2026-09-04T00:00:00.000Z";

async function writeFixture(directory) {
  const censusPath = join(directory, "fixture-census.json");
  const rowsTsvPath = join(directory, "fixture-census.rows.tsv");
  const tsvText = `${[TSV_HEADER, ...FIXTURE_ROWS.map((cells) => cells.join("\t"))].join("\n")}\n`;
  await writeFile(censusPath, `${JSON.stringify({ checkedAt: CHECKED_AT, root: "fixtures", totalCarriers: FIXTURE_ROWS.length })}\n`);
  await writeFile(rowsTsvPath, tsvText);
  return { censusPath, rowsTsvPath, tsvText };
}

test("relateCarrierProvenanceRows: relates a three-carrier fixture record into one eavt trace", async () => {
  const directory = await mkdtemp(join(tmpdir(), "provenance-relate-"));
  try {
    const { censusPath, tsvText } = await writeFixture(directory);
    const tracePath = join(directory, "carrier-provenance.eavt");

    const summary = await relateCarrierProvenanceRows({ census: censusPath, trace: tracePath });

    assert.equal(summary.type, "CarrierProvenanceRowsRelated");
    assert.equal(summary.trace, tracePath);
    assert.equal(summary.carriers, 3);

    const expectedRows = parseProvenanceRowsTsv(tsvText).flatMap((carrier) => buildCarrierRows(carrier, CHECKED_AT.slice(0, 10)));
    assert.equal(summary.rows, expectedRows.length);

    const { address } = constituteContentAddressedEntity({ kind: "science-carrier", attributes: { path: "fixtures/b.md" }, t: CHECKED_AT.slice(0, 10) });
    const answer = askEavtTraceCell({ trace: tracePath, entity: address, attribute: "provenance-grade" });
    assert.equal(answer.type, "EavtTraceCellAnswer");
    assert.deepEqual(answer.answer.settled.affirmed, [{ predicate: "provenance-grade", object: "agent-cited" }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("relateCarrierProvenanceRows: re-running the same census does not accumulate rows", async () => {
  const directory = await mkdtemp(join(tmpdir(), "provenance-relate-"));
  try {
    const { censusPath } = await writeFixture(directory);
    const tracePath = join(directory, "carrier-provenance.eavt");

    const first = await relateCarrierProvenanceRows({ census: censusPath, trace: tracePath });
    const second = await relateCarrierProvenanceRows({ census: censusPath, trace: tracePath });

    assert.equal(second.rows, first.rows);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("resolveRequest: reads --census and --trace flags", async () => {
  const request = await resolveRequest(["--census", "/a/census.json", "--trace", "/a/out.eavt"], { isTTY: true });
  assert.deepEqual(request, { census: "/a/census.json", trace: "/a/out.eavt" });
});

test("resolveRequest: refuses when neither flags nor stdin name both fields", async () => {
  await assert.rejects(() => resolveRequest([], { isTTY: true }), TypeError);
});
