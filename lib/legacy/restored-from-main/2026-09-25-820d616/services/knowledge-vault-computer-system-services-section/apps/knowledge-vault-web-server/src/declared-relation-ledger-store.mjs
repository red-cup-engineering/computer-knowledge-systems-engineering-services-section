// Cross-process persistence for the declared-relation ledger: compiling it over a large science
// section takes tens of seconds, so a freshly started MCP face should not pay that cost again for
// an unchanged vault. One JSON record per vault root, content-addressed by that root's path, at a
// KV-owned location -- never rebuilt in-process just because a new `node` process opened the
// workspace.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

const STORE_DIRECTORY = fileURLToPath(new URL("../data/records/declared-relation-ledger/", import.meta.url));
const RECORD_TYPE = "GeodeDeclaredRelationLedgerRecord";
const RECORD_SCHEMA_VERSION = "geode-declared-relation-ledger-record/v3";

function recordPath(root) {
  return join(STORE_DIRECTORY, `${sha256Hex(root)}.json`);
}

/**
 * A cheap, zero-extra-I/O fingerprint of which documents the ledger was built over: the vault's
 * own process-local revision counter (`cairn.version`) only distinguishes writes seen within one
 * running process, so it alone cannot tell a freshly started process that the admitted path set
 * changed since a previous process wrote this record. Hashing the sorted admitted-path list (data
 * the caller already has in memory) catches the common case -- documents added, removed, or
 * renamed -- at no extra cost; it does not catch a file edited in place without changing the
 * admitted set, which is the one gap this cache accepts in exchange for never re-reading 12,000+
 * files just to decide whether to re-read them.
 */
function pathsDigestOf(paths) {
  return sha256Hex([...paths].sort().join("\n"));
}

/**
 * Load the persisted ledger for `root` if one exists and its recorded vault version and admitted
 * path set both still match. Returns null on any miss (no record, parse failure, or stale
 * fingerprint) -- the caller rebuilds.
 */
export async function readCachedLedger({ root, vaultVersion, paths }) {
  let text;
  try {
    text = await readFile(recordPath(root), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return null;
  }
  if (record?.type !== RECORD_TYPE || record.schemaVersion !== RECORD_SCHEMA_VERSION) return null;
  if (record.root !== root || record.vaultVersion !== vaultVersion) return null;
  if (record.documentCount !== paths.length || record.pathsDigest !== pathsDigestOf(paths)) return null;
  return record.ledger;
}

/** Persist a freshly built ledger for `root`, fingerprinted against the admitted path set it was built from. */
export async function writeCachedLedger({ root, vaultVersion, paths, ledger }) {
  await mkdir(STORE_DIRECTORY, { recursive: true });
  const record = Object.freeze({
    type: RECORD_TYPE,
    schemaVersion: RECORD_SCHEMA_VERSION,
    root,
    vaultVersion,
    documentCount: paths.length,
    pathsDigest: pathsDigestOf(paths),
    builtAt: new Date().toISOString(),
    ledger,
  });
  await writeFile(recordPath(root), JSON.stringify(record), "utf8");
  return record;
}

/** The real, disk-backed cache `createConceptIndex` uses when a caller opts in. */
export const declaredRelationLedgerStore = Object.freeze({
  load: readCachedLedger,
  save: writeCachedLedger,
});
