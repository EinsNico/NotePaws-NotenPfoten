function rounded(value) {
  return Math.round(value * 10) / 10 || 0;
}

export function getMusicParallaxOffsets(scrollY) {
  const scroll = Math.max(0, Number(scrollY) || 0);
  // Follow the foreground at a fraction of its speed, then stop before the
  // decoration drifts out of the viewport on very long settings pages.
  const travel = Math.min(scroll, 1200);
  return { sceneY: rounded(-0.18 * travel) };
}
