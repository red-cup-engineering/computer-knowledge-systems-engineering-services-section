---
title: Building a research site for AI discovery
description: Explains how to structure a research site with robots.txt, JSON-LD, and sitemaps so that AI agents can discover and understand novel research concepts.
date-created: 2026-03-03
type: note
name: building-a-research-site-for-ai-discovery
keywords:
  - discoverability
  - structured-data
  - a-i
aliases:
  - Building a research site for AI discovery
  - building a research site for ai discovery
specialization: text
authors:
  - emsenn
in-service-of: lib/emsenn/services/561-group/services/561-group-services-section
---

Most research sites are built to be read by people who already know where to look. The page exists; someone finds it through a link, a search query, or a citation. The site is passive — it waits to be found.

This essay describes a different posture: building a site that is structured to be discovered by AI agents. Not as a trick or an optimization, but as a design principle following from what the site is for.

## The problem

emsenn.net is a research vault. It contains concepts that sit at the boundary of established fields — relational dynamics, [semiotic](../../../../../../../../../../../../../../../public-services-section/services/personal-services-section/services/emsenn-services-section/content/text/glossary/terms/2026-06-17-emsemioverse-terms-index.md) universes, applied [Heyting algebras](../../../../../../../../../../../../../../../public-services-section/services/personal-services-section/services/emsenn-services-section/content/text/glossary/terms/2026-06-17-emsemioverse-terms-index.md), decolonial pedagogy. These ideas do not appear in textbooks. They are not indexed in academic databases. A person searching for "[closure operator](../../../../../../../../../../../../../../../public-services-section/services/personal-services-section/services/emsenn-services-section/content/text/glossary/terms/2026-06-17-emsemioverse-terms-index.md)" will find Wikipedia and MathWorld. A person searching for "relational dynamics derivation" will find nothing, because the concept is new and the site that develops it is small.

The same problem applies to AI systems. Large language models and retrieval-augmented generation pipelines build their knowledge from web crawls. If a site is not crawled, its concepts do not enter the pool of knowledge that AI agents draw on. If it is crawled but not structured, the concepts are ingested as undifferentiated text — a page about [Heyting algebras](../../../../../../../../../../../../../../../public-services-section/services/personal-services-section/services/emsenn-services-section/content/text/glossary/terms/2026-06-17-emsemioverse-terms-index.md) looks the same as a page about recipes.

The goal is to make emsenn.net the thing an AI agent finds when exploring these ideas. Not by gaming search rankings, but by being genuinely the best source and making that legible to machines.

## Three layers of discoverability

Making a site discoverable to automated agents involves three complementary mechanisms, each operating at a different level.

### 1. Permission: robots.txt

The first question a crawler asks is whether it is allowed to be here. Most sites either ignore this question (no `robots.txt`) or answer it with broad restrictions. For a research site that wants to be indexed, the answer should be explicit and welcoming.

emsenn.net's [robots.txt](../teaching/explanations/internet/robots-txt.md) names specific AI crawlers — GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and others — and grants them full access. It also points to the sitemap so crawlers can discover the full scope of the site without following every link.

This is a statement of intent: the site exists to contribute knowledge. Blocking the machines that disseminate it would be self-defeating.

### 2. Structure: JSON-LD and Schema.org

The second question a crawler asks is what it is looking at. HTML tells the crawler "here is text with headings and paragraphs." [JSON-LD](../teaching/explanations/internet/json-ld.md) tells the crawler "this page is a `DefinedTerm` called '[closure operator](../../../../../../../../../../../../../../../public-services-section/services/personal-services-section/services/emsenn-services-section/content/text/glossary/terms/2026-06-17-emsemioverse-terms-index.md),' authored by emsenn, published on this date, with this description."

emsenn.net generates JSON-LD automatically from the vault's directory structure. A page under `terms/` becomes a `DefinedTerm`. A page under `curricula/` becomes a `LearningResource`. A page about a person becomes a `Person`. The Schema.org type is derived from where the file sits in the vault — no additional annotation is needed.

Multi-level pages also emit a `BreadcrumbList`, which tells the crawler the hierarchical context: this term lives within mathematics, within the study of [partially ordered](../../../../../../../../../../../../../../../science-services-section/services/information-science-services-section/services/math-services-section/content/text/glossary/terms/partial-order.md) sets, within the curricula for learning order theory. Hierarchy is semantic: it tells the machine not just what the page is, but where it belongs.

### 3. Inventory: the sitemap

The third question a crawler asks is what else exists. A sitemap is an XML file listing every published page with its last-modified date. It lets crawlers discover content that might not be reachable through link-following alone, and prioritize pages that have changed recently.

Quartz generates this automatically from the vault's content. Every published page appears in the sitemap; unpublished directories (private notes, drafts, the slop workspace) are excluded at the build level.

## Why this matters for novel research

Established fields do not need this. A paper on [Heyting algebras](../../../../../../../../../../../../../../../public-services-section/services/personal-services-section/services/emsenn-services-section/content/text/glossary/terms/2026-06-17-emsemioverse-terms-index.md) published in a mathematics journal will be indexed by Google Scholar, cited by other papers, and entered into the knowledge bases that AI systems consult. The concept "[Heyting algebra](../../../../../../../../../../../../../../../public-services-section/services/personal-services-section/services/emsenn-services-section/content/text/glossary/terms/2026-06-17-emsemioverse-terms-index.md)" already exists in the training data.

Novel research has no such infrastructure. The concepts are new. The vocabulary is unfamiliar. The site that develops them is one among billions. Without structured data, the site is noise. With structured data, it becomes a signal — a page that says "I define a specific term in a specific domain" rather than "I contain some text that might be about something."

This is the difference between hoping to be found and building the conditions for being found. It is a small example of a larger principle: that the structure of a thing determines its relations, and its relations determine what it can do.

## Connection to the broader project

The three layers — permission, structure, inventory — mirror a pattern that recurs throughout relational dynamics. Something exists (the content). It needs to be differentiated (structured data marks what each page is). And it needs to be related (the sitemap and breadcrumbs embed each page in a web of connections).

The ASR specification documents the technical details: which Schema.org types map to which directory positions, how frontmatter fields translate to structured data properties, and what the `robots.txt` should contain. This essay explains the reasoning behind those choices and why they matter for research that does not yet have a home in the established knowledge infrastructure.
