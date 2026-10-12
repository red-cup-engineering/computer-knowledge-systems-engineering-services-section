# GEODE collaborative Markdown law — alpha

Status: implementation specification, 2026-08-27. This document narrows
Phase 1.5 in the [roadmap](./roadmap.md). It specifies the behaviour needed
before choosing a general-purpose collaboration package; it does not make the
Markdown carrier, TUFTE, QwzSpace, EAVT, or SEAVT responsible for one
another's meanings.

## Decision

The alpha uses an **authoritative sequenced text-operation log**. A workspace
kernel is the only admission authority for a document session. It assigns a
strictly increasing `documentRevision` and deterministically rebases each
admissible splice over the already admitted suffix after its declared basis.
Clients optimistically apply their own operation, then reconcile against the
same admitted sequence.

This is deliberately OT-compatible, not a claim to have selected a complete
OT implementation. It buys immediately-local editing, simultaneous edits,
bounded server authority, replay, and a precise upgrade seam. A CRDT may
replace the text-state implementation later only if it preserves the records,
receipts, checkpoints, and laws below. A pure last-writer-wins file protocol is
not acceptable: it loses concurrent admitted edits. A CRDT is not required in
alpha because Markdown materialization, external editing, and a single
authoritative filesystem writer already need ordered policy admission.

## Terms and durable records

`documentId` is GEODE's stable handle for a currently admitted Markdown path;
it is not a pathname. A rename changes its carrier binding, not its history.
`carrierDigest` is the digest of exact UTF-8 bytes in a materialized Markdown
checkpoint. `documentRevision` is a positive integer within one history epoch.
An external competing carrier starts a reconciliation procedure; it must never
be silently written over.

Every client instance has a durable random `actorId`, an ephemeral `sessionId`,
and a strictly increasing durable `actorSequence`. The operation identity is
`opId = actorId + ":" + actorSequence`; retries must reuse it. The server
derives `admittedAt` and `documentRevision`; clients never supply either.

```json
{
  "kind": "geode.document.splice/v1",
  "opId": "actor:marigold:41",
  "actorId": "actor:marigold",
  "sessionId": "session:browser-7",
  "documentId": "document:notes-alpha",
  "epoch": "digest:2e3…",
  "basis": { "documentRevision": 17, "checkpointDigest": "sha256:2e3…" },
  "splice": { "start": 12, "deleteCount": 0, "insert": "bright " },
  "intent": "editor.insert"
}
```

Offsets are Unicode scalar-value offsets in the canonical in-memory UTF-8
decoded source, never UTF-16 DOM offsets. The editor adapter owns conversion
at its boundary. Invalid ranges, a missing basis, wrong epoch, unauthorized
actor, malformed source, or a reused `opId` with different bytes are refusals.

The admitted record retains the original proposal plus its transformed splice,
before fragment, resulting source digest, and revision. It is the replayable
operation history; it is not itself EAVT or SEAVT. A separate witness adapter
may assert proposal/admission/checkpoint facts using those carriers.

## Admission, causality, and convergence

The kernel preserves all causal predecessors: an operation may only name an
already admitted revision in its active epoch. For concurrent operations with
the same basis, total order is `(arrival admission slot, opId)`. The authority
transforms the new splice forward through every admitted operation after its
basis. Equal-position insertions use that total order; delete/insert overlap is
resolved by the same deterministic transform rather than by silently dropping
either proposal.

The resulting law is stronger than “last request wins”:

1. The same `opId` returns its original receipt exactly (idempotency).
2. Every admitted operation appears exactly once in the sequence.
3. Folding the initial checkpoint plus the admitted records through any client
   yields byte-identical source and revision.
4. A client must never present a local draft as admitted until it receives the
   corresponding receipt.
5. A refusal does not mutate shared source; it includes enough current state
   to rebase or ask the person to resolve it.

The source is not normalized merely for collaboration: byte and line-ending
policy belong to the Markdown transaction service. The text law operates on
the exact canonical source that its active checkpoint declares.

### Minimal acceptance fixtures

These are fixtures for the eventual domain-neutral text-operation test suite.

| Initial source | Proposals, same basis | Required admitted source |
|---|---|---|
| `ab` | A inserts `X` at 1; B inserts `Y` at 1; A's `opId` sorts first | `aXYb` |
| `abcd` | A deletes `[1,3)`; B inserts `X` at 2 | `aXd` |
| `hello` | retry the same `opId` after receipt | still `hello!`, same receipt |
| `hello` | proposal declares the wrong epoch/digest | refusal, source unchanged |

The second fixture specifically prohibits “delete wins” as an unexamined
policy. The transform must retain B's admitted insertion at the surviving
boundary; exact affinity rules are versioned alongside the transform codec.

## Optimism, acknowledgement, and refusal

The browser keeps an ordered local overlay of its submitted-but-unacknowledged
operations. It applies its own proposal immediately and shows it as `pending`.
When remote admissions arrive, it folds the settled prefix then rebases the
overlay. When its receipt arrives, it removes the matching `opId` from the
overlay and records the assigned revision. A reconnect requests admissions
after its last acknowledged revision; if unavailable, it receives a full
checkpoint plus the retained suffix.

A receipt is both a UI outcome and durable evidence:

```json
{
  "kind": "geode.document.receipt/v1",
  "opId": "actor:marigold:41",
  "status": "admitted",
  "documentId": "document:notes-alpha",
  "epoch": "digest:2e3…",
  "documentRevision": 18,
  "admittedSplice": { "start": 12, "deleteCount": 0, "insert": "bright " },
  "sourceDigest": "sha256:7a1…",
  "checkpoint": null
}
```

A refusal has a closed reason code (`invalid`, `unauthorized`, `stale-epoch`,
`history-pruned`, `external-conflict`, `cannot-transform`, `policy`) plus a
human message, the current epoch/revision/digest, and where safe the current
checkpoint and/or a rebase preview. It never claims that a rejected operation
was shared. TUFTE presents these as form field errors, conflict forms, and
history entries; GEODE owns the decision.

## Checkpoints and ordinary Markdown

Checkpointing is a policy event, not a second mutation path. At a chosen
admitted revision, the kernel folds source, invokes the digest-guarded
Markdown transaction service with the current carrier digest, and only then
emits `geode.document.checkpoint/v1` containing revision, before/after carrier
digests, transaction receipt, and source digest. The filesystem writer is the
only writer. A failed compare-and-swap leaves the operation sequence intact and
starts external reconciliation.

The alpha checkpoints after a short quiet period, explicit Save, and before
session compaction. It may compact operations only after retaining a verified
checkpoint plus a suffix sufficient to serve configured reconnect/undo
windows. Replay from the checkpoint and retained suffix must reproduce the
recorded source digest; periodic audit performs that check.

## External filesystem reconciliation

A watcher reads the changed carrier and computes its digest. If it equals the
last materialized digest it is ignored. Otherwise GEODE creates an observed
external revision; it does not emit a normal user splice and never overwrites
it with autosave.

* If there are no uncheckpointed admissions, adopt the external bytes as a new
  checkpoint and new epoch, preserving a witness link to the prior epoch.
* If there are uncheckpointed admissions, construct a three-way proposal from
  the last checkpoint, admitted source, and external bytes. A clean,
  deterministic merge is shown as a named `external.reconcile` proposal and
  still requires policy admission. An ambiguous merge is a refusal/conflict
  form containing both recoverable variants; no hidden conflict markers are
  written into Markdown.
* An external deletion or rename is likewise observed first. A human or policy
  command chooses retain-as-deleted, rebind, or recover; operation history is
  never reinterpreted against an arbitrary new path.

## Causal undo and history playback

Undo is a new, attributed `geode.document.undo/v1` proposal naming one earlier
admitted `targetOpId`, never deletion from the log. The server derives the
target's inverse from its retained before fragment, transforms that inverse
from the target revision to the current revision, and admits it only when the
transform is unambiguous under the codec's affinity rules. Otherwise it
refuses with `cannot-transform` and offers a manually reviewable revert
proposal. This is causal undo: it undoes the visible consequence of a known
act without erasing concurrent work or another actor's attribution.

History playback selects a checkpoint/revision and folds the same admitted log
through the same projection code as live state. It is read-only until a user
explicitly forks or proposes a revert; “time travel” cannot silently make an
old source authoritative.

## Presence is ephemeral session projection

Presence has `{actorId, sessionId, documentId, observedRevision, cursor,
selection, label, color, expiresAt}` and is accepted only for an authenticated
session. It is rate-limited, expires without a leave event, and is neither a
Markdown mutation nor a durable document operation. Join/leave/session audit
may be witnessed separately if deployment policy requires it. Cursor and
selection locations are transformed through admissions exactly like a local
overlay; they disappear when their session expires.

## Upstream seams and non-goals

The reusable substrate should expose identity validation, append-only records,
ordered replay, checkpoint/suffix verification, and text-splice transform
contracts without importing GEODE, Markdown, browser, or QwzSpace vocabulary.
GEODE supplies document handles, authority, filesystem materialization, and
receipts. QwzSpace may consume the log/replay/presence substrate but retains
rooms, ticks, spatial interest, and world policy. EAVT and strict SEAVT remain
witness/projection options, not the operation log schema.

Alpha deliberately excludes offline peer-to-peer authority, file attachments,
block-level CRDT identity, encrypted sync, and merge of arbitrary binary
files. Each requires a later law and fixtures; none should be smuggled in as
an exception to the Markdown transaction boundary.
