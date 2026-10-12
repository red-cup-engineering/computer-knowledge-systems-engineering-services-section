export function isTeraumNamed(name: string): boolean;
export function isExcludedSegment(name: string, excludeGlobs?: readonly string[]): boolean;
export function walkFiles(
  root: string,
  opts: { excludeGlobs?: readonly string[]; extensions: readonly string[] },
): string[];
