import { DEFAULT_TARGET_RETENTION, recallProbability, reviewCard } from "./js/srs.mjs";
import { classifyStage, computeLightCone, revealedTerritory } from "./js/lightcone.mjs";
import { renderMap } from "./map.js";
import { dailyLanternWalk } from "./js/walk.mjs";
import { awardedBelt, makeAutoKata, pickKataCards, summarizeKataRun } from "./js/kata.mjs";
import { searchImmutableRoomIndex } from "./js/room-index-search.mjs";
import { applyTufteProjectionPatch, diffTufteProjection, normalizeTufteModel } from "./js/tufte-browser.mjs";
import { gradeResponse } from "./js/answer.mjs";
import { vaultMazeWalkRules } from "./js/walk-rules.mjs";
import { gridFromCells } from "./js/abrash-grid.mjs";
import { camera, render } from "./js/abrash-raycaster.mjs";
import { paintToCanvas } from "./js/abrash-framebuffer.mjs";
// The deployment names itself in the shell; the application reads it there.
const SITE = Object.freeze({
  title: document.querySelector('meta[name="application-name"]')?.content ?? "VaultMaze",
  documentTitle: document.title,
});
const escapeHtml = (value) => String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
const view = document.querySelector("#view");
const loading = document.querySelector("#loading");
const search = document.querySelector("#search");
const collectionNav = document.querySelector("#collection-nav");
const cardTemplate = document.querySelector("#room-card-template");
const state = {
  anonymous: false, me: null, surface: null, publicIndex: null, manifest: null, index: null, garden: null, halls: null,
  feltosRelations: null, indexPromise: null, hallsPromise: null, reviews: new Map(), byId: new Map(), byKey: new Map(), byName: new Map(), byRoute: new Map(), collections: [],
};
let disposeVoxelWalk = null;

const WALK_FACING = Object.freeze(["east", "south", "west", "north"]);
const WALK_DIRECTIONS = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1]]);
const voxelKey = (x, z) => `${Math.floor(x)},${Math.floor(z)}`;

/** The reader's light is an observation map over cells, not part of the replayed position. */
export function observedVoxelCells(voxelView, litRooms, carved = []) {
  const fogged = (voxelView.chambers ?? []).filter(({ roomId }) => !litRooms.has(roomId));
  const gateKeys = new Set((voxelView.gates ?? []).map(({ x, z }) => voxelKey(x, z)));
  const opened = new Set(carved);
  return (voxelView.cells ?? []).map(([x, z, reading]) => {
    const roomIsFogged = fogged.some((room) => x >= room.x && x < room.x + room.size && z >= room.z && z < room.z + room.size);
    if (roomIsFogged && reading === "f") return [x, z, "bot"];
    if (gateKeys.has(voxelKey(x, z)) && !opened.has(voxelKey(x, z))) return [x, z, "t"];
    return [x, z, reading];
  });
}

async function beginDiscordCommandLogin(container) {
  container.replaceChildren();
  const status = document.createElement("p");
  status.className = "discord-command-status";
  status.setAttribute("role", "status");
  status.textContent = "Opening a short Discord login code…";
  container.append(status);
  let challenge;
  try {
    const response = await fetch("/api/v1/discord/command-challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create" }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    challenge = result.challenge;
    const instructions = document.createElement("p");
    instructions.className = "discord-command-instructions";
    instructions.append("In Turntide Island, run ", Object.assign(document.createElement("code"), {
      textContent: `/l-space-login code:${challenge}`,
    }), ". Keep this tab open; it will enter the vault when Discord confirms your islander role.");
    container.replaceChildren(instructions, status);
    status.textContent = "Waiting for Discord confirmation…";
  } catch (error) {
    status.textContent = `Discord login could not start: ${error.message}`;
    return;
  }

  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      const response = await fetch("/api/v1/discord/command-challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "poll", challenge }),
      });
      if (response.status === 202) continue;
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      status.textContent = "Discord confirmed your islander role. Opening the vault…";
      location.reload();
      return;
    } catch (error) {
      status.textContent = `Discord login stopped: ${error.message}`;
      return;
    }
  }
  status.textContent = "That login code expired. Start again for a fresh code.";
}

function discordCommandControl(label = "Enter through Discord") {
  const wrapper = document.createElement("div");
  wrapper.className = "discord-command-login";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "signin-cta";
  button.textContent = `${label} →`;
  button.addEventListener("click", () => beginDiscordCommandLogin(wrapper));
  wrapper.append(button);
  return wrapper;
}

function words(value) {
  return value.replace(/-services-section$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function collectionFor(room) {
  const parts = room.id.split("/");
  if (parts[0] === "services" && parts[1]) return { id: `services/${parts[1]}`, name: words(parts[1]), type: "science" };
  if (parts[0] === "content") return { id: "content", name: "Library & Articles", type: "library" };
  if (parts[0] === "apps") return { id: "apps", name: "Applications", type: "application" };
  return { id: parts[0] || "root", name: words(parts[0] || "Root Notes"), type: "collection" };
}
function indexCorpus(index) {
  const counts = new Map();
  for (const room of index.rooms) {
    state.byId.set(room.id, room);
    state.byKey.set(room.key, room);
    if (room.route) state.byRoute.set(room.route, room);
    for (const candidate of [room.title, room.id, room.id.split("/").at(-1)?.replace(/\.md$/i, "")]) {
      const name = candidate?.toLocaleLowerCase().trim();
      if (name && !state.byName.has(name)) state.byName.set(name, room);
    }
    const collection = collectionFor(room);
    const current = counts.get(collection.id) ?? { ...collection, count: 0 };
    current.count += 1;
    counts.set(collection.id, current);
  }
  state.collections = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
async function loadIndex() {
  if (state.index) return state.index;
  if (state.indexPromise === null) {
    state.indexPromise = fetch("/vault/index.json").then(async (response) => {
      if (!response.ok) throw new Error(`The catalogue did not open (${response.status}).`);
      const index = await response.json();
      state.index = index; indexCorpus(index); updateNavigation(); return index;
    });
  }
  return state.indexPromise;
}
async function loadHalls() {
  if (state.halls) return state.halls;
  if (state.hallsPromise === null) {
    state.hallsPromise = fetch("/vault/views/halls.json").then(async (response) => {
      if (!response.ok) throw new Error(`The halls did not open (${response.status}).`);
      state.halls = await response.json(); return state.halls;
    });
  }
  return state.hallsPromise;
}
/** The passage view: every room, door and card as compact tuples, read once and kept. */
async function loadPassage() {
  if (state.passage) return state.passage;
  const response = await fetch(state.manifest?.passage ?? "/vault/views/passage.json");
  if (!response.ok) throw new Error(`The passage view did not open (${response.status}).`);
  const view = await response.json();
  state.passage = Object.freeze({
    rooms: view.rooms.map(([id, key, dateCreated]) => ({ id, key, dateCreated: dateCreated ?? undefined })),
    doors: view.doors.map(([from, to, weight]) => ({ from, to, weight })),
    cards: view.cards.map(([id, roomId, stability, difficulty]) => ({ id, roomId, stability, difficulty })),
  });
  return state.passage;
}
const epochDay = () => Math.floor(Date.now() / 86400000);
/** The reader's own review history layered over each card's compiled starting state. */
function effectiveCards(cards) {
  return cards.map((card) => {
    const review = state.reviews.get(card.id);
    return review ? { ...card, stability: review.stability, difficulty: review.difficulty, lastReviewedAt: review.reviewedAt } : { ...card, lastReviewedAt: undefined };
  });
}
/** Where the reader's light currently falls: which rooms are reached and how brightly. */
async function lightNow() {
  const [passage, halls] = await Promise.all([loadPassage(), loadHalls()]);
  const hallRooms = halls.halls.map((hall) => ({ id: hall.id, stable: hall.stable, rooms: hall.rooms.map((room) => room.id) }));
  const cards = effectiveCards(passage.cards); const today = epochDay();
  const { states, reachable } = computeLightCone(passage.rooms, passage.doors, cards, hallRooms, today);
  return { passage, hallRooms, cards, today, states, reachable };
}
async function showWalk() {
  document.title = `Today's walk · ${SITE.title}`; view.replaceChildren(Object.assign(document.createElement("div"), { className: "loading", textContent: "Lighting the lanterns…" }));
  let light; try { light = await lightNow(); } catch (error) { view.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: error.message })); return; }
  const route = dailyLanternWalk(light.passage.rooms, light.passage.doors, light.cards, light.states, light.reachable, light.today);
  const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "Daily lantern walk";
  const title = document.createElement("h2"); title.className = "page-title"; title.textContent = "Today's walk";
  const due = route.reduce((count, stop) => count + stop.cards.length, 0);
  const measures = document.createElement("p"); measures.className = "hero-copy";
  measures.textContent = route.length
    ? `${due.toLocaleString()} ${due === 1 ? "card is" : "cards are"} due across ${route.length.toLocaleString()} ${route.length === 1 ? "room" : "rooms"}: those fading below ${Math.round(DEFAULT_TARGET_RETENTION * 100)}% recall, and the dim rooms at the edge of your light. The route walks each room's nearest due neighbour next; review a room's cards and come back.`
    : "Nothing is due. Every room you have reached is holding its light.";
  const list = document.createElement("ol"); list.className = "walk-route";
  for (const stop of route) {
    const room = state.byId.get(stop.roomId); if (!room) continue;
    const item = document.createElement("li"); const anchor = document.createElement("a"); anchor.href = roomHref(room); anchor.textContent = room.title;
    const count = document.createElement("span"); count.className = "nav-count"; count.textContent = `${stop.cards.length} due`;
    item.append(anchor, count); list.append(item);
  }
  view.replaceChildren(eyebrow, title, measures, list);
}

async function showVoxelWalk() {
  document.title = `Walk · ${SITE.title}`;
  view.replaceChildren(Object.assign(document.createElement("div"), { className: "loading", textContent: "Assembling the nearby vault…" }));
  let voxelIndex, light;
  try {
    [voxelIndex, light] = await Promise.all([
      fetch(state.manifest.voxels).then((response) => response.ok ? response.json() : Promise.reject(new Error(`The voxel view did not open (${response.status}).`))),
      lightNow(),
    ]);
  } catch (error) { view.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: error.message })); return; }

  const available = new Set(voxelIndex.chunks); const loaded = new Map();
  const chunkKey = (x, z) => `${Math.floor(x / voxelIndex.chunkSize)},${Math.floor(z / voxelIndex.chunkSize)}`;
  async function loadAround(x, z) {
    const [cx, cz] = chunkKey(x, z).split(",").map(Number); const wanted = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const key = `${cx + dx},${cz + dz}`; if (available.has(key) && !loaded.has(key)) wanted.push(key);
    }
    await Promise.all(wanted.map(async (key) => {
      const response = await fetch(`/vault/views/voxels/${key}.json`);
      if (!response.ok) throw new Error(`Voxel chunk ${key} did not open (${response.status}).`);
      loaded.set(key, await response.json());
    }));
    for (const key of loaded.keys()) {
      const [kx, kz] = key.split(",").map(Number);
      if (Math.max(Math.abs(kx - cx), Math.abs(kz - cz)) > 4) loaded.delete(key);
    }
  }
  function assembled() {
    const out = { ...voxelIndex, cells: [], gates: [], portals: [], contested: [], chambers: [] }; const chambers = new Map();
    for (const chunk of loaded.values()) {
      for (const field of ["cells", "gates", "portals", "contested"]) out[field].push(...(chunk[field] ?? []));
      for (const chamber of chunk.chambers ?? []) chambers.set(chamber.roomId, chamber);
    }
    out.chambers = [...chambers.values()]; return out;
  }

  await loadAround(voxelIndex.spawn.x, voxelIndex.spawn.z);
  const storageKey = `vaultmaze:walk:${state.manifest.release}`;
  let moves; try { moves = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]"); } catch { moves = []; }
  if (!Array.isArray(moves)) moves = [];
  let position = vaultMazeWalkRules(assembled()).initialPosition(state.manifest.release, state.manifest.release); const accepted = [];
  for (const move of moves) {
    try {
      if (move.type === "step") {
        const sign = move.dir === "forward" ? 1 : -1, [dx, dz] = WALK_DIRECTIONS[position.facing];
        await loadAround(position.x + dx * sign, position.z + dz * sign);
      }
      const result = vaultMazeWalkRules(assembled()).extend(position, move); position = result.state; accepted.push(move); await loadAround(position.x, position.z);
    } catch { break; }
  }
  moves = accepted;

  const shell = document.createElement("section"); shell.className = "voxel-walk";
  const stage = document.createElement("div"); stage.className = "voxel-stage";
  const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 200; canvas.tabIndex = 0;
  canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", "First-person view of the VaultMaze voxel corridors");
  const live = document.createElement("p"); live.className = "voxel-position"; live.setAttribute("aria-live", "polite");
  const controls = Object.assign(document.createElement("p"), { className: "voxel-controls", textContent: "W/S or ↑/↓ step · A/D or ←/→ turn · E/Enter use · M map" });
  const mapPanel = document.createElement("div"); mapPanel.className = "voxel-map"; mapPanel.hidden = true;
  const side = document.createElement("aside"); side.className = "voxel-side";
  const roomHeading = document.createElement("h2"), roomDescription = document.createElement("p");
  const roomLink = Object.assign(document.createElement("a"), { textContent: "Open this room" });
  const action = document.createElement("section"); action.className = "voxel-action";
  const download = Object.assign(document.createElement("button"), { type: "button", textContent: "Download play JSON" });
  side.append(roomHeading, roomDescription, roomLink, action, download); stage.append(canvas, live, controls, mapPanel); shell.append(stage, side);
  view.replaceChildren(Object.assign(document.createElement("p"), { className: "eyebrow", textContent: "Rule-presented arena" }), Object.assign(document.createElement("h2"), { className: "page-title", textContent: "Walk" }), shell);

  const litRooms = new Set([...light.states].filter(([, value]) => value.gated && value.stage !== "fogged").map(([roomId]) => roomId));
  let phase = 0, stopped = false, shownRoom = null, mapDrawn = false, moving = false;
  const currentView = () => assembled();
  function objectAhead() {
    const [dx, dz] = WALK_DIRECTIONS[position.facing], x = position.x + dx, z = position.z + dz, key = voxelKey(x, z), voxels = currentView();
    const gate = voxels.gates.find((item) => voxelKey(item.x, item.z) === key);
    if (gate && !position.carved.includes(key)) return { kind: "gate", item: gate, text: `gate to ${state.byId.get(gate.roomId)?.title ?? gate.roomId}` };
    const portal = voxels.portals.find((item) => voxelKey(item.x, item.z) === key || voxelKey(item.x, item.z) === voxelKey(position.x, position.z));
    if (portal) return { kind: "portal", item: portal, text: portal.reading === "f" ? `portal to ${state.byId.get(portal.to)?.title ?? portal.to}` : "contested portal" };
    const reading = voxels.cells.find(([cx, cz]) => voxelKey(cx, cz) === key)?.[2] ?? voxels.defaultReading;
    return { kind: reading === "t" || reading === "top" ? "wall" : "open", text: reading === "t" || reading === "top" ? "wall" : "open passage" };
  }
  async function describeRoom() {
    if (shownRoom === position.room) return; shownRoom = position.room; const room = state.byId.get(position.room);
    roomHeading.textContent = room?.title ?? "Between rooms"; roomDescription.textContent = room?.summary ?? "The corridor carries no room description.";
    roomLink.hidden = !room; if (room) roomLink.href = roomHref(room);
  }
  function paint() {
    if (stopped) return;
    const voxels = currentView(), cells = observedVoxelCells(voxels, litRooms, position.carved);
    const entities = voxels.portals.filter(({ reading }) => reading === "f").map((portal) => ({ id: `portal:${portal.x},${portal.z}`, kind: "portal", x: portal.x + .5, z: portal.z + .5, scale: .7 }));
    const frame = render(gridFromCells(cells, voxels.defaultReading), camera({ x: position.x, z: position.z, angle: position.facing * Math.PI / 2, width: 320, height: 200, maxDist: 24 }), { phase: phase++, entities, wallColors: { portal: [75, 145, 235] } });
    paintToCanvas(canvas.getContext("2d"), frame.fb); requestAnimationFrame(paint);
  }
  function announce() {
    live.textContent = `Position ${position.x}, ${position.z}; facing ${WALK_FACING[position.facing]}; room ${state.byId.get(position.room)?.title ?? position.room ?? "corridor"}; ahead: ${objectAhead().text}.`;
    describeRoom();
  }
  async function appendMove(move, { keepAction = false } = {}) {
    if (move.type === "step") {
      const sign = move.dir === "forward" ? 1 : -1, [dx, dz] = WALK_DIRECTIONS[position.facing];
      const nextX = position.x + dx * sign, nextZ = position.z + dz * sign;
      if (chunkKey(nextX, nextZ) !== chunkKey(position.x, position.z)) await loadAround(nextX, nextZ);
    }
    if (move.type === "portal") { const portal = objectAhead().item; if (portal?.target) await loadAround(portal.target.x, portal.target.z); }
    const result = vaultMazeWalkRules(currentView()).extend(position, move); position = result.state; moves.push(move);
    sessionStorage.setItem(storageKey, JSON.stringify(moves)); await loadAround(position.x, position.z); if (!keepAction) action.replaceChildren(); announce();
  }
  async function offerGate(gate) {
    action.replaceChildren(Object.assign(document.createElement("p"), { textContent: "Opening the dependent room's due and new cards…" }));
    const room = state.byId.get(gate.roomId); if (!room) return;
    const response = await fetch(`/vault/rooms/${room.key}.json`); if (!response.ok) throw new Error(`The gate cards did not open (${response.status}).`);
    const detail = await response.json(); const cards = (detail.cards ?? []).filter((card) => Array.isArray(card.choices) || Array.isArray(card.accepts)).filter((card) => {
      const review = state.reviews.get(card.id); return !review || recallProbability(Math.max(0, epochDay() - review.reviewedAt), review.stability) < DEFAULT_TARGET_RETENTION;
    });
    const list = document.createElement("ol"); list.className = "maze-list";
    for (const card of cards) list.append(mazeCard(card, { onAnswered: (result) => appendMove({ type: "answer", gate: voxelKey(gate.x, gate.z), correct: result.correct }, { keepAction: true }).catch(showWalkError) }));
    action.replaceChildren(Object.assign(document.createElement("h3"), { textContent: `Gate to ${room.title}` }), cards.length ? list : Object.assign(document.createElement("p"), { textContent: "No due or new objective card can carve this gate." }));
  }
  function showWalkError(error) { action.replaceChildren(Object.assign(document.createElement("p"), { className: "maze-feedback", textContent: error.message })); announce(); }
  async function useAhead() {
    const ahead = objectAhead();
    if (ahead.kind === "gate") await offerGate(ahead.item); else if (ahead.kind === "portal") await appendMove({ type: "portal" });
    else throw new Error("There is no gate or portal to use here.");
  }
  async function toggleMap() {
    mapPanel.hidden = !mapPanel.hidden; canvas.hidden = !mapPanel.hidden;
    if (mapPanel.hidden || mapDrawn) return; mapDrawn = true;
    const layout = await fetch(state.manifest.layout).then((response) => response.json());
    if (!layout.positions) { mapPanel.textContent = "This vault is too large to lay out as one map."; return; }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("aria-label", "Map of the maze"); mapPanel.append(svg);
    renderMap(svg, { rooms: light.passage.rooms.map((room) => ({ ...room, title: state.byId.get(room.id)?.title ?? room.id })), doors: light.passage.doors, halls: light.hallRooms }, layout, { states: light.states, reachable: light.reachable, revealed: revealedTerritory(light.cards) }, { onActivate: (roomId) => { const room = state.byId.get(roomId); if (room) location.hash = roomHref(room); } });
  }
  const keydown = (event) => {
    if (event.repeat || moving) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    const move = ({ ArrowLeft: { type: "turn", dir: "left" }, a: { type: "turn", dir: "left" }, A: { type: "turn", dir: "left" }, ArrowRight: { type: "turn", dir: "right" }, d: { type: "turn", dir: "right" }, D: { type: "turn", dir: "right" }, ArrowUp: { type: "step", dir: "forward" }, w: { type: "step", dir: "forward" }, W: { type: "step", dir: "forward" }, ArrowDown: { type: "step", dir: "back" }, s: { type: "step", dir: "back" }, S: { type: "step", dir: "back" } })[event.key];
    const run = (operation) => { moving = true; operation().catch(showWalkError).finally(() => { moving = false; }); };
    if (move) { event.preventDefault(); run(() => appendMove(move)); }
    else if (event.key === "e" || event.key === "E" || event.key === "Enter") { event.preventDefault(); run(useAhead); }
    else if (event.key === "m" || event.key === "M") { event.preventDefault(); run(toggleMap); }
  };
  addEventListener("keydown", keydown);
  download.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ schemaVersion: "vaultmaze-walk-play/v1", release: state.manifest.release, moves }, null, 2)], { type: "application/json" });
    const anchor = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "vaultmaze-walk.json" }); anchor.click(); URL.revokeObjectURL(anchor.href);
  });
  disposeVoxelWalk = () => { stopped = true; removeEventListener("keydown", keydown); disposeVoxelWalk = null; };
  announce(); canvas.focus(); requestAnimationFrame(paint);
}
const KATA_OUTCOMES = Object.freeze({ 1: "again", 2: "hard", 3: "good", 4: "easy" });
function kataHistory(id) {
  try { return JSON.parse(localStorage.getItem(`vaultmaze:${id}`) ?? "[]"); } catch { return []; }
}
function recordKataRatio(id, ratio) {
  const ratios = [...kataHistory(id), ratio].slice(-3);
  try { localStorage.setItem(`vaultmaze:${id}`, JSON.stringify(ratios)); } catch { /* A private window keeps no belt. */ }
  return ratios;
}
async function showKata(rawId) {
  const id = decodeURIComponent(rawId);
  document.title = `Kata · ${SITE.title}`; view.replaceChildren(Object.assign(document.createElement("div"), { className: "loading", textContent: "Laying out the kata…" }));
  let light; try { light = await lightNow(); } catch (error) { view.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: error.message })); return; }
  const hall = light.hallRooms.find((item) => item.id === id); const named = state.halls.halls.find((item) => item.id === id);
  if (!hall) return showNotFound();
  const kata = makeAutoKata(hall, light.passage.doors, light.passage.rooms);
  const cardsByRoom = new Map(); for (const card of light.cards) cardsByRoom.set(card.roomId, [...(cardsByRoom.get(card.roomId) ?? []), card]);
  const picked = pickKataCards(kata.path, cardsByRoom, light.today);
  const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "Kata";
  const title = document.createElement("h2"); title.className = "page-title"; title.textContent = named?.title ?? id;
  const intro = document.createElement("p"); intro.className = "hero-copy";
  intro.textContent = picked.length
    ? `${picked.length} rooms in this hall's order, one card each: the one fading fastest. Recall each in turn and grade yourself; the run's grades award its belt, and three runs in a row hold one.`
    : "This hall has no cards to walk yet.";
  const list = document.createElement("ol"); list.className = "maze-list kata-run";
  const outcome = document.createElement("p"); outcome.className = "hero-copy kata-outcome"; outcome.setAttribute("aria-live", "polite");
  const results = new Map();
  const settle = (cardId, grade) => {
    results.set(cardId, KATA_OUTCOMES[grade]);
    if (results.size < picked.length) { outcome.textContent = `${results.size} of ${picked.length} recalled.`; return; }
    const run = summarizeKataRun([...results.values()]);
    const held = awardedBelt(recordKataRatio(kata.id, run.ratio));
    outcome.textContent = `Run complete: ${Math.round(run.ratio * 100)}%, a ${run.beltThisRun} belt this run. Belt held across your last three runs: ${held}.`;
  };
  view.replaceChildren(eyebrow, title, intro, list, outcome);
  for (const { roomId, card } of picked) {
    const room = state.byId.get(roomId); if (!room) continue;
    const response = await fetch(`/vault/rooms/${room.key}.json`); if (!response.ok) continue;
    const detail = await response.json(); const full = (detail.cards ?? []).find((item) => item.id === card.id); if (!full) continue;
    const item = mazeCard(full, { onGraded: (grade) => settle(full.id, grade) });
    const where = document.createElement("a"); where.className = "kata-room"; where.href = roomHref(room); where.textContent = room.title; item.prepend(where);
    list.append(item);
  }
}
const roomHref = (room) => `#/room/${room.key}`;
const publicRoomHref = (room) => `#/public/${room.key}`;
function roomCard(room, hrefFor = roomHref) {
  const fragment = cardTemplate.content.cloneNode(true);
  fragment.querySelector("a").href = hrefFor(room);
  fragment.querySelector(".room-kind").textContent = room.kind === "unknown" ? "note" : room.kind;
  fragment.querySelector(".room-title").textContent = room.title;
  fragment.querySelector(".room-summary").textContent = room.summary;
  fragment.querySelector(".room-path").textContent = room.id;
  return fragment;
}
function roomList(rooms, { limit = 72, hrefFor = roomHref } = {}) {
  const fragment = document.createDocumentFragment();
  const container = document.createElement("div");
  container.className = "results";
  for (const room of rooms.slice(0, limit)) container.append(roomCard(room, hrefFor));
  if (!rooms.length) {
    const empty = document.createElement("p"); empty.className = "empty";
    empty.textContent = "No rooms answer to that description. The shelves remain suspiciously quiet.";
    container.append(empty);
  }
  fragment.append(container);
  if (rooms.length > limit) {
    const more = document.createElement("p"); more.className = "more-results";
    more.textContent = `Showing ${limit.toLocaleString()} of ${rooms.length.toLocaleString()} rooms. Narrow the search to summon fewer corridors.`;
    fragment.append(more);
  }
  return fragment;
}
function sectionHead(title, note) {
  const element = document.createElement("div"); element.className = "section-head";
  const heading = document.createElement("h2"); heading.textContent = title;
  const detail = document.createElement("p"); detail.textContent = note;
  element.append(heading, detail); return element;
}
function catalogueAtlas() {
  const figure = document.createElement("figure"); figure.className = "catalogue-atlas";
  const canvas = document.createElement("canvas"); canvas.tabIndex = 0; canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `Catalogue atlas of ${state.index.rooms.length.toLocaleString()} ${SITE.title} rooms. Move across the atlas to inspect rooms; click to enter one.`);
  const tooltip = document.createElement("figcaption"); tooltip.className = "atlas-caption";
  tooltip.textContent = "96 columns · deterministic catalogue order · select any mark to enter its room";
  figure.append(canvas, tooltip);
  const positions = new Map(state.index.rooms.map((room) => [`${room.tufte.x}:${room.tufte.y}`, room]));
  const maxX = Math.max(...state.index.rooms.map((room) => room.tufte.x));
  const maxY = Math.max(...state.index.rooms.map((room) => room.tufte.y));
  let geometry;
  function draw() {
    const rectangle = canvas.getBoundingClientRect(); const ratio = devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rectangle.width * ratio)); canvas.height = Math.max(1, Math.floor(rectangle.height * ratio));
    const context = canvas.getContext("2d"); context.scale(ratio, ratio); context.clearRect(0, 0, rectangle.width, rectangle.height);
    const padding = 16; const stepX = (rectangle.width - padding * 2) / (maxX + 1); const stepY = (rectangle.height - padding * 2) / (maxY + 1);
    geometry = { rectangle, padding, stepX, stepY };
    context.fillStyle = "#d7d0bf";
    for (const room of state.index.rooms) context.fillRect(padding + room.tufte.x * stepX, padding + room.tufte.y * stepY, Math.max(1, stepX * .48), Math.max(1, stepY * .48));
    context.fillStyle = "#155a85";
    for (const room of state.index.rooms) if (room.collection.startsWith("services/")) context.fillRect(padding + room.tufte.x * stepX, padding + room.tufte.y * stepY, Math.max(1, stepX * .52), Math.max(1, stepY * .52));
    context.strokeStyle = "#171b18"; context.lineWidth = 1; context.strokeRect(.5, .5, rectangle.width - 1, rectangle.height - 1);
  }
  function roomAt(event) {
    if (!geometry) return null; const rectangle = canvas.getBoundingClientRect();
    const x = Math.round((event.clientX - rectangle.left - geometry.padding) / geometry.stepX);
    const y = Math.round((event.clientY - rectangle.top - geometry.padding) / geometry.stepY);
    return positions.get(`${x}:${y}`) ?? null;
  }
  canvas.addEventListener("pointermove", (event) => { const room = roomAt(event); tooltip.textContent = room ? `${room.title} · ${room.kind === "unknown" ? "note" : room.kind}` : "96 columns · deterministic catalogue order"; canvas.dataset.roomKey = room?.key ?? ""; });
  canvas.addEventListener("pointerleave", () => { tooltip.textContent = "96 columns · deterministic catalogue order · select any mark to enter its room"; delete canvas.dataset.roomKey; });
  canvas.addEventListener("click", () => { const room = state.byKey.get(canvas.dataset.roomKey); if (room) location.hash = roomHref(room); });
  canvas.addEventListener("keydown", (event) => { if ((event.key === "Enter" || event.key === " ") && canvas.dataset.roomKey) { event.preventDefault(); const room = state.byKey.get(canvas.dataset.roomKey); if (room) location.hash = roomHref(room); } });
  new ResizeObserver(draw).observe(canvas); requestAnimationFrame(draw); return figure;
}
function tufteGarden() {
  const root = document.createElement("section"); root.dataset.tufte = ""; root.dataset.revision = state.garden.revision;
  const grid = document.createElement("div"); grid.className = "tufte-grid"; root.append(grid);
  const projection = normalizeTufteModel({
    ...state.garden,
    tiles: state.garden.tiles.map((tile) => ({
      ...tile,
      eyebrow: tile.view === "collection" ? "Science section" : tile.role === "now" ? "Macro view" : "Release evidence",
    })),
  });
  applyTufteProjectionPatch(root, diffTufteProjection({ revision: projection.revision, tiles: [] }, projection));
  for (const tile of projection.tiles) {
    const body = root.querySelector(`#${CSS.escape(tile.id)} .tufte-tile-body`);
    if (!body) continue;
    if (tile.view === "atlas") {
      const anchor = document.createElement("a"); anchor.className = "tile-route"; anchor.href = "#/catalogue"; anchor.textContent = `${tile.content} Open the addressable catalogue.`; body.replaceChildren(anchor);
    } else if (tile.view === "collection" || tile.view === "halls") {
      const anchor = document.createElement("a"); anchor.className = "tile-route"; anchor.href = tile.view === "halls" ? "#/halls" : `#/collection/${encodeURIComponent(tile.collectionId)}`; anchor.textContent = tile.content; body.replaceChildren(anchor);
    }
  }
  return root;
}
function showHome() {
  document.title = SITE.documentTitle; view.replaceChildren();
  const hero = document.createElement("section"); hero.className = "hero";
  const introduction = document.createElement("div");
  introduction.innerHTML = `<p class="eyebrow">${escapeHtml(state.garden.eyebrow ?? "Digital garden")}</p><h2>${escapeHtml(SITE.title)}</h2><p class="hero-copy">${escapeHtml(state.garden.subtitle ?? "")}</p>`;
  const legend = document.createElement("aside"); legend.className = "projection-legend";
  legend.innerHTML = '<p><b>SPACE</b> says what a concept means.</p><p><b>TUFTE</b> says how this view places it.</p><p><b>VaultMaze</b> governs participatory passage.</p>';
  hero.append(introduction, legend);
  view.append(hero, sectionHead("TUFTE projection", `Release ${state.garden.revision.slice(0, 12)} · stable semantic reading order`), tufteGarden());
}
function showCollection(id) {
  const decoded = decodeURIComponent(id);
  const rooms = state.index.rooms.filter((room) => room.id === decoded || room.id.startsWith(`${decoded}/`));
  const collection = state.collections.find((item) => item.id === decoded);
  const name = collection?.name ?? words(decoded);
  document.title = `${name} · ${SITE.title}`; view.replaceChildren();
  const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "Knowledge collection";
  const title = document.createElement("h2"); title.className = "page-title"; title.textContent = name;
  view.append(eyebrow, title, sectionHead(`${rooms.length.toLocaleString()} rooms`, "Ordered by title"), roomList(rooms.sort((a, b) => a.title.localeCompare(b.title))));
}
function showCatalogue() {
  document.title = `Catalogue atlas · ${SITE.title}`; view.replaceChildren();
  const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "Addressable knowledge cells";
  const title = document.createElement("h2"); title.className = "page-title"; title.textContent = "Catalogue atlas";
  const measures = document.createElement("p"); measures.className = "hero-copy"; measures.textContent = `${state.index.rooms.length.toLocaleString()} released rooms in deterministic TUFTE positions. This detailed catalogue is requested only when a reader opens it.`;
  view.append(eyebrow, title, measures, catalogueAtlas());
}
const hallHref = (hall) => `#/hall/${encodeURIComponent(hall.id)}`;
function hallCard(hall) {
  const anchor = document.createElement("a"); anchor.className = `hall-card${hall.stable ? " hall-stable" : ""}`; anchor.href = hallHref(hall);
  const kind = document.createElement("span"); kind.className = "hall-kind"; kind.textContent = hall.stable ? "Rigid hall" : "Hall";
  const title = document.createElement("strong"); title.className = "hall-title"; title.textContent = hall.title;
  const size = document.createElement("span"); size.className = "hall-size"; size.textContent = `${hall.size.toLocaleString()} ${hall.size === 1 ? "room" : "rooms"}`;
  anchor.append(kind, title, size); return anchor;
}
function showHalls() {
  document.title = `Halls · ${SITE.title}`; view.replaceChildren();
  const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "Formal concept clusters";
  const title = document.createElement("h2"); title.className = "page-title"; title.textContent = "Halls";
  const grid = document.createElement("div"); grid.className = "hall-grid";
  for (const hall of state.halls.halls) grid.append(hallCard(hall));
  view.append(eyebrow, title, sectionHead(`${state.halls.counts.halls.toLocaleString()} halls`, `${state.halls.counts.stable.toLocaleString()} rigid · largest first`), grid);
}
function showHall(rawId) {
  const id = decodeURIComponent(rawId);
  const hall = state.halls.halls.find((item) => item.id === id);
  if (!hall) return showNotFound();
  document.title = `${hall.title} · Hall · ${SITE.title}`; view.replaceChildren();
  const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = hall.stable ? "Rigid hall" : "Hall";
  const title = document.createElement("h2"); title.className = "page-title"; title.textContent = hall.title;
  const rigid = document.createElement("p"); rigid.className = hall.stable ? "hall-rigid-note" : "hall-loose-note";
  rigid.textContent = hall.stable
    ? "Rigid — this hall's internal door graph is structurally fixed; the rooms hold together no matter how the corpus around them shifts."
    : "Not rigid — this hall's internal doors are not structurally fixed.";
  const tags = document.createElement("div"); tags.className = "tags";
  for (const term of hall.intent ?? []) { const span = document.createElement("span"); span.className = "tag"; span.textContent = term; tags.append(span); }
  const rooms = hall.rooms.map((entry) => state.byKey.get(entry.key)).filter(Boolean);
  const kataLink = Object.assign(document.createElement("a"), { className: "tile-route", href: `#/kata/${encodeURIComponent(hall.id)}`, textContent: "Walk this hall as a kata" });
  view.append(eyebrow, title, rigid, kataLink, tags, sectionHead(`${rooms.length.toLocaleString()} rooms`, "Members of this concept hall"), roomList(rooms));
}
async function loadReleaseGraph() {
  if (state.graph !== null) return state.graph;
  const href = typeof state.manifest?.graph === "string" ? state.manifest.graph : "/vault/graph.json";
  const response = await fetch(href);
  if (!response.ok) throw new Error(`The graph release did not open (${response.status}).`);
  const graph = await response.json();
  if (graph.release !== state.manifest.release) throw new Error("The graph and vault releases do not agree.");
  state.graph = graph;
  return graph;
}
function graphDocumentPath(value) {
  if (typeof value === "string" && state.byId.has(value)) return value;
  if (value && typeof value === "object") {
    for (const key of ["path", "id", "sourcePath", "targetPath"]) {
      if (typeof value[key] === "string" && state.byId.has(value[key])) return value[key];
    }
  }
  return null;
}
function graphEdgesOf(graph) {
  const edges = [];
  for (const edge of graph.snapshot?.graph?.edges ?? []) {
    const from = graphDocumentPath(edge.sourcePath); const to = graphDocumentPath(edge.targetPath);
    if (from && to && from !== to) edges.push({ from, to, predicate: edge.predicate ?? edge.kind ?? "relation" });
  }
  const unique = new Map();
  for (const edge of edges) unique.set(`${edge.from}\u0000${edge.to}\u0000${edge.predicate}`, edge);
  return [...unique.values()];
}
function graphConstellation(focus, edges) {
  const figure = document.createElement("figure"); figure.className = "graph-constellation";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 640 380"); svg.setAttribute("role", "img");
  const neighbors = [...new Set(edges.flatMap((edge) => edge.from === focus ? [edge.to] : edge.to === focus ? [edge.from] : []))].slice(0, 14);
  svg.setAttribute("aria-label", `${state.byId.get(focus)?.title ?? focus} and ${neighbors.length.toLocaleString()} directly connected knowledge cells.`);
  const center = { x: 320, y: 190 };
  const make = (name, attributes = {}) => { const element = document.createElementNS("http://www.w3.org/2000/svg", name); for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value)); return element; };
  const positions = new Map([[focus, center]]);
  for (const [index, path] of neighbors.entries()) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / neighbors.length;
    positions.set(path, { x: center.x + Math.cos(angle) * 132, y: center.y + Math.sin(angle) * 132 });
  }
  for (const path of neighbors) {
    const point = positions.get(path); svg.append(make("line", { x1: center.x, y1: center.y, x2: point.x, y2: point.y, class: "graph-edge" }));
  }
  for (const [path, point] of positions) {
    const room = state.byId.get(path); const link = make("a", { href: roomHref(room) });
    link.append(make("circle", { cx: point.x, cy: point.y, r: path === focus ? 39 : 26, class: path === focus ? "graph-node graph-focus" : "graph-node" }));
    const label = make("text", { x: point.x, y: point.y + (path === focus ? 5 : 4), class: "graph-label", "text-anchor": "middle" });
    const title = room?.title ?? path; label.textContent = title.length > 25 ? `${title.slice(0, 24)}…` : title; link.append(label); svg.append(link);
  }
  const caption = document.createElement("figcaption"); caption.className = "graph-caption"; caption.textContent = `Showing ${neighbors.length.toLocaleString()} of ${edges.filter((edge) => edge.from === focus || edge.to === focus).length.toLocaleString()} direct relations. Select a cell to enter its room.`;
  figure.append(svg, caption); return figure;
}
/** The walkable map: every room where the release laid it out, lit by where the reader's light falls. */
async function showMap() {
  document.title = `Map · ${SITE.title}`; view.replaceChildren(Object.assign(document.createElement("div"), { className: "loading", textContent: "Lighting the map…" }));
  let light, layout;
  try {
    [light, layout] = await Promise.all([lightNow(), fetch("/vault/views/layout.json").then((response) => response.ok ? response.json() : null)]);
  } catch (error) { view.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: error.message })); return; }
  const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "Where your light falls";
  const title = document.createElement("h2"); title.className = "page-title"; title.textContent = "Map";
  if (!layout?.positions) { view.replaceChildren(eyebrow, title, Object.assign(document.createElement("p"), { className: "empty", textContent: "This vault is too large to lay out as one map; walk it by its halls instead." })); return; }
  const world = {
    rooms: light.passage.rooms.map((room) => ({ id: room.id, title: state.byId.get(room.id)?.title ?? room.id, description: state.byId.get(room.id)?.summary ?? "" })),
    doors: light.passage.doors, halls: light.hallRooms,
  };
  const snapshot = { states: light.states, reachable: light.reachable, revealed: revealedTerritory(light.cards) };
  const panel = document.createElement("div"); panel.className = "maze-map";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("role", "group"); svg.setAttribute("aria-label", "Map of the maze");
  const hint = Object.assign(document.createElement("p"), { className: "maze-map-hint", textContent: "Lit rooms glow; the frontier flickers at the edge of your light. Arrow keys move between rooms; Enter opens one." });
  panel.append(svg, hint);
  view.replaceChildren(eyebrow, title, panel);
  renderMap(svg, world, layout, snapshot, { onActivate: (roomId) => { const room = state.byId.get(roomId); if (room) location.hash = roomHref(room); } });
}
async function showGraph() {
  document.title = `Knowledge graph · ${SITE.title}`; view.replaceChildren(Object.assign(document.createElement("div"), { className: "loading", textContent: "Opening the released relation ledger…" }));
  let graph;
  try { graph = await loadReleaseGraph(); } catch (error) { view.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: error.message })); return; }
  const edges = graphEdgesOf(graph); const degree = new Map();
  for (const edge of edges) { degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1); degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1); }
  const ranked = [...degree.keys()].sort((left, right) => (degree.get(right) ?? 0) - (degree.get(left) ?? 0) || (state.byId.get(left)?.title ?? left).localeCompare(state.byId.get(right)?.title ?? right));
  const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "CAIRN passages · VICTOR cell catalogue";
  const title = document.createElement("h2"); title.className = "page-title"; title.textContent = "Knowledge graph";
  const cells = state.manifest.victor?.cellCount ?? graph.snapshot?.documents?.length ?? state.index.rooms.length;
  const measures = document.createElement("p"); measures.className = "hero-copy"; measures.textContent = `${cells.toLocaleString()} released knowledge cells · ${(graph.counts?.relationRows ?? 0).toLocaleString()} declared relations · ${edges.length.toLocaleString()} document-to-document passages. This view reads the immutable release; it never invents an edge in the browser.`;
  const form = document.createElement("form"); form.className = "graph-search";
  const label = document.createElement("label"); label.textContent = "Find a knowledge cell";
  const input = document.createElement("input"); input.type = "search"; input.placeholder = "Type a title, path, or concept"; input.autocomplete = "off"; label.append(input); const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Focus graph"; form.append(label, submit);
  const canvas = document.createElement("section"); canvas.className = "graph-reading";
  const showFocus = (offered) => {
    const query = offered.trim().toLocaleLowerCase();
    const exact = state.index.rooms.find((room) => room.id.toLocaleLowerCase() === query || room.title.toLocaleLowerCase() === query);
    const result = exact ?? searchRooms(offered)[0] ?? state.byId.get(ranked[0]);
    if (!result) { canvas.replaceChildren(Object.assign(document.createElement("p"), { className: "empty", textContent: "No released knowledge cell answers that description." })); return; }
    const related = edges.filter((edge) => edge.from === result.id || edge.to === result.id);
    const heading = sectionHead(result.title, `${related.length.toLocaleString()} direct relations · ${result.id}`);
    const neighbors = [...new Set(related.flatMap((edge) => edge.from === result.id ? [edge.to] : [edge.from]))].map((path) => state.byId.get(path)).filter(Boolean);
    canvas.replaceChildren(heading, graphConstellation(result.id, related), sectionHead(`${neighbors.length.toLocaleString()} connected cells`, "Direct relations in this release"), roomList(neighbors, { limit: 18 }));
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); showFocus(input.value); });
  view.replaceChildren(eyebrow, title, measures, form, canvas); showFocus("");
}
function searchRooms(query, filters = {}) {
  return searchImmutableRoomIndex(state.index.rooms, { query, ...filters }).results.map(({ room, exactTitle, score, reasons, evidence }) => ({
    ...room,
    searchMatch: { exactTitle, score, reasons, evidence },
  }));
}
function showSearch(query) {
  const rooms = searchRooms(query); document.title = `${query} · Search · ${SITE.title}`; view.replaceChildren();
  const eyebrow = document.createElement("p"); eyebrow.className = "eyebrow"; eyebrow.textContent = "Search the vault";
  const title = document.createElement("h2"); title.className = "page-title"; title.textContent = query;
  view.append(eyebrow, title, sectionHead(`${rooms.length.toLocaleString()} matching rooms`, "Ranked by exact title, title text, semantic tokens, path, and summary"), roomList(rooms));
}
function showAnonymousHome() {
  document.title = SITE.documentTitle; view.replaceChildren();
  const hero = document.createElement("section"); hero.className = "hero";
  const introduction = document.createElement("div");
  introduction.innerHTML = `<p class="eyebrow">The public front door</p><h2>${escapeHtml(SITE.title)}</h2><p class="hero-copy">${state.surface.invitation}</p>`;
  const signIn = document.createElement("div"); signIn.className = "signin-options";
  signIn.append(discordCommandControl("Enter as a Turntide islander"), Object.assign(document.createElement("a"), { className: "signin-cta signin-secondary", href: "/oauth/login", textContent: "Enter with Google →" }));
  introduction.append(signIn);
  const legend = document.createElement("aside"); legend.className = "projection-legend";
  legend.innerHTML = `<p><b>${escapeHtml(state.surface.title)}</b> is a living knowledge garden.</p><p><b>SPACE</b> ${state.surface.vocabulary.SPACE}</p><p><b>TUFTE</b> ${state.surface.vocabulary.TUFTE}</p>`;
  hero.append(introduction, legend); view.append(hero);
  const rooms = state.publicIndex.rooms ?? [];
  if (state.surface.counts.publicRooms > 0 && rooms.length) {
    view.append(sectionHead(`${rooms.length.toLocaleString()} public rooms`, "Open to any reader, signed in or not"), roomList(rooms, { hrefFor: publicRoomHref }));
  } else {
    const note = document.createElement("section"); note.className = "aside-card gate-note";
    note.innerHTML = "<h2>Nothing public yet</h2><p>Every room in this vault starts authenticated by design — an author opts a room into this anonymous surface on purpose, one room at a time. None has yet, so the shelves out here are still bare. Turntide Island members with the islander role can enter through Discord; operators can use the Google path.</p>";
    view.append(note);
  }
}
async function showPublicRoom(key) {
  view.innerHTML = '<div class="loading">Opening the room…</div>';
  const response = await fetch(`/vault/public/rooms/${key}.json`); if (!response.ok) return showNotFound();
  const detail = await response.json(); document.title = `${detail.room.title} · ${SITE.title}`;
  const breadcrumbs = document.createElement("div"); breadcrumbs.className = "breadcrumbs";
  for (const part of detail.room.id.split("/").slice(0, -1)) { const span = document.createElement("span"); span.textContent = words(part); breadcrumbs.append(span); }
  const header = document.createElement("header"); header.className = "room-header";
  const kind = document.createElement("p"); kind.className = "eyebrow"; kind.textContent = detail.room.kind === "unknown" ? "Knowledge room" : detail.room.kind;
  const title = document.createElement("h2"); title.textContent = detail.room.title;
  const source = document.createElement("p"); source.className = "room-source"; source.textContent = detail.room.id;
  header.append(kind, title, source);
  const content = document.createElement("div"); content.append(header, renderedArticle(detail));
  const gate = document.createElement("aside"); gate.className = "room-aside";
  const gateCard = document.createElement("section"); gateCard.className = "aside-card gate-note";
  gateCard.innerHTML = '<h2>Signed out</h2><p>Doors, VaultMaze review, and the rest of the vault open to current Turntide islanders and admitted operators.</p>';
  const signIn = document.createElement("div"); signIn.className = "signin-options";
  signIn.append(discordCommandControl(), Object.assign(document.createElement("a"), { className: "signin-cta signin-secondary", href: "/oauth/login", textContent: "Enter with Google →" }));
  gateCard.append(signIn);
  gate.append(gateCard);
  const layout = document.createElement("div"); layout.className = "room-layout"; layout.append(content, gate);
  view.replaceChildren(breadcrumbs, layout); document.querySelector("#main").focus({ preventScroll: true });
}
function resolveWikiTarget(target) {
  const clean = target.split("#")[0].split("|")[0].replace(/^\.\//, "").replace(/\.md$/i, "").trim().toLocaleLowerCase();
  return state.byName.get(clean) ?? state.byName.get(`${clean}.md`);
}
const currentRoomHref = (room) => (state.anonymous ? publicRoomHref(room) : roomHref(room));
/**
 * Where an unresolved link goes. A signed-in reader gets a search; an anonymous
 * one has no search and no index to search, and most targets will be rooms they
 * cannot see, so the honest destination is the front door.
 */
const unresolvedHref = (target) => (state.anonymous ? "#/" : `#/search/${encodeURIComponent(target)}`);
function renderedArticle(detail) {
  const article = document.createElement("article"); article.className = "prose"; article.innerHTML = detail.renderedBody;
  for (const span of article.querySelectorAll(".markdown-wikilink,.markdown-transclusion")) {
    const target = span.dataset.target; const room = resolveWikiTarget(target); const anchor = document.createElement("a");
    anchor.className = span.className; anchor.textContent = span.textContent; anchor.href = room ? currentRoomHref(room) : unresolvedHref(target); span.replaceWith(anchor);
  }
  for (const anchor of article.querySelectorAll("a[href]")) {
    const target = anchor.getAttribute("href"); if (/^(?:https?:|mailto:|tel:|#)/i.test(target)) continue;
    const routed = state.byRoute.get(target.split("#")[0]);
    if (routed) { anchor.href = currentRoomHref(routed); continue; }
    if (anchor.textContent.includes("|")) anchor.textContent = anchor.textContent.split("|").at(-1);
    const room = resolveWikiTarget(target); anchor.href = room ? currentRoomHref(room) : unresolvedHref(target);
  }
  return article;
}
function authoringCard(room) {
  const card = document.createElement("section"); card.className = "aside-card authoring-card";
  const heading = document.createElement("h2"); heading.textContent = "VaultMaze authoring";
  const introduction = document.createElement("p"); introduction.textContent = "Edit this admitted Markdown source with revision-safe GEODE writes.";
  const open = document.createElement("button"); open.type = "button"; open.className = "authoring-open"; open.textContent = "Edit source";
  card.append(heading, introduction, open);
  open.addEventListener("click", async () => {
    open.disabled = true; open.textContent = "Opening…";
    try {
      const response = await fetch(`/api/note?path=${encodeURIComponent(room.id)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      const reading = result;
      const form = document.createElement("form"); form.className = "authoring-form";
      const label = document.createElement("label"); label.textContent = "Markdown source";
      const textarea = document.createElement("textarea"); textarea.name = "markdown"; textarea.required = true; textarea.value = reading.markdown; textarea.spellcheck = false;
      const save = document.createElement("button"); save.type = "submit"; save.textContent = "Save revision";
      const status = document.createElement("p"); status.className = "authoring-status"; status.setAttribute("role", "status");
      let revision = reading.revision;
      label.append(textarea); form.append(label, save, status); card.replaceChildren(heading, form);
      form.addEventListener("submit", async (event) => {
        event.preventDefault(); save.disabled = true; status.textContent = "Saving through VaultMaze…";
        try {
          const saved = await fetch("/api/action", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "geode.note.replace", value: { path: room.id, markdown: textarea.value }, revision }),
          });
          const receipt = await saved.json();
          if (saved.status === 409) throw new Error("This note changed after you opened it. Reopen before saving.");
          if (!saved.ok) throw new Error(receipt.error ?? `HTTP ${saved.status}`);
          revision = receipt.revision;
          status.textContent = receipt.changed
            ? "Source saved. The current published release remains readable while the next verified release is built."
            : "No source bytes changed.";
        } catch (error) { status.textContent = `Save refused: ${error.message}`; }
        finally { save.disabled = false; }
      });
    } catch (error) { open.disabled = false; open.textContent = "Edit source"; introduction.textContent = `Editor unavailable: ${error.message}`; }
  });
  return card;
}
function mazeStatusText(card) {
  const review = state.reviews.get(card.id);
  if (!review) return state.reviewsUnavailable ? "Review history unavailable." : "New — not yet reviewed.";
  const today = Math.floor(Date.now() / 86400000);
  const R = recallProbability(Math.max(0, today - review.reviewedAt), review.stability);
  const stage = classifyStage(R);
  return `${stage.charAt(0).toUpperCase()}${stage.slice(1)} · ${Math.round(R * 100)}% recall`;
}
async function gradeCard(card, grade, statusEl, feedbackEl, buttons, onGraded) {
  const today = Math.floor(Date.now() / 86400000);
  const previous = state.reviews.get(card.id);
  const current = previous
    ? { stability: previous.stability, difficulty: previous.difficulty, lastReviewedAt: previous.reviewedAt }
    : { stability: card.stability ?? 0, difficulty: card.difficulty ?? 5 };
  const next = reviewCard(current, grade, today);
  const record = { cardId: card.id, reviewedAt: today, rating: grade, stability: next.stability, difficulty: next.difficulty };
  for (const button of buttons) button.disabled = true;
  feedbackEl.textContent = "Saving…";
  try {
    const response = await fetch("/api/v1/reviews", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(record) });
    if (!response.ok) throw new Error(`the vault refused this review (${response.status})`);
    state.reviews.set(card.id, record);
    statusEl.textContent = mazeStatusText(card);
    feedbackEl.textContent = "Saved.";
    onGraded?.(grade);
    return true;
  } catch (error) {
    feedbackEl.textContent = `Not saved: ${error.message}`;
    return false;
  } finally {
    for (const button of buttons) button.disabled = false;
  }
}
function mazeCard(card, { onGraded, onAnswered } = {}) {
  const item = document.createElement("li"); item.className = "maze-item";
  const front = document.createElement("p"); front.className = "maze-front"; front.textContent = card.front; item.append(front);
  const details = document.createElement("details"); details.className = "maze-details";
  const summary = document.createElement("summary"); summary.textContent = "Show answer"; details.append(summary);
  const back = document.createElement("p"); back.className = "maze-back"; back.textContent = card.back; details.append(back);
  const objective = Array.isArray(card.choices) || Array.isArray(card.accepts);
  details.hidden = objective; item.append(details);
  const status = document.createElement("p"); status.className = "maze-status"; status.textContent = mazeStatusText(card); item.append(status);
  const feedback = document.createElement("p"); feedback.className = "maze-feedback"; feedback.setAttribute("aria-live", "polite");
  if (Array.isArray(card.choices)) {
    const choices = document.createElement("div"); choices.className = "maze-choices"; choices.setAttribute("role", "group"); choices.setAttribute("aria-label", "Choose an answer");
    const buttons = card.choices.map((choice) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "maze-choice"; button.textContent = choice.label;
      button.addEventListener("click", async () => {
        for (const option of buttons) option.disabled = true;
        const result = gradeResponse(card, { roomId: choice.roomId });
        await onAnswered?.(result);
        for (let index = 0; index < buttons.length; index++) {
          if (card.choices[index].roomId === card.roomId) buttons[index].classList.add("maze-choice-correct");
          if (card.choices[index].roomId === choice.roomId) buttons[index].classList.add("maze-choice-picked");
        }
        details.hidden = false;
        const saved = await gradeCard(card, result.grade, status, feedback, [], onGraded);
        if (result.correct) {
          feedback.textContent = `Correct. ${saved ? "Review saved." : "Review was not saved."}`;
          return;
        }
        const picked = state.byId.get(result.chosenRoomId);
        const routed = picked ? state.byKey.get(picked.key) : null;
        feedback.replaceChildren(document.createTextNode(`Incorrect. Expected ${result.expected}. You chose ${choice.label}; `));
        if (routed) {
          const link = document.createElement("a"); link.href = roomHref(routed); link.textContent = choice.label;
          feedback.append(link, document.createTextNode(` has its own room. ${saved ? "Review saved." : "Review was not saved."}`));
        } else {
          feedback.append(document.createTextNode(`${choice.label} has its own room. ${saved ? "Review saved." : "Review was not saved."}`));
        }
      }, { once: true });
      choices.append(button); return button;
    });
    item.append(choices, feedback); return item;
  }
  if (Array.isArray(card.accepts)) {
    const form = document.createElement("form"); form.className = "maze-answer";
    const label = document.createElement("label"); label.textContent = "Your answer";
    const input = document.createElement("input"); input.type = "text"; input.autocomplete = "off"; input.required = true;
    const submit = document.createElement("button"); submit.type = "submit"; submit.textContent = "Answer";
    label.append(input); form.append(label, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); input.disabled = true; submit.disabled = true;
      const result = gradeResponse(card, { text: input.value });
      await onAnswered?.(result);
      details.hidden = false;
      const saved = await gradeCard(card, result.grade, status, feedback, [], onGraded);
      feedback.textContent = `${result.correct ? "Correct." : result.grade === 2 ? "Near miss." : "Incorrect."} Expected ${result.expected}. ${saved ? "Review saved." : "Review was not saved."}`;
    }, { once: true });
    item.append(form, feedback); return item;
  }
  const grades = document.createElement("div"); grades.className = "maze-grades"; grades.setAttribute("role", "group"); grades.setAttribute("aria-label", "Grade your recall");
  const buttons = [[1, "Again"], [2, "Hard"], [3, "Good"], [4, "Easy"]].map(([grade, label]) => {
    const button = document.createElement("button"); button.type = "button"; button.className = `maze-grade maze-grade-${label.toLowerCase()}`; button.textContent = label; button.dataset.grade = String(grade);
    grades.append(button); return button;
  });
  for (const button of buttons) button.addEventListener("click", () => gradeCard(card, Number(button.dataset.grade), status, feedback, buttons, onGraded));
  item.append(grades, feedback); return item;
}
async function showRoom(key) {
  const summary = state.byKey.get(key); if (!summary) return showNotFound();
  view.innerHTML = '<div class="loading">Opening the room…</div>';
  const response = await fetch(`/vault/rooms/${key}.json`); if (!response.ok) return showNotFound(); const detail = await response.json(); document.title = `${detail.room.title} · ${SITE.title}`;
  const breadcrumbs = document.createElement("div"); breadcrumbs.className = "breadcrumbs";
  for (const part of detail.room.id.split("/").slice(0, -1)) { const span = document.createElement("span"); span.textContent = words(part); breadcrumbs.append(span); }
  const header = document.createElement("header"); header.className = "room-header";
  const kind = document.createElement("p"); kind.className = "eyebrow"; kind.textContent = detail.room.kind === "unknown" ? "Knowledge room" : detail.room.kind;
  const title = document.createElement("h2"); title.textContent = detail.room.title; const source = document.createElement("p"); source.className = "room-source"; source.textContent = detail.room.id; header.append(kind, title, source);
  const content = document.createElement("div"); content.append(header, renderedArticle(detail)); const aside = document.createElement("aside"); aside.className = "room-aside";
  const maze = document.createElement("section"); maze.className = "aside-card maze-card"; const mazeTitle = document.createElement("h2"); mazeTitle.textContent = "VaultMaze"; maze.append(mazeTitle);
  const cards = detail.cards ?? [];
  const mazeIntro = document.createElement("p");
  mazeIntro.textContent = cards.length ? `${cards.length.toLocaleString()} study ${cards.length === 1 ? "card" : "cards"}, scheduled toward ${Math.round(DEFAULT_TARGET_RETENTION * 100)}% retention.` : "No study cards inhabit this room yet.";
  maze.append(mazeIntro);
  if (cards.length) { const list = document.createElement("ol"); list.className = "maze-list"; for (const card of cards) list.append(mazeCard(card)); maze.append(list); }
  const position = document.createElement("section"); position.className = "aside-card"; const positionTitle = document.createElement("h2"); positionTitle.textContent = "Semantic position"; position.append(positionTitle); const tags = document.createElement("div"); tags.className = "tags";
  for (const tag of detail.space.semanticPosition.tags ?? []) { const span = document.createElement("span"); span.className = "tag"; span.textContent = tag; tags.append(span); } if (tags.childElementCount) position.append(tags); const coordinates = document.createElement("p"); coordinates.textContent = `TUFTE tile ${detail.tufte.x}, ${detail.tufte.y}`; position.append(coordinates); aside.append(maze, position); if (state.me?.canAuthor) aside.append(authoringCard(detail.room));
  if (detail.doors?.length) { const doors = document.createElement("section"); doors.className = "aside-card"; const heading = document.createElement("h2"); heading.textContent = "Doors from here"; const list = document.createElement("div"); list.className = "door-list"; for (const door of detail.doors.slice(0, 12)) { const destination = door.direction === "outgoing" ? door.to : door.from; const room = state.byName.get(destination.toLocaleLowerCase()); if (room) { const anchor = document.createElement("a"); anchor.href = roomHref(room); anchor.textContent = room.title; list.append(anchor); } } doors.append(heading, list); if (list.childElementCount) aside.append(doors); }
  const layout = document.createElement("div"); layout.className = "room-layout"; layout.append(content, aside); view.replaceChildren(breadcrumbs, layout); document.querySelector("#main").focus({ preventScroll: true });
}
function showNotFound() { view.innerHTML = '<p class="eyebrow">Corridor unavailable</p><h2 class="page-title">Room not found</h2><p class="hero-copy">This vault is famously larger on the inside, but apparently not in that direction.</p>'; }
function updateNavigation() {
  collectionNav.replaceChildren(); collectionNav.removeAttribute("aria-busy");
  for (const collection of state.collections.slice(0, 24)) { const anchor = document.createElement("a"); anchor.href = `#/collection/${encodeURIComponent(collection.id)}`; anchor.append(document.createTextNode(collection.name)); const count = document.createElement("span"); count.className = "nav-count"; count.textContent = collection.count.toLocaleString(); anchor.append(count); collectionNav.append(anchor); }
}
async function route() {
  disposeVoxelWalk?.();
  const path = location.hash.slice(2); const [kind, ...rest] = path.split("/");
  if (state.anonymous) {
    if (!path) showAnonymousHome(); else if (kind === "public") await showPublicRoom(rest.join("/")); else showNotFound();
  } else {
    if (!state.index) return;
    if (!path) showHome();
    else if (kind === "room") await showRoom(rest[0]);
    else if (kind === "collection") showCollection(rest.join("/"));
    else if (kind === "catalogue") showCatalogue();
    else if (kind === "walk") await showWalk();
    else if (kind === "maze") await showVoxelWalk();
    else if (kind === "kata") { await loadHalls(); await showKata(rest.join("/")); }
    else if (kind === "halls") showHalls();
    else if (kind === "hall") showHall(rest.join("/"));
    else if (kind === "graph") await showGraph();
    else if (kind === "map") await showMap();
    else if (kind === "search") { const query = decodeURIComponent(rest.join("/")); search.value = query; showSearch(query); }
    else showNotFound();
  }
  view.hidden = false; scrollTo({ top: 0, behavior: "instant" });
}
let searchTimer;
search.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { const query = search.value.trim(); location.hash = query ? `#/search/${encodeURIComponent(query)}` : "#/"; }, 180); });
document.addEventListener("keydown", (event) => { if (event.key === "/" && !state.anonymous && document.activeElement !== search) { event.preventDefault(); search.focus(); } if (event.key === "Escape" && document.activeElement === search) search.blur(); });
addEventListener("hashchange", route);
try {
  const surfaceResponse = await fetch("/vault/public/surface.json");
  if (!surfaceResponse.ok) throw new Error("The public surface did not open.");
  state.surface = await surfaceResponse.json();
  const meResponse = await fetch("/api/v1/me");
  if (meResponse.status === 401 || meResponse.status === 404) {
    state.anonymous = true; document.body.classList.add("anonymous");
    const publicResponse = await fetch("/vault/public/index.json"); if (!publicResponse.ok) throw new Error("The public index did not open.");
    state.publicIndex = await publicResponse.json();
    indexCorpus(state.publicIndex);
    const identity = document.querySelector("#identity");
    const discord = document.createElement("button"); discord.type = "button"; discord.className = "identity-login"; discord.textContent = "Islander sign in";
    discord.addEventListener("click", () => { location.hash = "#/"; route().then(() => document.querySelector(".discord-command-login button")?.click()); });
    identity.replaceChildren(discord, Object.assign(document.createElement("span"), { textContent: " · ", ariaHidden: "true" }), Object.assign(document.createElement("a"), { href: "/oauth/login", textContent: "Google" }));
    loading.remove(); await route();
  } else {
    if (!meResponse.ok) throw new Error("The vault API did not open.");
    state.me = await meResponse.json();
    const responses = await Promise.all([fetch("/vault/manifest.json"), fetch("/vault/index.json"), fetch("/vault/views/garden.json"), fetch("/vault/views/halls.json")]);
    if (!responses.every((response) => response.ok)) throw new Error("The vault API did not open.");
    const [manifest, index, garden, halls] = await Promise.all(responses.map((response) => response.json()));
    state.manifest = manifest; state.index = index; state.garden = garden; state.halls = halls;
    // Review state is the one boot request that reaches a database rather than a
    // static asset. A reader who cannot reach their own history should still be
    // able to read the vault, so this degrades to an empty history instead of
    // taking the whole garden down with it.
    try {
      const reviewResponse = await fetch("/api/v1/reviews");
      if (!reviewResponse.ok) throw new Error(String(reviewResponse.status));
      const reviews = await reviewResponse.json();
      state.reviews = new Map(reviews.reviews.map((review) => [review.cardId, review]));
    } catch { state.reviews = new Map(); state.reviewsUnavailable = true; }
    document.querySelector("#identity").replaceChildren(Object.assign(document.createElement("span"), { className: "identity-email", textContent: state.me.label, title: `Signed in with ${state.me.provider}` }), Object.assign(document.createElement("a"), { className: "identity-signout", href: "/oauth/logout", textContent: "Sign out" })); indexCorpus(state.index); updateNavigation(); loading.remove(); await route();
  }
} catch (error) { loading.replaceChildren(Object.assign(document.createElement("p"), { textContent: `The vault did not open: ${error.message}` })); }
