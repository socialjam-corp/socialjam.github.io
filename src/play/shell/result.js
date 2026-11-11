// The single-player result, as SkeepGameResultContentBuilder lays it out: a veil over the panel,
// the outcome art in a fixed 600-unit slot and the title under it. The app's streak and peeks
// rows are not part of the lite feed.

/**
 * @param {boolean} won
 * @param {string} title  "Victory" / "Defeat" in the page's language
 * @returns {HTMLElement} the veil, ready to append to the panel
 */
export function buildResult(won, title) {
  const veil = document.createElement('div');
  veil.className = 'result' + (won ? ' result--won' : '');

  const slot = document.createElement('div');
  slot.className = 'result__slot';
  slot.append(icon(`result__outcome icon--${won ? 'victory' : 'defeat'}`));
  if (won) {
    // In the app the logo fills with the player's level progress; the lite feed has no levels,
    // so it is shown full, without the fill animation.
    slot.append(icon('result__logo'));
  }

  const heading = document.createElement('h2');
  heading.className = 'result__title';
  heading.textContent = title;

  veil.append(spacer('result__space-top'), slot, heading, spacer('result__space-bottom'));
  return veil;
}

function icon(className) {
  const el = document.createElement('span');
  el.className = `icon ${className}`;
  return el;
}

function spacer(className) {
  const el = document.createElement('div');
  el.className = className;
  return el;
}
