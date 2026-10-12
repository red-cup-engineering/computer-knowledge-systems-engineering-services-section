// Rendered-HTML conformance: the SAS §9.3 checks that can run as an embedded
// build stage over every completed HTML artifact, with no HTML parser, no
// network, and no product policy. Each finding names its check id and its
// refusal/advisory code from the §9.4 catalog, so an author can cite it.
//
// Scope, stated plainly: these are machine subsets. C-01 here is doctype,
// title, and duplicate ids -- not a WHATWG validator. C-02 is the ARIA-last
// rule (no explicit role that duplicates an element's native one). C-03 is
// the language attribute; contrast is certified by web-theming-service
// (C-08/C-14), not per page. C-10 refuses an image without an alt attribute and
// advises when intrinsic dimensions are absent, because VICTOR does not yet
// process images and cannot know them. C-15 checks the orientation anatomy
// on indexable pages: a title, exactly one h1, a main landmark, and a nav.

const HTML_PATH = /\.html$/u;
const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu;
const JSON_LD = /<script\b[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/giu;

// Explicit roles that restate an element's native semantics (ARIA in HTML §4).
const REDUNDANT_ROLES = {
  a: ['link'], button: ['button'], nav: ['navigation'], main: ['main'], aside: ['complementary'],
  article: ['article'], header: ['banner'], footer: ['contentinfo'], table: ['table'], ul: ['list'], ol: ['list'],
  li: ['listitem'], img: ['img'], form: ['form'], h1: ['heading'], h2: ['heading'], h3: ['heading'],
  h4: ['heading'], h5: ['heading'], h6: ['heading'], dialog: ['dialog'], progress: ['progressbar'],
};

const CHECK_IDS = ['C-01', 'C-02', 'C-03', 'C-09', 'C-10', 'C-12', 'C-15'];

export function checkRenderedHtml(artifacts) {
  const refusals = [];
  const advisories = [];
  const flagged = Object.fromEntries(CHECK_IDS.map((id) => [id, 0]));
  let documentCount = 0;
  for (const [path, artifact] of artifacts) {
    if (!HTML_PATH.test(path)) continue;
    const body = typeof artifact === 'string' ? artifact : artifact?.body;
    if (typeof body !== 'string') continue;
    documentCount += 1;
    const seen = new Set();
    for (const finding of checkDocument(path, body)) {
      seen.add(finding.check);
      const item = { code: finding.code, subject: path, reason: `${finding.check}: ${finding.reason}`, data: { check: finding.check, ...finding.data } };
      (finding.severity === 'refusal' ? refusals : advisories).push(item);
    }
    for (const check of seen) flagged[check] += 1;
  }
  return {
    valid: refusals.length === 0,
    documentCount,
    checks: CHECK_IDS.map((id) => ({ id, flaggedDocuments: flagged[id] })),
    refusals,
    advisories,
  };
}

export function* checkDocument(path, html) {
  const markup = html.replace(SCRIPT_OR_STYLE, (block) => ' '.repeat(block.length));

  // C-01 (subset): doctype, a non-empty title, unique ids.
  if (!/^\s*<!doctype html>/iu.test(html)) yield finding('C-01', 'R-13', 'refusal', 'document does not start with <!doctype html>');
  const title = /<title>([^<]*)<\/title>/iu.exec(markup);
  if (!title || !title[1].trim()) yield finding('C-01', 'R-13', 'refusal', 'document has no non-empty <title>');
  const ids = new Map();
  for (const match of markup.matchAll(/\sid\s*=\s*"([^"]*)"/gu)) ids.set(match[1], (ids.get(match[1]) ?? 0) + 1);
  for (const [id, count] of ids) if (count > 1 && id !== '') yield finding('C-01', 'R-13', 'refusal', `id "${id}" occurs ${count} times`, { id, count });

  // C-02: ARIA-last -- no explicit role restating a native one.
  for (const match of markup.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/giu)) {
    const tag = match[1].toLowerCase();
    const role = /\brole\s*=\s*"([^"]*)"/iu.exec(match[2]);
    if (!role) continue;
    const redundant = REDUNDANT_ROLES[tag];
    if (!redundant || !redundant.includes(role[1].trim().toLowerCase())) continue;
    if (tag === 'a' && !/\bhref\s*=/iu.test(match[2])) continue; // an <a> without href has no native link role
    yield finding('C-02', 'R-14', 'refusal', `<${tag}> restates its native semantics with role="${role[1]}"`, { element: tag, role: role[1] });
  }

  // C-03 (machine subset): the document language.
  const root = /<html\b([^>]*)>/iu.exec(markup);
  const lang = root && /\blang\s*=\s*"([^"]*)"/iu.exec(root[1]);
  if (!lang || !lang[1].trim()) yield finding('C-03', 'A-03', 'advisory', 'the html element has no lang attribute');

  // C-09: heading hierarchy over the rendered page, not only the authored body.
  let previous = 0;
  let headings = 0;
  for (const match of markup.matchAll(/<h([1-6])\b/giu)) {
    const level = Number(match[1]);
    headings += 1;
    if (previous === 0 && level !== 1) yield finding('C-09', 'R-10', 'refusal', `the first heading is h${level}, not h1`, { level });
    else if (previous !== 0 && level > previous + 1) yield finding('C-09', 'R-10', 'refusal', `heading level skips from h${previous} to h${level}`, { from: previous, to: level });
    previous = level;
  }

  // C-10: every image names its alternative; intrinsic dimensions are advised.
  for (const match of markup.matchAll(/<img\b([^>]*)>/giu)) {
    const attrs = ` ${match[1]} `;
    const src = /\bsrc\s*=\s*"([^"]*)"/iu.exec(attrs)?.[1] ?? '';
    if (!/\salt(\s*=|\s|\/)/iu.test(attrs)) yield finding('C-10', 'R-11', 'refusal', `image ${src || '(no src)'} has no alt attribute`, { src });
    if (!/\swidth\s*=/iu.test(attrs) || !/\sheight\s*=/iu.test(attrs)) yield finding('C-10', 'A-03', 'advisory', `image ${src || '(no src)'} has no intrinsic width/height`, { src });
  }

  // C-12: every JSON-LD block parses and every node declares a type.
  for (const match of html.matchAll(JSON_LD)) {
    let parsed;
    try { parsed = JSON.parse(match[1]); } catch (error) { yield finding('C-12', 'R-12', 'refusal', `JSON-LD does not parse: ${error.message}`); continue; }
    const nodes = Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [parsed];
    for (const node of nodes) {
      const type = node?.['@type'];
      if (!(typeof type === 'string' && type) && !(Array.isArray(type) && type.length)) yield finding('C-12', 'R-12', 'refusal', `JSON-LD node ${node?.['@id'] ?? '(anonymous)'} has no @type`, { id: node?.['@id'] ?? null });
    }
  }

  // Links must have an accessible name (WCAG 2.4.4 machine subset): advisory.
  for (const match of markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const attrs = ` ${match[1]} `;
    if (/\saria-label(ledby)?\s*=|\stitle\s*=/iu.test(attrs)) continue;
    const text = match[2].replace(/<img\b[^>]*\balt\s*=\s*"([^"]+)"[^>]*>/giu, ' $1 ').replace(/<[^>]+>/gu, '').trim();
    if (!text) yield finding('C-03', 'A-03', 'advisory', `a link (${/\bhref\s*=\s*"([^"]*)"/iu.exec(attrs)?.[1] ?? 'no href'}) has no accessible name`);
  }

  // C-15: the orientation anatomy on indexable pages. Utility pages a robot
  // is told not to index (search, 404) and refresh redirects are exempt.
  const utility = /<meta\b[^>]*name\s*=\s*"robots"[^>]*content\s*=\s*"[^"]*noindex/iu.test(markup) || /<meta\b[^>]*http-equiv\s*=\s*"refresh"/iu.test(markup);
  if (!utility) {
    const h1s = (markup.match(/<h1\b/giu) ?? []).length;
    const missing = [];
    if (!title || !title[1].trim()) missing.push('what is this: a title');
    if (h1s !== 1) missing.push(`what is this: exactly one h1 (found ${h1s})`);
    if (!/<main\b/iu.test(markup)) missing.push('where am I: a main landmark');
    if (!/<nav\b/iu.test(markup)) missing.push('where next: a nav landmark');
    if (headings === 0) missing.push('what is this: at least one heading');
    if (missing.length) yield finding('C-15', 'R-09', 'refusal', `orientation contract unanswered -- ${missing.join('; ')}`, { missing });
  }
}

function finding(check, code, severity, reason, data = {}) {
  return { check, code, severity, reason, data };
}
