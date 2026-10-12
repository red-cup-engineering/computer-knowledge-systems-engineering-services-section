function claimIntersects(actualClaims, requiredClaims) {
  const actual = new Set(actualClaims);
  return requiredClaims.some((claim) => actual.has(claim));
}

function hardAncestors(world, targetRoomId) {
  const incoming = new Map(world.rooms.map((room) => [room.id, []]));
  for (const door of world.doors) {
    if (door.weight === "hard" && incoming.has(door.to)) incoming.get(door.to).push(door.from);
  }
  const found = new Set();
  const pending = [...(incoming.get(targetRoomId) ?? [])];
  while (pending.length > 0) {
    const roomId = pending.pop();
    if (found.has(roomId)) continue;
    found.add(roomId);
    pending.push(...(incoming.get(roomId) ?? []));
  }
  return found;
}

/**
 * Resolve a reader's attempted passage without confusing access policy with
 * knowledge topology. Review state is private per reader and never enters the
 * shared World. A familiar returns a copy without falsely granting learning credit.
 */
export function evaluateVaultMazePassage({
  passage,
  world,
  targetRoomId,
  reviewStateByCardId = {},
  claims = [],
  now,
  recallProbability,
  requestFamiliar = false,
}) {
  if (!world.rooms.some((room) => room.id === targetRoomId)) {
    throw new RangeError(`unknown target room: ${targetRoomId}`);
  }
  if (passage.mode === "disabled") return Object.freeze({ allowed: true, route: "direct" });
  if (!Number.isFinite(now)) throw new TypeError("now must be a finite epoch-day number");
  if (typeof recallProbability !== "function") {
    throw new TypeError("VaultMaze passage requires an injected recallProbability function");
  }
  if (claimIntersects(claims, passage.accessibilityBypassClaims)) {
    return Object.freeze({ allowed: true, route: "accessibility-bypass" });
  }
  if (claimIntersects(claims, passage.directReadClaims)) {
    return Object.freeze({ allowed: true, route: "authorized-direct-read" });
  }

  const relevantRooms = hardAncestors(world, targetRoomId);
  relevantRooms.add(targetRoomId);
  const requiredCards = [];
  for (const card of world.cards) {
    if (!relevantRooms.has(card.roomId)) continue;
    const state = reviewStateByCardId[card.id] ?? card;
    if (state.lastReviewedAt === undefined) {
      requiredCards.push(Object.freeze({ cardId: card.id, roomId: card.roomId, reason: "unreviewed" }));
      continue;
    }
    const elapsed = Math.max(0, now - state.lastReviewedAt);
    if (recallProbability(elapsed, state.stability) < passage.targetRetention) {
      requiredCards.push(Object.freeze({ cardId: card.id, roomId: card.roomId, reason: "due" }));
    }
  }
  requiredCards.sort((left, right) => left.cardId.localeCompare(right.cardId));
  if (requiredCards.length === 0) {
    return Object.freeze({ allowed: true, route: "guided", requiredCards: Object.freeze([]) });
  }
  if (requestFamiliar && passage.familiar.enabled) {
    return Object.freeze({
      allowed: true,
      route: "familiar-retrieval",
      learningCredit: false,
      costPolicy: passage.familiar.costPolicy,
      requiredCards: Object.freeze(requiredCards),
    });
  }
  return Object.freeze({
    allowed: false,
    route: "review-gate",
    requiredCards: Object.freeze(requiredCards),
  });
}
