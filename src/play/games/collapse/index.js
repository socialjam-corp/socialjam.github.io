// Collapse ("Traffic Jam"): change lanes to dodge the traffic until the finish line. Single-player
// port of CollapseRoadLineSimulator (speed ramp, finish approach), CollapseRoad (lanes, separators),
// CollapsePlayer (lane spring, tilt, tap / swipe / hold), CollapseEnemySpawner and CollapseEnemy
// (spawn lanes, convoys, overtakes, motorbikes that flee, close-pass flashes) and
// Collapse_SceneManager (first input, crash, finish), drawn on a canvas with the scene's camera.
// The vehicles are the sprite sheet (collapse_vehicle_sprites.png) redrawn as shapes.

import { drawPlainBackground } from '../../features/background.js';

// Collapse_Scene: CameraBounds 12 wide, fitted to the content width and centred on it; the scenario
// (road, separators) is 12 × 16 around the origin and the player's rear sits on its bottom edge.
const VIEW_WIDTH = 12;
const SCENARIO_H = 16;
const PLAYER_BASELINE = -SCENARIO_H / 2;
const MAX_DT = 0.05;
// Separators: 0.1 wide, a 30:1 texture (one dash, a third of it, per 3 world units) scrolled with
// the camera; content-secondary at 5% in dark mode (RoadLineSeparatorAlphaDark).
const SEPARATOR_W = 0.1;
const DASH_PERIOD = 3;
const DASH_FRACTION = 1 / 3;
const SEPARATOR_ALPHA = 0.05;
// CollapseRoadLineSimulator
const DECEL_S = 1.75;             // CinematicDecelDuration (the shortest braking)
const FINISH_H = 1.28;            // FinishLineTiledHeightWorld
const FINISH_TILE = 0.64;         // collapse_finishLine.png: 64 px at 100 px/unit, a 2 × 2 checker
const FINISH_GAP_PHASE = -0.33;   // _finishLineRoadGapAlignPhaseOffset
const SPAWN_STOP_LEAD = { slowV: 5, fastV: 40, slow: 3, fast: 1 };
// CollapsePlayer
// Player.prefab's values (the script's defaults are 18, 220, 18, 1.6 and 22).
const MAX_LATERAL = 20, STIFFNESS = 310, DAMPING = 18;
const TILT_PER_SPEED = 0.6, MAX_TILT = 12;
const HOLD_S = 0.12, HOLD_MAX_SPEED = 650, HOLD_HYSTERESIS = 0.15;
const HOLD_SAMPLE_S = 0.06;       // Collapse_SceneManager.LaneHoldSpeedSampleSeconds
// InputService, in device pixels.
const TAP_MAX_S = 0.25, TAP_MAX_MOVE = 30, DRAG_START_MOVE = 24, SWIPE_MIN = 40, SWIPE_MIN_SPEED = 650;
// CollapseEnemySpawner
const SPAWN_INTERVAL = 0.52, SPAWN_JITTER = 0.22, MIN_INTERVAL = 0.2;
const FIRST_SPAWN_S = 0.35;
const PLAYER_LANE_ROLL = 0.3;     // above this roll the player's lane is preferred
const RETRY_S = 0.12;
const ABOVE_MARGIN = 1.15;
const MIN_GAP_H = 1.5, STACK_EXTRA_H = 0.45, STRIPE_PAD_H = 0.55;
const FOLLOW_GAP_H = 0.65, FOLLOW_BOOST = 0.32, EMERGENCY_SUB = 0.18;
const OVERTAKE_MIN_DIST = 3.2, OVERTAKE_MIN_SELF = 0.35;
const MOTO_TAILGATE_H = 0.9, MOTO_FLEE_MIN_DIST = 4.65, MOTO_FLEE_BLOCK_DX = 1.22;
const DEST_GAP_EXTRA_H = 0.12, LANE_CHANGE_PAD_H = 0.48, MOTO_FLEE_PAD_H = 0.55, STABLE_PICK_DY_H = 0.85;
const LIGHTS_CHANCE = 0.5, LIGHTS_MAX_GAP = 1.35;
// CollapseEnemy
const LANE_LERP_S = 0.18;
const FLASH_COUNT = 3, FLASH_ON_S = 0.16, FLASH_OFF_S = 0.14, FLASH_ALPHA = 0.5;
const BEAM_ALPHA = 0.25;
const WIN_RISE_FALLBACK = 5.5;

/**
 * The prefabs, in their own units (100 px per unit) with the root on the rear of the body: the
 * BoxCollider2D (centre and size), the share of a lane its collider is scaled to, the speed share
 * (_selfVelocity) and the lane-change tuning. The sprite children are drawn by drawVehicle.
 */
const PLAYER = { collider: { x: -0.0105, y: 2.2347, w: 1.8664, h: 3.8122 }, fraction: 0.6, pivotY: 4.24 };
const ENEMIES = {
  car: {
    weight: 0.75, self: 0.6, fraction: 0.6, overtake: true, flees: false, cooldown: 0.25, bypass: 0.5,
    fleeCooldown: 0.25, approach: 5, nose: 4.437, collider: { x: -0.0051, y: 2.2504, w: 1.8253, h: 3.8605 },
  },
  moto: {
    weight: 0.2, self: 1, fraction: 0.2, overtake: true, flees: true, cooldown: 0.25, bypass: 0.5,
    fleeCooldown: 0.25, approach: 5, nose: 2.699, collider: { x: 0, y: 1.15, w: 0.6, h: 2.3 },
  },
  truck: {
    weight: 0.05, self: 0.3, fraction: 0.75, overtake: false, flees: false, cooldown: 1.35, bypass: 1.15,
    fleeCooldown: 2.2, approach: 5, nose: 7.557, collider: { x: 0, y: 3.6, w: 3.3, h: 7.2 },
  },
};

export default {
  // Collapse_Loc: GAME_TITLE, GAME_DESCRIPTION, GAME_DESCRIPTION_SP, GAME_START_HINT.
  text: {
    ca: {
      title: 'Col·lapse',
      description: 'Esquiva el trànsit: toca els costats del cotxe per canviar de carril. / Un toc o una lliscada et canvia de carril.',
      descriptionSp: 'Arriba a la línia de meta del nivell.',
      startHint: 'Prem un carril per girar',
    },
    en: {
      title: 'Traffic Jam',
      description: 'Dodge the traffic: tap either side of the car to change lanes. / A tap or a swipe switches lanes.',
      descriptionSp: 'Reach the finish line of the level.',
      startHint: 'Tap a lane to steer',
    },
    es: {
      title: 'Hora punta',
      description: 'Esquiva el tráfico: toca los lados del coche para cambiar de carril. / Un toque o un deslizamiento te cambia de carril.',
      descriptionSp: 'Llega a la línea de meta del nivel.',
      startHint: 'Pulsa un carril para girar',
    },
  },

  levels: () => fetch(new URL('./levels.json', import.meta.url)).then((r) => {
    if (!r.ok) throw new Error(`levels.json: ${r.status}`);
    return r.json();
  }),

  create: (host) => new Collapse(host),
};

// Collapse_SceneManager.startHintScreenHeight01: the hint's height from the bottom of the screen.
const HINT_HEIGHT = 0.55;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => t * t * (3 - 2 * t);
const frac = (v) => v - Math.floor(v);
const moveTowards = (v, target, step) => (Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step);

class Collapse {
  constructor(host) {
    this.host = host;
    this.enemies = [];
    // Cars past the app's cull line: gone from the traffic logic, still drawn until their beams leave.
    this.leaving = [];
    this.waiting = true;
    this.running = false;
    this.ended = false;
    this.won = false;
    this.time = 0;
    this.touch = null;
    this.ids = 0;
  }

  // ── Lifecycle ──

  load(level) {
    this.level = level;
    this.lanes = Math.max(1, level.laneCount | 0);
    this.laneW = VIEW_WIDTH / this.lanes;
    // Collapse_LevelData: on 5 lanes the threshold is capped so the road never fills up.
    const threshold = this.lanes <= 5 ? Math.min(level.enemyThreshold, 0.5) : level.enemyThreshold;
    const scale = Math.max(0.05, lerp(2.35, 0.82, clamp01(threshold)));
    this.spawnInterval = Math.max(MIN_INTERVAL, SPAWN_INTERVAL * scale);
    this.spawnJitter = SPAWN_JITTER * scale;
    this.enemyVelocity = clamp01(level.enemyVelocity);
    this.nextSpawn = FIRST_SPAWN_S;

    this.sim = {
      phase: 'running', runTime: 0, cinematicT: 0, levelV: 0, cameraV: 0, scroll: 0, finishY: null,
    };

    const lane = Math.floor((this.lanes - 1) / 2);
    this.player = {
      lane, x: this._laneX(lane), y: PLAYER_BASELINE, vx: 0, tilt: 0, targetX: this._laneX(lane),
      k: (this.laneW * PLAYER.fraction) / PLAYER.collider.w, holding: false, winRise: 0, lastVy: 0,
    };

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.logo = tint(img, this.host.theme.surfaceMain); resolve(); };
      img.onerror = () => resolve();
      img.src = new URL('../../img/logo.png', import.meta.url).href;
    });
  }

  start() {
    const h = this.host;
    h.showStartHint(h.text.startHint, () => ({ y: h.height * (1 - HINT_HEIGHT), align: 'center' }));
  }

  pause() {}
  resume() {}
  resize() {}
  destroy() {}

  // ── Input (CollapsePlayer, Collapse_SceneManager's lane hold) ──

  pointerDown(p) {
    if (this.ended || this.touch) return;
    this.touch = { id: p.id, x0: p.x, y0: p.y, x: p.x, y: p.y, t0: this.time, sampleT: this.time, sampleX: p.x, speed: 0 };
  }

  pointerMove(p) {
    const t = this.touch;
    if (!t || t.id !== p.id) return;
    t.x = p.x;
    t.y = p.y;
  }

  pointerUp(p) {
    const t = this.touch;
    if (!t || t.id !== p.id) return;
    this.touch = null;
    if (this.ended) return;
    // A hold owns the whole gesture: letting go only ends it.
    if (this.player.holding) {
      this.player.holding = false;
      return;
    }
    const held = this.time - t.t0;
    const dxDev = (t.x - t.x0) * (window.devicePixelRatio || 1);
    const dyDev = (t.y - t.y0) * (window.devicePixelRatio || 1);
    const moved = Math.hypot(dxDev, dyDev);
    if (Math.abs(dxDev) >= SWIPE_MIN && Math.abs(dxDev) > Math.abs(dyDev) && moved / Math.max(held, 1e-3) >= SWIPE_MIN_SPEED) {
      this._action();
      this._bump(dxDev < 0 ? -1 : 1);
    } else if (held <= TAP_MAX_S && moved <= TAP_MAX_MOVE) {
      this._action();
      // Left or right of the car's collider centre.
      this._bump(this._worldX(t.x) < this.player.x + PLAYER.collider.x * this.player.k ? -1 : 1);
    }
  }

  /** The first gameplay input starts the run and dismisses the hint (GameAction). */
  _action() {
    if (!this.waiting) return;
    this.waiting = false;
    this.running = true;
    this.host.dismissStartHint();
  }

  _tickTouch(dt) {
    const t = this.touch;
    if (!t || this.ended) return;
    const dpr = window.devicePixelRatio || 1;
    // Finger speed over short spans: two frames in a row may not bring a new position.
    if (this.time - t.sampleT >= HOLD_SAMPLE_S) {
      t.speed = (Math.abs(t.x - t.sampleX) * dpr) / (this.time - t.sampleT);
      t.sampleX = t.x;
      t.sampleT = this.time;
    }
    const p = this.player;
    if (!p.holding) {
      const held = this.time - t.t0;
      const moved = Math.abs(t.x - t.x0) * dpr;
      // A still finger is still a tap until TapMaxDuration: before that the hold only starts if it
      // has already moved too far to be one.
      const couldBeTap = held <= TAP_MAX_S && moved < Math.min(TAP_MAX_MOVE, DRAG_START_MOVE);
      if (held < HOLD_S || t.speed >= HOLD_MAX_SPEED || couldBeTap) return;
      p.holding = true;
      this._action();
    }
    this._steerTo(this._worldX(t.x));
  }

  _steerTo(x) {
    const p = this.player;
    let nearest = p.lane, best = Infinity;
    for (let i = 0; i < this.lanes; i++) {
      const d = Math.abs(this._laneX(i) - x);
      if (d < best) { best = d; nearest = i; }
    }
    if (nearest === p.lane) return;
    if (Math.abs(this._laneX(p.lane) - x) <= this.laneW * (0.5 + HOLD_HYSTERESIS)) return;
    this._setLane(nearest);
  }

  _bump(delta) {
    this._setLane(Math.max(0, Math.min(this.lanes - 1, this.player.lane + delta)));
  }

  _setLane(lane) {
    const p = this.player;
    if (lane === p.lane || this.ended) return;
    p.lane = lane;
    p.targetX = this._laneX(lane);
  }

  // ── Tick ──

  update(rawDt) {
    const dt = Math.min(rawDt, MAX_DT);
    this.time += dt;
    this._tickTouch(dt);
    if (this.waiting || (this.ended && !this.won)) return;
    if (this.running) this._tickSim(dt);
    this._tickPlayer(dt);
    for (const e of this.enemies) this._tickEnemy(e, dt);
    for (const e of this.leaving) e.y += e.lastVy * dt;
    this._cull();
    if (this.running) {
      this._resolveConvoys();
      this._tailgateFlee();
      this._overtakes();
      this._spawn();
      this._closePassFlashes();
      this._checkFinish();
      this._checkCrash();
    }
  }

  // ── The road (CollapseRoadLineSimulator) ──

  _tickSim(dt) {
    const s = this.sim;
    const l = this.level;
    if (s.phase === 'running') {
      const next = s.runTime + dt;
      if (next >= l.duration) {
        const toEnd = Math.max(0, l.duration - s.runTime);
        const vMid = lerp(l.initialSpeed, l.finalSpeed, clamp01((s.runTime + toEnd * 0.5) / l.duration));
        this._step(vMid, vMid, toEnd);
        s.runTime = l.duration;
        this._beginApproach();
        if (dt - toEnd > 0) this._tickSim(dt - toEnd);
        return;
      }
      s.runTime = next;
      const v = lerp(l.initialSpeed, l.finalSpeed, clamp01(s.runTime / l.duration));
      this._step(v, v, dt);
    } else if (s.phase === 'approach') {
      // The camera brakes to a stop while the level keeps its final speed, so the traffic and the
      // player drive on up the screen.
      s.cinematicT += dt;
      const decel = 1 - smoothstep(clamp01(s.cinematicT / s.decelS));
      const cameraV = l.finalSpeed * decel;
      this._step(l.finalSpeed, cameraV, dt);
      if (decel < 0.04 || (s.cinematicT > s.decelS * 1.35 && decel < 0.08)) {
        s.phase = 'wait';
        s.levelV = l.finalSpeed;
        s.cameraV = 0;
      }
    } else if (s.phase === 'wait') {
      this._step(l.finalSpeed, 0, dt);
    } else {
      s.levelV = 0;
      s.cameraV = 0;
    }
  }

  _step(levelV, cameraV, dt) {
    const s = this.sim;
    s.levelV = Math.max(0, levelV);
    s.cameraV = Math.max(0, cameraV);
    if (dt <= 0 || s.cameraV <= 0) return;
    s.scroll += s.cameraV * dt;
    if (s.finishY !== null) s.finishY -= s.cameraV * dt;
  }

  /**
   * SpawnFinishLineForApproach: the line starts where the braking camera brings it to the centre of
   * the content (the braking covers half of vEnd × T), moved onto the middle of a gap between dashes.
   * Unlike the app, it never starts on screen: on slow levels vEnd × 1.75 / 2 is inside the view and
   * the line popped in. It starts past the top edge instead, and the braking lasts long enough
   * (T = 2 × distance / vEnd) to still stop it at the centre.
   */
  _beginApproach() {
    const s = this.sim;
    const vEnd = Math.max(0.1, this.level.finalSpeed);
    s.phase = 'approach';
    s.cinematicT = 0;
    const f0 = Math.max(vEnd * DECEL_S * 0.5, this._canvasTopWorld() + FINISH_H / 2);
    const phi = frac((f0 + SCENARIO_H / 2 + s.scroll) / DASH_PERIOD);
    const target = frac(DASH_FRACTION + (1 - DASH_FRACTION) * 0.5 + FINISH_GAP_PHASE);
    // Onto the gap by moving up only, so it stays off screen.
    s.finishY = f0 + frac(target - phi) * DASH_PERIOD;
    s.decelS = (2 * s.finishY) / vEnd;
  }

  get _stopSpawning() {
    const s = this.sim;
    if (s.phase !== 'running') return true;
    const v = Math.max(0, s.levelV);
    const t = clamp01((v - SPAWN_STOP_LEAD.slowV) / (SPAWN_STOP_LEAD.fastV - SPAWN_STOP_LEAD.slowV));
    return this.level.duration - s.runTime <= lerp(SPAWN_STOP_LEAD.slow, SPAWN_STOP_LEAD.fast, t);
  }

  // ── The player (CollapsePlayer) ──

  _tickPlayer(dt) {
    const p = this.player;
    if (this.won) {
      p.y += p.winRise * dt;
      return;
    }
    const vy = this.sim.levelV - this.sim.cameraV;
    p.lastVy = vy;
    p.y += vy * dt;
    // A spring towards the lane, capped.
    const ax = STIFFNESS * (p.targetX - p.x) - DAMPING * p.vx;
    p.vx = Math.max(-MAX_LATERAL, Math.min(MAX_LATERAL, p.vx + ax * dt));
    p.x += p.vx * dt;
    if (Math.abs(p.targetX - p.x) < 0.001 && Math.abs(p.vx) < 0.05) {
      p.x = p.targetX;
      p.vx = 0;
    }
    p.tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, -p.vx * TILT_PER_SPEED));
  }

  /** NotifyPlayerForFinishCross: the player's root (its rear) passes the line's centre. */
  _checkFinish() {
    const s = this.sim;
    if (s.phase !== 'wait' || this.player.y <= s.finishY) return;
    s.phase = 'done';
    s.levelV = 0;
    s.cameraV = 0;
    this.ended = true;
    this.won = true;
    this.running = false;
    this.touch = null;
    // BeginWinExit: everyone keeps rising at the speed they had (the player at the level's speed).
    const p = this.player;
    p.winRise = Math.max(0.25, Math.abs(p.lastVy) > 1e-5 ? p.lastVy : WIN_RISE_FALLBACK);
    for (const e of this.enemies) {
      e.winExit = true;
      e.winRise = Math.max(0.25, Math.abs(e.lastVy) > 1e-5 ? e.lastVy : WIN_RISE_FALLBACK);
      e.phase = 'none';
    }
    this.host.finish(true);
  }

  /** TryDetectPlayerEnemyCollisionAndLose: any collider overlap ends the run on the spot. */
  _checkCrash() {
    if (this.ended) return;
    const pb = this._playerBounds();
    for (const e of this.enemies) {
      if (e.winExit) continue;
      const b = this._bounds(e);
      if (pb.x0 < b.x1 && b.x0 < pb.x1 && pb.y0 < b.y1 && b.y0 < pb.y1) {
        this.ended = true;
        this.running = false;
        this.touch = null;
        this.player.holding = false;
        this.host.finish(false);
        return;
      }
    }
  }

  // ── The traffic (CollapseEnemy) ──

  _tickEnemy(e, dt) {
    if (e.winExit) {
      e.y += e.winRise * dt;
      return;
    }
    e.self = moveTowards(e.self, e.target, Math.max(0.05, e.def.approach) * dt);
    const vy = -this.sim.cameraV + this.sim.levelV * this.enemyVelocity * clamp01(e.self);
    e.lastVy = vy;
    e.y += vy * dt;
    if (e.phase === 'lerp') {
      e.lerpT += dt / LANE_LERP_S;
      const k = clamp01(e.lerpT);
      e.x = lerp(e.fromX, this._laneX(e.toLane), k);
      if (k >= 1) {
        e.lane = e.toLane;
        e.x = this._laneX(e.lane);
        e.phase = 'cooldown';
        e.cooldown = Math.max(0.15, e.def.cooldown);
        e.bypassUntil = this.time + e.def.bypass;
      }
    } else if (e.phase === 'cooldown') {
      e.cooldown -= dt;
      if (e.cooldown <= 0) e.phase = 'none';
    }
    if (e.flash >= 0) {
      e.flash += dt;
      if (e.flash >= FLASH_COUNT * FLASH_ON_S + (FLASH_COUNT - 1) * FLASH_OFF_S) e.flash = -1;
    }
  }

  /**
   * TryCullBelowViewport: a car whose collider has left the bottom of the content is gone. Its
   * headlights reach far ahead of it, so it is still drawn, driving on, until the beam's tip has left
   * the canvas too (in the app the beam vanished with the car).
   */
  _cull() {
    const contentBottom = this._contentBottomWorld();
    for (const e of this.enemies) {
      if (e.winExit || this._bounds(e).y1 >= contentBottom) continue;
      e.flash = -1;
      this.leaving.push(e);
    }
    this.enemies = this.enemies.filter((e) => this.leaving.indexOf(e) < 0);
    const bottom = this._canvasBottomWorld();
    this.leaving = this.leaving.filter((e) => e.y + beamTip(e.kind) * e.k >= bottom);
  }

  _convoyLane(e) { return e.phase === 'lerp' ? e.toLane : e.lane; }

  _canEvaluateOvertake(e) { return !e.winExit && e.phase === 'none'; }

  /** ResolveLaneFollowVelocities: a faster car closing on the one ahead in its lane slows to keep the gap. */
  _resolveConvoys() {
    for (const e of this.enemies) if (!e.winExit) e.target = e.def.self;
    const playerH = this._playerBounds().h;
    const safeGap = Math.max(0.05, FOLLOW_GAP_H * playerH);
    for (let lane = 0; lane < this.lanes; lane++) {
      const order = this._laneOrder((e) => this._convoyLane(e) === lane);
      if (order.length <= 1) continue;
      let aheadV = order[order.length - 1].def.self;
      order[order.length - 1].target = aheadV;
      for (let i = order.length - 2; i >= 0; i--) {
        const rear = order[i], ahead = order[i + 1];
        if (this.time < rear.bypassUntil) {
          rear.target = rear.def.self;
          aheadV = rear.target;
          continue;
        }
        const gap = this._bounds(ahead).y0 - this._bounds(rear).y1;
        let eff = rear.def.self;
        if (gap < safeGap) {
          let urgency = clamp01((safeGap - gap) / safeGap);
          if (gap < 0) urgency = clamp01(Math.max(urgency, Math.abs(gap) / playerH));
          let ceiling = clamp01(aheadV - urgency * FOLLOW_BOOST);
          if (gap < 0) ceiling = Math.min(ceiling, clamp01(aheadV - EMERGENCY_SUB));
          eff = Math.min(eff, ceiling);
        }
        rear.target = eff;
        aheadV = eff;
      }
    }
  }

  /** EvaluatePlayerTailgateFleeFromBehind: a motorbike the player sits right behind speeds up or moves over. */
  _tailgateFlee() {
    if (this.sim.finishY !== null || this.lanes < 2) return;
    const pb = this._playerBounds();
    const playerH = pb.h;
    const stripe = this._stripe(pb);
    const minGap = Math.max(0.05, MIN_GAP_H * playerH) + DEST_GAP_EXTRA_H * playerH;
    const denom = this.sim.levelV * Math.max(1e-5, this.enemyVelocity);
    // The share that matches the player's road speed (PlayerWorldVelocityY + CameraVelocity).
    const idealSelf = denom > 0.05 ? clamp01(this.sim.levelV / denom) : 1;
    const playerLane = this.player.lane;
    for (const e of this.enemies) {
      if (e.winExit || !e.def.flees || !e.def.overtake) continue;
      if (!this._canEvaluateOvertake(e) || this.time < e.fleeUntil) continue;
      if (e.lane !== playerLane) continue;
      const eb = this._bounds(e);
      const gapBehind = eb.y0 - pb.y1;
      if (gapBehind < 0 || gapBehind > Math.max(0.05, MOTO_TAILGATE_H * playerH)) continue;
      const prev = e.target;
      const merged = Math.max(prev, idealSelf);
      e.target = merged;
      const minDist = Math.max(OVERTAKE_MIN_DIST, MOTO_FLEE_MIN_DIST);
      const tooClose = verticallyClose(pb, eb, playerH, Math.max(LANE_CHANGE_PAD_H, MOTO_FLEE_PAD_H));
      const tight = Math.abs(eb.cx - pb.cx) <= MOTO_FLEE_BLOCK_DX;
      const allow = !tooClose && !tight && Math.hypot(eb.cx - pb.cx, eb.cy - pb.cy) >= minDist;
      const from = e.lane;
      const okLeft = from > 0 && this._destinationValid(e, from, from - 1, stripe, minGap);
      const okRight = from < this.lanes - 1 && this._destinationValid(e, from, from + 1, stripe, minGap);
      const delicate = verticallyClose(pb, eb, playerH, LANE_CHANGE_PAD_H);
      const dest = this._fleeLane(from, playerLane, okLeft, okRight, delicate, pb.cx);
      const moved = allow && dest >= 0 && this._beginLaneChange(e, dest);
      if (moved || merged > prev + 1e-5) e.fleeUntil = this.time + Math.max(0.25, e.def.fleeCooldown);
    }
  }

  _fleeLane(from, playerLane, okLeft, okRight, stable, playerX) {
    if (okLeft && okRight) {
      const left = from - 1, right = from + 1;
      const leftAway = left !== playerLane, rightAway = right !== playerLane;
      if (leftAway && !rightAway) return left;
      if (!leftAway && rightAway) return right;
      if (leftAway && rightAway && stable) return this._fartherFrom(left, right, playerX);
      return Math.random() < 0.5 ? left : right;
    }
    if (okLeft) return from - 1;
    return okRight ? from + 1 : -1;
  }

  _fartherFrom(left, right, x) {
    return Math.abs(this._laneX(left) - x) >= Math.abs(this._laneX(right) - x) ? left : right;
  }

  /** EvaluateOvertakeOpportunities: a car with a slower one next to it in its lane may switch lanes. */
  _overtakes() {
    if (this.sim.finishY !== null || this.lanes < 2) return;
    const pb = this._playerBounds();
    const playerH = pb.h;
    const stripe = this._stripe(pb);
    const minGap = Math.max(0.05, MIN_GAP_H * playerH) + DEST_GAP_EXTRA_H * playerH;
    for (const e of this.enemies) {
      if (e.winExit || !e.def.overtake || e.def.self < OVERTAKE_MIN_SELF || !this._canEvaluateOvertake(e)) continue;
      // TryGetLeaderAheadInLane: the neighbour just below it in the lane (lower centre).
      const order = this._laneOrder((x) => x.lane === e.lane);
      const i = order.indexOf(e);
      if (i <= 0 || !(order[i - 1].def.self + 1e-4 < e.def.self)) continue;
      const eb = this._bounds(e);
      if (Math.hypot(pb.cx - eb.cx, pb.cy - eb.cy) < OVERTAKE_MIN_DIST) continue;
      if (verticallyClose(pb, eb, playerH, LANE_CHANGE_PAD_H)) continue;
      const from = e.lane;
      const okLeft = from > 0 && this._destinationValid(e, from, from - 1, stripe, minGap);
      const okRight = from < this.lanes - 1 && this._destinationValid(e, from, from + 1, stripe, minGap);
      let dest = -1;
      if (okLeft && okRight) {
        dest = Math.abs(eb.cy - pb.cy) < playerH * STABLE_PICK_DY_H
          ? this._fartherFrom(from - 1, from + 1, pb.cx)
          : (Math.random() < 0.5 ? from - 1 : from + 1);
      } else if (okLeft) dest = from - 1;
      else if (okRight) dest = from + 1;
      if (dest >= 0) this._beginLaneChange(e, dest);
    }
  }

  _beginLaneChange(e, lane) {
    if (e.winExit || e.phase !== 'none') return false;
    e.toLane = lane;
    e.fromX = e.x;
    e.lerpT = 0;
    e.phase = 'lerp';
    return true;
  }

  /** IsDestinationLaneValid: the move keeps a lane clear beside the player and a gap in the new lane. */
  _destinationValid(mover, from, to, stripe, minGap) {
    let anyClear = false;
    for (let lane = 0; lane < this.lanes && !anyClear; lane++) anyClear = this._laneStaysOpen(lane, mover, from, to, stripe);
    if (!anyClear) return false;
    const mb = this._bounds(mover);
    const low = mb.y0 - minGap, high = mb.y1 + minGap;
    for (const x of this.enemies) {
      if (x === mover || x.winExit || this._convoyLane(x) !== to) continue;
      const b = this._bounds(x);
      if (!(b.y1 <= low || b.y0 >= high)) return false;
    }
    return true;
  }

  _laneStaysOpen(lane, mover, from, to, stripe) {
    if (from === to) return true;
    if (lane !== from && lane !== to) return !this._laneOccupiesStripe(lane, stripe);
    for (const x of this.enemies) {
      if (x === mover || !this._countsOnLane(x, lane)) continue;
      if (overlapsStripe(this._bounds(x), stripe)) return false;
    }
    return lane === from || !overlapsStripe(this._bounds(mover), stripe);
  }

  _countsOnLane(e, lane) {
    if (e.winExit) return false;
    return e.lane === lane || (e.phase === 'lerp' && e.toLane === lane);
  }

  _laneOccupiesStripe(lane, stripe) {
    return this.enemies.some((e) => this._countsOnLane(e, lane) && overlapsStripe(this._bounds(e), stripe));
  }

  /** The band across the road at the player, padded by half a car each way. */
  _stripe(pb) {
    const pad = STRIPE_PAD_H * pb.h;
    return { y0: pb.y0 - pad, y1: pb.y1 + pad };
  }

  _laneOrder(filter) {
    return this.enemies.filter((e) => !e.winExit && filter(e)).sort((a, b) => this._bounds(a).cy - this._bounds(b).cy || a.id - b.id);
  }

  // ── Spawning (CollapseEnemySpawner.TrySpawnOne) ──

  _spawn() {
    if (this._stopSpawning || this.time < this.nextSpawn) return;
    if (this._spawnOne()) {
      const j = this.spawnJitter;
      this.nextSpawn = this.time + Math.max(MIN_INTERVAL, this.spawnInterval + (j > 1e-4 ? (Math.random() * 2 - 1) * j : 0));
    } else {
      this.nextSpawn = this.time + RETRY_S;
    }
  }

  _spawnOne() {
    const pb = this._playerBounds();
    const playerH = pb.h;
    const spawnGap = Math.max(0.05, MIN_GAP_H * playerH) + STACK_EXTRA_H * playerH;
    const stripe = this._stripe(pb);
    const playerLane = this.player.lane;
    // Keep a way through beside the player: with two or more clear lanes only those take a car;
    // with exactly one clear lane, only the occupied ones do.
    const occupied = [];
    for (let l = 0; l < this.lanes; l++) occupied.push(this._laneOccupiesStripe(l, stripe));
    const clear = occupied.filter((o) => !o).length;
    const choices = [];
    for (let l = 0; l < this.lanes; l++) {
      if (this.lanes < 2 || clear === 0 || (clear >= 2 ? !occupied[l] : occupied[l])) choices.push(l);
    }
    if (!choices.length) return false;
    let lane;
    if (choices.length === 1) lane = choices[0];
    else if (this.lanes <= 1 || Math.random() > PLAYER_LANE_ROLL) {
      lane = choices.includes(playerLane) ? playerLane : pick(choices);
    } else {
      const others = choices.filter((l) => l !== playerLane);
      lane = others.length ? pick(others) : pick(choices);
    }

    // Just above the top of the content, stacked above the highest car already in that lane.
    // Never below the canvas' top edge: the header is see-through and the car would pop in under it.
    const floor = Math.max(this._contentTopWorld() + ABOVE_MARGIN, this._canvasTopWorld());
    const ceiling = floor + spawnGap;
    let maxTop = -Infinity;
    for (const e of this.enemies) {
      if (!this._countsOnLane(e, lane)) continue;
      const t = this._bounds(e).y1;
      if (t <= ceiling && t > maxTop) maxTop = t;
    }
    const def = pickWeighted();
    const e = {
      id: ++this.ids, def, kind: def.kind, lane, x: this._laneX(lane), y: floor,
      k: (this.laneW * def.fraction) / def.collider.w, self: def.self, target: def.self, lastVy: 0,
      phase: 'none', toLane: lane, fromX: 0, lerpT: 0, cooldown: 0, bypassUntil: 0, fleeUntil: 0,
      winExit: false, winRise: 0, flash: -1, wasBelow: null, flashChecked: false,
    };
    if (maxTop > -Infinity) {
      const need = maxTop + spawnGap - this._bounds(e).y0;
      if (need > 0) e.y += need;
    }
    const low = this._bounds(e).y0;
    if (low < floor) e.y += floor - low;
    this.enemies.push(e);
    return true;
  }

  /** TryEvaluateOvertakeFeedback: once the player's rear passes a car's nose close by, it may flash its lights. */
  _closePassFlashes() {
    const pb = this._playerBounds();
    const rear = this.player.y;
    for (const e of this.enemies) {
      if (e.winExit) continue;
      const below = rear < e.y + e.def.nose * e.k;
      const was = e.wasBelow === null ? below : e.wasBelow;
      e.wasBelow = below;
      if (!was || below || e.flashChecked) continue;
      if (horizontalGap(pb, this._bounds(e)) > LIGHTS_MAX_GAP) continue;
      e.flashChecked = true;
      if (Math.random() > LIGHTS_CHANCE) continue;
      e.flash = 0;
    }
  }

  // ── Geometry ──

  _laneX(lane) { return -VIEW_WIDTH / 2 + this.laneW * (lane + 0.5); }

  _bounds(e) {
    const c = e.def.collider;
    const cx = e.x + c.x * e.k, cy = e.y + c.y * e.k, hw = (c.w * e.k) / 2, hh = (c.h * e.k) / 2;
    return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh, cx, cy, h: hh * 2 };
  }

  _playerBounds() {
    return this._bounds({ def: PLAYER, x: this.player.x, y: this.player.y, k: this.player.k });
  }

  get _ppu() { return this.host.width / VIEW_WIDTH; }

  get _centreY() {
    const { height, insets } = this.host;
    return insets.top + (height - insets.top - insets.bottom) / 2;
  }

  _sx(x) { return this.host.width / 2 + x * this._ppu; }
  _sy(y) { return this._centreY - y * this._ppu; }
  _worldX(px) { return (px - this.host.width / 2) / this._ppu; }
  _contentTopWorld() { return (this._centreY - this.host.insets.top) / this._ppu; }
  _canvasTopWorld() { return this._centreY / this._ppu; }
  _contentBottomWorld() { return (this._centreY - (this.host.height - this.host.insets.bottom)) / this._ppu; }
  _canvasBottomWorld() { return -(this.host.height - this._centreY) / this._ppu; }

  // ── Drawing ──

  render() {
    const { ctx, width, height, theme, palette } = this.host;
    drawPlainBackground(ctx, width, height, theme);
    const ppu = this._ppu;

    // Separators: dashes scrolling down with the camera, only over the scenario's 16 units.
    ctx.fillStyle = withAlpha(theme.contentSecondary, SEPARATOR_ALPHA);
    const half = SCENARIO_H / 2;
    const first = Math.floor((-half + half + this.sim.scroll) / DASH_PERIOD) - 1;
    for (let i = 1; i < this.lanes; i++) {
      const x = -VIEW_WIDTH / 2 + this.laneW * i;
      ctx.beginPath();
      for (let k = first; ; k++) {
        const y0 = k * DASH_PERIOD - half - this.sim.scroll;
        if (y0 > half) break;
        const lo = Math.max(-half, y0), hi = Math.min(half, y0 + DASH_PERIOD * DASH_FRACTION);
        if (hi <= lo) continue;
        ctx.roundRect(this._sx(x - SEPARATOR_W / 2), this._sy(hi), SEPARATOR_W * ppu, (hi - lo) * ppu, (SEPARATOR_W / 2) * ppu);
      }
      ctx.fill();
    }

    // The finish line: the checker tiled across the screen, content-primary.
    if (this.sim.finishY !== null) {
      ctx.fillStyle = theme.contentPrimary;
      ctx.beginPath();
      const cell = FINISH_TILE / 2;
      const bottom = this.sim.finishY - FINISH_H / 2;
      const rows = Math.round(FINISH_H / cell);
      const cols = Math.ceil(VIEW_WIDTH / cell);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Bottom-left and top-right of every tile are the empty cells.
          if ((r + c) % 2 === 0) continue;
          const x = -VIEW_WIDTH / 2 + c * cell, y = bottom + r * cell;
          ctx.rect(this._sx(x), this._sy(y + cell), cell * ppu + 0.5, cell * ppu + 0.5);
        }
      }
      ctx.fill();
    }

    const colors = {
      body: theme.contentPrimary, cut: theme.surfaceMain, beam: theme.contentPrimary,
      flashLight: mix(theme.surfaceMain, '#ffffff', FLASH_ALPHA * 0.6),
    };
    // Sorting orders: every light beam (1) under every body, the traffic (2–4) under the player (10–12).
    const traffic = this.leaving.concat(this.enemies);
    for (const e of traffic) this._withVehicle(e.x, e.y, e.k, 0, () => drawBeam(ctx, e.kind, colors.beam, BEAM_ALPHA + (flashOn(e.flash) ? FLASH_ALPHA : 0)));
    const p = this.player;
    this._withVehicle(p.x, p.y, p.k, p.tilt, () => drawBeam(ctx, 'car', colors.beam, BEAM_ALPHA));
    for (const e of traffic) {
      this._withVehicle(e.x, e.y, e.k, 0, () => drawVehicle(ctx, e.kind, colors.body, colors.cut, flashOn(e.flash) ? colors.flashLight : colors.cut, this.logo));
    }
    this._withVehicle(p.x, p.y, p.k, p.tilt, () => drawVehicle(ctx, 'car', palette[0], colors.cut, colors.cut, null));
  }

  /** Local units of the prefab (y up, root on the rear), turned about the DriftPivot by `tilt` degrees. */
  _withVehicle(x, y, k, tilt, draw) {
    const ctx = this.host.ctx;
    const s = k * this._ppu;
    ctx.save();
    ctx.translate(this._sx(x), this._sy(y));
    ctx.scale(s, -s);
    if (tilt) {
      ctx.translate(0, PLAYER.pivotY);
      ctx.rotate((tilt * Math.PI) / 180);
      ctx.translate(0, -PLAYER.pivotY);
    }
    draw();
    ctx.restore();
  }
}

function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

/** Collapse_Config.PickRandomEnemyPrefab: by weight. */
function pickWeighted() {
  const kinds = Object.keys(ENEMIES);
  let roll = Math.random() * kinds.reduce((s, k) => s + ENEMIES[k].weight, 0);
  for (const kind of kinds) {
    roll -= ENEMIES[kind].weight;
    if (roll <= 0) return Object.assign({ kind }, ENEMIES[kind]);
  }
  return Object.assign({ kind: 'car' }, ENEMIES.car);
}

function verticallyClose(pb, eb, playerH, padH) {
  const pad = Math.max(0, padH) * playerH;
  return !(eb.y1 < pb.y0 - pad || eb.y0 > pb.y1 + pad);
}

function overlapsStripe(b, stripe) { return !(b.y1 < stripe.y0 || b.y0 > stripe.y1); }

function horizontalGap(a, b) {
  if (a.x1 < b.x0) return b.x0 - a.x1;
  if (b.x1 < a.x0) return a.x0 - b.x1;
  return 0;
}

/** PlayClosePassHighBeamFlash: three flashes, 0.16 s on and 0.14 s off. */
function flashOn(t) {
  return t >= 0 && t % (FLASH_ON_S + FLASH_OFF_S) < FLASH_ON_S;
}

// ── The vehicles, redrawn from collapse_vehicle_sprites.png (100 px per unit, sprites centred) ──

/**
 * The LightBeam sprites: a cone from the nose, solid with a dithered fade over its far end; the car
 * one is two headlights meeting. Centre and scale from each prefab's LightBeam child.
 */
const BEAMS = {
  car: { cy: 4.24 + 5.472, scale: 1, top: 5.28, topHalf: 2.96, bottom: -5.30, base: [-0.83, -0.32, 0.32, 0.83], notch: -3.6 },
  truck: { cy: 5.8 + 7.7, scale: 1.1326, top: 5.28, topHalf: 2.96, bottom: -5.30, base: [-0.83, -0.32, 0.32, 0.83], notch: -3.6 },
  moto: { cy: 3.377 + 4.2, scale: 0.99116, top: 5.32, topHalf: 2.39, bottom: -5.31, base: [-0.235, 0.235], notch: null },
};
// The sprite is solid with a dithered far end; drawn that way the cone read as a hard, opaque
// wedge, so it fades along its whole length instead: full strength at the lamps, an ease-out to
// nothing at the tip (share of the beam's length → share of its alpha).
const BEAM_FADE = [[0, 1], [0.15, 0.7], [0.4, 0.38], [0.7, 0.14], [1, 0]];

/** The far end of a vehicle's beam, in its prefab units. */
function beamTip(kind) {
  const b = BEAMS[kind];
  return b.cy + b.top * b.scale;
}

function drawBeam(ctx, kind, color, alpha) {
  const b = BEAMS[kind];
  ctx.save();
  ctx.translate(0, b.cy);
  ctx.scale(b.scale, b.scale);
  const g = ctx.createLinearGradient(0, b.bottom, 0, b.top);
  for (const [t, k] of BEAM_FADE) g.addColorStop(t, withAlpha(color, alpha * k));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-b.topHalf, b.top);
  ctx.lineTo(b.topHalf, b.top);
  if (b.notch === null) {
    ctx.lineTo(b.base[1], b.bottom);
    ctx.lineTo(b.base[0], b.bottom);
  } else {
    ctx.lineTo(b.base[3], b.bottom);
    ctx.lineTo(b.base[2], b.bottom);
    ctx.lineTo(0, b.notch);
    ctx.lineTo(b.base[1], b.bottom);
    ctx.lineTo(b.base[0], b.bottom);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Outline, Main, Window and the side lights of each prefab. In dark mode the outline, the windows
 * and the side lights take the background colour, so they read as cut-outs of the body.
 */
function drawVehicle(ctx, kind, body, cut, lights, logo) {
  if (kind === 'car') drawCar(ctx, body, cut, lights);
  else if (kind === 'moto') drawMoto(ctx, body, cut);
  else drawTruck(ctx, body, cut, logo);
}

// Car_Enemy / Player: every child sits under the DriftPivot (4.24); Main at -2.018, Window at -2.362.
function drawCar(ctx, body, cut, lights) {
  const cy = 4.24 - 2.018;
  ctx.fillStyle = cut;
  roundRect(ctx, -1.14, cy - 2.265, 2.28, 4.53, 0.42);
  ctx.fill();
  ctx.fillStyle = body;
  roundRect(ctx, -1.09, cy - 2.215, 2.18, 4.43, 0.37);
  ctx.fill();
  // Windscreen and rear window (one sprite, 2 × 3.1 around 4.24 - 2.362).
  const wy = 4.24 - 2.362;
  ctx.fillStyle = cut;
  roundRect(ctx, -1, wy + 0.65, 2, 0.9, 0.2);
  ctx.fill();
  roundRect(ctx, -1, wy - 1.55, 2, 0.85, [0.12, 0.12, 0.4, 0.4]);
  ctx.fill();
  // LightLeft / LightRight (±0.818): a thin arc along each corner.
  ctx.strokeStyle = lights;
  ctx.lineWidth = 0.05;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const x = side * (0.818 - 0.18);
    ctx.moveTo(side * (0.818 + 0.17), cy + 1.8);
    ctx.arc(x, cy + 1.8, 0.35, side < 0 ? Math.PI : 0, Math.PI / 2, side < 0);
    ctx.moveTo(side * (0.818 + 0.17), cy - 1.8);
    ctx.arc(x, cy - 1.8, 0.35, side < 0 ? Math.PI : 0, -Math.PI / 2, side > 0);
  }
  ctx.stroke();
}

// Moto_Enemy: DriftPivot at 3.377, Main and Outline at -2.018; rider seen from above on the bike.
function motoShape(ctx, path) {
  const cy = 3.377 - 2.018;
  path(() => roundRect(ctx, -0.1, cy + 0.95, 0.2, 0.35, 0.1));          // front wheel
  path(() => roundRect(ctx, -0.24, cy + 0.4, 0.48, 0.45, [0.2, 0.2, 0.05, 0.05]));
  path(() => roundRect(ctx, -0.66, cy + 0.53, 1.32, 0.11, 0.05));       // handlebar
  path(() => { ctx.beginPath(); ctx.arc(0, cy + 0.115, 0.24, 0, Math.PI * 2); });
  path(() => roundRect(ctx, -0.24, cy - 0.76, 0.48, 0.56, [0.05, 0.05, 0.12, 0.12]));
  path(() => roundRect(ctx, -0.1, cy - 1.32, 0.2, 0.42, 0.1));          // rear wheel
}

function drawMoto(ctx, body, cut) {
  ctx.strokeStyle = cut;
  ctx.lineWidth = 0.12;
  ctx.lineJoin = 'round';
  motoShape(ctx, (shape) => { shape(); ctx.stroke(); });
  ctx.fillStyle = body;
  motoShape(ctx, (shape) => { shape(); ctx.fill(); });
}

// Truck_Enemy: DriftPivot at 5.8, Main at -2.018 (cab and trailer), Window at -1.749 (the windscreen
// bar and the Skeep logo and name, turned to read along the trailer).
function drawTruck(ctx, body, cut, logo) {
  const cab = [-1.68, 6.08, 3.36, 1.477, [0.4, 0.4, 0, 0]];
  const trailer = [-1.98, 0.007, 3.96, 6.01, 0.3];
  ctx.fillStyle = cut;
  for (const [x, y, w, h, r] of [cab, trailer]) {
    roundRect(ctx, x - 0.05, y - 0.05, w + 0.1, h + 0.1, r);
    ctx.fill();
  }
  ctx.fillStyle = body;
  for (const [x, y, w, h, r] of [cab, trailer]) {
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
  }
  ctx.fillStyle = cut;
  roundRect(ctx, -1.43, 6.396, 2.86, 0.48, 0.24);
  ctx.fill();
  // The decoration is upright in sprite space: undo the y flip, then turn it a quarter left.
  ctx.save();
  ctx.scale(1, -1);
  ctx.save();
  ctx.translate(0, -4.116);
  ctx.rotate(-Math.PI / 2);
  if (logo) ctx.drawImage(logo, -0.8, -0.8, 1.6, 1.6);
  ctx.restore();
  ctx.translate(-0.04, -2.296);
  ctx.rotate(-Math.PI / 2);
  ctx.scale(0.01, 0.01);
  ctx.font = `700 ${wordmarkSize(ctx)}px Sora, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('skeep', 0, 0);
  ctx.restore();
}

let wordmarkPx = 0;
/** The name runs 2.07 units along the trailer (200 at the 1:100 scale it is drawn at). */
function wordmarkSize(ctx) {
  if (!wordmarkPx) {
    ctx.font = '700 100px Sora, sans-serif';
    wordmarkPx = (100 * 207) / Math.max(1, ctx.measureText('skeep').width);
  }
  return wordmarkPx;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  // In the flipped (y-up) space the first two radii land on the bottom corners; callers pass
  // [top-left, top-right, bottom-right, bottom-left] as seen on screen, so swap the pairs.
  const radii = Array.isArray(r) ? [r[3], r[2], r[1], r[0]] : r;
  ctx.roundRect(x, y, w, h, radii);
}

function withAlpha(hex, a) {
  const n = parseInt(hex.trim().slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function mix(hexA, hexB, t) {
  const a = parseInt(hexA.trim().slice(1), 16), b = parseInt(hexB.trim().slice(1), 16);
  const c = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
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
