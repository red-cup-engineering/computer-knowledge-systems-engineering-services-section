/**
 * corpus/organizing  -  organize the persistent memorystore as a social boundary.
 *
 * The corpus is not itself @emsenn/knowing; it is the persistent store this package
 * admits. This reading specializes @emsenn/organizing to that store: bounded corpus
 * resources become three Gen-2 boundary faces, then organizing glues them into one
 * organization carrier.
 */
import { organize, type Organization, type SocialBoundary } from "@emsenn/organizing";
import { gatherResources, readDocument } from "./documents.mjs";
import { corpusReadBounds } from "./bounds.mjs";

export interface OrganizeCorpusOptions {
  readonly identity?: string;
  readonly limit?: number | string;
  readonly maxScan?: number | string;
}

function label(value: string): string {
  return value.replace(/[|\r\n]+/g, "-").trim() || "resource";
}

function tagsOf(frontmatter: Readonly<Record<string, unknown>>): readonly string[] {
  const raw = frontmatter["tags"];
  if (Array.isArray(raw)) return raw.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "").map((tag) => tag.trim());
  if (typeof raw === "string" && raw.trim() !== "") return raw.split(",").map((tag) => tag.trim()).filter(Boolean);
  return Object.freeze([]);
}

function line(subject: string, predicate: string): string {
  return `${label(subject)}|${label(predicate)}`;
}

export function corpusBoundary(root: string, region = "", options: OrganizeCorpusOptions = {}): SocialBoundary {
  const { limit, maxScan } = corpusReadBounds(options.limit, options.maxScan);
  const resources = gatherResources(root, region, limit, maxScan);
  if (resources.length === 0) throw new TypeError("organize-corpus: no corpus resources to organize");

  const socializing: string[] = [];
  const computing: string[] = [];
  const gaming: string[] = [];

  for (const resource of resources) {
    const document = readDocument(root, resource.path);
    socializing.push(line(resource.path, "present-in-corpus"));
    computing.push(line(resource.path, document.conformant ? "markdown-conformant" : "markdown-nonconformant"));
    const tags = tagsOf(document.frontmatter);
    if (tags.length === 0) gaming.push(line(resource.path, "untagged"));
    else for (const tag of tags) gaming.push(line(resource.path, `tag:${tag}`));
  }

  return Object.freeze({
    socializing: socializing.join("\n"),
    computing: computing.join("\n"),
    gaming: gaming.join("\n"),
  });
}

export function organizeCorpus(root: string, region = "", options: OrganizeCorpusOptions = {}): Organization {
  return organize(corpusBoundary(root, region, options), { identity: options.identity ?? "knowledge-vault-corpus" });
}

export type { Organization, SocialBoundary };
