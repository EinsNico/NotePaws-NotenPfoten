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
      if (key === failingSetKey) {
        failingSetKey = null;
        throw new Error("simulated storage failure");
      }
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    failNextSetFor(key) {
      failingSetKey = key;
    },
    dump() {
      return Object.assign({}, data);
    }
  };
}

function stored(value) {
  return JSON.stringify({ data: value });
}

function readStored(storage, key) {
  const rawValue = storage.getItem(key);
  return rawValue === null ? null : JSON.parse(rawValue).data;
}

function test(name, body) {
  try {
    body();
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
    appVersion: "1.10.4",
    createdAt: "2026-09-09T12:30:00.000Z"
  });
}

test("requires database-backed import for rhythm backups without changing local data", () => {
  const storage = createStorage({ options: stored({ language: "de" }) });
  const backup = createBackup({ options: stored({ language: "en" }) });
  backup.version = 4;
  backup.data.rhythmSenseBars = [];
  const before = storage.dump();
  assert.throws(() => importModel.importSaveData(
    storage, backup, importModel.SAVE_DATA_IMPORT_MODES.merge
  ), /complete Rhythm Sense database snapshot/);
  assert.throws(() => importModel.importSaveData(
    storage, backup, importModel.SAVE_DATA_IMPORT_MODES.replace
  ), /database-backed import/);
  assert.deepStrictEqual(storage.dump(), before);
});

function createRound(id, score, completedAt) {
  return { id, score, completedAt };
}

function createEvaluation(id, completedAt, value) {
  return adaptiveHistory.createAdaptiveEvaluation({
    clef: "treble",
    staff: "piano",
    value,
    isSharp: true
  }, true, 0, 800, { id, completedAt });
}

function createLearningRecord() {
  return {
    attempts: 1,
    correctFirstTry: 1,
    struggled: 0,
    totalMistakes: 0,
    difficulty: 0.75,
    recentResults: [true],
    timedAttempts: 1,
    averageResponseTimeMs: 800,
    recentResponseTimesMs: [800]
  };
}

test("prepares a merge preview without changing local storage", () => {
  const storage = createStorage({
    options: stored({ language: "de" }),
    roundHistory: stored({
      version: 1,
      rounds: [createRound("round-current", 80, 1000)]
    }),
    unrelated: "keep-me"
  });
  const before = storage.dump();
  const imported = createBackup({
    options: stored({ language: "en" }),
    roundHistory: stored({
      version: 1,
      rounds: [createRound("round-imported", 120, 2000)]
    })
  });
  const prepared = importModel.prepareSaveDataImport(
    storage,
    imported,
    importModel.SAVE_DATA_IMPORT_MODES.merge,
    { createdAt: "2026-09-09T13:00:00.000Z" }
  );
  assert.deepStrictEqual(storage.dump(), before);
  assert.strictEqual(prepared.summary.current.normalRounds, 1);
  assert.strictEqual(prepared.summary.imported.normalRounds, 1);
  assert.strictEqual(prepared.summary.result.normalRounds, 2);
  assert.strictEqual(prepared.mergeReport.addedNormalRounds, 1);
  assert.deepStrictEqual(prepared.resultBackup.data.options, { language: "de" });
});

test("prepares a merge from the supplied IndexedDB-backed current save", () => {
  const storage = createStorage({
    options: stored({ language: "de" }),
    unrelated: "keep-me"
  });
  const before = storage.dump();
  const currentHistory = adaptiveHistory.createAdaptiveHistory();
  currentHistory.evaluations.push(createEvaluation(
    "current-database-attempt",
    1000,
    60
  ));
  const importedHistory = adaptiveHistory.createAdaptiveHistory();
  importedHistory.evaluations.push(createEvaluation(
    "imported-attempt",
    2000,
    62
  ));
  const currentBackup = createBackup({
    options: stored({ language: "de" }),
    adaptiveProgress: stored({
      version: 3,
      notes: { "treble:60:natural": createLearningRecord() }
    }),
    adaptiveHistory: stored(currentHistory)
  });
  const importedBackup = createBackup({
    options: stored({ language: "en" }),
    adaptiveProgress: stored({
      version: 3,
      notes: { "treble:62:natural": createLearningRecord() }
    }),
    adaptiveHistory: stored(importedHistory)
  });

  const prepared = importModel.prepareSaveDataImport(
    storage,
    importedBackup,
    importModel.SAVE_DATA_IMPORT_MODES.merge,
    {
      currentBackup,
      createdAt: "2026-09-16T18:30:00.000Z"
    }
  );

  assert.deepStrictEqual(storage.dump(), before);
  assert.strictEqual(prepared.summary.current.screenAdaptiveAttempts, 1);
  assert.strictEqual(prepared.summary.result.screenAdaptiveAttempts, 2);
  assert.deepStrictEqual(
    prepared.resultBackup.data.adaptiveHistory.evaluations.map(value => value.id),
    ["current-database-attempt", "imported-attempt"]
  );
});

test("applies a merge while preserving unrelated storage", () => {
  const storage = createStorage({
    options: stored({ language: "de" }),
    roundHistory: stored({
      version: 1,
      rounds: [createRound("round-current", 80, 1000)]
    }),
    unrelated: "keep-me"
  });
  const imported = createBackup({
    options: stored({ language: "en" }),
    roundHistory: stored({
      version: 1,
      rounds: [createRound("round-imported", 120, 2000)]
    })
  });
  const result = importModel.importSaveData(
    storage,
    imported,
    importModel.SAVE_DATA_IMPORT_MODES.merge,
    { createdAt: "2026-09-09T13:00:00.000Z" }
  );
  assert.strictEqual(result.requiresReload, true);
  assert.strictEqual(result.mergeReport.addedNormalRounds, 1);
  assert.deepStrictEqual(readStored(storage, "options"), { language: "de" });
  assert.strictEqual(readStored(storage, "roundHistory").rounds.length, 2);
  assert.deepStrictEqual(readStored(storage, "roundHistory").rounds
    .map(round => round.prestigeEligible), [undefined, false]);
  assert.strictEqual(storage.getItem("unrelated"), "keep-me");
});

test("replaces all app data and removes obsolete per-setting entries", () => {
  const storage = createStorage({
    options: stored({ language: "de" }),
    adaptiveOptions: stored({ inputMode: "button" }),
    "lastScores__old": stored([10, 20]),
    "record__old": stored(20),
    unrelated: "keep-me"
  });
  const imported = createBackup({
    options: stored({ language: "en" }),
    roundHistory: stored({ version: 1,
      rounds: [createRound("round-replaced", 90, 3000)] }),
    "lastScores__new": stored([30, 40]),
    "record__new": stored(40)
  });
  importModel.importSaveData(
    storage,
    imported,
    importModel.SAVE_DATA_IMPORT_MODES.replace
  );
  assert.deepStrictEqual(readStored(storage, "options"), { language: "en" });
  assert.strictEqual(readStored(storage, "roundHistory")
    .rounds[0].prestigeEligible, false);
  assert.strictEqual(storage.getItem("adaptiveOptions"), null);
  assert.strictEqual(storage.getItem("lastScores__old"), null);
  assert.strictEqual(storage.getItem("record__old"), null);
  assert.deepStrictEqual(readStored(storage, "lastScores__new"), [30, 40]);
  assert.strictEqual(readStored(storage, "record__new"), 40);
  assert.strictEqual(storage.getItem("unrelated"), "keep-me");
});

test("replaces both separated Learning Mode progress groups", () => {
  const storage = createStorage({
    adaptiveProgress: stored({ version: 2, notes: { oldScreen: { attempts: 1 } } }),
    adaptiveProgressMidi: stored({ version: 2, notes: { oldMidi: { attempts: 2 } } }),
    unrelated: "keep-me"
  });
  const imported = createBackup({
    adaptiveProgress: stored({ version: 2, notes: { newScreen: { attempts: 3 } } }),
    adaptiveProgressMidi: stored({ version: 2, notes: { newMidi: { attempts: 4 } } })
  });

  importModel.importSaveData(
    storage,
    imported,
    importModel.SAVE_DATA_IMPORT_MODES.replace
  );

  assert.strictEqual(readStored(storage, "adaptiveProgress").notes.newScreen.attempts, 3);
  assert.strictEqual(readStored(storage, "adaptiveProgressMidi").notes.newMidi.attempts, 4);
  assert.strictEqual(storage.getItem("unrelated"), "keep-me");
});

test("replaces with a version-1 backup and clears the absent MIDI group", () => {
  const storage = createStorage({
    adaptiveProgressMidi: stored({ version: 2, notes: { currentMidi: { attempts: 2 } } })
  });
  const legacyBackup = createBackup({
    adaptiveProgress: stored({ version: 2, notes: { legacyScreen: { attempts: 5 } } })
  });
  legacyBackup.version = 1;
  delete legacyBackup.data.adaptiveProgressMidi;
  delete legacyBackup.data.adaptiveHistoryMidi;

  const result = importModel.importSaveData(
    storage,
    legacyBackup,
    importModel.SAVE_DATA_IMPORT_MODES.replace
  );

  assert.strictEqual(result.requiresReload, true);
  assert.strictEqual(readStored(storage, "adaptiveProgress").notes.legacyScreen.attempts, 5);
  assert.strictEqual(storage.getItem("adaptiveProgressMidi"), null);
  assert.strictEqual(storage.getItem("adaptiveHistoryMidi"), null);
});

test("rolls every app value back if a storage write fails", () => {
  const storage = createStorage({
    options: stored({ language: "de" }),
    record: stored(25),
    "record__old": stored(20),
    unrelated: "keep-me"
  });
  const before = storage.dump();
  const imported = createBackup({
    options: stored({ language: "en" }),
    record: stored(100),
    "record__new": stored(90)
  });
  storage.failNextSetFor("record");
  assert.throws(
    () => importModel.importSaveData(
      storage,
      imported,
      importModel.SAVE_DATA_IMPORT_MODES.replace
    ),
    error => error.rollbackSucceeded === true
  );
  assert.deepStrictEqual(storage.dump(), before);
});

test("refuses to apply a stale preview if local progress changed", () => {
  const storage = createStorage({
    options: stored({ language: "de" }),
    unrelated: "keep-me"
  });
  const imported = createBackup({
    options: stored({ language: "en" })
  });
  const prepared = importModel.prepareSaveDataImport(
    storage,
    imported,
    importModel.SAVE_DATA_IMPORT_MODES.replace
  );
  storage.setItem("options", stored({ language: "de", sound: true }));
  const changed = storage.dump();
  assert.throws(
    () => importModel.applyPreparedSaveDataImport(storage, prepared),
    /changed after the import preview/
  );
  assert.deepStrictEqual(storage.dump(), changed);
});

test("allows replace mode to repair corrupted current app storage", () => {
  const storage = createStorage({
    options: "broken-json",
    "record__old": stored(25),
    unrelated: "keep-me"
  });
  const imported = createBackup({
    options: stored({ language: "en" }),
    record: stored(100)
  });
  const prepared = importModel.prepareSaveDataImport(
    storage,
    imported,
    importModel.SAVE_DATA_IMPORT_MODES.replace
  );
  assert.strictEqual(prepared.summary.current, null);
  const result = importModel.applyPreparedSaveDataImport(storage, prepared);
  assert.strictEqual(result.requiresReload, true);
  assert.deepStrictEqual(readStored(storage, "options"), { language: "en" });
  assert.strictEqual(readStored(storage, "record"), 100);
  assert.strictEqual(storage.getItem("record__old"), null);
  assert.strictEqual(storage.getItem("unrelated"), "keep-me");
});

test("rejects invalid backups and modes before writing anything", () => {
  const storage = createStorage({ options: stored({ language: "de" }) });
  const before = storage.dump();
  const invalid = createBackup();
  invalid.format = "foreign-save";
  assert.throws(
    () => importModel.importSaveData(
      storage,
      invalid,
      importModel.SAVE_DATA_IMPORT_MODES.replace
    ),
    /Imported save data is invalid/
  );
  assert.throws(
    () => importModel.importSaveData(storage, createBackup(), "unknown"),
    /Unknown save-data import mode/
  );
  assert.deepStrictEqual(storage.dump(), before);
});

process.stdout.write("Save-data import transaction tests passed.\n");
