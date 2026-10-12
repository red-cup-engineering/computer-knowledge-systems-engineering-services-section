import { createRelationalField, defineRelation, relationalFieldDocument } from "@red-cup-engineering/computer-data-engineering-services-section/type-system/relations";
import { defineType } from "@red-cup-engineering/computer-data-engineering-services-section/type-system";
import { makeThing } from "@red-cup-engineering/computer-data-engineering-services-section/type-system/thing";

function value(result, context) {
  if (!result.ok) throw new TypeError(`${context}: ${result.refusal.message ?? result.refusal.code ?? "refused"}`);
  return result.value;
}

const workspaceResourceDescriptorType = value(defineType({
  id: "urn:red-cup-engineering:workspace-content-resource:1",
  name: "Workspace content resource",
  description: "An observed workspace descriptor with source provenance.",
  parents: [],
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["path", "kind", "semanticNi"],
    properties: {
      path: { type: "string", minLength: 1 },
      kind: { type: "string", minLength: 1 },
      semanticNi: { type: "string", minLength: 1 },
    },
  },
}), "workspace resource descriptor type");

const portableObservationType = value(defineType({
  id: "urn:red-cup-engineering:workspace-content-graph:portable-observation:1",
  name: "Workspace graph portable observation",
  description: "A portable JSON observation position or source witness from the workspace graph.",
  parents: [],
  schema: {},
}), "workspace portable observation type");

/**
 * Project an existing WorkspaceContentGraph without changing its observation
 * contract. Resource descriptors become shared Things; each original edge
 * witness becomes one admitted statement in a typed relational-field document.
 */
export function projectWorkspaceContentGraphTyped(graph) {
  if (!graph || typeof graph !== "object" || !Array.isArray(graph.resources) || !Array.isArray(graph.relations) || !Array.isArray(graph.frontmatterClaims)) {
    throw new TypeError("WorkspaceContentGraph resources, relations, and frontmatter claims are required");
  }

  const things = [];
  const aliases = [];
  for (const resource of graph.resources) {
    const descriptor = { path: resource?.path, kind: resource?.kind, semanticNi: resource?.semanticNi };
    const thing = value(makeThing({ type: workspaceResourceDescriptorType, attributes: descriptor }), `workspace resource ${JSON.stringify(resource?.path)}`);
    things.push(thing);
    const names = new Set([descriptor.path, descriptor.path.split("/").at(-1)]);
    for (const pkg of graph.packages ?? []) {
      if (pkg.manifestNi !== descriptor.semanticNi) continue;
      for (const name of [pkg.name, pkg.id, pkg.actor]) if (typeof name === "string" && name !== "") names.add(name);
    }
    for (const alias of [...names].filter(Boolean).sort()) aliases.push(Object.freeze({ alias, thingId: thing.id }));
  }

  const predicates = [...new Set([...graph.relations, ...graph.frontmatterClaims].map((relation) => relation?.predicate))].sort();
  if (predicates.some((predicate) => typeof predicate !== "string" || predicate === "")) throw new TypeError("WorkspaceContentGraph relation predicates must be nonempty strings");
  const relations = predicates.map((id) => value(defineRelation({
    id,
    domain: portableObservationType,
    codomain: portableObservationType,
    witness: portableObservationType,
  }), `workspace relation ${id}`));
  const statements = [];
  for (const relation of graph.relations) {
    if (!relation || typeof relation.subject !== "string" || typeof relation.predicate !== "string" || typeof relation.object !== "string" || !Array.isArray(relation.witnessIdentifiers)) {
      throw new TypeError("WorkspaceContentGraph relations must carry text positions and witness identifiers");
    }
    for (const witness of relation.witnessIdentifiers) statements.push({
      subject: relation.subject,
      predicate: relation.predicate,
      object: relation.object,
      witness,
    });
  }
  for (const claim of graph.frontmatterClaims) {
    if (!claim || typeof claim.subject !== "string" || typeof claim.predicate !== "string" || !Object.hasOwn(claim, "object") || !claim.sourceWitness) {
      throw new TypeError("WorkspaceContentGraph frontmatter claims must carry subject, predicate, object, and source witness");
    }
    statements.push({
      subject: claim.subject,
      predicate: claim.predicate,
      object: claim.object,
      witness: claim.sourceWitness,
    });
  }
  const field = value(createRelationalField(relations, statements), "workspace relational field");
  return Object.freeze({
    things: Object.freeze(things),
    aliases: Object.freeze(aliases),
    relations: Object.freeze(relations),
    relationalFieldDocument: relationalFieldDocument(field),
  });
}

export { workspaceResourceDescriptorType };
