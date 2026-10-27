import {
  LEARNING_DATABASE_STORES,
  deleteLearningDatabasePrototype,
  expandAttemptBlock,
  openLearningDatabasePrototype
} from "../src/model/LearningDatabasePrototype.js";
import {
  createSingleNotesStatisticsSnapshot
} from "../src/model/SingleNotesStatistics.js";
import {
  createSingleNotesHistoryFingerprint,
  verifySingleNotesHistoryMigration
} from "../src/model/SingleNotesHistoryMigration.js";
import {
  SingleNotesLearningWriter
} from "../src/model/SingleNotesLearningStorage.js";

const resultElement = document.getElementById("result");
const databaseName = `noten-pfoten-single-notes-test-${Date.now()}`;
const scope = "screen:single-notes";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("request failed"));
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error || new Error("transaction aborted")
    );
    transaction.onerror = () => {};
  });
}

async function readFirstAttemptBlock(database) {
  const transaction = database.database.transaction(
    LEARNING_DATABASE_STORES.attemptBlocks,
    "readonly"
  );
  const completion = transactionResult(transaction);
  const block = await requestResult(
    transaction.objectStore(LEARNING_DATABASE_STORES.attemptBlocks).get(
      `${scope}|block|0`
    )
  );
  await completion;
  return block;
}

function noteProgress(attempts, correctFirstTry, difficulty) {
  return {
    attempts,
    correctFirstTry,
    struggled: attempts - correctFirstTry,
    totalMistakes: attempts - correctFirstTry,
    difficulty,
    recentResults: attempts === 1 ? [true] : [true, false],
    timedAttempts: 1,
    averageResponseTimeMs: 900,
    recentResponseTimesMs: [900]
  };
}

async function verifyTwoHourMigration() {
  const name = `${databaseName}-time-windows`;
  const db = await openLearningDatabasePrototype({ name });
  const samples = [new Date(2026, 9, 21, 9, 59).getTime(), new Date(2026, 9, 21, 10, 0).getTime()];
  try {
    for (let index = 0; index < samples.length; index += 1) {
      await db.recordAttempt({ id: `timing-${index}`, scope, sessionId: 'timing',
        noteKey: 'treble:60:natural', completedAt: samples[index],
        correctFirstTry: true, mistakeCount: 0, responseTimeMs: 600 + index * 200 });
    }
    const buckets = await db.readTimeBuckets(scope);
    assert(Object.keys(buckets[0].windows).join(',') === '8,10', 'new answers must use two-hour windows');
    const legacy = Object.assign({}, buckets[0], { windows: { 8: {
      startHour: 8, attemptCount: 2, correctFirstTryCount: 2, mistakeCount: 0,
      responseTimeTotalMs: 1400, timedAttemptCount: 2
    } } });
    delete legacy.windowHours;
    const transaction = db.database.transaction(LEARNING_DATABASE_STORES.timeBuckets, 'readwrite');
    const done = transactionResult(transaction);
    transaction.objectStore(LEARNING_DATABASE_STORES.timeBuckets).put(legacy);
    await done;
    // The new answer races the rebuild as it can in another app tab.
    await Promise.all([db.readTimeBuckets(scope), db.recordAttempt({
      id: 'timing-2', scope, sessionId: 'timing', noteKey: 'treble:60:natural',
      completedAt: new Date(2026, 9, 21, 10, 30).getTime(),
      correctFirstTry: true, mistakeCount: 0, responseTimeMs: 1000
    })]);
    const rebuilt = await db.readTimeBuckets(scope);
    assert(rebuilt[0].windowHours === 2, 'legacy windows were not rebuilt');
    assert(rebuilt[0].windows[8].attemptCount === 1, '09:59 moved into wrong window');
    assert(rebuilt[0].windows[10].attemptCount === 2, '10:00 / parallel answer lost');
    assert(rebuilt[0].responseTimeTotalMs === 2400, 'daily total changed');
    const raw = await db.readAttemptHistory(scope);
    assert(raw.length === 3 && raw[0].completedAt === samples[0], 'raw history changed');
    assert(JSON.stringify(await db.readTimeBuckets(scope)) === JSON.stringify(rebuilt), 'repeated read changes data');
    return true;
  } finally { db.close(); await deleteLearningDatabasePrototype({ name }); }
}

async function run() {
  const twoHourMigrationVerified = await verifyTwoHourMigration();
  await deleteLearningDatabasePrototype({ name: databaseName });
  let database = await openLearningDatabasePrototype({ name: databaseName });
  const sessionId = "browser-session";
  const base = {
    sessionId,
    scope,
    noteKey: "treble:60:natural",
    staff: "piano"
  };

  await database.recordAttempt(Object.assign({}, base, {
    id: "browser-evaluation-1",
    completedAt: 1789550001000,
    correctFirstTry: true,
    mistakeCount: 0,
    responseTimeMs: 900,
    learningRecord: noteProgress(1, 1, 0.88),
    progressVersion: 3
  }));
  await database.recordAttempt(Object.assign({}, base, {
    id: "browser-evaluation-2",
    completedAt: 1789550002000,
    correctFirstTry: false,
    mistakeCount: 1,
    responseTimeMs: null,
    learningRecord: noteProgress(2, 1, 1.78),
    progressVersion: 3
  }));

  const dashboard = await database.readDashboard(scope);
  assert(dashboard.statistics.attemptCount === 2, "statistics lost an answer");
  assert(dashboard.progress.length === 1, "note progress was duplicated");
  assert(
    dashboard.progress[0].learningRecord.attempts === 2,
    "latest adaptive note progress was not stored"
  );
  assert(dashboard.progress[0].progressVersion === 3, "progress version is missing");

  const blockBeforeFailure = await readFirstAttemptBlock(database);
  const expandedBeforeFailure = expandAttemptBlock(blockBeforeFailure);
  assert(
    expandedBeforeFailure.map(attempt => attempt.id).join(",") ===
      "browser-evaluation-1,browser-evaluation-2",
    "stable answer identifiers were not preserved"
  );
  assert(
    expandedBeforeFailure.every(attempt => attempt.staff === "piano"),
    "staff attribution was not preserved"
  );
  assert(
    expandedBeforeFailure[1].responseTimeMs === null,
    "missing response time became a fabricated value"
  );

  const legacySnapshot = {
    signature: "legacy-progress-7",
    progressVersion: 3,
    records: [
      {
        noteKey: "bass:48:natural",
        learningRecord: noteProgress(5, 4, 0.7)
      },
      {
        noteKey: "treble:60:natural",
        learningRecord: noteProgress(7, 5, 1.2)
      }
    ]
  };
  const synchronized = await database.synchronizeProgressSnapshot(
    scope,
    legacySnapshot
  );
  assert(synchronized.synchronized === true, "legacy progress was not migrated");
  const storedLegacyProgress = await database.readProgressSnapshot(scope);
  assert(storedLegacyProgress.length === 2, "legacy note progress is incomplete");
  const unchanged = await database.synchronizeProgressSnapshot(
    scope,
    legacySnapshot
  );
  assert(
    unchanged.synchronized === false,
    "unchanged progress was written a second time"
  );

  await database.recordAttempt(Object.assign({}, base, {
    id: "browser-evaluation-3",
    completedAt: 1789550003000,
    correctFirstTry: true,
    mistakeCount: 0,
    responseTimeMs: 700,
    learningRecord: noteProgress(8, 6, 1.08),
    progressVersion: 3,
    progressSignature: "current-progress-8"
  }));
  const currentSnapshot = Object.assign({}, legacySnapshot, {
    signature: "current-progress-8",
    records: [
      legacySnapshot.records[0],
      {
        noteKey: "treble:60:natural",
        learningRecord: noteProgress(8, 6, 1.08)
      }
    ]
  });
  const current = await database.synchronizeProgressSnapshot(
    scope,
    currentSnapshot
  );
  assert(
    current.synchronized === false,
    "a normal answer did not advance the progress signature"
  );

  let failedAsExpected = false;
  try {
    await database.recordAttempt(Object.assign({}, base, {
      id: "browser-evaluation-invalid",
      completedAt: 1789550004000,
      correctFirstTry: true,
      mistakeCount: 0,
      responseTimeMs: 700,
      learningRecord: { uncloneable: () => true },
      progressVersion: 3
    }));
  } catch (error) {
    failedAsExpected = true;
  }
  assert(failedAsExpected, "invalid write unexpectedly succeeded");

  const dashboardAfterFailure = await database.readDashboard(scope);
  const blockAfterFailure = await readFirstAttemptBlock(database);
  assert(
    dashboardAfterFailure.statistics.attemptCount === 3,
    "failed transaction changed statistics"
  );
  assert(blockAfterFailure.count === 3, "failed transaction left a partial answer");

  await database.finishSession(scope, sessionId, 1789550005000);
  const counts = await database.countRecords();
  const sessions = await database.readRecentSessions(scope);
  assert(counts.activeSessions === 0, "finished session stayed active");
  assert(counts.sessionBlocks === 1, "finished session was not compacted");
  assert(sessions.length === 1, "finished session cannot be read");
  assert(sessions[0].attemptCount === 3, "session result has the wrong answer count");

  await database.recordAttempt(Object.assign({}, base, {
    id: "browser-evaluation-interrupted",
    sessionId: "browser-session-interrupted",
    completedAt: 1789550005500,
    correctFirstTry: true,
    mistakeCount: 0,
    responseTimeMs: 650,
    learningRecord: noteProgress(9, 7, 0.96),
    progressVersion: 3
  }));
  const skippedLiveSession = await database.recoverInterruptedSessions(
    scope,
    ["browser-session-interrupted"]
  );
  assert(
    skippedLiveSession.recoveredSessions === 0,
    "a live session from the same app run was recovered"
  );
  database.close();
  database = await openLearningDatabasePrototype({ name: databaseName });
  const recovered = await database.recoverInterruptedSessions(scope);
  const countsAfterRecovery = await database.countRecords();
  const sessionsAfterRecovery = await database.readRecentSessions(scope);
  assert(recovered.recoveredSessions === 1, "interrupted session was not recovered");
  assert(countsAfterRecovery.activeSessions === 0, "recovered session stayed active");
  assert(sessionsAfterRecovery.length === 2, "recovered session cannot be read");
  assert(
    sessionsAfterRecovery[0].id === "browser-session-interrupted",
    "the wrong interrupted session was recovered"
  );
  const timeBuckets = await database.readTimeBuckets(scope);
  const timeWindows = timeBuckets.reduce((windows, bucket) => (
    windows.concat(Object.keys(bucket.windows || {}).map(key => (
      bucket.windows[key]
    )))
  ), []);
  assert(
    timeWindows.reduce((total, window) => total + window.attemptCount, 0) === 4,
    "two-hour learning-time windows lost an answer"
  );
  assert(
    timeWindows.reduce((total, window) => total + window.timedAttemptCount, 0) === 3,
    "learning-time windows counted untimed answers as timed"
  );
  const statisticsSnapshot = createSingleNotesStatisticsSnapshot({
    scope,
    dashboard: await database.readDashboard(scope, 50),
    timeBuckets,
    recentSessions: sessionsAfterRecovery,
    legacyEvaluationCount: 4
  });
  assert(
    statisticsSnapshot.readyForDisplay === true,
    "complete IndexedDB statistics unexpectedly require the legacy fallback"
  );
  assert(
    statisticsSnapshot.summary.averageResponseTimeMs === 750,
    "statistics averaged untimed answers into the response time"
  );

  const migrationScope = "screen:single-notes:migration-test";
  const migrationAttempts = Array.from({ length: 275 }, (unused, index) => ({
    id: `legacy-migration-${index + 1}`,
    sessionId: `legacy-history-${Math.floor(index / 100)}`,
    scope: migrationScope,
    noteKey: `${index % 2 === 0 ? "bass:48" : "treble:60"}:natural`,
    staff: index % 2 === 0 ? "bass" : "piano",
    completedAt: 1789540001000 + index * 1000,
    correctFirstTry: index % 5 !== 0,
    mistakeCount: index % 5 === 0 ? 2 : 0,
    responseTimeMs: index % 7 === 0 ? null : 650 + index
  }));
  const migrationFingerprint = createSingleNotesHistoryFingerprint(
    migrationAttempts
  );
  await database.replaceAttemptHistory(migrationScope, migrationAttempts, {
    version: 1,
    signature: "browser-migration-signature",
    sourceEvaluationCount: migrationAttempts.length
  });
  const migratedAttempts = await database.readAttemptHistory(migrationScope);
  const exportAttempts = await database.readAttemptHistoryForExport(
    migrationScope
  );
  const migratedDashboard = await database.readDashboard(migrationScope, 50);
  const migratedTrendPage = await database.readTrendSegments(
    migrationScope,
    4,
    6
  );
  const migratedTimeBuckets = await database.readTimeBuckets(migrationScope);
  const migrationVerification = verifySingleNotesHistoryMigration({
    expectedAttempts: migrationAttempts,
    storedAttempts: migratedAttempts,
    dashboard: migratedDashboard,
    timeBuckets: migratedTimeBuckets
  });
  assert(migrationVerification.verified, "legacy history migration did not verify");
  assert(
    exportAttempts.length === migrationAttempts.length
      && exportAttempts.every((attempt, index) => (
        attempt.id === migrationAttempts[index].id
        && attempt.sequence === index
      )),
    "cursor export did not preserve every answer across physical blocks"
  );
  assert(
    migratedTrendPage.length === 6
      && migratedTrendPage[0].segmentNumber === 4
      && migratedTrendPage[5].segmentNumber === 9,
    "bounded trend page returned the wrong segments"
  );
  await database.finalizeAttemptHistoryMigration(migrationScope, {
    version: 1,
    signature: "browser-migration-signature",
    sourceEvaluationCount: migrationAttempts.length,
    totalAttemptCount: migrationAttempts.length
  });
  const migrationState = await database.readAttemptHistoryState(migrationScope);
  assert(
    migrationState.migration.status === "complete",
    "verified migration was not marked complete"
  );
  assert(
    migrationState.nextSequence === migrationFingerprint.count,
    "migration writer state has the wrong answer count"
  );

  const midiScope = "midi:single-notes";
  await database.recordAttempt({
    id: "midi-evaluation-1",
    sessionId: "midi-session",
    scope: midiScope,
    noteKey: "treble:64:natural",
    staff: "treble",
    completedAt: 1789550006000,
    correctFirstTry: true,
    mistakeCount: 0,
    responseTimeMs: 800,
    learningRecord: noteProgress(1, 1, 0.88),
    progressVersion: 3
  });
  const replacementScreenAttempts = Array.from({ length: 3 }, (unused, index) => ({
    id: `replacement-screen-${index + 1}`,
    sessionId: "replacement-screen-session",
    scope,
    noteKey: "treble:67:natural",
    staff: "piano",
    completedAt: 1789551001000 + index * 1000,
    correctFirstTry: index !== 1,
    mistakeCount: index === 1 ? 1 : 0,
    responseTimeMs: index === 1 ? null : 700 + index
  }));
  const replacementMidiAttempts = [{
    id: "replacement-midi-1",
    sessionId: "replacement-midi-session",
    scope: midiScope,
    noteKey: "bass:48:natural",
    staff: "piano",
    completedAt: 1789551005000,
    correctFirstTry: true,
    mistakeCount: 0,
    responseTimeMs: 650
  }];
  const replacementResult = await database.replaceSingleNotesBackup([
    {
      scope,
      attempts: replacementScreenAttempts,
      progressSnapshot: {
        signature: "replacement-screen-progress",
        progressVersion: 3,
        records: [{
          noteKey: "treble:67:natural",
          learningRecord: noteProgress(3, 2, 0.72)
        }]
      },
      migration: {
        version: 1,
        signature: "replacement-screen-history",
        sourceEvaluationCount: 3
      }
    },
    {
      scope: midiScope,
      attempts: replacementMidiAttempts,
      progressSnapshot: {
        signature: "replacement-midi-progress",
        progressVersion: 3,
        records: [{
          noteKey: "bass:48:natural",
          learningRecord: noteProgress(1, 1, 0.88)
        }]
      },
      migration: {
        version: 1,
        signature: "replacement-midi-history",
        sourceEvaluationCount: 1
      }
    }
  ]);
  const replacedScreenAttempts = await database.readAttemptHistoryForExport(scope);
  const replacedMidiAttempts = await database.readAttemptHistoryForExport(midiScope);
  const replacedScreenProgress = await database.readProgressSnapshot(scope);
  const replacedScreenDashboard = await database.readDashboard(scope);
  const replacedScreenSessions = await database.readRecentSessions(scope);
  const replacedScreenState = await database.readAttemptHistoryState(scope);
  assert(
    replacementResult.replacedScopes === 2
      && replacementResult.attemptCount === 4,
    "backup replacement returned the wrong totals"
  );
  assert(
    replacedScreenAttempts.length === 3
      && replacedScreenAttempts[0].id === "replacement-screen-1"
      && replacedMidiAttempts.length === 1
      && replacedMidiAttempts[0].id === "replacement-midi-1",
    "backup replacement mixed old and imported answers"
  );
  assert(
    replacedScreenProgress.length === 1
      && replacedScreenProgress[0].learningRecord.attempts === 3,
    "backup replacement did not install the imported progress"
  );
  assert(
    replacedScreenDashboard.statistics.attemptCount === 3
      && replacedScreenDashboard.statistics.correctFirstTryCount === 2,
    "backup replacement did not rebuild prepared statistics"
  );
  assert(
    replacedScreenSessions.length === 0,
    "backup replacement retained old learning sessions"
  );
  assert(
    replacedScreenState.migration.status === "complete"
      && replacedScreenState.nextSequence === 3,
    "backup replacement did not finalize its migration state"
  );
  const transitionWriter = new SingleNotesLearningWriter({
    openDatabase: () => database
  });
  const trustedTransition = await transitionWriter.migrateLegacyHistory(
    "screen",
    { version: 1, baselines: [], evaluations: [] }
  );
  assert(
    trustedTransition.saved
      && trustedTransition.verified
      && trustedTransition.trustedDatabase
      && trustedTransition.attemptCount === 3,
    "a compacted legacy history was not safely matched to IndexedDB"
  );
  assert(
    (await database.readAttemptHistoryForExport(scope)).length === 3,
    "the compacted legacy history erased database answers"
  );
  const verifiedMidiTransition = await transitionWriter.verifyHistoryReady(
    "midi"
  );
  assert(
    verifiedMidiTransition.saved
      && verifiedMidiTransition.verified
      && verifiedMidiTransition.attemptCount === 1,
    "the separate MIDI database history was not verified"
  );
  let rejectedDuplicateScopes = false;
  try {
    await database.replaceSingleNotesBackup([
      {
        scope,
        attempts: [],
        progressSnapshot: { records: [] }
      },
      {
        scope,
        attempts: [],
        progressSnapshot: { records: [] }
      }
    ]);
  } catch (error) {
    rejectedDuplicateScopes = true;
  }
  assert(rejectedDuplicateScopes, "duplicate replacement scopes were accepted");
  assert(
    (await database.readAttemptHistoryForExport(scope)).length === 3,
    "invalid replacement changed the existing database"
  );
  await database.clearScope(scope);
  const clearedScreen = await database.readDashboard(scope);
  const retainedMidi = await database.readProgressSnapshot(midiScope);
  assert(clearedScreen.progress.length === 0, "screen progress survived scope reset");
  assert(
    clearedScreen.statistics.attemptCount === 0,
    "screen statistics survived scope reset"
  );
  assert(retainedMidi.length === 1, "screen reset removed separate MIDI progress");

  await database.clear();
  const countsAfterClear = await database.countRecords();
  assert(
    Object.keys(countsAfterClear).every(name => countsAfterClear[name] === 0),
    "global learning-data reset left IndexedDB records behind"
  );

  database.close();
  await deleteLearningDatabasePrototype({ name: databaseName });
  return {
    attempts: dashboardAfterFailure.statistics.attemptCount,
    progressAttempts: dashboardAfterFailure.progress.find(
      record => record.noteKey === "treble:60:natural"
    ).learningRecord.attempts,
    skippedUnchangedSnapshot: true,
    rolledBackInvalidWrite: true,
    finishedSessions: sessions.length,
    recoveredInterruptedSessions: recovered.recoveredSessions,
    learningTimeWindowAttempts: 4,
    twoHourMigrationVerified,
    statisticsSnapshotReady: statisticsSnapshot.readyForDisplay,
    migratedLegacyAttempts: migratedAttempts.length,
    cursorExportAttempts: exportAttempts.length,
    verifiedLegacyMigration: migrationVerification.verified,
    boundedTrendPage: migratedTrendPage.length,
    atomicallyReplacedScopes: replacementResult.replacedScopes,
    replacedBackupAttempts: replacementResult.attemptCount,
    trustedCompactedLegacyHistory: trustedTransition.trustedDatabase,
    verifiedMidiHistory: verifiedMidiTransition.verified,
    clearedOnlySelectedScope: true,
    clearedRecords: true
  };
}

run().then(result => {
  document.body.dataset.status = "passed";
  resultElement.textContent = JSON.stringify(result, null, 2);
  window.__singleNotesStorageTest = result;
}).catch(error => {
  document.body.dataset.status = "failed";
  resultElement.textContent = error.stack || String(error);
  window.__singleNotesStorageTest = { error: String(error) };
});
