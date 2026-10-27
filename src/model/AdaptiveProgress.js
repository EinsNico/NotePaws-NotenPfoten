import * as Lockr from "lockr";
import {
  createAdaptiveProgress,
  normalizeAdaptiveProgress,
  updateAdaptiveProgress
} from "./AdaptiveLearning";
import {
  ADAPTIVE_HISTORY_STORAGE_KEY,
  addAdaptiveEvaluation,
  createAdaptiveEvaluation,
  createAdaptiveHistory,
  hasAdaptiveHistoryData,
  normalizeAdaptiveHistory,
  rebuildAdaptiveProgress
} from "./AdaptiveHistory";
import SingleNotesLearningStorage, {
  createSingleNotesSessionId,
  getSingleNotesScope
} from "./SingleNotesLearningStorage";
import {
  compactStoredAdaptiveHistories,
  createBaselineOnlyAdaptiveHistory,
  shouldMigrateLegacyAdaptiveHistory,
  shouldWriteLegacyAdaptiveHistory
} from "./SingleNotesStorageTransition";
import {
  createEmptySingleNotesStatisticsSnapshot
} from "./SingleNotesStatistics";

export const ADAPTIVE_PROGRESS_STORAGE_KEY = "adaptiveProgress";
export const ADAPTIVE_MIDI_PROGRESS_STORAGE_KEY = "adaptiveProgressMidi";
export const ADAPTIVE_MIDI_HISTORY_STORAGE_KEY = "adaptiveHistoryMidi";
export const ADAPTIVE_INPUT_SCREEN = "screen";
export const ADAPTIVE_INPUT_MIDI = "midi";

export function getAdaptiveInputGroup(inputMode) {
  return inputMode === ADAPTIVE_INPUT_MIDI
    ? ADAPTIVE_INPUT_MIDI
    : ADAPTIVE_INPUT_SCREEN;
}

export function getAdaptiveStorageKeys(inputMode) {
  return getAdaptiveInputGroup(inputMode) === ADAPTIVE_INPUT_MIDI
    ? {
      progress: ADAPTIVE_MIDI_PROGRESS_STORAGE_KEY,
      history: ADAPTIVE_MIDI_HISTORY_STORAGE_KEY
    }
    : {
      progress: ADAPTIVE_PROGRESS_STORAGE_KEY,
      history: ADAPTIVE_HISTORY_STORAGE_KEY
    };
}

export function getAdaptiveProgressSummary(progress) {
  const normalized = normalizeAdaptiveProgress(progress);
  const keys = Object.keys(normalized.notes);
  return keys.reduce((summary, key) => {
    const record = normalized.notes[key];
    summary.practicedNotes += 1;
    summary.attempts += record.attempts;
    summary.correctFirstTry += record.correctFirstTry;
    summary.struggled += record.struggled;
    summary.totalMistakes += record.totalMistakes;
    return summary;
  }, {
    practicedNotes: 0,
    attempts: 0,
    correctFirstTry: 0,
    struggled: 0,
    totalMistakes: 0
  });
}

function legacyWriteKey(inputGroup) {
  return `legacy:${getAdaptiveInputGroup(inputGroup)}`;
}

function writeLockrValue(key, value) {
  const storageKey = typeof Lockr._getPrefixedKey === "function"
    ? Lockr._getPrefixedKey(key)
    : key;
  localStorage.setItem(storageKey, JSON.stringify({ data: value }));
}

export function persistLegacyAdaptiveState(
  inputGroup,
  storageKeys,
  history,
  progress,
  options = {}
) {
  const key = legacyWriteKey(inputGroup);
  const write = () => {
    if (shouldWriteLegacyAdaptiveHistory(options)) {
      writeLockrValue(storageKeys.history, history);
    }
    writeLockrValue(storageKeys.progress, progress);
    return { saved: true };
  };
  try {
    const result = write();
    SingleNotesLearningStorage.resolveRetryableFailure(key);
    return result;
  } catch (error) {
    SingleNotesLearningStorage.rememberRetryableFailure({
      key,
      scope: getSingleNotesScopeForLegacy(inputGroup),
      operation: "legacy",
      execute: write
    }, error);
    return { saved: false, error };
  }
}

function getSingleNotesScopeForLegacy(inputGroup) {
  return getAdaptiveInputGroup(inputGroup) === ADAPTIVE_INPUT_MIDI
    ? "midi:single-notes"
    : "screen:single-notes";
}

function hasProgressNotes(progress) {
  return Object.keys(normalizeAdaptiveProgress(progress).notes).length > 0;
}

function compactLegacyAdaptiveHistory(inputGroup, storageKeys, history) {
  const key = `legacy-history-compaction:${getAdaptiveInputGroup(inputGroup)}`;
  const compact = () => compactStoredAdaptiveHistories(
    localStorage,
    { [storageKeys.history]: history },
    [storageKeys.history]
  );
  try {
    const result = compact();
    SingleNotesLearningStorage.resolveRetryableFailure(key);
    return { saved: true, result };
  } catch (error) {
    SingleNotesLearningStorage.rememberRetryableFailure({
      key,
      scope: getSingleNotesScopeForLegacy(inputGroup),
      operation: "legacy-history-compaction",
      execute: compact
    }, error);
    return { saved: false, error };
  }
}

const AdaptiveProgress = {
  progress: createAdaptiveProgress(),
  history: createAdaptiveHistory(),
  evaluationIds: Object.create(null),
  inputGroup: ADAPTIVE_INPUT_SCREEN,
  databaseLoadSequence: 0,
  statisticsSnapshot: createEmptySingleNotesStatisticsSnapshot(
    getSingleNotesScope(ADAPTIVE_INPUT_SCREEN)
  ),

  load(inputMode = ADAPTIVE_INPUT_SCREEN) {
    this.inputGroup = getAdaptiveInputGroup(inputMode);
    this.statisticsSnapshot = createEmptySingleNotesStatisticsSnapshot(
      getSingleNotesScope(this.inputGroup)
    );
    const storageKeys = getAdaptiveStorageKeys(this.inputGroup);
    const storedProgress = normalizeAdaptiveProgress(
      Lockr.get(storageKeys.progress)
    );
    const storedHistory = Lockr.get(storageKeys.history);
    const hasStoredHistory = storedHistory !== null
      && storedHistory !== undefined;
    this.history = normalizeAdaptiveHistory(
      storedHistory
    );
    if (!hasAdaptiveHistoryData(this.history) && !hasStoredHistory) {
      this.history = createAdaptiveHistory(storedProgress);
    }
    this.progress = this.history.evaluations.length > 0
      ? rebuildAdaptiveProgress(this.history)
      : hasProgressNotes(storedProgress)
        ? storedProgress
        : hasAdaptiveHistoryData(this.history)
          ? rebuildAdaptiveProgress(this.history)
          : storedProgress;
    this.evaluationIds = this.history.evaluations.reduce((ids, evaluation) => {
      ids[evaluation.id] = true;
      return ids;
    }, Object.create(null));
    persistLegacyAdaptiveState(
      this.inputGroup,
      storageKeys,
      this.history,
      this.progress,
      { writeHistory: hasAdaptiveHistoryData(this.history) }
    );
    return this.progress;
  },

  loadFromDatabase(inputMode = ADAPTIVE_INPUT_SCREEN) {
    const inputGroup = getAdaptiveInputGroup(inputMode);
    const fallbackProgress = this.load(inputGroup);
    const fallbackHistory = this.history;
    const migrateLegacyHistory = shouldMigrateLegacyAdaptiveHistory(
      fallbackHistory
    );
    this.databaseLoadSequence += 1;
    const loadSequence = this.databaseLoadSequence;
    return SingleNotesLearningStorage.recoverInterruptedSessions(inputGroup)
      .then(async recovery => {
        if (!recovery.saved) {
          return null;
        }
        if (migrateLegacyHistory) {
          const migration = await (
            SingleNotesLearningStorage.migrateLegacyHistory(
              inputGroup,
              fallbackHistory
            )
          );
          if (!migration.saved || !migration.verified) {
            return null;
          }
          if (migration.trustedDatabase) {
            const databaseProgress = await (
              SingleNotesLearningStorage.readProgress(inputGroup)
            );
            if (!databaseProgress.saved) {
              return null;
            }
            if (
              getAdaptiveProgressSummary(databaseProgress.progress).attempts
              >= getAdaptiveProgressSummary(fallbackProgress).attempts
            ) {
              return {
                progressResult: databaseProgress,
                readiness: migration
              };
            }
          }
          const synchronization = await (
            SingleNotesLearningStorage.synchronizeProgress(
              inputGroup,
              fallbackProgress
            )
          );
          return synchronization.saved
            ? { progressResult: synchronization, readiness: migration }
            : null;
        }
        const readiness = await (
          SingleNotesLearningStorage.verifyHistoryReady(inputGroup)
        );
        if (!readiness.saved || !readiness.verified) {
          return null;
        }
        let progressResult = await SingleNotesLearningStorage.readProgress(
          inputGroup
        );
        if (!progressResult.saved) {
          return null;
        }
        if (
          readiness.attemptCount === 0
          && !hasProgressNotes(progressResult.progress)
          && hasProgressNotes(fallbackProgress)
        ) {
          progressResult = await SingleNotesLearningStorage.synchronizeProgress(
            inputGroup,
            fallbackProgress
          );
          if (!progressResult.saved) {
            return null;
          }
        }
        return { progressResult, readiness };
      }).then(loadResult => {
        if (!loadResult) {
          return this.progress;
        }
        const result = loadResult.progressResult;
        if (
          result.saved
          && this.inputGroup === inputGroup
          && this.databaseLoadSequence === loadSequence
        ) {
          this.progress = normalizeAdaptiveProgress(result.progress);
        }
        if (!result.saved) {
          return this.progress;
        }
        const storageKeys = getAdaptiveStorageKeys(inputGroup);
        persistLegacyAdaptiveState(
          inputGroup,
          storageKeys,
          fallbackHistory,
          result.progress
        );
        const compaction = compactLegacyAdaptiveHistory(
          inputGroup,
          storageKeys,
          fallbackHistory
        );
        if (
          compaction.saved
          && this.inputGroup === inputGroup
          && this.databaseLoadSequence === loadSequence
        ) {
          this.history = createBaselineOnlyAdaptiveHistory(fallbackHistory);
          this.evaluationIds = Object.create(null);
        }
        return SingleNotesLearningStorage.readStatisticsSnapshot(
          inputGroup,
          { legacyEvaluationCount: fallbackHistory.evaluations.length }
        ).then(statisticsResult => {
          if (
            statisticsResult
            && statisticsResult.saved
            && this.inputGroup === inputGroup
            && this.databaseLoadSequence === loadSequence
          ) {
            this.statisticsSnapshot = statisticsResult.snapshot;
          }
          return this.progress;
        });
      });
  },

  save(progress = this.progress, inputMode = this.inputGroup) {
    this.inputGroup = getAdaptiveInputGroup(inputMode);
    const storageKeys = getAdaptiveStorageKeys(this.inputGroup);
    this.progress = normalizeAdaptiveProgress(progress);
    this.history = createAdaptiveHistory(this.progress);
    this.evaluationIds = Object.create(null);
    persistLegacyAdaptiveState(
      this.inputGroup,
      storageKeys,
      this.history,
      this.progress
    );
    return this.progress;
  },

  recordResult(
    exercise,
    wasCorrectFirstTry,
    mistakeCount = 0,
    responseTimeMs = null,
    context = {}
  ) {
    const storageKeys = getAdaptiveStorageKeys(this.inputGroup);
    if (!hasAdaptiveHistoryData(this.history)) {
      this.history = createAdaptiveHistory(this.progress);
    }
    const evaluation = createAdaptiveEvaluation(
      exercise,
      wasCorrectFirstTry,
      mistakeCount,
      responseTimeMs,
      context
    );
    if (this.evaluationIds[evaluation.id]) {
      return this.progress;
    }
    this.history = addAdaptiveEvaluation(this.history, evaluation);
    this.evaluationIds[evaluation.id] = true;
    this.progress = updateAdaptiveProgress(
      this.progress,
      exercise,
      wasCorrectFirstTry,
      mistakeCount,
      responseTimeMs
    );
    if (typeof context.sessionId === "string" && context.sessionId.length > 0) {
      SingleNotesLearningStorage.enqueueEvaluation({
        evaluation,
        inputGroup: this.inputGroup,
        sessionId: context.sessionId,
        learningRecord: this.progress.notes[evaluation.noteKey],
        progress: this.progress
      });
    }
    persistLegacyAdaptiveState(
      this.inputGroup,
      storageKeys,
      this.history,
      this.progress
    );
    return this.progress;
  },

  createSession(inputMode = this.inputGroup, startedAt = Date.now()) {
    return createSingleNotesSessionId(
      getAdaptiveInputGroup(inputMode),
      startedAt
    );
  },

  finishSession(sessionId, endedAt = Date.now()) {
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return Promise.resolve({ saved: false });
    }
    return SingleNotesLearningStorage.finishSession(
      this.inputGroup,
      sessionId,
      endedAt
    );
  },

  reset(inputMode = this.inputGroup) {
    this.inputGroup = getAdaptiveInputGroup(inputMode);
    this.databaseLoadSequence += 1;
    const storageKeys = getAdaptiveStorageKeys(this.inputGroup);
    this.progress = createAdaptiveProgress();
    this.history = createAdaptiveHistory();
    this.evaluationIds = Object.create(null);
    this.statisticsSnapshot = createEmptySingleNotesStatisticsSnapshot(
      getSingleNotesScope(this.inputGroup)
    );
    Lockr.rm(storageKeys.progress);
    Lockr.rm(storageKeys.history);
    SingleNotesLearningStorage.clearScope(this.inputGroup);
    return this.progress;
  },

  getSummary() {
    return getAdaptiveProgressSummary(this.progress);
  }
};

export default AdaptiveProgress;
