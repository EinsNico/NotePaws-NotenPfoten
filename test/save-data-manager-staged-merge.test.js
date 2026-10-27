const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");

global.regeneratorRuntime = require("babel-runtime/regenerator");
const source = fs.readFileSync(path.join(
  __dirname, "../src/components/SaveDataManager.vue"
), "utf8");
const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
const calls = [];
let failAt = null;
let cancelDuringPreparation = null;
const shadow = {
  name: "noten-pfoten-learning-import-ui-merge-test",
  database: { close() { calls.push("close shadow"); } }
};
const activeDatabase = { close() { calls.push("close active"); } };
const modules = {
  "../model/PersistenceFeedback": { hasPersistenceFailure: () => false },
  "../model/SaveDataBackup": { BACKUP_VALIDATION_ERRORS: {} },
  "../model/SaveDataFiles": {},
  "../model/SaveDataImportStaging": {},
  "../model/SaveDataStreamReader": {},
  "../model/SaveDataImportNotice": {
    markSaveDataImportSuccess() { calls.push("mark success"); }
  },
  "../model/LearningDatabasePrototype": {
    async openLearningDatabasePrototype() {
      calls.push("open active"); return activeDatabase;
    }
  },
  "../model/LearningDatabaseGeneration": {
    activeLearningDatabaseName() { return "noten-pfoten-learning"; },
    async createShadowLearningDatabase() {
      calls.push("create shadow"); return shadow;
    },
    async discardInactiveShadowLearningDatabase() {
      calls.push("discard shadow");
    }
  },
  "../model/SaveDataLargeMergePreparation": {
    async prepareMergedBackupInShadow(staging, active, target, shouldContinue) {
      calls.push("prepare database");
      if (cancelDuringPreparation) {
        cancelDuringPreparation.requestImportAbort();
        assert.strictEqual(shouldContinue(), false);
      }
      if (failAt === "prepare") throw new Error("Simulated preparation failure");
      return { source: { createdAt: "2026-09-28", fileSize: 20 } };
    }
  },
  "../model/SaveDataLargeMergeLocalPlan": {
    async prepareMergedLocalSaveDataPlan() {
      calls.push("prepare local");
      if (failAt === "local") {
        throw new Error("Local learning progress is not in the database");
      }
      return { values: {} };
    }
  },
  "../model/SaveDataLargeMergeSeal": {
    async sealMergedBackupForCommit() {
      calls.push("seal");
      if (failAt === "seal") throw new Error("Simulated stale data");
    }
  },
  "../model/SaveDataShadowCommit": {
    async flushCurrentWrites() { calls.push("flush"); },
    async commitStagedShadowImport(plan, target, storage, options) {
      assert.strictEqual(options.activeDatabase, activeDatabase);
      calls.push("commit"); return { committed: true };
    }
  },
  "../model/SaveDataImport": {}
};
const compiled = babel.transform(script, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code;
const component = { exports: {} };
new Function("module", "exports", "require", compiled)(
  component, component.exports, name => modules[name] || {}
);
const manager = component.exports.default;
const previousWindow = global.window;
const previousStorage = global.localStorage;
global.localStorage = {};
global.window = { setTimeout() { calls.push("reload scheduled"); return 1; } };

function instance(conflicts = 0) {
  const staging = {
    async clear() { calls.push("clear staging"); },
    close() { calls.push("close staging"); }
  };
  const state = Object.assign(manager.data(), {
    stagedImport: staging,
    stagedPreview: {},
    stagedMergePreview: { total: { conflicts } },
    showMergeConfirmation: true,
    $t: key => key,
    $emit: () => {}
  });
  Object.keys(manager.methods).forEach(name => {
    state[name] = manager.methods[name].bind(state);
  });
  return state;
}

(async () => {
  try {
    const success = instance();
    success.showMergeConfirmation = false;
    await success.applyStagedMerge();
    assert.deepStrictEqual(calls, [], "Merge requires the visible confirmation");
    success.showMergeConfirmation = true;
    await success.applyStagedMerge();
    assert.deepStrictEqual(calls, [
      "flush", "open active", "create shadow", "prepare database",
      "prepare local", "seal", "commit", "clear staging",
      "close staging", "mark success", "reload scheduled", "close active", "close shadow"
    ]);
    assert.strictEqual(success.stagedImport, null);
    assert.strictEqual(success.statusMessage, "SAVE_DATA_IMPORT_SUCCESS");

    calls.length = 0;
    const cancelled = instance();
    cancelDuringPreparation = cancelled;
    await cancelled.applyStagedMerge();
    assert.deepStrictEqual(calls, [
      "flush", "open active", "create shadow", "prepare database",
      "close active", "discard shadow"
    ]);
    assert.strictEqual(cancelled.statusMessage, "SAVE_DATA_IMPORT_CANCELLED");
    assert.strictEqual(cancelled.showMergeConfirmation, false);
    assert.ok(cancelled.stagedImport);
    cancelDuringPreparation = null;

    calls.length = 0;
    failAt = "seal";
    const stale = instance();
    await stale.applyStagedMerge();
    assert.deepStrictEqual(calls, [
      "flush", "open active", "create shadow", "prepare database",
      "prepare local", "seal", "close active", "discard shadow"
    ]);
    assert.ok(stale.stagedImport);
    assert.strictEqual(stale.errorMessage, "SAVE_DATA_STAGED_MERGE_ERROR");

    calls.length = 0;
    failAt = "local";
    const missingProgress = instance();
    await missingProgress.applyStagedMerge();
    assert.strictEqual(missingProgress.errorMessage,
      "SAVE_DATA_STAGED_PROGRESS_MISMATCH");
    assert.ok(missingProgress.stagedImport);

    calls.length = 0;
    failAt = null;
    await instance(1).applyStagedMerge();
    assert.deepStrictEqual(calls, []);
    console.log("Staged merge menu tests passed.");
  } finally {
    global.window = previousWindow;
    global.localStorage = previousStorage;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
