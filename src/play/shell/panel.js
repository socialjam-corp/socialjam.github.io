import { theme, categoryPalette } from '../theme.js';
import { buildResult } from './result.js';
import { FeedbackLayer } from './feedback.js';

// Canvas resolution is capped at 2x: sharper is invisible on a phone and costs fill rate.
const MAX_DPR = 2;
/** GameSceneManager.SinglePlayerPreResultPresentationDelaySeconds: the game plays on this long. */
const PRE_RESULT_S = 0.5;

/**
 * One feed panel: a canvas for the game, an HTML layer for its HUD and the result veil on top.
 *
 * The game gets a `host` with: gameId, lang, difficulty, canvas, ctx (already scaled to CSS
 * pixels), hud (element over the play area), width, height, insets {top, bottom} (the app chrome
 * over the canvas), dpr, u (one canvas unit in CSS pixels), theme, palette (its category's six
 * tones), text (its own strings in the page's language), strings (the shell's, e.g. the shared
 * feedback words), finish(won), feedback(text, x, y, color, motion), showStartHint(text) and
 * dismissStartHint().
 *
 * The game implements the lifecycle of Docs/Games/05-cicle-de-vida.md, minus what the lite feed
 * does not have: load(level) builds the whole world (the Next panel is painted from the render
 * right after it), start() when the panel becomes Active, pause()/resume(), update(dt) and
 * render() from the feed's single tick, pointerDown/Move/Up(p) with p = {x, y, id} in CSS pixels,
 * resize() and destroy(). update and the pointers only reach the Active panel (N26 and the
 * central tick rule); a standby panel never runs.
 */
export class Panel {
  constructor({ entry, module, level, difficulty, lang, strings, onDecided, onFinish }) {
    this.entry = entry;
    this.gameId = entry.id;
    this.module = module;
    this.level = level;
    this.difficulty = difficulty;
    // loading → ready → active → decided (the short wait before the result) → result → gone
    this.state = 'loading';
    this.paused = false;
    this._onDecided = onDecided;
    this._onFinish = onFinish;
    this._resultIn = 0;
    this.won = false;
    this.finishedAt = 0;

    this.el = document.createElement('section');
    this.el.className = 'panel panel--next';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'panel__canvas';
    this.hud = document.createElement('div');
    this.hud.className = 'panel__hud';
    this.el.append(this.canvas, this.hud);
    this.feedbackLayer = new FeedbackLayer(this.el);

    const allText = module.text || {};
    const palette = categoryPalette(entry.category);
    this.host = {
      gameId: entry.id,
      lang,
      difficulty,
      text: allText[lang] || allText.en || {},
      strings,
      u: 1,
      canvas: this.canvas,
      ctx: this.canvas.getContext('2d'),
      hud: this.hud,
      width: 0,
      height: 0,
      insets: { top: 0, bottom: 0 },
      dpr: 1,
      theme,
      palette,
      finish: (won) => this._finish(won),
      feedback: (text, x, y, color, motion) => {
        if (this.state === 'active' && text) this.feedbackLayer.show(text, x, y, color, this.host.u, motion);
      },
      // The hint is in the game's brightest tone (the theme's contrast tone in dark mode).
      showStartHint: (text, place) => {
        if (text) this.feedbackLayer.showHint(text, palette[0], this.host.u, place);
      },
      dismissStartHint: () => this.feedbackLayer.dismissHint(),
    };
  }

  /** Builds the game world; the panel is ready (N3) once this resolves. */
  async load(size) {
    this.game = this.module.create(this.host);
    this.resize(size, false);
    await this.game.load(this.level);
    if (this.state === 'gone') return;
    this.game.render();
    this.state = 'ready';
  }

  get isReady() {
    return this.state !== 'loading' && this.state !== 'gone';
  }

  /** Only a match being played holds the feed to the navigation band. */
  get isAwaitingInput() {
    return this.state === 'active' || this.state === 'decided';
  }

  resize({ width, height, insets, u }, render = true) {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const h = this.host;
    h.width = width;
    h.height = height;
    h.insets = insets;
    h.u = u;
    h.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    h.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.game) return;
    this.game.resize();
    if (render && this.isReady) this.game.render();
  }

  /** N26: entering the Active slot always starts the game. */
  activate() {
    if (this.state !== 'ready') return;
    this.el.classList.remove('panel--next');
    this.state = 'active';
    this.game.start();
  }

  setPaused(paused) {
    if (this.paused === paused || this.state !== 'active') {
      this.paused = paused;
      return;
    }
    this.paused = paused;
    if (paused) this.game.pause();
    else this.game.resume();
  }

  /** The feed's single tick. The game keeps rendering under the result veil but stops updating. */
  tick(dt) {
    const running = this.state === 'active' && !this.paused;
    // The game keeps playing out its ending (a car driving off, a block falling) until the
    // result covers it.
    if ((running || this.state === 'decided') && !this.paused) this.game.update(dt);
    if (this.state === 'decided' && !this.paused) {
      this._resultIn -= dt;
      if (this._resultIn <= 0) this._presentResult();
    }
    if (this.state !== 'loading' && this.state !== 'gone' && this.state !== 'ready') this.game.render();
    this.feedbackLayer.tick(dt, running);
  }

  pointer(type, event, rect) {
    if (this.state !== 'active' || this.paused) return;
    const p = { x: event.clientX - rect.left, y: event.clientY - rect.top, id: event.pointerId };
    if (type === 'down') {
      this.feedbackLayer.touched();
      this.game.pointerDown(p);
    }
    else if (type === 'move') this.game.pointerMove(p);
    else this.game.pointerUp(p);
  }

  showResult(won, title) {
    this.feedbackLayer.clearHint();
    const veil = buildResult(won, title);
    this.el.append(veil);
    // Next frame, so the veil fades in instead of popping.
    requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('is-shown')));
  }

  destroy() {
    if (this.state === 'gone') return;
    this.state = 'gone';
    if (this.game) this.game.destroy();
    this.el.remove();
  }

  /** The game has decided the match; the input stops here, the result comes a moment later. */
  _finish(won) {
    if (this.state !== 'active') return;
    this.state = 'decided';
    this.won = won;
    this._resultIn = PRE_RESULT_S;
    this.feedbackLayer.clearHint();
    this._onDecided(this, won);
  }

  _presentResult() {
    this.state = 'result';
    this.finishedAt = performance.now();
    this._onFinish(this, this.won);
  }
}
