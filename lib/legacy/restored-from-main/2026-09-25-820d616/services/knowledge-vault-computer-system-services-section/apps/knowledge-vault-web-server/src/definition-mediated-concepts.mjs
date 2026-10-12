import { readingOfSides } from "@red-cup-engineering/computer-code-engineering-services-section/signchain/bilattice";

const freezeList = (values) => Object.freeze([...values]);

function add(map, key, value) {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

/**
 * Compose concept-to-concept cells through defining documents. This is the
 * shared form of Geode's existing document-definition mediation, not generic
 * graph path composition.
 */
export function projectDefinitionMediatedCells(observations, {
  definitionPredicate = "defines",
  negativePredicates = ["contrasts-with"],
} = {}) {
  const negative = new Set(negativePredicates);
  const definitions = new Map();
  const declarations = new Map();
  for (const observation of observations) {
    if (observation.predicate === definitionPredicate) add(definitions, observation.subject, observation.object);
    else add(declarations, observation.subject, observation);
  }
  const cells = new Map();
  for (const [document, declared] of declarations) {
    for (const subject of definitions.get(document) ?? []) {
      for (const observation of declared) {
        if (subject === observation.object) continue;
        const key = JSON.stringify([subject, observation.object]);
        const cell = cells.get(key) ?? { subject, object: observation.object, for: [], against: [] };
        const polarity = observation.polarity ?? (negative.has(observation.predicate) ? "against" : "for");
        cell[polarity === "against" ? "against" : "for"].push(Object.freeze({
          predicate: observation.predicate,
          occurrence: observation.address,
          source: observation.source,
          evidence: observation.evidence,
        }));
        cells.set(key, cell);
      }
    }
  }
  return freezeList([...cells.values()].map((cell) => Object.freeze({
    kind: "drew.definition-mediated-cell",
    subject: cell.subject,
    object: cell.object,
    for: freezeList(cell.for),
    against: freezeList(cell.against),
    reading: readingOfSides("knowledge", cell.for.length > 0, cell.against.length > 0),
  })).sort((left, right) => JSON.stringify([left.subject, left.object]).localeCompare(JSON.stringify([right.subject, right.object]))));
}

function groupWitnesses(witnesses) {
  const grouped = new Map();
  for (const witness of witnesses) {
    const documents = grouped.get(witness.predicate) ?? new Set();
    documents.add(witness.evidence?.document ?? witness.source?.resource ?? witness.occurrence);
    grouped.set(witness.predicate, documents);
  }
  return freezeList([...grouped].map(([relation, documents]) => Object.freeze({
    relation,
    documents: freezeList(documents),
  })).sort((left, right) => left.relation.localeCompare(right.relation)));
}

/**
 * The reusable index behind definition-mediated concept readings.
 *
 * This owns the corpus relation, not any product's storage shape: documents
 * define concepts, their other declarations become witnessed concept cells,
 * and definitions/declarations remain available for product-specific views.
 */
export function projectDefinitionMediatedIndex(observations, options = {}) {
  const definitionPredicate = options.definitionPredicate ?? "defines";
  const definitions = new Map();
  const declarations = new Map();
  const documents = new Map();

  for (const observation of observations) {
    if (observation.predicate === definitionPredicate) {
      add(definitions, observation.object, observation.subject);
      add(documents, observation.subject, observation.object);
      continue;
    }
    add(declarations, observation.object, Object.freeze({
      predicate: observation.predicate,
      occurrence: observation.address,
      source: observation.source,
      evidence: observation.evidence,
    }));
  }

  const cells = freezeList(projectDefinitionMediatedCells(observations, options).map((cell) => Object.freeze({
    ...cell,
    positive: groupWitnesses(cell.for),
    negative: groupWitnesses(cell.against),
  })));
  const concepts = new Set([...definitions.keys(), ...declarations.keys()]);
  return Object.freeze({
    kind: "drew.definition-mediated-index",
    schemaVersion: "drew-definition-mediated-index/v1",
    concepts: freezeList([...concepts].sort()),
    definitions: freezeList([...definitions].map(([concept, definers]) => Object.freeze({
      concept,
      documents: freezeList(definers),
    })).sort((left, right) => left.concept.localeCompare(right.concept))),
    declarations: freezeList([...declarations].map(([concept, witnesses]) => Object.freeze({
      concept,
      witnesses: groupWitnesses(witnesses),
    })).sort((left, right) => left.concept.localeCompare(right.concept))),
    documents: freezeList([...documents].map(([document, definedConcepts]) => Object.freeze({
      document,
      concepts: freezeList(definedConcepts),
    })).sort((left, right) => left.document.localeCompare(right.document))),
    cells,
  });
}

/** One concept reading compatible with Geode's existing concept/canvas boundary. */
export function projectDefinitionMediatedConcept(observations, name, options = {}) {
  if (typeof name !== "string" || name.length === 0) throw new TypeError("concept name must be a non-empty string");
  const index = projectDefinitionMediatedIndex(observations, options);
  const definers = index.definitions.find((entry) => entry.concept === name)?.documents ?? [];
  const namedBy = index.declarations.find((entry) => entry.concept === name)?.witnesses ?? [];
  const shape = (cell) => Object.freeze({
    from: cell.subject,
    to: cell.object,
    positive: groupWitnesses(cell.for),
    negative: groupWitnesses(cell.against),
    held: cell.reading === "stable",
  });
  const outgoing = index.cells.filter((cell) => cell.subject === name).map(shape)
    .sort((left, right) => left.to.localeCompare(right.to));
  const incoming = index.cells.filter((cell) => cell.object === name).map(shape)
    .sort((left, right) => left.from.localeCompare(right.from));
  return Object.freeze({
    type: "DrewDefinitionMediatedConceptReading",
    schemaVersion: "drew-definition-mediated-concept/v1",
    name,
    known: definers.length > 0 || namedBy.length > 0,
    definedBy: freezeList(definers),
    contested: definers.length > 1,
    namedBy,
    outgoing: freezeList(outgoing),
    incoming: freezeList(incoming),
    held: freezeList(outgoing.concat(incoming).filter((cell) => cell.held)),
  });
}
