---
title: Standards Facts for VICTOR (as of 2026-08-26)
date-created: 2026-08-26
status: reference
tags:
- victor
- living-web
- standards
- wcag
- activitypub
- protocols
---

# Standards Facts for VICTOR

The external standards VICTOR conforms to and the protocol shapes it implements, stated with the values an implementer needs. Current as of 2026-08-26; the Living Web Science Services Section owns tracking their movement.

## HTML

The WHATWG HTML Living Standard is the single normative HTML specification; since the 2019 W3C–WHATWG memorandum, W3C publishes no competing versioned HTML, so "valid HTML" means valid against the Living Standard as it stands on the build date. The practical checker class is the Nu HTML Checker's rule set: element nesting and content models, attribute validity, ID uniqueness, required landmarks. MathML Core is part of the Living Standard and is Baseline across Chromium, Gecko, and WebKit, which is why VICTOR emits native `<math>` for mathematics.

## Accessibility

WCAG 2.2 is the current standard and the legally referenced baseline. VICTOR's machine-checkable set, with thresholds:

- Text contrast (AAA): 7:1 for normal text; 4.5:1 for large text, where large means at least 24px regular or 18.66px bold.
- Non-text contrast: 3:1 for meaningful graphics, borders, and focus indicators.
- Focus visible on every focusable element; focus indicators meet the non-text ratio; `outline: none` without replacement fails.
- Target size minimum: 24×24 CSS pixels for pointer targets, with the spacing exception.
- The document declares its language (`html[lang]`); every page has a `title`; headings do not skip levels; every image has an `alt` attribute (empty only when deliberately decorative); form fields have programmatic labels; no positive `tabindex`.
- Reflow: content functions at 320 CSS pixels width without horizontal page scrolling (wide artifacts scroll inside their own containers).

ARIA in HTML is a W3C Recommendation dated 2026-04-15: use no ARIA where a native element provides the semantics; never apply a role that contradicts the element; the document defines the allowed-role table per element that a checker enforces. WAI-ARIA 1.2 (2023) is the current ARIA vocabulary; 1.3 is a draft.

WCAG 3.0 is a Working Draft (March 2026 draft: ~174 "requirements", a scoring model replacing pass/fail) and will not be a Recommendation before roughly 2028. VICTOR pins conformance claims to 2.2 by name and structures its suite so a 3.0 profile is an added stage.

Field context that motivates the AAA posture: roughly 96% of surveyed top homepages fail WCAG at all, and overlay-remediation vendors are legally compromised (a $1M FTC action against one in 2025; a public fact sheet against overlays signed by more than 600 accessibility and spec contributors). Accessible-by-construction output is an open competitive lane, not table stakes.

## Structured data

JSON-LD in a `<script type="application/ld+json">` block is the de facto standard, preferred over RDFa and Microdata because it decouples data from presentation markup. Current best practice is one graph per page using `@graph` with `@id` cross-references between entities rather than isolated per-widget blocks. The vocabulary is schema.org, applied softly: types and properties as published, no OWL semantics, no global consistency obligation. AI answer engines extract entities and citations from this markup, which makes it load-bearing for an information catalog. VICTOR's per-type mapping: article and note to `Article`, letter to `Message`, glossary-term to `DefinedTerm`, glossary-topic to `DefinedTermSet`, record to `Dataset` or `CreativeWork`, index to `CollectionPage`, page to `WebPage`. The Turtle sibling serialization expresses the same graph per subject.

## Feeds

RSS 2.0: a `channel` with `title`, `link`, `description`, and `item`s with `title`, `link`, `guid` (the subject IRI), `pubDate` in RFC 822 date format. Atom (RFC 4287): `feed` requires `id`, `title`, `updated` (ISO 8601); each `entry` requires `id`, `title`, `updated`, with `link rel="alternate"` and `content` or `summary`. JSON Feed 1.1: top-level `version: "https://jsonfeed.org/version/1.1"`, `title`, `items` each with `id` and `content_html` or `content_text`. All three emit for every syndicating view; the corrections feed always exists.

## Discovery

Sitemap protocol: `urlset` of `url` elements with `loc` and `lastmod`; at most 50,000 URLs and 50MB uncompressed per file, with a `sitemapindex` beyond that. `robots.txt` names the sitemap. The web app manifest supplies `name`, `icons`, `start_url`, `display`, and theme colors. Well-known URIs follow RFC 8615 under `/.well-known/`. Content-address resolution follows RFC 6920: the URI form is `ni:///sha-256;<base64url-digest-no-padding>`, and the well-known mapping is `/.well-known/ni/sha-256/<digest>`, which VICTOR answers with a redirect to the exact revision. IndexNow exists as a push-based crawl notifier honored by Bing, Yandex, Naver, and Seznam but not Google; it complements sitemaps and is optional.

## Microformats2

The plain-HTML machine-readable layer, expressed as class names on existing markup. An entry is `h-entry` carrying `p-name` (title), `e-content` (body), `dt-published` and `dt-updated` (ISO dates), `u-url` (permalink), and `p-author` marked up as an embedded `h-card` (`p-name`, `u-url`, `u-photo`). A feed page is `h-feed` of `h-entry`s. Identity links use `rel="me"`. These classes ride on the page projection's own elements; nothing renders twice.

## Webmention

A W3C Recommendation. Sending: on publish, for each external link in a cell, discover the target's endpoint (a `link rel="webmention"` element or HTTP `Link` header) and POST `source` and `target` as form-encoded parameters. Receiving (live mode): accept the same POST, respond 201 or 202, then verify asynchronously by fetching the claimed source and confirming it actually links to the target; only verified mentions are stored and rendered. Rendered mentions appear below the colophon, labeled, visually subordinate.

## WebFinger, NodeInfo, ActivityPub

WebFinger: `GET /.well-known/webfinger?resource=acct:name@host` returns a JRD document whose `links` array carries a `rel="self"` entry with `type: application/activity+json` pointing at the actor. NodeInfo: `/.well-known/nodeinfo` points to a document declaring software name, version, and protocols.

ActivityPub: the actor is a JSON-LD document (`@context` including `https://www.w3.org/ns/activitystreams` and the security vocabulary) with `id`, `type` (`Organization` or `Person` for a site actor), `inbox`, `outbox`, `preferredUsername`, and `publicKey` (id, owner, PEM). Content type for all AP documents: `application/activity+json`, also served for `application/ld+json; profile="https://www.w3.org/ns/activitystreams"`. The outbox is an `OrderedCollection` of `Create` activities wrapping `Article` or `Note` objects whose `id`s are the subject IRIs; public addressing uses the literal collection `https://www.w3.org/ns/activitystreams#Public`. Delivery (live mode only): POST the activity to each follower's inbox signed with HTTP Signatures over at minimum the `(request-target)`, `host`, `date`, and `digest` headers, using the actor's key. Inbox handling verifies signatures before accepting; `Follow` activities are answered with `Accept`. In static mode the actor, outbox, and object documents exist as fetchable artifacts and the release manifest states that inbox and delivery are absent. The mature reference for all of this in production is WordPress's official ActivityPub plugin; no static-site-native federation of comparable maturity exists, which makes this a differentiating surface.

## CSS

Baseline-available and safe to use: container queries including style queries, `:has()`, subgrid, cascade layers, native nesting, `@scope`, OKLCH color and `color-mix()`, logical properties, `clamp()`, and the View Transitions API. Not yet universally safe: anchor positioning and `calc-size()`. Custom Elements and Declarative Shadow DOM are fully native across engines, but VICTOR refuses shadow DOM regardless — composition is by function, and style encapsulation comes from discipline, not scoping trees.

## The field, in one paragraph

Hugo (Go, pure static, fastest builds, painful templates), Astro (islands hybrid, zero-JS default, the current growth leader), Eleventy (unopinionated JS static), Zola (Rust single binary, batteries included), Ghost (Node API-first with memberships), and WordPress (~43% of the web, block editor consolidated) divide the market into three lanes — pure-binary static, JS-hybrid, and API-first CMS. Graph publishing lives separately in Quartz, TiddlyWiki, and Obsidian Publish; data cataloging in Datasette. Nothing serves a conventional page-tree site and a queryable relational surface from one model, nothing treats content addressing as first-class, nothing checks conformance continuously, and nothing federates from generated sites without a database — which are exactly VICTOR's four differentiators.
