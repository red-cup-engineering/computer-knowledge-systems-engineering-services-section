// Shared types for @561-group/vault-compiler. This is THE contract: the `World` shape below
// is byte-for-byte the platform World JSON that @561-group/lantern-service (display name
// VaultMaze) already consumes — derived directly from lantern-service's src/types.mts, not
// reinvented. Any change here is a contract change for every consumer.

export type RoomId = string; // wing-relative, forward-slashed path — e.g. "glossary/terms/atari.md"
export type WingId = string;
export type CardId = string;
export type HallId = string;
export type KataId = string;

/** Anki-style four-button self-grade. 1=Again, 2=Hard, 3=Good, 4=Easy. */
export type Grade = 1 | 2 | 3 | 4;

export type CardKind = 'cloze' | 'term-from-def' | 'dependency' | 'exercise' | 'teaches';

export type LightStage = 'full' | 'embers' | 'dim' | 'fogged';

/** Frontmatter values as the hand-rolled parser (frontmatter.mjs) produces them: every key
 * maps to either a single scalar string or a flat list of strings. Nested maps are recognized
 * and skipped, never mis-parsed. */
export type FrontmatterData = Record<string, string | string[]>;

export interface Room {
  id: RoomId;
  wingId: WingId;
  title: string;
  aliases: string[];
  kind: string;
  description?: string;
  body: string;
  /** Raw frontmatter, retained for card generation and hall attribute extraction. */
  frontmatter: FrontmatterData;
  dateCreated?: string;
}

export interface Door {
  from: RoomId; // prerequisite
  to: RoomId; // dependent
  weight: 'hard' | 'soft';
  reason: string;
}

export interface Hall {
  id: HallId;
  intent: string[];
  rooms: RoomId[];
  stable: boolean;
}

export interface ReviewCard {
  id: CardId;
  roomId: RoomId;
  kind: CardKind;
  front: string;
  back: string;
  stability: number; // days
  difficulty: number; // 1..10, lower = easier
  lastReviewedAt?: number; // epoch day (integer), NEVER Date.now() inside domain logic
}

export interface Kata {
  id: KataId;
  path: RoomId[];
  origin: 'auto-hall' | 'custom';
  stability: number;
  difficulty: number;
  lastRunAt?: number; // epoch day
}

/** Identifies which vault dialect an adapter parses. `'house'` is the original lantern-service
 * corpus convention (frontmatter path-fields as hard doors, `## Related terms`-shaped body
 * links as soft doors). `'obsidian'` and `'org'` are foreign-vault dialects — see
 * dialect.d.ts and the adapters/ modules for what each honestly supports. */
export type DialectId = 'house' | 'obsidian' | 'org';

export interface WingConfig {
  id: WingId;
  /** Frontmatter fields to treat as hard-door candidates. Default: every field whose value(s)
   * are shaped like a doc-link (dialect-dependent shape), minus `excludeFields`. */
  hardLinkFields?: string[];
  /** Fields never treated as doors even if link-shaped. */
  excludeFields?: string[];
  /** Attribute fields FCA draws from. Default: ['cites', 'type', 'tags']. */
  attributeFields?: string[];
  /** Curator override groups: offered back to the compiler, never replacing the derived halls,
   * only supplementing them. */
  groups?: { name: string; match: (attrs: ReadonlySet<string>) => boolean }[];

  // --- dialect field-name mapping (house.mts's 7 originally-hardcoded key names, now
  // overridable so the SAME compile pipeline is vault-neutral; see the seam digest). Every
  // field below defaults to today's house convention when omitted, so an unconfigured house
  // wing compiles byte-identically to the pre-existing lantern-service compiler. ---
  titleField?: string; // default 'title'
  aliasFields?: string[]; // default ['aliases', 'defines', 'teaches']
  kindField?: string; // default 'type'
  dateField?: string; // default 'date-created'
  archivalField?: string; // default 'provenance' — presence-of-value skip predicate
  descriptionField?: string; // default 'description'
}

export interface World {
  wingId: WingId;
  rooms: Room[];
  doors: Door[];
  halls: Hall[];
  cards: ReviewCard[];
  warnings: string[];
}

export const DEFAULT_ATTRIBUTE_FIELDS: readonly string[];
export const DEFAULT_EXCLUDE_FIELDS: readonly string[];

// --- adapter contract -----------------------------------------------------------------------

/** One frontmatter (or field-equivalent) value that looks like it could be a hard door,
 * discovered by an adapter's dialect-appropriate shape rule. */
export interface HardFieldCandidate {
  field: string;
  value: string;
}

/** One body/prose link discovered by an adapter, with its surrounding-context rationale text
 * (used verbatim as a generated dependency card's answer when the door is retained). */
export interface LinkCandidate {
  url: string;
  reason: string;
}

export interface AdapterFile {
  absPath: string;
  roomId: RoomId;
}

/** What one adapter produces for one file: a Room, plus the raw (unresolved) hard/soft link
 * candidates the shared compile pipeline resolves, applies the promotion rule to, and turns
 * into Doors. `null` means the adapter chose to skip the file (e.g. house's `provenance:`
 * archival-skip rule). */
export interface AdapterParseResult {
  room: Room;
  hardCandidates: HardFieldCandidate[];
  softCandidates: LinkCandidate[];
}

/** A resolved-link lookup index built once per compile from the adapter's own set of rooms
 * (e.g. a basename index for house/org `.md`/`.org` links, or a title+alias index with the
 * shortest-unique-path rule for Obsidian wikilinks). */
export type VaultIndex = unknown;

export type ResolveResult =
  | { kind: 'resolved'; roomId: RoomId }
  | { kind: 'self' }
  | { kind: 'not-a-doc-link' }
  | { kind: 'external' }
  | { kind: 'unresolved'; raw: string }
  | { kind: 'ambiguous'; raw: string; candidates: RoomId[] };

/** The shape every dialect adapter module exports. Not a runtime-enforced interface (this is a
 * zero-dependency, hand-rolled package — no class hierarchy) but every adapters/*.mjs module
 * exports exactly these four functions under these names. */
export interface VaultAdapter {
  id: DialectId;
  discoverFiles(root: string, excludeGlobs: readonly string[]): string[];
  parseRoom(root: string, absPath: string, wingId: WingId, config: WingConfig): AdapterParseResult | null;
  buildIndex(rooms: readonly Room[]): VaultIndex;
  resolveLink(raw: string, sourceRoomId: RoomId, index: VaultIndex): ResolveResult;
}

export interface CompileOptions {
  dialect?: DialectId; // explicit override; auto-detected via dialect.mjs when omitted
  excludeGlobs?: string[]; // ALWAYS includes any path segment literally named "teraum"
}
