/**
 * corpus/store  -  the persistent memorystore as a directed category, navigated through relating's reader.
 *
 * The corpus on disk is a directed category by its own law (content/CLAUDE.md): each path is
 * read left to right as a proof, and every parent directory GENERATES its child. The tree is
 * the directed knowledge relation; reading it is this package's admission boundary. The corpus
 * alternates two directory kinds: a **morphism** is a gerund directory reached as a direct
 * child; an **object** is a codomain reached under a `content/` joint. A node's canonical
 * document is `slug/slug.md`. Resolution is tolerant  -  a topic is the meaningful proof path
 * of slugs and the resolver fills the `content/` joints.
 *
 * This is the navigation logic for the persistent memorystore; the fs and decoding are relating's  -  directory
 * listing via `listContentEntries`, document reading via `readContentResource`, frontmatter
 * and body via the markdown codec. knowing re-enacts no I/O. Reads stay SCOPED: a node's
 * ancestry (walk up) and its generated frontier (one listing), never a full corpus walk.
 */
import { listContentEntries, readContentResource } from "@emsenn/relating/ledger";
import { markdown } from "@emsenn/relating/writing";
import type { CorpusNode } from "./carriers.mjs";
import { KNOWLEDGE_VAULT_SUPPORT_PREFIXES } from "./root.mjs";

/** A frontmatter scalar coerced to a trimmed string, or null when not a scalar. */
function scalarString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** The two structural roles a corpus directory plays, plus the joint. */
export type NodeRole = "morphism" | "object" | "joint";

export type { CorpusNode };

/** A resolved node: its carrier plus the corpus-relative path it lives at. */
export interface ResolvedNode {
  readonly node: CorpusNode;
  readonly path: string;
}

const SUPPORT_DIRECTORIES = new Set([
  ...KNOWLEDGE_VAULT_SUPPORT_PREFIXES,
  "node_modules",
  ".git",
  "explanations",
  "guides",
  "tutorials",
  "references",
]);

/** Classify a directory's structural role from its slug. */
function roleOf(slug: string): NodeRole {
  if (slug === "content") return "joint";
  return /ing$/.test(slug) ? "morphism" : "object";
}

/** Join a corpus-relative base with a child segment. */
const joinRel = (base: string, child: string): string => (base === "" ? child : `${base}/${child}`);
/** The final segment of a corpus-relative path. */
const basenameRel = (rel: string): string => { const parts = rel.split("/").filter(Boolean); return parts[parts.length - 1] ?? ""; };

/** The immediate entries of a corpus-relative directory (empty if absent or not a directory). */
function entriesOf(root: string, rel: string): readonly { readonly name: string; readonly kind: string }[] {
  try {
    return listContentEntries(root, rel);
  } catch {
    return [];
  }
}

/** Whether `child` is a directory entry of the corpus-relative dir `rel`. */
const hasChildDir = (root: string, rel: string, child: string): boolean =>
  entriesOf(root, rel).some((entry) => entry.name === child && entry.kind === "directory");

/** Whether `name` is a real corpus node directory (not a joint or support affordance). */
function isNodeDir(name: string): boolean {
  return !(name.startsWith(".") || SUPPORT_DIRECTORIES.has(name) || name === "content");
}

/** Read a corpus-relative `.md` resource's text, or null if absent. */
function readText(root: string, rel: string): string | null {
  try {
    return readContentResource(root, rel).content;
  } catch {
    return null;
  }
}

/** Split a topic into its meaningful slug steps (joints and separators forgiven). */
function topicSteps(topic: string): readonly string[] {
  return topic.split(/[/\\]+/).map((step) => step.trim()).filter((step) => step !== "" && step !== "content" && step !== ".");
}

/**
 * Read the frontmatter facts of a node's `slug/slug.md` through relating's markdown codec.
 * the corpus's representation boundary, not a hand-rolled regex.
 */
function readFrontmatter(root: string, rel: string, slug: string): Pick<CorpusNode, "title" | "description" | "tags"> {
  const text = readText(root, joinRel(rel, `${slug}.md`));
  if (text === null) return {};
  const frontmatter = markdown.parseMarkdown(text).frontmatter;
  if (frontmatter === null) return {};
  const facts: { title?: string; description?: string; tags?: readonly string[] } = {};
  const title = scalarString(frontmatter["title"]);
  const description = scalarString(frontmatter["description"]);
  if (title !== null) facts.title = title;
  if (description !== null) facts.description = description;
  const rawTags = frontmatter["tags"];
  if (Array.isArray(rawTags)) {
    const tags = rawTags.map(scalarString).filter((tag): tag is string => tag !== null);
    if (tags.length > 0) facts.tags = Object.freeze(tags);
  } else {
    const single = scalarString(rawTags);
    if (single !== null) facts.tags = Object.freeze([single]);
  }
  return facts;
}

/** Build a node carrier for a resolved directory at a known proof address + fs path. */
function nodeAt(root: string, rel: string, address: string): CorpusNode {
  const slug = address.split("/").pop() ?? basenameRel(rel);
  const hasDocument = entriesOf(root, rel).some((entry) => entry.name === `${slug}.md`);
  return Object.freeze({
    kind: "organizing.knowledge-vault.corpus.node" as const,
    address,
    slug,
    role: roleOf(slug),
    hasDocument,
    ...readFrontmatter(root, rel, slug),
  });
}

/** The corpus root as a synthetic object node (the base of every proof). */
function rootNode(root: string): CorpusNode {
  return Object.freeze({ kind: "organizing.knowledge-vault.corpus.node" as const, address: "", slug: basenameRel(root) || ".", role: "object" as const, hasDocument: false });
}

/** Walk a topic step-by-step, returning the resolved fs path + proof address, or null. */
function walk(root: string, steps: readonly string[]): { rel: string; address: string[] } | null {
  let rel = "";
  const address: string[] = [];
  for (const step of steps) {
    if (hasChildDir(root, rel, step)) rel = joinRel(rel, step);
    else if (hasChildDir(root, joinRel(rel, "content"), step)) rel = joinRel(rel, joinRel("content", step));
    else return null;
    address.push(step);
  }
  return { rel, address };
}

/** Resolve a topic to its node (root for the empty topic), or null if it does not resolve. */
export function resolveNode(root: string, topic: string): ResolvedNode | null {
  const steps = topicSteps(topic);
  if (steps.length === 0) return { node: rootNode(root), path: "" };
  const walked = walk(root, steps);
  if (walked === null) return null;
  return { node: nodeAt(root, walked.rel, walked.address.join("/")), path: walked.rel };
}

/** The generator chain of a node: the proof path read base - topic, each generated by its predecessor. */
export function ancestry(root: string, topic: string): readonly CorpusNode[] {
  const steps = topicSteps(topic);
  let rel = "";
  const address: string[] = [];
  const chain: CorpusNode[] = [];
  for (const step of steps) {
    if (hasChildDir(root, rel, step)) rel = joinRel(rel, step);
    else if (hasChildDir(root, joinRel(rel, "content"), step)) rel = joinRel(rel, joinRel("content", step));
    else break;
    address.push(step);
    chain.push(nodeAt(root, rel, address.join("/")));
  }
  return Object.freeze(chain);
}

/** The immediate generated frontier of a node: its direct morphism children and the objects under its `content/` joint. */
export function children(root: string, topic: string): readonly CorpusNode[] {
  const resolved = resolveNode(root, topic);
  if (resolved === null) return Object.freeze([]);
  const base = resolved.node.address === "" ? "" : `${resolved.node.address}/`;
  const out: CorpusNode[] = [];
  const push = (parentRel: string, name: string): void => {
    if (!isNodeDir(name)) return;
    out.push(nodeAt(root, joinRel(parentRel, name), `${base}${name}`));
  };
  for (const entry of entriesOf(root, resolved.path)) if (entry.kind === "directory") push(resolved.path, entry.name);
  const joint = joinRel(resolved.path, "content");
  for (const entry of entriesOf(root, joint)) if (entry.kind === "directory") push(joint, entry.name);
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return Object.freeze(out);
}

/** The immediate generator of a node: the node one proof step before it, or null at the base. */
export function generator(root: string, topic: string): CorpusNode | null {
  const chain = ancestry(root, topic);
  return chain.length >= 2 ? chain[chain.length - 2]! : null;
}

/**
 * The cross-reference directed relations of a node: the corpus nodes its document links to.
 * the markdown links by which one knowledge node points at another (the research edges beyond
 * the generator tree). Each resolvable link is admitted as the node it addresses.
 */
export function references(root: string, topic: string): readonly CorpusNode[] {
  const resolved = resolveNode(root, topic);
  if (resolved === null) return Object.freeze([]);
  const text = readText(root, joinRel(resolved.path, `${resolved.node.slug}.md`));
  if (text === null) return Object.freeze([]);
  const seen = new Set<string>([resolved.node.address]);
  const out: CorpusNode[] = [];
  const here = resolved.path.split("/").filter(Boolean);
  for (const match of text.matchAll(/\]\(([^)]+\.md)\)/g)) {
    const target = match[1]!;
    if (/^[a-z]+:\/\//i.test(target)) continue; // external URL
    // Resolve the link relative to the document's directory, lexically (no fs escape).
    const segments = [...here];
    for (const part of target.split("#")[0]!.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") segments.pop();
      else segments.push(part);
    }
    if (segments[0] === "..") continue; // outside the corpus
    segments.pop(); // drop the .md file, keep its directory
    const address = segments.filter((segment) => segment !== "content" && segment !== "_archive").join("/");
    const rel = segments.join("/");
    if (address === "" || seen.has(address)) continue;
    if (readText(root, joinRel(rel, `${basenameRel(rel)}.md`)) === null && entriesOf(root, rel).length === 0) continue;
    seen.add(address);
    out.push(nodeAt(root, rel, address));
  }
  return Object.freeze(out);
}

/** Read the canonical document body (sans frontmatter) of a node, if present  -  the body projected by relating's markdown codec. */
export function document(root: string, topic: string): string | null {
  const resolved = resolveNode(root, topic);
  if (resolved === null) return null;
  const text = readText(root, joinRel(resolved.path, `${resolved.node.slug}.md`));
  return text === null ? null : markdown.parseMarkdown(text).body;
}

/** Raised when a topic does not resolve to a corpus node; the boundary reports it as 4xx. */
export class UnknownTopic extends Error {
  constructor(topic: string) {
    super(`no such topic in the corpus: ${JSON.stringify(topic)}`);
    this.name = "UnknownTopic";
  }
}

/** Resolve a topic to its node, or throw UnknownTopic. The shared admission every verb runs. */
export function requireNode(root: string, topic: string): CorpusNode {
  const resolved = resolveNode(root, topic);
  if (resolved === null) throw new UnknownTopic(topic);
  return resolved.node;
}

/** The claim a node asserts  -  the codomain content a research act settles: its frontmatter
 *  description, else its document's first prose line, else its slug. */
export function claim(root: string, topic: string): string {
  const node = requireNode(root, topic);
  if (node.description) return node.description;
  const body = document(root, topic);
  if (body) {
    const line = body.split("\n").map((line) => line.trim()).find((line) => line !== "" && !line.startsWith("#"));
    if (line) return line;
  }
  return node.slug;
}
