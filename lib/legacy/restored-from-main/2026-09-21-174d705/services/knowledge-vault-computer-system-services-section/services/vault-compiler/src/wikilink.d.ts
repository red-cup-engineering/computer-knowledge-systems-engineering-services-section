import type { Room, RoomId, ResolveResult } from './types.d.ts';

export interface WikilinkIndex {
  byBasename: Map<string, RoomId[]>;
  byAlias: Map<string, RoomId[]>;
  allIds: RoomId[];
}

export function buildWikilinkIndex(rooms: readonly Room[]): WikilinkIndex;
export function resolveWikilink(raw: string, sourceRoomId: RoomId, index: WikilinkIndex): ResolveResult;
