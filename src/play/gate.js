// Temporary password screen in front of the play page, while it is a test reached by shared links.
// The page is static, so this only keeps casual visitors out: it is not security. Only the
// password's SHA-256 is stored here; set it with:
//
//   node _src/tools/play-password.js <password>
//
// To remove the gate: delete this file, the #gate block in _src/pages/play.html, its gate* strings,
// the .gate styles in play.css and the unlockGate() call in main.js.

const PASSWORD_SHA256 = '2d133053c0baefa00849fabf60c30061c9f435cf59be7662af13a5c7ac1cf92a';

const KEY = 'skeep_play_unlocked';

/** Resolves once the visitor is in: right away if this browser already unlocked this password. */
export function unlockGate(root) {
  const gate = root.querySelector('#gate');
  const remembered = read() === PASSWORD_SHA256;
  if (!gate || !PASSWORD_SHA256 || remembered) {
    if (gate) gate.remove();
    return Promise.resolve();
  }
  gate.hidden = false;
  const form = gate.querySelector('form');
  const input = gate.querySelector('input');
  const error = gate.querySelector('.gate__error');
  input.focus();
  return new Promise((resolve) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if ((await sha256(input.value)) !== PASSWORD_SHA256) {
        error.hidden = false;
        input.select();
        return;
      }
      write(PASSWORD_SHA256);
      gate.remove();
      resolve();
    });
  });
}

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function read() {
  try {
    return localStorage.getItem(KEY);
  } catch (e) {
    return null;
  }
}

function write(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch (e) {
    // Without storage the password is asked again on the next visit.
  }
}
