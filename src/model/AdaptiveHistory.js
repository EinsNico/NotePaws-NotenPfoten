import {
  combineAdaptiveRecords,
  createAdaptiveProgress,
  createNoteLearningKey,
  normalizeAdaptiveProgress,
  normalizeResponseTimeMs,
  updateAdaptiveProgress
} from "./AdaptiveLearning.js";
import { canonicalize } from "./CanonicalJson";

export const ADAPTIVE_HISTORY_VERSION = 1;
export const ADAPTIVE_HISTORY_STORAGE_KEY = "adaptiveHistory";

let adaptiveEvaluationIdSequence = 0;

function toNonNegativeInteger(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }
  return Math.floor(numericValue);
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getProgressAttemptCount(progress) {
  const normalized = normalizeAdaptiveProgress(progress);
  return Object.keys(normalized.notes).reduce(
    (total, key) => total + normalized.notes[key].attempts,
    0
  );
}

function createLegacyBaseline(progress) {
  const normalized = normalizeAdaptiveProgress(progress);
  if (getProgressAttemptCount(normalized) === 0) {
    return null;
  }
  const fingerprint = JSON.stringify(canonicalize(normalized));
  return {
    id: [
      "adaptive-baseline",
      hashText(fingerprint),
      hashText(fingerprint.split("").reverse().join(""))
    ].join("-"),
    progress: normalized
  };
}

function normalizeBaseline(baseline) {
  if (!baseline || typeof baseline !== "object") {
    return null;
  }
  const progress = normalizeAdaptiveProgress(baseline.progress);
  if (getProgressAttemptCount(progress) === 0) {
    return null;
  }
  const generated = createLegacyBaseline(progress);
  return {
    id: typeof baseline.id === "string" && baseline.id.length > 0
      ? baseline.id
      : generated.id,
    progress
  };
}

export function createAdaptiveEvaluationId(completedAt = Date.now()) {
  adaptiveEvaluationIdSequence += 1;
  const randomValue = Math.floor(Math.random() * 0x100000000).toString(36);
  const randomPart = ("0000000" + randomValue).slice(-7);
  return [
    "adaptive",
    Math.round(completedAt).toString(36),
    adaptiveEvaluationIdSequence.toString(36),
    randomPart
  ].join("-");
}

function normalizeExercise(exercise) {
  if (!exercise || typeof exercise !== "object") {
    return null;
  }
  const value = Number(exercise.value);
  if (typeof exercise.clef !== "string" || !Number.isFinite(value)) {
    return null;
  }
  return {
    clef: exercise.clef,
    staff: typeof exercise.staff === "string"
      ? exercise.staff
      : exercise.clef,
    value: Math.round(value),
    isSharp: exercise.isSharp !== false
  };
}

export function createAdaptiveEvaluation(
  exercise,
  wasCorrectFirstTry,
  mistakeCount = 0,
  responseTimeMs = null,
  context = {}
) {
  const normalizedExercise = normalizeExercise(exercise);
  if (!normalizedExercise) {
    throw new Error("An adaptive evaluation needs a valid exercise.");
  }
  const completedAt = toNonNegativeInteger(
    context.completedAt === undefined ? Date.now() : context.completedAt
  );
  const correctFirstTry = wasCorrectFirstTry === true;
  return {
    schemaVersion: ADAPTIVE_HISTORY_VERSION,
    id: context.id || createAdaptiveEvaluationId(completedAt),
    completedAt,
    noteKey: createNoteLearningKey(normalizedExercise),
    exercise: normalizedExercise,
    correctFirstTry,
    mistakeCount: correctFirstTry
      ? 0
      : Math.max(1, toNonNegativeInteger(mistakeCount)),
    responseTimeMs: correctFirstTry
      ? normalizeResponseTimeMs(responseTimeMs)
      : null
  };
}

export function normalizeAdaptiveEvaluation(evaluation) {
  if (
    !evaluation
    || typeof evaluation !== "object"
    || typeof evaluation.id !== "string"
    || evaluation.id.length === 0
  ) {
    return null;
  }
  const completedAt = Number(evaluation.completedAt);
  if (!Number.isFinite(completedAt) || completedAt < 0) {
    return null;
  }
  const exercise = normalizeExercise(evaluation.exercise);
  if (!exercise) {
    return null;
  }
  const normalized = createAdaptiveEvaluation(
    exercise,
    evaluation.correctFirstTry === true,
    evaluation.mistakeCount,
    evaluation.responseTimeMs,
    {
      id: evaluation.id,
      completedAt
    }
  );
  if (
    typeof evaluation.noteKey === "string"
    && evaluation.noteKey !== normalized.noteKey
    && !(
      exercise.staff === "piano"
      && evaluation.noteKey === `piano-${normalized.noteKey}`
    )
  ) {
    return null;
  }
  return normalized;
}

export function createAdaptiveHistory(progress = createAdaptiveProgress()) {
  const baseline = createLegacyBaseline(progress);
  return {
    version: ADAPTIVE_HISTORY_VERSION,
    baselines: baseline ? [baseline] : [],
    evaluations: []
  };
}

export function normalizeAdaptiveHistory(history) {
  const normalized = createAdaptiveHistory();
  if (!history || typeof history !== "object") {
    return normalized;
  }
  const seenBaselineIds = Object.create(null);
  if (Array.isArray(history.baselines)) {
    history.baselines.forEach(value => {
      const baseline = normalizeBaseline(value);
      if (baseline && !seenBaselineIds[baseline.id]) {
        seenBaselineIds[baseline.id] = true;
        normalized.baselines.push(baseline);
      }
    });
  }
  const seenEvaluationIds = Object.create(null);
  if (Array.isArray(history.evaluations)) {
    history.evaluations.forEach(value => {
      const evaluation = normalizeAdaptiveEvaluation(value);
      if (evaluation && !seenEvaluationIds[evaluation.id]) {
        seenEvaluationIds[evaluation.id] = true;
        normalized.evaluations.push(evaluation);
      }
    });
  }
  normalized.evaluations.sort((left, right) => (
    left.completedAt - right.completedAt || left.id.localeCompare(right.id)
  ));
  return normalized;
}

export function hasAdaptiveHistoryData(history) {
  const normalized = normalizeAdaptiveHistory(history);
  return normalized.baselines.length > 0 || normalized.evaluations.length > 0;
}

export function combineAdaptiveProgressSnapshots(leftProgress, rightProgress) {
  const left = normalizeAdaptiveProgress(leftProgress);
  const right = normalizeAdaptiveProgress(rightProgress);
  const combined = createAdaptiveProgress();
  Object.keys(left.notes).forEach(key => {
    combined.notes[key] = left.notes[key];
  });
  Object.keys(right.notes).forEach(key => {
    combined.notes[key] = combined.notes[key]
      ? combineAdaptiveRecords(combined.notes[key], right.notes[key])
      : right.notes[key];
  });
  return normalizeAdaptiveProgress(combined);
}

export function rebuildAdaptiveProgress(history) {
  const normalized = normalizeAdaptiveHistory(history);
  let progress = normalized.baselines.reduce(
    (combined, baseline) => combineAdaptiveProgressSnapshots(
      combined,
      baseline.progress
    ),
    createAdaptiveProgress()
  );
  normalized.evaluations.forEach(evaluation => {
    progress = updateAdaptiveProgress(
      progress,
      evaluation.exercise,
      evaluation.correctFirstTry,
      evaluation.mistakeCount,
      evaluation.responseTimeMs
    );
  });
  return progress;
}

export function addAdaptiveEvaluation(history, evaluation) {
  const normalized = normalizeAdaptiveHistory(history);
  const validEvaluation = normalizeAdaptiveEvaluation(evaluation);
  if (!validEvaluation) {
    throw new Error("Cannot store an invalid adaptive evaluation.");
  }
  if (normalized.evaluations.some(value => value.id === validEvaluation.id)) {
    return normalized;
  }
  normalized.evaluations.push(validEvaluation);
  normalized.evaluations.sort((left, right) => (
    left.completedAt - right.completedAt || left.id.localeCompare(right.id)
  ));
  return normalized;
}

export default {
  ADAPTIVE_HISTORY_VERSION,
  ADAPTIVE_HISTORY_STORAGE_KEY,
  createAdaptiveEvaluationId,
  createAdaptiveEvaluation,
  normalizeAdaptiveEvaluation,
  createAdaptiveHistory,
  normalizeAdaptiveHistory,
  hasAdaptiveHistoryData,
  combineAdaptiveProgressSnapshots,
  rebuildAdaptiveProgress,
  addAdaptiveEvaluation
};
