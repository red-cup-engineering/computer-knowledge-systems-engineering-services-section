---
title: "Note on one website application"
date-created: 2026-09-18
type: note
status: active
tags:
  - victor
  - l-space
  - architecture
summary: "Why L-Space is a config file, why Victor is the application it configures, and which code moves where."
---

## The finding

`l-space.561.group` declares `@red-cup-engineering/victor` as a dependency and never imports it. The site carries its own release compiler, its own Cloudflare Worker, its own VPS adapter, its own Google and Discord admission, its own browser engine build, and its own MCP server. It composes fifteen engineering packages itself. There is no upstream application behind the site; the site is the application.

The reason the site routed around VICTOR is measurable. VICTOR's catalog admits only publication cells: a required `title`, a required ISO `date-created`, and one of ten content types. Of the 22,108 Markdown notes in the science forest, VICTOR accepts 4,067. The vault compiler's house dialect admits all of them. So the site compiled through the vault compiler and rebuilt everything VICTOR already does on top of that world.

## The decision

1. **VICTOR is the one website application.** A site is `victor.config.mjs` plus a content directory. It carries no `src/`, `lib/`, `scripts/`, or bespoke worker. `victor build`, `victor serve`, and `victor check` are the only entry points. This is already how `turntide.561.group` and `iyappy.561.group` work.
2. **VICTOR gains a `vault` catalog dialect**, owned by `@red-cup-engineering/vault-compiler`. Under `catalog: { dialect: 'vault' }` every frontmattered Markdown file is a cell; the title falls back to the file name, the date is optional, the type is open, and the compiler's doors become typed relations. The publication dialect is unchanged and remains the default.
3. **What L-Space's own code does today moves to its owner.** The room, index, garden, halls, and public-surface JSON plus the browser application and the review API become a VaultMaze projector and application. GEODE's authoring, graph, and vocabulary routes are GEODE's existing VICTOR application; L-Space's copies under other paths are deleted. Google and Discord admission, signed sessions, and the public-versus-authenticated artifact gate become one engineering application composed from the existing OAuth atoms. The Cloudflare and VPS carriers become VICTOR's serve path over the in-tree web server.
4. **Duplicates are deleted, not kept in parallel.** Lantern's private FCA, stability, kata, cards, and compile modules and the education platform's copies of the same are owned by the vault compiler. Lantern's `web/` server, L-Space's `scripts/`, `lib/`, `src/`, and `public/`, and VICTOR's dependency on the registry-only `http-server` facade go.

## The order

1. VICTOR vault dialect, proven by building the science forest through `victor build`.
2. VaultMaze projector and application lifted from the L-Space release script, browser app, and worker.
3. Admission application lifted from the L-Space worker's auth modules.
4. L-Space reduced to `victor.config.mjs`, `package.json`, and a deployment unit; its tests move with the code to the packages that own it.
5. Duplicate deletion across lantern, education platform, and VICTOR's foundation.

## What step one found

Measured while making VICTOR admit the science forest, 2026-09-18.

- The vault compiler is cheap: the whole forest, 21,945 rooms, 23,134 doors, 825 halls, 46,744 cards, 106 MB of prose, compiles in 26 seconds inside 560 MB. Every earlier memory failure was VICTOR's.
- VICTOR's block parser did not always advance. A fence opener with an info string after a space, such as "``` mermaid", matched the paragraph loop's structural exclusion but no block branch, so the loop pushed empty paragraphs forever and exhausted the heap. The loop now consumes a line on every iteration, and a fence accepts an info string.
- VICTOR's inline tokenizer re-matched and re-sliced the remainder for every token, quadratic on the single giant paragraphs that imported notes produce. It is now one left-to-right scan.
- VICTOR retained a second JSON copy of every cell's AST that nothing read; it was taken only for the address. The copy is no longer kept. Name resolution scanned every cell for each unresolved link; it now uses a per-catalog index.
- The TUFTE atlas and per-cell neighborhood pages double the page count of a 22k-cell site. They are now a `tufte: false` switch. The TUFTE renderer itself is not optional.
- Fifty-two science notes carry YAML frontmatter the codec refuses: duplicate keys, unclosed quotes, block sequences as map values, documents that are not mappings. One such note aborted the whole compile. The compiler now records a warning against that file and continues, and dialect detection ignores an undecodable sample.
- With those fixes the forest built end to end: 21,945 cells in 52 seconds inside 5.2 GB. It was held back only by refusals, of four kinds. VICTOR pinned TUFTE 0.8.2, which does not render the `navigation` option, so every page without a backlink or contents tile lacked a nav landmark; TUFTE 0.11.0, on the registry since 2026-09-10, emits one, and VICTOR is repinned to it. Heading ids were slugified without deduplication, so a page with seventeen "Role: assistant" headings failed the unique-id check; ids are now unique per page and the table of contents reads the same list. Plain links rendered whatever href they carried, so imported notes with `buf:` and other schemes failed the safe-scheme check and every `.md` link no catalog could resolve became a broken internal anchor; a link now renders as an anchor only for relative paths and the http, https, mailto, and tel schemes, and an unresolved document reference renders as a potential link, like an unresolved wikilink.
- Three more classes fell to rules, not exceptions. A vault cell's name is a route: each path segment is decomposed, stripped of combining marks, lowercased, and reduced to the route vocabulary, so "People & Places/Aaron Bushnell & Co (2024), it's.md" is served at `/people-places/aaron-bushnell-co-2024-it-s/`, and a wikilink authored in prose resolves through the same rule; the real path stays in the cell's provenance. A rendered page never skips a heading level: each heading sits at most one level below the one before it, the table of contents reports the rendered levels, and the AST keeps the authored ones. The shell's tile ids are reserved from body heading ids, so a note headed "Contents" no longer collides with the contents tile. And what the publication dialect would refuse in a body, a heading skip, an unknown citation key, an untagged fence, the vault dialect reports against the cell and renders anyway: the vault admits prose as it is. A link URL still cannot carry parentheses in this dialect, as in the vault compiler; that is a shared limitation, recorded, not fixed here.
- The last two classes were the same lesson. A relative link with no scheme and no extension, `[Free Palestine](Free Palestine)`, is a document reference in another syntax: resolved, it routes; unresolved, it renders as a potential link, exactly as an unresolved wikilink does, never as a dangling anchor. And when two distinct files reduce to one route, "Digital Computer.md" and "digital-computer.md", the later in room-id order takes a numeric suffix and an advisory names the collision; a vault does not lose its release to a pair of file names.
- The renderer now vouches for every reference it generates, so what the static-site check still finds dangling was authored: a path like `/018` that never existed, or an image beside a note. Under a vault those are reported, not refused, because a vault does not lose its release to an author's slip; a publication site still refuses them, because its authors are asked to fix them. The policy is explicit as `conformance.authoredReferences`, `advise` or `refuse`, and each dialect has its default.
- Not done here: publishing the non-Markdown files beside notes, images above all, as assets at their routes. Today's L-Space does not publish them either, so nothing is lost by deferring, but a knowledge garden without its images is unfinished. It is a projector over the vault root and belongs with step two.
- Still open in VICTOR at this scale: the browser-asset transformer builds a full second map of rewritten bodies plus a byte copy of every artifact, and the feed projector has no item bound, so each of three feeds carries every dated cell's full HTML.
- The registry holds GEODE 0.3.1; the tree holds 0.2.1. Something was published from an uncommitted tree.
- The publish operator journals receipts under an ancestor section's `data/records/`; no engineering section carries one, so the receipt step has never had a home for engineering packages.

## What step two did

VaultMaze now owns what L-Space's release script, browser application, and
review API did. `@red-cup-engineering/vaultmaze/projector` is a VICTOR projector
over the vault catalog: it emits the browser application at the site root, the
browser engine projected from the education platform, CAIRN, and TUFTE, and the
content-addressed room release with its public and authenticated trees.
`@red-cup-engineering/vaultmaze/application` is the review resource over a store
that speaks the D1 statement shape. VICTOR's build context gained `renderCell`
and the vault's room-to-name map so the projector reads the catalog without
importing VICTOR. The browser application moved by copy; only its fetch paths,
its editor routes (now GEODE's own `/api/note` and `/api/action`), and its brand
strings changed, and the release is read at its artifact paths rather than
through an API that aliased them.

Follow-ups this step recorded rather than did: the relation graph artifact the
browser's graph view reads is GEODE's release ledger and belongs with the GEODE
step; the Discord command login and the `/api/v1/me` identity the browser calls
belong to the admission application of step three; and the sibling-asset
publication noted above.

## What step three did

Admission is one engineering application: `@red-cup-engineering/serve-web-admission-service`,
a typed service beside the other OAuth services, composed from the consent
relay, the callback exchange, the admission judge, the Discord user-OAuth
transport, the cookie signing and serialization atoms, and the Cloudflare D1
contract. Its middleware is the gate: it identifies the principal through
whichever providers a deployment configured, witnesses the admitted principal
on the request trace as `auth.claims.*`, the shape the edge's authentication
writes, refuses everything outside the anonymous surface with 401, refuses
anonymous writes everywhere, and reserves author routes for the one verified
Google address. Its resources are the Google and Discord logins, callbacks,
and logout, the Discord command login, and the identity and application
selection the browser asks for. The tables Discord admission keeps travel as
migrations for the D1 applier; L-Space's VPS adapter duplicated that contract,
which `cloudflare-d1-service` already owns.

Two findings on the way. The URL parser resolves literal dot segments before
any gate sees a path, so `/vault/public/../index.json` is the authenticated
index and `/js/%2e%2e/vault/index.json` is no route at all; the gate canonicalizes
percent-encoded spellings and refuses backslashes and encoded separators. And
the house cookie signing runs on node:crypto, so this service is Node-first; a
Workers carrier needs the session module ported to Web Crypto, not forked.

## What step four did

L-Space is its configuration. `victor.config.mjs` names the science section as
the content root, the vault dialect with the wing's excluded segments and hall
attributes, VaultMaze as the projector and the review application, GEODE as the
author's workbench over a live checkout, and the admission service with its
providers read from the environment by name. `package.json` pins the published
packages; `deploy/l-space.service` runs `victor serve --release`, a release
mode VICTOR's CLI gained for this, behind the same Caddy fragment. The worker,
the VPS adapter, the browser files, the release compiler, and the tests that
moved to their owners are deleted. The site's own tests prove the configuration
through VICTOR's real runtime over a small vault: the shell and the public
surface open anonymously, the vault refuses without a session, custody strata
are excluded, and the deployment unit serves nothing bespoke.

Still in the site until step five: the L-Space MCP face
(`scripts/serve-mcp.mjs`, `src/release-observation.mjs`, the release graph
reader) and what it imports. It is a hand-rolled MCP loop over the release and
GEODE's relation tools; its owner is VaultMaze for the release observation and
the house MCP codec for the transport.

Two blockers stand between the committed site and an in-place install, both
outside this work. The repository root now carries a workspace manifest naming
198 packages, the site among them, so npm installs for the site target the
root tree; that conversion is another agent's uncommitted work, and the site
was proven from a copy outside it. And GEODE's published releases declare an
exact peer dependency on VICTOR 0.1.12, so no consumer of VICTOR 0.1.15 can
resolve GEODE from the registry until GEODE, whose tree already says 0.1.15,
is republished; its tree is mid-edit by another agent with one failing test,
so that publish is theirs to finish. The registry's GEODE 0.3.1 also carries
dependencies the tree's 0.2.1 does not, the same drift noted below.

The tree's GEODE is no better off: it declares a dependency on a package the
registry does not carry, so it cannot be installed from the tree either. The
site's configuration therefore loads GEODE lazily, only where an authoring
checkout is configured, which is the right shape regardless: a reading
deployment carries no workbench in memory. The site was proven without GEODE;
the workbench route waits on GEODE's own repair and republish.

One more finding from proving the site through VICTOR's real runtime: the
house web server hands middlewares and resource handlers the native Node
context, whose request is an incoming message, not the Fetch-shaped context
the contract also defines; GEODE mounts through a fetch adapter for that
reason. The admission and VaultMaze applications now form their Fetch Request
through the web server's own bridge from either context, so one application
serves both shapes and neither carries a second bridge.

## What step four proved, and where the registry stands

L-Space now runs as its configuration through VICTOR's real runtime, proven
in the tree over the root workspace another agent introduced this afternoon:
the shell and the anonymous surface open, every other route refuses a reader
without a session, custody strata are excluded, and the small vault's release
is releasable (four tests, all passing). The whole science forest builds the
same way: 21,954 rooms, 0 refusals, 43,935 release files verified against the
manifest, in about two and a half minutes inside 6.4 gigabytes.

Two defects stood between that and a releasable forest, both now fixed at
their owners:

- The web release verifier caps a release directory at one gigabyte, and the
  forest is 1.04 gigabytes: a page and a room record for each note, plus a
  57-megabyte VaultMaze index. VICTOR's `victor build` passed no limits, so the
  cap cascaded into 21,964 "missing artifact" diagnostics for files that were
  on disk. VICTOR's release configuration now carries `maxFiles` and
  `maxBytes`, kept out of the manifest projection and handed to the verifier;
  L-Space declares four gigabytes and 250,000 files.
- The vault compiler resolved every path-shaped document link by basename
  alone, so `../_index.md` in one of a thousand index files "matched" every
  index file in the forest: 55,924 ambiguous-link advisories whose candidate
  lists alone were 231 megabytes of the 307-megabyte release report. The
  compiler's document index now resolves a link as a path from the linking
  room first, then from the vault root, and only then by basename, and an
  ambiguous advisory names at most three candidates and a count.
  Over the forest that took the report from 108,748 advisories and 307
  megabytes to 82,083 and 96, resolved 4,431 more rooms out of orphanhood, and
  cut the build's peak memory by a gigabyte. The 33,690 ambiguous links that
  remain name paths that do not exist whose file name is shared, most of them
  `_index.md`; they are authored dangling references, advised as such.

The registry is behind the tree, and not by my hand alone. Another agent's
sweep aligns every consumer's pins to the tree's package versions, including
TUFTE 0.12.0, which the tree carries but the registry does not, and which
fails its own tests against the published web server (it imports a subpath
web-server 0.5.0 does not export). VaultMaze 0.2.1 and 0.2.2 were published
from a tree the sweep had already repinned, so both depend on that unpublished
TUFTE and neither installs from the registry until TUFTE 0.12.0 ships. VICTOR
0.1.15 and the admission service 0.1.1 install. The deployment unit installs
the site from the registry, so the release chain is: web server export, TUFTE
0.12.0, VaultMaze 0.2.3, VICTOR 0.1.16 (release limits, compiler index), and
the vault compiler at a minor bump (its `buildBasenameIndex` became
`buildDocIndex`; another agent's uncommitted retirement of `compileWing` is
in the same package and still has five consumers). Until then the tree is the
only place L-Space runs, and it does.

Left uncommitted on purpose, all another agent's in-flight work: VICTOR's
runtime migration off `http-server` and its pin bumps, the compiler's
`compileWing` retirement together with my three-candidate cap in the same
file, and the site's `release-graph` removal with its `room-summary`
replacement and the `release-observation` test that now imports the retired
worker.

## Open questions for the owner

- The science forest is every `content/` tree beneath the science section, 22,108 notes, not only the section's own `content/` directory of 321. This note keeps the forest. Narrowing to `content/` trees only, dropping section READMEs and library docs, is a walker rule in the vault compiler and is scheduled with step 5.
- VICTOR's Markdown dialect and `render-markdown-block-html-service` are two renderers. VICTOR's supports tables, citations, and sidenotes; the house block renderer supports transclusion. One must absorb the other. This note does not decide it.
- The registry holds GEODE 0.3.1 and the tree holds 0.2.1. Something was published from an uncommitted tree. The registry is not the source of truth; the tree is.
