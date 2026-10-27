const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");

function loadEsModule(filePath) {
  const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
  const originalLoader = Module._extensions[".js"];
  Module._extensions[".js"] = function transpileProjectModule(
    loadedModule,
    filename
  ) {
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

const adaptiveHistory = loadEsModule(
  path.resolve(__dirname, "../src/model/AdaptiveHistory.js")
);
const migration = loadEsModule(
  path.resolve(__dirname, "../src/model/SingleNotesHistoryMigration.js")
);

function evaluation(id, completedAt, correctFirstTry, responseTimeMs) {
  return adaptiveHistory.createAdaptiveEvaluation({
    clef: "treble",
    staff: "piano",
    value: 60,
    isSharp: true
  }, correctFirstTry, correctFirstTry ? 0 : 2, responseTimeMs, {
    id,
    completedAt
  });
}

function historyWith(evaluations) {
  return {
    version: 1,
    baselines: [],
    evaluations
  };
}

test("creates a deterministic migration plan from unique legacy evaluations", () => {
  const history = historyWith([
    evaluation("legacy-2", 2000, false, null),
    evaluation("legacy-1", 1000, true, 700),
    evaluation("legacy-1", 1000, true, 700)
  ]);
  const plan = migration.createSingleNotesHistoryMigrationPlan(
    history,
    "screen:single-notes"
  );
  assert.strictEqual(plan.attempts.length, 2);
  assert.deepStrictEqual(
    plan.attempts.map(value => value.id),
    ["legacy-1", "legacy-2"]
  );
  assert.strictEqual(
    plan.attempts[0].sessionId,
    "screen:single-notes|legacy-history|0"
  );
  assert.strictEqual(plan.fingerprint.count, 2);
  assert.strictEqual(
    plan.signature,
    migration.formatSingleNotesHistoryFingerprint(plan.fingerprint)
  );
});

test("preserves the real session id of an already stored parallel answer", () => {
  const history = historyWith([
    evaluation("parallel-1", 1000, true, 650),
    evaluation("old-1", 2000, false, null)
  ]);
  const plan = migration.createSingleNotesHistoryMigrationPlan(
    history,
    "screen:single-notes",
    [{ id: "parallel-1", sessionId: "real-learning-round" }]
  );
  assert.strictEqual(plan.attempts[0].sessionId, "real-learning-round");
  assert.strictEqual(
    plan.attempts[1].sessionId,
    "screen:single-notes|legacy-history|0"
  );
});

test("extends the order-independent fingerprint without rereading old events", () => {
  const first = migration.createSingleNotesHistoryMigrationPlan(
    historyWith([evaluation("fingerprint-1", 1000, true, 600)]),
    "screen:single-notes"
  );
  const secondAttempt = migration.createSingleNotesHistoryMigrationPlan(
    historyWith([evaluation("fingerprint-2", 2000, false, null)]),
    "screen:single-notes"
  ).attempts[0];
  const extended = migration.extendSingleNotesHistoryFingerprint(
    first.fingerprint,
    secondAttempt
  );
  const complete = migration.createSingleNotesHistoryMigrationPlan(
    historyWith([
      evaluation("fingerprint-2", 2000, false, null),
      evaluation("fingerprint-1", 1000, true, 600)
    ]),
    "screen:single-notes"
  );
  assert.strictEqual(
    migration.singleNotesHistoryFingerprintsEqual(
      extended,
      complete.fingerprint
    ),
    true
  );
});

test("verifies attempts, aggregates and learning-time buckets together", () => {
  const plan = migration.createSingleNotesHistoryMigrationPlan(
    historyWith([
      evaluation("verify-1", 1000, true, 800),
      evaluation("verify-2", 2000, false, null)
    ]),
    "screen:single-notes"
  );
  const verification = migration.verifySingleNotesHistoryMigration({
    expectedAttempts: plan.attempts,
    storedAttempts: plan.attempts.slice(),
    dashboard: {
      statistics: {
        attemptCount: 2,
        correctFirstTryCount: 1,
        mistakeCount: 2,
        responseTimeTotalMs: 800,
        timedAttemptCount: 1,
        lastCompletedAt: 2000
      }
    },
    timeBuckets: [{
      attemptCount: 2,
      correctFirstTryCount: 1,
      mistakeCount: 2,
      responseTimeTotalMs: 800,
      timedAttemptCount: 1
    }]
  });
  assert.strictEqual(verification.verified, true);

  const wrongOrder = migration.verifySingleNotesHistoryMigration({
    expectedAttempts: plan.attempts,
    storedAttempts: plan.attempts.slice().reverse(),
    dashboard: { statistics: verification.storedStatistics },
    timeBuckets: [verification.storedTimeSummary]
  });
  assert.strictEqual(wrongOrder.verified, false);
  assert.strictEqual(wrongOrder.fingerprintsEqual, true);
  assert.strictEqual(wrongOrder.attemptsEqual, false);

  const broken = migration.verifySingleNotesHistoryMigration({
    expectedAttempts: plan.attempts,
    storedAttempts: plan.attempts.slice(0, 1),
    dashboard: { statistics: verification.storedStatistics },
    timeBuckets: [verification.storedTimeSummary]
  });
  assert.strictEqual(broken.verified, false);
  assert.strictEqual(broken.attemptsEqual, false);
});

process.stdout.write("Single-notes history migration tests passed.\n");
