# GEODE capability benchmark

**Observation date:** 2026-08-27
**Obsidian baseline:** public desktop 1.13.7 and the official core-plugin documentation.

The benchmark is a ledger, not marketing prose.
Each capability is `baseline`, `parity`, or `beyond`; only executable tests or inspectable product behavior can promote a row.

Official baseline sources:

- [Obsidian core plugins](https://obsidian.md/help/Plugins/Core%2Bplugins)
- [Bases](https://obsidian.md/help/bases)
- [Canvas](https://obsidian.md/help/Plugins/Canvas)
- [Graph view](https://obsidian.md/help/Plugins/Graph%2Bview)
- [Search](https://obsidian.md/help/Plugins/Search)
- [Properties view](https://obsidian.md/help/Plugins/Properties%2Bview)
- [Obsidian 1.13.7 changelog](https://obsidian.md/changelog/2026-08-12-desktop-v1.13.7/)

| Capability family | Obsidian baseline | GEODE evidence now | Status | Beyond-parity direction |
| --- | --- | --- | --- | --- |
| Local vault | Local Markdown folder | Bounded, explicit directory admission | baseline | Receipted multi-root workspaces and policy-visible exclusions |
| File navigation | Explorer, tabs, quick switcher | Searchable document list and note reader | baseline | One palette over notes, commands, relations, queries, and agent work |
| Markdown reading | Reading mode and Live Preview | Escaped block and inline rendering | baseline | Multiple declared dialect projections from one carrier |
| Backlinks/outgoing links | Core sidebar views | Typed edges and backlinks | baseline | Relation kinds, evidence, ambiguity, and dangling-target diagnostics |
| Search | Boolean, regex, property, task, section operators | Metadata/path quick search only | baseline | Explainable query plans across content, graph, properties, and semantics |
| Properties | Per-file and vault-wide property views | Indexed frontmatter shown per note | baseline | Typed schemas, migrations, provenance, and constraint reports |
| Graph | Global/local force graph | Derived graph contract, no visual surface yet | baseline | Semantic topology separated from screen layout and relation evidence |
| Bases | Table/list/card/map property views and formulas | Planned | baseline | Open query/view files, typed relations, composable projections |
| Canvas | Open JSON Canvas visual workspace | Planned | baseline | Canvas as one view over stable handles, never a graph silo |
| Editing | Source, Live Preview, commands | Read-only by design in slice one | baseline | Proposal/preview/commit/receipt transaction model |
| Recovery | Local snapshots and Sync history | Planned | baseline | Content-addressed receipts and tested inverse operations |
| Daily/unique notes | Core generators and templates | Planned | baseline | Policy-driven constructors with explicit dating evidence |
| Workspaces | Saved window and pane layouts | Planned | baseline | Portable task/context/session projections across shells |
| Extensions | Large community plugin API | Planned | baseline | Capability-secure extensions with one human/CLI/agent declaration |
| Sync | Paid end-to-end encrypted service | Planned adapter | baseline | Protocol and provider independence; local operation remains complete |
| Publish | Paid hosted publishing | Existing repository services, not integrated | baseline | Reproducible publication receipts and multiple destinations |
| Mobile | Official mobile application | Planned shell | baseline | Same kernel and contracts, with offline-first constrained interaction |
| CLI | Official application CLI | Server CLI only | baseline | Full command parity plus structured outcomes and receipts |
| Agent collaboration | Community ecosystem | Prior cockpit concepts only | baseline | Native bounded context, governed proposals, checkpoints, MCP/OpenAPI |

## Acceptance rule

“Meets Obsidian” means every official core capability required by GEODE's supported platforms has a passing acceptance test or a documented, deliberate non-equivalence that preserves the user outcome.
“Beats Obsidian” means at least one independently useful capability is materially stronger without weakening local ownership, portability, accessibility, or safety.

## Collaborative knowledge tools — focused audit

**Research date:** 2026-08-27. Sources below are current first-party help,
product, or project documentation. This is intentionally a product audit, not
a promise to duplicate every interface or storage model.

| Product | Proven strengths worth meeting | Boundary GEODE should retain | Architectural implication |
| --- | --- | --- | --- |
| Obsidian | Local Markdown vaults, rich local navigation/graph/properties, and Sync history/version restoration. Shared-vault history identifies a last editor; Sync can use end-to-end encryption. [History](https://help.obsidian.md/Obsidian%2BSync/Version%2Bhistory), [security](https://help.obsidian.md/Obsidian%20Sync/Security%20and%20privacy) | Sync/version retention is a service layer, not ordinary shared live authoring. Carrier authority must stay local and provider-independent. | GEODE needs local-first carrier admission, a digest-guarded writer, filesystem reconciliation, and VICTOR as a separate publisher—not a cloud-vault replacement. |
| Roam Research | Hosted graph sharing supports read/edit access, whole-graph history playback, and a block-oriented daily-note workflow; its current sharing docs even offer immutable blocks. [Sharing](https://roamdocs.fyi/help/sharing), [graph history](https://roamdocs.fyi/help/graph-history), [mobile capture](https://roamdocs.fyi/help/roam-mobile) | A page/block graph must not force GEODE to abandon inspectable Markdown or make a hosted graph the sole source of truth. The sharing documentation warns that individual-page sharing can expose loaded graph data. | Stable GEODE handles and typed relations can deliver block/section addressing and daily-note capture as projections; capability-scoped sharing must be explicit and evidence-bearing. |
| Notion | Same-page real-time editing, visible co-presence, comments/mentions, permissions, and history are mature expectations. [Collaboration](https://www.notion.com/help/collaborate-with-people), [workspace collaboration](https://www.notion.com/help/collaborate-within-a-workspace), [version history](https://www.notion.com/help/duplicate-delete-and-restore-content) | Avoid a block/database cloud silo and opaque “most recent change” conflict semantics. Current offline mode is downloaded-page scoped and says some concurrent non-text changes can conflict. [Offline](https://www.notion.com/en-gb/help/use-pages-offline) | TUFTE forms need collaborator/presence, comment, mention, permission-request, history, and conflict forms. GEODE's operation receipt/refusal and checkpoint law must make offline/external conflict resolution visible rather than magically successful. |
| Logseq | A local graph and outliner make it a relevant local-first comparison. Its own Sync guidance says Sync is beta, does **not** support multiple people using a graph at once, and warns of possible data loss. [Logseq Sync](https://blog.logseq.com/how-to-setup-and-use-logseq-sync/) | Do not mistake device sync for collaboration, or let backups substitute for a convergence law. | The Phase 1.5 collaboration law and digest conflict boundary are a prerequisite, not an optional enhancement after sync. |
| Etherpad | Real-time shared text, visible per-author attribution, character-level history/time slider, reversible revisions, self-hosting, and open data are the most relevant collaborative-editor benchmark. [Project](https://etherpad.org/), [principles](https://etherpad.org/about), [accessible history controls](https://docs.etherpad.org/accessibility.html) | Do not copy a pad as the authoritative carrier or bind GEODE to one editor/runtime. Per-keystroke authorship is valuable, but it must coexist with ordinary Markdown checkpoints and external edits. | Alpha GEODE needs attributed admitted operations, causal undo, replay through the same projection path, session presence, and a specialized editor island inside a TUFTE form. |

### Table stakes for a credible GEODE collaboration release

1. Two people can enter a shared note, type simultaneously, see presence and
   attributed edits, and receive immediate local feedback.
2. A person can comment or mention against a stable document/section/selection
   handle, then discover and resolve the resulting work asynchronously.
3. History is navigable and replayable; a revert is an attributed new act, not
   a silent replacement of somebody else's document.
4. View/comment/edit authority is visible before an operation is attempted,
   and a denied operation is an accessible refusal with a reason.
5. Offline/reconnect/external-file behaviour never silently drops an admitted
   edit or overwrites an observed competing carrier.
6. Core reading, editing, navigation, and resolution remain keyboard and
   assistive-technology operable.

### Differentiators worth building deliberately

| Differentiator | Why it is stronger than parity | GEODE/TUFTE home |
| --- | --- | --- |
| Markdown remains the sovereign portable checkpoint | Neither a hosted graph nor a proprietary block store becomes a hostage format. | GEODE kernel plus digest-guarded Markdown transaction service. |
| Receipted, replayable admission | Preserves the useful Etherpad/Roam history property while explaining proposed, admitted, refused, checkpointed, and externally observed states. | GEODE collaboration law; optional EAVT/SEAVT witness projection. |
| Forms as the collaboration UX | Comments, invitations, conflict choices, approvals, history, and presence are accessible named forms rather than bespoke overlays. | TUFTE; specialized text/3D editors remain islands. |
| External edits are first-class competing revisions | A local editor, git, or automation can participate without being treated as corruption. | GEODE watcher, reconciliation proposal, and transaction receipt. |
| One command contract for people and agents | The same scoped command yields preview, policy decision, receipt, and projection across TUFTE, CLI, and agent adapters. | GEODE kernel and extension manifest. |

### Traps not to imitate

- Do not call a synchronization product “collaboration” without a tested
  simultaneous-edit and conflict law; Logseq's own Sync limitation makes this
  distinction concrete.
- Do not hide a revert as an overwrite. Preserve the target, actor, reason,
  inverse/compensation, and resulting checkpoint in history.
- Do not make an open/share link silently widen data access. Scope, authority,
  transport, and loaded projection must be separately inspectable.
- Do not use presence or a colored cursor as evidence that text is safely
  persisted. Presence is ephemeral; admitted operations and checkpoints are
  durable.
- Do not make browser/editor implementation details the knowledge model. TUFTE
  owns form topology; a text editor or QwzSpace renderer owns only its bounded
  interaction island.
