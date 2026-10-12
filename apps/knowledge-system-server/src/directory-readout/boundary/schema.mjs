
import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";

import { dataArtifactSchemaContractSchema } from "@red-cup-engineering/computer-system-engine/journal/data-artifact-schema";

const jsonValueSchema = {};
const nonemptyStringSchema = { type: "string", minLength: 1 };
const nonNegativeIntegerSchema = { type: "integer", minimum: 0 };
const stringSequenceSchema = { type: "array", items: nonemptyStringSchema };

export const directoryReadoutRequestSchema = {
  $id: "metroplat/services/directory-readout/read-request",
  title: "DirectoryReadoutRequest",
  description: "A filesystem-bounded request to read one arbitrary directory as admitted surfaces, shroud/frontier evidence, and available follow-up reads.",
  type: "object",
  required: ["kind", "root"],
  additionalProperties: false,
  properties: {
    kind: { const: "metroplat.directory-readout.read-request" },
    root: nonemptyStringSchema,
    darkSampleCap: nonNegativeIntegerSchema,
    at: jsonValueSchema,
    caller: jsonValueSchema,
  },
};

export const directoryReadoutRequestContract = schemaFrom(directoryReadoutRequestSchema);

export const directoryReadoutSurfaceSchema = {
  type: "object",
  required: ["kind", "label", "evidence", "nextReads"],
  additionalProperties: false,
  properties: {
    kind: nonemptyStringSchema,
    label: nonemptyStringSchema,
    path: { type: "string" },
    count: nonNegativeIntegerSchema,
    evidence: stringSequenceSchema,
    nextReads: stringSequenceSchema,
  },
};

export const directoryReadoutShroudSchema = {
  type: "object",
  required: ["kind", "reason", "evidence", "nextReads"],
  additionalProperties: false,
  properties: {
    kind: nonemptyStringSchema,
    reason: nonemptyStringSchema,
    path: { type: "string" },
    count: nonNegativeIntegerSchema,
    evidence: stringSequenceSchema,
    nextReads: stringSequenceSchema,
  },
};

export const directoryReadoutNextReadSchema = {
  type: "object",
  required: ["surface", "verb", "reason"],
  additionalProperties: false,
  properties: {
    surface: { enum: ["service-action", "filesystem", "package-api", "conurbation", "run-causal-set", "session-presence", "journal"] },
    verb: nonemptyStringSchema,
    path: { type: "string" },
    reason: nonemptyStringSchema,
  },
};

export const directoryReadoutTreeSchema = {
  type: "object",
  required: ["path", "files", "loc", "truncated", "darkFiles", "statFailures"],
  additionalProperties: false,
  properties: {
    path: nonemptyStringSchema,
    files: nonNegativeIntegerSchema,
    loc: nonNegativeIntegerSchema,
    truncated: { type: "boolean" },
    darkFiles: nonNegativeIntegerSchema,
    statFailures: nonNegativeIntegerSchema,
  },
};

export const directoryReadoutPackageSchema = {
  type: "object",
  required: ["root", "relative", "admitted"],
  additionalProperties: false,
  properties: {
    root: nonemptyStringSchema,
    relative: { type: "string" },
    admitted: { type: "boolean" },
    name: { type: "string" },
    private: { type: "boolean" },
    dependencies: nonNegativeIntegerSchema,
    reason: { type: "string" },
  },
};

export const directoryReadoutSchema = {
  $id: "metroplat/services/directory-readout/read",
  title: "DirectoryReadout",
  description: "A composed observation of one arbitrary directory: finite support, admitted surface candidates, shroud evidence, and available follow-up reads over existing MetroPlat boundaries. Content-bearing language interpretation remains an explicit follow-up monitor.",
  type: "object",
  required: [
    "kind",
    "operation",
    "root",
    "support",
    "legibility",
    "workspace",
    "surfaces",
    "shroud",
    "nextReads",
    "trees",
  ],
  additionalProperties: false,
  properties: {
    kind: { const: "metroplat.directory-readout.read" },
    operation: { const: "read-directory-readout" },
    root: nonemptyStringSchema,
    support: {
      type: "object",
      required: ["files", "loc", "truncated", "markdownFiles", "hasDataLogs", "hasContent"],
      additionalProperties: false,
      properties: {
        files: nonNegativeIntegerSchema,
        loc: nonNegativeIntegerSchema,
        truncated: { type: "boolean" },
        markdownFiles: nonNegativeIntegerSchema,
        hasDataLogs: { type: "boolean" },
        hasContent: { type: "boolean" },
      },
    },
    legibility: {
      type: "object",
      required: ["files", "legibilityRatio", "darkTotal", "darkSample", "statFailures"],
      additionalProperties: false,
      properties: {
        files: nonNegativeIntegerSchema,
        legibilityRatio: { type: ["number", "null"] },
        darkTotal: nonNegativeIntegerSchema,
        darkSample: stringSequenceSchema,
        statFailures: nonNegativeIntegerSchema,
      },
    },
    workspace: {
      type: "object",
      required: ["packages", "admittedPackages", "failedPackages", "unsupportedPatterns"],
      additionalProperties: false,
      properties: {
        packages: nonNegativeIntegerSchema,
        admittedPackages: nonNegativeIntegerSchema,
        failedPackages: nonNegativeIntegerSchema,
        unsupportedPatterns: stringSequenceSchema,
      },
    },
    surfaces: { type: "array", items: directoryReadoutSurfaceSchema },
    shroud: { type: "array", items: directoryReadoutShroudSchema },
    nextReads: { type: "array", items: directoryReadoutNextReadSchema },
    trees: { type: "array", items: directoryReadoutTreeSchema },
    packages: { type: "array", items: directoryReadoutPackageSchema },
  },
};

export const directoryReadoutContract = schemaFrom(directoryReadoutSchema);

export const directoryReadoutRecordSchema = {
  $id: "metroplat/services/directory-readout/record",
  title: "DirectoryReadoutRecord",
  description: "A recorded arbitrary-directory observation: the bounded readout plus its EAVT/RWIL statement rows and derived log/state/record artifact paths.",
  type: "object",
  required: ["kind", "operation", "root", "dataRoot", "at", "readout", "journal", "artifacts"],
  additionalProperties: false,
  properties: {
    kind: { const: "metroplat.directory-readout.record" },
    operation: { const: "record-directory-readout" },
    root: nonemptyStringSchema,
    dataRoot: nonemptyStringSchema,
    at: jsonValueSchema,
    readout: directoryReadoutSchema,
    journal: {
      type: "object",
      required: ["feed", "rows", "rwilRows", "eavtRows", "appended"],
      additionalProperties: false,
      properties: {
        feed: nonemptyStringSchema,
        rows: nonNegativeIntegerSchema,
        rwilRows: nonNegativeIntegerSchema,
        eavtRows: nonNegativeIntegerSchema,
        appended: nonNegativeIntegerSchema,
      },
    },
    artifacts: {
      type: "object",
      required: ["log", "state", "record"],
      additionalProperties: false,
      properties: {
        log: dataArtifactSchemaContractSchema,
        state: dataArtifactSchemaContractSchema,
        record: dataArtifactSchemaContractSchema,
      },
    },
  },
};

export const directoryReadoutRecordContract = schemaFrom(directoryReadoutRecordSchema);

