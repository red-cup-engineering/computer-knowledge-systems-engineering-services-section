---
title: "Normal Practice and Ceremony Removal"
description: "What counts as verification theater and stateful prose in documentation, and what conforming to corpus conventions means in practice."
date: 2026-08-19
keywords:
  - normalization
  - ceremony
  - conventions
  - documentation
---

A document serves its reader's next action. Everything else is ceremony. Remove it.

## Verification theater

Prose that narrates the story of proving something instead of stating what is true is a
work log, not documentation. The test file is the proof; the doc states the fact (for
example, "replay is deterministic") and, at most, points at the test. Verification
narratives, counts-of-checks-performed, adversarial-pass boasts, and "honest weaknesses"
sections that just restate the issue tracker do not belong in docs. Keep true claims,
stated plainly, with a pointer to the executable check where one exists.

## Stateful prose

Text that only makes sense from inside the session that wrote it - phrases like "as of
this pass," dated correction-blockquotes layered on corrections, references to what a
prior report claimed - does not belong in a README or reference doc. A reader arriving
later needs the current truth in the present tense; history belongs in dated notes, not
in READMEs. Session narration, self-reference to the writing process, and "what changed
this pass" logs outside dated notes should be rewritten to state what the thing is, how
to use it, and where its boundaries are.

## Corpus conventions

- **Notes**: `content/.../documents/articles/notes/YYYY/MM/DD/YYYY-MM-DD-slug.md`, or a
  flat dated form `YYYY-MM-DD-note-on-<topic>.md` where a section's siblings already use
  it - match the section's own established shape rather than inventing a new one.
  Frontmatter is the standard static-site set: `title`, `description`, `date`, `tags`.
- **In-tree docs** (README, DESIGN, ARCHITECTURE, ADR inside a package or app): plain
  markdown, no frontmatter. The title is the H1.
- **Specifications** shaped as corpus documents live under
  `content/text/documents/specifications/` with date-prefixed filenames.
- **READMEs** state what a package is, how to run it, and its real interfaces. Test
  counts, where mentioned at all, are plain current facts, not narrated achievements.

## What is not ceremony

Executable checks themselves - tests, walkers, validators - are the opposite of
ceremony and should be kept and maintained. Honest limitation statements (for example,
"org support reads titles and links only") are contract, not theater. Dated notes
recording decisions or evidence are the correct home for history: ceremony removal moves
narration there, or deletes it, but never deletes a recorded decision. Domain terms such
as ledger, manifest, witness, or receipt stay wherever they name a real, specific
engineering object rather than governance vocabulary wrapped around a trivial operation.
