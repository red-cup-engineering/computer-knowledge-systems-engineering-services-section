import { readMarkdownFrontmatter } from "@red-cup-engineering/read-markdown-frontmatter-service";
import { admitReferenceEntry } from "../schemas/bibliography/reference-entry.schema.mjs";
import { recognizeBibliographyMarkdown } from "./bibliography-carrier.mjs";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { walkFiles } from "@red-cup-engineering/markdown-engineering-services-section/vault-dialect/walk";

/** Every Markdown document beneath root, with its text, in path order. */
function walkMarkdownDocuments(root) {
  const base = resolve(root);
  return walkFiles(base, { extensions: [".md"] })
    .map((path) => Object.freeze({ relativePath: relative(base, path), path, text: readFileSync(path, "utf8") }))
    .sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
}

const CITEKEY = /^[a-z][a-z0-9-]*[0-9]{4}[a-z0-9-]*$/u;
// A bare or bracketed pandoc-style inline citation key: `@key`, `[@key]`,
// `[@a; @b]`, `[@key, p. 5]`. The negative lookbehind excludes an `@` that
// immediately follows a word character or another `@`, which is what an
// email-address local part looks like ("info@example.com"), while still
// matching an `@` right after `[`, `;`, `,`, or whitespace.
const INLINE_CITATION_TOKEN = /(?<![\w@])@([a-z][a-z0-9-]*)/gu;
const FENCE_LINE = /^\s*(`{3,}|~{3,})/u;

function finding(rule, message, path) { return Object.freeze({ rule, message, path }); }

/**
 * Blank out fenced code block lines (``` or ~~~ delimited) so citation
 * scanning never reads an `@` inside a code sample.
 *
 * @param {string} body - Markdown body text (frontmatter already stripped).
 * @returns {string} the body with fenced block lines replaced by blank lines.
 */
function blankFencedCodeBlocks(body) {
  const lines = body.split("\n");
  let fenceChar = null;
  return lines
    .map((line) => {
      const match = FENCE_LINE.exec(line);
      if (fenceChar === null) {
        if (match) { fenceChar = match[1][0]; return ""; }
        return line;
      }
      if (match && match[1][0] === fenceChar) fenceChar = null;
      return "";
    })
    .join("\n");
}

/**
 * Extract every inline `@citekey` occurrence from a Markdown body — bare
 * `@key` and bracketed `[@a; @b, p. 5]` forms alike — ignoring email-like
 * `@` usages and anything inside a fenced code block.
 *
 * @param {string} body - Markdown body text (frontmatter already stripped).
 * @returns {Array<string>} citekeys in the order found, one per occurrence.
 */
function extractInlineCitekeys(body) {
  const stripped = blankFencedCodeBlocks(body);
  const keys = [];
  for (const match of stripped.matchAll(INLINE_CITATION_TOKEN)) {
    if (CITEKEY.test(match[1])) keys.push(match[1]);
  }
  return keys;
}

/**
 * Collect every (citekey, reference, source-path) triple carried in the
 * `references:` frontmatter map of any carrier in `documents` — terms and
 * any other carrier class alike (depth 1 of the citation model).
 *
 * @param {Array<{relativePath: string, text: string}>} documents
 * @returns {{triples: Array<{citekey: string, reference: object, path: string}>, findings: Array<object>}} frozen.
 */
export function collectReferenceTriples(documents) {
  const triples = [];
  const findings = [];
  for (const { relativePath, text } of documents) {
    let frontmatter;
    try {
      frontmatter = readMarkdownFrontmatter(text, { frontmatterFormats: ["yaml"], absentFrontmatter: "empty" }).frontmatter;
    } catch (error) {
      findings.push(finding("markdown", error.message, relativePath));
      continue;
    }
    const references = frontmatter?.references;
    if (references === undefined || references === null) continue;
    if (typeof references !== "object" || Array.isArray(references)) {
      findings.push(finding("references-shape", "references: must be a citekey-keyed object map", relativePath));
      continue;
    }
    for (const [citekey, reference] of Object.entries(references)) {
      try {
        const admitted = admitReferenceEntry(citekey, reference);
        triples.push(Object.freeze({ citekey, reference: admitted, path: relativePath }));
      } catch (error) {
        findings.push(finding("invalid-reference-entry", `${citekey}: ${error.message}`, relativePath));
      }
    }
  }
  return Object.freeze({ triples: Object.freeze(triples), findings: Object.freeze(findings) });
}

/**
 * Collect every depth-2 bibliography carrier in `documents` (frontmatter
 * `type: bibliography`), recognized under the bibliography carrier contract.
 *
 * @param {Array<{relativePath: string, text: string}>} documents
 * @returns {Array<{citekey: (string|null), path: string, recognized: object}>} frozen, one per bibliography-typed document.
 */
export function collectBibliographyCarriers(documents) {
  const carriers = [];
  for (const { relativePath, text } of documents) {
    let frontmatter;
    try {
      frontmatter = readMarkdownFrontmatter(text, { frontmatterFormats: ["yaml"], absentFrontmatter: "empty" }).frontmatter;
    } catch {
      continue;
    }
    if (frontmatter?.type !== "bibliography") continue;
    const filename = relativePath.split("/").pop();
    const recognized = recognizeBibliographyMarkdown({ text, filename });
    carriers.push(Object.freeze({ citekey: recognized.key ?? null, path: relativePath, recognized }));
  }
  return Object.freeze(carriers);
}

/**
 * Collect every inline `[@citekey]` / bare `@citekey` occurrence in the
 * Markdown body of any document in `documents` (frontmatter excluded) — the
 * usage side of the citation model's rule that an inline key must exist in
 * that same file's depth-1 `references:` map.
 *
 * @param {Array<{relativePath: string, text: string}>} documents
 * @returns {Array<{path: string, citekey: string}>} frozen, one entry per occurrence, in document then in-body order.
 */
export function collectInlineCitations(documents) {
  const citations = [];
  for (const { relativePath, text } of documents) {
    let body;
    try {
      body = readMarkdownFrontmatter(text, { frontmatterFormats: ["yaml"], absentFrontmatter: "empty" }).body;
    } catch {
      continue;
    }
    for (const citekey of extractInlineCitekeys(body)) {
      citations.push(Object.freeze({ path: relativePath, citekey }));
    }
  }
  return Object.freeze(citations);
}

/**
 * Walk `root` and collect the reference triples, the bibliography carriers,
 * and the inline body citations found in it — the three inputs `reconcile`
 * needs.
 *
 * @param {string} root - the scope directory to walk.
 * @returns {{triples: Array<object>, findings: Array<object>, carriers: Array<object>, citations: Array<object>}} frozen.
 */
export function collectReferencesFrom(root) {
  const documents = walkMarkdownDocuments(root);
  const { triples, findings } = collectReferenceTriples(documents);
  const carriers = collectBibliographyCarriers(documents);
  const citations = collectInlineCitations(documents);
  return Object.freeze({ triples, findings, carriers, citations });
}
