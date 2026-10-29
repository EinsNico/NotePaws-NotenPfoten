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

const learning = loadEsModule(path.resolve(__dirname, "../src/model/AdaptiveLearning.js"));
const clefSelection = loadEsModule(path.resolve(__dirname, "../src/model/ClefSelection.js"));
const roundPause = loadEsModule(path.resolve(__dirname, "../src/model/RoundPause.js"));
const noteRanges = loadEsModule(path.resolve(__dirname, "../src/model/NoteRanges.js"));
const languageOptions = loadEsModule(
  path.resolve(__dirname, "../src/model/LanguageOptions.js")
);
const noteNaming = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteNaming.js")
);
const appVolume = loadEsModule(
  path.resolve(__dirname, "../src/model/AppVolume.js")
);
const germanStrings = loadEsModule(
  path.resolve(__dirname, "../src/resources/de.js")
).default;
const englishStrings = loadEsModule(
  path.resolve(__dirname, "../src/resources/en.js")
).default;

const localStorageData = {};
global.localStorage = {
  setItem(key, value) {
    localStorageData[key] = String(value);
  },
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(localStorageData, key)
      ? localStorageData[key]
      : null;
  },
  removeItem(key) {
    delete localStorageData[key];
  },
  clear() {
    Object.keys(localStorageData).forEach(key => delete localStorageData[key]);
  }
};

const adaptiveProgressModule = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveProgress.js")
);
const adaptiveProgress = adaptiveProgressModule.default;
const singleNotesLearningStorage = require(path.resolve(
  __dirname,
  "../src/model/SingleNotesLearningStorage.js"
)).default;
const storageTransition = loadEsModule(
  path.resolve(__dirname, "../src/model/SingleNotesStorageTransition.js")
);
const adaptiveHistory = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveHistory.js")
);
const adaptiveExercises = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveExercises.js")
);
const adaptiveProgressView = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveProgressView.js")
);
const adaptiveStatistics = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveStatistics.js")
);
const adaptiveRangeExpansion = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveRangeExpansion.js")
);
const adaptiveTrend = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveTrend.js")
);
const adaptiveLearningTime = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveLearningTime.js")
);
const adaptiveOptions = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveOptions.js")
).default;

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createExpansionOptions(overrides = {}) {
  return Object.assign({
    clef: ["treble"],
    customMinValue: 48,
    customMaxValue: 50,
    customTrebleMinValue: 48,
    customBassMaxValue: 48,
    accidentals: "no"
  }, overrides);
}

function masterExpansionSelection(options, responseTimeMs = 900) {
  let progress = learning.createAdaptiveProgress();
  adaptiveExercises.createAdaptiveCandidates(options).forEach(candidate => {
    for (
      let index = 0;
      index < adaptiveRangeExpansion.RANGE_EXPANSION_MIN_ATTEMPTS;
      index += 1
    ) {
      progress = learning.updateAdaptiveProgress(
        progress,
        candidate,
        true,
        0,
        responseTimeMs
      );
    }
  });
  return progress;
}

test("uses the combined normal bass and treble range as the custom default", () => {
  const normalBass = noteRanges.getNoteRange("bass", "normal");
  const normalTreble = noteRanges.getNoteRange("treble", "normal");
  assert.strictEqual(noteRanges.DEFAULT_CUSTOM_MIN_VALUE, normalBass.min);
  assert.strictEqual(noteRanges.DEFAULT_CUSTOM_MAX_VALUE, normalTreble.max);
  assert.strictEqual(noteRanges.DEFAULT_CUSTOM_TREBLE_MIN_VALUE, normalTreble.min);
  assert.strictEqual(noteRanges.DEFAULT_CUSTOM_BASS_MAX_VALUE, normalBass.max);
});

test("keeps bass and treble custom ranges independently valid", () => {
  assert.deepStrictEqual(
    noteRanges.getCustomRangeLimits(36, 60, 28, 72),
    { min: 36, max: 60, trebleMin: 28, bassMax: 72 }
  );
  assert.deepStrictEqual(
    noteRanges.getCustomRangeLimits(36, 60, 55, 48),
    { min: 36, max: 60, trebleMin: 55, bassMax: 48 }
  );
  assert.deepStrictEqual(
    noteRanges.getCustomPianoLimits(55, 48),
    { trebleMin: 55, bassMax: 48 }
  );
  assert.deepStrictEqual(
    noteRanges.getCustomRangeLimits(67, 45, 36, 81),
    { min: 67, max: 45, trebleMin: 36, bassMax: 81 }
  );
});

test("skips notes in a gap between bass and treble", () => {
  assert.deepStrictEqual(
    noteRanges.getEligibleCustomPianoClefs(48, 55, 48),
    ["bass"]
  );
  assert.deepStrictEqual(
    noteRanges.getEligibleCustomPianoClefs(52, 55, 48),
    []
  );
  assert.deepStrictEqual(
    noteRanges.getEligibleCustomPianoClefs(55, 55, 48),
    ["treble"]
  );
  assert.deepStrictEqual(
    noteRanges.getPlayableCustomNoteValues(47, 56, 55, 48),
    [47, 48, 55, 56]
  );
});

test("allows bass and treble to trade their usual keyboard positions", () => {
  assert.deepStrictEqual(
    noteRanges.getEligibleCustomPianoClefs(40, 36, 81, 67, 45),
    ["treble"]
  );
  assert.deepStrictEqual(
    noteRanges.getEligibleCustomPianoClefs(55, 36, 81, 67, 45),
    []
  );
  assert.deepStrictEqual(
    noteRanges.getEligibleCustomPianoClefs(72, 36, 81, 67, 45),
    ["bass"]
  );
  assert.deepStrictEqual(
    noteRanges.getPlayableCustomNoteValues(67, 45, 36, 81),
    [36, 37, 38, 39, 40, 41, 42, 43, 44, 45,
      67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81]
  );
});

test("enables range recommendations by default and persists the user's choice", () => {
  global.localStorage.clear();
  global.localStorage.setItem(
    "adaptiveOptions",
    JSON.stringify({ data: { inputMode: "button" } })
  );
  adaptiveOptions.rangeExpansionEnabled = false;
  adaptiveOptions.loadOptions();
  assert.strictEqual(adaptiveOptions.rangeExpansionEnabled, true);

  adaptiveOptions.rangeExpansionEnabled = false;
  adaptiveOptions.saveOptions();
  adaptiveOptions.rangeExpansionEnabled = true;
  adaptiveOptions.loadOptions();
  assert.strictEqual(adaptiveOptions.rangeExpansionEnabled, false);
});

test("enables only English and German without removing translation resources", () => {
  assert.deepStrictEqual(languageOptions.ENABLED_LANGUAGES, ["en", "de"]);
  assert.strictEqual(languageOptions.normalizeEnabledLanguage("en"), "en");
  assert.strictEqual(languageOptions.normalizeEnabledLanguage("de-DE"), "de");
  assert.strictEqual(languageOptions.normalizeEnabledLanguage(null, "de-AT"), "de");
  assert.strictEqual(languageOptions.normalizeEnabledLanguage(null, "en-GB"), "en");
  assert.strictEqual(languageOptions.normalizeEnabledLanguage(null, "fr-FR"), "en");
  assert.strictEqual(languageOptions.normalizeEnabledLanguage(null, null), "en");
  assert.strictEqual(languageOptions.normalizeEnabledLanguage("fr", "en-GB"), "en");
  assert.strictEqual(languageOptions.normalizeEnabledLanguage("de", "en-US"), "de");
  assert.strictEqual(languageOptions.normalizeEnabledLanguage("en", "de-DE"), "en");
});

test("formats German and international note names independently of the interface language", () => {
  assert.strictEqual(noteNaming.normalizeNoteNaming(null, "de"), "german");
  assert.strictEqual(noteNaming.normalizeNoteNaming(null, "en"), "international");
  assert.strictEqual(noteNaming.normalizeNoteNaming("international", "de"), "international");
  assert.strictEqual(noteNaming.formatDisplayNoteName(11, true, "german"), "H");
  assert.strictEqual(noteNaming.formatDisplayNoteName(10, false, "german"), "B");
  assert.strictEqual(noteNaming.formatDisplayNoteName(11, true, "international"), "B");
  assert.strictEqual(noteNaming.formatDisplayNoteName(10, false, "international"), "B♭");
  assert.strictEqual(noteNaming.formatDisplayNoteName(1, true, "german"), "Cis");
  assert.strictEqual(noteNaming.formatDisplayNoteName(1, true, "international"), "C♯");
  assert.strictEqual(noteNaming.formatOctaveMarker(1, "german"), "C₁");
  assert.strictEqual(noteNaming.formatOctaveMarker(2, "german"), "C");
  assert.strictEqual(noteNaming.formatOctaveMarker(3, "german"), "c");
  assert.strictEqual(noteNaming.formatOctaveMarker(4, "german"), "c′");
  assert.strictEqual(noteNaming.formatOctaveMarker(5, "german"), "c′′");
  assert.strictEqual(noteNaming.formatOctaveMarker(4, "international"), "C4");
  assert.strictEqual(noteNaming.formatOctaveMarker(null, "german"), "");
});

test("normalizes the global app volume and converts it for HTML audio", () => {
  assert.strictEqual(appVolume.normalizeAppVolume(undefined), 100);
  assert.strictEqual(appVolume.normalizeAppVolume(-20), 0);
  assert.strictEqual(appVolume.normalizeAppVolume(35.4), 35);
  assert.strictEqual(appVolume.normalizeAppVolume(140), 100);
  assert.strictEqual(appVolume.appVolumeToAudioLevel(0), 0);
  assert.strictEqual(appVolume.appVolumeToAudioLevel(35), 0.35);
  assert.strictEqual(appVolume.appVolumeToAudioLevel(100), 1);
});

test("keeps the enabled German and English translations aligned", () => {
  assert.deepStrictEqual(
    Object.keys(germanStrings).sort(),
    Object.keys(englishStrings).sort()
  );
  assert.strictEqual(germanStrings.buttons, "Tasten");
  assert.strictEqual(germanStrings.SOUND, "TON");
  assert.strictEqual(germanStrings.RESTART_MIDI, "MIDI neu verbinden");
  assert.strictEqual(englishStrings.RESTART_MIDI, "Reconnect MIDI");
  assert.strictEqual(germanStrings.APP_EXTERNAL_NAME, "Noten Pfoten");
  assert.strictEqual(englishStrings.APP_EXTERNAL_NAME, "Note Paws");
  assert(germanStrings.APP_INFO_PRIVACY_NO_CLOUD_BACKUP.indexOf("Cloud") !== -1);
  assert(englishStrings.APP_INFO_PRIVACY_NO_CLOUD_BACKUP.indexOf("cloud") !== -1);
  assert(germanStrings.APP_INFO_MAINTAINED.indexOf("EinsNico") !== -1);
  assert(germanStrings.APP_INFO_ORIGINAL_PROJECT.indexOf("MelvilQ") !== -1);
  assert(englishStrings.APP_INFO_MAINTAINED.indexOf("EinsNico") !== -1);
  assert(englishStrings.APP_INFO_ORIGINAL_PROJECT.indexOf("MelvilQ") !== -1);
});

test("migrates only the previous untouched custom defaults", () => {
  const legacy = noteRanges.migrateLegacyCustomDefaults({
    customMinValue: 48,
    customMaxValue: 60,
    customTrebleMinValue: 36,
    customBassMaxValue: 60
  });
  assert.strictEqual(legacy.migrated, true);
  assert.strictEqual(legacy.options.customMinValue, 28);
  assert.strictEqual(legacy.options.customMaxValue, 69);
  assert.strictEqual(legacy.options.customTrebleMinValue, 48);
  assert.strictEqual(legacy.options.customBassMaxValue, 48);

  const customized = noteRanges.migrateLegacyCustomDefaults({
    customMinValue: 36,
    customMaxValue: 72,
    customTrebleMinValue: 40,
    customBassMaxValue: 62
  });
  assert.strictEqual(customized.options.customMinValue, 36);
  assert.strictEqual(customized.options.customMaxValue, 72);
  assert.strictEqual(customized.options.customTrebleMinValue, 40);
  assert.strictEqual(customized.options.customBassMaxValue, 62);
});

test("separates the same pitch by clef", () => {
  assert.notStrictEqual(
    learning.createNoteLearningKey({ clef: "treble", value: 60, isSharp: true }),
    learning.createNoteLearningKey({ clef: "bass", value: 60, isSharp: true })
  );
});

test("shares piano staff results with the matching screen clef", () => {
  assert.strictEqual(
    learning.createNoteLearningKey({ clef: "treble", staff: "treble", value: 60 }),
    learning.createNoteLearningKey({ clef: "treble", staff: "piano", value: 60 })
  );
});

test("merges legacy piano-prefixed progress into the shared clef record", () => {
  const normalized = learning.normalizeAdaptiveProgress({
    version: 2,
    notes: {
      "treble:60:natural": {
        attempts: 2,
        correctFirstTry: 2,
        difficulty: 0.5,
        recentResults: [true, true]
      },
      "piano-treble:60:natural": {
        attempts: 1,
        correctFirstTry: 0,
        struggled: 1,
        totalMistakes: 2,
        difficulty: 1.9,
        recentResults: [false]
      }
    }
  });
  assert.strictEqual(normalized.version, 3);
  assert.deepStrictEqual(Object.keys(normalized.notes), ["treble:60:natural"]);
  assert.strictEqual(normalized.notes["treble:60:natural"].attempts, 3);
  assert.strictEqual(normalized.notes["treble:60:natural"].correctFirstTry, 2);
  assert.strictEqual(normalized.notes["treble:60:natural"].totalMistakes, 2);
  assert.strictEqual(normalized.notes["treble:60:natural"].difficulty, 0.967);
});

test("separates sharp and flat spellings but not natural notes", () => {
  assert.notStrictEqual(
    learning.createNoteLearningKey({ clef: "treble", value: 61, isSharp: true }),
    learning.createNoteLearningKey({ clef: "treble", value: 61, isSharp: false })
  );
  assert.strictEqual(
    learning.createNoteLearningKey({ clef: "treble", value: 60, isSharp: true }),
    learning.createNoteLearningKey({ clef: "treble", value: 60, isSharp: false })
  );
});

test("raises difficulty strongly after a mistake and lowers it slowly after success", () => {
  const initial = learning.createAdaptiveRecord();
  const failed = learning.updateAdaptiveRecord(initial, false, 2);
  const recovered = learning.updateAdaptiveRecord(failed, true);
  assert.strictEqual(failed.difficulty, 1.9);
  assert.strictEqual(failed.totalMistakes, 2);
  assert.strictEqual(recovered.difficulty, 1.78);
  assert.strictEqual(recovered.correctFirstTry, 1);
});

test("lets a sustained correct streak recover an older mistake", () => {
  let record = learning.updateAdaptiveRecord(
    learning.createAdaptiveRecord(),
    false,
    1
  );
  for (let index = 0; index < 6; index += 1) {
    record = learning.updateAdaptiveRecord(record, true);
  }
  assert.strictEqual(record.difficulty, 0.88);
  assert(record.difficulty < 1.9 - 6 * learning.CORRECT_DIFFICULTY_DECREASE);
});

test("uses recent accuracy to help a formerly difficult note recover", () => {
  const recentResults = [
    false, true, true, true, true,
    true, true, false, true, true,
    true, true, true, true, false,
    true, true, true, true, true
  ];
  assert.strictEqual(learning.getCorrectDifficultyDecrease(recentResults), 0.25);
});

test("caps difficulty in both directions", () => {
  let record = learning.createAdaptiveRecord();
  for (let index = 0; index < 20; index += 1) {
    record = learning.updateAdaptiveRecord(record, false);
  }
  assert.strictEqual(record.difficulty, learning.MAX_DIFFICULTY);
  for (let index = 0; index < 100; index += 1) {
    record = learning.updateAdaptiveRecord(record, true);
  }
  assert.strictEqual(record.difficulty, learning.MIN_DIFFICULTY);
});

test("stores only the most recent result window", () => {
  let record = learning.createAdaptiveRecord();
  for (let index = 0; index < learning.MAX_RECENT_RESULTS + 5; index += 1) {
    record = learning.updateAdaptiveRecord(record, index % 2 === 0);
  }
  assert.strictEqual(record.recentResults.length, learning.MAX_RECENT_RESULTS);
});

test("migrates old progress records to the response-time schema", () => {
  const normalized = learning.normalizeAdaptiveRecord({
    attempts: 4,
    correctFirstTry: 3,
    difficulty: 0.8,
    recentResults: [true, true, false, true]
  });
  assert.strictEqual(normalized.timedAttempts, 0);
  assert.strictEqual(normalized.averageResponseTimeMs, null);
  assert.deepStrictEqual(normalized.recentResponseTimesMs, []);
});

test("stores valid first-try response times and ignores timing on mistakes", () => {
  let record = learning.createAdaptiveRecord();
  record = learning.updateAdaptiveRecord(record, true, 0, 800);
  record = learning.updateAdaptiveRecord(record, true, 0, 1000);
  record = learning.updateAdaptiveRecord(record, false, 1, 500);
  assert.strictEqual(record.timedAttempts, 2);
  assert.strictEqual(record.averageResponseTimeMs, 900);
  assert.deepStrictEqual(record.recentResponseTimesMs, [800, 1000]);
});

test("rejects response-time outliers", () => {
  assert.strictEqual(learning.normalizeResponseTimeMs(149), null);
  assert.strictEqual(learning.normalizeResponseTimeMs(150), 150);
  assert.strictEqual(learning.normalizeResponseTimeMs(15000), 15000);
  assert.strictEqual(learning.normalizeResponseTimeMs(15001), null);
});

test("keeps only recent response times while retaining the total count", () => {
  let record = learning.createAdaptiveRecord();
  for (let index = 0; index < learning.MAX_RECENT_RESPONSE_TIMES + 4; index += 1) {
    record = learning.updateAdaptiveRecord(record, true, 0, 600 + index * 10);
  }
  assert.strictEqual(record.timedAttempts, learning.MAX_RECENT_RESPONSE_TIMES + 4);
  assert.strictEqual(record.recentResponseTimesMs.length, learning.MAX_RECENT_RESPONSE_TIMES);
  assert.strictEqual(record.recentResponseTimesMs[0], 640);
});

test("response time waits for enough personal and per-note samples", () => {
  let record = learning.createAdaptiveRecord();
  record = learning.updateAdaptiveRecord(record, true, 0, 500);
  record = learning.updateAdaptiveRecord(record, true, 0, 500);
  assert.strictEqual(learning.getResponseTimeFactor(record, 1000), 1);
  record = learning.updateAdaptiveRecord(record, true, 0, 500);
  assert.strictEqual(learning.getResponseTimeFactor(record, 1000), 0.8);
});

test("slow correct notes receive at most a 25 percent timing boost", () => {
  const fast = { clef: "treble", value: 60 };
  const slow = { clef: "treble", value: 62 };
  let progress = learning.createAdaptiveProgress();
  for (let index = 0; index < 4; index += 1) {
    progress = learning.updateAdaptiveProgress(progress, fast, true, 0, 600);
    progress = learning.updateAdaptiveProgress(progress, slow, true, 0, 1800);
  }
  assert.strictEqual(learning.getPersonalResponseTimeBaseline(progress), 1200);
  assert.strictEqual(
    learning.getResponseTimeFactor(progress.notes[learning.createNoteLearningKey(fast)], 1200),
    0.8
  );
  assert.strictEqual(
    learning.getResponseTimeFactor(progress.notes[learning.createNoteLearningKey(slow)], 1200),
    1.25
  );
  assert(learning.getAdaptiveWeight(progress, slow) > learning.getAdaptiveWeight(progress, fast));
});

test("uses the uniform exploration branch when requested", () => {
  const candidates = [
    { clef: "treble", value: 60 },
    { clef: "treble", value: 62 },
    { clef: "treble", value: 64 }
  ];
  const values = [0.1, 0.8];
  const selected = learning.selectAdaptiveCandidate(candidates, null, {
    explorationRate: 0.28,
    random: () => values.shift()
  });
  assert.strictEqual(selected.value, 64);
});

test("starts with an even distribution for notes without learning data", () => {
  const candidates = [
    { clef: "treble", value: 60 },
    { clef: "treble", value: 62 },
    { clef: "treble", value: 64 }
  ];
  const counts = { 60: 0, 62: 0, 64: 0 };
  const random = createSeededRandom(42);
  for (let index = 0; index < 6000; index += 1) {
    const selected = learning.selectAdaptiveCandidate(candidates, null, { random });
    counts[selected.value] += 1;
  }
  Object.keys(counts).forEach(value => {
    assert(counts[value] > 1800 && counts[value] < 2200, JSON.stringify(counts));
  });
});

test("prioritizes an unseen note over an already successful note", () => {
  const practiced = { clef: "treble", value: 60 };
  const unseen = { clef: "treble", value: 62 };
  const progress = learning.updateAdaptiveProgress(
    learning.createAdaptiveProgress(),
    practiced,
    true
  );
  const counts = { practiced: 0, unseen: 0 };
  const random = createSeededRandom(20260909);
  for (let index = 0; index < 6000; index += 1) {
    const selected = learning.selectAdaptiveCandidate(
      [practiced, unseen],
      progress,
      { random }
    );
    counts[selected.value === unseen.value ? "unseen" : "practiced"] += 1;
  }
  assert(
    counts.unseen > counts.practiced,
    JSON.stringify(counts)
  );
});

test("keeps new notes reinforced until they have enough attempts", () => {
  const note = { clef: "treble", value: 60 };
  let progress = learning.createAdaptiveProgress();
  const weights = [learning.getAdaptiveWeight(progress, note)];
  for (let index = 0; index < learning.MIN_CONSOLIDATION_ATTEMPTS; index += 1) {
    progress = learning.updateAdaptiveProgress(progress, note, true, 0, 5000);
    weights.push(learning.getAdaptiveWeight(progress, note));
  }
  assert.deepStrictEqual(weights, [1.6, 1.4, 1.15, 0.9, 0.65, 0.4]);
});

test("a single slow success stays much more prominent than a mastered note", () => {
  const recent = { clef: "treble", value: 60 };
  const mastered = { clef: "treble", value: 62 };
  let progress = learning.createAdaptiveProgress();
  progress = learning.updateAdaptiveProgress(progress, recent, true, 0, 12000);
  for (let index = 0; index < 10; index += 1) {
    progress = learning.updateAdaptiveProgress(progress, mastered, true, 0, 700);
  }

  const recentWeight = learning.getAdaptiveWeight(progress, recent);
  const masteredWeight = learning.getAdaptiveWeight(progress, mastered);
  assert.strictEqual(recentWeight, 1.4);
  assert.strictEqual(masteredWeight, learning.MIN_DIFFICULTY);
  assert(recentWeight > masteredWeight * 3);

  const counts = { recent: 0, mastered: 0 };
  const random = createSeededRandom(20260910);
  for (let index = 0; index < 5000; index += 1) {
    const selected = learning.selectAdaptiveCandidate(
      [recent, mastered],
      progress,
      { random }
    );
    counts[selected.value === recent.value ? "recent" : "mastered"] += 1;
  }
  assert(counts.recent > counts.mastered * 2, JSON.stringify(counts));
});

test("keeps a proven problem note above an unseen note", () => {
  const difficult = { clef: "bass", value: 48 };
  const unseen = { clef: "bass", value: 50 };
  const progress = learning.updateAdaptiveProgress(
    learning.createAdaptiveProgress(),
    difficult,
    false,
    1
  );
  assert.strictEqual(
    learning.getAdaptiveWeight(progress, unseen),
    learning.UNSEEN_NOTE_WEIGHT
  );
  assert(
    learning.getAdaptiveWeight(progress, difficult)
      > learning.getAdaptiveWeight(progress, unseen)
  );
});

test("selects difficult notes more often without losing easy notes", () => {
  const easy = { clef: "treble", value: 60 };
  const difficult = { clef: "treble", value: 62 };
  let progress = learning.createAdaptiveProgress();
  for (let index = 0; index < 10; index += 1) {
    progress = learning.updateAdaptiveProgress(progress, easy, true);
    progress = learning.updateAdaptiveProgress(progress, difficult, false);
  }
  const counts = { 60: 0, 62: 0 };
  const random = createSeededRandom(20260908);
  for (let index = 0; index < 5000; index += 1) {
    const selected = learning.selectAdaptiveCandidate([easy, difficult], progress, { random });
    counts[selected.value] += 1;
  }
  assert(counts[62] > counts[60] * 2.5, JSON.stringify(counts));
  assert(counts[60] > 500, JSON.stringify(counts));
});

test("avoids an immediate repeat when another candidate exists", () => {
  const first = { clef: "bass", value: 48 };
  const second = { clef: "bass", value: 50 };
  const selected = learning.selectAdaptiveCandidate([first, second], null, {
    previousKey: learning.createNoteLearningKey(first),
    random: () => 0
  });
  assert.strictEqual(selected.value, second.value);
});

test("avoids repeating the same pitch with a different spelling", () => {
  const previous = { clef: "treble", value: 61, isSharp: true };
  const enharmonicRepeat = { clef: "treble", value: 61, isSharp: false };
  const differentPitch = { clef: "treble", value: 62, isSharp: true };
  const selected = learning.selectAdaptiveCandidate(
    [enharmonicRepeat, differentPitch],
    null,
    { previousValue: previous.value, random: () => 0 }
  );
  assert.strictEqual(selected.value, differentPitch.value);
});

test("uses a longer cooldown for secure notes", () => {
  const secure = { clef: "treble", value: 60 };
  const alternatives = [
    { clef: "treble", value: 62 },
    { clef: "treble", value: 64 },
    { clef: "treble", value: 65 }
  ];
  const candidates = [secure].concat(alternatives);
  let progress = learning.createAdaptiveProgress();
  candidates.forEach(candidate => {
    for (let index = 0; index < 8; index += 1) {
      progress = learning.updateAdaptiveProgress(progress, candidate, true);
    }
  });
  assert.strictEqual(
    learning.getAdaptiveCooldownLength(progress, secure),
    learning.MAX_ADAPTIVE_COOLDOWN_LENGTH
  );

  const selected = learning.selectAdaptiveCandidate(
    candidates,
    progress,
    {
      recentValues: [60, 62, 64],
      previousValue: 64,
      explorationRate: 0,
      random: () => 0
    }
  );
  assert.strictEqual(selected.value, 65);
});

test("lets a very difficult note return after one intervening pitch", () => {
  const difficult = { clef: "bass", value: 48 };
  const intervening = { clef: "bass", value: 50 };
  let progress = learning.createAdaptiveProgress();
  for (let index = 0; index < 4; index += 1) {
    progress = learning.updateAdaptiveProgress(progress, difficult, false);
  }
  assert.strictEqual(
    learning.getAdaptiveCooldownLength(progress, difficult),
    learning.VERY_HARD_ADAPTIVE_COOLDOWN_LENGTH
  );
  const selected = learning.selectAdaptiveCandidate(
    [difficult, intervening],
    progress,
    {
      recentValues: [48, 50],
      previousValue: 50,
      explorationRate: 0,
      random: () => 0
    }
  );
  assert.strictEqual(selected.value, 48);
});

test("creates only natural-note candidates when accidentals are disabled", () => {
  const candidates = adaptiveExercises.createAdaptiveCandidates({
    clef: ["treble"],
    customMinValue: 48,
    customMaxValue: 60,
    accidentals: "no"
  });
  assert.strictEqual(candidates.length, 8);
  assert(candidates.every(candidate => ![1, 3, 6, 8, 10].includes(candidate.value % 12)));
});

test("treats sharp and flat spellings as separate adaptive candidates", () => {
  const candidates = adaptiveExercises.createAdaptiveCandidates({
    clef: ["treble"],
    customMinValue: 48,
    customMaxValue: 50,
    accidentals: "sharpAndFlat"
  });
  const accidentalCandidates = candidates.filter(candidate => candidate.value === 49);
  assert.strictEqual(candidates.length, 4);
  assert.deepStrictEqual(
    accidentalCandidates.map(candidate => candidate.isSharp),
    [true, false]
  );
});

test("maps the retired piano selection to separate eligible single-note staves", () => {
  const candidates = adaptiveExercises.createAdaptiveCandidates({
    clef: ["piano"],
    customMinValue: 47,
    customMaxValue: 61,
    customTrebleMinValue: 48,
    customBassMaxValue: 60,
    accidentals: "onlySharp"
  });
  assert.deepStrictEqual(
    candidates.filter(candidate => candidate.value === 47).map(candidate => candidate.clef),
    ["bass"]
  );
  assert.deepStrictEqual(
    candidates.filter(candidate => candidate.value === 50).map(candidate => candidate.clef),
    ["bass", "treble"]
  );
  assert.deepStrictEqual(
    candidates.filter(candidate => candidate.value === 61).map(candidate => candidate.clef),
    ["treble"]
  );
  assert(candidates.every(candidate => candidate.staff === candidate.clef));
});

test("does not create adaptive exercises inside a clef gap", () => {
  const candidates = adaptiveExercises.createAdaptiveCandidates({
    clef: ["piano"],
    customMinValue: 47,
    customMaxValue: 56,
    customTrebleMinValue: 55,
    customBassMaxValue: 48,
    accidentals: "onlySharp"
  });
  assert.deepStrictEqual(
    candidates.map(candidate => candidate.value),
    [47, 48, 55, 56]
  );
  assert(candidates.slice(0, 2).every(candidate => candidate.clef === "bass"));
  assert(candidates.slice(2).every(candidate => candidate.clef === "treble"));
});

test("creates independent adaptive candidates when bass sits above treble", () => {
  const candidates = adaptiveExercises.createAdaptiveCandidates({
    clef: ["piano"],
    customMinValue: 67,
    customMaxValue: 45,
    customTrebleMinValue: 36,
    customBassMaxValue: 81,
    accidentals: "onlySharp"
  });
  assert(candidates.some(candidate => candidate.value === 40 && candidate.clef === "treble"));
  assert(candidates.some(candidate => candidate.value === 72 && candidate.clef === "bass"));
  assert(!candidates.some(candidate => candidate.value === 55));
  assert(!candidates.some(candidate => candidate.value === 40 && candidate.clef === "bass"));
  assert(!candidates.some(candidate => candidate.value === 72 && candidate.clef === "treble"));
});

test("uses the saved clef-specific range in single-clef mode", () => {
  const options = {
    customMinValue: 67,
    customMaxValue: 45,
    customTrebleMinValue: 36,
    customBassMaxValue: 81,
    accidentals: "onlySharp"
  };
  const bassCandidates = adaptiveExercises.createAdaptiveCandidates(
    Object.assign({ clef: ["bass"] }, options)
  );
  const trebleCandidates = adaptiveExercises.createAdaptiveCandidates(
    Object.assign({ clef: ["treble"] }, options)
  );
  assert.strictEqual(bassCandidates[0].value, 67);
  assert.strictEqual(bassCandidates[bassCandidates.length - 1].value, 81);
  assert(bassCandidates.every(candidate => candidate.clef === "bass"));
  assert.strictEqual(trebleCandidates[0].value, 36);
  assert.strictEqual(trebleCandidates[trebleCandidates.length - 1].value, 45);
  assert(trebleCandidates.every(candidate => candidate.clef === "treble"));
});

test("keeps bass and treble single-staff candidates separate in their overlap", () => {
  const candidates = adaptiveExercises.createAdaptiveCandidates({
    clef: ["bass", "treble"],
    customMinValue: 48,
    customMaxValue: 48,
    customTrebleMinValue: 48,
    customBassMaxValue: 60,
    accidentals: "no"
  });
  assert.deepStrictEqual(
    candidates
      .filter(candidate => candidate.value === 48)
      .map(candidate => `${candidate.staff}:${candidate.clef}`),
    ["bass:bass", "treble:treble"]
  );
  assert(candidates.some(candidate => (
    candidate.value > 48
    && candidate.clef === "bass"
    && candidate.staff === "bass"
  )));
});

test("selecting piano disables all individual clefs", () => {
  assert.deepStrictEqual(
    clefSelection.updateExclusivePianoClefs(
      ["bass", "treble"],
      ["bass", "treble", "piano"]
    ),
    ["piano"]
  );
});

test("selecting an individual clef disables piano", () => {
  assert.deepStrictEqual(
    clefSelection.updateExclusivePianoClefs(
      ["piano"],
      ["piano", "bass"]
    ),
    ["bass"]
  );
});

test("bass and treble remain selectable together", () => {
  assert.deepStrictEqual(
    clefSelection.updateExclusivePianoClefs(
      ["bass"],
      ["bass", "treble"]
    ),
    ["bass", "treble"]
  );
});

test("uses bass and treble as the custom-range clef default", () => {
  assert.deepStrictEqual(
    clefSelection.getDefaultCustomRangeClefs(),
    ["bass", "treble"]
  );
});

test("migrates the previous treble-only custom default once", () => {
  const migrated = clefSelection.migrateLegacyCustomRangeClefs(
    ["treble"],
    null,
    true
  );
  assert.deepStrictEqual(migrated.clefs, ["bass", "treble"]);
  assert.strictEqual(migrated.migrated, true);

  const manuallyChangedAfterMigration = clefSelection.migrateLegacyCustomRangeClefs(
    ["treble"],
    migrated.defaultsVersion,
    true
  );
  assert.deepStrictEqual(manuallyChangedAfterMigration.clefs, ["treble"]);
  assert.strictEqual(manuallyChangedAfterMigration.migrated, false);
});

test("preserves a previous custom bass or piano selection", () => {
  assert.deepStrictEqual(
    clefSelection.migrateLegacyCustomRangeClefs(["bass"], null, true).clefs,
    ["bass"]
  );
  assert.deepStrictEqual(
    clefSelection.migrateLegacyCustomRangeClefs(["piano"], null, true).clefs,
    ["piano"]
  );
  assert.deepStrictEqual(
    clefSelection.migrateLegacyCustomRangeClefs(["treble"], null, false).clefs,
    ["treble"]
  );
});

test("repairs a previously stored mixed piano selection", () => {
  assert.deepStrictEqual(
    clefSelection.normalizeExclusivePianoClefs(["piano", "treble"]),
    ["piano"]
  );
});

test("persists and reloads adaptive progress", () => {
  global.localStorage.clear();
  adaptiveProgress.load();
  adaptiveProgress.recordResult(
    { clef: "bass", value: 48, isSharp: true },
    false,
    2
  );
  adaptiveProgress.progress = learning.createAdaptiveProgress();
  const reloaded = adaptiveProgress.load();
  const summary = adaptiveProgress.getSummary();
  assert.strictEqual(Object.keys(reloaded.notes).length, 1);
  assert.deepStrictEqual(summary, {
    practicedNotes: 1,
    attempts: 1,
    correctFirstTry: 0,
    struggled: 1,
    totalMistakes: 2
  });
});

test("persists and reloads adaptive response times", () => {
  global.localStorage.clear();
  adaptiveProgress.load();
  const exercise = { clef: "treble", value: 60, isSharp: true };
  adaptiveProgress.recordResult(exercise, true, 0, 750);
  adaptiveProgress.progress = learning.createAdaptiveProgress();
  const reloaded = adaptiveProgress.load();
  const record = reloaded.notes[learning.createNoteLearningKey(exercise)];
  assert.strictEqual(record.timedAttempts, 1);
  assert.strictEqual(record.averageResponseTimeMs, 750);
  assert.deepStrictEqual(record.recentResponseTimesMs, [750]);
});

test("keeps current progress when only compacted history baselines remain", () => {
  global.localStorage.clear();
  const exercise = { clef: "treble", staff: "treble", value: 60, isSharp: true };
  let baselineProgress = learning.createAdaptiveProgress();
  baselineProgress = learning.updateAdaptiveProgress(
    baselineProgress,
    exercise,
    true,
    0,
    800
  );
  let currentProgress = baselineProgress;
  currentProgress = learning.updateAdaptiveProgress(
    currentProgress,
    exercise,
    true,
    0,
    700
  );
  global.localStorage.setItem(
    adaptiveProgressModule.ADAPTIVE_PROGRESS_STORAGE_KEY,
    JSON.stringify({ data: currentProgress })
  );
  global.localStorage.setItem(
    adaptiveHistory.ADAPTIVE_HISTORY_STORAGE_KEY,
    JSON.stringify({
      data: adaptiveHistory.createAdaptiveHistory(baselineProgress)
    })
  );

  const reloaded = adaptiveProgress.load("screen");
  assert.strictEqual(reloaded.notes["treble:60:natural"].attempts, 2);
  assert.strictEqual(adaptiveProgress.history.evaluations.length, 0);
  assert.strictEqual(adaptiveProgress.history.baselines.length, 1);
});

test("uses database-primary writes without growing the legacy history", () => {
  global.localStorage.clear();
  const storageKeys = adaptiveProgressModule.getAdaptiveStorageKeys("screen");
  const retainedHistory = JSON.stringify({
    data: { marker: "retained-transition-source" }
  });
  const progress = learning.updateAdaptiveProgress(
    learning.createAdaptiveProgress(),
    { clef: "treble", value: 60, isSharp: true },
    true,
    0,
    700
  );
  global.localStorage.setItem(storageKeys.history, retainedHistory);

  assert.strictEqual(
    storageTransition.DEFAULT_LEGACY_HISTORY_MODE,
    storageTransition.LEGACY_HISTORY_MODE_DATABASE_PRIMARY
  );
  assert.strictEqual(
    storageTransition.shouldWriteLegacyAdaptiveHistory(),
    false
  );
  assert.strictEqual(
    storageTransition.shouldWriteLegacyAdaptiveHistory({
      legacyHistoryMode: (
        storageTransition.LEGACY_HISTORY_MODE_DATABASE_PRIMARY
      )
    }),
    false
  );
  assert.strictEqual(
    storageTransition.shouldMigrateLegacyAdaptiveHistory(),
    false
  );
  const migrationHistory = adaptiveHistory.createAdaptiveHistory();
  migrationHistory.evaluations.push(adaptiveHistory.createAdaptiveEvaluation(
    { clef: "treble", staff: "treble", value: 60, isSharp: true },
    true,
    0,
    700,
    { id: "transition-migration", completedAt: 1788960000000 }
  ));
  assert.strictEqual(
    storageTransition.shouldMigrateLegacyAdaptiveHistory(migrationHistory),
    true
  );

  adaptiveProgressModule.persistLegacyAdaptiveState(
    "screen",
    storageKeys,
    adaptiveHistory.createAdaptiveHistory(progress),
    progress,
    {
      legacyHistoryMode: (
        storageTransition.LEGACY_HISTORY_MODE_DATABASE_PRIMARY
      )
    }
  );

  assert.strictEqual(
    global.localStorage.getItem(storageKeys.history),
    retainedHistory
  );
  assert.strictEqual(
    JSON.parse(global.localStorage.getItem(storageKeys.progress)).data
      .notes["treble:60:natural"].attempts,
    1
  );
});

test("contains a local-storage quota failure while keeping progress in memory", () => {
  global.localStorage.clear();
  adaptiveProgress.load("button");
  const originalSetItem = global.localStorage.setItem;
  const quotaError = new Error("quota exceeded");
  quotaError.name = "QuotaExceededError";
  global.localStorage.setItem = function failProgressWrite(key, value) {
    if (key === adaptiveProgressModule.ADAPTIVE_PROGRESS_STORAGE_KEY) {
      throw quotaError;
    }
    return originalSetItem.call(this, key, value);
  };
  assert.doesNotThrow(() => {
    adaptiveProgress.recordResult(
      { clef: "treble", staff: "treble", value: 60, isSharp: true },
      true,
      0,
      700,
      { id: "quota-contained", completedAt: 1788960000000 }
    );
  });
  assert.strictEqual(adaptiveProgress.getSummary().attempts, 1);
  global.localStorage.setItem = originalSetItem;
  adaptiveProgress.recordResult(
    { clef: "treble", staff: "treble", value: 62, isSharp: true },
    true,
    0,
    700,
    { id: "quota-recovered", completedAt: 1788960001000 }
  );
  assert.strictEqual(adaptiveProgress.getSummary().attempts, 2);
});

test("maps existing adaptive data to buttons and screen piano, not MIDI", () => {
  global.localStorage.clear();
  const exercise = { clef: "treble", staff: "treble", value: 60, isSharp: true };
  const existingProgress = learning.updateAdaptiveProgress(
    learning.createAdaptiveProgress(),
    exercise,
    true,
    0,
    800
  );
  global.localStorage.setItem(
    adaptiveProgressModule.ADAPTIVE_PROGRESS_STORAGE_KEY,
    JSON.stringify({ data: existingProgress })
  );

  adaptiveProgress.load("keyboard");
  assert.strictEqual(adaptiveProgress.inputGroup, "screen");
  assert.strictEqual(adaptiveProgress.getSummary().attempts, 1);

  adaptiveProgress.load("midi");
  assert.strictEqual(adaptiveProgress.inputGroup, "midi");
  assert.strictEqual(adaptiveProgress.getSummary().attempts, 0);
  assert.strictEqual(
    global.localStorage.getItem(
      adaptiveProgressModule.ADAPTIVE_MIDI_HISTORY_STORAGE_KEY
    ),
    null
  );
});

test("stores independent adaptive progress for screen input and MIDI", () => {
  global.localStorage.clear();
  const screenExercise = { clef: "bass", staff: "bass", value: 48, isSharp: true };
  const midiExercise = { clef: "treble", staff: "treble", value: 64, isSharp: true };

  adaptiveProgress.load("button");
  adaptiveProgress.recordResult(screenExercise, false, 2, null, {
    id: "adaptive-screen-result",
    completedAt: 1788960000000
  });
  adaptiveProgress.load("midi");
  adaptiveProgress.recordResult(midiExercise, true, 0, 700, {
    id: "adaptive-midi-result",
    completedAt: 1788960001000
  });

  assert.strictEqual(global.localStorage.getItem(
    adaptiveHistory.ADAPTIVE_HISTORY_STORAGE_KEY
  ), null);
  assert.strictEqual(global.localStorage.getItem(
    adaptiveProgressModule.ADAPTIVE_MIDI_HISTORY_STORAGE_KEY
  ), null);

  adaptiveProgress.load("keyboard");
  assert.strictEqual(adaptiveProgress.getSummary().attempts, 1);
  assert.strictEqual(adaptiveProgress.getSummary().totalMistakes, 2);
  adaptiveProgress.load("midi");
  assert.strictEqual(adaptiveProgress.getSummary().attempts, 1);
  assert.strictEqual(adaptiveProgress.getSummary().correctFirstTry, 1);
});

test("resets only the selected adaptive input group", () => {
  adaptiveProgress.reset("midi");
  assert.strictEqual(
    global.localStorage.getItem(
      adaptiveProgressModule.ADAPTIVE_MIDI_PROGRESS_STORAGE_KEY
    ),
    null
  );
  assert.strictEqual(
    global.localStorage.getItem(
      adaptiveProgressModule.ADAPTIVE_MIDI_HISTORY_STORAGE_KEY
    ),
    null
  );
  assert(global.localStorage.getItem(
    adaptiveProgressModule.ADAPTIVE_PROGRESS_STORAGE_KEY
  ));
  assert.strictEqual(global.localStorage.getItem(
    adaptiveHistory.ADAPTIVE_HISTORY_STORAGE_KEY
  ), null);

  adaptiveProgress.load("button");
  assert.strictEqual(adaptiveProgress.getSummary().attempts, 1);
});

test("stores each adaptive evaluation with a stable unique identifier", () => {
  global.localStorage.clear();
  adaptiveProgress.load();
  const exercise = { clef: "treble", staff: "treble", value: 60, isSharp: true };
  adaptiveProgress.recordResult(exercise, true, 0, 750, {
    id: "adaptive-test-result",
    completedAt: 1788960000000
  });

  assert.strictEqual(global.localStorage.getItem(
    adaptiveHistory.ADAPTIVE_HISTORY_STORAGE_KEY
  ), null);
  assert.strictEqual(adaptiveProgress.history.evaluations.length, 1);
  assert.deepStrictEqual(adaptiveProgress.history.evaluations[0], {
    schemaVersion: 1,
    id: "adaptive-test-result",
    completedAt: 1788960000000,
    noteKey: "treble:60:natural",
    exercise,
    correctFirstTry: true,
    mistakeCount: 0,
    responseTimeMs: 750
  });

  adaptiveProgress.progress = learning.createAdaptiveProgress();
  const reloaded = adaptiveProgress.load();
  assert.strictEqual(reloaded.notes["treble:60:natural"].attempts, 1);
});

test("does not count the same adaptive evaluation identifier twice", () => {
  global.localStorage.clear();
  adaptiveProgress.load();
  const exercise = { clef: "bass", staff: "bass", value: 48, isSharp: true };
  const context = { id: "adaptive-duplicate", completedAt: 1788960000000 };
  adaptiveProgress.recordResult(exercise, false, 2, null, context);
  adaptiveProgress.recordResult(exercise, false, 2, null, context);
  assert.strictEqual(adaptiveProgress.getSummary().attempts, 1);
  assert.strictEqual(adaptiveProgress.getSummary().totalMistakes, 2);
  assert.strictEqual(adaptiveProgress.history.evaluations.length, 1);
});

test("migrates an existing aggregate progress once without losing results", () => {
  global.localStorage.clear();
  const exercise = { clef: "treble", staff: "treble", value: 60, isSharp: true };
  const legacyProgress = learning.updateAdaptiveProgress(
    learning.createAdaptiveProgress(),
    exercise,
    false,
    3
  );
  global.localStorage.setItem(
    adaptiveProgressModule.ADAPTIVE_PROGRESS_STORAGE_KEY,
    JSON.stringify({ data: legacyProgress })
  );

  adaptiveProgress.load();
  const firstBaselineId = adaptiveProgress.history.baselines[0].id;
  assert.strictEqual(adaptiveProgress.getSummary().attempts, 1);
  assert.strictEqual(adaptiveProgress.getSummary().totalMistakes, 3);
  assert.strictEqual(adaptiveProgress.history.baselines.length, 1);

  adaptiveProgress.load();
  assert.strictEqual(adaptiveProgress.history.baselines.length, 1);
  assert.strictEqual(adaptiveProgress.history.baselines[0].id, firstBaselineId);
  assert.strictEqual(adaptiveProgress.getSummary().attempts, 1);
});

test("deduplicates evaluation identifiers while rebuilding adaptive progress", () => {
  const evaluation = adaptiveHistory.createAdaptiveEvaluation(
    { clef: "bass", staff: "bass", value: 48, isSharp: true },
    true,
    0,
    900,
    { id: "adaptive-once", completedAt: 1788960000000 }
  );
  const rebuilt = adaptiveHistory.rebuildAdaptiveProgress({
    version: 1,
    baselines: [],
    evaluations: [evaluation, evaluation]
  });
  assert.strictEqual(rebuilt.notes["bass:48:natural"].attempts, 1);
});

test("migrates a stored piano evaluation into the shared screen clef", () => {
  const rebuilt = adaptiveHistory.rebuildAdaptiveProgress({
    version: 1,
    baselines: [],
    evaluations: [{
      schemaVersion: 1,
      id: "legacy-piano-evaluation",
      completedAt: 1788960000000,
      noteKey: "piano-treble:60:natural",
      exercise: {
        clef: "treble",
        staff: "piano",
        value: 60,
        isSharp: true
      },
      correctFirstTry: true,
      mistakeCount: 0,
      responseTimeMs: 700
    }]
  });
  assert.strictEqual(rebuilt.notes["treble:60:natural"].attempts, 1);
  assert.strictEqual(rebuilt.notes["piano-treble:60:natural"], undefined);
});

test("normalizes old screen history without rewriting the migration source", () => {
  global.localStorage.clear();
  global.localStorage.setItem(
    adaptiveHistory.ADAPTIVE_HISTORY_STORAGE_KEY,
    JSON.stringify({
      data: {
        version: 1,
        baselines: [],
        evaluations: [{
          schemaVersion: 1,
          id: "stored-legacy-piano-evaluation",
          completedAt: 1788960000000,
          noteKey: "piano-bass:48:natural",
          exercise: {
            clef: "bass",
            staff: "piano",
            value: 48,
            isSharp: true
          },
          correctFirstTry: true,
          mistakeCount: 0,
          responseTimeMs: 800
        }]
      }
    })
  );

  const firstLoad = adaptiveProgress.load("keyboard");
  const storedHistory = JSON.parse(global.localStorage.getItem(
    adaptiveHistory.ADAPTIVE_HISTORY_STORAGE_KEY
  )).data;
  assert.strictEqual(firstLoad.notes["bass:48:natural"].attempts, 1);
  assert.strictEqual(
    adaptiveProgress.history.evaluations[0].noteKey,
    "bass:48:natural"
  );
  assert.strictEqual(
    storedHistory.evaluations[0].noteKey,
    "piano-bass:48:natural"
  );

  const secondLoad = adaptiveProgress.load("keyboard");
  assert.strictEqual(secondLoad.notes["bass:48:natural"].attempts, 1);
});

test("reset removes only adaptive learning progress", () => {
  global.localStorage.setItem("options", "keep-me");
  adaptiveProgress.reset();
  assert.strictEqual(global.localStorage.getItem("adaptiveProgress"), null);
  assert.strictEqual(global.localStorage.getItem("adaptiveHistory"), null);
  assert.strictEqual(global.localStorage.getItem("options"), "keep-me");
  assert.strictEqual(adaptiveProgress.getSummary().attempts, 0);
});

test("progress keyboard shares single-clef and piano records", () => {
  let progress = learning.createAdaptiveProgress();
  progress = learning.updateAdaptiveProgress(
    progress,
    { clef: "treble", value: 60 },
    true
  );
  progress = learning.updateAdaptiveProgress(
    progress,
    { clef: "treble", staff: "piano", value: 60 },
    false,
    1
  );
  assert.strictEqual(
    adaptiveProgressView.getProgressViewRecord(progress, "treble", 60).attempts,
    2
  );
  assert.strictEqual(
    adaptiveProgressView.getProgressViewRecord(progress, "piano-treble", 60).attempts,
    2
  );
  assert.strictEqual(
    adaptiveProgressView.getProgressViewRecord(progress, "piano-treble", 60).difficulty,
    adaptiveProgressView.getProgressViewRecord(progress, "treble", 60).difficulty
  );
});

test("progress keyboard keeps sharp and flat colors separate", () => {
  let progress = learning.createAdaptiveProgress();
  progress = learning.updateAdaptiveProgress(
    progress,
    { clef: "bass", value: 49, isSharp: true },
    false,
    1
  );
  assert(adaptiveProgressView.getProgressViewRecord(progress, "bass", 49, "sharp"));
  assert.strictEqual(
    adaptiveProgressView.getProgressViewRecord(progress, "bass", 49, "flat"),
    null
  );
});

test("progress keyboard maps difficulty continuously from red to green", () => {
  const unpracticedColor = adaptiveProgressView.getProgressColor(null, false);
  const difficultColor = adaptiveProgressView.getProgressColor({ difficulty: 1.9 }, false);
  const neutralColor = adaptiveProgressView.getProgressColor({ difficulty: 1 }, false);
  const secureColor = adaptiveProgressView.getProgressColor({ difficulty: 0.4 }, false);
  assert.strictEqual(unpracticedColor, "#e5e5e5");
  assert.strictEqual(difficultColor, "hsl(0, 68%, 64%)");
  assert.strictEqual(neutralColor, "hsl(60, 68%, 64%)");
  assert.strictEqual(secureColor, "hsl(120, 68%, 64%)");
});

test("progress keyboard reports first-try accuracy", () => {
  assert.strictEqual(
    adaptiveProgressView.getFirstTryAccuracy({ attempts: 4, correctFirstTry: 3 }),
    75
  );
  assert.strictEqual(adaptiveProgressView.getFirstTryAccuracy(null), null);
});

test("progress keyboard compares sufficiently measured response times", () => {
  const fast = {
    timedAttempts: 3,
    recentResponseTimesMs: [700, 800, 900]
  };
  const slow = {
    timedAttempts: 3,
    recentResponseTimesMs: [1100, 1200, 1300]
  };
  const similar = {
    timedAttempts: 3,
    recentResponseTimesMs: [960, 1000, 1040]
  };
  assert.deepStrictEqual(
    adaptiveProgressView.getResponseTimeComparison(fast, 1000),
    { direction: "faster", differenceMs: 200 }
  );
  assert.deepStrictEqual(
    adaptiveProgressView.getResponseTimeComparison(slow, 1000),
    { direction: "slower", differenceMs: 200 }
  );
  assert.deepStrictEqual(
    adaptiveProgressView.getResponseTimeComparison(similar, 1000),
    { direction: "similar", differenceMs: 0 }
  );
});

test("progress keyboard waits for reliable response-time comparisons", () => {
  assert.strictEqual(
    adaptiveProgressView.getResponseTimeComparison({
      timedAttempts: 2,
      recentResponseTimesMs: [700, 800]
    }, 1000),
    null
  );
  assert.strictEqual(
    adaptiveProgressView.getResponseTimeComparison({
      timedAttempts: 3,
      recentResponseTimesMs: [700, 800, 900]
    }, null),
    null
  );
});

test("summarizes adaptive side statistics for the selected candidates", () => {
  const secure = { clef: "treble", staff: "treble", value: 60, isSharp: true };
  const building = { clef: "treble", staff: "treble", value: 62, isSharp: true };
  const practice = { clef: "bass", staff: "bass", value: 48, isSharp: true };
  const unpracticed = { clef: "treble", staff: "treble", value: 64, isSharp: true };
  const outsideRange = { clef: "treble", staff: "treble", value: 72, isSharp: true };
  let progress = learning.createAdaptiveProgress();

  for (let index = 0; index < adaptiveStatistics.ADAPTIVE_SECURE_MIN_ATTEMPTS; index += 1) {
    progress = learning.updateAdaptiveProgress(progress, secure, true, 0, 800);
  }
  for (let index = 0; index < 2; index += 1) {
    progress = learning.updateAdaptiveProgress(progress, building, true, 0, 1000);
  }
  progress = learning.updateAdaptiveProgress(progress, practice, false, 1, 700);
  progress = learning.updateAdaptiveProgress(progress, outsideRange, true, 0, 600);

  const summary = adaptiveStatistics.summarizeAdaptiveCandidates(
    progress,
    [secure, building, practice, unpracticed]
  );
  assert.strictEqual(summary.totalCandidates, 4);
  assert.strictEqual(summary.practicedCandidates, 3);
  assert.strictEqual(summary.attempts, 8);
  assert.strictEqual(summary.correctFirstTry, 7);
  assert.strictEqual(summary.firstTryAccuracy, 88);
  assert.strictEqual(summary.averageResponseTimeMs, 857);
  assert.deepStrictEqual(summary.statusCounts, {
    secure: 1,
    building: 1,
    practice: 1,
    unpracticed: 1
  });
  assert.strictEqual(summary.safest.key, learning.createNoteLearningKey(secure));
  assert.strictEqual(summary.mostDifficult, null);
});

test("ranks only sufficiently practiced adaptive notes", () => {
  const safest = { clef: "treble", staff: "treble", value: 60, isSharp: true };
  const difficult = { clef: "bass", staff: "bass", value: 48, isSharp: true };
  let progress = learning.createAdaptiveProgress();
  for (
    let index = 0;
    index < adaptiveStatistics.ADAPTIVE_SECURE_MIN_ATTEMPTS;
    index += 1
  ) {
    progress = learning.updateAdaptiveProgress(progress, safest, true, 0, 700);
    progress = learning.updateAdaptiveProgress(progress, difficult, false, 1);
  }

  const summary = adaptiveStatistics.summarizeAdaptiveCandidates(
    progress,
    [difficult, safest, safest]
  );
  assert.strictEqual(summary.totalCandidates, 2);
  assert.strictEqual(summary.safest.key, learning.createNoteLearningKey(safest));
  assert.strictEqual(
    summary.mostDifficult.key,
    learning.createNoteLearningKey(difficult)
  );
  assert.notStrictEqual(summary.safest.key, summary.mostDifficult.key);
});

test("uses different notes for equally rated safest and practice highlights", () => {
  const bass = { clef: "bass", staff: "piano", value: 48, isSharp: true };
  const treble = { clef: "treble", staff: "piano", value: 48, isSharp: true };
  let progress = learning.createAdaptiveProgress();
  for (
    let index = 0;
    index < adaptiveStatistics.ADAPTIVE_SECURE_MIN_ATTEMPTS;
    index += 1
  ) {
    progress = learning.updateAdaptiveProgress(progress, bass, true, 0, 700);
    progress = learning.updateAdaptiveProgress(progress, treble, true, 0, 700);
  }

  const summary = adaptiveStatistics.summarizeAdaptiveCandidates(
    progress,
    [bass, treble]
  );
  assert(summary.safest);
  assert(summary.mostDifficult);
  assert.notStrictEqual(summary.safest.key, summary.mostDifficult.key);
});

test("waits until every selected note and clef has enough practice", () => {
  const options = createExpansionOptions();
  const candidates = adaptiveExercises.createAdaptiveCandidates(options);
  let progress = learning.createAdaptiveProgress();
  for (
    let index = 0;
    index < adaptiveRangeExpansion.RANGE_EXPANSION_MIN_ATTEMPTS;
    index += 1
  ) {
    progress = learning.updateAdaptiveProgress(
      progress,
      candidates[0],
      true,
      0,
      900
    );
  }

  const evaluation = adaptiveRangeExpansion.evaluateAdaptiveRangeExpansion(
    progress,
    options
  );
  assert.strictEqual(evaluation.ready, false);
  assert.strictEqual(evaluation.metrics.totalCandidates, 2);
  assert.strictEqual(evaluation.metrics.practicedEnoughCount, 1);
  assert(evaluation.blockers.indexOf("practice") !== -1);
});

test("recommends only adjacent notes after a selection is secure", () => {
  const options = createExpansionOptions();
  const progress = masterExpansionSelection(options);
  const evaluation = adaptiveRangeExpansion.evaluateAdaptiveRangeExpansion(
    progress,
    options
  );

  assert.strictEqual(evaluation.ready, true);
  assert.strictEqual(evaluation.metrics.securePercent, 100);
  assert.strictEqual(evaluation.metrics.recentAccuracyPercent, 100);
  assert.strictEqual(evaluation.metrics.timedPercent, 100);
  assert.strictEqual(evaluation.metrics.averageResponseTimeMs, 900);
  assert.deepStrictEqual(
    evaluation.recommendations.map(item => [item.id, item.value]),
    [["range-lower", 47], ["range-upper", 52]]
  );
});

test("waits when correct notes are still read too slowly", () => {
  const options = createExpansionOptions({ customMaxValue: 48 });
  const progress = masterExpansionSelection(options, 3500);
  const evaluation = adaptiveRangeExpansion.evaluateAdaptiveRangeExpansion(
    progress,
    options
  );

  assert.strictEqual(evaluation.metrics.securePercent, 100);
  assert.strictEqual(evaluation.metrics.recentAccuracyPercent, 100);
  assert.strictEqual(evaluation.ready, false);
  assert.deepStrictEqual(evaluation.blockers, ["speed"]);
});

test("offers one-note clef expansions for bass and treble overlap", () => {
  const options = createExpansionOptions({
    clef: ["bass", "treble"],
    customMinValue: 48,
    customMaxValue: 52,
    customTrebleMinValue: 50,
    customBassMaxValue: 50
  });
  const progress = masterExpansionSelection(options);
  const evaluation = adaptiveRangeExpansion.evaluateAdaptiveRangeExpansion(
    progress,
    options
  );

  assert.strictEqual(evaluation.ready, true);
  assert.deepStrictEqual(
    evaluation.recommendations.map(item => [item.id, item.value]),
    [
      ["range-lower", 47],
      ["range-upper", 53],
      ["treble-lower", 48],
      ["bass-upper", 52]
    ]
  );

  const expanded = adaptiveRangeExpansion.applyAdaptiveRangeRecommendation(
    options,
    "treble-lower"
  );
  assert.strictEqual(expanded.customTrebleMinValue, 48);
  assert.strictEqual(expanded.customBassMaxValue, 50);
  assert.strictEqual(expanded.customMinValue, 48);
  assert.strictEqual(expanded.customMaxValue, 52);
  assert.strictEqual(
    adaptiveRangeExpansion.evaluateAdaptiveRangeExpansion(progress, expanded).ready,
    false
  );
});

test("uses the same controlled overlap steps in piano mode", () => {
  const options = createExpansionOptions({
    clef: ["piano"],
    customMinValue: 48,
    customMaxValue: 52,
    customTrebleMinValue: 50,
    customBassMaxValue: 50
  });
  const progress = masterExpansionSelection(options);
  const evaluation = adaptiveRangeExpansion.evaluateAdaptiveRangeExpansion(
    progress,
    options
  );

  assert.strictEqual(evaluation.ready, true);
  assert(evaluation.recommendations.some(item => item.id === "treble-lower"));
  assert(evaluation.recommendations.some(item => item.id === "bass-upper"));
  assert.throws(() => {
    adaptiveRangeExpansion.applyAdaptiveRangeRecommendation(options, "not-a-step");
  });
});

test("pause duration is removed from adaptive response timing", () => {
  assert.strictEqual(
    roundPause.adjustTimestampAfterPause(1000, 2500, 6500),
    5000
  );
  assert.strictEqual(
    roundPause.adjustTimestampAfterPause(null, 2500, 6500),
    null
  );
  assert.strictEqual(
    roundPause.adjustTimestampAfterPause(1000, 6500, 2500),
    1000
  );
});

test("waits for five timestamped notes before creating a learning trend point", () => {
  let history = adaptiveHistory.createAdaptiveHistory();
  for (let index = 0; index < 4; index += 1) {
    history = adaptiveHistory.addAdaptiveEvaluation(
      history,
      adaptiveHistory.createAdaptiveEvaluation(
        { value: 48 + index, clef: "treble", isSharp: true },
        true,
        0,
        1000,
        { id: `trend-pending-${index}`, completedAt: 1000 + index }
      )
    );
  }

  const summary = adaptiveTrend.summarizeAdaptiveTrendHistory(history);
  assert.strictEqual(summary.segments.length, 0);
  assert.strictEqual(summary.pendingCount, 4);
  assert.strictEqual(summary.requiredForNextPoint, 1);
});

test("groups adaptive evaluations into fair twenty-note learning segments", () => {
  let history = adaptiveHistory.createAdaptiveHistory();
  for (let index = 0; index < 45; index += 1) {
    history = adaptiveHistory.addAdaptiveEvaluation(
      history,
      adaptiveHistory.createAdaptiveEvaluation(
        { value: 48 + index % 7, clef: "treble", isSharp: true },
        index % 5 !== 0,
        index % 5 === 0 ? 20 : 0,
        index % 5 === 0 ? null : 1000 + index,
        { id: `trend-segment-${index}`, completedAt: 1000 + index }
      )
    );
  }

  const summary = adaptiveTrend.summarizeAdaptiveTrendHistory(history);
  assert.deepStrictEqual(summary.segments.map(value => value.exerciseCount), [20, 20, 5]);
  assert.deepStrictEqual(summary.segments.map(value => value.accuracy), [80, 80, 80]);
  assert.strictEqual(summary.segments[0].isComplete, true);
  assert.strictEqual(summary.segments[2].isComplete, false);
  assert.strictEqual(summary.pendingCount, 0);
});

test("counts one displayed adaptive note once in the trend despite many mistakes", () => {
  let history = adaptiveHistory.createAdaptiveHistory();
  for (let index = 0; index < 5; index += 1) {
    history = adaptiveHistory.addAdaptiveEvaluation(
      history,
      adaptiveHistory.createAdaptiveEvaluation(
        { value: 48 + index, clef: "treble", isSharp: true },
        index !== 0,
        index === 0 ? 50 : 0,
        index === 0 ? null : 1000,
        { id: `trend-mistakes-${index}`, completedAt: 2000 + index }
      )
    );
  }

  const summary = adaptiveTrend.summarizeAdaptiveTrendHistory(history);
  assert.strictEqual(summary.segments.length, 1);
  assert.strictEqual(summary.segments[0].exerciseCount, 5);
  assert.strictEqual(summary.segments[0].accuracy, 80);
});

function addLearningTimeSample(
  history,
  day,
  hour,
  exerciseCount,
  correctCount,
  idPrefix
) {
  let updated = history;
  for (let index = 0; index < exerciseCount; index += 1) {
    const correct = index < correctCount;
    updated = adaptiveHistory.addAdaptiveEvaluation(
      updated,
      adaptiveHistory.createAdaptiveEvaluation(
        { value: 48 + index % 7, clef: "treble", isSharp: true },
        correct,
        correct ? 0 : 12,
        correct ? 900 + index : null,
        {
          id: `${idPrefix}-${day}-${hour}-${index}`,
          completedAt: new Date(2026, 8, day, hour, 0, index).getTime()
        }
      )
    );
  }
  return updated;
}

test("keeps the learning-time recommendation pending before seven learning days", () => {
  let history = adaptiveHistory.createAdaptiveHistory();
  for (let day = 1; day <= 4; day += 1) {
    history = addLearningTimeSample(history, day, 16, 10, 9, "time-pending-a");
    history = addLearningTimeSample(history, day, 20, 10, 6, "time-pending-b");
  }

  const summary = adaptiveLearningTime.summarizeAdaptiveLearningTimes(history);
  assert.strictEqual(summary.ready, false);
  assert.strictEqual(summary.recordedDays, 4);
  assert.strictEqual(summary.eligibleBucketCount, 2);
  assert.strictEqual(summary.progressPercent, 57);
});

test("recommends the strongest and most challenging proven learning times", () => {
  let history = adaptiveHistory.createAdaptiveHistory();
  for (let day = 1; day <= 7; day += 1) {
    history = addLearningTimeSample(history, day, 8, 10, 9, "time-ready-a");
    history = addLearningTimeSample(history, day, 20, 10, 5, "time-ready-b");
  }

  const summary = adaptiveLearningTime.summarizeAdaptiveLearningTimes(history);
  assert.strictEqual(summary.ready, true);
  assert.strictEqual(summary.progressPercent, 100);
  assert.strictEqual(summary.best.startHour, 8);
  assert.strictEqual(summary.best.accuracy, 90);
  assert.strictEqual(summary.mostChallenging.startHour, 20);
  assert.strictEqual(summary.mostChallenging.accuracy, 50);
  assert.strictEqual(summary.isStable, false);
  assert.strictEqual(adaptiveLearningTime.formatLearningTimeRange(8), "08:00–10:00");
});

test("weights learning days equally so an unlimited session cannot dominate", () => {
  let history = adaptiveHistory.createAdaptiveHistory();
  history = addLearningTimeSample(history, 1, 8, 100, 100, "time-fair-long");
  history = addLearningTimeSample(history, 2, 8, 10, 0, "time-fair-short-a");
  history = addLearningTimeSample(history, 3, 8, 10, 0, "time-fair-short-b");
  for (let day = 1; day <= 7; day += 1) {
    history = addLearningTimeSample(history, day, 16, 10, 5, "time-fair-comparison");
  }

  const summary = adaptiveLearningTime.summarizeAdaptiveLearningTimes(history);
  const morning = summary.buckets.find(value => value.startHour === 8);
  assert.strictEqual(summary.ready, true);
  assert.strictEqual(morning.exerciseCount, 120);
  assert.strictEqual(morning.accuracy, 33);
  assert.strictEqual(summary.best.startHour, 16);
  assert.strictEqual(summary.mostChallenging.startHour, 8);
});

async function testDatabasePrimaryProgressReload() {
  global.localStorage.clear();
  const exercise = {
    clef: "treble",
    staff: "treble",
    value: 60,
    isSharp: true
  };
  let staleProgress = learning.createAdaptiveProgress();
  staleProgress = learning.updateAdaptiveProgress(
    staleProgress,
    exercise,
    true,
    0,
    900
  );
  let databaseProgress = staleProgress;
  databaseProgress = learning.updateAdaptiveProgress(
    databaseProgress,
    exercise,
    true,
    0,
    800
  );
  databaseProgress = learning.updateAdaptiveProgress(
    databaseProgress,
    exercise,
    true,
    0,
    700
  );
  global.localStorage.setItem(
    adaptiveProgressModule.ADAPTIVE_PROGRESS_STORAGE_KEY,
    JSON.stringify({ data: staleProgress })
  );
  global.localStorage.setItem(
    adaptiveHistory.ADAPTIVE_HISTORY_STORAGE_KEY,
    JSON.stringify({
      data: adaptiveHistory.createAdaptiveHistory(staleProgress)
    })
  );

  const methodNames = [
    "recoverInterruptedSessions",
    "verifyHistoryReady",
    "readProgress",
    "synchronizeProgress",
    "migrateLegacyHistory",
    "readStatisticsSnapshot"
  ];
  const originalMethods = methodNames.reduce((methods, name) => {
    methods[name] = singleNotesLearningStorage[name];
    return methods;
  }, {});
  let synchronized = false;
  let migrated = false;
  try {
    singleNotesLearningStorage.recoverInterruptedSessions = () => (
      Promise.resolve({ saved: true })
    );
    singleNotesLearningStorage.verifyHistoryReady = () => Promise.resolve({
      saved: true,
      verified: true,
      attemptCount: 3
    });
    singleNotesLearningStorage.readProgress = () => Promise.resolve({
      saved: true,
      progress: databaseProgress
    });
    singleNotesLearningStorage.synchronizeProgress = () => {
      synchronized = true;
      return Promise.resolve({ saved: true, progress: staleProgress });
    };
    singleNotesLearningStorage.migrateLegacyHistory = () => {
      migrated = true;
      return Promise.resolve({ saved: true, verified: true });
    };
    singleNotesLearningStorage.readStatisticsSnapshot = () => (
      Promise.resolve({ saved: false })
    );

    const loaded = await adaptiveProgress.loadFromDatabase("screen");
    assert.strictEqual(loaded.notes["treble:60:natural"].attempts, 3);
    assert.strictEqual(synchronized, false);
    assert.strictEqual(migrated, false);
    assert.strictEqual(
      JSON.parse(global.localStorage.getItem("adaptiveProgress"))
        .data.notes["treble:60:natural"].attempts,
      3
    );
  } finally {
    methodNames.forEach(name => {
      singleNotesLearningStorage[name] = originalMethods[name];
    });
  }

  global.localStorage.clear();
  let fullLegacyHistory = adaptiveHistory.createAdaptiveHistory(staleProgress);
  fullLegacyHistory = adaptiveHistory.addAdaptiveEvaluation(
    fullLegacyHistory,
    adaptiveHistory.createAdaptiveEvaluation(
      exercise,
      true,
      0,
      800,
      { id: "stale-full-history", completedAt: 1788960000000 }
    )
  );
  global.localStorage.setItem(
    adaptiveProgressModule.ADAPTIVE_PROGRESS_STORAGE_KEY,
    JSON.stringify({ data: staleProgress })
  );
  global.localStorage.setItem(
    adaptiveHistory.ADAPTIVE_HISTORY_STORAGE_KEY,
    JSON.stringify({ data: fullLegacyHistory })
  );
  synchronized = false;
  migrated = false;
  try {
    singleNotesLearningStorage.recoverInterruptedSessions = () => (
      Promise.resolve({ saved: true })
    );
    singleNotesLearningStorage.migrateLegacyHistory = () => {
      migrated = true;
      return Promise.resolve({
        saved: true,
        verified: true,
        trustedDatabase: true,
        attemptCount: 3
      });
    };
    singleNotesLearningStorage.readProgress = () => Promise.resolve({
      saved: true,
      progress: databaseProgress
    });
    singleNotesLearningStorage.synchronizeProgress = () => {
      synchronized = true;
      return Promise.resolve({ saved: true, progress: staleProgress });
    };
    singleNotesLearningStorage.verifyHistoryReady = () => {
      throw new Error("full history must use the guarded migration path");
    };
    singleNotesLearningStorage.readStatisticsSnapshot = () => (
      Promise.resolve({ saved: false })
    );

    const loaded = await adaptiveProgress.loadFromDatabase("screen");
    assert.strictEqual(loaded.notes["treble:60:natural"].attempts, 3);
    assert.strictEqual(migrated, true);
    assert.strictEqual(synchronized, false);
  } finally {
    methodNames.forEach(name => {
      singleNotesLearningStorage[name] = originalMethods[name];
    });
  }
  process.stdout.write(
    "\u2713 reloads current progress from the database after transition\n"
  );
}

testDatabasePrimaryProgressReload().then(() => {
  process.stdout.write("Adaptive model and settings tests passed.\n");
}).catch(error => {
  process.stderr.write(
    "\u2717 reloads current progress from the database after transition\n"
  );
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
