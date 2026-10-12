// Narrow integration seam for consumers that need VICTOR's catalog identity
// and shared-workspace projection without taking its application/runtime API.
export { assembleCatalog } from './catalog.mjs';
export { projectWorkspaceGraph } from './workspace-graph.mjs';
