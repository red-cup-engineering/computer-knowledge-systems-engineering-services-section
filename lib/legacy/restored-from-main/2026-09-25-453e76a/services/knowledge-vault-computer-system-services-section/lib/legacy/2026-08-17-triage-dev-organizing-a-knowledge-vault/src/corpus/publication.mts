/**
 * corpus/publication  -  public-site resources induced from a corpus.
 *
 * This does not choose a renderer. It admits markdown resources into a stable
 * publication projection so downstream sites can render HTML, feeds, maps, or
 * GitHub Pages directories without re-learning the vault.
 */
import { statSync } from "node:fs";
import { confine } from "@emsenn/relating/ledger";
import { corpusReadBounds } from "./bounds.mjs";
import { gatherResources, readDocument } from "./documents.mjs";
import type { PublishedCorpusDocument } from "./carriers.mjs";

const DEFAULT_LIMIT = 1_000;

export interface PublishedCorpusDocumentsOptions {
  readonly path?: string;
  readonly limit?: number | string;
  readonly maxScan?: number | string;
}

export function publishedCorpusDocuments(root: string, options: PublishedCorpusDocumentsOptions = {}): readonly PublishedCorpusDocument[] {
  const requested = cleanPath(String(options.path ?? ""));
  const { limit, maxScan } = corpusReadBounds(options.limit ?? DEFAULT_LIMIT, options.maxScan);
  const documents: PublishedCorpusDocument[] = [];
  for (const resource of gatherResources(root, requested, maxScan, maxScan)) {
    const document = publishedCorpusDocument(root, resource.path);
    if (document !== null) documents.push(document);
    if (documents.length >= limit) break;
  }
  return Object.freeze(documents.sort((left, right) => left.path.localeCompare(right.path)));
}

export function publishedCorpusDocument(root: string, relative: string): PublishedCorpusDocument | null {
  try {
    const document = readDocument(root, relative);
    const modifiedAt = statSync(confine(root, relative)).mtime.toISOString();
    const publicationKind = inferPublicationKind(relative, document.frontmatter);
    const tags = normalizeTags([...document.tags, publicationKind]);
    return Object.freeze({
      kind: "organizing.knowledge-vault.corpus.published-document" as const,
      path: document.path,
      slug: slugifyPublicationPath(document.path),
      title: document.title,
      description: document.description,
      publicationKind,
      authors: document.authors,
      tags,
      topic: document.topic,
      modifiedAt,
      bytes: document.bytes,
      frontmatter: document.frontmatter,
      body: document.body,
    });
  } catch {
    return null;
  }
}

export function inferPublicationKind(relative: string, frontmatter: Readonly<Record<string, unknown>>): string {
  const explicit = stringField(frontmatter["type"])
    || stringField(frontmatter["kind"])
    || stringField(frontmatter["genre"]);
  if (explicit !== "") return slugifyPublicationKind(explicit);
  const path = cleanPath(relative);
  if (path.startsWith("letters/")) return "letter";
  if (path.startsWith("papers/") || path.startsWith("writing/")) return "paper";
  if (path.startsWith("blog/")) return "babble";
  return "note";
}

export function slugifyPublicationPath(relative: string): string {
  const withoutExtension = cleanPath(relative).replace(/\.md$/i, "");
  return slugifyPublicationKind(withoutExtension.replace(/\//g, "-"));
}

function slugifyPublicationKind(value: string): string {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).join("-") || "note";
}

function normalizeTags(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map(slugifyPublicationKind).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)));
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanPath(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\\/g, "/");
}
