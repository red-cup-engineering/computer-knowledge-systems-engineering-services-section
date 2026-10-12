---
title: VICTOR Authoring Dialect Specification
date-created: 2026-08-26
status: draft-for-review
tags:
- victor
- dialect
- markdown
- authoring
- rendering
---


This note specifies the language authors write in and the exact HTML each construct renders to. It is implementable on its own: a parser and renderer built from this note alone, with the SAS in this directory for the surrounding data model, is a conforming implementation. The dialect is parsed once, at build time, by one implementation; the browser never parses it.

## Source form

A cell source is one UTF-8 text file: YAML front matter delimited by `---` lines, then a body in the dialect. Line endings normalize to LF before any parsing or hashing. The front-matter vocabulary and its validation rules are in the SAS; this note governs the body.

## Base grammar

The body is CommonMark, plus GFM tables, plus the seven house constructs below. Raw inline and block HTML pass through unmodified — authors are trusted, and the conformance suite still validates the final output — but every value that VICTOR itself interpolates into markup is escaped. Autolinked bare URLs render as ordinary anchors.

Headings in the body begin at level two; the page title is the only `h1`. A body heading written as `#` is emitted as `h2`, and each deeper level shifts accordingly. A heading more than one level deeper than its predecessor is a build refusal (the no-skipped-levels rule).

## Wikilink

Syntax: `[[target]]` or `[[target|label]]`. The target is a cell name — a slash-separated lowercase-kebab path — resolved against the catalog's name map after slug normalization (lowercase; spaces to hyphens; punctuation other than hyphen and slash dropped). A bare final segment matches its full name when unambiguous; ambiguity is a build refusal that lists the candidates.

Resolved, with the target's title as default label:

```html
<a href="/notes/example-name/" data-cell-type="note">label</a>
```

Unresolved, the construct renders as a potential link — visibly distinct by more than color — and the build records an advisory naming the wanted-but-absent cell:

```html
<span class="potential-link">label<sup class="potential-mark" aria-hidden="true">?</sup></span>
```

Every resolved wikilink asserts a `links` relation from the containing cell to the target.

## Transclusion

Syntax: `![[target]]` for a whole body, `![[target#Heading Text]]` for the section under one heading. The target's rendered body (or section) is embedded with provenance always visible:

```html
<figure class="transclusion">
  <blockquote>…the target's rendered content…</blockquote>
  <figcaption>from <a href="/notes/target/"><cite>Target Title</cite></a></figcaption>
</figure>
```

Transclusion depth is bounded only by the cycle rule: a cell transcluding itself through any chain is a build refusal naming the cycle. An unresolved target renders the potential-link placeholder inside an otherwise empty transclusion figure and records the same advisory. Each transclusion asserts a `transcludes` relation.

## Citation

Syntax: `[@key]`, optionally `[@key, p. 12]`. The key must exist in the cell's front-matter `references` block; a missing key is a build refusal. In the running text the citation renders author–year:

```html
<a class="citation" href="#ref-key">(Sennhauser 2026)</a>
```

The full reference renders twice from one source: in the reservoir beside the paragraph that cited it (as a margin note, see Footnote below for the mechanism) and in the page's reference list:

```html
<li id="ref-key">Morgan Sennhauser. <cite>Title of the Work</cite>. Publication, 2026.</li>
```

Each citation asserts a `cites` relation to the reference.

## Callout

Syntax: a blockquote whose first line is `[!note]`, `[!caution]`, or `[!evidence]`, optionally followed on the same line by a title. Renders as a labeled aside; the label is always visible text, never an icon alone:

```html
<aside class="callout callout-note">
  <p class="callout-label">Note<span class="callout-title">: Optional Title</span></p>
  …the quoted content…
</aside>
```

An unknown callout type renders as a plain blockquote and records an advisory. The callout type set grows only by earned addition.

## Inline field

Syntax: a paragraph or list item beginning `key:: value`. The key must be a relation type in the catalog's relation vocabulary; the value is a wikilink (asserting a relation to that cell) or a literal (asserting a relation to a literal). Rendering keeps the assertion visible as data:

```html
<p class="inline-field"><dfn class="field-key">key</dfn> <span class="field-value">value</span></p>
```

Adjacent inline fields group into one definition list (`dl` of `dt`/`dd` pairs). A key outside the relation vocabulary records an advisory and passes the pair into the cell's `extra` map instead of the relation index.

## Footnote and sidenote

Syntax: standard `[^n]` marker with a `[^n]: text` definition. Footnotes are margin-first: the note's content is emitted inline, immediately after the sentence containing its marker, as a span the stylesheet floats into the reservoir margin. With CSS off, the content simply reads in place — nothing is lost and no jump is needed. The emitted shape:

```html
…the sentence with the marker<label for="sn-3" class="sidenote-toggle"><sup>3</sup></label>
<input type="checkbox" id="sn-3" class="sidenote-state" />
<span class="sidenote" role="note"><sup>3</sup> the note's text</span>…
```

The checkbox mechanism gives narrow viewports tap-to-reveal disclosure with zero JavaScript. An orphaned marker or orphaned definition is a build refusal. Citations reuse this exact mechanism for their margin copies, numbered in the same sequence.

## Code

Fenced code blocks carry a language tag; highlighting happens at build time by tokenizing into spans classed by token kind, colored by the theme, meeting the same contrast floors as prose. The block renders inside a figure whose caption names the language in visible text, and scrolls inside its own container rather than widening the page:

```html
<figure class="listing">
  <figcaption class="listing-language">TypeScript</figcaption>
  <pre><code class="language-typescript"><span class="tok-keyword">const</span> …</code></pre>
</figure>
```

An untagged fence renders unhighlighted with the caption "text" and records an advisory.

## Mathematics

Syntax: `$…$` inline and `$$…$$` display, in TeX notation. Both render at build time to native MathML (`<math>` with `display="inline"` or `display="block"`); no client-side math renderer ever ships, and no equation is ever an image. The source expression is preserved in an `alttext` attribute on the `math` element.

## Tables, images, figures

GFM tables render wrapped in `<figure class="table-scroll">` so wide tables scroll in their own container. Images require alt text: `![alt](src)` with empty alt is accepted only when the image is declared decorative by the empty alt itself being intentional — a missing alt attribute is a build refusal, and the distinction between empty-and-intentional versus absent is preserved from source. Images emit intrinsic `width` and `height`, and the build generates modern-format variants with fallback:

```html
<figure>
  <picture>
    <source type="image/avif" srcset="…" /><source type="image/webp" srcset="…" />
    <img src="…" width="1200" height="800" alt="…" />
  </picture>
  <figcaption>Optional caption, taken from the image title text.</figcaption>
</figure>
```

## Parsing order and the AST

Front matter parses first; then the body parses to an abstract syntax tree of typed blocks and inlines in which every house construct is its own node kind carrying its source span. Relations extract from the AST (wikilinks, transclusions, citations, inline fields), so a cell's connectivity derives entirely from one parse. The AST — not any HTML string — is the canonical body form that enters the cell's content address; HTML is a projection of it. Two sources that parse to the same AST are the same revision.
