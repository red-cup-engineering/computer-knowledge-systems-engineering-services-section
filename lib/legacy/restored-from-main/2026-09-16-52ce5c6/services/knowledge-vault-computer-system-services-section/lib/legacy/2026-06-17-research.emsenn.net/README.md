# research.emsenn.net

Personal dev workbench for the emsenn.net knowledge vault.
Runs locally on port 18800.
Federated with `research.
561.group` by shared data format (`content/` submodule) only — no code dependency between the two sites.

## Start

From workspace root:

```
make research serve
```

From this package:

```
pnpm run serve
```

Open: http://localhost:18800

## Env vars

| Var | Default | Purpose |
|-----|---------|---------|
| `EMSENN_KNOWLEDGE_VAULT_ROOT` | walks up to `content/` | corpus root |
| `EMSENN_KNOWLEDGE_VAULT_PORT` | `18800` | listen port |
| `EMSENN_KNOWLEDGE_VAULT_HOST` | `127.0.0.1` | listen host |

## Scripts

Every bin in `package.json#bin` is exposed over HTTP, OpenAPI, and MCP at `/scripts/<name>`.
Browse the full surface at http://localhost:18800/computer.

```
pnpm run check       # tsc --noEmit + check-scripts.mjs
pnpm run normalize   # bounded corpus normalization pass
```
