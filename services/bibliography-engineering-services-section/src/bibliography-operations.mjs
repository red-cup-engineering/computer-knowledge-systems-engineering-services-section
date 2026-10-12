import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { readFileText } from "@red-cup-engineering/computer-file-engineering-services-section/read-file";
import { writeFileText } from "@red-cup-engineering/computer-file-engineering-services-section/write-file";
import { admitBibliographyMarkdown, readBibliographyMarkdown, recognizeBibliographyMarkdown, renderBibliographyMarkdown } from "./bibliography-carrier.mjs";

/**
 * Read one bibliography carrier from disk and recognize it in the same pass.
 *
 * @param {string} path - path to the carrier's Markdown file.
 * @returns {object} the frozen path, text, parse, and recognition.
 */
export async function readBibliography(path) {
  const absolutePath = resolve(path);
  const text = await readFileText(absolutePath);
  return Object.freeze({
    path: absolutePath,
    text,
    parsed: readBibliographyMarkdown(text),
    recognized: recognizeBibliographyMarkdown({ text, filename: basename(absolutePath) }),
  });
}

/**
 * Write one bibliography carrier to `bibliographyDirectory`, refusing to
 * overwrite an existing file unless `overwrite` is explicit.
 *
 * @param {{bibliographyDirectory: string, bibliography: object, overwrite?: boolean}} request
 * @param {{exists?: Function, write?: Function}} [operations] - injection points for tests.
 * @returns {object} the frozen disposition, path, and admitted recognition.
 * @throws {TypeError|Error} on a malformed request, a refused carrier, or an unauthorized overwrite.
 */
export async function writeBibliography({ bibliographyDirectory, bibliography, overwrite = false } = {}, operations = {}) {
  if (typeof bibliographyDirectory !== "string" || bibliographyDirectory.trim() === "") throw new TypeError("bibliographyDirectory is required");
  if (bibliography === null || typeof bibliography !== "object" || Array.isArray(bibliography)) throw new TypeError("bibliography record is required");
  if (typeof bibliography.key !== "string" || bibliography.key.trim() === "") throw new TypeError("bibliography.key is required");
  const filename = `${bibliography.key}.md`;
  const markdown = renderBibliographyMarkdown(bibliography);
  const path = join(resolve(bibliographyDirectory), filename);
  const pathExists = operations.exists ?? existsSync;
  if (pathExists(path) && !overwrite) throw new Error(`bibliography carrier already exists; explicit overwrite required: ${path}`);
  const admitted = admitBibliographyMarkdown({ text: markdown, filename });
  const write = operations.write ?? writeFileText;
  await write(path, markdown);
  return Object.freeze({ disposition: "written", path, filename, admitted });
}
