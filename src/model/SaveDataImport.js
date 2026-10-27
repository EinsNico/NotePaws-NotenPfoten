import {
  RECORD_STORAGE_PREFIX,
  SAVE_DATA_STORAGE_KEYS,
  SCORE_STORAGE_PREFIX,
  collectSaveData,
  createSaveDataBackup,
  normalizeSaveDataBackup,
  summarizeSaveDataBackup,
  validateSaveDataBackup
} from "./SaveDataBackup";
import { createIndexedDbSaveDataBackup } from "./SaveDataFiles";
import { canonicalize } from "./CanonicalJson";
import { recoverPendingLearningWrites } from "./LearningWriteRecovery";
import { mergeSaveDataBackups } from "./SaveDataMerge";
import { markImportedRoundHistoryForPrestige } from "./PrestigeEligibility";
import SingleNotesLearningStorage from "./SingleNotesLearningStorage";
import NoteFlowRoundStorage from "./NoteFlowRoundStorage";
import RhythmSenseRoundStorage from "./RhythmSenseRoundStorage";
import {
  compactStoredAdaptiveHistories
} from "./SingleNotesStorageTransition";

export const SAVE_DATA_IMPORT_MODES = {
  replace: "replace",
  merge: "merge"
};

function cloneJson(value) {
  if (value === null || value === undefined) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function valuesMatch(left, right) {
  return JSON.stringify(canonicalize(left))
    === JSON.stringify(canonicalize(right));
}

export function listStorageKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string") {
      keys.push(key);
    }
  }
  return keys;
}

function isOwnedStorageKey(key) {
  return Object.keys(SAVE_DATA_STORAGE_KEYS).some(name => (
    SAVE_DATA_STORAGE_KEYS[name] === key
  )) || key.indexOf(SCORE_STORAGE_PREFIX) === 0
    || key.indexOf(RECORD_STORAGE_PREFIX) === 0;
}

function getIncomingStorageKeys(data) {
  return data.statistics.scoreEntries
    .concat(data.statistics.recordEntries)
    .map(entry => entry.storageKey);
}

function getTouchedStorageKeys(storage, data) {
  const keys = Object.keys(SAVE_DATA_STORAGE_KEYS).map(name => (
    SAVE_DATA_STORAGE_KEYS[name]
  ));
  listStorageKeys(storage).forEach(key => {
    if (isOwnedStorageKey(key) && keys.indexOf(key) === -1) {
      keys.push(key);
    }
  });
  getIncomingStorageKeys(data).forEach(key => {
    if (keys.indexOf(key) === -1) {
      keys.push(key);
    }
  });
  return keys.sort();
}

function createStorageValues(data) {
  const values = Object.create(null);
  values[SAVE_DATA_STORAGE_KEYS.options] = data.options;
  values[SAVE_DATA_STORAGE_KEYS.adaptiveOptions] = data.adaptiveOptions;
  values[SAVE_DATA_STORAGE_KEYS.adaptiveProgress] = data.adaptiveProgress;
  values[SAVE_DATA_STORAGE_KEYS.adaptiveHistory] = data.adaptiveHistory;
  values[SAVE_DATA_STORAGE_KEYS.adaptiveProgressMidi] = (
    data.adaptiveProgressMidi
  );
  values[SAVE_DATA_STORAGE_KEYS.adaptiveHistoryMidi] = data.adaptiveHistoryMidi;
  values[SAVE_DATA_STORAGE_KEYS.roundHistory] = data.roundHistory;
  values[SAVE_DATA_STORAGE_KEYS.prestigeArchive] = data.prestigeArchive || null;
  values[SAVE_DATA_STORAGE_KEYS.legacyLastScores] = (
    data.statistics.legacyLastScores
  );
  values[SAVE_DATA_STORAGE_KEYS.legacyRecord] = data.statistics.legacyRecord;
  data.statistics.scoreEntries.forEach(entry => {
    values[entry.storageKey] = entry.value;
  });
  data.statistics.recordEntries.forEach(entry => {
    values[entry.storageKey] = entry.value;
  });
  return values;
}

export function captureRawStorage(storage, keys) {
  return keys.reduce((snapshot, key) => {
    snapshot[key] = storage.getItem(key);
    return snapshot;
  }, Object.create(null));
}

function captureOwnedStorage(storage) {
  return listStorageKeys(storage)
    .filter(isOwnedStorageKey)
    .sort()
    .map(key => ({ key, value: storage.getItem(key) }));
}

function restoreOwnedStorage(storage, snapshot) {
  const values = (Array.isArray(snapshot) ? snapshot : []).reduce(
    (result, entry) => {
      result[entry.key] = entry.value;
      return result;
    },
    Object.create(null)
  );
  const keys = listStorageKeys(storage).filter(isOwnedStorageKey);
  Object.keys(values).forEach(key => {
    if (keys.indexOf(key) === -1) {
      keys.push(key);
    }
  });
  keys.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      storage.removeItem(key);
    } else if (values[key] === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, values[key]);
    }
  });
  if (!valuesMatch(captureOwnedStorage(storage), snapshot)) {
    throw new Error("The previous local save data could not be restored.");
  }
}

function writeStorageValues(storage, keys, values) {
  keys.forEach(key => {
    if (
      Object.prototype.hasOwnProperty.call(values, key)
      && values[key] !== null
    ) {
      storage.setItem(key, JSON.stringify({ data: values[key] }));
    } else {
      storage.removeItem(key);
    }
  });
}

export function restoreRawStorage(storage, keys, snapshot) {
  keys.forEach(key => {
    if (snapshot[key] === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, snapshot[key]);
    }
  });
}

function validateImportMode(mode) {
  if (
    mode !== SAVE_DATA_IMPORT_MODES.replace
    && mode !== SAVE_DATA_IMPORT_MODES.merge
  ) {
    throw new Error(`Unknown save-data import mode: ${mode}`);
  }
}

export function prepareSaveDataImport(
  storage,
  importedBackup,
  mode,
  options = {}
) {
  validateImportMode(mode);
  const importedValidation = validateSaveDataBackup(importedBackup);
  if (!importedValidation.valid) {
    throw new Error(
      `Imported save data is invalid: ${importedValidation.errors.join(", ")}`
    );
  }
  const normalizedImportedBackup = normalizeSaveDataBackup(importedBackup);
  if (mode === SAVE_DATA_IMPORT_MODES.merge
    && normalizedImportedBackup.data.dailyTaskHistory && !options.currentBackup) {
    throw new Error("A complete daily task history snapshot is required for merging.");
  }
  if (mode === SAVE_DATA_IMPORT_MODES.merge
    && normalizedImportedBackup.data.rhythmSenseBars
    && (!options.currentBackup
      || !options.currentBackup.data.rhythmSenseBars)) {
    throw new Error("A complete Rhythm Sense database snapshot is required for merging.");
  }
  if (mode === SAVE_DATA_IMPORT_MODES.merge
    && normalizedImportedBackup.data.noteFlowRounds
    && (!options.currentBackup
      || !options.currentBackup.data.noteFlowRounds)) {
    throw new Error("A complete Note Flow database snapshot is required for merging.");
  }
  const currentStorageSnapshot = captureOwnedStorage(storage);
  let currentBackup = null;
  try {
    if (options.currentBackup !== undefined) {
      const currentValidation = validateSaveDataBackup(options.currentBackup);
      if (!currentValidation.valid) {
        throw new Error(
          `Current save data is invalid: ${currentValidation.errors.join(", ")}`
        );
      }
      currentBackup = normalizeSaveDataBackup(options.currentBackup);
    } else {
      currentBackup = createSaveDataBackup(storage, {
        appVersion: options.appVersion,
        createdAt: options.createdAt
      });
    }
  } catch (error) {
    if (mode === SAVE_DATA_IMPORT_MODES.merge) {
      throw new Error(`Current save data cannot be merged: ${error.message}`);
    }
  }
  const mergeResult = mode === SAVE_DATA_IMPORT_MODES.merge
    ? mergeSaveDataBackups(currentBackup, normalizedImportedBackup, options)
    : null;
  const resultBackup = mergeResult
    ? mergeResult.backup
    : cloneJson(normalizedImportedBackup);
  if (!mergeResult) {
    resultBackup.data.roundHistory = markImportedRoundHistoryForPrestige(
      resultBackup.data.roundHistory
    );
  }

  return {
    mode,
    currentBackup,
    currentStorageSnapshot,
    importedBackup: cloneJson(normalizedImportedBackup),
    resultBackup,
    summary: {
      current: currentBackup ? summarizeSaveDataBackup(currentBackup) : null,
      imported: summarizeSaveDataBackup(normalizedImportedBackup),
      result: summarizeSaveDataBackup(resultBackup)
    },
    mergeReport: mergeResult ? mergeResult.report : null
  };
}

function validatePreparedSaveDataImport(preparedImport, expectedMode = null) {
  if (
    !preparedImport
    || typeof preparedImport !== "object"
    || !preparedImport.resultBackup
  ) {
    throw new Error("A prepared save-data import is required.");
  }
  validateImportMode(preparedImport.mode);
  if (expectedMode !== null && preparedImport.mode !== expectedMode) {
    throw new Error(`A prepared ${expectedMode} import is required.`);
  }
  if (preparedImport.mode === SAVE_DATA_IMPORT_MODES.merge
    && preparedImport.importedBackup
    && preparedImport.importedBackup.data.noteFlowRounds
    && (!preparedImport.currentBackup
      || !preparedImport.currentBackup.data.noteFlowRounds)) {
    throw new Error("A complete Note Flow database snapshot is required for merging.");
  }
  if (preparedImport.mode === SAVE_DATA_IMPORT_MODES.merge
    && preparedImport.importedBackup
    && preparedImport.importedBackup.data.rhythmSenseBars
    && (!preparedImport.currentBackup
      || !preparedImport.currentBackup.data.rhythmSenseBars)) {
    throw new Error("A complete Rhythm Sense database snapshot is required for merging.");
  }
  const validation = validateSaveDataBackup(preparedImport.resultBackup);
  if (!validation.valid) {
    throw new Error(
      `Prepared save data is invalid: ${validation.errors.join(", ")}`
    );
  }
}

function verifyPreparedLocalStorage(storage, preparedImport) {
  if (
    !Array.isArray(preparedImport.currentStorageSnapshot)
    || !valuesMatch(
      captureOwnedStorage(storage),
      preparedImport.currentStorageSnapshot
    )
  ) {
    throw new Error("Local save data changed after the import preview.");
  }
}

export function applyPreparedSaveDataImport(storage, preparedImport, options = {}) {
  validatePreparedSaveDataImport(preparedImport);
  verifyPreparedLocalStorage(storage, preparedImport);

  const data = preparedImport.resultBackup.data;
  if ((data.noteFlowRounds || data.rhythmSenseBars || data.dailyTaskHistory) && !options.allowDatabaseData) {
    throw new Error("Exercise records require the database-backed import.");
  }
  const touchedKeys = getTouchedStorageKeys(storage, data);
  const previousValues = captureRawStorage(storage, touchedKeys);
  const storageValues = createStorageValues(data);
  try {
    writeStorageValues(storage, touchedKeys, storageValues);
    const writtenData = collectSaveData(storage);
    const expectedLocalData = Object.assign({}, data);
    delete expectedLocalData.noteFlowRounds;
    delete expectedLocalData.rhythmSenseBars;
    delete expectedLocalData.dailyTaskHistory;
    if (!valuesMatch(writtenData, expectedLocalData)) {
      throw new Error("The imported save data could not be verified after writing.");
    }
  } catch (error) {
    let rollbackSucceeded = true;
    try {
      restoreRawStorage(storage, touchedKeys, previousValues);
    } catch (rollbackError) {
      rollbackSucceeded = false;
    }
    const importError = new Error(
      rollbackSucceeded
        ? `Import failed and was rolled back: ${error.message}`
        : `Import failed and rollback also failed: ${error.message}`
    );
    importError.rollbackSucceeded = rollbackSucceeded;
    throw importError;
  }

  return {
    mode: preparedImport.mode,
    summary: cloneJson(preparedImport.summary),
    mergeReport: cloneJson(preparedImport.mergeReport),
    requiresReload: true
  };
}

async function applyPreparedSaveDataEverywhere(
  storage,
  preparedImport,
  expectedMode,
  learningStorage,
  options = {}
) {
  validatePreparedSaveDataImport(preparedImport, expectedMode);
  verifyPreparedLocalStorage(storage, preparedImport);
  if (
    expectedMode === SAVE_DATA_IMPORT_MODES.merge
    && !preparedImport.currentBackup
  ) {
    throw new Error("A database-backed current save is required for merging.");
  }
  await recoverPendingLearningWrites(learningStorage);
  verifyPreparedLocalStorage(storage, preparedImport);
  if (expectedMode === SAVE_DATA_IMPORT_MODES.merge) {
    const readCurrentBackup = options.readCurrentBackup
      || createIndexedDbSaveDataBackup;
    const currentBackup = await readCurrentBackup(storage, {
      learningStorage,
      includeNoteFlowRounds: Boolean(
        preparedImport.currentBackup.data.noteFlowRounds
      ),
      includeRhythmSenseBars: Boolean(
        preparedImport.currentBackup.data.rhythmSenseBars
      ),
      noteFlowStorage: options.noteFlowStorage,
      rhythmStorage: options.rhythmStorage
    });
    if (!valuesMatch(currentBackup.data, preparedImport.currentBackup.data)) {
      throw new Error("IndexedDB save data changed after the import preview.");
    }
    verifyPreparedLocalStorage(storage, preparedImport);
  }
  if (preparedImport.resultBackup.data.noteFlowRounds
    || expectedMode === SAVE_DATA_IMPORT_MODES.replace) {
    await NoteFlowRoundStorage.flush();
  }
  if (preparedImport.resultBackup.data.rhythmSenseBars
    || expectedMode === SAVE_DATA_IMPORT_MODES.replace) {
    await RhythmSenseRoundStorage.flush();
  }
  const localResult = applyPreparedSaveDataImport(storage, preparedImport, {
    allowDatabaseData: true
  });
  try {
    const databaseResult = await learningStorage.replaceBackupData(
      preparedImport.resultBackup.data,
      { replaceNoteFlowRounds: expectedMode === SAVE_DATA_IMPORT_MODES.replace
        || Boolean(preparedImport.resultBackup.data.noteFlowRounds),
      replaceRhythmSenseBars: expectedMode === SAVE_DATA_IMPORT_MODES.replace
        || Boolean(preparedImport.resultBackup.data.rhythmSenseBars) }
    );
    if (!databaseResult || databaseResult.saved === false) {
      throw databaseResult && databaseResult.error
        ? databaseResult.error
        : new Error("IndexedDB backup replacement failed.");
    }
    const histories = {
      adaptiveHistory: preparedImport.resultBackup.data.adaptiveHistory,
      adaptiveHistoryMidi: (
        preparedImport.resultBackup.data.adaptiveHistoryMidi
      )
    };
    const compactionKey = "legacy-history-compaction:import";
    const compact = () => compactStoredAdaptiveHistories(storage, histories);
    let compaction;
    try {
      compaction = compact();
      if (typeof learningStorage.resolveRetryableFailure === "function") {
        learningStorage.resolveRetryableFailure(compactionKey);
      }
    } catch (compactionError) {
      compaction = {
        compacted: false,
        error: compactionError
      };
      if (typeof learningStorage.rememberRetryableFailure === "function") {
        learningStorage.rememberRetryableFailure({
          key: compactionKey,
          scope: "all:single-notes",
          operation: "legacy-history-compaction",
          execute: compact
        }, compactionError);
      }
    }
    return Object.assign({}, localResult, {
      databaseReplaced: true,
      replacedScopes: databaseResult.replacedScopes,
      adaptiveAttemptCount: databaseResult.attemptCount,
      noteFlowRoundCount: databaseResult.noteFlowRoundCount,
      legacyHistoryCompacted: compaction.compacted === true,
      legacyHistoryCompactionError: compaction.error || null
    });
  } catch (error) {
    let rollbackSucceeded = true;
    try {
      restoreOwnedStorage(storage, preparedImport.currentStorageSnapshot);
    } catch (rollbackError) {
      rollbackSucceeded = false;
    }
    const importError = new Error(
      rollbackSucceeded
        ? `IndexedDB import failed and local data was restored: ${error.message}`
        : `IndexedDB import failed and local rollback also failed: ${error.message}`
    );
    importError.rollbackSucceeded = rollbackSucceeded;
    throw importError;
  }
}

export async function applyPreparedSaveDataReplaceEverywhere(
  storage,
  preparedImport,
  learningStorage = SingleNotesLearningStorage
) {
  return applyPreparedSaveDataEverywhere(
    storage,
    preparedImport,
    SAVE_DATA_IMPORT_MODES.replace,
    learningStorage
  );
}

export async function applyPreparedSaveDataMergeEverywhere(
  storage,
  preparedImport,
  learningStorage = SingleNotesLearningStorage,
  options = {}
) {
  return applyPreparedSaveDataEverywhere(
    storage,
    preparedImport,
    SAVE_DATA_IMPORT_MODES.merge,
    learningStorage,
    options
  );
}

export function importSaveData(
  storage,
  importedBackup,
  mode,
  options = {}
) {
  const preparedImport = prepareSaveDataImport(
    storage,
    importedBackup,
    mode,
    options
  );
  return applyPreparedSaveDataImport(storage, preparedImport);
}

export default {
  SAVE_DATA_IMPORT_MODES,
  prepareSaveDataImport,
  applyPreparedSaveDataImport,
  applyPreparedSaveDataMergeEverywhere,
  applyPreparedSaveDataReplaceEverywhere,
  importSaveData
};
