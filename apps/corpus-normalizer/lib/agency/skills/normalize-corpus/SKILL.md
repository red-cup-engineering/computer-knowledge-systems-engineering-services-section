---
name: normalize-corpus
description: Relocate repository content into a named destination while transforming every atomic unit to satisfy that destination's modeled form. Use for moves, consolidation, archive recovery, glossary or triage intake, notebook or application recovery, service-section normalization, bibliography intake, and legacy comparison.
---

# Normalize a corpus

Use `scripts/corpus-normalizer.mjs` for this — it is the routing and transformation engine. See the [README](../../../../README.md) for full command syntax and supported destination forms. Don't reimplement its routing rules by hand or write files into the destination directly.

## Workflow

1. Run `route SOURCE DESTINATION --output ROUTE.ndjson`, then `explain-route ROUTE.ndjson` to see the proposed tasks and any invalid records.
2. Check the proposed tasks against what was actually asked for. If a task is classified or transformed wrong, fix the bug in this application, add a regression test for it, rerun `npm test`, and regenerate the route — don't hand-edit the plan. Ask the user only when the intended destination or ownership can't be derived from the request and the repository.
3. Handle one task at a time with `prepare-task`: run `explain` on the staged plan, `materialize` it into a scratch directory, `validate` the result, then `apply` and `verify`. Finish the task with `receipt-task`, which re-verifies the applied result rather than trusting that the source files were deleted.
4. For an archive task: unpack it into host temp storage only (never into the repo), route the extracted tree recursively, and keep the archive until `retire-archive` confirms every extracted file resolved, using the nested route's completion as proof.
5. When done with a whole route, run `complete-route` and confirm no task is left invalid or unresolved before reporting success.

When the destination is a legacy library, run `assess-legacy` first: fuse divergent-but-useful content into the live tree, drop content already covered by live or an existing legacy copy, and keep a dated legacy copy only for content that's genuinely divergent and not yet fused. Run all of this from a fresh scratch directory, never inside the repository being normalized — plans, staged projections, and extracted archives don't belong checked into content or code.

Use `analyze-similarity` for review evidence about possible duplicates; it never merges or deletes on its own — a human or a follow-up task decides what to do with the evidence.

Don't skip the `explain`/`validate`/`verify` steps to go faster, don't exclude files silently, and don't treat a matching file count or hash as proof that a directory is fully and correctly normalized — actually run `verify`.
