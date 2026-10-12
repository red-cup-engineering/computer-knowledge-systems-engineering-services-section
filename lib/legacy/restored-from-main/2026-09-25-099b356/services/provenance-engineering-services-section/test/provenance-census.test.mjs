import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assembleRecord,
  assessCarrier,
  classifyAuthors,
  deriveSubsection,
  gradeOf,
  ownerMarkers,
  shouldExcludeCarrierPath,
  summarize,
} from "../src/provenance-census.mjs";

test("classifyAuthors: exactly emsenn", () => {
  assert.equal(classifyAuthors("emsenn"), "emsenn");
  assert.equal(classifyAuthors(["emsenn"]), "emsenn");
  assert.equal(classifyAuthors(["Emsenn"]), "emsenn");
});

test("classifyAuthors: agent model names", () => {
  assert.equal(classifyAuthors(["claude-sonnet-5"]), "agent");
  assert.equal(classifyAuthors(["claude-sonnet-5", "claude-fable-5"]), "agent");
  assert.equal(classifyAuthors(["Claude Opus"]), "agent");
  assert.equal(classifyAuthors(["codex"]), "agent");
  assert.equal(classifyAuthors(["gpt-4"]), "agent");
});

test("classifyAuthors: absent and other", () => {
  assert.equal(classifyAuthors(undefined), "absent");
  assert.equal(classifyAuthors(null), "absent");
  assert.equal(classifyAuthors([]), "absent");
  assert.equal(classifyAuthors(["emsenn", "claude-sonnet-5"]), "other");
  assert.equal(classifyAuthors(["Jane Doe"]), "other");
});

test("ownerMarkers: a marker with an ISO date locator in the same paragraph is located", () => {
  const body = "Some prose.\n\nThis is owner-ruled 2026-08-30, per the session.\n\nMore prose.";
  const [marker] = ownerMarkers(body);
  assert.equal(marker.marker, "owner-ruled");
  assert.equal(marker.located, true);
});

test("ownerMarkers: a marker with no locator in its paragraph is unlocated", () => {
  const body = "Intro.\n\nThis claim is owner-stated, no date or transcript given here.\n\nOutro.";
  const [marker] = ownerMarkers(body);
  assert.equal(marker.marker, "owner-stated");
  assert.equal(marker.located, false);
});

test("ownerMarkers: a transcript path locates a marker without a date", () => {
  const body = "See ~/.claude/projects for the session where this was owner-ruled by the founder.";
  const [marker] = ownerMarkers(body);
  assert.equal(marker.located, true);
});

test("ownerMarkers: does not match owner-stated inside an unrelated word", () => {
  const body = "The homeowner-stated preference was noted informally.";
  assert.equal(ownerMarkers(body).length, 0);
});

test("shouldExcludeCarrierPath: excludes lib/legacy, triage, node_modules, .git, dist, obsmetrologia docs", () => {
  assert.equal(shouldExcludeCarrierPath("lib/emsenn/services/science-services-section/lib/legacy/old.md"), true);
  assert.equal(shouldExcludeCarrierPath("science-services-section/content/media/triage/scrap.md"), true);
  assert.equal(shouldExcludeCarrierPath("a/node_modules/b/c.md"), true);
  assert.equal(shouldExcludeCarrierPath("a/.git/b.md"), true);
  assert.equal(shouldExcludeCarrierPath("a/dist/b.md"), true);
  assert.equal(shouldExcludeCarrierPath("lib/obsmetrologia/docs/page.md"), true);
  assert.equal(shouldExcludeCarrierPath("science-services-section/content/text/documents/notes/a.md"), false);
});

test("deriveSubsection: reads the segment after science-services-section/services/, else science-root", () => {
  assert.equal(deriveSubsection("lib/.../science-services-section/services/natural-science-services-section/x.md"), "natural-science-services-section");
  assert.equal(deriveSubsection("lib/.../science-services-section/content/text/documents/notes/a.md"), "science-root");
});

test("gradeOf: owner-authored beats everything else", () => {
  assert.equal(gradeOf({ authorsClass: "emsenn", markerCount: 3, locatedMarkerCount: 0 }), "owner-authored");
  assert.equal(gradeOf({ authorsClass: "agent", isEmsennPersonalLog: true }), "owner-authored");
});

test("gradeOf: owner-attributed located vs unlocated", () => {
  assert.equal(gradeOf({ authorsClass: "agent", markerCount: 1, locatedMarkerCount: 1 }), "owner-attributed-located");
  assert.equal(gradeOf({ authorsClass: "agent", markerCount: 1, locatedMarkerCount: 0 }), "owner-attributed-unlocated");
});

test("gradeOf: agent-cited requires agent-or-absent authors plus a citation signal", () => {
  assert.equal(gradeOf({ authorsClass: "agent", hasReferencesMap: true }), "agent-cited");
  assert.equal(gradeOf({ authorsClass: "absent", leanCitationCount: 1 }), "agent-cited");
  assert.equal(gradeOf({ authorsClass: "absent", inlineCitationCount: 2 }), "agent-cited");
  assert.equal(gradeOf({ authorsClass: "other", hasReferencesMap: true }), "agent-uncited");
});

test("gradeOf: agent-uncited is the default", () => {
  assert.equal(gradeOf({ authorsClass: "agent" }), "agent-uncited");
});

function markdown(frontmatter, body = "prose") {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

test("assessCarrier: grades a real owner-authored carrier", () => {
  const rawText = markdown({ authors: ["emsenn"], type: "notes" }, "A founder note.");
  const carrier = assessCarrier({ relativePath: "science-services-section/content/a.md", frontmatter: { authors: ["emsenn"], type: "notes" }, body: "A founder note.", rawText });
  assert.equal(carrier.grade, "owner-authored");
});

test("assessCarrier: grades owner-attributed-located from an in-body marker with a date", () => {
  const body = "Per owner-ruled 2026-08-30, the layout stands.";
  const rawText = markdown({ authors: ["claude-sonnet-5"] }, body);
  const carrier = assessCarrier({ relativePath: "science-services-section/services/natural-science-services-section/a.md", frontmatter: { authors: ["claude-sonnet-5"] }, body, rawText });
  assert.equal(carrier.grade, "owner-attributed-located");
  assert.equal(carrier.subsection, "natural-science-services-section");
});

test("assessCarrier: grades owner-attributed-unlocated from an in-body marker with no locator", () => {
  const body = "This is owner-stated somewhere, unspecified when.";
  const rawText = markdown({ authors: ["claude-sonnet-5"] }, body);
  const carrier = assessCarrier({ relativePath: "science-services-section/a.md", frontmatter: { authors: ["claude-sonnet-5"] }, body, rawText });
  assert.equal(carrier.grade, "owner-attributed-unlocated");
});

test("assessCarrier: grades agent-cited from a references: map", () => {
  const body = "Ordinary prose with no owner claim.";
  const frontmatter = { authors: ["claude-sonnet-5"], references: { euler1736: { authors: ["Euler, L."], title: "Solutio", year: 1736 } } };
  const rawText = markdown(frontmatter, body);
  const carrier = assessCarrier({ relativePath: "science-services-section/a.md", frontmatter, body, rawText });
  assert.equal(carrier.grade, "agent-cited");
  assert.equal(carrier.referencesMapSize, 1);
});

test("assessCarrier: grades agent-uncited with no authors, markers, or citations", () => {
  const body = "Plain prose, no claims about origin.";
  const rawText = markdown({}, body);
  const carrier = assessCarrier({ relativePath: "science-services-section/a.md", frontmatter: {}, body, rawText });
  assert.equal(carrier.grade, "agent-uncited");
});

test("assessCarrier: reads a collection-provenance object's recorded/collected/source-path fields", () => {
  const frontmatter = { "collection-provenance": { "collected-by": "claude-sonnet-5", "source-path": "lib/legacy/old.md" } };
  const rawText = markdown(frontmatter, "prose");
  const carrier = assessCarrier({ relativePath: "science-services-section/a.md", frontmatter, body: "prose", rawText });
  assert.equal(carrier.hasProvenanceObject, true);
  assert.equal(carrier.hasCollectedBy, true);
  assert.equal(carrier.hasSourcePath, true);
  assert.equal(carrier.hasRecordedBy, false);
  assert.equal(carrier.legacyCitationCount, 1);
});

test("summarize: aggregates grade counts, subsection ratios, and the unlocated inventory", () => {
  const carriers = [
    assessCarrier({ relativePath: "science-services-section/services/a-section/one.md", frontmatter: { authors: ["emsenn"] }, body: "x", rawText: "x" }),
    assessCarrier({ relativePath: "science-services-section/services/a-section/two.md", frontmatter: { authors: ["claude-sonnet-5"] }, body: "owner-ruled 2026-08-30 here.", rawText: "x" }),
    assessCarrier({ relativePath: "science-services-section/services/a-section/three.md", frontmatter: { authors: ["claude-sonnet-5"] }, body: "owner-stated with no date.", rawText: "x" }),
  ];
  const summary = summarize(carriers);
  assert.equal(summary.totalCarriers, 3);
  assert.equal(summary.gradeCounts["owner-authored"], 1);
  assert.equal(summary.gradeCounts["owner-attributed-located"], 1);
  assert.equal(summary.gradeCounts["owner-attributed-unlocated"], 1);
  assert.deepEqual(summary.unlocatedCarriers, ["science-services-section/services/a-section/three.md"]);
  const bucket = summary.bySubsection["a-section"];
  assert.equal(bucket.ownerLocatedCount, 1);
  assert.equal(bucket.ownerAttributedCount, 2);
  assert.equal(bucket.ownerLocatedRatio, 0.5);
});

test("assembleRecord: deterministic given the same carriers, aside from checkedAt", () => {
  const carriers = [assessCarrier({ relativePath: "science-services-section/a.md", frontmatter: {}, body: "x", rawText: "x" })];
  const first = assembleRecord({ root: "lib/.../science-services-section", carriers, checkedAt: "2026-09-04T00:00:00.000Z" });
  const second = assembleRecord({ root: "lib/.../science-services-section", carriers, checkedAt: "2026-09-04T01:00:00.000Z" });
  const { checkedAt: firstChecked, ...firstRest } = first;
  const { checkedAt: secondChecked, ...secondRest } = second;
  assert.notEqual(firstChecked, secondChecked);
  assert.deepEqual(firstRest, secondRest);
});
