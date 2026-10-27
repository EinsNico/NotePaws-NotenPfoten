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
const mergeModel = loadEsModule(
  path.resolve(__dirname, "../src/model/SaveDataMerge.js")
);
const adaptiveHistory = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveHistory.js")
);
const adaptiveLearning = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveLearning.js")
);

function createBackup(values = {}, createdAt = "2026-09-09T12:30:00.000Z") {
  return backupModel.createSaveDataBackup(createStorage(values), {
    appVersion: "1.10.4",
    createdAt
  });
}

function createRound(id, score, completedAt) {
  return {
    schemaVersion: 1,
    id,
    completedAt,
    mode: "normal",
    score,
    accuracy: 80,
    numAnswers: 10,
    numCorrect: 8,
    numWrong: 2,
    settings: {
      durationSeconds: 60,
      difficulty: "normal",
      statisticsDifficulty: "normal",
      clefs: ["treble"],
      noteRange: { min: 48, max: 69 },
      clefRanges: [{ clef: "treble", min: 48, max: 69 }],
      clefTransition: null,
      accidentals: "no",
      inputMode: "button"
    }
  };
}

function createEvaluation(id, value, correctFirstTry, completedAt) {
  return adaptiveHistory.createAdaptiveEvaluation(
    { clef: "treble", staff: "treble", value, isSharp: true },
    correctFirstTry,
    correctFirstTry ? 0 : 2,
    correctFirstTry ? 700 : null,
    { id, completedAt }
  );
}

function createHistory(evaluations, baselineProgress) {
  const history = adaptiveHistory.createAdaptiveHistory(
    baselineProgress || adaptiveLearning.createAdaptiveProgress()
  );
  history.evaluations = evaluations;
  return history;
}

test("merges Note Flow screen and MIDI rounds by id without overwriting conflicts", () => {
  const current = createBackup();
  current.version = 3;
  current.data.noteFlowRounds = {
    screen: [{ id: "same", completedAt: "2026-09-20T10:00:00Z",
      score: { correct: 5 }, settings: { inputMode: "button" } }],
    midi: [{ id: "midi-existing", completedAt: "2026-09-20T10:01:00Z",
      settings: { inputMode: "midi" } }]
  };
  const imported = createBackup();
  imported.version = 3;
  imported.data.noteFlowRounds = {
    screen: [
      { id: "same", completedAt: "2026-09-20T10:00:00Z",
        score: { correct: 9 }, settings: { inputMode: "button" } },
      { id: "new-screen", completedAt: "2026-09-20T10:02:00Z",
        settings: { inputMode: "keyboard" } },
      { id: "midi-existing", completedAt: "2026-09-20T10:03:00Z",
        settings: { inputMode: "button" } }
    ],
    midi: [{ id: "new-midi", completedAt: "2026-09-20T10:04:00Z",
      settings: { inputMode: "midi" } }]
  };
  const first = mergeModel.mergeSaveDataBackups(current, imported);
  assert.strictEqual(first.report.addedNoteFlowRounds, 2);
  assert.strictEqual(first.report.conflictingNoteFlowRounds, 2);
  assert.strictEqual(first.backup.data.noteFlowRounds.screen[0].score.correct, 5);
  assert.strictEqual(backupModel.validateSaveDataBackup(first.backup).valid, true);
  const second = mergeModel.mergeSaveDataBackups(first.backup, imported);
  assert.strictEqual(second.report.addedNoteFlowRounds, 0);
  assert.strictEqual(second.report.duplicateNoteFlowRounds, 2);
});

test("merges chord rounds into an older v3 backup without mixing melody scopes", () => {
  const current = createBackup();
  current.version = 3;
  current.data.noteFlowRounds = {
    screen: [{ id: "shared", settings: { inputMode: "button" } }],
    midi: []
  };
  const imported = createBackup();
  imported.version = 3;
  imported.data.noteFlowRounds = {
    screen: [],
    midi: [],
    chordMidi: [
      { id: "shared", exerciseType: "chord", settings: { inputMode: "midi" } },
      { id: "new-chord", exerciseType: "chord", settings: { inputMode: "midi" } }
    ]
  };
  assert.strictEqual(backupModel.validateSaveDataBackup(current).valid, true);
  const first = mergeModel.mergeSaveDataBackups(current, imported);
  assert.deepStrictEqual(first.backup.data.noteFlowRounds.chordMidi.map(round => round.id),
    ["new-chord"]);
  assert.strictEqual(first.report.addedNoteFlowRounds, 1);
  assert.strictEqual(first.report.conflictingNoteFlowRounds, 1);
  assert.strictEqual(backupModel.validateSaveDataBackup(first.backup).valid, true);
  const second = mergeModel.mergeSaveDataBackups(first.backup, imported);
  assert.strictEqual(second.report.addedNoteFlowRounds, 0);
  assert.strictEqual(second.report.duplicateNoteFlowRounds, 1);
  const misplaced = JSON.parse(JSON.stringify(imported));
  misplaced.data.noteFlowRounds.midi.push(misplaced.data.noteFlowRounds.chordMidi.pop());
  assert.strictEqual(backupModel.validateSaveDataBackup(misplaced).valid, false);
});

test("merges normal rounds and adaptive evaluations once by identifier", () => {
  const sharedProgress = adaptiveLearning.updateAdaptiveProgress(
    adaptiveLearning.createAdaptiveProgress(),
    { clef: "bass", staff: "bass", value: 48, isSharp: true },
    true,
    0,
    800
  );
  const evaluationOne = createEvaluation("adaptive-1", 60, true, 1000);
  const evaluationTwo = createEvaluation("adaptive-2", 62, false, 2000);
  const current = createBackup({
    options: stored({ language: "de" }),
    adaptiveOptions: stored({ inputMode: "button" }),
    adaptiveProgress: stored(adaptiveHistory.rebuildAdaptiveProgress(
      createHistory([evaluationOne], sharedProgress)
    )),
    adaptiveHistory: stored(createHistory([evaluationOne], sharedProgress)),
    roundHistory: stored({
      version: 1,
      rounds: [createRound("round-1", 100, 1000)]
    })
  });
  const imported = createBackup({
    options: stored({ language: "en" }),
    adaptiveOptions: stored({ inputMode: "keyboard" }),
    adaptiveProgress: stored(adaptiveHistory.rebuildAdaptiveProgress(
      createHistory([evaluationOne, evaluationTwo], sharedProgress)
    )),
    adaptiveHistory: stored(
      createHistory([evaluationOne, evaluationTwo], sharedProgress)
    ),
    roundHistory: stored({
      version: 1,
      rounds: [
        createRound("round-1", 100, 1000),
        createRound("round-2", 120, 2000)
      ]
    })
  });

  const firstMerge = mergeModel.mergeSaveDataBackups(current, imported, {
    createdAt: "2026-09-09T13:00:00.000Z"
  });
  assert.strictEqual(firstMerge.report.addedNormalRounds, 1);
  assert.strictEqual(firstMerge.report.duplicateNormalRounds, 1);
  assert.strictEqual(firstMerge.report.addedAdaptiveEvaluations, 1);
  assert.strictEqual(firstMerge.report.duplicateAdaptiveEvaluations, 1);
  assert.strictEqual(firstMerge.report.duplicateAdaptiveBaselines, 1);
  assert.strictEqual(firstMerge.report.totalNormalRounds, 2);
  assert.deepStrictEqual(firstMerge.backup.data.roundHistory.rounds
    .map(round => round.prestigeEligible), [undefined, false]);
  assert.strictEqual(firstMerge.report.totalAdaptiveEvaluations, 2);
  assert.strictEqual(firstMerge.report.totalAdaptiveAttempts, 3);
  assert.deepStrictEqual(firstMerge.backup.data.options, { language: "de" });
  assert.deepStrictEqual(firstMerge.backup.data.adaptiveOptions, {
    inputMode: "button"
  });

  const secondMerge = mergeModel.mergeSaveDataBackups(
    firstMerge.backup,
    imported,
    { createdAt: "2026-09-09T13:30:00.000Z" }
  );
  assert.strictEqual(secondMerge.report.addedNormalRounds, 0);
  assert.strictEqual(secondMerge.report.conflictingNormalRounds, 0);
  assert.deepStrictEqual(secondMerge.backup.data.roundHistory.rounds
    .map(round => round.prestigeEligible), [undefined, false]);
  assert.strictEqual(secondMerge.report.addedAdaptiveEvaluations, 0);
  assert.strictEqual(secondMerge.report.totalNormalRounds, 2);
  assert.strictEqual(secondMerge.report.totalAdaptiveAttempts, 3);
});

test("merges screen and MIDI learning histories independently", () => {
  const screenCurrent = createHistory([
    createEvaluation("screen-current", 60, true, 1000)
  ]);
  const screenImported = createHistory([
    createEvaluation("screen-imported", 62, false, 2000)
  ]);
  const midiCurrent = createHistory([
    createEvaluation("midi-current", 64, true, 3000)
  ]);
  const midiImported = createHistory([
    createEvaluation("midi-imported", 65, false, 4000)
  ]);
  const current = createBackup({
    adaptiveProgress: stored(adaptiveHistory.rebuildAdaptiveProgress(screenCurrent)),
    adaptiveHistory: stored(screenCurrent),
    adaptiveProgressMidi: stored(adaptiveHistory.rebuildAdaptiveProgress(midiCurrent)),
    adaptiveHistoryMidi: stored(midiCurrent)
  });
  const imported = createBackup({
    adaptiveProgress: stored(adaptiveHistory.rebuildAdaptiveProgress(screenImported)),
    adaptiveHistory: stored(screenImported),
    adaptiveProgressMidi: stored(adaptiveHistory.rebuildAdaptiveProgress(midiImported)),
    adaptiveHistoryMidi: stored(midiImported)
  });

  const first = mergeModel.mergeSaveDataBackups(current, imported);
  assert.strictEqual(first.report.totalScreenAdaptiveAttempts, 2);
  assert.strictEqual(first.report.totalMidiAdaptiveAttempts, 2);
  assert.strictEqual(first.report.totalAdaptiveAttempts, 4);
  assert.deepStrictEqual(
    first.backup.data.adaptiveHistory.evaluations.map(value => value.id),
    ["screen-current", "screen-imported"]
  );
  assert.deepStrictEqual(
    first.backup.data.adaptiveHistoryMidi.evaluations.map(value => value.id),
    ["midi-current", "midi-imported"]
  );

  const second = mergeModel.mergeSaveDataBackups(first.backup, imported);
  assert.strictEqual(second.report.addedAdaptiveEvaluations, 0);
  assert.strictEqual(second.report.totalScreenAdaptiveAttempts, 2);
  assert.strictEqual(second.report.totalMidiAdaptiveAttempts, 2);
});

test("keeps current MIDI progress when merging a version-1 backup", () => {
  const midiHistory = createHistory([
    createEvaluation("midi-current", 64, true, 3000)
  ]);
  const current = createBackup({
    adaptiveProgressMidi: stored(adaptiveHistory.rebuildAdaptiveProgress(midiHistory)),
    adaptiveHistoryMidi: stored(midiHistory)
  });
  const importedLegacy = createBackup({
    adaptiveHistory: stored(createHistory([
      createEvaluation("legacy-screen", 60, true, 1000)
    ]))
  });
  importedLegacy.version = 1;
  delete importedLegacy.data.adaptiveProgressMidi;
  delete importedLegacy.data.adaptiveHistoryMidi;

  const result = mergeModel.mergeSaveDataBackups(current, importedLegacy);
  assert.strictEqual(result.report.totalScreenAdaptiveAttempts, 1);
  assert.strictEqual(result.report.totalMidiAdaptiveAttempts, 1);
  assert.strictEqual(
    result.backup.data.adaptiveHistoryMidi.evaluations[0].id,
    "midi-current"
  );
});

test("keeps current records on identifier conflicts and reports them", () => {
  const current = createBackup({
    roundHistory: stored({
      version: 1,
      rounds: [createRound("same-round", 100, 1000)]
    }),
    adaptiveHistory: stored(createHistory([
      createEvaluation("same-evaluation", 60, true, 1000)
    ]))
  });
  const imported = createBackup({
    roundHistory: stored({
      version: 1,
      rounds: [createRound("same-round", 999, 1000)]
    }),
    adaptiveHistory: stored(createHistory([
      createEvaluation("same-evaluation", 60, false, 1000)
    ]))
  });
  const result = mergeModel.mergeSaveDataBackups(current, imported);
  assert.strictEqual(result.report.conflictingNormalRounds, 1);
  assert.strictEqual(result.report.conflictingAdaptiveEvaluations, 1);
  assert.strictEqual(result.backup.data.roundHistory.rounds[0].score, 100);
  assert.strictEqual(
    result.backup.data.adaptiveHistory.evaluations[0].correctFirstTry,
    true
  );
});

test("keeps the highest record and handles old score lists idempotently", () => {
  const current = createBackup({
    lastScores: stored([10, 20]),
    record: stored(80),
    "lastScores__treble__normal__no": stored([30, 40]),
    "record__treble__normal__no": stored(90)
  });
  const imported = createBackup({
    lastScores: stored([10, 20, 30]),
    record: stored(120),
    "lastScores__treble__normal__no": stored([30]),
    "record__treble__normal__no": stored(110)
  });
  const first = mergeModel.mergeSaveDataBackups(current, imported);
  assert.deepStrictEqual(first.backup.data.statistics.legacyLastScores, [10, 20, 30]);
  assert.strictEqual(first.backup.data.statistics.legacyRecord, 120);
  assert.deepStrictEqual(
    first.backup.data.statistics.scoreEntries[0].value,
    [30, 40]
  );
  assert.strictEqual(first.backup.data.statistics.recordEntries[0].value, 110);

  const second = mergeModel.mergeSaveDataBackups(first.backup, imported);
  assert.deepStrictEqual(second.backup.data.statistics, first.backup.data.statistics);
});

test("deduplicates a pre-history adaptive backup against its migrated baseline", () => {
  const legacyProgress = adaptiveLearning.updateAdaptiveProgress(
    adaptiveLearning.createAdaptiveProgress(),
    { clef: "bass", staff: "bass", value: 48, isSharp: true },
    false,
    2
  );
  const currentHistory = adaptiveHistory.createAdaptiveHistory(legacyProgress);
  const current = createBackup({
    adaptiveProgress: stored(legacyProgress),
    adaptiveHistory: stored(currentHistory)
  });
  const importedLegacy = createBackup({
    adaptiveProgress: stored(legacyProgress)
  });
  const result = mergeModel.mergeSaveDataBackups(current, importedLegacy);
  assert.strictEqual(result.report.duplicateAdaptiveBaselines, 1);
  assert.strictEqual(result.report.totalAdaptiveAttempts, 1);
});

test("combines independent adaptive baselines including counters and timings", () => {
  const exercise = {
    clef: "treble",
    staff: "treble",
    value: 60,
    isSharp: true
  };
  const currentProgress = adaptiveLearning.updateAdaptiveProgress(
    adaptiveLearning.createAdaptiveProgress(),
    exercise,
    true,
    0,
    600
  );
  const importedProgress = adaptiveLearning.updateAdaptiveProgress(
    adaptiveLearning.createAdaptiveProgress(),
    exercise,
    false,
    2
  );
  const current = createBackup({
    adaptiveProgress: stored(currentProgress),
    adaptiveHistory: stored(adaptiveHistory.createAdaptiveHistory(currentProgress))
  });
  const imported = createBackup({
    adaptiveProgress: stored(importedProgress),
    adaptiveHistory: stored(adaptiveHistory.createAdaptiveHistory(importedProgress))
  });

  const first = mergeModel.mergeSaveDataBackups(current, imported);
  const record = first.backup.data.adaptiveProgress.notes["treble:60:natural"];
  assert.strictEqual(first.report.addedAdaptiveBaselines, 1);
  assert.strictEqual(first.report.totalAdaptiveAttempts, 2);
  assert.strictEqual(record.correctFirstTry, 1);
  assert.strictEqual(record.struggled, 1);
  assert.strictEqual(record.totalMistakes, 2);
  assert.strictEqual(record.timedAttempts, 1);
  assert.deepStrictEqual(record.recentResponseTimesMs, [600]);

  const second = mergeModel.mergeSaveDataBackups(first.backup, imported);
  assert.strictEqual(second.report.totalAdaptiveAttempts, 2);
  assert.strictEqual(second.report.addedAdaptiveBaselines, 0);
});

test("rejects a merge when either backup is invalid", () => {
  const current = createBackup();
  const imported = createBackup();
  imported.format = "foreign-save";
  assert.throws(
    () => mergeModel.mergeSaveDataBackups(current, imported),
    /Imported save data is invalid/
  );
});

process.stdout.write("Save-data merge tests passed.\n");
