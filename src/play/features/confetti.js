// SkeepConfetti in its 2D form: square pieces burst from a few points, fall, spin and fade.
// Positions and speeds are in world units with y up, like the app; the game converts to pixels.

/** SkeepConfettiSettings.Sprite2D, scaled as BoardPuzzleSceneManager's win confetti (×2, twice the pieces). */
export const BOARD_WIN = {
  count: 60,
  duration: 0.85,          // SkeepConfetti.DefaultDuration
  size: 0.1,
  speedMin: 1.1, speedMax: 2.7,
  upMin: 0.3, upMax: 1.1,
  gravity: 4.8,
  spin: 420,               // degrees per second
};

export class Confetti {
  constructor(settings = BOARD_WIN) {
    this.s = settings;
    this.pieces = [];
  }

  get playing() {
    return this.pieces.length > 0;
  }

  /** Bursts from each origin in turn, in the given colours (the category palette's first four tones). */
  play(origins, colors) {
    const s = this.s;
    this.pieces = [];
    for (let i = 0; i < s.count; i++) {
      const o = origins[i % origins.length];
      const ang = Math.random() * Math.PI * 2;
      const speed = rand(s.speedMin, s.speedMax);
      const life = rand(s.duration * 0.65, s.duration);
      this.pieces.push({
        x: o.x, y: o.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed + rand(s.upMin, s.upMax),
        rot: Math.random() * 360,
        spin: rand(-s.spin, s.spin),
        life, color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  tick(dt) {
    for (const p of this.pieces) {
      p.life -= dt;
      p.vy -= this.s.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    this.pieces = this.pieces.filter((p) => p.life > 0);
  }

  /** @param toPx  (x, y) world → [px, py] */
  draw(ctx, toPx, ppu) {
    const half = (this.s.size * ppu) / 2;
    for (const p of this.pieces) {
      const [x, y] = toPx(p.x, p.y);
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / (this.s.duration * 0.45));
      ctx.translate(x, y);
      ctx.rotate((-p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-half, -half, half * 2, half * 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}
