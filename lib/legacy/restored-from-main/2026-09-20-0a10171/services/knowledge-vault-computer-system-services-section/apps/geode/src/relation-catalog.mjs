import { makeNiUri, niUriDigestBytes } from "@red-cup-engineering/computer-data-engine/identity";

import { canonicalJson } from "@red-cup-engineering/graph-data-service";
import { createRelationWeb, immutableJson } from "@red-cup-engineering/graph-data-service/relation-web";

import { createPam } from "@red-cup-engineering/graph-data-service/pam";
import { projectDefinitionMediatedCells, projectDefinitionMediatedConcept, projectDefinitionMediatedIndex } from "./definition-mediated-concepts.mjs";

function sha256Hex(bytes) {
  return niUriDigestBytes(makeNiUri(bytes)).toString("hex");
}

const freezeList = (values) => Object.freeze([...values]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

/**
 * DREW application composition. Native sources remain authoritative; this
 * catalog keeps their latest observations and rebuilds the aggregate web.
 */
export function createRelationCatalog({ adapters = [] } = {}) {
  const adapterByName = new Map();
  const current = new Map();
  const journal = [];

  function registerAdapter(adapter) {
    requiredString(adapter?.name, "adapter.name");
    if (typeof adapter.observe !== "function") throw new TypeError("adapter.observe must be a function");
    const existing = adapterByName.get(adapter.name);
    if (existing && existing !== adapter) throw new Error(`DREW adapter ${JSON.stringify(adapter.name)} is already registered`);
    adapterByName.set(adapter.name, adapter);
    return app;
  }

  function compose({ resources } = {}) {
    const selected = resources === undefined ? [...current.values()] : resources.map((key) => current.get(key)).filter(Boolean);
    const web = createRelationWeb();
    for (const entry of selected.sort((left, right) => left.key.localeCompare(right.key))) {
      web.observe({ id: entry.observationId, source: entry.source, relations: entry.relations });
    }
    return web;
  }

  const app = {
    registerAdapter,
    observeResource({ adapter: adapterName, resource, revision = null, value, metadata = {} }) {
      const adapter = adapterByName.get(requiredString(adapterName, "observation.adapter"));
      if (!adapter) throw new Error(`unknown DREW adapter: ${adapterName}`);
      const result = adapter.observe(value, Object.freeze({ resource, revision, metadata }));
      if (!Array.isArray(result?.relations) || !Array.isArray(result?.diagnostics ?? [])) {
        throw new TypeError("adapter.observe must return { relations, diagnostics? }");
      }
      const key = canonicalJson([adapterName, immutableJson(resource, "observation.resource")]);
      const source = Object.freeze({ adapter: adapterName, resource: immutableJson(resource), revision: immutableJson(revision), metadata: immutableJson(metadata) });
      const relations = immutableJson(result.relations, "adapter relations");
      const diagnostics = immutableJson(result.diagnostics ?? [], "adapter diagnostics");
      const digest = sha256Hex(Buffer.from(canonicalJson([source, relations]), "utf8"));
      const entry = Object.freeze({
        kind: "drew.catalog-entry",
        key,
        source,
        observationId: `urn:drew:resource:sha256:${digest}`,
        relations,
        diagnostics,
      });
      const previous = current.get(key) ?? null;
      current.set(key, entry);
      journal.push(Object.freeze({ kind: "drew.resource-refresh", ordinal: journal.length, key, previousRevision: previous?.source.revision ?? null, entry }));
      return Object.freeze({ kind: "drew.resource-observation-witness", changed: previous?.observationId !== entry.observationId, previous, entry });
    },
    removeResource({ adapter, resource, revision = null, reason = "source resource removed" }) {
      const key = canonicalJson([requiredString(adapter, "removal.adapter"), immutableJson(resource, "removal.resource")]);
      const previous = current.get(key) ?? null;
      current.delete(key);
      const event = Object.freeze({ kind: "drew.resource-tombstone", ordinal: journal.length, key, revision: immutableJson(revision), reason, previous });
      journal.push(event);
      return event;
    },
    compose,
    catalog() {
      return Object.freeze({ kind: "drew.catalog", adapters: freezeList([...adapterByName.keys()].sort()), resources: freezeList([...current.values()].sort((a, b) => a.key.localeCompare(b.key))) });
    },
    queryRelations(pattern = {}) { return compose().query(pattern); },
    entity(term) {
      const neighborhood = compose().neighbors(term);
      return Object.freeze({ kind: "drew.entity-reading", term, known: neighborhood.incoming.length + neighborhood.outgoing.length > 0, ...neighborhood });
    },
    neighborhood(term, options = {}) { return compose().neighbors(term, options); },
    diagnostics() {
      return freezeList([...current.values()].flatMap((entry) => entry.diagnostics.map((diagnostic) => Object.freeze({ source: entry.source, diagnostic }))));
    },
    explain(address) {
      const observation = compose().query().find((candidate) => candidate.address === address);
      return observation
        ? Object.freeze({ kind: "drew.relation-explanation", address, relation: Object.freeze({ subject: observation.subject, predicate: observation.predicate, object: observation.object }), source: observation.source, evidence: observation.evidence ?? null })
        : null;
    },
    project(spec = { type: "snapshot" }) {
      const web = compose();
      if (spec.type === "snapshot") return web.snapshot();
      if (spec.type === "relations") return web.query(spec.pattern ?? {});
      if (spec.type === "eavt") return freezeList(web.query(spec.pattern ?? {}).map((row) => Object.freeze({ e: row.subject, a: row.predicate, v: row.object, t: row.address })));
      if (spec.type === "definition-mediated-cells") return projectDefinitionMediatedCells(web.query(), spec);
      if (spec.type === "definition-mediated-index") return projectDefinitionMediatedIndex(web.query(), spec);
      if (spec.type === "definition-mediated-concept") return projectDefinitionMediatedConcept(web.query(), spec.name, spec);
      throw new Error(`unknown DREW projection: ${spec.type}`);
    },
    pam({ profile, pattern = {} } = {}) {
      const web = createRelationWeb();
      const relations = compose().query(pattern);
      web.observe({ source: { kind: "drew.pam-view", pattern }, relations });
      return createPam({ ...(profile ? { profile } : {}), web });
    },
    history: () => freezeList(journal),
  };

  for (const adapter of adapters) registerAdapter(adapter);
  return Object.freeze(app);
}
