---
title: VICTOR Design Rules
date-created: 2026-08-26
status: draft-for-review
tags:
- victor
- design
- accessibility
- typography
- theming
- writing
---


These are the rules every VICTOR page, theme, and template obeys. Each is stated completely; where a rule is machine-checkable it is enforced by the conformance suite (check identifiers in the SAS), and where it is judgment it is stated as the criterion a reviewer applies. The rules are the house design theory made operational; they need no outside document to apply.

## The governing idea

A page must orient before it interprets: the reader learns how to move and what is structurally important before any content asks to be understood. The failure this guards against is premature closure — ornament, single-perspective composition, or rhetorical polish that lets a reader feel finished before they have grasped the structure. Five observable outcomes define success: **glance-direction** (a fast first grasp of where to look and act), **non-linear reading** (the page supports scanning, jumping, and revisiting rather than forcing linear flow), **felt weight** (perceptual mass is used as structure, never decoration), **peripheral uptake** (the page is legible coarse and blurred, before foveal inspection), and **memetic repeatability** (the design is teachable as constraints and checks, so anyone can re-perform it — which is what this note is).

Every mark must earn its cost by contributing to structure, evidence, or navigation. Decorative salience that competes with structure is theft of the reader's perceptual bandwidth. Overview and detail must never contradict each other; density is acceptable only while hierarchy and grouping stay honest; a graphic never implies more certainty than its underlying structure supports.

## Structural joints

Any new structural commitment — a schema, a vocabulary, a component boundary — must be four things at once: **soft** (a guideline the author applies, not a formal system that enforces itself), **local** (it lives where it is used, with no global consistency obligation), **reversible** (removable by editing in place, with no cascade of downstream breakage), and **evidenced** (a real consumer exists today, not hypothetically). A joint failing any of the four is refused. Growth of every closed set follows earned addition: a new member enters only when three independent, cited, already-existing uses demand it.

## Contrast and color

Body text against its background: at least 7:1. Text at display sizes — 24px and larger at regular weight, or 18.66px and larger at bold — at least 4.5:1. Non-text meaningful elements (borders that signal, focus indicators, icons): at least 3:1. These ratios hold in the light rendition, the dark rendition, and the grayscale print rendition; a theme failing any pairing in any rendition does not build. Color is never the sole signal for any distinction: every color-coded state also differs by text, weight, or mark, and every page survives grayscale.

A theme defines exactly seven color tokens, each with a light and a dark value. Exactly one token is the jewel — the accent — and a page uses at most one jewel-colored element class. Two-ink print economy is the reference discipline: if it would not survive as black plus one ink, it is over-colored.

## Typography and space

A theme declares at most three type families, self-hosted as woff2 from the site's own origin — no font CDN, ever — each with a real system fallback stack. At most four weights are declared and at most two are used in any one artifact. Exactly seven type sizes exist, on one scale, and exactly four roles consume them: display, heading, body, annotation. At most one display-size element appears per page. Spacing uses exactly eight units on one scale; no ad-hoc pixel values. Page geometry is one of three (narrow, standard, wide), and information density one of three modes (compact, standard, generous); the reading column takes generous margins, and flourishes are confined to margins and separators — never intrusions on the reading column.

## Semantic structure

The page anatomy is fixed and maps one-to-one onto semantic elements: masthead is `header`, breadcrumb is `nav`, the reading column is `main`, the margin reservoir is `aside`, the colophon is `footer`. No `div` or `span` is used where a semantic element exists. The skip link is the first focusable element. Heading levels never skip. DOM order, tab order, and reading order equal the authored order everywhere, even when CSS repacks visual position; `tabindex` values other than 0 and −1 are forbidden. ARIA is last resort: no ARIA attribute where a native element already carries the semantics, and no role that contradicts the element. `outline: none` is forbidden unless a visible replacement focus style is present; the default focus style is a 2px solid outline in the ink color, offset 2px.

Every published page carries the masthead (site identity) and the colophon (page provenance: created date, revised date, status, license, revision history, corrections). Every published page carries the reservoir, even when empty. Dates render in ISO 8601 only.

## Resilience

The page's argument survives with CSS disabled: semantic HTML in authored order, complete content, working links. It survives with JavaScript disabled: every link, footnote, and disclosure functions. Print is a first-class rendition, not an export: navigation chrome drops, sidenotes sit true to the margin, link URLs surface after their anchors, and the result passes the grayscale contrast rule. A resource that requires JavaScript to function, or requires a screen to render, is not a VICTOR page.

## Writing

Headings are specific enough to function as a table of contents standing alone; "Overview" and "Information" are not headings. Sections answer one question each; a section answering two is split. Orientation precedes detail; concrete examples precede formal definitions. Numbered lists carry ordered steps; bullet lists carry unordered items; tables appear only where a reader matches conditions to outcomes. Prose in system documents uses one voice: noun-clause, present tense, zero marketing register — read three paragraphs aloud at half speed and count imperatives and marketing words; the count is zero. Every list or view that appears ordered states its ordering principle in visible text; arrangement never implies a relation the model does not assert.

## Honesty surfaces

Retractions display; corrections display with dates; nothing is deleted — retirement, redirects, and marked retraction replace deletion. Visual adjacency in any tiled or grid surface must not imply semantic distance; force-directed and similarity-implying layouts are refused as defaults. When the system declines to do something, the refusal is shown as data with its reason, in the same channels as success.
