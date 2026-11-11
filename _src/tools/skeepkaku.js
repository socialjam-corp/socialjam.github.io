// Pre-generates the Skeepkaku puzzles the lite feed serves, so the page never runs the generator:
//
//   node _src/tools/skeepkaku.js [seed]
//
// Writes src/play/games/skeepkaku/levels.json with Embus's split (1 tutorial, 5 easy, 15 medium,
// 20 hard). Each difficulty uses the settings of the app's level pack for it
// (SkeepGames/Skeepkaku/Levels). Port of Skeepkaku_Generator, Skeepkaku_Solver,
// Skeepkaku_LogicSolver and Skeepkaku_Colors. A board has up to 8×8 = 64 cells and Node 6 has no
// 64-bit integers, so a set of cells is two 32-bit halves: [low, high].
'use strict';

var fs = require('fs');
var path = require('path');
var u = require('./unity.js');

var COUNTS = { tutorial: 1, easy: 5, medium: 15, hard: 20 };
var COLOR_COUNT = 10;           // the theme's logicGameColors
var DEFAULT_ATTEMPTS = 60;      // Skeepkaku_Generator.DefaultAttempts
var REPAIR_STEPS = 40;
var PARTITION_NODES = 4000;
var MIN_AREA = 2, MIN_SIDE = 2, MAX_SIDE = 8;
var T = { None: 0, Single: 1, Overlap: 2, OnlyCover: 3, Contradiction: 4, Unsolvable: 5 };

// ── Seeded random (mulberry32): the same seed always writes the same file. ──

function Random(seed) {
  var s = seed >>> 0;
  this.next = function (max) {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    var r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return max === undefined ? r : Math.floor(r * max);
  };
}

// ── Cell sets ──

function bit(i) { return i < 32 ? [(1 << i) >>> 0, 0] : [0, (1 << (i - 32)) >>> 0]; }
function or(a, b) { return [(a[0] | b[0]) >>> 0, (a[1] | b[1]) >>> 0]; }
function and(a, b) { return [(a[0] & b[0]) >>> 0, (a[1] & b[1]) >>> 0]; }
function any(a) { return a[0] !== 0 || a[1] !== 0; }
function same(a, b) { return a[0] === b[0] && a[1] === b[1]; }
var EMPTY = [0, 0];
var ALL = [0xFFFFFFFF, 0xFFFFFFFF];

function fullMask(cells) {
  var m = EMPTY;
  for (var i = 0; i < cells; i++) m = or(m, bit(i));
  return m;
}

function rectMask(r, cols) {
  var m = EMPTY;
  for (var row = r.row; row < r.row + r.h; row++)
    for (var col = r.col; col < r.col + r.w; col++) m = or(m, bit(row * cols + col));
  return m;
}

function rectEq(a, b) { return a.row === b.row && a.col === b.col && a.h === b.h && a.w === b.w; }
function contains(r, row, col) { return row >= r.row && row < r.row + r.h && col >= r.col && col < r.col + r.w; }

// ── Skeepkaku_Solver: candidates and exact solution count ──

function clueGrid(rows, cols, clues) {
  var g = [];
  for (var i = 0; i < rows * cols; i++) g.push(-1);
  clues.forEach(function (c, i) { g[c.row * cols + c.col] = i; });
  return g;
}

function candidates(rows, cols, clues) {
  var at = clueGrid(rows, cols, clues);
  return clues.map(function (clue, i) {
    var list = [];
    for (var h = 1; h <= Math.min(rows, clue.value); h++) {
      if (clue.value % h !== 0) continue;
      var w = clue.value / h;
      if (w > cols) continue;
      for (var top = Math.max(0, clue.row - h + 1); top <= Math.min(clue.row, rows - h); top++)
        for (var left = Math.max(0, clue.col - w + 1); left <= Math.min(clue.col, cols - w); left++) {
          var r = { row: top, col: left, h: h, w: w };
          if (onlyClue(r, cols, at, i)) list.push(r);
        }
    }
    return list;
  });
}

function onlyClue(r, cols, at, clue) {
  for (var row = r.row; row < r.row + r.h; row++)
    for (var col = r.col; col < r.col + r.w; col++) {
      var c = at[row * cols + col];
      if (c >= 0 && c !== clue) return false;
    }
  return true;
}

function countSolutions(rows, cols, clues, cap) {
  var cand = candidates(rows, cols, clues);
  var masks = cand.map(function (list) { return list.map(function (r) { return rectMask(r, cols); }); });
  var full = fullMask(rows * cols);
  var placed = clues.map(function () { return false; });
  var choice = clues.map(function () { return 0; });
  var found = [];
  var solutions = 0;

  function run(used, placedCount) {
    if (solutions >= cap) return;
    if (placedCount === placed.length) {
      if (!same(used, full)) return;
      solutions++;
      found.push(choice.map(function (k, i) { return cand[i][k]; }));
      return;
    }
    var best = -1, bestCount = Infinity, reach = used;
    for (var i = 0; i < placed.length; i++) {
      if (placed[i]) continue;
      var count = 0;
      for (var k = 0; k < masks[i].length; k++) {
        if (any(and(masks[i][k], used))) continue;
        count++;
        reach = or(reach, masks[i][k]);
      }
      if (count === 0) return;
      if (count < bestCount) { bestCount = count; best = i; }
    }
    // Some empty cell no clue can cover any more.
    if (!same(reach, full)) return;
    placed[best] = true;
    for (var j = 0; j < masks[best].length && solutions < cap; j++) {
      if (any(and(masks[best][j], used))) continue;
      choice[best] = j;
      run(or(used, masks[best][j]), placedCount + 1);
    }
    placed[best] = false;
  }

  run(EMPTY, 0);
  return { solutions: solutions, found: found };
}

// ── Skeepkaku_LogicSolver: solved by deductions only, and how hard it was ──

var COST = [0, 1, 2, 2, 6, 0];

function State(masks, full, cells, other) {
  this.masks = masks;
  this.full = full;
  this.cells = cells;
  if (other) {
    this.alive = other.alive.map(function (a) { return a.slice(); });
    this.aliveCount = other.aliveCount.slice();
    this.solved = other.solved.slice();
    this.solvedCount = other.solvedCount;
  } else {
    this.alive = masks.map(function (m) { return m.map(function () { return true; }); });
    this.aliveCount = masks.map(function (m) { return m.length; });
    this.solved = masks.map(function () { return false; });
    this.solvedCount = 0;
  }
}

State.prototype.allSolved = function () { return this.solvedCount === this.masks.length; };
State.prototype.onlyAlive = function (i) { return this.alive[i].indexOf(true); };
State.prototype.kill = function (i, k) {
  if (!this.alive[i][k]) return false;
  this.alive[i][k] = false;
  this.aliveCount[i]--;
  return true;
};
State.prototype.killOthersTouching = function (clue, cells) {
  var anyKilled = false;
  for (var j = 0; j < this.masks.length; j++) {
    if (j === clue) continue;
    for (var k = 0; k < this.masks[j].length; k++)
      if (this.alive[j][k] && any(and(this.masks[j][k], cells))) anyKilled = this.kill(j, k) || anyKilled;
  }
  return anyKilled;
};
State.prototype.hasContradiction = function () {
  var reach = EMPTY;
  for (var i = 0; i < this.masks.length; i++) {
    if (this.aliveCount[i] === 0) return true;
    for (var k = 0; k < this.masks[i].length; k++) if (this.alive[i][k]) reach = or(reach, this.masks[i][k]);
  }
  return !same(reach, this.full);
};
State.prototype.trySingle = function () {
  for (var i = 0; i < this.masks.length; i++) {
    if (this.solved[i] || this.aliveCount[i] !== 1) continue;
    this.solved[i] = true;
    this.solvedCount++;
    this.killOthersTouching(i, this.masks[i][this.onlyAlive(i)]);
    return true;
  }
  return false;
};
State.prototype.tryOverlap = function () {
  for (var i = 0; i < this.masks.length; i++) {
    if (this.solved[i] || this.aliveCount[i] < 2) continue;
    var common = ALL;
    for (var k = 0; k < this.masks[i].length; k++) if (this.alive[i][k]) common = and(common, this.masks[i][k]);
    if (any(common) && this.killOthersTouching(i, common)) return true;
  }
  return false;
};
State.prototype.tryOnlyCover = function () {
  for (var b = 0; b < this.cells; b++) {
    var cell = bit(b), owner = -1, several = false;
    for (var i = 0; i < this.masks.length && !several; i++)
      for (var k = 0; k < this.masks[i].length; k++) {
        if (!this.alive[i][k] || !any(and(this.masks[i][k], cell))) continue;
        if (owner >= 0 && owner !== i) several = true;
        owner = i;
        break;
      }
    if (several || owner < 0) continue;
    var killed = false;
    for (var j = 0; j < this.masks[owner].length; j++)
      if (this.alive[owner][j] && !any(and(this.masks[owner][j], cell))) killed = this.kill(owner, j) || killed;
    if (killed) return true;
  }
  return false;
};
State.prototype.propagate = function () {
  while (true) {
    if (this.hasContradiction()) return false;
    if (this.allSolved()) return true;
    if (!this.trySingle() && !this.tryOverlap() && !this.tryOnlyCover()) return true;
  }
};
State.prototype.tryContradiction = function () {
  for (var i = 0; i < this.masks.length; i++) {
    if (this.solved[i] || this.aliveCount[i] < 2) continue;
    for (var k = 0; k < this.masks[i].length; k++) {
      if (!this.alive[i][k]) continue;
      var trial = new State(this.masks, this.full, this.cells, this);
      for (var o = 0; o < this.masks[i].length; o++) if (o !== k) trial.kill(i, o);
      if (!trial.propagate()) {
        this.kill(i, k);
        return true;
      }
    }
  }
  return false;
};

function logicSolve(rows, cols, clues) {
  var cand = candidates(rows, cols, clues);
  var masks = cand.map(function (list) { return list.map(function (r) { return rectMask(r, cols); }); });
  var state = new State(masks, fullMask(rows * cols), rows * cols);
  var score = 0, hardest = T.None;
  while (!state.allSolved()) {
    var used;
    if (state.hasContradiction()) used = T.Unsolvable;
    else if (state.trySingle()) used = T.Single;
    else if (state.tryOverlap()) used = T.Overlap;
    else if (state.tryOnlyCover()) used = T.OnlyCover;
    else if (state.tryContradiction()) used = T.Contradiction;
    else used = T.Unsolvable;
    if (used > hardest) hardest = used;
    if (used === T.Unsolvable) return { solved: false, hardest: hardest, score: score };
    score += COST[used];
  }
  if (state.hasContradiction()) return { solved: false, hardest: T.Unsolvable, score: score };
  return { solved: true, hardest: hardest, score: score };
}

// ── Skeepkaku_Generator ──

function randomPartition(rows, cols, minArea, maxArea, rng) {
  var shapes = [];
  for (var h = 1; h <= rows; h++)
    for (var w = 1; w <= cols; w++)
      if (h * w >= minArea && h * w <= maxArea) shapes.push({ h: h, w: w });
  if (!shapes.length) return null;
  var covered = [];
  for (var i = 0; i < rows * cols; i++) covered.push(false);
  var rects = [];
  var nodes = { n: 0 };
  return fill(rows, cols, shapes, covered, rects, rng, nodes) ? rects : null;
}

function fill(rows, cols, shapes, covered, rects, rng, nodes) {
  if (++nodes.n > PARTITION_NODES) return false;
  var first = covered.indexOf(false);
  if (first < 0) return true;
  var row = Math.floor(first / cols), col = first % cols;
  var order = shapeOrder(shapes, rng);
  for (var i = 0; i < order.length; i++) {
    var r = { row: row, col: col, h: order[i].h, w: order[i].w };
    if (!fits(r, rows, cols, covered)) continue;
    mark(r, cols, covered, true);
    rects.push(r);
    if (fill(rows, cols, shapes, covered, rects, rng, nodes)) return true;
    rects.pop();
    mark(r, cols, covered, false);
    if (nodes.n > PARTITION_NODES) return false;
  }
  return false;
}

// The area first, then the shape: otherwise areas with more shapes (6, 8…) would come up more.
function shapeOrder(shapes, rng) {
  var byArea = {};
  shapes.forEach(function (s) { (byArea[s.h * s.w] = byArea[s.h * s.w] || []).push(s); });
  var groups = Object.keys(byArea).sort(function (a, b) { return a - b; }).map(function (k) { return byArea[k]; });
  shuffle(groups, rng);
  var out = [];
  groups.forEach(function (g) { shuffle(g, rng); out = out.concat(g); });
  return out;
}

function fits(r, rows, cols, covered) {
  if (r.row + r.h > rows || r.col + r.w > cols) return false;
  for (var row = r.row; row < r.row + r.h; row++)
    for (var col = r.col; col < r.col + r.w; col++) if (covered[row * cols + col]) return false;
  return true;
}

function mark(r, cols, covered, value) {
  for (var row = r.row; row < r.row + r.h; row++)
    for (var col = r.col; col < r.col + r.w; col++) covered[row * cols + col] = value;
}

function randomClue(r, rng) {
  var cell = rng.next(r.h * r.w);
  return { row: r.row + Math.floor(cell / r.w), col: r.col + cell % r.w, value: r.h * r.w };
}

function makeUnique(rows, cols, partition, clues, rng) {
  for (var step = 0; step <= REPAIR_STEPS; step++) {
    var count = countSolutions(rows, cols, clues, 2);
    if (count.solutions === 1) return true;
    if (count.solutions === 0 || step === REPAIR_STEPS) return false;
    var other = count.found[0];
    if (other.every(function (r, i) { return rectEq(r, partition[i]); })) other = count.found[1];
    var differing = [];
    clues.forEach(function (c, i) { if (!rectEq(other[i], partition[i]) && partition[i].h * partition[i].w > 1) differing.push(i); });
    if (!differing.length) return false;
    var clue = differing[rng.next(differing.length)];
    clues[clue] = randomClue(partition[clue], rng);
  }
  return false;
}

function acceptsTechnique(s, hardest) {
  return hardest !== T.Unsolvable && (s.maxTechnique === T.None || hardest <= s.maxTechnique);
}

function distance(s, p) {
  var d = 0;
  if (!acceptsTechnique(s, p.hardest)) d += 1000 * (p.hardest - s.maxTechnique);
  if (s.minDifficulty > 0 && p.difficulty < s.minDifficulty) d += s.minDifficulty - p.difficulty;
  if (s.maxDifficulty > 0 && p.difficulty > s.maxDifficulty) d += p.difficulty - s.maxDifficulty;
  return d;
}

function generate(s, rng) {
  var best = null, bestDistance = Infinity;
  for (var attempt = 1; attempt <= DEFAULT_ATTEMPTS || !best; attempt++) {
    if (attempt > DEFAULT_ATTEMPTS * 20 && !best) throw new Error('no puzzle for ' + JSON.stringify(s));
    var partition = randomPartition(s.rows, s.cols, s.minArea, s.maxArea, rng);
    if (!partition) continue;
    var clues = partition.map(function (r) { return randomClue(r, rng); });
    if (!makeUnique(s.rows, s.cols, partition, clues, rng)) continue;
    var logic = logicSolve(s.rows, s.cols, clues);
    if (!logic.solved) continue;
    var puzzle = {
      rows: s.rows, cols: s.cols, clues: clues, solution: partition,
      colors: assignColors(clues, COLOR_COUNT, rng),
      score: logic.score, hardest: logic.hardest, difficulty: clues.length ? logic.score / clues.length : 0,
    };
    var d = distance(s, puzzle);
    if (d === 0) return puzzle;
    if (d < bestDistance) { bestDistance = d; best = puzzle; }
  }
  return best;
}

// ── Skeepkaku_Colors: neighbouring numbers get different colours ──

function assignColors(clues, colorCount, rng) {
  var n = clues.length, slots = [], order = [];
  for (var i = 0; i < n; i++) { slots.push(-1); order.push(i); }
  shuffle(order, rng);
  order.forEach(function (c) { slots[c] = bestColor(clues, slots, c, colorCount, rng); });
  for (var pass = 0; pass < 8; pass++) {
    var changed = false;
    order.forEach(function (c) {
      var old = slots[c];
      slots[c] = -1;
      var oldCost = crowding(clues, slots, c, old, -1);
      var best = bestColor(clues, slots, c, colorCount, rng);
      slots[c] = crowding(clues, slots, c, best, -1) < oldCost - 1e-9 ? best : old;
      if (slots[c] !== old) changed = true;
    });
    for (var a = 0; a < n; a++)
      for (var b = a + 1; b < n; b++) {
        var ca = slots[a], cb = slots[b];
        if (ca === cb) continue;
        var before = crowding(clues, slots, a, ca, b) + crowding(clues, slots, b, cb, a);
        var after = crowding(clues, slots, a, cb, b) + crowding(clues, slots, b, ca, a);
        if (after >= before - 1e-9) continue;
        slots[a] = cb;
        slots[b] = ca;
        changed = true;
      }
    if (!changed) break;
  }
  return slots;
}

function bestColor(clues, slots, clue, colorCount, rng) {
  var best = 0, ties = 0, bestCost = Infinity;
  for (var color = 0; color < colorCount; color++) {
    var cost = crowding(clues, slots, clue, color, -1);
    if (cost < bestCost - 1e-9) { bestCost = cost; best = color; ties = 1; }
    else if (Math.abs(cost - bestCost) <= 1e-9 && rng.next(++ties) === 0) best = color;
  }
  return best;
}

function crowding(clues, slots, clue, color, ignore) {
  var cost = 0;
  for (var i = 0; i < clues.length; i++) {
    if (i === clue || i === ignore || slots[i] !== color) continue;
    var dr = clues[i].row - clues[clue].row, dc = clues[i].col - clues[clue].col;
    var d2 = dr * dr + dc * dc;
    cost += 1 / (d2 * d2);
  }
  return cost;
}

function shuffle(list, rng) {
  for (var i = list.length - 1; i > 0; i--) {
    var j = rng.next(i + 1);
    var t = list[i]; list[i] = list[j]; list[j] = t;
  }
}

// ── Packs ──

function packSettings(difficulty) {
  var file = u.unityPath('Assets/SkeepGames/Skeepkaku/Levels', 'LevelPack_' + difficulty + '_000.json');
  var l = JSON.parse(u.read(file)).levels[0];
  return function (rng) {
    var pick = function (a, b) { return Math.min(a, b) + rng.next(Math.abs(b - a) + 1); };
    var clamp = function (v) { return Math.max(MIN_SIDE, Math.min(MAX_SIDE, v)); };
    var minArea = Math.max(MIN_AREA, Math.min(l.areaMin, l.areaMax));
    return {
      rows: clamp(pick(l.rowsMin, l.rowsMax)),
      cols: clamp(pick(l.colsMin, l.colsMax)),
      minArea: minArea,
      maxArea: Math.max(minArea, l.areaMin, l.areaMax),
      minDifficulty: l.limitDifficulty ? Math.min(l.difficultyMin, l.difficultyMax) : 0,
      maxDifficulty: l.limitDifficulty ? Math.max(l.difficultyMin, l.difficultyMax) : 0,
      maxTechnique: l.maxTechnique,
    };
  };
}

var seed = +process.argv[2] || 20261111;
var rng = new Random(seed);
var out = {};
var seen = {};
Object.keys(COUNTS).forEach(function (difficulty) {
  var settingsFor = packSettings(difficulty.charAt(0).toUpperCase() + difficulty.slice(1));
  out[difficulty] = [];
  while (out[difficulty].length < COUNTS[difficulty]) {
    var p = generate(settingsFor(rng), rng);
    var key = p.rows + 'x' + p.cols + ':' + p.clues.map(function (c) { return c.row + ',' + c.col + ',' + c.value; }).join(';');
    if (seen[key]) continue; // never the same puzzle twice
    seen[key] = true;
    out[difficulty].push({
      id: out[difficulty].length + 1,
      rows: p.rows,
      cols: p.cols,
      // [row, col, value] per number, and the colour slot (0–9 of logicGameColors) of each
      clues: p.clues.map(function (c) { return [c.row, c.col, c.value]; }),
      colors: p.colors,
      difficulty: Math.round(p.difficulty * 100) / 100,
      hardest: p.hardest,
    });
  }
  console.log(difficulty + ': ' + out[difficulty].map(function (p) { return p.rows + 'x' + p.cols + ' d' + p.difficulty + ' t' + p.hardest; }).join(', '));
});

var dir = path.resolve(__dirname, '../../src/play/games/skeepkaku');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir, 'levels.json'), JSON.stringify(out) + '\n');
console.log('seed ' + seed + ' → ' + path.join(dir, 'levels.json'));
