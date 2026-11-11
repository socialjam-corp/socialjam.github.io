// Amunt ("Stack!"): tap to drop the sliding block on the tower; what overhangs is cut off and
// falls. Single-player port of Amunt_SceneManager (StackFlow, StackFeedback, SinglePlayerFlow),
// drawn on a canvas with the scene's orthographic camera.

import { drawSceneBackground } from '../../features/background.js';

// Amunt_Config.asset and the scene (Amunt_Scene.unity).
const TILE_HEIGHT = 0.5;          // tileWorldHeight, also tileHeightStep
const MOVE_BOUND = 5;             // moveBoundX / moveBoundZ
const MIN_OVERLAP = 0.05;         // minOverlapWidth
const SNAP_TOLERANCE = 0.08;      // anchorSnapTolerance: closer than this snaps to the block below
const PERFECT_EPSILON = 0.002;    // perfectAlignEpsilon
const CAMERA_MOVE_S = 1;          // cameraMoveDuration
const SCRAP_FALL_SPEED = 0.5;     // trimScrapFallSpeed (units/s)
const SCRAP_FADE_S = 2;           // trimScrapFadeDuration
const FALL_BEFORE_FADE = 0.3;     // Amunt_FallingTilePiece.FallBeforeFadeRatio
// The starting pillar: Cube at y -6.7714, 3×14.042×3, so its top is at y 0.25.
const PILLAR = { x: 0, y: -6.7714, z: 0, sx: 3, sy: 14.042464, sz: 3 };
// CameraBounds is a 6×0.5×6 box the camera fits to the content area's width.
const BOUNDS_WIDTH = 6;

// Camera at Euler (45, -45, 0): its right, up and forward axes in world space.
const RIGHT = [Math.SQRT1_2, 0, Math.SQRT1_2];
const UP = [-0.5, Math.SQRT1_2, 0.5];
const FORWARD = [-0.5, -Math.SQRT1_2, 0.5];

// Anchor pulse (Amunt_StackAnchorPulse via StackFeedback).
const PULSE = { normal: { s: 0.32, expand: 1.12, alpha: 0.72 }, perfect: { s: 0.48, expand: 1.32, alpha: 1 } };
const PULSE_PERFECT_BRIGHTEN = 0.18;

// Lighting of the three visible faces, measured on the app: the front-left face (-z) takes the
// full colour, the front-right (+x) and the top are darker.
const SHADE = { front: 1, side: 0.89, top: 0.77 };
const EDGE = 'rgba(255, 255, 255, 0.28)';
/** Space between the score capsule and the start hint, in canvas units. */
const HINT_GAP = 24;

// SkeepGameUI feedback motions (Amunt_UI), in canvas units.
const MOTION_GOOD = { startLift: 0 };
const MOTION_PERFECT = { startLift: 0, scale: 1.18, drift: 130 };
const MOTION_ALERT = { startLift: 8, drift: 200, hold: 0.55, dissolve: 0.4 };
const MOTION_FINISH = { startLift: 0, scale: 1.35, drift: 150 };

export default {
  // Amunt_Loc: GAME_TITLE, GAME_DESCRIPTION, GAME_DESCRIPTION_SP, GAME_START_HINT, FEEDBACK_FINISH.
  text: {
    ca: {
      title: 'Apila',
      description: "Toca per encaixar cada peça sobre l'anterior. La part que no encaixa desapareix. / Si desapareix tota la peça, perds.",
      descriptionSp: 'Completa totes les peces del nivell per superar-lo.',
      startHint: 'Prem per apilar',
      finish: 'Aleta!',
    },
    en: {
      title: 'Stack!',
      description: "Tap to stack each piece on the last one. Any part that doesn't fit disappears. / If the whole piece disappears, you lose.",
      descriptionSp: 'Place every piece in the level to clear it.',
      startHint: 'Tap to stack',
      finish: 'Finish!',
    },
    es: {
      title: '¡Apila!',
      description: 'Toca para encajar cada pieza sobre la anterior. La parte que no encaja desaparece. / Si desaparece toda la pieza, pierdes.',
      descriptionSp: 'Coloca todas las piezas del nivel para superarlo.',
      startHint: 'Pulsa para apilar',
      finish: '¡Meta!',
    },
  },

  levels: () => fetch(new URL('./levels.json', import.meta.url)).then((r) => {
    if (!r.ok) throw new Error(`levels.json: ${r.status}`);
    return r.json();
  }),

  create: (host) => new Amunt(host),
};

class Amunt {
  constructor(host) {
    this.host = host;
    this.tiles = [];      // anchored blocks, bottom to top (the pillar first)
    this.scraps = [];     // cut-off pieces and the missed block, falling
    this.pulses = [];
    this.active = null;   // the sliding block
    this.height = 1;      // _stackHeight: the pillar counts as 1
    this.over = false;
    this.cameraLift = 0;
    this.cameraFrom = 0;
    this.cameraTo = 0;
    this.cameraT = 1;
    this.lastGood = -1;
    this.lastAlert = -1;
  }

  // ── Lifecycle ──

  load(level) {
    this.level = level;
    this.tiles = [{ ...PILLAR, level: 1 }];
    this.counter = document.createElement('div');
    this.counter.className = 'hud-capsule';
    this.host.hud.append(this.counter);
    this._refreshCounter();
    return Promise.resolve();
  }

  start() {
    this._spawn();
    // Just under the remaining-blocks capsule (32 units below the header, 64 high).
    const h = this.host;
    this.host.showStartHint(this._text().startHint, () => ({ y: h.insets.top + (32 + 64 + HINT_GAP) * h.u, align: 'top' }));
  }

  pause() {}
  resume() {}

  destroy() {}

  resize() {}

  // ── Rules (StackFlow) ──

  _spawn() {
    const below = this.tiles[this.tiles.length - 1];
    // Odd heights slide along X, even along Z. The block always enters from the far side of the
    // axis (where the camera looks) and comes towards it: x from -5, z from +5.
    const axis = this.height % 2 === 1 ? 'x' : 'z';
    const tile = {
      x: below.x, z: below.z,
      y: below.y + below.sy / 2 + TILE_HEIGHT / 2,
      sx: below.sx, sy: TILE_HEIGHT, sz: below.sz,
      level: this.height + 1,
    };
    if (axis === 'x') { tile.x = -MOVE_BOUND; this.dir = 1; } else { tile.z = MOVE_BOUND; this.dir = -1; }
    const l = this.level;
    this.axis = axis;
    this.speed = Math.max(l.minTileMoveSpeed, l.tileMoveSpeed + l.tileMoveSpeedDeltaPerTile * (this.height - 1));
    this.active = tile;
  }

  _anchor() {
    const tile = this.active;
    const below = this.tiles[this.tiles.length - 1];
    const a = this.axis;
    const size = a === 'x' ? 'sx' : 'sz';

    // Close enough to the block below snaps onto it.
    if (Math.abs(tile[a] - below[a]) <= SNAP_TOLERANCE) tile[a] = below[a];
    const lo = tile[a] - tile[size] / 2, hi = tile[a] + tile[size] / 2;
    const bLo = below[a] - below[size] / 2, bHi = below[a] + below[size] / 2;
    const perfect = Math.abs(lo - bLo) <= PERFECT_EPSILON && Math.abs(hi - bHi) <= PERFECT_EPSILON;
    const oLo = Math.max(lo, bLo), oHi = Math.min(hi, bHi);
    const overlap = oHi - oLo;

    if (overlap < MIN_OVERLAP) {
      this._miss();
      return;
    }

    // The parts outside the block below fall away, in the block's colour.
    if (oLo - lo >= MIN_OVERLAP) this._scrap(tile, a, size, lo, oLo);
    if (hi - oHi >= MIN_OVERLAP) this._scrap(tile, a, size, oHi, hi);
    tile[size] = overlap;
    tile[a] = (oLo + oHi) / 2;

    const ratio = overlap / Math.max(below[size], MIN_OVERLAP);
    this.tiles.push(tile);
    this.active = null;
    this.height++;
    const finished = this.height - 1 >= this.level.tilesToPlace;

    this._pulse(tile, perfect);
    this._feedback(tile, perfect, ratio, finished);
    this._refreshCounter();
    this._moveCamera();

    if (finished) {
      this.over = true;
      this.host.finish(true);
      return;
    }
    this._spawn();
  }

  _scrap(tile, a, size, from, to) {
    const piece = { ...tile, fallen: 0, age: 0 };
    piece[size] = to - from;
    piece[a] = (from + to) / 2;
    // A hair higher than the tile, against z-fighting in the app; here it only orders the draw.
    piece.y += 0.01;
    this.scraps.push(piece);
  }

  _miss() {
    this.over = true;
    const tile = this.active;
    this.active = null;
    this._text3d(tile, this.host.strings.feedbackMiss, MOTION_ALERT);
    // The whole block falls; the defeat comes when it has faded.
    this.scraps.push({ ...tile, age: 0, onDone: () => this.host.finish(false) });
  }

  _moveCamera() {
    this.cameraFrom = this.cameraLift;
    this.cameraTo += TILE_HEIGHT;
    this.cameraT = 0;
  }

  // ── Feedback (StackFeedback) ──

  _pulse(tile, perfect) {
    const spec = perfect ? PULSE.perfect : PULSE.normal;
    let color = this._tileColor(tile.level);
    if (perfect) color = mix(color, '#ffffff', PULSE_PERFECT_BRIGHTEN);
    this.pulses.push({ x: tile.x, y: tile.y - tile.sy / 2 + 0.002, z: tile.z, sx: tile.sx, sz: tile.sz, color, ...spec, age: 0 });
  }

  _feedback(tile, perfect, ratio, finished) {
    const s = this.host.strings;
    if (finished) this._text3d(tile, this._text().finish, MOTION_FINISH);
    else if (perfect) this._text3d(tile, s.feedbackPerfect, MOTION_PERFECT);
    else if (ratio <= 0.5) this._text3d(tile, pickOther(this, 'lastAlert', [s.feedbackAlert1, s.feedbackAlert2, s.feedbackAlert3]), MOTION_ALERT);
    else this._text3d(tile, pickOther(this, 'lastGood', [s.feedbackGood1, s.feedbackGood2, s.feedbackGood3]), MOTION_GOOD);
  }

  /** The text rises from just above the block, in the opposite tone of the block's palette. */
  _text3d(tile, text, motion) {
    const [x, y] = this._project(tile.x, tile.y + tile.sy / 2 + 0.15, tile.z);
    const palette = this.host.palette;
    const max = palette.length - 1;
    const tone = this._tone(tile.level);
    let opposite = max - tone;
    if (opposite === tone && max > 0) opposite = tone === 0 ? max : 0;
    this.host.feedback(text, x, y, palette[opposite], motion);
  }

  _refreshCounter() {
    this.counter.textContent = String(Math.max(0, this.level.tilesToPlace - (this.height - 1)));
  }

  // ── Tick ──

  update(dt) {
    if (this.active) {
      const t = this.active;
      t[this.axis] += this.dir * this.speed * dt;
      if (t[this.axis] <= -MOVE_BOUND) { t[this.axis] = -MOVE_BOUND; this.dir = 1; }
      else if (t[this.axis] >= MOVE_BOUND) { t[this.axis] = MOVE_BOUND; this.dir = -1; }
    }

    if (this.cameraT < 1) {
      this.cameraT = Math.min(1, this.cameraT + dt / CAMERA_MOVE_S);
      const k = this.cameraT * this.cameraT * (3 - 2 * this.cameraT);
      this.cameraLift = this.cameraFrom + (this.cameraTo - this.cameraFrom) * k;
    }

    for (const p of this.scraps) {
      p.age += dt;
      p.y -= SCRAP_FALL_SPEED * dt;
    }
    const done = this.scraps.filter((p) => p.age >= SCRAP_FADE_S);
    this.scraps = this.scraps.filter((p) => p.age < SCRAP_FADE_S);
    for (const p of done) if (p.onDone) p.onDone();

    for (const p of this.pulses) p.age += dt;
    this.pulses = this.pulses.filter((p) => p.age < p.s);
  }

  pointerDown() {
    if (!this.active || this.over) return;
    this.host.dismissStartHint();
    this._anchor();
  }

  pointerMove() {}
  pointerUp() {}

  // ── Drawing ──

  render() {
    const { ctx, width, height, theme } = this.host;
    // Amunt flips the shared background: the light end at the top.
    drawSceneBackground(ctx, width, height, theme, true);

    // A pulse is a flat square on the top of the block below the one that caused it.
    const items = [];
    for (const t of this.tiles) items.push({ box: t, alpha: 1, aabb: aabb(t) });
    if (this.active) items.push({ box: this.active, alpha: 1, aabb: aabb(this.active) });
    // Falling pieces have no physics: they drop through the wider blocks lower down. Unity's depth
    // buffer hides the part inside a block; here that part is cut away before painting.
    const solids = this.tiles.map(aabb);
    for (const p of this.scraps) {
      const whole = aabb(p);
      const pieces = solids.reduce((parts, s) => parts.flatMap((part) => subtract(part, s)), [whole]);
      const split = pieces.length !== 1 || pieces[0] !== whole;
      for (const part of pieces) items.push({ box: p, alpha: fadeAlpha(p.age), aabb: part, split });
    }
    for (const p of this.pulses) {
      const k = 1 + (p.expand - 1) * smooth(Math.min(1, p.age / p.s));
      const y = p.y - 0.002;
      items.push({ pulse: p, aabb: { x0: p.x - (p.sx * k) / 2, x1: p.x + (p.sx * k) / 2, y0: y, y1: y, z0: p.z - (p.sz * k) / 2, z1: p.z + (p.sz * k) / 2 } });
    }
    for (const item of paintersOrder(items)) {
      // A piece cut into parts is drawn without edges, so the cuts do not show as seams.
      if (item.box) this._drawBox(item.aabb, item.box.level, item.alpha, !item.split);
      else this._drawPulse(item.pulse);
    }

    this._drawFog();
  }

  /** World → canvas pixels: the content area's centre looks at the origin, raised by the camera. */
  _project(x, y, z) {
    const { width, height, insets } = this.host;
    const ppu = width / BOUNDS_WIDTH;
    const cx = width / 2;
    const cy = insets.top + (height - insets.top - insets.bottom) / 2;
    const r = x * RIGHT[0] + y * RIGHT[1] + z * RIGHT[2];
    const u = x * UP[0] + (y - this.cameraLift) * UP[1] + z * UP[2];
    return [cx + r * ppu, cy - u * ppu];
  }

  _drawBox(box, level, alpha, edges = true) {
    if (alpha <= 0) return;
    const { ctx } = this.host;
    const { x0, x1, y0, y1, z0, z1 } = box;
    const P = (x, y, z) => this._project(x, y, z);
    const color = this._tileColor(level);
    // The three faces the camera sees: top (+y), front-left (-z), front-right (+x).
    const faces = [
      [[P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], SHADE.top],
      [[P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)], SHADE.front],
      [[P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0)], SHADE.side],
    ];
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = EDGE;
    for (const [pts, shade] of faces) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = scale(color, shade);
      ctx.fill();
      if (edges) ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _drawPulse(p) {
    const t = Math.min(1, p.age / p.s);
    const eased = t * t * (3 - 2 * t);
    const k = 1 + (p.expand - 1) * eased;
    const hx = (p.sx * k) / 2, hz = (p.sz * k) / 2;
    const { ctx } = this.host;
    const pts = [
      this._project(p.x - hx, p.y, p.z - hz), this._project(p.x + hx, p.y, p.z - hz),
      this._project(p.x + hx, p.y, p.z + hz), this._project(p.x - hx, p.y, p.z + hz),
    ];
    ctx.globalAlpha = p.alpha * (1 - eased);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /**
   * Amunt_BottomFog: the tower fades into the background towards the navigation band, from a
   * quarter of the band's height above it to half of it below, never fully opaque (0.6).
   */
  _drawFog() {
    const { ctx, width, height, insets, theme } = this.host;
    const navTop = height - insets.bottom;
    const top = navTop - insets.bottom * 0.25;
    const solid = navTop + insets.bottom * 0.5;
    const fog = ctx.createLinearGradient(0, top, 0, solid);
    const rgb = hexToRgb(theme.surfaceMain);
    fog.addColorStop(0, `rgba(${rgb}, 0)`);
    fog.addColorStop(1, `rgba(${rgb}, 0.6)`);
    ctx.fillStyle = fog;
    ctx.fillRect(0, top, width, solid - top);
    ctx.fillStyle = `rgba(${rgb}, 0.6)`;
    ctx.fillRect(0, solid, width, height - solid);
  }

  /** Tones go 0 → 5 → 0 up the tower (SkeepGameSurfaceMaterialPool.PingPongColorIndex). */
  _tone(level) {
    const max = this.host.palette.length - 1;
    const period = max * 2;
    const t = (((level - 1) % period) + period) % period;
    return t > max ? period - t : t;
  }

  _tileColor(level) {
    return this.host.palette[this._tone(level)];
  }

  _text() {
    return this.host.text;
  }
}

function aabb(b) {
  return {
    x0: b.x - b.sx / 2, x1: b.x + b.sx / 2,
    y0: b.y - b.sy / 2, y1: b.y + b.sy / 2,
    z0: b.z - b.sz / 2, z1: b.z + b.sz / 2,
  };
}

/**
 * `a` minus the solid `s`: up to six boxes that cover the rest of `a` (slabs below and above `s`,
 * then beside it in x, then in z). `a` itself when they do not intersect.
 */
function subtract(a, s) {
  if (a.x1 <= s.x0 + EPS || s.x1 <= a.x0 + EPS || a.y1 <= s.y0 + EPS || s.y1 <= a.y0 + EPS
    || a.z1 <= s.z0 + EPS || s.z1 <= a.z0 + EPS) return [a];
  const out = [];
  const y0 = Math.max(a.y0, s.y0), y1 = Math.min(a.y1, s.y1);
  if (a.y0 < s.y0) out.push({ ...a, y1: s.y0 });
  if (a.y1 > s.y1) out.push({ ...a, y0: s.y1 });
  const x0 = Math.max(a.x0, s.x0), x1 = Math.min(a.x1, s.x1);
  if (a.x0 < s.x0) out.push({ ...a, y0, y1, x1: s.x0 });
  if (a.x1 > s.x1) out.push({ ...a, y0, y1, x0: s.x1 });
  if (a.z0 < s.z0) out.push({ ...a, y0, y1, x0, x1, z1: s.z0 });
  if (a.z1 > s.z1) out.push({ ...a, y0, y1, x0, x1, z0: s.z1 });
  return out;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

const EPS = 1e-4;

/**
 * Must `a` be painted before `b`? Sorting by centre depth fails here: a block sliding in from the
 * far side has a farther centre than the tower top it rests on, and got painted under it. Boxes
 * that do not intersect are separated along some axis, and that axis gives the order: the camera
 * looks down from the +x, -z side, so lower, smaller-x and larger-z boxes go first.
 */
function before(a, b) {
  if (a.y1 <= b.y0 + EPS) return true;
  if (b.y1 <= a.y0 + EPS) return false;
  if (a.x1 <= b.x0 + EPS) return true;
  if (b.x1 <= a.x0 + EPS) return false;
  if (a.z0 >= b.z1 - EPS) return true;
  if (b.z0 >= a.z1 - EPS) return false;
  // Overlapping (a scrap still touching its block): fall back to the centres' depth.
  const depth = (o) => ((o.x0 + o.x1) * FORWARD[0] + (o.y0 + o.y1) * FORWARD[1] + (o.z0 + o.z1) * FORWARD[2]) / 2;
  return depth(a) > depth(b);
}

/** Topological order of the "before" relation; a few dozen items, so the pairwise pass is cheap. */
function paintersOrder(items) {
  const n = items.length;
  const after = items.map(() => []);
  const pending = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (before(items[i].aabb, items[j].aabb)) { after[i].push(j); pending[j]++; } else { after[j].push(i); pending[i]++; }
    }
  }
  const order = [];
  const ready = [];
  for (let i = 0; i < n; i++) if (pending[i] === 0) ready.push(i);
  while (ready.length) {
    const i = ready.pop();
    order.push(items[i]);
    for (const j of after[i]) if (--pending[j] === 0) ready.push(j);
  }
  // A cycle (impossible for disjoint boxes) would leave items out: paint them last.
  if (order.length < n) for (let i = 0; i < n; i++) if (pending[i] > 0) order.push(items[i]);
  return order;
}

function fadeAlpha(age) {
  const t = Math.min(1, age / SCRAP_FADE_S);
  return t <= FALL_BEFORE_FADE ? 1 : 1 - (t - FALL_BEFORE_FADE) / (1 - FALL_BEFORE_FADE);
}

/** A different entry from last time, as Amunt_UI does for its "good" and "alert" texts. */
function pickOther(state, key, options) {
  const i = state[key] < 0
    ? Math.floor(Math.random() * options.length)
    : (state[key] + 1 + Math.floor(Math.random() * (options.length - 1))) % options.length;
  state[key] = i;
  return options[i];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function scale(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(Math.min(255, v * k));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

function mix(hex, other, t) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(other.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}
