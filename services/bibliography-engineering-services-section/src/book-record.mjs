/** @module book-record Market operation for a sourced CSL-JSON book record. */

import { fetchOpenLibraryBook, normalizeIsbn } from "@red-cup-engineering/csl-json-services-section/open-library";
import { readingOfSides } from "@red-cup-engineering/computer-data-engineering-services-section/four";
import { reliableBibliographyFetch } from "./reference-check.mjs";

const truthReading = (positive, negative) => readingOfSides("truth", positive, negative);

/**
 * Resolve `{isbn}` to a sourced Open Library CSL-JSON book record. Invalid
 * checksums and missing editions are explicit refusals, never empty records.
 */
export async function bookRecord(body, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Object.freeze({ refusal: Object.freeze({ code: "invalid-request", message: "bookRecord requires an object with isbn" }), sources: Object.freeze([]), read: truthReading(false, false) });
  }
  try {
    const found = await fetchOpenLibraryBook(body.isbn, { fetchImpl: reliableBibliographyFetch(fetchImpl, { timeoutMs }) });
    if (found === null) {
      return Object.freeze({
        refusal: Object.freeze({ code: "isbn-not-found", message: `Open Library has no edition for ISBN ${normalizeIsbn(body.isbn)}` }),
        sources: Object.freeze([]),
        read: truthReading(false, false),
      });
    }
    return Object.freeze({ record: found.record, sources: found.sources, read: truthReading(true, false) });
  } catch (error) {
    if (error?.unreachable) {
      return Object.freeze({
        refusal: Object.freeze({ code: "source-unreachable", source: "Open Library", error: error.code, message: `Open Library is unreachable: ${error.code}` }),
        sources: Object.freeze([]),
        read: truthReading(false, false),
      });
    }
    if (error?.code !== "invalid-isbn") throw error;
    return Object.freeze({
      refusal: Object.freeze({ code: error.code, message: error.message }),
      sources: Object.freeze([]),
      read: truthReading(false, false),
    });
  }
}
