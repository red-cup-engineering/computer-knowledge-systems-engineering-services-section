import os from "node:os";
import { access, constants } from "node:fs/promises";

/** Select host-local scratch unless an explicit caller/environment choice wins. */
export async function scratchDirectory(explicit) {
  if (explicit ?? process.env.CORPUS_NORMALIZER_TMPDIR) return explicit ?? process.env.CORPUS_NORMALIZER_TMPDIR;
  if (process.platform !== "win32") try { await access("/var/tmp", constants.W_OK); return "/var/tmp"; } catch {}
  return os.tmpdir();
}
