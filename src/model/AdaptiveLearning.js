const NATURAL_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];

export const ADAPTIVE_PROGRESS_VERSION = 3;
export const DEFAULT_EXPLORATION_RATE = 0.28;
export const DEFAULT_DIFFICULTY = 1;
export const UNSEEN_NOTE_WEIGHT = 1.6;
export const MIN_DIFFICULTY = 0.4;
export const MAX_DIFFICULTY = 4;
export const WRONG_DIFFICULTY_INCREASE = 0.9;
export const CORRECT_DIFFICULTY_DECREASE = 0.12;
export const CORRECT_STREAK_BONUS_START = 3;
export const CORRECT_STREAK_BONUS_STEP = 0.03;
export const MAX_CORRECT_STREAK_BONUS = 0.12;
export const RECENT_RECOVERY_MIN_RESULTS = 10;
export const RECENT_RECOVERY_ACCURACY = 0.85;
export const RECENT_RECOVERY_BONUS = 0.04;
export const MIN_CONSOLIDATION_ATTEMPTS = 5;
export const CONSOLIDATION_WEIGHT_STEP = 0.25;
export const MAX_RECENT_RESULTS = 20;
export const MIN_VALID_RESPONSE_TIME_MS = 150;
export const MAX_VALID_RESPONSE_TIME_MS = 15000;
export const MAX_RECENT_RESPONSE_TIMES = 10;
export const MIN_NOTE_TIMED_ATTEMPTS = 3;
export const MIN_GLOBAL_TIMED_ATTEMPTS = 8;
export const MIN_RESPONSE_TIME_FACTOR = 0.8;
export const MAX_RESPONSE_TIME_FACTOR = 1.25;
export const MAX_ADAPTIVE_COOLDOWN_LENGTH = 3;
export const HARD_ADAPTIVE_COOLDOWN_LENGTH = 2;
export const VERY_HARD_ADAPTIVE_COOLDOWN_LENGTH = 1;
export const HARD_ADAPTIVE_DIFFICULTY = 2;
export const VERY_HARD_ADAPTIVE_DIFFICULTY = 3;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeDifficulty(value) {
  return Math.round(clamp(value, MIN_DIFFICULTY, MAX_DIFFICULTY) * 1000) / 1000;
}

function asNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }
  return Math.floor(number);
}

function average(values) {
  if (values.length === 0) {
    return null;
  }
  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length
  );
}

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function countTrailingCorrectResults(results) {
  let count = 0;
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index] !== true) {
      break;
    }
    count += 1;
  }
  return count;
}

export function getCorrectDifficultyDecrease(recentResults) {
  const results = Array.isArray(recentResults)
    ? recentResults
      .filter(value => value === true || value === false)
      .slice(-MAX_RECENT_RESULTS)
    : [];
  const streakLength = countTrailingCorrectResults(results);
  const streakBonus = streakLength >= CORRECT_STREAK_BONUS_START
    ? Math.min(
      MAX_CORRECT_STREAK_BONUS,
      (streakLength - CORRECT_STREAK_BONUS_START + 1)
        * CORRECT_STREAK_BONUS_STEP
    )
    : 0;
  const correctCount = results.filter(value => value === true).length;
  const recentAccuracy = results.length > 0
    ? correctCount / results.length
    : 0;
  const recoveryBonus = results.length >= RECENT_RECOVERY_MIN_RESULTS
    && recentAccuracy >= RECENT_RECOVERY_ACCURACY
    ? RECENT_RECOVERY_BONUS
    : 0;

  return Math.round((
    CORRECT_DIFFICULTY_DECREASE + streakBonus + recoveryBonus
  ) * 1000) / 1000;
}

export function normalizeResponseTimeMs(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const milliseconds = Number(value);
  if (
    !Number.isFinite(milliseconds)
    || milliseconds < MIN_VALID_RESPONSE_TIME_MS
    || milliseconds > MAX_VALID_RESPONSE_TIME_MS
  ) {
    return null;
  }
  return Math.round(milliseconds);
}

function normalizeRandomValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return clamp(number, 0, 0.9999999999999999);
}

function getNotation(value, isSharp) {
  const pitchClass = ((value % 12) + 12) % 12;
  if (NATURAL_PITCH_CLASSES.indexOf(pitchClass) !== -1) {
    return "natural";
  }
  return isSharp === false ? "flat" : "sharp";
}

export function createNoteLearningKey(exercise) {
  if (!exercise || typeof exercise.clef !== "string") {
    throw new Error("An adaptive exercise needs a clef.");
  }
  const value = Number(exercise.value);
  if (!Number.isFinite(value)) {
    throw new Error("An adaptive exercise needs a numeric note value.");
  }
  return [
    exercise.clef,
    Math.round(value),
    getNotation(Math.round(value), exercise.isSharp)
  ].join(":");
}

function normalizeStoredNoteLearningKey(key) {
  return typeof key === "string"
    ? key.replace(/^piano-(treble|bass):/, "$1:")
    : key;
}

export function createAdaptiveRecord() {
  return {
    attempts: 0,
    correctFirstTry: 0,
    struggled: 0,
    totalMistakes: 0,
    difficulty: DEFAULT_DIFFICULTY,
    recentResults: [],
    timedAttempts: 0,
    averageResponseTimeMs: null,
    recentResponseTimesMs: []
  };
}

export function normalizeAdaptiveRecord(record) {
  const source = record && typeof record === "object" ? record : {};
  const recentResults = Array.isArray(source.recentResults)
    ? source.recentResults
      .filter(value => value === true || value === false)
      .slice(-MAX_RECENT_RESULTS)
    : [];
  const difficulty = Number(source.difficulty);
  const recentResponseTimesMs = Array.isArray(source.recentResponseTimesMs)
    ? source.recentResponseTimesMs
      .map(normalizeResponseTimeMs)
      .filter(value => value !== null)
      .slice(-MAX_RECENT_RESPONSE_TIMES)
    : [];

  return {
    attempts: asNonNegativeInteger(source.attempts),
    correctFirstTry: asNonNegativeInteger(source.correctFirstTry),
    struggled: asNonNegativeInteger(source.struggled),
    totalMistakes: asNonNegativeInteger(source.totalMistakes),
    difficulty: Number.isFinite(difficulty)
      ? normalizeDifficulty(difficulty)
      : DEFAULT_DIFFICULTY,
    recentResults,
    timedAttempts: Math.max(
      asNonNegativeInteger(source.timedAttempts),
      recentResponseTimesMs.length
    ),
    averageResponseTimeMs: average(recentResponseTimesMs),
    recentResponseTimesMs
  };
}

export function combineAdaptiveRecords(leftRecord, rightRecord) {
  const left = normalizeAdaptiveRecord(leftRecord);
  const right = normalizeAdaptiveRecord(rightRecord);
  const attempts = left.attempts + right.attempts;
  const difficulty = attempts > 0
    ? (
      left.difficulty * left.attempts
      + right.difficulty * right.attempts
    ) / attempts
    : DEFAULT_DIFFICULTY;
  return normalizeAdaptiveRecord({
    attempts,
    correctFirstTry: left.correctFirstTry + right.correctFirstTry,
    struggled: left.struggled + right.struggled,
    totalMistakes: left.totalMistakes + right.totalMistakes,
    difficulty,
    recentResults: left.recentResults
      .concat(right.recentResults)
      .slice(-MAX_RECENT_RESULTS),
    timedAttempts: left.timedAttempts + right.timedAttempts,
    recentResponseTimesMs: left.recentResponseTimesMs
      .concat(right.recentResponseTimesMs)
      .slice(-MAX_RECENT_RESPONSE_TIMES)
  });
}

export function createAdaptiveProgress() {
  return {
    version: ADAPTIVE_PROGRESS_VERSION,
    notes: {}
  };
}

export function normalizeAdaptiveProgress(progress) {
  const normalized = createAdaptiveProgress();
  if (!progress || typeof progress !== "object" || !progress.notes || typeof progress.notes !== "object") {
    return normalized;
  }
  Object.keys(progress.notes).forEach(key => {
    const normalizedKey = normalizeStoredNoteLearningKey(key);
    const record = normalizeAdaptiveRecord(progress.notes[key]);
    normalized.notes[normalizedKey] = normalized.notes[normalizedKey]
      ? combineAdaptiveRecords(normalized.notes[normalizedKey], record)
      : record;
  });
  return normalized;
}

export function updateAdaptiveRecord(
  record,
  wasCorrectFirstTry,
  mistakeCount = 0,
  responseTimeMs = null
) {
  const normalized = normalizeAdaptiveRecord(record);
  const correct = wasCorrectFirstTry === true;
  const mistakes = correct ? 0 : Math.max(1, asNonNegativeInteger(mistakeCount));
  const recentResults = normalized.recentResults
    .concat(correct)
    .slice(-MAX_RECENT_RESULTS);
  const validResponseTimeMs = correct
    ? normalizeResponseTimeMs(responseTimeMs)
    : null;
  const recentResponseTimesMs = validResponseTimeMs === null
    ? normalized.recentResponseTimesMs
    : normalized.recentResponseTimesMs
      .concat(validResponseTimeMs)
      .slice(-MAX_RECENT_RESPONSE_TIMES);

  return {
    attempts: normalized.attempts + 1,
    correctFirstTry: normalized.correctFirstTry + (correct ? 1 : 0),
    struggled: normalized.struggled + (correct ? 0 : 1),
    totalMistakes: normalized.totalMistakes + mistakes,
    difficulty: correct
      ? normalizeDifficulty(
        normalized.difficulty - getCorrectDifficultyDecrease(recentResults)
      )
      : normalizeDifficulty(
        normalized.difficulty + WRONG_DIFFICULTY_INCREASE
      ),
    recentResults,
    timedAttempts: normalized.timedAttempts + (validResponseTimeMs === null ? 0 : 1),
    averageResponseTimeMs: average(recentResponseTimesMs),
    recentResponseTimesMs
  };
}

export function updateAdaptiveProgress(
  progress,
  exercise,
  wasCorrectFirstTry,
  mistakeCount = 0,
  responseTimeMs = null
) {
  const normalized = normalizeAdaptiveProgress(progress);
  const key = createNoteLearningKey(exercise);
  return {
    version: ADAPTIVE_PROGRESS_VERSION,
    notes: Object.assign({}, normalized.notes, {
      [key]: updateAdaptiveRecord(
        normalized.notes[key],
        wasCorrectFirstTry,
        mistakeCount,
        responseTimeMs
      )
    })
  };
}

function getResponseTimeBaselineFromNormalized(progress) {
  const responseTimes = [];
  Object.keys(progress.notes).forEach(key => {
    progress.notes[key].recentResponseTimesMs.forEach(value => {
      responseTimes.push(value);
    });
  });
  return responseTimes.length >= MIN_GLOBAL_TIMED_ATTEMPTS
    ? median(responseTimes)
    : null;
}

export function getPersonalResponseTimeBaseline(progress) {
  return getResponseTimeBaselineFromNormalized(
    normalizeAdaptiveProgress(progress)
  );
}

export function getResponseTimeFactor(record, personalBaselineMs) {
  const normalized = normalizeAdaptiveRecord(record);
  if (
    normalized.timedAttempts < MIN_NOTE_TIMED_ATTEMPTS
    || normalized.averageResponseTimeMs === null
    || !Number.isFinite(Number(personalBaselineMs))
    || Number(personalBaselineMs) <= 0
  ) {
    return 1;
  }
  const factor = normalized.averageResponseTimeMs / Number(personalBaselineMs);
  return Math.round(clamp(
    factor,
    MIN_RESPONSE_TIME_FACTOR,
    MAX_RESPONSE_TIME_FACTOR
  ) * 1000) / 1000;
}

export function getAttemptWeightFloor(attempts) {
  const attemptCount = asNonNegativeInteger(attempts);
  if (attemptCount === 0) {
    return UNSEEN_NOTE_WEIGHT;
  }
  if (attemptCount >= MIN_CONSOLIDATION_ATTEMPTS) {
    return MIN_DIFFICULTY;
  }
  return Math.round((
    MIN_DIFFICULTY
    + (MIN_CONSOLIDATION_ATTEMPTS - attemptCount)
      * CONSOLIDATION_WEIGHT_STEP
  ) * 1000) / 1000;
}

function getAdaptiveWeightFromNormalized(progress, exercise, personalBaselineMs) {
  const record = progress.notes[createNoteLearningKey(exercise)];
  if (!record) {
    return getAttemptWeightFloor(0);
  }
  const timeFactor = getResponseTimeFactor(record, personalBaselineMs);
  return Math.round(clamp(
    Math.max(
      record.difficulty,
      getAttemptWeightFloor(record.attempts)
    ) * timeFactor,
    MIN_DIFFICULTY,
    MAX_DIFFICULTY
  ) * 1000) / 1000;
}

export function getAdaptiveWeight(progress, exercise) {
  const normalized = normalizeAdaptiveProgress(progress);
  return getAdaptiveWeightFromNormalized(
    normalized,
    exercise,
    getResponseTimeBaselineFromNormalized(normalized)
  );
}

export function getAdaptiveCooldownLength(progress, exercise) {
  const normalized = normalizeAdaptiveProgress(progress);
  const record = normalized.notes[createNoteLearningKey(exercise)];
  if (!record || record.attempts < MIN_CONSOLIDATION_ATTEMPTS) {
    return VERY_HARD_ADAPTIVE_COOLDOWN_LENGTH;
  }
  if (record.difficulty >= VERY_HARD_ADAPTIVE_DIFFICULTY) {
    return VERY_HARD_ADAPTIVE_COOLDOWN_LENGTH;
  }
  if (record.difficulty >= HARD_ADAPTIVE_DIFFICULTY) {
    return HARD_ADAPTIVE_COOLDOWN_LENGTH;
  }
  return MAX_ADAPTIVE_COOLDOWN_LENGTH;
}

function applyAdaptiveCooldown(candidates, progress, recentValues) {
  const history = Array.isArray(recentValues)
    ? recentValues
      .map(Number)
      .filter(Number.isFinite)
      .slice(-MAX_ADAPTIVE_COOLDOWN_LENGTH)
    : [];
  if (history.length === 0 || candidates.length < 2) {
    return candidates.slice();
  }
  const available = candidates.filter(candidate => {
    const cooldownLength = getAdaptiveCooldownLength(progress, candidate);
    return history.slice(-cooldownLength).indexOf(Number(candidate.value)) === -1;
  });
  return available.length > 0 ? available : candidates.slice();
}

function pickUniform(candidates, random) {
  const index = Math.floor(normalizeRandomValue(random()) * candidates.length);
  return candidates[index];
}

function pickWeighted(candidates, progress, random) {
  const normalized = normalizeAdaptiveProgress(progress);
  const personalBaselineMs = getResponseTimeBaselineFromNormalized(normalized);
  const weights = candidates.map(candidate => getAdaptiveWeightFromNormalized(
    normalized,
    candidate,
    personalBaselineMs
  ));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  let position = normalizeRandomValue(random()) * totalWeight;

  for (let index = 0; index < candidates.length; index += 1) {
    position -= weights[index];
    if (position < 0) {
      return candidates[index];
    }
  }
  return candidates[candidates.length - 1];
}

export function selectAdaptiveCandidate(
  candidates,
  progress,
  options = {}
) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }
  const random = typeof options.random === "function" ? options.random : Math.random;
  const explorationRate = Number.isFinite(Number(options.explorationRate))
    ? clamp(Number(options.explorationRate), 0, 1)
    : DEFAULT_EXPLORATION_RATE;
  const previousKey = options.previousKey;
  const previousValue = Number(options.previousValue);
  let eligibleCandidates = applyAdaptiveCooldown(
    candidates,
    progress,
    options.recentValues
  );
  if (Number.isFinite(previousValue) && candidates.length > 1) {
    const differentPitches = eligibleCandidates.filter(candidate => (
      candidate.value !== previousValue
    ));
    if (differentPitches.length > 0) {
      eligibleCandidates = differentPitches;
    }
  }
  if (previousKey && eligibleCandidates.length > 1) {
    const differentExercises = eligibleCandidates.filter(candidate => (
      createNoteLearningKey(candidate) !== previousKey
    ));
    if (differentExercises.length > 0) {
      eligibleCandidates = differentExercises;
    }
  }
  const pool = eligibleCandidates.length > 0 ? eligibleCandidates : candidates;

  if (normalizeRandomValue(random()) < explorationRate) {
    return pickUniform(pool, random);
  }
  return pickWeighted(pool, progress, random);
}

export default {
  createNoteLearningKey,
  createAdaptiveRecord,
  normalizeAdaptiveRecord,
  combineAdaptiveRecords,
  createAdaptiveProgress,
  normalizeAdaptiveProgress,
  updateAdaptiveRecord,
  updateAdaptiveProgress,
  normalizeResponseTimeMs,
  getPersonalResponseTimeBaseline,
  getResponseTimeFactor,
  getAttemptWeightFloor,
  getAdaptiveWeight,
  getCorrectDifficultyDecrease,
  getAdaptiveCooldownLength,
  selectAdaptiveCandidate
};
