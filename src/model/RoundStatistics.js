import { createNormalRoundSettings } from "./RoundHistory";

export const ROUND_SCOPE_CURRENT = "current";
export const ROUND_SCOPE_ALL_CUSTOM = "all-custom";
export const ROUND_SCOPE_TOTAL = "total";
export const ROUND_INPUT_SCREEN = "screen";
export const ROUND_INPUT_MIDI = "midi";
export const ROUND_CHART_MAX_ROUNDS = 10;
export const ROUND_TREND_WINDOW_SIZE = 5;
export const ROUND_TREND_MIN_ROUNDS = 4;
export const ROUND_TREND_STABLE_THRESHOLD = 2;

function toNonNegativeNumber(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return Math.max(0, numericValue);
}

function createClefRangesSignature(clefRanges) {
  if (!Array.isArray(clefRanges)) {
    return "";
  }
  return clefRanges.map(range => [
    range.clef,
    range.min,
    range.max
  ].join(":"))
    .sort()
    .join(",");
}

function createTransitionSignature(transition) {
  if (!transition) {
    return "none";
  }
  return [transition.trebleMinValue, transition.bassMaxValue].join(":");
}

export function getRoundInputGroup(inputMode) {
  return inputMode === "midi" ? ROUND_INPUT_MIDI : ROUND_INPUT_SCREEN;
}

export function createRoundSettingsSignature(settings, includeInputGroup = true) {
  if (!settings || typeof settings !== "object") {
    return "";
  }
  const noteRange = settings.noteRange || {};
  const clefs = Array.isArray(settings.clefs)
    ? settings.clefs.slice().sort()
    : [];
  return [
    settings.durationSeconds,
    settings.difficulty,
    settings.statisticsDifficulty,
    clefs.join(","),
    [noteRange.min, noteRange.max].join(":"),
    createClefRangesSignature(settings.clefRanges),
    createTransitionSignature(settings.clefTransition),
    settings.accidentals,
    includeInputGroup ? getRoundInputGroup(settings.inputMode) : ""
  ].join("|");
}

export function filterNormalRounds(
  rounds,
  scope,
  options,
  customSettingsSignature = "",
  inputGroup = ""
) {
  const normalRounds = Array.isArray(rounds)
    ? rounds.filter(round => round && round.mode === "normal")
    : [];
  const inputRounds = inputGroup
    ? normalRounds.filter(round => (
      getRoundInputGroup(round.settings && round.settings.inputMode) === inputGroup
    ))
    : normalRounds;

  if (scope === ROUND_SCOPE_TOTAL) {
    return inputRounds;
  }
  if (scope === ROUND_SCOPE_ALL_CUSTOM) {
    return inputRounds.filter(round => (
      round.settings && round.settings.difficulty === "custom"
      && (
        !customSettingsSignature
        || createRoundSettingsSignature(round.settings) === customSettingsSignature
      )
    ));
  }
  if (scope === ROUND_SCOPE_CURRENT && options) {
    const currentSignature = createRoundSettingsSignature(
      createNormalRoundSettings(options),
      false
    );
    return inputRounds.filter(round => (
      createRoundSettingsSignature(round.settings, false) === currentSignature
    ));
  }
  return [];
}

export function listCustomRoundConfigurations(rounds, inputGroup = "") {
  const configurations = {};
  const normalRounds = Array.isArray(rounds)
    ? rounds.filter(round => (
      round
      && round.mode === "normal"
      && (
        !inputGroup
        || getRoundInputGroup(round.settings && round.settings.inputMode) === inputGroup
      )
    ))
    : [];

  normalRounds.forEach(round => {
    if (!round.settings || round.settings.difficulty !== "custom") {
      return;
    }
    const signature = createRoundSettingsSignature(round.settings);
    if (!signature) {
      return;
    }
    if (!configurations[signature]) {
      configurations[signature] = {
        signature,
        settings: round.settings,
        roundCount: 0,
        latestCompletedAt: 0
      };
    }
    configurations[signature].roundCount += 1;
    configurations[signature].latestCompletedAt = Math.max(
      configurations[signature].latestCompletedAt,
      toNonNegativeNumber(round.completedAt)
    );
  });

  return Object.keys(configurations)
    .map(signature => configurations[signature])
    .sort((first, second) => (
      second.latestCompletedAt - first.latestCompletedAt
      || first.signature.localeCompare(second.signature)
    ));
}

export function summarizeNormalRounds(rounds) {
  const normalRounds = Array.isArray(rounds)
    ? rounds.filter(round => round && round.mode === "normal")
    : [];
  let latestRound = null;
  let record = 0;
  let totalScore = 0;
  let totalAnswers = 0;
  let totalCorrect = 0;
  let totalWrong = 0;
  let timedNoteCount = 0;
  let responseTimeTotalMs = 0;

  normalRounds.forEach(round => {
    const score = toNonNegativeNumber(round.score);
    const completedAt = toNonNegativeNumber(round.completedAt);
    record = Math.max(record, score);
    totalScore += score;
    totalAnswers += toNonNegativeNumber(round.numAnswers);
    totalCorrect += toNonNegativeNumber(round.numCorrect);
    totalWrong += toNonNegativeNumber(round.numWrong);
    const count = Math.min(toNonNegativeNumber(round.numCorrect), toNonNegativeNumber(round.timedNoteCount));
    const time = toNonNegativeNumber(round.responseTimeTotalMs);
    if (count > 0 && time > 0) {
      timedNoteCount += count;
      responseTimeTotalMs += time;
    }
    if (!latestRound || completedAt >= toNonNegativeNumber(latestRound.completedAt)) {
      latestRound = round;
    }
  });

  return {
    roundCount: normalRounds.length,
    latestScore: latestRound ? toNonNegativeNumber(latestRound.score) : null,
    latestCompletedAt: latestRound
      ? toNonNegativeNumber(latestRound.completedAt)
      : null,
    record,
    averageScore: normalRounds.length > 0
      ? Math.round(totalScore / normalRounds.length)
      : 0,
    averageAccuracy: totalAnswers > 0
      ? Math.round(100 * totalCorrect / totalAnswers)
      : 0,
    averageResponseTimeMs: timedNoteCount > 0 ? Math.round(responseTimeTotalMs / timedNoteCount) : null,
    timedNoteCount,
    playedExercises: totalCorrect,
    totalAnswers,
    totalCorrect,
    totalWrong
  };
}

export function createRoundChartPoints(
  rounds,
  metric,
  maxRounds = ROUND_CHART_MAX_ROUNDS
) {
  const showAllRounds = maxRounds === null;
  const safeLimit = showAllRounds
    ? null
    : Math.max(1, Math.floor(toNonNegativeNumber(maxRounds)) || 1);
  const chartMetric = metric === "accuracy" ? "accuracy" : "score";
  const normalRounds = Array.isArray(rounds)
    ? rounds.filter(round => round && round.mode === "normal")
    : [];

  const chronologicalRounds = normalRounds.map((round, originalIndex) => ({
    round,
    originalIndex,
    completedAt: toNonNegativeNumber(round.completedAt)
  }))
    .sort((first, second) => (
      first.completedAt - second.completedAt
      || first.originalIndex - second.originalIndex
    ));
  const visibleRounds = showAllRounds
    ? chronologicalRounds
    : chronologicalRounds.slice(-safeLimit);

  return visibleRounds.map(item => ({
    id: item.round.id,
    round: item.round,
    completedAt: item.completedAt,
    value: chartMetric === "accuracy"
      ? Math.min(100, toNonNegativeNumber(item.round.accuracy))
      : toNonNegativeNumber(item.round.score)
  }));
}

export function createMovingAverage(values, windowSize = ROUND_TREND_WINDOW_SIZE) {
  const safeValues = Array.isArray(values)
    ? values.map(toNonNegativeNumber)
    : [];
  const safeWindowSize = Math.max(
    1,
    Math.floor(toNonNegativeNumber(windowSize)) || 1
  );

  return safeValues.map((value, index) => {
    const firstIndex = Math.max(0, index - safeWindowSize + 1);
    const windowValues = safeValues.slice(firstIndex, index + 1);
    const total = windowValues.reduce((sum, item) => sum + item, 0);
    return Math.round(total / windowValues.length);
  });
}

export function summarizeRoundTrend(points) {
  const values = Array.isArray(points)
    ? points.map(point => toNonNegativeNumber(point && point.value))
    : [];
  if (values.length < ROUND_TREND_MIN_ROUNDS) {
    return {
      direction: "insufficient",
      difference: null,
      comparedRounds: values.length
    };
  }

  const comparisonSize = Math.min(
    ROUND_TREND_WINDOW_SIZE,
    Math.floor(values.length / 2)
  );
  const average = items => (
    items.reduce((sum, value) => sum + value, 0) / items.length
  );
  const firstAverage = average(values.slice(0, comparisonSize));
  const latestAverage = average(values.slice(-comparisonSize));
  const difference = Math.round(latestAverage - firstAverage);
  let direction = "stable";
  if (difference > ROUND_TREND_STABLE_THRESHOLD) {
    direction = "improving";
  } else if (difference < -ROUND_TREND_STABLE_THRESHOLD) {
    direction = "declining";
  }

  return {
    direction,
    difference: Math.abs(difference),
    comparedRounds: values.length
  };
}

export default {
  ROUND_SCOPE_CURRENT,
  ROUND_SCOPE_ALL_CUSTOM,
  ROUND_SCOPE_TOTAL,
  ROUND_INPUT_SCREEN,
  ROUND_INPUT_MIDI,
  ROUND_CHART_MAX_ROUNDS,
  ROUND_TREND_WINDOW_SIZE,
  ROUND_TREND_MIN_ROUNDS,
  ROUND_TREND_STABLE_THRESHOLD,
  getRoundInputGroup,
  createRoundSettingsSignature,
  filterNormalRounds,
  listCustomRoundConfigurations,
  summarizeNormalRounds,
  createRoundChartPoints,
  createMovingAverage,
  summarizeRoundTrend
};
