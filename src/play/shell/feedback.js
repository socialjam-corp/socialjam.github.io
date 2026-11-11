// In-game texts over a panel: the floating feedback ("Perfect!") and the start hint ("Tap to
// stack"), as GameUIFeedbackService draws them. Sizes are canvas units (u), like the rest of the UI.

/** GameFeedbackMotion.Default. Pixel values are canvas units. */
export const MOTION = {
  scale: 1,
  startLift: 14,
  tilt: true,
  tiltMin: 15,
  tiltMax: 45,
  drift: 108,
  hold: 0.75,
  dissolve: 0.45,
};

// GameUIFeedbackService's hint: 70% up the screen, 1.2× with a 1.08 pulse.
const HINT_HEIGHT_FROM_BOTTOM = 0.68;
const HINT_PULSE_MS = 700;
/** GameSceneManager.StartHintIdleSeconds: the hint comes back after this long without a touch. */
const HINT_REMINDER_S = 30;

export class FeedbackLayer {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'feedback';
    parent.append(this.el);
    this._hint = null;
    this._hintText = null;
    this._idle = 0;
    this._hintWanted = false;
  }

  /**
   * A text that rises from (x, y) and dissolves.
   * @param {object} motion  overrides of MOTION
   */
  show(text, x, y, color, u, motion = {}) {
    const m = { ...MOTION, ...motion };
    const line = this._line(text, color, u, 'feedback__line');
    // The tilt follows the screen side: positive on the left half, negative on the right, from
    // tiltMin at the centre to tiltMax at the edges. Unity's +Z is counter-clockwise.
    const width = this.el.clientWidth || 1;
    const nx = Math.min(1, Math.max(0, x / width));
    const tilt = m.tilt ? (m.tiltMin + (m.tiltMax - m.tiltMin) * Math.abs(nx - 0.5) * 2) * (nx <= 0.5 ? 1 : -1) : 0;
    const total = m.hold + m.dissolve;
    const y0 = y - m.startLift * u;
    const y1 = y0 - m.drift * u * total;
    line.style.left = `${x}px`;
    line.style.top = '0px';
    const frame = (yy) => `translate(-50%, -50%) translateY(${yy}px) rotate(${-tilt}deg) scale(${m.scale})`;
    const anim = line.animate([
      { transform: frame(y0), opacity: 1, offset: 0 },
      { transform: frame(y0 + (y1 - y0) * (m.hold / total)), opacity: 1, offset: m.hold / total },
      { transform: frame(y1), opacity: 0, offset: 1 },
    ], { duration: total * 1000, easing: 'linear', fill: 'forwards' });
    anim.onfinish = () => line.remove();
  }

  /**
   * Shown until dismissHint(); hidden while the panel is paused or showing its result.
   * @param place  optional () => ({ y, align }): where the game wants it, in panel pixels, with
   *               `align` 'top' (the hint hangs below y), 'bottom' (it sits on y) or 'center'.
   *               Asked every frame, so it follows resizes. Without it, the app's default height.
   */
  showHint(text, color, u, place = null) {
    this._hintText = { text, color, u, place };
    this._hintWanted = true;
    this._idle = 0;
    this._renderHint();
  }

  /** The player made the game's first move. The hint may still come back as a reminder. */
  dismissHint() {
    this._hintWanted = false;
    this._idle = 0;
    this._removeHint();
  }

  /** Any touch on the panel restarts the reminder countdown and hides a reminder. */
  touched() {
    this._idle = 0;
    if (!this._hintWanted) this._removeHint();
  }

  /** @param {boolean} running  the game is being played (not paused, no result) */
  tick(dt, running) {
    if (!this._hintText) return;
    if (!running) {
      this._removeHint();
      return;
    }
    this._idle += dt;
    if (this._hintWanted || this._idle >= HINT_REMINDER_S) this._renderHint();
    if (this._hint && this._hintText.place) this._placeHint(this._hint);
  }

  clearHint() {
    this._hintText = null;
    this._hintWanted = false;
    this._removeHint();
  }

  _renderHint() {
    if (this._hint || !this._hintText) return;
    const { text, color, u, place } = this._hintText;
    const hint = this._line(text, color, u, 'feedback__hint');
    const align = place ? this._placeHint(hint) : 'center';
    if (!place) hint.style.top = `${(1 - HINT_HEIGHT_FROM_BOTTOM) * 100}%`;
    // The translate puts the anchored edge on y, and the pulse grows from that edge so it never
    // spills over what the game placed it next to.
    const ty = align === 'top' ? '0%' : align === 'bottom' ? '-100%' : '-50%';
    hint.style.transformOrigin = align === 'top' ? '50% 0' : align === 'bottom' ? '50% 100%' : '50% 50%';
    hint.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: 'forwards' });
    hint.animate(
      [{ transform: `translate(-50%, ${ty}) scale(1.2)` }, { transform: `translate(-50%, ${ty}) scale(1.296)` }],
      { duration: HINT_PULSE_MS, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
    );
    this._hint = hint;
  }

  _placeHint(hint) {
    const { y, align = 'center' } = this._hintText.place();
    hint.style.top = `${y}px`;
    return align;
  }

  _removeHint() {
    if (!this._hint) return;
    const hint = this._hint;
    this._hint = null;
    hint.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = () => hint.remove();
  }

  _line(text, color, u, className) {
    const line = document.createElement('span');
    line.className = className;
    line.textContent = text;
    line.style.color = color;
    line.style.fontSize = `${75 * u}px`;
    // The theme's feedback shadow: the text's own hue at value 0.18, 0.8 alpha, 6 units down.
    line.style.textShadow = `0 ${6 * u}px 0 ${shadowOf(color)}`;
    this.el.append(line);
    return line;
  }
}

function shadowOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const s = max === 0 ? 0 : (max - min) / max;
  // Same hue and saturation, value 0.18: scale the colour so its max channel is 0.18.
  const k = (0.18 * 255) / (max || 1);
  const mix = (c) => Math.round(c * k);
  return s === 0 ? 'rgba(46, 46, 46, 0.8)' : `rgba(${mix(r)}, ${mix(g)}, ${mix(b)}, 0.8)`;
}
