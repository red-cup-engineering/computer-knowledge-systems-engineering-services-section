import { schemeOf } from "@red-cup-engineering/term-engineering-services-section/glossary-index";

const SCHEMA = "computer-glossary-census.v1";
const STUB_MESSAGE = "body must be nonempty text";

function increment(counts, key) { counts[key] = (counts[key] ?? 0) + 1; }
function byKey(counts) { return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))); }
function byCount(counts) { return Object.fromEntries(Object.entries(counts).sort(([leftKey, left], [rightKey, right]) => right - left || leftKey.localeCompare(rightKey))); }
function tsvCell(value) { return String(value).replace(/[\t\n\r]+/gu, " "); }
function identityOf(path) { return path.split("/").pop().replace(/\.md$/u, ""); }

/**
 * Census one projected glossary index (`computer-glossary-index.v2`): how many carriers the
 * term owner admitted and refused, refusals by rule and by message, admission per concept
 * scheme (owning section), empty-bodied stubs, and identities that more than one scheme
 * carries. Pure and deterministic; the term owner's admission is the only judge, so the census
 * never re-reads a carrier.
 * @param {{records: readonly object[], refused: readonly {path: string, findings: readonly {rule: string, message: string}[]}[]}} index
 * @param {{date: string}} options
 * @returns {{record: object, rows: string[][]}} the dated record, and one row per carrier
 */
export function censusGlossaryIndex(index, { date }) {
  if (!index || !Array.isArray(index.records) || !Array.isArray(index.refused)) throw new TypeError("index must be a projected glossary index");
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new TypeError("date must be YYYY-MM-DD");
  const byRule = {}, byMessage = {}, schemes = {}, owners = {};
  const rows = [];
  let stubs = 0;
  const carrier = (path, scheme, identity, admitted, rules) => {
    schemes[scheme] ??= { carriers: 0, admitted: 0 };
    schemes[scheme].carriers += 1;
    if (admitted) schemes[scheme].admitted += 1;
    (owners[identity] ??= new Set()).add(scheme);
    rows.push([path, scheme, identity, admitted ? "1" : "0", rules.join(",")]);
  };
  for (const record of index.records) carrier(record.path, schemeOf(record.path), record.identity, true, []);
  for (const { path, findings } of index.refused) {
    for (const { rule, message } of findings) { increment(byRule, rule); increment(byMessage, message); }
    if (findings.some(({ message }) => message === STUB_MESSAGE)) stubs += 1;
    carrier(path, schemeOf(path), identityOf(path), false, [...new Set(findings.map(({ rule }) => rule))].sort());
  }
  rows.sort((left, right) => left[0].localeCompare(right[0]));
  const shared = Object.entries(owners).filter(([, schemeSet]) => schemeSet.size > 1).sort(([left], [right]) => left.localeCompare(right));
  const record = {
    schema: SCHEMA,
    date,
    carriers: index.records.length + index.refused.length,
    admitted: index.records.length,
    refused: index.refused.length,
    stubs,
    refusalsByRule: byCount(byRule),
    refusalsByMessage: byCount(byMessage),
    schemes: byKey(schemes),
    sharedIdentities: Object.fromEntries(shared.map(([identity, schemeSet]) => [identity, [...schemeSet].sort()])),
  };
  return { record, rows: [["path", "scheme", "identity", "admitted", "rules"], ...rows].map((row) => row.map(tsvCell)) };
}
