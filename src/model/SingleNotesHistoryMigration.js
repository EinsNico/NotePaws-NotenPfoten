import {
  normalizeAdaptiveHistory
} from "./AdaptiveHistory.js";

export const SINGLE_NOTES_HISTORY_MIGRATION_VERSION = 1;
export const SINGLE_NOTES_HISTORY_MIGRATION_SESSION_SIZE = 100;

function toNonNegativeInteger(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }
  return Math.floor(numericValue);
}

function normalizeResponseTime(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : null;
}

function canonicalAttempt(attempt) {
  return {
    id: String(attempt && attempt.id || ""),
    noteKey: String(attempt && attempt.noteKey || ""),
    staff: String(attempt && attempt.staff || ""),
    completedAt: toNonNegativeInteger(attempt && attempt.completedAt),
    correctFirstTry: Boolean(attempt && attempt.correctFirstTry),
    mistakeCount: toNonNegativeInteger(attempt && attempt.mistakeCount),
    responseTimeMs: normalizeResponseTime(attempt && attempt.responseTimeMs)
  };
}

function hashText(value, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function attemptHashes(attempt) {
  const serialized = JSON.stringify(canonicalAttempt(attempt));
  return [
    hashText(serialized, 2166136261),
    hashText(serialized.split("").reverse().join(""), 2246822519)
  ];
}

export function createEmptySingleNotesHistoryFingerprint() {
  return {
    version: SINGLE_NOTES_HISTORY_MIGRATION_VERSION,
    count: 0,
    xorForward: 0,
    sumForward: 0,
    xorReverse: 0,
    sumReverse: 0
  };
}

export function normalizeSingleNotesHistoryFingerprint(value) {
  const empty = createEmptySingleNotesHistoryFingerprint();
  if (!value || typeof value !== "object") {
    return empty;
  }
  return {
    version: SINGLE_NOTES_HISTORY_MIGRATION_VERSION,
    count: toNonNegativeInteger(value.count),
    xorForward: Number(value.xorForward) >>> 0,
    sumForward: Number(value.sumForward) >>> 0,
    xorReverse: Number(value.xorReverse) >>> 0,
    sumReverse: Number(value.sumReverse) >>> 0
  };
}

export function extendSingleNotesHistoryFingerprint(fingerprint, attempt) {
  const current = normalizeSingleNotesHistoryFingerprint(fingerprint);
  const hashes = attemptHashes(attempt);
  return {
    version: SINGLE_NOTES_HISTORY_MIGRATION_VERSION,
    count: current.count + 1,
    xorForward: (current.xorForward ^ hashes[0]) >>> 0,
    sumForward: (current.sumForward + hashes[0]) >>> 0,
    xorReverse: (current.xorReverse ^ hashes[1]) >>> 0,
    sumReverse: (current.sumReverse + hashes[1]) >>> 0
  };
}

export function createSingleNotesHistoryFingerprint(attempts) {
  return (Array.isArray(attempts) ? attempts : []).reduce(
    (fingerprint, attempt) => extendSingleNotesHistoryFingerprint(
      fingerprint,
      attempt
    ),
    createEmptySingleNotesHistoryFingerprint()
  );
}

export function singleNotesHistoryFingerprintsEqual(left, right) {
  const first = normalizeSingleNotesHistoryFingerprint(left);
  const second = normalizeSingleNotesHistoryFingerprint(right);
  return first.count === second.count
    && first.xorForward === second.xorForward
    && first.sumForward === second.sumForward
    && first.xorReverse === second.xorReverse
    && first.sumReverse === second.sumReverse;
}

export function formatSingleNotesHistoryFingerprint(value) {
  const fingerprint = normalizeSingleNotesHistoryFingerprint(value);
  return [
    `v${fingerprint.version}`,
    fingerprint.count,
    fingerprint.xorForward.toString(36),
    fingerprint.sumForward.toString(36),
    fingerprint.xorReverse.toString(36),
    fingerprint.sumReverse.toString(36)
  ].join(":");
}

function existingAttemptsById(attempts) {
  return (Array.isArray(attempts) ? attempts : []).reduce((records, attempt) => {
    if (attempt && typeof attempt.id === "string" && attempt.id.length > 0) {
      records[attempt.id] = attempt;
    }
    return records;
  }, Object.create(null));
}

export function createSingleNotesHistoryMigrationPlan(
  history,
  scope,
  existingAttempts = []
) {
  const normalizedScope = String(scope || "");
  const existing = existingAttemptsById(existingAttempts);
  const evaluations = normalizeAdaptiveHistory(history).evaluations;
  const attempts = evaluations.map((evaluation, index) => {
    const previous = existing[evaluation.id];
    return {
      id: evaluation.id,
      sessionId: previous && previous.sessionId
        ? previous.sessionId
        : [
          normalizedScope,
          "legacy-history",
          Math.floor(index / SINGLE_NOTES_HISTORY_MIGRATION_SESSION_SIZE)
        ].join("|"),
      scope: normalizedScope,
      noteKey: evaluation.noteKey,
      staff: evaluation.exercise.staff,
      completedAt: evaluation.completedAt,
      correctFirstTry: evaluation.correctFirstTry,
      mistakeCount: evaluation.mistakeCount,
      responseTimeMs: evaluation.responseTimeMs
    };
  });
  const fingerprint = createSingleNotesHistoryFingerprint(attempts);
  return {
    version: SINGLE_NOTES_HISTORY_MIGRATION_VERSION,
    scope: normalizedScope,
    sourceEvaluationCount: evaluations.length,
    signature: formatSingleNotesHistoryFingerprint(fingerprint),
    fingerprint,
    attempts
  };
}

export function summarizeSingleNotesMigrationAttempts(attempts) {
  const values = Array.isArray(attempts) ? attempts : [];
  return values.reduce((summary, attempt) => {
    summary.attemptCount += 1;
    summary.correctFirstTryCount += attempt.correctFirstTry ? 1 : 0;
    summary.mistakeCount += toNonNegativeInteger(attempt.mistakeCount);
    if (
      Number.isFinite(attempt.responseTimeMs)
      && attempt.responseTimeMs > 0
    ) {
      summary.responseTimeTotalMs += attempt.responseTimeMs;
      summary.timedAttemptCount += 1;
    }
    summary.lastCompletedAt = Math.max(
      summary.lastCompletedAt,
      toNonNegativeInteger(attempt.completedAt)
    );
    return summary;
  }, {
    attemptCount: 0,
    correctFirstTryCount: 0,
    mistakeCount: 0,
    responseTimeTotalMs: 0,
    timedAttemptCount: 0,
    lastCompletedAt: 0
  });
}

function summarizeTimeBuckets(timeBuckets) {
  return (Array.isArray(timeBuckets) ? timeBuckets : []).reduce(
    (summary, bucket) => {
      summary.attemptCount += toNonNegativeInteger(bucket.attemptCount);
      summary.correctFirstTryCount += toNonNegativeInteger(
        bucket.correctFirstTryCount
      );
      summary.mistakeCount += toNonNegativeInteger(bucket.mistakeCount);
      summary.responseTimeTotalMs += Number(bucket.responseTimeTotalMs) || 0;
      summary.timedAttemptCount += toNonNegativeInteger(
        bucket.timedAttemptCount
      );
      return summary;
    }, {
      attemptCount: 0,
      correctFirstTryCount: 0,
      mistakeCount: 0,
      responseTimeTotalMs: 0,
      timedAttemptCount: 0
    }
  );
}

function sameSummary(expected, actual, includeLastCompletedAt = true) {
  const names = [
    "attemptCount",
    "correctFirstTryCount",
    "mistakeCount",
    "responseTimeTotalMs",
    "timedAttemptCount"
  ];
  if (includeLastCompletedAt) {
    names.push("lastCompletedAt");
  }
  return names.every(name => Number(expected[name]) === Number(actual[name]));
}

export function verifySingleNotesHistoryMigration({
  expectedAttempts = [],
  storedAttempts = [],
  dashboard = {},
  timeBuckets = []
} = {}) {
  const expectedFingerprint = createSingleNotesHistoryFingerprint(
    expectedAttempts
  );
  const storedFingerprint = createSingleNotesHistoryFingerprint(storedAttempts);
  const expectedSummary = summarizeSingleNotesMigrationAttempts(expectedAttempts);
  const storedStatistics = dashboard.statistics || {};
  const storedTimeSummary = summarizeTimeBuckets(timeBuckets);
  const fingerprintsEqual = singleNotesHistoryFingerprintsEqual(
    expectedFingerprint,
    storedFingerprint
  );
  const attemptsEqual = fingerprintsEqual
    && expectedAttempts.length === storedAttempts.length
    && expectedAttempts.every((attempt, index) => (
      JSON.stringify(canonicalAttempt(attempt))
        === JSON.stringify(canonicalAttempt(storedAttempts[index]))
    ));
  const statisticsEqual = sameSummary(expectedSummary, storedStatistics);
  const learningTimesEqual = sameSummary(
    expectedSummary,
    storedTimeSummary,
    false
  );
  return {
    verified: attemptsEqual && statisticsEqual && learningTimesEqual,
    attemptsEqual,
    fingerprintsEqual,
    statisticsEqual,
    learningTimesEqual,
    expectedFingerprint,
    storedFingerprint,
    expectedSummary,
    storedStatistics,
    storedTimeSummary
  };
}

export default {
  SINGLE_NOTES_HISTORY_MIGRATION_VERSION,
  SINGLE_NOTES_HISTORY_MIGRATION_SESSION_SIZE,
  createEmptySingleNotesHistoryFingerprint,
  normalizeSingleNotesHistoryFingerprint,
  extendSingleNotesHistoryFingerprint,
  createSingleNotesHistoryFingerprint,
  singleNotesHistoryFingerprintsEqual,
  formatSingleNotesHistoryFingerprint,
  createSingleNotesHistoryMigrationPlan,
  summarizeSingleNotesMigrationAttempts,
  verifySingleNotesHistoryMigration
};
