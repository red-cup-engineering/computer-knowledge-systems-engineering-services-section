/**
 * agents - knowledge-repository orientation legs for coding agents.
 *
 * Actions are the executable morphisms. These resources and prompts are the
 * agent-facing repository affordances: stable context a client can discover
 * before deciding which morphism to invoke.
 */
import { literalResource, prompt, userMessage, type PromptCarrier, type ResourceCarrier } from "@emsenn/relating/running";
import {
  KNOWLEDGE_VAULT_DOCS_PATHS,
  KNOWLEDGE_VAULT_ROOT_PATHS,
  KNOWLEDGE_VAULT_SUPPORT_PREFIXES,
  describeKnowledgeVaultPath,
} from "../corpus/root.mjs";
import { DOCUMENT_OPERATION_KINDS } from "../mutating/placement.mjs";
import {
  KNOWLEDGE_VAULT_AGENT_PROFILE_CARRIER_ID,
  KNOWLEDGE_VAULT_AGENT_PROFILE_SCHEMA_URI,
  KNOWLEDGE_VAULT_AGENT_WORKFLOW_CARRIER_ID,
  KNOWLEDGE_VAULT_AGENT_WORKFLOW_SCHEMA_URI,
  knowledgeVaultAgentProfileCarrier,
  knowledgeVaultAgentWorkflowCarrier,
  type KnowledgeVaultAgentPathLaw,
  type KnowledgeVaultAgentProfile,
  type KnowledgeVaultAgentWorkflow,
} from "./carriers.mjs";

export const KNOWLEDGE_VAULT_AGENT_ORIENTATION_URI = "organizing-a-knowledge-vault://agents/orientation";
export const KNOWLEDGE_VAULT_AGENT_PATH_LAW_URI = "organizing-a-knowledge-vault://agents/path-law";
export const KNOWLEDGE_VAULT_AGENT_PROFILE_URI = "organizing-a-knowledge-vault://agents/profile.json";
export const KNOWLEDGE_VAULT_AGENT_WORKFLOW_URI = "organizing-a-knowledge-vault://agents/workflow.json";
export const KNOWLEDGE_VAULT_AGENT_WORKFLOW_PROMPT = "orient-knowledge-vault-agent";

function describedPaths(paths: readonly string[]): readonly Readonly<{ path: string; description: string }>[] {
  return Object.freeze(paths.map((path) => Object.freeze({ path, description: describeKnowledgeVaultPath(path) })));
}

export const knowledgeVaultAgentPathLaw: KnowledgeVaultAgentPathLaw = Object.freeze({
  mountedRoot: "content/",
  rootAffordances: describedPaths(KNOWLEDGE_VAULT_ROOT_PATHS),
  diataxisAffordances: describedPaths(KNOWLEDGE_VAULT_DOCS_PATHS),
  supportPrefixes: KNOWLEDGE_VAULT_SUPPORT_PREFIXES,
  dynamicObservedPrefixes: true,
  excludedObservedPrefixes: Object.freeze(["dot-directories", "node_modules"]),
});

export const knowledgeVaultAgentProfile: KnowledgeVaultAgentProfile = Object.freeze({
  kind: "organizing.knowledge-vault.agent.profile",
  carrier: KNOWLEDGE_VAULT_AGENT_PROFILE_CARRIER_ID,
  package: "@emsenn/organizing-a-knowledge-vault",
  corpusRole: "persistent-memorystore",
  upstreams: Object.freeze(["@emsenn/relating", "@emsenn/organizing", "@emsenn/knowing", "@emsenn/content"]),
  schemaResources: Object.freeze({
    profile: KNOWLEDGE_VAULT_AGENT_PROFILE_SCHEMA_URI,
    workflow: KNOWLEDGE_VAULT_AGENT_WORKFLOW_SCHEMA_URI,
  }),
  pathLaw: knowledgeVaultAgentPathLaw,
  contentRoots: Object.freeze({
    observedRootsAreAdmitted: true,
    discoveryAction: "inspect-root",
    supportPrefixesDoNotBecomeTopics: KNOWLEDGE_VAULT_SUPPORT_PREFIXES,
  }),
  placement: Object.freeze({
    dryRunFirst: true,
    operationKinds: DOCUMENT_OPERATION_KINDS,
    publicMorphisms: Object.freeze([
      "documentOperationKind",
      "documentTypeForOperationKind",
      "normalizeCorpusPlacementTopic",
      "targetPathForDocument",
    ]),
  }),
  recommendedActions: Object.freeze([
    "inspect-root",
    "catalog",
    "list",
    "find-name",
    "grep-text",
    "read",
    "browse",
    "locate",
    "topic-guidance",
    "inspect-topic",
    "concept-map",
    "measure-gap",
    "inspect-health",
    "normalization-plan",
    "create-document",
    "upload-triage-file",
  ]),
  evidencePolicy: Object.freeze([
    "Inspect and read bounded corpus evidence before mutating files.",
    "Use corpus-relative paths in reports.",
    "Treat generated plans and dry-run preparations as proposals, not source evidence.",
    "Pass --write true only after the prepared target path and findings have been inspected.",
  ]),
});

export const knowledgeVaultAgentWorkflow: KnowledgeVaultAgentWorkflow = Object.freeze({
  kind: "organizing.knowledge-vault.agent.workflow",
  carrier: KNOWLEDGE_VAULT_AGENT_WORKFLOW_CARRIER_ID,
  name: "read-before-write corpus maintenance",
  steps: Object.freeze([
    Object.freeze({
      name: "mount",
      purpose: "Resolve and inspect the content/ root before treating paths as corpus evidence.",
      actions: Object.freeze(["inspect-root"]),
    }),
    Object.freeze({
      name: "address",
      purpose: "Find the smallest relevant corpus region and evidence documents.",
      actions: Object.freeze(["catalog", "list", "find-name", "grep-text", "read"]),
    }),
    Object.freeze({
      name: "understand",
      purpose: "Project knowing and organizing readings over the admitted corpus region.",
      actions: Object.freeze(["browse", "locate", "topic-guidance", "inspect-topic", "concept-map", "measure-gap", "inspect-health"]),
    }),
    Object.freeze({
      name: "prepare",
      purpose: "Plan document placement or normalization as dry-run corpus mutations.",
      actions: Object.freeze(["normalization-plan", "create-document", "upload-triage-file"]),
    }),
    Object.freeze({
      name: "commit",
      purpose: "Write only after the prepared target path, operation kind, and findings are acceptable.",
      actions: Object.freeze(["create-document --write true", "upload-triage-file --write true"]),
    }),
  ]),
});

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const ORIENTATION_TEXT = `# Organizing a Knowledge Vault

This package models a repository content/ tree as a knowledge-vault corpus: the corpus is the persistent memorystore, while @emsenn/knowing supplies memory, proof, and research readings over admitted resources.

Agent working order:

1. Mount the corpus root with --path or ORGANIZING_KNOWLEDGE_VAULT_PATH. The expected root is content/.
2. Inspect before acting: run inspect-root, then catalog/list/find-name/grep-text/read on the smallest relevant region.
3. Treat proof paths as corpus paths. Use browse and locate to move through generated frontier nodes.
4. Use topic-guidance, inspect-topic, concept-map, measure-gap, and inspect-health for repository-maintenance judgment.
5. Use targetPathForDocument or create-document dry runs before writing. Mutating dispatcher actions are dry-run by default.
6. Cite corpus-relative paths when reporting evidence.

Important distinctions:

- knowing owns memory and memorystore abstractions. This package owns corpus specialization.
- organizing-a-knowledge-vault may say corpus. knowing should not.
- dev/ is support space and may appear at any point for local development notes.
- observed top-level directories under the mounted content/ root are valid corpus roots.
`;

const PATH_LAW_TEXT = `# Knowledge-Vault Path Law

The mounted root is a content/ directory.

Stable root affordances:

- scripts/
- content/
- _archive/
- _triage/
- docs/

Diataxis documentation affordances:

- docs/explanations/
- docs/references/
- docs/guides/
- docs/tutorials/

Support prefixes are readable but do not become proof frontier children:

- dev/
- docs/
- scripts/
- _archive/
- _triage/

Observed top-level prefixes are admitted dynamically, excluding dot directories and node_modules. This lets concrete content roots remain first-class without baking them into the universal law.

Placement law:

- Preserve observed content roots when preparing documents.
- Do not treat support prefixes such as dev/ as topic roots.
- Root Diataxis docs infer their subject topic from content, not from guides, references, tutorials, or explanations.
- Local support docs under a term inherit the term as their subject.
`;

export const knowledgeVaultAgentOrientationResource: ResourceCarrier = literalResource(
  KNOWLEDGE_VAULT_AGENT_ORIENTATION_URI,
  "Knowledge-vault agent orientation",
  ORIENTATION_TEXT,
  {
    mimeType: "text/markdown",
    description: "Repository orientation for coding agents and AI clients working in a knowledge vault.",
  },
);

export const knowledgeVaultAgentPathLawResource: ResourceCarrier = literalResource(
  KNOWLEDGE_VAULT_AGENT_PATH_LAW_URI,
  "Knowledge-vault path law",
  PATH_LAW_TEXT,
  {
    mimeType: "text/markdown",
    description: "The corpus path law for mounted content/ roots, support affordances, and placement.",
  },
);

export const knowledgeVaultAgentProfileResource: ResourceCarrier = literalResource(
  KNOWLEDGE_VAULT_AGENT_PROFILE_URI,
  "Knowledge-vault agent profile",
  jsonText(knowledgeVaultAgentProfile),
  {
    mimeType: "application/json",
    description: "Machine-readable repository profile for coding agents and AI clients.",
  },
);

export const knowledgeVaultAgentWorkflowResource: ResourceCarrier = literalResource(
  KNOWLEDGE_VAULT_AGENT_WORKFLOW_URI,
  "Knowledge-vault agent workflow",
  jsonText(knowledgeVaultAgentWorkflow),
  {
    mimeType: "application/json",
    description: "Machine-readable read-before-write workflow for knowledge-vault corpus maintenance.",
  },
);

export const knowledgeVaultAgentOrientationPrompt: PromptCarrier = prompt({
  name: KNOWLEDGE_VAULT_AGENT_WORKFLOW_PROMPT,
  description: "Orient a coding agent before reading or mutating a knowledge-vault corpus.",
  arguments: [
    Object.freeze({ name: "task", description: "The repository task the agent is about to perform.", required: true }),
    Object.freeze({ name: "path", description: "Optional corpus-relative path or topic to start from.", required: false }),
  ],
  compose: (args) => {
    const task = args["task"]?.trim() || "Work in the knowledge-vault corpus.";
    const path = args["path"]?.trim();
    const pathLine = path === undefined || path === "" ? "Start by inspecting the mounted root." : `Start from corpus path or topic: ${path}.`;
    return Object.freeze([
      userMessage([
        "You are working in @emsenn/organizing-a-knowledge-vault.",
        "",
        `Task: ${task}`,
        pathLine,
        "",
        "Use the package as a corpus-specialized memorystore interface, not as a generic filesystem scraper.",
        "Read the agent orientation and path-law resources first if your client can fetch resources.",
        "Then inspect-root, catalog/list/search/read bounded evidence, and only then plan changes.",
        "For document creation or movement, use placement morphisms or dry-run mutating actions before writing.",
        "Respect support spaces: dev/, docs/, scripts/, _archive/, and _triage/ are readable affordances, not proof frontier content roots.",
        "Report corpus-relative evidence paths in your answer.",
      ].join("\n")),
    ]);
  },
});

export const agentResources: readonly ResourceCarrier[] = Object.freeze([
  knowledgeVaultAgentOrientationResource,
  knowledgeVaultAgentPathLawResource,
  knowledgeVaultAgentProfileResource,
  knowledgeVaultAgentWorkflowResource,
]);

export const agentPrompts: readonly PromptCarrier[] = Object.freeze([
  knowledgeVaultAgentOrientationPrompt,
]);

export const resources = agentResources;
export const prompts = agentPrompts;

export {
  KNOWLEDGE_VAULT_AGENT_PROFILE_CARRIER_ID,
  KNOWLEDGE_VAULT_AGENT_PROFILE_SCHEMA_URI,
  KNOWLEDGE_VAULT_AGENT_WORKFLOW_CARRIER_ID,
  KNOWLEDGE_VAULT_AGENT_WORKFLOW_SCHEMA_URI,
  knowledgeVaultAgentProfileCarrier,
  knowledgeVaultAgentWorkflowCarrier,
  type KnowledgeVaultAgentPathLaw,
  type KnowledgeVaultAgentProfile,
  type KnowledgeVaultAgentWorkflow,
} from "./carriers.mjs";
