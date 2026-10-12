/**
 * codecs/text/xml/sitemap - URL and Article collection projections into sitemap XML.
 *
 * The builders here are pure string projections over settled Article material:
 * they sort by projected URL, skip drafts by default, and rely on the XML core
 * writer for escaping and well-formed serialization.
 */

import { document, element } from "@red-cup-engineering/xml-document-rendering-service";

const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const NEWS_NS = "http://www.google.com/schemas/sitemap-news/0.9";

function publishedArticles(articles, includeDrafts) {
  return Array.from(articles).filter((article) => includeDrafts || !article.draft);
}

function cleanPathSegment(value) {
  return value.replace(/^\/+|\/+$/g, "");
}

function articlePath(article, pathPrefix = "") {
  const prefix = cleanPathSegment(pathPrefix);
  const slug = cleanPathSegment(article.slug);
  return `/${[prefix, slug].filter(Boolean).join("/")}`;
}

function articleUrl(article, options) {
  return new URL(articlePath(article, options.pathPrefix), options.websiteUrl).toString();
}

function articleLastmod(article) {
  return article.updated ?? article.date;
}

function sitemapEntries(articles, options) {
  return publishedArticles(articles, options.includeDrafts ?? false)
    .map((article) => ({
      article,
      loc: articleUrl(article, options),
      lastmod: articleLastmod(article),
    }))
    .sort((a, b) => a.loc.localeCompare(b.loc));
}

function standardUrl(entry, options) {
  return element("url", {}, [
    element("loc", {}, [entry.loc]),
    element("lastmod", {}, [entry.lastmod]),
    options.changefreq === undefined ? null : element("changefreq", {}, [options.changefreq]),
    options.priority === undefined ? null : element("priority", {}, [String(options.priority)]),
  ]);
}

function standardUrlEntry(entry, options) {
  return element("url", {}, [
    element("loc", {}, [entry.loc]),
    entry.lastmod === undefined ? null : element("lastmod", {}, [entry.lastmod]),
    options.changefreq === undefined ? null : element("changefreq", {}, [options.changefreq]),
    options.priority === undefined ? null : element("priority", {}, [String(options.priority)]),
  ]);
}

function newsUrl(entry, options) {
  return element("url", {}, [
    element("loc", {}, [entry.loc]),
    element("news:news", {}, [
      element("news:publication", {}, [
        element("news:name", {}, [options.publicationName]),
        element("news:language", {}, [options.publicationLanguage ?? "en"]),
      ]),
      element("news:publication_date", {}, [entry.article.date]),
      element("news:title", {}, [entry.article.title]),
    ]),
  ]);
}

export function articlesToSitemap(articles, options) {
  return document(
    element("urlset", { xmlns: SITEMAP_NS }, sitemapEntries(articles, options).map((entry) => standardUrl(entry, options))),
    { declaration: true },
  );
}

export function urlsToSitemap(entries, options) {
  const includeDrafts = options.includeDrafts ?? false;
  const urls = Array.from(entries)
    .filter((entry) => includeDrafts || !(entry.draft ?? false))
    .sort((left, right) => left.loc.localeCompare(right.loc));
  return document(
    element("urlset", { xmlns: SITEMAP_NS }, urls.map((entry) => standardUrlEntry(entry, options))),
    { declaration: true },
  );
}

export function articlesToNewsSitemap(articles, options) {
  return document(
    element("urlset", { xmlns: SITEMAP_NS, "xmlns:news": NEWS_NS }, sitemapEntries(articles, options).map((entry) => newsUrl(entry, options))),
    { declaration: true },
  );
}
