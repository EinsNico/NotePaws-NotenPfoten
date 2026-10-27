import {
  RECORD_STORAGE_PREFIX,
  SAVE_DATA_STORAGE_KEYS,
  SCORE_STORAGE_PREFIX
} from "./SaveDataBackup";
import {
  captureRawStorage,
  listStorageKeys,
  restoreRawStorage
} from "./SaveDataImport";
import SingleNotesLearningStorage from "./SingleNotesLearningStorage";
import NoteFlowRoundStorage from "./NoteFlowRoundStorage";
import RhythmSenseRoundStorage from "./RhythmSenseRoundStorage";

export const LEARNING_DATA_STORAGE_KEYS = [
  SAVE_DATA_STORAGE_KEYS.prestigeArchive,
  SAVE_DATA_STORAGE_KEYS.roundHistory,
  SAVE_DATA_STORAGE_KEYS.legacyLastScores,
  SAVE_DATA_STORAGE_KEYS.legacyRecord,
  SAVE_DATA_STORAGE_KEYS.adaptiveProgress,
  SAVE_DATA_STORAGE_KEYS.adaptiveHistory,
  SAVE_DATA_STORAGE_KEYS.adaptiveProgressMidi,
  SAVE_DATA_STORAGE_KEYS.adaptiveHistoryMidi
];

export function isLearningDataStorageKey(key) {
  return LEARNING_DATA_STORAGE_KEYS.indexOf(key) !== -1
    || key.indexOf(SCORE_STORAGE_PREFIX) === 0
    || key.indexOf(RECORD_STORAGE_PREFIX) === 0;
}

export function getLearningDataStorageKeys(storage) {
  const keys = LEARNING_DATA_STORAGE_KEYS.slice();
  listStorageKeys(storage).forEach(key => {
    if (isLearningDataStorageKey(key) && keys.indexOf(key) === -1) {
      keys.push(key);
    }
  });
  return keys.sort();
}

export function deleteAllLearningData(storage = localStorage) {
  const keys = getLearningDataStorageKeys(storage);
  const previousValues = captureRawStorage(storage, keys);
  const deletedKeys = keys.filter(key => previousValues[key] !== null);

  try {
    keys.forEach(key => storage.removeItem(key));
    const remainingKeys = keys.filter(key => storage.getItem(key) !== null);
    if (remainingKeys.length > 0) {
      throw new Error(
        `Learning data remained after deletion: ${remainingKeys.join(", ")}`
      );
    }
  } catch (error) {
    let rollbackSucceeded = true;
    try {
      restoreRawStorage(storage, keys, previousValues);
    } catch (rollbackError) {
      rollbackSucceeded = false;
    }
    const resetError = new Error(
      rollbackSucceeded
        ? `Learning-data deletion failed and was rolled back: ${error.message}`
        : `Learning-data deletion failed and rollback also failed: ${error.message}`
    );
    resetError.rollbackSucceeded = rollbackSucceeded;
    throw resetError;
  }

  return {
    deletedKeys,
    deletedCount: deletedKeys.length,
    requiresReload: true
  };
}

export async function deleteAllLearningDataEverywhere(
  storage = localStorage,
  clearDatabase = () => SingleNotesLearningStorage.clearAll()
) {
  const practiceWrites = [NoteFlowRoundStorage, RhythmSenseRoundStorage].map(writer => ({
    writer,
    captured: writer.capturePendingWrites(),
    pause: writer.pauseWrites()
  }));
  try {
    // Saves submitted after this boundary wait until the reset finishes. Only
    // the earlier results are cancelled after a verified successful clear.
    await Promise.all(practiceWrites.map(entry => entry.pause.ready));
    const result = await deleteStoredLearningDataEverywhere(storage, clearDatabase);
    practiceWrites.forEach(entry => entry.writer.discardPendingWrites(entry.captured));
    return result;
  } finally {
    practiceWrites.forEach(entry => entry.pause.release());
  }
}

async function deleteStoredLearningDataEverywhere(storage, clearDatabase) {
  const keys = getLearningDataStorageKeys(storage);
  const previousValues = captureRawStorage(storage, keys);
  const localResult = deleteAllLearningData(storage);

  try {
    const databaseResult = await clearDatabase();
    if (databaseResult && databaseResult.saved === false) {
      throw databaseResult.error || new Error("IndexedDB deletion failed");
    }
  } catch (error) {
    let rollbackSucceeded = true;
    try {
      restoreRawStorage(storage, keys, previousValues);
    } catch (rollbackError) {
      rollbackSucceeded = false;
    }
    const resetError = new Error(
      rollbackSucceeded
        ? `IndexedDB deletion failed and local data was restored: ${error.message}`
        : `IndexedDB deletion failed and local rollback also failed: ${error.message}`
    );
    resetError.rollbackSucceeded = rollbackSucceeded;
    throw resetError;
  }

  return Object.assign({}, localResult, { databaseCleared: true });
}

export default {
  LEARNING_DATA_STORAGE_KEYS,
  isLearningDataStorageKey,
  getLearningDataStorageKeys,
  deleteAllLearningData,
  deleteAllLearningDataEverywhere
};
