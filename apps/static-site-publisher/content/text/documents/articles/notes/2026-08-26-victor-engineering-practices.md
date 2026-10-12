---
title: VICTOR Engineering Practices
date-created: 2026-08-26
status: draft-for-review
tags:
- victor
- engineering
- testing
- releases
- practices
---


The practices that govern how VICTOR is built, tested, released, and documented. Each was proven or paid for in a prior house system; the reason travels with the rule so the rule survives without its history.

## Documentation is executable

The handbook's every code example carries a doctest identifier and runs in the test suite; documentation that drifts from behavior fails the build. The refusal catalog is documented the same way: each refusal's handbook entry executes the path that raises it. Reason: prose about code decays silently; executed prose cannot.

## Test against the real platform at least once

A hand-rolled DOM test double once let a full capability outage ship behind a completely green suite, because the fake never modeled realm-sensitive platform constructors — the interactive layer was dead while 72 of 72 tests passed. Fast fakes are fine for the inner loop; every release candidate additionally runs against a real browser engine, and a green count is never reported as a capability claim. The parity check between live and frozen output exists for the same reason: capabilities must be demonstrated, not inferred from tests passing.

## Benchmark adversarially, publish regressions

Performance and size claims are made against named competitors and against the do-nothing alternative (the same feature hand-rolled), on stated workloads. When a release regresses — as a predecessor once did, turning a local patch slower than a competitor's network round trip — the regression, its cause, and its fix are published in the project's own competitive-position document. Reason: honest self-measurement is the only measurement that steers.

## Zero-build, checked-in artifacts

The published package is the checked-in source: ES modules with hand-written type declaration files, no bundler, no transpiler, no build step between the repository and the registry. A verify script syntax-checks every module. Reason: every build layer is a place behavior and artifact can diverge, and the house has never needed one.

## Generated files are never hand-edited

Any file the build derives (catalogs, indexes, stylesheets from theme manifests) is marked generated, and a test fails when the checked-in copy is stale against the generator. Hand edits to generated files are lost by design. Reason: a file with two writers has no truth.

## The deployment carrier owns only configuration

All behavior lives in the importable package; a deployment is a near-empty repository holding provider configuration and an import. No provider concept — worker runtime, edge storage, container, platform CLI — appears in the package. Reason: this kept a live production service portable, and it keeps host lock-in at the edges where it can be cut.

## Releases rehearse their own failure

Before traffic moves to a new build: run it in shadow against the live profile, diff its output against what production currently serves, and rehearse the rollback. A release that cannot demonstrate its rollback has not finished releasing. Reason: a production newsroom ran this way through daily autonomous publishing without a lost edition.

## Upgrades of healthy dependents are deliberate

A live, healthy deployment pinned to an older version stays pinned until upgrading is chosen as its own step with its own verification — even when the newer version is a safe drop-in. Reason: a pilot that works is evidence; disturbing evidence casually is how outages arrive unobserved.

## Multi-surface parity

When the catalog gains a consumer surface, terminal and browser rank equally: the same generated catalog serves both, and neither is the degraded form of the other. Reason: parity forces the data contract to be real instead of shaped around one renderer.

## Scope is bounded by named refusals

Every capability the system declines is written down with its alternative, and the two house failure stories stay attached as warnings: a company home page that accreted a blockchain ledger, custom binary codecs, and a payment protocol before being stripped back to eighty lines of static HTML; and a content pipeline buried under a philosophical accountability algebra until it was retired whole. The theory grounds the model; the serving layer stays plain. An app repository also stays free of empty scaffold directories: structure is added when content exists to fill it.

## State is legible to the next session

Work-in-progress, decisions, and pending obligations live in dated notes in the repository, written so a reader with only the repository can continue the work. Chat transcripts, scout reports, and human memory are not storage. This note and its siblings are the practice applied to itself.
