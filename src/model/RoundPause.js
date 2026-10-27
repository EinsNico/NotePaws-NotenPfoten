export function adjustTimestampAfterPause(timestampMs, pausedAtMs, resumedAtMs) {
  if (timestampMs === null || timestampMs === undefined) {
    return timestampMs;
  }
  const timestamp = Number(timestampMs);
  const pausedAt = Number(pausedAtMs);
  const resumedAt = Number(resumedAtMs);
  if (
    !Number.isFinite(timestamp)
    || !Number.isFinite(pausedAt)
    || !Number.isFinite(resumedAt)
  ) {
    return timestampMs;
  }
  return timestamp + Math.max(0, resumedAt - pausedAt);
}

export default { adjustTimestampAfterPause };
