/**
 * `compile` — the dialect-neutral compile pipeline: pick an adapter (house/obsidian/org, by
 * detection or explicit override), let it discover files and parse rooms + raw link candidates,
 * then run the SAME shared resolution/promotion/FCA/stability/cards pipeline every dialect
 * shares (this is the part the seam digest found was already dialect-neutral in
 * lantern-service's compile.mts — vendored here unchanged, just no longer hard-wired to a
 * single adapter). Read-only by construction: nothing in this module ever calls a `fs` write
 * function — see `read-only.test.mts`, which asserts that as a checked invariant, not an
 * incidental fact.
 */
import { sep } from 'node:path';
import * as houseAdapter from './adapters/house-md.mjs';
import * as obsidianAdapter from './adapters/obsidian-md.mjs';
import * as orgAdapter from './adapters/org.mjs';
import { detectDialect } from './dialect.mjs';
import { enumerateFormalConcepts } from '@lenticule-science/metrologic/closure/formal-concepts';
import { withStability } from './stability.mjs';
import { generateCardsForRoom } from './cards.mjs';
import { asList } from './frontmatter.mjs';
import { assembleWorld } from './canonical.mjs';

export const ADAPTERS = {
  house: houseAdapter,
  obsidian: obsidianAdapter,
  org: orgAdapter,
};

/** House's own defaults, unchanged — a house wing compiled through this package with no
 * `attributeFields` override draws from exactly these three fields, same as before. */
export const DEFAULT_ATTRIBUTE_FIELDS = ['cites', 'type', 'tags'];

/** Per-dialect attribute-field defaults, used only when `WingConfig.attributeFields` is not
 * given. House keeps its original three-field default; Obsidian and org draw from what those
 * dialects actually populate (`tags`, plus `type` when an Obsidian note happens to set one) —
 * an honest default, not a house field name applied where it would silently match nothing. */
const DEFAULT_ATTRIBUTE_FIELDS_BY_DIALECT = {
  house: DEFAULT_ATTRIBUTE_FIELDS,
  obsidian: ['tags', 'type'],
  org: ['tags'],
};

function roomAttributes(room, attributeFields) {
  const attrs = new Set();
  for (const field of attributeFields) {
    for (const v of asList(room.frontmatter[field])) attrs.add(`${field}:${v}`);
  }
  return attrs;
}

function buildHalls(rooms, config, doors, attributeFields) {
  const objects = rooms.map((r) => ({ id: r.id, attrs: roomAttributes(r, attributeFields) }));
  const result = enumerateFormalConcepts(objects, (id) => id);
  const { concepts } = result;

  const derived = concepts.map((c, i) => ({ id: `hall:${i}`, intent: c.intent, rooms: c.extent }));

  const curatorHalls = (config.groups ?? []).map((g, i) => {
    const matchedRooms = objects.filter((o) => g.match(o.attrs)).map((o) => o.id);
    return { id: `curator:${i}:${g.name}`, intent: [`curator:${g.name}`], rooms: matchedRooms.sort() };
  });

  return { halls: withStability([...derived, ...curatorHalls], doors), fallbackReason: result.fallbackReason };
}

/** If a room has zero hard doors (evaluated against the ORIGINAL hard-door set only, before any
 * promotion — order-independent, per-room), every soft door targeting it is promoted to hard.
 * Vendored unchanged: this is the SAME rule that makes house's `## Related terms`-only term
 * rooms gate correctly, and it is what makes Obsidian/org's "no hard-door convention" degrade to
 * "doors from links only" for free — no dialect-specific branch needed. */
function applyPromotion(hardDoors, softDoors) {
  const hardInCount = new Map();
  for (const d of hardDoors) hardInCount.set(d.to, (hardInCount.get(d.to) ?? 0) + 1);
  const promotedSoft = softDoors.map((d) => ((hardInCount.get(d.to) ?? 0) === 0 ? { ...d, weight: 'hard' } : d));
  return [...hardDoors, ...promotedSoft];
}

/**
 * Indexes the sorted room sequence once for card dependency labels. Keep the
 * first title for a duplicate ID, exactly as the former `find` lookup did.
 * @param {{id: string, title: string}[]} rooms
 * @returns {(id: string) => string}
 */
/** A file's vault-relative, slash-joined id, for warnings raised before an adapter named it. */
function vaultRelativeId(root, absPath) {
  const prefix = root.endsWith(sep) ? root : root + sep;
  const relative = absPath.startsWith(prefix) ? absPath.slice(prefix.length) : absPath;
  return relative.split(sep).filter((segment) => segment.length > 0).join('/');
}

export function roomTitleLookup(rooms) {
  const titles = new Map();
  for (const room of rooms) if (!titles.has(room.id)) titles.set(room.id, room.title);
  return (id) => titles.get(id) ?? id;
}

/**
 * @param {string} root
 * @param {WingConfig} wingConfig
 * @param {CompileOptions} [options]
 * @returns {{ world: World, dialect: DialectId, dialectReason: string }}
 */
/** The candidates of an ambiguous link, named in full up to three; a forest of index files can match hundreds. */
function candidateSummary(candidates) {
  return candidates.length <= 3
    ? candidates.join(', ')
    : `${candidates.slice(0, 3).join(', ')}, and ${candidates.length - 3} more`;
}

export function compileVault(root, wingConfig, options = {}) {
  const config = wingConfig;
  const excludeGlobs = options.excludeGlobs ?? [];
  const detection = options.dialect
    ? { dialect: options.dialect, reason: 'explicit override' }
    : detectDialect(root, { excludeGlobs });

  const adapter = ADAPTERS[detection.dialect];
  if (!adapter) {
    throw new Error(`knowledge-system-server: unknown dialect "${detection.dialect}" (known: ${Object.keys(ADAPTERS).join(', ')})`);
  }

  const files = adapter.discoverFiles(root, excludeGlobs);
  const warnings = [];

  const rooms = [];
  const hardCandidatesByRoom = new Map();
  const softCandidatesByRoom = new Map();
  for (const f of files) {
    let parsed;
    try {
      parsed = adapter.parseRoom(root, f, config.id, config);
    } catch (error) {
      // One unreadable or undecodable file is a warning against that file, never an
      // abort of the whole vault. A corpus of tens of thousands of notes must not
      // lose every room to one malformed frontmatter block.
      warnings.push(`${vaultRelativeId(root, f)}: skipped: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!parsed) continue; // adapter chose to skip this file (e.g. house's provenance archival rule)
    rooms.push(parsed.room);
    hardCandidatesByRoom.set(parsed.room.id, parsed.hardCandidates);
    softCandidatesByRoom.set(parsed.room.id, parsed.softCandidates);
  }
  rooms.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const index = adapter.buildIndex(rooms);

  const hardDoors = [];
  const softDoors = [];
  for (const room of rooms) {
    for (const { field, value } of hardCandidatesByRoom.get(room.id) ?? []) {
      const res = adapter.resolveLink(value, room.id, index);
      if (res.kind === 'resolved') {
        hardDoors.push({
          from: res.roomId,
          to: room.id,
          weight: 'hard',
          reason: `declared as a prerequisite of "${room.title}" via frontmatter field "${field}"`,
        });
      } else if (res.kind === 'unresolved') {
        warnings.push(`${room.id}: frontmatter field "${field}" links to "${value}" which does not resolve to any room in this wing`);
      } else if (res.kind === 'ambiguous') {
        warnings.push(`${room.id}: frontmatter field "${field}" link "${value}" matches multiple rooms: ${candidateSummary(res.candidates)}`);
      }
      // 'self' / 'external' / 'not-a-doc-link' are silently not-doors.
    }
    for (const cand of softCandidatesByRoom.get(room.id) ?? []) {
      const res = adapter.resolveLink(cand.url, room.id, index);
      if (res.kind === 'resolved') {
        softDoors.push({ from: res.roomId, to: room.id, weight: 'soft', reason: cand.reason });
      } else if (res.kind === 'unresolved') {
        warnings.push(`${room.id}: body link to "${cand.url}" does not resolve to any room in this wing`);
      } else if (res.kind === 'ambiguous') {
        warnings.push(`${room.id}: body link "${cand.url}" matches multiple rooms: ${candidateSummary(res.candidates)}`);
      }
    }
  }
  const doors = applyPromotion(hardDoors, softDoors);

  const attributeFields = config.attributeFields ?? DEFAULT_ATTRIBUTE_FIELDS_BY_DIALECT[detection.dialect] ?? DEFAULT_ATTRIBUTE_FIELDS;
  const hallProjection = buildHalls(rooms, config, doors, attributeFields);
  const halls = hallProjection.halls;
  if (hallProjection.fallbackReason !== null) warnings.push(`FCA halls use deterministic greedy fallback (${hallProjection.fallbackReason}); exact concept closure exceeded its bounded computation limit`);

  const roomTitleOf = roomTitleLookup(rooms);
  const cards = [];
  for (const room of rooms) {
    const dependencyDoors = doors.filter((d) => d.to === room.id && d.weight === 'hard');
    cards.push(...generateCardsForRoom(room, dependencyDoors, roomTitleOf));
  }

  const world = assembleWorld({ wingId: config.id, rooms, doors, halls, cards, warnings });
  return { world, dialect: detection.dialect, dialectReason: detection.reason };
}
