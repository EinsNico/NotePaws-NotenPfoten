const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function loadProjectModule(mod, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(mod, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  return mod._compile(transformed.code, filename);
};
const {
  SHADOW_IMPORT_JOURNAL_KEY,
  commitStagedShadowImport,
  recoverPendingShadowImport
} = require("../src/model/SaveDataShadowCommit.js");
const {
  ACTIVE_LEARNING_DATABASE_KEY,
  LEGACY_LEARNING_DATABASE_NAME
} = require("../src/model/LearningDatabaseGeneration.js");
const { readActiveMergeGuard } = require(
  "../src/model/SaveDataLargeMergePreparation.js"
);
const { snapshotMergeLocalStorage } = require(
  "../src/model/SaveDataLargeMergeLocalPlan.js"
);
Module._extensions[".js"] = originalLoader;

const target = "noten-pfoten-learning-import-commit-test";
function storage() {
  const values = new Map([
    ["options", JSON.stringify({ data: { difficulty: "old" } })],
    ["lastScores__old", JSON.stringify({ data: [12] })]
  ]);
  let failKey = null;
  return {
    values,
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] || null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (key === failKey) {
        failKey = null;
        throw new Error("Simulated storage failure");
      }
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    failNext(key) { failKey = key; }
  };
}

function input() {
  const marker = { state: "database-verified", summary: {
    source: { createdAt: "2026-09-28T12:00:00.000Z", fileSize: null },
    rounds: {}
  } };
  const shadow = {
    name: target,
    database: {
      async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
    async writeDailyTaskHistory(value) { this.dailyTaskHistory = value; },
    async readImportGenerationMarker() { return marker; },
      async markVerifiedImportReady() { marker.state = "ready"; },
      async revertUnactivatedImportReady() { marker.state = "database-verified"; }
    }
  };
  const plan = {
    generation: target,
    previousGeneration: LEGACY_LEARNING_DATABASE_NAME,
    sourceCreatedAt: "2026-09-28T12:00:00.000Z",
    sourceFileSize: null,
    estimatedBytes: 200,
    values: {
      options: JSON.stringify({ data: { difficulty: "new" } }),
      adaptiveHistory: JSON.stringify({ data: {
        version: 2, baselines: [], evaluations: []
      } })
    }
  };
  const openDatabase = async ({ name }) => {
    assert.strictEqual(name, target);
    return {
      database: {
        transaction() {
          const tx = {
            objectStore() {
              return {
                get() {
                  const request = {};
                  queueMicrotask(() => {
                    request.result = marker;
                    request.onsuccess();
                  });
                  return request;
                }
              };
            }
          };
          setImmediate(() => tx.oncomplete());
          return tx;
        }
      },
      close() {}
    };
  };
  return { marker, shadow, plan, openDatabase };
}

(async () => {
  const good = input();
  const live = storage();
  const result = await commitStagedShadowImport(
    good.plan, good.shadow, live,
    { flushCurrentWrites: async () => {}, openDatabase: good.openDatabase }
  );
  assert.strictEqual(result.committed, true);
  assert.strictEqual(live.getItem(ACTIVE_LEARNING_DATABASE_KEY), target);
  assert.strictEqual(JSON.parse(live.getItem("options")).data.difficulty, "new");
  assert.strictEqual(live.getItem("lastScores__old"), null);
  assert.strictEqual(live.getItem(SHADOW_IMPORT_JOURNAL_KEY), null);

  const merge = input();
  const mergeStorage = storage();
  let activeRoundCount = 0;
  const activeDatabase = {
    async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
    async writeDailyTaskHistory(value) { this.dailyTaskHistory = value; },
    async readNoteFlowStatistics(scope) {
      return { scope, roundCount: activeRoundCount };
    },
    async readAttemptHistoryState() {
      return { nextSequence: 0, fingerprint: null };
    },
    async readProgressSnapshot() { return []; }
  };
  merge.plan.activeGuard = await readActiveMergeGuard(activeDatabase);
  merge.plan.sourceLocalSnapshot = snapshotMergeLocalStorage(mergeStorage);
  mergeStorage.setItem("options", JSON.stringify({ data: { difficulty: "changed" } }));
  await assert.rejects(commitStagedShadowImport(
    merge.plan, merge.shadow, mergeStorage,
    { flushCurrentWrites: async () => {}, activeDatabase,
      openDatabase: merge.openDatabase }
  ), /Learning data changed after merge preparation/);
  assert.strictEqual(mergeStorage.getItem(SHADOW_IMPORT_JOURNAL_KEY), null);

  const activeChanged = input();
  const activeChangedStorage = storage();
  activeChanged.plan.activeGuard = await readActiveMergeGuard(activeDatabase);
  activeChanged.plan.sourceLocalSnapshot = snapshotMergeLocalStorage(
    activeChangedStorage
  );
  activeRoundCount = 1;
  await assert.rejects(commitStagedShadowImport(
    activeChanged.plan, activeChanged.shadow, activeChangedStorage,
    { flushCurrentWrites: async () => {}, activeDatabase,
      openDatabase: activeChanged.openDatabase }
  ), /Learning data changed after merge preparation/);
  assert.strictEqual(activeChangedStorage.getItem(SHADOW_IMPORT_JOURNAL_KEY), null);

  const validMerge = input();
  const validMergeStorage = storage();
  validMerge.plan.activeGuard = await readActiveMergeGuard(activeDatabase);
  validMerge.plan.sourceLocalSnapshot = snapshotMergeLocalStorage(
    validMergeStorage
  );
  const merged = await commitStagedShadowImport(
    validMerge.plan, validMerge.shadow, validMergeStorage,
    { flushCurrentWrites: async () => {}, activeDatabase,
      openDatabase: validMerge.openDatabase }
  );
  assert.strictEqual(merged.committed, true);

  const failed = input();
  const earlier = storage();
  earlier.failNext("options");
  await assert.rejects(commitStagedShadowImport(
    failed.plan, failed.shadow, earlier,
    { flushCurrentWrites: async () => {}, openDatabase: failed.openDatabase }
  ), /Simulated storage failure/);
  assert.strictEqual(JSON.parse(earlier.getItem("options")).data.difficulty, "old");
  assert.ok(earlier.getItem("lastScores__old"));
  assert.strictEqual(earlier.getItem(ACTIVE_LEARNING_DATABASE_KEY), null);
  assert.strictEqual(earlier.getItem(SHADOW_IMPORT_JOURNAL_KEY), null);

  const switchFailure = input();
  const switchStorage = storage();
  switchStorage.failNext(ACTIVE_LEARNING_DATABASE_KEY);
  await assert.rejects(commitStagedShadowImport(
    switchFailure.plan, switchFailure.shadow, switchStorage,
    { flushCurrentWrites: async () => {}, openDatabase: switchFailure.openDatabase }
  ), /Simulated storage failure/);
  assert.strictEqual(switchFailure.marker.state, "database-verified");
  assert.strictEqual(JSON.parse(switchStorage.getItem("options")).data.difficulty, "old");
  assert.strictEqual(switchStorage.getItem(SHADOW_IMPORT_JOURNAL_KEY), null);

  const crashed = storage();
  const journal = {
    target, previousGeneration: LEGACY_LEARNING_DATABASE_NAME,
    previous: [["options", crashed.getItem("options")],
      ["lastScores__old", crashed.getItem("lastScores__old")]]
  };
  crashed.setItem(SHADOW_IMPORT_JOURNAL_KEY, JSON.stringify(journal));
  crashed.setItem("options", good.plan.values.options);
  crashed.removeItem("lastScores__old");
  assert.strictEqual(recoverPendingShadowImport(crashed).committed, false);
  assert.strictEqual(JSON.parse(crashed.getItem("options")).data.difficulty, "old");
  assert.ok(crashed.getItem("lastScores__old"));

  crashed.setItem(SHADOW_IMPORT_JOURNAL_KEY, JSON.stringify(journal));
  crashed.setItem("options", good.plan.values.options);
  crashed.setItem(ACTIVE_LEARNING_DATABASE_KEY, target);
  assert.strictEqual(recoverPendingShadowImport(crashed).committed, true);
  assert.strictEqual(JSON.parse(crashed.getItem("options")).data.difficulty, "new");
  assert.strictEqual(crashed.getItem(SHADOW_IMPORT_JOURNAL_KEY), null);

  const noSpace = storage();
  noSpace.failNext(SHADOW_IMPORT_JOURNAL_KEY);
  await assert.rejects(commitStagedShadowImport(
    input().plan, input().shadow, noSpace,
    { flushCurrentWrites: async () => {} }
  ), /Simulated storage failure/);
  assert.strictEqual(JSON.parse(noSpace.getItem("options")).data.difficulty, "old");
  console.log("Shadow commit and recovery tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
