import { lstatSync } from "node:fs";
import path from "node:path";

/** Historical transaction/admission carriers. Dot-journal is the native root. */
export const HISTORICAL_INDEX_SIDECARS = Object.freeze(["-wal", "-shm", "-journal", ".admission"]);

/** Inspect the configured locator (including a named backup) and recognized orphan carriers. */
export function historicalIndexCustodyPaths(file) {
  const resolved = path.resolve(file);
  return [resolved, ...HISTORICAL_INDEX_SIDECARS.map((suffix) => resolved + suffix)];
}

/** No content probes, follows, renames or resets: even broken symlinks retain custody. */
export function assertNativeIndexCustody(file) {
  for (const source of historicalIndexCustodyPaths(file)) {
    try { lstatSync(source); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    throw new Error(`Historical archive index requires explicit offline receiving into a distinct native destination: ${source}`);
  }
}
