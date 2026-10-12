export interface WorkspaceResource {
  readonly path: string;
  readonly content: string;
}

export interface ComputerContentGraph {
  readonly type: "ComputerContentGraph";
  readonly version: 1;
  readonly observation: unknown;
}

export const computerContentGraphType: Readonly<{
  type: "ComputerContentGraph";
  version: 1;
}>;

export function catalogComputerContentGraph(input: {
  resources: readonly WorkspaceResource[];
}): ComputerContentGraph;
