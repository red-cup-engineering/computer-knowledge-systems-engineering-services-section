/** @module reference-check Verifiable reference checking against bibliographic records. */

import {
  bareDoi,
  nameToString,
  normalizeTitle,
} from "@red-cup-engineering/csl-json-services-section";
import {
  fetchOpenLibraryBook,
  isValidIsbn,
  normalizeIsbn,
  searchOpenLibraryBooks,
} from "@red-cup-engineering/csl-json-services-section/open-library";
import { crossrefWorkToCsl } from "@red-cup-engineering/csl-json-services-section/scripts/project-crossref-work-csl.mjs";
import { readingOfSides } from "@red-cup-engineering/computer-data-engineering-services-section/four";
import { resolveDoi } from "../scripts/resolve-doi.mjs";
import { fetchOpenAlexWork } from "../scripts/fetch-openalex-work.mjs";
import { searchOpenAlexWorks } from "../scripts/search-openalex-works.mjs";
import { parseCitation } from "./citation-text.mjs";

const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/iu;
const ISBN_RE = /\b(?:ISBN(?:-1[03])?:?\s*)?((?:97[89][\s-]?)?\d[\d\s-]{7,}[\dX])\b/iu;
const RETRYABLE_ERROR_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"]);
const REQUEST_TIMEOUT_MS = 10_000;
// One paid answer is bounded as a whole, not per request: a reference check makes several
// sequential source reads per reference, so per-request bounds alone compose into minutes.
const ANSWER_BUDGET_MS = 25_000;
const MAX_RETRY_WAIT_MS = 2_000;
const RETRY_DELAY_MS = 50;
const truthReading = (positive, negative) => readingOfSides("truth", positive, negative);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function networkErrorCode(error) {
  const code = error?.code ?? error?.cause?.code;
  if (RETRYABLE_ERROR_CODES.has(code)) return code;
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "ETIMEDOUT";
  if (error instanceof TypeError) return "TypeError";
  return null;
}

function retryAfterMilliseconds(response) {
  const raw = response?.headers?.get?.("retry-after");
  if (raw === null || raw === undefined || String(raw).trim() === "") return RETRY_DELAY_MS;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : RETRY_DELAY_MS;
}

function unavailableError(error, source, code = networkErrorCode(error) ?? "source-unreachable") {
  const result = new Error(`${source} is unreachable: ${code}`, { cause: error });
  result.code = code;
  result.source = source;
  result.unreachable = true;
  return result;
}

/**
 * Apply the bibliography market's bounded retry and timeout policy to fetch. Every request made
 * through one policy shares its answer budget: a request starts only with budget left, waits for
 * at most what remains, and honors a source's Retry-After only when it is short and fits; past
 * that the source is unreachable for this answer, which the answer reports rather than awaits.
 */
export function reliableBibliographyFetch(fetchImpl, { timeoutMs = REQUEST_TIMEOUT_MS, budgetMs = ANSWER_BUDGET_MS, now = Date.now } = {}) {
  const until = now() + budgetMs;
  return async (input, init = {}) => {
    const source = String(input);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remaining = until - now();
      if (remaining <= 0) throw unavailableError(new Error("answer budget spent"), source, "ETIMEDOUT");
      const timeout = AbortSignal.timeout(Math.min(timeoutMs, remaining));
      const signal = init.signal === undefined ? timeout : AbortSignal.any([init.signal, timeout]);
      try {
        const response = await fetchImpl(input, { ...init, signal });
        const retryableStatus = response?.status === 429 || response?.status >= 500;
        if (!retryableStatus) return response;
        const wait = retryAfterMilliseconds(response);
        if (attempt === 0 && wait <= MAX_RETRY_WAIT_MS && wait < until - now()) {
          await delay(wait);
          continue;
        }
        throw unavailableError(new Error(`HTTP ${response.status}`), source, `HTTP_${response.status}`);
      } catch (error) {
        if (error?.unreachable) throw error;
        const code = networkErrorCode(error);
        if (code === null) throw error;
        if (attempt === 0) {
          await delay(RETRY_DELAY_MS);
          continue;
        }
        throw unavailableError(error, source, code);
      }
    }
    throw new Error("unreachable retry state");
  };
}

function personDisplay(name) {
  try { return nameToString(name); } catch { return ""; }
}

function politeUserAgent(mailto) {
  return mailto
    ? `bibliography-engineering-services-section (mailto:${mailto})`
    : "bibliography-engineering-services-section";
}

function familyFold(name) {
  if (!name || typeof name !== "object") return "";
  const raw = typeof name.family === "string" ? name.family : typeof name.literal === "string" ? name.literal.split(/[\s,]+/u).at(-1) : "";
  return normalizeTitle(raw);
}

function titleSimilarity(left, right) {
  const a = new Set(normalizeTitle(left).split(" ").filter(Boolean));
  const b = new Set(normalizeTitle(right).split(" ").filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/**
 * A retrieved record supports a supplied item only when their first-author
 * family names fold exactly alike and their folded titles are equal, have
 * Sørensen-Dice token similarity of at least 0.9, or one is an eight-or-more
 * token prefix of the other (a citation omitting a database subtitle).
 * Requiring the author plus a strong title relation keeps a title-only search
 * hit from becoming an invented match while tolerating punctuation,
 * diacritics, one minor token variation, and omitted subtitles.
 */
export function recordsCloselyMatch(given, record) {
  const givenAuthor = Array.isArray(given?.author) ? given.author[0] : undefined;
  const recordAuthor = Array.isArray(record?.author) ? record.author[0] : undefined;
  const authorsMatch = familyFold(givenAuthor) !== "" && familyFold(givenAuthor) === familyFold(recordAuthor);
  const left = normalizeTitle(given?.title);
  const right = normalizeTitle(record?.title);
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  const omittedSubtitle = shorter.split(" ").length >= 8 && longer.startsWith(`${shorter} `);
  return authorsMatch && left !== "" && (left === right || omittedSubtitle || titleSimilarity(left, right) >= 0.9);
}

function parseJsonItem(text) {
  if (!text.trimStart().startsWith("{")) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

function improveFreeFormItem(text, parsed) {
  const match = text.match(/^.+?\s+\(\d{4}\)\.\s*(.+?)([.!?])\s+(.+)$/u);
  const journalTail = match?.[3]?.match(/^(.+?),?\s+\d+\s*\([^)]+\)/u);
  if (!match || (parsed.style !== "free-form-source" && journalTail === null)) return parsed.item;
  const improved = { ...parsed.item, type: "article-journal", title: `${match[1].trim()}${match[2] === "." ? "" : match[2]}` };
  delete improved.publisher;
  improved["container-title"] = (journalTail?.[1] ?? match[3]).replace(/\.?\s*(?:doi:)?10\.\S+$/iu, "").trim();
  return Object.freeze(improved);
}

function itemFromReference(reference) {
  if (reference && typeof reference === "object" && !Array.isArray(reference)) return Object.freeze({ ...reference });
  if (typeof reference !== "string" || reference.trim() === "") return null;
  const jsonItem = parseJsonItem(reference);
  if (jsonItem) return Object.freeze(jsonItem);
  const parsed = parseCitation(reference).find((result) => result.ok);
  return parsed ? improveFreeFormItem(reference, parsed) : Object.freeze({ type: "document", title: reference.trim() });
}

function identifierFrom(reference, item) {
  const doi = bareDoi(item?.DOI) ?? (typeof reference === "string" ? bareDoi(reference.match(DOI_RE)?.[0]) : undefined);
  if (doi) return Object.freeze({ type: "DOI", value: doi, via: "CrossRef" });
  const candidate = normalizeIsbn(item?.ISBN ?? (typeof reference === "string" ? reference.match(ISBN_RE)?.[1] : ""));
  if (candidate && isValidIsbn(candidate)) return Object.freeze({ type: "ISBN", value: candidate, via: "Open Library" });
  return null;
}

const isNotFound = (error) => /HTTP 404/u.test(String(error?.message));

function unreachableSource(source, url, error) {
  return Object.freeze({ source, url: error.source ?? url, status: "unreachable", error: error.code ?? "source-unreachable" });
}

async function observeSource(source, url, operation) {
  try {
    return { value: await operation(), unreachable: null };
  } catch (error) {
    if (!error?.unreachable) throw error;
    return { value: null, unreachable: unreachableSource(source, url, error) };
  }
}

async function checkIdentifier(item, identifier, options) {
  const observations = [];
  const unreachable = [];
  if (identifier.type === "ISBN") {
    const source = `https://openlibrary.org/isbn/${encodeURIComponent(identifier.value)}.json`;
    const result = await observeSource("Open Library", source, () => fetchOpenLibraryBook(identifier.value, options));
    if (result.unreachable) unreachable.push(result.unreachable);
    const found = result.value;
    if (found) observations.push({ record: found.record, source: "Open Library", sources: found.sources, supports: recordsCloselyMatch(item, found.record) });
    return { observations, attempted: [source], attemptedSources: ["Open Library"], unreachable };
  }

  const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(identifier.value)}`;
  const openAlexUrl = `https://api.openalex.org/works/doi:${identifier.value}`;
  try {
    const result = await observeSource("CrossRef", crossrefUrl, () => resolveDoi(identifier.value, options));
    if (result.unreachable) unreachable.push(result.unreachable);
    if (result.value) observations.push({ record: result.value, source: "CrossRef", sources: [crossrefUrl], supports: recordsCloselyMatch(item, result.value) });
  } catch (error) { if (!isNotFound(error)) throw error; }
  try {
    const result = await observeSource("OpenAlex", openAlexUrl, () => fetchOpenAlexWork(identifier.value, options));
    if (result.unreachable) unreachable.push(result.unreachable);
    if (result.value) observations.push({ record: result.value, source: "OpenAlex", sources: [openAlexUrl], supports: recordsCloselyMatch(item, result.value) });
  } catch (error) { if (!isNotFound(error)) throw error; }
  return { observations, attempted: [crossrefUrl, openAlexUrl], attemptedSources: ["CrossRef", "OpenAlex"], unreachable };
}

function crossrefSearchUrl(item, author, mailto) {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query.bibliographic", item.title.trim());
  if (author.trim() !== "") url.searchParams.set("query.author", author.trim());
  url.searchParams.set("rows", "5");
  if (mailto) url.searchParams.set("mailto", mailto);
  return url;
}

async function searchCrossRefWorks(url, options) {
  const response = await options.fetchImpl(url, { headers: { "User-Agent": politeUserAgent(options.mailto) } });
  if (!response.ok) throw new Error(`CrossRef search failed: HTTP ${response.status}`);
  const body = await response.json();
  if (!body || !Array.isArray(body.message?.items)) throw new Error("CrossRef search: malformed response (missing items array)");
  return { items: body.message.items.map(crossrefWorkToCsl), source: url.toString() };
}

function sourceObservations(item, source, result) {
  if (!result) return [];
  const matches = result.items.filter((record) => recordsCloselyMatch(item, record));
  if (matches.length > 0) return matches.map((record) => ({ record, source, sources: [result.source], supports: true }));
  // A search hit refutes only when it is the same work credited otherwise; an unrelated hit is no evidence.
  const title = normalizeTitle(item.title);
  const sameWork = result.items.find((record) => title !== "" && titleSimilarity(title, normalizeTitle(record.title)) >= 0.9);
  return sameWork ? [{ record: sameWork, source, sources: [result.source], supports: false }] : [];
}

async function checkSearch(item, options) {
  const author = Array.isArray(item.author) ? personDisplay(item.author[0]) : "";
  const query = [item.title, author].filter(Boolean).join(" ");
  if (!item.title || query === "") return { observations: [], attempted: [], attemptedSources: [], unreachable: [] };
  const openAlexUrl = new URL("https://api.openalex.org/works");
  openAlexUrl.searchParams.set("search", query);
  openAlexUrl.searchParams.set("per_page", "5");
  if (options.mailto) openAlexUrl.searchParams.set("mailto", options.mailto);
  const crossrefUrl = crossrefSearchUrl(item, author, options.mailto);
  const openLibraryUrl = new URL("https://openlibrary.org/search.json");
  // Open Library matches author names whole, so initials such as "E. J." miss; search by family name.
  const openLibraryAuthor = (Array.isArray(item.author) ? item.author[0]?.family : undefined) ?? author;
  openLibraryUrl.searchParams.set("title", item.title.trim());
  if (openLibraryAuthor.trim() !== "") openLibraryUrl.searchParams.set("author", openLibraryAuthor.trim());
  openLibraryUrl.searchParams.set("limit", "5");
  openLibraryUrl.searchParams.set("fields", "key,title,author_name,first_publish_year,isbn,publisher,number_of_pages_median");
  const observations = [];
  const unreachable = [];
  const [openAlexResult, crossrefResult] = await Promise.all([
    observeSource("OpenAlex", openAlexUrl.toString(), async () => {
      const result = await searchOpenAlexWorks(query, { ...options, perPage: 5 });
      return { ...result, source: openAlexUrl.toString() };
    }),
    observeSource("CrossRef", crossrefUrl.toString(), () => searchCrossRefWorks(crossrefUrl, options)),
  ]);
  if (openAlexResult.unreachable) unreachable.push(openAlexResult.unreachable);
  if (crossrefResult.unreachable) unreachable.push(crossrefResult.unreachable);
  observations.push(...sourceObservations(item, "OpenAlex", openAlexResult.value));
  observations.push(...sourceObservations(item, "CrossRef", crossrefResult.value));
  let openLibraryResult = await observeSource("Open Library", openLibraryUrl.toString(), () => searchOpenLibraryBooks(item.title, openLibraryAuthor, { fetchImpl: options.fetchImpl, limit: 5 }));
  // Nothing under the given author: search the title alone, so a real book credited to the wrong author is refuted, not missed.
  if (openLibraryResult.value?.items.length === 0 && openLibraryAuthor.trim() !== "") {
    openLibraryResult = await observeSource("Open Library", openLibraryUrl.toString(), () => searchOpenLibraryBooks(item.title, "", { fetchImpl: options.fetchImpl, limit: 5 }));
  }
  if (openLibraryResult.unreachable) unreachable.push(openLibraryResult.unreachable);
  observations.push(...sourceObservations(item, "Open Library", openLibraryResult.value));
  return { observations, attempted: [openAlexUrl.toString(), crossrefUrl.toString(), openLibraryUrl.toString()], attemptedSources: ["OpenAlex", "CrossRef", "Open Library"], unreachable };
}

async function checkOne(reference, options) {
  const item = itemFromReference(reference);
  if (item === null) return Object.freeze({ input: reference, item: null, identifier: null, matched: null, read: truthReading(false, false), evidence: Object.freeze([]) });
  const identifier = identifierFrom(reference, item);
  const { observations, attempted, attemptedSources, unreachable } = identifier ? await checkIdentifier(item, identifier, options) : await checkSearch(item, options);
  const positive = observations.some((entry) => entry.supports);
  const negative = observations.some((entry) => !entry.supports);
  const matched = observations.find((entry) => entry.supports)?.record ?? observations[0]?.record ?? null;
  const evidence = [...new Set([...attempted, ...observations.flatMap((entry) => entry.sources)])];
  const searchIdentifier = identifier ?? Object.freeze({ type: "title-and-author", value: [item.title, personDisplay(item.author?.[0])].filter(Boolean).join(" | "), via: "OpenAlex and CrossRef, then Open Library" });
  const allUnreachable = attemptedSources.length > 0 && attemptedSources.every((source) => unreachable.some((entry) => entry.source === source));
  const matchedSources = observations
    .filter((entry) => entry.supports)
    .flatMap((entry) => entry.sources.map((url) => ({ source: entry.source, url, status: "matched" })));
  const sources = [...unreachable, ...matchedSources].filter((entry, index, entries) => entries.findIndex((candidate) => candidate.source === entry.source && candidate.url === entry.url && candidate.status === entry.status) === index);
  return Object.freeze({
    input: reference,
    item,
    identifier: searchIdentifier,
    matched,
    read: truthReading(positive, negative),
    evidence: Object.freeze(evidence),
    ...(sources.length > 0 ? { sources: Object.freeze(sources.map(Object.freeze)) } : {}),
    ...(allUnreachable ? { note: "All bibliographic sources were unreachable; this reference was not checked." } : {}),
  });
}

/** Check one to 25 string or CSL-JSON references against real record sources. */
export async function referenceCheck(body, { fetchImpl = fetch, mailto, timeoutMs = REQUEST_TIMEOUT_MS, budgetMs = ANSWER_BUDGET_MS } = {}) {
  if (!body || !Array.isArray(body.references)) throw new TypeError("referenceCheck requires a references array");
  if (body.references.length > 25) throw new RangeError("referenceCheck accepts at most 25 references");
  const reliableFetch = reliableBibliographyFetch(fetchImpl, { timeoutMs, budgetMs });
  return Object.freeze({ results: Object.freeze(await Promise.all(body.references.map((reference) => checkOne(reference, { fetchImpl: reliableFetch, mailto })))) });
}
