import type { Door, Hall, RoomId } from './types.d.ts';

export function pebbleIndependent(nodes: number, edges: ReadonlyArray<readonly [number, number]>): boolean;
export function lamanCount(nodes: number, edges: number): boolean;
export function meanCoordination(cellCount: number, edgeCount: number): number;
export function loadBearing(nodes: number, edges: number, components: number): boolean;
export function connectedComponents(nodes: number, edges: ReadonlyArray<readonly [number, number]>): number;

export interface HallGraph {
  nodeCount: number;
  edges: Array<[number, number]>;
  components: number;
}

export function buildHallGraph(roomIds: readonly RoomId[], doors: readonly Door[]): HallGraph;
export function hallStability(roomIds: readonly RoomId[], doors: readonly Door[]): boolean;
export function withStability(halls: readonly Omit<Hall, 'stable'>[], doors: readonly Door[]): Hall[];
export const STABLE_HALL_BONUS: number;
