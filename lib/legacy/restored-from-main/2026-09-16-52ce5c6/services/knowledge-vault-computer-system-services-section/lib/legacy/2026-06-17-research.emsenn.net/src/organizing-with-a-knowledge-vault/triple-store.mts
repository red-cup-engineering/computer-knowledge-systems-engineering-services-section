/**
 * On-disk EAVT triple store, modelled on 561 Group Operations Manifold's event-sourced persistence
 * (`work-management.mts`, `operations-ledger.mts`).
 *
 * - `data/logs/<domain>.jsonl` is an append-only EAVT log — the triple store
 *   itself, never held in memory.
 * - `data/state/<domain>.json` is a derived snapshot, folded from the log and
 *   written atomically (tmp file then `rename`). It is a cache, not the truth.
 * - Reads fold the log; the fold is pure. The append/read/rename is the only
 *   I/O. The server stays stateless: every request reads the log from disk.
 *
 * All serialization is `@emsenn/relating/writing`; nothing here hand-rolls a
 * store format.
 */
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseJsonlLines, serializeEavt, toEavt, type EAVT, type EAVTRecord, type JsonValue } from "@emsenn/relating/writing";

import { emsennDataRoot } from "./content-root.mts";

// A domain addresses exactly one append-only log. Confine it to a safe slug so
// a domain name can never escape `data/logs` or `data/state`.
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function confineDomain(domain: string): string {
  const slug = domain.trim().toLowerCase();
  if (!DOMAIN.test(slug)) throw new Error(`invalid triple-store domain: ${JSON.stringify(domain)}`);
  return slug;
}

function logPath(domain: string): string {
  return path.join(emsennDataRoot(), "logs", `${confineDomain(domain)}.jsonl`);
}

function statePath(domain: string): string {
  return path.join(emsennDataRoot(), "state", `${confineDomain(domain)}.json`);
}

/** Append EAVT facts to the domain's log. The log is the triple store. */
export async function assertFacts(domain: string, facts: readonly EAVT[]): Promise<number> {
  if (facts.length === 0) return 0;
  const target = logPath(domain);
  await mkdir(path.dirname(target), { recursive: true });
  await appendFile(target, serializeEavt([...facts]), "utf8");
  return facts.length;
}

/** Read the domain's log as EAVT facts. A domain with no log yet folds empty. */
export async function readFacts(domain: string): Promise<readonly EAVT[]> {
  try {
    const raw = await readFile(logPath(domain), "utf8");
    return Object.freeze(parseJsonlLines(raw).map((value) => toEavt(value as EAVT | EAVTRecord)));
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "ENOENT") {
      return Object.freeze([]);
    }
    throw err;
  }
}

export type FactSnapshot = Readonly<{
  domain: string;
  facts: number;
  entities: number;
  current: Readonly<Record<string, Readonly<Record<string, JsonValue>>>>;
}>;

/**
 * Pure fold: last-writer-wins current value per (entity, attribute) in append
 * order. This is the standard EAVT materialization. Callers that need the
 * settled paraconsistent reading fold through the carrier instead.
 */
export function foldFacts(domain: string, facts: readonly EAVT[]): FactSnapshot {
  const current: Record<string, Record<string, JsonValue>> = {};
  for (const fact of facts) {
    const entity = String(fact[0]);
    const attribute = String(fact[1]);
    (current[entity] ??= {})[attribute] = fact[2] as JsonValue;
  }
  return Object.freeze({
    domain: confineDomain(domain),
    facts: facts.length,
    entities: Object.keys(current).length,
    current,
  });
}

/** Write the derived snapshot atomically (tmp file then rename). */
export async function writeSnapshot(domain: string, snapshot: FactSnapshot): Promise<void> {
  const target = statePath(domain);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${String(process.pid)}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

/** Append facts, refold the whole log, persist the snapshot, return it. */
export async function assertAndFold(domain: string, facts: readonly EAVT[]): Promise<FactSnapshot> {
  await assertFacts(domain, facts);
  const snapshot = foldFacts(domain, await readFacts(domain));
  await writeSnapshot(domain, snapshot);
  return snapshot;
}
