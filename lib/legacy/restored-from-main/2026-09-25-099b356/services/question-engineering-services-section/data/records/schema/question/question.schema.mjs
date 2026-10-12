export const researchQuestionCandidateSchema = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "@red-cup-engineering/question-engineering-services-section/research-question-candidate",
  title: "ResearchQuestionCandidate",
  type: "object",
  additionalProperties: false,
  required: ["type", "version", "id", "question", "source", "createdAt"],
  properties: {
    type: { const: "ResearchQuestionCandidate" },
    version: { const: 1 },
    id: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    question: { type: "string", minLength: 1 },
    createdAt: { type: "string", format: "date-time" },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["type", "version", "locator", "digest"],
      properties: {
        type: { const: "ResearchQuestionSource" },
        version: { const: 1 },
        locator: { type: "string", minLength: 1 },
        digest: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      },
    },
  },
});
