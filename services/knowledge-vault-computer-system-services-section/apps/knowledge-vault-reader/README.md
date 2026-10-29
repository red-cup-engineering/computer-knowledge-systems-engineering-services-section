# knowledge-vault-reader (VaultMaze)

VaultMaze is Red Cup Engineering's composable knowledge-navigation and learning
application. Its product bar is to meet and beat Microsoft MindMaze, including
the parts that make knowledge spaces explorable, memorable, adaptive, and fun.

VaultMaze is not the content repository. CAIRN supplies admitted content-archive
operations. VaultMaze turns those resources and their typed relationships into
rooms, passages, review state, and user-configured navigation. VICTOR supplies
the website boundary, and TUFTE supplies the Tiling User Form Topology Engine
used to arrange the active experience.

L-Space is one VaultMaze instance. Its admission policy may instead mount GEODE
for a principal authorized to inspect and revise the underlying entity graph.
That selection belongs to the L-Space application boundary; neither CAIRN nor
VaultMaze should infer authority from a rendering choice.

## Projection and application

VaultMaze is projected over a VICTOR vault catalog. A site's `victor.config.mjs`
sets `catalog: { dialect: 'vault' }`, `home: false`, and mounts the projector
and the application:

```js
import { createVaultMazeProjector } from '@red-cup-engineering/knowledge-vault-reader/projector';
import { createVaultMazeApplication } from '@red-cup-engineering/knowledge-vault-reader/application';
import { createMemoryReviewStore } from '@red-cup-engineering/knowledge-vault-reader/review-store';

export default {
  configVersion: 1,
  site: { name: 'A Vault', baseIri: 'https://vault.example/' },
  catalog: { dialect: 'vault', exclude: ['drafts'] },
  home: false, archives: false, search: false, tufte: false,
  projectors: [createVaultMazeProjector({ title: 'A Vault' })],
  applications: [createVaultMazeApplication({ reviews: createMemoryReviewStore(), subjectOf: () => null })],
};
```

The projector emits the browser application at `/`, the browser engine it
runs on (the scheduler and light cone from the education platform, room search
from CAIRN, the tile renderer from TUFTE, projected from those packages rather
than copied), and the content-addressed release the application reads:
`vault/index.json`, `vault/manifest.json`, `vault/rooms/<sha256-room-id>.json`,
`vault/views/garden.json`, `vault/views/halls.json`, and the anonymous surface
under `vault/public/`, which receives only rooms whose own frontmatter declared
`visibility: public`. Every body is rendered by VICTOR; nothing here carries a
second Markdown renderer.

The application is one resource, `/api/v1/reviews`, over a review store. Who
the reader is comes from the admission boundary as a pseudonymous subject
through `subjectOf(context)`; with nobody admitted, reviews stay closed.
`createReviewStore(database)` speaks the D1 statement shape, which Cloudflare
D1 and a Node SQLite adapter both satisfy, and `REVIEW_STORE_SCHEMA` is its one
table.

The current package owns the existing typed configuration, world composition,
and passage evaluation functions. Its incomplete competitive work includes
adaptive spatial navigation, durable per-reader learning state, multiplayer
knowledge trails, accessible direct manipulation, and measured comparison
against MindMaze rather than feature-name imitation.
