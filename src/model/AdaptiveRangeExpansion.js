import { createAdaptiveCandidates } from "./AdaptiveExercises";
import {
  MIN_CONSOLIDATION_ATTEMPTS,
  createNoteLearningKey,
  normalizeAdaptiveProgress
} from "./AdaptiveLearning";
import {
  getAdaptiveCandidateStatus
} from "./AdaptiveStatistics";
import {
  getCustomRangeLimits,
  getNoteRange,
  getNaturalNoteValues,
  usesCustomClefAssignment
} from "./NoteRanges";
import { normalizeSingleNoteClefs } from "./ClefSelection";

export const RANGE_EXPANSION_MIN_ATTEMPTS = MIN_CONSOLIDATION_ATTEMPTS;
export const RANGE_EXPANSION_MIN_SECURE_PERCENT = 85;
export const RANGE_EXPANSION_MIN_RECENT_ACCURACY_PERCENT = 85;
export const RANGE_EXPANSION_MIN_TIMED_PERCENT = 85;
export const RANGE_EXPANSION_MIN_TIMED_ATTEMPTS = 3;
export const RANGE_EXPANSION_MAX_RESPONSE_TIME_MS = 3000;

function average(values) {
  if (values.length === 0) {
    return null;
  }
  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length
  );
}

function percentage(part, total) {
  return total > 0 ? Math.round(part / total * 100) : 0;
}

function meetsPercentage(part, total, minimumPercent) {
  return total > 0 && part * 100 >= total * minimumPercent;
}

function findPreviousNaturalNote(value, minimum) {
  return getNaturalNoteValues()
    .filter(noteValue => noteValue < value && noteValue >= minimum)
    .slice(-1)[0];
}

function findNextNaturalNote(value, maximum) {
  return getNaturalNoteValues()
    .find(noteValue => noteValue > value && noteValue <= maximum);
}

function getExpansionRange(options, limits) {
  const clefs = normalizeSingleNoteClefs(options.clef);
  const independent = usesCustomClefAssignment(clefs);
  const bassOnly = !independent && clefs[0] === "bass";
  const lowerProperty = independent || bassOnly
    ? "customMinValue" : "customTrebleMinValue";
  const upperProperty = bassOnly ? "customBassMaxValue" : "customMaxValue";
  const range = independent ? { min: limits.min, max: limits.max } : getNoteRange(
    bassOnly ? "bass" : "treble",
    "custom",
    bassOnly || options.customTrebleMinValue === undefined
      ? options.customMinValue : options.customTrebleMinValue,
    !bassOnly || options.customBassMaxValue === undefined
      ? options.customMaxValue : options.customBassMaxValue
  );
  return { min: range.min, max: range.max, lowerProperty, upperProperty, independent };
}

export function createAdaptiveRangeRecommendations(options) {
  const source = options || {};
  const limits = getCustomRangeLimits(
    source.customMinValue,
    source.customMaxValue,
    source.customTrebleMinValue,
    source.customBassMaxValue
  );
  const range = getExpansionRange(source, limits);
  const recommendations = [];
  const lowerValue = findPreviousNaturalNote(range.min, -Infinity);
  const upperValue = findNextNaturalNote(range.max, Infinity);

  if (lowerValue !== undefined) {
    recommendations.push({
      id: "range-lower",
      group: "range",
      direction: "lower",
      value: lowerValue,
      currentValue: range.min
    });
  }
  if (upperValue !== undefined) {
    recommendations.push({
      id: "range-upper",
      group: "range",
      direction: "upper",
      value: upperValue,
      currentValue: range.max
    });
  }

  if (range.independent) {
    const lowerTrebleValue = findPreviousNaturalNote(
      limits.trebleMin,
      -Infinity
    );
    const upperBassValue = findNextNaturalNote(
      limits.bassMax,
      Infinity
    );
    if (lowerTrebleValue !== undefined) {
      recommendations.push({
        id: "treble-lower",
        group: "clef",
        direction: "lower",
        value: lowerTrebleValue,
        currentValue: limits.trebleMin
      });
    }
    if (upperBassValue !== undefined) {
      recommendations.push({
        id: "bass-upper",
        group: "clef",
        direction: "upper",
        value: upperBassValue,
        currentValue: limits.bassMax
      });
    }
  }

  return recommendations;
}

export function evaluateAdaptiveRangeExpansion(progress, options) {
  const normalized = normalizeAdaptiveProgress(progress);
  const candidates = createAdaptiveCandidates(options);
  const uniqueCandidates = [];
  const seenKeys = Object.create(null);

  candidates.forEach(candidate => {
    const key = createNoteLearningKey(candidate);
    if (!seenKeys[key]) {
      seenKeys[key] = true;
      uniqueCandidates.push({ candidate, key });
    }
  });

  let practicedEnoughCount = 0;
  let secureCount = 0;
  let timedEnoughCount = 0;
  let recentCorrect = 0;
  let recentAttempts = 0;
  const responseTimes = [];

  uniqueCandidates.forEach(item => {
    const record = normalized.notes[item.key];
    if (!record) {
      return;
    }
    if (record.attempts >= RANGE_EXPANSION_MIN_ATTEMPTS) {
      practicedEnoughCount += 1;
    }
    if (getAdaptiveCandidateStatus(record) === "secure") {
      secureCount += 1;
    }
    if (
      record.timedAttempts >= RANGE_EXPANSION_MIN_TIMED_ATTEMPTS
      && record.averageResponseTimeMs !== null
    ) {
      timedEnoughCount += 1;
    }
    record.recentResults.forEach(result => {
      recentAttempts += 1;
      recentCorrect += result === true ? 1 : 0;
    });
    record.recentResponseTimesMs.forEach(value => responseTimes.push(value));
  });

  const totalCandidates = uniqueCandidates.length;
  const securePercent = percentage(secureCount, totalCandidates);
  const recentAccuracyPercent = percentage(recentCorrect, recentAttempts);
  const timedPercent = percentage(timedEnoughCount, totalCandidates);
  const averageResponseTimeMs = average(responseTimes);
  const blockers = [];

  if (totalCandidates === 0) {
    blockers.push("empty");
  }
  if (practicedEnoughCount < totalCandidates) {
    blockers.push("practice");
  }
  if (!meetsPercentage(
    secureCount,
    totalCandidates,
    RANGE_EXPANSION_MIN_SECURE_PERCENT
  )) {
    blockers.push("secure");
  }
  if (!meetsPercentage(
    recentCorrect,
    recentAttempts,
    RANGE_EXPANSION_MIN_RECENT_ACCURACY_PERCENT
  )) {
    blockers.push("accuracy");
  }
  if (!meetsPercentage(
    timedEnoughCount,
    totalCandidates,
    RANGE_EXPANSION_MIN_TIMED_PERCENT
  )) {
    blockers.push("timing");
  }
  if (
    averageResponseTimeMs === null
    || averageResponseTimeMs > RANGE_EXPANSION_MAX_RESPONSE_TIME_MS
  ) {
    blockers.push("speed");
  }

  return {
    ready: blockers.length === 0,
    blockers,
    recommendations: createAdaptiveRangeRecommendations(options),
    metrics: {
      totalCandidates,
      practicedEnoughCount,
      secureCount,
      securePercent,
      recentAccuracyPercent,
      timedEnoughCount,
      timedPercent,
      averageResponseTimeMs
    }
  };
}

export function applyAdaptiveRangeRecommendation(options, recommendationId) {
  const recommendation = createAdaptiveRangeRecommendations(options)
    .find(item => item.id === recommendationId);
  if (!recommendation) {
    throw new Error("Unknown or unavailable adaptive range recommendation.");
  }

  const updated = Object.assign({}, options, {
    clef: Array.isArray(options.clef) ? options.clef.slice() : options.clef
  });
  const range = getExpansionRange(options, getCustomRangeLimits(
    options.customMinValue,
    options.customMaxValue,
    options.customTrebleMinValue,
    options.customBassMaxValue
  ));
  switch (recommendation.id) {
    case "range-lower":
      updated[range.lowerProperty] = recommendation.value;
      break;
    case "range-upper":
      updated[range.upperProperty] = recommendation.value;
      break;
    case "treble-lower":
      updated.customTrebleMinValue = recommendation.value;
      break;
    case "bass-upper":
      updated.customBassMaxValue = recommendation.value;
      break;
    default:
      throw new Error("Unsupported adaptive range recommendation.");
  }
  return updated;
}

export default {
  RANGE_EXPANSION_MIN_ATTEMPTS,
  RANGE_EXPANSION_MIN_SECURE_PERCENT,
  RANGE_EXPANSION_MIN_RECENT_ACCURACY_PERCENT,
  RANGE_EXPANSION_MIN_TIMED_PERCENT,
  RANGE_EXPANSION_MIN_TIMED_ATTEMPTS,
  RANGE_EXPANSION_MAX_RESPONSE_TIME_MS,
  createAdaptiveRangeRecommendations,
  evaluateAdaptiveRangeExpansion,
  applyAdaptiveRangeRecommendation
};
