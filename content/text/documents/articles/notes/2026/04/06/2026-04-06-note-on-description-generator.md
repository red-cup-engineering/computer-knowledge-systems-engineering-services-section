---
title: Entity Description Generator
description: Describes a template-based natural language generation approach to produce accessible summaries of entities without using LLMs.
date-created: 2026-04-06
type: note
name: description-generator
keywords:
  - entity-description
  - template-based-nlp
  - jargon-simplification
  - natural-language-generation
  - predicate-classification
specialization: plan
application: publishing
project: help-system
in-service-of: lib/emsenn/services/561-group/services/561-group-services-section
---

## The problem

Entity descriptions are written by insiders for insiders. "The algebra. message(entity, payload) is the ONE primitive." means nothing to someone who doesn't know what a fiber, a payload, or FARS is. A good description — like an Open Graph description — makes sense to someone with zero context.

## The concept

An entity — the describer — that you message with another entity's id. It reads that entity's fiber, picks out the structurally important predicates, and generates a human-readable sentence or two using NLP template generation. No LLM.

```
message(describer, {entity: "fars-core"})
→ "FARS is a software system that processes structured files into a queryable knowledge graph."
```

## How it works (NLP, not LLM)

Template-based natural language generation from structured data:

1. **Predicate classification**: Group by role — identity (title, type), relations (part-of, serves, depends-on), capabilities (exports, provides), metadata (file-path — skip).

2. **Template selection by type**:
   - `system` → "{title} is a {type} that {description-simplified}. Part of {part-of}."
   - `term` → "{title} is a concept in {domain}. {description-simplified}."
   - `plan` → "{title} is a plan to {goal-simplified}."
   - `task` → "{title}: {goal-simplified}. Assigned to {assigned-to}."
   - `office` → "{title} is a role responsible for {specialty}."

3. **Jargon simplification**: A small dictionary maps insider terms to outsider equivalents. "fiber" → "data record", "settle" → "resolve", "predication" → "structured assertions". Remove parenthetical asides. Cap at ~200 characters.

4. **Relation rendering**: `part-of: X` → "part of X", `depends-on: [X, Y]` → "depends on X and Y".

## Why NLP not LLM

- **Deterministic**: Same fiber → same description. No hallucination.
- **Fast**: Template fill, no API call.
- **Auditable**: Wrong description → fix the template or dictionary.
- **Composable**: The describer IS an entity. Its templates are predicates on it. Enriching the describer enriches all descriptions.

## What this enables

- CLAUDE.md generation with descriptions outsiders can read
- Help system with legible summaries
- Open Graph / web meta descriptions
- Onboarding: query any entity, get a sentence that makes sense

## Open questions

- Where does the jargon dictionary live? As predicates on the describer entity?
- Multiple register levels? (one-line, paragraph, full reference)
- Does `summary` (from help-system plan) become the cached output of the describer?
- How thin can a fiber be before the describer produces garbage?
