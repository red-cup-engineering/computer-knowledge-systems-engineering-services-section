import { el, escapeHtml } from "@red-cup-engineering/html-structural-projection-service/string-rendering";

// DPUB-ARIA 1.1 bibliography projection: the one canonical rendering of a
// scope's depth-1 `references:` triples to the W3C Digital Publishing WAI-ARIA
// Module `doc-bibliography` / `doc-biblioentry` / `doc-biblioref` roles
// (https://www.w3.org/TR/dpub-aria-1.1/), so every consuming site (koios.news
// today hand-rolls this shape; a later lot migrates it) renders the same
// standards-conformant markup and varies only its own display nomenclature.

const CITEKEY = /^[a-z][a-z0-9-]*[0-9]{4}[a-z0-9-]*$/u;

function slugId(citekey) {
  const slug = String(citekey).toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug === "" ? "reference" : slug;
}

/**
 * The DOM id a rendered bibliography entry is addressed by, shared by
 * {@link renderReferenceListAria}'s `<li id="...">` and
 * {@link renderBiblioRefLink}'s `href="#..."` so a list and its inline
 * citation links always agree, independent of either's nomenclature.
 *
 * @param {string} citekey
 * @returns {string} the entry's DOM id (`ref-<slug>`).
 */
export function referenceEntryId(citekey) {
  return `ref-${slugId(citekey)}`;
}

/**
 * Deduplicate reference triples by citekey (first occurrence per key wins,
 * mirroring `projectReferencesCslFrom`'s policy) and order them by citekey,
 * the deterministic ordering both {@link renderReferenceListAria} and a
 * caller numbering its own {@link renderBiblioRefLink} calls must share.
 *
 * @param {Array<{citekey: string, reference: object}>} triples - as produced by `collectReferencesFrom`.
 * @returns {Array<{citekey: string, reference: object}>} frozen, one entry per distinct citekey, sorted by citekey.
 */
export function orderedReferenceEntries(triples) {
  const byKey = new Map();
  for (const { citekey, reference } of triples) {
    if (!byKey.has(citekey)) byKey.set(citekey, reference);
  }
  return Object.freeze([...byKey.keys()].sort().map((citekey) => Object.freeze({ citekey, reference: byKey.get(citekey) })));
}

/**
 * Number of {@link orderedReferenceEntries}'s entries, keyed by citekey, in
 * the order {@link renderReferenceListAria} renders them (1-based) — the map
 * a caller passes to {@link renderBiblioRefLink} so inline citation numbers
 * agree with the rendered list.
 *
 * @param {Array<{citekey: string, reference: object}>} triples
 * @returns {ReadonlyMap<string, number>} citekey -> 1-based ordinal.
 */
export function referenceNumbering(triples) {
  return new Map(orderedReferenceEntries(triples).map(({ citekey }, index) => [citekey, index + 1]));
}

/**
 * Render one house depth-1 reference entry (`src/reference-entry.mjs`'s
 * admitted shape) as a `doc-biblioentry` list item.
 *
 * @param {string} citekey
 * @param {{authors: string[], title: string, year: number, publication?: string, publisher?: string, translator?: string, url?: string, doi?: string, note?: string, eprint?: string}} entry - an admitted reference entry.
 * @returns {string} the rendered `<li>` markup.
 */
export function renderReferenceEntryHtml(citekey, entry) {
  const author = entry.authors.length > 0 ? `${escapeHtml(entry.authors.join(", "))}. ` : "";
  const title = entry.url === undefined
    ? el("cite", null, escapeHtml(entry.title))
    : el("cite", null, el("a", { href: entry.url }, escapeHtml(entry.title)));
  const publication = entry.publication ? ` ${escapeHtml(entry.publication)}.` : "";
  const publisher = entry.publisher ? ` ${escapeHtml(entry.publisher)}.` : "";
  const translator = entry.translator ? ` Translated by ${escapeHtml(entry.translator)}.` : "";
  const doi = entry.doi ? ` <span class="reference__doi">doi:${escapeHtml(entry.doi)}</span>.` : "";
  const eprint = entry.eprint ? ` <span class="reference__eprint">arXiv:${escapeHtml(entry.eprint)}</span>.` : "";
  const note = entry.note ? ` <span class="reference__note">${escapeHtml(entry.note)}</span>` : "";
  const inner = `${author}${title}. ${escapeHtml(entry.year)}.${publication}${publisher}${translator}${doi}${eprint}${note}`;
  return el("li", { id: referenceEntryId(citekey), role: "doc-biblioentry" }, inner);
}

/**
 * Project a scope's collected reference triples as a DPUB-ARIA 1.1
 * bibliography: `<section role="doc-bibliography">` containing a heading and
 * an ordered list of `doc-biblioentry` items, matching the shape
 * koios.news's `bibliographyHtml` hand-rolled
 * (`<section class="bibliography" role="doc-bibliography"
 * aria-labelledby="..."><h2 id="...">...</h2><ol>...</ol></section>`) so a
 * consumer migrating onto this projector is behavior-compatible.
 *
 * @param {Array<{citekey: string, reference: object}>} triples - as produced by `collectReferencesFrom`.
 * @param {{label?: string, id?: string}} [options] - `label` is the visible heading text (default `"References"`); `id` is the heading/anchor id, also used as `aria-labelledby` (default `"references"`) — the one varying nomenclature between consuming sites over one standards-conformant backend.
 * @returns {string} the rendered `<section>` markup, or `""` when `triples` yields no distinct citekey.
 */
export function renderReferenceListAria(triples, { label = "References", id = "references" } = {}) {
  const entries = orderedReferenceEntries(triples);
  if (entries.length === 0) return "";
  const items = entries.map(({ citekey, reference }) => renderReferenceEntryHtml(citekey, reference));
  return el(
    "section",
    { class: "bibliography", role: "doc-bibliography", "aria-labelledby": id },
    `${el("h2", { id }, escapeHtml(label))}${el("ol", null, items)}`,
  );
}

/**
 * Render one inline citation link under the DPUB-ARIA 1.1 `doc-biblioref`
 * role, addressing the entry {@link renderReferenceListAria} rendered for
 * the same citekey (via {@link referenceEntryId}) — the inline half of the
 * same standards-conformant projection, kept in agreement with the list by
 * construction rather than by a second id scheme.
 *
 * @param {string} citekey
 * @param {number} [number] - the entry's 1-based ordinal from {@link referenceNumbering}, shown as link text `"[N]"`; when omitted, the bracketed citekey is used as a fallback link text.
 * @returns {string} the rendered `<a>` markup.
 * @throws {TypeError} when `citekey` is not a house citekey (`surnameYYYY`).
 */
export function renderBiblioRefLink(citekey, number) {
  if (!CITEKEY.test(citekey)) throw new TypeError(`invalid citekey ${citekey}`);
  const text = Number.isInteger(number) ? `[${number}]` : `[${escapeHtml(citekey)}]`;
  return el(
    "a",
    { class: "citation", role: "doc-biblioref", href: `#${referenceEntryId(citekey)}`, "data-cites": citekey },
    text,
  );
}
