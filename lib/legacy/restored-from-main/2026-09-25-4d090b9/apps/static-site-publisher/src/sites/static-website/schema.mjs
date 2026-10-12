
import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";
import { dataArtifactSchemaContractMaterial } from "@red-cup-engineering/computer-system-engine/journal/data-artifact-schema";

const nonemptyStringSchema = { type: "string", minLength: 1 };
const nonnegativeIntegerSchema = { type: "integer", minimum: 0 };

export const staticWebsiteContentArtifactSchema = {
  $id: "metroplat/projections/boundaries/static-website-content/artifact",
  title: "StaticWebsiteContentArtifact",
  description: "Receipt for one static-website output path written as a durable data/content artifact.",
  type: "object",
  required: ["kind", "outputPath", "path", "bytes", "artifact"],
  properties: {
    kind: { const: "metroplat.static-website-content-artifact" },
    outputPath: nonemptyStringSchema,
    path: nonemptyStringSchema,
    bytes: nonnegativeIntegerSchema,
    artifact: dataArtifactSchemaContractMaterial.schema,
  },
  additionalProperties: false,
};

export const staticWebsiteContentManifestSchema = {
  $id: "metroplat/projections/boundaries/static-website-content/manifest",
  title: "StaticWebsiteContentManifest",
  description: "Manifest indexing the finite static-website content artifacts emitted under data/content.",
  type: "object",
  required: ["kind", "root", "date", "action", "subject", "directory", "files"],
  properties: {
    kind: { const: "metroplat.static-website-content-manifest" },
    root: nonemptyStringSchema,
    date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    action: nonemptyStringSchema,
    subject: nonemptyStringSchema,
    directory: nonemptyStringSchema,
    files: { type: "array", items: staticWebsiteContentArtifactSchema },
  },
  additionalProperties: false,
};

export const staticWebsiteContentProjectionSchema = {
  $id: "metroplat/projections/boundaries/static-website-content/projection",
  title: "StaticWebsiteContentProjection",
  description: "Receipt for writing a finite static-website file map into durable data/content artifacts.",
  type: "object",
  required: [
    "kind",
    "operation",
    "root",
    "path",
    "artifact",
    "manifest",
    "artifacts",
    "paths",
    "files",
    "bytes",
  ],
  properties: {
    kind: { const: "metroplat.static-website-content-observation" },
    operation: { const: "project-static-website-content" },
    root: nonemptyStringSchema,
    path: nonemptyStringSchema,
    artifact: dataArtifactSchemaContractMaterial.schema,
    manifest: dataArtifactSchemaContractMaterial.schema,
    artifacts: { type: "array", items: dataArtifactSchemaContractMaterial.schema },
    paths: { type: "array", items: nonemptyStringSchema },
    files: nonnegativeIntegerSchema,
    bytes: nonnegativeIntegerSchema,
  },
  additionalProperties: false,
};

export const staticWebsiteContentManifestReadSchema = {
  $id: "metroplat/projections/boundaries/static-website-content/manifest-read",
  title: "StaticWebsiteContentManifestRead",
  description: "Receipt for explicitly reading one durable static-website content manifest path.",
  type: "object",
  required: [
    "kind",
    "operation",
    "root",
    "path",
    "artifact",
    "manifest",
  ],
  properties: {
    kind: { const: "metroplat.static-website-content-observation" },
    operation: { const: "read-static-website-content-manifest" },
    root: nonemptyStringSchema,
    path: nonemptyStringSchema,
    artifact: dataArtifactSchemaContractMaterial.schema,
    manifest: staticWebsiteContentManifestSchema,
  },
  additionalProperties: false,
};

export const staticWebsiteContentArtifactContract = schemaFrom(staticWebsiteContentArtifactSchema);

export const staticWebsiteContentManifestContract = schemaFrom(staticWebsiteContentManifestSchema);

export const staticWebsiteContentProjectionContract = schemaFrom(staticWebsiteContentProjectionSchema);

export const staticWebsiteContentManifestReadContract = schemaFrom(staticWebsiteContentManifestReadSchema);

