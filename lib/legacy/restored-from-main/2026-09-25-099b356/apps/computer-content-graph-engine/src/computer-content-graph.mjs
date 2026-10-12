import { catalogWorkspaceContentGraph } from "@red-cup-engineering/workspace-content-graph-service";

export const computerContentGraphType = Object.freeze({
  type: "ComputerContentGraph",
  version: 1,
});

/**
 * Catalog an observed content corpus once. This is a pure operation: callers
 * provide acquired resources and retain responsibility for their locators.
 */
export function catalogComputerContentGraph({ resources } = {}) {
  if (!Array.isArray(resources)) throw new TypeError("ComputerContentGraph resources must be an array");
  const observation = catalogWorkspaceContentGraph({ resources });
  return Object.freeze({
    ...computerContentGraphType,
    observation,
  });
}
