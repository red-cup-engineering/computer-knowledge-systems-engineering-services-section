import type { CompileOptions, DialectId, VaultAdapter, WingConfig, World } from './types.d.ts';

export const ADAPTERS: Record<DialectId, VaultAdapter>;
export const DEFAULT_ATTRIBUTE_FIELDS: readonly string[];
export const DEFAULT_EXCLUDE_FIELDS: readonly string[];

export interface CompileResult {
  world: World;
  dialect: DialectId;
  dialectReason: string;
}

export function compileVault(root: string, wingConfig: WingConfig, options?: CompileOptions): CompileResult;
