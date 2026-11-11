// Reusable pieces for the games, like Skeep.Features in the app.

/**
 * GameSceneManager.PaintCameraBackground: a plain surface-main background. Scenes without a
 * GameSceneGradientBackground on their camera (Embus, Skeepkaku, Collapse, Knives_Out) look like this.
 */
export function drawPlainBackground(ctx, width, height, theme) {
  ctx.fillStyle = theme.surfaceMain;
  ctx.fillRect(0, 0, width, height);
}

/**
 * GameSceneGradientBackground (Amunt, Zzznake): surface-main at the top to surface-lowest at the bottom.
 * `invert` swaps the two ends (Amunt does).
 */
export function drawSceneBackground(ctx, width, height, theme, invert = false) {
  const top = invert ? theme.surfaceLowest : theme.surfaceMain;
  const bottom = invert ? theme.surfaceMain : theme.surfaceLowest;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}
