// Turns the player's input into feed advances (N4: one gesture, one advance) and hands everything
// else to the Active game. Touch and mouse both arrive as pointer events; on desktop the wheel and
// the arrow keys skeep too.

/** NavigatorController.PendingNextSkeepMinUpwardPixels: upward travel that reads as a skeep. */
const SKEEP_MIN_UP_PX = 40;
/** A drag released past half the screen advances; a shorter one snaps back unless flicked. */
const COMMIT_FRACTION = 0.5;
/** Upward speed (px/ms) that commits a short drag. */
const FLICK_SPEED = 0.5;
/** Wheel travel that reads as one skeep, and the pause after it so one scroll is one advance. */
const WHEEL_SKEEP_PX = 40;
const WHEEL_COOLDOWN_MS = 700;

export class Navigator {
  constructor(app, feed, chrome) {
    this.app = app;
    this.feed = feed;
    this.chrome = chrome;
    this._gesture = null;
    this._gamePointer = null;
    this._wheelTravel = 0;
    this._wheelLockedUntil = 0;

    app.addEventListener('pointerdown', (e) => this._down(e));
    app.addEventListener('pointermove', (e) => this._move(e));
    app.addEventListener('pointerup', (e) => this._up(e, false));
    app.addEventListener('pointercancel', (e) => this._up(e, true));
    app.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    app.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this._key(e));

    chrome.howToButton.addEventListener('click', () => feed.toggleHowTo(true));
    chrome.howToClose.addEventListener('click', () => feed.toggleHowTo(false));
    // A tap outside the card closes it (HowToPlayOutsideCloseTap).
    chrome.howToVeil.addEventListener('click', () => feed.toggleHowTo(false));
  }

  _down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.feed.pointersDown.add(e.pointerId);
    // A new touch replaces a gesture whose end never arrived, or it would swallow this one.
    if (this._gesture && this._gesture.follows) this.feed.release(0, false);
    this._gesture = null;

    // Buttons stay buttons (the app's TouchPoint.StartOverUI).
    if (e.target.closest('button, a')) return;

    const rect = this.app.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const inNavBand = y >= this.chrome.navTop;
    // How to play covers the game: the veil's click closes it, nothing reaches the game.
    if (this.chrome.isHowToOpen && !inNavBand) return;

    if (inNavBand || this.feed.allowsSkeepFromContent) {
      const follows = this.feed.canFollowFinger;
      this._gesture = { id: e.pointerId, startY: e.clientY, samples: [{ y: e.clientY, t: e.timeStamp }], follows };
      this.app.setPointerCapture(e.pointerId);
      // The feed cannot move, but the player may still be asking for a skeep: start on the Next now.
      if (!follows) this.feed.warmNext();
      return;
    }

    if (this.feed.active && this._gamePointer === null) {
      this._gamePointer = e.pointerId;
      this.app.setPointerCapture(e.pointerId);
      this.feed.active.pointer('down', e, rect);
    }
  }

  _move(e) {
    const g = this._gesture;
    if (g && g.id === e.pointerId) {
      g.samples.push({ y: e.clientY, t: e.timeStamp });
      if (g.samples.length > 4) g.samples.shift();
      if (g.follows) this.feed.dragTo(g.startY - e.clientY);
      return;
    }
    if (this._gamePointer === e.pointerId && this.feed.active) {
      this.feed.active.pointer('move', e, this.app.getBoundingClientRect());
    }
  }

  _up(e, cancelled) {
    this.feed.pointersDown.delete(e.pointerId);

    const g = this._gesture;
    if (g && g.id === e.pointerId) {
      this._gesture = null;
      const travel = g.startY - e.clientY;
      if (!g.follows) {
        // The feed did not move: it only counts if the player dragged far enough up.
        if (!cancelled && travel >= SKEEP_MIN_UP_PX) this.feed.requestSkeep();
        return;
      }
      const first = g.samples[0];
      const speed = (first.y - e.clientY) / Math.max(1, e.timeStamp - first.t);
      const commit = !cancelled && (travel >= this.app.clientHeight * COMMIT_FRACTION
        || (travel >= SKEEP_MIN_UP_PX && speed >= FLICK_SPEED));
      this.feed.release(travel, commit);
      return;
    }

    if (this._gamePointer === e.pointerId) {
      this._gamePointer = null;
      if (this.feed.active) this.feed.active.pointer('up', e, this.app.getBoundingClientRect());
    }
  }

  _wheel(e) {
    e.preventDefault();
    if (e.deltaY <= 0) {
      this._wheelTravel = 0;
      return;
    }
    // A trackpad keeps sending deltas after the swipe: one scroll, one skeep.
    if (e.timeStamp < this._wheelLockedUntil) return;
    this._wheelTravel += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (this._wheelTravel < WHEEL_SKEEP_PX) return;
    this._wheelTravel = 0;
    this._wheelLockedUntil = e.timeStamp + WHEEL_COOLDOWN_MS;
    this.feed.requestSkeep();
  }

  _key(e) {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('.mobile-menu.is-open')) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      if (!e.repeat) this.feed.requestSkeep();
    } else if (e.key === 'Escape' && this.chrome.isHowToOpen) {
      this.feed.toggleHowTo(false);
    }
  }
}
