import type { DialectId } from './types.d.ts';

export interface DetectDialectOptions {
  override?: DialectId;
  excludeGlobs?: readonly string[];
}

export interface DialectDetection {
  dialect: DialectId;
  reason: string;
}

export function detectDialect(root: string, options?: DetectDialectOptions): DialectDetection;
