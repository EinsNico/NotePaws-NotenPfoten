export const SINGLE_NOTES_STATISTICS_VERSION = 1;
export const SINGLE_NOTES_STATISTICS_RECENT_TREND_LIMIT = 50;
export const SINGLE_NOTES_STATISTICS_RECENT_SESSION_LIMIT = 25;
export const SINGLE_NOTES_TREND_SEGMENT_SIZE = 20;

function toNonNegativeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

function toNonNegativeInteger(value) {
  return Math.floor(toNonNegativeNumber(value));
}

function average(total, count) {
  return count > 0 ? Math.round(total / count) : null;
}

function normalizeStatistics(statistics = {}) {
  const attemptCount = toNonNegativeInteger(statistics.attemptCount);
  const correctFirstTryCount = Math.min(
    attemptCount,
    toNonNegativeInteger(statistics.correctFirstTryCount)
  );
  const responseTimeTotalMs = toNonNegativeNumber(
    statistics.responseTimeTotalMs
  );
  const timedAttemptCount = Math.min(
    attemptCount,
    toNonNegativeInteger(statistics.timedAttemptCount)
  );
  return {
    attemptCount,
    correctFirstTryCount,
    mistakeCount: toNonNegativeInteger(statistics.mistakeCount),
    responseTimeTotalMs,
    timedAttemptCount,
    sessionCount: toNonNegativeInteger(statistics.sessionCount),
    lastCompletedAt: toNonNegativeInteger(statistics.lastCompletedAt),
    firstTryAccuracy: attemptCount > 0
      ? Math.round(correctFirstTryCount / attemptCount * 100)
      : null,
    averageResponseTimeMs: average(responseTimeTotalMs, timedAttemptCount)
  };
}

export function normalizeSingleNotesTrendSegment(segment = {}) {
  const exerciseCount = toNonNegativeInteger(segment.attemptCount);
  const correctFirstTry = Math.min(
    exerciseCount,
    toNonNegativeInteger(segment.correctFirstTryCount)
  );
  const responseTimeTotalMs = toNonNegativeNumber(
    segment.responseTimeTotalMs
  );
  const timedAttemptCount = Math.min(
    exerciseCount,
    toNonNegativeInteger(segment.timedAttemptCount)
  );
  return {
    id: String(segment.id || ""),
    index: toNonNegativeInteger(segment.segmentNumber) + 1,
    startedAt: toNonNegativeInteger(segment.startedAt),
    completedAt: toNonNegativeInteger(segment.endedAt),
    exerciseCount,
    correctFirstTry,
    mistakeCount: toNonNegativeInteger(segment.mistakeCount),
    timedAttemptCount,
    accuracy: exerciseCount > 0
      ? Math.round(correctFirstTry / exerciseCount * 100)
      : 0,
    averageResponseTimeMs: average(responseTimeTotalMs, timedAttemptCount),
    isComplete: exerciseCount >= SINGLE_NOTES_TREND_SEGMENT_SIZE
  };
}

export function normalizeSingleNotesTrendSegments(segments) {
  return (Array.isArray(segments) ? segments : [])
    .map(normalizeSingleNotesTrendSegment)
    .sort((left, right) => left.index - right.index);
}

function summarizeOverallTrend(firstSegments, recentSegments, totalCount) {
  if (totalCount < 4) {
    return {
      direction: "insufficient",
      difference: null,
      comparedRounds: totalCount
    };
  }
  const comparisonSize = Math.min(5, Math.floor(totalCount / 2));
  const firstValues = normalizeSingleNotesTrendSegments(firstSegments)
    .filter(segment => segment.exerciseCount >= 5)
    .slice(0, comparisonSize)
    .map(segment => segment.accuracy);
  const latestValues = normalizeSingleNotesTrendSegments(recentSegments)
    .filter(segment => segment.exerciseCount >= 5)
    .slice(-comparisonSize)
    .map(segment => segment.accuracy);
  if (firstValues.length < comparisonSize || latestValues.length < comparisonSize) {
    return {
      direction: "insufficient",
      difference: null,
      comparedRounds: Math.min(firstValues.length, latestValues.length)
    };
  }
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const difference = Math.round(mean(latestValues) - mean(firstValues));
  return {
    direction: difference > 2
      ? "improving"
      : (difference < -2 ? "declining" : "stable"),
    difference: Math.abs(difference),
    comparedRounds: totalCount
  };
}

function normalizeTimeWindow(day, startHour, window = {}) {
  const attemptCount = toNonNegativeInteger(window.attemptCount);
  const correctFirstTryCount = Math.min(
    attemptCount,
    toNonNegativeInteger(window.correctFirstTryCount)
  );
  const responseTimeTotalMs = toNonNegativeNumber(
    window.responseTimeTotalMs
  );
  const timedAttemptCount = Math.min(
    attemptCount,
    toNonNegativeInteger(window.timedAttemptCount)
  );
  return {
    id: `${day}|${startHour}`,
    day,
    startHour,
    endHour: startHour + 2,
    attemptCount,
    correctFirstTryCount,
    mistakeCount: toNonNegativeInteger(window.mistakeCount),
    timedAttemptCount,
    responseTimeTotalMs,
    firstTryAccuracy: attemptCount > 0
      ? Math.round(correctFirstTryCount / attemptCount * 100)
      : null,
    averageResponseTimeMs: average(responseTimeTotalMs, timedAttemptCount)
  };
}

function normalizeTimeBuckets(timeBuckets) {
  return (Array.isArray(timeBuckets) ? timeBuckets : []).reduce(
    (windows, bucket) => {
      const day = String(bucket && bucket.day || "");
      const sourceWindows = bucket && bucket.windowHours === 2 && bucket.windows;
      if (!day || !sourceWindows || typeof sourceWindows !== "object") {
        return windows;
      }
      Object.keys(sourceWindows).forEach(key => {
        const startHour = Number(key);
        if (
          Number.isInteger(startHour)
          && startHour >= 0
          && startHour < 24
          && startHour % 2 === 0
        ) {
          windows.push(normalizeTimeWindow(
            day,
            startHour,
            sourceWindows[key]
          ));
        }
      });
      return windows;
    }, []
  ).sort((left, right) => (
    left.day.localeCompare(right.day) || left.startHour - right.startHour
  ));
}

function normalizeSession(session = {}) {
  const attemptCount = toNonNegativeInteger(session.attemptCount);
  const correctFirstTryCount = Math.min(
    attemptCount,
    toNonNegativeInteger(session.correctFirstTryCount)
  );
  const responseTimeTotalMs = toNonNegativeNumber(
    session.responseTimeTotalMs
  );
  const timedAttemptCount = Math.min(
    attemptCount,
    toNonNegativeInteger(session.timedAttemptCount)
  );
  return {
    id: String(session.id || ""),
    startedAt: toNonNegativeInteger(session.startedAt),
    endedAt: toNonNegativeInteger(session.endedAt),
    attemptCount,
    correctFirstTryCount,
    mistakeCount: toNonNegativeInteger(session.mistakeCount),
    timedAttemptCount,
    firstTryAccuracy: attemptCount > 0
      ? Math.round(correctFirstTryCount / attemptCount * 100)
      : null,
    averageResponseTimeMs: average(responseTimeTotalMs, timedAttemptCount)
  };
}

export function createEmptySingleNotesStatisticsSnapshot(scope = "") {
  return {
    version: SINGLE_NOTES_STATISTICS_VERSION,
    source: "indexeddb",
    scope,
    loadedAt: 0,
    readyForDisplay: false,
    fallbackRequired: true,
    coverage: {
      databaseAttempts: 0,
      legacyEvaluations: 0,
      timedWindowAttempts: 0,
      eventsComplete: false,
      learningTimesComplete: false
    },
    summary: normalizeStatistics(),
    progressRecords: [],
    trend: {
      totalCount: 0,
      pendingCount: 0,
      recent: [],
      overallTrend: summarizeOverallTrend([], [], 0)
    },
    learningTimeWindows: [],
    recentSessions: []
  };
}

export function createSingleNotesStatisticsSnapshot({
  scope = "",
  dashboard = {},
  timeBuckets = [],
  recentSessions = [],
  legacyEvaluationCount = 0,
  loadedAt = Date.now()
} = {}) {
  const summary = normalizeStatistics(dashboard.statistics);
  const learningTimeWindows = normalizeTimeBuckets(timeBuckets);
  const databaseAttempts = summary.attemptCount;
  const legacyEvaluations = toNonNegativeInteger(legacyEvaluationCount);
  const timedWindowAttempts = learningTimeWindows.reduce(
    (total, window) => total + window.attemptCount,
    0
  );
  const eventsComplete = databaseAttempts >= legacyEvaluations;
  const learningTimesComplete = timedWindowAttempts >= databaseAttempts;
  const completeSegmentCount = Math.floor(
    databaseAttempts / SINGLE_NOTES_TREND_SEGMENT_SIZE
  );
  const pendingCount = databaseAttempts % SINGLE_NOTES_TREND_SEGMENT_SIZE;
  const visibleSegmentCount = completeSegmentCount + (pendingCount >= 5 ? 1 : 0);
  const recentTrend = normalizeSingleNotesTrendSegments(dashboard.recentTrend)
    .filter(segment => segment.exerciseCount >= 5)
    .slice(-SINGLE_NOTES_STATISTICS_RECENT_TREND_LIMIT);
  return {
    version: SINGLE_NOTES_STATISTICS_VERSION,
    source: "indexeddb",
    scope,
    loadedAt: toNonNegativeInteger(loadedAt),
    readyForDisplay: eventsComplete && learningTimesComplete,
    fallbackRequired: !(eventsComplete && learningTimesComplete),
    coverage: {
      databaseAttempts,
      legacyEvaluations,
      timedWindowAttempts,
      eventsComplete,
      learningTimesComplete
    },
    summary,
    progressRecords: Array.isArray(dashboard.progress)
      ? dashboard.progress.slice()
      : [],
    trend: {
      totalCount: visibleSegmentCount,
      pendingCount: pendingCount < 5 ? pendingCount : 0,
      recent: recentTrend,
      overallTrend: summarizeOverallTrend(
        dashboard.firstTrend,
        dashboard.recentTrend,
        visibleSegmentCount
      )
    },
    learningTimeWindows,
    recentSessions: (Array.isArray(recentSessions)
      ? recentSessions
      : []).map(normalizeSession)
  };
}

export default {
  SINGLE_NOTES_STATISTICS_VERSION,
  SINGLE_NOTES_STATISTICS_RECENT_TREND_LIMIT,
  SINGLE_NOTES_STATISTICS_RECENT_SESSION_LIMIT,
  SINGLE_NOTES_TREND_SEGMENT_SIZE,
  normalizeSingleNotesTrendSegment,
  normalizeSingleNotesTrendSegments,
  createEmptySingleNotesStatisticsSnapshot,
  createSingleNotesStatisticsSnapshot
};
