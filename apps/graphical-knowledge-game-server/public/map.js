/**
 * The walkable map: the maze's rooms drawn where the release's layout puts them, lit by the
 * reader's light cone. Rooms are full (gated and steadily lit), frontier (reachable, the
 * walkable edge), ash (revealed once, now out of the light: fog hides access, never erases that
 * you were there), or fog (never reached; named only when a door joins it to the light, as
 * MindMaze whispered what lay next door). Halls are soft enclosures around their rooms. No
 * layout is computed here; the release carries positions.
 */

const ROOM_R = 14;

export function roomCategory(roomId, lightState, reachable, revealed) {
  const isReachable = reachable.has(roomId);
  const gatedFull = lightState && lightState.gated && lightState.stage === 'full';
  if (isReachable && gatedFull) return 'full';
  if (isReachable) return 'frontier';
  if (revealed.has(roomId)) return 'ash';
  return 'fog';
}

/** Strip markdown link/citation noise from a description so the map whisper reads as plain
 * prose: `[text](path)` -> `text`, `[@cite]` -> removed. Cosmetic only; the compiled `back`/
 * `front` card text (verbatim from the corpus) is never touched by this. */
export function whisperFrom(description) {
  if (!description) return '';
  const noLinks = description.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const noCites = noLinks.replace(/\s*\[@[^\]]*\]/g, '');
  const firstSentence = noCites.split(/(?<=[.!?])\s+/)[0] ?? noCites;
  return firstSentence.trim();
}

// --- convex hull + soft blob path, for hall enclosures --------------------------------------

function convexHull(points) {
  if (points.length < 3) return points.slice();
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function centroid(points) {
  const n = points.length;
  const sum = points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / n, y: sum.y / n };
}

/** A smooth, padded closed path around a set of room positions — 2-point halls become a
 * capsule (two half-circles + straight sides), 3+ become a padded convex hull with rounded
 * corners via a Catmull-Rom-ish quadratic-through-midpoints trick. */
function hallBlobPath(points, padding) {
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x - padding} ${p.y} A ${padding} ${padding} 0 1 0 ${p.x + padding} ${p.y} A ${padding} ${padding} 0 1 0 ${p.x - padding} ${p.y} Z`;
  }
  if (points.length === 2) {
    const [a, b] = points;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = (-dy / len) * padding;
    const ny = (dx / len) * padding;
    return (
      `M ${a.x + nx} ${a.y + ny} L ${b.x + nx} ${b.y + ny} ` +
      `A ${padding} ${padding} 0 0 1 ${b.x - nx} ${b.y - ny} ` +
      `L ${a.x - nx} ${a.y - ny} A ${padding} ${padding} 0 0 1 ${a.x + nx} ${a.y + ny} Z`
    );
  }
  const hull = convexHull(points);
  const c = centroid(hull);
  const padded = hull.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding };
  });
  let d = '';
  const n = padded.length;
  for (let i = 0; i < n; i++) {
    const p0 = padded[i];
    const p1 = padded[(i + 1) % n];
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    if (i === 0) d += `M ${mid.x} ${mid.y} `;
    d += `Q ${p1.x} ${p1.y} ${padded[(i + 2) % n] ? (padded[(i + 1) % n].x + padded[(i + 2) % n].x) / 2 : mid.x} ${padded[(i + 2) % n] ? (padded[(i + 1) % n].y + padded[(i + 2) % n].y) / 2 : mid.y} `;
  }
  return d + 'Z';
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, String(v));
  return el;
}

/** Deterministic pastel-ish color per hall id, so the same hall always renders the same hue
 * across a session (and across reloads) without needing a stored palette. */
function hallColor(hallId) {
  let hash = 0;
  for (let i = 0; i < hallId.length; i++) hash = (hash * 31 + hallId.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 70% 55%)`;
}

const HALL_BLOB_MAX_SIZE = 8; // larger halls shown only on explicit selection, see module header

/**
 * Render the full map into `svgEl`. `snapshot` = `{ states, reachable, revealed }` from
 * `computeLightCone`/`revealedTerritory`. `handlers` = `{ onActivate(roomId), onFocusRoom(roomId) }`.
 * Returns a small controller `{ highlightHall(hallId|null), focusRoom(roomId) }` for the app
 * shell to drive from the halls sidebar / keyboard nav.
 */
export function renderMap(svg, world, layout, snapshot, handlers) {
  svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  svg.innerHTML = '';

  const hallsLayer = svgEl('g', { class: 'layer-halls' });
  const doorsLayer = svgEl('g', { class: 'layer-doors' });
  const roomsLayer = svgEl('g', { class: 'layer-rooms' });
  svg.append(hallsLayer, doorsLayer, roomsLayer);

  const pos = (id) => layout.positions[id] ?? { x: layout.width / 2, y: layout.height / 2 };
  const cats = new Map();
  for (const r of world.rooms) cats.set(r.id, roomCategory(r.id, snapshot.states.get(r.id), snapshot.reachable, snapshot.revealed));

  const adjToLight = new Set();
  for (const d of world.doors) {
    const fromLit = cats.get(d.from) === 'full' || cats.get(d.from) === 'frontier';
    const toLit = cats.get(d.to) === 'full' || cats.get(d.to) === 'frontier';
    if (fromLit) adjToLight.add(d.to);
    if (toLit) adjToLight.add(d.from);
  }

  // --- halls -------------------------------------------------------------------------------
  const hallBlobEls = new Map();
  for (const hall of world.halls) {
    const points = hall.rooms.map(pos);
    const path = hallBlobPath(points, 26);
    const el = svgEl('path', {
      class: 'hall-blob',
      d: path,
      fill: hallColor(hall.id),
      stroke: hallColor(hall.id),
      'data-hall-id': hall.id,
      'data-size': hall.rooms.length,
    });
    if (hall.rooms.length > HALL_BLOB_MAX_SIZE) el.classList.add('hall-blob-large');
    if (hall.stable) el.classList.add('hall-stable');
    hallsLayer.appendChild(el);
    hallBlobEls.set(hall.id, el);
  }

  // --- doors ---------------------------------------------------------------------------------
  for (const d of world.doors) {
    const a = pos(d.from);
    const b = pos(d.to);
    const bothVisible = cats.get(d.from) !== 'fog' && cats.get(d.to) !== 'fog';
    const line = svgEl('line', {
      class: `door door-${d.weight}${bothVisible ? ' door-visible' : ' door-hidden'}`,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
    });
    doorsLayer.appendChild(line);
  }

  // --- rooms -----------------------------------------------------------------------------
  const roomEls = new Map();
  const sortedRooms = [...world.rooms].sort((r1, r2) => {
    const p1 = pos(r1.id);
    const p2 = pos(r2.id);
    return p1.y - p2.y || p1.x - p2.x; // reading-order tab sequence
  });

  for (const room of sortedRooms) {
    const cat = cats.get(room.id);
    const p = pos(room.id);
    const g = svgEl('g', {
      class: `room room-${cat}`,
      transform: `translate(${p.x} ${p.y})`,
      'data-room-id': room.id,
      tabindex: '0',
      role: 'button',
    });

    const visibleTitle = cat !== 'fog' || adjToLight.has(room.id);
    const label = visibleTitle ? room.title : '?';
    const whisper = visibleTitle ? whisperFrom(room.description) : '';

    g.setAttribute(
      'aria-label',
      visibleTitle ? `${room.title}, ${cat === 'fog' ? 'not yet reached' : cat}${whisper ? '. ' + whisper : ''}` : 'undiscovered room',
    );

    const circle = svgEl('circle', { r: ROOM_R, class: 'room-glow' });
    g.appendChild(circle);

    if (cat === 'fog' && !adjToLight.has(room.id)) {
      const q = svgEl('text', { class: 'room-fog-mark', 'text-anchor': 'middle', dy: '0.35em' });
      q.textContent = '?';
      g.appendChild(q);
    }

    const text = svgEl('text', { class: 'room-label', 'text-anchor': 'middle', y: ROOM_R + 14 });
    text.textContent = label;
    g.appendChild(text);

    const titleEl = svgEl('title', {});
    titleEl.textContent = whisper ? `${label} — ${whisper}` : label;
    g.appendChild(titleEl);

    g.addEventListener('click', () => handlers.onActivate?.(room.id));
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        handlers.onActivate?.(room.id);
      } else if (ev.key.startsWith('Arrow')) {
        ev.preventDefault();
        const nextId = nearestInDirection(room.id, ev.key, pos, world.rooms);
        if (nextId) roomEls.get(nextId)?.focus();
      }
    });
    g.addEventListener('focus', () => handlers.onFocusRoom?.(room.id));

    roomsLayer.appendChild(g);
    roomEls.set(room.id, g);
  }

  return {
    highlightHall(hallId) {
      for (const [id, el] of hallBlobEls) el.classList.toggle('hall-highlighted', id === hallId);
    },
    focusRoom(roomId) {
      roomEls.get(roomId)?.focus();
    },
  };
}

function nearestInDirection(fromId, arrowKey, pos, rooms) {
  const from = pos(fromId);
  const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[arrowKey];
  if (!dir) return null;
  let best = null;
  let bestScore = Infinity;
  for (const r of rooms) {
    if (r.id === fromId) continue;
    const p = pos(r.id);
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 0) continue; // behind us relative to the arrow direction
    const perp = Math.abs(dx * dir[1] - dy * dir[0]);
    const score = along + perp * 2; // favor roughly-in-line neighbors over far-off-axis ones
    if (score < bestScore) {
      bestScore = score;
      best = r.id;
    }
  }
  return best;
}
