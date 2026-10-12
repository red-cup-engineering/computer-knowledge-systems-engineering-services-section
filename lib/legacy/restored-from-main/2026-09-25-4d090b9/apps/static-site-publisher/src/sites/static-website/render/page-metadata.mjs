/**
 * projections/page-metadata — the head-block metadata algebra.
 *
 * One projection derives every head-level metadata face — canonical URL,
 * description, Open Graph, Twitter Card, and schema.org JSON-LD - from an
 * admitted {@link Article} plus website/publication context. It reuses the
 * schema-org codec for the JSON-LD face (`articleToArticleJsonLd`/
 * `articleToNewsArticleJsonLd`, `websiteContextToWebSiteJsonLd`, `breadcrumbJsonLd`,
 * `entityGraphJsonLd`, `renderJsonLdScript`) and the html codec for escaping.
 * This is the package's one seat for article head metadata: `article-html`'s
 * page projection consumes `articleHeadMetadata` rather than hand-rolling its
 * own `og:`/`twitter:` block.
 */
import { ArticleSchema } from "../../article/index.mjs";
import { escapeAttr } from "@red-cup-engineering/html-structural-projection-service";
import {
  articleToArticleJsonLd,
  articleToNewsArticleJsonLd,
  breadcrumbJsonLd,
  entityGraphJsonLd,
  renderJsonLdScript,
  websiteContextToWebSiteJsonLd,

} from "../../codec/schema-org.mjs";

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value.trim() !== "") return value;
  }
  return undefined;
}

function metaName(name, content) {
  return `<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}">`;
}

function metaProperty(property, content) {
  return `<meta property="${escapeAttr(property)}" content="${escapeAttr(content)}">`;
}

function asJsonLdNode(value) {
  return value;
}

/** The one canonical-URL derivation for an Article: explicit option, then Article properties, then baseUrl+slug. */
export function articleUrl(article, options = {}) {
  return firstNonEmpty(
    options.url,
    article.url,
    article.canonicalUrl,
    article.koios?.original_permalink,
    options.baseUrl === undefined ? undefined : `${options.baseUrl.replace(/\/+$/, "")}/${article.slug.replace(/^\/+/, "")}`,
  );
}

/** The one canonical description derivation for an Article. */
export function articleDescription(article) {
  return firstNonEmpty(article.metaDescription, article.description, article.excerpt, article.summary, article.koios?.tweet);
}

const ARTICLE_SCHEMA_KEYS = new Set(Object.keys(ArticleSchema.properties));

/**
 * Callers (e.g. digital-garden/professional-blog) hold article content records that
 * extend Article with extra website-build properties (`permalink`, `outputPath`, ...)
 * the strict `ArticleSchema` (`additionalProperties: false`) rejects. Narrow
 * to exactly the schema's own keys before handing the value to the
 * schema-org codec, rather than requiring every caller to know and strip
 * its own extra properties.
 */
function narrowToArticleSchema(article) {
  const narrowed = {};
  for (const [key, value] of Object.entries(article)) {
    if (ARTICLE_SCHEMA_KEYS.has(key)) narrowed[key] = value;
  }
  return narrowed;
}

/** Derive the full head-block metadata algebra for one admitted Article. */
export function articleHeadMetadata(article, options = {}) {
  const description = articleDescription(article);
  const url = articleUrl(article, options);

  const openGraphTags = [
    metaProperty("og:type", "article"),
    metaProperty("og:title", article.title),
    description === undefined ? null : metaProperty("og:description", description),
    url === undefined ? null : metaProperty("og:url", url),
    options.websiteName === undefined ? null : metaProperty("og:site_name", options.websiteName),
    options.image === undefined ? null : metaProperty("og:image", options.image),
    metaProperty("article:published_time", article.date),
    article.updated === undefined ? null : metaProperty("article:modified_time", article.updated),
    metaProperty("article:author", article.author),
    ...(article.tags ?? []).map((tag) => metaProperty("article:tag", tag)),
  ].filter((tag) => tag !== null);

  const twitterTags = [
    metaName("twitter:card", options.image === undefined ? "summary" : "summary_large_image"),
    metaName("twitter:title", article.title),
    description === undefined ? null : metaName("twitter:description", description),
    options.image === undefined ? null : metaName("twitter:image", options.image),
    options.twitterAccount === undefined ? null : metaName("twitter:site", options.twitterAccount),
    options.twitterCreator === undefined ? null : metaName("twitter:creator", options.twitterCreator),
  ].filter((tag) => tag !== null);

  const schemaArticle = narrowToArticleSchema(article);
  const articleNode = asJsonLdNode(
    options.newsArticle ? articleToNewsArticleJsonLd(schemaArticle) : articleToArticleJsonLd(schemaArticle, url === undefined ? {} : { url }),
  );
  const websiteUrl = options.websiteUrl ?? url;
  const websiteNode = options.websiteName === undefined || websiteUrl === undefined ? undefined : asJsonLdNode(websiteContextToWebSiteJsonLd({
    websiteUrl,
    title: options.websiteName,
    websiteName: options.websiteName,
  }));
  const crumbsNode = options.routePath === undefined ? undefined : asJsonLdNode(
    breadcrumbJsonLd(options.routePath, { websiteUrl: websiteUrl ?? "/", rootName: options.websiteName ?? "Home" }),
  );

  const nodes = [articleNode, websiteNode, crumbsNode].filter((node) => node !== undefined);
  const jsonLd = nodes.length === 0 ? undefined : nodes.length === 1 ? nodes[0] : asJsonLdNode(entityGraphJsonLd(nodes));

  return Object.freeze({
    description,
    url,
    canonicalTag: url === undefined ? undefined : `<link rel="canonical" href="${escapeAttr(url)}">`,
    openGraphTags: Object.freeze(openGraphTags),
    twitterTags: Object.freeze(twitterTags),
    jsonLd,
    jsonLdScript: jsonLd === undefined ? "" : renderJsonLdScript(jsonLd),
  });
}

/** Join the head-block metadata algebra's faces into head-ready markup, one tag per line. */
export function renderArticleHeadMetadata(metadata) {
  return [
    metadata.canonicalTag,
    ...metadata.openGraphTags,
    ...metadata.twitterTags,
    metadata.jsonLdScript === "" ? undefined : metadata.jsonLdScript,
  ].filter((tag) => tag !== undefined).join("\n");
}
