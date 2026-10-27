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
  let failingRemoveKey = null;
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
        throw new Error("simulated rollback failure");
      }
      data[key] = String(value);
    },
    removeItem(key) {
      if (key === failingRemoveKey) {
        failingRemoveKey = null;
        throw new Error("simulated deletion failure");
      }
      delete data[key];
    },
    failNextRemoveFor(key) {
      failingRemoveKey = key;
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

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

async function asyncTest(name, body) {
  try {
    await body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

const resetModel = loadEsModule(
  path.resolve(__dirname, "../src/model/LearningDataReset.js")
);
const backupModel = loadEsModule(
  path.resolve(__dirname, "../src/model/SaveDataBackup.js")
);
const importModel = loadEsModule(
  path.resolve(__dirname, "../src/model/SaveDataImport.js")
);

test("deletes every normal and adaptive learning-data area", () => {
  const storage = createStorage({
    roundHistory: stored({ rounds: [{ id: "round-1" }] }),
    lastScores: stored([70, 80]),
    record: stored(80),
    "lastScores__treble__normal__no": stored([90]),
    "lastScores__bass__custom__no": "corrupted-score-data",
    "record__treble__normal__no": stored(90),
    adaptiveProgress: stored({ notes: { screen: { attempts: 4 } } }),
    adaptiveHistory: stored({ evaluations: [{ id: "screen-1" }] }),
    adaptiveProgressMidi: stored({ notes: { midi: { attempts: 3 } } }),
    adaptiveHistoryMidi: "corrupted-history-data",
    prestigeArchive: stored({ segments: [{ id: "prestige-1" }] })
  });

  const result = resetModel.deleteAllLearningData(storage);
  assert.strictEqual(result.deletedCount, 11);
  assert.strictEqual(result.requiresReload, true);
  result.deletedKeys.forEach(key => assert.strictEqual(storage.getItem(key), null));
});

test("preserves settings, interface preferences and unrelated storage", () => {
  const values = {
    options: stored({ language: "de", appVolume: 0.75 }),
    adaptiveOptions: stored({ inputMode: "button" }),
    uiRoundStatisticsOpen: stored(false),
    uiAdaptiveProgressOpen: stored(true),
    unrelated: "keep-me",
    roundHistory: stored({ rounds: [{ id: "round-1" }] })
  };
  const storage = createStorage(values);

  resetModel.deleteAllLearningData(storage);
  assert.strictEqual(storage.getItem("options"), values.options);
  assert.strictEqual(storage.getItem("adaptiveOptions"), values.adaptiveOptions);
  assert.strictEqual(storage.getItem("uiRoundStatisticsOpen"), values.uiRoundStatisticsOpen);
  assert.strictEqual(storage.getItem("uiAdaptiveProgressOpen"), values.uiAdaptiveProgressOpen);
  assert.strictEqual(storage.getItem("unrelated"), values.unrelated);
  assert.strictEqual(storage.getItem("roundHistory"), null);
});

test("can be repeated when no learning data remains", () => {
  const storage = createStorage({ options: stored({ language: "de" }) });
  const first = resetModel.deleteAllLearningData(storage);
  const second = resetModel.deleteAllLearningData(storage);
  assert.strictEqual(first.deletedCount, 0);
  assert.strictEqual(second.deletedCount, 0);
  assert.strictEqual(storage.getItem("options"), stored({ language: "de" }));
});

test("can restore deleted learning data from a previous backup", () => {
  const storage = createStorage({
    options: stored({ language: "de" }),
    roundHistory: stored({ version: 1, rounds: [] }),
    lastScores: stored([45, 85]),
    record: stored(85),
    "lastScores__treble__normal__no": stored([65, 95]),
    "record__treble__normal__no": stored(95)
  });
  const backup = backupModel.createSaveDataBackup(storage, {
    appVersion: "2.2.4",
    createdAt: "2026-09-16T12:00:00.000Z"
  });

  resetModel.deleteAllLearningData(storage);
  assert.strictEqual(storage.getItem("roundHistory"), null);
  importModel.importSaveData(
    storage,
    backup,
    importModel.SAVE_DATA_IMPORT_MODES.replace
  );

  assert.deepStrictEqual(
    JSON.parse(storage.getItem("roundHistory")).data,
    { version: 1, rounds: [] }
  );
  assert.deepStrictEqual(JSON.parse(storage.getItem("lastScores")).data, [45, 85]);
  assert.strictEqual(JSON.parse(storage.getItem("record")).data, 85);
  assert.deepStrictEqual(
    JSON.parse(storage.getItem("lastScores__treble__normal__no")).data,
    [65, 95]
  );
  assert.strictEqual(
    JSON.parse(storage.getItem("record__treble__normal__no")).data,
    95
  );
});

test("rolls every raw value back when deletion fails", () => {
  const storage = createStorage({
    roundHistory: "corrupted-round-data",
    lastScores: stored([40, 50]),
    record: stored(50),
    adaptiveProgress: stored({ notes: { screen: { attempts: 2 } } }),
    unrelated: "keep-me"
  });
  const before = storage.dump();
  storage.failNextRemoveFor("record");

  assert.throws(
    () => resetModel.deleteAllLearningData(storage),
    error => error.rollbackSucceeded === true
  );
  assert.deepStrictEqual(storage.dump(), before);
});

test("reports when both deletion and rollback fail", () => {
  const storage = createStorage({
    roundHistory: stored({ rounds: [{ id: "round-1" }] }),
    record: stored(50)
  });
  storage.failNextRemoveFor("record");
  storage.failNextSetFor("roundHistory");

  assert.throws(
    () => resetModel.deleteAllLearningData(storage),
    error => error.rollbackSucceeded === false
  );
});

(async () => {
  await asyncTest("clears local and IndexedDB learning data together", async () => {
    const storage = createStorage({
      roundHistory: stored({ rounds: [{ id: "round-1" }] }),
      adaptiveHistory: stored({ evaluations: [{ id: "answer-1" }] }),
      options: stored({ language: "de" })
    });
    let databaseCleared = false;
    const result = await resetModel.deleteAllLearningDataEverywhere(
      storage,
      () => {
        databaseCleared = true;
        return Promise.resolve({ saved: true });
      }
    );
    assert.strictEqual(databaseCleared, true);
    assert.strictEqual(result.databaseCleared, true);
    assert.strictEqual(storage.getItem("roundHistory"), null);
    assert.strictEqual(storage.getItem("adaptiveHistory"), null);
    assert.notStrictEqual(storage.getItem("options"), null);
  });

  await asyncTest("restores local data when IndexedDB deletion fails", async () => {
    const values = {
      roundHistory: stored({ rounds: [{ id: "round-1" }] }),
      adaptiveHistory: stored({ evaluations: [{ id: "answer-1" }] }),
      options: stored({ language: "de" })
    };
    const storage = createStorage(values);
    let error;
    try {
      await resetModel.deleteAllLearningDataEverywhere(
        storage,
        () => Promise.resolve({ saved: false, error: new Error("database busy") })
      );
    } catch (caughtError) {
      error = caughtError;
    }
    assert(error);
    assert.strictEqual(error.rollbackSucceeded, true);
    assert.deepStrictEqual(storage.dump(), values);
  });

  process.stdout.write("Learning-data reset transaction tests passed.\n");
})().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
