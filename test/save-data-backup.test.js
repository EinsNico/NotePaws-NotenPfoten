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

const backupModel = loadEsModule(
  path.resolve(__dirname, "../src/model/SaveDataBackup.js")
);
const fileModel = loadEsModule(
  path.resolve(__dirname, "../src/model/SaveDataFiles.js")
);

function createCompleteStorage(options = { language: "de", clef: ["bass", "treble"] }) {
  return createStorage({
    options: stored(options),
    adaptiveOptions: stored({
      inputMode: "button",
      rangeExpansionEnabled: false
    }),
    adaptiveProgress: stored({
      version: 2,
      notes: {
        "treble:60:natural": { attempts: 3 },
        "bass:48:natural": { attempts: 2 }
      }
    }),
    adaptiveHistory: stored({
      version: 1,
      baselines: [],
      evaluations: [{
        schemaVersion: 1,
        id: "adaptive-1",
        completedAt: 1788960000000,
        noteKey: "treble:60:natural",
        exercise: {
          clef: "treble",
          staff: "treble",
          value: 60,
          isSharp: true
        },
        correctFirstTry: true,
        mistakeCount: 0,
        responseTimeMs: 750
      }]
    }),
    adaptiveProgressMidi: stored({
      version: 2,
      notes: {
        "piano-treble:64:natural": { attempts: 4 }
      }
    }),
    adaptiveHistoryMidi: stored({
      version: 1,
      baselines: [],
      evaluations: [{
        schemaVersion: 1,
        id: "adaptive-midi-1",
        completedAt: 1788960001000,
        noteKey: "piano-treble:64:natural",
        exercise: {
          clef: "treble",
          staff: "piano",
          value: 64,
          isSharp: true
        },
        correctFirstTry: true,
        mistakeCount: 0,
        responseTimeMs: 650
      }]
    }),
    roundHistory: stored({
      version: 1,
      rounds: [{ id: "round-1", completedAt: 1788960000000 }]
    }),
    lastScores: stored([12, 24]),
    record: stored(90),
    "lastScores__treble__normal__no": stored([45, 75]),
    "record__treble__normal__no": stored(75),
    unrelatedWebsiteValue: stored("must-not-be-exported")
  });
}

test("collects all Noten-Pfoten save areas but ignores unrelated storage", () => {
  const data = backupModel.collectSaveData(createCompleteStorage());
  assert.deepStrictEqual(data.options, {
    language: "de",
    clef: ["bass", "treble"]
  });
  assert.deepStrictEqual(data.adaptiveOptions, {
    inputMode: "button",
    rangeExpansionEnabled: false
  });
  assert.strictEqual(data.adaptiveHistory.evaluations[0].id, "adaptive-1");
  assert.strictEqual(
    data.adaptiveHistoryMidi.evaluations[0].id,
    "adaptive-midi-1"
  );
  assert.strictEqual(
    data.adaptiveProgressMidi.notes["piano-treble:64:natural"].attempts,
    4
  );
  assert.strictEqual(data.statistics.legacyRecord, 90);
  assert.deepStrictEqual(data.statistics.scoreEntries, [{
    storageKey: "lastScores__treble__normal__no",
    value: [45, 75]
  }]);
  assert.deepStrictEqual(data.statistics.recordEntries, [{
    storageKey: "record__treble__normal__no",
    value: 75
  }]);
  assert.strictEqual(JSON.stringify(data).indexOf("must-not-be-exported"), -1);
});

test("creates a deterministic versioned backup document", () => {
  const backup = backupModel.createSaveDataBackup(createCompleteStorage(), {
    appVersion: "1.10.4",
    createdAt: "2026-09-09T12:30:00.000Z"
  });
  assert.strictEqual(backup.format, "noten-pfoten-save-data");
  assert.strictEqual(backup.version, 2);
  assert.deepStrictEqual(backup.app, {
    name: "Noten-Pfoten",
    version: "1.10.4"
  });
  assert.strictEqual(backup.createdAt, "2026-09-09T12:30:00.000Z");
  assert.deepStrictEqual(backupModel.validateSaveDataBackup(backup), {
    valid: true,
    errors: []
  });
});

test("round-trips global sound and screen-awake preferences in old-format backups", () => {
  [true, false].forEach(keepScreenAwake => {
    const backup = backupModel.createSaveDataBackup(createCompleteStorage({
      sound: false,
      keepScreenAwake
    }));
    const parsed = backupModel.parseSaveDataBackup(JSON.stringify(backup));
    assert.strictEqual(parsed.valid, true);
    assert.strictEqual(parsed.backup.data.options.sound, false);
    assert.strictEqual(parsed.backup.data.options.keepScreenAwake, keepScreenAwake);
  });
  const invalid = backupModel.createSaveDataBackup(createCompleteStorage());
  invalid.data.options.keepScreenAwake = "false";
  assert.strictEqual(backupModel.validateSaveDataBackup(invalid).valid, false);
  invalid.data.options.keepScreenAwake = true;
  invalid.data.adaptiveOptions.keepScreenAwake = true;
  assert.strictEqual(backupModel.validateSaveDataBackup(invalid).valid, false);
});

test("round-trips preparation time without changing older backup versions", () => {
  [0, 3, 5].forEach(preparationSeconds => {
    const backup = backupModel.createSaveDataBackup(createCompleteStorage({ preparationSeconds }));
    const parsed = backupModel.parseSaveDataBackup(JSON.stringify(backup));
    assert.strictEqual(parsed.valid, true);
    assert.strictEqual(parsed.backup.version, 2);
    assert.strictEqual(parsed.backup.data.options.preparationSeconds, preparationSeconds);
  });
  const older = backupModel.createSaveDataBackup(createCompleteStorage());
  assert.strictEqual(backupModel.validateSaveDataBackup(older).valid, true, "backups without the field remain valid");
  for (const preparationSeconds of ["5", null, 2, -1, 60, true]) {
    const invalid = JSON.parse(JSON.stringify(older));
    invalid.data.options.preparationSeconds = preparationSeconds;
    assert.strictEqual(backupModel.validateSaveDataBackup(invalid).valid, false, "malformed backup preference is rejected");
  }
  older.data.adaptiveOptions.preparationSeconds = 3;
  assert.strictEqual(backupModel.validateSaveDataBackup(older).valid, false, "general setting is not duplicated in adaptive options");
});

test("validates version-4 rhythm bars without changing older backup versions", () => {
  const backup = backupModel.createSaveDataBackup(createCompleteStorage());
  backup.version = 4;
  backup.data.rhythmSenseBars = [{
    id: "session:bar:1", sessionId: "session", barNumber: 1,
    completedAt: "2026-09-28T12:00:00.000Z",
    settings: { meter: "4/4", bpm: 80 }, score: {}, timing: {},
    notes: [{ beat: 0, value: "quarter", result: "correct", offsetMs: 20 }]
  }];
  assert.strictEqual(backupModel.validateSaveDataBackup(backup).valid, true);
  assert.strictEqual(backupModel.normalizeSaveDataBackup(backup).version, 4);
  const missingBars = JSON.parse(JSON.stringify(backup));
  delete missingBars.data.rhythmSenseBars;
  assert.strictEqual(backupModel.validateSaveDataBackup(missingBars).valid, false);
  const duplicate = JSON.parse(JSON.stringify(backup));
  duplicate.data.rhythmSenseBars.push(duplicate.data.rhythmSenseBars[0]);
  assert.strictEqual(backupModel.validateSaveDataBackup(duplicate).valid, false);
  const older = JSON.parse(JSON.stringify(backup));
  older.version = 3;
  assert.strictEqual(backupModel.validateSaveDataBackup(older).valid, false);
});

test("creates and parses a readable local backup file", () => {
  const exported = fileModel.createSaveDataExport(createCompleteStorage(), {
    appVersion: "1.10.4",
    createdAt: "2026-09-09T12:30:45.123Z"
  });
  assert.strictEqual(
    exported.filename,
    "Noten-Pfoten-Speicherstand_2026-09-09_12-30-45Z.json"
  );
  assert.strictEqual(exported.mimeType, "application/json");
  assert.strictEqual(exported.text.endsWith("\n"), true);
  const parsed = fileModel.parseSaveDataFile(
    exported.text,
    Buffer.byteLength(exported.text)
  );
  assert.strictEqual(parsed.valid, true);
  assert.strictEqual(parsed.backup.app.version, "1.10.4");

  const tooLarge = fileModel.parseSaveDataFile(
    exported.text,
    fileModel.MAX_SAVE_DATA_FILE_SIZE_BYTES + 1
  );
  assert.deepStrictEqual(tooLarge.errors, ["file-too-large"]);
});

test("preflight rejects oversized unstreamed imports before reading their text", () => {
  const limit = fileModel.MAX_UNSTREAMED_IMPORT_SIZE_BYTES;
  assert.strictEqual(limit, 12 * 1024 * 1024);
  assert.strictEqual(fileModel.exceedsUnstreamedImportLimit(limit), false);
  assert.strictEqual(fileModel.exceedsUnstreamedImportLimit(limit + 1), true);
  assert.strictEqual(fileModel.exceedsUnstreamedImportLimit(null), false);
  assert.strictEqual(fileModel.exceedsUnstreamedImportLimit(51792582), true);
});

test("summarizes a valid backup for a later import preview", () => {
  const backup = backupModel.createSaveDataBackup(createCompleteStorage(), {
    appVersion: "1.10.4",
    createdAt: "2026-09-09T12:30:00.000Z"
  });
  assert.deepStrictEqual(backupModel.summarizeSaveDataBackup(backup), {
    createdAt: "2026-09-09T12:30:00.000Z",
    appVersion: "1.10.4",
    normalRounds: 1,
    practicedAdaptiveNotes: 3,
    adaptiveAttempts: 9,
    screenPracticedAdaptiveNotes: 2,
    screenAdaptiveAttempts: 5,
    midiPracticedAdaptiveNotes: 1,
    midiAdaptiveAttempts: 4,
    hasNormalOptions: true,
    hasAdaptiveOptions: true
  });
});

test("accepts and upgrades a version-1 backup without MIDI progress", () => {
  const legacyBackup = backupModel.createSaveDataBackup(createCompleteStorage(), {
    appVersion: "1.10.4",
    createdAt: "2026-09-09T12:30:00.000Z"
  });
  legacyBackup.version = 1;
  delete legacyBackup.data.adaptiveProgressMidi;
  delete legacyBackup.data.adaptiveHistoryMidi;

  assert.strictEqual(backupModel.validateSaveDataBackup(legacyBackup).valid, true);
  assert.strictEqual(
    backupModel.summarizeSaveDataBackup(legacyBackup).midiAdaptiveAttempts,
    0
  );
  const upgraded = backupModel.normalizeSaveDataBackup(legacyBackup);
  assert.strictEqual(upgraded.version, 2);
  assert.strictEqual(upgraded.data.adaptiveProgressMidi, null);
  assert.strictEqual(upgraded.data.adaptiveHistoryMidi, null);
});

test("preserves and summarizes the legacy round-history array format", () => {
  const legacyStorage = createCompleteStorage();
  const backup = backupModel.createSaveDataBackup(legacyStorage);
  backup.data.roundHistory = [{
    id: "legacy-round",
    completedAt: 1788960000000
  }];
  assert.strictEqual(backupModel.validateSaveDataBackup(backup).valid, true);
  assert.strictEqual(
    backupModel.summarizeSaveDataBackup(backup).normalRounds,
    1
  );
});

test("rejects invalid JSON, foreign backups and unsupported newer versions", () => {
  assert.deepStrictEqual(backupModel.parseSaveDataBackup("not json"), {
    valid: false,
    errors: [backupModel.BACKUP_VALIDATION_ERRORS.invalidJson],
    backup: null
  });

  const foreignBackup = backupModel.createSaveDataBackup(createCompleteStorage());
  foreignBackup.format = "some-other-app";
  assert.strictEqual(backupModel.validateSaveDataBackup(foreignBackup).valid, false);

  const newerBackup = backupModel.createSaveDataBackup(createCompleteStorage());
  newerBackup.version = backupModel.SAVE_DATA_BACKUP_VERSION + 1;
  assert.deepStrictEqual(
    backupModel.validateSaveDataBackup(newerBackup).errors,
    [backupModel.BACKUP_VALIDATION_ERRORS.newerVersion]
  );
});

test("rejects incomplete data and duplicate or foreign statistics keys", () => {
  const missingData = backupModel.createSaveDataBackup(createCompleteStorage());
  delete missingData.data.statistics;
  assert.strictEqual(backupModel.validateSaveDataBackup(missingData).valid, false);

  const missingMidiData = backupModel.createSaveDataBackup(createCompleteStorage());
  delete missingMidiData.data.adaptiveHistoryMidi;
  assert.strictEqual(
    backupModel.validateSaveDataBackup(missingMidiData).valid,
    false
  );

  const duplicateKey = backupModel.createSaveDataBackup(createCompleteStorage());
  duplicateKey.data.statistics.scoreEntries.push(
    duplicateKey.data.statistics.scoreEntries[0]
  );
  assert.strictEqual(backupModel.validateSaveDataBackup(duplicateKey).valid, false);

  const foreignKey = backupModel.createSaveDataBackup(createCompleteStorage());
  foreignKey.data.statistics.recordEntries[0].storageKey = "foreign-record";
  assert.strictEqual(backupModel.validateSaveDataBackup(foreignKey).valid, false);

  const duplicateEvaluation = backupModel.createSaveDataBackup(createCompleteStorage());
  duplicateEvaluation.data.adaptiveHistory.evaluations.push(
    duplicateEvaluation.data.adaptiveHistory.evaluations[0]
  );
  assert.strictEqual(
    backupModel.validateSaveDataBackup(duplicateEvaluation).valid,
    false
  );

  const unsafeOptions = backupModel.createSaveDataBackup(createCompleteStorage());
  unsafeOptions.data.options.saveOptions = null;
  assert.strictEqual(backupModel.validateSaveDataBackup(unsafeOptions).valid, false);

  const noteNamingOptions = backupModel.createSaveDataBackup(createCompleteStorage());
  noteNamingOptions.data.options.noteNaming = "international";
  assert.strictEqual(backupModel.validateSaveDataBackup(noteNamingOptions).valid, true);
  noteNamingOptions.data.options.noteNaming = "unknown";
  assert.strictEqual(backupModel.validateSaveDataBackup(noteNamingOptions).valid, false);

  const appVolumeOptions = backupModel.createSaveDataBackup(createCompleteStorage());
  appVolumeOptions.data.options.appVolume = 35;
  assert.strictEqual(backupModel.validateSaveDataBackup(appVolumeOptions).valid, true);
  appVolumeOptions.data.options.appVolume = 101;
  assert.strictEqual(backupModel.validateSaveDataBackup(appVolumeOptions).valid, false);

  const unsafeAdaptiveToggle = backupModel.createSaveDataBackup(
    createCompleteStorage()
  );
  unsafeAdaptiveToggle.data.adaptiveOptions.rangeExpansionEnabled = "false";
  assert.strictEqual(
    backupModel.validateSaveDataBackup(unsafeAdaptiveToggle).valid,
    false
  );
});

test("stops an export when an app value in storage is corrupted", () => {
  const storage = createCompleteStorage();
  const brokenStorage = createStorage({
    options: "not-json"
  });
  assert.throws(
    () => backupModel.createSaveDataBackup(brokenStorage),
    /not valid JSON/
  );
  assert.strictEqual(backupModel.validateSaveDataBackup(
    backupModel.createSaveDataBackup(storage)
  ).valid, true);
});

process.stdout.write("Save-data backup format tests passed.\n");
