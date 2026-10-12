/**
 * codecs/text/json/feed - Article content records projected as JSON Feed 1.1.
 *
 * @packageDocumentation
 */
import { } from "@red-cup-engineering/json-services-section";
import { canonicalJson } from "@red-cup-engineering/json-services-section";

const JSON_FEED_VERSION = "https://jsonfeed.org/version/1.1";

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

function articleUpdated(article) {
  return isoDateTime(article.updated ?? article.date, `article ${article.slug} updated`);
}

function articleSummary(article) {
  return article.summary ?? article.description ?? article.metaDescription ?? article.excerpt;
}

function feedAuthor(author) {
  if (author === undefined) return null;
  if (typeof author === "string") return { name: author };
  const out = { name: author.name };
  if (author.url !== undefined) out.url = author.url;
  if (author.avatar !== undefined) out.avatar = author.avatar;
  return out;
}

function sortedArticles(articles) {
  return [...articles].sort((left, right) => {
    const byUpdated = articleUpdated(right).localeCompare(articleUpdated(left));
    if (byUpdated !== 0) return byUpdated;
    const bySlug = left.slug.localeCompare(right.slug);
    return bySlug !== 0 ? bySlug : left.title.localeCompare(right.title);
  });
}

function item(feedMeta, article) {
  const sources = article.sources ?? [];
  const sourceCycleWarnings = [
    ...(article.sourceCycleWarnings ?? []),
    ...(article.koios?.source_cycle_warnings ?? []),
  ];
  const out = {
    id: articleUrl(feedMeta, article),
    url: articleUrl(feedMeta, article),
    title: article.title,
    content_text: article.body,
    date_published: isoDateTime(article.date, `article ${article.slug} date`),
    date_modified: articleUpdated(article),
    authors: [{ name: article.author }],
  };
  const summary = articleSummary(article);
  if (summary !== undefined) out.summary = summary;
  const tags = article.tags ?? article.categories ?? article.keywords;
  if (tags !== undefined) out.tags = [...tags];
  if (article.license_url !== undefined) out._license_url = article.license_url;
  if (article.license !== undefined) out._license = article.license;
  if (sources.length > 0) {
    out._sources = sources.map((source) => ({
      url: source.url,
      ...(source.title === undefined ? {} : { title: source.title }),
      ...(source.source === undefined ? {} : { source: source.source }),
    }));
  }
  if ((article.editorialGates ?? []).length > 0) out._editorial_gates = article.editorialGates.map((gate) => ({ ...gate }));
  if (sourceCycleWarnings.length > 0) out._source_cycle_warnings = sourceCycleWarnings;
  return out;
}

/** Project Article content records to a JSON Feed 1.1 document. */
export function articlesToJsonFeed(feedMeta, articles) {
  const out = {
    version: JSON_FEED_VERSION,
    title: feedMeta.title,
    items: sortedArticles(articles).map((article) => item(feedMeta, article)),
  };
  const homePageUrl = feedMeta.homePageUrl ?? feedMeta.websiteUrl;
  if (homePageUrl !== undefined) out.home_page_url = homePageUrl;
  if (feedMeta.feedUrl !== undefined) out.feed_url = feedMeta.feedUrl;
  if (feedMeta.description !== undefined) out.description = feedMeta.description;
  if (feedMeta.language !== undefined) out.language = feedMeta.language;
  const author = feedAuthor(feedMeta.author);
  if (author !== null) out.authors = [author];
  return `${canonicalJson(out)}\n`;
}
