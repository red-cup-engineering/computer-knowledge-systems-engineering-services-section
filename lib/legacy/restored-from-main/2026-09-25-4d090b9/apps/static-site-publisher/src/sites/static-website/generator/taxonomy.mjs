/**
 * integrations/web/core/static-website/generator/taxonomy - term-index assets for static websites.
 *
 * This primitive stays bounded to Article taxonomy dimensions: it groups an
 * admitted article stream by a chosen term extractor, then emits static HTML
 * assets that can be carried by professional-blog, digital-garden, and future
 * website genres without owning their full routing recipe.
 */

import { escapeAttr, escapeText, slug as defaultSlug } from "@red-cup-engineering/html-structural-projection-service";

/** Project Article taxonomy terms to static term pages with dated post links. */
export function articlesToTermIndexPages(articles, opts) {
  const basePath = normalizeBasePath(opts.basePath ?? "/");
  const slugOf = opts.slug ?? ((term) => defaultSlug(term));
  const prefix = cleanOutputPath(opts.pathPrefix ?? defaultPathPrefix(opts.dimension));
  const terms = termEntries(articles, opts, slugOf, prefix, basePath);
  const assets = terms.map((entry) => Object.freeze({
    path: entry.path,
    href: entry.href,
    contents: renderTermPage(entry, opts, dimensionLabel(opts.dimension)),
  }));
  if (opts.includeRoot !== true) return Object.freeze(assets);
  return Object.freeze([
    Object.freeze({
      path: rootOutputPath(prefix),
      href: websiteHref(basePath, rootOutputPath(prefix)),
      contents: renderRootPage(terms, dimensionLabel(opts.dimension)),
    }),
    ...assets,
  ]);
}

function termEntries(
  articles,
  opts,
  slugOf,
  prefix,
  basePath,
) {
  const buckets = new Map();
  for (const article of articles) {
    const terms = uniqueTerms(termsOf(article, opts.dimension));
    for (const term of terms) {
      const termSlug = slugOf(term);
      const bucket = buckets.get(term) ?? Object.freeze({ term, slug: termSlug, articles: [] });
      bucket.articles.push(Object.freeze({ article, href: articleHref(article, basePath) }));
      buckets.set(term, bucket);
    }
  }
  return Object.freeze([...buckets.values()]
    .map((entry) => {
      const path = indexOutputPath(prefix, entry.slug);
      return Object.freeze({
        term: entry.term,
        slug: entry.slug,
        path,
        href: websiteHref(basePath, path),
        articles: Object.freeze(entry.articles.sort((left, right) => newestFirst(left.article, right.article))),
      });
    })
    .sort((left, right) => left.term.localeCompare(right.term) || left.slug.localeCompare(right.slug)));
}

function termsOf(article, dimension) {
  if (typeof dimension === "function") return dimension(article);
  return article[dimension] ?? [];
}

function uniqueTerms(terms) {
  const seen = new Set();
  const out = [];
  for (const value of terms) {
    const term = value.trim();
    if (term === "" || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
  }
  return Object.freeze(out);
}

function newestFirst(left, right) {
  return publishedTime(right) - publishedTime(left)
    || left.slug.localeCompare(right.slug);
}

function publishedTime(article) {
  const time = Date.parse(article.date);
  if (Number.isNaN(time)) throw new TypeError(`articlesToTermIndexPages: article ${article.slug} has an unparseable date ${article.date}`);
  return time;
}

function articleHref(article, basePath) {
  return websiteHref(basePath, routeOutput(article));
}

function routeOutput(article) {
  const routed = article;
  const hint = firstString(routed.outputPath, routed.permalink, routed.path);
  if (hint !== undefined) return outputPath(hint);
  return indexOutputPath("posts", article.slug);
}

function renderTermPage(entry, opts, dimension) {
  const heading = opts.title?.(entry.term, entry.articles.length) ?? `${entry.term} (${entry.articles.length})`;
  const items = entry.articles
    .map(({ article, href }) => `        <li class="h-entry" data-slug="${escapeAttr(article.slug)}"><time class="dt-published" datetime="${escapeAttr(article.date)}">${escapeText(article.date)}</time> <a class="u-url p-name" href="${escapeAttr(href)}">${escapeText(article.title)}</a></li>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeText(heading)}</title>
</head>
<body>
  <main>
    <section class="h-feed" data-dimension="${escapeAttr(dimension)}" data-term="${escapeAttr(entry.term)}">
      <h1 class="p-name">${escapeText(heading)}</h1>
      <p>${escapeText(String(entry.articles.length))} ${entry.articles.length === 1 ? "post" : "posts"} filed under ${escapeText(entry.term)}.</p>
      <ol>
${items}
      </ol>
    </section>
  </main>
</body>
</html>
`;
}

function renderRootPage(terms, dimension) {
  const title = `${titleCase(dimension)} index`;
  const items = terms
    .map((entry) => `        <li><a href="${escapeAttr(entry.href)}">${escapeText(entry.term)}</a> <data value="${escapeAttr(String(entry.articles.length))}">${escapeText(String(entry.articles.length))}</data></li>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeText(title)}</title>
</head>
<body>
  <main>
    <h1>${escapeText(title)}</h1>
    <ol>
${items}
    </ol>
  </main>
</body>
</html>
`;
}

function defaultPathPrefix(dimension) {
  return typeof dimension === "string" ? dimension : "terms";
}

function dimensionLabel(dimension) {
  return typeof dimension === "string" ? dimension : "terms";
}

function titleCase(value) {
  return value.replace(/\b[a-z]/gu, (letter) => letter.toUpperCase());
}

function indexOutputPath(prefix, slug) {
  const path = [prefix, cleanOutputPath(slug), "index.html"].filter(Boolean).join("/");
  return outputPath(path);
}

function rootOutputPath(prefix) {
  return prefix === "" ? "index.html" : outputPath(prefix);
}

function outputPath(path) {
  const clean = cleanOutputPath(path);
  if (clean === "") throw new TypeError("articlesToTermIndexPages: output path must not be empty");
  if (clean.endsWith("/")) return `${clean}index.html`;
  if (clean.split("/").at(-1)?.includes(".") === true) return clean;
  return `${clean}/index.html`;
}

function cleanOutputPath(value) {
  const collapsed = value.replace(/\\/gu, "/").replace(/^\/+/u, "").replace(/\/+/gu, "/");
  const parts = collapsed.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.some((part) => part === "..")) throw new TypeError(`articlesToTermIndexPages: unsafe output path ${value}`);
  return parts.join("/");
}

function websiteHref(basePath, path) {
  const out = outputPath(path);
  const withoutIndex = out.endsWith("/index.html") ? out.slice(0, -"index.html".length) : out;
  const joined = [basePath.replace(/\/+$/u, ""), withoutIndex.replace(/^\/+/u, "")].filter(Boolean).join("/");
  return normalizeBasePath(joined).replace(/\/$/u, withoutIndex.endsWith("/") ? "/" : "");
}

function normalizeBasePath(value) {
  const path = value.trim() === "" ? "/" : value;
  const clean = `/${path.replace(/^\/+|\/+$/gu, "")}`;
  return clean === "/" ? "/" : `${clean}/`;
}

function firstString(...values) {
  for (const value of values) {
    if (value !== undefined && value.trim() !== "") return value;
  }
  return undefined;
}
