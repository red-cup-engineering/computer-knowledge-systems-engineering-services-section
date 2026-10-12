/**
 * agents/carriers - TypeBox carrier declarations for agent-facing resources.
 */
import { carrierFrom } from "@emsenn/relating";

export const KNOWLEDGE_VAULT_AGENT_PROFILE_CARRIER_ID = "organizing/knowledge-vault/agents/profile";
export const KNOWLEDGE_VAULT_AGENT_WORKFLOW_CARRIER_ID = "organizing/knowledge-vault/agents/workflow";
export const KNOWLEDGE_VAULT_AGENT_PROFILE_SCHEMA_URI = `${KNOWLEDGE_VAULT_AGENT_PROFILE_CARRIER_ID}.json`;
export const KNOWLEDGE_VAULT_AGENT_WORKFLOW_SCHEMA_URI = `${KNOWLEDGE_VAULT_AGENT_WORKFLOW_CARRIER_ID}.json`;

const pathAffordanceSchema = { additionalProperties: false, type: "object", required: ["path", "description"], properties: { path: { description: "the corpus-root-relative affordance path", type: "string" }, description: { description: "what the affordance is expected to hold", type: "string" } } } as const;

const agentPathLawSchema = { additionalProperties: false, type: "object", required: ["mountedRoot", "rootAffordances", "diataxisAffordances", "supportPrefixes", "dynamicObservedPrefixes", "excludedObservedPrefixes"], properties: { mountedRoot: { const: "content/" }, rootAffordances: { type: "array", items: pathAffordanceSchema }, diataxisAffordances: { type: "array", items: pathAffordanceSchema }, supportPrefixes: { type: "array", items: { type: "string" } }, dynamicObservedPrefixes: { type: "boolean" }, excludedObservedPrefixes: { type: "array", items: { type: "string" } } } } as const;

const agentWorkflowStepSchema = { additionalProperties: false, type: "object", required: ["name", "purpose", "actions"], properties: { name: { description: "the workflow stage name", type: "string" }, purpose: { description: "why this stage matters for the agent", type: "string" }, actions: { type: "array", items: { description: "dispatcher actions or direct commands used in this stage", type: "string" } } } } as const;

export const knowledgeVaultAgentProfileSchema = { $id: KNOWLEDGE_VAULT_AGENT_PROFILE_CARRIER_ID, title: "KnowledgeVaultAgentProfile", description: "Machine-readable repository profile for coding agents working over a knowledge-vault corpus.", type: "object", required: ["kind", "carrier", "package", "corpusRole", "upstreams", "schemaResources", "pathLaw", "contentRoots", "placement", "recommendedActions", "evidencePolicy"], properties: { kind: { const: "organizing.knowledge-vault.agent.profile" }, carrier: { const: KNOWLEDGE_VAULT_AGENT_PROFILE_CARRIER_ID }, package: { const: "@emsenn/organizing-a-knowledge-vault" }, corpusRole: { const: "persistent-memorystore" }, upstreams: { type: "array", items: { description: "packages this knowledge-vault interface inherits from", type: "string" } }, schemaResources: { additionalProperties: false, type: "object", required: ["profile", "workflow"], properties: { profile: { const: "organizing/knowledge-vault/agents/profile.json" }, workflow: { const: "organizing/knowledge-vault/agents/workflow.json" } } }, pathLaw: agentPathLawSchema, contentRoots: { additionalProperties: false, type: "object", required: ["observedRootsAreAdmitted", "discoveryAction", "supportPrefixesDoNotBecomeTopics"], properties: { observedRootsAreAdmitted: { type: "boolean" }, discoveryAction: { const: "inspect-root" }, supportPrefixesDoNotBecomeTopics: { type: "array", items: { type: "string" } } } }, placement: { additionalProperties: false, type: "object", required: ["dryRunFirst", "operationKinds", "publicMorphisms"], properties: { dryRunFirst: { const: true }, operationKinds: { type: "array", items: { type: "string" } }, publicMorphisms: { type: "array", items: { type: "string" } } } }, recommendedActions: { type: "array", items: { type: "string" } }, evidencePolicy: { type: "array", items: { type: "string" } } }, additionalProperties: false } as const;

export const knowledgeVaultAgentProfileCarrier = carrierFrom(knowledgeVaultAgentProfileSchema);

export const knowledgeVaultAgentWorkflowSchema = { $id: KNOWLEDGE_VAULT_AGENT_WORKFLOW_CARRIER_ID, title: "KnowledgeVaultAgentWorkflow", description: "Machine-readable read-before-write workflow for knowledge-vault corpus maintenance.", type: "object", required: ["kind", "carrier", "name", "steps"], properties: { kind: { const: "organizing.knowledge-vault.agent.workflow" }, carrier: { const: KNOWLEDGE_VAULT_AGENT_WORKFLOW_CARRIER_ID }, name: { type: "string" }, steps: { type: "array", items: agentWorkflowStepSchema } }, additionalProperties: false } as const;

export const knowledgeVaultAgentWorkflowCarrier = carrierFrom(knowledgeVaultAgentWorkflowSchema);

export type KnowledgeVaultAgentPathLaw = Readonly<{
  mountedRoot: "content/";
  rootAffordances: readonly Readonly<{ path: string; description: string }>[];
  diataxisAffordances: readonly Readonly<{ path: string; description: string }>[];
  supportPrefixes: readonly string[];
  dynamicObservedPrefixes: boolean;
  excludedObservedPrefixes: readonly string[];
}>;

export type KnowledgeVaultAgentProfile = Readonly<{
  kind: "organizing.knowledge-vault.agent.profile";
  carrier: "organizing/knowledge-vault/agents/profile";
  package: "@emsenn/organizing-a-knowledge-vault";
  corpusRole: "persistent-memorystore";
  upstreams: readonly string[];
  schemaResources: Readonly<{
    profile: "organizing/knowledge-vault/agents/profile.json";
    workflow: "organizing/knowledge-vault/agents/workflow.json";
  }>;
  pathLaw: KnowledgeVaultAgentPathLaw;
  contentRoots: Readonly<{
    observedRootsAreAdmitted: boolean;
    discoveryAction: "inspect-root";
    supportPrefixesDoNotBecomeTopics: readonly string[];
  }>;
  placement: Readonly<{
    dryRunFirst: true;
    operationKinds: readonly string[];
    publicMorphisms: readonly string[];
  }>;
  recommendedActions: readonly string[];
  evidencePolicy: readonly string[];
}>;

export type KnowledgeVaultAgentWorkflow = Readonly<{
  kind: "organizing.knowledge-vault.agent.workflow";
  carrier: "organizing/knowledge-vault/agents/workflow";
  name: string;
  steps: readonly Readonly<{
    name: string;
    purpose: string;
    actions: readonly string[];
  }>[];
}>;
