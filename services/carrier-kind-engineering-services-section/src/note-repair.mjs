/**
 * Repair plans for a note's frontmatter: the edits that bring it toward the note schema, each
 * derived from what the note already says, never invented. The fold step applies them
 * byte-preserving and revision-guarded; this module only plans.
 * @packageDocumentation
 */
import { measureMarkdownDatePath } from "@red-cup-engineering/markdown-engineering-services-section/measure-markdown-date-path";

const CITEKEY = /^[a-z][a-z0-9-]*[0-9]{4}[a-z0-9-]*$/u;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** A keyword as the term schema spells it: lower-case words joined by hyphens. */
export function kebabKeyword(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1-$2')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

/** The date a note's own path or file name states, if it states one. */
export function datedPathOf(path) {
  const segments = path.split('/');
  for (let take = 4; take >= 2; take -= 1) {
    const measured = measureMarkdownDatePath(segments.slice(-take).join('/'));
    if (measured.observation?.precision === 'day') return measured.observation.date;
  }
  return segments.at(-1).match(/^(\d{4}-\d{2}-\d{2})[-_ ]/u)?.[1] ?? null;
}

function plainText(markdown) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/gu, '$2')
    .replace(/\[@[^\]]*\]/gu, '')
    .replace(/[*_`]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** The note's first heading, else its file name read as words. */
export function titleOf(path, body) {
  const heading = body.match(/^#\s+(.+?)\s*#*\s*$/mu)?.[1];
  if (heading) return plainText(heading);
  const stem = path.split('/').at(-1).replace(/\.(?:md|markdown)$/iu, '').replace(/^\d{4}-\d{2}-\d{2}[-_ ]?(?:\d{4}h?[-_ ])?/u, '').replace(/--\d+$/u, '');
  const words = stem.replace(/[-_]+/gu, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : null;
}

/** The first sentence of the note's first prose paragraph, at most `limit` characters. */
export function descriptionOf(body, limit = 240) {
  for (const block of body.split(/\n\s*\n/u)) {
    const trimmed = block.trim();
    if (!trimmed || /^(#|```|~~~|>|\||- |\* |\d+\. |<|!\[|---|\$\$|:[A-Za-z]+:|\[\[)/u.test(trimmed) || /^:PROPERTIES:|^#\+/mu.test(trimmed)) continue;
    const text = plainText(trimmed);
    if (text.length < 40) continue;
    const sentence = text.match(/^.+?[.!?](?=\s|$)/u)?.[0] ?? text;
    return sentence.length <= limit ? sentence : `${sentence.slice(0, limit - 1).replace(/\s+\S*$/u, '')}…`;
  }
  return null;
}

/**
 * The frontmatter edits that bring a note toward the note schema, each derived from what the
 * note already says: a missing title from its first heading or file name, a missing date-created
 * from its dated path or file name (else from `firstRecorded`, the date its carrier first
 * appears in custody, when the caller supplies it), a missing description from the first
 * sentence of its first prose paragraph, keywords in the contract's spelling, and `references`
 * entries that are not citekey-keyed works (a title with no authors or year) moved to `cites`,
 * where names of cited works belong. Nothing is invented: a field the note gives no ground for
 * stays missing and stays a finding of `admitCarrierFrontmatter`.
 *
 * @returns {{ set: Record<string, unknown>, remove: string[] }}
 */
export function planNoteFrontmatterRepair({ path, text, frontmatter, body, firstRecorded = null }) {
  const set = {};
  const remove = [];
  if (!(typeof frontmatter.title === 'string' && frontmatter.title.trim())) {
    const title = (typeof frontmatter.name === 'string' && frontmatter.name.trim()) || titleOf(path, body);
    if (title) set.title = title;
  }
  if (!(typeof frontmatter['date-created'] === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(frontmatter['date-created']))) {
    const created = (typeof frontmatter.date === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(frontmatter.date) ? frontmatter.date.slice(0, 10) : null)
      ?? datedPathOf(path) ?? firstRecorded;
    if (created) set['date-created'] = created;
  }
  if (!(typeof frontmatter.description === 'string' && frontmatter.description.trim())) {
    const description = (typeof frontmatter.summary === 'string' && frontmatter.summary.trim()) || descriptionOf(body);
    if (description) set.description = description;
  }
  if (Array.isArray(frontmatter.keywords) && frontmatter.keywords.some((keyword) => typeof keyword !== 'string' || !KEBAB.test(keyword))) {
    set.keywords = [...new Set(frontmatter.keywords.map(kebabKeyword).filter(Boolean))];
  }
  const references = frontmatter.references;
  if (references && typeof references === 'object' && !Array.isArray(references)) {
    const works = Object.entries(references);
    const loose = works.filter(([key, entry]) => !CITEKEY.test(key) || !entry || typeof entry !== 'object' || !Array.isArray(entry.authors) || entry.year === undefined);
    if (loose.length > 0) {
      const named = loose.map(([key, entry]) => (entry && typeof entry === 'object' && typeof entry.title === 'string' ? entry.title : key));
      const cites = Array.isArray(frontmatter.cites) ? frontmatter.cites : typeof frontmatter.cites === 'string' ? [frontmatter.cites] : [];
      set.cites = [...new Set([...cites, ...named])];
      const kept = Object.fromEntries(works.filter((work) => !loose.includes(work)));
      if (Object.keys(kept).length > 0) set.references = kept; else remove.push('references');
    }
  }
  return Object.freeze({ set: Object.freeze(set), remove: Object.freeze(remove) });
}
