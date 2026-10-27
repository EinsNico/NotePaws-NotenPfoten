const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");

function loadEsModule(filePath) {
  const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
  const originalLoader = Module._extensions[".js"];
  Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
    if (filename.indexOf(sourceRoot) !== 0) {
      return originalLoader(loadedModule, filename);
    }
    const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
      babelrc: false,
      presets: [["env", { modules: "commonjs" }]]
    });
    return loadedModule._compile(transformed.code, filename);
  };
  delete require.cache[filePath];
  try {
    return require(filePath);
  } finally {
    Module._extensions[".js"] = originalLoader;
  }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function test(name, body) {
  try {
    await body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

const adaptiveHistory = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveHistory.js")
);
const storage = loadEsModule(
  path.resolve(__dirname, "../src/model/SingleNotesLearningStorage.js")
);
const historyMigration = loadEsModule(
  path.resolve(__dirname, "../src/model/SingleNotesHistoryMigration.js")
);

function evaluation(id, completedAt, value = 60) {
  return adaptiveHistory.createAdaptiveEvaluation({
    clef: "treble",
    staff: "piano",
    value,
    isSharp: true
  }, true, 0, 850, { id, completedAt });
}

function learningRecord(attempts) {
  return {
    attempts,
    correctFirstTry: attempts,
    struggled: 0,
    totalMistakes: 0,
    difficulty: 0.88,
    recentResults: Array.from({ length: attempts }, () => true),
    timedAttempts: attempts,
    averageResponseTimeMs: 850,
    recentResponseTimesMs: Array.from({ length: attempts }, () => 850)
  };
}

(async () => {
  await test("keeps screen controls together and MIDI separate", async () => {
    assert.strictEqual(
      storage.getSingleNotesScope("button"),
      storage.SINGLE_NOTES_SCOPE_SCREEN
    );
    assert.strictEqual(
      storage.getSingleNotesScope("keyboard"),
      storage.SINGLE_NOTES_SCOPE_SCREEN
    );
    assert.strictEqual(
      storage.getSingleNotesScope("midi"),
      storage.SINGLE_NOTES_SCOPE_MIDI
    );
  });

  await test("creates stable unique session identifiers", async () => {
    const first = storage.createSingleNotesSessionId("screen", 1789550000000);
    const second = storage.createSingleNotesSessionId("screen", 1789550000000);
    assert.notStrictEqual(first, second);
    assert(first.indexOf(`${storage.SINGLE_NOTES_SCOPE_SCREEN}|session|`) === 0);
  });

  await test("maps a complete evaluation and exact note progress to one write", async () => {
    const sourceRecord = learningRecord(3);
    const sourceProgress = {
      version: 3,
      notes: { "treble:60:natural": sourceRecord }
    };
    const record = storage.createSingleNotesWriteRecord({
      evaluation: evaluation("evaluation-3", 1789550003000),
      inputGroup: "keyboard",
      sessionId: "session-3",
      learningRecord: sourceRecord,
      progress: sourceProgress
    });
    assert.strictEqual(record.id, "evaluation-3");
    assert.strictEqual(record.scope, storage.SINGLE_NOTES_SCOPE_SCREEN);
    assert.strictEqual(record.sessionId, "session-3");
    assert.strictEqual(record.staff, "piano");
    assert.strictEqual(record.responseTimeMs, 850);
    assert.strictEqual(record.learningRecord.attempts, 3);
    assert.deepStrictEqual(record.learningRecord.recentResults, [true, true, true]);
    assert.strictEqual(record.progressVersion, 3);
    assert.strictEqual(
      record.progressSignature,
      storage.createAdaptiveProgressSignature(sourceProgress)
    );
  });

  await test("creates an order-independent progress snapshot", async () => {
    const first = {
      version: 3,
      notes: {
        "treble:62:natural": learningRecord(2),
        "treble:60:natural": learningRecord(1)
      }
    };
    const second = {
      version: 3,
      notes: {
        "treble:60:natural": learningRecord(1),
        "treble:62:natural": learningRecord(2)
      }
    };
    assert.strictEqual(
      storage.createAdaptiveProgressSignature(first),
      storage.createAdaptiveProgressSignature(second)
    );
    const snapshot = storage.createSingleNotesProgressSnapshot(first);
    const restored = storage.createProgressFromSnapshotRecords(snapshot.records);
    assert.deepStrictEqual(restored.notes, second.notes);
  });

  await test("synchronizes and reads the selected input group's current progress", async () => {
    const calls = [];
    const database = {
      synchronizeProgressSnapshot(scope, snapshot) {
        calls.push(`sync:${scope}:${snapshot.records.length}`);
        return Promise.resolve({
          records: snapshot.records,
          synchronized: true
        });
      },
      readProgressSnapshot(scope) {
        calls.push(`read:${scope}`);
        return Promise.resolve([{
          noteKey: "treble:60:natural",
          learningRecord: learningRecord(4)
        }]);
      },
      clearScope(scope) {
        calls.push(`clear:${scope}`);
        return Promise.resolve();
      },
      close() {}
    };
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => database
    });
    const synchronized = await writer.synchronizeProgress("keyboard", {
      version: 3,
      notes: { "treble:60:natural": learningRecord(3) }
    });
    assert.strictEqual(synchronized.saved, true);
    assert.strictEqual(synchronized.synchronized, true);
    assert.strictEqual(
      synchronized.progress.notes["treble:60:natural"].attempts,
      3
    );
    const read = await writer.readProgress("keyboard");
    assert.strictEqual(read.progress.notes["treble:60:natural"].attempts, 4);
    const cleared = await writer.clearScope("keyboard");
    assert.strictEqual(cleared.saved, true);
    assert.deepStrictEqual(calls, [
      `sync:${storage.SINGLE_NOTES_SCOPE_SCREEN}:1`,
      `read:${storage.SINGLE_NOTES_SCOPE_SCREEN}`,
      `clear:${storage.SINGLE_NOTES_SCOPE_SCREEN}`
    ]);
  });

  await test("reads progress and complete attempt blocks for a backup", async () => {
    const calls = [];
    const attempts = [{
      id: "backup-attempt",
      noteKey: "treble:60:natural",
      staff: "piano",
      completedAt: 1789550003000,
      correctFirstTry: true,
      mistakeCount: 0,
      responseTimeMs: 850,
      sequence: 0
    }];
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => ({
        readProgressSnapshot(scope) {
          calls.push(`progress:${scope}`);
          return Promise.resolve([{
            noteKey: "treble:60:natural",
            learningRecord: learningRecord(1)
          }]);
        },
        readAttemptHistoryForExport(scope) {
          calls.push(`attempts:${scope}`);
          return Promise.resolve(attempts);
        },
        close() {}
      })
    });
    const result = await writer.readBackupSnapshot("keyboard");
    assert.strictEqual(result.saved, true);
    assert.strictEqual(
      result.progress.notes["treble:60:natural"].attempts,
      1
    );
    assert.strictEqual(result.attempts, attempts);
    assert.deepStrictEqual(calls, [
      `progress:${storage.SINGLE_NOTES_SCOPE_SCREEN}`,
      `attempts:${storage.SINGLE_NOTES_SCOPE_SCREEN}`
    ]);
  });

  await test("prepares both input groups for one atomic backup replacement", async () => {
    let captured = null;
    let capturedFlow = null;
    let capturedRhythm = null;
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => ({
        replaceSingleNotesBackup(replacements, noteFlowRounds, rhythmSenseBars) {
          captured = replacements;
          capturedFlow = noteFlowRounds;
          capturedRhythm = rhythmSenseBars;
          return Promise.resolve({
            replacedScopes: replacements.length,
            noteFlowRoundCount: noteFlowRounds.screen.length
              + noteFlowRounds.midi.length,
            attemptCount: replacements.reduce(
              (total, replacement) => total + replacement.attempts.length,
              0
            )
          });
        },
        close() {}
      })
    });
    const screenHistory = {
      version: 1,
      baselines: [],
      evaluations: [evaluation("replace-screen", 1789550004000)]
    };
    const midiHistory = {
      version: 1,
      baselines: [],
      evaluations: [evaluation("replace-midi", 1789550005000, 62)]
    };
    const result = await writer.replaceBackupData({
      adaptiveProgress: {
        version: 3,
        notes: { "treble:60:natural": learningRecord(1) }
      },
      adaptiveHistory: screenHistory,
      adaptiveProgressMidi: {
        version: 3,
        notes: { "treble:62:natural": learningRecord(1) }
      },
      adaptiveHistoryMidi: midiHistory,
      noteFlowRounds: {
        screen: [{ id: "flow-screen", settings: { inputMode: "button" } }],
        midi: [{ id: "flow-midi", settings: { inputMode: "midi" } }]
      },
      rhythmSenseBars: [{ id: "rhythm:1" }]
    }, { replaceNoteFlowRounds: true, replaceRhythmSenseBars: true });
    assert.strictEqual(result.saved, true);
    assert.strictEqual(result.replacedScopes, 2);
    assert.strictEqual(result.attemptCount, 2);
    assert.strictEqual(result.noteFlowRoundCount, 2);
    assert.deepStrictEqual(capturedRhythm, [{ id: "rhythm:1" }]);
    assert.deepStrictEqual(capturedFlow.screen.map(value => value.id),
      ["flow-screen"]);
    assert.deepStrictEqual(captured.map(value => value.scope), [
      storage.SINGLE_NOTES_SCOPE_SCREEN,
      storage.SINGLE_NOTES_SCOPE_MIDI
    ]);
    assert.deepStrictEqual(captured.map(value => value.attempts[0].id), [
      "replace-screen",
      "replace-midi"
    ]);
    assert.strictEqual(captured[0].progressSnapshot.records.length, 1);
    assert.strictEqual(captured[1].progressSnapshot.records.length, 1);
  });

  await test("does not retain a failed backup replacement for later retry", async () => {
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => ({
        replaceSingleNotesBackup() {
          return Promise.reject(new Error("replace failed"));
        },
        close() {}
      })
    });
    const result = await writer.replaceBackupData({});
    assert.strictEqual(result.saved, false);
    assert.strictEqual(writer.getStatus().failedWrites, 0);
  });

  await test("reads one compact statistics snapshot after queued writes", async () => {
    const calls = [];
    const database = {
      readDashboard(scope, limit) {
        calls.push(`dashboard:${scope}:${limit}`);
        return Promise.resolve({
          progress: [],
          statistics: {
            attemptCount: 2,
            correctFirstTryCount: 1,
            mistakeCount: 1,
            responseTimeTotalMs: 800,
            timedAttemptCount: 1,
            sessionCount: 1,
            lastCompletedAt: 1789550002000
          },
          recentTrend: []
        });
      },
      readTimeBuckets(scope) {
        calls.push(`times:${scope}`);
        return Promise.resolve([{
          day: "2026-09-16",
          windowHours: 2,
          windows: {
            12: {
              attemptCount: 2,
              correctFirstTryCount: 1,
              mistakeCount: 1,
              responseTimeTotalMs: 800,
              timedAttemptCount: 1
            }
          }
        }]);
      },
      readRecentSessions(scope, limit) {
        calls.push(`sessions:${scope}:${limit}`);
        return Promise.resolve([]);
      },
      close() {}
    };
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => database
    });
    const result = await writer.readStatisticsSnapshot("keyboard", {
      trendLimit: 20,
      sessionLimit: 10,
      legacyEvaluationCount: 2
    });
    assert.strictEqual(result.saved, true);
    assert.strictEqual(result.snapshot.readyForDisplay, true);
    assert.strictEqual(result.snapshot.summary.attemptCount, 2);
    assert.deepStrictEqual(calls, [
      `dashboard:${storage.SINGLE_NOTES_SCOPE_SCREEN}:20`,
      `times:${storage.SINGLE_NOTES_SCOPE_SCREEN}`,
      `sessions:${storage.SINGLE_NOTES_SCOPE_SCREEN}:10`
    ]);
  });

  await test("loads one bounded trend page without reading attempt history", async () => {
    const calls = [];
    const database = {
      readTrendSegments(scope, startIndex, limit) {
        calls.push(`${scope}:${startIndex}:${limit}`);
        return Promise.resolve([{
          id: "trend-page-5",
          segmentNumber: 5,
          startedAt: 1789550000000,
          endedAt: 1789550010000,
          attemptCount: 20,
          correctFirstTryCount: 15,
          responseTimeTotalMs: 9000,
          timedAttemptCount: 10
        }]);
      },
      close() {}
    };
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => database
    });
    const result = await writer.readTrendPage("keyboard", {
      startIndex: 5,
      limit: 50
    });
    assert.strictEqual(result.saved, true);
    assert.strictEqual(result.segments.length, 1);
    assert.strictEqual(result.segments[0].index, 6);
    assert.strictEqual(result.segments[0].accuracy, 75);
    assert.deepStrictEqual(calls, [
      `${storage.SINGLE_NOTES_SCOPE_SCREEN}:5:50`
    ]);
  });

  await test("migrates and verifies the legacy event history only once", async () => {
    const calls = [];
    const history = {
      version: 1,
      baselines: [],
      evaluations: [
        evaluation("migration-1", 1789550001000),
        evaluation("migration-2", 1789550002000, 62)
      ]
    };
    let storedAttempts = [{
      id: "migration-1",
      sessionId: "preserved-real-session"
    }];
    let state = {
      nextSequence: 1,
      fingerprint: null,
      migration: null
    };
    const database = {
      readAttemptHistoryState(scope) {
        calls.push(`state:${scope}`);
        return Promise.resolve(state);
      },
      readAttemptHistory(scope) {
        calls.push(`history:${scope}`);
        return Promise.resolve(storedAttempts);
      },
      replaceAttemptHistory(scope, attempts, plan) {
        calls.push(`replace:${scope}:${attempts.length}`);
        storedAttempts = attempts.slice();
        state = {
          nextSequence: attempts.length,
          fingerprint: historyMigration.createSingleNotesHistoryFingerprint(
            attempts
          ),
          migration: {
            status: "pending",
            signature: plan.signature
          }
        };
        return Promise.resolve();
      },
      readDashboard(scope) {
        calls.push(`dashboard:${scope}`);
        return Promise.resolve({
          statistics: {
            attemptCount: 2,
            correctFirstTryCount: 2,
            mistakeCount: 0,
            responseTimeTotalMs: 1700,
            timedAttemptCount: 2,
            lastCompletedAt: 1789550002000
          }
        });
      },
      readTimeBuckets(scope) {
        calls.push(`times:${scope}`);
        return Promise.resolve([{
          attemptCount: 2,
          correctFirstTryCount: 2,
          mistakeCount: 0,
          responseTimeTotalMs: 1700,
          timedAttemptCount: 2
        }]);
      },
      finalizeAttemptHistoryMigration(scope, plan) {
        calls.push(`finalize:${scope}:${plan.totalAttemptCount}`);
        state.migration = {
          status: "complete",
          signature: plan.signature
        };
        return Promise.resolve();
      },
      close() {}
    };
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => database
    });
    const first = await writer.migrateLegacyHistory("keyboard", history);
    assert.strictEqual(first.saved, true);
    assert.strictEqual(first.migrated, true);
    assert.strictEqual(first.verified, true);
    assert.strictEqual(
      storedAttempts[0].sessionId,
      "preserved-real-session"
    );

    const second = await writer.migrateLegacyHistory("keyboard", history);
    assert.strictEqual(second.saved, true);
    assert.strictEqual(second.migrated, false);
    const extendedHistory = {
      version: 1,
      baselines: [],
      evaluations: history.evaluations.concat([
        evaluation("migration-3", 1789550003000, 64)
      ])
    };
    const extendedPlan = historyMigration.createSingleNotesHistoryMigrationPlan(
      extendedHistory,
      storage.SINGLE_NOTES_SCOPE_SCREEN,
      storedAttempts
    );
    storedAttempts = extendedPlan.attempts;
    state.nextSequence = extendedPlan.attempts.length;
    state.fingerprint = extendedPlan.fingerprint;
    const extended = await writer.migrateLegacyHistory(
      "keyboard",
      extendedHistory
    );
    assert.strictEqual(extended.saved, true);
    assert.strictEqual(extended.migrated, false);
    assert.deepStrictEqual(calls, [
      `state:${storage.SINGLE_NOTES_SCOPE_SCREEN}`,
      `history:${storage.SINGLE_NOTES_SCOPE_SCREEN}`,
      `replace:${storage.SINGLE_NOTES_SCOPE_SCREEN}:2`,
      `history:${storage.SINGLE_NOTES_SCOPE_SCREEN}`,
      `dashboard:${storage.SINGLE_NOTES_SCOPE_SCREEN}`,
      `times:${storage.SINGLE_NOTES_SCOPE_SCREEN}`,
      `finalize:${storage.SINGLE_NOTES_SCOPE_SCREEN}:2`,
      `state:${storage.SINGLE_NOTES_SCOPE_SCREEN}`,
      `state:${storage.SINGLE_NOTES_SCOPE_SCREEN}`
    ]);
  });

  await test("trusts a complete database after the legacy history was compacted", async () => {
    const plan = historyMigration.createSingleNotesHistoryMigrationPlan({
      version: 1,
      baselines: [],
      evaluations: [
        evaluation("database-only-1", 1789550001000),
        evaluation("database-only-2", 1789550002000, 62)
      ]
    }, storage.SINGLE_NOTES_SCOPE_SCREEN);
    let replaced = false;
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => ({
        readAttemptHistoryState() {
          return Promise.resolve({
            nextSequence: 2,
            fingerprint: plan.fingerprint,
            migration: { status: "complete", signature: plan.signature }
          });
        },
        replaceAttemptHistory() {
          replaced = true;
          return Promise.resolve();
        },
        close() {}
      })
    });
    const result = await writer.migrateLegacyHistory("screen", {
      version: 1,
      baselines: [],
      evaluations: []
    });
    assert.strictEqual(result.saved, true);
    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.trustedDatabase, true);
    assert.strictEqual(result.attemptCount, 2);
    assert.strictEqual(replaced, false);
  });

  await test("refuses to replace an unverified non-empty database from an empty history", async () => {
    let replaced = false;
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => ({
        readAttemptHistoryState() {
          return Promise.resolve({
            nextSequence: 2,
            fingerprint: null,
            migration: null
          });
        },
        replaceAttemptHistory() {
          replaced = true;
          return Promise.resolve();
        },
        close() {}
      })
    });
    const result = await writer.migrateLegacyHistory("screen", {
      version: 1,
      baselines: [],
      evaluations: []
    });
    assert.strictEqual(result.saved, false);
    assert.strictEqual(result.verified, false);
    assert.strictEqual(replaced, false);
  });

  await test("initializes and verifies a genuinely empty database history", async () => {
    const emptyPlan = historyMigration.createSingleNotesHistoryMigrationPlan(
      adaptiveHistory.createAdaptiveHistory(),
      storage.SINGLE_NOTES_SCOPE_MIDI
    );
    let state = {
      nextSequence: 0,
      fingerprint: null,
      migration: null
    };
    let replacements = 0;
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => ({
        readAttemptHistoryState() {
          return Promise.resolve(state);
        },
        replaceAttemptHistory() {
          replacements += 1;
          state = {
            nextSequence: 0,
            fingerprint: emptyPlan.fingerprint,
            migration: { status: "pending", signature: emptyPlan.signature }
          };
          return Promise.resolve();
        },
        finalizeAttemptHistoryMigration() {
          state.migration.status = "complete";
          return Promise.resolve();
        },
        close() {}
      })
    });
    const result = await writer.verifyHistoryReady("midi");
    assert.strictEqual(result.saved, true);
    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.initialized, true);
    assert.strictEqual(replacements, 1);
  });

  await test("rebuilds a pending migration whose aggregates do not verify", async () => {
    const history = {
      version: 1,
      baselines: [],
      evaluations: [evaluation("repair-migration", 1789550001000)]
    };
    const plan = historyMigration.createSingleNotesHistoryMigrationPlan(
      history,
      storage.SINGLE_NOTES_SCOPE_SCREEN
    );
    let repaired = false;
    const database = {
      readAttemptHistoryState() {
        return Promise.resolve({
          nextSequence: 1,
          fingerprint: plan.fingerprint,
          migration: { status: "pending", signature: plan.signature }
        });
      },
      readAttemptHistory() {
        return Promise.resolve(plan.attempts);
      },
      readDashboard() {
        return Promise.resolve({
          statistics: {
            attemptCount: repaired ? 1 : 0,
            correctFirstTryCount: repaired ? 1 : 0,
            mistakeCount: 0,
            responseTimeTotalMs: repaired ? 850 : 0,
            timedAttemptCount: repaired ? 1 : 0,
            lastCompletedAt: repaired ? 1789550001000 : 0
          }
        });
      },
      readTimeBuckets() {
        return Promise.resolve(repaired ? [{
          attemptCount: 1,
          correctFirstTryCount: 1,
          mistakeCount: 0,
          responseTimeTotalMs: 850,
          timedAttemptCount: 1
        }] : []);
      },
      replaceAttemptHistory() {
        repaired = true;
        return Promise.resolve();
      },
      finalizeAttemptHistoryMigration() {
        return Promise.resolve();
      },
      close() {}
    };
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => database
    });
    const result = await writer.migrateLegacyHistory("keyboard", history);
    assert.strictEqual(result.saved, true);
    assert.strictEqual(result.migrated, true);
    assert.strictEqual(result.verified, true);
    assert.strictEqual(repaired, true);
  });

  await test("recovers interrupted sessions before a new learning round", async () => {
    const calls = [];
    let recoveryAttempt = 0;
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => ({
        recoverInterruptedSessions(scope) {
          recoveryAttempt += 1;
          calls.push(`recover:${scope}:${recoveryAttempt}`);
          return recoveryAttempt === 1
            ? Promise.reject(new Error("temporary recovery failure"))
            : Promise.resolve({ recoveredSessions: 2 });
        },
        close() {}
      })
    });
    const failed = await writer.recoverInterruptedSessions("keyboard");
    assert.strictEqual(failed.saved, false);
    assert.strictEqual(writer.getStatus().failedWrites, 1);

    const retried = await writer.retryFailedWrites();
    assert.strictEqual(retried.saved, true);
    assert.strictEqual(writer.getStatus().failedWrites, 0);
    assert.deepStrictEqual(calls, [
      `recover:${storage.SINGLE_NOTES_SCOPE_SCREEN}:1`,
      `recover:${storage.SINGLE_NOTES_SCOPE_SCREEN}:2`
    ]);
  });

  await test("does not recover a session that is live in the current app run", async () => {
    const exclusions = [];
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => ({
        recordAttempt() {
          return Promise.resolve({ saved: true });
        },
        recoverInterruptedSessions(scope, excludedSessionIds) {
          exclusions.push({ scope, excludedSessionIds });
          return Promise.resolve({ recoveredSessions: 0 });
        },
        finishSession() {
          return Promise.resolve();
        },
        close() {}
      })
    });
    await writer.enqueueEvaluation({
      evaluation: evaluation("evaluation-live", 1789550003500),
      inputGroup: "screen",
      sessionId: "session-live",
      learningRecord: learningRecord(1)
    });
    await writer.recoverInterruptedSessions("screen");
    await writer.finishSession("screen", "session-live", 1789550003600);
    await writer.recoverInterruptedSessions("screen");
    assert.deepStrictEqual(exclusions, [
      {
        scope: storage.SINGLE_NOTES_SCOPE_SCREEN,
        excludedSessionIds: ["session-live"]
      },
      {
        scope: storage.SINGLE_NOTES_SCOPE_SCREEN,
        excludedSessionIds: []
      }
    ]);
  });

  await test("serializes writes and closes the session only after them", async () => {
    const calls = [];
    let activeWrites = 0;
    let maximumActiveWrites = 0;
    const database = {
      recordAttempt(record) {
        activeWrites += 1;
        maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
        calls.push(`write:${record.id}:start`);
        return delay(5).then(() => {
          calls.push(`write:${record.id}:end`);
          activeWrites -= 1;
          return { saved: true };
        });
      },
      finishSession(scope, sessionId) {
        calls.push(`finish:${scope}:${sessionId}`);
        return Promise.resolve();
      },
      clear() {
        calls.push("clear");
        return Promise.resolve();
      },
      close() {}
    };
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => database
    });
    const first = writer.enqueueEvaluation({
      evaluation: evaluation("evaluation-1", 1789550001000),
      inputGroup: "screen",
      sessionId: "session-1",
      learningRecord: learningRecord(1)
    });
    const second = writer.enqueueEvaluation({
      evaluation: evaluation("evaluation-2", 1789550002000),
      inputGroup: "screen",
      sessionId: "session-1",
      learningRecord: learningRecord(2)
    });
    const finish = writer.finishSession("screen", "session-1");
    const clear = writer.clearAll();
    await Promise.all([first, second, finish, clear]);
    assert.strictEqual(maximumActiveWrites, 1);
    assert.deepStrictEqual(calls, [
      "write:evaluation-1:start",
      "write:evaluation-1:end",
      "write:evaluation-2:start",
      "write:evaluation-2:end",
      `finish:${storage.SINGLE_NOTES_SCOPE_SCREEN}:session-1`,
      "clear"
    ]);
    assert.strictEqual(writer.getStatus().pendingWrites, 0);
  });

  await test("contains a failed write without blocking the following answer", async () => {
    const expectedError = new Error("storage full");
    let attempt = 0;
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => ({
        recordAttempt() {
          attempt += 1;
          return attempt === 1
            ? Promise.reject(expectedError)
            : Promise.resolve({ saved: true });
        },
        close() {}
      })
    });
    const failed = await writer.enqueueEvaluation({
      evaluation: evaluation("evaluation-failed", 1789550004000),
      inputGroup: "screen",
      sessionId: "session-errors",
      learningRecord: learningRecord(1)
    });
    assert.strictEqual(failed.saved, false);
    assert.strictEqual(failed.error, expectedError);
    assert.strictEqual(writer.getStatus().lastError, expectedError);
    assert.strictEqual(writer.getStatus().failedWrites, 1);
    assert.strictEqual(
      writer.getStatus().errorType,
      storage.SINGLE_NOTES_STORAGE_ERROR_QUOTA
    );

    const recovered = await writer.enqueueEvaluation({
      evaluation: evaluation("evaluation-recovered", 1789550005000),
      inputGroup: "screen",
      sessionId: "session-errors",
      learningRecord: learningRecord(2)
    });
    assert.strictEqual(recovered.saved, true);
    assert.strictEqual(writer.getStatus().lastError, expectedError);
    assert.strictEqual(writer.getStatus().failedWrites, 1);
    assert.strictEqual(writer.getStatus().state, "error");

    const retried = await writer.retryFailedWrites();
    assert.strictEqual(retried.saved, true);
    assert.strictEqual(attempt, 3);
    assert.strictEqual(writer.getStatus().lastError, null);
    assert.strictEqual(writer.getStatus().failedWrites, 0);
    assert.strictEqual(writer.getStatus().state, "idle");
    assert(Number.isFinite(writer.getStatus().lastSavedAt));
  });

  await test("retries a failed attempt before closing its session", async () => {
    const calls = [];
    let attempt = 0;
    const writer = new storage.SingleNotesLearningWriter({
      openDatabase: () => ({
        recordAttempt() {
          attempt += 1;
          calls.push(`attempt:${attempt}`);
          return attempt === 1
            ? Promise.reject(new Error("temporary failure"))
            : Promise.resolve({ saved: true });
        },
        finishSession() {
          calls.push("finish");
          return Promise.resolve();
        },
        close() {}
      })
    });
    await writer.enqueueEvaluation({
      evaluation: evaluation("evaluation-session-retry", 1789550006000),
      inputGroup: "screen",
      sessionId: "session-retry",
      learningRecord: learningRecord(1)
    });
    const finish = await writer.finishSession(
      "screen",
      "session-retry",
      1789550007000
    );
    assert.strictEqual(finish.saved, false);
    assert.deepStrictEqual(calls, ["attempt:1"]);
    assert.strictEqual(writer.getStatus().failedWrites, 2);

    const retried = await writer.retryFailedWrites();
    assert.strictEqual(retried.saved, true);
    assert.deepStrictEqual(calls, ["attempt:1", "attempt:2", "finish"]);
    assert.strictEqual(writer.getStatus().failedWrites, 0);
  });

  await test("classifies quota and general database failures", async () => {
    const quotaError = new Error("write failed");
    quotaError.name = "QuotaExceededError";
    assert.strictEqual(
      storage.classifySingleNotesStorageError(quotaError),
      storage.SINGLE_NOTES_STORAGE_ERROR_QUOTA
    );
    assert.strictEqual(
      storage.classifySingleNotesStorageError(new Error("connection failed")),
      storage.SINGLE_NOTES_STORAGE_ERROR_DATABASE
    );
  });

  process.stdout.write("Single-notes learning storage tests passed.\n");
})().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
