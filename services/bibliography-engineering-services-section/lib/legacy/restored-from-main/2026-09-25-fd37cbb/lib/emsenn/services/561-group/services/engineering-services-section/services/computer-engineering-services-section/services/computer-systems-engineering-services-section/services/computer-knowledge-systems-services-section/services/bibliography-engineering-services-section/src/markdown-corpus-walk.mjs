import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);

/**
 * Walk a directory for Markdown files, returning each file's text keyed by
 * its path relative to `root`. Skips `node_modules/` and `.git/`.
 *
 * @param {string} root - the scope directory to walk.
 * @returns {Array<{relativePath: string, path: string, text: string}>} frozen, sorted by relativePath.
 */
export function walkMarkdownDocuments(root) {
  const repositoryRoot = resolve(root);
  const documents = [];
  const stack = [repositoryRoot];
  while (stack.length > 0) {
    const directory = stack.pop();
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOTDIR" || error.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) stack.push(path);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        documents.push(Object.freeze({ relativePath: relative(repositoryRoot, path), path, text: readFileSync(path, "utf8") }));
      }
    }
  }
  documents.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
  return Object.freeze(documents);
}
