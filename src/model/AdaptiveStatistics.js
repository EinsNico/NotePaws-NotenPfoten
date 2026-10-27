import {
  DEFAULT_DIFFICULTY,
  MIN_CONSOLIDATION_ATTEMPTS,
  createNoteLearningKey,
  getAdaptiveWeight,
  normalizeAdaptiveProgress
} from "./AdaptiveLearning";

export const ADAPTIVE_SECURE_MIN_ATTEMPTS = MIN_CONSOLIDATION_ATTEMPTS;
export const ADAPTIVE_SECURE_MAX_DIFFICULTY = 0.76;

function average(values) {
  if (values.length === 0) {
    return null;
  }
  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length
  );
}

export function getAdaptiveCandidateStatus(record) {
  if (!record || record.attempts < 1) {
    return "unpracticed";
  }
  if (record.difficulty > DEFAULT_DIFFICULTY) {
    return "practice";
  }
  if (
    record.attempts >= ADAPTIVE_SECURE_MIN_ATTEMPTS
    && record.difficulty <= ADAPTIVE_SECURE_MAX_DIFFICULTY
  ) {
    return "secure";
  }
  return "building";
}

function createRankedEntry(progress, candidate, record, key) {
  return {
    key,
    value: candidate.value,
    clef: candidate.clef,
    staff: candidate.staff,
    isSharp: candidate.isSharp,
    attempts: record.attempts,
    accuracy: record.attempts > 0
      ? Math.round(record.correctFirstTry / record.attempts * 100)
      : 0,
    averageResponseTimeMs: record.averageResponseTimeMs,
    difficulty: record.difficulty,
    weight: getAdaptiveWeight(progress, candidate)
  };
}

function compareSafest(first, second) {
  return first.weight - second.weight
    || second.accuracy - first.accuracy
    || (first.averageResponseTimeMs || Infinity)
      - (second.averageResponseTimeMs || Infinity)
    || first.key.localeCompare(second.key);
}

function compareMostDifficult(first, second) {
  return second.weight - first.weight
    || first.accuracy - second.accuracy
    || (second.averageResponseTimeMs || 0)
      - (first.averageResponseTimeMs || 0)
    || first.key.localeCompare(second.key);
}

export function summarizeAdaptiveCandidates(progress, candidates) {
  const normalized = normalizeAdaptiveProgress(progress);
  const uniqueCandidates = [];
  const seenKeys = {};

  (Array.isArray(candidates) ? candidates : []).forEach(candidate => {
    const key = createNoteLearningKey(candidate);
    if (!seenKeys[key]) {
      seenKeys[key] = true;
      uniqueCandidates.push({ candidate, key });
    }
  });

  const summary = {
    totalCandidates: uniqueCandidates.length,
    practicedCandidates: 0,
    attempts: 0,
    correctFirstTry: 0,
    firstTryAccuracy: null,
    averageResponseTimeMs: null,
    statusCounts: {
      secure: 0,
      building: 0,
      practice: 0,
      unpracticed: 0
    },
    safest: null,
    mostDifficult: null
  };
  const responseTimes = [];
  const ranked = [];

  uniqueCandidates.forEach(item => {
    const record = normalized.notes[item.key] || null;
    const status = getAdaptiveCandidateStatus(record);
    summary.statusCounts[status] += 1;
    if (!record || record.attempts < 1) {
      return;
    }

    summary.practicedCandidates += 1;
    summary.attempts += record.attempts;
    summary.correctFirstTry += record.correctFirstTry;
    record.recentResponseTimesMs.forEach(value => responseTimes.push(value));
    if (record.attempts >= ADAPTIVE_SECURE_MIN_ATTEMPTS) {
      ranked.push(createRankedEntry(
        normalized,
        item.candidate,
        record,
        item.key
      ));
    }
  });

  summary.firstTryAccuracy = summary.attempts > 0
    ? Math.round(summary.correctFirstTry / summary.attempts * 100)
    : null;
  summary.averageResponseTimeMs = average(responseTimes);

  if (ranked.length > 0) {
    summary.safest = ranked.slice().sort(compareSafest)[0];
  }
  if (ranked.length > 1) {
    summary.mostDifficult = ranked.slice()
      .sort(compareMostDifficult)
      .find(entry => entry.key !== summary.safest.key);
  }
  return summary;
}

export default {
  ADAPTIVE_SECURE_MIN_ATTEMPTS,
  ADAPTIVE_SECURE_MAX_DIFFICULTY,
  getAdaptiveCandidateStatus,
  summarizeAdaptiveCandidates
};
