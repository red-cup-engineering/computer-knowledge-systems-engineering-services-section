/**
 * research.emsenn.net — the box mount.
 *
 * This is the canonical shape of a thin site: it owns no capability. It binds the
 * box's data root and serves ONE coproduct manifold —
 *
 *     ICK (the nine faculties, constant across boxes)
 *   ⊕ @emsenn/organizing-a-knowledge-vault (this box's domain face, at /knowledge-vault)
 *
 * over `./data`. Every corpus verb (read-file, grep-text, assert-fact, admit-document,
 * inspect-root, …) is a free CLI/HTTP/OpenAPI/MCP/WebUX projection of the vault action
 * apex via induceBins/serve — the same primitives ICK is built on. There are no
 * hand-rolled bins, no second web server, and no box-local re-implementation of corpus
 * operations: those collapsed into this mount.
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createIckCoproductActions } from "@emsenn/organizing/service";
import { actions as vaultActions } from "@emsenn/organizing-a-knowledge-vault/actions";
import { induceBins, serve, type Action, type InducedBins } from "@emsenn/relating/running";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 18_800;

/** The box's data root — its stalk. The vault actions read it via this env var. */
export function dataRoot(): string {
  const fromEnv = process.env.ORGANIZING_KNOWLEDGE_VAULT_PATH ?? process.env.EMSENN_KNOWLEDGE_VAULT_ROOT;
  return path.resolve(fromEnv ?? path.join(PACKAGE_ROOT, "content"));
}

/** Namespace one face's verbs under `<face>/` so the manifold tiles cleanly. */
function underFace(face: string, act: Action): Action {
  return Object.freeze({
    ...act,
    verb: `${face}/${act.verb}`,
    ...(act.summary === undefined ? {} : { summary: `${face}: ${act.summary}` }),
  }) satisfies Action;
}

/** The served coproduct: ICK's nine faculties ⊕ this box's knowledge-vault face. */
export function researchInduced(basePath = ""): InducedBins {
  const actions: readonly Action[] = Object.freeze([
    ...createIckCoproductActions(),
    ...vaultActions.map((act) => underFace("knowledge-vault", act)),
  ]);
  return induceBins(actions, { packageName: "@emsenn/research.emsenn.net", basePath });
}

export type ServeResearchOptions = Readonly<{ host?: string; port?: number; root?: string; basePath?: string }>;

export function serveResearch(options: ServeResearchOptions = {}) {
  if (options.root !== undefined) process.env.ORGANIZING_KNOWLEDGE_VAULT_PATH = path.resolve(options.root);
  else process.env.ORGANIZING_KNOWLEDGE_VAULT_PATH ??= dataRoot();

  const host = options.host ?? process.env.HOST ?? DEFAULT_HOST;
  const port = options.port ?? (process.env.PORT === undefined ? DEFAULT_PORT : Number.parseInt(process.env.PORT, 10));
  const induced = researchInduced(options.basePath ?? "");
  const server = serve(induced.actions, { induced, basePath: options.basePath ?? "", title: "research.emsenn.net" });
  server.listen(port, host, () => {
    console.log(JSON.stringify({ kind: "emsenn.started", root: process.env.ORGANIZING_KNOWLEDGE_VAULT_PATH, url: `http://${host}:${port}/` }));
  });
  return server;
}

function isMain(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) serveResearch();
