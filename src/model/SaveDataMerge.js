import { mergeDailyTaskArchives } from "./DailyTaskHistoryData";
import {
  ROUND_HISTORY_VERSION,
  normalizeRoundHistory
} from "./RoundHistory";
import {
  ADAPTIVE_HISTORY_VERSION,
  createAdaptiveHistory,
  hasAdaptiveHistoryData,
  normalizeAdaptiveHistory,
  rebuildAdaptiveProgress
} from "./AdaptiveHistory";
import {
  SAVE_DATA_BACKUP_FORMAT,
  validateSaveDataBackup
} from "./SaveDataBackup";
import { createEmptyPrestigeArchive, mergePrestigeArchives } from "./PrestigeArchive";
import { markImportedForPrestige } from "./PrestigeEligibility";
import { canonicalize } from "./CanonicalJson";

function cloneJson(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function valuesMatch(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function normalizeMergeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("A save-data merge needs a valid date.");
  }
  return date.toISOString();
}

function mergeUniqueById(currentValues, importedValues, sortValues,
  sameValue = valuesMatch) {
  const values = currentValues.map(cloneJson);
  const valuesById = values.reduce((entries, value) => {
    entries[value.id] = value;
    return entries;
  }, Object.create(null));
  let added = 0;
  let duplicates = 0;
  let conflicts = 0;

  importedValues.forEach(importedValue => {
    const currentValue = valuesById[importedValue.id];
    if (!currentValue) {
      const copiedValue = cloneJson(importedValue);
      values.push(copiedValue);
      valuesById[copiedValue.id] = copiedValue;
      added += 1;
    } else if (sameValue(currentValue, importedValue)) {
      duplicates += 1;
    } else {
      conflicts += 1;
    }
  });

  if (typeof sortValues === "function") {
    values.sort(sortValues);
  }
  return { values, added, duplicates, conflicts };
}

function sortTimedValues(left, right) {
  return Number(left.completedAt) - Number(right.completedAt)
    || left.id.localeCompare(right.id);
}

function sortNoteFlowRounds(left, right) {
  return Date.parse(left.completedAt) - Date.parse(right.completedAt)
    || left.id.localeCompare(right.id);
}

function sameRoundIgnoringPrestige(left, right) {
  const current = cloneJson(left);
  const imported = cloneJson(right);
  delete current.prestigeEligible;
  delete imported.prestigeEligible;
  return valuesMatch(current, imported);
}

export function mergeRoundHistories(currentHistory, importedHistory,
  options = {}) {
  const current = normalizeRoundHistory(currentHistory).rounds;
  const imported = normalizeRoundHistory(importedHistory).rounds;
  const currentIds = new Set(current.map(round => round.id));
  const merged = mergeUniqueById(current, imported, sortTimedValues,
    sameRoundIgnoringPrestige);
  return {
    history: {
      version: ROUND_HISTORY_VERSION,
      rounds: options.markImportedForPrestige
        ? merged.values.map(round => currentIds.has(round.id)
          ? round : markImportedForPrestige(round))
        : merged.values
    },
    added: merged.added,
    duplicates: merged.duplicates,
    conflicts: merged.conflicts
  };
}

function getMergeableAdaptiveHistory(data, progressKey, historyKey) {
  const storedHistory = normalizeAdaptiveHistory(data[historyKey]);
  if (hasAdaptiveHistoryData(storedHistory)) {
    return storedHistory;
  }
  return createAdaptiveHistory(data[progressKey]);
}

export function mergeAdaptiveHistories(
  currentData,
  importedData,
  keys = { progress: "adaptiveProgress", history: "adaptiveHistory" }
) {
  const current = getMergeableAdaptiveHistory(
    currentData,
    keys.progress,
    keys.history
  );
  const imported = getMergeableAdaptiveHistory(
    importedData,
    keys.progress,
    keys.history
  );
  const baselines = mergeUniqueById(
    current.baselines,
    imported.baselines,
    (left, right) => left.id.localeCompare(right.id)
  );
  const evaluations = mergeUniqueById(
    current.evaluations,
    imported.evaluations,
    sortTimedValues
  );
  const history = normalizeAdaptiveHistory({
    version: ADAPTIVE_HISTORY_VERSION,
    baselines: baselines.values,
    evaluations: evaluations.values
  });
  return {
    history,
    progress: rebuildAdaptiveProgress(history),
    addedBaselines: baselines.added,
    duplicateBaselines: baselines.duplicates,
    conflictingBaselines: baselines.conflicts,
    addedEvaluations: evaluations.added,
    duplicateEvaluations: evaluations.duplicates,
    conflictingEvaluations: evaluations.conflicts
  };
}

function mergeLegacyScoreList(currentScores, importedScores) {
  if (currentScores === null || currentScores.length === 0) {
    return cloneJson(importedScores);
  }
  if (importedScores === null || importedScores.length <= currentScores.length) {
    return cloneJson(currentScores);
  }
  return cloneJson(importedScores);
}

function mergeNullableRecord(currentRecord, importedRecord) {
  if (currentRecord === null) {
    return importedRecord;
  }
  if (importedRecord === null) {
    return currentRecord;
  }
  return Math.max(currentRecord, importedRecord);
}

function entriesByStorageKey(entries) {
  return entries.reduce((result, entry) => {
    result[entry.storageKey] = entry.value;
    return result;
  }, Object.create(null));
}

function mergeStoredEntries(currentEntries, importedEntries, mergeValue) {
  const currentByKey = entriesByStorageKey(currentEntries);
  const importedByKey = entriesByStorageKey(importedEntries);
  const allKeys = Object.keys(currentByKey).concat(
    Object.keys(importedByKey).filter(key => (
      !Object.prototype.hasOwnProperty.call(currentByKey, key)
    ))
  ).sort();
  return allKeys.map(storageKey => ({
    storageKey,
    value: mergeValue(
      Object.prototype.hasOwnProperty.call(currentByKey, storageKey)
        ? currentByKey[storageKey]
        : null,
      Object.prototype.hasOwnProperty.call(importedByKey, storageKey)
        ? importedByKey[storageKey]
        : null
    )
  }));
}

export function mergeStoredStatistics(current, imported) {
  return {
    legacyLastScores: mergeLegacyScoreList(
      current.legacyLastScores,
      imported.legacyLastScores
    ),
    legacyRecord: mergeNullableRecord(
      current.legacyRecord,
      imported.legacyRecord
    ),
    scoreEntries: mergeStoredEntries(
      current.scoreEntries,
      imported.scoreEntries,
      mergeLegacyScoreList
    ),
    recordEntries: mergeStoredEntries(
      current.recordEntries,
      imported.recordEntries,
      mergeNullableRecord
    )
  };
}

function getAdaptiveAttemptCount(progress) {
  return Object.keys(progress.notes).reduce(
    (total, key) => total + progress.notes[key].attempts,
    0
  );
}

export function mergeSaveDataBackups(
  currentBackup,
  importedBackup,
  options = {}
) {
  const currentValidation = validateSaveDataBackup(currentBackup);
  const importedValidation = validateSaveDataBackup(importedBackup);
  if (!currentValidation.valid) {
    throw new Error(`Current save data is invalid: ${currentValidation.errors.join(", ")}`);
  }
  if (!importedValidation.valid) {
    throw new Error(`Imported save data is invalid: ${importedValidation.errors.join(", ")}`);
  }
  const rounds = mergeRoundHistories(
    currentBackup.data.roundHistory,
    importedBackup.data.roundHistory,
    { markImportedForPrestige: true }
  );
  const adaptive = mergeAdaptiveHistories(
    currentBackup.data,
    importedBackup.data
  );
  const adaptiveMidi = mergeAdaptiveHistories(
    currentBackup.data,
    importedBackup.data,
    {
      progress: "adaptiveProgressMidi",
      history: "adaptiveHistoryMidi"
    }
  );
  const currentFlow = currentBackup.data.noteFlowRounds;
  const importedFlow = importedBackup.data.noteFlowRounds;
  const currentScreenIds = new Set(currentFlow
    ? currentFlow.screen.map(round => round.id) : []);
  const currentMidiIds = new Set(currentFlow
    ? currentFlow.midi.map(round => round.id) : []);
  const currentChordIds = new Set(currentFlow
    ? (currentFlow.chordMidi || []).map(round => round.id) : []);
  const importedScreenConflicts = importedFlow
    ? importedFlow.screen.filter(round => currentMidiIds.has(round.id)
      || currentChordIds.has(round.id)).length : 0;
  const importedMidiConflicts = importedFlow
    ? importedFlow.midi.filter(round => currentScreenIds.has(round.id)
      || currentChordIds.has(round.id)).length : 0;
  const importedChordConflicts = importedFlow
    ? (importedFlow.chordMidi || []).filter(round => currentScreenIds.has(round.id)
      || currentMidiIds.has(round.id)).length : 0;
  const noteFlowScreen = currentFlow || importedFlow
    ? mergeUniqueById(
      currentFlow ? currentFlow.screen : [],
      importedFlow ? importedFlow.screen.filter(
        round => !currentMidiIds.has(round.id) && !currentChordIds.has(round.id)
      ) : [],
      sortNoteFlowRounds
    )
    : null;
  const noteFlowMidi = currentFlow || importedFlow
    ? mergeUniqueById(
      currentFlow ? currentFlow.midi : [],
      importedFlow ? importedFlow.midi.filter(
        round => !currentScreenIds.has(round.id) && !currentChordIds.has(round.id)
      ) : [],
      sortNoteFlowRounds
    )
    : null;
  const noteFlowChordMidi = currentFlow || importedFlow
    ? mergeUniqueById(
      currentFlow ? currentFlow.chordMidi || [] : [],
      importedFlow ? (importedFlow.chordMidi || []).filter(
        round => !currentScreenIds.has(round.id) && !currentMidiIds.has(round.id)
      ) : [],
      sortNoteFlowRounds
    )
    : null;
  const rhythmBars = currentBackup.data.rhythmSenseBars || importedBackup.data.rhythmSenseBars
    ? mergeUniqueById(
      currentBackup.data.rhythmSenseBars || [],
      importedBackup.data.rhythmSenseBars || [],
      sortNoteFlowRounds
    )
    : null;
  const createdAt = options.createdAt === undefined
    ? new Date()
    : options.createdAt;
  const data = {
    options: cloneJson(
      currentBackup.data.options === null
        ? importedBackup.data.options
        : currentBackup.data.options
    ),
    adaptiveOptions: cloneJson(
      currentBackup.data.adaptiveOptions === null
        ? importedBackup.data.adaptiveOptions
        : currentBackup.data.adaptiveOptions
    ),
    adaptiveProgress: adaptive.progress,
    adaptiveHistory: adaptive.history,
    adaptiveProgressMidi: adaptiveMidi.progress,
    adaptiveHistoryMidi: adaptiveMidi.history,
    roundHistory: rounds.history,
    prestigeArchive: mergePrestigeArchives(
      currentBackup.data.prestigeArchive || createEmptyPrestigeArchive(),
      importedBackup.data.prestigeArchive || createEmptyPrestigeArchive()
    ),
    statistics: mergeStoredStatistics(
      currentBackup.data.statistics,
      importedBackup.data.statistics
    )
  };
  if (noteFlowScreen && noteFlowMidi) {
    data.noteFlowRounds = {
      screen: noteFlowScreen.values,
      midi: noteFlowMidi.values,
      chordMidi: noteFlowChordMidi.values
    };
  }
  if (rhythmBars) data.rhythmSenseBars = rhythmBars.values;
  const dailyHistory = mergeDailyTaskArchives(currentBackup.data.dailyTaskHistory,
    importedBackup.data.dailyTaskHistory);
  if (dailyHistory) data.dailyTaskHistory = dailyHistory;

  return {
    backup: {
      format: SAVE_DATA_BACKUP_FORMAT,
      version: dailyHistory ? 6 : rhythmBars ? 4 : 3,
      app: {
        name: "Noten-Pfoten",
        version: String(options.appVersion || currentBackup.app.version)
      },
      createdAt: normalizeMergeDate(createdAt),
      data
    },
    report: {
      addedNormalRounds: rounds.added,
      duplicateNormalRounds: rounds.duplicates,
      conflictingNormalRounds: rounds.conflicts,
      totalNormalRounds: rounds.history.rounds.length,
      addedNoteFlowRounds: noteFlowScreen
        ? noteFlowScreen.added + noteFlowMidi.added + noteFlowChordMidi.added : 0,
      duplicateNoteFlowRounds: noteFlowScreen
        ? noteFlowScreen.duplicates + noteFlowMidi.duplicates
          + noteFlowChordMidi.duplicates : 0,
      conflictingNoteFlowRounds: noteFlowScreen
        ? noteFlowScreen.conflicts + noteFlowMidi.conflicts
          + noteFlowChordMidi.conflicts + importedScreenConflicts
          + importedMidiConflicts + importedChordConflicts : 0,
      addedRhythmSenseBars: rhythmBars ? rhythmBars.added : 0,
      duplicateRhythmSenseBars: rhythmBars ? rhythmBars.duplicates : 0,
      conflictingRhythmSenseBars: rhythmBars ? rhythmBars.conflicts : 0,
      addedAdaptiveBaselines: adaptive.addedBaselines
        + adaptiveMidi.addedBaselines,
      duplicateAdaptiveBaselines: adaptive.duplicateBaselines
        + adaptiveMidi.duplicateBaselines,
      conflictingAdaptiveBaselines: adaptive.conflictingBaselines
        + adaptiveMidi.conflictingBaselines,
      addedAdaptiveEvaluations: adaptive.addedEvaluations
        + adaptiveMidi.addedEvaluations,
      duplicateAdaptiveEvaluations: adaptive.duplicateEvaluations
        + adaptiveMidi.duplicateEvaluations,
      conflictingAdaptiveEvaluations: adaptive.conflictingEvaluations
        + adaptiveMidi.conflictingEvaluations,
      totalAdaptiveEvaluations: adaptive.history.evaluations.length
        + adaptiveMidi.history.evaluations.length,
      totalAdaptiveAttempts: getAdaptiveAttemptCount(adaptive.progress)
        + getAdaptiveAttemptCount(adaptiveMidi.progress),
      totalScreenAdaptiveAttempts: getAdaptiveAttemptCount(adaptive.progress),
      totalMidiAdaptiveAttempts: getAdaptiveAttemptCount(adaptiveMidi.progress),
      keptCurrentNormalOptions: currentBackup.data.options !== null,
      keptCurrentAdaptiveOptions: currentBackup.data.adaptiveOptions !== null
    }
  };
}

export default {
  mergeRoundHistories,
  mergeAdaptiveHistories,
  mergeStoredStatistics,
  mergeSaveDataBackups
};
