import { basename, extname } from "node:path";
import { createMarkdownDocument } from "@red-cup-engineering/markdown-engineering-services-section/create-markdown-document";
import { readMarkdownFrontmatter } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-frontmatter";
import { admitBibliographyRecord } from "../schemas/bibliography/bibliography.schema.mjs";

export const CITEKEY = /^[a-z][a-z0-9-]*[0-9]{4}[a-z0-9-]*$/u;

function finding(rule, message) { return Object.freeze({ rule, message }); }

function filenameIdentity(filename) {
  const file = basename(filename ?? "");
  if (file !== filename || extname(file).toLowerCase() !== ".md" || file === ".md") throw new TypeError("filename must be one safe Markdown basename");
  return file.slice(0, -3);
}

/**
 * Render one depth-2 bibliography carrier as canonical Markdown.
 *
 * @param {object} input - a bibliography record; `body` is required nonempty text.
 * @returns {string} the rendered Markdown document (YAML frontmatter + body).
 * @throws {TypeError} when the record does not admit.
 */
export function renderBibliographyMarkdown(input = {}) {
  const admitted = admitBibliographyRecord(input);
  const { body, ...frontmatter } = admitted;
  return createMarkdownDocument({ ...frontmatter, body: `${body.trim()}\n` }, { semanticLinefeeds: false });
}

/**
 * Parse one bibliography carrier's frontmatter and body without judging it.
 *
 * @param {string} text - the Markdown source.
 * @returns {{frontmatter: (object|null), body: string}} the frozen parse.
 */
export function readBibliographyMarkdown(text) {
  const parsed = readMarkdownFrontmatter(text, { frontmatterFormats: ["yaml"], absentFrontmatter: "empty" });
  return Object.freeze({ frontmatter: parsed.frontmatter, body: parsed.body });
}

/**
 * Recognize whether Markdown text is an admissible depth-2 bibliography
 * carrier, refusing with findings rather than throwing — a scraped source
 * document mis-filed under bibliographies/ is refused, not crashed on.
 *
 * @param {{text: string, filename?: string}} input
 * @returns {{admitted: boolean, findings: Array<{rule: string, message: string}>}} frozen report.
 */
export function recognizeBibliographyMarkdown({ text, filename } = {}) {
  let parsed;
  try {
    parsed = readBibliographyMarkdown(text);
  } catch (error) {
    return Object.freeze({ admitted: false, findings: Object.freeze([finding("markdown", error.message)]) });
  }
  const findings = [];
  const metadata = parsed.frontmatter ?? {};

  if (metadata.type !== "bibliography") findings.push(finding("type", `type must equal bibliography; found ${JSON.stringify(metadata.type ?? null)}`));

  let identity = null;
  if (filename !== undefined) {
    try { identity = filenameIdentity(filename); } catch (error) { findings.push(finding("filename", error.message)); }
  }
  if (typeof metadata.key !== "string" || metadata.key.trim() === "") {
    findings.push(finding("key", "key is required"));
  } else {
    if (!CITEKEY.test(metadata.key)) findings.push(finding("key-pattern", "key must match a citekey pattern (surnameYYYY): ^[a-z][a-z0-9-]*[0-9]{4}[a-z0-9-]*$"));
    if (identity !== null && metadata.key !== identity) findings.push(finding("key-identity", "key must equal the Markdown filename stem"));
  }

  if (typeof metadata["reference-type"] !== "string" || metadata["reference-type"].trim() === "") findings.push(finding("reference-type", "reference-type is required"));

  if (!Array.isArray(metadata.authors) || metadata.authors.length === 0 || metadata.authors.some((author) => typeof author !== "string" || author.trim() === "")) {
    findings.push(finding("authors", "authors must be a nonempty array of nonempty strings"));
  }

  if (!Number.isInteger(metadata.year) || metadata.year < 1) findings.push(finding("year", "year must be a positive integer"));

  if (typeof metadata.title !== "string" || metadata.title.trim() === "") findings.push(finding("title", "title is required"));

  if (metadata.url !== undefined) { try { new URL(metadata.url); } catch { findings.push(finding("url", "url must be a URI")); } }

  const admitted = findings.length === 0;
  return Object.freeze({
    admitted,
    key: typeof metadata.key === "string" ? metadata.key : identity,
    referenceType: metadata["reference-type"],
    authors: Array.isArray(metadata.authors) ? Object.freeze([...metadata.authors]) : undefined,
    year: metadata.year,
    title: metadata.title,
    findings: Object.freeze(findings),
  });
}

/**
 * Admit one bibliography carrier, throwing with the collected findings when
 * it is refused.
 *
 * @param {{text: string, filename?: string}} input
 * @returns {object} the frozen recognition report, guaranteed admitted.
 * @throws {Error} carrying `.findings` when the carrier is refused.
 */
export function admitBibliographyMarkdown(input) {
  const recognized = recognizeBibliographyMarkdown(input);
  if (!recognized.admitted) {
    const error = new Error(`bibliography carrier refused: ${recognized.findings.map(({ rule, message }) => `${rule}: ${message}`).join("; ")}`);
    error.findings = recognized.findings;
    throw error;
  }
  return recognized;
}
