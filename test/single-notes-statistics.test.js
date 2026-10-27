const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

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

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

const statistics = loadEsModule(
  path.resolve(__dirname, "../src/model/SingleNotesStatistics.js")
);
const learningTime = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveLearningTime.js")
);

function databaseValues() {
  return {
    scope: "screen:single-notes",
    loadedAt: 1789559999000,
    legacyEvaluationCount: 20,
    dashboard: {
      progress: [{ id: "progress-1" }],
      statistics: {
        attemptCount: 20,
        correctFirstTryCount: 15,
        mistakeCount: 5,
        responseTimeTotalMs: 9000,
        timedAttemptCount: 10,
        sessionCount: 2,
        lastCompletedAt: 1789559998000
      },
      recentTrend: [{
        id: "trend-0",
        segmentNumber: 0,
        startedAt: 1789550000000,
        endedAt: 1789550010000,
        attemptCount: 20,
        correctFirstTryCount: 15,
        mistakeCount: 5,
        responseTimeTotalMs: 9000,
        timedAttemptCount: 10
      }]
    },
    timeBuckets: [{
      day: "2026-09-16",
      windowHours: 2,
      windows: {
        8: {
          attemptCount: 12,
          correctFirstTryCount: 10,
          mistakeCount: 2,
          responseTimeTotalMs: 5400,
          timedAttemptCount: 6
        },
        12: {
          attemptCount: 8,
          correctFirstTryCount: 5,
          mistakeCount: 3,
          responseTimeTotalMs: 3600,
          timedAttemptCount: 4
        }
      }
    }],
    recentSessions: [{
      id: "session-2",
      startedAt: 1789550000000,
      endedAt: 1789550010000,
      attemptCount: 10,
      correctFirstTryCount: 8,
      mistakeCount: 2,
      responseTimeTotalMs: 4200,
      timedAttemptCount: 5
    }]
  };
}

test("creates a compact display-ready IndexedDB statistics snapshot", () => {
  const snapshot = statistics.createSingleNotesStatisticsSnapshot(
    databaseValues()
  );
  assert.strictEqual(snapshot.readyForDisplay, true);
  assert.strictEqual(snapshot.fallbackRequired, false);
  assert.strictEqual(snapshot.summary.firstTryAccuracy, 75);
  assert.strictEqual(snapshot.summary.averageResponseTimeMs, 900);
  assert.strictEqual(snapshot.trend.totalCount, 1);
  assert.strictEqual(snapshot.trend.recent[0].accuracy, 75);
  assert.strictEqual(snapshot.trend.recent[0].averageResponseTimeMs, 900);
  assert.strictEqual(snapshot.learningTimeWindows.length, 2);
  assert.strictEqual(snapshot.coverage.timedWindowAttempts, 20);
  assert.strictEqual(snapshot.recentSessions[0].firstTryAccuracy, 80);
  assert.strictEqual(snapshot.progressRecords.length, 1);
});

test("requires the legacy display while IndexedDB event history is incomplete", () => {
  const values = databaseValues();
  values.legacyEvaluationCount = 25;
  const snapshot = statistics.createSingleNotesStatisticsSnapshot(values);
  assert.strictEqual(snapshot.coverage.eventsComplete, false);
  assert.strictEqual(snapshot.readyForDisplay, false);
  assert.strictEqual(snapshot.fallbackRequired, true);
});

test("requires the legacy display while old time buckets lack exact two-hour windows", () => {
  const values = databaseValues();
  values.timeBuckets = [{
    day: "2026-09-16",
    attemptCount: 20,
    correctFirstTryCount: 15
  }];
  const snapshot = statistics.createSingleNotesStatisticsSnapshot(values);
  assert.strictEqual(snapshot.coverage.eventsComplete, true);
  assert.strictEqual(snapshot.coverage.learningTimesComplete, false);
  assert.strictEqual(snapshot.readyForDisplay, false);
  assert.strictEqual(snapshot.fallbackRequired, true);
});

test("represents an empty new database without fabricating results", () => {
  const snapshot = statistics.createSingleNotesStatisticsSnapshot({
    scope: "midi:single-notes"
  });
  assert.strictEqual(snapshot.summary.attemptCount, 0);
  assert.strictEqual(snapshot.summary.firstTryAccuracy, null);
  assert.strictEqual(snapshot.trend.totalCount, 0);
  assert.deepStrictEqual(snapshot.learningTimeWindows, []);
  assert.strictEqual(snapshot.readyForDisplay, true);
});

test("keeps partial trend points and the complete-history trend exact", () => {
  const values = databaseValues();
  values.legacyEvaluationCount = 85;
  values.dashboard.statistics.attemptCount = 85;
  values.dashboard.statistics.correctFirstTryCount = 60;
  values.dashboard.recentTrend = [
    { id: "trend-0", segmentNumber: 0, attemptCount: 20, correctFirstTryCount: 10 },
    { id: "trend-1", segmentNumber: 1, attemptCount: 20, correctFirstTryCount: 10 },
    { id: "trend-2", segmentNumber: 2, attemptCount: 20, correctFirstTryCount: 14 },
    { id: "trend-3", segmentNumber: 3, attemptCount: 20, correctFirstTryCount: 18 },
    { id: "trend-4", segmentNumber: 4, attemptCount: 5, correctFirstTryCount: 5 }
  ];
  values.dashboard.firstTrend = values.dashboard.recentTrend.slice(0, 5);
  values.timeBuckets = [{
    day: "2026-09-16",
    windowHours: 2,
    windows: {
      8: { attemptCount: 85, correctFirstTryCount: 60 }
    }
  }];
  const snapshot = statistics.createSingleNotesStatisticsSnapshot(values);
  assert.strictEqual(snapshot.trend.totalCount, 5);
  assert.strictEqual(snapshot.trend.pendingCount, 0);
  assert.strictEqual(snapshot.trend.recent[4].exerciseCount, 5);
  assert.strictEqual(snapshot.trend.overallTrend.direction, "improving");
  assert.strictEqual(snapshot.trend.overallTrend.difference, 45);
});

test("reconstructs fair day-weighted learning times from database windows", () => {
  const windows = [];
  for (let day = 1; day <= 7; day += 1) {
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    windows.push({
      day: date,
      startHour: 8,
      attemptCount: 10,
      correctFirstTryCount: 9,
      averageResponseTimeMs: 700
    });
    windows.push({
      day: date,
      startHour: 16,
      attemptCount: 20,
      correctFirstTryCount: 10,
      averageResponseTimeMs: 1200
    });
  }
  const result = learningTime.summarizeAdaptiveLearningTimeWindows(windows);
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.buckets.length, 12);
  assert.strictEqual(result.recordedDays, 7);
  assert.strictEqual(result.best.startHour, 8);
  assert.strictEqual(result.best.accuracy, 90);
  assert.strictEqual(result.mostChallenging.startHour, 16);
  assert.strictEqual(result.mostChallenging.accuracy, 50);
  assert.strictEqual(result.best.dayCount, 7);
});

process.stdout.write("Single-notes statistics read-model tests passed.\n");

test("does not label old four-hour summaries as precise two-hour data", () => {
  const values = databaseValues();
  delete values.timeBuckets[0].windowHours;
  const result = statistics.createSingleNotesStatisticsSnapshot(values);
  assert.strictEqual(result.fallbackRequired, true);
  assert.deepStrictEqual(result.learningTimeWindows, []);
});
