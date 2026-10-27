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

const roundHistory = loadEsModule(
  path.resolve(__dirname, "../src/model/RoundHistory.js")
);
const roundStatistics = loadEsModule(
  path.resolve(__dirname, "../src/model/RoundStatistics.js")
);
const normalLearningTime = loadEsModule(
  path.resolve(__dirname, "../src/model/NormalLearningTime.js")
);
const historyChartWindow = loadEsModule(
  path.resolve(__dirname, "../src/model/HistoryChartWindow.js")
);
const statistics = loadEsModule(
  path.resolve(__dirname, "../src/model/Statistics.js")
).default;
const normalOptions = loadEsModule(
  path.resolve(__dirname, "../src/model/Options.js")
).default;
const uiPreferences = loadEsModule(
  path.resolve(__dirname, "../src/model/UiPreferences.js")
);

function test(name, body) {
  try {
    global.localStorage.clear();
    statistics.lastScores = [];
    statistics.record = 0;
    statistics.legacyScores = [];
    statistics.legacyRecord = 0;
    statistics.rounds = [];
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

function readStoredValue(key) {
  const stored = global.localStorage.getItem(key);
  return stored ? JSON.parse(stored).data : null;
}

function createResult(overrides = {}) {
  return Object.assign({
    score: 320,
    accuracy: 80,
    numAnswers: 20,
    numCorrect: 16,
    numWrong: 4
  }, overrides);
}

function createOptions(overrides = {}) {
  return Object.assign({
    gameLength: 60,
    difficulty: "normal",
    clef: ["treble"],
    customMinValue: 28,
    customMaxValue: 69,
    customTrebleMinValue: 48,
    customBassMaxValue: 48,
    accidentals: "no",
    inputMode: "button"
  }, overrides);
}

function createTimedRound({
  id,
  day,
  hour,
  inputMode = "button",
  gameLength = 60,
  numAnswers = 10,
  numCorrect = 8
}) {
  return roundHistory.createNormalRoundRecord(
    createResult({
      accuracy: Math.round(numCorrect / numAnswers * 100),
      numAnswers,
      numCorrect,
      numWrong: Math.max(0, numAnswers - numCorrect)
    }),
    createOptions({ inputMode, gameLength }),
    {
      id,
      completedAt: new Date(2026, 8, day, hour, 0, 0).getTime()
    }
  );
}

test("keeps the legacy round statistics preference readable for existing save data", () => {
  assert.strictEqual(uiPreferences.loadRoundStatisticsOpen(), false);

  assert.strictEqual(uiPreferences.saveRoundStatisticsOpen(true), true);
  assert.strictEqual(uiPreferences.loadRoundStatisticsOpen(), true);
  assert.strictEqual(
    readStoredValue(uiPreferences.ROUND_STATISTICS_OPEN_STORAGE_KEY),
    true
  );

  assert.strictEqual(uiPreferences.saveRoundStatisticsOpen(false), false);
  assert.strictEqual(uiPreferences.loadRoundStatisticsOpen(), false);
});

test("keeps the legacy adaptive disclosure preference readable for existing backups", () => {
  assert.strictEqual(uiPreferences.loadAdaptiveProgressOpen(), false);

  assert.strictEqual(uiPreferences.saveAdaptiveProgressOpen(true), true);
  assert.strictEqual(uiPreferences.loadAdaptiveProgressOpen(), true);
  assert.strictEqual(
    readStoredValue(uiPreferences.ADAPTIVE_PROGRESS_OPEN_STORAGE_KEY),
    true
  );

  assert.strictEqual(uiPreferences.saveAdaptiveProgressOpen(false), false);
  assert.strictEqual(uiPreferences.loadAdaptiveProgressOpen(), false);
});

test("renders the round statistics as an always-visible section", () => {
  const component = fs.readFileSync(
    path.resolve(__dirname, "../src/components/RoundStatisticsPanel.vue"),
    "utf8"
  );
  assert(component.includes('<section\n    class="round-statistics"'));
  assert(component.includes('<header class="statistics-summary">'));
  assert(!component.includes("<details"));
  assert(!component.includes("statisticsOpen"));
  assert(!component.includes("handleStatisticsToggle"));
});

test("uses the redesigned free-training statistics overview without replacing its data views", () => {
  const component = fs.readFileSync(
    path.resolve(__dirname, "../src/components/RoundStatisticsPanel.vue"),
    "utf8"
  );
  const german = fs.readFileSync(
    path.resolve(__dirname, "../src/resources/de.js"),
    "utf8"
  );
  const english = fs.readFileSync(
    path.resolve(__dirname, "../src/resources/en.js"),
    "utf8"
  );

  assert(component.includes('class="statistics-summary-icon"'));
  assert(component.includes('class="statistics-filter-card"'));
  assert(component.includes('class="statistics-overview"'));
  assert(component.includes('class="statistics-card statistics-card-accuracy"'));
  assert(component.includes('class="empty-state-icon"'));
  assert(component.includes("<RoundHistoryChart"));
  assert(component.includes("<NormalLearningTime"));
  [
    "ROUND_STATS_OVERVIEW_LABEL",
    "ROUND_STATS_OVERVIEW_DESCRIPTION",
    "ROUND_STATS_NO_ROUNDS",
    "ROUND_STATS_FILTER_TITLE",
    "ROUND_STATS_FILTER_DESCRIPTION",
    "ROUND_STATS_RESULTS_TITLE",
    "ROUND_STATS_EMPTY_TITLE"
  ].forEach(key => {
    assert(german.includes(`${key}:`));
    assert(english.includes(`${key}:`));
  });
});

test("uses the translucent card treatment for filters, empty results and learning times", () => {
  const statisticsPanel = fs.readFileSync(
    path.resolve(__dirname, "../src/components/RoundStatisticsPanel.vue"),
    "utf8"
  );
  const learningTimes = fs.readFileSync(
    path.resolve(__dirname, "../src/components/NormalLearningTime.vue"),
    "utf8"
  );
  [statisticsPanel, learningTimes].forEach(component => {
    assert(component.includes("background: rgba(255, 255, 255, 0.78);"));
    assert(component.includes("-webkit-backdrop-filter: blur(2px);"));
    assert(component.includes("backdrop-filter: blur(2px);"));
  });
  assert(statisticsPanel.includes(".statistics-filter-card,"));
  assert(statisticsPanel.includes(".empty-state {"));
  assert(learningTimes.includes(".normal-learning-times {"));
});

test("always exposes adaptive progress and its history chart without a disclosure", () => {
  const component = fs.readFileSync(
    path.resolve(__dirname, "../src/components/AdaptiveMenu.vue"),
    "utf8"
  );
  assert(component.includes('aria-labelledby="adaptive-progress-title"'));
  assert(!component.includes("<details"));
  assert(!component.includes("<summary"));
  assert(!component.includes("adaptiveProgressOpen"));
  assert(component.includes(':history="progressStore.history"'));
  assert(component.includes(':statistics-snapshot="progressStore.statisticsSnapshot"'));
  assert(component.includes(':input-group="progressStore.inputGroup"'));
});

test("uses complete IndexedDB snapshots and bounded adaptive trend pages", () => {
  const component = fs.readFileSync(
    path.resolve(__dirname, "../src/components/AdaptiveHistoryChart.vue"),
    "utf8"
  );
  assert(component.includes("statisticsSnapshot.readyForDisplay === true"));
  assert(component.includes("summarizeAdaptiveLearningTimeWindows"));
  assert(component.includes("SingleNotesLearningStorage.readTrendPage"));
  assert(component.includes("this.trendHistory.overallTrend"));
});

test("mounts the adaptive chart only after its statistics view is visible", () => {
  const menu = fs.readFileSync(
    path.resolve(__dirname, "../src/components/AdaptiveMenu.vue"),
    "utf8"
  );
  const keyboard = fs.readFileSync(
    path.resolve(__dirname, "../src/components/AdaptiveProgressKeyboard.vue"),
    "utf8"
  );
  const german = fs.readFileSync(
    path.resolve(__dirname, "../src/resources/de.js"),
    "utf8"
  );

  assert(menu.includes('v-if="activeView === \'statistics\'"'));
  assert(!menu.includes('v-show="activeView === \'statistics\'"'));
  assert(keyboard.includes("ADAPTIVE_PROGRESS_NOTE_VIEW"));
  assert(keyboard.includes('role="tablist"'));
  assert(keyboard.includes(":aria-selected=\"selectedView === view.value ? 'true' : 'false'\""));
  assert(!keyboard.includes('label: this.$t("ADAPTIVE_PROGRESS_PIANO_BASS")'));
  assert(!keyboard.includes('label: this.$t("ADAPTIVE_PROGRESS_PIANO_TREBLE")'));
  assert(german.includes("Der gemeinsame Lernstand bleibt unverändert."));
});

test("routes the adaptive dashboard and game through the selected input group", () => {
  const menu = fs.readFileSync(
    path.resolve(__dirname, "../src/components/AdaptiveMenu.vue"),
    "utf8"
  );
  const game = fs.readFileSync(
    path.resolve(__dirname, "../src/components/Game.vue"),
    "utf8"
  );

  assert(menu.includes('"options.inputMode": "updateInputMode"'));
  assert(menu.includes("this.progressStore.loadFromDatabase(inputMode)"));
  assert(menu.includes("AdaptiveProgress.loadFromDatabase(this.options.inputMode)"));
  assert(menu.includes("ADAPTIVE_PROGRESS_INPUT_LABEL"));
  assert(menu.includes("input: progressInputLabel"));
  assert(game.includes("AdaptiveProgress.loadFromDatabase(this.options.inputMode)"));
});

test("records a manually ended unlimited round while timed rounds still abort", () => {
  const game = fs.readFileSync(
    path.resolve(__dirname, "../src/components/Game.vue"),
    "utf8"
  );
  assert.strictEqual((game.match(/@click="handleRoundExit"/g) || []).length, 2);
  assert(game.includes("handleRoundExit(){"));
  assert(game.includes("if(this.options.gameLength){\n        this.quit();"));
  assert(game.includes("this.onGameFinished();\n    },\n    quit(){"));

  statistics.init();
  const record = statistics.addRound(
    createResult({ score: 0 }),
    createOptions({ gameLength: 0 }),
    { id: "round-unlimited", completedAt: 1788960000000 }
  );
  const storedHistory = readStoredValue(roundHistory.ROUND_HISTORY_STORAGE_KEY);
  assert.strictEqual(record.settings.durationSeconds, 0);
  assert.strictEqual(storedHistory.rounds.length, 1);
  assert.strictEqual(storedHistory.rounds[0].id, "round-unlimited");
  assert.strictEqual(storedHistory.rounds[0].numAnswers, 20);
});

test("removes hidden alto and tenor clefs from saved normal settings", () => {
  global.localStorage.setItem("options", JSON.stringify({
    data: createOptions({
      clef: ["bass", "alto", "tenor"],
      customDefaultsVersion: 2,
      customClefDefaultsVersion: 1
    })
  }));

  normalOptions.loadOptions();
  assert.deepStrictEqual(normalOptions.clef, ["bass"]);
  assert.deepStrictEqual(readStoredValue("options").clef, ["bass"]);

  global.localStorage.setItem("options", JSON.stringify({
    data: createOptions({
      clef: ["tenor"],
      customDefaultsVersion: 2,
      customClefDefaultsVersion: 1
    })
  }));

  normalOptions.loadOptions();
  assert.deepStrictEqual(normalOptions.clef, ["treble"]);
  assert.deepStrictEqual(readStoredValue("options").clef, ["treble"]);
});

test("creates unique stable identifiers for completed rounds", () => {
  const first = roundHistory.createRoundId(1788960000000);
  const second = roundHistory.createRoundId(1788960000000);
  assert.notStrictEqual(first, second);
  assert(first.indexOf("round-") === 0);
});

test("captures all normal-round metrics and settings", () => {
  const options = createOptions({
    gameLength: 300,
    difficulty: "custom",
    clef: ["treble", "bass"],
    customMinValue: 31,
    customMaxValue: 72,
    customTrebleMinValue: 47,
    customBassMaxValue: 59,
    accidentals: "sharpAndFlat",
    inputMode: "keyboard"
  });
  const record = roundHistory.createNormalRoundRecord(
    createResult(),
    options,
    { id: "round-test", completedAt: 1788960000000 }
  );

  assert.strictEqual(record.schemaVersion, 1);
  assert.strictEqual(record.id, "round-test");
  assert.strictEqual(record.completedAt, 1788960000000);
  assert.strictEqual(record.mode, "normal");
  assert.strictEqual(record.score, 320);
  assert.strictEqual(record.accuracy, 80);
  assert.strictEqual(record.numAnswers, 20);
  assert.strictEqual(record.numCorrect, 16);
  assert.strictEqual(record.numWrong, 4);
  assert.deepStrictEqual(record.settings, {
    durationSeconds: 300,
    difficulty: "custom",
    statisticsDifficulty: "custom-31-72-piano-47-59",
    clefs: ["bass", "treble"],
    noteRange: { min: 31, max: 72 },
    clefRanges: [
      { clef: "bass", min: 31, max: 59 },
      { clef: "treble", min: 47, max: 72 }
    ],
    clefTransition: { trebleMinValue: 47, bassMaxValue: 59 },
    accidentals: "sharpAndFlat",
    inputMode: "keyboard"
  });
});

test("records a bass-treble gap without changing the history schema", () => {
  const record = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions({
      difficulty: "custom",
      clef: ["bass", "treble"],
      customMinValue: 36,
      customMaxValue: 67,
      customTrebleMinValue: 55,
      customBassMaxValue: 48
    }),
    { id: "round-gap", completedAt: 1788960000000 }
  );
  assert.deepStrictEqual(record.settings.clefRanges, [
    { clef: "bass", min: 36, max: 48 },
    { clef: "treble", min: 55, max: 67 }
  ]);
  assert.deepStrictEqual(record.settings.clefTransition, {
    trebleMinValue: 55,
    bassMaxValue: 48
  });
});

test("captures fully independent custom bass and treble ranges", () => {
  const record = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions({
      difficulty: "custom",
      clef: ["piano"],
      customMinValue: 67,
      customMaxValue: 45,
      customTrebleMinValue: 36,
      customBassMaxValue: 81
    }),
    { id: "round-inverted-clefs", completedAt: 1788960000000 }
  );
  assert.strictEqual(
    record.settings.statisticsDifficulty,
    "custom-independent-bass-67-81-treble-36-45"
  );
  assert.deepStrictEqual(record.settings.noteRange, { min: 36, max: 81 });
  assert.deepStrictEqual(record.settings.clefRanges, [
    { clef: "bass", min: 67, max: 81 },
    { clef: "treble", min: 36, max: 45 }
  ]);
});

test("captures only the saved range of a selected single clef", () => {
  const sharedOptions = {
    difficulty: "custom",
    customMinValue: 67,
    customMaxValue: 45,
    customTrebleMinValue: 36,
    customBassMaxValue: 81
  };
  const bassRecord = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions(Object.assign({ clef: ["bass"] }, sharedOptions)),
    { id: "round-bass-only", completedAt: 1788960000000 }
  );
  const trebleRecord = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions(Object.assign({ clef: ["treble"] }, sharedOptions)),
    { id: "round-treble-only", completedAt: 1788960000000 }
  );
  assert.strictEqual(bassRecord.settings.statisticsDifficulty, "custom-67-81");
  assert.deepStrictEqual(bassRecord.settings.noteRange, { min: 67, max: 81 });
  assert.deepStrictEqual(bassRecord.settings.clefRanges, [
    { clef: "bass", min: 67, max: 81 }
  ]);
  assert.strictEqual(trebleRecord.settings.statisticsDifficulty, "custom-36-45");
  assert.deepStrictEqual(trebleRecord.settings.noteRange, { min: 36, max: 45 });
  assert.deepStrictEqual(trebleRecord.settings.clefRanges, [
    { clef: "treble", min: 36, max: 45 }
  ]);
});

test("captures the effective combined range for standard piano rounds", () => {
  const record = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions({ clef: ["piano"] }),
    { id: "round-piano", completedAt: 1788960000000 }
  );
  assert.deepStrictEqual(record.settings.noteRange, { min: 28, max: 69 });
  assert.deepStrictEqual(record.settings.clefRanges, [
    { clef: "bass", min: 28, max: 48 },
    { clef: "treble", min: 48, max: 69 }
  ]);
  assert.strictEqual(record.settings.clefTransition, null);
});

test("stores round history without replacing existing score statistics", () => {
  global.localStorage.setItem("lastScores", JSON.stringify({ data: [12, 24] }));
  global.localStorage.setItem("record", JSON.stringify({ data: 90 }));
  statistics.init();
  statistics.loadStatistics(["treble"], "normal", "no");
  assert.deepStrictEqual(statistics.lastScores, [12, 24]);
  assert.strictEqual(statistics.record, 90);

  const record = statistics.addRound(
    createResult({ score: 120 }),
    createOptions(),
    { id: "round-persisted", completedAt: 1788960000000 }
  );
  assert.strictEqual(record.id, "round-persisted");
  assert.deepStrictEqual(statistics.lastScores, [12, 24, 120]);
  assert.strictEqual(statistics.record, 120);
  assert.deepStrictEqual(readStoredValue("lastScores"), [12, 24]);
  assert.strictEqual(readStoredValue("record"), 90);

  const storedHistory = readStoredValue(roundHistory.ROUND_HISTORY_STORAGE_KEY);
  assert.strictEqual(storedHistory.version, 1);
  assert.strictEqual(storedHistory.rounds.length, 1);
  assert.strictEqual(storedHistory.rounds[0].id, "round-persisted");

  statistics.rounds = [];
  statistics.init();
  assert.strictEqual(statistics.rounds.length, 1);
  assert.strictEqual(statistics.rounds[0].score, 120);
});

test("keeps using the existing score key when clefs have a legacy order", () => {
  const options = createOptions({ clef: ["treble", "bass"] });
  const scoresKey = "lastScores__treble_bass__normal__no";
  global.localStorage.setItem(scoresKey, JSON.stringify({ data: [45] }));
  statistics.init();
  statistics.addRound(
    createResult({ score: 75 }),
    options,
    { id: "round-clef-order", completedAt: 1788960000000 }
  );
  assert.deepStrictEqual(readStoredValue(scoresKey), [45, 75]);
  assert.deepStrictEqual(statistics.rounds[0].settings.clefs, ["bass", "treble"]);
});

test("takes a snapshot that is independent from later option changes", () => {
  const options = createOptions({ clef: ["bass", "treble"] });
  const record = roundHistory.createNormalRoundRecord(
    createResult(),
    options,
    { id: "round-snapshot", completedAt: 1788960000000 }
  );
  options.clef.push("alto");
  options.gameLength = 20;
  assert.deepStrictEqual(record.settings.clefs, ["bass", "treble"]);
  assert.strictEqual(record.settings.durationSeconds, 60);
});

test("repairs an invalid stored history without touching other data", () => {
  global.localStorage.setItem(
    roundHistory.ROUND_HISTORY_STORAGE_KEY,
    JSON.stringify({ data: { version: 99, rounds: "invalid" } })
  );
  global.localStorage.setItem("options", "keep-me");
  statistics.init();
  assert.deepStrictEqual(statistics.rounds, []);
  assert.strictEqual(global.localStorage.getItem("options"), "keep-me");
});

test("filters rounds by the complete current settings", () => {
  const currentOptions = createOptions({
    difficulty: "custom",
    clef: ["treble", "bass"],
    inputMode: "keyboard"
  });
  const matching = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions({
      difficulty: "custom",
      clef: ["bass", "treble"],
      inputMode: "keyboard"
    }),
    { id: "round-matching", completedAt: 1000 }
  );
  const differentDuration = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions({
      difficulty: "custom",
      clef: ["bass", "treble"],
      inputMode: "keyboard",
      gameLength: 300
    }),
    { id: "round-different", completedAt: 2000 }
  );
  const filtered = roundStatistics.filterNormalRounds(
    [matching, differentDuration],
    roundStatistics.ROUND_SCOPE_CURRENT,
    currentOptions
  );
  assert.deepStrictEqual(filtered.map(round => round.id), ["round-matching"]);
});

test("keeps MIDI statistics separate while combining both screen inputs", () => {
  const buttonRound = roundHistory.createNormalRoundRecord(
    createResult({ score: 100 }),
    createOptions({ inputMode: "button" }),
    { id: "round-button", completedAt: 1000 }
  );
  const pianoRound = roundHistory.createNormalRoundRecord(
    createResult({ score: 200 }),
    createOptions({ inputMode: "keyboard" }),
    { id: "round-piano-input", completedAt: 2000 }
  );
  const midiRound = roundHistory.createNormalRoundRecord(
    createResult({ score: 300 }),
    createOptions({ inputMode: "midi" }),
    { id: "round-midi", completedAt: 3000 }
  );
  const rounds = [buttonRound, pianoRound, midiRound];

  assert.strictEqual(roundStatistics.getRoundInputGroup("button"), "screen");
  assert.strictEqual(roundStatistics.getRoundInputGroup("keyboard"), "screen");
  assert.strictEqual(roundStatistics.getRoundInputGroup("midi"), "midi");

  const screenRounds = roundStatistics.filterNormalRounds(
    rounds,
    roundStatistics.ROUND_SCOPE_CURRENT,
    createOptions({ inputMode: "button" }),
    "",
    roundStatistics.ROUND_INPUT_SCREEN
  );
  const midiRounds = roundStatistics.filterNormalRounds(
    rounds,
    roundStatistics.ROUND_SCOPE_CURRENT,
    createOptions({ inputMode: "button" }),
    "",
    roundStatistics.ROUND_INPUT_MIDI
  );

  assert.deepStrictEqual(
    screenRounds.map(round => round.id),
    ["round-button", "round-piano-input"]
  );
  assert.deepStrictEqual(midiRounds.map(round => round.id), ["round-midi"]);
  assert.strictEqual(
    roundStatistics.summarizeNormalRounds(screenRounds).record,
    200
  );
  assert.strictEqual(
    roundStatistics.summarizeNormalRounds(midiRounds).record,
    300
  );
});

test("filters all custom rounds independently from their exact range", () => {
  const firstCustom = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions({ difficulty: "custom", customMinValue: 28, customMaxValue: 60 }),
    { id: "round-custom-one", completedAt: 1000 }
  );
  const secondCustom = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions({ difficulty: "custom", customMinValue: 36, customMaxValue: 72 }),
    { id: "round-custom-two", completedAt: 2000 }
  );
  const standard = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions({ difficulty: "normal" }),
    { id: "round-standard", completedAt: 3000 }
  );
  const filtered = roundStatistics.filterNormalRounds(
    [firstCustom, secondCustom, standard],
    roundStatistics.ROUND_SCOPE_ALL_CUSTOM
  );
  assert.deepStrictEqual(
    filtered.map(round => round.id),
    ["round-custom-one", "round-custom-two"]
  );
});

test("lists and filters individual custom configurations", () => {
  const firstSettings = createOptions({
    difficulty: "custom",
    customMinValue: 28,
    customMaxValue: 60,
    gameLength: 20
  });
  const secondSettings = createOptions({
    difficulty: "custom",
    customMinValue: 36,
    customMaxValue: 72,
    gameLength: 300
  });
  const first = roundHistory.createNormalRoundRecord(
    createResult(),
    firstSettings,
    { id: "round-custom-first", completedAt: 1000 }
  );
  const second = roundHistory.createNormalRoundRecord(
    createResult(),
    secondSettings,
    { id: "round-custom-second", completedAt: 2000 }
  );
  const firstAgain = roundHistory.createNormalRoundRecord(
    createResult(),
    firstSettings,
    { id: "round-custom-first-again", completedAt: 3000 }
  );
  const standard = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions(),
    { id: "round-standard", completedAt: 4000 }
  );
  const rounds = [first, second, firstAgain, standard];
  const configurations = roundStatistics.listCustomRoundConfigurations(rounds);

  assert.strictEqual(configurations.length, 2);
  assert.strictEqual(configurations[0].roundCount, 2);
  assert.strictEqual(configurations[0].latestCompletedAt, 3000);
  assert.strictEqual(configurations[1].roundCount, 1);
  const filtered = roundStatistics.filterNormalRounds(
    rounds,
    roundStatistics.ROUND_SCOPE_ALL_CUSTOM,
    null,
    configurations[0].signature
  );
  assert.deepStrictEqual(
    filtered.map(round => round.id),
    ["round-custom-first", "round-custom-first-again"]
  );
});

test("keeps adaptive or malformed data out of normal totals", () => {
  const normal = roundHistory.createNormalRoundRecord(
    createResult(),
    createOptions(),
    { id: "round-normal", completedAt: 1000 }
  );
  const filtered = roundStatistics.filterNormalRounds(
    [normal, Object.assign({}, normal, { id: "adaptive", mode: "adaptive" }), null],
    roundStatistics.ROUND_SCOPE_TOTAL
  );
  assert.deepStrictEqual(filtered.map(round => round.id), ["round-normal"]);
});

test("summarizes cards from filtered rounds with weighted accuracy", () => {
  const earlier = roundHistory.createNormalRoundRecord(
    createResult({
      score: 100,
      accuracy: 80,
      numAnswers: 10,
      numCorrect: 8,
      numWrong: 2
    }),
    createOptions(),
    { id: "round-earlier", completedAt: 1000 }
  );
  const later = roundHistory.createNormalRoundRecord(
    createResult({
      score: 200,
      accuracy: 50,
      numAnswers: 2,
      numCorrect: 1,
      numWrong: 1
    }),
    createOptions(),
    { id: "round-later", completedAt: 2000 }
  );
  assert.deepStrictEqual(
    roundStatistics.summarizeNormalRounds([later, earlier]),
    {
      roundCount: 2,
      latestScore: 200,
      latestCompletedAt: 2000,
      record: 200,
      averageScore: 150,
      averageAccuracy: 75,
      averageResponseTimeMs: null,
      timedNoteCount: 0,
      playedExercises: 9,
      totalAnswers: 12,
      totalCorrect: 9,
      totalWrong: 3
    }
  );
});

test("returns an empty but displayable summary when no rounds match", () => {
  assert.deepStrictEqual(roundStatistics.summarizeNormalRounds([]), {
    roundCount: 0,
    latestScore: null,
    latestCompletedAt: null,
    record: 0,
    averageScore: 0,
    averageAccuracy: 0,
    averageResponseTimeMs: null,
    timedNoteCount: 0,
    playedExercises: 0,
    totalAnswers: 0,
    totalCorrect: 0,
    totalWrong: 0
  });
});

test("creates a chronological chart from only the latest rounds", () => {
  const rounds = [];
  for (let index = 0; index < 12; index += 1) {
    rounds.push(roundHistory.createNormalRoundRecord(
      createResult({ score: (index + 1) * 10, accuracy: 50 + index }),
      createOptions(),
      { id: `round-chart-${index + 1}`, completedAt: 1000 + index }
    ));
  }
  rounds.reverse();

  const points = roundStatistics.createRoundChartPoints(rounds, "score");
  assert.strictEqual(points.length, 10);
  assert.deepStrictEqual(
    points.map(point => point.id),
    rounds.slice(0, 10).reverse().map(round => round.id)
  );
  assert.deepStrictEqual(
    points.map(point => point.value),
    [30, 40, 50, 60, 70, 80, 90, 100, 110, 120]
  );
  assert.strictEqual(points[0].round.id, "round-chart-3");
  assert.strictEqual(points[9].round.id, "round-chart-12");
});

test("shows 25, 50 or every saved round in chronological order", () => {
  const rounds = [];
  for (let index = 0; index < 60; index += 1) {
    rounds.push(roundHistory.createNormalRoundRecord(
      createResult({ score: index + 1 }),
      createOptions(),
      { id: `round-history-${index + 1}`, completedAt: 1000 + index }
    ));
  }
  rounds.reverse();

  const latest25 = roundStatistics.createRoundChartPoints(rounds, "score", 25);
  const latest50 = roundStatistics.createRoundChartPoints(rounds, "score", 50);
  const all = roundStatistics.createRoundChartPoints(rounds, "score", null);
  assert.strictEqual(latest25.length, 25);
  assert.strictEqual(latest25[0].id, "round-history-36");
  assert.strictEqual(latest25[24].id, "round-history-60");
  assert.strictEqual(latest50.length, 50);
  assert.strictEqual(latest50[0].id, "round-history-11");
  assert.strictEqual(all.length, 60);
  assert.strictEqual(all[0].id, "round-history-1");
  assert.strictEqual(all[59].id, "round-history-60");
});

test("uses bounded accuracy values for the chart", () => {
  const low = roundHistory.createNormalRoundRecord(
    createResult({ accuracy: 0 }),
    createOptions(),
    { id: "round-chart-low", completedAt: 1000 }
  );
  const high = roundHistory.createNormalRoundRecord(
    createResult({ accuracy: 100 }),
    createOptions(),
    { id: "round-chart-high", completedAt: 2000 }
  );
  low.accuracy = -25;
  high.accuracy = 140;

  assert.deepStrictEqual(
    roundStatistics.createRoundChartPoints([high, low], "accuracy")
      .map(point => point.value),
    [0, 100]
  );
});

test("creates a five-round moving average for the accuracy trend", () => {
  assert.deepStrictEqual(
    roundStatistics.createMovingAverage([50, 60, 70, 80, 90, 100]),
    [50, 55, 60, 65, 70, 80]
  );
});

test("summarizes improving, declining and stable accuracy trends", () => {
  const points = values => values.map(value => ({ value }));

  assert.deepStrictEqual(
    roundStatistics.summarizeRoundTrend(points([50, 55, 80, 85])),
    { direction: "improving", difference: 30, comparedRounds: 4 }
  );
  assert.deepStrictEqual(
    roundStatistics.summarizeRoundTrend(points([90, 80, 60, 50])),
    { direction: "declining", difference: 30, comparedRounds: 4 }
  );
  assert.deepStrictEqual(
    roundStatistics.summarizeRoundTrend(points([80, 81, 79, 80])),
    { direction: "stable", difference: 1, comparedRounds: 4 }
  );
  assert.deepStrictEqual(
    roundStatistics.summarizeRoundTrend(points([80, 90, 100])),
    { direction: "insufficient", difference: null, comparedRounds: 3 }
  );
});

test("waits for enough normal-round learning days and time windows", () => {
  const rounds = [];
  for (let day = 1; day <= 6; day += 1) {
    rounds.push(createTimedRound({
      id: `normal-time-morning-${day}`,
      day,
      hour: 9,
      numAnswers: 20,
      numCorrect: 18
    }));
    rounds.push(createTimedRound({
      id: `normal-time-evening-${day}`,
      day,
      hour: 17,
      numAnswers: 20,
      numCorrect: 12
    }));
  }

  const result = normalLearningTime.summarizeNormalLearningTimes(
    rounds,
    roundStatistics.ROUND_INPUT_SCREEN
  );
  assert.strictEqual(result.ready, false);
  assert.strictEqual(result.recordedDays, 6);
  assert.strictEqual(result.eligibleBucketCount, 2);
  assert.strictEqual(result.best, null);
});

test("recommends separate normal learning times for screen and MIDI", () => {
  const rounds = [];
  for (let day = 1; day <= 7; day += 1) {
    rounds.push(createTimedRound({
      id: `screen-morning-${day}`,
      day,
      hour: 9,
      numAnswers: 20,
      numCorrect: 18
    }));
    rounds.push(createTimedRound({
      id: `screen-evening-${day}`,
      day,
      hour: 17,
      numAnswers: 20,
      numCorrect: 12
    }));
    rounds.push(createTimedRound({
      id: `midi-morning-${day}`,
      day,
      hour: 9,
      inputMode: "midi",
      numAnswers: 30,
      numCorrect: 12
    }));
    rounds.push(createTimedRound({
      id: `midi-evening-${day}`,
      day,
      hour: 17,
      inputMode: "midi",
      numAnswers: 20,
      numCorrect: 16
    }));
  }

  const screen = normalLearningTime.summarizeNormalLearningTimes(
    rounds,
    roundStatistics.ROUND_INPUT_SCREEN
  );
  const midi = normalLearningTime.summarizeNormalLearningTimes(
    rounds,
    roundStatistics.ROUND_INPUT_MIDI
  );
  assert.strictEqual(screen.ready, true);
  assert.strictEqual(screen.best.startHour, 8);
  assert.strictEqual(screen.best.accuracy, 90);
  assert.strictEqual(screen.mostChallenging.startHour, 16);
  assert.strictEqual(screen.mostChallenging.accuracy, 60);
  assert.strictEqual(midi.ready, true);
  assert.strictEqual(midi.best.startHour, 16);
  assert.strictEqual(midi.best.accuracy, 80);
  assert.strictEqual(midi.mostChallenging.startHour, 8);
  assert.strictEqual(midi.mostChallenging.accuracy, 40);
});

test("caps each normal round so an unlimited round cannot dominate", () => {
  const rounds = [];
  for (let day = 1; day <= 7; day += 1) {
    rounds.push(createTimedRound({
      id: `unlimited-perfect-${day}`,
      day,
      hour: 9,
      gameLength: 0,
      numAnswers: 1000,
      numCorrect: 1000
    }));
    rounds.push(createTimedRound({
      id: `finite-mixed-${day}`,
      day,
      hour: 9,
      numAnswers: 40,
      numCorrect: 20
    }));
  }

  const result = normalLearningTime.summarizeNormalLearningTimes(rounds);
  const morning = result.buckets.find(bucket => bucket.startHour === 8);
  assert.strictEqual(morning.accuracy, 75);
  assert.strictEqual(
    normalLearningTime.NORMAL_LEARNING_TIME_MAX_ROUND_WEIGHT,
    20
  );
});

test("shows accuracy and its smoothed trend as the default chart view", () => {
  const component = fs.readFileSync(
    path.resolve(__dirname, "../src/components/RoundHistoryChart.vue"),
    "utf8"
  );
  assert(component.includes('metric: "accuracy"'));
  assert(component.includes("series.push(this.trendValues)"));
  assert(component.includes('data.seriesIndex !== 0'));
});

test("keeps long normal and adaptive histories at a fixed chart height", () => {
  const roundChart = fs.readFileSync(
    path.resolve(__dirname, "../src/components/RoundHistoryChart.vue"),
    "utf8"
  );
  const adaptiveChart = fs.readFileSync(
    path.resolve(__dirname, "../src/components/AdaptiveHistoryChart.vue"),
    "utf8"
  );

  assert(roundChart.includes('ratio="round-chart-fixed-height"'));
  assert(roundChart.includes(".round-chart-fixed-height"));
  assert(adaptiveChart.includes('ratio="adaptive-chart-fixed-height"'));
  assert(adaptiveChart.includes(".adaptive-chart-fixed-height"));
  assert(!roundChart.includes('.chart-frame .ct-chart'));
  assert(!adaptiveChart.includes('.adaptive-chart-frame .ct-chart'));
});

test("pages extremely long histories without creating an unbounded chart", () => {
  const latest = historyChartWindow.createHistoryPage(100000);
  assert.deepStrictEqual(latest, {
    page: 2000,
    pageCount: 2000,
    pageSize: 50,
    totalCount: 100000,
    startIndex: 99950,
    endIndex: 100000,
    firstNumber: 99951,
    lastNumber: 100000
  });

  const previous = historyChartWindow.createHistoryPage(100000, 1999);
  assert.strictEqual(previous.firstNumber, 99901);
  assert.strictEqual(previous.lastNumber, 99950);
  assert.strictEqual(historyChartWindow.createHistoryPage(100000, 9999).page, 2000);
});

test("uses compact relative axis labels but preserves exact large ranges", () => {
  assert.strictEqual(historyChartWindow.formatHistoryNumber(100000, "de"), "100.000");
  assert.strictEqual(historyChartWindow.formatHistoryNumber(100000, "en"), "100,000");
  assert.strictEqual(historyChartWindow.formatCompactHistoryNumber(1000, "de"), "1 Tsd.");
  assert.strictEqual(historyChartWindow.formatCompactHistoryNumber(10000, "de"), "10 Tsd.");
  assert.strictEqual(historyChartWindow.formatCompactHistoryNumber(100000, "de"), "100 Tsd.");

  const labels = historyChartWindow.createHistoryAxisLabels(99991, 10, "de");
  assert.strictEqual(labels[0], "≈100 Tsd.");
  assert.strictEqual(labels[1], "+1");
  assert.strictEqual(labels[9], "+9");
  assert(historyChartWindow.shouldShowHistoryAxisLabel(0, 50));
  assert(historyChartWindow.shouldShowHistoryAxisLabel(49, 50));
});

test("uses the bounded history pages in both chart components", () => {
  const roundChart = fs.readFileSync(
    path.resolve(__dirname, "../src/components/RoundHistoryChart.vue"),
    "utf8"
  );
  const adaptiveChart = fs.readFileSync(
    path.resolve(__dirname, "../src/components/AdaptiveHistoryChart.vue"),
    "utf8"
  );

  [roundChart, adaptiveChart].forEach(component => {
    assert(component.includes("createHistoryPage"));
    assert(component.includes("createHistoryAxisLabels"));
    assert(component.includes("shouldShowHistoryAxisLabel"));
  });
  assert(roundChart.includes("ROUND_STATS_CHART_VISIBLE_RANGE"));
  assert(adaptiveChart.includes("ADAPTIVE_TREND_VISIBLE_RANGE"));
  assert(adaptiveChart.includes("ADAPTIVE_TREND_DETAIL_NUMBER"));
});

test("shows normal learning times for the selected input group", () => {
  const panel = fs.readFileSync(
    path.resolve(__dirname, "../src/components/RoundStatisticsPanel.vue"),
    "utf8"
  );
  const learningTime = fs.readFileSync(
    path.resolve(__dirname, "../src/components/NormalLearningTime.vue"),
    "utf8"
  );
  assert(panel.includes("<NormalLearningTime"));
  assert(panel.includes("ROUND_SCOPE_TOTAL"));
  assert(panel.includes(":input-label=\"selectedInputLabel\""));
  assert(learningTime.includes("summarizeNormalLearningTimes(this.rounds)"));
  assert(learningTime.includes("ROUND_TIME_PENDING"));
});

test("exposes filtered summaries through the statistics store", () => {
  statistics.rounds = [
    roundHistory.createNormalRoundRecord(
      createResult({ score: 123 }),
      createOptions(),
      { id: "round-store", completedAt: 1000 }
    )
  ];
  const summary = statistics.getRoundSummary(
    roundStatistics.ROUND_SCOPE_TOTAL
  );
  assert.strictEqual(summary.roundCount, 1);
  assert.strictEqual(summary.latestScore, 123);
});


test("averages measured free-note responses by note count and retains them across storage", () => {
  const first = roundHistory.createNormalRoundRecord(createResult({
    numCorrect: 2, timedNoteCount: 2, responseTimeTotalMs: 2000
  }), createOptions());
  const second = roundHistory.createNormalRoundRecord(createResult({
    numCorrect: 1, timedNoteCount: 1, responseTimeTotalMs: 4000
  }), createOptions());
  const old = roundHistory.createNormalRoundRecord(createResult(), createOptions());
  const restored = JSON.parse(JSON.stringify([first, second, old]));
  const summary = roundStatistics.summarizeNormalRounds(restored);
  assert.strictEqual(summary.averageResponseTimeMs, 2000);
  assert.strictEqual(summary.timedNoteCount, 3);
  assert.strictEqual(roundStatistics.summarizeNormalRounds([old]).averageResponseTimeMs, null);
});

test("keeps neighboring two-hour windows and midnight separate for free training", () => {
  const rounds = [1, 2, 3, 4, 5, 6, 7].reduce((items, day) => items.concat([
    createTimedRound({ id: `early-${day}`, day, hour: 9, numAnswers: 20, numCorrect: 18 }),
    createTimedRound({ id: `late-${day}`, day, hour: 10, numAnswers: 20, numCorrect: 10 }),
    createTimedRound({ id: `night-${day}`, day, hour: 23, numAnswers: 20, numCorrect: 14 })
  ]), []);
  const result = normalLearningTime.summarizeNormalLearningTimes(rounds);
  assert.strictEqual(result.buckets.length, 12);
  assert.strictEqual(result.best.startHour, 8);
  assert.strictEqual(result.mostChallenging.startHour, 10);
  assert.strictEqual(normalLearningTime.formatLearningTimeRange(22), "22:00–24:00");
  assert.strictEqual(result.buckets[0].exerciseCount, 0);
});
