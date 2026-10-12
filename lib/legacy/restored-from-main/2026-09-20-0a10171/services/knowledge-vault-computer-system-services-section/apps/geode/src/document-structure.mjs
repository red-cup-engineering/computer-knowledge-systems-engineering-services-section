/**
 * Document-scale structure: outline, tags, and unlinked mentions.
 *
 * These three meet what tools in Geode's class already offer — a navigable heading outline, a
 * vault-wide tag index, and unlinked mentions of a document's name — and beat the third, which
 * is where re-deriving edges instead of pattern-matching them (`CAIRN document catalogue`) gives this
 * repository a real advantage. Everywhere else, "unlinked mentions" is an undifferentiated
 * substring scan. Here, every candidate mention is classified: genuinely unlinked prose, a
 * mention this same document already links elsewhere, a mention sitting in a code block or
 * inline code (almost never a good link target), or a mention inside a heading. The evidence
 * line travels with each one so the classification can be checked, not just trusted.
 *
 * Every function here is pure: given the same Markdown text (and, for `unlinkedMentionsOf`, the
 * same effector responses) they return the same answer. Nothing here reads a file, runs a
 * search, or touches the corpus directly — `workspace.mjs` supplies those as
 * injected `search` and `readDocument` functions, the same discipline `CAIRN document catalogue`
 * already uses for backlinks.
 */

import { readMarkdownSource, projectMarkdownStructure } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-structure";
import { projectMarkdownFeatures } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-features";

const REGEX_METACHARACTERS = /[\\^$.*+?()[\]{}|]/gu;

function escapeRegex(value) {
  return value.replace(REGEX_METACHARACTERS, (character) => `\\${character}`);
}

function slugify(text) {
  const slug = text
    .toLowerCase()
    .trim()
    // Strip punctuation and Markdown emphasis/link syntax rather than the letters and numbers
    // they wrap, so "`Code` *Heading*" slugs to "code-heading", not the syntax characters.
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/gu, "-");
  return slug === "" ? "section" : slug;
}

/** GitHub's convention: the first heading with a given slug keeps it bare; later ones get -1, -2, … */
function anchorFor(slug, seen) {
  const count = seen.get(slug) ?? 0;
  seen.set(slug, count + 1);
  return count === 0 ? slug : `${slug}-${count}`;
}

function buildTree(flatHeadings) {
  const root = [];
  const stack = [];
  for (const heading of flatHeadings) {
    const node = { level: heading.level, text: heading.text, line: heading.line, anchor: heading.anchor, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length === 0) root.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root;
}

function freezeTree(nodes) {
  for (const node of nodes) {
    freezeTree(node.children);
    node.children = Object.freeze(node.children);
    Object.freeze(node);
  }
  return Object.freeze(nodes);
}

/**
 * The heading tree of one document: levels, text, 1-based line numbers, and stable slug anchors.
 *
 * Setext headings (`Title` underlined with `===`/`---`) are recognized alongside ATX (`#`)
 * headings; headings that appear inside a fenced code block are not headings at all. Two
 * headings with the same text get distinct anchors so neither's anchor link silently points at
 * the other.
 */
export function outlineOf(markdown) {
  if (typeof markdown !== "string") throw new TypeError("markdown must be a string");
  const { headings } = projectMarkdownStructure(readMarkdownSource(markdown));
  const seen = new Map();
  const flat = Object.freeze(headings.map((heading) => Object.freeze({
    level: heading.level,
    text: heading.title,
    line: heading.line,
    anchor: anchorFor(slugify(heading.title), seen),
  })));
  return Object.freeze({
    type: "GeodeDocumentOutline",
    schemaVersion: "geode-document-outline/v1",
    headings: flat,
    tree: freezeTree(buildTree(flat)),
  });
}

function withinAny(start, length, spans) {
  return spans.some((span) => start >= span.start && start + length <= span.end);
}

function tagStrings(value) {
  if (typeof value === "string") return value.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
  if (Array.isArray(value)) return value.flatMap(tagStrings);
  return [];
}

function normalizeTag(raw) {
  const stripped = raw.replace(/^#/u, "").trim();
  return stripped === "" ? null : stripped;
}

function frontmatterTagValues(frontmatter) {
  if (frontmatter === null || typeof frontmatter !== "object") return [];
  return [...tagStrings(frontmatter.tags), ...tagStrings(frontmatter.tag)];
}

/**
 * Tags this document carries, from frontmatter (`tags:`/`tag:`) and inline `#tag` text alike.
 *
 * Identity folds case-insensitively — `#Alpha` and `#alpha` are the same tag, keeping the first
 * spelling seen as the display name — while `sources` and `lines` keep the evidence for each.
 * A `#` does not start a tag inside a fenced code block, inside inline code, in a URL fragment
 * (nothing about a `#` glued to the end of a word looks like a tag start), or anywhere on a
 * heading line, matching how the outline itself reads headings.
 */
export function tagsOf(markdown, frontmatter = {}) {
  if (typeof markdown !== "string") throw new TypeError("markdown must be a string");
  const source = readMarkdownSource(markdown);
  const { headings } = projectMarkdownStructure(source);
  const byKey = new Map();

  function record(name, source, line) {
    const key = name.toLowerCase();
    let entry = byKey.get(key);
    if (!entry) {
      entry = { name, sources: new Set(), lines: [] };
      byKey.set(key, entry);
    }
    entry.sources.add(source);
    if (line !== null) entry.lines.push(line);
  }

  for (const raw of frontmatterTagValues(frontmatter)) {
    const name = normalizeTag(raw);
    if (name) record(name, "frontmatter", null);
  }

  let lineIndex = source.bodyStartLine - 1, lineOffset = source.bodyStartOffset;
  for (const feature of projectMarkdownFeatures(source)) {
    if (feature.type !== "hashtag") continue;
    while (lineIndex < source.lines.length && lineOffset + source.lines[lineIndex].length < feature.span.start) {
      lineOffset += source.lines[lineIndex].length + 1;
      lineIndex += 1;
    }
    if (!headings.some((heading) => heading.line <= lineIndex + 1 && heading.declarationEndLine >= lineIndex + 1)) record(feature.tag, "inline", lineIndex + 1);
  }

  const tags = [...byKey.values()]
    .map((entry) => Object.freeze({
      name: entry.name,
      sources: Object.freeze([...entry.sources].sort()),
      lines: Object.freeze(entry.lines),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return Object.freeze({
    type: "GeodeDocumentTags",
    schemaVersion: "geode-document-tags/v1",
    tags: Object.freeze(tags),
  });
}

/**
 * A search pattern for `name` appearing as prose, not link syntax — the counterpart to
 * `CAIRN document catalogue`'s `backlinkPattern`, which instead requires link position.
 *
 * `name` must occupy a whole word: the characters immediately before and after (if any) must not
 * themselves be a letter, digit, or underscore, so a search for "Cat" does not answer for every
 * document that mentions "Category". As in `backlinkPattern`, `name` is the pattern's only
 * literal and sits where ripgrep's prefilter can see it, and the boundary is written as
 * character classes rather than lookaround: ripgrep's underlying regex engine has no lookaround
 * to give it.
 */
export function mentionPattern(name) {
  const literal = escapeRegex(name);
  return `(?:^|[^\\p{L}\\p{N}_])${literal}(?:$|[^\\p{L}\\p{N}_])`;
}

/**
 * Every whole-word occurrence of `name` in `markdown`, classified by where it sits.
 *
 * `kind` is the raw positional read: `code` (fenced block or inline code), `link` (inside
 * wikilink or Markdown-link syntax), `heading`, or `prose`. `link` occurrences are not unlinked
 * mentions at all — they are exactly what `deriveBacklinks` already proves — so they are used
 * only to decide, for every remaining occurrence, whether this same document already links to
 * `name` somewhere else. That is what turns a plain-text repeat of an already-linked name into
 * `linked-elsewhere` instead of `unlinked`.
 */
function classifyMentions(markdown, name) {
  const source = readMarkdownSource(markdown);
  const { headings } = projectMarkdownStructure(source);
  const links = projectMarkdownFeatures(source).filter((feature) => ["wikilink", "transclusion", "markdown-link", "reference-link"].includes(feature.type)).map((feature) => feature.span);
  const literal = escapeRegex(name);
  const occurrencePattern = new RegExp(`(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])`, "gu");
  const occurrences = [];

  let offset = source.bodyStartOffset;
  for (let index = source.bodyStartLine - 1; index < source.lines.length; index += 1) {
    const line = source.lines[index];
    const isHeading = headings.some((heading) => heading.line <= index + 1 && heading.declarationEndLine >= index + 1);
    occurrencePattern.lastIndex = 0;
    let match = occurrencePattern.exec(line);
    while (match !== null) {
      const start = offset + match.index, length = match[0].length;
      const kind = withinAny(start, length, source.codeRanges) ? "code"
        : withinAny(start, length, links) ? "link" : isHeading ? "heading" : "prose";
      occurrences.push({ line: index + 1, kind, evidence: line.trim() });
      match = occurrencePattern.exec(line);
    }
    offset += line.length + 1;
  }

  const hasExistingLink = occurrences.some((occurrence) => occurrence.kind === "link");
  return occurrences
    .filter((occurrence) => occurrence.kind !== "link")
    .map((occurrence) => Object.freeze({
      line: occurrence.line,
      classification: occurrence.kind === "code" || occurrence.kind === "heading"
        ? occurrence.kind
        : hasExistingLink ? "linked-elsewhere" : "unlinked",
      evidence: occurrence.evidence,
    }));
}

/**
 * Unlinked mentions of `name`, classified rather than merely found.
 *
 * `search` is a bounded, ripgrep-shaped prefilter (`{ query, regularExpression, limit } =>
 * { matches, truncated }`, the same shape `CAIRN document catalogue` calls) used only to discover
 * which documents are worth reading in full — it decides nothing on its own. Every candidate
 * document is then fetched in full through `readDocument(path) => Promise<string>` (the raw
 * Markdown text) and re-scanned by `classifyMentions`, so the classification is read off the
 * document's real structure rather than the search engine's line-oriented view of it. This is
 * the same "prove it against the real content" discipline `deriveBacklinks` applies to links.
 *
 * A document contributes no entry at all if every occurrence of `name` in it turns out to be a
 * real link already — there is nothing unlinked left to offer.
 */
export async function unlinkedMentionsOf({ name, search, readDocument, limit = 40 }) {
  if (typeof name !== "string" || name.trim() === "") throw new TypeError("name is required");
  if (typeof search !== "function") throw new TypeError("search is required");
  if (typeof readDocument !== "function") throw new TypeError("readDocument is required");
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("limit must be a positive integer");

  const found = await search({ query: mentionPattern(name), regularExpression: true, limit: 500 });
  const sources = [];
  for (const match of found.matches) {
    if (!sources.includes(match.path)) sources.push(match.path);
    if (sources.length >= limit) break;
  }

  const documents = [];
  for (const path of sources) {
    const markdown = await readDocument(path);
    const mentions = classifyMentions(markdown, name);
    if (mentions.length === 0) continue;
    documents.push(Object.freeze({ path, mentions: Object.freeze(mentions) }));
  }

  return Object.freeze({
    type: "GeodeUnlinkedMentions",
    schemaVersion: "geode-unlinked-mentions/v1",
    name,
    searchedDocuments: sources.length,
    truncated: found.truncated === true || sources.length >= limit,
    documents: Object.freeze(documents),
  });
}
