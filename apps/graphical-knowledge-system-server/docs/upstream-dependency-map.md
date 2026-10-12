# GEODE upstream dependency map

Status: working architecture record, 2026-08-27.

GEODE is an integration application over reusable computer, data, text, filesystem, interface, and publication capabilities.
It must not become the accidental owner of primitives that QwzSpace, Cartridge, VICTOR, or another application can also use.

## Dependency doctrine

Dependencies point from domain applications toward smaller contracts:

```text
data carriers, identity, logs, folds, deltas, and filesystem transactions
              |                    |                    |
          TUFTE forms          GEODE kernel        QwzSpace runtime
                                   |
                         VICTOR publication adapter
```

- TUFTE is the canonical browser frontend and owns forms, presentation topology, and the browser action/receipt/refusal lifecycle.
- GEODE owns Markdown-workspace commands, admission, collaboration policy, materialization, and receipts.
- QwzSpace owns rooms, ticks, spatial interest, presence policy, and game/world composition; it imports generic logs, folds, snapshots, and deltas.
- Cartridge owns the game manifest and game-specific deterministic replay contract; it imports generic canonical log and fold primitives.
- VICTOR owns catalog assembly and reproducible web releases; it consumes an admitted GEODE snapshot through an adapter rather than becoming GEODE's runtime.

## Carrier and semantic restrictions

An operation log is not automatically EAVT.
It records ordered proposed or admitted operations with the metadata required by its concurrency law.
An application may explicitly project operations into EAVT witnesses.

Generic EAVT is not automatically SEAVT.
EAVT supplies a JSON-valued entity/attribute/value/time carrier and its generic identities and projections.
SEAVT restricts the entity, attribute, and value coordinates to admitted Semiotic Resource Name surfaces with closed Relation Model Notation meanings, then adds explicit semantic identity and custody behavior.

Neither EAVT nor SEAVT should acquire application-specific collaboration, game, Markdown, or browser-form semantics.
Those meanings enter through named adapters or restrictions.

## Collaborative document strata

```text
Markdown carrier       durable portable checkpoint
document operations    admitted edits between checkpoints
session projection     collaborators, cursors, drafts, acknowledgements
witness projection     claims about proposal, admission, refusal, and commit
```

Markdown remains usable without GEODE or its collaboration history.
The history must remain replayable into an identical admitted checkpoint, and an external filesystem edit must become an observed competing revision rather than a silent overwrite.

## Extraction test

A capability moves upstream only when all of these are true:

1. at least two independent consumers need the same law;
2. its input and output vocabulary is domain-neutral;
3. deterministic behavior can be tested without constructing either consumer application;
4. effects, custody, transport, and semantic interpretation stay separate where they can vary independently;
5. existing consumers can migrate through explicit compatibility adapters or versioned contracts.

Code that merely looks reusable does not pass this test.

## First extraction pass

The first implementation pass establishes these concrete boundaries:

- `event-stream-data-service` now owns domain-neutral validated queues, append-only records, incremental projections, and numbered-step replay. QwzSpace consumes it through thin adapters while retaining room and game policy.
- The same event-stream service now owns bounded keyed numbered history and its explicit cursor-coverage refusal law. QwzSpace retains only the tick-specific resume adapter; session authority, presence, checkpoints, persistence, and broadcast lifecycle remain domain-owned.
- `json-codec-service` now supplies canonical JSON bytes to `@561-group/computer`. Computer retains strict row admission, durable POSIX append/read behavior, folding, and bilattice projection.
- `canonical-json-service` supplies a browser-safe strict canonical JSON profile. Cartridge explicitly names and preserves its historical `canonical-hash-v1` behavior because `undefined` coercion participates in stored hashes; adopting the strict profile requires a manifest-versioned read-v1/write-v2 migration rather than a silent import swap.
- `write-markdown-file-service` owns path-confined atomic replacement at an expected SHA-256 content revision. GEODE supplies the admitted edit command and projects its receipt or refusal through TUFTE.
- Strict SEAVT remains a semantic witness restriction over generic EAVT rather than a synonym for an operation log.
