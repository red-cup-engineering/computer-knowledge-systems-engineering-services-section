import { validateVaultMazeConfig } from "./config.mjs";

export function spaceElements(world, wing) {
  return world.rooms.map((room) => Object.freeze({
    id: `${wing.id}:${room.id}`,
    kind: "concept-entity",
    label: room.title,
    wingId: wing.id,
    roomId: room.id,
    semanticPosition: Object.freeze({
      scienceOwner: room.frontmatter["science-owner"] ?? null,
      tags: room.frontmatter.tags ?? [],
      sourcePath: room.id,
    }),
    visibility: wing.visibility,
  }));
}

export function tufteElements(world, wing, layout) {
  return world.rooms.map((room) => {
    const position = layout.positions[room.id] ?? { x: 0, y: 0 };
    return Object.freeze({
      id: `tile:${wing.id}:${room.id}`,
      spaceElementId: `${wing.id}:${room.id}`,
      topology: "tile",
      x: position.x,
      y: position.y,
    });
  });
}

export function vaultMazeManifest(world, participation) {
  if (participation.mode !== "vaultmaze") return Object.freeze({ mode: "disabled" });
  const hardPrerequisites = new Map(world.rooms.map((room) => [room.id, []]));
  for (const door of world.doors) {
    if (door.weight === "hard" && hardPrerequisites.has(door.to)) {
      hardPrerequisites.get(door.to).push(door.from);
    }
  }
  const cardsByRoom = new Map(world.rooms.map((room) => [room.id, []]));
  for (const card of world.cards) {
    if (cardsByRoom.has(card.roomId)) cardsByRoom.get(card.roomId).push(card.id);
  }
  return Object.freeze({
    ...participation,
    schemaVersion: "vaultmaze-passage/v1",
    gates: Object.freeze(world.rooms.map((room) => Object.freeze({
      roomId: room.id,
      prerequisiteRoomIds: Object.freeze(hardPrerequisites.get(room.id).sort()),
      cardIds: Object.freeze(cardsByRoom.get(room.id).sort()),
    }))),
  });
}

export function buildTilingGridLayout(world, columns = 64) {
  const roomIds = world.rooms.map((room) => room.id).sort((left, right) => left.localeCompare(right));
  const positions = Object.fromEntries(roomIds.map((roomId, index) => [
    roomId,
    Object.freeze({ x: index % columns, y: Math.floor(index / columns) }),
  ]));
  return Object.freeze({
    wingId: world.wingId,
    strategy: "tiling-grid",
    columns,
    rows: Math.ceil(roomIds.length / columns),
    positions: Object.freeze(positions),
  });
}

/**
 * Compose compiler output into the two independent L-Space projections:
 * SPACE locates conceptual entities semantically; TUFTE arranges user-facing
 * tiles. The latter may change without changing what the former means.
 */
export async function composeVaultMaze(offeredConfig, compiler) {
  const config = validateVaultMazeConfig(offeredConfig);
  if (compiler === null || typeof compiler !== "object") {
    throw new TypeError("compiler must provide compileVault");
  }
  if (typeof compiler.compileVault !== "function") {
    throw new TypeError("compiler must provide compileVault");
  }

  const compiledWings = [];
  for (const wing of config.wings) {
    const compiled = await compiler.compileVault(
      wing.root,
      { id: wing.id, attributeFields: wing.attributeFields },
      { dialect: wing.dialect, excludeGlobs: wing.excludeGlobs },
    );
    const world = compiled.world;
    const layout = wing.tufte.strategy === "force-directed"
      ? await (() => {
          if (typeof compiler.buildLayout !== "function") {
            throw new TypeError("force-directed TUFTE requires compiler.buildLayout");
          }
          return compiler.buildLayout(world);
        })()
      : buildTilingGridLayout(world, wing.tufte.columns);
    compiledWings.push(Object.freeze({
      id: wing.id,
      dialect: compiled.dialect,
      dialectReason: compiled.dialectReason,
      visibility: wing.visibility,
      tufteStrategy: wing.tufte.strategy,
      world,
      layout,
      passage: vaultMazeManifest(world, config.participation),
      space: Object.freeze(spaceElements(world, wing)),
      tufte: Object.freeze(tufteElements(world, wing, layout)),
    }));
  }

  return Object.freeze({
    schemaVersion: "l-space/v1",
    id: config.id,
    title: config.title,
    baseUrl: config.baseUrl,
    auth: config.auth,
    participation: config.participation,
    vocabulary: Object.freeze({
      lSpace: "Lenticule Space",
      SPACE: "Semantic Position Arranging Conceptual Elements",
      TUFTE: "Tiling User Form Topology Engine",
    }),
    wings: Object.freeze(compiledWings),
  });
}
