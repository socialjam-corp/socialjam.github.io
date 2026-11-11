import { loadState, saveState } from '../storage.js';

// Odds for the next level of a game, by that game's previous level. Hard may only follow a Medium,
// and these two rows give an overall share of exactly 30% Easy / 50% Medium / 20% Hard: the chain's
// steady state is E = 0.225·M + 0.375·(E + H), M = 0.375·M + 0.625·(E + H), H = 0.4·M.
// Easy:Medium stays 3:5 in both rows; after a Medium only Hard is added.
const ODDS_AFTER_MEDIUM = { easy: 0.225, medium: 0.375, hard: 0.4 };
const ODDS_OTHERWISE = { easy: 0.375, medium: 0.625, hard: 0 };

const DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Chooses each panel's level (N22): decided once, when the panel is created, and recorded as
 * played right then. Progress is kept per game and survives a reload when storage allows it.
 */
export class LevelPicker {
  constructor() {
    this._state = loadState();
    this._state.games = this._state.games || {};
  }

  /**
   * @param {string} gameId
   * @param {{tutorial?: object[], easy?: object[], medium?: object[], hard?: object[]}} packs
   *   Levels by difficulty; every level has an `id`.
   * @returns {{difficulty: string, level: object}}
   */
  pick(gameId, packs) {
    const game = this._game(gameId);
    // A game serves its tutorial until the player wins it; a loss or a skeep brings it back.
    const difficulty = !game.tutorialWon && hasLevels(packs.tutorial)
      ? 'tutorial'
      : rollDifficulty(game.last === 'medium' ? ODDS_AFTER_MEDIUM : ODDS_OTHERWISE, packs);
    const level = pickAvoidingRecent(packs[difficulty], game.recent, difficulty);
    game.last = difficulty;
    saveState(this._state);
    return { difficulty, level };
  }

  /** A finished match. Only a won tutorial changes what the game serves next. */
  recordResult(gameId, difficulty, won) {
    if (!won || difficulty !== 'tutorial') return;
    this._game(gameId).tutorialWon = true;
    saveState(this._state);
  }

  _game(gameId) {
    const games = this._state.games;
    if (!games[gameId]) games[gameId] = { tutorialWon: false, last: null, recent: {} };
    return games[gameId];
  }
}

function hasLevels(pack) {
  return Array.isArray(pack) && pack.length > 0;
}

function rollDifficulty(odds, packs) {
  // A game without some pack shares that pack's odds among the ones it has.
  let options = DIFFICULTIES.filter((d) => odds[d] > 0 && hasLevels(packs[d]));
  if (options.length === 0) options = DIFFICULTIES.filter((d) => hasLevels(packs[d]));
  if (options.length === 0) return 'tutorial';
  const total = options.reduce((sum, d) => sum + (odds[d] || 1), 0);
  let roll = Math.random() * total;
  for (const d of options) {
    roll -= odds[d] || 1;
    if (roll < 0) return d;
  }
  return options[options.length - 1];
}

function pickAvoidingRecent(pack, recentByDifficulty, difficulty) {
  const recent = recentByDifficulty[difficulty] || [];
  const fresh = pack.filter((level) => recent.indexOf(level.id) === -1);
  const pool = fresh.length > 0 ? fresh : pack;
  const level = pool[Math.floor(Math.random() * pool.length)];
  // Remember half the pack: enough to avoid repeats, small enough to leave a real choice.
  const memory = Math.floor(pack.length / 2);
  recentByDifficulty[difficulty] = recent.concat(level.id).slice(-memory);
  if (memory === 0) recentByDifficulty[difficulty] = [];
  return level;
}
