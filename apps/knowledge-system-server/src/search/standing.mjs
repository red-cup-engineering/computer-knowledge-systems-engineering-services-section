/**
 * Pure term-intension settlement over already-collected evidence.
 *
 * Host readers supply occurrences. This module normalizes the queried token,
 * turns occurrences into an FCA context, closes the matched extent, and projects
 * per-register lens status without opening files or processes.
 */
import {
  closeExtent,
  finiteFcaContext,
  intentOfExtent,

} from "@red-cup-engineering/metrologic/articulation/predicating/positing/settling/analysis/fca-lambek-circle";

const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/gu;
const WORD_PATTERN = /[a-z0-9][a-z0-9_-]*/giu;
const LENSES = Object.freeze([
  "physical/material",
  "computing/term",
  "semiotic/intensional",
  "ludic/game",
]);

function uniqueSorted(values) {
  return Object.freeze([...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)));
}

function wordsOf(value) {
  const expanded = value.replace(CAMEL_BOUNDARY, "$1 $2").toLowerCase();
  return uniqueSorted([...expanded.matchAll(WORD_PATTERN)].map((match) => match[0].replace(/^_+|_+$/gu, "")));
}

function upperFirst(value) {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

export function normalizeTermQuery(query) {
  const phrase = query.trim().replace(/\s+/gu, " ");
  if (phrase.length === 0) throw new TypeError("normalizeTermQuery: query must be nonempty");
  const tokens = wordsOf(phrase);
  if (tokens.length === 0) throw new TypeError("normalizeTermQuery: query must contain a token");
  const lower = phrase.toLowerCase();
  const kebab = tokens.join("-");
  const snake = tokens.join("_");
  const camel = `${tokens[0]}${tokens.slice(1).map(upperFirst).join("")}`;
  const pascal = tokens.map(upperFirst).join("");
  const variants = uniqueSorted([
    phrase,
    lower,
    tokens.join(" "),
    kebab,
    snake,
    camel,
    pascal,
  ].map((value) => value.toLowerCase()));
  return Object.freeze({ phrase, lower, tokens, kebab, snake, camel, pascal, variants });
}

export function textMatchesTermIntension(value, normalized) {
  const lower = value.replace(CAMEL_BOUNDARY, "$1 $2").toLowerCase();
  if (normalized.variants.some((variant) => lower.includes(variant))) return true;
  const hayTerms = new Set(wordsOf(value));
  return normalized.tokens.every((token) => hayTerms.has(token));
}

export function exactTermIntensionMatch(value, normalized) {
  const lower = value.replace(CAMEL_BOUNDARY, "$1 $2").toLowerCase().trim();
  return normalized.variants.includes(lower) || normalized.variants.includes(value.trim().toLowerCase());
}

export function occurrenceFcaCells(occurrences) {
  const cells = [];
  for (const occurrence of occurrences) {
    const attributes = uniqueSorted([
      `source:${occurrence.source}`,
      `grade:${occurrence.grade}`,
      ...occurrence.lenses.map((lens) => `lens:${lens}`),
      ...occurrence.matchedFields.map((field) => `field:${field}`),
      ...occurrence.attributes,
    ]);
    for (const predicate of attributes) cells.push(Object.freeze({ subject: occurrence.id, predicate }));
  }
  return Object.freeze(cells);
}

function lensReading(lens, occurrences) {
  const matching = occurrences.filter((occurrence) => occurrence.lenses.includes(lens));
  const strong = matching.filter((occurrence) => occurrence.grade === "strong").length;
  const medium = matching.filter((occurrence) => occurrence.grade === "medium").length;
  const weak = matching.filter((occurrence) => occurrence.grade === "weak").length;
  const earnedAnchors = uniqueSorted(matching
    .filter((occurrence) => occurrence.grade !== "weak")
    .flatMap((occurrence) => [occurrence.symbol, occurrence.declaration, occurrence.path].filter((value) => value !== undefined)));
  const status = strong > 0 ? "earned" : medium > 0 ? "candidate" : weak > 0 ? "thin" : "absent";
  const missing = status === "earned"
    ? Object.freeze([])
    : Object.freeze([`missing:${lens}:strong-typed-anchor`]);
  return Object.freeze({ lens, strong, medium, weak, earnedAnchors, missing, status });
}

function readoutStatus(
  occurrences,
  lenses,
  anchors,
) {
  if (occurrences.length === 0 && anchors.length === 0) return "open";
  const strong = occurrences.filter((occurrence) => occurrence.grade === "strong").length + anchors.length;
  const medium = occurrences.filter((occurrence) => occurrence.grade === "medium").length;
  const earnedLenses = lenses.filter((lens) => lens.status === "earned").length;
  if (earnedLenses > 1) return "polysemous";
  if (strong > 0) return "anchored";
  if (medium > 0) return "open";
  const onlyBodyOrPathCorpus = occurrences.length > 0 && occurrences.every((occurrence) =>
    occurrence.source === "path-corpus" || occurrence.matchedFields.every((field) => field === "body" || field === "excerpt"));
  return onlyBodyOrPathCorpus ? "connotation" : "thin";
}

function contextInjectionOf(readout) {
  const anchors = readout.anchors.map((anchor) => anchor.target).slice(0, 4);
  const lenses = readout.lenses.filter((lens) => lens.status !== "absent")
    .map((lens) => `${lens.lens}:${lens.status}`)
    .join(", ");
  const intent = readout.intent.filter((entry) => !entry.startsWith("field:") && !entry.startsWith("grade:")).slice(0, 8);
  return [
    `term-intension ${JSON.stringify(readout.query)} => ${readout.status}`,
    anchors.length === 0 ? "anchors: none" : `anchors: ${anchors.join(", ")}`,
    lenses.length === 0 ? "lenses: none" : `lenses: ${lenses}`,
    intent.length === 0 ? "intent: none" : `intent: ${intent.join(", ")}`,
    `occurrences: ${readout.occurrences.length}`,
  ].join("\n");
}

function occurrenceAnchorTarget(occurrence) {
  return occurrence.declaration ?? occurrence.symbol ?? occurrence.path ?? occurrence.module ?? occurrence.id;
}

function occurrenceEarnsAnchor(occurrence) {
  if (occurrence.grade !== "strong") return false;
  return occurrence.matchedFields.some((field) => field !== "body" && field !== "excerpt");
}

function anchorsOfOccurrences(term, occurrences) {
  const anchors = new Map();
  for (const occurrence of occurrences) {
    if (!occurrenceEarnsAnchor(occurrence)) continue;
    const target = occurrenceAnchorTarget(occurrence);
    const key = `${occurrence.source}:${target}`;
    if (anchors.has(key)) continue;
    anchors.set(key, Object.freeze({
      term,
      source: occurrence.source === "concept-resolution" ? "concept-resolution" : "strong-match",
      target,
      evidence: Object.freeze([
        `occurrence:${occurrence.id}`,
        `source:${occurrence.source}`,
        `matched:${occurrence.matchedFields.join(",")}`,
      ]),
    }));
  }
  return Object.freeze([...anchors.values()].sort((left, right) => left.target.localeCompare(right.target)));
}

export function deriveTermIntensionReadout(input) {
  const normalized = normalizeTermQuery(input.query);
  const occurrences = Object.freeze([...input.occurrences].sort((left, right) => left.id.localeCompare(right.id)));
  const anchors = Object.freeze([
    ...(input.anchors ?? []),
    ...anchorsOfOccurrences(normalized.phrase, occurrences),
  ].sort((left, right) => left.target.localeCompare(right.target)));
  const cells = occurrenceFcaCells(occurrences);
  const extent = Object.freeze(occurrences.map((occurrence) => occurrence.id));
  let intent = Object.freeze([]);
  let closedExtent = extent;
  if (cells.length > 0 && extent.length > 0) {
    const context = finiteFcaContext(cells);
    intent = intentOfExtent(context, extent);
    closedExtent = closeExtent(context, extent);
  }
  const lenses = Object.freeze(LENSES.map((lens) => lensReading(lens, occurrences)));
  const status = readoutStatus(occurrences, lenses, anchors);
  const open = uniqueSorted([
    ...(input.open ?? []),
    ...(status === "connotation" ? ["term-intension:only weak evidence; no anchor settled"] : []),
    ...lenses.flatMap((lens) => lens.missing),
  ]);
  const withoutContext = Object.freeze({
    kind: "metroplat.term-intension.readout",
    query: input.query,
    normalized,
    extent,
    intent,
    closedExtent,
    occurrences,
    lenses,
    anchors,
    open,
    status,
    evidence: Object.freeze([
      `occurrences:${occurrences.length}`,
      `cells:${cells.length}`,
      `anchors:${anchors.length}`,
      "closure:fca",
    ]),
  });
  return Object.freeze({
    ...withoutContext,
    contextInjection: contextInjectionOf(withoutContext),
  });
}
