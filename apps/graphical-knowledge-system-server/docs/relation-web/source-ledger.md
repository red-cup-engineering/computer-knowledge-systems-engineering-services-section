# DREW / PAM source ledger

This ledger states what the current sources actually license. It separates the
live Lean development, the draft adjoint-bilattice paper, the surviving old PAM
runtime, and the engineering contract of this app. Similar names across those
sources are not treated as definitions of the same operation.

## 1. The implemented formal carrier

The live Obsmetrologia chain is:

```text
Mark(surface : String)
  -> Utterance(token : Mark, claim : Mark)
  -> PredicationCell(subject : Mark, predicate : Mark, object : Mark)
  -> Valuation = PredicationCell -> Charge
  -> Charge = Bool x Bool
```

`token` and `claim` are positional roles, not different mark types. `Entity`
and `Predicate` are both abbreviations of `Mark`. `Claim` is an abbreviation of
`PredicationCell`; it is not a trace row or a provenance object.

The direct predication seed of utterance `(t, c)` is the diagonal cell
`(t, c, t)`. `composeSeeds u v` constructs `(u.token, u.claim, v.token)`. This
is an asymmetric construction of a cell from two utterances, not graph-path or
categorical composition. Its subject projection recovers the first seed; its
object projection retains the first utterance's claim and generally does not
recover the second seed.

The implemented base operations are endomaps on cells:

- converse swaps subject and object;
- subject and object projection collapse an endpoint to a diagonal cell;
- specialization maps the middle mark through a supplied function.

Reindexing a valuation is precomposition with one of these cell maps. The Lean
development does not define graph adjacency, paths, a category whose objects
are predicates, or a stored relationship graph among predicates.

## 2. FOUR is evidence geometry

The four values are two independent evidence slots:

| Charge | slots `(for, against)` | reading |
| --- | --- | --- |
| `kBot` / `absurd` | `(0, 0)` | no evidence |
| `tTop` / `potential` | `(1, 0)` | evidence for |
| `tBot` / `active` | `(0, 1)` | evidence against |
| `kTop` / `stable` | `(1, 1)` | both retained |

Knowledge order is componentwise evidence inclusion. Knowledge join therefore
accumulates evidence without erasing conflict. Truth order increases positive
evidence while decreasing negative evidence. Negation swaps the slots; it is
not converse.

The same four corners also name articulation phases, but the formal development
does not prove that an articulation phase is an event-sourced transition of a
claim's valuation. DREW and PAM keep observations, cell addresses, and valuation
state separate even where Lean uses the same carrier.

## 3. What the adjunctions actually say

The live fiber carrier is uniformly the whole valuation type, not an implemented
family indexed by predicate objects. For a cell endomap `r`, `r*` is valuation
precomposition. Converse is involutive, so converse reindexing is self-adjoint.

For a supplied finite preimage enumeration, the development proves knowledge-
order and truth-order existential/reindex/universal adjunctions. The finite
preimage enumeration is input data. There is no general executable projection
quantifier until a bounded universe and its complete fibers are supplied.

There are two distinct live operation families that currently share fusion and
residual vocabulary.

The Calculus branch defines the paper's scalar twist-product operations
generically over an integral commutative residuated lattice. It specializes the
carrier to FOUR, transports the result to `Charge` as `chargeFuse` and
`chargeImp`, and proves the truth-order scalar adjunction. For these operations,
`kTop` is the multiplicative unit and `chargeFuse(kBot, kBot) = tBot`. This
supports the paper's displayed scalar formula.

Separately, `Predicating/Fibration.lean` defines its pointwise `fusion` as truth
meet. Its `residual` is truth-Heyting implication, and its proved valuation
adjunction is:

```text
(b meetT a) <=T c  iff  b <=T (a impT c)
```

For this second family, `tTop` is the identity, every element is idempotent, and
`kBot fusion kBot = kBot`. There is no import, equality theorem, or pointwise
lift connecting the scalar twist operations to the predication fibration's
operations. PAM may expose them as separately named value-operation profiles;
it must not present them as one unified fiber calculus.

## 4. Closure and its missing receipts

A live closure rule has a knowledge-monotone Boolean antecedent and one
cell/charge consequent. One step joins all enabled consequents onto the current
valuation in knowledge order. Inflationarity and monotonicity are proved.

The named `clS` is three steps. Its least-fixed-point theorems require a separate
hypothesis that those three steps have reached a fixed point. Cascades across an
unbounded cell set can require an omega-stage construction. Closure does not
guarantee that unknown cells disappear, and it returns only a valuation: rule
identity, read set, source events, and causal derivation are not retained.

Therefore an accountable runtime needs receipts in addition to the formal
value: rule and version, input revision, antecedent/read witnesses, contributed
cell and charge, causal parents, and settlement/fuel status.

## 5. The current executable articulation layer

`@lenticule-science/articulating` is not merely a transcription of the narrow
Lean carrier. Its TypeScript runtime adds concrete boundary and receipt
structures:

- marks and cells coincide by structural carried value, not JavaScript reference;
- `PredicationSite` carries cells, specializations, and derived base-category
  edges for converse and endpoint projections;
- finite fibrations provide stable cell signatures, embeddings, reindexing,
  temporal cells, and receipts;
- FOUR relation matrices knowledge-join duplicate coordinates;
- predicate fibers implement a cellwise lift of the scalar linear fusion and
  residuum and check their preservation by generators;
- finite knowledge- and truth-order quantification runs and returns an
  exhaustive adjunction receipt.

This executable package is the implementation dependency for the finite PAM
profile. DREW still owns observation occurrence identity: structural term
coincidence in articulating does not identify two source events or replace their
provenance. The package's executable pointwise linear fiber operations are also
new evidence beyond the narrower Lean predication import chain; DREW/PAM names
the scalar family explicitly and does not identify it with cell moves or the
separate truth-Heyting family.

## 6. The draft paper is a research branch, not the runtime oracle

The draft paper's scalar twist-product formula and scalar adjunction are
formalized in `TwistProductResiduation.lean` and `LinearLogicChu.lean`. Its
further lift to predicate-indexed fibers, predicate category, inversion with
negation, composition with knowledge meet, modal equivalence, and post-closure
three-element carrier are not all implemented by the live predication
fibration; several conflict with it. DREW/PAM exposes no higher-level feature
merely because it appears in that draft.

## 7. What survives of old PAM

The old runtime preserves several useful engineering distinctions:

- raw messages were to be reified with sender, message identity, and payload;
- cells were addressed by interned subject/predicate/object IDs;
- immutable content-addressed EAVT/AEVT/AVET segments backed a working model;
- evidence updates used knowledge join rather than overwrite;
- event logs were intended as source of truth and geometry as replay output;
- reads were intended to return witnessing geometry.

The archive is incomplete. Core bilattice, store, reification, dispatch, and
replay modules are missing, and retained provenance APIs disagree with each
other. Its generative morphisms also do not implement the simple operations
their names suggest:

- specialization and inversion emit structured source-cell objects as output
  objects;
- inversion also negates the value;
- composition, fusion, and implication pair claims by common subject and emit
  structured pair witnesses;
- a separate `fiberCompose` implements relational path composition.

These historical operations are therefore optional legacy profiles, not the
meaning of the live finite profile.

## 8. Earned boundary

DREW owns observations and replayable web structure:

- explicit term identities under a declared identity policy;
- immutable relation observations and their occurrence identities;
- origin, revision, ordinal, and payload evidence;
- append-only admission and deterministic replay;
- indexes and graph projections that preserve occurrence witnesses.

PAM owns interpretation:

- the cell-address projection from DREW observations;
- the chosen value algebra and knowledge/truth orders;
- reified messages;
- admitted cell maps and morphism profiles;
- closure and settlement with explicit fuel;
- read witnesses and derivation receipts.

MCP is a transport over PAM. Markdown, JavaScript, Guix, and other substrate
owners parse their own formats and submit observations to DREW. DREW does not
parse their languages or decide what their predicates mean.

Graph path operations remain a separate graph service concern unless a PAM
profile explicitly admits a path semantics. A directed relation observation
can be projected as an edge for navigation, but its canonical web form is an
occurrence entity with subject, predicate, and object role links. That form
preserves the third role and the observation witness instead of confusing a
relation occurrence with a bare labeled edge.

## Primary source locations

- `Obsmetrologia/Primitive/Mark.lean`
- `Obsmetrologia/Articulation/Articulating/Utterance.lean`
- `Obsmetrologia/Language/Predicating/{Cell,Claim,SiblingSeed,Fibration,Hyperdoctrine,Quantifying,Equality}.lean`
- `Obsmetrologia/Language/Positing/{Charge,Valuation,TruthOrder,FiberAlgebra}.lean`
- `Obsmetrologia/Closure/RuleSystem.lean`
- `Obsmetrologia/Calculus/Logic/{TwistProductResiduation,LinearLogicChu}.lean`
- `apps/spotcomp/hacking/library/pam/specification.md`
- legacy `esm-predication/packages/predication-algebra` and `packages/esm-pam`
- Geode `src/{declared-relations,concept-index,canvas}.mjs`
