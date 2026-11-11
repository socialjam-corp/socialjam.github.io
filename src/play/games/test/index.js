// A placeholder game to exercise the feed shell: it draws something that moves (so a paused or
// standby panel is easy to spot), counts taps, and finishes with the Win / Lose buttons.

import { drawSceneBackground } from '../../features/background.js';

const level = (id) => ({ id });

const PACKS = {
  tutorial: [level(0)],
  easy: [level(1), level(2), level(3)],
  medium: [level(11), level(12), level(13)],
  hard: [level(21), level(22), level(23)],
};

const NAMES = { test_a: 'Test A', test_b: 'Test B', test_c: 'Test C' };

export default {
  text: {
    en: { title: 'Test game', description: 'A placeholder to try the feed. / Tap to count, then press Win or Lose.', descriptionSp: 'Win to clear the tutorial.' },
    ca: { title: 'Joc de prova', description: 'Un joc provisional per provar el feed. / Toca per comptar i prem Win o Lose.', descriptionSp: 'Guanya per superar el tutorial.' },
    es: { title: 'Juego de prueba', description: 'Un juego provisional para probar el feed. / Toca para contar y pulsa Win o Lose.', descriptionSp: 'Gana para superar el tutorial.' },
  },

  levels: () => Promise.resolve(PACKS),

  create: (host) => new TestGame(host),
};

class TestGame {
  constructor(host) {
    this.host = host;
    this.time = 0;
    this.taps = 0;
    this.ripples = [];
  }

  load(levelData) {
    this.level = levelData;
    const button = (label, won) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'flex:1;height:44px;border:0;border-radius:12px;font:700 15px Sora,sans-serif;cursor:pointer;'
        + `background:${won ? this.host.palette[0] : this.host.theme.surfaceLowest};color:${this.host.theme.contentPrimary};`;
      b.addEventListener('click', () => this.host.finish(won));
      return b;
    };
    const bar = document.createElement('div');
    // Above the How to play button, which sits 16 units over the navigation band.
    bar.style.cssText = 'position:absolute;left:calc(64*var(--u));right:calc(64*var(--u));bottom:calc(112*var(--u));display:flex;gap:calc(32*var(--u));';
    bar.append(button('Win', true), button('Lose', false));
    this.host.hud.append(bar);
    return Promise.resolve();
  }

  start() {}
  pause() {}
  resume() {}

  update(dt) {
    this.time += dt;
    this.ripples = this.ripples.filter((r) => (r.age += dt) < 0.6);
  }

  render() {
    const { ctx, width, height, insets, theme, palette, difficulty } = this.host;
    drawSceneBackground(ctx, width, height, theme);

    const playH = height - insets.top - insets.bottom;
    const cx = width / 2;
    const cy = insets.top + playH * 0.42 + Math.sin(this.time * 2.4) * playH * 0.08;
    ctx.fillStyle = palette[0];
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(width, playH) * 0.16, 0, Math.PI * 2);
    ctx.fill();

    for (const r of this.ripples) {
      ctx.strokeStyle = palette[0];
      ctx.globalAlpha = 1 - r.age / 0.6;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 12 + r.age * 90, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.fillStyle = theme.contentPrimary;
    ctx.font = '700 22px Sora, sans-serif';
    ctx.fillText(NAMES[this.host.gameId] || this.host.gameId, cx, insets.top + 48);
    ctx.fillStyle = theme.contentSecondary;
    ctx.font = '400 14px Sora, sans-serif';
    ctx.fillText(`${difficulty} · level ${this.level.id}`, cx, insets.top + 74);
    ctx.fillText(`taps: ${this.taps}`, cx, insets.top + playH * 0.75);
  }

  pointerDown(p) {
    this.taps++;
    this.ripples.push({ x: p.x, y: p.y, age: 0 });
  }

  pointerMove() {}
  pointerUp() {}
  resize() {}
  destroy() {}
}
