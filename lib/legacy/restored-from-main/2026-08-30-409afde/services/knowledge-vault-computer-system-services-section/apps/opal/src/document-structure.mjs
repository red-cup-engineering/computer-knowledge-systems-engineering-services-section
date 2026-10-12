/**
 * Document-scale structure: outline, tags, and unlinked mentions.
 *
 * These three meet what tools in Opal's class already offer — a navigable heading outline, a
 * vault-wide tag index, and unlinked mentions of a document's name — and beat the third, which
 * is where re-deriving edges instead of pattern-matching them (`repository-graph.mjs`) gives this
 * repository a real advantage. Everywhere else, "unlinked mentions" is an undifferentiated
 * substring scan. Here, every candidate mention is classified: genuinely unlinked prose, a
 * mention this same document already links elsewhere, a mention sitting in a code block or
 * inline code (almost never a good link target), or a mention inside a heading. The evidence
 * line travels with each one so the classification can be checked, not just trusted.
 *
 * Every function here is pure: given the same Markdown text (and, for `unlinkedMentionsOf`, the
 * same effector responses) they return the same answer. Nothing here reads a file, runs a
 * search, or touches the corpus directly — `bare-cedar-fog-workspace.mjs` supplies those as
 * injected `search` and `readDocument` functions, the same discipline `repository-graph.mjs`
 * already uses for backlinks.
 */

const REGEX_METACHARACTERS = /[\\^$.*+?()[\]{}|]/gu;

function escapeRegex(value) {
  return value.replace(REGEX_METACHARACTERS, (character) => `\\${character}`);
}

function normalizeLines(markdown) {
  return markdown.replace(/\r\n?/gu, "\n").split("\n");
}

/**
 * Which lines sit inside a fenced code block (``` or ~~~), the fence marker lines included.
 *
 * A close fence must reuse the same character as its opener and be at least as long — the
 * ordinary CommonMark rule — so a run of three backticks does not accidentally close a run of
 * four, and a tilde fence never closes a backtick one.
 */
function fenceFlags(lines) {
  const flags = new Array(lines.length).fill(false);
  let openChar = null;
  let openLength = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (openChar === null) {
      const opener = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
      // A backtick fence's info string may not itself contain a backtick (CommonMark); a tilde
      // fence has no such restriction. Getting this wrong would misread a fenced shell snippet
      // that pipes through a backtick-quoted command as never having opened a fence at all.
      if (opener && !(opener[1][0] === "`" && opener[2].includes("`"))) {
        openChar = opener[1][0];
        openLength = opener[1].length;
        flags[index] = true;
      }
      continue;
    }
    flags[index] = true;
    const closer = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/u);
    if (closer && closer[1][0] === openChar && closer[1].length >= openLength) {
      openChar = null;
      openLength = 0;
    }
  }
  return flags;
}

const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/u;
const SETEXT_LEVEL_1 = /^ {0,3}=+[ \t]*$/u;
const SETEXT_LEVEL_2 = /^ {0,3}-{2,}[ \t]*$|^ {0,3}-[ \t]*$/u;
// A setext heading's text line cannot itself already be some other block: a list item, a
// blockquote, a fence opener, or (redundantly, since ATX is matched first) an ATX heading.
// Skipping those keeps "- like this\n---" from being misread as a level-2 heading.
const SETEXT_BLOCK_STARTER = /^ {0,3}(?:[-*+][ \t]|\d{1,9}[.)][ \t]|>|#{1,6}(?:[ \t]|$)|`{3,}|~{3,})/u;

function atxText(captured) {
  if (captured === undefined) return "";
  // A closing sequence of hashes (`## Heading ##`) is decoration, not content.
  return captured.replace(/[ \t]+#+[ \t]*$/u, "").trim();
}

/**
 * Heading records in document order: `{ level, text, line, endLine }`, 1-based line numbers.
 *
 * `endLine` is the setext underline's line for a setext heading and equals `line` for an ATX
 * one; callers that need "every line this heading declaration occupies" use the inclusive
 * `line..endLine` range rather than assuming one line per heading.
 *
 * Lines inside a fenced code block are never headings, no matter what they look like — a
 * `# comment` inside a fenced shell snippet is a shell comment, not a document heading.
 */
function detectHeadings(lines, fenced) {
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (fenced[index]) continue;
    const line = lines[index];
    const atx = line.match(ATX_HEADING);
    if (atx) {
      headings.push({ level: atx[1].length, text: atxText(atx[2]), line: index + 1, endLine: index + 1 });
      continue;
    }
    if (line.trim() === "" || SETEXT_BLOCK_STARTER.test(line)) continue;
    const next = lines[index + 1];
    if (next === undefined || fenced[index + 1]) continue;
    if (SETEXT_LEVEL_1.test(next)) {
      headings.push({ level: 1, text: line.trim(), line: index + 1, endLine: index + 2 });
      index += 1;
    } else if (SETEXT_LEVEL_2.test(next)) {
      headings.push({ level: 2, text: line.trim(), line: index + 1, endLine: index + 2 });
      index += 1;
    }
  }
  return headings;
}

/** Shared read of one Markdown text's fence and heading structure, so all three functions below agree. */
function parseStructure(markdown) {
  const lines = normalizeLines(markdown);
  const fenced = fenceFlags(lines);
  const headings = detectHeadings(lines, fenced);
  const headingLines = new Set();
  for (const heading of headings) {
    for (let line = heading.line; line <= heading.endLine; line += 1) headingLines.add(line);
  }
  return { lines, fenced, headings, headingLines };
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
  const { headings } = parseStructure(markdown);
  const seen = new Map();
  const flat = Object.freeze(headings.map((heading) => Object.freeze({
    level: heading.level,
    text: heading.text,
    line: heading.line,
    anchor: anchorFor(slugify(heading.text), seen),
  })));
  return Object.freeze({
    type: "OpalDocumentOutline",
    schemaVersion: "opal-document-outline/v1",
    headings: flat,
    tree: freezeTree(buildTree(flat)),
  });
}

/** Backtick-delimited inline code spans on one line, replaced with equal-length blanks. */
function stripInlineCode(line) {
  return line.replace(/(`+)([\s\S]*?)\1/gu, (match) => " ".repeat(match.length));
}

/** Backtick-delimited inline code spans on one line, as `{ start, end }` character ranges. */
function inlineCodeSpans(line) {
  const spans = [];
  const pattern = /(`+)([\s\S]*?)\1/gu;
  let match = pattern.exec(line);
  while (match !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) pattern.lastIndex += 1;
    match = pattern.exec(line);
  }
  return spans;
}

const LINK_SPAN_PATTERNS = Object.freeze([
  /\[\[[^\]]+\]\]/gu, // wikilink
  /\[[^\]]*\]\([^)]*\)/gu, // inline Markdown link
  /\[[^\]]*\]\[[^\]]*\]/gu, // reference-style link
]);

/** Every wikilink or Markdown-link span on one line, as `{ start, end }` character ranges. */
function linkSpans(line) {
  const spans = [];
  for (const template of LINK_SPAN_PATTERNS) {
    const pattern = new RegExp(template.source, template.flags);
    let match = pattern.exec(line);
    while (match !== null) {
      spans.push({ start: match.index, end: match.index + match[0].length });
      match = pattern.exec(line);
    }
  }
  return spans;
}

function withinAny(start, length, spans) {
  return spans.some((span) => start >= span.start && start + length <= span.end);
}

const INLINE_TAG = /(?:^|[ \t])#([\p{L}][\p{L}\p{N}_/-]*)/gmu;

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
  const { lines, fenced, headingLines } = parseStructure(markdown);
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

  lines.forEach((line, index) => {
    if (fenced[index] || headingLines.has(index + 1)) return;
    const stripped = stripInlineCode(line);
    INLINE_TAG.lastIndex = 0;
    let match = INLINE_TAG.exec(stripped);
    while (match !== null) {
      record(match[1], "inline", index + 1);
      match = INLINE_TAG.exec(stripped);
    }
  });

  const tags = [...byKey.values()]
    .map((entry) => Object.freeze({
      name: entry.name,
      sources: Object.freeze([...entry.sources].sort()),
      lines: Object.freeze(entry.lines),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return Object.freeze({
    type: "OpalDocumentTags",
    schemaVersion: "opal-document-tags/v1",
    tags: Object.freeze(tags),
  });
}

/**
 * A search pattern for `name` appearing as prose, not link syntax — the counterpart to
 * `repository-graph.mjs`'s `backlinkPattern`, which instead requires link position.
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
  const { lines, fenced, headingLines } = parseStructure(markdown);
  const literal = escapeRegex(name);
  const occurrencePattern = new RegExp(`(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])`, "gu");
  const occurrences = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fenced[index]) {
      occurrencePattern.lastIndex = 0;
      let match = occurrencePattern.exec(line);
      while (match !== null) {
        occurrences.push({ line: index + 1, kind: "code", evidence: line.trim() });
        match = occurrencePattern.exec(line);
      }
      continue;
    }
    const codeSpans = inlineCodeSpans(line);
    const links = linkSpans(line);
    const isHeading = headingLines.has(index + 1);
    occurrencePattern.lastIndex = 0;
    let match = occurrencePattern.exec(line);
    while (match !== null) {
      const start = match.index;
      const length = match[0].length;
      let kind;
      if (withinAny(start, length, codeSpans)) kind = "code";
      else if (withinAny(start, length, links)) kind = "link";
      else if (isHeading) kind = "heading";
      else kind = "prose";
      occurrences.push({ line: index + 1, kind, evidence: line.trim() });
      match = occurrencePattern.exec(line);
    }
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
 * { matches, truncated }`, the same shape `repository-graph.mjs` calls) used only to discover
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
    type: "OpalUnlinkedMentions",
    schemaVersion: "opal-unlinked-mentions/v1",
    name,
    searchedDocuments: sources.length,
    truncated: found.truncated === true || sources.length >= limit,
    documents: Object.freeze(documents),
  });
}
