// The celebration when a logic board is solved (SkeepBoardCelebration + SkeepCellFlashes): block
// by block, in the order of a pattern, each block's cells light up one after another as if it
// were being built, and when the last one lights the block pops. Ticked by the game, so it stops
// with the pause.

const BEATS = 7;
const BLOCK_FRACTION = 0.45;
const FLASH_S = 0.3;
const FLASH_ALPHA = 0.35;
const FLASH_RISE = 0.25;

/** Wave: diagonal from the top left. Radial: from the centre out. Scatter: each block at random. */
export const PATTERNS = ['wave', 'radial', 'scatter'];

export class BoardCelebration {
  /**
   * @param {{width: number, height: number}} boardSize  any unit, the same as the cell positions
   * @param {number} totalSeconds
   */
  constructor(boardSize, totalSeconds, pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)]) {
    this.size = boardSize;
    this.total = totalSeconds;
    this.pattern = pattern;
    this.clock = 0;
    this.flashes = [];   // { cell, start, seconds }
    this.events = [];    // { at, action }
  }

  get running() {
    return this.flashes.length > 0 || this.events.length > 0;
  }

  /**
   * A block: its cells ({ x, y, id } centred on the board's centre, y up) light in pattern order,
   * starting at the pattern time of `anchor`; `onBuilt` runs as the last one lights.
   */
  addBlock(anchor, cells, onBuilt) {
    if (!cells.length) return;
    const block = this.total * BLOCK_FRACTION;
    const wave = Math.max(0, this.total - block);
    const flash = Math.min(FLASH_S, block * 0.5);
    const inside = this.pattern === 'scatter' ? 'wave' : this.pattern;
    const beat = this._at(anchor, this.pattern, Math.random());
    const delay = (Math.round(beat * (BEATS - 1)) / (BEATS - 1)) * wave;
    const ordered = cells
      .map((c) => ({ ...c, at: this._at(c, inside, 0) }))
      .sort((a, b) => (a.at !== b.at ? a.at - b.at : a.id - b.id));
    const step = ordered.length > 1 ? (block - flash) / (ordered.length - 1) : 0;
    ordered.forEach((c, k) => this.flashes.push({ cell: c.id, start: delay + k * step, seconds: Math.max(0.01, flash) }));
    if (onBuilt) this.events.push({ at: delay + (ordered.length - 1) * step + flash * 0.4, action: onBuilt });
  }

  tick(dt) {
    if (!this.running) return;
    this.clock += dt;
    this.flashes = this.flashes.filter((f) => this.clock < f.start + f.seconds);
    const due = this.events.filter((e) => this.clock >= e.at);
    this.events = this.events.filter((e) => this.clock < e.at);
    for (const e of due) e.action();
  }

  /** Alpha (0–0.35) of the white flash over a cell right now. */
  flashAlpha(cell) {
    let a = 0;
    for (const f of this.flashes) {
      if (f.cell !== cell) continue;
      const t = (this.clock - f.start) / f.seconds;
      if (t < 0 || t >= 1) continue;
      a = Math.max(a, t < FLASH_RISE ? t / FLASH_RISE : 1 - smooth((t - FLASH_RISE) / (1 - FLASH_RISE)));
    }
    return a * FLASH_ALPHA;
  }

  _at(p, pattern, random) {
    const hx = this.size.width / 2, hy = this.size.height / 2;
    let v;
    if (pattern === 'radial') v = Math.hypot(p.x, p.y) / Math.max(1e-4, Math.hypot(hx, hy));
    else if (pattern === 'scatter') v = random;
    else v = (p.x + hx + (hy - p.y)) / Math.max(1e-4, hx * 2 + hy * 2);
    return Math.min(1, Math.max(0, v));
  }
}

function smooth(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
