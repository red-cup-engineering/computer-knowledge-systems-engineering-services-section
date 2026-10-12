---
title: "Curry-Howard/Yoneda Vault Normalizer Design Analysis and Synthesis"
description: "Adversarial comparison and synthesis of three markdown-vault-normalizer designs, verified against the actual 561 corpus codebase, converging on the vaultward MVP baseline."
date: 2026-06-15
status: salvaged-from-tmp
source: "/tmp/claude-1001/-home-emsenn-561-group/61d08d99-0b44-48c5-937f-d350241f13fe/tasks/w80j95s98.output"
---


A deep multi-agent exploration of the 561 research corpus: map its concepts, formalize the Curry-Howard/Yoneda pathing apparatus, inventory reusable/broken tooling, and converge on a markdown-vault-normalizer design dossier.
Three candidate designs were produced, ranked by a judge, and audited by a critic against the actual repository code.

## Dossier outcome

A dossier was written that synthesizes **Design 3 (vaultward)** as the baseline, grafting:

- Design 1's ranked-total signal pipeline, deterministic max-arrows-in root selection, and canonical-route mitigation;
- Design 2's strict two-witness separation with per-witness provenance, CitationCensus resolution tiers, and the `explain` verb;

and applies every adversarial correction verified against the actual repo:

- **TRC is not a reusable proof-checker** — `audit`/`realize`/`markdownDataform`/`detectType`/`project`/`locate` are NOT exported functions (confirmed via `grep`; only EAVT/fold primitives like `unfoldSchema`/`foldSchema`/`cohere` are).
  The gerund/object grammar is planning prose only; vaultward owns the classification, fold, and scripts-under-object=0 gate.
- **Frontmatter codec throws on two-level nesting** (confirmed at `frontmatter.mts:71`) — taxonomy uses flattened parallel scalar-array keys, not `taxonomy.<scheme>:{id,notation}` sub-maps.
- **Dependency target is `@561-group/content` `./codecs/*`**, not the orphaned `@561-group/content-codecs` (confirmed: `content` exposes `./codecs`, `./codecs/frontmatter`, `./codecs/references`, `./codecs/vault`).
- **`internalReferenceTargets` returns `{field,kind,value}` and does not resolve** (confirmed at `references.mts:463`) — resolution is vaultward's own work.
- **`genreConceptScheme` is a genre vocabulary, not subject SKOS** — the subject TTL reader is new code.
- **No `address`/`termOf` inverse to lift** — vaultward ships its own deterministic fold and round-trip test.
- The **archive-api.ts import break is real** (lines 20/28 import `@561-group/content-codecs`) and is scoped as Milestone 0.
- The **move skills exist on disk** (`.../organizing-topical-archive/scripts/move-udc-file-plan.mjs`), so the apply/reverse story is grounded.

The dossier has all nine required sections, real file paths throughout, and an MVP-first phased plan.

## Judge ranking

**Winner: Design 3: vaultward (mvp-pragmatic-reuse).**

### Design 3: vaultward (mvp-pragmatic-reuse) — score 84

The only design whose technical claims survive contact with the actual code.
It correctly read the frontmatter codec's HARD one-level-nesting limit (`encodeFrontMatterDocument` literally throws 'nested maps go one level deep only') and flattened per-scheme ids to parallel scalar-array keys — Designs 1 and 2 both assume a two-level `taxonomy.udc:{id,notation}` map that the codec REJECTS, so their flagship frontmatter shape does not encode.
It is the most honest about TRC: it explicitly states 'TRC validates object placement well but has no morphism/gerund half yet... vaultward must carry its own lightweight scripts-under-object check' — and indeed TRC's `index.mts` exposes no `audit`/`realize`/`markdownDataform`/`detectType` FUNCTIONS (only types and `foldSchema`), so Designs 1 and 2's reuse of TRC as the 'acceptance gate / proof-checker' is largely fictional.
It is honest that subject-SKOS degrades to near-empty off-corpus (true: `genreConceptScheme` is a GENRE-facet scheme, not a UDC subject resolver).
The total cascade with `relating//library//hacking/` guarantees a placement on a structureless Obsidian vault — actually shipping tomorrow.
Idempotence-as-fixpoint and the body-byte-equality preservation check are concrete and testable.
Loses points for the thinnest Yoneda/Curry-Howard treatment (the grammar is real but lightly engaged) and for the `relating/` dumping-ground risk it owns.
Highest score because the brief weights BOTH philosophy AND shipping-on-a-stranger's-vault, and only Design 3 is buildable as written.

### Design 1: Parser-first vault normalizer (deterministic-parser-first) — score 72

The most theoretically faithful and the most precise about the corpus's actual machinery: it correctly grounds on the real `termOf`/`address` round-trip law (`termOf ∘ address = id` genuinely exists in `lib/relating`, `posix-holography`, `memetic-topology`), correctly lifts `path.mjs` `pathOf` (which exists), correctly treats `MORPHISM_KEYS` as extensible config, and — uniquely — NOTICES and proposes to fix the real `archive-api.ts` break (`@561-group/content-codecs` does not resolve in the site's `node_modules`, yet `archive-api.ts` imports it).
Its ranked total signal pipeline (`RELATION_FIELDS` primary, wikilinks secondary, heading/ancestry tertiary), Yoneda-by-arrows-in dedup, deterministic root selection, and justification-record-per-placement are the richest and most legible inference story.
But two load-bearing claims are FALSE: (1) it asserts the two-level `taxonomy.udc:{id,notation}` block 'fits without extending the codec' — the codec throws on exactly that; (2) it treats TRC `markdownDataform`/`audit`/`realize`/`project` as a reusable acceptance gate when those functions do not exist.
It also overstates `genreConceptScheme` as a subject-taxonomy engine.
The single-route/edge-order risk in `pathOf` is real and it flags it.
Strong design undermined by reuse claims that don't verify.

### Design 2: CITE (taxonomy-citation-legible) — score 66

Cleanest CONCEPTUAL framing — two strictly-separated witnesses (taxonomy concept = codomain/aboutness; relation triples = morphism gerunds), truth-order never inferred, every placement citing exact concept URI + relation triples.
The witness-separation discipline and the `proof:`/`taxonomy:` two-fibration split are the sharpest articulation of the legible-not-embedding mandate.
But it shares Design 1's two fatal verification failures AND is more exposed: it EXPLICITLY commits to 'extend the frontmatter writer to emit the nested `taxonomy:` map' using `taxonomy.udc:{id,notation}` — i.e. it knows it needs a codec change but the change it specifies is the exact two-level nesting the codec is designed to forbid, so this is a real codec rewrite, not the 'one genuine addition' it claims.
It leans equally hard on the non-existent TRC `realize`/`audit`/`markdownDataform` surface.
Its taxonomy witness depends wholly on the slug→UDC TTL walk, which is entirely new code (`genreConceptScheme` won't do it), so the 'reuse-whole' framing is thinner than stated.
Honest about sparse-relation-graph flattening and dangling-target `hacking/` inflation.
A beautiful design resting on two unverified seams.

## Graft list (synthesis into the winner)

- **From Design 1:** the RANKED TOTAL signal pipeline (`RELATION_FIELDS` primary → wikilink/backlink secondary, flagged low-confidence → heading/ancestry containment tertiary) with each edge recording its source-signal + confidence — richer than vaultward's flat cascade and still fully legible.
- **From Design 1:** fix the REAL `archive-api.ts` import break first (re-point `sites/research.
  561.group/src/archive-api.ts` from the unresolvable `@561-group/content-codecs` to `@561-group/content`'s `./codecs/*` re-exports) — a verified, independent correctness win that should land before any normalizer work.
- **From Design 1:** deterministic root selection by MAX arrows-IN (Yoneda: a concept is identified by what points at it), ties broken shortest-path-then-slug — fully reproducible component roots, better than vaultward's implicit rooting.
- **From Design 1:** the canonical-route mitigation for `path.mjs` `pathOf` (pick shortest-then-lexicographic route deterministically before treating the path as identity) so 'same structure ⟹ same path' holds on structure, not edge-order.
- **From Design 2:** the strict two-WITNESS separation made explicit — taxonomy witness decides codomain/aboutness, citation/relation witness decides the morphism gerund — with each carrying its OWN source tag (path-derived | frontmatter-derived | confirmed), sharpening vaultward's single source field into per-witness provenance.
- **From Design 2:** the CitationCensus resolution TIERS for relation targets (path / def-unique / stem-unique / ambiguous / dangling) driving the `hacking/` quarantine decision — more principled than a binary resolvable/unresolvable split.
- **From Design 2:** the `--explain <note>` CLI verb printing the full per-witness derivation for a single file — excellent legibility/auditability affordance to add to vaultward's diff/census surface.
- **Shared correction for the synthesis (NOT from any design, found in code):** the frontmatter codec throws on two-level nesting, so Design 3's FLATTENED parallel-scalar-array taxonomy keys are the only encodable shape — adopt that, and do NOT inherit Designs 1/2's `taxonomy.udc:{id,notation}` sub-maps.
- **Shared correction:** TRC exposes no `audit`/`realize`/`markdownDataform`/`detectType` FUNCTIONS today (only types + `foldSchema`), so adopt Design 3's posture of carrying a lightweight built-in placement+scripts-under-object check rather than depending on a TRC proof-checker that isn't implemented.
- **From Design 1/2:** keep the optional LLM strictly as a last-mile LABELER (propose a gerund for an unmapped predicate / a prefLabel for an unlabeled object), written back to the plan for human review, structurally barred from choosing domain/codomain or routes — preserves the no-embedding-oracle mandate while handling lexicon gaps.

## Critic: faithfulness issues

- **TRC does NOT enforce object-inertness on disk.** The whole gerund/object grammar (`library/<noun>`=object, `<gerund>/`=morphism-at-domain, `<gerund>/library/<codomain>`, `scripts/` only under gerunds, the restricting/extending variance families) exists ONLY as planning prose in `trc-morphisms-as-gerunds-refactor.md`.
  The actual `lib/typed-resource-catalog/src/index.mts` has NONE of it: its `documentTypeDefinitions` are README/AGENTS/CLAUDE/specification/journal/dev-document with placements like `'{thing}/'` and `'{thing}/docs/dev/'`.
  There is no `library/`, `restricting/`, `extending/`, `restrict.mjs`, `witness.mjs`, `frontmatter.mjs`, or any `scripts/` tree in the package.
  No voidmath package exists.
  The Phase-1 journal entry (`2026-06-01-categorical-programming-paths-as-proofs.md`) was never written.
  All three designs treat this aspirational refactor as a built, reusable substrate; it is not.
- **The 'find `scripts/` under an object = zero' acceptance gate and the 'PT1-PT10 path-typing role discipline'** are cited by all three designs as reusable TRC validation.
  They exist nowhere in code.
  TRC's `audit()` only checks `x-trc-filename` / `x-trc-placement` / frontmatter conformance against the document-type schemas; it has no morphism/gerund/scripts awareness.
  `content-codecs` `conformRecord()` only checks genre-conflict, role-as-sentence, tags-as-list.
  The planning doc itself (line ~182, Out of scope) states PT1-PT10's 5 referenced sibling files are MISSING and encoding them as a fiber algebra is explicitly deferred.
  So this gate must be built from scratch by every design; 'reuse TRC's PT discipline as the acceptance gate' is unfaithful to what is on disk.
- **`path.mjs`'s `pathOf` emits the morphism segment as the bare STRUCTURE SLOT KEY** (e.g. `'specialization'`, `'object-projection'`), proven by `path.test.mjs` expecting `'being/specialization/library/mortal/...'
  `.
  It is NOT a gerund and assigns no vocabulary (the header comment is explicit: 'No vocabulary is assigned').
  All three designs assume the path fold produces GERUND segments and that `MORPHISM_KEYS` 'becomes the controlled gerund lexicon'.
  In reality the predicate→gerund mapping (requires→requiring, extends→extending, etc.) must happen BEFORE `pathOf`, by reshaping the structure so its slot keys ARE gerunds.
  `content-codecs` supplies non-gerund predicates (depends-on, requires, part-of, realizes...), so this transform is unbuilt new code, not a property of `path.mjs`.
  The morphism-name-is-the-key faithfulness is real, but the gerund-ness is invented by the designs.
- **Design 1's 'same structure ⟹ same path' guarantee is overstated** against the actual code.
  `path.test.mjs` line 34-36 only asserts idempotency of the identical call; it does NOT test route-stability when a target is reachable by multiple morphism chains.
  `pathOf` is BFS-first and returns the first-found route, so the path depends on edge insertion/iteration order.
  Design 1 honestly flags this as a risk, but its core thesis ('the path is a collision-free Yoneda address') is not actually guaranteed by the lifted code without the unbuilt canonical-route fix.
- **Designs 1 and 2 cite `genreConceptScheme`/`encodeGenreSchemeJsonLd`/`encodeGenreSchemeTurtle` as the SKOS emit for the SUBJECT taxonomy block.** That is a category error: `genreConceptScheme` builds a SKOS scheme from the GENRE facet (the type/kind/class frontmatter keys: tutorial, guide, concept, reference...), NOT from UDC/subject classification.
  Feeding it for the `taxonomy:` block would emit a vocabulary of document-genres, not subjects.
  The actual subject-taxonomy resolution would have to be a new TTL reader over `udc-archive-bindings.ttl` (which the designs also describe building) — so `genreConceptScheme` is misattributed as the subject-SKOS engine.
- **`internalReferenceTargets` returns `{field, kind, value}` and its own docstring states 'Does not resolve targets'.** It does NOT yield typed edges `{domain, codomain, predicate}` as all three designs repeatedly assert ('Each is a typed edge {domain=this file's object, codomain=resolved target object, predicate}').
  Domain/codomain/resolution is entirely caller-side new work.
  The split into `kind=citation|relation` and the `RELATION_FIELDS` set are faithful, but the 'morphism edge extractor' framing oversells the codec.

## Critic: buildability gaps

- **The two-level nested taxonomy frontmatter shape in Designs 1 and 2 is IMPOSSIBLE with the actual codec and will throw at runtime.** `frontmatter.mts` (decoder lines 71/178/182/186 and encoder lines 70-72) hard-throws 'nested maps go one level deep only'; the nested-map value type is `Record<string, FrontMatterScalar | readonly FrontMatterScalar[]>`.
  Design 1 specifies `taxonomy.udc:{id,notation}`, `taxonomy.lcc/msc/mesh/acm/arxiv:{id,notation}` and claims 'this fits without extending the codec' — FALSE; that is taxonomy → udc → {id,notation} = two levels, which `encodeFrontMatterDocument` throws on.
  Design 2 specifies the same `{id,notation}` sub-maps and claims the writer is 'scalar-only' needing one addition to 'emit the nested taxonomy map' — also wrong: the writer already emits one-level maps (the `koios:` shape); what it CANNOT do is the two-level shape both designs require, and that is a non-trivial codec change, not a one-liner.
  Only Design 3 is correct here: it explicitly flattens per-scheme ids to parallel scalar-array keys precisely because two-level nesting is unavailable.
- **Design 1 cites 'the TFAS `address`/`termOf` round-trip (`termOf . address = id`)' as the correctness contract to lift alongside `pathOf`,** and exposes `pathOf`/`address`/`termOf` in its API and CLI `verify` verb.
  Neither `address` nor `termOf` exists in the term-memory tree.
  `computer/mm/term-memory` exports ONLY `pathOf`, `MORPHISM_KEYS`, and `ascend` (confirmed in `index.mjs` and `ascent.mjs`).
  There is no path→term inverse (`termOf`) anywhere to lift, and no round-trip test in `path.test.mjs`.
  The `termOf . address = id` invariant is unimplemented and uninvertible as cited; it would be net-new from-scratch work, and `pathOf` is currently lossy/BFS-order-dependent so a clean inverse is not even obviously well-defined.
- **All three designs depend on `@561-group/content-codecs` as a live package, but the workspace has migrated:** the codecs now live as `./codecs/*` subpaths of `@561-group/content` (`lib/content/package.json` exposes `./codecs`, `./codecs/frontmatter`, `./codecs/references`, `./codecs/vault`, etc.; `lib/content/src/index.mts` re-exports them).
  `lib/content-codecs` still physically exists in the `lib/*` glob but NO package in the repo depends on `@561-group/content-codecs` except its own `package.json` — it is an orphaned/stale duplicate.
  A new package wiring to `@561-group/content-codecs` would diverge from the rest of the monorepo.
  Design 1 half-notices this (it correctly identifies that `sites/research.
  561.group/src/archive-api.ts` imports the now-unresolvable `@561-group/content-codecs` while the site only depends on `@561-group/content`) yet then names `@561-group/content-codecs` as its own reuse seam — internally inconsistent.
- **Path/relative-location imprecision the designs would trip on:** `lib/typed-resource-catalog` and `lib/content-codecs` are at REPO ROOT (`/home/emsenn/561-group/lib/...
  `), not under `sites/research.
  561.group/lib/` (which does not exist).
  The taxonomy TTLs are at `sites/research.
  561.group/content/data/taxonomies/*.ttl`, not the former content-lib taxonomy path Designs 1/2 write.
  `udc-archive-bindings.ttl` exists (240 lines, `archive:keywordId` / `archive:topicalArchiveRootSlug` shape) so the slug→root binding is plausible, but the designs' path strings are wrong and the slug→per-scheme-id (lcc/msc/mesh/acm/arxiv) resolution chain they promise is unverified beyond the root-slug bindings present.
- **Design 3 claims `@561-group/typed-resource-catalog` exports `detectType` as reusable API** ('audit/detectType/realize').
  `detectType` exists but is a PRIVATE non-exported function (`index.mts` line 805, used internally by `audit`); it is not in the export surface.
  `realize`, `audit`, `markdownDataform`, `project`, `locate`, `foldSchema`, `cohere` ARE exported and real.
  So the `detectType` reuse claim is a buildability gap; the others hold.
- **The 'moving-archive-files'/'organizing-topical-archive' skill executors that ALL THREE designs delegate moves to** (hash-verified, collision-safe, never-overwrite) were not located as code in this investigation and are referenced only by name.
  Their existence/interface (the claimed 'move-udc-file-plan' input schema Design 3 says `vaultward.plan.json` mirrors) is unverified; the reversibility/apply story of every design rests on an executor whose contract is unconfirmed on disk.

## Critic: corrections

- **Stop treating the morphisms-as-gerunds TRC as built.** Either (a) scope the gerund/object on-disk grammar + the scripts-under-object=0 gate + the gerund/library audit as NEW work owned by the normalizer package (not 'reuse TRC'), or (b) first execute the `trc-morphisms-as-gerunds-refactor` plan (relocate the 7 morphisms, generalize witness, add backbone schemas) so TRC actually realizes the grammar before any normalizer depends on it.
  As written, all three 'reuse `TRC.audit` as the proof-checker / PT-role gate' claims are vaporware.
- **Designs 1 and 2:** replace the two-level `taxonomy.<scheme>:{id,notation}` frontmatter with Design 3's flattened parallel-scalar-array convention (`taxonomy.udc`, `taxonomy.udc-uri`, `taxonomy.udc-notation` as sibling scalar-array keys), OR commit to a real (non-trivial) extension of `frontmatter.mts` to support two-level nesting plus round-trip tests.
  Do not claim the current codec supports `{id,notation}` sub-maps — `encodeFrontMatterDocument` throws on it.
- **Design 1:** drop or fully re-scope the `address`/`termOf` 'TFAS round-trip' contract.
  Neither function exists; only `pathOf`/`MORPHISM_KEYS`/`ascend` are in term-memory.
  If a path→term inverse is wanted it must be designed and implemented from scratch, and `pathOf` must first be made route-deterministic (canonical shortest-then-lexicographic route) before any `termOf.address=id` law is even well-posed.
  Add a real round-trip test; `path.test.mjs` has none.
- **All three:** change the dependency target from `@561-group/content-codecs` to `@561-group/content` (`./codecs/*` subpaths), matching the rest of the monorepo, and fix the imports/relative paths (packages at repo-root `/lib`, TTLs at `sites/research.
  561.group/content/data/taxonomies`).
  Reconcile Design 1's own observation that `archive-api.ts` must move OFF `@561-group/content-codecs` with its choice to build ON `@561-group/content-codecs`.
- **Designs 1 and 2:** stop attributing subject-taxonomy SKOS emission to `genreConceptScheme` — that builds a GENRE (type/kind/class) vocabulary.
  The subject-taxonomy resolver over `udc-archive-bindings.ttl` is new code; spec it as such and keep `genreConceptScheme` for what it is (a genre facet scheme), or justify why genre==subject (it isn't).
- **All three:** stop describing `internalReferenceTargets` as a 'typed-edge {domain,codomain} extractor.'
  It returns `{field,kind,value}` and does not resolve.
  Re-scope domain/codomain resolution (`referenceSlug` + corpus index + Yoneda arrows-in dedupe) as the design's own new work, which the texts mostly do downstream but the headline reuse claims overstate.
- **Design 3 (least unfaithful overall):** correct the `detectType` reuse claim (it is private/unexported), and acknowledge its own admission that TRC has no morphism half — carry its own scripts-under-object=0 check, which it already proposes; this design's frontmatter and reuse modeling are the most accurate of the three and should be the baseline the others are corrected toward.

## Critic: verdict

All three designs are partially buildable but rest on a shared false premise: that TRC already realizes the 'morphisms-as-gerunds, objects-inert' on-disk grammar and ships a 'scripts-under-object=0 / PT1-PT10' proof-checker to reuse.
It does not — that grammar lives only in the planning doc (never executed; no voidmath package, no journal entry, no library/restricting/extending tree, no `scripts/` discipline in code).
TRC-on-disk is a README/AGENTS/CLAUDE markdown-document conformance catalog.
The content-codecs reuse mostly checks out at the function level (frontmatter/references/vault exports are real and behave roughly as cited), with three sharp exceptions that hit Designs 1 and 2 hardest:

1. The two-level `taxonomy.<scheme>:{id,notation}` frontmatter shape THROWS at runtime — the codec is one-level-only; Design 3 alone gets this right by flattening.
2. Design 1's `address`/`termOf` round-trip cites functions that do not exist (term-memory exports only `pathOf`/`MORPHISM_KEYS`/`ascend`; no inverse, no round-trip test, and `pathOf` is BFS-order-dependent so 'same structure ⟹ same path' is not actually guaranteed).
3. The whole codebase has migrated off `@561-group/content-codecs` onto `@561-group/content/codecs`, so all three target an orphaned package.

`path.mjs` DOES faithfully file morphisms at their domain with codomains under `library/` (the core categorical rule holds) but emits raw slot keys, not gerunds — the gerund-ization is unbuilt design work, not a codec/path property.
Ranking by faithfulness-to-disk: Design 3 (mvp-pragmatic-reuse) is the most accurate (correct frontmatter flattening, honest that TRC lacks a morphism half, smallest reuse surface) and should be the baseline; Designs 1 and 2 carry the runtime-throwing nested-frontmatter defect and (for 1) the nonexistent `address`/`termOf` contract, and both must be corrected before they are buildable.
Default skeptical stance upheld: the reuse claims systematically overstate what is on disk.

## Investigation counts

- Cartography agents: 8
- Apparatus agents: 4
- Tooling agents: 4
- Designs produced: 3
- Total agents: 22
