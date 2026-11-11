import { Feed } from './feed/feed.js';
import { Navigator } from './feed/navigator.js';
import { Chrome } from './shell/chrome.js';
import { unlockGate } from './gate.js';

const strings = JSON.parse(document.getElementById('play-strings').textContent);
const app = document.getElementById('play-app');
const chrome = new Chrome(app);
const feed = new Feed({
  app,
  track: document.getElementById('feed-track'),
  chrome,
  lang: document.documentElement.lang,
  strings,
});
chrome.layout();

// The Next panel is painted once and then waits: give Sora a moment so it is not painted in the
// fallback font. Never longer than this, a slow font must not hold the first game back.
const FONT_WAIT_MS = 800;
const fontsReady = document.fonts
  ? Promise.race([document.fonts.load('700 16px Sora'), new Promise((r) => setTimeout(r, FONT_WAIT_MS))])
  : Promise.resolve();

// Nothing loads or listens for swipes until the temporary password screen lets the visitor in.
unlockGate(app)
  .then(() => fontsReady.catch(() => {}))
  .then(() => {
    new Navigator(app, feed, chrome);
    feed.start();
  });
