// The app chrome that stays put while the panels move: header, navigation band with the Skeep
// button and the divider / AutoScroll bar, How to play and the first-load message.

/** SkeepButton.NavIconUnavailableFadeDuration: each way of the "not yet" fade. */
const WAIT_FADE_MS = 180;

// SkeepGameUI's How to play layout, in canvas units.
const HOWTO_EDGE = 64;
const HOWTO_BOTTOM = 16;
const HOWTO_TOP_MARGIN = 16;
const HOWTO_INNER_BOTTOM = 128; // close button area (32 margin + 64 hit) + 32 gap
const HOWTO_PAUSE_PADDING = 64;

export class Chrome {
  constructor(app) {
    this.app = app;
    this.skeepButton = app.querySelector('#skeep-btn');
    this.barFill = app.querySelector('#feed-divider-fill');
    this.howTo = app.querySelector('#howto');
    this.howToButton = app.querySelector('#howto-btn');
    this.howToClose = app.querySelector('#howto-close');
    this.howToInner = app.querySelector('#howto-inner');
    this.howToTitle = app.querySelector('#howto-title');
    this.howToBody = app.querySelector('#howto-body');
    this.howToVeil = app.querySelector('#howto-veil');
    this.howToPause = app.querySelector('#howto-pause');
    this.loading = app.querySelector('#feed-loading');
    this.nav = app.querySelector('#app-nav');
    this.top = app.querySelector('.app-top');
    this.u = 1;
    this._fadeTimer = 0;

    // The spin restarts every time the Next is ready: drop the class once it has played.
    this.skeepButton.addEventListener('animationend', () => this.skeepButton.classList.remove('is-spinning'));
  }

  /**
   * Sizes the chrome like the Unity UI: a 1080×1920 reference canvas with match 0.5, and the
   * Standard scaffold (UISafeAreaScaffoldArgs): header 10% of the height up to 144 units,
   * navigation 16% up to 300.
   */
  layout() {
    const w = this.app.clientWidth;
    const h = this.app.clientHeight;
    if (!w || !h) return;
    this.u = Math.sqrt((w / 1080) * (h / 1920));
    const style = this.app.style;
    style.setProperty('--u', `${this.u}px`);
    style.setProperty('--header-h', `${Math.min(h * 0.1, 144 * this.u)}px`);
    style.setProperty('--nav-h', `${Math.min(h * 0.16, 300 * this.u)}px`);
    if (this.isHowToOpen) this._sizeHowTo();
  }

  /** Top of the navigation band, in px from the top of the app. */
  get navTop() {
    return this.nav.offsetTop;
  }

  get insets() {
    return { top: this.top.offsetHeight, bottom: this.nav.offsetHeight };
  }

  hideLoading() {
    this.loading.hidden = true;
  }

  /** N7 "ready": the next game is loaded. */
  spin() {
    this.skeepButton.classList.remove('is-spinning');
    // Force a reflow so the animation plays again even if it just ran.
    void this.skeepButton.offsetWidth;
    this.skeepButton.classList.add('is-spinning');
  }

  /** N7 "not yet": the icon fades to the accent and back. */
  flashWaiting() {
    clearTimeout(this._fadeTimer);
    this.skeepButton.classList.add('is-waiting');
    this._fadeTimer = setTimeout(() => this.skeepButton.classList.remove('is-waiting'), WAIT_FADE_MS);
  }

  /** 1 = full bar, 0 = empty. */
  setBar(fraction) {
    this.barFill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
  }

  get isHowToOpen() {
    return this.howTo.classList.contains('is-open');
  }

  /** @param {{title: string, sections: string[]}} text */
  openHowTo(text) {
    this.howToTitle.textContent = text.title;
    this.howToBody.replaceChildren(...text.sections.map((section) => {
      const p = document.createElement('p');
      p.className = 'howto__section';
      p.textContent = section;
      return p;
    }));
    this.howTo.classList.add('is-open');
    this.app.classList.add('is-howto-open');
    this.howToButton.setAttribute('aria-expanded', 'true');
    this._sizeHowTo();
  }

  closeHowTo() {
    if (!this.isHowToOpen) return;
    this.howTo.classList.remove('is-open');
    this.app.classList.remove('is-howto-open');
    this.howToButton.setAttribute('aria-expanded', 'false');
    this.howTo.style.width = '';
    this.howTo.style.height = '';
  }

  /**
   * The card only grows as much as its text needs, up to the space between the "Pause" label
   * and the navigation band; past that the body scrolls (MeasureHowToPlayTargetSize).
   */
  _sizeHowTo() {
    const u = this.u;
    const appH = this.app.clientHeight;
    const headerH = this.top.offsetHeight;
    const navH = this.nav.offsetHeight;
    const width = this.app.clientWidth - 2 * HOWTO_EDGE * u;

    // The text is laid out at the final width from the start, so it does not reflow while the
    // card grows.
    this.howToInner.style.width = `${width}px`;
    const pauseReserve = this.howToPause.offsetHeight + 2 * HOWTO_PAUSE_PADDING * u;
    const maxH = appH - headerH - navH - (HOWTO_BOTTOM + HOWTO_TOP_MARGIN) * u - pauseReserve;
    const needed = this.howToInner.scrollHeight + HOWTO_INNER_BOTTOM * u;
    const height = Math.max(64 * u, Math.min(needed, maxH));
    this.howTo.style.width = `${width}px`;
    this.howTo.style.height = `${height}px`;

    // The label sits halfway between the top of the content area and the top of the card.
    const cardTop = appH - navH - HOWTO_BOTTOM * u - height;
    this.howToPause.style.top = `${(headerH + cardTop) / 2}px`;
  }
}
