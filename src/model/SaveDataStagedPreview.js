import { summarizeSaveDataBackup } from "./SaveDataBackup";

function countIn(counts, path) {
  const value = counts[path];
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid staged backup count: ${path}.`);
  }
  return value;
}

// A staged preview contains only bounded metadata and collection counts. In
// particular, it never reads the staged records back into one large array.
export function summarizeStagedSaveData(metadata) {
  if (!metadata || metadata.key !== "ready" || !metadata.counts) {
    throw new Error("The staged backup is not ready.");
  }
  const base = summarizeSaveDataBackup(metadata.shell);
  if (!base) throw new Error("Invalid staged backup metadata.");
  const counts = metadata.counts;
  const fileSize = metadata.fileSize;
  if (fileSize !== undefined && (!Number.isSafeInteger(fileSize) || fileSize < 0)) {
    throw new Error("Invalid staged backup size.");
  }
  const preview = {
    createdAt: base.createdAt,
    appVersion: base.appVersion,
    fileSize: fileSize === undefined ? null : fileSize,
    normalRounds: base.normalRounds
      + countIn(counts, "data.roundHistory")
      + countIn(counts, "data.roundHistory.rounds"),
    screenPlayedNotes: base.screenAdaptiveAttempts,
    midiPlayedNotes: base.midiAdaptiveAttempts,
    screenEvaluations: countIn(counts, "data.adaptiveHistory.evaluations"),
    midiEvaluations: countIn(counts, "data.adaptiveHistoryMidi.evaluations"),
    noteFlowScreenRounds: countIn(counts, "data.noteFlowRounds.screen"),
    noteFlowMidiRounds: countIn(counts, "data.noteFlowRounds.midi"),
    chordMidiRounds: countIn(counts, "data.noteFlowRounds.chordMidi"),
    rhythmBars: countIn(counts, "data.rhythmSenseBars"),
    // Deduplication against existing data has not run yet. Never imply that
    // these are the numbers after a merge.
    mergeProjectionAvailable: false
  };
  if (metadata.shell.data.dailyTaskHistory) {
    preview.dailyTaskDays = Object.keys(metadata.shell.data.dailyTaskHistory.days).length;
  }
  return preview;
}
