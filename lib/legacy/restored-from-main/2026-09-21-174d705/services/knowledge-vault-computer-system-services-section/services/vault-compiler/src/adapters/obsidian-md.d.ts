import type { AdapterParseResult, ResolveResult, RoomId, VaultIndex, WingConfig, WingId } from '../types.d.ts';

export const id: 'obsidian';
export function discoverFiles(root: string, excludeGlobs: readonly string[]): string[];
export function parseRoom(root: string, absPath: string, wingId: WingId, config: WingConfig): AdapterParseResult | null;
export function buildIndex(rooms: readonly import('../types.d.ts').Room[]): VaultIndex;
export function resolveLink(raw: string, sourceRoomId: RoomId, index: VaultIndex): ResolveResult;
