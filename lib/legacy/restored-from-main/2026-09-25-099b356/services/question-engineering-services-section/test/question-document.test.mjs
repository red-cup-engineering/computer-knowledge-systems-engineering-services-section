import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import test from "node:test";
import { QUESTION_DOCUMENT_PROJECTION_TARGET, fabricateResearchQuestionDocument, projectResearchQuestionDocument, researchQuestionDocumentPath } from "../src/question-document.mjs";
import { admitResearchQuestion } from "../src/question.mjs";

const sha = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
const question = admitResearchQuestion({
  type: "ResearchQuestionCandidate",
  version: 1,
  id: "zeolite-siloxane-interface",
  question: "Which interface observables distinguish zeolite confinement from siloxane transport?",
  source: { type: "ResearchQuestionSource", version: 1, locator: "vault://zeolite-siloxane-notes", digest: sha("source note") },
  createdAt: "2026-08-31T12:00:00Z",
});

function span(line = 1) { return { type: "ArtifactFabricationSourceSpan", startLine: line, endLine: line }; }
function specification(relativePath = researchQuestionDocumentPath(question.id)) {
  const projectionId = "question-markdown";
  const obligationId = "question-document-assay";
  const requirementId = "question-content";
  return {
    type: "ArtifactFabricationSpecificationCandidate",
    version: 1,
    source: {
      type: "ArtifactFabricationSource",
      version: 1,
      identity: { type: "ArtifactFabricationSourceIdentity", id: "question-document-operation" },
      provenance: { type: "ArtifactFabricationSourceProvenance", locator: "operation://question-document", digest: sha("question document operation"), sourceSpan: span() },
    },
    artifact: { type: "FabricatedArtifactIdentity", version: 1, id: "zeolite-siloxane-interface-question", kind: "science-owned research-question Markdown carrier" },
    requirements: [{ type: "ArtifactFabricationRequirement", version: 1, id: requirementId, statement: "Project the admitted question and its source provenance without overwriting an existing carrier.", sourceSpan: span(2) }],
    prohibitions: [],
    openQuestions: [],
    constraints: [
      { type: "ArtifactFabricationConstraint", version: 1, id: "create-only-law", kind: "law", authority: "question-engineering owner", revision: "1", locator: "package://question-engineering", applicability: "question carrier creation", statement: "An existing carrier is not overwritten.", sourceSpan: span(3) },
      { type: "ArtifactFabricationConstraint", version: 1, id: "markdown-standard", kind: "standard", authority: "561 Group Markdown guide", revision: "2026-08-31", locator: "guide://writing-markdown-carriers", applicability: "question carrier projection", statement: "Question carriers use admitted frontmatter and no redundant H1.", sourceSpan: span(4) },
    ],
    projections: [{ type: "ArtifactFabricationProjection", version: 1, id: projectionId, target: QUESTION_DOCUMENT_PROJECTION_TARGET, configuration: { questionId: question.id, relativePath }, sourceSpan: span(5) }],
    acceptanceObligations: [{ type: "ArtifactFabricationAcceptanceObligation", version: 1, id: obligationId, kind: "test", statement: "The created bytes carry the question and source digest.", sourceSpan: span(6) }],
    traceability: [{ type: "ArtifactFabricationTrace", version: 1, requirementId, constraintIds: ["create-only-law", "markdown-standard"], projectionIds: [projectionId], acceptanceObligationIds: [obligationId] }],
  };
}

test("projects a useful question carrier through the Markdown/YAML capability", () => {
  const projection = projectResearchQuestionDocument(question);
  assert.match(projection.text, /question-id: zeolite-siloxane-interface/u);
  assert.match(projection.text, /status: open/u);
  assert.match(projection.text, /## Question\n\nWhich interface observables/u);
  assert.match(projection.text, /vault:\/\/zeolite-siloxane-notes/u);
  assert.doesNotMatch(projection.text, /(?:^|\n)(?:title|type|slug|defines|related):/u);
  assert.doesNotMatch(projection.text, /(?:^|\n)# /u);
});

test("fabricates create-only science-owned Markdown with admitted evidence", async () => {
  const root = await mkdtemp("/tmp/question-document-");
  try {
    const request = { type: "ResearchQuestionDocumentFabricationRequest", version: 1, scienceSectionRoot: root, question, specificationCandidate: specification() };
    const receipt = await fabricateResearchQuestionDocument(request);
    assert.equal(receipt.type, "ResearchQuestionDocumentFabricationReceipt");
    const bytes = await readFile(receipt.write.path, "utf8");
    assert.equal(bytes, receipt.projection.text);
    assert.equal(receipt.artifactFabricationRealizationReceipt.realizations[0].evidence.digest, sha(bytes));

    const repeated = await fabricateResearchQuestionDocument(request);
    assert.equal(repeated.type, "ResearchQuestionDocumentFabricationRefusal");
    assert.equal(repeated.phase, "question-document-writing");
    assert.equal(await readFile(receipt.write.path, "utf8"), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses a projection that does not bind the admitted question", async () => {
  const root = await mkdtemp("/tmp/question-document-refusal-");
  try {
    const candidate = specification();
    candidate.projections[0].configuration.questionId = "another-question";
    const refused = await fabricateResearchQuestionDocument({ type: "ResearchQuestionDocumentFabricationRequest", version: 1, scienceSectionRoot: root, question, specificationCandidate: candidate });
    assert.equal(refused.type, "ResearchQuestionDocumentFabricationRefusal");
    assert.equal(refused.code, "INVALID_PROJECTION_CONFIGURATION");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
