import {
  createSaveDataBackup,
  parseSaveDataBackup,
  validateSaveDataBackup
} from "./SaveDataBackup";
import {
  ADAPTIVE_HISTORY_VERSION,
  normalizeAdaptiveEvaluation,
  normalizeAdaptiveHistory
} from "./AdaptiveHistory";
import SingleNotesLearningStorage from "./SingleNotesLearningStorage";
import NoteFlowRoundStorage from "./NoteFlowRoundStorage";
import RhythmSenseRoundStorage from "./RhythmSenseRoundStorage";
import {
  compactStoredAdaptiveHistories,
  shouldMigrateLegacyAdaptiveHistory
} from "./SingleNotesStorageTransition";
import { validateStreamedBackupRecord } from "./SaveDataBackup";
import { recoverPendingLearningWrites, recoverPendingPracticeWrites } from "./LearningWriteRecovery";

export const SAVE_DATA_FILE_MIME_TYPE = "application/json";
export const MAX_SAVE_DATA_FILE_SIZE_BYTES = 50 * 1024 * 1024;
// Until the import path is streamed, keep large JSON documents out of the
// Android-to-WebView bridge, where several complete copies can exhaust memory.
export const MAX_UNSTREAMED_IMPORT_SIZE_BYTES = 12 * 1024 * 1024;

export function exceedsUnstreamedImportLimit(fileSize) {
  return fileSize !== null && fileSize !== undefined
    && Number.isFinite(Number(fileSize))
    && Number(fileSize) > MAX_UNSTREAMED_IMPORT_SIZE_BYTES;
}

export function createSaveDataFilename(createdAt) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("A save-data filename needs a valid date.");
  }
  const timestamp = date.toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace("T", "_")
    .replace(/:/g, "-");
  return `Noten-Pfoten-Speicherstand_${timestamp}.json`;
}

export function serializeSaveDataBackup(backup) {
  const validation = validateSaveDataBackup(backup);
  if (!validation.valid) {
    throw new Error(`Cannot export invalid save data: ${validation.errors.join(", ")}`);
  }
  return `${JSON.stringify(backup, null, 2)}\n`;
}

export function createSaveDataExport(storage = localStorage, options = {}) {
  const backup = createSaveDataBackup(storage, options);
  return createExportResult(backup);
}

function createExportResult(backup) {
  return {
    backup,
    filename: createSaveDataFilename(backup.createdAt),
    mimeType: SAVE_DATA_FILE_MIME_TYPE,
    text: serializeSaveDataBackup(backup)
  };
}

function parseAttemptNoteKey(noteKey) {
  const values = String(noteKey || "").split(":");
  const value = Number(values[1]);
  if (
    values.length !== 3
    || !values[0]
    || !Number.isFinite(value)
    || ["natural", "sharp", "flat"].indexOf(values[2]) === -1
  ) {
    throw new Error("Cannot export an invalid single-notes attempt key.");
  }
  return {
    clef: values[0],
    value: Math.round(value),
    isSharp: values[2] !== "flat"
  };
}

export function createAdaptiveEvaluationFromAttempt(attempt) {
  const note = parseAttemptNoteKey(attempt && attempt.noteKey);
  const evaluation = normalizeAdaptiveEvaluation({
    schemaVersion: ADAPTIVE_HISTORY_VERSION,
    id: attempt && attempt.id,
    completedAt: attempt && attempt.completedAt,
    noteKey: attempt && attempt.noteKey,
    exercise: {
      clef: note.clef,
      staff: attempt && typeof attempt.staff === "string"
        ? attempt.staff
        : note.clef,
      value: note.value,
      isSharp: note.isSharp
    },
    correctFirstTry: Boolean(attempt && attempt.correctFirstTry),
    mistakeCount: attempt && attempt.mistakeCount,
    responseTimeMs: attempt && attempt.responseTimeMs
  });
  if (!evaluation) {
    throw new Error("Cannot export an invalid single-notes attempt.");
  }
  return evaluation;
}

function createCompatibleAdaptiveHistory(legacyHistory, attempts) {
  const normalizedLegacyHistory = normalizeAdaptiveHistory(legacyHistory);
  return {
    version: ADAPTIVE_HISTORY_VERSION,
    baselines: normalizedLegacyHistory.baselines,
    evaluations: (Array.isArray(attempts) ? attempts : []).map(
      createAdaptiveEvaluationFromAttempt
    )
  };
}

async function prepareInputGroupForExport(
  learningStorage,
  inputGroup,
  legacyProgress,
  legacyHistory
) {
  if (legacyProgress !== null) {
    const synchronization = await learningStorage.synchronizeProgress(
      inputGroup,
      legacyProgress
    );
    if (!synchronization.saved) {
      throw synchronization.error || new Error("Progress synchronization failed.");
    }
  }
  const readiness = shouldMigrateLegacyAdaptiveHistory(legacyHistory)
    ? await learningStorage.migrateLegacyHistory(inputGroup, legacyHistory)
    : await learningStorage.verifyHistoryReady(inputGroup);
  if (!readiness.saved || !readiness.verified) {
    throw readiness.error || new Error("History migration failed.");
  }
  const snapshot = await learningStorage.readBackupSnapshot(inputGroup);
  if (!snapshot.saved) {
    throw snapshot.error || new Error("Learning backup snapshot failed.");
  }
  return snapshot;
}

async function includeDailyTaskHistory(backup, learningStorage) {
  const result = await learningStorage.readDailyTaskHistory();
  if (!result || !result.saved) {
    throw result && result.error || new Error("Daily task history backup failed.");
  }
  if (result.history) {
    backup.data.dailyTaskHistory = result.history;
    backup.version = 6;
  }
}

export async function createIndexedDbSaveDataExport(
  storage = localStorage,
  options = {}
) {
  const backup = await createIndexedDbSaveDataBackup(storage, Object.assign(
    {}, options, { includeNoteFlowRounds: true, includeRhythmSenseBars: true }
  ));
  return createExportResult(backup);
}

async function prepareInputGroupForStreamExport(
  learningStorage, inputGroup, legacyProgress, legacyHistory
) {
  if (legacyProgress !== null) {
    const synchronization = await learningStorage.synchronizeProgress(
      inputGroup, legacyProgress
    );
    if (!synchronization.saved) {
      throw synchronization.error || new Error("Progress synchronization failed.");
    }
  }
  const readiness = shouldMigrateLegacyAdaptiveHistory(legacyHistory)
    ? await learningStorage.migrateLegacyHistory(inputGroup, legacyHistory)
    : await learningStorage.verifyHistoryReady(inputGroup);
  if (!readiness.saved || !readiness.verified) {
    throw readiness.error || new Error("History migration failed.");
  }
  const progress = await learningStorage.readProgress(inputGroup);
  if (!progress.saved) {
    throw progress.error || new Error("Learning progress read failed.");
  }
  return progress.progress;
}

// Core of a bounded export. The caller supplies a back-pressured writer;
// Android's document picker still needs a chunked file-writing adapter.
export async function streamIndexedDbSaveDataBackup(
  writeChunk, storage = localStorage, options = {}
) {
  if (typeof writeChunk !== "function") {
    throw new TypeError("A backup chunk writer is required.");
  }
  const learningStorage = options.learningStorage || SingleNotesLearningStorage;
  const noteFlowStorage = options.noteFlowStorage || NoteFlowRoundStorage;
  const rhythmStorage = options.rhythmStorage || RhythmSenseRoundStorage;
  const reportProgress = progress => {
    if (typeof options.onProgress === "function") options.onProgress(progress);
  };
  reportProgress({ phase: "preparing", bytesWritten: 0, recordCount: 0 });
  await recoverPendingLearningWrites(learningStorage);
  await recoverPendingPracticeWrites(noteFlowStorage);
  await recoverPendingPracticeWrites(rhythmStorage);
  const backup = createSaveDataBackup(storage, options);
  const legacyHistories = {
    adaptiveHistory: backup.data.adaptiveHistory,
    adaptiveHistoryMidi: backup.data.adaptiveHistoryMidi
  };
  backup.data.adaptiveProgress = await prepareInputGroupForStreamExport(
    learningStorage, "screen", backup.data.adaptiveProgress,
    backup.data.adaptiveHistory
  );
  backup.data.adaptiveProgressMidi = await prepareInputGroupForStreamExport(
    learningStorage, "midi", backup.data.adaptiveProgressMidi,
    backup.data.adaptiveHistoryMidi
  );
  backup.data.adaptiveHistory = createCompatibleAdaptiveHistory(
    backup.data.adaptiveHistory, []
  );
  backup.data.adaptiveHistoryMidi = createCompatibleAdaptiveHistory(
    backup.data.adaptiveHistoryMidi, []
  );
  backup.version = 4;
  backup.data.noteFlowRounds = { screen: [], midi: [], chordMidi: [] };
  backup.data.rhythmSenseBars = [];
  await includeDailyTaskHistory(backup, learningStorage);
  const validation = validateSaveDataBackup(backup);
  if (!validation.valid) {
    throw new Error(`Cannot prepare invalid save data: ${validation.errors.join(", ")}`);
  }

  const pages = {
    "data.adaptiveHistory.evaluations": after => (
      learningStorage.readBackupAttemptsPage("screen", after)
    ),
    "data.adaptiveHistoryMidi.evaluations": after => (
      learningStorage.readBackupAttemptsPage("midi", after)
    ),
    "data.noteFlowRounds.screen": after => (
      noteFlowStorage.readRoundsPage("screen", after)
    ),
    "data.noteFlowRounds.midi": after => (
      noteFlowStorage.readRoundsPage("midi", after)
    ),
    "data.noteFlowRounds.chordMidi": after => (
      noteFlowStorage.readRoundsPage("midi", after, 4, "chord")
    ),
    "data.rhythmSenseBars": after => rhythmStorage.readBarsPage(after)
  };
  const counts = Object.create(null);
  const encoder = new TextEncoder();
  let pending = "";
  let bytesWritten = 0;
  let recordCount = 0;
  reportProgress({ phase: "writing", bytesWritten, recordCount });
  async function flush() {
    if (!pending) return;
    const chunk = pending;
    pending = "";
    await writeChunk(chunk);
    bytesWritten += encoder.encode(chunk).length;
    reportProgress({ phase: "writing", bytesWritten, recordCount });
  }
  async function emit(value) {
    let offset = 0;
    while (offset < value.length) {
      const available = 64 * 1024 - pending.length;
      let end = Math.min(value.length, offset + available);
      // Android encodes each bridge message separately. Keep a UTF-16
      // surrogate pair together so splitting a long title cannot corrupt it.
      if (end < value.length && end > offset
        && value.charCodeAt(end - 1) >= 0xd800
        && value.charCodeAt(end - 1) <= 0xdbff
        && value.charCodeAt(end) >= 0xdc00
        && value.charCodeAt(end) <= 0xdfff) {
        end -= 1;
      }
      if (end === offset) {
        await flush();
        continue;
      }
      pending += value.slice(offset, end);
      offset = end;
      if (pending.length >= 64 * 1024) await flush();
    }
  }
  async function writePagedArray(section) {
    await emit("[");
    let after = null;
    let first = true;
    while (true) {
      const result = await pages[section](after);
      if (!result || !result.saved || !result.page
        || !Array.isArray(result.page.records)) {
        throw result && result.error
          ? result.error : new Error(`Cannot read backup page: ${section}`);
      }
      for (const storedRecord of result.page.records) {
        const record = section.indexOf(".evaluations") !== -1
          ? createAdaptiveEvaluationFromAttempt(storedRecord)
          : storedRecord;
        if (!validateStreamedBackupRecord(section, record).valid) {
          throw new Error(`Invalid backup record in ${section}.`);
        }
        await emit(`${first ? "" : ","}${JSON.stringify(record)}`);
        first = false;
        counts[section] = (counts[section] || 0) + 1;
        recordCount += 1;
      }
      // A chain of already-resolved awaits can starve rendering and input.
      // Yield between bounded pages, without retaining the complete backup.
      await new Promise(resolve => setTimeout(resolve, 0));
      if (result.page.done) break;
      const next = result.page.nextBlockNumber;
      if (!Number.isSafeInteger(next) || next < 0
        || (after !== null && next <= after)
        || result.page.records.length === 0) {
        throw new Error(`Invalid backup page sequence in ${section}.`);
      }
      after = next;
    }
    await emit("]");
  }
  async function writeValue(value, path = "") {
    if (pages[path]) return writePagedArray(path);
    if (Array.isArray(value)) {
      await emit("[");
      for (let index = 0; index < value.length; index += 1) {
        if (index) await emit(",");
        await writeValue(value[index], `${path}[${index}]`);
      }
      await emit("]");
    } else if (value && typeof value === "object") {
      await emit("{");
      const keys = Object.keys(value).filter(key => value[key] !== undefined);
      for (let index = 0; index < keys.length; index += 1) {
        if (index) await emit(",");
        const key = keys[index];
        await emit(`${JSON.stringify(key)}:`);
        await writeValue(value[key], path ? `${path}.${key}` : key);
      }
      await emit("}");
    } else {
      await emit(JSON.stringify(value) || "null");
    }
  }
  await writeValue(backup);
  await emit("\n");
  await flush();
  reportProgress({ phase: "finalizing", bytesWritten, recordCount });
  compactStoredAdaptiveHistories(storage, legacyHistories);
  return {
    filename: createSaveDataFilename(backup.createdAt),
    mimeType: SAVE_DATA_FILE_MIME_TYPE,
    bytesWritten,
    counts
  };
}

export async function createIndexedDbSaveDataBackup(
  storage = localStorage,
  options = {}
) {
  const learningStorage = options.learningStorage
    || SingleNotesLearningStorage;
  await recoverPendingLearningWrites(learningStorage);
  const backup = createSaveDataBackup(storage, options);
  const legacyHistories = {
    adaptiveHistory: backup.data.adaptiveHistory,
    adaptiveHistoryMidi: backup.data.adaptiveHistoryMidi
  };
  const screen = await prepareInputGroupForExport(
    learningStorage,
    "screen",
    backup.data.adaptiveProgress,
    backup.data.adaptiveHistory
  );
  const midi = await prepareInputGroupForExport(
    learningStorage,
    "midi",
    backup.data.adaptiveProgressMidi,
    backup.data.adaptiveHistoryMidi
  );
  backup.data.adaptiveProgress = screen.progress;
  backup.data.adaptiveHistory = createCompatibleAdaptiveHistory(
    backup.data.adaptiveHistory,
    screen.attempts
  );
  backup.data.adaptiveProgressMidi = midi.progress;
  backup.data.adaptiveHistoryMidi = createCompatibleAdaptiveHistory(
    backup.data.adaptiveHistoryMidi,
    midi.attempts
  );
  if (options.includeNoteFlowRounds) {
    const noteFlowStorage = options.noteFlowStorage || NoteFlowRoundStorage;
    await recoverPendingPracticeWrites(noteFlowStorage);
    const screenRounds = await noteFlowStorage.readRoundsForExport("screen");
    const midiRounds = await noteFlowStorage.readRoundsForExport("midi");
    const chordMidiRounds = await noteFlowStorage.readRoundsForExport("midi", "chord");
    if (!screenRounds.saved || !midiRounds.saved || !chordMidiRounds.saved) {
      throw screenRounds.error || midiRounds.error || chordMidiRounds.error
        || new Error("Note Flow backup snapshot failed.");
    }
    backup.version = 3;
    backup.data.noteFlowRounds = {
      screen: screenRounds.rounds,
      midi: midiRounds.rounds,
      chordMidi: chordMidiRounds.rounds
    };
  }
  if (options.includeRhythmSenseBars) {
    const rhythmStorage = options.rhythmStorage || RhythmSenseRoundStorage;
    await recoverPendingPracticeWrites(rhythmStorage);
    const rhythmBars = await rhythmStorage.readBarsForExport();
    if (!rhythmBars.saved) {
      throw rhythmBars.error || new Error("Rhythm Sense backup snapshot failed.");
    }
    backup.version = 4;
    backup.data.rhythmSenseBars = rhythmBars.bars;
  }
  const validation = validateSaveDataBackup(backup);
  if (!validation.valid) {
    throw new Error(
      `Cannot prepare invalid save data: ${validation.errors.join(", ")}`
    );
  }
  await includeDailyTaskHistory(backup, learningStorage);
  const finalValidation = validateSaveDataBackup(backup);
  if (!finalValidation.valid) throw new Error("Daily task history backup is invalid.");
  compactStoredAdaptiveHistories(storage, legacyHistories);
  return backup;
}

export function parseSaveDataFile(text, fileSize = null) {
  if (
    fileSize !== null
    && Number.isFinite(Number(fileSize))
    && Number(fileSize) > MAX_SAVE_DATA_FILE_SIZE_BYTES
  ) {
    return {
      valid: false,
      errors: ["file-too-large"],
      backup: null
    };
  }
  return parseSaveDataBackup(text);
}

export default {
  SAVE_DATA_FILE_MIME_TYPE,
  MAX_SAVE_DATA_FILE_SIZE_BYTES,
  MAX_UNSTREAMED_IMPORT_SIZE_BYTES,
  exceedsUnstreamedImportLimit,
  createSaveDataFilename,
  serializeSaveDataBackup,
  createSaveDataExport,
  createAdaptiveEvaluationFromAttempt,
  createIndexedDbSaveDataBackup,
  createIndexedDbSaveDataExport,
  streamIndexedDbSaveDataBackup,
  parseSaveDataFile
};
