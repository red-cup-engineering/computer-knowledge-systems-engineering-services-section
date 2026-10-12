/**
 * What a carrier's path says about it before any byte is read: the section that owns it, the
 * artifact-role directory it sits in, and the kind that directory states (the program's
 * Decision 5: kind comes from the artifact-role directory before it comes from a key).
 * @packageDocumentation
 */
import { posix } from "node:path";

const DATE_SEGMENT = /^\d{4}(?:-\d{2}){0,2}$|^\d{2}$|^undated$/u;
/** House content containers: directories that hold artifact-role directories rather than naming one. */
const CONTAINER_SEGMENTS = new Set(["content", "text", "documents", "articles", "glossary", "media"]);

/**
 * The section owning a carrier: the deepest `services/<name>` or `apps/<name>` directory above
 * it, `""` at the root. Every carrier's concept scheme, as a glossary term's is.
 * @param {string} path
 */
export function sectionOf(path) {
  const segments = path.split("/").slice(0, -1);
  let end = 0;
  for (let index = 0; index + 1 < segments.length; index += 1) if (segments[index] === "services" || segments[index] === "apps") end = index + 2;
  return segments.slice(0, end).join("/");
}

/**
 * A carrier's artifact role: the directory path between its section and the file, with date
 * segments dropped, so `content/text/documents/articles/notes/2026/09/30` reads as
 * `content/text/documents/articles/notes`.
 * @param {string} path
 * @param {string} section
 */
export function roleOf(path, section) {
  const directory = posix.dirname(path);
  const inner = section === "" ? (directory === "." ? "" : directory) : directory.slice(section.length + 1);
  return inner.split("/").filter((segment) => segment !== "" && !DATE_SEGMENT.test(segment)).join("/");
}

function singular(word) {
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ses") || word.endsWith("xes")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/**
 * A carrier's kind, read from its role directory alone: the first directory past the house
 * content containers (`content/text/glossary/terms` is `term`, `.../articles/notes/books/x` is
 * `note`), or the last container when nothing follows it; a file directly in its section is a
 * `readme`, `agents`, `changelog`, or `claude` by name, else a `document`.
 * @param {string} role
 * @param {string} stem
 */
export function kindOf(role, stem) {
  const segments = role.split("/").filter(Boolean);
  if (segments.length > 0) {
    const at = segments.findIndex((segment) => !CONTAINER_SEGMENTS.has(segment));
    return singular((at === -1 ? segments.at(-1) : segments[at]).toLowerCase());
  }
  const named = stem.toLowerCase();
  return ["readme", "agents", "changelog", "claude"].includes(named) ? named : "document";
}

/** A carrier's file name without its extension. @param {string} path */
export function stemOf(path) {
  const base = posix.basename(path);
  return base.slice(0, base.lastIndexOf("."));
}

/** The kind a carrier's path states. @param {string} path */
export function carrierKindOf(path) {
  return kindOf(roleOf(path, sectionOf(path)), stemOf(path));
}
