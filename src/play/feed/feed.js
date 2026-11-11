import { GAMES, FIRST_GAME } from '../games/registry.js';
import { LevelPicker } from './levels.js';
import { Panel } from '../shell/panel.js';

// The lite feed: the single-player part of Docs/Feed/01-normes-del-feed.md. Rules that only exist
// for duels, challenges, groups, peeks or ads (N2, N5, N9–N11, N13, N15, N17, N20, N24, N25, N27)
// have nothing to act on here and are left out on purpose.

/** SkeepGameResultOverlay.ResultDisplayDurationSeconds: the post-match AutoScroll bar (N8). */
const RESULT_BAR_SECONDS = 3;
/** N7: a skeep made without a ready Next still advances if the panel arrives within this. */
const PENDING_SKEEP_MS = 1000;
/** GameScreen.PostGameResultContentSkeepGraceSeconds: the finger may still be playing. */
const CONTENT_SKEEP_GRACE_MS = 500;
/** N23: a first try and a couple of retries, then another game. */
const LOAD_ATTEMPTS = 3;
/** Fallback for a transitionend that never comes (tab hidden mid-animation). */
const ADVANCE_ANIMATION_MS = 350;
/** A long frame (tab switch, debugger) must not teleport the game. */
const MAX_FRAME_SECONDS = 0.1;

export class Feed {
  constructor({ app, track, chrome, lang, strings }) {
    this.app = app;
    this.track = track;
    this.chrome = chrome;
    this.lang = lang;
    this.strings = strings;
    this.picker = new LevelPicker();

    /** N1: Active and Next, nothing else. */
    this.active = null;
    this.next = null;

    /** Fingers (or the mouse button) down anywhere on the app: they hold the AutoScroll bar. */
    this.pointersDown = new Set();

    this._advancing = false;
    this._fillingNext = false;
    this._pendingSkeepUntil = 0;
    this._barRemaining = null;
    this._failedGames = new Set();
    this._modules = new Map();
    this._listeners = [];
    this._lastFrame = 0;
  }

  /** Called with {gameId, difficulty, finished, won} each time the player leaves a panel. */
  onPanelLeft(listener) {
    this._listeners.push(listener);
  }

  async start() {
    // N19: the feed opens on the first game and nothing else.
    this.active = await this._createPanelWithFallback(FIRST_GAME);
    if (!this.active) return;
    this.chrome.hideLoading();
    this.active.activate();
    this._fillNext();

    new ResizeObserver(() => this._resize()).observe(this.app);
    document.addEventListener('visibilitychange', () => this._syncPause());
    requestAnimationFrame((t) => this._frame(t));
  }

  // ── Gestures ──

  /** The feed follows the finger only with a ready Next to show underneath (N3). */
  get canFollowFinger() {
    return !this._advancing && !!this.next && this.next.isReady;
  }

  /**
   * Swipes from the game area are only for panels that are not being played (GameScreen's
   * AllowsSkeepFromContent); while playing, only from the navigation band.
   */
  get allowsSkeepFromContent() {
    const panel = this.active;
    if (!panel || this._advancing || panel.isAwaitingInput) return false;
    return panel.state !== 'result' || performance.now() - panel.finishedAt >= CONTENT_SKEEP_GRACE_MS;
  }

  /**
   * A skeep from the button, the keyboard, the wheel or a swipe the feed could not follow.
   * N4 / N7b: while one is being served, the others are dropped, not queued.
   */
  requestSkeep() {
    if (this._advancing || !this.active) return;
    if (this.canFollowFinger) {
      this._advance(0);
      return;
    }
    // N7: accept the gesture without moving, say "not yet", and serve it if the Next arrives soon.
    // Another swipe while waiting renews the window instead of queueing a second skeep.
    this.chrome.flashWaiting();
    this._pendingSkeepUntil = performance.now() + PENDING_SKEEP_MS;
    this._fillNext();
  }

  /** The Next starts loading while the finger is still down, if it is missing. */
  warmNext() {
    this._fillNext();
  }

  dragTo(offset) {
    if (!this.canFollowFinger) return;
    this.track.classList.remove('is-animating');
    this.track.style.transform = `translateY(${-Math.max(0, Math.min(offset, this.app.clientHeight))}px)`;
  }

  release(offset, commit) {
    if (commit && this.canFollowFinger) {
      this._advance(offset);
      return;
    }
    this._animateTrack(0);
    // N7: the Next went away mid-drag; the gesture still asks for it instead of vanishing.
    if (commit) this.requestSkeep();
  }

  // ── How to play ──

  toggleHowTo(open = !this.chrome.isHowToOpen) {
    if (!open) this.chrome.closeHowTo();
    else if (this.active) this.chrome.openHowTo(this._text(this.active));
    this._syncPause();
  }

  // ── Internals ──

  _advance(fromOffset) {
    this._advancing = true;
    this._pendingSkeepUntil = 0;
    this._barRemaining = null;
    this.chrome.setBar(0);
    this.chrome.closeHowTo();

    const leaving = this.active;
    const arriving = this.next;
    // N18: a match left halfway is lost; only a finished one counts as played to the end.
    // A skeep during the short wait before the result still counts the decided result.
    const finished = leaving.state === 'result' || leaving.state === 'decided';
    this._emit({ gameId: leaving.gameId, difficulty: leaving.difficulty, finished, won: finished && leaving.won });
    leaving.setPaused(true);

    this.track.classList.remove('is-animating');
    this.track.style.transform = `translateY(${-fromOffset}px)`;
    // Commit the start position before animating, or the browser skips the transition.
    void this.track.offsetHeight;
    this._animateTrack(this.app.clientHeight, () => {
      leaving.destroy();
      this.track.classList.remove('is-animating');
      this.track.style.transform = '';
      this.active = arriving;
      this.next = null;
      this._advancing = false;
      // N26: the slot is written and the panel activated in the same step.
      arriving.activate();
      this._syncPause();
      this._fillNext();
    });
  }

  _animateTrack(offset, done) {
    this.track.classList.add('is-animating');
    this.track.style.transform = `translateY(${-offset}px)`;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.track.removeEventListener('transitionend', onEnd);
      if (done) done();
      else this.track.classList.remove('is-animating');
    };
    const onEnd = (e) => {
      if (e.target === this.track) finish();
    };
    this.track.addEventListener('transitionend', onEnd);
    setTimeout(finish, ADVANCE_ANIMATION_MS);
  }

  async _fillNext() {
    if (this.next || this._fillingNext || !this.active) return;
    this._fillingNext = true;
    const panel = await this._createPanelWithFallback(this._pickNextGame());
    this._fillingNext = false;
    if (!panel) return;
    this.next = panel;
    // N7: the icon turns when the next game is ready to be served.
    this.chrome.spin();

    // A skeep made while it loaded (N7), or an AutoScroll bar that already ran out (N8).
    const skeepPending = performance.now() <= this._pendingSkeepUntil;
    const barDone = this._barRemaining !== null && this._barRemaining <= 0;
    if (skeepPending || barDone) this._advance(0);
  }

  /** N12: never the game that is on screen. N23: not one that just failed to load. */
  _pickNextGame() {
    const activeId = this.active && this.active.gameId;
    let options = GAMES.filter((g) => g.id !== activeId && !this._failedGames.has(g.id));
    if (options.length === 0) options = GAMES.filter((g) => g.id !== activeId);
    if (options.length === 0) options = GAMES;
    return options[Math.floor(Math.random() * options.length)].id;
  }

  /** N23: retry a couple of times, then try another game; the player only ever sees a Next arrive. */
  async _createPanelWithFallback(gameId) {
    const tried = new Set();
    let id = gameId;
    while (id) {
      tried.add(id);
      for (let attempt = 1; attempt <= LOAD_ATTEMPTS; attempt++) {
        try {
          return await this._createPanel(GAMES.find((g) => g.id === id));
        } catch (err) {
          console.warn(`[feed] ${id}: load attempt ${attempt} failed`, err);
        }
      }
      this._failedGames.add(id);
      const left = GAMES.filter((g) => !tried.has(g.id) && (!this.active || g.id !== this.active.gameId));
      id = left.length > 0 ? left[Math.floor(Math.random() * left.length)].id : null;
    }
    console.error('[feed] no game could be loaded');
    return null;
  }

  async _createPanel(entry) {
    const module = await this._module(entry);
    const packs = await module.levels();
    const { difficulty, level } = this.picker.pick(entry.id, packs);
    const panel = new Panel({
      entry,
      module,
      level,
      difficulty,
      lang: this.lang,
      strings: this.strings,
      onDecided: (p, won) => this._onDecided(p, won),
      onFinish: (p, won) => this._onFinish(p, won),
    });
    this.track.append(panel.el);
    try {
      await panel.load(this._size());
    } catch (err) {
      panel.destroy();
      throw err;
    }
    return panel;
  }

  _module(entry) {
    if (!this._modules.has(entry.id)) {
      const loading = entry.load().then((m) => m.default);
      // A failed import must be retried for real, not answered from the cache.
      loading.catch(() => this._modules.delete(entry.id));
      this._modules.set(entry.id, loading);
    }
    return this._modules.get(entry.id);
  }

  /** The match is decided; the result screen follows after the panel's short delay. */
  _onDecided(panel, won) {
    this.picker.recordResult(panel.gameId, panel.difficulty, won);
  }

  _onFinish(panel, won) {
    panel.showResult(won, won ? this.strings.resultVictory : this.strings.resultDefeat);
    // N8: the post-match bar. It only drains with no finger on the screen, and always advances.
    this._barRemaining = RESULT_BAR_SECONDS;
    this.chrome.setBar(1);
  }

  _frame(time) {
    const dt = this._lastFrame ? Math.min((time - this._lastFrame) / 1000, MAX_FRAME_SECONDS) : 0;
    this._lastFrame = time;

    if (this._barRemaining !== null && !this._advancing) {
      const held = this.pointersDown.size > 0 || this.chrome.isHowToOpen || document.hidden;
      if (!held) this._barRemaining = Math.max(0, this._barRemaining - dt);
      this.chrome.setBar(this._barRemaining / RESULT_BAR_SECONDS);
      // Empty with no Next yet: _fillNext advances as soon as it lands.
      if (this._barRemaining <= 0 && this.canFollowFinger) this._advance(0);
    }

    if (this.active) this.active.tick(dt);
    requestAnimationFrame((t) => this._frame(t));
  }

  _syncPause() {
    if (this.active) this.active.setPaused(document.hidden || this.chrome.isHowToOpen);
  }

  _size() {
    return { width: this.app.clientWidth, height: this.app.clientHeight, insets: this.chrome.insets, u: this.chrome.u };
  }

  _resize() {
    this.chrome.layout();
    const size = this._size();
    if (this.active) this.active.resize(size);
    if (this.next) this.next.resize(size);
  }

  /**
   * SkeepGameUI's How to play: the game's title, then its description split at every "/" into
   * capsules, then its single-player line. The app has no generic single-player capsule.
   */
  _text(panel) {
    const all = panel.module.text || {};
    const text = all[this.lang] || all.en || {};
    const sections = (text.description || '').split('/')
      .concat(text.descriptionSp || [])
      .map((s) => s.trim())
      .filter(Boolean);
    return { title: text.title || panel.gameId, sections };
  }

  _emit(event) {
    for (const listener of this._listeners) listener(event);
  }
}
