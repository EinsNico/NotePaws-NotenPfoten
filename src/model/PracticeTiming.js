// Waiting gives learners half a local beat to complete a grip. Extremely
// fast/slow tempi stay usable; preparation and manual pause supply no delta.
export function practiceWaitToleranceMs(beatDurationMs) {
  const beat = Number.isFinite(beatDurationMs) && beatDurationMs > 0 ? beatDurationMs : 1000;
  return Math.max(250, Math.min(1000, Math.round(beat / 2)));
}

export function practiceTimingKind(offsetMs, onTimeMs, waitToleranceMs = onTimeMs) {
  return offsetMs >= -onTimeMs && offsetMs <= waitToleranceMs
    ? 'correct' : offsetMs < 0 ? 'early' : 'late';
}
