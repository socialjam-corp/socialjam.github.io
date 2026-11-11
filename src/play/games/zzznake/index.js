// Zzznake ("Znake"): tap to switch between the two directions and zigzag along a path that builds
// itself ahead, picking up the floating cubes without falling off. Single-player port of
// Zzznake_TilePath (path, branch loops, rising blocks), Zzznake_Player (head, turn corners,
// followers), Zzznake_BodyPickup and Zzznake_SceneManager (LevelFlow, GameplayFlow, DefeatFlow),
// drawn on a canvas with the scene's orthographic camera.

import { drawSceneBackground } from '../../features/background.js';

// Zzznake_Config.asset
const FIRST_SEGMENT = 0.5;        // firstSegmentDistance
const SEGMENT_SPACING = 0.5;
const HEAD_TURN_S = 0.15;
const SEGMENT_TURN_S = 0.15;
const MAX_SEGMENTS = 30;          // maxPlayerSegments
const BASE_SIZE = 6;              // initialBaseSize
const TILE_DEPTH = 20;
const MIN_TILES_AHEAD = 3;        // minTilesAheadOfPlayer
const APPEAR_LEAD_TILES = 3;      // tileAppearLeadTiles
const APPEAR_S = 0.8;             // tileAppearDuration
const RISE_OFFSET = 20;           // tileAppearRiseOffset
const AHEAD_S = 1;                // tileAheadSeconds (class default; not in the asset)
const MAX_DT = 0.05;              // MaxGameplayDeltaTime
// Zzznake_TilePath
const BRANCH_SCALE = 0.5, BRANCH_MIN_TILE = 0.5, BRANCH_MIN_LEG = 2;
const GROUND_PAD = 0.04;
const MAX_EXTENSIONS = 32;
// The head's BoxCollider (Zzznake_Player.prefab): 0.1 wide, 0.25 long. Probes and pickups use it.
const HEAD_HALF_W = 0.05, HEAD_HALF_L = 0.125;
// Zzznake_BodyPickup / LevelFlow
const PICKUP_SIZE = 0.35, PICKUP_FLOAT = 0.42, BOB_AMP = 0.07, BOB_SPEED = 3.5, SPIN_DEG = 90;
const PICKUP_LOGO_TONE = 3;       // the Skeep logo on cubes and bodies
const LOGO_FACE = 0.7;
const MAX_SPEED_BONUS_RATIO = 0.5;
// The camera fits the scene's 8 × 4 × 4 CameraBounds to the content width, aligned to the bottom of
// the content area; it then follows the head.
const BOUNDS_WIDTH = 8;
const BOUNDS_HALF_UP = 4 * 0.5 + 2 * Math.SQRT1_2 + 2 * 0.5;
// The path's tint in dark mode is the first neutral (surface-high) in its "Opposite" variant: the
// light-mode surface-high.
const PATH_COLOR = '#f0f0f0';
const HINT_GAP = 24;

// Camera at Euler (45, -45, 0).
const RIGHT = [Math.SQRT1_2, 0, Math.SQRT1_2];
const UP = [-0.5, Math.SQRT1_2, 0.5];
const FORWARD = [-0.5, -Math.SQRT1_2, 0.5];

// The scene's directional light, Euler (60, 45, 0): it shines along (0.354, -0.866, 0.354), so the
// direction towards it (the shader's _WorldSpaceLightPos0) is the opposite.
const TO_LIGHT = [-0.3536, 0.8660, -0.3536];
// Where a point's shadow lands on the ground, per unit of its height, in x and in z.
const SHADOW_RUN = 0.3536 / 0.8660;
// M_Base (Skeep/Surface, every piece of the scene: path, snake and cubes).
const FACE_DARKEN = 0.8;          // dark mode uses the material's value as it is
const SHADOW_DARKEN = 0.5;        // lit faces under a cast shadow are multiplied by this
const SHARPNESS = 6;              // _TriplanarSharpness

/**
 * SkeepTriplanarFaceColor: three tones from one colour (lit 1, side-on 1 − d/2, opposite 1 − d),
 * picked per world axis by how that axis' face looks at the light, blended by |n|^sharpness.
 */
function faceTone(nx, ny, nz) {
  const lit = 1, mid = 1 - FACE_DARKEN * 0.5, dark = 1 - FACE_DARKEN;
  const ramp = (t) => (t < 0.5 ? dark + (mid - dark) * Math.min(1, t * 2) : mid + (lit - mid) * Math.min(1, t * 2 - 1));
  const n = [nx, ny, nz];
  const w = n.map((v) => Math.pow(Math.abs(v), SHARPNESS));
  const sum = Math.max(w[0] + w[1] + w[2], 1e-4);
  let k = 0;
  for (let i = 0; i < 3; i++) {
    const t = Math.min(1, Math.max(0, Math.sign(n[i]) * TO_LIGHT[i] * 0.5 + 0.5));
    k += ramp(t) * (w[i] / sum);
  }
  return k;
}

// Feedback motions (Zzznake_UI), in canvas units.
const MOTION_PICKUP = { startLift: 0, scale: 1.15, drift: 120 };
const MOTION_FALL = { startLift: 8, drift: 180, hold: 0.55, dissolve: 0.4 };
const FEEDBACK_TONE = 2;

// znake.fbx, in metres (x flipped as Unity imports it): the head, a body piece and the tail.
// Each faces +z; the head's pivot is at its back half, a body's and the tail's at their front.
const MESH = {"body":{"v":[[0.1328,0,-0.2656],[0.1328,0.2656,-0.2656],[-0.1328,0,-0.2656],[-0.1328,0.2656,-0.2656],[0.1328,0,0],[0.1328,0.2656,0],[-0.1328,0,0],[-0.1328,0.2656,0]],"f":[[0,1,3,2],[2,3,7,6],[6,7,5,4],[4,5,1,0],[7,3,1,5]]},"head":{"v":[[-0.018,0.0394,0.8229],[-0.018,0.0293,0.8199],[-0.018,0.0625,0.6804],[-0.018,0.052,0.6804],[-0.0279,0.0299,0.8424],[-0.0279,0.04,0.8453],[-0.0216,0.0288,0.8463],[-0.0216,0.0389,0.8492],[-0.018,0.0625,0.7429],[-0.018,0.0524,0.74],[0,0.0394,0.8229],[0,0.0293,0.8199],[0,0.0625,0.6804],[0,0.052,0.6804],[0.0099,0.0299,0.8424],[0.0099,0.04,0.8453],[0.0036,0.0288,0.8463],[0.0036,0.0389,0.8492],[0,0.0625,0.7429],[0,0.0524,0.74],[-0.01,0.0393,0.8342],[-0.008,0.0393,0.8342],[-0.008,0.0292,0.8313],[-0.01,0.0292,0.8313],[0.1328,0,-0.25],[0.1328,0.2656,-0.25],[-0.1328,0,-0.25],[-0.1328,0.2656,-0.25],[0.2517,0,0.3361],[0.2517,0.3781,0.3361],[-0.2517,0,0.3361],[-0.2517,0.3781,0.3361],[-0.1172,0.14,0.6804],[-0.1172,0,0.6804],[0.1172,0,0.6804],[0.1172,0.14,0.6804]],"f":[[8,0,1,9],[20,0,10,21],[4,6,23,1],[22,11,1,23],[5,7,6,4],[0,5,4,1],[17,16,22,21],[7,20,23,6],[2,8,9,3],[18,19,11,10],[14,11,22,16],[0,20,7,5],[15,14,16,17],[10,11,14,15],[8,2,12,18],[15,17,21,10],[12,13,19,18],[22,23,20,21],[0,8,18,10],[11,19,9,1],[3,9,19,13],[24,25,27,26],[26,27,31,30],[31,29,35,32],[28,29,25,24],[31,27,25,29],[33,32,35,34],[30,31,32,33],[29,28,34,35]]},"tail":{"v":[[0.1328,0,-0.2656],[0.1328,0.2656,-0.2656],[-0.1328,0,-0.2656],[-0.1328,0.2656,-0.2656],[0.1328,0,0],[0.1328,0.2656,0],[-0.1328,0,0],[-0.1328,0.2656,0],[-0.0232,0.1096,-0.698],[0.0232,0.1096,-0.698],[0.0232,0.156,-0.698],[-0.0232,0.156,-0.698]],"f":[[3,2,8,11],[2,3,7,6],[6,7,5,4],[4,5,1,0],[7,3,1,5],[9,10,11,8],[0,1,10,9],[1,3,11,10],[2,0,9,8]]}};

export default {
  // Zzznake_Loc: GAME_TITLE, GAME_DESCRIPTION, GAME_DESCRIPTION_SP, GAME_START_HINT; SkeepMain's
  // FEEDBACK_PLUS_ONE / FEEDBACK_GOOD_1 on a pickup and FEEDBACK_OOPS on a fall.
  text: {
    ca: {
      title: 'Zerp',
      description: 'Fes ziga-zaga recollint punts sense sortir-te del camí. / Un toc a la pantalla et fa girar.',
      descriptionSp: "Recull tots els punts del recorregut sense sortir-te'n.",
      startHint: 'Prem per canviar de direcció',
      pickup: ['+1', 'Bo!'],
      fall: 'Ups!',
    },
    en: {
      title: 'Znake',
      description: 'Zigzag along the path collecting points without going off it. / Tap the screen to turn.',
      descriptionSp: 'Collect every point on the path without going off it.',
      startHint: 'Tap to change direction',
      pickup: ['+1', 'Nice!'],
      fall: 'Oops!',
    },
    es: {
      title: 'Zerpiente',
      description: 'Haz zigzag recogiendo puntos sin salirte del camino. / Un toque en la pantalla te hace girar.',
      descriptionSp: 'Recoge todos los puntos del recorrido sin salirte.',
      startHint: 'Pulsa para cambiar de dirección',
      pickup: ['+1', '¡Bien!'],
      fall: '¡Ups!',
    },
  },

  levels: () => fetch(new URL('./levels.json', import.meta.url)).then((r) => {
    if (!r.ok) throw new Error(`levels.json: ${r.status}`);
    return r.json();
  }),

  create: (host) => new Zzznake(host),
};

// ── Footprints (TileFootprint): x and z ranges of a block's top face ──

const fp = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });
const progress = (x, z) => z - x;                          // the snake and the path only go -x / +z
const farProgress = (f) => progress(f.minX, f.maxZ);
const interiorOverlap = (a, b) => a.maxX > b.minX + 0.001 && b.maxX > a.minX + 0.001
  && a.maxZ > b.minZ + 0.001 && b.maxZ > a.minZ + 0.001;
const strictlyInside = (x, z, f) => x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ;

function extend(last, negX, run, cross) {
  return negX
    ? fp(last.minX - run, last.minX, last.maxZ - cross, last.maxZ)
    : fp(last.minX, last.minX + cross, last.maxZ, last.maxZ + run);
}

const randInt = (min, max) => min + Math.floor(Math.random() * (Math.max(min, max) - min + 1));

// ── The path (Zzznake_TilePath) ──

class TilePath {
  constructor(level) {
    const floor = Math.max(0.5, level.tileMinSize);
    this.dim = (v) => Math.max(floor, v);
    this.sizeStart = this.dim(level.tileSize);
    this.sizeDecrement = Math.max(0, level.tileSizeDecrement);
    this.sizeInterval = Math.max(1, level.tileSizeDecrementInterval);
    this.sizeMin = this.dim(level.tileMinSize);
    this.switchMin = level.tileSwitchDirectionMin;
    this.switchMax = Math.max(level.tileSwitchDirectionMin, level.tileSwitchDirectionMax);
    this.branchMin = Math.max(0, level.branchIntervalMin || 0);
    this.branchMax = Math.max(this.branchMin, level.branchIntervalMax || 0);
    this.legMin = Math.max(BRANCH_MIN_LEG, level.branchLegMin || BRANCH_MIN_LEG);
    this.legMax = Math.max(this.legMin, level.branchLegMax || this.legMin);
    this.tiles = [];
    this.baseActive = true;
    this.placed = 0;
    this.nextId = 0;
    this.hasTip = false;
    this.tip = null;
    this.lastNegX = false;
    this.sinceSwitch = 0;
    this.nextSwitch = randInt(this.switchMin, this.switchMax);
    this.untilBranch = this._branchInterval();
    this.loop = null;
    this.loopIds = 0;
    this.straight = false;
    this.headOnBranch = false;
    this.headOnLoopMain = false;
    this.onAdded = null;
    this.onRemoved = null;
    this.silent = false;
    this.run = this._sizeForNext();
  }

  get branches() { return this.branchMin >= 1; }
  _branchInterval() { return this.branches ? randInt(this.branchMin, this.branchMax) : 0; }

  base() { return fp(-BASE_SIZE / 2, BASE_SIZE / 2, -BASE_SIZE / 2, BASE_SIZE / 2); }

  _sizeForNext() {
    let size = this.sizeStart;
    if (this.sizeDecrement > 0) size = this.sizeStart - Math.floor(this.placed / this.sizeInterval) * this.sizeDecrement;
    return this.dim(Math.max(this.sizeMin, size));
  }

  _overlapsPath(f) { return this.tiles.some((t) => interiorOverlap(f, t.f)); }

  /** The blocks that should already stand before the first tap (no rise), at least one. */
  seed() {
    this.silent = true;
    for (let i = 0; i < MAX_EXTENSIONS; i++) {
      if (this.hasTip && farProgress(this.tip) >= MIN_TILES_AHEAD * this.run) break;
      if (!this.extendMain()) break;
    }
    for (const t of this.tiles) t.rise = 1;
    this.silent = false;
  }

  /** Grow every open path ahead of the head and raise the new blocks (EnsureAheadOf). */
  ensureAhead(head, speed, dt, settledOnly, offScreen) {
    const hp = progress(head.x, head.z);
    this._locateHead(head.x, head.z);
    const settle = Math.max(MIN_TILES_AHEAD * this.run, speed * AHEAD_S);
    const riseLead = Math.max(APPEAR_LEAD_TILES * this.run, speed * APPEAR_S);
    const spawn = APPEAR_LEAD_TILES > 0 ? settle + riseLead : settle;
    const reach = settledOnly ? settle : spawn;
    this.offScreen = offScreen;
    for (let i = 0; i < MAX_EXTENSIONS; i++) {
      if (this.hasTip && farProgress(this.tip) - hp >= reach) break;
      if (!this.extendMain()) break;
    }
    for (let i = 0; i < MAX_EXTENSIONS; i++) {
      if (!this.loop || this._branchDone()) break;
      if (farProgress(this.loop.branchTip) - hp >= reach) break;
      if (!this._extendBranch()) break;
    }
    // Each block rises on its own clock; distance only caps it, so the head never meets one mid-rise.
    const span = spawn - settle;
    for (const t of this.tiles) {
      if (t.rise >= 1) continue;
      const timeT = Math.min(1, t.rise + dt / APPEAR_S);
      const remaining = farProgress(t.f) - hp;
      const distT = span > 0.0001 ? Math.min(1, Math.max(0, (spawn - remaining) / span)) : 1;
      t.rise = Math.max(timeT, distT);
    }
  }

  extendMain() {
    if (this.loop && !this._mainDone()) return this._extendMainFromLoop();
    if (this.loop && this._branchDone()) this.loop = null;
    this.run = this._sizeForNext();
    if (!this.hasTip) {
      const negX = Math.random() < 0.5;
      const b = this.base();
      const first = negX
        ? fp(b.minX - this.run, b.minX, b.maxZ - this.run, b.maxZ)
        : fp(b.minX, b.minX + this.run, b.maxZ, b.maxZ + this.run);
      if (this._overlapsPath(first)) return false;
      this._addMain(first, negX);
      this._afterExtend(false);
      return true;
    }
    // A block of a new size always turns: on a corner the change of width does not show as a step.
    const sizeChanged = Math.abs(this.run - Math.min(this.tip.maxX - this.tip.minX, this.tip.maxZ - this.tip.minZ)) > 0.001;
    if (!sizeChanged && this._beginLoop()) return this._extendMainFromLoop();
    const switching = sizeChanged || (!this.straight && this.hasTip && this.sinceSwitch >= this.nextSwitch);
    const negX = sizeChanged ? !this.lastNegX : this.straight ? this.lastNegX : switching ? !this.lastNegX : this.lastNegX;
    const prefer = extend(this.tip, negX, this.run, this.run);
    if (!this._overlapsPath(prefer)) {
      this._addMain(prefer, negX);
      this._afterExtend(switching && !this.straight);
      return true;
    }
    if (this.straight && !sizeChanged) return false;
    const alternate = extend(this.tip, !negX, this.run, this.run);
    if (this._overlapsPath(alternate)) return false;
    this._addMain(alternate, !negX);
    this._afterExtend(!switching && !this.straight);
    return true;
  }

  _afterExtend(switched) {
    if (this.straight) return;
    if (switched) { this.sinceSwitch = 0; this.nextSwitch = randInt(this.switchMin, this.switchMax); }
    else this.sinceSwitch++;
  }

  _setTip(f, negX) {
    this.tip = f;
    this.hasTip = true;
    this.lastNegX = negX;
    this.placed++;
  }

  _addMain(f, negX) {
    this._setTip(f, negX);
    if (this.branches && !this.loop && this.untilBranch > 0) this.untilBranch--;
    this._addTile(f, false, 0);
  }

  _mainDone() { return this.loop.mainNext >= this.loop.main.length; }
  _branchDone() { return this.loop.abandoned || this.loop.branchNext >= this.loop.branch.length; }

  /** If the snake took the detour, only the joining block of the main side (and what shows) is built. */
  _extendMainFromLoop() {
    const index = this.loop.mainNext++;
    const f = this.loop.main[index];
    this._setTip(f, this.loop.mainNegX[index]);
    const junction = index === this.loop.main.length - 1;
    if (junction) { this.sinceSwitch = 0; this.nextSwitch = randInt(this.switchMin, this.switchMax); }
    if (!junction && this.headOnBranch && this.offScreen && this.offScreen(f)) return true;
    this._addTile(f, false, this.loop.id);
    return true;
  }

  /**
   * A fork at the main tip: the main path goes a blocks one way and b the other, and a detour of
   * half-size blocks goes 2·b and 2·a − 1 the other way round, closing the rectangle beside the
   * main's last (joining) block. The whole rectangle is checked before it is used.
   */
  _beginLoop() {
    if (!this.branches || this.loop || this.straight || this.silent || !this.hasTip || this.untilBranch > 0) return false;
    const size = this.run, bsize = size * BRANCH_SCALE;
    if (bsize < BRANCH_MIN_TILE - 0.0001) return false;
    const a = randInt(this.legMin, this.legMax), b = randInt(this.legMin, this.legMax);
    const firstNegX = Math.random() < 0.5;
    const plan = { id: ++this.loopIds, main: [], mainNegX: [], branch: [], mainNext: 0, branchNext: 0, abandoned: false, branchTip: this.tip };
    let last = this.tip;
    for (let i = 0; i < a + b; i++) {
      const negX = i < a ? firstNegX : !firstNegX;
      last = extend(last, negX, size, size);
      plan.main.push(last);
      plan.mainNegX.push(negX);
    }
    // The detour starts flush with the fork's outer edge, continuing its wall.
    const t = this.tip;
    last = !firstNegX
      ? fp(t.minX - bsize, t.minX, t.minZ, t.minZ + bsize)
      : fp(t.maxX - bsize, t.maxX, t.maxZ, t.maxZ + bsize);
    plan.branch.push(last);
    const firstLeg = b * 2, secondLeg = a * 2 - 1;
    for (let i = 1; i < firstLeg + secondLeg; i++) {
      last = extend(last, i < firstLeg ? !firstNegX : firstNegX, bsize, bsize);
      plan.branch.push(last);
    }
    const base = this.base();
    const all = plan.main.concat(plan.branch);
    for (let i = 0; i < all.length; i++) {
      if (this._overlapsPath(all[i]) || (this.baseActive && interiorOverlap(all[i], base))
        || (i >= plan.main.length && plan.main.some((m) => interiorOverlap(all[i], m)))) {
        this.untilBranch = 1; // try again at the next block
        return false;
      }
    }
    this.loop = plan;
    this.untilBranch = this._branchInterval();
    return true;
  }

  /** The detour stops growing once the snake is on the main side and its next block is off screen. */
  _extendBranch() {
    const f = this.loop.branch[this.loop.branchNext];
    if (this.headOnLoopMain && this.offScreen && this.offScreen(f)) {
      this.loop.abandoned = true;
      return false;
    }
    this.loop.branchNext++;
    this.loop.branchTip = f;
    this._addTile(f, true, this.loop.id);
    return true;
  }

  _locateHead(x, z) {
    this.headOnBranch = false;
    this.headOnLoopMain = false;
    if (!this.loop) return;
    for (const t of this.tiles) {
      if (t.loopId !== this.loop.id || !strictlyInside(x, z, t.f)) continue;
      if (t.branch) this.headOnBranch = true; else this.headOnLoopMain = true;
    }
  }

  _addTile(f, branch, loopId) {
    const tile = { id: ++this.nextId, f, branch, loopId, rise: 0 };
    this.tiles.push(tile);
    if (!this.silent && this.onAdded) this.onAdded(tile);
  }

  removeAt(i) {
    const [tile] = this.tiles.splice(i, 1);
    if (this.onRemoved) this.onRemoved(tile.id);
  }
}

class Zzznake {
  constructor(host) {
    this.host = host;
    this.pickups = [];
    this.collected = 0;
    this.spawned = 0;
    this.running = false;
    this.waiting = true;
    this.ended = false;
    this.time = 0;
  }

  // ── Lifecycle ──

  load(level) {
    this.level = level;
    this.speedBonus = Math.min(level.playerSpeedIncrementPerBody, level.playerSpeed * MAX_SPEED_BONUS_RATIO);
    this.speed = level.playerSpeed;
    this.path = new TilePath(level);
    this.path.onAdded = (t) => this._onTileAdded(t);
    this.path.onRemoved = (id) => this._onTileRemoved(id);
    this.sinceBody = 0;
    this.nextBody = randInt(level.bodyIntervalMin, level.bodyIntervalMax);
    this.sinceBranchBody = 0;
    this.nextBranchBody = randInt(level.branchBodyIntervalMin || 1, level.branchBodyIntervalMax || 1);

    // Zzznake_Player: the head at the centre of the base, facing -x, with one body and the tail.
    this.axisNegX = true;
    this.head = { x: 0, z: 0, yaw: yawOf(true), turnFrom: 0, turnTo: 0, turnT: 1 };
    this.corners = [];
    this.followers = [newFollower('body', true), newFollower('tail', true)];
    this._recomputeDistances();
    this._placeFollowers();

    this.path.seed();
    // The first block gets the first cube.
    if (this.path.tiles.length) this._spawnPickup(this.path.tiles[0]);
    this.counter = document.createElement('div');
    this.counter.className = 'hud-capsule';
    this.host.hud.append(this.counter);
    this._refreshCounter();

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.logo = tint(img, this.host.palette[PICKUP_LOGO_TONE]); resolve(); };
      img.onerror = () => resolve();
      img.src = new URL('../../img/logo.png', import.meta.url).href;
    });
  }

  start() {
    // The snake waits on the base until the first tap, which also turns it.
    const h = this.host;
    this.host.showStartHint(h.text.startHint, () => ({ y: h.insets.top + (32 + 64 + HINT_GAP) * h.u, align: 'top' }));
  }

  pause() {}
  resume() {}
  resize() {}
  destroy() {}

  // ── Input ──

  pointerDown() {
    if (this.ended) return;
    if (this.waiting) {
      this.waiting = false;
      this.running = true;
      this.host.dismissStartHint();
    }
    this._turn();
  }

  pointerMove() {}
  pointerUp() {}

  // ── The snake (Zzznake_Player) ──

  _turn() {
    const incoming = dirOf(this.axisNegX);
    this.axisNegX = !this.axisNegX;
    this.corners.push({ x: this.head.x, z: this.head.z, inX: incoming[0], inZ: incoming[1] });
    this.head.turnFrom = this.head.yaw;
    this.head.turnTo = yawOf(this.axisNegX);
    this.head.turnT = 0;
  }

  _tickSnake(dt) {
    const h = this.head;
    if (h.turnT < 1) {
      h.turnT = Math.min(1, h.turnT + dt / HEAD_TURN_S);
      h.yaw = lerpAngle(h.turnFrom, h.turnTo, smooth(h.turnT));
    }
    // The head moves along where it faces, which swings through the turn.
    const d = this.speed * dt;
    h.x += Math.sin(h.yaw) * d;
    h.z += Math.cos(h.yaw) * d;
    if (this.growth) {
      this.growth.travel += d;
      if (this.growth.travel >= SEGMENT_SPACING) { this.growth = null; this._placeFollowers(); }
    } else {
      for (const f of this.followers) {
        const s = this._onPolyline(f.distance);
        const yaw = yawOfDir(s.dx, s.dz);
        if (Math.abs(angleDiff(f.legYaw, yaw)) > 0.01) { f.turnFrom = f.yaw; f.turnTo = yaw; f.turnT = 0; }
        f.legYaw = yaw;
        f.x = s.x; f.z = s.z;
        if (f.turnT < 1) {
          f.turnT = Math.min(1, f.turnT + dt / SEGMENT_TURN_S);
          f.yaw = lerpAngle(f.turnFrom, f.turnTo, smooth(f.turnT));
        } else f.yaw = yaw;
      }
    }
    for (const f of this.followers) if (f.grow < 1) f.grow = Math.min(1, f.grow + dt / 0.35);
    this._trimCorners();
  }

  /** A point `distance` behind the head along its axis-aligned trail of turn corners. */
  _onPolyline(distance) {
    let cx = this.head.x, cz = this.head.z;
    let [dx, dz] = dirOf(this.axisNegX);
    let remaining = distance;
    for (let i = this.corners.length - 1; i >= 0; i--) {
      const c = this.corners[i];
      const toCorner = Math.abs(dx !== 0 ? cx - c.x : cz - c.z);
      if (toCorner <= 1e-6) { cx = c.x; cz = c.z; dx = c.inX; dz = c.inZ; continue; }
      if (remaining <= toCorner) return { x: cx - dx * remaining, z: cz - dz * remaining, dx, dz };
      remaining -= toCorner;
      cx = c.x; cz = c.z; dx = c.inX; dz = c.inZ;
    }
    return { x: cx - dx * remaining, z: cz - dz * remaining, dx, dz };
  }

  _trimCorners() {
    const tail = this.followers.length ? this.followers[this.followers.length - 1].distance : 0;
    // Corners further back than the tail are no longer needed.
    let along = 0, cx = this.head.x, cz = this.head.z;
    let [dx, dz] = dirOf(this.axisNegX);
    for (let i = this.corners.length - 1; i >= 0; i--) {
      const c = this.corners[i];
      along += Math.abs(dx !== 0 ? cx - c.x : cz - c.z);
      if (along > tail + 1) { this.corners.splice(0, i); return; }
      cx = c.x; cz = c.z; dx = c.inX; dz = c.inZ;
    }
  }

  _recomputeDistances() {
    this.followers.forEach((f, i) => { f.distance = FIRST_SEGMENT + SEGMENT_SPACING * i; });
  }

  _placeFollowers() {
    for (const f of this.followers) {
      const s = this._onPolyline(f.distance);
      f.x = s.x; f.z = s.z; f.yaw = f.legYaw = yawOfDir(s.dx, s.dz); f.turnT = 1;
    }
  }

  /** A new body before the tail; the trail pauses until the head has made room for it. */
  _grow() {
    if (this.growth) return false;
    const tailIndex = this.followers.length - 1;
    const anchor = tailIndex > 0 ? this.followers[tailIndex - 1] : null;
    const body = newFollower('body', false);
    const yaw = anchor ? anchor.yaw : this.head.yaw;
    const back = anchor ? SEGMENT_SPACING : FIRST_SEGMENT;
    body.x = (anchor ? anchor.x : this.head.x) - Math.sin(yaw) * back;
    body.z = (anchor ? anchor.z : this.head.z) - Math.cos(yaw) * back;
    body.yaw = body.legYaw = yaw;
    this.followers.splice(tailIndex, 0, body);
    while (this.followers.length > MAX_SEGMENTS) this.followers.shift();
    this._recomputeDistances();
    this.growth = { travel: 0 };
    return true;
  }

  // ── Pickups (LevelFlow) ──

  _onTileAdded(tile) {
    const l = this.level;
    if (this.spawned >= l.bodiesToWin) { this.path.straight = true; return; }
    if (tile.loopId && !tile.branch) return; // the main side of a fork gets none
    if (tile.branch) {
      if (++this.sinceBranchBody < this.nextBranchBody) return;
      this.sinceBranchBody = 0;
      this.nextBranchBody = randInt(l.branchBodyIntervalMin, l.branchBodyIntervalMax);
    } else {
      if (++this.sinceBody < this.nextBody) return;
      this.sinceBody = 0;
      this.nextBody = randInt(l.bodyIntervalMin, l.bodyIntervalMax);
    }
    this._spawnPickup(tile);
  }

  _spawnPickup(tile) {
    const size = Math.max(tile.f.maxX - tile.f.minX, tile.f.maxZ - tile.f.minZ);
    this.pickups.push({ tile, float: PICKUP_FLOAT + size * 0.15, phase: Math.random() * Math.PI * 2 });
    this.spawned++;
    if (this.spawned >= this.level.bodiesToWin) this.path.straight = true;
  }

  /** A cube that leaves with its block was not collected (it was on the other path): offer it again. */
  _onTileRemoved(id) {
    const i = this.pickups.findIndex((p) => p.tile.id === id);
    if (i < 0) return;
    this.pickups.splice(i, 1);
    this.spawned = Math.max(0, this.spawned - 1);
    if (this.spawned < this.level.bodiesToWin) this.path.straight = false;
  }

  _collectPickups() {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      // The cube floats over its block: stepping on the block collects it.
      if (!this._headOver(p.tile.f, 0.05)) continue;
      if (!this._grow()) continue;
      this.pickups.splice(i, 1);
      this.speed += this.speedBonus;
      this.collected++;
      const t = this.host.text.pickup;
      this.lastPickupText = (this.lastPickupText === undefined ? Math.floor(Math.random() * t.length) : this.lastPickupText + 1) % t.length;
      const [x, y] = this._project(centerX(p.tile.f), this._pickupY(p) + 0.2, centerZ(p.tile.f));
      this.host.feedback(t[this.lastPickupText], x, y, this.host.palette[FEEDBACK_TONE], MOTION_PICKUP);
      this._refreshCounter();
      if (this.collected >= this.level.bodiesToWin) {
        this.ended = true;
        this.running = false;
        this.host.finish(true);
        return;
      }
    }
  }

  _refreshCounter() {
    this.counter.textContent = String(Math.max(0, this.level.bodiesToWin - this.collected));
  }

  // ── Falling (DefeatFlow) ──

  _headCorners() {
    // The collider's footprint, turned with the head.
    const s = Math.sin(this.head.yaw), c = Math.cos(this.head.yaw);
    const ex = Math.abs(c) * HEAD_HALF_W + Math.abs(s) * HEAD_HALF_L;
    const ez = Math.abs(s) * HEAD_HALF_W + Math.abs(c) * HEAD_HALF_L;
    return { minX: this.head.x - ex, maxX: this.head.x + ex, minZ: this.head.z - ez, maxZ: this.head.z + ez };
  }

  _headOver(f, margin) {
    const h = this._headCorners();
    return h.maxX >= f.minX - margin && h.minX <= f.maxX + margin && h.maxZ >= f.minZ - margin && h.minZ <= f.maxZ + margin;
  }

  _supported() {
    if (this.path.baseActive && this._headOver(this.path.base(), GROUND_PAD)) return true;
    return this.path.tiles.some((t) => t.rise >= 1 && this._headOver(t.f, GROUND_PAD));
  }

  _fall() {
    this.ended = true;
    this.running = false;
    const [x, y] = this._project(this.head.x, 0.35, this.head.z);
    this.host.feedback(this.host.text.fall, x, y, this.host.palette[FEEDBACK_TONE], MOTION_FALL);
    this.host.finish(false);
  }

  // ── Tick ──

  update(rawDt) {
    const dt = Math.min(rawDt, MAX_DT);
    this.time += dt;
    if (this.running) {
      this._tickSnake(dt);
      this._collectPickups();
      if (!this.ended && !this._supported()) this._fall();
    }
    this._cull();
    if (this.running || this.waiting) {
      this.path.ensureAhead(this.head, this.speed, dt, !this.running, (f) => this._offScreen(f));
    }
  }

  /** Blocks behind the head that have left through the bottom of the screen go (CullPassedOffScreenTiles). */
  _cull() {
    const hp = progress(this.head.x, this.head.z);
    const bottom = this.host.height;
    const belowScreen = (f) => [[f.minX, f.minZ], [f.minX, f.maxZ], [f.maxX, f.minZ], [f.maxX, f.maxZ]]
      .every(([x, z]) => this._project(x, 0, z)[1] > bottom);
    for (let i = this.path.tiles.length - 1; i >= 0; i--) {
      const t = this.path.tiles[i];
      if (farProgress(t.f) >= hp || !belowScreen(t.f) || this._headOver(t.f, GROUND_PAD)) continue;
      this.path.removeAt(i);
    }
    const base = this.path.base();
    if (this.path.baseActive && !strictlyInside(this.head.x, this.head.z, base) && belowScreen(base) && !this._headOver(base, GROUND_PAD)) {
      this.path.baseActive = false;
    }
  }

  _offScreen(f) {
    const { width, height } = this.host;
    const pts = [[f.minX, 0.1, f.minZ], [f.maxX, 0.1, f.maxZ], [f.minX, 0.1, f.maxZ], [f.maxX, 0.1, f.minZ], [f.minX, -TILE_DEPTH, f.maxZ], [f.maxX, -TILE_DEPTH, f.minZ]]
      .map(([x, y, z]) => this._project(x, y, z));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return Math.max(...xs) < 0 || Math.min(...xs) > width || Math.max(...ys) < 0 || Math.min(...ys) > height;
  }

  // ── Drawing ──

  _project(x, y, z) {
    const { width, height, insets } = this.host;
    const ppu = width / BOUNDS_WIDTH;
    const ox = width / 2;
    const oy = height - insets.bottom - BOUNDS_HALF_UP * ppu;
    const dx = x - this.head.x, dz = z - this.head.z;
    const r = dx * RIGHT[0] + y * RIGHT[1] + dz * RIGHT[2];
    const u = dx * UP[0] + y * UP[1] + dz * UP[2];
    return [ox + r * ppu, oy - u * ppu];
  }

  render() {
    const { ctx, width, height, theme, palette } = this.host;
    drawSceneBackground(ctx, width, height, theme);

    // The path: columns 20 deep, painted back to front.
    const columns = this.path.tiles.map((t) => ({ f: t.f, y: -RISE_OFFSET * (1 - easeOutCubic(t.rise)), tile: t }));
    if (this.path.baseActive) columns.push({ f: this.path.base(), y: 0 });
    // A cube whose block is still rising is below the path's surface: it is painted with its own
    // block, so the blocks in front cover it (in the app, the depth buffer does this).
    const rising = new Map(this.pickups.filter((p) => p.tile.rise < 1).map((p) => [p.tile, p]));
    for (const c of paintersOrder(columns)) {
      this._drawColumn(c.f, c.y);
      if (c.tile && rising.has(c.tile)) this._drawPickup(rising.get(c.tile));
    }

    // Shadows of the cubes and the snake on the block tops, clipped to them.
    ctx.save();
    ctx.beginPath();
    for (const c of columns) {
      if (c.y < -0.001) continue;
      const p = [[c.f.minX, c.f.minZ], [c.f.maxX, c.f.minZ], [c.f.maxX, c.f.maxZ], [c.f.minX, c.f.maxZ]].map(([x, z]) => this._project(x, 0, z));
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
    }
    ctx.clip();
    // Every caster's outline projected along the light onto the ground, all in one path so that
    // overlapping shadows do not darken twice: a lit face in shadow is multiplied by SHADOW_DARKEN.
    ctx.beginPath();
    for (const p of this.pickups) if (p.tile.rise >= 1) this._shadowOf(this._pickupVerts(p));
    for (const f of this.followers) if (f.grow > 0.001) this._shadowOf(this._meshVerts(MESH[f.kind], f.x, 0, f.z, f.yaw, f.grow));
    this._shadowOf(this._meshVerts(MESH.head, this.head.x, 0, this.head.z, this.head.yaw, 1));
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - SHADOW_DARKEN})`;
    ctx.fill('nonzero');
    ctx.restore();

    // The snake and the cubes, farther first.
    const things = [];
    for (const p of this.pickups) if (p.tile.rise >= 1) things.push({ depth: depthOf(centerX(p.tile.f), this._pickupY(p), centerZ(p.tile.f)), draw: () => this._drawPickup(p) });
    for (const f of this.followers) things.push({ depth: depthOf(f.x - Math.sin(f.yaw) * 0.13, 0.13, f.z - Math.cos(f.yaw) * 0.13), draw: () => this._drawMesh(MESH[f.kind], f.x, 0, f.z, f.yaw, f.grow, palette[0], true) });
    things.push({ depth: depthOf(this.head.x + Math.sin(this.head.yaw) * 0.2, 0.15, this.head.z + Math.cos(this.head.yaw) * 0.2), draw: () => this._drawMesh(MESH.head, this.head.x, 0, this.head.z, this.head.yaw, 1, palette[0], false) });
    things.sort((a, b) => b.depth - a.depth);
    for (const t of things) t.draw();
  }

  _drawColumn(f, top) {
    const { ctx } = this.host;
    const P = (x, y, z) => this._project(x, y, z);
    const bottom = top - TILE_DEPTH;
    const faces = [
      [[P(f.minX, top, f.minZ), P(f.maxX, top, f.minZ), P(f.maxX, top, f.maxZ), P(f.minX, top, f.maxZ)], faceTone(0, 1, 0)],
      [[P(f.minX, bottom, f.minZ), P(f.maxX, bottom, f.minZ), P(f.maxX, top, f.minZ), P(f.minX, top, f.minZ)], faceTone(0, 0, -1)],
      [[P(f.maxX, bottom, f.minZ), P(f.maxX, bottom, f.maxZ), P(f.maxX, top, f.maxZ), P(f.maxX, top, f.minZ)], faceTone(1, 0, 0)],
    ];
    for (const [pts, k] of faces) {
      ctx.fillStyle = scale(PATH_COLOR, k);
      poly(ctx, pts);
      ctx.fill();
      // A hairline of the same colour hides the seams between neighbouring faces.
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  /** Adds to the current path the outline (convex hull) of `verts` dropped along the light onto y = 0. */
  _shadowOf(verts) {
    const pts = convexHull(verts.map(([x, y, z]) => this._project(x + y * SHADOW_RUN, 0, z + y * SHADOW_RUN)));
    if (pts.length < 3) return;
    const { ctx } = this.host;
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  /** Above its block, which may still be rising: the cube comes up with it (Zzznake_BodyPickup.ApplyWorldPose). */
  _pickupY(p) {
    const blockTop = -RISE_OFFSET * (1 - easeOutCubic(p.tile.rise));
    return blockTop + p.float + Math.sin(this.time * BOB_SPEED + p.phase) * BOB_AMP + PICKUP_SIZE / 2;
  }

  _pickupSpin(p) {
    return (this.time * SPIN_DEG * Math.PI) / 180 + p.phase;
  }

  /** The cube's eight corners: index = ix·4 + iy·2 + iz for the −/+ half on each axis. */
  _pickupVerts(p) {
    const h = PICKUP_SIZE / 2;
    const cx = centerX(p.tile.f), cz = centerZ(p.tile.f), cy = this._pickupY(p);
    const spin = this._pickupSpin(p);
    const s = Math.sin(spin), c = Math.cos(spin);
    const verts = [];
    for (const lx of [-h, h]) for (const ly of [-h, h]) for (const lz of [-h, h]) verts.push([cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c]);
    return verts;
  }

  /** A spinning cube with the Skeep logo on top. */
  _drawPickup(p) {
    const cx = centerX(p.tile.f), cz = centerZ(p.tile.f), cy = this._pickupY(p);
    const verts = this._pickupVerts(p);
    const idx = (ix, iy, iz) => ix * 4 + iy * 2 + iz;
    const faces = [
      [idx(0, 1, 0), idx(1, 1, 0), idx(1, 1, 1), idx(0, 1, 1)],
      [idx(0, 0, 0), idx(1, 0, 0), idx(1, 1, 0), idx(0, 1, 0)],
      [idx(0, 0, 1), idx(1, 0, 1), idx(1, 1, 1), idx(0, 1, 1)],
      [idx(0, 0, 0), idx(0, 0, 1), idx(0, 1, 1), idx(0, 1, 0)],
      [idx(1, 0, 0), idx(1, 0, 1), idx(1, 1, 1), idx(1, 1, 0)],
    ];
    this._drawFaces(verts, faces, [cx, cy, cz], this.host.palette[0], 1);
    // The logo, flat on the top face (corners −x−z, +x−z, −x+z of the top).
    this._drawLogo([verts[idx(0, 1, 0)], verts[idx(1, 1, 0)], verts[idx(0, 1, 1)]], LOGO_FACE);
  }

  /** A mesh of znake.fbx placed at (x, y, z), facing yaw, scaled by its pop-in. */
  _meshVerts(mesh, x, y, z, yaw, scaleK) {
    const k = easeOutBack(scaleK);
    const s = Math.sin(yaw), c = Math.cos(yaw);
    return mesh.v.map(([lx, ly, lz]) => [x + (lx * c + lz * s) * k, y + ly * k, z + (-lx * s + lz * c) * k]);
  }

  /** A mesh of znake.fbx at (x, y, z) facing yaw; bodies carry the logo on top. */
  _drawMesh(mesh, x, y, z, yaw, scaleK, color, logo) {
    if (scaleK <= 0.001) return;
    const k = easeOutBack(scaleK);
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const verts = this._meshVerts(mesh, x, y, z, yaw, scaleK);
    const center = verts.reduce((a, v) => [a[0] + v[0] / verts.length, a[1] + v[1] / verts.length, a[2] + v[2] / verts.length], [0, 0, 0]);
    this._drawFaces(verts, mesh.f, center, color, 1);
    if (logo && mesh === MESH.body) {
      const h = 0.1328 * k, top = 0.2656 * k, back = -0.2656 * k;
      const W = (lx, lz) => [x + lx * c + lz * s, y + top + 0.001, z - lx * s + lz * c];
      this._drawLogo([W(-h, back), W(h, back), W(-h, 0)], LOGO_FACE);
    }
  }

  /** Front-facing faces of a closed mesh, back to front, lit like the app. */
  _drawFaces(verts, faces, center, color, alpha) {
    const { ctx } = this.host;
    const list = [];
    for (const f of faces) {
      const a = verts[f[0]], b = verts[f[1]], d = verts[f[2]];
      let n = cross(sub(b, a), sub(d, a));
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / len, n[1] / len, n[2] / len];
      const fc = f.reduce((acc, i) => [acc[0] + verts[i][0] / f.length, acc[1] + verts[i][1] / f.length, acc[2] + verts[i][2] / f.length], [0, 0, 0]);
      // Outward from the mesh's middle, whatever the file's winding.
      if (dot(n, sub(fc, center)) < 0) n = [-n[0], -n[1], -n[2]];
      if (dot(n, FORWARD) >= 0) continue;
      list.push({ f, n, depth: depthOf(fc[0], fc[1], fc[2]) });
    }
    list.sort((p, q) => q.depth - p.depth);
    ctx.globalAlpha = alpha;
    for (const { f, n } of list) {
      ctx.fillStyle = scale(color, faceTone(n[0], n[1], n[2]));
      poly(ctx, f.map((i) => this._project(verts[i][0], verts[i][1], verts[i][2])));
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** The logo on a flat face given by three corners (origin, +u edge, +v edge), at `ratio` of its size. */
  _drawLogo([o, a, b], ratio) {
    if (!this.logo) return;
    const { ctx, dpr } = this.host;
    const [ox, oy] = this._project(...o), [ax, ay] = this._project(...a), [bx, by] = this._project(...b);
    const m = (1 - ratio) / 2;
    ctx.save();
    ctx.setTransform(dpr * (ax - ox), dpr * (ay - oy), dpr * (bx - ox), dpr * (by - oy), dpr * ox, dpr * oy);
    ctx.drawImage(this.logo, m, m, ratio, ratio);
    ctx.restore();
  }
}

// ── Helpers ──

function newFollower(kind, initial) {
  return { kind, x: 0, z: 0, yaw: 0, legYaw: 0, turnFrom: 0, turnTo: 0, turnT: 1, distance: 0, grow: initial ? 1 : 0 };
}

const dirOf = (negX) => (negX ? [-1, 0] : [0, 1]);
const yawOf = (negX) => (negX ? -Math.PI / 2 : 0);
const yawOfDir = (dx, dz) => Math.atan2(dx, dz);
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const lerpAngle = (a, b, t) => a + angleDiff(a, b) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
function easeOutBack(t) {
  if (t >= 1) return 1;
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
const centerX = (f) => (f.minX + f.maxX) / 2;
const centerZ = (f) => (f.minZ + f.maxZ) / 2;
const depthOf = (x, y, z) => x * FORWARD[0] + y * FORWARD[1] + z * FORWARD[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Painter's order for the path's columns (all topped at y ≤ 0): the camera looks down from the +x,
 * -z side, so smaller x and larger z go first; a rising column is lower and goes first too.
 */
function before(a, b) {
  if (a.f.maxX <= b.f.minX + 1e-4) return true;
  if (b.f.maxX <= a.f.minX + 1e-4) return false;
  if (a.f.minZ >= b.f.maxZ - 1e-4) return true;
  if (b.f.minZ >= a.f.maxZ - 1e-4) return false;
  return a.y < b.y;
}

/** Monotone-chain convex hull of 2D points, counter-clockwise on screen. */
function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function scale(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(Math.min(255, v * k));
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

/** The white logo sprite in one colour. */
function tint(img, color) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const t = c.getContext('2d');
  t.drawImage(img, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = color;
  t.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Topological order of the "before" relation (a plain sort needs a consistent comparator). */
function paintersOrder(items) {
  const n = items.length;
  const after = items.map(() => []);
  const pending = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (before(items[i], items[j])) { after[i].push(j); pending[j]++; } else { after[j].push(i); pending[i]++; }
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
  if (order.length < n) for (let i = 0; i < n; i++) if (pending[i] > 0) order.push(items[i]);
  return order;
}
