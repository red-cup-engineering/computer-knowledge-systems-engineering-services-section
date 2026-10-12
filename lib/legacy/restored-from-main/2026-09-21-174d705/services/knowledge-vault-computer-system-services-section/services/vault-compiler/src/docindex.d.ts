import type { Room, RoomId, ResolveResult } from './types.d.ts';

/** Rooms by lowercased basename, and by lowercased id for path-first resolution. */
export interface DocIndex {
  readonly byBasename: Map<string, RoomId[]>;
  readonly byPath: Map<string, RoomId>;
}

export function basenameOf(roomId: RoomId): string;
export function buildDocIndex(rooms: readonly Room[]): DocIndex;
export function resolveDocLink(
  raw: string,
  sourceRoomId: RoomId,
  index: DocIndex,
  extRe: RegExp,
): ResolveResult;
