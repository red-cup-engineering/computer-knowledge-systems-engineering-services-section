import { cslDate, nameFromString } from "@red-cup-engineering/csl-json-services-section";
import { fromCslItem, makeCitekey } from "@red-cup-engineering/csl-json-services-section/record-formatting";
import { admitReferenceEntry } from "../schemas/bibliography/reference-entry.schema.mjs";

// Free-form bibliography line -> CSL-JSON -> house reference entry.
//
// Given text like
//   Fitting, Melvin (1991). "Bilattices and the Semantics of Logic
//   Programming." *Journal of Logic Programming* 11(2), 91-116.
// this mints a citekey, produces a CSL-JSON entry, and converts it to a
// house depth-1 reference entry ready to drop into a carrier's
// `references:` map. Ported from the legacy csl-in-yaml toolkit's
// `parse-citation.mjs`, re-targeted at the house reference-entry codec.
//
// The engine is a landmark scanner + a first-match style table. Each style
// cheaply classifies the shape from tagged spans, then extracts fields. It
// is a best-effort parser: styles carry a confidence (high/medium/low) so
// callers can keep only unambiguous parses.

// ----- citekey minting -----

const surnameToken = (name) => {
  const source = typeof name === "string" ? name : (name.family ?? name.literal ?? "");
  const head = String(source).split(",")[0];
  return head
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
};

/**
 * Compose a citekey from name objects/strings and a year, disambiguating
 * against a set of taken keys with a trailing letter (surnameYYYY,
 * surnameYYYYa, ...). Multi-author works use the first author's surname.
 * Shared with the CSL-JSON section's `fromCslItem`, which mints a
 * citekey for CSL items whose `id` is not already a house citekey (a bare
 * DOI, an OpenAlex id, a URL, ...).
 *
 * @param {Array<(string|{family?: string, literal?: string})>} names
 * @param {(number|string)} year
 * @param {Set<string>} [taken]
 * @returns {string} the minted citekey.
 * @throws {Error} when every single-letter suffix of the base is already taken.
 */
// ----- name/author-blob helpers -----

const givenFirstToSurnameFirst = (name) => {
  const trimmed = name.trim();
  if (trimmed.includes(",")) return trimmed;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return trimmed;
  const surname = parts.pop();
  return `${surname}, ${parts.join(" ")}`;
};

const parseAuthors = (blob) => {
  const clean = blob.replace(/[,\s]+$/, "").trim().replace(/\s+&\s+/g, " and ");
  const lastAndMatch = clean.match(/^(.*?),?\s+and\s+(.+)$/);
  let head = clean;
  let lastAuthor = null;
  if (lastAndMatch) { head = lastAndMatch[1]; lastAuthor = lastAndMatch[2]; }
  const tokens = head.split(/,\s*/).filter((t) => t.length > 0);
  const authors = [];
  if (tokens.length >= 2) {
    authors.push(`${tokens[0]}, ${tokens[1]}`);
    for (let i = 2; i < tokens.length; i++) authors.push(givenFirstToSurnameFirst(tokens[i]));
  } else if (tokens.length === 1) {
    authors.push(tokens[0]);
  }
  if (lastAuthor) authors.push(givenFirstToSurnameFirst(lastAuthor));
  return authors;
};

const stripWrappingPunctuation = (s) => s.replace(/^[\s.,;:]+|[\s.,;:]+$/g, "");

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

/**
 * @param {string} entryConfidence
 * @param {string} minConfidence
 * @returns {boolean} whether `entryConfidence` meets or exceeds `minConfidence`.
 */
export const passesConfidence = (entryConfidence, minConfidence) => CONFIDENCE_RANK[entryConfidence] >= CONFIDENCE_RANK[minConfidence];

// ----- landmark scanner -----

const collectMatches = (text, re, mapper) => {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(mapper(m));
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
};

const scanLandmarks = (text) => {
  const years = collectMatches(text, /\((\d{4}[a-z]?)(?:\s*\[(\d{4}[a-z]?)\])?\)/g, (m) => ({
    start: m.index, end: m.index + m[0].length, raw: m[0], value: m[1], bracketed: m[2] ?? null,
  }));
  const yearPlaceholders = collectMatches(text, /\((current|latest|n\.d\.|forthcoming|in press)\)/gi, (m) => ({
    start: m.index, end: m.index + m[0].length, raw: m[0], value: m[1].toLowerCase(),
  }));
  const quotedTitles = collectMatches(text, /"([^"]+?)\.?"|"([^"]+?)\.?"/g, (m) => ({
    start: m.index, end: m.index + m[0].length, raw: m[0], value: (m[1] ?? m[2]).trim(),
  }));
  const italicSpans = collectMatches(text, /\*([^*\n]+?)\*|_([^_\n]+?)_/g, (m) => ({
    start: m.index, end: m.index + m[0].length, raw: m[0], value: (m[1] ?? m[2]).trim(),
  }));
  const urls = collectMatches(text, /https?:\/\/[^\s)"'<>]+/g, (m) => ({
    start: m.index, end: m.index + m[0].length, raw: m[0], value: m[0],
  }));
  const dois = collectMatches(text, /10\.\d{4,9}\/[^\s)"'<>]+/g, (m) => ({
    start: m.index, end: m.index + m[0].length, raw: m[0], value: m[0],
  }));
  const arxivIds = collectMatches(text, /arXiv:(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)/gi, (m) => ({
    start: m.index, end: m.index + m[0].length, raw: m[0], value: m[1],
  }));
  const isbns = collectMatches(text, /\bISBN[\s-]?:?\s*((?:97[89][-\s]?)?\d{1,5}[-\s]?\d{1,7}[-\s]?\d{1,7}[-\s]?[\dX])\b/gi, (m) => ({
    start: m.index, end: m.index + m[0].length, raw: m[0], value: m[1].replace(/[-\s]/g, ""),
  }));
  const standardsMarkers = [];
  for (const [kind, re] of [
    ["rfc", /\bRFC\s+(\d+)\b/g], ["bcp", /\bBCP\s+(\d+)\b/g],
    ["ieee", /\bIEEE\s+Std\s+([\d.\-:]+)/g], ["iso", /\bISO[\s/]+(\d+(?::\d+)?)\b/g],
    ["whatwg", /\bWHATWG\b/g], ["w3c", /\bW3C\b/g], ["ietf", /\bIETF\b/g],
  ]) {
    for (const m of collectMatches(text, re, (mm) => mm)) {
      standardsMarkers.push({ kind, start: m.index, end: m.index + m[0].length, raw: m[0], value: m[1] ?? null });
    }
  }
  standardsMarkers.sort((a, b) => a.start - b.start);
  const editorMarkers = collectMatches(text, /\(eds?\.\)|edited\s+by/gi, (m) => ({
    start: m.index, end: m.index + m[0].length, raw: m[0],
  }));
  return { years, yearPlaceholders, quotedTitles, italicSpans, urls, dois, arxivIds, isbns, standardsMarkers, editorMarkers };
};

// ----- pre-processing: annotation trim + semicolon split -----

const findAnnotationBoundary = (text) => {
  let italicOpen = false, quoteOpen = false, lastBoundary = -1;
  for (let i = 0; i < text.length - 2; i++) {
    const c = text[i];
    if (c === "*" && !quoteOpen) { italicOpen = !italicOpen; continue; }
    if ((c === '"' || c === "“" || c === "”") && !italicOpen) { quoteOpen = !quoteOpen; continue; }
    if (italicOpen || quoteOpen) continue;
    if (c === " " && (text[i + 1] === "—" || text[i + 1] === "–") && text[i + 2] === " ") { lastBoundary = i; continue; }
    if (c === " " && text[i + 1] === "-" && text[i + 2] === "-" && text[i + 3] === " ") { lastBoundary = i; continue; }
  }
  return lastBoundary;
};

const splitTopLevel = (text, delimiter) => {
  const parts = [];
  let current = "", parenDepth = 0, bracketDepth = 0, italicOpen = false, quoteOpen = false;
  for (const c of text) {
    if (c === "(") parenDepth++;
    else if (c === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (c === "[") bracketDepth++;
    else if (c === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (c === "*" && !quoteOpen) italicOpen = !italicOpen;
    else if ((c === '"' || c === "“" || c === "”") && !italicOpen) quoteOpen = !quoteOpen;
    if (c === delimiter && parenDepth === 0 && bracketDepth === 0 && !italicOpen && !quoteOpen) {
      parts.push(current); current = ""; continue;
    }
    current += c;
  }
  if (current.length > 0) parts.push(current);
  return parts;
};

const preprocessEntry = (raw) => {
  let citation = raw, annotation = null;
  const boundary = findAnnotationBoundary(raw);
  if (boundary >= 0) {
    const trailer = raw.slice(boundary + 3).trim();
    if (!/\(\d{4}[a-z]?\)/.test(trailer)) {
      citation = raw.slice(0, boundary).trim();
      annotation = trailer.replace(/\.\s*$/, "");
    }
  }
  const fragments = splitTopLevel(citation, ";").map((s) => s.trim()).filter((s) => s.length > 0);
  return { fragments, annotation };
};

// ----- Author-Year prefix extractor -----

const YEAR_PAREN_RE = /\(((?:\d{4}[a-z]?)(?:\s*\[\d{4}[a-z]?\]|\s*[-–—]\s*(?:\d{4}[a-z]?|present|current|now)|(?:,\s*\d{4}[a-z]?)+)?)\)/;

const extractAuthorYearTitle = (text) => {
  const yearMatch = text.match(new RegExp(`^(.+?)\\s+${YEAR_PAREN_RE.source}\\.\\s*(.+?)\\s*$`));
  if (!yearMatch) return null;
  const [, authorsBlob, yearBlob, rest] = yearMatch;
  const authors = parseAuthors(authorsBlob);
  if (authors.length === 0) return null;
  const yearDigits = yearBlob.match(/\d{4}/);
  if (!yearDigits) return null;
  const year = Number.parseInt(yearDigits[0], 10);
  const yearLetterMatch = yearBlob.match(/^\d{4}([a-z])/);
  const yearSuffix = yearLetterMatch ? yearLetterMatch[1] : "";

  const quoted = rest.match(/^"([^"]+?)\.?"\s*\.?\s*(.*)$/);
  const italic = rest.match(/^\*([^*]+?)\*\.?\s*\.?\s*(.*)$/);
  let title, container, titleStyle;
  if (quoted) { title = quoted[1].trim(); container = quoted[2].trim(); titleStyle = "quoted"; }
  else if (italic) { title = italic[1].trim(); container = italic[2].trim(); titleStyle = "italic"; }
  else return null;

  const pagesMatch = container.match(/(?:,\s*|^pp?\.\s*)(\d+(?:[–—-]\d+)?)\s*\.?\s*$/);
  let pages = null;
  if (pagesMatch) {
    pages = pagesMatch[1].replace(/[–—]/g, "-");
    container = container.slice(0, pagesMatch.index).replace(/[,.\s]+$/, "").trim();
  }
  return { authors, year, yearSuffix, yearBlob, title, titleStyle, container, pages };
};

const baseEntryFromPrefix = (prefix, extras = {}) => {
  const entry = { authors: prefix.authors, year: prefix.year, title: prefix.title, ...extras };
  if (prefix.pages) entry.pages = prefix.pages;
  return entry;
};

// ----- style table (produces the intermediate bespoke shape) -----

// ----- APA 7 / Chicago author-date journal-article and APA book shapes -----
//
// Unlike the styles above (which key off Markdown quote/italic decoration
// via `prefix`), these three key off plain punctuation conventions of two
// common pasted reference-list formats, so a citation pasted straight out
// of a paper's bibliography (no Markdown) still splits cleanly into title,
// container, volume, issue, and page fields instead of falling through to
// `free-form-source`'s single undifferentiated title blob.

const APA_AUTHORS_YEAR_RE = /^(.+?)\s+\((\d{4})\)\.\s*(.+)$/;
const CHICAGO_AUTHOR_DATE_RE = /^(.+?)\.\s+(\d{4})\.\s+"([^"]+?)\.?"\s+(.+)$/;

// APA-style "Surname, I., & Surname, I." / "Surname, I., Surname, I., & Surname, I."
// author list -> ["Surname, I.", ...] (every author, including the first, is
// itself a "Surname, Initial" pair — unlike the Chicago "Surname, First, and
// First Surname" convention `parseAuthors` above already handles).
const parseApaAuthorList = (blob) => {
  const normalized = blob.replace(/\s+&\s+/g, ", and ").replace(/,?\s+and\s+/g, ", ");
  const tokens = normalized.split(/,\s*/).map((t) => t.trim()).filter((t) => t.length > 0);
  const authors = [];
  for (let i = 0; i < tokens.length; i += 2) {
    authors.push(i + 1 < tokens.length ? `${tokens[i]}, ${tokens[i + 1]}` : tokens[i]);
  }
  return authors;
};

// Split an APA journal-article tail ("Title. Journal, vol(issue), pages.")
// on its "Journal, vol(issue), pages" landmark, working outward from that
// landmark rather than guessing where the title ends.
const splitApaJournalTail = (remainder) => {
  const landmark = remainder.match(/,\s*(\d+)\s*\((\d+(?:[-–—]\d+)?)\)\s*,\s*(\d+(?:[-–—]\d+)?)/);
  if (!landmark) return null;
  const before = remainder.slice(0, landmark.index);
  const lastPeriod = before.lastIndexOf(". ");
  if (lastPeriod === -1) return null;
  const title = before.slice(0, lastPeriod).trim();
  const journal = before.slice(lastPeriod + 2).replace(/\.$/, "").trim();
  if (!title || !journal) return null;
  return { title, journal, volume: Number.parseInt(landmark[1], 10), issue: landmark[2], pages: landmark[3].replace(/[–—]/g, "-") };
};

// Split a Chicago author-date tail ("Journal vol (issue): pages") on its
// "vol (issue): pages" landmark; everything before it is the journal name.
const splitChicagoJournalTail = (text) => {
  const m = text.match(/^(.*?)\s+(\d+)\s*\((\d+(?:[-–—]\d+)?)\)\s*:\s*(\d+(?:[-–—]\d+)?)/);
  if (!m) return null;
  const journal = m[1].trim();
  if (!journal) return null;
  return { journal, volume: Number.parseInt(m[2], 10), issue: m[3], pages: m[4].replace(/[–—]/g, "-") };
};

// Split an APA book tail ("Title. Publisher.") on its last sentence boundary.
const splitApaBookTail = (remainder) => {
  const cleaned = remainder.trim().replace(/\.\s*$/, "");
  const lastPeriod = cleaned.lastIndexOf(". ");
  if (lastPeriod === -1) return null;
  const title = cleaned.slice(0, lastPeriod).trim();
  const publisher = cleaned.slice(lastPeriod + 2).trim();
  if (!title || !publisher) return null;
  return { title, publisher };
};


const STYLES = [
  { name: "arxiv-preprint", targetClass: "preprint", confidence: "high",
    classify: ({ prefix }) => prefix && /arXiv:/i.test(prefix.container),
    extract: ({ prefix }) => {
      const m = prefix.container.match(/arXiv:(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7}(?:v\d+)?)/i);
      if (!m) return null;
      return baseEntryFromPrefix(prefix, { repository: "arXiv", note: m[0] });
    } },
  { name: "rfc", targetClass: "report", confidence: "high",
    classify: ({ prefix, landmarks }) => prefix && landmarks.standardsMarkers.some((s) => s.kind === "rfc"),
    extract: ({ prefix, landmarks }) => {
      const rfc = landmarks.standardsMarkers.find((s) => s.kind === "rfc");
      const bcp = landmarks.standardsMarkers.find((s) => s.kind === "bcp");
      const extras = { institution: "IETF", series: `RFC ${rfc.value}` };
      if (bcp) extras.note = `BCP ${bcp.value}`;
      return baseEntryFromPrefix(prefix, extras);
    } },
  { name: "chapter", targetClass: "chapter", confidence: "high",
    classify: ({ prefix }) => prefix && /^In\s+\*/.test(prefix.container),
    extract: ({ prefix }) => {
      const m = prefix.container.match(/^In\s+\*([^*]+)\*\s*,?\s*(.*)$/);
      if (!m) return null;
      const entry = baseEntryFromPrefix(prefix, { in: m[1].trim() });
      const tail = m[2].trim().replace(/[.\s]+$/, "");
      if (tail) {
        const editorsMatch = tail.match(/^(.+?)\s*\(eds?\.\),?\s*(.*)$/);
        if (editorsMatch) {
          entry.editors = parseAuthors(editorsMatch[1]);
          const rest = editorsMatch[2].trim().replace(/[.,\s]+$/, "");
          if (rest) {
            const [pub, ...locParts] = rest.split(/,\s*/);
            if (pub) entry.publisher = stripWrappingPunctuation(pub);
            if (locParts.length > 0) entry.location = stripWrappingPunctuation(locParts.join(", "));
          }
        } else {
          const [pub, ...locParts] = tail.split(/,\s*/);
          if (pub) entry.publisher = stripWrappingPunctuation(pub);
          if (locParts.length > 0) entry.location = stripWrappingPunctuation(locParts.join(", "));
        }
      }
      return entry;
    } },
  { name: "iso-standard-author", targetClass: "report", confidence: "high",
    classify: ({ prefix, landmarks }) => prefix && landmarks.standardsMarkers.some((s) => s.kind === "iso"),
    extract: ({ prefix, landmarks }) => {
      const iso = landmarks.standardsMarkers.find((s) => s.kind === "iso");
      return baseEntryFromPrefix(prefix, { institution: "ISO", series: `ISO ${iso.value}` });
    } },
  { name: "journal-article", targetClass: "article", confidence: "high",
    classify: ({ prefix }) => prefix && /^\*[^*]+\*\s*,?\s*\d+/.test(prefix.container),
    extract: ({ prefix }) => {
      const m = prefix.container.match(/^\*([^*]+)\*\s*,?\s*(\d+)?(?:\s*\((\d+(?:[-–]\d+)?)\))?/);
      if (!m || !m[2]) return null;
      const entry = baseEntryFromPrefix(prefix, { journal: m[1].trim(), volume: Number.parseInt(m[2], 10) });
      if (m[3]) entry.issue = m[3].replace(/[–]/g, "-");
      return entry;
    } },
  { name: "journal-article-no-volume", targetClass: "article", confidence: "medium",
    classify: ({ prefix }) => prefix && prefix.titleStyle === "quoted" && /^\*[^*]+\*\.?\s*$|^\*[^*]+\*\s*[.,]/.test(prefix.container),
    extract: ({ prefix }) => {
      const m = prefix.container.match(/^\*([^*]+)\*/);
      if (!m) return null;
      return baseEntryFromPrefix(prefix, { journal: m[1].trim() });
    } },
  { name: "italic-title-book", targetClass: "book", confidence: "high",
    classify: ({ prefix }) => prefix && prefix.titleStyle === "italic",
    extract: ({ prefix }) => {
      const entry = baseEntryFromPrefix(prefix);
      const cleanContainer = prefix.container.replace(/[.\s]+$/, "");
      if (cleanContainer) {
        const [pub, ...locParts] = cleanContainer.split(/,\s*/);
        if (pub) entry.publisher = stripWrappingPunctuation(pub);
        if (locParts.length > 0) entry.location = stripWrappingPunctuation(locParts.join(", "));
      }
      return entry;
    } },
  { name: "descriptive-container", targetClass: "report", confidence: "low",
    classify: ({ prefix }) => prefix && prefix.titleStyle === "quoted",
    extract: ({ prefix }) => {
      const cleanContainer = prefix.container.replace(/^\(|\)\.?$/g, "").replace(/[.\s]+$/, "").trim();
      return baseEntryFromPrefix(prefix, {
        institution: cleanContainer || "unspecified",
        ...(cleanContainer ? { note: cleanContainer } : {}),
      });
    } },
  { name: "ieee-standard", targetClass: "report", confidence: "high",
    classify: ({ text, landmarks }) => /^IEEE\s+Std\s+/.test(text) && landmarks.standardsMarkers.some((s) => s.kind === "ieee"),
    extract: ({ text }) => {
      const m = text.match(/^IEEE\s+Std\s+([\d.\-:]+)(?:\s*\(([^)]+)\))?\.?\s*(?:\*([^*]+?)\.?\*)?\.?\s*(.*)$/);
      if (!m) return null;
      const stdNum = m[1].replace(/\.$/, "");
      const alias = m[2] ?? null;
      const title = m[3]?.trim() ?? alias ?? stdNum;
      const yearMatch = stdNum.match(/-(\d{4})/);
      if (!yearMatch) return null;
      const entry = {
        authors: ["Institute of Electrical and Electronics Engineers"],
        year: Number.parseInt(yearMatch[1], 10), title, institution: "IEEE", series: `IEEE Std ${stdNum}`,
      };
      if (alias && m[3]) entry.note = alias;
      return entry;
    } },
  { name: "standards-alias-author", targetClass: "report", confidence: "high",
    classify: ({ text, landmarks }) => /^[A-Z][\w.\-]*\s*\(IEEE\s+Std/.test(text) && landmarks.standardsMarkers.some((s) => s.kind === "ieee"),
    extract: ({ text }) => {
      const m = text.match(/^([\w.\-]+)\s*\(IEEE\s+Std\s+([\d.\-:]+)\)\.\s*(?:"([^"]+?)\.?"|(?:\*([^*]+?)\.?\*))\.?\s*(.*)$/);
      if (!m) return null;
      const alias = m[1], stdNum = m[2], title = (m[3] ?? m[4])?.trim();
      if (!title) return null;
      const yearMatch = stdNum.match(/-(\d{4})/);
      if (!yearMatch) return null;
      return {
        authors: ["Institute of Electrical and Electronics Engineers"],
        year: Number.parseInt(yearMatch[1], 10), title, institution: "IEEE", series: `IEEE Std ${stdNum}`, note: alias,
      };
    } },
  { name: "iso-standard-prefix", targetClass: "report", confidence: "high",
    classify: ({ text, landmarks }) => /^ISO\s+\d+/.test(text) && landmarks.standardsMarkers.some((s) => s.kind === "iso"),
    extract: ({ text }) => {
      const m = text.match(/^ISO\s+(\d+(?::\d+)?)\.?\s*\*([^*]+?)\.?\*\.?\s*(.*)$/i);
      if (!m) return null;
      const yearMatch = m[1].match(/:(\d{4})/);
      if (!yearMatch) return null;
      return {
        authors: ["International Organization for Standardization"],
        year: Number.parseInt(yearMatch[1], 10), title: m[2].trim(), institution: "ISO", series: `ISO ${m[1]}`,
      };
    } },
  { name: "living-standard", targetClass: "online", confidence: "medium",
    classify: ({ landmarks }) => landmarks.urls.length > 0 && landmarks.standardsMarkers.some((s) => s.kind === "whatwg" || s.kind === "w3c"),
    extract: ({ landmarks, now }) => {
      const marker = landmarks.standardsMarkers.find((s) => s.kind === "whatwg" || s.kind === "w3c");
      const italic = landmarks.italicSpans[0];
      const url = landmarks.urls[0];
      if (!italic || !url) return null;
      const institution = marker.kind === "whatwg" ? "WHATWG" : "W3C";
      const authorName = institution === "WHATWG" ? "WHATWG" : "World Wide Web Consortium";
      return {
        authors: [authorName], year: now.getFullYear(), title: italic.value.replace(/\.$/, ""),
        url: url.value.replace(/\.$/, ""), institution, note: "living standard; year is access year",
      };
    } },
  { name: "corporate-online", targetClass: "online", confidence: "medium",
    classify: ({ landmarks }) => landmarks.yearPlaceholders.length > 0 && landmarks.urls.length > 0,
    extract: ({ text, now }) => {
      const m = text.match(/^(.+?)\s+\((?:current|latest|n\.d\.|forthcoming|in press)\)\.\s*\*([^*]+?)\.?\*\.?\s*(https?:\/\/\S+?)\.?\s*$/i);
      if (!m) return null;
      return { authors: [m[1].trim()], year: now.getFullYear(), title: m[2].trim(), url: m[3], note: "living document; year is access year" };
    } },
  { name: "apa-journal-article", targetClass: "article", confidence: "medium", corroboratedConfidence: "high",
    classify: ({ text }) => {
      const m = text.match(APA_AUTHORS_YEAR_RE);
      return Boolean(m) && splitApaJournalTail(m[3]) !== null;
    },
    extract: ({ text }) => {
      const m = text.match(APA_AUTHORS_YEAR_RE);
      if (!m) return null;
      const split = splitApaJournalTail(m[3]);
      if (!split) return null;
      const authors = parseApaAuthorList(m[1]);
      if (authors.length === 0) return null;
      return { authors, year: Number.parseInt(m[2], 10), title: split.title, journal: split.journal, volume: split.volume, issue: split.issue, pages: split.pages };
    } },
  { name: "chicago-author-date-journal-article", targetClass: "article", confidence: "medium", corroboratedConfidence: "high",
    classify: ({ text }) => {
      const m = text.match(CHICAGO_AUTHOR_DATE_RE);
      return Boolean(m) && splitChicagoJournalTail(m[4]) !== null;
    },
    extract: ({ text }) => {
      const m = text.match(CHICAGO_AUTHOR_DATE_RE);
      if (!m) return null;
      const split = splitChicagoJournalTail(m[4]);
      if (!split) return null;
      const authors = parseAuthors(m[1]);
      if (authors.length === 0) return null;
      return { authors, year: Number.parseInt(m[2], 10), title: m[3].trim(), journal: split.journal, volume: split.volume, issue: split.issue, pages: split.pages };
    } },
  { name: "apa-book", targetClass: "book", confidence: "medium", corroboratedConfidence: "high",
    classify: ({ text }) => {
      const m = text.match(APA_AUTHORS_YEAR_RE);
      return Boolean(m) && splitApaBookTail(m[3]) !== null;
    },
    extract: ({ text }) => {
      const m = text.match(APA_AUTHORS_YEAR_RE);
      if (!m) return null;
      const split = splitApaBookTail(m[3]);
      if (!split) return null;
      const authors = parseApaAuthorList(m[1]);
      if (authors.length === 0) return null;
      return { authors, year: Number.parseInt(m[2], 10), title: split.title, publisher: split.publisher };
    } },
  { name: "free-form-source", targetClass: "report", confidence: "low",
    classify: ({ text }) => YEAR_PAREN_RE.test(text),
    extract: ({ text }) => {
      const m = text.match(new RegExp(`^(.+?)\\s+${YEAR_PAREN_RE.source}\\.\\s*(.+?)\\s*$`));
      if (!m) return null;
      const [, authorsBlob, yearBlob, rest] = m;
      const authors = parseAuthors(authorsBlob);
      if (authors.length === 0) return null;
      const yearDigits = yearBlob.match(/\d{4}/);
      if (!yearDigits) return null;
      const cleanRest = rest.replace(/[.\s]+$/, "").trim();
      if (!cleanRest) return null;
      return { authors, year: Number.parseInt(yearDigits[0], 10), title: cleanRest, institution: "unspecified" };
    } },
];

// ----- CSL-JSON conversion (bespoke intermediate shape -> CSL fields, no id) -----

const CLASS_TO_TYPE = {
  article: "article-journal",
  book: "book",
  chapter: "chapter",
  report: "report",
  preprint: "article",
  online: "webpage",
};

const toCsl = (bespoke, targetClass, { now }) => {
  const csl = {};
  csl.type = CLASS_TO_TYPE[bespoke.class ?? targetClass] ?? "document";
  if (Array.isArray(bespoke.authors) && bespoke.authors.length > 0) csl.author = bespoke.authors.map(nameFromString);
  if (Array.isArray(bespoke.editors) && bespoke.editors.length > 0) csl.editor = bespoke.editors.map(nameFromString);
  csl.title = bespoke.title;
  if (bespoke.journal) csl["container-title"] = bespoke.journal;
  if (bespoke.in) csl["container-title"] = bespoke.in;
  if (typeof bespoke.year === "number") csl.issued = cslDate(bespoke.year);
  if (bespoke.volume != null) csl.volume = bespoke.volume;
  if (bespoke.issue != null) csl.issue = String(bespoke.issue);
  if (bespoke.edition != null) csl.edition = bespoke.edition;
  if (bespoke.pages) csl.page = bespoke.pages;
  // Publisher / place. For standards & reports the institution is the publisher.
  if (bespoke.publisher) csl.publisher = bespoke.publisher;
  else if (bespoke.institution && bespoke.institution !== "unspecified") csl.publisher = bespoke.institution;
  if (bespoke.location) csl["publisher-place"] = bespoke.location;
  if (bespoke.series) csl.number = bespoke.series;
  if (bespoke.degree) csl.genre = bespoke.degree;
  if (bespoke.url) {
    csl.URL = bespoke.url;
    csl.accessed = cslDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  if (bespoke.doi) csl.DOI = bespoke.doi;
  if (bespoke.isbn) csl.ISBN = bespoke.isbn;
  if (bespoke.note) csl.note = bespoke.note;
  return csl;
};

// Attach DOI / ISBN landmarks that the style extractor did not capture.
const enrichFromLandmarks = (csl, landmarks, now) => {
  if (!csl.DOI && landmarks.dois.length > 0) csl.DOI = landmarks.dois[0].value;
  if (!csl.ISBN && landmarks.isbns.length > 0) csl.ISBN = landmarks.isbns[0].value;
  if (!csl.URL && csl.type === "webpage" && landmarks.urls.length > 0) {
    csl.URL = landmarks.urls[0].value.replace(/\.$/, "");
    if (!csl.accessed) csl.accessed = cslDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  return csl;
};

/**
 * Parse a single citation fragment into CSL-JSON fields (without an `id` —
 * the caller mints the citekey). Returns `{ok: true, entry, confidence,
 * style, authors, year, yearSuffix}` or `{ok: false, reason, raw}`.
 *
 * @param {string} rawText
 * @param {{now?: Date}} [options]
 * @returns {object} the parse result.
 */
export const parseCitationFragment = (rawText, { now = new Date() } = {}) => {
  const text = rawText.replace(/\s+/g, " ").trim();
  const landmarks = scanLandmarks(text);
  const prefix = extractAuthorYearTitle(text);
  const ctx = { text, landmarks, prefix, now };

  for (const style of STYLES) {
    if (!style.classify(ctx)) continue;
    const filled = style.extract(ctx);
    if (filled) {
      const csl = enrichFromLandmarks(toCsl(filled, style.targetClass, { now }), landmarks, now);
      // A style that names a corroboratedConfidence is upgraded to it when a
      // DOI or arXiv landmark independently corroborates the parse (e.g. a
      // plain-text APA/Chicago journal-article citation carrying its DOI).
      let confidence = style.confidence ?? "high";
      if (style.corroboratedConfidence && (landmarks.dois.length > 0 || landmarks.arxivIds.length > 0)) {
        confidence = style.corroboratedConfidence;
      }
      return {
        ok: true, entry: csl, confidence, style: style.name,
        yearSuffix: prefix?.yearSuffix ?? "", authors: filled.authors, year: filled.year,
      };
    }
  }
  if (!prefix) {
    if (!/\((\d{4}[a-z]?)\)/.test(text)) return { ok: false, reason: 'no "Authors (YYYY)." pattern matched', raw: text };
    return { ok: false, reason: "no quoted or italic title found", raw: text };
  }
  return { ok: false, reason: "could not determine type from container", raw: text };
};

/**
 * Parse one citation, including annotation trimming and multi-source
 * splitting, mint a citekey, and convert to a house reference entry.
 * Returns an array of results (one per sub-citation): each is either
 * `{ok: true, citekey, item, entry, confidence, style}` (`item` is the CSL-
 * JSON item, `entry` the admitted house reference entry) or
 * `{ok: false, reason, raw}`.
 *
 * @param {string} raw
 * @param {{now?: Date, taken?: Set<string>}} [options]
 * @returns {Array<object>} the parse results.
 */
export const parseCitation = (raw, { now = new Date(), taken = new Set() } = {}) => {
  const { fragments, annotation } = preprocessEntry(raw);
  const results = [];
  for (const fragment of fragments) {
    const parsed = parseCitationFragment(fragment, { now });
    if (!parsed.ok) { results.push({ ...parsed, raw: fragment }); continue; }
    if (annotation) parsed.entry.note = parsed.entry.note ? `${parsed.entry.note}. ${annotation}` : annotation;
    const year = `${parsed.year}${parsed.yearSuffix ?? ""}`;
    const names = (parsed.authors ?? []).map((a) => ({ family: surnameToken(a) }));
    const citekey = makeCitekey(names, year, taken);
    taken.add(citekey);
    const item = Object.freeze({ id: citekey, ...parsed.entry });
    try {
      const { entry } = fromCslItem(item, { admitReferenceEntry });
      results.push({ ok: true, citekey, item, entry, confidence: parsed.confidence, style: parsed.style });
    } catch (error) {
      taken.delete(citekey);
      results.push({ ok: false, reason: `parsed CSL item did not admit as a house reference entry: ${error.message}`, raw: fragment });
    }
  }
  return results;
};

/**
 * Parse many citations from a blob of text — one citation per non-empty
 * line, or per "- " list item.
 *
 * @param {string} text
 * @param {{now?: Date, minConfidence?: string, taken?: Set<string>}} [options]
 * @returns {{references: object, items: object, confidence: object, findings: Array<object>}} frozen: keyed house entries, keyed raw CSL items, keyed confidence levels, and parse findings.
 */
export const parseCitations = (text, { now = new Date(), minConfidence = "medium", taken = new Set() } = {}) => {
  const lines = text.split("\n")
    .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
    .filter((l) => l.length > 0);
  const references = {};
  const items = {};
  const confidence = {};
  const findings = [];
  for (const line of lines) {
    for (const result of parseCitation(line, { now, taken })) {
      if (!result.ok) {
        findings.push({ rule: "entry-unparsed", severity: "warning", reason: result.reason, raw: result.raw });
        continue;
      }
      if (!passesConfidence(result.confidence, minConfidence)) {
        findings.push({ rule: "entry-low-confidence", severity: "warning", confidence: result.confidence, "min-confidence": minConfidence, citekey: result.citekey, title: result.entry.title, raw: line });
        taken.delete(result.citekey);
        continue;
      }
      references[result.citekey] = result.entry;
      items[result.citekey] = result.item;
      confidence[result.citekey] = result.confidence;
      findings.push({ rule: "entry-extracted", severity: "info", citekey: result.citekey, style: result.style, confidence: result.confidence });
    }
  }
  return Object.freeze({ references: Object.freeze(references), items: Object.freeze(items), confidence: Object.freeze(confidence), findings: Object.freeze(findings) });
};
