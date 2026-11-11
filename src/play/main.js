import { Feed } from './feed/feed.js';
import { Navigator } from './feed/navigator.js';
import { Chrome } from './shell/chrome.js';

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
new Navigator(app, feed, chrome);
chrome.layout();

// The Next panel is painted once and then waits: give Sora a moment so it is not painted in the
// fallback font. Never longer than this, a slow font must not hold the first game back.
const FONT_WAIT_MS = 800;
const fontsReady = document.fonts
  ? Promise.race([document.fonts.load('700 16px Sora'), new Promise((r) => setTimeout(r, FONT_WAIT_MS))])
  : Promise.resolve();
fontsReady.catch(() => {}).then(() => feed.start());
