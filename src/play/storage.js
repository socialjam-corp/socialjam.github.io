// Per-visitor progress in localStorage. It can be missing or throw (private windows, blocked site
// data), so every access is guarded and the feed works the same without it, starting from zero.

const KEY = 'skeep_play_v1';

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    const state = raw ? JSON.parse(raw) : null;
    return state && typeof state === 'object' ? state : {};
  } catch (e) {
    return {};
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    // Nothing to do: the session keeps its progress in memory.
  }
}
