/**
 * index.mjs — the full @561-group/vault-compiler surface re-exported from one module, for
 * callers who would rather not name each subpath individually. Consumers wiring a specific
 * adapter or the layout builder are still expected to import the narrower subpaths
 * (`@561-group/vault-compiler/compile`, `/dialect`, `/adapters/house-md`, ...) directly — this
 * barrel is a convenience, not the primary intended entry point (same convention as
 * `@red-cup-engineering/cartridge`'s own barrel).
 */
export * from './frontmatter.mjs';
export * from './fca.mjs';
export * from './stability.mjs';
export * from './cards.mjs';
export * from './kata.mjs';
export * from './dialect.mjs';
export * from './canonical.mjs';
export * from './compile.mjs';
export * from './build-layout.mjs';
export * from './wikilink.mjs';
export * from './docindex.mjs';
export * from './walk.mjs';
