/**
 * @packageDocumentation
 *
 * apps/infograph/operations/markdown - programmatic Markdown document operation.
 *
 * This is the package operation for working with one Markdown document as material:
 * inspect the current readout, optionally apply structured Markdown edit
 * operations, and inspect the resulting readout. File persistence stays with
 * filesystem's `write`; this operation is the pure document operation surface.
 */
import { schemaFrom } from "@red-cup-engineering/relating/carriers/schema";
import { } from "@red-cup-engineering/json-services-section";
import { applyMarkdownEdit, isMarkdownEditRequest, markdownEditRequestKind } from "@red-cup-engineering/markdown-engineering-services-section/apply-markdown-edit";
import { readMarkdownWorkbench } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-workbench";
import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";

const markdownWorkbenchRequestSchema = {
  $id: "metroplat/markdown/workbench-request",
  title: "MarkdownWorkbenchRequest",
  description: "Request to inspect and optionally transform one Markdown document text.",
  type: "object",
  required: ["text"],
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    coordinate: { type: "string" },
    subject: { type: "string" },
    jsonObjectFrontmatter: { type: "boolean" },
    frontmatterFormats: {
      type: "array",
      items: { enum: ["yaml", "toml"] },
    },
    forbiddenFrontmatterKeys: {
      type: "array",
      items: { type: "string" },
    },
    operations: {
      type: "array",
      items: {
        type: "object",
        required: ["operation"],
        additionalProperties: true,
        properties: {
          operation: { type: "string" },
        },
      },
    },
  },
};

const markdownWorkbenchResponseSchema = {
  $id: "metroplat/markdown/workbench-response",
  title: "MarkdownWorkbenchResponse",
  description: "Before/after workbench readouts and optional structured edit receipt for one Markdown text.",
  type: "object",
  required: ["kind", "before", "text"],
  additionalProperties: true,
  properties: {
    kind: { const: "metroplat.markdown.workbench-response" },
    before: { type: "object", additionalProperties: true },
    after: { type: "object", additionalProperties: true },
    edit: { type: "object", additionalProperties: true },
    text: { type: "string" },
    changed: { type: "boolean" },
  },
};

export const markdownWorkbenchRequestContract = schemaFrom(markdownWorkbenchRequestSchema);
export const markdownWorkbenchResponseContract = schemaFrom(markdownWorkbenchResponseSchema);

function recordValue(value) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
  throw new TypeError("markdown-workbench input must be an object");
}

function requestOptions(request) {
  return Object.freeze({
    ...(request.coordinate === undefined ? {} : { coordinate: request.coordinate }),
    ...(request.subject === undefined ? {} : { subject: request.subject }),
    ...(request.jsonObjectFrontmatter === undefined ? {} : { jsonObjectFrontmatter: request.jsonObjectFrontmatter }),
    ...(request.frontmatterFormats === undefined ? {} : { frontmatterFormats: request.frontmatterFormats }),
    ...(request.forbiddenFrontmatterKeys === undefined ? {} : { forbiddenFrontmatterKeys: request.forbiddenFrontmatterKeys }),
  });
}

function editApplication(request) {
  if (request.operations === undefined) return undefined;
  const editRequest = Object.freeze({
    kind: markdownEditRequestKind,
    operations: request.operations,
  });
  if (!isMarkdownEditRequest(editRequest)) {
    throw new TypeError("markdown-workbench operations must be valid metroplat markdown edit operations");
  }
  return applyMarkdownEdit(request.text, editRequest);
}

function markdownWorkbenchOperationRun(input) {
  const request = recordValue(input);
  const options = requestOptions(request);
  const before = readMarkdownWorkbench(request.text, options);
  const edit = editApplication(request);
  const text = edit?.text ?? request.text;
  const after = edit === undefined ? undefined : readMarkdownWorkbench(text, options);
  return Object.freeze({
    kind: "metroplat.markdown.workbench-response",
    before,
    ...(after === undefined ? {} : { after }),
    ...(edit === undefined ? {} : { edit: edit.receipt }),
    text,
    changed: text !== request.text,
  });
}

export const markdownWorkbenchOperation = operation({
  verb: "markdown-workbench",
  inputFormat: "json",
  outputFormat: "json",
  summary: "Inspect and transform one Markdown document through MetroPlat's Markdown workbench.",
  description: "Domain: MarkdownWorkbenchRequest. Codomain: MarkdownWorkbenchResponse. Reads decoded frontmatter, body, structure, features, assertions, validation, HTML, normalized candidate documents, and optionally applies structured Markdown edit operations.",
  domain: markdownWorkbenchRequestContract,
  codomain: markdownWorkbenchResponseContract,
  run: markdownWorkbenchOperationRun,
});

export const markdownOperations = Object.freeze([
  markdownWorkbenchOperation,
]);
