import type { World } from './types.d.ts';

export const WORLD_JSON_SCHEMA: Readonly<Record<string, unknown>>;

export interface ValidateResult {
  valid: boolean;
  errors: string[];
}

export function validateWorld(world: unknown): ValidateResult;
export function assembleWorld(candidate: World): World;
export function canonicalStringify(value: unknown): string;
