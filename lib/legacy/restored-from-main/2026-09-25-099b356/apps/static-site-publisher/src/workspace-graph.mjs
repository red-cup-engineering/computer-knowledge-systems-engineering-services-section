import { catalogWorkspaceContentGraph } from '@red-cup-engineering/workspace-content-graph-service';

/**
 * Project VICTOR's observed Markdown carriers through the shared workspace
 * graph without treating that graph's semantic resource identity as a cell
 * address. The correspondence is deliberately explicit because a VICTOR cell
 * address includes its domain AST while the shared graph identifies the
 * canonical Markdown reading.
 */
export function projectWorkspaceGraph(resources, cells) {
  if (!Array.isArray(resources)) throw new TypeError('resources must be an array');
  if (!(cells instanceof Map)) throw new TypeError('cells must be a Map');

  if (resources.length === 0) {
    return Object.freeze({
      type: 'VictorWorkspaceGraphProjection',
      version: 1,
      graph: null,
      cellResources: Object.freeze([]),
    });
  }

  const graph = catalogWorkspaceContentGraph({ resources });
  const resourcesByPath = new Map(graph.resources.map((resource) => [resource.path, resource]));
  const cellResources = [...cells.values()]
    .map((cell) => {
      const resourcePath = cell.source?.id ?? `${cell.name}.md`;
      const resource = resourcesByPath.get(resourcePath);
      if (!resource) return null;
      return Object.freeze({
        cellName: cell.name,
        cellAddress: cell.address,
        resourcePath,
        semanticNi: resource.semanticNi,
        sourceNi: resource.source.ni,
      });
    })
    .filter(Boolean)
    .sort((left, right) => left.cellName.localeCompare(right.cellName));

  return Object.freeze({
    type: 'VictorWorkspaceGraphProjection',
    version: 1,
    graph,
    cellResources: Object.freeze(cellResources),
  });
}

export function workspaceGraphReport(projection, domainRelationCount) {
  return Object.freeze({
    id: projection.graph?.id ?? null,
    version: projection.graph?.version ?? null,
    observedResourceCount: projection.graph?.denominator.observedResources ?? 0,
    mappedCellCount: projection.cellResources.length,
    sharedRelationCount: projection.graph?.relations.length ?? 0,
    domainRelationCount,
  });
}
