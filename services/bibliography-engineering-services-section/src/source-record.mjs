/**
 * @module source-record
 * A source record: what a set of notes rests on in the published record.
 * Its rows are CSL-JSON items as read (`sources[].item`) and the searches
 * run to find them (`searches[]`, each with the ids it included, so a search
 * that included none is the record of a null result). The record names its
 * own JSON Schema in `$schema`; the owning section's schema adds its own row
 * fields and, under `x-citation-policy`, which rows a note may cite
 * (`uncitable`: field -> values) and what a cited row must carry (`requires`).
 *
 * A note cites a row in prose by the row's house citation label
 * (`formatCitationLabel`, e.g. "Weyandt et al. 2018"), and carries the cited
 * rows as its frontmatter `references:` map, derived here, never written by
 * hand.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { validateSchemaInstance } from "@red-cup-engineering/json-schema-services-section/validate-schema-instance";
import { formatCitationLabel, fromCslItem, makeCitekey } from "@red-cup-engineering/csl-json-services-section/record-formatting";
import { issuedYear } from "@red-cup-engineering/csl-json-services-section";
import { mutateMarkdownFrontmatter } from "@red-cup-engineering/markdown-engineering-services-section/mutate-markdown-frontmatter";
import { readMarkdownFrontmatter } from "@red-cup-engineering/read-markdown-frontmatter-service";
import { isDeepStrictEqual } from "node:util";
import { searchRegister } from "./register.mjs";

const finding = (level, where, message) => Object.freeze({ level, where, message });
const today = () => new Date().toISOString().slice(0, 10);

/** The record at `path`, its schema (resolved from its `$schema`), and the paths of its notes. */
export function readSourceRecord(path) {
  const record = JSON.parse(readFileSync(path, "utf8"));
  if (typeof record.$schema !== "string") throw new TypeError(`${path}: a source record names its schema in $schema`);
  const schema = JSON.parse(readFileSync(resolve(dirname(path), record.$schema), "utf8"));
  const notes = (record.notes ?? []).map((note) => resolve(dirname(path), note));
  return Object.freeze({ record, schema, notes });
}

/** Schema conformance plus what a schema cannot say: unique row ids, and every included id names a row. */
export function admitSourceRecord(record, schema) {
  const { errors } = validateSchemaInstance({ schema, instance: record });
  const findings = errors.map((e) => finding("error", `record${e.pointer}`, e.message));
  const ids = new Set();
  for (const { item } of record.sources ?? []) {
    if (ids.has(item?.id)) findings.push(finding("error", "record", `source ${item?.id}: duplicate id`));
    ids.add(item?.id);
  }
  for (const search of record.searches ?? [])
    for (const id of search.included ?? [])
      if (!ids.has(id)) findings.push(finding("error", "record", `search ${JSON.stringify(search.variables)}: included ${id} has no source row`));
  return Object.freeze(findings);
}

/** The rows a note's prose cites, by house citation label, in order of first citation. */
export function citedRows(record, body) {
  return (record.sources ?? [])
    .map((row) => ({ row, at: body.indexOf(formatCitationLabel(row.item)) }))
    .filter(({ at }) => at !== -1)
    .sort((a, b) => a.at - b.at)
    .map(({ row }) => row);
}

/** Rows no note cites: read, but resting nothing. */
export function uncitedRows(record, texts) {
  const bodies = texts.map((text) => readMarkdownFrontmatter(text, { frontmatterFormats: ["yaml"], absentFrontmatter: "empty" }).body);
  return (record.sources ?? [])
    .filter(({ item }) => !bodies.some((body) => body.includes(formatCitationLabel(item))))
    .map(({ item }) => finding("warning", "record", `${formatCitationLabel(item)} (${item.id}) is cited by no note`));
}

/** The note's `references:` map, derived from the rows it cites. */
export function noteReferences(record, body) {
  return Object.fromEntries(citedRows(record, body).map(({ item }) => {
    const { abstract, ...cited } = item;
    const { citekey, entry } = fromCslItem(cited);
    return [citekey, entry];
  }));
}

// An author-year citation in prose: "Moran 2024", "Ilieva & Hook 2015", "Pfoser-Poschacher et al. 2026",
// "Wardle & de Wit 2012". What remains after every row's label is removed has no row.
const NAME = String.raw`(?:(?:de|van|von|der|le|la) )?\p{Lu}[\p{L}'’-]+`;
const CITATION = new RegExp(String.raw`${NAME}(?: & ${NAME}| et al\.)? (?:19|20)\d\d\b`, "gu");

/** Findings about one note against the record: unresolved citations, the schema's citation policy, and stale references. */
export function checkNote(record, schema, text, where) {
  const findings = [];
  const policy = schema["x-citation-policy"] ?? {};
  const { frontmatter, body } = readMarkdownFrontmatter(text, { frontmatterFormats: ["yaml"], absentFrontmatter: "empty" });
  const rows = citedRows(record, body);
  let rest = body;
  for (const { item } of record.sources ?? []) rest = rest.replaceAll(formatCitationLabel(item), "");
  for (const [citation] of rest.matchAll(CITATION))
    findings.push(finding(/ & | et al\./u.test(citation) ? "error" : "warning", where, `"${citation}" has no source row`));
  for (const row of rows) {
    const label = formatCitationLabel(row.item);
    for (const [field, values] of Object.entries(policy.uncitable ?? {}))
      if (values.includes(row[field])) findings.push(finding("error", where, `${label} is cited but its ${field} is ${row[field]}`));
    for (const field of policy.requires ?? [])
      if (row[field] === undefined || (Array.isArray(row[field]) && row[field].length === 0)) findings.push(finding("warning", where, `${label} is cited but its row carries no ${field}`));
  }
  if (!isDeepStrictEqual(frontmatter.references ?? {}, noteReferences(record, body)))
    findings.push(finding("error", where, "references differ from the record; run `bibliography record-references <record> --write`"));
  return Object.freeze(findings);
}

/** The note with its `references:` derived from the record. */
export function writeNoteReferences(record, text) {
  const { body } = readMarkdownFrontmatter(text, { frontmatterFormats: ["yaml"], absentFrontmatter: "empty" });
  return mutateMarkdownFrontmatter(text, { mode: "set", key: "references", value: noteReferences(record, body) });
}

/** Run one search of a register and record it, including nothing yet; returns the record and the hits. */
export async function recordSearch(record, registerName, register, variables, options) {
  const { count, items } = await searchRegister(register, variables, options);
  const search = { register: registerName, variables, observedAt: today(), count: count ?? items.length, included: [] };
  return Object.freeze({ record: { ...record, searches: [...(record.searches ?? []), search] }, items });
}

/**
 * Read one work from a register (the first hit of `variables`) into a new row under a house citekey,
 * with `defaults` (the owning schema's row fields, e.g. the surface it was read from). The abstract is
 * returned to read, not stored: the register re-derives it.
 */
export async function recordRead(record, registerName, register, variables, defaults = {}, options) {
  const { items } = await searchRegister(register, variables, options);
  if (items.length === 0) throw new Error(`${registerName} has no work for ${JSON.stringify(variables)}`);
  const { abstract, ...item } = items[0];
  const rows = record.sources ?? [];
  const known = rows.find((row) => ["DOI", "PMID", "PMCID", "number"].some((key) => item[key] !== undefined && row.item[key] === item[key]));
  if (known) throw new Error(`already recorded as ${known.item.id}`);
  const id = makeCitekey(item.author ?? [], issuedYear(item.issued) ?? "nd", new Set(rows.map((row) => row.item.id)));
  const row = { item: { ...item, id }, ...defaults, observedAt: today() };
  return Object.freeze({ record: { ...record, sources: [...rows, row] }, row, abstract });
}
