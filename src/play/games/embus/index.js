// Embus ("Gridlock"): drag the cars along their lane until the blue one can drive out.
// Single-player port of Embus_BoardLayoutParser, Embus_RuntimeBoard, Embus_Car and
// Embus_SceneManager, drawn on a canvas.

import { drawPlainBackground } from '../../features/background.js';

// The board is 4 world units on its long side, and the scene's 6-unit-wide CameraBounds is
// fitted to the content width (SkeepCameraScaffoldBoundsFit), so the board takes 4/6 of it.
const BOARD_FRACTION = 4 / 6;
const CAR_SIZE = 0.9;            // Embus_Car.VisualSizeFactor, also the obstacles
const GUIDE_SIZE = 0.5;          // CellSizeInCellWidths: the small square marking each cell
const ARROW_SIZE = 0.55;         // goal arrow, in cells
// The theme's roundedR16 sprite, at this board's scale: about a quarter of a cell.
const RADIUS = 0.24;
const OUTLINE = 0.06;            // frameR16 stroke, in cells
const SNAP_S = 0.12;
const EXIT_DELAY_S = 0.2;        // OnGoalReached: the car drives out after this…
const EXIT_S = 0.6;              // …taking this long
// The theme's feedback tone in dark mode (feedbackText.normalToneDark).
const FEEDBACK_TONE = 2;
/** Space between the start hint and the top of the board, in canvas units. */
const HINT_GAP = 48;

export default {
  // Embus_Loc: GAME_TITLE, GAME_DESCRIPTION, GAME_START_HINT. It has no GAME_DESCRIPTION_SP.
  text: {
    ca: {
      title: 'Embús',
      description: 'Treu el cotxe blau de l’embús. / Els cotxes es mouen en la direcció en què estan mirant.',
      startHint: 'Arrossega els cotxes per obrir pas',
    },
    en: {
      title: 'Gridlock',
      description: "Get the blue car out of the traffic jam. / Cars only move in the direction they're facing.",
      startHint: 'Drag the cars to clear the way',
    },
    es: {
      title: 'Atasco',
      description: 'Saca el coche azul del atasco. / Los coches solo se mueven en la dirección en la que están mirando.',
      startHint: 'Arrastra los coches para abrir paso',
    },
  },

  levels: () => fetch(new URL('./levels.json', import.meta.url)).then((r) => {
    if (!r.ok) throw new Error(`levels.json: ${r.status}`);
    return r.json();
  }),

  create: (host) => new Embus(host),
};

/**
 * Embus_BoardLayoutParser: one row per line, '-' empty, '*' obstacle, any other character a car.
 * The goal car's head is its upper-case letter, and it leaves through the board edge it faces.
 * Rows count from the top here (the parser flips them for Unity; the result is the same board).
 */
export function parseLayout(layout) {
  const rows = layout.replace(/\r/g, '').split('\n').filter((r) => r.trim());
  const height = rows.length;
  const width = rows[0].length;
  const cells = new Map();
  const heads = new Map();
  const obstacles = [];
  rows.forEach((line, row) => {
    if (line.length !== width) throw new Error('Embus: rows of different length');
    [...line].forEach((ch, col) => {
      if (ch === '-' || ch === ' ') return;
      if (ch === '*') { obstacles.push({ row, col }); return; }
      const key = ch.toLowerCase();
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ row, col });
      if (ch !== key && !heads.has(key)) heads.set(key, { row, col });
    });
  });

  const cars = [];
  for (const [key, list] of cells) {
    const horizontal = list.some((c) => c.row !== list[0].row);
    const vertical = list.some((c) => c.col !== list[0].col);
    if (horizontal && vertical) throw new Error(`Embus: car '${key}' is not in one line`);
    const isRow = !horizontal; // all cells share a row: it moves left/right
    const along = list.map((c) => (isRow ? c.col : c.row)).sort((a, b) => a - b);
    const car = {
      key,
      horizontal: isRow,
      line: isRow ? list[0].row : list[0].col,
      pos: along[0],            // first cell along its lane (leftmost / topmost)
      len: along.length,
      goal: heads.has(key),
    };
    if (car.goal) {
      const head = heads.get(key);
      const headAlong = isRow ? head.col : head.row;
      // The head is the far end: the car faces right/down if it is the last cell, else left/up.
      car.exit = isRow ? (headAlong === along[along.length - 1] ? 'right' : 'left') : (headAlong === along[along.length - 1] ? 'down' : 'up');
    }
    cars.push(car);
  }
  return { width, height, cars, obstacles };
}

class Embus {
  constructor(host) {
    this.host = host;
    this.drag = null;
    this.over = false;
    this.exiting = null;
    this.arrow = null;
  }

  // ── Lifecycle ──

  load(level) {
    const board = parseLayout(level.layout);
    this.cols = board.width;
    this.rows = board.height;
    this.cars = board.cars;
    this.obstacles = board.obstacles;
    this.goal = this.cars.find((c) => c.goal);
    for (const car of this.cars) car.draw = car.pos;
    // The exit arrow (skeep_icons arrow-right), tinted when it has loaded.
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { this.arrow = img; resolve(); };
      img.onerror = () => resolve();
      img.src = new URL('../../img/arrow.png', import.meta.url).href;
    });
  }

  start() {
    // Above the board, so it never covers the cars.
    this.host.showStartHint(this.host.text.startHint, () => ({ y: this._origin()[1] - HINT_GAP * this.host.u, align: 'bottom' }));
  }

  pause() {
    this._release();
  }

  resume() {}
  resize() {}
  destroy() {}

  // ── Rules (Embus_RuntimeBoard) ──

  _occupied(row, col, except) {
    if (row < 0 || col < 0 || row >= this.rows || col >= this.cols) return true;
    if (this.obstacles.some((o) => o.row === row && o.col === col)) return true;
    return this.cars.some((c) => c !== except && !c.gone && covers(c, c.pos, row, col));
  }

  /** The car fits with its first cell at `pos` (never off the board, not even the goal). */
  _canPlace(car, pos) {
    for (let i = 0; i < car.len; i++) {
      const row = car.horizontal ? car.line : pos + i;
      const col = car.horizontal ? pos + i : car.line;
      if (this._occupied(row, col, car)) return false;
    }
    return true;
  }

  _exitCell() {
    const g = this.goal;
    if (g.exit === 'right') return { row: g.line, col: this.cols - 1 };
    if (g.exit === 'left') return { row: g.line, col: 0 };
    if (g.exit === 'down') return { row: this.rows - 1, col: g.line };
    return { row: 0, col: g.line };
  }

  // ── Input (Embus_Car) ──

  pointerDown(p) {
    if (this.over || this.drag) return;
    const car = this._carAt(p.x, p.y);
    if (!car) return;
    this.host.dismissStartHint();
    // The free stretch of its lane, decided once at the press.
    let min = car.pos, max = car.pos;
    while (this._canPlace(car, min - 1)) min--;
    while (this._canPlace(car, max + 1)) max++;
    this.drag = { car, id: p.id, min, max, start: car.pos, grab: car.horizontal ? p.x : p.y };
    car.snap = null;
  }

  pointerMove(p) {
    const d = this.drag;
    if (!d || d.id !== p.id) return;
    const delta = ((d.car.horizontal ? p.x : p.y) - d.grab) / this._cell();
    d.car.draw = Math.max(d.min, Math.min(d.max, d.start + delta));
  }

  pointerUp(p) {
    if (!this.drag || this.drag.id !== p.id) return;
    this._release();
  }

  /** On release the car settles on the nearest free cell; the goal car prefers the exit. */
  _release() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const car = d.car;
    let target = Math.round(car.draw);
    if (car.goal) {
      const exit = this._exitCell();
      let best = null;
      for (let pos = d.min; pos <= d.max; pos++) {
        if (!covers(car, pos, exit.row, exit.col)) continue;
        if (best === null || Math.abs(car.draw - pos) < Math.abs(car.draw - best)) best = pos;
      }
      if (best !== null) target = best;
    }
    target = Math.max(d.min, Math.min(d.max, target));
    car.snap = { from: car.draw, to: target, t: 0 };
    car.pos = target;
    if (car.goal) {
      const exit = this._exitCell();
      if (covers(car, car.pos, exit.row, exit.col)) this._win(exit);
    }
  }

  _win(exit) {
    this.over = true;
    const [x, y] = this._cellCenter(exit.row, exit.col);
    this.host.feedback(this.host.strings.feedbackGood3, x, y, this.host.palette[FEEDBACK_TONE]);
    // Drive out until the whole car is past the edge.
    const g = this.goal;
    const outside = g.exit === 'right' || g.exit === 'down' ? (g.horizontal ? this.cols : this.rows) : -g.len;
    this.exiting = { from: g.pos, to: outside, t: -EXIT_DELAY_S };
    this.host.finish(true);
  }

  // ── Tick ──

  update(dt) {
    for (const car of this.cars) {
      if (!car.snap) continue;
      car.snap.t = Math.min(1, car.snap.t + dt / SNAP_S);
      car.draw = car.snap.from + (car.snap.to - car.snap.from) * easeOut(car.snap.t);
      if (car.snap.t >= 1) car.snap = null;
    }
  }

  // The goal car keeps driving out under the result veil, where update() no longer runs.
  _advanceExit() {
    const e = this.exiting;
    if (!e) return;
    const now = performance.now();
    const dt = this._lastExit ? Math.min(0.1, (now - this._lastExit) / 1000) : 0;
    this._lastExit = now;
    e.t += dt / EXIT_S;
    if (e.t <= 0) return;
    const t = Math.min(1, e.t);
    this.goal.snap = null;
    this.goal.draw = e.from + (e.to - e.from) * t;
  }

  // ── Drawing ──

  render() {
    const { ctx, width, height, theme, palette } = this.host;
    // Embus's camera has no gradient: plain surface-main.
    drawPlainBackground(ctx, width, height, theme);
    this._advanceExit();
    const cell = this._cell();

    // Guides: a small rounded square in each cell.
    ctx.fillStyle = theme.surfaceLowest;
    const g = cell * GUIDE_SIZE;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const [cx, cy] = this._cellCenter(row, col);
        roundRect(ctx, cx - g / 2, cy - g / 2, g, g, Math.min(RADIUS * cell, g / 2));
        ctx.fill();
      }
    }

    // Exit arrow, just outside the board, in the goal car's colour.
    if (this.arrow && this.goal) this._drawArrow(cell, palette[0]);

    ctx.fillStyle = theme.contentPrimary;
    for (const o of this.obstacles) {
      const [cx, cy] = this._cellCenter(o.row, o.col);
      const s = cell * CAR_SIZE;
      roundRect(ctx, cx - s / 2, cy - s / 2, s, s, RADIUS * cell);
      ctx.fill();
    }

    for (const car of this.cars) {
      const r = this._carRect(car, car.draw);
      ctx.fillStyle = car.goal ? palette[0] : palette[4];
      roundRect(ctx, r.x, r.y, r.w, r.h, RADIUS * cell);
      ctx.fill();
      // The outline shows while the car is held.
      if (this.drag && this.drag.car === car) {
        ctx.lineWidth = OUTLINE * cell;
        ctx.strokeStyle = theme.contentPrimary;
        roundRect(ctx, r.x + ctx.lineWidth / 2, r.y + ctx.lineWidth / 2, r.w - ctx.lineWidth, r.h - ctx.lineWidth, RADIUS * cell - ctx.lineWidth / 2);
        ctx.stroke();
      }
    }
  }

  _drawArrow(cell, color) {
    const g = this.goal;
    const exit = this._exitCell();
    const off = { right: [0, 1], left: [0, -1], down: [1, 0], up: [-1, 0] }[g.exit];
    const [cx, cy] = this._cellCenter(exit.row + off[0], exit.col + off[1]);
    const s = cell * ARROW_SIZE;
    if (!this._tinted || this._tintedColor !== color) {
      const c = document.createElement('canvas');
      c.width = this.arrow.width;
      c.height = this.arrow.height;
      const t = c.getContext('2d');
      t.drawImage(this.arrow, 0, 0);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = color;
      t.fillRect(0, 0, c.width, c.height);
      this._tinted = c;
      this._tintedColor = color;
    }
    const { ctx } = this.host;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[g.exit]);
    ctx.drawImage(this._tinted, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  // ── Geometry ──

  _cell() {
    return (this.host.width * BOARD_FRACTION) / this.cols;
  }

  /** Top-left corner of the board: centred in the content area. */
  _origin() {
    const { width, height, insets } = this.host;
    const cell = this._cell();
    const cy = insets.top + (height - insets.top - insets.bottom) / 2;
    return [width / 2 - (this.cols * cell) / 2, cy - (this.rows * cell) / 2];
  }

  _cellCenter(row, col) {
    const [ox, oy] = this._origin();
    const cell = this._cell();
    return [ox + (col + 0.5) * cell, oy + (row + 0.5) * cell];
  }

  _carRect(car, pos) {
    const [ox, oy] = this._origin();
    const cell = this._cell();
    const along = car.len * cell, across = cell;
    const x = car.horizontal ? ox + pos * cell : ox + car.line * cell;
    const y = car.horizontal ? oy + car.line * cell : oy + pos * cell;
    const w = car.horizontal ? along : across;
    const h = car.horizontal ? across : along;
    // Its cells scaled to 90%, centred: the gaps between cars.
    return { x: x + (w * (1 - CAR_SIZE)) / 2, y: y + (h * (1 - CAR_SIZE)) / 2, w: w * CAR_SIZE, h: h * CAR_SIZE };
  }

  _carAt(x, y) {
    for (const car of this.cars) {
      const [ox, oy] = this._origin();
      const cell = this._cell();
      const cx = car.horizontal ? ox + car.pos * cell : ox + car.line * cell;
      const cy = car.horizontal ? oy + car.line * cell : oy + car.pos * cell;
      const w = car.horizontal ? car.len * cell : cell;
      const h = car.horizontal ? cell : car.len * cell;
      if (x >= cx && x <= cx + w && y >= cy && y <= cy + h) return car;
    }
    return null;
  }
}

function covers(car, pos, row, col) {
  if (car.horizontal) return row === car.line && col >= pos && col < pos + car.len;
  return col === car.line && row >= pos && row < pos + car.len;
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
