import {
  DEFAULT_DIFFICULTY,
  MIN_DIFFICULTY,
  MIN_NOTE_TIMED_ATTEMPTS,
  WRONG_DIFFICULTY_INCREASE,
  createNoteLearningKey,
  normalizeAdaptiveProgress,
  normalizeAdaptiveRecord
} from "./AdaptiveLearning";

export const ADAPTIVE_PROGRESS_VIEWS = [
  "treble",
  "bass",
  "piano-treble",
  "piano-bass"
];

const UNPRACTICED_WHITE = "#e5e5e5";
const UNPRACTICED_BLACK = "#555555";
const SIMILAR_RESPONSE_TIME_THRESHOLD_MS = 50;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createProgressViewKey(view, value, notation = "sharp") {
  if (ADAPTIVE_PROGRESS_VIEWS.indexOf(view) === -1) {
    throw new Error("Unknown adaptive progress view.");
  }
  const piano = view.indexOf("piano-") === 0;
  const clef = piano ? view.replace("piano-", "") : view;
  return createNoteLearningKey({
    clef,
    staff: piano ? "piano" : clef,
    value,
    isSharp: notation !== "flat"
  });
}

export function getProgressViewRecord(progress, view, value, notation = "sharp") {
  const normalized = normalizeAdaptiveProgress(progress);
  return normalized.notes[createProgressViewKey(view, value, notation)] || null;
}

export function getProgressHue(record) {
  if (!record) {
    return null;
  }
  const difficulty = normalizeAdaptiveRecord(record).difficulty;
  if (difficulty <= DEFAULT_DIFFICULTY) {
    const progressToGreen = (
      (DEFAULT_DIFFICULTY - difficulty)
      / (DEFAULT_DIFFICULTY - MIN_DIFFICULTY)
    );
    return Math.round(60 + clamp(progressToGreen, 0, 1) * 60);
  }
  const progressToRed = (
    (difficulty - DEFAULT_DIFFICULTY)
    / WRONG_DIFFICULTY_INCREASE
  );
  return Math.round(60 - clamp(progressToRed, 0, 1) * 60);
}

export function getProgressColor(record, blackKey = false) {
  const hue = getProgressHue(record);
  if (hue === null) {
    return blackKey ? UNPRACTICED_BLACK : UNPRACTICED_WHITE;
  }
  return `hsl(${hue}, 68%, ${blackKey ? 42 : 64}%)`;
}

export function getFirstTryAccuracy(record) {
  if (!record || !record.attempts) {
    return null;
  }
  const normalized = normalizeAdaptiveRecord(record);
  return Math.round(normalized.correctFirstTry / normalized.attempts * 100);
}

export function getResponseTimeComparison(record, personalBaselineMs) {
  if (
    !record
    || !Number.isFinite(Number(personalBaselineMs))
    || Number(personalBaselineMs) <= 0
  ) {
    return null;
  }
  const normalized = normalizeAdaptiveRecord(record);
  if (
    normalized.timedAttempts < MIN_NOTE_TIMED_ATTEMPTS
    || normalized.averageResponseTimeMs === null
  ) {
    return null;
  }
  const differenceMs = Math.round(
    normalized.averageResponseTimeMs - Number(personalBaselineMs)
  );
  if (Math.abs(differenceMs) <= SIMILAR_RESPONSE_TIME_THRESHOLD_MS) {
    return { direction: "similar", differenceMs: 0 };
  }
  return {
    direction: differenceMs < 0 ? "faster" : "slower",
    differenceMs: Math.abs(differenceMs)
  };
}

export default {
  createProgressViewKey,
  getProgressViewRecord,
  getProgressHue,
  getProgressColor,
  getFirstTryAccuracy,
  getResponseTimeComparison
};
