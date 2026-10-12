import type { Door, World } from './types.d.ts';

export function mulberry32(seed: number): () => number;
export const LAYOUT_SEED: number;

export function forceDirectedLayout(
  nodeIds: readonly string[],
  edges: ReadonlyArray<readonly [number, number]>,
): Map<string, { x: number; y: number }>;

export function buildEdges(nodeIds: readonly string[], doors: readonly Door[]): Array<[number, number]>;

export interface LayoutKata {
  id: string;
  hallId: string;
  path: string[];
  origin: 'auto-hall' | 'custom';
}

export interface Layout {
  wingId: string;
  width: number;
  height: number;
  seed: number;
  iterations: number;
  positions: Record<string, { x: number; y: number }>;
  katas: LayoutKata[];
}

export function buildLayout(world: World): Layout;
