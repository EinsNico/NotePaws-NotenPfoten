import {
  createAdaptiveHistory,
  normalizeAdaptiveHistory,
  normalizeAdaptiveEvaluation,
  rebuildAdaptiveProgress
} from "./AdaptiveHistory";
import {
  ADAPTIVE_PROGRESS_VERSION,
  createAdaptiveProgress,
  normalizeAdaptiveProgress,
  normalizeAdaptiveRecord
} from "./AdaptiveLearning";
import {
  openLearningDatabasePrototype
} from "./LearningDatabasePrototype";
import { activeLearningDatabaseName } from "./LearningDatabaseGeneration";
import {
  SINGLE_NOTES_STATISTICS_RECENT_SESSION_LIMIT,
  SINGLE_NOTES_STATISTICS_RECENT_TREND_LIMIT,
  createSingleNotesStatisticsSnapshot,
  normalizeSingleNotesTrendSegments
} from "./SingleNotesStatistics";
import {
  createSingleNotesHistoryMigrationPlan,
  singleNotesHistoryFingerprintsEqual,
  verifySingleNotesHistoryMigration
} from "./SingleNotesHistoryMigration";

export const SINGLE_NOTES_DATABASE_NAME = "noten-pfoten-learning";
export const SINGLE_NOTES_SCOPE_SCREEN = "screen:single-notes";
export const SINGLE_NOTES_SCOPE_MIDI = "midi:single-notes";
export const SINGLE_NOTES_STORAGE_ERROR_QUOTA = "quota";
export const SINGLE_NOTES_STORAGE_ERROR_DATABASE = "database";

let sessionSequence = 0;

export function classifySingleNotesStorageError(error) {
  const candidates = [
    error,
    error && error.cause,
    error && error.target && error.target.error
  ].filter(Boolean);
  const isQuotaError = candidates.some(candidate => {
    const name = String(candidate.name || "").toLowerCase();
    const message = String(candidate.message || "").toLowerCase();
    return name === "quotaexceedederror"
      || name === "ns_error_dom_quota_reached"
      || Number(candidate.code) === 22
      || Number(candidate.code) === 1014
      || message.indexOf("quota") !== -1
      || message.indexOf("storage full") !== -1
      || message.indexOf("disk full") !== -1;
  });
  return isQuotaError
    ? SINGLE_NOTES_STORAGE_ERROR_QUOTA
    : SINGLE_NOTES_STORAGE_ERROR_DATABASE;
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function createCanonicalProgress(progress) {
  const normalized = normalizeAdaptiveProgress(progress);
  return {
    version: ADAPTIVE_PROGRESS_VERSION,
    notes: Object.keys(normalized.notes).sort().reduce((notes, noteKey) => {
      notes[noteKey] = normalizeAdaptiveRecord(normalized.notes[noteKey]);
      return notes;
    }, {})
  };
}

export function createAdaptiveProgressSignature(progress) {
  const serialized = JSON.stringify(createCanonicalProgress(progress));
  return [
    `v${ADAPTIVE_PROGRESS_VERSION}`,
    serialized.length,
    hashText(serialized),
    hashText(serialized.split("").reverse().join(""))
  ].join(":");
}

export function createSingleNotesProgressSnapshot(progress) {
  const normalized = createCanonicalProgress(progress);
  return {
    signature: createAdaptiveProgressSignature(normalized),
    progressVersion: ADAPTIVE_PROGRESS_VERSION,
    records: Object.keys(normalized.notes).map(noteKey => ({
      noteKey,
      learningRecord: normalized.notes[noteKey]
    }))
  };
}

export function isCompleteSingleNotesHistoryState(state) {
  const nextSequence = Math.max(
    0,
    Number(state && state.nextSequence) || 0
  );
  const fingerprint = state && state.fingerprint;
  return Boolean(
    state
    && state.migration
    && state.migration.status === "complete"
    && fingerprint
    && Math.max(0, Number(fingerprint.count) || 0) === nextSequence
  );
}

export function createProgressFromSnapshotRecords(records) {
  const progress = createAdaptiveProgress();
  (Array.isArray(records) ? records : []).forEach(record => {
    if (
      record
      && typeof record.noteKey === "string"
      && record.noteKey.length > 0
      && record.learningRecord
      && typeof record.learningRecord === "object"
    ) {
      progress.notes[record.noteKey] = normalizeAdaptiveRecord(
        record.learningRecord
      );
    }
  });
  return normalizeAdaptiveProgress(progress);
}

function createBackupReplacement(inputGroup, progress, history) {
  const scope = getSingleNotesScope(inputGroup);
  const normalizedHistory = normalizeAdaptiveHistory(history);
  const normalizedProgress = progress && typeof progress === "object"
    ? normalizeAdaptiveProgress(progress)
    : rebuildAdaptiveProgress(normalizedHistory);
  const migrationHistory = history && typeof history === "object"
    ? normalizedHistory
    : createAdaptiveHistory(normalizedProgress);
  const migration = createSingleNotesHistoryMigrationPlan(
    migrationHistory,
    scope
  );
  return {
    scope,
    progressSnapshot: createSingleNotesProgressSnapshot(normalizedProgress),
    attempts: migration.attempts,
    migration
  };
}

export function getSingleNotesScope(inputGroup) {
  return inputGroup === "midi"
    ? SINGLE_NOTES_SCOPE_MIDI
    : SINGLE_NOTES_SCOPE_SCREEN;
}

export function createSingleNotesSessionId(
  inputGroup = "screen",
  startedAt = Date.now()
) {
  sessionSequence += 1;
  const randomValue = Math.floor(Math.random() * 0x100000000).toString(36);
  return [
    getSingleNotesScope(inputGroup),
    "session",
    Math.max(0, Math.round(Number(startedAt) || 0)).toString(36),
    sessionSequence.toString(36),
    ("0000000" + randomValue).slice(-7)
  ].join("|");
}

export function createSingleNotesWriteRecord({
  evaluation,
  inputGroup = "screen",
  sessionId,
  learningRecord,
  progress
}) {
  const normalizedEvaluation = normalizeAdaptiveEvaluation(evaluation);
  if (!normalizedEvaluation) {
    throw new TypeError("A valid single-notes evaluation is required");
  }
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new TypeError("A single-notes session id is required");
  }
  return {
    id: normalizedEvaluation.id,
    sessionId,
    scope: getSingleNotesScope(inputGroup),
    noteKey: normalizedEvaluation.noteKey,
    staff: normalizedEvaluation.exercise.staff,
    completedAt: normalizedEvaluation.completedAt,
    correctFirstTry: normalizedEvaluation.correctFirstTry,
    mistakeCount: normalizedEvaluation.mistakeCount,
    responseTimeMs: normalizedEvaluation.responseTimeMs,
    learningRecord: normalizeAdaptiveRecord(learningRecord),
    progressVersion: ADAPTIVE_PROGRESS_VERSION,
    progressSignature: progress
      ? createAdaptiveProgressSignature(progress)
      : null
  };
}

export class SingleNotesLearningWriter {
  constructor(options = {}) {
    this.options = options;
    this.databasePromise = null;
    this.queue = Promise.resolve({ saved: true });
    this.lastError = null;
    this.pendingWrites = 0;
    this.failedWrites = [];
    this.liveSessionScopes = Object.create(null);
    this.retrying = false;
    this.retryPromise = null;
    this.status = {
      state: "idle",
      pendingWrites: 0,
      failedWrites: 0,
      errorType: null,
      lastError: null,
      retrying: false,
      lastSavedAt: null
    };
  }

  refreshStatus() {
    this.status.pendingWrites = this.pendingWrites;
    this.status.failedWrites = this.failedWrites.length;
    this.status.retrying = this.retrying;
    if (this.failedWrites.length > 0) {
      const quotaFailure = this.failedWrites.find(failure => (
        classifySingleNotesStorageError(failure.error)
          === SINGLE_NOTES_STORAGE_ERROR_QUOTA
      ));
      const visibleFailure = quotaFailure
        || this.failedWrites[this.failedWrites.length - 1];
      this.status.state = "error";
      this.status.errorType = classifySingleNotesStorageError(
        visibleFailure.error
      );
      this.status.lastError = visibleFailure.error;
      this.lastError = visibleFailure.error;
      return;
    }
    this.status.state = this.pendingWrites > 0 || this.retrying
      ? "saving"
      : "idle";
    this.status.errorType = null;
    this.status.lastError = null;
    this.lastError = null;
  }

  rememberFailedWrite(task, error) {
    const existingIndex = this.failedWrites.findIndex(failure => (
      failure.task.key === task.key
    ));
    const failure = { task, error };
    if (existingIndex === -1) {
      this.failedWrites.push(failure);
    } else {
      this.failedWrites.splice(existingIndex, 1, failure);
    }
  }

  forgetFailedWrite(key) {
    this.failedWrites = this.failedWrites.filter(failure => (
      failure.task.key !== key
    ));
  }

  enqueueTrackedWrite(task) {
    this.pendingWrites += 1;
    this.refreshStatus();
    const operation = this.queue.then(() => (
      task.requiresDatabase === false
        ? task.execute()
        : this.open().then(database => task.execute(database))
    ));
    this.queue = operation.then(result => {
      this.pendingWrites = Math.max(0, this.pendingWrites - 1);
      this.forgetFailedWrite(task.key);
      this.status.lastSavedAt = Date.now();
      this.refreshStatus();
      return task.success(result);
    }).catch(error => {
      this.pendingWrites = Math.max(0, this.pendingWrites - 1);
      this.rememberFailedWrite(task, error);
      this.refreshStatus();
      return task.failure(error);
    });
    return this.queue;
  }

  rememberRetryableFailure(task, error) {
    const retryableTask = Object.assign({
      requiresDatabase: false,
      success: result => result || { saved: true },
      failure: retryError => ({ saved: false, error: retryError })
    }, task);
    this.rememberFailedWrite(retryableTask, error);
    this.refreshStatus();
  }

  resolveRetryableFailure(key) {
    this.forgetFailedWrite(key);
    this.refreshStatus();
  }

  open() {
    if (!this.databasePromise) {
      this.databasePromise = (
        typeof this.options.openDatabase === "function"
          ? Promise.resolve(this.options.openDatabase())
          : openLearningDatabasePrototype({
            name: this.options.databaseName || activeLearningDatabaseName(),
            indexedDB: this.options.indexedDB,
            IDBKeyRange: this.options.IDBKeyRange
          })
      ).catch(error => {
        this.databasePromise = null;
        throw error;
      });
    }
    return this.databasePromise;
  }

  enqueueEvaluation(values) {
    let record;
    try {
      record = createSingleNotesWriteRecord(values);
    } catch (error) {
      this.lastError = error;
      return Promise.resolve({ saved: false, error });
    }
    this.liveSessionScopes[record.sessionId] = record.scope;
    return this.enqueueTrackedWrite({
      key: `attempt:${record.scope}:${record.id}`,
      scope: record.scope,
      operation: "attempt",
      sessionId: record.sessionId,
      execute: database => database.recordAttempt(record),
      success: result => result,
      failure: error => ({ saved: false, error })
    });
  }

  finishSession(inputGroup, sessionId, endedAt = Date.now()) {
    const scope = getSingleNotesScope(inputGroup);
    return this.enqueueTrackedWrite({
      key: `session:${scope}:${sessionId}`,
      scope,
      operation: "session",
      sessionId,
      execute: database => {
        const hasFailedAttempt = this.failedWrites.some(failure => (
          failure.task.operation === "attempt"
          && failure.task.scope === scope
          && failure.task.sessionId === sessionId
        ));
        if (hasFailedAttempt) {
          return Promise.reject(new Error(
            "The session still contains an unsaved attempt"
          ));
        }
        return database.finishSession(scope, sessionId, endedAt);
      },
      success: () => {
        delete this.liveSessionScopes[sessionId];
        return { saved: true };
      },
      failure: error => ({ saved: false, error })
    });
  }

  synchronizeProgress(inputGroup, progress) {
    const scope = getSingleNotesScope(inputGroup);
    const snapshot = createSingleNotesProgressSnapshot(progress);
    return this.enqueueTrackedWrite({
      key: `snapshot:${scope}`,
      scope,
      operation: "snapshot",
      execute: database => database.synchronizeProgressSnapshot(scope, snapshot),
      success: result => ({
        saved: true,
        progress: createProgressFromSnapshotRecords(result.records),
        synchronized: result.synchronized
      }),
      failure: error => ({
        saved: false,
        error,
        progress: normalizeAdaptiveProgress(progress),
        synchronized: false
      })
    });
  }

  recoverInterruptedSessions(inputGroup) {
    const scope = getSingleNotesScope(inputGroup);
    return this.enqueueTrackedWrite({
      key: `recovery:${scope}`,
      scope,
      operation: "recovery",
      execute: database => database.recoverInterruptedSessions(
        scope,
        Object.keys(this.liveSessionScopes).filter(sessionId => (
          this.liveSessionScopes[sessionId] === scope
        ))
      ),
      success: result => ({
        saved: true,
        recoveredSessions: Math.max(
          0,
          Number(result && result.recoveredSessions) || 0
        )
      }),
      failure: error => ({
        saved: false,
        recoveredSessions: 0,
        error
      })
    });
  }

  migrateLegacyHistory(inputGroup, history) {
    const scope = getSingleNotesScope(inputGroup);
    const readCurrentHistory = typeof history === "function"
      ? history
      : () => history;
    return this.enqueueTrackedWrite({
      key: `history-migration:${scope}`,
      scope,
      operation: "history-migration",
      execute: async database => {
        const currentHistory = readCurrentHistory();
        const initialPlan = createSingleNotesHistoryMigrationPlan(
          currentHistory,
          scope
        );
        const state = await database.readAttemptHistoryState(scope);
        const databaseHistoryComplete = isCompleteSingleNotesHistoryState(
          state
        );
        if (
          databaseHistoryComplete
          && initialPlan.attempts.length <= state.nextSequence
        ) {
          return {
            migrated: false,
            verified: true,
            trustedDatabase: true,
            attemptCount: state.nextSequence,
            signature: String(
              state.migration.signature || initialPlan.signature
            )
          };
        }
        if (
          initialPlan.attempts.length === 0
          && state.nextSequence > 0
        ) {
          throw new Error(
            "A non-empty single-notes database cannot be verified from an empty legacy history"
          );
        }
        const stateMatches = (
          state.fingerprint
          && state.nextSequence === initialPlan.attempts.length
          && singleNotesHistoryFingerprintsEqual(
            state.fingerprint,
            initialPlan.fingerprint
          )
        );
        const completedMigration = (
          stateMatches
          && state.migration
          && state.migration.status === "complete"
        );
        if (completedMigration) {
          if (state.migration.signature !== initialPlan.signature) {
            await database.finalizeAttemptHistoryMigration(scope, {
              version: initialPlan.version,
              signature: initialPlan.signature,
              sourceEvaluationCount: initialPlan.sourceEvaluationCount,
              totalAttemptCount: initialPlan.attempts.length
            });
          }
          return {
            migrated: false,
            verified: true,
            attemptCount: initialPlan.attempts.length,
            signature: initialPlan.signature
          };
        }

        let plan = initialPlan;
        let rebuilt = !stateMatches;
        if (!stateMatches) {
          const existingAttempts = await database.readAttemptHistory(scope);
          plan = createSingleNotesHistoryMigrationPlan(
            currentHistory,
            scope,
            existingAttempts
          );
          await database.replaceAttemptHistory(scope, plan.attempts, plan);
        }

        let values = await Promise.all([
          database.readAttemptHistory(scope),
          database.readDashboard(scope, 50),
          database.readTimeBuckets(scope)
        ]);
        let verification = verifySingleNotesHistoryMigration({
          expectedAttempts: plan.attempts,
          storedAttempts: values[0],
          dashboard: values[1],
          timeBuckets: values[2]
        });
        if (!verification.verified && stateMatches) {
          rebuilt = true;
          plan = createSingleNotesHistoryMigrationPlan(
            currentHistory,
            scope,
            values[0]
          );
          await database.replaceAttemptHistory(scope, plan.attempts, plan);
          values = await Promise.all([
            database.readAttemptHistory(scope),
            database.readDashboard(scope, 50),
            database.readTimeBuckets(scope)
          ]);
          verification = verifySingleNotesHistoryMigration({
            expectedAttempts: plan.attempts,
            storedAttempts: values[0],
            dashboard: values[1],
            timeBuckets: values[2]
          });
        }
        if (!verification.verified) {
          throw new Error("The migrated single-notes history did not verify");
        }
        await database.finalizeAttemptHistoryMigration(scope, {
          version: plan.version,
          signature: plan.signature,
          sourceEvaluationCount: plan.sourceEvaluationCount,
          totalAttemptCount: plan.attempts.length
        });
        return {
          migrated: rebuilt,
          verified: true,
          attemptCount: plan.attempts.length,
          signature: plan.signature
        };
      },
      success: result => Object.assign({ saved: true }, result),
      failure: error => ({
        saved: false,
        migrated: false,
        verified: false,
        error
      })
    });
  }

  verifyHistoryReady(inputGroup) {
    const scope = getSingleNotesScope(inputGroup);
    return this.enqueueTrackedWrite({
      key: `history-readiness:${scope}`,
      scope,
      operation: "history-readiness",
      execute: async database => {
        const state = await database.readAttemptHistoryState(scope);
        if (isCompleteSingleNotesHistoryState(state)) {
          return {
            verified: true,
            initialized: false,
            attemptCount: state.nextSequence
          };
        }
        if (state.nextSequence > 0) {
          throw new Error(
            "The single-notes database history is not completely verified"
          );
        }
        const plan = createSingleNotesHistoryMigrationPlan(
          createAdaptiveHistory(),
          scope
        );
        await database.replaceAttemptHistory(scope, [], plan);
        await database.finalizeAttemptHistoryMigration(scope, {
          version: plan.version,
          signature: plan.signature,
          sourceEvaluationCount: 0,
          totalAttemptCount: 0
        });
        const initializedState = await database.readAttemptHistoryState(scope);
        if (!isCompleteSingleNotesHistoryState(initializedState)) {
          throw new Error(
            "The empty single-notes database history could not be initialized"
          );
        }
        return {
          verified: true,
          initialized: true,
          attemptCount: 0
        };
      },
      success: result => Object.assign({ saved: true }, result),
      failure: error => ({
        saved: false,
        verified: false,
        initialized: false,
        error
      })
    });
  }

  readStatisticsSnapshot(inputGroup, options = {}) {
    const scope = getSingleNotesScope(inputGroup);
    const trendLimit = Math.max(
      1,
      Number(options.trendLimit)
        || SINGLE_NOTES_STATISTICS_RECENT_TREND_LIMIT
    );
    const sessionLimit = Math.max(
      1,
      Number(options.sessionLimit)
        || SINGLE_NOTES_STATISTICS_RECENT_SESSION_LIMIT
    );
    const operation = this.queue.then(() => this.open()).then(database => (
      Promise.all([
        database.readDashboard(scope, trendLimit),
        database.readTimeBuckets(scope),
        database.readRecentSessions(scope, sessionLimit)
      ])
    ));
    this.queue = operation.then(values => ({
      saved: true,
      snapshot: createSingleNotesStatisticsSnapshot({
        scope,
        dashboard: values[0],
        timeBuckets: values[1],
        recentSessions: values[2],
        legacyEvaluationCount: options.legacyEvaluationCount
      })
    })).catch(error => ({ saved: false, error, snapshot: null }));
    return this.queue;
  }

  readTrendPage(inputGroup, options = {}) {
    const scope = getSingleNotesScope(inputGroup);
    const startIndex = Math.max(0, Math.floor(Number(options.startIndex) || 0));
    const limit = Math.max(1, Math.min(100, Math.floor(Number(options.limit) || 50)));
    const operation = this.queue.then(() => this.open()).then(database => (
      database.readTrendSegments(scope, startIndex, limit)
    ));
    this.queue = operation.then(segments => ({
      saved: true,
      segments: normalizeSingleNotesTrendSegments(segments)
        .filter(segment => segment.exerciseCount >= 5)
    })).catch(error => ({ saved: false, error, segments: [] }));
    return this.queue;
  }

  readProgress(inputGroup) {
    const scope = getSingleNotesScope(inputGroup);
    const operation = this.queue.then(() => this.open()).then(database => (
      database.readProgressSnapshot(scope)
    ));
    this.queue = operation.then(records => {
      return {
        saved: true,
        progress: createProgressFromSnapshotRecords(records)
      };
    }).catch(error => {
      return { saved: false, error, progress: createAdaptiveProgress() };
    });
    return this.queue;
  }

  readDailyTaskHistory() {
    const operation = this.queue.then(() => this.open()).then(database => database.readDailyTaskHistory());
    const result = operation.then(history => ({ saved: true, history }))
      .catch(error => ({ saved: false, error, history: null }));
    this.queue = result.then(value => ({ saved: value.saved }));
    return result;
  }

  readBackupSnapshot(inputGroup) {
    const scope = getSingleNotesScope(inputGroup);
    const operation = this.queue.then(() => this.open()).then(database => (
      Promise.all([
        database.readProgressSnapshot(scope),
        database.readAttemptHistoryForExport(scope)
      ])
    ));
    const result = operation.then(values => ({
      saved: true,
      progress: createProgressFromSnapshotRecords(values[0]),
      attempts: values[1]
    })).catch(error => ({
      saved: false,
      error,
      progress: createAdaptiveProgress(),
      attempts: []
    }));
    this.queue = result.then(value => ({ saved: value.saved }));
    return result;
  }

  // The large-backup exporter reads a few stored blocks per call instead of
  // materializing the complete attempt history in the WebView.
  readBackupAttemptsPage(inputGroup, afterBlockNumber = null, limit = 4) {
    const scope = getSingleNotesScope(inputGroup);
    const operation = this.queue.then(() => this.open()).then(database => (
      database.readAttemptHistoryPage(scope, afterBlockNumber, limit)
    ));
    const result = operation.then(page => ({ saved: true, page })).catch(error => ({
      saved: false, error, page: null
    }));
    this.queue = result.then(value => ({ saved: value.saved }));
    return result;
  }

  replaceBackupData(data, options = {}) {
    const source = data && typeof data === "object" ? data : {};
    const replacements = [
      createBackupReplacement(
        "screen",
        source.adaptiveProgress,
        source.adaptiveHistory
      ),
      createBackupReplacement(
        "midi",
        source.adaptiveProgressMidi,
        source.adaptiveHistoryMidi
      )
    ];
    const taskKey = "backup-replace:single-notes";
    return this.enqueueTrackedWrite({
      key: taskKey,
      scope: "all:single-notes",
      operation: "backup-replace",
      execute: database => database.replaceSingleNotesBackup(
        replacements,
        options.replaceNoteFlowRounds
          ? source.noteFlowRounds || { screen: [], midi: [], chordMidi: [] }
          : null,
        options.replaceRhythmSenseBars ? source.rhythmSenseBars || [] : null,
        source.dailyTaskHistory || null
      ),
      success: result => ({
        saved: true,
        replacedScopes: result.replacedScopes,
        attemptCount: result.attemptCount,
        noteFlowRoundCount: result.noteFlowRoundCount
      }),
      failure: error => ({ saved: false, error })
    }).then(result => {
      if (!result.saved) {
        this.resolveRetryableFailure(taskKey);
      }
      return result;
    });
  }

  clearScope(inputGroup) {
    const scope = getSingleNotesScope(inputGroup);
    const operation = this.queue.then(() => this.open()).then(database => (
      database.clearScope(scope)
    ));
    this.queue = operation.then(() => {
      this.failedWrites = this.failedWrites.filter(failure => (
        failure.task.scope !== scope
      ));
      Object.keys(this.liveSessionScopes).forEach(sessionId => {
        if (this.liveSessionScopes[sessionId] === scope) {
          delete this.liveSessionScopes[sessionId];
        }
      });
      this.refreshStatus();
      return { saved: true };
    }).catch(error => {
      this.lastError = error;
      return { saved: false, error };
    });
    return this.queue;
  }

  clearAll() {
    const operation = this.queue.then(() => this.open()).then(database => (
      database.clear()
    ));
    this.queue = operation.then(() => {
      this.failedWrites = [];
      this.liveSessionScopes = Object.create(null);
      this.refreshStatus();
      return { saved: true };
    }).catch(error => {
      this.lastError = error;
      return { saved: false, error };
    });
    return this.queue;
  }

  flush() {
    return this.queue;
  }

  retryFailedWrites() {
    if (this.retryPromise) {
      return this.retryPromise;
    }
    const tasks = this.failedWrites.map(failure => failure.task);
    if (tasks.length === 0) {
      return Promise.resolve({ saved: true, failedWrites: 0 });
    }
    this.retrying = true;
    this.refreshStatus();
    let retryChain = Promise.resolve();
    tasks.forEach(task => {
      retryChain = retryChain.then(() => this.enqueueTrackedWrite(task));
    });
    this.retryPromise = retryChain.then(() => {
      this.retrying = false;
      this.retryPromise = null;
      this.refreshStatus();
      return {
        saved: this.failedWrites.length === 0,
        failedWrites: this.failedWrites.length
      };
    }, error => {
      this.retrying = false;
      this.retryPromise = null;
      this.refreshStatus();
      return {
        saved: false,
        failedWrites: this.failedWrites.length,
        error
      };
    });
    return this.retryPromise;
  }

  getStatus() {
    return {
      pendingWrites: this.pendingWrites,
      failedWrites: this.failedWrites.length,
      lastError: this.lastError,
      errorType: this.status.errorType,
      state: this.status.state,
      retrying: this.retrying,
      lastSavedAt: this.status.lastSavedAt
    };
  }

  close() {
    return this.flush().then(() => {
      if (!this.databasePromise) {
        return;
      }
      return this.databasePromise.then(database => database.close()).catch(() => {});
    });
  }
}

const SingleNotesLearningStorage = new SingleNotesLearningWriter();

export default SingleNotesLearningStorage;
