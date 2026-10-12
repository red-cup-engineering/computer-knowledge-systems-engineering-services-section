import { assembleCatalog, projectWorkspaceGraph } from "@red-cup-engineering/victor/release";

function record(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  return value;
}

function immutableJson(value, path = "release") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain finite JSON numbers`);
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map((entry, index) => immutableJson(entry, `${path}[${index}]`)));
  const copied = {};
  for (const [key, entry] of Object.entries(record(value, path))) {
    // Victor cells are ordinary JavaScript records whose optional authoring
    // fields can be undefined. Release metadata is JSON-shaped, so omit those
    // absent fields rather than replacing them with a made-up value.
    if (entry !== undefined) copied[key] = immutableJson(entry, `${path}.${key}`);
  }
  return Object.freeze(copied);
}

function requireSnapshot(snapshot) {
  if (!snapshot || snapshot.type !== "GeodeWorkspaceSnapshot" || !Array.isArray(snapshot.documents)) {
    throw new TypeError("snapshot must be an admitted Geode workspace snapshot");
  }
  return snapshot;
}

function requireReading(reading, admittedPaths) {
  if (!reading || reading.type !== "GeodeDocumentReading" || typeof reading.path !== "string" || typeof reading.markdown !== "string") {
    throw new TypeError("readings must contain Geode document readings");
  }
  if (!admittedPaths.has(reading.path)) throw new RangeError(`reading is not admitted by snapshot: ${reading.path}`);
  return reading;
}

function readerFromReadings(snapshot, readings) {
  requireSnapshot(snapshot);
  if (!Array.isArray(readings)) throw new TypeError("readings must be an array");
  const admittedPaths = new Set(snapshot.documents.map(({ path }) => path));
  const records = readings.map((reading) => requireReading(reading, admittedPaths));
  const byPath = new Map();
  for (const reading of records) {
    if (byPath.has(reading.path)) throw new RangeError(`readings contain duplicate path: ${reading.path}`);
    byPath.set(reading.path, reading);
  }
  return Object.freeze({
    async listRecords() {
      return records.map(({ path }) => Object.freeze({ id: path, extension: path.endsWith(".md") ? ".md" : "" }));
    },
    async readRecord(record) {
      const reading = byPath.get(record.id);
      if (!reading) throw new RangeError(`unknown admitted record: ${record.id}`);
      return Object.freeze({ id: reading.path, bytes: new TextEncoder().encode(reading.markdown), contractVersion: "geode-reading/v1", revision: reading.revision });
    },
  });
}

function mapFromCells(cells) {
  if (cells instanceof Map) return new Map(cells);
  if (!Array.isArray(cells)) throw new TypeError("cells must be a Map or array");
  return new Map(cells.map((cell) => {
    if (!cell || typeof cell.name !== "string" || typeof cell.address !== "string") throw new TypeError("cells must contain Victor cells with name and address");
    return [cell.name, cell];
  }));
}

function projectWorkspaceGraphShards(resources, cells, shardSize) {
  if (!Number.isSafeInteger(shardSize) || shardSize < 1) throw new TypeError("workspaceGraphShardSize must be a positive safe integer");
  const shards = [], cellResources = [];
  for (let offset = 0; offset < resources.length; offset += shardSize) {
    const shardResources = resources.slice(offset, offset + shardSize);
    const paths = new Set(shardResources.map(({ path }) => path));
    const shardCells = new Map([...cells].filter(([, cell]) => paths.has(cell.source?.id ?? `${cell.name}.md`)));
    const projection = projectWorkspaceGraph(shardResources, shardCells);
    shards.push({
      index: shards.length,
      graphId: projection.graph?.id ?? null,
      graphType: projection.graph?.type ?? null,
      graphVersion: projection.graph?.version ?? null,
      denominator: projection.graph?.denominator ?? null,
    });
    cellResources.push(...projection.cellResources);
  }
  cellResources.sort((left, right) => left.cellName.localeCompare(right.cellName));
  return Object.freeze({
    type: "VictorWorkspaceGraphShardedProjection",
    version: 1,
    graph: null,
    shards: Object.freeze(shards.map(Object.freeze)),
    cellResources: Object.freeze(cellResources),
  });
}

function releaseFromCatalog(catalog, source) {
  if (!catalog || !(catalog.cells instanceof Map) || typeof catalog.hash !== "string") throw new TypeError("catalog must be a Victor catalog");
  return immutableJson({
    type: "VaultMazeVictorRelease",
    schemaVersion: "vaultmaze-victor-release/v1",
    source,
    catalog: {
      hash: catalog.hash,
      cells: [...catalog.cells.values()].sort((left, right) => left.name.localeCompare(right.name)),
      refusals: catalog.report?.refusals ?? [],
      advisories: catalog.report?.advisories ?? [],
    },
    workspaceGraph: catalog.workspaceGraph,
  });
}

/** Materialize release metadata from Geode-admitted content; no filesystem is read. */
export async function createVaultMazeVictorRelease({ snapshot, readings } = {}) {
  const reader = readerFromReadings(snapshot, readings);
  const catalog = await assembleCatalog(".", { reader });
  return releaseFromCatalog(catalog, {
    type: "geode-admitted-readings",
    schemaVersion: snapshot.schemaVersion,
    observedAt: snapshot.observedAt,
    region: snapshot.region,
  });
}

/** Project already-materialized Victor resources and cells without re-reading content. */
export function createVaultMazeVictorReleaseFromResources({ resources, cells, hash, report, workspaceGraphShardSize } = {}) {
  if (!Array.isArray(resources)) throw new TypeError("resources must be an array");
  if (typeof hash !== "string" || hash === "") throw new TypeError("hash must be a Victor catalog hash");
  const catalogCells = mapFromCells(cells);
  return releaseFromCatalog({
    hash,
    cells: catalogCells,
    report: report ?? { refusals: [], advisories: [] },
    workspaceGraph: workspaceGraphShardSize === undefined
      ? projectWorkspaceGraph(resources, catalogCells)
      : projectWorkspaceGraphShards(resources, catalogCells, workspaceGraphShardSize),
  }, { type: "victor-resources-and-cells" });
}
