import { createHash } from "node:crypto";
import {
  admitArtifactFabricationRealizationPlan,
  admitArtifactFabricationRealizationReceipt,
  admitArtifactFabricationSpecification,
} from "@red-cup-engineering/computer-code-development-engine/artifact-fabrication";
import { createMarkdownDocument } from "@red-cup-engineering/markdown-engineering-services-section/create-markdown-document";
import { writeMarkdownFile } from "@red-cup-engineering/markdown-engineering-services-section/write-markdown-file";

export const QUESTION_DOCUMENT_PROJECTION_TARGET = "@red-cup-engineering/question-engineering-services-section";
const DEFAULT_DIRECTORY = "content/text/documents/articles/research-articles/questions";

function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
function refusal(phase, code, message, path = null) {
  return immutable({ type: "ResearchQuestionDocumentFabricationRefusal", version: 1, phase, code, message, path });
}

export function researchQuestionDocumentPath(questionId) {
  if (typeof questionId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(questionId)) throw new TypeError("questionId must be lowercase words separated by single hyphens");
  return `${DEFAULT_DIRECTORY}/${questionId}.md`;
}

function projectionView(question) {
  if (!record(question) || !["ResearchQuestion", "ResearchQuestionState"].includes(question.type) || question.version !== 1 || typeof question.id !== "string" || typeof question.question !== "string" || !record(question.source) || typeof question.createdAt !== "string" || typeof question.status !== "string") {
    throw new TypeError("question must be ResearchQuestion@1 or ResearchQuestionState@1");
  }
  return question;
}

export function projectResearchQuestionDocument(question, options = {}) {
  const view = projectionView(question);
  const relativePath = options.relativePath ?? researchQuestionDocumentPath(view.id);
  if (typeof relativePath !== "string" || !relativePath.endsWith(".md")) throw new TypeError("relativePath must name a Markdown file");
  const body = [
    "## Question",
    "",
    view.question,
    "",
    "## Provenance",
    "",
    `Source: \`${view.source.locator}\``,
    "",
    `Digest: \`${view.source.digest}\``,
    "",
  ].join("\n");
  const text = createMarkdownDocument({
    "question-id": view.id,
    "date-created": view.createdAt.slice(0, 10),
    status: view.status,
    sources: [view.source.locator],
    body,
  }, { semanticLinefeeds: false });
  return immutable({ type: "ResearchQuestionDocumentProjection", version: 1, questionId: view.id, relativePath, text });
}

function realizationPlanCandidate(specification) {
  return {
    type: "ArtifactFabricationRealizationPlanCandidate",
    version: 1,
    artifactId: specification.artifact.id,
    specificationDigest: specification.specificationDigest,
    projectionIds: specification.projections.map(({ id }) => id),
    acceptanceObligationIds: specification.acceptanceObligations.map(({ id }) => id),
  };
}

function realizationReceiptCandidate(specification, evidence) {
  return {
    type: "ArtifactFabricationRealizationReceiptCandidate",
    version: 1,
    artifactId: specification.artifact.id,
    specificationDigest: specification.specificationDigest,
    realizations: specification.projections.map(({ id }) => ({ type: "ArtifactFabricationRealizationEvidence", version: 1, projectionId: id, evidence })),
    acceptances: specification.acceptanceObligations.map(({ id }) => ({ type: "ArtifactFabricationRealizationEvidence", version: 1, acceptanceObligationId: id, evidence })),
  };
}

export async function fabricateResearchQuestionDocument(request) {
  if (!exact(request, ["type", "version", "scienceSectionRoot", "question", "specificationCandidate"]) || request.type !== "ResearchQuestionDocumentFabricationRequest" || request.version !== 1 || typeof request.scienceSectionRoot !== "string" || request.scienceSectionRoot === "") {
    return refusal("request", "INVALID_REQUEST", "request must be ResearchQuestionDocumentFabricationRequest@1 with scienceSectionRoot, question, and specificationCandidate");
  }
  const specification = admitArtifactFabricationSpecification(request.specificationCandidate);
  if (specification.type !== "ArtifactFabricationSpecification") return refusal("artifact-specification-admission", specification.code, specification.message, specification.path);
  if (specification.projections.length !== 1) return refusal("projection-selection", "PROJECTION_COUNT", "question-document fabrication requires exactly one projection");
  const [projection] = specification.projections;
  if (projection.target !== QUESTION_DOCUMENT_PROJECTION_TARGET) return refusal("projection-selection", "UNSUPPORTED_PROJECTION_TARGET", `projection target must be ${QUESTION_DOCUMENT_PROJECTION_TARGET}`);
  if (!exact(projection.configuration, ["questionId", "relativePath"]) || projection.configuration.questionId !== request.question.id) {
    return refusal("projection-selection", "INVALID_PROJECTION_CONFIGURATION", "projection configuration must bind the admitted question id and one relativePath");
  }
  const plan = admitArtifactFabricationRealizationPlan(specification, realizationPlanCandidate(specification));
  if (plan.type !== "ArtifactFabricationRealizationPlan") return refusal("realization-plan-preflight", plan.code, plan.message, plan.path);
  let projectionResult;
  let write;
  try {
    projectionResult = projectResearchQuestionDocument(request.question, { relativePath: projection.configuration.relativePath });
    write = await writeMarkdownFile({ root: request.scienceSectionRoot, path: projectionResult.relativePath, text: projectionResult.text, mode: "create", normalization: "preserve" });
  } catch (error) {
    return refusal("question-document-writing", typeof error?.code === "string" ? error.code : "QUESTION_DOCUMENT_WRITE_FAILED", error?.message ?? String(error));
  }
  const evidence = {
    type: "ArtifactFabricationEvidence",
    locator: write.path,
    digest: `sha256:${createHash("sha256").update(write.text, "utf8").digest("hex")}`,
  };
  const realization = admitArtifactFabricationRealizationReceipt(specification, realizationReceiptCandidate(specification, evidence));
  if (realization.type !== "ArtifactFabricationRealizationReceipt") {
    return immutable({ type: "ResearchQuestionDocumentMaterializedWithoutAdmittedReceipt", version: 1, projection: projectionResult, write, realizationRefusal: realization });
  }
  return immutable({
    type: "ResearchQuestionDocumentFabricationReceipt",
    version: 1,
    sourceDigest: specification.source.provenance.digest,
    specificationDigest: specification.specificationDigest,
    projection: projectionResult,
    write,
    artifactFabricationSpecification: specification,
    artifactFabricationRealizationReceipt: realization,
  });
}
