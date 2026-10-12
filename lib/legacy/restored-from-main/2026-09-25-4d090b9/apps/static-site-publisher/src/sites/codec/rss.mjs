/**
 * codecs/text/xml/rss - Article content records projected as RSS 2.0.
 *
 * @packageDocumentation
 */
import { document, element } from "@red-cup-engineering/xml-document-rendering-service";

const ATOM_NS = "http://www.w3.org/2005/Atom";
const EPOCH = "Thu, 01 Jan 1970 00:00:00 GMT";

function nonEmpty(value, label) {
  if (value === undefined || value.trim() === "") throw new TypeError(`${label}: expected a non-empty string`);
  return value;
}

function trimSlash(value) {
  return value.replace(/\/+$/u, "");
}

function channelLink(feedMeta) {
  return nonEmpty(feedMeta.homePageUrl ?? feedMeta.websiteUrl, "feed homePageUrl");
}

function articleUrl(feedMeta, article) {
  if (article.url !== undefined && article.url.trim() !== "") return article.url;
  if (article.canonicalUrl !== undefined && article.canonicalUrl.trim() !== "") return article.canonicalUrl;
  if (article.koios?.original_permalink !== undefined && article.koios.original_permalink.trim() !== "") return article.koios.original_permalink;
  return `${trimSlash(channelLink(feedMeta))}/${article.slug.replace(/^\/+/u, "")}`;
}

function rfc822Date(value, label) {
  const candidate = nonEmpty(value, label);
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${label}: expected an ISO-compatible date`);
  return date.toUTCString();
}

function articleUpdated(article) {
  return rfc822Date(article.updated ?? article.date, `article ${article.slug} updated`);
}

function latestUpdated(feedMeta, articles) {
  if (feedMeta.updated !== undefined) return rfc822Date(feedMeta.updated, "feed updated");
  let latestMillis = 0;
  let latest = EPOCH;
  for (const article of articles) {
    const candidate = new Date(article.updated ?? article.date);
    if (Number.isNaN(candidate.getTime())) throw new TypeError(`article ${article.slug} updated: expected an ISO-compatible date`);
    if (candidate.getTime() > latestMillis) {
      latestMillis = candidate.getTime();
      latest = candidate.toUTCString();
    }
  }
  return latest;
}

function articleSummary(article) {
  return article.summary ?? article.description ?? article.metaDescription ?? article.excerpt ?? article.body;
}

function sortedArticles(articles) {
  return [...articles].sort((left, right) => {
    const byUpdated = new Date(right.updated ?? right.date).getTime() - new Date(left.updated ?? left.date).getTime();
    if (byUpdated !== 0) return byUpdated;
    const bySlug = left.slug.localeCompare(right.slug);
    return bySlug !== 0 ? bySlug : left.title.localeCompare(right.title);
  });
}

function item(feedMeta, article) {
  const url = articleUrl(feedMeta, article);
  const categories = article.tags ?? article.categories ?? [];
  return element("item", {}, [
    element("title", {}, [article.title]),
    element("link", {}, [url]),
    element("guid", { isPermaLink: "true" }, [url]),
    element("pubDate", {}, [rfc822Date(article.date, `article ${article.slug} date`)]),
    element("description", {}, [articleSummary(article)]),
    element("author", {}, [article.author]),
    ...categories.map((category) => element("category", {}, [category])),
    ...(article.sources ?? []).map((source) => element("source", { url: source.url }, [source.title ?? source.source ?? source.url])),
  ]);
}

/** Project Article content records to an RSS 2.0 XML document. */
export function articlesToRss(feedMeta, articles) {
  const link = channelLink(feedMeta);
  const channel = element("channel", {}, [
    element("title", {}, [feedMeta.title]),
    element("link", {}, [link]),
    element("description", {}, [feedMeta.description ?? feedMeta.title]),
    feedMeta.language === undefined ? null : element("language", {}, [feedMeta.language]),
    feedMeta.feedUrl === undefined ? null : element("atom:link", { href: feedMeta.feedUrl, rel: "self", type: "application/rss+xml" }),
    element("lastBuildDate", {}, [latestUpdated(feedMeta, articles)]),
    feedMeta.author === undefined ? null : element("managingEditor", {}, [feedMeta.author]),
    articles.some((article) => article.license !== undefined) ? element("copyright", {}, [articles.find((article) => article.license !== undefined).license]) : null,
    ...sortedArticles(articles).map((article) => item(feedMeta, article)),
  ]);
  return document(element("rss", { version: "2.0", "xmlns:atom": ATOM_NS }, [channel]), { declaration: true });
}

function decodeXmlText(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_match, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\s+/gu, " ")
    .trim();
}

function elementBlocks(xml, localName) {
  const pattern = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_-]+:)?${localName}>`, "giu");
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? "");
}

function elementText(xml, localName) {
  const [first] = elementBlocks(xml, localName);
  if (first === undefined) return undefined;
  const decoded = decodeXmlText(first);
  return decoded === "" ? undefined : decoded;
}

function attr(value, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu");
  const match = pattern.exec(value);
  const text = match?.[1] ?? match?.[2];
  return text === undefined ? undefined : decodeXmlText(text);
}

function firstAtomLink(entry) {
  const links = [...entry.matchAll(/<link\b([^>]*)\/?>/giu)].map((match) => match[1] ?? "");
  const alternate = links.find((attrs) => {
    const rel = attr(attrs, "rel");
    return rel === undefined || rel === "alternate";
  });
  const href = alternate === undefined ? undefined : attr(alternate, "href");
  if (href !== undefined && href !== "") return href;
  return elementText(entry, "link");
}

function nonEmptyItem(input

) {
  const title = input.title?.trim();
  const url = input.url?.trim();
  if (title === undefined || title === "" || url === undefined || url === "") return null;
  return Object.freeze({
    title,
    url,
    ...(input.id === undefined || input.id.trim() === "" ? {} : { id: input.id.trim() }),
    ...(input.summary === undefined || input.summary.trim() === "" ? {} : { summary: input.summary.trim() }),
    ...(input.published === undefined || input.published.trim() === "" ? {} : { published: input.published.trim() }),
    ...(input.updated === undefined || input.updated.trim() === "" ? {} : { updated: input.updated.trim() }),
    ...(input.author === undefined || input.author.trim() === "" ? {} : { author: input.author.trim() }),
    categories: Object.freeze([...(input.categories ?? [])].map((item) => item.trim()).filter(Boolean)),
  });
}

function rssItem(block) {
  return nonEmptyItem({
    title: elementText(block, "title"),
    url: elementText(block, "link") ?? elementText(block, "guid"),
    id: elementText(block, "guid"),
    summary: elementText(block, "description") ?? elementText(block, "encoded"),
    published: elementText(block, "pubDate") ?? elementText(block, "date"),
    updated: elementText(block, "updated"),
    author: elementText(block, "creator") ?? elementText(block, "author"),
    categories: elementBlocks(block, "category").map(decodeXmlText),
  });
}

function atomItem(block) {
  return nonEmptyItem({
    title: elementText(block, "title"),
    url: firstAtomLink(block) ?? elementText(block, "id"),
    id: elementText(block, "id"),
    summary: elementText(block, "summary") ?? elementText(block, "content"),
    published: elementText(block, "published"),
    updated: elementText(block, "updated"),
    author: elementText(elementBlocks(block, "author")[0] ?? "", "name") ?? elementText(block, "author"),
    categories: [...block.matchAll(/<category\b([^>]*)\/?>/giu)].flatMap((match) => {
      const attrs = match[1] ?? "";
      return [attr(attrs, "term") ?? attr(attrs, "label")].filter((value) => value !== undefined);
    }),
  });
}

/** Read RSS/Atom source XML into normalized syndication items for downstream projections. */
export function parseSyndicationItems(xml) {
  const rss = elementBlocks(xml, "item").flatMap((block) => {
    const parsed = rssItem(block);
    return parsed === null ? [] : [parsed];
  });
  if (rss.length > 0) return Object.freeze(rss);
  return Object.freeze(elementBlocks(xml, "entry").flatMap((block) => {
    const parsed = atomItem(block);
    return parsed === null ? [] : [parsed];
  }));
}
