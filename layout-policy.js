export function resolveWaterfallWidth({ gridWidth = 0, mainWidth = 0, viewportWidth = 0 } = {}) {
  const measured = [gridWidth, mainWidth, viewportWidth]
    .map(Number)
    .find((value) => Number.isFinite(value) && value > 0);
  return Math.max(280, measured || 0);
}
