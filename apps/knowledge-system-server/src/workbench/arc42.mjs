/**
 * Filesystem boundary for bounded arc42 SAD review and structured refinement.
 * The current host carrier is often Markdown, but the operation reads arc42
 * architecture-description material into a structured, content-addressed
 * readout and can project that readout to XML, HTML, and SEN presentations.
 * Persistent carrier edits compose the existing Markdown workbench when the
 * requested path is a Markdown artifact.
 */
import {
  arc42ProjectionLanguageReadout,
  sadReadout,
  sadReadoutHtml,
  sadReadoutXml,

} from "@red-cup-engineering/communicating/language/arc42";

import { addressTextDocument, artifactId } from "@red-cup-engineering/semiotic-eavt-services-section/identity";
import {
  developmentProgressionOf,

} from "@red-cup-engineering/communicating/language/development";

import { schemaFrom } from "@red-cup-engineering/relating/carriers/schema";
import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";

import {
  runMarkdownFileWorkbench,

} from "./markdown.mjs";
import { eavtRecord, toEavt } from "@red-cup-engineering/eavt-services-section/row";

const arc42SadWorkbenchRequestSchema = {
  $id: "metroplat/filesystem/arc42-sad-workbench-request",
  title: "Arc42SadWorkbenchRequest",
  description: "Request to inspect one numbered arc42 SAD review unit and optionally apply structured carrier edits.",
  type: "object",
  required: ["path"],
  additionalProperties: false,
  properties: {
    path: { type: "string", minLength: 1 },
    section: { type: "string", minLength: 1 },
    operations: {
      type: "array",
      items: {
        type: "object",
        required: ["operation"],
        additionalProperties: true,
        properties: { operation: { type: "string" } },
      },
    },
    write: { type: "boolean" },
    includeXml: { type: "boolean" },
    includeHtml: { type: "boolean" },
    includeProjections: {
      type: "array",
      items: { enum: ["xml2arc42", "html", "sen"] },
      uniqueItems: true,
    },
    includeRefinementPacket: { type: "boolean" },
    evidenceSources: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "path", "locator"],
        additionalProperties: false,
        properties: {
          kind: { enum: ["formal-declaration", "corpus", "design-commitment", "implementation-conformance"] },
          path: { type: "string", minLength: 1 },
          locator: { type: "string", minLength: 1 },
        },
      },
    },
    developmentArtifacts: { type: "array", items: { type: "object", additionalProperties: true } },
    token: { type: "string" },
    at: { type: "string" },
  },
};

const artifactRefSchema = { type: "string", minLength: 1 };
const nonemptyStringSchema = { type: "string", minLength: 1 };
const stringArraySchema = {
  type: "array",
  items: nonemptyStringSchema,
};
const eavtRowSchema = {
  type: "array",
  minItems: 4,
  maxItems: 4,
  items: [{}, {}, {}, {}],
};

const arc42ProjectionBaseSchema = {
  type: "object",
  required: ["kind", "projection", "mediaType", "carrier", "address", "validationScope", "lossProfile", "content"],
  additionalProperties: false,
  properties: {
    kind: { const: "metroplat.arc42.projection" },
    projection: { enum: ["xml2arc42", "html", "sen"] },
    mediaType: nonemptyStringSchema,
    carrier: artifactRefSchema,
    address: artifactRefSchema,
    validationScope: {
      type: "array",
      minItems: 1,
      items: nonemptyStringSchema,
    },
    lossProfile: stringArraySchema,
    content: { type: "string" },
    artifact: { type: "object", additionalProperties: true },
    translation: { type: "object", additionalProperties: true },
  },
};

const arc42ProjectionSchema = {
  oneOf: [
    {
      ...arc42ProjectionBaseSchema,
      properties: {
        ...arc42ProjectionBaseSchema.properties,
        projection: { const: "xml2arc42" },
        mediaType: { const: "application/xml" },
      },
    },
    {
      ...arc42ProjectionBaseSchema,
      properties: {
        ...arc42ProjectionBaseSchema.properties,
        projection: { const: "html" },
        mediaType: { const: "text/html" },
      },
    },
    {
      ...arc42ProjectionBaseSchema,
      properties: {
        ...arc42ProjectionBaseSchema.properties,
        projection: { const: "sen" },
        mediaType: { const: "application/vnd.metroplat.arc42.sen+json" },
      },
    },
  ],
};

const arc42ProjectionSetSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    xml2arc42: arc42ProjectionSchema,
    html: arc42ProjectionSchema,
    sen: arc42ProjectionSchema,
  },
};

const arc42StatementSetSchema = {
  type: "object",
  required: ["kind", "carrier", "address", "rows"],
  additionalProperties: false,
  properties: {
    kind: { const: "metroplat.arc42.statement-set" },
    carrier: artifactRefSchema,
    address: artifactRefSchema,
    rows: {
      type: "array",
      items: eavtRowSchema,
    },
  },
};

const arc42SelectedReviewUnitAnalysisSchema = {
  type: "object",
  required: ["entity"],
  additionalProperties: false,
  properties: {
    entity: nonemptyStringSchema,
    sectionId: nonemptyStringSchema,
    title: nonemptyStringSchema,
    carrierText: { type: "string" },
  },
};

const arc42ViewpointAnalysisSchema = {
  type: "object",
  required: ["entity", "viewpoint"],
  additionalProperties: false,
  properties: {
    entity: nonemptyStringSchema,
    sectionId: nonemptyStringSchema,
    viewpoint: nonemptyStringSchema,
    modelKind: nonemptyStringSchema,
    concern: nonemptyStringSchema,
  },
};

const arc42ProjectionAnalysisSchema = {
  type: "object",
  required: ["entity", "validationScope", "lossProfile"],
  additionalProperties: false,
  properties: {
    entity: nonemptyStringSchema,
    projectionKind: nonemptyStringSchema,
    mediaType: nonemptyStringSchema,
    address: artifactRefSchema,
    languageArtifact: artifactRefSchema,
    translationWitness: artifactRefSchema,
    sourceLanguage: nonemptyStringSchema,
    targetLanguage: nonemptyStringSchema,
    semanticAddress: artifactRefSchema,
    validationScope: stringArraySchema,
    lossProfile: stringArraySchema,
  },
};

const arc42ProjectionFamilySchema = {
  type: "object",
  required: [
    "kind",
    "entity",
    "semanticAddress",
    "members",
    "projectionKinds",
    "targetLanguages",
    "translationWitnesses",
    "completeCarrierSet",
    "address",
  ],
  additionalProperties: false,
  properties: {
    kind: { const: "metroplat.arc42.projection-family" },
    entity: nonemptyStringSchema,
    semanticAddress: artifactRefSchema,
    sourceLanguage: nonemptyStringSchema,
    members: stringArraySchema,
    projectionKinds: stringArraySchema,
    targetLanguages: stringArraySchema,
    translationWitnesses: stringArraySchema,
    completeCarrierSet: { type: "boolean" },
    address: artifactRefSchema,
  },
};

const arc42ImplementationConformanceGapSchema = {
  type: "object",
  required: ["entity"],
  additionalProperties: false,
  properties: {
    entity: nonemptyStringSchema,
    riskTitle: nonemptyStringSchema,
    evidenceBoundary: nonemptyStringSchema,
    evidenceStatus: { enum: ["unaddressed", "bounded-conformance-evidence"] },
    conformanceEvidence: stringArraySchema,
    line: { type: "integer", minimum: 1 },
  },
};

const arc42StatementAnalysisSchema = {
  type: "object",
  required: [
    "kind",
    "carrier",
    "statementSet",
    "address",
    "counts",
    "missingArc42Sections",
    "viewpoints",
    "projections",
    "projectionFamilies",
    "implementationConformanceGaps",
  ],
  additionalProperties: false,
  properties: {
    kind: { const: "metroplat.arc42.statement-analysis" },
    carrier: artifactRefSchema,
    statementSet: artifactRefSchema,
    address: artifactRefSchema,
    counts: {
      type: "object",
      required: [
        "rows",
        "sections",
        "reviewUnits",
        "evidenceSignals",
        "projections",
        "viewpoints",
        "modelKinds",
        "concerns",
        "validationScopes",
        "validationJudgments",
        "projectionLossProfiles",
        "projectionLosses",
        "languageArtifacts",
        "translationWitnesses",
        "projectionFamilies",
        "projectionFamilyMembers",
        "semanticAddresses",
        "implementationConformanceGaps",
        "conformanceEvidenceLinks",
        "evidenceBoundaries",
        "missingArc42Sections",
      ],
      additionalProperties: false,
      properties: {
        rows: { type: "integer", minimum: 0 },
        sections: { type: "integer", minimum: 0 },
        reviewUnits: { type: "integer", minimum: 0 },
        evidenceSignals: { type: "integer", minimum: 0 },
        projections: { type: "integer", minimum: 0 },
        viewpoints: { type: "integer", minimum: 0 },
        modelKinds: { type: "integer", minimum: 0 },
        concerns: { type: "integer", minimum: 0 },
        validationScopes: { type: "integer", minimum: 0 },
        validationJudgments: { type: "integer", minimum: 0 },
        projectionLossProfiles: { type: "integer", minimum: 0 },
        projectionLosses: { type: "integer", minimum: 0 },
        languageArtifacts: { type: "integer", minimum: 0 },
        translationWitnesses: { type: "integer", minimum: 0 },
        projectionFamilies: { type: "integer", minimum: 0 },
        projectionFamilyMembers: { type: "integer", minimum: 0 },
        semanticAddresses: { type: "integer", minimum: 0 },
        implementationConformanceGaps: { type: "integer", minimum: 0 },
        conformanceEvidenceLinks: { type: "integer", minimum: 0 },
        evidenceBoundaries: { type: "integer", minimum: 0 },
        missingArc42Sections: { type: "integer", minimum: 0 },
      },
    },
    missingArc42Sections: {
      type: "array",
      items: { type: "integer", minimum: 1 },
    },
    selectedReviewUnit: arc42SelectedReviewUnitAnalysisSchema,
    viewpoints: { type: "array", items: arc42ViewpointAnalysisSchema },
    projections: { type: "array", items: arc42ProjectionAnalysisSchema },
    projectionFamilies: { type: "array", items: arc42ProjectionFamilySchema },
    implementationConformanceGaps: { type: "array", items: arc42ImplementationConformanceGapSchema },
  },
};

const arc42ImprovementFindingSchema = {
  type: "object",
  required: ["kind", "code", "severity", "subject", "title", "detail", "recommendedAction", "evidence", "address"],
  additionalProperties: false,
  properties: {
    kind: { const: "metroplat.arc42.improvement-finding" },
    code: { enum: ["missing-arc42-section", "implementation-conformance-gap", "implementation-conformance-evidence", "projection-loss-boundary"] },
    severity: { enum: ["info", "warning", "risk"] },
    subject: nonemptyStringSchema,
    title: nonemptyStringSchema,
    detail: nonemptyStringSchema,
    recommendedAction: nonemptyStringSchema,
    evidence: stringArraySchema,
    projectionKind: nonemptyStringSchema,
    validationScope: stringArraySchema,
    lossProfile: stringArraySchema,
    evidenceBoundary: nonemptyStringSchema,
    evidenceStatus: nonemptyStringSchema,
    sectionId: nonemptyStringSchema,
    line: { type: "integer", minimum: 1 },
    address: artifactRefSchema,
  },
};

const arc42RiskRefinementSchema = {
  type: "object",
  required: [
    "kind",
    "gap",
    "riskTitle",
    "evidenceStatus",
    "boundedEvidence",
    "boundedEvidenceCount",
    "remainingObligation",
    "carrierAlreadyDistinguished",
    "address",
  ],
  additionalProperties: false,
  properties: {
    kind: { const: "metroplat.arc42.risk-refinement" },
    gap: nonemptyStringSchema,
    riskTitle: nonemptyStringSchema,
    evidenceStatus: { const: "bounded-conformance-evidence" },
    boundedEvidence: stringArraySchema,
    boundedEvidenceCount: { type: "integer", minimum: 1 },
    remainingObligation: nonemptyStringSchema,
    carrierAlreadyDistinguished: { type: "boolean" },
    carrierOperation: { type: "object", additionalProperties: true },
    address: artifactRefSchema,
  },
};

const arc42ImprovementReadoutSchema = {
  type: "object",
  required: ["kind", "carrier", "statementAnalysis", "counts", "findings", "riskRefinements", "rows", "address"],
  additionalProperties: false,
  properties: {
    kind: { const: "metroplat.arc42.improvement-readout" },
    carrier: artifactRefSchema,
    statementAnalysis: artifactRefSchema,
    counts: {
      type: "object",
      required: ["findings", "risks", "warnings", "infos", "riskRefinements", "rows"],
      additionalProperties: false,
      properties: {
        findings: { type: "integer", minimum: 0 },
        risks: { type: "integer", minimum: 0 },
        warnings: { type: "integer", minimum: 0 },
        infos: { type: "integer", minimum: 0 },
        riskRefinements: { type: "integer", minimum: 0 },
        rows: { type: "integer", minimum: 0 },
      },
    },
    findings: { type: "array", items: arc42ImprovementFindingSchema },
    riskRefinements: { type: "array", items: arc42RiskRefinementSchema },
    rows: { type: "array", items: eavtRowSchema },
    address: artifactRefSchema,
  },
};

const arc42SadWorkbenchResponseSchema = {
  $id: "metroplat/filesystem/arc42-sad-workbench-response",
  title: "Arc42SadWorkbenchResponse",
  description: "Bounded arc42 architecture-description readout with optional carrier projections, structured-edit receipts, and journal-write receipts.",
  type: "object",
  required: ["kind", "path", "sad", "statementSet", "analysis", "improvement", "changed", "persisted"],
  additionalProperties: true,
  properties: {
    kind: { const: "metroplat.arc42.sad-workbench-response" },
    path: { type: "string" },
    sad: { type: "object", additionalProperties: true },
    projections: arc42ProjectionSetSchema,
    statementSet: arc42StatementSetSchema,
    analysis: arc42StatementAnalysisSchema,
    improvement: arc42ImprovementReadoutSchema,
    sadXml: { type: "string" },
    sadHtml: { type: "string" },
    refinementPacket: { type: "object", additionalProperties: true },
    edit: { type: "object", additionalProperties: true },
    writeReceipt: { type: "object", additionalProperties: true },
    changed: { type: "boolean" },
    persisted: { type: "boolean" },
  },
};

export const arc42SadWorkbenchRequestContract = schemaFrom(arc42SadWorkbenchRequestSchema);
export const arc42SadWorkbenchResponseContract = schemaFrom(arc42SadWorkbenchResponseSchema);

function evidenceReadout(request, options) {
  let text;
  try {
    text = options.readFileUtf8(request.path);
  } catch {
    return Object.freeze({ ...request, obstruction: "unreadable-source" });
  }
  const matches = Object.freeze(text.split("\n")
    .map((line, index) => Object.freeze({ line: index + 1, text: line }))
    .filter((line) => line.text.includes(request.locator))
    .slice(0, 32));
  if (matches.length === 0) return Object.freeze({ ...request, obstruction: "locator-not-found" });
  return Object.freeze({
    ...request,
    source: addressTextDocument(text).ref,
    matches,
  });
}

function refinementPacketOf(sad, request, options) {
  const reviewUnit = sad.reviewUnit;
  if (reviewUnit === undefined) throw new TypeError("arc42 refinement packet requires one selected review unit");
  const evidenceResults = (request.evidenceSources ?? []).map((source) => evidenceReadout(source, options));
  const evidence = Object.freeze(evidenceResults.filter((entry) => "source" in entry));
  const evidenceObstructions = Object.freeze(evidenceResults.filter((entry) => "obstruction" in entry));
  const development = request.developmentArtifacts === undefined
    ? undefined
    : developmentProgressionOf(request.developmentArtifacts);
  const reviewUnitCarrier = addressTextDocument(reviewUnit.text).ref;
  const body = Object.freeze({
    kind: "metroplat.arc42.refinement-packet",
    version: 1,
    section: Object.freeze({
      id: reviewUnit.id,
      title: reviewUnit.title,
      startLine: reviewUnit.startLine,
      endLine: reviewUnit.endLine,
      carrier: reviewUnitCarrier,
      source: reviewUnitCarrier,
    }),
    evidence,
    evidenceObstructions,
    ...(development === undefined ? {} : { development }),
  });
  return Object.freeze({ ...body, address: artifactId(body) });
}

function requestedProjectionKinds(request) {
  const kinds = new Set(request.includeProjections ?? []);
  if (request.includeXml === true) kinds.add("xml2arc42");
  if (request.includeHtml === true) kinds.add("html");
  return Object.freeze([...kinds].sort());
}

function projectionOf(sad, projection, basis) {
  const readout = arc42ProjectionLanguageReadout(sad, projection, basis);
  return Object.freeze({
    kind: "metroplat.arc42.projection",
    projection,
    mediaType: readout.mediaType,
    carrier: sad.carrier,
    address: addressTextDocument(readout.content).ref,
    validationScope: readout.validationScope,
    lossProfile: readout.lossProfile,
    content: readout.content,
    artifact: readout.artifact,
    translation: readout.translation,
  });
}

function projectionSetOfKinds(
  sad,
  kinds,
  basis,
) {
  if (kinds.length === 0) return undefined;
  const entries = kinds.map((kind) => [kind, projectionOf(sad, kind, basis)]);
  return Object.freeze(Object.fromEntries(entries));
}

function projectionSetOf(sad, request, basis) {
  return projectionSetOfKinds(sad, requestedProjectionKinds(request), basis);
}

function projectionEntity(carrier, projection) {
  return `metroplat:arc42:projection:${carrier}#${projection}`;
}

function projectionAnalysisOf(carrier, projection) {
  const entity = projectionEntity(carrier, projection.projection);
  return Object.freeze({
    entity,
    projectionKind: projection.projection,
    mediaType: projection.mediaType,
    address: projection.address,
    ...(projection.artifact === undefined ? {} : { languageArtifact: projection.artifact.address }),
    ...(projection.translation === undefined ? {} : {
      translationWitness: projection.translation.address,
      sourceLanguage: projection.translation.sourceLanguage,
      targetLanguage: projection.translation.targetLanguage,
      semanticAddress: projection.translation.semanticAddress,
    }),
    validationScope: projection.validationScope,
    lossProfile: projection.lossProfile,
  });
}

function statementSetOf(sad, projections) {
  const t = `metroplat:arc42:statement-set:${sad.carrier}`;
  const rows = [...sad.statementRows];
  const projectionAnalyses = [];
  for (const projection of Object.values(projections ?? {})) {
    if (projection === undefined) continue;
    const entity = projectionEntity(sad.carrier, projection.projection);
    projectionAnalyses.push(projectionAnalysisOf(sad.carrier, projection));
    rows.push(
      toEavt({ e: sad.carrier, a: "arc42.projection", v: entity, t }),
      toEavt({ e: entity, a: "metroplat.kind", v: "metroplat.arc42.projection", t }),
      toEavt({ e: entity, a: "arc42.projection-kind", v: projection.projection, t }),
      toEavt({ e: entity, a: "arc42.media-type", v: projection.mediaType, t }),
      toEavt({ e: entity, a: "metroplat.carrier", v: projection.carrier, t }),
      toEavt({ e: entity, a: "metroplat.address", v: projection.address, t }),
      toEavt({ e: entity, a: "arc42.validation-scope", v: projection.validationScope, t }),
      toEavt({ e: entity, a: "arc42.loss-profile", v: projection.lossProfile, t }),
      ...(projection.artifact === undefined ? [] : [
        toEavt({ e: entity, a: "metroplat.language-artifact", v: projection.artifact.address, t }),
        toEavt({ e: projection.artifact.address, a: "metroplat.kind", v: "metroplat.language.artifact", t }),
        toEavt({ e: projection.artifact.address, a: "metroplat.language", v: projection.artifact.language, t }),
      ]),
      ...(projection.translation === undefined ? [] : [
        toEavt({ e: entity, a: "metroplat.translation-witness", v: projection.translation.address, t }),
        toEavt({ e: projection.translation.address, a: "metroplat.kind", v: "metroplat.language.translation", t }),
        toEavt({ e: projection.translation.address, a: "metroplat.source-language", v: projection.translation.sourceLanguage, t }),
        toEavt({ e: projection.translation.address, a: "metroplat.target-language", v: projection.translation.targetLanguage, t }),
        toEavt({ e: projection.translation.address, a: "metroplat.semantic-address", v: projection.translation.semanticAddress, t }),
      ]),
    );
    for (const judgment of projection.validationScope) {
      rows.push(toEavt({ e: entity, a: "arc42.validates-judgment", v: judgment, t }));
    }
    for (const loss of projection.lossProfile) {
      rows.push(toEavt({ e: entity, a: "arc42.projection-loss", v: loss, t }));
    }
  }
  for (const family of projectionFamiliesOf(sad.carrier, projectionAnalyses)) {
    rows.push(
      toEavt({ e: sad.carrier, a: "arc42.projection-family", v: family.entity, t }),
      toEavt({ e: family.entity, a: "metroplat.kind", v: "metroplat.arc42.projection-family", t }),
      toEavt({ e: family.entity, a: "metroplat.address", v: family.address, t }),
      toEavt({ e: family.entity, a: "metroplat.semantic-address", v: family.semanticAddress, t }),
      toEavt({ e: family.entity, a: "arc42.complete-carrier-set", v: family.completeCarrierSet, t }),
    );
    if (family.sourceLanguage !== undefined) {
      rows.push(toEavt({ e: family.entity, a: "metroplat.source-language", v: family.sourceLanguage, t }));
    }
    for (const member of family.members) {
      rows.push(toEavt({ e: family.entity, a: "arc42.member-projection", v: member, t }));
    }
    for (const projectionKind of family.projectionKinds) {
      rows.push(toEavt({ e: family.entity, a: "arc42.projection-kind", v: projectionKind, t }));
    }
    for (const targetLanguage of family.targetLanguages) {
      rows.push(toEavt({ e: family.entity, a: "metroplat.target-language", v: targetLanguage, t }));
    }
    for (const witness of family.translationWitnesses) {
      rows.push(toEavt({ e: family.entity, a: "metroplat.translation-witness", v: witness, t }));
    }
  }
  const body = Object.freeze({
    kind: "metroplat.arc42.statement-set",
    carrier: sad.carrier,
    rows: Object.freeze(rows),
  });
  return Object.freeze({ ...body, address: artifactId(body) });
}

function stringValue(value) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value) {
  return typeof value === "number" ? value : undefined;
}

function stringArrayValue(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? Object.freeze([...value])
    : Object.freeze([]);
}

function firstString(rows, entity, attribute) {
  return stringValue(rows.find((row) => row.e === entity && row.a === attribute)?.v);
}

function firstNumber(rows, entity, attribute) {
  return numberValue(rows.find((row) => row.e === entity && row.a === attribute)?.v);
}

function firstStringArray(rows, entity, attribute) {
  return stringArrayValue(rows.find((row) => row.e === entity && row.a === attribute)?.v);
}

function stringValues(rows, entity, attribute) {
  return Object.freeze(rows
    .filter((row) => row.e === entity && row.a === attribute)
    .map((row) => stringValue(row.v))
    .filter((value) => value !== undefined));
}

function entitiesOfKind(rows, kind) {
  return Object.freeze([...new Set(rows
    .filter((row) => row.a === "metroplat.kind" && row.v === kind)
    .map((row) => stringValue(row.e))
    .filter((entity) => entity !== undefined))].sort());
}

function gapAsksForProjectionLanguageEvidence(gap) {
  const text = `${gap.riskTitle ?? ""} ${gap.evidenceBoundary ?? ""}`.toLocaleLowerCase("en-US");
  const terms = [
    "language-presentation",
    "languagepresentation",
    "language artifact",
    "translation",
    "projection",
    "validation scope",
    "loss profile",
    "carrier",
  ];
  return terms.some((term) => text.includes(term));
}

function projectionConformanceEvidence(projections) {
  const evidence = new Set();
  for (const projection of projections) {
    if (projection.validationScope.length === 0) continue;
    evidence.add(projection.entity);
    if (projection.address !== undefined) evidence.add(projection.address);
    if (projection.languageArtifact !== undefined) evidence.add(projection.languageArtifact);
    if (projection.translationWitness !== undefined) evidence.add(projection.translationWitness);
  }
  return Object.freeze([...evidence].sort());
}

function gapConformanceEvidence(
  gap,
  projections,
) {
  if (!gapAsksForProjectionLanguageEvidence(gap)) return Object.freeze([]);
  return projectionConformanceEvidence(projections);
}

function projectionFamilyEntity(carrier, semanticAddress) {
  return `metroplat:arc42:projection-family:${carrier}#${semanticAddress}`;
}

function sameDefinedValue(values) {
  const defined = [...new Set(values.filter((value) => value !== undefined))];
  return defined.length === 1 ? defined[0] : undefined;
}

function projectionFamilyOf(
  carrier,
  semanticAddress,
  members,
  projectionCount,
) {
  const entity = projectionFamilyEntity(carrier, semanticAddress);
  const familyBody = Object.freeze({
    kind: "metroplat.arc42.projection-family",
    entity,
    semanticAddress,
    ...(sameDefinedValue(members.map((member) => member.sourceLanguage)) === undefined ? {} : {
      sourceLanguage: sameDefinedValue(members.map((member) => member.sourceLanguage)),
    }),
    members: Object.freeze(members.map((member) => member.entity).sort()),
    projectionKinds: Object.freeze([...new Set(members
      .map((member) => member.projectionKind)
      .filter((projectionKind) => projectionKind !== undefined))].sort()),
    targetLanguages: Object.freeze([...new Set(members
      .map((member) => member.targetLanguage)
      .filter((targetLanguage) => targetLanguage !== undefined))].sort()),
    translationWitnesses: Object.freeze([...new Set(members
      .map((member) => member.translationWitness)
      .filter((translationWitness) => translationWitness !== undefined))].sort()),
    completeCarrierSet: members.length === projectionCount,
  });
  return Object.freeze({ ...familyBody, address: artifactId(familyBody) });
}

function projectionFamiliesOf(carrier, projections) {
  const bySemanticAddress = new Map();
  for (const projection of projections) {
    if (projection.semanticAddress === undefined) continue;
    const members = bySemanticAddress.get(projection.semanticAddress) ?? [];
    members.push(projection);
    bySemanticAddress.set(projection.semanticAddress, members);
  }
  return Object.freeze([...bySemanticAddress.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([semanticAddress, members]) => projectionFamilyOf(carrier, semanticAddress, Object.freeze(members), projections.length)));
}

function projectionFamiliesFromRows(
  rows,
  carrier,
  projections,
) {
  const familyEntities = entitiesOfKind(rows, "metroplat.arc42.projection-family");
  if (familyEntities.length === 0) return projectionFamiliesOf(carrier, projections);
  return Object.freeze(familyEntities.flatMap((entity) => {
    const semanticAddress = firstString(rows, entity, "metroplat.semantic-address");
    const address = firstString(rows, entity, "metroplat.address");
    if (semanticAddress === undefined || address === undefined) return [];
    return [Object.freeze({
      kind: "metroplat.arc42.projection-family",
      entity,
      semanticAddress,
      ...(firstString(rows, entity, "metroplat.source-language") === undefined ? {} : { sourceLanguage: firstString(rows, entity, "metroplat.source-language") }),
      members: stringValues(rows, entity, "arc42.member-projection"),
      projectionKinds: stringValues(rows, entity, "arc42.projection-kind"),
      targetLanguages: stringValues(rows, entity, "metroplat.target-language"),
      translationWitnesses: stringValues(rows, entity, "metroplat.translation-witness"),
      completeCarrierSet: rows.some((row) => row.e === entity && row.a === "arc42.complete-carrier-set" && row.v === true),
      address: address,
    })];
  }));
}

function statementAnalysisOf(statementSet) {
  const rows = statementSet.rows.map(eavtRecord);
  const sectionEntities = entitiesOfKind(rows, "metroplat.arc42.section");
  const reviewUnitEntities = entitiesOfKind(rows, "metroplat.arc42.review-unit");
  const evidenceSignalEntities = entitiesOfKind(rows, "metroplat.arc42.evidence-signal");
  const projectionEntities = entitiesOfKind(rows, "metroplat.arc42.projection");
  const languageArtifactEntities = entitiesOfKind(rows, "metroplat.language.artifact");
  const translationWitnessEntities = entitiesOfKind(rows, "metroplat.language.translation");
  const gapEntities = entitiesOfKind(rows, "metroplat.arc42.implementation-conformance-gap");
  const selectedReviewUnit = stringValue(rows.find((row) => row.e === statementSet.carrier && row.a === "arc42.selected-review-unit")?.v);
  const viewpoints = Object.freeze(sectionEntities.flatMap((entity) => {
    const viewpoint = firstString(rows, entity, "arc42.viewpoint");
    if (viewpoint === undefined) return [];
    return [Object.freeze({
      entity,
      ...(firstString(rows, entity, "arc42.section-id") === undefined ? {} : { sectionId: firstString(rows, entity, "arc42.section-id") }),
      viewpoint,
      ...(firstString(rows, entity, "arc42.model-kind") === undefined ? {} : { modelKind: firstString(rows, entity, "arc42.model-kind") }),
      ...(firstString(rows, entity, "arc42.concern") === undefined ? {} : { concern: firstString(rows, entity, "arc42.concern") }),
    })];
  }));
  const projections = Object.freeze(projectionEntities.map((entity) => {
    const validationJudgments = stringValues(rows, entity, "arc42.validates-judgment");
    const projectionLosses = stringValues(rows, entity, "arc42.projection-loss");
    const translationWitness = firstString(rows, entity, "metroplat.translation-witness");
    return Object.freeze({
      entity,
      ...(firstString(rows, entity, "arc42.projection-kind") === undefined ? {} : { projectionKind: firstString(rows, entity, "arc42.projection-kind") }),
      ...(firstString(rows, entity, "arc42.media-type") === undefined ? {} : { mediaType: firstString(rows, entity, "arc42.media-type") }),
      ...(firstString(rows, entity, "metroplat.address") === undefined ? {} : { address: firstString(rows, entity, "metroplat.address") }),
      ...(firstString(rows, entity, "metroplat.language-artifact") === undefined ? {} : { languageArtifact: firstString(rows, entity, "metroplat.language-artifact") }),
      ...(translationWitness === undefined ? {} : { translationWitness }),
      ...(translationWitness === undefined || firstString(rows, translationWitness, "metroplat.source-language") === undefined ? {} : { sourceLanguage: firstString(rows, translationWitness, "metroplat.source-language") }),
      ...(translationWitness === undefined || firstString(rows, translationWitness, "metroplat.target-language") === undefined ? {} : { targetLanguage: firstString(rows, translationWitness, "metroplat.target-language") }),
      ...(translationWitness === undefined || firstString(rows, translationWitness, "metroplat.semantic-address") === undefined ? {} : { semanticAddress: firstString(rows, translationWitness, "metroplat.semantic-address") }),
      validationScope: validationJudgments.length > 0 ? validationJudgments : firstStringArray(rows, entity, "arc42.validation-scope"),
      lossProfile: projectionLosses.length > 0 ? projectionLosses : firstStringArray(rows, entity, "arc42.loss-profile"),
    });
  }));
  const projectionFamilies = projectionFamiliesFromRows(rows, statementSet.carrier, projections);
  const implementationConformanceGaps = Object.freeze(gapEntities.map((entity) => {
    const gap = Object.freeze({
      entity,
      ...(firstString(rows, entity, "arc42.risk-title") === undefined ? {} : { riskTitle: firstString(rows, entity, "arc42.risk-title") }),
      ...(firstString(rows, entity, "arc42.evidence-boundary") === undefined ? {} : { evidenceBoundary: firstString(rows, entity, "arc42.evidence-boundary") }),
      ...(firstNumber(rows, entity, "arc42.line") === undefined ? {} : { line: firstNumber(rows, entity, "arc42.line") }),
    });
    const conformanceEvidence = gapConformanceEvidence(gap, projections);
    return Object.freeze({
      ...gap,
      evidenceStatus: conformanceEvidence.length > 0 ? "bounded-conformance-evidence" : "unaddressed",
      ...(conformanceEvidence.length === 0 ? {} : { conformanceEvidence }),
    });
  }));
  const missingArc42Sections = Object.freeze(rows
    .filter((row) => row.e === statementSet.carrier && row.a === "arc42.missing-section")
    .map((row) => numberValue(row.v))
    .filter((section) => section !== undefined)
    .sort((left, right) => left - right));
  const body = Object.freeze({
    kind: "metroplat.arc42.statement-analysis",
    carrier: statementSet.carrier,
    statementSet: statementSet.address,
    counts: Object.freeze({
      rows: statementSet.rows.length,
      sections: sectionEntities.length,
      reviewUnits: reviewUnitEntities.length,
      evidenceSignals: evidenceSignalEntities.length,
      projections: projectionEntities.length,
      viewpoints: rows.filter((row) => row.a === "arc42.viewpoint").length,
      modelKinds: rows.filter((row) => row.a === "arc42.model-kind").length,
      concerns: rows.filter((row) => row.a === "arc42.concern").length,
      validationScopes: rows.filter((row) => row.a === "arc42.validation-scope").length,
      validationJudgments: rows.filter((row) => row.a === "arc42.validates-judgment").length,
      projectionLossProfiles: rows.filter((row) => row.a === "arc42.loss-profile").length,
      projectionLosses: rows.filter((row) => row.a === "arc42.projection-loss").length,
      languageArtifacts: languageArtifactEntities.length,
      translationWitnesses: translationWitnessEntities.length,
      projectionFamilies: projectionFamilies.length,
      projectionFamilyMembers: projectionFamilies.reduce((count, family) => count + family.members.length, 0),
      semanticAddresses: new Set(projections
        .map((projection) => projection.semanticAddress)
        .filter((semanticAddress) => semanticAddress !== undefined)).size,
      implementationConformanceGaps: gapEntities.length,
      conformanceEvidenceLinks: implementationConformanceGaps.reduce((count, gap) => count + (gap.conformanceEvidence?.length ?? 0), 0),
      evidenceBoundaries: rows.filter((row) => row.a === "arc42.evidence-boundary").length,
      missingArc42Sections: missingArc42Sections.length,
    }),
    missingArc42Sections,
    ...(selectedReviewUnit === undefined ? {} : {
      selectedReviewUnit: Object.freeze({
        entity: selectedReviewUnit,
        ...(firstString(rows, selectedReviewUnit, "arc42.section-id") === undefined ? {} : { sectionId: firstString(rows, selectedReviewUnit, "arc42.section-id") }),
        ...(firstString(rows, selectedReviewUnit, "arc42.title") === undefined ? {} : { title: firstString(rows, selectedReviewUnit, "arc42.title") }),
        ...(firstString(rows, selectedReviewUnit, "arc42.carrier-text") === undefined ? {} : { carrierText: firstString(rows, selectedReviewUnit, "arc42.carrier-text") }),
      }),
    }),
    viewpoints,
    projections,
    projectionFamilies,
    implementationConformanceGaps,
  });
  return Object.freeze({ ...body, address: artifactId(body) });
}

export function analyzeArc42StatementSet(statementSet) {
  return statementAnalysisOf(statementSet);
}

function findingOf(body) {
  const findingBody = Object.freeze({
    kind: "metroplat.arc42.improvement-finding",
    ...body,
  });
  return Object.freeze({ ...findingBody, address: artifactId(findingBody) });
}

function riskRefinementOf(body) {
  const candidateBody = Object.freeze({
    kind: "metroplat.arc42.risk-refinement",
    ...body,
  });
  return Object.freeze({ ...candidateBody, address: artifactId(candidateBody) });
}

function improvementReadoutEntity(analysis) {
  return `metroplat:arc42:improvement-readout:${analysis.address}`;
}

function improvementRowsOf(
  analysis,
  findings,
  riskRefinements,
  counts,
) {
  const entity = improvementReadoutEntity(analysis);
  const t = entity;
  const rows = [
    toEavt({ e: entity, a: "metroplat.kind", v: "metroplat.arc42.improvement-readout", t }),
    toEavt({ e: entity, a: "metroplat.carrier", v: analysis.carrier, t }),
    toEavt({ e: entity, a: "arc42.statement-analysis", v: analysis.address, t }),
    toEavt({ e: entity, a: "arc42.finding-count", v: counts.findings, t }),
    toEavt({ e: entity, a: "arc42.risk-count", v: counts.risks, t }),
    toEavt({ e: entity, a: "arc42.warning-count", v: counts.warnings, t }),
    toEavt({ e: entity, a: "arc42.info-count", v: counts.infos, t }),
    toEavt({ e: entity, a: "arc42.risk-refinement-count", v: counts.riskRefinements, t }),
  ];
  for (const family of analysis.projectionFamilies) {
    rows.push(
      toEavt({ e: entity, a: "arc42.projection-family", v: family.address, t }),
      toEavt({ e: family.address, a: "metroplat.kind", v: "metroplat.arc42.projection-family", t }),
      toEavt({ e: family.address, a: "metroplat.entity", v: family.entity, t }),
      toEavt({ e: family.address, a: "metroplat.semantic-address", v: family.semanticAddress, t }),
      toEavt({ e: family.address, a: "arc42.complete-carrier-set", v: family.completeCarrierSet, t }),
    );
    if (family.sourceLanguage !== undefined) {
      rows.push(toEavt({ e: family.address, a: "metroplat.source-language", v: family.sourceLanguage, t }));
    }
    for (const member of family.members) {
      rows.push(toEavt({ e: family.address, a: "arc42.member-projection", v: member, t }));
    }
    for (const projectionKind of family.projectionKinds) {
      rows.push(toEavt({ e: family.address, a: "arc42.projection-kind", v: projectionKind, t }));
    }
    for (const targetLanguage of family.targetLanguages) {
      rows.push(toEavt({ e: family.address, a: "metroplat.target-language", v: targetLanguage, t }));
    }
    for (const witness of family.translationWitnesses) {
      rows.push(toEavt({ e: family.address, a: "metroplat.translation-witness", v: witness, t }));
    }
  }
  for (const finding of findings) {
    rows.push(
      toEavt({ e: entity, a: "arc42.improvement-finding", v: finding.address, t }),
      toEavt({ e: finding.address, a: "metroplat.kind", v: "metroplat.arc42.improvement-finding", t }),
      toEavt({ e: finding.address, a: "arc42.finding-code", v: finding.code, t }),
      toEavt({ e: finding.address, a: "arc42.severity", v: finding.severity, t }),
      toEavt({ e: finding.address, a: "arc42.subject", v: finding.subject, t }),
      toEavt({ e: finding.address, a: "arc42.title", v: finding.title, t }),
      toEavt({ e: finding.address, a: "arc42.detail", v: finding.detail, t }),
      toEavt({ e: finding.address, a: "arc42.recommended-action", v: finding.recommendedAction, t }),
    );
    if (finding.sectionId !== undefined) {
      rows.push(toEavt({ e: finding.address, a: "arc42.section-id", v: finding.sectionId, t }));
    }
    if (finding.projectionKind !== undefined) {
      rows.push(toEavt({ e: finding.address, a: "arc42.projection-kind", v: finding.projectionKind, t }));
    }
    if (finding.evidenceBoundary !== undefined) {
      rows.push(toEavt({ e: finding.address, a: "arc42.evidence-boundary", v: finding.evidenceBoundary, t }));
    }
    if (finding.evidenceStatus !== undefined) {
      rows.push(toEavt({ e: finding.address, a: "arc42.evidence-status", v: finding.evidenceStatus, t }));
    }
    if (finding.line !== undefined) {
      rows.push(toEavt({ e: finding.address, a: "arc42.line", v: finding.line, t }));
    }
    for (const judgment of finding.validationScope ?? []) {
      rows.push(toEavt({ e: finding.address, a: "arc42.validates-judgment", v: judgment, t }));
    }
    for (const loss of finding.lossProfile ?? []) {
      rows.push(toEavt({ e: finding.address, a: "arc42.projection-loss", v: loss, t }));
    }
    for (const evidence of finding.evidence) {
      rows.push(toEavt({ e: finding.address, a: "arc42.evidence", v: evidence, t }));
    }
  }
  for (const refinement of riskRefinements) {
    rows.push(
      toEavt({ e: entity, a: "arc42.risk-refinement", v: refinement.address, t }),
      toEavt({ e: refinement.address, a: "metroplat.kind", v: "metroplat.arc42.risk-refinement", t }),
      toEavt({ e: refinement.address, a: "arc42.gap", v: refinement.gap, t }),
      toEavt({ e: refinement.address, a: "arc42.risk-title", v: refinement.riskTitle, t }),
      toEavt({ e: refinement.address, a: "arc42.evidence-status", v: refinement.evidenceStatus, t }),
      toEavt({ e: refinement.address, a: "arc42.bounded-evidence-count", v: refinement.boundedEvidenceCount, t }),
      toEavt({ e: refinement.address, a: "arc42.remaining-obligation", v: refinement.remainingObligation, t }),
      toEavt({ e: refinement.address, a: "arc42.carrier-already-distinguished", v: refinement.carrierAlreadyDistinguished, t }),
    );
    if (refinement.carrierOperation !== undefined) {
      rows.push(toEavt({ e: refinement.address, a: "arc42.carrier-operation", v: refinement.carrierOperation, t }));
    }
    for (const evidence of refinement.boundedEvidence) {
      rows.push(toEavt({ e: refinement.address, a: "arc42.bounded-evidence", v: evidence, t }));
    }
  }
  return Object.freeze(rows);
}

const GENERIC_LANGUAGE_PROJECTION_REMAINING_OBLIGATION = "Generic LanguagePresentation/Translation kernel conformance remains open until every presentation, translation obstruction, validation scope, and loss profile is recorded as typed language artifacts rather than only bounded arc42 projection evidence.";

function carrierAlreadyDistinguishesBoundedEvidence(gap) {
  const boundary = gap.evidenceBoundary?.toLocaleLowerCase("en-US") ?? "";
  return boundary.includes("bounded")
    && boundary.includes("generic")
    && boundary.includes("kernel");
}

function escapeMarkdownTableCell(value) {
  return value.replace(/\|/gu, "\\|").replace(/\s+/gu, " ").trim();
}

function riskRefinementOperation(
  sad,
  gap,
) {
  const reviewUnit = sad?.reviewUnit;
  if (reviewUnit === undefined || reviewUnit.id !== "11") return undefined;
  if (gap.line === undefined || gap.riskTitle === undefined || gap.evidenceBoundary === undefined) return undefined;
  if (carrierAlreadyDistinguishesBoundedEvidence(gap)) return undefined;
  const lines = reviewUnit.text.replace(/\r\n?/gu, "\n").split("\n");
  if (reviewUnit.text.endsWith("\n")) lines.pop();
  const relativeLine = gap.line - reviewUnit.startLine;
  if (relativeLine < 1 || relativeLine >= lines.length) return undefined;
  const boundedSentence = `Workbench conformance-evidence links show bounded arc42 projection conformance; ${GENERIC_LANGUAGE_PROJECTION_REMAINING_OBLIGATION}`;
  lines[relativeLine] = `| ${escapeMarkdownTableCell(gap.riskTitle)} | ${escapeMarkdownTableCell(`${gap.evidenceBoundary} ${boundedSentence}`)} |`;
  return Object.freeze({
    operation: "replace-section",
    heading: reviewUnit.title,
    level: reviewUnit.level,
    body: `${lines.slice(1).join("\n")}\n`,
    required: true,
  });
}

function riskRefinementsOf(analysis, sad) {
  return Object.freeze(analysis.implementationConformanceGaps.flatMap((gap) => {
    const boundedEvidence = Object.freeze([...(gap.conformanceEvidence ?? [])]);
    if (boundedEvidence.length === 0) return [];
    const carrierOperation = riskRefinementOperation(sad, gap);
    return [riskRefinementOf({
      gap: gap.entity,
      riskTitle: gap.riskTitle ?? "Implementation conformance gap",
      evidenceStatus: "bounded-conformance-evidence",
      boundedEvidence,
      boundedEvidenceCount: boundedEvidence.length,
      remainingObligation: GENERIC_LANGUAGE_PROJECTION_REMAINING_OBLIGATION,
      carrierAlreadyDistinguished: carrierAlreadyDistinguishesBoundedEvidence(gap),
      ...(carrierOperation === undefined ? {} : { carrierOperation }),
    })];
  }));
}

function improvementReadoutOf(analysis, sad) {
  const findings = [];
  for (const section of analysis.missingArc42Sections) {
    findings.push(findingOf({
      code: "missing-arc42-section",
      severity: "warning",
      subject: analysis.carrier,
      sectionId: String(section),
      title: `Missing arc42 section ${section}`,
      detail: `The architecture-description carrier has no top-level arc42 section ${section}.`,
      recommendedAction: "Decide whether the intended architecture needs this arc42 viewpoint; add the section or record why the viewpoint is intentionally absent.",
      evidence: Object.freeze([analysis.address]),
    }));
  }
  for (const gap of analysis.implementationConformanceGaps) {
    findings.push(findingOf({
      code: "implementation-conformance-gap",
      severity: "risk",
      subject: gap.entity,
      ...(gap.line === undefined ? {} : { line: gap.line }),
      title: gap.riskTitle ?? "Implementation conformance gap",
      detail: gap.evidenceBoundary ?? "The selected §11 risk row names an evidence boundary without a parsed treatment.",
      recommendedAction: "Use this §11 item as a bounded improvement candidate: collect implementation-conformance evidence, refine the evidence boundary, or retire the risk only when the workbench can re-read the updated row.",
      ...(gap.evidenceBoundary === undefined ? {} : { evidenceBoundary: gap.evidenceBoundary }),
      ...(gap.evidenceStatus === undefined ? {} : { evidenceStatus: gap.evidenceStatus }),
      evidence: Object.freeze([analysis.address, gap.entity]),
    }));
    if ((gap.conformanceEvidence?.length ?? 0) > 0) {
      findings.push(findingOf({
        code: "implementation-conformance-evidence",
        severity: "info",
        subject: gap.entity,
        ...(gap.line === undefined ? {} : { line: gap.line }),
        title: `${gap.riskTitle ?? "Implementation conformance gap"} has bounded projection evidence`,
        detail: "Current arc42 projection rows include language artifacts, translation witnesses, validation judgments, and loss-profile evidence relevant to this §11 boundary; this does not discharge the generic kernel risk by itself.",
        recommendedAction: "Use the evidence links to refine the §11 boundary: distinguish bounded arc42 projection conformance from the remaining generic LanguagePresentation/Translation kernel obligation.",
        ...(gap.evidenceBoundary === undefined ? {} : { evidenceBoundary: gap.evidenceBoundary }),
        evidenceStatus: "bounded-conformance-evidence",
        evidence: Object.freeze([analysis.address, gap.entity, ...(gap.conformanceEvidence ?? [])]),
      }));
    }
  }
  for (const projection of analysis.projections) {
    if (projection.lossProfile.length === 0) continue;
    findings.push(findingOf({
      code: "projection-loss-boundary",
      severity: "info",
      subject: projection.entity,
      ...(projection.projectionKind === undefined ? {} : { projectionKind: projection.projectionKind }),
      validationScope: Object.freeze([...projection.validationScope]),
      lossProfile: Object.freeze([...projection.lossProfile]),
      title: `Projection ${projection.projectionKind ?? projection.entity} declares loss`,
      detail: `Loss profile: ${projection.lossProfile.join(", ")}.`,
      recommendedAction: "Choose this carrier only for decisions within its validation scope, or request a projection whose validation scope preserves the missing judgments.",
      evidence: Object.freeze([analysis.address, projection.entity, ...(projection.address === undefined ? [] : [projection.address])]),
    }));
  }
  const severityRank = (severity) =>
    severity === "risk" ? 0 : severity === "warning" ? 1 : 2;
  const sorted = Object.freeze(findings.sort((left, right) =>
    severityRank(left.severity) - severityRank(right.severity)
    || left.code.localeCompare(right.code)
    || left.subject.localeCompare(right.subject)
    || left.title.localeCompare(right.title)));
  const riskRefinements = riskRefinementsOf(analysis, sad);
  const countsWithoutRows = Object.freeze({
    findings: sorted.length,
    risks: sorted.filter((finding) => finding.severity === "risk").length,
    warnings: sorted.filter((finding) => finding.severity === "warning").length,
    infos: sorted.filter((finding) => finding.severity === "info").length,
    riskRefinements: riskRefinements.length,
  });
  const rows = improvementRowsOf(analysis, sorted, riskRefinements, countsWithoutRows);
  const body = Object.freeze({
    kind: "metroplat.arc42.improvement-readout",
    carrier: analysis.carrier,
    statementAnalysis: analysis.address,
    counts: Object.freeze({
      ...countsWithoutRows,
      rows: rows.length,
    }),
    findings: sorted,
    riskRefinements,
    rows,
  });
  return Object.freeze({ ...body, address: artifactId(body) });
}

export async function runArc42SadWorkbench(
  binding,
  request,
) {
  const markdownRequest = Object.freeze({
    path: request.path,
    ...(request.operations === undefined ? {} : { operations: request.operations }),
    ...(request.write === undefined ? {} : { write: request.write }),
    ...(request.token === undefined ? {} : { token: request.token }),
    ...(request.at === undefined ? {} : { at: request.at }),
  });
  const result = await runMarkdownFileWorkbench(binding, markdownRequest);
  const final = result.after ?? result.before;
  const sad = sadReadout(final.source.text, request.section);
  const requestedProjections = requestedProjectionKinds(request);
  const nonSenProjectionKinds = requestedProjections.filter((projection) => projection !== "sen");
  const nonSenProjections = projectionSetOfKinds(sad, nonSenProjectionKinds);
  const senBasisStatementSet = statementSetOf(sad, nonSenProjections);
  const senBasisAnalysis = statementAnalysisOf(senBasisStatementSet);
  const senBasisImprovement = improvementReadoutOf(senBasisAnalysis, sad);
  const projections = projectionSetOf(sad, request, Object.freeze({
    statementSet: senBasisStatementSet,
    analysis: senBasisAnalysis,
    improvement: senBasisImprovement,
  }));
  const statementSet = statementSetOf(sad, projections);
  const analysis = statementAnalysisOf(statementSet);
  const improvement = improvementReadoutOf(analysis, sad);
  return Object.freeze({
    kind: "metroplat.arc42.sad-workbench-response",
    path: request.path,
    sad,
    ...(projections === undefined ? {} : { projections }),
    statementSet,
    analysis,
    improvement,
    ...(request.includeXml === true ? { sadXml: projections?.xml2arc42?.content ?? sadReadoutXml(sad) } : {}),
    ...(request.includeHtml === true ? { sadHtml: projections?.html?.content ?? sadReadoutHtml(sad) } : {}),
    ...(request.includeRefinementPacket === true ? { refinementPacket: refinementPacketOf(sad, request, binding) } : {}),
    ...(result.edit === undefined ? {} : { edit: result.edit }),
    ...(result.writeReceipt === undefined ? {} : { writeReceipt: result.writeReceipt }),
    changed: result.changed,
    persisted: result.persisted,
  });
}

export function arc42SadWorkbenchOperations(binding) {
  return Object.freeze([operation({
    verb: "arc42-sad-workbench",
    inputFormat: "json",
    outputFormat: "json",
    summary: "Inspect and structurally refine one bounded review unit of an arc42 architecture description.",
    description: "Domain: Arc42SadWorkbenchRequest. Codomain: Arc42SadWorkbenchResponse. Selects one numbered arc42 section with exact carrier text, line coordinates, neighboring units, and local evidence signals; emits a content-addressed EAVT statement set, derived statement analysis for arc42 viewpoints, concerns, projection scopes/losses, semantic-addressed projection families, and implementation-conformance gaps, plus content-addressed improvement findings and rows over missing viewpoints, §11 conformance gaps, projection-family transposability, and projection loss boundaries; optionally emits a content-addressed projection set containing xml2arc42, HTML, and arc42-SEN language-artifact presentations plus a content-addressed refinement packet over exact formal/corpus/design/conformance locators and the dream-to-plan-to-architect-to-spec-to-tests-to-docs-to-code development progression; carrier edits dry-run by default and persist only through filesystem's journaled write when write=true.",
    domain: arc42SadWorkbenchRequestContract,
    codomain: arc42SadWorkbenchResponseContract,
    relation: "projection",
    run: (input) =>
      runArc42SadWorkbench(binding, input),
  })]);
}
