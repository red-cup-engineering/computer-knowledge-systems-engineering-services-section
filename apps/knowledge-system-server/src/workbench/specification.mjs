/** File-backed BCP 14 specification inspection and journaled Markdown editing. */
import { specificationReadout, specificationRequirementsXml } from "@red-cup-engineering/specification-engineering-services-section/specification-readout";

import { schemaFrom } from "@red-cup-engineering/relating/carriers/schema";
import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";

import { runMarkdownFileWorkbench } from "./markdown.mjs";

const specificationWorkbenchRequestSchema = {
  $id: "metroplat/filesystem/specification-workbench-request",
  type: "object",
  required: ["path"],
  additionalProperties: false,
  properties: {
    path: { type: "string", minLength: 1 },
    operations: { type: "array", items: { type: "object", required: ["operation"], additionalProperties: true, properties: { operation: { type: "string" } } } },
    write: { type: "boolean" },
    includeXml: { type: "boolean" },
    token: { type: "string" },
    at: { type: "string" },
  },
};

const specificationWorkbenchResponseSchema = {
  $id: "metroplat/filesystem/specification-workbench-response",
  type: "object",
  required: ["kind", "path", "specification", "changed", "persisted"],
  additionalProperties: true,
  properties: {
    kind: { const: "metroplat.specification.workbench-response" },
    path: { type: "string" },
    specification: { type: "object", additionalProperties: true },
    requirementsXml: { type: "string" },
    edit: { type: "object", additionalProperties: true },
    writeReceipt: { type: "object", additionalProperties: true },
    changed: { type: "boolean" },
    persisted: { type: "boolean" },
  },
};

export const specificationWorkbenchRequestContract = schemaFrom(specificationWorkbenchRequestSchema);
export const specificationWorkbenchResponseContract = schemaFrom(specificationWorkbenchResponseSchema);

export async function runSpecificationWorkbench(binding, request) {
  const markdownRequest = Object.freeze({
    path: request.path,
    ...(request.operations === undefined ? {} : { operations: request.operations }),
    ...(request.write === undefined ? {} : { write: request.write }),
    ...(request.token === undefined ? {} : { token: request.token }),
    ...(request.at === undefined ? {} : { at: request.at }),
  });
  const result = await runMarkdownFileWorkbench(binding, markdownRequest);
  const final = result.after ?? result.before;
  const specification = specificationReadout(final.source.text);
  return Object.freeze({
    kind: "metroplat.specification.workbench-response",
    path: request.path,
    specification,
    ...(request.includeXml === true ? { requirementsXml: specificationRequirementsXml(specification) } : {}),
    ...(result.edit === undefined ? {} : { edit: result.edit }),
    ...(result.writeReceipt === undefined ? {} : { writeReceipt: result.writeReceipt }),
    changed: result.changed,
    persisted: result.persisted,
  });
}

export function specificationWorkbenchOperations(binding) {
  return Object.freeze([operation({
    verb: "specification-workbench",
    inputFormat: "json",
    outputFormat: "json",
    summary: "Inspect and structurally refine a BCP 14 Markdown specification.",
    description: "Extracts uppercase RFC 2119/RFC 8174 requirements with source coordinates, reports missing BCP 14 references, optionally projects the requirement index to XML, and composes journaled Markdown edits when write=true.",
    domain: specificationWorkbenchRequestContract,
    codomain: specificationWorkbenchResponseContract,
    relation: "projection",
    run: (input) => runSpecificationWorkbench(binding, input),
  })]);
}
