/**
 * @packageDocumentation
 *
 * apps/infograph/operations/eavt-cell — thin verbs over the eavt package's
 * cell questions and contested-cell counts (ks-01/ks-05): input admission,
 * trace-name confinement, RPC.
 */
import { askEavtCell, askEavtTraceCell } from "@red-cup-engineering/eavt-services-section/ask-eavt-cell";
import { countEavtTraceContestedCells } from "@red-cup-engineering/eavt-services-section/count-eavt-contested-cells";
import { join } from "node:path";
import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";

import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";
import { closureRegimeNames } from "@red-cup-engineering/metrologic/articulation/predicating/positing/settling/closure";

const eavtClosureContract = {
  type: "object",
  required: ["saturation", "transfer", "kappa", "regime"],
  properties: {
    saturation: { type: ["integer", "null"] },
    transfer: { type: ["integer", "null"] },
    kappa: { type: ["integer", "null"] },
    regime: { enum: closureRegimeNames },
  },
};

const eavtCellAnswerContract = schemaFrom({
  $id: "metroplat/eavt/eavt-cell-answer",
  type: "object",
  required: ["proofTree", "closure", "regime"],
  properties: {
    proofTree: {
      type: "object",
      required: ["root", "nodes", "edges", "missing", "cycles", "depth"],
      properties: {
        root: { type: "string" },
        nodes: { type: "object" },
        edges: { type: "array", items: { type: "array", items: [{ type: "string" }, { type: "string" }], minItems: 2, maxItems: 2 } },
        missing: { type: "array", items: { type: "string" } },
        cycles: { type: "array", items: { type: "string" } },
        depth: { type: "integer" },
      },
    },
    closure: eavtClosureContract,
    regime: { enum: closureRegimeNames },
  },
});

const eavtTraceCellAnswerContract = schemaFrom({
  $id: "metroplat/eavt/eavt-trace-cell-answer",
  oneOf: [
    {
      type: "object",
      required: ["type", "trace", "rows", "answer"],
      properties: {
        type: { const: "EavtTraceCellAnswer" },
        trace: { type: "string" },
        rows: { type: "integer" },
        answer: eavtCellAnswerContract.schema,
      },
    },
    {
      type: "object",
      required: ["type", "trace"],
      properties: {
        type: { const: "EavtTraceAbsent" },
        trace: { type: "string" },
      },
    },
  ],
});

const eavtContestedCellsCountContract = schemaFrom({
  $id: "metroplat/eavt/eavt-contested-cells-count",
  type: "object",
  required: ["type", "entities", "contestedEntities", "contestedCells", "contested"],
  properties: {
    type: { const: "EavtContestedCellsCount" },
    entities: { type: "integer" },
    contestedEntities: { type: "integer" },
    contestedCells: { type: "integer" },
    contested: {
      type: "array",
      items: {
        type: "object",
        required: ["entity", "cells"],
        properties: {
          entity: { type: "string" },
          cells: {
            type: "array",
            items: {
              type: "object",
              required: ["predicate", "object"],
              properties: { predicate: { type: "string" } },
            },
          },
        },
      },
    },
  },
});

const eavtTraceContestedCellsCountContract = schemaFrom({
  $id: "metroplat/eavt/eavt-trace-contested-cells-count",
  oneOf: [
    {
      type: "object",
      required: ["type", "trace", "rows", "count"],
      properties: {
        type: { const: "EavtTraceContestedCellsCount" },
        trace: { type: "string" },
        rows: { type: "integer" },
        count: eavtContestedCellsCountContract.schema,
      },
    },
    {
      type: "object",
      required: ["type", "trace"],
      properties: {
        type: { const: "EavtTraceAbsent" },
        trace: { type: "string" },
      },
    },
  ],
});

const TRACE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

/**
 * Answer one EAVT cell question by passing the request straight through to
 * `askEavtCell`, refusing with an obstruction datum instead of throwing when
 * `rows` is not an array or `entity` is not a nonempty string.
 *
 * @param input - `{ rows, entity, attribute? }`.
 * @returns The primitive's `EavtCellAnswer`, or an `AskEavtCellObstruction`.
 */
export function askEavtCellRequest(input) {
  const candidate = record(input);
  const rows = candidate?.["rows"];
  const entity = candidate?.["entity"];
  if (!Array.isArray(rows) || typeof entity !== "string" || entity.length === 0) {
    return Object.freeze({
      kind: "metroplat.eavt.ask-eavt-cell:obstruction",
      code: "invalid-request",
      message: "ask-eavt-cell requires rows as an array and entity as a nonempty string",
    });
  }
  const attribute = candidate?.["attribute"];
  return askEavtCell(Object.freeze({
    rows,
    entity,
    ...(typeof attribute === "string" ? { attribute } : {}),
  }));
}

/**
 * Answer one EAVT cell question over a named trace file confined to
 * `<binding.dataRoot>/data/state/traces/<name>.eavt`, refusing with an
 * obstruction datum when `trace` is not a bare name or `entity` is not a
 * nonempty string. The returned answer reports `trace` as the name, never
 * the resolved host path.
 *
 * @param binding - Supplies the data root the trace name resolves under.
 * @param input - `{ trace, entity, attribute? }`.
 * @returns The primitive's `EavtTraceCellAnswer` or `EavtTraceAbsent`, or an
 *   `AskEavtTraceCellObstruction`.
 */
export function askEavtTraceCellRequest(
  binding,
  input,
) {
  const candidate = record(input);
  const trace = candidate?.["trace"];
  const entity = candidate?.["entity"];
  if (typeof trace !== "string" || !TRACE_NAME.test(trace) || typeof entity !== "string" || entity.length === 0) {
    return Object.freeze({
      kind: "metroplat.eavt.ask-eavt-trace-cell:obstruction",
      code: "invalid-request",
      message: "ask-eavt-trace-cell requires trace as a bare name and entity as a nonempty string",
    });
  }
  const attribute = candidate?.["attribute"];
  const tracePath = join(binding.dataRoot, "data", "state", "traces", `${trace}.eavt`);
  const result = askEavtTraceCell(Object.freeze({
    trace: tracePath,
    entity,
    ...(typeof attribute === "string" ? { attribute } : {}),
  }));
  return result.type === "EavtTraceAbsent"
    ? Object.freeze({ type: "EavtTraceAbsent", trace })
    : Object.freeze({ ...result, trace });
}

/**
 * Count contested cells over a named trace file confined to
 * `<binding.dataRoot>/data/state/traces/<name>.eavt`, refusing with an
 * obstruction datum when `trace` is not a bare name. The returned count
 * reports `trace` as the name, never the resolved host path.
 *
 * @param binding - Supplies the data root the trace name resolves under.
 * @param input - `{ trace }`.
 * @returns The primitive's `EavtTraceContestedCellsCount` or
 *   `EavtTraceAbsent`, or a `CountEavtTraceContestedCellsObstruction`.
 */
export function countEavtTraceContestedCellsRequest(
  binding,
  input,
) {
  const candidate = record(input);
  const trace = candidate?.["trace"];
  if (typeof trace !== "string" || !TRACE_NAME.test(trace)) {
    return Object.freeze({
      kind: "metroplat.eavt.count-eavt-trace-contested-cells:obstruction",
      code: "invalid-request",
      message: "count-eavt-trace-contested-cells requires trace as a bare name",
    });
  }
  const tracePath = join(binding.dataRoot, "data", "state", "traces", `${trace}.eavt`);
  const result = countEavtTraceContestedCells(Object.freeze({ trace: tracePath }));
  return result.type === "EavtTraceAbsent"
    ? Object.freeze({ type: "EavtTraceAbsent", trace })
    : Object.freeze({ ...result, trace });
}

/**
 * The eavt-cell module's operation family.
 *
 * @param binding - Supplies the data root `ask-eavt-trace-cell` and
 *   `count-eavt-trace-contested-cells` resolve trace names under.
 * @returns The `ask-eavt-cell`, `ask-eavt-trace-cell`, and
 *   `count-eavt-trace-contested-cells` operations.
 */
export function eavtCellOperations(binding) {
  return Object.freeze([
    operation({
      verb: "ask-eavt-cell",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Answer one EAVT cell question for an entity over a row array.",
      description: "Domain: { rows, entity, attribute? }. Thin pass-through to @red-cup-engineering/ask-eavt-cell-service: returns its EavtCellAnswer (asserted/saturated counts, the settled affirmed/denied/contradicted section, contested, the proofTree resolved from the entity — root, nodes, edges, missing, cycles, depth — and the answer's closure { saturation, transfer, kappa, regime } and top-level regime, both drawn from the Obsmetrologia closure regime names (strict/scott/transfinite-bounded/aperiodic); the pass stages read off the ordinal closure engine, null when a pass does not stabilize finitely), or an obstruction datum when rows is not an array or entity is not a nonempty string.",
      codomain: eavtCellAnswerContract,
      run: (input) => askEavtCellRequest(input),
    }),
    operation({
      verb: "ask-eavt-trace-cell",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Answer one EAVT cell question over a named trace file in the data root.",
      description: "Domain: { trace, entity, attribute? }. trace is a bare name (matching /^[A-Za-z0-9][A-Za-z0-9._-]*$/, never a path) resolved to <dataRoot>/data/state/traces/<trace>.eavt. Thin pass-through to @red-cup-engineering/ask-eavt-trace-cell-service: returns { type: \"EavtTraceCellAnswer\", trace, rows, answer } where rows is the count of rows read for entity (an indexed read, not the trace file's total row count) and answer is the ask-eavt-cell EavtCellAnswer, regime-tagged with closure { saturation, transfer, kappa, regime } and a top-level regime, or { type: \"EavtTraceAbsent\", trace } when the file does not exist, or an obstruction datum when trace or entity fail admission.",
      codomain: eavtTraceCellAnswerContract,
      run: (input) => askEavtTraceCellRequest(binding, input),
    }),
    operation({
      verb: "count-eavt-trace-contested-cells",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Count the entities and cells a named trace file settles as contradicted.",
      description: "Domain: { trace }. trace is a bare name (matching /^[A-Za-z0-9][A-Za-z0-9._-]*$/, never a path) resolved to <dataRoot>/data/state/traces/<trace>.eavt. Thin pass-through to @red-cup-engineering/count-eavt-trace-contested-cells-service: returns { type: \"EavtTraceContestedCellsCount\", trace, rows, count } where rows is the trace file's total row count and count is the ask-eavt-contested-cells EavtContestedCellsCount (entities, contestedEntities, contestedCells, contested: [{ entity, cells: [{ predicate, object }] }]), or { type: \"EavtTraceAbsent\", trace } when the file does not exist, or an obstruction datum when trace fails admission.",
      codomain: eavtTraceContestedCellsCountContract,
      run: (input) => countEavtTraceContestedCellsRequest(binding, input),
    }),
  ]);
}
