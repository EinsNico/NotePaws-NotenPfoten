import {
  getNoteRange,
  getCustomRangeLimits,
  getCustomPianoLimits,
  getStatisticsDifficulty,
  usesCustomClefAssignment
} from "./NoteRanges";

export const ROUND_HISTORY_VERSION = 1;
export const ROUND_HISTORY_STORAGE_KEY = "roundHistory";

let roundIdSequence = 0;

function toFiniteNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function toNonNegativeInteger(value) {
  return Math.max(0, Math.round(toFiniteNumber(value, 0)));
}

function normalizeClefs(clefs) {
  if (!Array.isArray(clefs)) {
    return clefs ? [String(clefs)] : [];
  }
  return clefs.map(clef => String(clef)).sort();
}

function getRangeClefs(clefs) {
  if (clefs.indexOf("piano") !== -1) {
    return ["bass", "treble"];
  }
  return clefs.length > 0 ? clefs : ["treble"];
}

function createRangeSnapshot(options, clefs) {
  const customLimits = options.difficulty === "custom"
    ? getCustomRangeLimits(
      options.customMinValue,
      options.customMaxValue,
      options.customTrebleMinValue,
      options.customBassMaxValue
    )
    : null;
  const clefRanges = getRangeClefs(clefs).map(clef => {
    if (customLimits) {
      return clef === "bass"
        ? { clef, min: customLimits.min, max: customLimits.bassMax }
        : { clef, min: customLimits.trebleMin, max: customLimits.max };
    }
    const range = getNoteRange(
      clef,
      options.difficulty,
      options.customMinValue,
      options.customMaxValue
    );
    return {
      clef,
      min: range.min,
      max: range.max
    };
  });
  return {
    noteRange: {
      min: Math.min.apply(null, clefRanges.map(range => range.min)),
      max: Math.max.apply(null, clefRanges.map(range => range.max))
    },
    clefRanges
  };
}

function createClefTransitionSnapshot(options, clefs) {
  if (
    options.difficulty !== "custom"
    || !usesCustomClefAssignment(clefs)
  ) {
    return null;
  }
  const limits = getCustomPianoLimits(
    options.customTrebleMinValue,
    options.customBassMaxValue
  );
  return {
    trebleMinValue: limits.trebleMin,
    bassMaxValue: limits.bassMax
  };
}

export function createRoundId(completedAt = Date.now()) {
  roundIdSequence += 1;
  const randomValue = Math.floor(Math.random() * 0x100000000).toString(36);
  const randomPart = ("0000000" + randomValue).slice(-7);
  return [
    "round",
    Math.round(completedAt).toString(36),
    roundIdSequence.toString(36),
    randomPart
  ].join("-");
}

export function createNormalRoundSettings(options) {
  const clefs = normalizeClefs(options.clef);
  const ranges = createRangeSnapshot(options, clefs);
  return {
    durationSeconds: toNonNegativeInteger(options.gameLength),
    difficulty: String(options.difficulty || ""),
    statisticsDifficulty: getStatisticsDifficulty(options),
    clefs,
    noteRange: ranges.noteRange,
    clefRanges: ranges.clefRanges,
    clefTransition: createClefTransitionSnapshot(options, clefs),
    accidentals: String(options.accidentals || ""),
    inputMode: String(options.inputMode || "")
  };
}

export function createNormalRoundRecord(result, options, context = {}) {
  const completedAt = toNonNegativeInteger(
    context.completedAt === undefined ? Date.now() : context.completedAt
  );
  return Object.assign({
    schemaVersion: ROUND_HISTORY_VERSION,
    id: context.id || createRoundId(completedAt),
    completedAt,
    mode: "normal",
    score: toNonNegativeInteger(result.score),
    accuracy: Math.min(100, toNonNegativeInteger(result.accuracy)),
    numAnswers: toNonNegativeInteger(result.numAnswers),
    numCorrect: toNonNegativeInteger(result.numCorrect),
    numWrong: toNonNegativeInteger(result.numWrong),
    settings: createNormalRoundSettings(options)
  }, result.timedNoteCount > 0 ? {
    timedNoteCount: Math.min(toNonNegativeInteger(result.numCorrect), toNonNegativeInteger(result.timedNoteCount)),
    responseTimeTotalMs: toNonNegativeInteger(result.responseTimeTotalMs)
  } : {});
}

export function normalizeRoundHistory(storedHistory) {
  if (Array.isArray(storedHistory)) {
    return {
      version: ROUND_HISTORY_VERSION,
      rounds: storedHistory.slice()
    };
  }
  if (
    storedHistory
    && typeof storedHistory === "object"
    && Array.isArray(storedHistory.rounds)
  ) {
    return {
      version: ROUND_HISTORY_VERSION,
      rounds: storedHistory.rounds.slice()
    };
  }
  return {
    version: ROUND_HISTORY_VERSION,
    rounds: []
  };
}

export default {
  ROUND_HISTORY_VERSION,
  ROUND_HISTORY_STORAGE_KEY,
  createRoundId,
  createNormalRoundSettings,
  createNormalRoundRecord,
  normalizeRoundHistory
};
