import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";

import { actionMcpHandle, actionMcpPrompts, actionMcpResources, actionMcpTools, actionOpenApi, induceBins } from "@emsenn/relating/running";
import {
  actions,
  resources,
  prompts,
  legs,
  kernelRelationalHullStage0Actions,
  KNOWLEDGE_VAULT_AGENT_ORIENTATION_URI,
  KNOWLEDGE_VAULT_AGENT_PATH_LAW_URI,
  KNOWLEDGE_VAULT_AGENT_PROFILE_URI,
  KNOWLEDGE_VAULT_AGENT_WORKFLOW_URI,
  KNOWLEDGE_VAULT_AGENT_WORKFLOW_PROMPT,
  knowledgeVaultAgentProfile,
  knowledgeVaultAgentWorkflow,
  KNOWLEDGE_VAULT_AGENT_PROFILE_SCHEMA_URI,
  KNOWLEDGE_VAULT_AGENT_WORKFLOW_SCHEMA_URI,
  knowledgeVaultAgentProfileCarrier,
  knowledgeVaultAgentWorkflowCarrier,
  addressedNameMatchCarrier,
  addressedNameSearchCarrier,
  addressedTextHitCarrier,
  addressedTextSearchCarrier,
  catalogCarrier,
  catalogCorpus,
  catalogDocumentMatches,
  catalogDocumentCarrier,
  catalogFacetCarrier,
  catalogGroupCarrier,
  admitCorpusMemory,
  admitCorpusBoundaryDocument,
  admitCorpusBoundaryDocuments,
  admitCorpusResource,
  admitCorpusResources,
  corpusResourceFromBoundaryDocument,
  auditDocumentType,
  claimDocumentType,
  children,
  createDocument,
  buildBuiltinDocumentTypes,
  collectMarkdownPaths,
  corpusDocumentKind,
  corpusDocumentCarrier,
  knowledgeVaultRig,
  knowledgeVaultRigCarrier,
  knowledgeVaultRigging,
  knowledgeVaultRiggingCarrier,
  corpusBoundary,
  corpusNodeCarrier,
  documentTypeAuditCarrier,
  documentTypeClaimCarrier,
  documentTypeLocationCarrier,
  documentTypeProjectionCarrier,
  documentTypeRealizationCarrier,
  documentFrontmatterMutationCarrier,
  documentBodyMutationCarrier,
  documentPreparationCarrier,
  documentOperationKind,
  documentTypeForOperationKind,
  knowledgeVaultRootCarrier,
  documentBacklinkQueries,
  frontierCarrier,
  findAddressedName,
  grepAddressedText,
  listEntryCarrier,
  listEntries,
  listingCarrier,
  memoryHealthProjectionCarrier,
  memoryHealthProjection,
  popularCatalogDocuments,
  memoryHealthDashboard,
  organizeCorpus,
  normalizationPlanCarrier,
  normalizationPlanDashboard,
  preparedDocumentCarrier,
  planMemoryNormalization,
  emptyNormalizationPlan,
  filterNormalizationPlanRules,
  planNormalizationEndomorphism,
  planTopicConceptMap,
  planTopicGapMeasurement,
  planTopicGuidance,
  planTopicInspection,
  prepareCorpusDocument,
  prepareCorpusFrontmatterUpdate,
  prepareCorpusBodyUpdate,
  prepareRelationalHullStage0BoundaryFile,
  prepareNormalizationOperations,
  prepareTriageBatchUpload,
  prepareTriageUpload,
  scanRelationalHullStage0Boundary,
  RELATIONAL_HULL_STAGE0_BOUNDARY_PATH,
  resolveKnowledgeVaultRoot,
  buildNominationPrompt,
  conceptMapDraftContext,
  conceptMapDraftPaths,
  conceptMapResource,
  conceptMapTags,
  countConceptMapResourcesByKind,
  countConceptMapTags,
  normalizeTopicPath,
  normalizeCorpusPlacementTopic,
  parseNominationResponse,
  projectDocumentType,
  parseAddressedPaths,
  pathQueryVariants,
  readDocument,
  relatedCatalogDocuments,
  realizeDocumentType,
  resolveNode,
  triageBatchUploadCarrier,
  triageUploadCarrier,
  relationalHullStage0BoundaryCarrier,
  relationalHullStage0BoundaryFileCarrier,
  topicConceptMapCarrier,
  topicGapMeasurementCarrier,
  topicGuidanceCarrier,
  topicInspectionCarrier,
  updateFrontmatter,
  facetCorpusCatalog,
  gatherResources,
  searchCatalogDocuments,
  slugifyConceptTopic,
  topicFromPath,
  topicQueryVariants,
  topicTokens,
  targetPathForDocument,
  corpusReadBounds,
  draftKindForCorpusDocumentKind,
  DEFAULT_CORPUS_LIMIT,
  DEFAULT_CORPUS_MAX_SCAN,
  MAX_CORPUS_LIMIT,
  MAX_CORPUS_SCAN,
  isTriagePath,
  knowledgeVaultRoot,
  KNOWLEDGE_VAULT_PATH_DESCRIPTIONS,
  confineKnowledgeVaultPath,
  knowledgeVaultAllowedPrefixes,
  knowledgeVaultObservedPrefixes,
  describeKnowledgeVaultPath,
  knowledgeVaultPathAllowed,
  knowledgeVaultPathAllowedInRoot,
  normalizeKnowledgeVaultPath,
  normalizeCorpusDocumentKind,
} from "../dist/index.mjs";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "organizing-knowledge-vault-"));
  mkdirSync(path.join(root, "mark", "content", "token"), { recursive: true });
  mkdirSync(path.join(root, "mark", "claim"), { recursive: true });
  const write = (relative, text) => {
    const file = path.join(root, ...relative.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text, "utf8");
  };
  write("mark/mark.md", "---\ntitle: Mark\ndescription: Root mark\ntags:\n  - mark\n---\n\nA mark is a primitive.\n");
  write("mark/content/token/token.md", "---\ntitle: Token\n---\n\nA token carries identity.\n");
  write("mark/claim/claim.md", "---\ntitle: Claim\n---\n\nA claim carries content.\n");
  return root;
}

test("corpus resolves proof paths and reads generated frontiers", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  mkdirSync(path.join(root, "docs", "guides"), { recursive: true });
  mkdirSync(path.join(root, "dev"), { recursive: true });
  mkdirSync(path.join(root, "mark", "guides"), { recursive: true });
  mkdirSync(path.join(root, "mark", "dev"), { recursive: true });
  writeFileSync(path.join(root, "dev", "note.md"), "---\ntitle: Development Note\n---\n\n# Development Note\n", "utf8");
  writeFileSync(path.join(root, "mark", "guides", "using-mark.md"), "# Using Mark\n", "utf8");
  writeFileSync(path.join(root, "mark", "dev", "note.md"), "---\ntitle: Mark Development Note\n---\n\n# Mark Development Note\n", "utf8");

  const resolved = resolveNode(root, "mark");
  assert.equal(resolved?.node.kind, "organizing.knowledge-vault.corpus.node");
  assert.equal(resolved.node.address, "mark");
  assert.equal(resolved.node.title, "Mark");

  const frontier = children(root, "mark").map((node) => node.address).sort();
  assert.deepEqual(frontier, ["mark/claim", "mark/token"]);
  assert.deepEqual(children(root, "").map((node) => node.address), ["mark"]);
  assert.equal(readDocument(root, "mark/guides/using-mark.md").title, "Using Mark");
  assert.equal(readDocument(root, "dev/note.md").title, "Development Note");
  assert.equal(readDocument(root, "mark/dev/note.md").title, "Mark Development Note");
});

test("corpus lists and reads confined markdown resources", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const listing = listEntries(root, "");
  assert.equal(listing.kind, "organizing.knowledge-vault.corpus.listing");
  assert.equal(listing.path, "");
  assert.equal(listing.targetKind, "directory");
  assert.equal(listing.total, 1);
  assert.equal(listing.truncated, false);
  assert.deepEqual(listing.entries, [{ name: "mark", path: "mark", kind: "directory" }]);

  const limited = listEntries(root, "mark", { limit: "1" });
  assert.equal(limited.total, 3);
  assert.equal(limited.entries.length, 1);
  assert.equal(limited.truncated, true);

  const fileListing = listEntries(root, "mark/mark.md");
  assert.equal(fileListing.targetKind, "file");
  assert.deepEqual(fileListing.entries, []);

  const document = readDocument(root, "mark/mark.md");
  assert.equal(document.kind, "organizing.knowledge-vault.corpus.document");
  assert.equal(document.title, "Mark");
  assert.equal(document.description, "Root mark");
  assert.deepEqual(document.tags, ["mark"]);
  assert.deepEqual(document.authors, []);
  assert.equal(document.topic, "mark");
  assert.equal(document.frontmatter.title, "Mark");
  assert.match(document.body, /primitive/);
  assert.equal(document.preview, "A mark is a primitive.");
  assert.deepEqual(documentBacklinkQueries(document), ["mark/mark.md", "[[Mark]]", "[[mark]]", "](mark/mark.md)", "Mark", "mark"]);
  assert.equal(corpusDocumentKind("content/information/relationality.md", { type: "term" }), "term");
  assert.equal(corpusDocumentKind("docs/guides/field-note.md", { type: "guide" }), "guide");
  assert.equal(corpusDocumentKind("_triage/2026-06-23-note.md"), "triage");
  assert.equal(corpusDocumentKind("docs/tutorials/using-memory.md"), "tutorial");
  assert.equal(corpusDocumentKind("content/information/source.md"), "source");
  assert.equal(topicFromPath("docs/guides/using-memory.md"), "memory");
  assert.equal(topicFromPath("docs/explanations/introduction-to-relationality.md"), "relationality");
  assert.equal(topicFromPath("docs/references/document-types/specification/specification.md"), "document-types");
  assert.equal(topicFromPath("mark/guides/using-mark.md"), "mark");
  assert.equal(normalizeCorpusDocumentKind("nonsense"), "explanation");
  assert.equal(draftKindForCorpusDocumentKind("term"), "explanation");
  assert.equal(draftKindForCorpusDocumentKind("specification"), "reference");
  assert.equal(isTriagePath("_triage/inbox.md"), true);
  assert.equal(isTriagePath("content/triaging/inbox/incoming.md"), true);
  assert.equal(document.bytes, Buffer.byteLength(readFileSync(path.join(root, "mark", "mark.md"), "utf8"), "utf8"));
});

test("corpus admits a bounded region as knowing memory", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const memory = admitCorpusMemory(root, "mark", { limit: 2 });
  assert.equal(memory.kind, "knowing.memory");
  assert.equal(memory.root, root);
  assert.equal(memory.documents.length, 2);
  assert.ok(memory.documents.every((document) => document.path.startsWith("mark/")));
});

test("corpus collects bounded markdown paths through directory traversal", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "mark", "notes.txt"), "not markdown\n", "utf8");
  mkdirSync(path.join(root, "mark", "drafts"), { recursive: true });
  writeFileSync(path.join(root, "mark", "drafts", "later.md"), "# Later\n", "utf8");
  writeFileSync(path.join(root, "mark", "drafts", "early.md"), "# Early\n", "utf8");

  const collected = collectMarkdownPaths(root, "mark/drafts", { fileLimit: 1, directoryLimit: 20 });
  assert.equal(collected.path, "mark/drafts");
  assert.deepEqual(collected.paths, ["mark/drafts/later.md"]);
  assert.equal(collected.truncated, true);
  assert.equal(collected.directoriesVisited, 1);

  const missing = collectMarkdownPaths(root, "content/missing", { fileLimit: 2 });
  assert.deepEqual(missing.paths, []);
  assert.throws(() => readDocument(root, "random/note.md"), /allowed corpus prefix/);
  assert.throws(() => listEntries(root, "random"), /allowed corpus prefix/);
  assert.throws(() => gatherResources(root, "random"), /allowed corpus prefix/);
  assert.equal(missing.directoriesVisited, 1);
  assert.equal(missing.truncated, false);
});

test("corpus read bounds are package law for direct API calls", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(corpusReadBounds(undefined, undefined), {
    limit: DEFAULT_CORPUS_LIMIT,
    maxScan: DEFAULT_CORPUS_MAX_SCAN,
  });
  assert.deepEqual(corpusReadBounds(0, -9), { limit: 1, maxScan: 1 });
  assert.deepEqual(corpusReadBounds(99_999, 99_999), {
    limit: MAX_CORPUS_LIMIT,
    maxScan: MAX_CORPUS_SCAN,
  });

  assert.equal(gatherResources(root, "mark", 0, 99).length, 1);
  assert.equal(admitCorpusMemory(root, "mark", { limit: 0 }).documents.length, 1);
  assert.equal(admitCorpusMemory(root, "mark", { limit: "2", maxScan: "1" }).documents.length, 1);
});

test("corpus models content/ as the knowledge-vault root", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  mkdirSync(path.join(root, "content"), { recursive: true });
  mkdirSync(path.join(root, "_archive"), { recursive: true });
  mkdirSync(path.join(root, "_triage"), { recursive: true });
  mkdirSync(path.join(root, "docs", "explanations"), { recursive: true });
  mkdirSync(path.join(root, "docs", "references"), { recursive: true });
  mkdirSync(path.join(root, "docs", "guides"), { recursive: true });
  mkdirSync(path.join(root, "docs", "tutorials"), { recursive: true });
  mkdirSync(path.join(root, "mark"), { recursive: true });

  const modeled = knowledgeVaultRoot(root);
  assert.equal(modeled.kind, "organizing.knowledge-vault.corpus.root");
  assert.deepEqual(modeled.missingPaths, []);
  assert.ok(modeled.stablePrefixes.includes("content"));
  assert.equal(modeled.stablePrefixes.includes("mark"), false);
  assert.ok(modeled.observedPrefixes.includes("mark"));
  assert.ok(modeled.allowedPrefixes.includes("content"));
  assert.ok(modeled.allowedPrefixes.includes("mark"));
  assert.ok(modeled.expectedPaths.some((entry) => entry.path === "docs/tutorials" && entry.present && /tutorials/.test(entry.description)));
  assert.match(KNOWLEDGE_VAULT_PATH_DESCRIPTIONS["content"], /knowledge tree/);
  assert.match(describeKnowledgeVaultPath("docs/references"), /references/);
  assert.equal(describeKnowledgeVaultPath("../docs/references"), "");
  assert.deepEqual(knowledgeVaultObservedPrefixes(path.join(root, "missing")), []);
  assert.ok(knowledgeVaultAllowedPrefixes(root).includes("mark"));
  assert.ok(knowledgeVaultRootCarrier.validate(modeled));
  assert.equal(normalizeKnowledgeVaultPath("\\content\\information\\note.md"), "content/information/note.md");
  assert.equal(normalizeKnowledgeVaultPath("../content/nope.md"), null);
  assert.equal(normalizeKnowledgeVaultPath("C:\\content\\nope.md"), null);
  assert.equal(knowledgeVaultPathAllowed("content/information/note.md"), true);
  assert.equal(knowledgeVaultPathAllowed("mark/mark.md"), false);
  assert.equal(knowledgeVaultPathAllowedInRoot(root, "mark/mark.md"), true);
  assert.equal(knowledgeVaultPathAllowed("random/information/note.md"), false);
  assert.equal(knowledgeVaultPathAllowed("docs/tutorials/how-to.md", ["docs"]), true);
  assert.equal(confineKnowledgeVaultPath(root, "content/information/note.md"), path.join(root, "content", "information", "note.md"));
  assert.equal(confineKnowledgeVaultPath(root, "mark/mark.md"), path.join(root, "mark", "mark.md"));
  assert.equal(confineKnowledgeVaultPath(root, "random/information/note.md"), null);
});

test("corpus root modeling admits observed topic roots while reporting missing affordances", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "_archive"), { recursive: true });
  mkdirSync(path.join(root, "_triage"), { recursive: true });
  mkdirSync(path.join(root, ".claude"), { recursive: true });
  mkdirSync(path.join(root, "dev"), { recursive: true });
  mkdirSync(path.join(root, "mark"), { recursive: true });

  const modeled = knowledgeVaultRoot(root);
  assert.deepEqual(modeled.observedPrefixes, ["_archive", "_triage", "dev", "mark"]);
  assert.deepEqual(modeled.missingPaths, [
    "scripts",
    "content",
    "docs",
    "docs/explanations",
    "docs/references",
    "docs/guides",
    "docs/tutorials",
  ]);
  assert.ok(modeled.allowedPrefixes.includes("dev"));
  assert.ok(modeled.allowedPrefixes.includes("mark"));
  assert.equal(modeled.allowedPrefixes.includes(".claude"), false);
  assert.equal(confineKnowledgeVaultPath(root, "dev/references/note.md"), path.join(root, "dev", "references", "note.md"));
  assert.equal(confineKnowledgeVaultPath(root, ".claude/settings.local.json"), null);
  assert.ok(knowledgeVaultRootCarrier.validate(modeled));
});

test("corpus resolves the mounted content/ root from workspace context", (t) => {
  const workspace = mkdtempSync(path.join(tmpdir(), "organizing-knowledge-workspace-"));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const mounted = path.join(workspace, "content");
  const nested = path.join(workspace, "sites", "research.561.group", "src");
  writeFileSync(path.join(workspace, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  mkdirSync(path.join(mounted, "content"), { recursive: true });
  mkdirSync(nested, { recursive: true });

  assert.equal(resolveKnowledgeVaultRoot(undefined, { start: nested, env: {} }), mounted);
  assert.equal(resolveKnowledgeVaultRoot("content", { start: nested, env: {} }), path.resolve("content"));
  assert.equal(resolveKnowledgeVaultRoot(undefined, { start: nested, env: { ORGANIZING_KNOWLEDGE_VAULT_PATH: mounted } }), mounted);
});

test("corpus admits inline resources as knowing memory without filesystem discovery", () => {
  const resource = {
    path: "inline/note.md",
    content: "---\ntitle: Inline Note\ntags:\n  - inline\n---\n\nInline body.",
  };
  const document = admitCorpusResource("inline-root", resource);
  assert.equal(document.kind, "knowing.memory.document");
  assert.equal(document.path, "inline/note.md");
  assert.equal(document.frontMatter.title, "Inline Note");

  const memory = admitCorpusResources("inline-root", [resource]);
  assert.equal(memory.kind, "knowing.memory");
  assert.equal(memory.documents.length, 1);
  assert.equal(memory.documents[0]?.path, "inline/note.md");

  const boundaryDocument = { path: "boundary/note.md", text: "---\ntitle: Boundary Note\n---\n\nBoundary body." };
  assert.deepEqual(corpusResourceFromBoundaryDocument(boundaryDocument), {
    path: "boundary/note.md",
    content: "---\ntitle: Boundary Note\n---\n\nBoundary body.",
  });
  const admittedBoundary = admitCorpusBoundaryDocument("boundary-root", boundaryDocument);
  assert.equal(admittedBoundary.path, "boundary/note.md");
  assert.equal(admittedBoundary.frontMatter.title, "Boundary Note");
  const boundaryMemory = admitCorpusBoundaryDocuments("boundary-root", [boundaryDocument]);
  assert.equal(boundaryMemory.kind, "knowing.memory");
  assert.equal(boundaryMemory.documents[0]?.path, "boundary/note.md");
});

test("mutating prepares corpus documents as dry-run by default", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const prepared = createDocument(root, {
    path: "content/new/new.md",
    title: "New",
    tags: ["note"],
    body: "Prepared body.",
  }, false);

  assert.equal(prepared.kind, "organizing.knowledge-vault.mutating.prepared");
  assert.equal(prepared.written, false);
  assert.match(prepared.text, /title: New/);
  assert.throws(() => readFileSync(path.join(root, "content", "new", "new.md"), "utf8"), /ENOENT/);
  assert.throws(() => createDocument(root, { path: "random/escape.md", title: "Escape" }, false), /allowed corpus prefix/);
  assert.throws(() => createDocument(root, { path: "../escape.md", title: "Escape" }, false), /allowed corpus prefix/);
});

test("mutating updates frontmatter only when writes are explicit", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const target = path.join(root, "mark", "mark.md");
  const before = readFileSync(target, "utf8");
  const prepared = updateFrontmatter(root, { path: "mark/mark.md", title: "Marked", tags: ["mark", "updated"] }, false);
  assert.equal(prepared.written, false);
  assert.match(prepared.text, /title: Marked/);
  assert.equal(readFileSync(target, "utf8"), before);

  const written = updateFrontmatter(root, { path: "mark/mark.md", title: "Marked", tags: ["mark", "updated"] }, true);
  assert.equal(written.written, true);
  const after = readDocument(root, "mark/mark.md");
  assert.equal(after.frontmatter.title, "Marked");
  assert.deepEqual(after.frontmatter.tags, ["mark", "updated"]);
  assert.match(after.body, /primitive/);
});

test("mutating prepares content-corpus documents with placement and reference lint", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const prepared = prepareCorpusDocument(root, {
    topic: "information/terms",
    kind: "term",
    title: "Relational Memory",
    tags: "Memory, Relation, memory",
    aliases: ["Remembering Relation"],
    status: "draft",
    references: [{ type: "article-journal", id: "memory-paper", title: "Memory Paper" }],
    body: "# Relational Memory\n\nA prepared term.",
  });

  assert.equal(prepared.kind, "organizing.knowledge-vault.mutating.document-preparation");
  assert.equal(prepared.topic, "content/information/terms");
  assert.equal(prepared.documentKind, "term");
  assert.equal(prepared.targetPath, "content/information/terms/relational-memory.md");
  assert.equal(prepared.frontmatter.type, "term");
  assert.deepEqual(prepared.frontmatter.tags, ["memory", "relation"]);
  assert.equal(prepared.references.length, 1);
  assert.match(prepared.text, /references:/);
  assert.equal(prepared.exists, false);
  assert.ok(!prepared.lint.some((item) => item.severity === "error"));
  assert.ok(documentPreparationCarrier.validate(prepared));

  const rejected = prepareCorpusDocument(root, {
    targetPath: "notes/escape.md",
    topic: "information",
    kind: "guide",
    title: "Rejected",
    body: "# Rejected\n",
  });
  assert.ok(rejected.lint.some((item) => item.rule === "invalid-target-path" && item.severity === "error"));

  const observedRoot = prepareCorpusDocument(root, {
    targetPath: "mark/docs/dev/mark-note.md",
    topic: "mark",
    kind: "reference",
    title: "Mark Note",
    body: "# Mark Note\n",
  });
  assert.equal(observedRoot.targetPath, "mark/docs/dev/mark-note.md");

  const observedTopic = prepareCorpusDocument(root, {
    topic: "mark",
    kind: "term",
    title: "Mark Note",
    body: "# Mark Note\n",
  });
  assert.equal(observedTopic.topic, "mark");
  assert.equal(observedTopic.targetPath, "mark/mark-note.md");

  mkdirSync(path.join(root, "dev"), { recursive: true });
  const devTopic = prepareCorpusDocument(root, {
    topic: "dev",
    kind: "term",
    title: "Development Note",
    body: "# Development Note\n",
  });
  assert.equal(devTopic.topic, "content/dev");
  assert.equal(devTopic.targetPath, "content/dev/development-note.md");

  const guide = prepareCorpusDocument(root, {
    topic: "information",
    kind: "guide",
    title: "Using Relational Memory",
    body: "# Using Relational Memory\n",
  });
  assert.equal(guide.targetPath, "docs/guides/using-relational-memory.md");
  assert.equal(documentOperationKind("guide"), "guide");
  assert.equal(documentTypeForOperationKind("specification"), "specification");
  assert.equal(normalizeCorpusPlacementTopic("mark", knowledgeVaultAllowedPrefixes(root)), "mark");
  assert.equal(normalizeCorpusPlacementTopic("dev", knowledgeVaultAllowedPrefixes(root)), "content/dev");
  assert.equal(targetPathForDocument({
    topic: "mark",
    kind: "term",
    title: "Mark Note",
    allowedPrefixes: knowledgeVaultAllowedPrefixes(root),
  }), "mark/mark-note.md");
});

test("mutating prepares corpus frontmatter and body updates without owning transport", () => {
  const existing = [
    "---",
    'title: "Old Title"',
    'type: "guide"',
    'tags: ["Memory Work"]',
    "references:",
    '  - type: "article-journal"',
    '    id: "paper"',
    '    title: "Paper"',
    "---",
    "# Old Title",
    "",
    "Old body.",
  ].join("\n");

  const frontmatter = prepareCorpusFrontmatterUpdate("content/information/guides/old-title.md", existing, {
    set: { title: "New Title" },
    addTags: ["Relational Memory"],
    unset: ["status"],
    dryRun: true,
  });
  assert.equal(frontmatter.kind, "organizing.knowledge-vault.mutating.document-frontmatter-mutation");
  assert.equal(frontmatter.dryRun, true);
  assert.equal(frontmatter.written, false);
  assert.equal(frontmatter.frontmatter.title, "New Title");
  assert.deepEqual(frontmatter.frontmatter.tags, ["memory-work", "relational-memory"]);
  assert.equal(frontmatter.references.beforeDialect, "csl");
  assert.equal(frontmatter.references.afterDialect, "csl");
  assert.equal(frontmatter.references.itemCount, 1);
  assert.match(frontmatter.text, /New Title/);
  assert.match(frontmatter.text, /references:/);
  assert.ok(documentFrontmatterMutationCarrier.validate(frontmatter));

  const body = prepareCorpusBodyUpdate("content/information/guides/old-title.md", existing, "# New Title\n\nNew body.", { dryRun: false });
  assert.equal(body.kind, "organizing.knowledge-vault.mutating.document-body-mutation");
  assert.equal(body.dryRun, false);
  assert.equal(body.written, false);
  assert.equal(body.references.preserved, true);
  assert.match(body.text, /New body\./);
  assert.match(body.text, /references:/);
  assert.ok(documentBodyMutationCarrier.validate(body));
  assert.throws(() => prepareCorpusFrontmatterUpdate("content/x.md", existing, { unset: ["references"] }), /references field/);
});

test("mutating prepares and writes triage uploads under dated corpus paths", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const now = new Date("2026-06-23T12:00:00.000Z");

  const prepared = prepareTriageUpload(root, { content: "# Field Note\n\nIncoming." }, { now });
  assert.equal(prepared.kind, "organizing.knowledge-vault.mutating.triage-upload");
  assert.match(prepared.path, /^_triage\/2026\/06\/23\/2026-06-23-field-note-[a-f0-9]{10}\.md$/);
  assert.equal(prepared.written, false);
  assert.ok(triageUploadCarrier.validate(prepared));
  assert.throws(() => readFileSync(path.join(root, ...prepared.path.split("/")), "utf8"), /ENOENT/);

  const written = prepareTriageUpload(root, { content: "# Field Note\n\nIncoming." }, { now, write: true });
  assert.equal(written.written, true);
  assert.equal(readFileSync(path.join(root, ...written.path.split("/")), "utf8"), "# Field Note\n\nIncoming.");

  const duplicate = prepareTriageUpload(root, { content: "# Field Note\n\nIncoming." }, { now, write: true });
  assert.match(duplicate.path, /-2\.md$/);

  const batch = prepareTriageBatchUpload(root, [{ content: "One" }, { content: "Two" }], { now });
  assert.equal(batch.kind, "organizing.knowledge-vault.mutating.triage-batch-upload");
  assert.equal(batch.count, 2);
  assert.equal(batch.bytes, 6);
  assert.equal(batch.written, false);
  assert.ok(triageBatchUploadCarrier.validate(batch));
});

test("mutating admits kernel content/triaging/inbox as stage-0 relational hull boundary", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const now = new Date("2026-06-26T13:14:15.000Z");

  const missing = scanRelationalHullStage0Boundary(root);
  assert.equal(missing.kind, "organizing.knowledge-vault.mutating.relational-hull-stage0-boundary");
  assert.equal(missing.stage, 0);
  assert.equal(missing.boundary, RELATIONAL_HULL_STAGE0_BOUNDARY_PATH);
  assert.equal(missing.present, false);
  assert.ok(relationalHullStage0BoundaryCarrier.validate(missing));

  const prepared = prepareRelationalHullStage0BoundaryFile(root, {
    filename: "agent-note.md",
    content: "# Agent Note\n\nStage zero.",
  }, { now });
  assert.equal(prepared.path.startsWith("content/triaging/inbox/2026-06-26-agent-note-"), true);
  assert.equal(prepared.written, false);
  assert.ok(relationalHullStage0BoundaryFileCarrier.validate(prepared));
  assert.throws(() => readFileSync(path.join(root, ...prepared.path.split("/")), "utf8"), /ENOENT/);

  const written = prepareRelationalHullStage0BoundaryFile(root, {
    filename: "agent-note.md",
    content: "# Agent Note\n\nStage zero.",
  }, { now, write: true });
  assert.equal(written.written, true);
  assert.equal(readFileSync(path.join(root, ...written.path.split("/")), "utf8"), "# Agent Note\n\nStage zero.");

  const boundary = scanRelationalHullStage0Boundary(root);
  assert.equal(boundary.present, true);
  assert.equal(boundary.total, 1);
  assert.equal(boundary.files[0].stage, 0);
  assert.equal(boundary.files[0].boundary, RELATIONAL_HULL_STAGE0_BOUNDARY_PATH);
  assert.equal(boundary.files[0].path, written.path);
  assert.ok(relationalHullStage0BoundaryCarrier.validate(boundary));
});

test("mutating plans corpus memorystore normalization without writing", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "content", "essays"), { recursive: true });
  writeFileSync(path.join(root, "content", "essays", "mixed-tags.md"), "---\ntitle: Mixed Tags\ntags: Relation Work\nsee-also:\n  - Memory Store\n---\n\nBody.\n", "utf8");
  writeFileSync(path.join(root, "content", "essays", "untitled-note.md"), "---\ndescription: Needs title\n---\n\nBody.\n", "utf8");
  writeFileSync(path.join(root, "content", "essays", "kind-only.md"), "---\ntitle: Kind Only\nkind: Field Note\n---\n\nBody.\n", "utf8");
  writeFileSync(path.join(root, "content", "essays", "class-only.md"), "---\ntitle: Class Only\nclass: Research Memo\n---\n\nBody.\n", "utf8");
  writeFileSync(path.join(root, "content", "essays", "genre-conflict.md"), "---\ntitle: Genre Conflict\ntype: note\nkind: memo\n---\n\nBody.\n", "utf8");

  const memory = admitCorpusMemory(root, "content/essays");
  const plan = planMemoryNormalization(memory);
  assert.equal(plan.kind, "organizing.knowledge-vault.mutating.normalization-plan");
  assert.equal(plan.documents, 5);
  assert.ok(plan.items.some((item) => item.path === "content/essays/untitled-note.md" && item.rule === "missing-title" && item.action === "add-title"));
  assert.ok(plan.items.some((item) => item.path === "content/essays/mixed-tags.md" && item.rule === "tags-noncanonical" && item.action === "rewrite-field"));
  assert.ok(plan.items.some((item) => item.path === "content/essays/mixed-tags.md" && item.rule === "nonstandard-relation-field" && item.action === "move-field-values-to-tags"));
  assert.ok(plan.items.some((item) => item.path === "content/essays/kind-only.md" && item.rule === "genre-variant-key" && item.action === "rename-key"));
  assert.ok(plan.items.some((item) => item.path === "content/essays/class-only.md" && item.rule === "genre-class-without-type" && item.action === "add-field"));
  assert.ok(plan.items.some((item) => item.path === "content/essays/genre-conflict.md" && item.rule === "genre-conflict" && item.action === "resolve-conflict"));
  assert.ok(normalizationPlanCarrier.validate(plan));

  const prepared = prepareNormalizationOperations(plan.items, { dryRun: true });
  assert.ok(prepared.some((item) => item.operation?.path === "content/essays/untitled-note.md" && item.operation.set?.title === "Untitled Note"));
  assert.ok(prepared.some((item) =>
    item.operation?.path === "content/essays/mixed-tags.md"
    && item.operation.addTags?.includes("memory-store")
    && item.operation.unset?.includes("see-also")));
  assert.ok(prepared.some((item) =>
    item.operation?.path === "content/essays/kind-only.md"
    && item.operation.set?.type === "field-note"
    && item.operation.unset?.includes("kind")));
  assert.ok(prepared.some((item) => item.review?.reason.includes("conflicting genre fields")));

  const titleOnly = prepareNormalizationOperations(plan.items, { dryRun: true, rule: "missing-title" });
  assert.ok(titleOnly.length >= 1);
  assert.ok(titleOnly.every((item) => item.item.rule === "missing-title"));
  assert.ok(titleOnly.some((item) => item.operation?.set?.title === "Untitled Note"));

  const genreOnly = filterNormalizationPlanRules(plan, ["genre-variant-key", "genre-class-without-type", "genre-conflict"]);
  assert.equal(genreOnly.documents, plan.documents);
  assert.ok(genreOnly.items.length > 0);
  assert.ok(genreOnly.items.every((item) => ["genre-variant-key", "genre-class-without-type", "genre-conflict"].includes(item.rule)));

  const empty = emptyNormalizationPlan(memory);
  assert.equal(empty.documents, memory.documents.length);
  assert.deepEqual(empty.items, []);

  const identity = planNormalizationEndomorphism(memory, "identity");
  assert.equal(identity?.kind, "organizing.knowledge-vault.mutating.normalization-endomorphism");
  assert.equal(identity?.name, "identity");
  assert.deepEqual(identity?.plan.items, []);

  const fold = planNormalizationEndomorphism(memory, "fold-genre-vocabulary");
  assert.equal(fold?.name, "fold-genre-vocabulary");
  assert.deepEqual(fold?.plan.items.map((item) => item.rule), genreOnly.items.map((item) => item.rule));
  assert.equal(planNormalizationEndomorphism(memory, "unknown"), null);
});

test("mutating plans topic guidance from corpus-backed memory", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "content", "information", "notes"), { recursive: true });
  writeFileSync(path.join(root, "content", "information", "notes", "relation-work.md"), "---\ndescription: Needs title\ntags: Relation Work\n---\n\nRelations first.\n", "utf8");
  const memory = admitCorpusMemory(root, "content/information");
  const guidance = planTopicGuidance(memory, "relationality");
  assert.equal(guidance.kind, "organizing.knowledge-vault.mutating.topic-guidance");
  assert.equal(guidance.targetRoot, "content/information");
  assert.ok(guidance.suggestedTargetPaths.includes("content/information/relationality.md"));
  assert.ok(guidance.suggestedScaffolds.some((item) => item.kind === "term" && item.type === "term"));
  assert.ok(guidance.suggestedActions.some((item) => item.kind === "create-document"));
  assert.ok(guidance.suggestedActions.some((item) => item.kind === "update-frontmatter"));
  assert.ok(topicGuidanceCarrier.validate(guidance));

  const health = memoryHealthProjection(memory);
  assert.equal(health.kind, "organizing.knowledge-vault.holography.memory-health");
  assert.deepEqual(health.admittedPaths, ["content/information/notes/relation-work.md"]);
  assert.equal(health.dashboard.kind, "organizing.knowledge-vault.holography.memory-health-dashboard");
  assert.ok(memoryHealthProjectionCarrier.validate(health));

  const inspection = planTopicInspection(memory, "relationality");
  assert.equal(inspection.kind, "organizing.knowledge-vault.mutating.topic-inspection");
  assert.deepEqual(inspection.admittedPaths, health.admittedPaths);
  assert.ok(inspection.dashboard.suggestedTargetPaths.includes("content/information/relationality.md"));
  assert.equal(inspection.dashboard.health.kind, "organizing.knowledge-vault.holography.memory-health-dashboard");
  assert.equal(inspection.carrierReadings.guidance.kind, "organizing.knowledge-vault.mutating.topic-guidance");
  assert.ok(topicInspectionCarrier.validate(inspection));

  const gap = planTopicGapMeasurement(memory, "relationality");
  assert.equal(gap.kind, "organizing.knowledge-vault.mutating.topic-gap-measurement");
  assert.deepEqual(gap.admittedPaths, health.admittedPaths);
  assert.equal(gap.dashboard.documentsInspected, 1);
  assert.ok(Array.isArray(gap.dashboard.axes));
  assert.equal(gap.guidance.kind, "organizing.knowledge-vault.mutating.topic-guidance");
  assert.ok(topicGapMeasurementCarrier.validate(gap));

  const markMemory = admitCorpusMemory(root, "mark");
  const markGuidance = planTopicGuidance(markMemory, "mark");
  assert.equal(markGuidance.targetRoot, "mark");
  assert.ok(markGuidance.suggestedTargetPaths.includes("mark/mark.md"));

  mkdirSync(path.join(root, "dev"), { recursive: true });
  writeFileSync(path.join(root, "dev", "scratch.md"), "---\ntitle: Scratch\n---\n\nDeveloper notes.\n", "utf8");
  const devMemory = admitCorpusMemory(root, "dev");
  const devGuidance = planTopicGuidance(devMemory, "scratch");
  assert.equal(devGuidance.targetRoot, "content");
  assert.ok(devGuidance.suggestedTargetPaths.includes("content/scratch.md"));
});

test("mutating parses and normalizes corpus placement nominations", () => {
  const prompt = buildNominationPrompt({
    title: "Field Note",
    text: "A note about relational memory placement.".repeat(600),
    topics: ["information/terms", "information/explanations"],
  });
  assert.match(prompt.system, /knowledge-vault corpus placement classifier/);
  assert.match(prompt.user, /TOPIC:/);
  assert.match(prompt.user, /content-relative path/);
  assert.ok(prompt.user.length < 8_800);
  assert.equal(normalizeTopicPath("/content/Information Terms/Relational Memory/"), "information-terms/relational-memory");

  const nomination = parseNominationResponse([
    "TOPIC: content/Information/Terms/Relational Memory",
    "KIND: guide",
    "TITLE: Relational Memory Placement",
    "TAGS: relational-memory, UDC 1, relational-memory, classification, storage, vault, extra",
    "SUMMARY: Places the note in a relation-first memory branch.",
  ].join("\n"));
  assert.deepEqual(nomination, {
    topic: "information/terms/relational-memory",
    kind: "guide",
    title: "Relational Memory Placement",
    tags: ["relational-memory", "udc-1", "classification", "storage", "vault", "extra"],
    summary: "Places the note in a relation-first memory branch.",
  });
  assert.equal(parseNominationResponse("TOPIC: memory\nKIND: nonsense\nTITLE: X\nTAGS: one\nSUMMARY: S").kind, "explanation");
  assert.throws(() => parseNominationResponse("KIND: guide\nTITLE: Missing topic"), /usable topic path/);
});

test("mutating derives draft paths and tags from concept maps", () => {
  const term = conceptMapResource({
    path: "content/information/terms/relational-memory.md",
    frontmatter: {
      title: "Relational Memory",
      description: "Memory as relation.",
      tags: "memory, relation",
      aliases: ["Remembering Relation"],
    },
  }, "concept-home");
  const guide = conceptMapResource({
    path: "content/information/guides/using-memory.md",
    frontmatter: { tags: ["memory"] },
  }, "supporting");
  const conceptMap = {
    topic: "Relational Memory",
    admittedPaths: ["content/information/terms/memory.md"],
    dashboard: {
      resourcesByKind: [{ kind: "term", count: 1 }],
      topTags: [
        { tag: "memory" },
        { tag: "relation" },
        { tag: "memory" },
        { tag: "" },
        "bad",
      ],
      gaps: ["missing guide"],
      gapAxes: [{ axis: "coverage" }],
      suggestedScaffolds: [{ path: "content/information/guides/using-memory.md" }],
    },
    resources: {
      terms: [{ path: "content/information/terms/memory.md" }, { path: "content/information/terms/memory.md" }],
      guides: [{ path: "content/information/guides/using-memory.md" }],
      explanations: [{ path: "content/information/explanations/memory.md" }],
      sourceDocuments: [{ path: "content/source.md" }, { noPath: true }],
    },
  };
  assert.deepEqual(term, {
    path: "content/information/terms/relational-memory.md",
    title: "Relational Memory",
    kind: "term",
    role: "concept-home",
    tags: ["memory", "relation"],
    aliases: ["Remembering Relation"],
    description: "Memory as relation.",
  });
  assert.equal(guide.title, "Using Memory");
  assert.deepEqual(countConceptMapResourcesByKind([term, guide]), [{ kind: "guide", count: 1 }, { kind: "term", count: 1 }]);
  assert.deepEqual(countConceptMapTags([term, guide]), [{ tag: "memory", count: 2 }, { tag: "relation", count: 1 }]);
  const memory = admitCorpusBoundaryDocuments("concept-map-smoke", [
    {
      path: "content/information/terms/relational-memory.md",
      text: "---\ntitle: Relational Memory\ntype: term\ntags: [memory, relation]\n---\n\nRelational memory is remembering through relation.\n",
    },
    {
      path: "docs/guides/using-relational-memory.md",
      text: "---\ntitle: Using Relational Memory\ntype: guide\ntags: [memory]\n---\n\nA guide for memory work.\n",
    },
  ]);
  const planned = planTopicConceptMap(memory, "Relational Memory", [
    { path: "content/information/terms/relational-memory.md", frontmatter: { title: "Relational Memory", type: "term", tags: ["memory", "relation"] } },
    { path: "docs/guides/using-relational-memory.md", frontmatter: { title: "Using Relational Memory", type: "guide", tags: ["memory"] } },
  ]);
  assert.equal(planned.kind, "organizing.knowledge-vault.mutating.topic-concept-map");
  assert.deepEqual(planned.admittedPaths, ["content/information/terms/relational-memory.md", "docs/guides/using-relational-memory.md"]);
  assert.deepEqual(planned.resources.terms.map((item) => item.path), ["content/information/terms/relational-memory.md"]);
  assert.deepEqual(planned.dashboard.resourcesByKind, [{ kind: "guide", count: 1 }, { kind: "term", count: 1 }]);
  assert.ok(planned.dashboard.conceptHomes.some((item) => item.path === "content/information/terms/relational-memory.md"));
  assert.equal(planned.dashboard.health.kind, "organizing.knowledge-vault.holography.memory-health-dashboard");
  assert.ok(topicConceptMapCarrier.validate(planned));
  assert.equal(slugifyConceptTopic("Relational Memory!"), "relational-memory");
  assert.deepEqual(conceptMapDraftPaths(conceptMap, 3), [
    "content/information/terms/memory.md",
    "content/information/guides/using-memory.md",
    "content/information/explanations/memory.md",
  ]);
  assert.deepEqual(conceptMapTags(conceptMap, "Relational Memory"), ["relational-memory", "memory", "relation"]);
  assert.deepEqual(conceptMapDraftPaths({ resources: null }, 5), []);
  assert.deepEqual(conceptMapDraftContext(conceptMap), {
    kind: "organizing.knowledge-vault.mutating.concept-map-draft-context",
    topic: "Relational Memory",
    admittedPaths: ["content/information/terms/memory.md"],
    dashboard: {
      resourcesByKind: [{ kind: "term", count: 1 }],
      topTags: conceptMap.dashboard.topTags,
      gaps: ["missing guide"],
      gapAxes: [{ axis: "coverage" }],
      suggestedScaffolds: [{ path: "content/information/guides/using-memory.md" }],
    },
    resources: {
      terms: [
        { path: "content/information/terms/memory.md", title: undefined, kind: undefined, role: undefined, tags: undefined },
        { path: "content/information/terms/memory.md", title: undefined, kind: undefined, role: undefined, tags: undefined },
      ],
      guides: [{ path: "content/information/guides/using-memory.md", title: undefined, kind: undefined, role: undefined, tags: undefined }],
      explanations: [{ path: "content/information/explanations/memory.md", title: undefined, kind: undefined, role: undefined, tags: undefined }],
      sourceDocuments: [{ path: "content/source.md", title: undefined, kind: undefined, role: undefined, tags: undefined }, { path: undefined, title: undefined, kind: undefined, role: undefined, tags: undefined }],
    },
  });
});

test("document type catalog builds, realizes, and audits markdown placement law", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const projections = buildBuiltinDocumentTypes(root, { under: "docs/references/document-types", base: "https://example.test/corpus/" });
  const specification = projections.find((entry) => entry.location.slug === "specification");
  assert.equal(specification?.kind, "organizing.knowledge-vault.corpus.document-type-projection");
  assert.equal(specification.location.schemaPath, "docs/references/document-types/specification/specification.schema.json");
  assert.equal(specification.contradictions.length, 0);
  assert.ok(documentTypeProjectionCarrier.validate(specification));
  assert.ok(documentTypeLocationCarrier.validate(specification.location));

  const projectedAgain = projectDocumentType(root, "docs/references/document-types/specification", { base: "https://example.test/corpus/" });
  assert.equal(projectedAgain.written, false);
  assert.throws(() => claimDocumentType(root, "random/document-types/specification", {}, { t: "bad" }), /allowed corpus prefix/);

  const prepared = realizeDocumentType(root, "docs/references/document-types/specification", {
    at: "mark",
    name: "Mark Specification",
    description: "Normative development notes for mark.",
  });
  assert.equal(prepared.kind, "organizing.knowledge-vault.corpus.document-type-realization");
  assert.equal(prepared.path, "mark/docs/dev/specification.md");
  assert.equal(prepared.written, false);
  assert.match(prepared.text, /name: Mark Specification/);
  assert.ok(documentTypeRealizationCarrier.validate(prepared));
  assert.throws(() => readFileSync(path.join(root, "mark", "docs", "dev", "specification.md"), "utf8"), /ENOENT/);
  assert.throws(() => realizeDocumentType(root, "docs/references/document-types/specification", {
    at: "random",
    name: "Random Specification",
    description: "Outside observed prefixes.",
  }), /allowed corpus prefix/);

  const written = realizeDocumentType(root, "docs/references/document-types/specification", {
    at: "mark",
    name: "Mark Specification",
    description: "Normative development notes for mark.",
    write: true,
  });
  assert.equal(written.written, true);
  const audit = auditDocumentType(root, "mark/docs/dev/specification.md", { catalogPath: "docs/references/document-types" });
  assert.equal(audit.kind, "organizing.knowledge-vault.corpus.document-type-audit");
  assert.equal(audit.conformant, true);
  assert.equal(audit.typePath, "docs/references/document-types/specification");
  assert.equal(audit.thing, "mark");
  assert.ok(documentTypeAuditCarrier.validate(audit));
  assert.throws(() => auditDocumentType(root, "random/docs/dev/specification.md", { catalogPath: "docs/references/document-types" }), /allowed corpus prefix/);

  writeFileSync(path.join(root, "mark", "docs", "dev", "bad.md"), "# no frontmatter\n", "utf8");
  const bad = auditDocumentType(root, "mark/docs/dev/bad.md", { typePath: "docs/references/document-types/specification" });
  assert.equal(bad.conformant, false);
  assert.ok(bad.violations.some((violation) => violation.includes("filename")));
  assert.ok(bad.violations.some((violation) => violation.includes("frontmatter")));
});

test("corpus organizes through @emsenn/organizing", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const boundary = corpusBoundary(root, "", { limit: 10 });
  assert.match(boundary.socializing, /mark\/mark\.md\|present-in-corpus/);
  assert.match(boundary.computing, /mark\/mark\.md\|markdown-conformant/);
  assert.match(boundary.gaming, /mark\/mark\.md\|tag:mark/);

  const organization = organizeCorpus(root, "", { identity: "fixture-corpus", limit: "10" });
  assert.equal(organization.kind, "organizing.organization");
  assert.equal(organization.identity, "fixture-corpus");
  assert.equal(organization.settledBelow, true);
  assert.equal(organization.openAbove, true);

  const scanBound = corpusBoundary(root, "", { limit: "10", maxScan: "1" });
  assert.match(scanBound.socializing, /mark\/mark\.md\|present-in-corpus/);
  assert.doesNotMatch(scanBound.socializing, /token\/token\.md\|present-in-corpus/);
});

test("corpus organizing rejects empty or escaped regions", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.throws(() => organizeCorpus(root, "content/missing"), /organize-corpus: no corpus resources to organize/);
  assert.throws(() => organizeCorpus(root, "missing"), /allowed corpus prefix/);
  assert.throws(() => corpusBoundary(root, "../"), /relative corpus path/);
});

test("corpus catalogs bounded document facets from the memorystore", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  mkdirSync(path.join(root, "content", "essays"), { recursive: true });
  mkdirSync(path.join(root, "content", "notes"), { recursive: true });
  mkdirSync(path.join(root, "docs", "guides"), { recursive: true });
  mkdirSync(path.join(root, "docs", "explanations"), { recursive: true });
  writeFileSync(path.join(root, "content", "essays", "relationality.md"), "---\ntitle: Relationality\nsummary: A relation-first note\nauthor: Emsenn\ntags:\n  - relation\n  - memory\n---\n\nRelations first.\n", "utf8");
  writeFileSync(path.join(root, "content", "essays", "relation-fieldwork.md"), "---\ntitle: Relation Fieldwork\nauthor: Emsenn\ntags:\n  - relation\n---\n\nField notes.\n", "utf8");
  writeFileSync(path.join(root, "content", "notes", "memory-store.md"), "---\ntitle: Memory Store\nauthors:\n  - Emsenn\n  - Collaborator\ntopics: memory, catalog\n---\n\nA persistent memory store.\n", "utf8");
  writeFileSync(path.join(root, "docs", "guides", "using-memory.md"), "---\ntitle: Using Memory\ntype: guide\n---\n\nUse memory carefully.\n", "utf8");
  writeFileSync(path.join(root, "docs", "explanations", "introduction-to-relationality.md"), "---\ntitle: Introduction to Relationality\ntype: explanation\n---\n\nRelation-first orientation.\n", "utf8");

  const catalog = catalogCorpus(root, { path: "content", limit: 10 });
  assert.equal(catalog.kind, "organizing.knowledge-vault.corpus.catalog");
  assert.equal(catalog.path, "content");
  assert.equal(catalog.total, 3);
  assert.equal(catalog.truncated, false);
  assert.deepEqual(catalog.documents.map((document) => document.title), ["Memory Store", "Relation Fieldwork", "Relationality"]);
  assert.equal(catalog.documents.find((document) => document.path.endsWith("relationality.md"))?.description, "A relation-first note");
  assert.ok(catalog.authors.some((group) => group.name === "Emsenn" && group.count === 3));
  assert.ok(catalog.topics.some((group) => group.name === "memory" && group.count === 2));
  assert.ok(catalogCarrier.validate(catalog));
  assert.ok(catalog.documents.every((document) => catalogDocumentCarrier.validate(document)));
  assert.ok(catalog.authors.every((group) => catalogGroupCarrier.validate(group)));
  assert.deepEqual(searchCatalogDocuments(catalog.documents, "collaborator").map((document) => document.title), ["Memory Store"]);
  assert.equal(catalogDocumentMatches(catalog.documents[0], "collaborator"), true);
  assert.equal(catalogDocumentMatches(catalog.documents[0], ""), false);
  assert.equal(popularCatalogDocuments(catalog.documents, 1)[0]?.title, "Relationality");
  assert.deepEqual(relatedCatalogDocuments(catalog.documents[2], catalog.documents).map((document) => document.title), ["Relation Fieldwork", "Memory Store"]);

  const facet = facetCorpusCatalog(root, { path: "content", kind: "author", name: "emsenn", limit: 5 });
  assert.equal(facet.kind, "organizing.knowledge-vault.corpus.catalog-facet");
  assert.equal(facet.facet, "author");
  assert.equal(facet.name, "Emsenn");
  assert.equal(facet.matchedCount, 3);
  assert.ok(facetCatalogTitles(facet).includes("Relationality"));
  assert.ok(catalogFacetCarrier.validate(facet));

  const truncated = catalogCorpus(root, { path: "content", maxScan: 1, limit: 10 });
  assert.equal(truncated.scanned, 1);
  assert.equal(truncated.truncated, true);

  const rootCatalog = catalogCorpus(root, { path: "", limit: 20 });
  const memoryGuide = rootCatalog.documents.find((document) => document.path === "docs/guides/using-memory.md");
  const relationalityExplanation = rootCatalog.documents.find((document) => document.path === "docs/explanations/introduction-to-relationality.md");
  assert.equal(memoryGuide?.topic, "memory");
  assert.equal(relationalityExplanation?.topic, "relationality");
  assert.equal(rootCatalog.topics.some((group) => group.name === "guides"), false);
  assert.ok(rootCatalog.topics.some((group) => group.name === "memory" && group.documents.some((document) => document.path === "docs/guides/using-memory.md")));

  assert.throws(() => catalogCorpus(root, { path: "../" }), /relative corpus path/);
});

function facetCatalogTitles(facet) {
  return facet.documents.map((document) => document.title);
}

test("addressing finds corpus paths and lexical evidence through a public subpath", async (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const { findAddressedName: findFromSubpath, grepAddressedText: grepFromSubpath } = await import("../dist/addressing/index.mjs");
  assert.equal(findFromSubpath, findAddressedName);
  assert.equal(grepFromSubpath, grepAddressedText);

  const found = findAddressedName(root, { query: "token", limit: 10 });
  assert.equal(found.kind, "organizing.knowledge-vault.addressing.name-search");
  assert.equal(found.query, "token");
  assert.ok(found.scanned > 0);
  assert.ok(found.results.some((match) => match.path === "mark/content/token" && match.kind === "directory"));
  assert.equal(found.truncated, false);

  const grep = grepAddressedText(root, { query: "identity", path: "mark", limit: 10 });
  assert.equal(grep.kind, "organizing.knowledge-vault.addressing.text-search");
  assert.equal(grep.path, "mark");
  assert.equal(grep.truncated, false);
  assert.equal(grep.scanTruncated, false);
  assert.ok(grep.filesScanned > 0);
  assert.deepEqual(grep.hits.map((hit) => hit.path), ["mark/content/token/token.md"]);
  assert.equal(grep.hits[0]?.line, 5);

  assert.throws(() => findAddressedName(root, { query: "mark", path: "../" }), /relative corpus path/);
  assert.throws(() => grepAddressedText(root, { query: "identity", path: "missing" }), /allowed corpus prefix/);

  const oneName = findAddressedName(root, { query: "mark", limit: "1" });
  assert.equal(oneName.results.length, 1);
  assert.equal(oneName.truncated, true);

  const oneHit = grepAddressedText(root, { query: "a", limit: "1" });
  assert.equal(oneHit.hits.length, 1);
  assert.equal(oneHit.truncated, true);

  const scanBound = grepAddressedText(root, { query: "a", maxScan: "1", limit: "10" });
  assert.equal(scanBound.filesScanned, 1);
  assert.equal(scanBound.scanTruncated, true);

  const nameScanBound = findAddressedName(root, { query: "mark", maxScan: "1", limit: "10" });
  assert.equal(nameScanBound.scanned, 1);
  assert.equal(nameScanBound.truncated, true);
});

test("addressing derives topic query variants for corpus search", () => {
  assert.deepEqual(topicTokens("The Practice of Relational Memory"), ["practice", "relational", "memory"]);
  assert.deepEqual(parseAddressedPaths(" content/a.md, ,content/b.md "), ["content/a.md", "content/b.md"]);
  assert.deepEqual(parseAddressedPaths([" content/a.md ", 12, "content/b.md"]), ["content/a.md", "content/b.md"]);
  assert.deepEqual(topicQueryVariants("The Practice of Relational Memory"), [
    "The Practice of Relational Memory",
    "practice relational memory",
    "practice relational",
    "practice-relational",
    "relational memory",
    "relational-memory",
    "practice",
    "relational",
    "memory",
  ]);
  assert.deepEqual(pathQueryVariants("The Practice of Relational Memory"), [
    "The Practice of Relational Memory",
    "practice-relational-memory",
    "practice",
    "relational",
    "memory",
  ]);
});

test("addressing CLI actions emit carrier-shaped search results", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const foundStdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "find-name",
    "--path",
    root,
    "--limit",
    "10",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "token",
    encoding: "utf8",
  });
  const found = JSON.parse(foundStdout);
  assert.equal(found.kind, "organizing.knowledge-vault.addressing.name-search");
  assert.ok(addressedNameSearchCarrier.validate(found));
  assert.ok(found.results.some((match) => match.path === "mark/content/token" && match.kind === "directory"));

  const grepStdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "grep-text",
    "--path",
    root,
    "--region",
    "mark",
    "--limit",
    "10",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "identity",
    encoding: "utf8",
  });
  const grep = JSON.parse(grepStdout);
  assert.equal(grep.kind, "organizing.knowledge-vault.addressing.text-search");
  assert.ok(addressedTextSearchCarrier.validate(grep));
  assert.deepEqual(grep.hits.map((hit) => hit.path), ["mark/content/token/token.md"]);
});

test("organize-corpus CLI action emits an organizing organization", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const stdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "organize-corpus",
    "--path",
    root,
    "--identity",
    "cli-corpus",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "",
    encoding: "utf8",
  });
  const organization = JSON.parse(stdout);
  assert.equal(organization.kind, "organizing.organization");
  assert.equal(organization.identity, "cli-corpus");
});

test("inspect-root CLI action emits the knowledge-vault root model", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const relative of ["scripts", "content", "_archive", "_triage", "docs/explanations", "docs/references", "docs/guides", "docs/tutorials"]) {
    mkdirSync(path.join(root, ...relative.split("/")), { recursive: true });
  }

  const stdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "inspect-root",
    "--path",
    root,
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "",
    encoding: "utf8",
  });
  const inspected = JSON.parse(stdout);
  assert.equal(inspected.kind, "organizing.knowledge-vault.corpus.root");
  assert.deepEqual(inspected.missingPaths, []);
  assert.ok(inspected.stablePrefixes.includes("content"));
  assert.equal(inspected.stablePrefixes.includes("mark"), false);
  assert.ok(inspected.observedPrefixes.includes("mark"));
  assert.ok(inspected.allowedPrefixes.includes("content"));
  assert.ok(inspected.allowedPrefixes.includes("mark"));
  assert.ok(inspected.expectedPaths.some((entry) => entry.path === "content" && /knowledge tree/.test(entry.description)));
  assert.ok(knowledgeVaultRootCarrier.validate(inspected));
});

test("catalog CLI actions emit carrier-shaped catalog views", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "content", "essays"), { recursive: true });
  mkdirSync(path.join(root, "content", "notes"), { recursive: true });
  writeFileSync(path.join(root, "content", "essays", "relationality.md"), "---\ntitle: Relationality\nauthor: Emsenn\ntags:\n  - relation\n---\n\nRelations first.\n", "utf8");
  writeFileSync(path.join(root, "content", "notes", "memory.md"), "---\ntitle: Memory\nauthor: Emsenn\ntags:\n  - memory\n---\n\nRemembered relations.\n", "utf8");

  const catalogStdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "catalog",
    "--path",
    root,
    "--limit",
    "10",
    "--maxScan",
    "1",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "content",
    encoding: "utf8",
  });
  const catalog = JSON.parse(catalogStdout);
  assert.equal(catalog.kind, "organizing.knowledge-vault.corpus.catalog");
  assert.ok(catalogCarrier.validate(catalog));
  assert.equal(catalog.scanned, 1);
  assert.equal(catalog.truncated, true);
  assert.equal(catalog.documents.length, 1);

  const facetStdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "catalog-facet",
    "--path",
    root,
    "--kind",
    "author",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: JSON.stringify({ path: "content", name: "emsenn" }),
    encoding: "utf8",
  });
  const facet = JSON.parse(facetStdout);
  assert.equal(facet.kind, "organizing.knowledge-vault.corpus.catalog-facet");
  assert.equal(facet.facet, "author");
  assert.ok(catalogFacetCarrier.validate(facet));
  assert.ok(facetCatalogTitles(facet).includes("Relationality"));
  assert.ok(facetCatalogTitles(facet).includes("Memory"));
});

test("normalization-plan CLI action emits a carrier-shaped plan", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "content"), { recursive: true });
  writeFileSync(path.join(root, "content", "untitled-note.md"), "---\ndescription: Needs title\n---\n\nBody.\n", "utf8");

  const stdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "normalization-plan",
    "--path",
    root,
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "content",
    encoding: "utf8",
  });
  const plan = JSON.parse(stdout);
  assert.equal(plan.kind, "organizing.knowledge-vault.mutating.normalization-plan");
  assert.ok(plan.items.some((item) => item.path === "content/untitled-note.md" && item.rule === "missing-title"));
  assert.ok(normalizationPlanCarrier.validate(plan));
});

test("topic-guidance CLI action emits a carrier-shaped guidance plan", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "content", "information", "notes"), { recursive: true });
  writeFileSync(path.join(root, "content", "information", "notes", "relation-work.md"), "---\ndescription: Needs title\ntags: Relation Work\n---\n\nRelations first.\n", "utf8");

  const stdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "topic-guidance",
    "--path",
    root,
    "--region",
    "content",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "relationality",
    encoding: "utf8",
  });
  const guidance = JSON.parse(stdout);
  assert.equal(guidance.kind, "organizing.knowledge-vault.mutating.topic-guidance");
  assert.ok(guidance.suggestedTargetPaths.includes("content/information/relationality.md"));
  assert.ok(topicGuidanceCarrier.validate(guidance));
});

test("triage upload CLI action is dry-run by default and writes explicitly", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const dryStdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "upload-triage-file",
    "--path",
    root,
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: JSON.stringify({ content: "# CLI Note\n\nIncoming." }),
    encoding: "utf8",
  });
  const dry = JSON.parse(dryStdout);
  assert.equal(dry.kind, "organizing.knowledge-vault.mutating.triage-upload");
  assert.equal(dry.written, false);
  assert.ok(triageUploadCarrier.validate(dry));

  const writeStdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "upload-triage-file",
    "--path",
    root,
    "--write",
    "true",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: JSON.stringify({ content: "# CLI Note\n\nIncoming." }),
    encoding: "utf8",
  });
  const written = JSON.parse(writeStdout);
  assert.equal(written.written, true);
  assert.equal(readFileSync(path.join(root, ...written.path.split("/")), "utf8"), "# CLI Note\n\nIncoming.");
});

test("memory-backed CLI actions expose maxScan as corpus read law", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const stdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "settle-memory",
    "--path",
    root,
    "--maxScan",
    "1",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "mark",
    encoding: "utf8",
  });
  const proof = JSON.parse(stdout);
  assert.equal(proof.kind, "knowing.memory.proof");
  assert.equal(proof.documents, 1);

  const healthStdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "inspect-health",
    "--path",
    root,
    "--maxScan",
    "1",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "mark",
    encoding: "utf8",
  });
  const health = JSON.parse(healthStdout);
  assert.equal(health.kind, "organizing.knowledge-vault.holography.memory-health");
  assert.equal(health.dashboard.kind, "organizing.knowledge-vault.holography.memory-health-dashboard");
  assert.ok(memoryHealthProjectionCarrier.validate(health));

  const topicStdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "inspect-topic",
    "--path",
    root,
    "--region",
    "mark",
    "--maxScan",
    "10",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "Token",
    encoding: "utf8",
  });
  const topic = JSON.parse(topicStdout);
  assert.equal(topic.kind, "organizing.knowledge-vault.mutating.topic-inspection");
  assert.equal(topic.carrierReadings.inspection.kind, "knowing.memory.topic-inspection");
  assert.ok(topicInspectionCarrier.validate(topic));

  const gapStdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "measure-gap",
    "--path",
    root,
    "--region",
    "mark",
    "--maxScan",
    "10",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "Token",
    encoding: "utf8",
  });
  const gap = JSON.parse(gapStdout);
  assert.equal(gap.kind, "organizing.knowledge-vault.mutating.topic-gap-measurement");
  assert.equal(gap.carrierReading.kind, "knowing.memory.gap");
  assert.ok(topicGapMeasurementCarrier.validate(gap));

  const conceptStdout = execFileSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "concept-map",
    "--path",
    root,
    "--region",
    "mark",
    "--maxScan",
    "10",
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "Token",
    encoding: "utf8",
  });
  const concept = JSON.parse(conceptStdout);
  assert.equal(concept.kind, "organizing.knowledge-vault.mutating.topic-concept-map");
  assert.equal(concept.carrierReadings.inspection.kind, "knowing.memory.topic-inspection");
  assert.ok(concept.dashboard.conceptHomes.some((item) => item.path === "mark/content/token/token.md"));
  assert.ok(concept.resources.sourceDocuments.some((item) => item.path === "mark/content/token/token.md" && item.role === "concept-home"));
  assert.ok(topicConceptMapCarrier.validate(concept));
});

test("locate CLI rejects unknown topics instead of emitting null", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "locate",
    "--path",
    root,
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "missing",
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /organize-knowledge-vault locate: no such topic in the corpus: "missing"/);
});

test("research CLI rejects empty regions instead of emitting a non-research carrier", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [
    "dist/scripts/cli.mjs",
    "research",
    "--path",
    root,
  ], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: "content/missing",
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /organize-knowledge-vault research: no corpus resources to research/);
});

test("published corpus declarations expose corpus type names", () => {
  const corpusDeclarations = readFileSync(path.resolve(import.meta.dirname, "../dist/corpus/carriers.d.mts"), "utf8");
  assert.match(corpusDeclarations, /interface CorpusNode/);
  assert.match(corpusDeclarations, /interface CorpusDocument/);
  assert.doesNotMatch(corpusDeclarations, /interface VaultNode|interface VaultDocument/);

  const mutatingDeclarations = readFileSync(path.resolve(import.meta.dirname, "../dist/mutating/index.d.mts"), "utf8");
  assert.match(mutatingDeclarations, /topicInspectionCarrier/);
  assert.match(mutatingDeclarations, /topicGapMeasurementCarrier/);
  assert.match(mutatingDeclarations, /topicConceptMapCarrier/);
  assert.match(mutatingDeclarations, /type TopicInspectionPlan/);
  assert.match(mutatingDeclarations, /type TopicGapMeasurementPlan/);
  assert.match(mutatingDeclarations, /type TopicConceptMap/);

  const holographyDeclarations = readFileSync(path.resolve(import.meta.dirname, "../dist/holography/index.d.mts"), "utf8");
  assert.match(holographyDeclarations, /memoryHealthProjectionCarrier/);
  assert.match(holographyDeclarations, /interface MemoryHealthProjection/);
});

test("root package exports authored carrier declarations", () => {
  for (const [carrier, id] of [
    [corpusNodeCarrier, "organizing/knowledge-vault/corpus/node"],
    [frontierCarrier, "organizing/knowledge-vault/corpus/frontier"],
    [corpusDocumentCarrier, "organizing/knowledge-vault/corpus/document"],
    [listEntryCarrier, "organizing/knowledge-vault/corpus/list-entry"],
    [listingCarrier, "organizing/knowledge-vault/corpus/listing"],
    [knowledgeVaultRootCarrier, "organizing/knowledge-vault/corpus/root"],
    [knowledgeVaultRigCarrier, "organizing/knowledge-vault/corpus/rig"],
    [knowledgeVaultRiggingCarrier, "organizing/knowledge-vault/corpus/rigging"],
    [catalogDocumentCarrier, "organizing/knowledge-vault/corpus/catalog-document"],
    [catalogGroupCarrier, "organizing/knowledge-vault/corpus/catalog-group"],
    [catalogCarrier, "organizing/knowledge-vault/corpus/catalog"],
    [catalogFacetCarrier, "organizing/knowledge-vault/corpus/catalog-facet"],
    [documentTypeLocationCarrier, "organizing/knowledge-vault/corpus/document-type-location"],
    [documentTypeClaimCarrier, "organizing/knowledge-vault/corpus/document-type-claim"],
    [documentTypeProjectionCarrier, "organizing/knowledge-vault/corpus/document-type-projection"],
    [documentTypeRealizationCarrier, "organizing/knowledge-vault/corpus/document-type-realization"],
    [documentTypeAuditCarrier, "organizing/knowledge-vault/corpus/document-type-audit"],
    [addressedNameMatchCarrier, "organizing/knowledge-vault/addressing/name-match"],
    [addressedNameSearchCarrier, "organizing/knowledge-vault/addressing/name-search"],
    [addressedTextHitCarrier, "organizing/knowledge-vault/addressing/text-hit"],
    [addressedTextSearchCarrier, "organizing/knowledge-vault/addressing/text-search"],
    [preparedDocumentCarrier, "organizing/knowledge-vault/mutating/prepared-document"],
    [documentPreparationCarrier, "organizing/knowledge-vault/mutating/document-preparation"],
    [documentFrontmatterMutationCarrier, "organizing/knowledge-vault/mutating/document-frontmatter-mutation"],
    [documentBodyMutationCarrier, "organizing/knowledge-vault/mutating/document-body-mutation"],
    [triageUploadCarrier, "organizing/knowledge-vault/mutating/triage-upload"],
    [triageBatchUploadCarrier, "organizing/knowledge-vault/mutating/triage-batch-upload"],
    [relationalHullStage0BoundaryCarrier, "organizing/knowledge-vault/mutating/relational-hull-stage0-boundary"],
    [relationalHullStage0BoundaryFileCarrier, "organizing/knowledge-vault/mutating/relational-hull-stage0-boundary-file"],
    [normalizationPlanCarrier, "organizing/knowledge-vault/mutating/normalization-plan"],
    [topicGuidanceCarrier, "organizing/knowledge-vault/mutating/topic-guidance"],
    [topicInspectionCarrier, "organizing/knowledge-vault/mutating/topic-inspection"],
    [topicGapMeasurementCarrier, "organizing/knowledge-vault/mutating/topic-gap-measurement"],
    [topicConceptMapCarrier, "organizing/knowledge-vault/mutating/topic-concept-map"],
    [memoryHealthProjectionCarrier, "organizing/knowledge-vault/holography/memory-health"],
  ]) {
    assert.equal(carrier.id, id);
    assert.equal(carrier.schema.$id, id);
  }
});

test("holography projects memory and normalization carriers into dashboards", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const memory = admitCorpusMemory(root, "mark");
  const healthDashboard = memoryHealthDashboard({
    kind: "knowing.memory.health",
    documents: memory.documents.length,
    withFrontMatter: 1,
    withTitle: 1,
    conformance: { total: 2, errors: 0, warnings: 2, info: 0 },
  });
  assert.equal(healthDashboard.kind, "organizing.knowledge-vault.holography.memory-health-dashboard");
  assert.equal(healthDashboard.documents, memory.documents.length);
  assert.equal(healthDashboard.withoutFrontMatter, Math.max(0, memory.documents.length - 1));
  assert.deepEqual(healthDashboard.findingRules.map((entry) => entry.rule), ["errors", "warnings", "info"]);

  const plan = planMemoryNormalization(memory);
  const planDashboard = normalizationPlanDashboard(plan, 1);
  assert.equal(planDashboard.kind, "organizing.knowledge-vault.holography.normalization-plan-dashboard");
  assert.equal(planDashboard.documents, plan.documents);
  assert.equal(planDashboard.items, plan.items.length);
  assert.equal(planDashboard.repairs.length, Math.min(1, plan.items.length));
});

test("authored carriers validate emitted corpus values", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const node = resolveNode(root, "mark")?.node;
  assert.ok(corpusNodeCarrier.validate(node));

  const frontier = { kind: "organizing.knowledge-vault.corpus.frontier", topic: "mark", nodes: children(root, "mark") };
  assert.ok(frontierCarrier.validate(frontier));
  assert.ok(frontier.nodes.every((entry) => corpusNodeCarrier.validate(entry)));

  const document = readDocument(root, "mark/mark.md");
  assert.ok(corpusDocumentCarrier.validate(document));

  const listing = listEntries(root, "");
  assert.ok(listingCarrier.validate(listing));
  assert.ok(listing.entries.every((entry) => listEntryCarrier.validate(entry)));

  mkdirSync(path.join(root, "content"), { recursive: true });
  writeFileSync(path.join(root, "content", "sample.md"), "---\ntitle: Sample\nauthor: Emsenn\ntags:\n  - memory\n---\n\nSample body.\n", "utf8");
  const catalog = catalogCorpus(root, { path: "content", limit: 10 });
  assert.ok(catalogCarrier.validate(catalog));
  assert.ok(catalog.documents.every((entry) => catalogDocumentCarrier.validate(entry)));
  assert.ok(catalog.authors.every((entry) => catalogGroupCarrier.validate(entry)));

  const facet = facetCorpusCatalog(root, { path: "content", kind: "topic", name: "memory" });
  assert.ok(catalogFacetCarrier.validate(facet));

  const prepared = createDocument(root, { path: "content/new/new.md", title: "New", body: "Body" }, false);
  assert.ok(preparedDocumentCarrier.validate(prepared));

  const triage = prepareTriageUpload(root, { content: "Triage" }, { now: new Date("2026-06-23T00:00:00.000Z") });
  assert.ok(triageUploadCarrier.validate(triage));

  const triageBatch = prepareTriageBatchUpload(root, [{ content: "Triage" }], { now: new Date("2026-06-23T00:00:00.000Z") });
  assert.ok(triageBatchUploadCarrier.validate(triageBatch));

  const normalization = planMemoryNormalization({
    kind: "knowing.memory",
    root,
    documents: [],
    utterances: [],
  });
  assert.ok(normalizationPlanCarrier.validate(normalization));

  const topicGuidance = planTopicGuidance({
    kind: "knowing.memory",
    root,
    documents: [],
    utterances: [],
  }, "sample topic");
  assert.ok(topicGuidanceCarrier.validate(topicGuidance));

  const found = findAddressedName(root, { query: "token", limit: 10 });
  assert.ok(addressedNameSearchCarrier.validate(found));
  assert.ok(found.results.every((entry) => addressedNameMatchCarrier.validate(entry)));

  const grep = grepAddressedText(root, { query: "identity", path: "mark", limit: 10 });
  assert.ok(addressedTextSearchCarrier.validate(grep));
  assert.ok(grep.hits.every((entry) => addressedTextHitCarrier.validate(entry)));

  assert.throws(() => corpusNodeCarrier.assert({ ...node, role: "archive" }, "corpus node"), /corpus node:/);
});

test("corpus rigging mounts external inputs through the root path law", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const modeled = knowledgeVaultRoot(root);
  const rig = knowledgeVaultRig({ inputKind: "newscable", name: "daily", mount: "mark/news/", configPath: "newscable.json", wireCount: 2 });
  assert.equal(rig.mount, "mark/news");
  assert.ok(knowledgeVaultRigCarrier.validate(rig));

  const rigging = knowledgeVaultRigging({ root: modeled, rigs: [rig] });
  assert.equal(rigging.root, root);
  assert.equal(rigging.rigCount, 1);
  assert.equal(rigging.rigs[0]?.mount, "mark/news");
  assert.ok(knowledgeVaultRiggingCarrier.validate(rigging));

  assert.throws(() => knowledgeVaultRig({ inputKind: "newswire", name: "bad", mount: "../outside" }), /relative corpus path/);
  assert.throws(() => knowledgeVaultRigging({ root: modeled, rigs: [{ inputKind: "newswire", name: "bad", mount: "unknown/feed" }] }), /allowed corpus prefix/);
});

test("action metadata advertises corpus and organizing carriers", () => {
  const byVerb = new Map(actions.map((act) => [act.verb, act]));
  for (const verb of [
    "research",
    "know",
    "introduce",
    "study",
    "explain",
    "learn",
    "teach",
    "tutor",
    "settle-memory",
    "observe",
    "inspect-topic",
    "concept-map",
    "measure-gap",
    "inspect-health",
    "catalog",
    "catalog-facet",
    "normalization-plan",
    "topic-guidance",
    "organize-corpus",
  ]) {
    assert.ok(byVerb.get(verb)?.options?.includes("maxScan"), `${verb} advertises maxScan`);
  }
  assert.equal(byVerb.get("inspect-root")?.codomainSchema?.$ref, "organizing/knowledge-vault/corpus/root");
  assert.equal(byVerb.get("inspect-root")?.codomain, knowledgeVaultRootCarrier);
  assert.match(byVerb.get("inspect-root")?.description ?? "", /stable package prefixes/);
  assert.match(byVerb.get("inspect-root")?.description ?? "", /observed top-level prefixes/);
  assert.equal(byVerb.get("browse")?.codomainSchema?.$ref, "organizing/knowledge-vault/corpus/frontier");
  assert.equal(byVerb.get("browse")?.codomain, frontierCarrier);
  assert.equal(byVerb.get("locate")?.codomainSchema?.$ref, "organizing/knowledge-vault/corpus/node");
  assert.equal(byVerb.get("locate")?.codomain, corpusNodeCarrier);
  assert.equal(byVerb.get("read")?.codomainSchema?.$ref, "organizing/knowledge-vault/corpus/document");
  assert.equal(byVerb.get("read")?.codomain, corpusDocumentCarrier);
  assert.equal(byVerb.get("list")?.codomainSchema?.$ref, "organizing/knowledge-vault/corpus/listing");
  assert.equal(byVerb.get("normalization-plan")?.codomainSchema?.$ref, "organizing/knowledge-vault/mutating/normalization-plan");
  assert.equal(byVerb.get("normalization-plan")?.codomain, normalizationPlanCarrier);
  assert.equal(byVerb.get("inspect-topic")?.codomainSchema?.$ref, "organizing/knowledge-vault/mutating/topic-inspection");
  assert.equal(byVerb.get("inspect-topic")?.codomain, topicInspectionCarrier);
  assert.equal(byVerb.get("concept-map")?.codomainSchema?.$ref, "organizing/knowledge-vault/mutating/topic-concept-map");
  assert.equal(byVerb.get("concept-map")?.codomain, topicConceptMapCarrier);
  assert.equal(byVerb.get("measure-gap")?.codomainSchema?.$ref, "organizing/knowledge-vault/mutating/topic-gap-measurement");
  assert.equal(byVerb.get("measure-gap")?.codomain, topicGapMeasurementCarrier);
  assert.equal(byVerb.get("inspect-health")?.codomainSchema?.$ref, "organizing/knowledge-vault/holography/memory-health");
  assert.equal(byVerb.get("inspect-health")?.codomain, memoryHealthProjectionCarrier);
  assert.equal(byVerb.get("topic-guidance")?.codomainSchema?.$ref, "organizing/knowledge-vault/mutating/topic-guidance");
  assert.equal(byVerb.get("topic-guidance")?.codomain, topicGuidanceCarrier);
  assert.equal(byVerb.get("list")?.codomain, listingCarrier);
  assert.equal(byVerb.get("find-name")?.codomainSchema?.$ref, "organizing/knowledge-vault/addressing/name-search");
  assert.equal(byVerb.get("find-name")?.codomain, addressedNameSearchCarrier);
  assert.equal(byVerb.get("grep-text")?.codomainSchema?.$ref, "organizing/knowledge-vault/addressing/text-search");
  assert.equal(byVerb.get("grep-text")?.codomain, addressedTextSearchCarrier);
  assert.equal(byVerb.get("catalog")?.codomainSchema?.$ref, "organizing/knowledge-vault/corpus/catalog");
  assert.equal(byVerb.get("catalog")?.codomain, catalogCarrier);
  assert.match(byVerb.get("catalog")?.description ?? "", /empty = corpus root/);
  assert.equal(byVerb.get("catalog-facet")?.codomainSchema?.$ref, "organizing/knowledge-vault/corpus/catalog-facet");
  assert.equal(byVerb.get("catalog-facet")?.codomain, catalogFacetCarrier);
  assert.equal(byVerb.get("create-document")?.codomainSchema?.$ref, "organizing/knowledge-vault/mutating/prepared-document");
  assert.equal(byVerb.get("create-document")?.codomain, preparedDocumentCarrier);
  assert.equal(byVerb.get("update-frontmatter")?.codomainSchema?.$ref, "organizing/knowledge-vault/mutating/prepared-document");
  assert.equal(byVerb.get("update-frontmatter")?.codomain, preparedDocumentCarrier);
  assert.equal(byVerb.get("upload-triage-file")?.codomainSchema?.$ref, "organizing/knowledge-vault/mutating/triage-upload");
  assert.equal(byVerb.get("upload-triage-file")?.codomain, triageUploadCarrier);
  assert.equal(byVerb.get("claim-document-type")?.codomainSchema?.$ref, "organizing/knowledge-vault/corpus/document-type-claim");
  assert.equal(byVerb.get("claim-document-type")?.codomain, documentTypeClaimCarrier);
  assert.equal(byVerb.get("project-document-type")?.codomainSchema?.$ref, "organizing/knowledge-vault/corpus/document-type-projection");
  assert.equal(byVerb.get("project-document-type")?.codomain, documentTypeProjectionCarrier);
  assert.equal(byVerb.get("realize-document-type")?.codomainSchema?.$ref, "organizing/knowledge-vault/corpus/document-type-realization");
  assert.equal(byVerb.get("realize-document-type")?.codomain, documentTypeRealizationCarrier);
  assert.equal(byVerb.get("audit-document-type")?.codomainSchema?.$ref, "organizing/knowledge-vault/corpus/document-type-audit");
  assert.equal(byVerb.get("audit-document-type")?.codomain, documentTypeAuditCarrier);
  assert.equal(byVerb.get("organize-corpus")?.codomainSchema?.$ref, "organizing/organization");

  const induced = induceBins(actions, { packageName: "@emsenn/organizing-a-knowledge-vault" });
  assert.equal(induced.discovery.package, "@emsenn/organizing-a-knowledge-vault");
  assert.equal(induced.discovery.bins.length, actions.length);
  const openApi = actionOpenApi(induced);
  const mcpTools = actionMcpTools(induced.actions);
  for (const verb of [
    "inspect-root",
    "inspect-topic",
    "concept-map",
    "measure-gap",
    "inspect-health",
    "organize-corpus",
    "audit-document-type",
  ]) {
    assert.ok(openApi.paths[`/${verb}`], `${verb} projects to OpenAPI`);
    assert.ok(mcpTools.some((tool) => tool.name === verb), `${verb} projects to MCP`);
  }
  assert.ok(mcpTools.some((tool) => tool.name === "build-document-types"));
});

test("kernel relational hull stage-0 action factory binds a kernel root", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const stage0Actions = kernelRelationalHullStage0Actions({ root });
  const byVerb = new Map(stage0Actions.map((act) => [act.verb, act]));

  assert.equal(byVerb.get("kernel-hull-stage0-boundary")?.codomain, relationalHullStage0BoundaryCarrier);
  assert.equal(byVerb.get("add-kernel-hull-stage0-file")?.codomain, relationalHullStage0BoundaryFileCarrier);

  const added = byVerb.get("add-kernel-hull-stage0-file").run({
    content: "# Inbox\n\nCarrier.",
    filename: "inbox.md",
  }, { write: "true" });
  assert.equal(added.stage, 0);
  assert.equal(added.boundary, RELATIONAL_HULL_STAGE0_BOUNDARY_PATH);

  const boundary = byVerb.get("kernel-hull-stage0-boundary").run("", {});
  assert.equal(boundary.total, 1);
  assert.equal(boundary.files[0].path, added.path);
});

test("agent resources and prompts project through the induced MCP apex", () => {
  const induced = induceBins(legs, { packageName: "@emsenn/organizing-a-knowledge-vault" });
  assert.equal(induced.actions.length, actions.length);
  assert.equal(induced.resources.filter((resource) => resource.uri === KNOWLEDGE_VAULT_AGENT_ORIENTATION_URI).length, 1);
  assert.equal(induced.resources.filter((resource) => resource.uri === KNOWLEDGE_VAULT_AGENT_PATH_LAW_URI).length, 1);
  assert.equal(induced.resources.filter((resource) => resource.uri === KNOWLEDGE_VAULT_AGENT_PROFILE_URI).length, 1);
  assert.equal(induced.resources.filter((resource) => resource.uri === KNOWLEDGE_VAULT_AGENT_WORKFLOW_URI).length, 1);
  assert.ok(actionMcpResources(induced).some((resource) => resource.uri === KNOWLEDGE_VAULT_AGENT_ORIENTATION_URI));
  assert.ok(actionMcpResources(induced).some((resource) => resource.uri === KNOWLEDGE_VAULT_AGENT_PROFILE_URI));
  assert.ok(actionMcpPrompts(induced).some((prompt) => prompt.name === KNOWLEDGE_VAULT_AGENT_WORKFLOW_PROMPT));

  const orientation = induced.resources.find((resource) => resource.uri === KNOWLEDGE_VAULT_AGENT_ORIENTATION_URI);
  assert.match(orientation?.read() ?? "", /corpus is the persistent memorystore/);
  const profile = JSON.parse(induced.resources.find((resource) => resource.uri === KNOWLEDGE_VAULT_AGENT_PROFILE_URI)?.read() ?? "null");
  assert.equal(profile.kind, "organizing.knowledge-vault.agent.profile");
  assert.equal(profile.carrier, knowledgeVaultAgentProfileCarrier.id);
  assert.equal(profile.corpusRole, "persistent-memorystore");
  assert.equal(profile.schemaResources.profile, KNOWLEDGE_VAULT_AGENT_PROFILE_SCHEMA_URI);
  assert.equal(profile.schemaResources.workflow, KNOWLEDGE_VAULT_AGENT_WORKFLOW_SCHEMA_URI);
  assert.ok(profile.pathLaw.rootAffordances.some((entry) => entry.path === "content"));
  assert.equal(profile.contentRoots.observedRootsAreAdmitted, true);
  assert.equal(profile.contentRoots.discoveryAction, "inspect-root");
  assert.ok(profile.placement.operationKinds.includes("specification"));
  assert.ok(knowledgeVaultAgentProfileCarrier.validate(profile));
  const workflow = JSON.parse(induced.resources.find((resource) => resource.uri === KNOWLEDGE_VAULT_AGENT_WORKFLOW_URI)?.read() ?? "null");
  assert.equal(workflow.kind, "organizing.knowledge-vault.agent.workflow");
  assert.equal(workflow.carrier, knowledgeVaultAgentWorkflowCarrier.id);
  assert.deepEqual(workflow.steps.map((step) => step.name), ["mount", "address", "understand", "prepare", "commit"]);
  assert.ok(knowledgeVaultAgentWorkflowCarrier.validate(workflow));
  const rendered = induced.prompts.find((prompt) => prompt.name === KNOWLEDGE_VAULT_AGENT_WORKFLOW_PROMPT)?.compose({
    task: "audit a topic before editing",
    path: "mark",
  });
  assert.match(rendered?.[0]?.content.text ?? "", /Start from corpus path or topic: mark/);
  assert.match(rendered?.[0]?.content.text ?? "", /dry-run mutating actions/);
});

test("agent resources and prompts are readable through the MCP handler", () => {
  const induced = induceBins(legs, { packageName: "@emsenn/organizing-a-knowledge-vault" });
  const listed = actionMcpHandle(induced, { jsonrpc: "2.0", id: 1, method: "resources/list" }, {});
  assert.ok(Array.isArray(listed?.result?.resources));
  assert.ok(listed.result.resources.some((resource) => resource.uri === KNOWLEDGE_VAULT_AGENT_PROFILE_URI));

  const profileRead = actionMcpHandle(induced, {
    jsonrpc: "2.0",
    id: 2,
    method: "resources/read",
    params: { uri: KNOWLEDGE_VAULT_AGENT_PROFILE_URI },
  }, {});
  const profileText = profileRead?.result?.contents?.[0]?.text;
  assert.equal(profileRead?.result?.contents?.[0]?.mimeType, "application/json");
  const profile = JSON.parse(typeof profileText === "string" ? profileText : "null");
  assert.ok(knowledgeVaultAgentProfileCarrier.validate(profile));
  assert.equal(profile.carrier, knowledgeVaultAgentProfileCarrier.id);
  assert.equal(profile.schemaResources.profile, KNOWLEDGE_VAULT_AGENT_PROFILE_SCHEMA_URI);
  assert.equal(profile.package, "@emsenn/organizing-a-knowledge-vault");

  const profileSchemaRead = actionMcpHandle(induced, {
    jsonrpc: "2.0",
    id: 5,
    method: "resources/read",
    params: { uri: profile.schemaResources.profile },
  }, {});
  const profileSchema = JSON.parse(typeof profileSchemaRead?.result?.contents?.[0]?.text === "string" ? profileSchemaRead.result.contents[0].text : "null");
  assert.equal(profileSchema.$id, knowledgeVaultAgentProfileCarrier.id);
  assert.equal(profileSchema.properties.carrier.const, knowledgeVaultAgentProfileCarrier.id);

  const workflowSchemaRead = actionMcpHandle(induced, {
    jsonrpc: "2.0",
    id: 6,
    method: "resources/read",
    params: { uri: profile.schemaResources.workflow },
  }, {});
  const workflowSchema = JSON.parse(typeof workflowSchemaRead?.result?.contents?.[0]?.text === "string" ? workflowSchemaRead.result.contents[0].text : "null");
  assert.equal(workflowSchema.$id, knowledgeVaultAgentWorkflowCarrier.id);
  assert.equal(workflowSchema.properties.carrier.const, knowledgeVaultAgentWorkflowCarrier.id);

  const promptGet = actionMcpHandle(induced, {
    jsonrpc: "2.0",
    id: 3,
    method: "prompts/get",
    params: {
      name: KNOWLEDGE_VAULT_AGENT_WORKFLOW_PROMPT,
      arguments: { task: "prepare a document safely", path: "mark" },
    },
  }, {});
  const messageText = promptGet?.result?.messages?.[0]?.content?.text;
  assert.match(typeof messageText === "string" ? messageText : "", /prepare a document safely/);
  assert.match(typeof messageText === "string" ? messageText : "", /Start from corpus path or topic: mark/);

  const missing = actionMcpHandle(induced, {
    jsonrpc: "2.0",
    id: 4,
    method: "resources/read",
    params: { uri: "organizing-a-knowledge-vault://agents/missing.json" },
  }, {});
  assert.equal(missing?.error?.code, -32602);
});

test("agent profile and workflow reference existing dispatcher verbs", () => {
  const verbs = new Set(actions.map((act) => act.verb));
  const commandVerb = (value) => value.trim().split(/\s+/)[0];
  const referenced = [
    ...knowledgeVaultAgentProfile.recommendedActions,
    ...knowledgeVaultAgentWorkflow.steps.flatMap((step) => step.actions.map(commandVerb)),
  ];
  for (const verb of referenced) {
    assert.ok(verbs.has(verb), `agent surface references existing verb: ${verb}`);
  }
  assert.ok(knowledgeVaultAgentProfile.recommendedActions.includes("inspect-root"));
  assert.ok(knowledgeVaultAgentWorkflow.steps.some((step) => step.actions.includes("create-document --write true")));
});

test("actions subpath exposes the dispatcher surface", async () => {
  const mod = await import("@emsenn/organizing-a-knowledge-vault/actions");
  assert.equal(mod.actions.length, actions.length);
  assert.equal(mod.resources.length, resources.length);
  assert.equal(mod.prompts.length, prompts.length);
  assert.equal(mod.legs.length, actions.length + resources.length + prompts.length);
  assert.equal(mod.actions.find((act) => act.verb === "topic-guidance")?.codomain, topicGuidanceCarrier);
  assert.equal(mod.actions.find((act) => act.verb === "concept-map")?.codomain, topicConceptMapCarrier);
});

test("agents subpath exposes coding-agent repository affordances", async () => {
  const mod = await import("@emsenn/organizing-a-knowledge-vault/agents");
  assert.equal(mod.agentResources.length, resources.length);
  assert.equal(mod.agentPrompts.length, prompts.length);
  assert.equal(mod.knowledgeVaultAgentOrientationResource.uri, KNOWLEDGE_VAULT_AGENT_ORIENTATION_URI);
  assert.equal(mod.knowledgeVaultAgentPathLawResource.uri, KNOWLEDGE_VAULT_AGENT_PATH_LAW_URI);
  assert.equal(mod.knowledgeVaultAgentProfileResource.uri, KNOWLEDGE_VAULT_AGENT_PROFILE_URI);
  assert.equal(mod.knowledgeVaultAgentWorkflowResource.uri, KNOWLEDGE_VAULT_AGENT_WORKFLOW_URI);
  assert.equal(mod.knowledgeVaultAgentProfileCarrier, knowledgeVaultAgentProfileCarrier);
  assert.equal(mod.knowledgeVaultAgentWorkflowCarrier, knowledgeVaultAgentWorkflowCarrier);
  assert.equal(mod.knowledgeVaultAgentProfile, knowledgeVaultAgentProfile);
  assert.equal(mod.knowledgeVaultAgentWorkflow, knowledgeVaultAgentWorkflow);
  assert.equal(mod.knowledgeVaultAgentOrientationPrompt.name, KNOWLEDGE_VAULT_AGENT_WORKFLOW_PROMPT);
});

test("corpus subpath exposes root law and corpus carriers", async () => {
  const mod = await import("@emsenn/organizing-a-knowledge-vault/corpus");
  assert.equal(mod.knowledgeVaultRootCarrier, knowledgeVaultRootCarrier);
  assert.equal(mod.corpusDocumentCarrier, corpusDocumentCarrier);
  assert.equal(mod.knowledgeVaultRiggingCarrier, knowledgeVaultRiggingCarrier);
  assert.equal(mod.KNOWLEDGE_VAULT_ALLOWED_PREFIXES.includes("content"), true);
  assert.equal(mod.KNOWLEDGE_VAULT_SUPPORT_PREFIXES.includes("dev"), true);
  assert.equal(typeof mod.resolveKnowledgeVaultRoot, "function");
  assert.equal(typeof mod.knowledgeVaultRoot, "function");
  assert.equal(typeof mod.knowledgeVaultRigging, "function");
  assert.equal(typeof mod.confineKnowledgeVaultPath, "function");
  assert.equal("confine" in mod, false);
});

test("mutating subpath exposes dry-run document and corpus projection carriers", async () => {
  const mod = await import("@emsenn/organizing-a-knowledge-vault/mutating");
  assert.equal(mod.preparedDocumentCarrier, preparedDocumentCarrier);
  assert.equal(mod.normalizationPlanCarrier, normalizationPlanCarrier);
  assert.equal(mod.topicConceptMapCarrier, topicConceptMapCarrier);
  assert.equal(typeof mod.prepareCorpusDocument, "function");
  assert.equal(typeof mod.prepareTriageUpload, "function");
  assert.equal(typeof mod.planTopicConceptMap, "function");
});

test("holography subpath exposes corpus projections", async () => {
  const mod = await import("@emsenn/organizing-a-knowledge-vault/holography");
  assert.equal(mod.memoryHealthProjectionCarrier, memoryHealthProjectionCarrier);
  assert.equal(typeof mod.memoryHealthDashboard, "function");
  assert.equal(typeof mod.memoryHealthProjection, "function");
  assert.equal(typeof mod.normalizationPlanDashboard, "function");
});
