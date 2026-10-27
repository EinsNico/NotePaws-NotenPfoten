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

function createStorage(values = {}) {
  const data = Object.assign({}, values);
  return {
    get length() {
      return Object.keys(data).length;
    },
    key(index) {
      return Object.keys(data)[index] || null;
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    }
  };
}

function stored(value) {
  return JSON.stringify({ data: value });
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

const files = loadEsModule(
  path.resolve(__dirname, "../src/model/SaveDataFiles.js")
);
const backupModel = loadEsModule(
  path.resolve(__dirname, "../src/model/SaveDataBackup.js")
);
const adaptiveHistory = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveHistory.js")
);

function createNoteFlowStorage(rounds = { screen: [], midi: [], chordMidi: [] }) {
  return {
    flush: () => Promise.resolve(),
    readRoundsForExport: (group, exerciseType) => Promise.resolve({
      saved: true,
      rounds: exerciseType === "chord" ? rounds.chordMidi || [] : rounds[group]
    })
  };
}

function createRhythmStorage(bars = []) {
  return {
    flush: () => Promise.resolve(),
    readBarsForExport: () => Promise.resolve({ saved: true, bars })
  };
}

const rhythmBar = {
  id: "rhythm-session:bar:1", sessionId: "rhythm-session", barNumber: 1,
  completedAt: "2026-09-28T12:00:00.000Z",
  settings: { meter: "4/4", bpm: 80 }, score: { correct: 1 }, timing: {},
  notes: [{ beat: 0, value: "quarter", result: "correct", offsetMs: 20 }]
};

function record(attempts) {
  return {
    attempts,
    correctFirstTry: attempts,
    struggled: 0,
    totalMistakes: 0,
    difficulty: 0.75,
    recentResults: Array.from({ length: Math.min(attempts, 10) }, () => true),
    timedAttempts: attempts,
    averageResponseTimeMs: 800,
    recentResponseTimesMs: Array.from(
      { length: Math.min(attempts, 10) },
      () => 800
    )
  };
}

function evaluation(id, completedAt, clef, staff, value) {
  return adaptiveHistory.createAdaptiveEvaluation({
    clef,
    staff,
    value,
    isSharp: true
  }, true, 0, 800, { id, completedAt });
}

function createLegacyStorage() {
  const screenBaseline = {
    version: 3,
    notes: { "treble:60:natural": record(4) }
  };
  const screenHistory = adaptiveHistory.createAdaptiveHistory(screenBaseline);
  screenHistory.evaluations.push(
    evaluation("screen-db", 1789550001000, "treble", "piano", 60)
  );
  const midiHistory = adaptiveHistory.createAdaptiveHistory();
  midiHistory.evaluations.push(
    evaluation("midi-db", 1789550002000, "bass", "piano", 48)
  );
  return createStorage({
    options: stored({ language: "de" }),
    adaptiveOptions: stored({ inputMode: "button" }),
    adaptiveProgress: stored({
      version: 3,
      notes: { "treble:60:natural": record(5) }
    }),
    adaptiveHistory: stored(screenHistory),
    adaptiveProgressMidi: stored({
      version: 3,
      notes: { "bass:48:natural": record(1) }
    }),
    adaptiveHistoryMidi: stored(midiHistory)
  });
}

function attempt(id, completedAt, noteKey, staff) {
  return {
    id,
    completedAt,
    noteKey,
    staff,
    correctFirstTry: true,
    mistakeCount: 0,
    responseTimeMs: 800,
    sequence: 0
  };
}

(async () => {
  await test("exports IndexedDB progress and attempts in the compatible format", async () => {
    const calls = [];
    const legacyStorage = createLegacyStorage();
    const snapshots = {
      screen: {
        saved: true,
        progress: {
          version: 3,
          notes: { "treble:60:natural": record(5) }
        },
        attempts: [attempt(
          "screen-db",
          1789550001000,
          "treble:60:natural",
          "piano"
        )]
      },
      midi: {
        saved: true,
        progress: {
          version: 3,
          notes: { "bass:48:natural": record(1) }
        },
        attempts: [attempt(
          "midi-db",
          1789550002000,
          "bass:48:natural",
          "piano"
        )]
      }
    };
    const learningStorage = {
      flush() {
        calls.push("flush");
        return Promise.resolve({ saved: true });
      },
      getStatus() {
        return { failedWrites: 0 };
      },
      synchronizeProgress(group, progress) {
        calls.push(`sync:${group}:${Object.keys(progress.notes).length}`);
        return Promise.resolve({ saved: true });
      },
      migrateLegacyHistory(group, history) {
        calls.push(`migrate:${group}:${history.evaluations.length}`);
        return Promise.resolve({ saved: true, verified: true });
      },
      readDailyTaskHistory: async () => ({ saved: true, history: null }),
      readBackupSnapshot(group) {
        calls.push(`read:${group}`);
        return Promise.resolve(snapshots[group]);
      }
    };
    const result = await files.createIndexedDbSaveDataExport(
      legacyStorage,
      {
        learningStorage,
        noteFlowStorage: createNoteFlowStorage({
          screen: [{ id: "flow-screen", settings: { inputMode: "button" } }],
          midi: [{ id: "flow-midi", settings: { inputMode: "midi" } }],
          chordMidi: [{ id: "flow-chord", exerciseType: "chord",
            settings: { inputMode: "midi" } }]
        }),
        rhythmStorage: createRhythmStorage([rhythmBar]),
        appVersion: "1.3.0",
        createdAt: "2026-09-16T15:30:00.000Z"
      }
    );
    assert.deepStrictEqual(calls, [
      "flush",
      "sync:screen:1",
      "migrate:screen:1",
      "read:screen",
      "sync:midi:1",
      "migrate:midi:1",
      "read:midi"
    ]);
    assert.strictEqual(result.backup.version, 4);
    assert.deepStrictEqual(result.backup.data.rhythmSenseBars, [rhythmBar]);
    assert.deepStrictEqual(
      result.backup.data.noteFlowRounds.screen.map(round => round.id),
      ["flow-screen"]
    );
    assert.deepStrictEqual(
      result.backup.data.noteFlowRounds.midi.map(round => round.id),
      ["flow-midi"]
    );
    assert.deepStrictEqual(
      result.backup.data.noteFlowRounds.chordMidi.map(round => round.id),
      ["flow-chord"]
    );
    assert.deepStrictEqual(
      JSON.parse(result.text).data.noteFlowRounds,
      result.backup.data.noteFlowRounds
    );
    assert.strictEqual(files.parseSaveDataFile(result.text).valid, true);
    assert.strictEqual(result.backup.data.adaptiveProgress.version, 3);
    assert.strictEqual(
      result.backup.data.adaptiveHistory.baselines.length,
      1
    );
    assert.strictEqual(
      result.backup.data.adaptiveHistory.evaluations[0].id,
      "screen-db"
    );
    assert.strictEqual(
      result.backup.data.adaptiveHistoryMidi.evaluations[0].id,
      "midi-db"
    );
    assert.strictEqual(
      result.backup.data.adaptiveHistory.evaluations[0].exercise.staff,
      "piano"
    );
    assert.deepStrictEqual(backupModel.validateSaveDataBackup(result.backup), {
      valid: true,
      errors: []
    });
    assert.strictEqual(files.parseSaveDataFile(result.text).valid, true);
    assert.strictEqual(
      JSON.parse(legacyStorage.getItem("adaptiveHistory"))
        .data.evaluations.length,
      0
    );
  });

  await test("retries pending writes before creating a database backup", async () => {
    let failedWrites = 1;
    let retried = 0;
    const learningStorage = {
      flush() {
        return Promise.resolve({ saved: false });
      },
      getStatus() {
        return { failedWrites };
      },
      retryFailedWrites() {
        retried += 1;
        failedWrites = 0;
        return Promise.resolve({ saved: true, failedWrites: 0 });
      },
      synchronizeProgress() {
        return Promise.resolve({ saved: true });
      },
      migrateLegacyHistory() {
        return Promise.resolve({ saved: true, verified: true });
      },
      verifyHistoryReady() {
        return Promise.resolve({ saved: true, verified: true });
      },
      readDailyTaskHistory: async () => ({ saved: true, history: null }),
      readBackupSnapshot(group) {
        return Promise.resolve({
          saved: true,
          progress: { version: 3, notes: {} },
          attempts: []
        });
      }
    };
    await files.createIndexedDbSaveDataExport(createStorage(), {
      learningStorage,
      noteFlowStorage: createNoteFlowStorage(),
      rhythmStorage: createRhythmStorage()
    });
    assert.strictEqual(retried, 1);
  });

  await test("rejects an export when database migration is not verified", async () => {
    const learningStorage = {
      flush() {
        return Promise.resolve({ saved: true });
      },
      getStatus() {
        return { failedWrites: 0 };
      },
      synchronizeProgress() {
        return Promise.resolve({ saved: true });
      },
      migrateLegacyHistory() {
        return Promise.resolve({ saved: true, verified: false });
      }
    };
    await assert.rejects(
      files.createIndexedDbSaveDataExport(createLegacyStorage(), {
        learningStorage
      }),
      /History migration failed/
    );
  });

  await test("rejects malformed database attempts instead of omitting them", async () => {
    assert.throws(() => files.createAdaptiveEvaluationFromAttempt({
      id: "broken",
      noteKey: "not-a-note",
      completedAt: 1789550001000
    }), /invalid single-notes attempt key/);
  });

  await test("exports from a verified database after compacting legacy histories", async () => {
    const baselineProgress = {
      version: 3,
      notes: { "treble:60:natural": record(4) }
    };
    const baselineOnly = adaptiveHistory.createAdaptiveHistory(
      baselineProgress
    );
    const storage = createStorage({
      adaptiveProgress: stored(baselineProgress),
      adaptiveHistory: stored(baselineOnly)
    });
    const calls = [];
    const learningStorage = {
      flush() {
        return Promise.resolve({ saved: true });
      },
      getStatus() {
        return { failedWrites: 0 };
      },
      synchronizeProgress(group) {
        return Promise.resolve({ saved: true, group });
      },
      migrateLegacyHistory() {
        throw new Error("baseline-only history must not be migrated");
      },
      verifyHistoryReady(group) {
        calls.push(`verify:${group}`);
        return Promise.resolve({ saved: true, verified: true });
      },
      readDailyTaskHistory: async () => ({ saved: true, history: null }),
      readBackupSnapshot(group) {
        return Promise.resolve({
          saved: true,
          progress: group === "screen" ? baselineProgress : {
            version: 3,
            notes: {}
          },
          attempts: group === "screen" ? [attempt(
            "database-after-compaction",
            1789550003000,
            "treble:60:natural",
            "piano"
          )] : []
        });
      }
    };
    const result = await files.createIndexedDbSaveDataExport(storage, {
      learningStorage,
      noteFlowStorage: createNoteFlowStorage(),
      rhythmStorage: createRhythmStorage(),
      createdAt: "2026-09-16T15:30:00.000Z"
    });
    assert.deepStrictEqual(calls, ["verify:screen", "verify:midi"]);
    assert.strictEqual(
      result.backup.data.adaptiveHistory.evaluations[0].id,
      "database-after-compaction"
    );
    const compacted = JSON.parse(storage.getItem("adaptiveHistory")).data;
    assert.strictEqual(compacted.evaluations.length, 0);
    assert.strictEqual(compacted.baselines.length, 1);
  });

  process.stdout.write("IndexedDB save-data export tests passed.\n");
})().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
