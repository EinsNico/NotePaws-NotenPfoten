const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

function loadEsModule(filePath) {
  const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
  const originalLoader = Module._extensions[".js"];
  Module._extensions[".js"] = function transpile(loadedModule, filename) {
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

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

const statisticsModel = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowStatistics.js")
);
const meterModel = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowMeterStatistics.js")
);

test("counts melody rounds by meter while excluding chords and old rounds", () => {
  const buckets = meterModel.createEmptyNoteFlowMeterStatistics();
  const round = (meter, correct, evaluatedInputs, exerciseType) => ({
    exerciseType,
    settings: meter ? { rhythm: { meter } } : {},
    score: { correct, evaluatedInputs }
  });
  meterModel.addNoteFlowRoundToMeterStatistics(buckets, round("3/4", 3, 4));
  meterModel.addNoteFlowRoundToMeterStatistics(buckets, round("3/4", 1, 6));
  meterModel.addNoteFlowRoundToMeterStatistics(buckets, round("6/8", 2, 2));
  meterModel.addNoteFlowRoundToMeterStatistics(buckets, round("4/4", 4, 4, "chord"));
  meterModel.addNoteFlowRoundToMeterStatistics(buckets, round(null, 2, 2));
  assert.deepStrictEqual(buckets["3/4"], {
    roundCount: 2, evaluatedNoteCount: 10, correctCount: 4
  });
  assert.strictEqual(buckets["4/4"].roundCount, 0);
  assert.strictEqual(buckets["6/8"].roundCount, 1);
  const snapshot = statisticsModel.createNoteFlowStatisticsSnapshot({
    roundCount: 4,
    rhythmByMeter: buckets
  });
  assert.deepStrictEqual(snapshot.rhythmByMeter.map(item => item.accuracy), [40, null, 100]);
  assert.strictEqual(snapshot.roundCount, 4);
});

test("counts chord rounds by their own meter without mixing melody data", () => {
  const buckets = meterModel.createEmptyNoteFlowMeterStatistics();
  const chord = (meter, correct, wrong, missed) => ({
    exerciseType: "chord",
    chord: meter ? { rhythmMeter: meter } : {},
    score: { correct, wrong, missed }
  });
  meterModel.addNoteFlowRoundToMeterStatistics(buckets,
    chord("3/4", 3, 1, 0));
  meterModel.addNoteFlowRoundToMeterStatistics(buckets,
    chord("3/4", 1, 1, 2));
  meterModel.addNoteFlowRoundToMeterStatistics(buckets,
    chord("6/8", 2, 0, 0));
  meterModel.addNoteFlowRoundToMeterStatistics(buckets,
    chord(null, 5, 0, 0));
  assert.deepStrictEqual(buckets["3/4"], {
    roundCount: 2, evaluatedNoteCount: 8, correctCount: 4
  });
  assert.strictEqual(buckets["4/4"].roundCount, 0);
  const snapshot = statisticsModel.createNoteFlowStatisticsSnapshot({
    roundCount: 4, rhythmByMeter: buckets
  });
  assert.deepStrictEqual(snapshot.rhythmByMeter.map(item => item.accuracy),
    [50, null, 100]);
  assert.strictEqual(snapshot.roundCount
    - snapshot.rhythmByMeter.reduce((sum, bucket) => sum + bucket.roundCount, 0), 1);
});

test("legacy chord aggregates request a one-time meter backfill", () => {
  const legacy = {
    scope: "midi:note-flow-chords",
    rhythmByMeter: meterModel.createEmptyNoteFlowMeterStatistics()
  };
  assert.strictEqual(meterModel.hasNoteFlowMeterStatistics(legacy), false);
  assert.strictEqual(meterModel.hasNoteFlowMeterStatistics(
    Object.assign({}, legacy, { chordMeterVersion: 1 })
  ), true);
  assert.strictEqual(meterModel.hasNoteFlowMeterStatistics({
    scope: "midi:note-flow", rhythmByMeter: legacy.rhythmByMeter
  }), true);
});

test("creates weighted Note Flow overview values from compact aggregates", () => {
  const snapshot = statisticsModel.createNoteFlowStatisticsSnapshot({
    roundCount: 4,
    normalRoundCount: 3,
    learningRoundCount: 1,
    evaluatedNoteCount: 40,
    correctCount: 30,
    wrongCount: 4,
    missedCount: 6,
    preciseCount: 20,
    earlyCount: 5,
    lateCount: 5,
    timedInputCount: 30,
    timingOffsetTotalMs: 4500,
    durationTotalMs: 300000,
    lastCompletedAt: 1790071200000
  });
  assert.strictEqual(snapshot.accuracy, 75);
  assert.strictEqual(snapshot.preciseRate, 67);
  assert.strictEqual(snapshot.averageAbsoluteOffsetMs, 150);
  assert.strictEqual(snapshot.durationTotalMs, 300000);
  assert.strictEqual(snapshot.hasResults, true);
});

test("keeps a new input group empty and displayable", () => {
  const snapshot = statisticsModel.createNoteFlowStatisticsSnapshot();
  assert.strictEqual(snapshot.hasResults, false);
  assert.strictEqual(snapshot.accuracy, 0);
  assert.strictEqual(snapshot.averageAbsoluteOffsetMs, null);
});

process.stdout.write("Note Flow statistics read-model tests passed.\n");
