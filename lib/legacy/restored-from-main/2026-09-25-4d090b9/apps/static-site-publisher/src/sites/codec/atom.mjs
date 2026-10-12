/**
 * codecs/text/xml/atom - Article content records projected as Atom 1.0.
 *
 * @packageDocumentation
 */
import { document, element } from "@red-cup-engineering/xml-document-rendering-service";

const ATOM_NS = "http://www.w3.org/2005/Atom";
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const EPOCH = "1970-01-01T00:00:00.000Z";

function nonEmpty(value, label) {
  if (value === undefined || value.trim() === "") throw new TypeError(`${label}: expected a non-empty string`);
  return value;
}

function trimSlash(value) {
  return value.replace(/\/+$/u, "");
}

function articleUrl(feedMeta, article) {
  if (article.url !== undefined && article.url.trim() !== "") return article.url;
  if (article.canonicalUrl !== undefined && article.canonicalUrl.trim() !== "") return article.canonicalUrl;
  if (article.koios?.original_permalink !== undefined && article.koios.original_permalink.trim() !== "") return article.koios.original_permalink;
  const root = feedMeta.websiteUrl ?? feedMeta.homePageUrl;
  if (root === undefined || root.trim() === "") return article.slug;
  return `${trimSlash(root)}/${article.slug.replace(/^\/+/u, "")}`;
}

function isoDateTime(value, label) {
  const candidate = nonEmpty(value, label);
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${label}: expected an ISO-compatible date`);
  return date.toISOString();
}

function articlePublished(article) {
  return isoDateTime(article.date, `article ${article.slug} date`);
}

function articleUpdated(article) {
  return isoDateTime(article.updated ?? article.date, `article ${article.slug} updated`);
}

function latestUpdated(feedMeta, articles) {
  if (feedMeta.updated !== undefined) return isoDateTime(feedMeta.updated, "feed updated");
  let latest = EPOCH;
  for (const article of articles) {
    const updated = articleUpdated(article);
    if (updated > latest) latest = updated;
  }
  return latest;
}

function articleSummary(article) {
  return article.summary ?? article.description ?? article.metaDescription ?? article.excerpt;
}

function feedAuthor(author) {
  if (author === undefined) return null;
  const normalized = typeof author === "string" ? { name: author } : author;
  return element("author", {}, [
    element("name", {}, [normalized.name]),
    normalized.uri === undefined ? null : element("uri", {}, [normalized.uri]),
    normalized.email === undefined ? null : element("email", {}, [normalized.email]),
  ]);
}

function articleAuthor(article) {
  return element("author", {}, [element("name", {}, [article.author])]);
}

function sortedArticles(articles) {
  return [...articles].sort((left, right) => {
    const byUpdated = articleUpdated(right).localeCompare(articleUpdated(left));
    if (byUpdated !== 0) return byUpdated;
    const bySlug = left.slug.localeCompare(right.slug);
    return bySlug !== 0 ? bySlug : left.title.localeCompare(right.title);
  });
}

function entry(feedMeta, article) {
  const url = articleUrl(feedMeta, article);
  const summary = articleSummary(article);
  return element("entry", {}, [
    element("title", {}, [article.title]),
    element("id", {}, [url]),
    element("link", { rel: "alternate", href: url }),
    element("published", {}, [articlePublished(article)]),
    element("updated", {}, [articleUpdated(article)]),
    articleAuthor(article),
    summary === undefined ? null : element("summary", { type: "text" }, [summary]),
    element("content", { type: "text" }, [article.body]),
    ...(article.tags ?? article.categories ?? []).map((term) => element("category", { term })),
    article.license_url === undefined ? null : element("link", { rel: "license", href: article.license_url }),
    ...(article.sources ?? []).map((source) => element("link", {
      rel: "via",
      href: source.url,
      title: source.title ?? source.source,
    })),
    article.license === undefined ? null : element("rights", {}, [article.license]),
  ]);
}

/** Project Article content records to an Atom 1.0 XML document. */
export function articlesToAtom(feedMeta, articles) {
  const homePageUrl = feedMeta.homePageUrl ?? feedMeta.websiteUrl;
  const feedId = feedMeta.id ?? feedMeta.feedUrl ?? homePageUrl ?? feedMeta.title;
  const feed = element("feed", { xmlns: ATOM_NS, "xml:lang": feedMeta.language }, [
    element("title", {}, [feedMeta.title]),
    element("id", {}, [feedId]),
    element("updated", {}, [latestUpdated(feedMeta, articles)]),
    homePageUrl === undefined ? null : element("link", { rel: "alternate", href: homePageUrl }),
    feedMeta.feedUrl === undefined ? null : element("link", { rel: "self", href: feedMeta.feedUrl, type: "application/atom+xml" }),
    feedAuthor(feedMeta.author),
    feedMeta.description === undefined
      ? null
      : element("subtitle", { type: "xhtml" }, [element("div", { xmlns: XHTML_NS }, [feedMeta.description])]),
    ...sortedArticles(articles).map((article) => entry(feedMeta, article)),
  ]);
  return document(feed, { declaration: true });
}
