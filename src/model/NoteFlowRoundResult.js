import { createNoteFlowRhythmOptionsFromMenu } from "./NoteFlowMenuConfig";
import { normalizeNoteFlowMovement, normalizeNoteFlowAlgorithmSettings } from "./NoteFlowMovement";

export const NOTE_FLOW_ROUND_RESULT_VERSION = 1;

let roundResultSequence = 0;

function nonNegativeInteger(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeClefs(value) {
  return Array.isArray(value)
    ? value.filter(clef => typeof clef === "string")
    : [];
}

export function createNoteFlowRoundResultId(completedAt = new Date().toISOString()) {
  roundResultSequence += 1;
  const timestamp = Date.parse(completedAt) || Date.now();
  const randomValue = Math.floor(Math.random() * 0x100000000).toString(36);
  return [
    "note-flow-round",
    timestamp.toString(36),
    roundResultSequence.toString(36),
    ("0000000" + randomValue).slice(-7)
  ].join("|");
}

export function createNoteFlowRoundResult(options = {}) {
  const timer = options.timer || {};
  const progress = options.progress || {};
  const settings = options.menuOptions || {};
  const correct = nonNegativeInteger(progress.correct);
  const wrong = nonNegativeInteger(progress.wrong);
  const missed = nonNegativeInteger(progress.missed);
  const evaluatedInputs = correct + wrong + missed;
  const precise = nonNegativeInteger(progress.precise);
  const early = nonNegativeInteger(progress.early);
  const late = nonNegativeInteger(progress.late);
  const timedInputs = precise + early + late;
  const absoluteTimingOffsetMs = nonNegativeInteger(
    progress.totalAbsoluteTimingOffsetMs
  );
  const completedAt = options.completedAt || new Date().toISOString();

  const result = {
    id: options.id || createNoteFlowRoundResultId(completedAt),
    resultVersion: NOTE_FLOW_ROUND_RESULT_VERSION,
    mode: "normal",
    completionReason: options.completionReason === "time-limit"
      ? "time-limit"
      : "manual",
    startedAt: options.startedAt || null,
    completedAt,
    durationMs: nonNegativeInteger(timer.elapsedMs),
    score: {
      correct,
      correctFirstTry: nonNegativeInteger(progress.correctFirstTry),
      wrong,
      missed,
      evaluatedInputs,
      accuracy: evaluatedInputs > 0
        ? Math.round(correct / evaluatedInputs * 100)
        : 0
    },
    timing: {
      precise,
      early,
      late,
      evaluatedInputs: timedInputs,
      totalAbsoluteOffsetMs: absoluteTimingOffsetMs,
      averageAbsoluteOffsetMs: timedInputs > 0
        ? Math.round(absoluteTimingOffsetMs / timedInputs)
        : null
    },
    settings: {
      bpm: finiteOrNull(settings.bpm),
      behavior: settings.behavior || "continuous",
      difficulty: settings.difficulty || "normal",
      movement: normalizeNoteFlowMovement(settings.movement),
      handMode: settings.handMode === "two" ? "two" : "single",
      secondaryNotesPerBlock: nonNegativeInteger(
        settings.secondaryNotesPerBlock
      ),
      clefs: normalizeClefs(settings.clef),
      inputMode: settings.inputMode || "button",
      tonalityMode: settings.tonalityMode || "random",
      selectedKey: settings.selectedKey || null,
      accidentals: settings.accidentals || "no",
      range: {
        bassMin: finiteOrNull(settings.customMinValue),
        bassMax: finiteOrNull(settings.customBassMaxValue),
        trebleMin: finiteOrNull(settings.customTrebleMinValue),
        trebleMax: finiteOrNull(settings.customMaxValue)
      }
    }
  };
  if (result.settings.movement === "custom") {
    result.settings.algorithmSettings = normalizeNoteFlowAlgorithmSettings(
      settings.algorithmSettings, options.exerciseType === "chord" ? "chord" : "melody"
    );
  }
  if (options.exerciseType === "chord") {
    result.exerciseType = "chord";
  } else {
    result.settings.rhythm = createNoteFlowRhythmOptionsFromMenu(settings);
  }
  return result;
}

export default {
  NOTE_FLOW_ROUND_RESULT_VERSION,
  createNoteFlowRoundResultId,
  createNoteFlowRoundResult
};
