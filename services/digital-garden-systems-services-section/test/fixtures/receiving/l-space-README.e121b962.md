# L-Space

L-Space is the Lenticule Science knowledge garden at `https://l-space.561.group`.
Its current deployable application is `src/site.mjs`, exported as
`@lenticule-science/l-space/site` and loaded as a companion of the Bare Cedar
Fog FeltOS host.

There is no current standalone VICTOR/static-site-publisher application here.
References to `static-site-publisher.config.mjs`, a standalone L-Space service,
or `static-site-publisher serve --release` are historical and must not be used
as current deployment instructions.

## MetroPlat corpus access

The Group profile installs `@lenticule-science/l-space/metroplat` as
`lSpaceMetroplat`. Inside FeltOS's existing entrance, `/knowledge` and
`lspace_search`/`lspace_fetch` read one CAIRN archive over the Science corpus.
People search and open complete source documents; agent results name those same
`/knowledge?document=...` URLs and retain source revisions and metadata.
The host's existing admission applies to both projections. No gateway token,
HTTP corpus hop, additional client connector, listener or OAuth server is
required for this reading capability.

The older companion garden still carries public rooms, reviews, media,
notebooks and authoring. Those distinct effects and external consumers remain
migration work; installing the corpus reader does not establish their retirement
or full single-world alignment. The shared archive policy retains custody and
working-stratum exclusions in both projections.

## Current composition

`lSpaceApplication(environment)` composes the existing owning services:

- **web admission** decides who may read protected material;
- **VaultMaze** reads the Science forest and projects the garden, public/private
  room trees, feeds, glossary vocabulary and room metadata;
- **GEODE** is loaded only when an authoring checkout is configured;
- the **knowledge-system archive** serves search/read and persists parsed state;
- **immutable content custody** serves ni-addressed media;
- **Gemini Notebook buckets** are an optional author-only S3-style surface;
- **OAuth + MCP** expose the admitted Science corpus to connected assistants.

L-Space does not own those reusable engines. This package owns the Lenticule
Science composition, policy, deployment bindings and receiving tests.

## Public and protected rooms

The default room is authenticated. A room is anonymous only when its own
frontmatter contains the literal:

```yaml
visibility: public
```

Custody/working strata such as `legacy`, `triage`, `private`, `dev`,
`test`, `fixtures`, `dist`, `sites` and `lib` are excluded from the
garden projection.

The anonymous garden is **not** the scientific-release set. A readable room is
not thereby independently received Science, licensed for reuse, or a publication
candidate. Scientific receiving and reuse rights remain separate authority
questions.

## Current public addresses

VaultMaze exposes the anonymous public index and room JSON under the public vault
tree and computes an ordinary server route for each room. The interactive garden
and current MCP document links still use the VaultMaze application route.

The existence of a computed ordinary route is not evidence that the deployed
server currently serves that route as a crawlable document. That remains a
receiver-side Web conformance obligation: activate the existing route only
through the current VaultMaze/Web interfaces, then independently read it from
outside the serving boundary before changing feeds, canonical links, or claiming
crawlability.

Do not create a second Science CMS or copy the manuscript into another content
store to solve that problem.

## MCP

`/mcp` is L-Space's MCP server. Its authorization server uses the same admitted
reader identity as the site. Admitted readers may search/read; authoring tools are
shown only to the configured author.

The MCP resource's current human document link is derived by `roomUrl` in
`src/site.mjs`. Changing it to an ordinary room URL is appropriate only after
that ordinary URL is actually served and independently received.

## Deployment

L-Space is deployed as a dependency/companion of:

`@561-group/bare-cedar-fog-host-deployment`

The host release, not an L-Space-local shell command, decides which committed
source revision is live. Source merge, host release, process readiness and public
HTTP receiving are separate receipts.

Relevant environment settings read by `src/site.mjs` include:

- `LSPACE_STATE_DIR` — required state root;
- `PUBLIC_BASE_URL` — public origin;
- `LSPACE_ROOT` — Science/content root override;
- `LSPACE_EXCLUDE`, `LSPACE_WING`, `LSPACE_TITLE`, `LSPACE_SUBTITLE` —
  projection overrides;
- `LSPACE_AUTHOR_EMAIL`, `LSPACE_AUTHOR_SUBJECTS`, `LSPACE_ALLOWED_EMAILS` —
  author/admission policy inputs;
- Google/Discord/password/Hive provider settings used by web admission;
- `LSPACE_MEDIA_ROOT` — ni-addressed media root;
- `LSPACE_NOTEBOOK_BUCKETS=false` — disable the optional Notebook bucket face;
- `GEODE_AUTHORING_ROOT`, `GEODE_AUTHORING_REGION` — authoring checkout;
- `LSPACE_OAUTH_STATE` — OAuth grant store;
- `LSPACE_GATEWAY_TOKENS` — named trusted gateway credentials;
- `GITHUB_SHA` or `LENTICULE_SCIENCE_SOURCE_REVISION` — explicit source
  revision evidence.

Secrets belong in deployment state/environment, never this repository.

## Testing

Run the package acceptance suite:

```sh
node --test test/*.test.mjs
```

The current site integration test starts `lSpaceApplication` through the same
native web-application adapter used by the FeltOS host and verifies the bounded
receiving invariants: public opt-in is anonymous, protected room surfaces remain
gated, excluded custody material does not become a public room, and the public
index still carries VaultMaze's ordinary route.

A green package test proves those source/runtime invariants. It does not by
itself prove the deployed companion is current or publicly reachable; those need
host-release and outside-observation receipts.
