# static-site-publisher (VICTOR)

VICTOR — Voxelized Information Catalog Topos Orienting Relations — is Red Cup Engineering's website framework. Its competitive mandate is to meet and beat current website frameworks. It assembles one content-addressed catalog of related content, then composes downstream domain applications, HTTP serving, pages and assets, feeds, structured data, federation, conformance, and release custody into coherent websites. TUFTE, the Tiling User Form Topology Engine, is VICTOR's user-interface framework; it is not an optional decorative renderer.

The lower applications remain useful independently. VICTOR owns catalog assembly, composition, release policy, and cross-projection checks; it does not need to reimplement every protocol or replace a site's domain runtime.

The name is grounded in the corpus's own apparatus:

- **Voxelized** — content cells addressed by RFC 6920 `ni:///sha-256` identifiers, stored and released in content-address-sharded form.
- **Information Catalog** — the RWIL log → state → record → content tiering, with the Belnap knowledge order read as an information order.
- **Topos** — the `R = Sh(T,J)` sheaf framing and the seven closure conditions; sheaf gluing as the deterministic-merge test for partial catalog views.
- **Orienting Relations** — RMN, the Relation Model Notation, as the typed term language for the relations the catalog serves.

VICTOR carries forward the useful behavior of the `semantic-site-server` lineage (dual-mode serving, RDF/JSON-LD projection, feeds, Cool URIs, pluggable readers, and build reports) by realizing those concerns as composable live applications. It consumes TUFTE as the topology, user-form, interaction, and rendering engine for browser interfaces.

Conformance targets are the real, current standards — the WHATWG HTML Living Standard, WCAG 2.2, ARIA in HTML — checked continuously at build time, not claimed once at launch. The study of these targets lives in the Living Web Science Services Section.

## Contents

- `content/text/documents/articles/notes/` — the governing documents: the SAS, the mandate note, and the self-sufficient companion specifications (TUFTE contract, dialect, design rules, standards facts, engineering practices).
- `src/`, `scripts/`, `test/` — the fusion application, runnable entrypoints, and executable contract tests.

## State: 0.1.7, a walking skeleton that walks

`victor build <contentDir> <outDir>` renders a complete site; `victor check` runs the double-build determinism check; `victor serve` watches and serves with drafts visible, and `victor serve --release` serves the release without drafts or a watcher; `victor new` scaffolds a typed cell. The tested walking skeleton includes content-addressed cells, relational Markdown with GFM pipe tables and citations against a CSL-JSON front-matter references block, papers whose chapters are ordered and content-addressed cells in their own right, accessible page rendering, OpenGraph and Twitter-card meta on every rendered page, theme validation, complete and paged publication archives, section/tag/type/status indexes, RSS 2.0, Atom 1.0 and JSON Feed 1.1, browser search, sitemap, robots policy, a 404 page, TUFTE atlas and neighborhood projections, project configuration, deterministic build reports, and recursive byte-preserving public assets with collision protection.

## Neocities deployment plan

`@red-cup-engineering/static-site-publisher/neocities` plans a dry-run Neocities deployment over the artifacts `build` returns: `neocitiesUploadHashRequest` hashes each artifact (SHA-1, as `upload_hash` asks), `neocitiesUploadHashForm` makes the request body, and `planNeocitiesDeployment` reads the response into changed and unchanged paths with an inventory digest. It makes no network call, holds no API key and never plans a deletion.

## Website framework boundary

Downstream applications import VICTOR, not its HTTP server or TUFTE dependencies. `createVictorWebsite()` owns the whole build, application-composition, TUFTE projection, serving, and rebuild lifecycle:

```js
import { createVictorWebsite } from '@red-cup-engineering/victor';

const researchApplication = {
  resources: [{
    id: 'research-status',
    match: '/api/research',
    methods: ['GET'],
    handler: () => ({ status: 200, body: 'research ready' }),
  }],
};

const website = await createVictorWebsite({
  contentDir: new URL('./content', import.meta.url).pathname,
  site: { name: 'Research application', baseIri: 'https://research.example/' },
  applications: researchApplication,
});

website.watch();
await website.start({ host: '127.0.0.1', port: 8561 });
```

`applications` uses the shared HTTP application contract and receives VICTOR's rebuild-aware catalog context when supplied as a factory. `website.rebuild()` replaces generated website state without recreating stateful downstream applications. `website.close()` closes watchers and drains the shared upstream server. The `victor serve` command uses this same public boundary rather than carrying a private second implementation.

## Composition

A `victor.config.mjs` may export `publicDir`, `site`, `theme`, and an `applications` factory. The factory receives the current build, a dynamic `listPublications()` view, and `fetchApplication()` for adapting route-scoped Fetch handlers. It returns one or more applications using the shared HTTP application contract. VICTOR composes those first, then its redirect application and the lower `serve-http-artifact-inventory-service` release application. A live rebuild updates the artifact inventory, redirects, and `listPublications()` without recreating stateful lower applications. The runtime uses the shared observability preset for correlation IDs, W3C trace context, Server-Timing, and private request metrics by default; a profile may publish the metrics resource or explicitly disable the preset. Shared `/healthz`, `/livez`, and build-aware `/readyz` resources are enabled by default and may be renamed, extended, or disabled through the runtime `probes` option.

The project configuration is versioned and closed. It may also provide a `content-reader/v1` reader and additional build projectors. The default filesystem reader supplies content digests, provenance, and dependencies instead of letting VICTOR walk files itself. Built-in archive, page, TUFTE, theme, feed, discovery, redirect, and public-asset projections use the shared projector contract; additional projectors receive the normalized build context. Every artifact retains its projector/source provenance, and path collisions block release rather than relying on insertion order.

The optional `site.founded` field is an ISO date declaring when the site was
founded. A published cell whose `date-created` predates it must carry an
external witness in `first-published-at` or `archived-at`; VICTOR refuses an
unwitnessed pre-founding publication. A republished cell keeps `date-created`
as the work's first publication date and may add these front-matter fields:

- `first-published-at`: the absolute HTTP(S) URL where the work first appeared;
- `archived-at`: the absolute HTTP(S) URL of an Internet Archive capture; and
- `republished`: the ISO date on which the work appeared on this site. It is
  required with `first-published-at` and cannot precede `date-created`.

VICTOR carries those facts into the page's prose, microformats2 and JSON-LD,
and into RSS, Atom, and JSON Feed dates.

`home: false` omits VICTOR's default home projection so a domain projector can own the root route. Its artifact remains subject to the same collision checks as every other projection. `home: '<cell name>'` gives the root route to that published cell (a site's own home page), rendered as its page, in place of the catalog listing. The root is the cell's canonical URL; its ordinary `/<cell name>/` route becomes a noindex redirect to `/`, and references to the cell resolve to the root. The cell keeps its identity and publication membership. A missing or draft-excluded name is a refusal; a potential cell is available only in an explicitly enabled draft preview.

Publication archives are enabled by default with 20 items per page. Set
`archives: { pageSize: 40 }` to change that bound, or `archives: false` when a
site supplies its own index projection. VICTOR renders the neutral lower
archive projection through its ordinary escaped HTML shell and shared theme.
Every collection has a complete `/archive/` route as well as paged
routes; collisions with cells, redirects, and other archive routes are release
diagnostics.

An optional `pwa` configuration enables the shared progressive-web-app
projector. It runs as a deliberate second phase after the ordinary artifact
inventory is complete, deriving a deterministic web app manifest, precache
inventory, content-addressed cache name, service worker, and offline behavior.

Public search is enabled by default. The shared search projector runs after
HTML rendering and emits a deterministic weighted index plus a zero-dependency
browser query module; VICTOR supplies an accessible `/search/` interface. It
understands Pagefind-compatible body, ignore, metadata, and filter annotations.
Set `search: false` to omit the page and assets, or pass a search configuration
object to select paths, limits, stop words, and output locations. Search runs
before the optional PWA phase so its assets can be precached.

Browser asset transformation is enabled by default between ordinary projection
and search. The lower inventory transformer gives CSS and JavaScript final-byte
fingerprinted names, rewrites local HTML/CSS/module references, adds SHA-384 SRI
to script and stylesheet loads, assigns immutable cache metadata, and emits
`asset-manifest.json`. Set `assets: false` to preserve source filenames, or use
`assets` to select paths, extensions, hash length, integrity, and manifest path.

Feed serialization also lives below VICTOR. The shared projector emits RSS,
Atom, and JSON Feed artifacts with explicit media types; VICTOR maps catalog
publications to that neutral item contract and advertises all three formats in
rendered page heads.

Protocol endpoints are advertised only when they are actually configured. A
`discovery` object accepts `webmention`, `micropub`, `indieauthMetadata`, and
one or more `me` URLs; VICTOR validates them and emits the corresponding HTML
`link` relations across its rendered surfaces. This keeps page discovery in
the renderer while the receiving, authorization, and custody behavior remains
in the lower Webmention, Micropub, IndieAuth/OAuth, and ActivityPub apps.

A `release-manifest.json` is enabled by default and projected last,
after search and the optional PWA phase. The shared release-candidate service
records every completed artifact's path, public URL, byte length, SHA-256 `ni`
identity, and available media/cache/provenance metadata. It excludes itself and
the private build report to avoid recursive identities; the report carries the
manifest identity and summary. `victor build` writes that report beside the
output directory as `<output>.report.json`, never into the release. `victor check`
now compares two independently built
manifest identities. After `victor build` writes the output directory, it also
uses the lower verifier to check the materialized files against that manifest;
missing, changed, linked, or unexpected files fail the command. Set
`release: false` to omit it, or configure its profile, metadata, path, and
explicit exclusions through `release`.

Every rendered HTML artifact passes through a rendered-HTML conformance stage
as soon as projection completes (SAS §9.3, checks C-01, C-02, C-03, C-09,
C-10, C-12, and C-15 as embedded machine subsets: doctype, title, and unique
ids; the ARIA-last rule against explicit roles that restate native semantics;
the document language; heading hierarchy over the whole page, not only the
authored body; an alt attribute on every image; JSON-LD that parses and types
every node; and the orientation anatomy of a title, exactly one `h1`, a
`main`, and a `nav` on every indexable page). A finding is an ordinary refusal
naming the check and its catalog code (`R-13`, `R-14`, `R-10`, `R-11`, `R-12`,
`R-09`), so a failing page blocks release like a broken link does; a missing
`lang`, a link without an accessible name, and an image without intrinsic
dimensions are `A-03` advisories, the last because VICTOR does not yet
measure images. The stage runs over projector-supplied pages too, and VICTOR's
own pages pass it under test. Set `conformance: false` to omit it. What the
stage does not do is stated plainly: it is not a WHATWG validator, it does not
compute per-page contrast (the theme is certified at build time instead), and
C-04, C-05, C-07, C-11, and C-16 remain to be wired.

The completed candidate is also checked by the shared static-site conformance
service before it is called releasable. HTML references must resolve to an
artifact in the manifest or to an explicitly configured same-origin protocol
endpoint. Broken paths, unsafe URL schemes, and origin escapes become
ordinary build refusals. Remote preview probing remains a separate, injected-
fetch operation (also exposed by the lower `probe-static-site-release` command)
so provider credentials and traffic changes stay outside VICTOR.

The ActivityPub publication profile plugs into this seam: give `createPublicationActivityPubProvider()` the supplied `listPublications`, then wrap its `fetch` with `fetchApplication` and a predicate covering its actor, inbox/outbox, NodeInfo, and `.well-known` routes. Authentication, keys, inbox custody, and delivery remain ActivityPub application concerns; VICTOR supplies publications and composition.

Current product gaps are recorded without shrinking the mandate: transclusion, mathematics, and raw-HTML passthrough are not yet implemented; images are copied but not yet processed into modern formats (so intrinsic dimensions are advised, not enforced); there is one built-in template rather than the resolution cascade; nine of the sixteen SAS conformance checks are still not wired into the build; and richer structured-data projections (beyond the JSON-LD and OpenGraph/Twitter-card meta now emitted) and federation remain to be composed or implemented.
