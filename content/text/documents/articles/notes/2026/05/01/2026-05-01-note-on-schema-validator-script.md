---
title: Operational Records Schema Validator
description: Defines implementation tasks for a schema validator that detects field conformance violations in operational records and surfaces findings for review.
date-created: 2026-05-01
type: note
name: schema-validator-script
keywords:
  - schema-validation
  - operational-records
  - entity-schemas
  - schema-conformance
  - schema-violations
specialization: plan
horizon: week
work-type: procedure
serves: [operations-loop, library-as-knowledge-base]
depends-on: [operational-records-as-dag]
contributes-to: [agentic-orchestration]
produces: schema-validator-with-feedback-loop
status: draft
in-service-of: lib/emsenn/services/561-group/services/561-group-services-section
---

Nothing currently checks that the operational records conform to the schemas the dispatch script depends on. Persona files use `office:` AND `holds-office:` AND `installed-in:` interchangeably. Some agents have empty `charter-bindings:` blocks; some lack them entirely. Tasks vary in which fields they carry. As the corpus grows, drift will only worsen.

A schema validator reads each entity type's expected fields, walks the corpus, reports violations, and surfaces patterns. Output goes to `engineering/records/findings/triage/` for the reviewer / first-officer to act on. This makes the schema a feedback loop, not a moving target.

## Tasks

- `validator-define-entity-schemas` — for each entity type (agent, office, officer, persona, task, plan, project, skill, charter-rule), define expected required + optional fields and value constraints. Place at `operations/engineering/triage/operations/engineering/services/dispatch/triage/schemas.py` (or sibling `validator.py`)
- `validator-implement-walk` — script walks all entity files, parses frontmatter, applies the relevant schema, accumulates violations
- `validator-emit-findings-report` — output a Markdown report under `records/findings/triage/<date>-schema-violations.md` listing each violation with file path and missing/wrong field
- `validator-add-pre-commit-mode` — a flag that exits non-zero on violations; can be wired into CI or a pre-commit hook later
- `validator-fix-persona-key-inconsistency` — first concrete fix surfaced by the validator: pick `holds-office:` as canonical and rewrite all persona files

## Acceptance

- `validator.py` exists, walks the corpus, produces a findings report
- Running it surfaces at least 10 real schema violations
- The persona files all use `holds-office:` consistently after the cleanup task
