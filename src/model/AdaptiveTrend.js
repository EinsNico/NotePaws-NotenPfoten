import { normalizeAdaptiveHistory } from "./AdaptiveHistory";

export const ADAPTIVE_TREND_SEGMENT_SIZE = 20;
export const ADAPTIVE_TREND_MIN_SEGMENT_SIZE = 5;

function average(values) {
  if (!values.length) {
    return null;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function createSegment(evaluations, index) {
  const correctFirstTry = evaluations.filter(value => value.correctFirstTry).length;
  const responseTimes = evaluations
    .map(value => value.responseTimeMs)
    .filter(value => Number.isFinite(value) && value > 0);
  const first = evaluations[0];
  const last = evaluations[evaluations.length - 1];

  return {
    id: `adaptive-trend-${first.id}-${last.id}`,
    index,
    startedAt: first.completedAt,
    completedAt: last.completedAt,
    exerciseCount: evaluations.length,
    correctFirstTry,
    accuracy: Math.round(correctFirstTry / evaluations.length * 100),
    averageResponseTimeMs: average(responseTimes),
    isComplete: evaluations.length === ADAPTIVE_TREND_SEGMENT_SIZE
  };
}

export function summarizeAdaptiveTrendHistory(history) {
  const evaluations = normalizeAdaptiveHistory(history).evaluations
    .filter(value => value.completedAt > 0);
  const segments = [];
  let pendingCount = 0;

  for (
    let offset = 0;
    offset < evaluations.length;
    offset += ADAPTIVE_TREND_SEGMENT_SIZE
  ) {
    const values = evaluations.slice(offset, offset + ADAPTIVE_TREND_SEGMENT_SIZE);
    if (values.length < ADAPTIVE_TREND_MIN_SEGMENT_SIZE) {
      pendingCount = values.length;
      break;
    }
    segments.push(createSegment(values, segments.length + 1));
  }

  return {
    segments,
    pendingCount,
    totalEvaluations: evaluations.length,
    requiredForNextPoint: pendingCount > 0
      ? ADAPTIVE_TREND_MIN_SEGMENT_SIZE - pendingCount
      : ADAPTIVE_TREND_MIN_SEGMENT_SIZE
  };
}

export default {
  ADAPTIVE_TREND_SEGMENT_SIZE,
  ADAPTIVE_TREND_MIN_SEGMENT_SIZE,
  summarizeAdaptiveTrendHistory
};
