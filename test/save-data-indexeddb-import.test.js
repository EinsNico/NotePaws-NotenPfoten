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
  let failingSetKey = null;
  let failingSetOccurrence = null;
  const setCounts = Object.create(null);
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
      setCounts[key] = (setCounts[key] || 0) + 1;
      if (
        key === failingSetKey
        && (
          failingSetOccurrence === null
          || setCounts[key] === failingSetOccurrence
        )
      ) {
        failingSetKey = null;
        failingSetOccurrence = null;
        throw new Error("simulated storage failure");
      }
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    failNextSetFor(key) {
      failingSetKey = key;
      failingSetOccurrence = (setCounts[key] || 0) + 1;
    },
    failSetAfter(key, writes) {
      failingSetKey = key;
      failingSetOccurrence = (setCounts[key] || 0) + writes;
    },
    dump() {
      return Object.assign({}, data);
    }
  };
}

function stored(value) {
  return JSON.stringify({ data: value });
}

function learningRecord(attempts) {
  return {
    attempts,
    correctFirstTry: attempts,
    struggled: 0,
    totalMistakes: 0,
    difficulty: 0.75,
    recentResults: Array.from({ length: attempts }, () => true),
    timedAttempts: attempts,
    averageResponseTimeMs: 800,
    recentResponseTimesMs: Array.from({ length: attempts }, () => 800)
  };
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

const backupModel = loadEsModule(
  path.resolve(__dirname, "../src/model/SaveDataBackup.js")
);
const adaptiveHistory = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveHistory.js")
);
const importModel = loadEsModule(
  path.resolve(__dirname, "../src/model/SaveDataImport.js")
);

function createBackup(values = {}) {
  return backupModel.createSaveDataBackup(createStorage(values), {
    appVersion: "1.3.0",
    createdAt: "2026-09-16T18:00:00.000Z"
  });
}

function createImportedBackup() {
  const screenHistory = adaptiveHistory.createAdaptiveHistory();
  screenHistory.evaluations.push(adaptiveHistory.createAdaptiveEvaluation({
    clef: "treble",
    staff: "piano",
    value: 60,
    isSharp: true
  }, true, 0, 800, {
    id: "import-screen",
    completedAt: 1789550001000
  }));
  const midiHistory = adaptiveHistory.createAdaptiveHistory();
  midiHistory.evaluations.push(adaptiveHistory.createAdaptiveEvaluation({
    clef: "bass",
    staff: "piano",
    value: 48,
    isSharp: true
  }, true, 0, 700, {
    id: "import-midi",
    completedAt: 1789550002000
  }));
  return createBackup({
    options: stored({ language: "en" }),
    adaptiveProgress: stored({
      version: 3,
      notes: { "treble:60:natural": learningRecord(1) }
    }),
    adaptiveHistory: stored(screenHistory),
    adaptiveProgressMidi: stored({
      version: 3,
      notes: { "bass:48:natural": learningRecord(1) }
    }),
    adaptiveHistoryMidi: stored(midiHistory)
  });
}

function createCurrentDatabaseBackup() {
  const screenHistory = adaptiveHistory.createAdaptiveHistory();
  screenHistory.evaluations.push(adaptiveHistory.createAdaptiveEvaluation({
    clef: "treble",
    staff: "piano",
    value: 62,
    isSharp: true
  }, true, 0, 900, {
    id: "current-screen",
    completedAt: 1789550000000
  }));
  return createBackup({
    options: stored({ language: "de" }),
    adaptiveProgress: stored({
      version: 3,
      notes: { "treble:62:natural": learningRecord(1) }
    }),
    adaptiveHistory: stored(screenHistory)
  });
}

function createLearningStorage(replace) {
  return {
    flush() {
      return Promise.resolve({ saved: true });
    },
    getStatus() {
      return { failedWrites: 0 };
    },
    replaceBackupData: replace
  };
}

function rhythmBar(id, result = "correct") {
  return {
    id, sessionId: "rhythm-session", barNumber: Number(id.split(":").pop()),
    completedAt: "2026-09-28T12:00:00.000Z",
    settings: { meter: "4/4", bpm: 80 },
    score: { correct: result === "correct" ? 1 : 0, wrong: result === "early" ? 1 : 0 },
    timing: { precise: result === "correct" ? 1 : 0 },
    notes: [{ beat: 0, value: "quarter", result, offsetMs: 20 }]
  };
}

(async () => {
  await test("replaces Rhythm Sense bars in the database-backed import", async () => {
    const storage = createStorage({ options: stored({ language: "de" }) });
    const backup = createImportedBackup();
    backup.version = 4;
    backup.data.rhythmSenseBars = [rhythmBar("rhythm:1")];
    const prepared = importModel.prepareSaveDataImport(
      storage, backup, importModel.SAVE_DATA_IMPORT_MODES.replace
    );
    let receivedOptions;
    let receivedBars;
    await importModel.applyPreparedSaveDataReplaceEverywhere(
      storage, prepared, createLearningStorage((data, options) => {
        receivedOptions = options;
        receivedBars = data.rhythmSenseBars;
        return Promise.resolve({ saved: true, replacedScopes: 2, attemptCount: 2 });
      })
    );
    assert.strictEqual(receivedOptions.replaceRhythmSenseBars, true);
    assert.deepStrictEqual(receivedBars, backup.data.rhythmSenseBars);
    assert.strictEqual(JSON.parse(storage.getItem("options")).data.language, "en");
  });

  await test("merges Rhythm Sense bars once and keeps current ID conflicts", async () => {
    const storage = createStorage({ options: stored({ language: "de" }) });
    const currentBackup = createCurrentDatabaseBackup();
    currentBackup.version = 4;
    currentBackup.data.rhythmSenseBars = [rhythmBar("rhythm:1")];
    const importedBackup = createImportedBackup();
    importedBackup.version = 4;
    importedBackup.data.rhythmSenseBars = [
      rhythmBar("rhythm:1", "early"), rhythmBar("rhythm:2")
    ];
    const prepared = importModel.prepareSaveDataImport(
      storage, importedBackup, importModel.SAVE_DATA_IMPORT_MODES.merge,
      { currentBackup }
    );
    assert.strictEqual(prepared.mergeReport.addedRhythmSenseBars, 1);
    assert.strictEqual(prepared.mergeReport.conflictingRhythmSenseBars, 1);
    assert.deepStrictEqual(prepared.resultBackup.data.rhythmSenseBars,
      [rhythmBar("rhythm:1"), rhythmBar("rhythm:2")]);
    let replaced;
    await importModel.applyPreparedSaveDataMergeEverywhere(
      storage, prepared, createLearningStorage((data, options) => {
        replaced = options.replaceRhythmSenseBars;
        assert.strictEqual(data.rhythmSenseBars.length, 2);
        return Promise.resolve({ saved: true, replacedScopes: 2, attemptCount: 2 });
      }),
      { readCurrentBackup(_storage, options) {
        assert.strictEqual(options.includeRhythmSenseBars, true);
        return Promise.resolve(currentBackup);
      } }
    );
    assert.strictEqual(replaced, true);
  });

  await test("rejects a stale Rhythm Sense merge preview before writing", async () => {
    const storage = createStorage({ options: stored({ language: "de" }) });
    const currentBackup = createCurrentDatabaseBackup();
    currentBackup.version = 4;
    currentBackup.data.rhythmSenseBars = [rhythmBar("rhythm:1")];
    const importedBackup = createImportedBackup();
    importedBackup.version = 4;
    importedBackup.data.rhythmSenseBars = [rhythmBar("rhythm:2")];
    const prepared = importModel.prepareSaveDataImport(
      storage, importedBackup, importModel.SAVE_DATA_IMPORT_MODES.merge,
      { currentBackup }
    );
    const changedBackup = JSON.parse(JSON.stringify(currentBackup));
    changedBackup.data.rhythmSenseBars.push(rhythmBar("rhythm:3"));
    const before = storage.dump();
    await assert.rejects(importModel.applyPreparedSaveDataMergeEverywhere(
      storage, prepared, createLearningStorage(() => {
        throw new Error("database replacement must not run");
      }), { readCurrentBackup: () => Promise.resolve(changedBackup) }
    ), /IndexedDB save data changed after the import preview/);
    assert.deepStrictEqual(storage.dump(), before);
  });

  await test("old backup replacement clears newer Rhythm Sense bars too", async () => {
    const storage = createStorage();
    const prepared = importModel.prepareSaveDataImport(
      storage, createImportedBackup(), importModel.SAVE_DATA_IMPORT_MODES.replace
    );
    let receivedOptions;
    await importModel.applyPreparedSaveDataReplaceEverywhere(
      storage, prepared, createLearningStorage((data, options) => {
        receivedOptions = options;
        assert.strictEqual(data.rhythmSenseBars, undefined);
        return Promise.resolve({ saved: true, replacedScopes: 2, attemptCount: 2 });
      })
    );
    assert.strictEqual(receivedOptions.replaceRhythmSenseBars, true);
  });

  await test("restores Note Flow rounds with replace and requires a database merge snapshot", async () => {
    const storage = createStorage({ options: stored({ language: "de" }) });
    const backup = createImportedBackup();
    backup.version = 3;
    backup.data.noteFlowRounds = {
      screen: [{ id: "flow-screen", settings: { inputMode: "button" } }],
      midi: [{ id: "flow-midi", settings: { inputMode: "midi" } }],
      chordMidi: [{ id: "flow-chord", exerciseType: "chord",
        settings: { inputMode: "midi" } }]
    };
    assert.throws(() => importModel.prepareSaveDataImport(
      storage, backup, importModel.SAVE_DATA_IMPORT_MODES.merge
    ), /complete Note Flow database snapshot/);
    const prepared = importModel.prepareSaveDataImport(
      storage, backup, importModel.SAVE_DATA_IMPORT_MODES.replace
    );
    assert.throws(() => importModel.applyPreparedSaveDataImport(
      storage, prepared
    ), /database-backed import/);
    let receivedData;
    let receivedOptions;
    const result = await importModel.applyPreparedSaveDataReplaceEverywhere(
      storage,
      prepared,
      createLearningStorage((data, options) => {
        receivedData = data;
        receivedOptions = options;
        return Promise.resolve({
          saved: true,
          replacedScopes: 2,
          attemptCount: 2,
          noteFlowRoundCount: 3
        });
      })
    );
    assert.strictEqual(result.noteFlowRoundCount, 3);
    assert.strictEqual(receivedOptions.replaceNoteFlowRounds, true);
    assert.deepStrictEqual(receivedData.noteFlowRounds, backup.data.noteFlowRounds);
  });

  await test("merges Note Flow rounds without replacing existing ids", async () => {
    const storage = createStorage({ options: stored({ language: "de" }) });
    const currentBackup = createCurrentDatabaseBackup();
    currentBackup.version = 3;
    currentBackup.data.noteFlowRounds = {
      screen: [{ id: "flow-existing", settings: { inputMode: "button" } }],
      midi: []
    };
    const importedBackup = createImportedBackup();
    importedBackup.version = 3;
    importedBackup.data.noteFlowRounds = {
      screen: [
        { id: "flow-existing", settings: { inputMode: "button" } },
        { id: "flow-new", settings: { inputMode: "keyboard" } }
      ],
      midi: [{ id: "flow-midi", settings: { inputMode: "midi" } }],
      chordMidi: [{ id: "flow-chord", exerciseType: "chord",
        settings: { inputMode: "midi" } }]
    };
    const prepared = importModel.prepareSaveDataImport(
      storage, importedBackup, importModel.SAVE_DATA_IMPORT_MODES.merge,
      { currentBackup }
    );
    assert.strictEqual(prepared.mergeReport.addedNoteFlowRounds, 3);
    assert.strictEqual(prepared.mergeReport.duplicateNoteFlowRounds, 1);
    let receivedOptions;
    const result = await importModel.applyPreparedSaveDataMergeEverywhere(
      storage, prepared,
      createLearningStorage((data, options) => {
        receivedOptions = options;
        assert.deepStrictEqual(data.noteFlowRounds.screen.map(round => round.id),
          ["flow-existing", "flow-new"]);
        assert.deepStrictEqual(data.noteFlowRounds.chordMidi.map(round => round.id),
          ["flow-chord"]);
        return Promise.resolve({ saved: true, replacedScopes: 2,
          attemptCount: 3, noteFlowRoundCount: 4 });
      }),
      { readCurrentBackup(_storage, options) {
        assert.strictEqual(options.includeNoteFlowRounds, true);
        return Promise.resolve(currentBackup);
      } }
    );
    assert.strictEqual(receivedOptions.replaceNoteFlowRounds, true);
    assert.strictEqual(result.noteFlowRoundCount, 4);
  });

  await test("aborts a Note Flow merge if rounds changed after the preview", async () => {
    const storage = createStorage({ options: stored({ language: "de" }) });
    const before = storage.dump();
    const currentBackup = createCurrentDatabaseBackup();
    currentBackup.version = 3;
    currentBackup.data.noteFlowRounds = { screen: [], midi: [] };
    const importedBackup = createImportedBackup();
    importedBackup.version = 3;
    importedBackup.data.noteFlowRounds = {
      screen: [{ id: "imported-flow", settings: { inputMode: "button" } }],
      midi: []
    };
    const prepared = importModel.prepareSaveDataImport(
      storage, importedBackup, importModel.SAVE_DATA_IMPORT_MODES.merge,
      { currentBackup }
    );
    const changedBackup = JSON.parse(JSON.stringify(currentBackup));
    changedBackup.data.noteFlowRounds.screen.push({
      id: "new-after-preview", settings: { inputMode: "button" }
    });
    let databaseCalled = false;
    await assert.rejects(importModel.applyPreparedSaveDataMergeEverywhere(
      storage, prepared,
      createLearningStorage(() => {
        databaseCalled = true;
        return Promise.resolve({ saved: true });
      }),
      { readCurrentBackup: () => Promise.resolve(changedBackup) }
    ), /changed after the import preview/);
    assert.strictEqual(databaseCalled, false);
    assert.deepStrictEqual(storage.dump(), before);
  });

  await test("keeps the previous local save if Note Flow replacement fails", async () => {
    const storage = createStorage({ options: stored({ language: "de" }) });
    const before = storage.dump();
    const backup = createImportedBackup();
    backup.version = 3;
    backup.data.noteFlowRounds = {
      screen: [{ id: "flow-screen", settings: { inputMode: "button" } }],
      midi: []
    };
    const prepared = importModel.prepareSaveDataImport(
      storage, backup, importModel.SAVE_DATA_IMPORT_MODES.replace
    );
    await assert.rejects(
      importModel.applyPreparedSaveDataReplaceEverywhere(
        storage,
        prepared,
        createLearningStorage(() => Promise.resolve({
          saved: false,
          error: new Error("simulated database failure")
        }))
      ),
      error => error.rollbackSucceeded === true
    );
    assert.deepStrictEqual(storage.dump(), before);
  });

  await test("replaces local and IndexedDB learning data together", async () => {
    const storage = createStorage({
      options: stored({ language: "de" }),
      adaptiveProgress: stored({
        version: 3,
        notes: { "treble:62:natural": learningRecord(3) }
      }),
      unrelated: "keep-me"
    });
    const prepared = importModel.prepareSaveDataImport(
      storage,
      createImportedBackup(),
      importModel.SAVE_DATA_IMPORT_MODES.replace
    );
    let importedData = null;
    const result = await importModel.applyPreparedSaveDataReplaceEverywhere(
      storage,
      prepared,
      createLearningStorage(data => {
        importedData = data;
        return Promise.resolve({
          saved: true,
          replacedScopes: 2,
          attemptCount: 2
        });
      })
    );
    assert.strictEqual(result.databaseReplaced, true);
    assert.strictEqual(result.replacedScopes, 2);
    assert.strictEqual(result.adaptiveAttemptCount, 2);
    assert.strictEqual(result.legacyHistoryCompacted, true);
    assert.strictEqual(importedData.adaptiveHistory.evaluations[0].id, "import-screen");
    assert.strictEqual(
      JSON.parse(storage.getItem("options")).data.language,
      "en"
    );
    assert.strictEqual(storage.getItem("unrelated"), "keep-me");
    assert.strictEqual(
      JSON.parse(storage.getItem("adaptiveHistory")).data.evaluations.length,
      0
    );
  });

  await test("restores every local app value when IndexedDB replacement fails", async () => {
    const storage = createStorage({
      options: stored({ language: "de" }),
      adaptiveProgress: stored({
        version: 3,
        notes: { "treble:62:natural": learningRecord(3) }
      }),
      "record__old": stored(75),
      unrelated: "keep-me"
    });
    const before = storage.dump();
    const prepared = importModel.prepareSaveDataImport(
      storage,
      createImportedBackup(),
      importModel.SAVE_DATA_IMPORT_MODES.replace
    );
    await assert.rejects(
      importModel.applyPreparedSaveDataReplaceEverywhere(
        storage,
        prepared,
        createLearningStorage(() => Promise.resolve({
          saved: false,
          error: new Error("simulated database failure")
        }))
      ),
      error => error.rollbackSucceeded === true
    );
    assert.deepStrictEqual(storage.dump(), before);
  });

  await test("does not touch IndexedDB when the local transaction fails", async () => {
    const storage = createStorage({
      options: stored({ language: "de" }),
      record: stored(25)
    });
    const before = storage.dump();
    const prepared = importModel.prepareSaveDataImport(
      storage,
      createImportedBackup(),
      importModel.SAVE_DATA_IMPORT_MODES.replace
    );
    let databaseCalled = false;
    storage.failNextSetFor("options");
    await assert.rejects(importModel.applyPreparedSaveDataReplaceEverywhere(
      storage,
      prepared,
      createLearningStorage(() => {
        databaseCalled = true;
        return Promise.resolve({ saved: true });
      })
    ));
    assert.strictEqual(databaseCalled, false);
    assert.deepStrictEqual(storage.dump(), before);
  });

  await test("keeps merge outside the replacement-only database path", async () => {
    const storage = createStorage();
    const prepared = importModel.prepareSaveDataImport(
      storage,
      createImportedBackup(),
      importModel.SAVE_DATA_IMPORT_MODES.merge
    );
    await assert.rejects(
      importModel.applyPreparedSaveDataReplaceEverywhere(
        storage,
        prepared,
        createLearningStorage(() => Promise.resolve({ saved: true }))
      ),
      /prepared replace import/
    );
  });

  await test("merges the full database-backed preview into local and IndexedDB data", async () => {
    const storage = createStorage({
      options: stored({ language: "de" }),
      unrelated: "keep-me"
    });
    const currentBackup = createCurrentDatabaseBackup();
    const prepared = importModel.prepareSaveDataImport(
      storage,
      createImportedBackup(),
      importModel.SAVE_DATA_IMPORT_MODES.merge,
      {
        currentBackup,
        createdAt: "2026-09-16T18:30:00.000Z"
      }
    );
    let mergedData = null;
    const result = await importModel.applyPreparedSaveDataMergeEverywhere(
      storage,
      prepared,
      createLearningStorage(data => {
        mergedData = data;
        return Promise.resolve({
          saved: true,
          replacedScopes: 2,
          attemptCount: 3
        });
      }),
      {
        readCurrentBackup() {
          return Promise.resolve(currentBackup);
        }
      }
    );

    assert.strictEqual(result.databaseReplaced, true);
    assert.strictEqual(result.adaptiveAttemptCount, 3);
    assert.deepStrictEqual(
      mergedData.adaptiveHistory.evaluations.map(value => value.id),
      ["current-screen", "import-screen"]
    );
    assert.strictEqual(
      mergedData.adaptiveHistoryMidi.evaluations[0].id,
      "import-midi"
    );
    assert.deepStrictEqual(
      JSON.parse(storage.getItem("adaptiveHistory")).data.evaluations,
      []
    );
    assert.strictEqual(result.legacyHistoryCompacted, true);
    assert.strictEqual(storage.getItem("unrelated"), "keep-me");
  });

  await test("aborts a merge when IndexedDB changed after the preview", async () => {
    const storage = createStorage({
      options: stored({ language: "de" }),
      unrelated: "keep-me"
    });
    const before = storage.dump();
    const currentBackup = createCurrentDatabaseBackup();
    const changedBackup = createCurrentDatabaseBackup();
    changedBackup.data.adaptiveHistory.evaluations.push(
      adaptiveHistory.createAdaptiveEvaluation({
        clef: "bass",
        staff: "piano",
        value: 48,
        isSharp: true
      }, true, 0, 700, {
        id: "late-database-attempt",
        completedAt: 1789550000500
      })
    );
    const prepared = importModel.prepareSaveDataImport(
      storage,
      createImportedBackup(),
      importModel.SAVE_DATA_IMPORT_MODES.merge,
      { currentBackup }
    );
    let databaseReplaced = false;

    await assert.rejects(
      importModel.applyPreparedSaveDataMergeEverywhere(
        storage,
        prepared,
        createLearningStorage(() => {
          databaseReplaced = true;
          return Promise.resolve({ saved: true });
        }),
        {
          readCurrentBackup() {
            return Promise.resolve(changedBackup);
          }
        }
      ),
      /IndexedDB save data changed after the import preview/
    );
    assert.strictEqual(databaseReplaced, false);
    assert.deepStrictEqual(storage.dump(), before);
  });

  await test("restores local data when the atomic merged database write fails", async () => {
    const storage = createStorage({
      options: stored({ language: "de" }),
      "record__old": stored(75),
      unrelated: "keep-me"
    });
    const before = storage.dump();
    const currentBackup = createCurrentDatabaseBackup();
    const prepared = importModel.prepareSaveDataImport(
      storage,
      createImportedBackup(),
      importModel.SAVE_DATA_IMPORT_MODES.merge,
      { currentBackup }
    );

    await assert.rejects(
      importModel.applyPreparedSaveDataMergeEverywhere(
        storage,
        prepared,
        createLearningStorage(() => Promise.resolve({
          saved: false,
          error: new Error("simulated merged database failure")
        })),
        {
          readCurrentBackup() {
            return Promise.resolve(currentBackup);
          }
        }
      ),
      error => error.rollbackSucceeded === true
    );
    assert.deepStrictEqual(storage.dump(), before);
  });

  await test("keeps the full local fallback when post-import compaction fails", async () => {
    const storage = createStorage({
      options: stored({ language: "de" })
    });
    const prepared = importModel.prepareSaveDataImport(
      storage,
      createImportedBackup(),
      importModel.SAVE_DATA_IMPORT_MODES.replace
    );
    let rememberedFailure = null;
    const learningStorage = createLearningStorage(() => Promise.resolve({
      saved: true,
      replacedScopes: 2,
      attemptCount: 2
    }));
    learningStorage.rememberRetryableFailure = (task, error) => {
      rememberedFailure = { task, error };
    };
    learningStorage.resolveRetryableFailure = () => {};
    storage.failSetAfter("adaptiveHistory", 2);

    const result = await importModel.applyPreparedSaveDataReplaceEverywhere(
      storage,
      prepared,
      learningStorage
    );
    assert.strictEqual(result.databaseReplaced, true);
    assert.strictEqual(result.legacyHistoryCompacted, false);
    assert(result.legacyHistoryCompactionError instanceof Error);
    assert.strictEqual(
      JSON.parse(storage.getItem("adaptiveHistory")).data.evaluations.length,
      1
    );
    assert.strictEqual(
      rememberedFailure.task.operation,
      "legacy-history-compaction"
    );
  });

  process.stdout.write("IndexedDB save-data import tests passed.\n");
})().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
