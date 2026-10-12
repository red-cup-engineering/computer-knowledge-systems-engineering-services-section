/**
 * corpus/rigging - external information lines mounted into a knowledge vault.
 *
 * A rig is a declared input relation, not a fetcher: newswires and newscables
 * can be mounted as knowledge-vault inputs without making the vault depend on
 * the packages that operate those cables.
 */
import { carrierFrom } from "@emsenn/relating";
import { carrierToTerm, type Tm } from "@emsenn/relating";
import { jsonResource } from "@emsenn/relating/writing";
import type { KnowledgeVaultRoot } from "./carriers.mjs";
import { knowledgeVaultPathAllowedInRoot, normalizeKnowledgeVaultPath } from "./root.mjs";

export const knowledgeVaultRigSchema = { $id: "organizing/knowledge-vault/corpus/rig", title: "KnowledgeVaultRig", description: "One external newswire/newscable input mounted into a knowledge-vault root.", type: "object", required: ["kind", "inputKind", "name", "mount"], properties: { kind: { const: "organizing.knowledge-vault.corpus.rig" }, inputKind: { anyOf: [{ const: "newswire" }, { const: "newscable" }] }, name: { type: "string" }, mount: { minLength: 1, type: "string" }, configPath: { type: "string" }, href: { type: "string" }, wireCount: { minimum: 0, type: "integer" }, sourceCount: { minimum: 0, type: "integer" } }, additionalProperties: false } as const;

export const knowledgeVaultRigCarrier = carrierFrom(knowledgeVaultRigSchema);

export interface KnowledgeVaultRig {
  readonly kind: "organizing.knowledge-vault.corpus.rig";
  readonly inputKind: "newswire" | "newscable";
  readonly name: string;
  readonly mount: string;
  readonly configPath?: string;
  readonly href?: string;
  readonly wireCount?: number;
  readonly sourceCount?: number;
}

export const knowledgeVaultRiggingSchema = { $id: "organizing/knowledge-vault/corpus/rigging", title: "KnowledgeVaultRigging", description: "The declared external newswire/newscable inputs rigged into a knowledge-vault root.", type: "object", required: ["kind", "root", "rigCount", "rigs"], properties: { kind: { const: "organizing.knowledge-vault.corpus.rigging" }, root: { type: "string" }, rigCount: { minimum: 0, type: "integer" }, rigs: { type: "array", items: knowledgeVaultRigSchema } }, additionalProperties: false } as const;

export const knowledgeVaultRiggingCarrier = carrierFrom(knowledgeVaultRiggingSchema);

export interface KnowledgeVaultRigging {
  readonly kind: "organizing.knowledge-vault.corpus.rigging";
  readonly root: string;
  readonly rigCount: number;
  readonly rigs: readonly KnowledgeVaultRig[];
}

export type KnowledgeVaultRigInput = Omit<KnowledgeVaultRig, "kind">;
export type KnowledgeVaultNewswireRigInput = Omit<KnowledgeVaultRigInput, "inputKind">;
export type KnowledgeVaultNewscableRigInput = Omit<KnowledgeVaultRigInput, "inputKind">;

export function knowledgeVaultRig(input: KnowledgeVaultRigInput): KnowledgeVaultRig {
  const mount = normalizeKnowledgeVaultPath(input.mount);
  if (mount === null || mount.length === 0) {
    throw new TypeError("knowledge vault rig mount must be a relative corpus path");
  }
  return knowledgeVaultRigCarrier.assert({
    kind: "organizing.knowledge-vault.corpus.rig" as const,
    ...input,
    mount,
  }, "knowledge vault rig");
}

export function knowledgeVaultNewswireRig(input: KnowledgeVaultNewswireRigInput): KnowledgeVaultRig {
  return knowledgeVaultRig({
    inputKind: "newswire",
    ...input,
  });
}

export function knowledgeVaultNewscableRig(input: KnowledgeVaultNewscableRigInput): KnowledgeVaultRig {
  return knowledgeVaultRig({
    inputKind: "newscable",
    ...input,
  });
}

export function knowledgeVaultRigging(input: Readonly<{
  root: KnowledgeVaultRoot;
  rigs: readonly KnowledgeVaultRigInput[];
}>): KnowledgeVaultRigging {
  const rigs = input.rigs.map((rig) => {
    const admitted = knowledgeVaultRig(rig);
    if (!knowledgeVaultPathAllowedInRoot(input.root.root, admitted.mount)) {
      throw new TypeError("knowledge vault rigging mount must stay in an allowed corpus prefix for the root");
    }
    return admitted;
  });
  return knowledgeVaultRiggingCarrier.assert({
    kind: "organizing.knowledge-vault.corpus.rigging" as const,
    root: input.root.root,
    rigCount: rigs.length,
    rigs,
  }, "knowledge vault rigging");
}

export function knowledgeVaultRigTerm(input: KnowledgeVaultRig): Tm {
  return carrierToTerm(jsonResource(knowledgeVaultRigCarrier.assert(input), "knowledge vault rig"));
}

export function knowledgeVaultRiggingTerm(input: KnowledgeVaultRigging): Tm {
  return carrierToTerm(jsonResource(knowledgeVaultRiggingCarrier.assert(input), "knowledge vault rigging"));
}
