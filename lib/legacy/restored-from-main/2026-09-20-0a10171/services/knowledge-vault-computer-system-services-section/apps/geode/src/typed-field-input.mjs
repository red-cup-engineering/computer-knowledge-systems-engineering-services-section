import {
  admitRelationalFieldDocument,
  createRelationalField,
  defineRelation,
  defineType,
  identifyContent,
  makeThing,
  relationalFieldDocument,
} from "@red-cup-engineering/computer-data-engine";

function value(result, context) {
  if (!result.ok) throw new TypeError(`${context}: ${result.refusal.message ?? result.refusal.code ?? "refused"}`);
  return result.value;
}

const textType = value(defineType({
  id: "urn:red-cup-engineering:geode:typed-field:text:1",
  name: "GEODE typed-field text",
  description: "A nonempty portable text value projected from an observed GEODE carrier.",
  parents: [],
  schema: { type: "string", minLength: 1 },
}), "GEODE text type");

const observationType = value(defineType({
  id: "urn:red-cup-engineering:geode:typed-field:observation:1",
  name: "GEODE typed-field observation",
  description: "A portable JSON value observed in a GEODE relation position.",
  parents: [],
  schema: {},
}), "GEODE observation type");

const documentType = value(defineType({
  id: "urn:red-cup-engineering:geode:typed-field:document:1",
  name: "GEODE observed document",
  description: "A document descriptor from a CAIRN workspace projection.",
  parents: [],
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["path", "title", "aliases", "keywords", "headings"],
    properties: {
      path: { type: "string", minLength: 1 },
      title: { type: "string" },
      aliases: { type: "array", items: { type: "string" } },
      keywords: { type: "array", items: { type: "string" } },
      headings: { type: "array", items: { type: "string" } },
    },
  },
}), "GEODE document type");

function assertProfile(profile) {
  if (profile?.profile !== "shared-typed-substrate" || profile.version !== 1
    || profile.typeEngineBinding?.package !== "@red-cup-engineering/computer-data-engine"
    || profile.typeEngineBinding?.entrypoint !== "./types"
    || profile.graphProjection?.status !== "derived-projection"
    || !Array.isArray(profile.settledTerms)
    || !["Thing", "Relation"].every((name) => profile.settledTerms.some((term) => term.name === name))
    || !Array.isArray(profile.refusals)
    || !["Actor", "Resource", "Message", "Channel"].every((term) => profile.refusals.some((refusal) => refusal.term === term && refusal.claim === "universal-canonical-meaning"))) {
    throw new TypeError("shared typed substrate profile is incompatible or does not carry required universal-term refusals");
  }
}

function assertSnapshot(snapshot) {
  if (snapshot?.type !== "GeodeWorkspaceSnapshot" || snapshot.schemaVersion !== "geode-workspace/v1" || !Array.isArray(snapshot.documents) || !Array.isArray(snapshot.graph?.edges)) {
    throw new TypeError("snapshot must be a GEODE workspace projection");
  }
}

function assertLedger(ledger) {
  if (ledger?.type !== "GeodeDeclaredRelationLedger" || ledger.schemaVersion !== "geode-declared-relations/v1" || !Array.isArray(ledger.rows) || !Array.isArray(ledger.defects)) {
    throw new TypeError("ledger must be a GEODE declared-relation projection");
  }
}

function declarations(rows) {
  const predicates = [...new Set(rows.map((row) => row?.a))].sort();
  if (predicates.some((predicate) => typeof predicate !== "string" || predicate === "")) throw new TypeError("GEODE ledger predicates must be nonempty strings");
  return predicates.map((id) => value(defineRelation({ id, domain: textType, codomain: observationType, witness: textType }), `GEODE relation ${id}`));
}

/**
 * Adapt GEODE's current CAIRN/EAVT projections to the common typed field.
 * The profile is supplied by science; this adapter only checks its explicit
 * boundary and carries its universal-term refusals forward unchanged.
 */
export function createGeodeTypedFieldInput({ snapshot, ledger, profile } = {}) {
  assertProfile(profile);
  assertSnapshot(snapshot);
  assertLedger(ledger);
  const things = snapshot.documents.map((document) => value(makeThing({
    type: documentType,
    attributes: {
      path: document.path,
      title: document.title,
      aliases: document.aliases,
      keywords: document.keywords,
      headings: document.headings,
    },
  }), `GEODE document ${JSON.stringify(document.path)}`));
  const relations = declarations(ledger.rows);
  const statements = ledger.rows.map(({ e, a, v, t }) => ({ subject: e, predicate: a, object: v, witness: t }));
  const field = value(createRelationalField(relations, statements), "GEODE ledger typed field");
  const fieldIdentityByStatement = new Map(field.statements.map((entry) => [identifyContent(entry.statement), entry.id]));
  const statementOrder = statements.map((statement) => fieldIdentityByStatement.get(identifyContent(statement)));
  if (statementOrder.some((identity) => identity === undefined) || new Set(statementOrder).size !== statementOrder.length) {
    throw new TypeError("GEODE ledger rows must remain distinct typed-field statements");
  }
  return Object.freeze({
    type: "GeodeTypedFieldInput",
    version: 1,
    profile,
    things: Object.freeze(things),
    relationalFieldDocument: relationalFieldDocument(field),
    // CAIRN's file/revision view remains an implementation projection for FeltOS,
    // link diagnostics, and release presentation; it is not relation authority.
    workspaceProjection: snapshot,
    ledgerProjection: Object.freeze({
      documents: ledger.documents,
      scanned: ledger.scanned,
      unnamed: ledger.unnamed,
      defects: ledger.defects,
      unresolved: ledger.unresolved,
      // The typed field is a set.  CAIRN's existing ledger reading is an ordered
      // projection, so retain its statement identities as projection metadata.
      // This is not a second claim carrier: every identity must reappear in the
      // admitted typed field below.
      statementOrder: Object.freeze(statementOrder),
    }),
    refusals: profile.refusals,
  });
}

/** Re-admit a portable typed field and derive the legacy query ledger for existing indexes. */
export function deriveGeodeLedgerFromTypedField(input) {
  if (input?.type !== "GeodeTypedFieldInput" || input.version !== 1) throw new TypeError("input must be a GEODE typed-field input");
  assertProfile(input.profile);
  const rows = input.relationalFieldDocument?.statements;
  if (!Array.isArray(rows)) throw new TypeError("typed field input must carry a relational field document");
  const relations = declarations(rows.map(({ statement }) => ({ a: statement?.predicate })));
  const admitted = admitRelationalFieldDocument(relations, input.relationalFieldDocument);
  if (!admitted.ok) throw new TypeError(`GEODE typed field was refused: ${admitted.refusal.message}`);
  const metadata = input.ledgerProjection;
  if (!metadata || !Array.isArray(metadata.defects) || !Array.isArray(metadata.unresolved) || !Array.isArray(metadata.statementOrder)) throw new TypeError("typed field input must carry ledger projection metadata");
  const statementsByIdentity = new Map(admitted.value.statements.map((entry) => [entry.id, entry.statement]));
  if (metadata.statementOrder.length !== statementsByIdentity.size) {
    throw new TypeError("typed field input must preserve one ordered projection identity for every statement");
  }
  const orderedStatements = metadata.statementOrder.map((identity) => statementsByIdentity.get(identity));
  if (orderedStatements.some((statement) => statement === undefined)) throw new TypeError("typed field input statement order names a missing statement");
  return Object.freeze({
    type: "GeodeDeclaredRelationLedger",
    schemaVersion: "geode-declared-relations/v1",
    rows: Object.freeze(orderedStatements.map((statement) => Object.freeze({ e: statement.subject, a: statement.predicate, v: statement.object, t: statement.witness }))),
    documents: metadata.documents,
    scanned: metadata.scanned,
    unnamed: metadata.unnamed,
    defects: metadata.defects,
    unresolved: metadata.unresolved,
  });
}

export function deriveGeodeWorkspaceFromTypedField(input) {
  if (input?.type !== "GeodeTypedFieldInput" || input.version !== 1) throw new TypeError("input must be a GEODE typed-field input");
  assertSnapshot(input.workspaceProjection);
  return input.workspaceProjection;
}
