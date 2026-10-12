import { issuedYear, normalizeTitle } from "@red-cup-engineering/csl-json-services-section";

/**
 * Reduce a title to the comparison key this verifier uses: the normalized
 * title's first 40 characters.
 *
 * @param {unknown} title
 * @returns {string} the comparison key.
 */
function titleKey(title) {
  return normalizeTitle(title).slice(0, 40);
}

/**
 * Whether two titles agree under this verifier's comparison rule.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function titlesAgree(a, b) {
  return titleKey(a) === titleKey(b);
}

/**
 * Classify one reference row against its CrossRef resolution.
 *
 * @param {{path?: string, citekey: string, doi?: (string|null), title: string, year: number}} row
 * @param {({ok: true, cslItem: object}|{ok: false, error: string}|null)} resolution - `null` when the row carries no doi.
 * @returns {{path: (string|undefined), citekey: string, doi: (string|undefined), title: string, year: number, status: ("agreed"|"title-mismatch"|"year-mismatch"|"unresolved"|"no-doi"), resolvedTitle?: string, resolvedYear?: (number|null), reason?: string}} frozen classification.
 */
export function classifyRow(row, resolution) {
  const base = { path: row.path, citekey: row.citekey, doi: row.doi ?? undefined, title: row.title, year: row.year };
  if (row.doi === undefined || row.doi === null || row.doi === "") {
    return Object.freeze({ ...base, status: "no-doi" });
  }
  if (resolution === null || resolution === undefined || resolution.ok !== true) {
    return Object.freeze({ ...base, status: "unresolved", reason: resolution?.error ?? "no resolution attempted" });
  }
  const resolvedTitle = resolution.cslItem.title;
  const resolvedYear = issuedYear(resolution.cslItem.issued ?? null);
  if (!titlesAgree(row.title, resolvedTitle)) {
    return Object.freeze({ ...base, status: "title-mismatch", resolvedTitle, resolvedYear });
  }
  if (Number.isInteger(row.year) && Number.isInteger(resolvedYear) && row.year !== resolvedYear) {
    return Object.freeze({ ...base, status: "year-mismatch", resolvedTitle, resolvedYear });
  }
  return Object.freeze({ ...base, status: "agreed", resolvedTitle, resolvedYear });
}

/**
 * Compile one glob pattern (`*` for a run of non-`/` characters, `**` for
 * any run, `?` for one character) into an anchored RegExp.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  let pattern = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      pattern += ".*";
      i += 1;
      if (glob[i + 1] === "/") i += 1;
    } else if (c === "*") {
      pattern += "[^/]*";
    } else if (c === "?") {
      pattern += "[^/]";
    } else if ("+^$.()|{}[]\\".includes(c)) {
      pattern += `\\${c}`;
    } else {
      pattern += c;
    }
  }
  return new RegExp(`^${pattern}$`, "u");
}

/**
 * Whether `path` matches any of `globs` (an empty/absent list matches
 * everything).
 *
 * @param {string} path
 * @param {Array<string>} [globs]
 * @returns {boolean}
 */
export function matchesIncludeGlobs(path, globs) {
  if (!Array.isArray(globs) || globs.length === 0) return true;
  return globs.some((glob) => globToRegExp(glob).test(path));
}

/**
 * Project a `collectReferencesFrom` result's reference triples down to the
 * verifier's row shape, optionally filtered to paths matching `includeGlobs`.
 *
 * @param {{triples: Array<{citekey: string, reference: object, path: string}>}} collected
 * @param {{includeGlobs?: Array<string>}} [options]
 * @returns {Array<{path: string, citekey: string, doi: (string|undefined), title: string, year: number}>} frozen rows.
 */
export function rowsFromCollected(collected, { includeGlobs } = {}) {
  return Object.freeze(
    collected.triples
      .filter((triple) => matchesIncludeGlobs(triple.path, includeGlobs))
      .map((triple) => Object.freeze({
        path: triple.path,
        citekey: triple.citekey,
        doi: triple.reference.doi,
        title: triple.reference.title,
        year: triple.reference.year,
      })),
  );
}

/**
 * Validate a raw JSON array of verifier input rows, throwing when any
 * element does not carry the minimum required shape.
 *
 * @param {unknown} rows
 * @returns {Array<{path?: string, citekey: string, doi?: string, title: string, year: number}>} frozen, validated rows.
 * @throws {TypeError} when `rows` is not an array, or an element is malformed.
 */
export function validateRawRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("verifier input rows must be an array");
  return Object.freeze(rows.map((row, index) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError(`row[${index}] must be an object`);
    }
    if (typeof row.citekey !== "string" || row.citekey.trim() === "") {
      throw new TypeError(`row[${index}] requires a non-empty citekey`);
    }
    if (typeof row.title !== "string" || row.title.trim() === "") {
      throw new TypeError(`row[${index}] (${row.citekey}) requires a non-empty title`);
    }
    if (!Number.isInteger(row.year)) {
      throw new TypeError(`row[${index}] (${row.citekey}) requires an integer year`);
    }
    if (row.doi !== undefined && row.doi !== null && typeof row.doi !== "string") {
      throw new TypeError(`row[${index}] (${row.citekey}) doi must be a string when present`);
    }
    if (row.path !== undefined && typeof row.path !== "string") {
      throw new TypeError(`row[${index}] (${row.citekey}) path must be a string when present`);
    }
    return Object.freeze({ path: row.path, citekey: row.citekey, doi: row.doi ?? undefined, title: row.title, year: row.year });
  }));
}

/**
 * Build the `ReferenceVerificationSet` report from a list of classified
 * rows: rows agreeing with their CrossRef resolution are counted, rows
 * carrying no doi are neither agreements nor defects, and every
 * `title-mismatch`, `year-mismatch`, or `unresolved` row is a defect.
 *
 * @param {Array<object>} results - rows as returned by {@link classifyRow}.
 * @returns {{type: "ReferenceVerificationSet", version: 1, rowCount: number, defects: Array<object>, defectCount: number, agreed: number}} frozen.
 */
export function buildVerificationSet(results) {
  const agreed = results.filter((row) => row.status === "agreed").length;
  const defects = results.filter((row) => row.status === "title-mismatch" || row.status === "year-mismatch" || row.status === "unresolved");
  return Object.freeze({
    type: "ReferenceVerificationSet",
    version: 1,
    rowCount: results.length,
    defects: Object.freeze(defects),
    defectCount: defects.length,
    agreed,
  });
}
