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
let failPreparation = false;
let cancelDuringPreparation = null;
const shadow = {
  name: "noten-pfoten-learning-import-ui-test",
  database: { close() { calls.push("close shadow"); } }
};
const modules = {
  "../model/PersistenceFeedback": { hasPersistenceFailure: () => false },
  "../model/SaveDataBackup": { BACKUP_VALIDATION_ERRORS: {} },
  "../model/SaveDataFiles": {},
  "../model/SaveDataImportStaging": {},
  "../model/SaveDataStreamReader": {},
  "../model/SaveDataImportNotice": {
    markSaveDataImportSuccess() { calls.push("mark success"); }
  },
  "../model/LearningDatabaseGeneration": {
    async createShadowLearningDatabase() { calls.push("create shadow"); return shadow; },
    async discardInactiveShadowLearningDatabase() { calls.push("discard shadow"); }
  },
  "../model/SaveDataShadowPreparation": {
    async prepareStagedBackupInShadow() {
      calls.push("copy and verify");
      if (cancelDuringPreparation) cancelDuringPreparation.requestImportAbort();
      if (failPreparation) throw new Error("Invalid backup");
    }
  },
  "../model/SaveDataShadowLocalPlan": {
    async prepareStagedLocalSaveDataPlan() { calls.push("local plan"); return {}; }
  },
  "../model/SaveDataShadowCommit": {
    async commitStagedShadowImport() {
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

function instance() {
  const staging = {
    async readPreview() { return { normalRounds: 1 }; },
    async clear() { calls.push("clear staging"); },
    close() { calls.push("close staging"); }
  };
  const state = Object.assign(manager.data(), {
    stagedImport: staging,
    stagedPreview: {},
    showReplaceConfirmation: true,
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
    success.showReplaceConfirmation = false;
    await success.prepareStagedBackup(Promise.resolve({
      staging: success.stagedImport
    }));
    assert.deepStrictEqual(success.stagedPreview, { normalRounds: 1 });
    await success.applyStagedReplace();
    assert.deepStrictEqual(calls, [], "Replacement requires the visible confirmation");
    success.showReplaceConfirmation = true;
    await success.applyStagedReplace();
    assert.deepStrictEqual(calls, [
      "create shadow", "copy and verify", "local plan", "commit",
      "clear staging", "close staging", "mark success", "reload scheduled", "close shadow"
    ]);
    assert.strictEqual(success.stagedImport, null);
    assert.strictEqual(success.statusMessage, "SAVE_DATA_IMPORT_SUCCESS");
    assert.strictEqual(success.isBusy, false);

    calls.length = 0;
    const cancelled = instance();
    cancelDuringPreparation = cancelled;
    await cancelled.applyStagedReplace();
    assert.deepStrictEqual(calls, [
      "create shadow", "copy and verify", "discard shadow"
    ]);
    assert.strictEqual(cancelled.statusMessage, "SAVE_DATA_IMPORT_CANCELLED");
    assert.strictEqual(cancelled.showReplaceConfirmation, false);
    assert.ok(cancelled.stagedImport);
    cancelDuringPreparation = null;

    calls.length = 0;
    failPreparation = true;
    const failed = instance();
    await failed.applyStagedReplace();
    assert.deepStrictEqual(calls, [
      "create shadow", "copy and verify", "discard shadow"
    ]);
    assert.ok(failed.stagedImport);
    assert.strictEqual(failed.errorMessage, "SAVE_DATA_STAGED_IMPORT_ERROR");
    assert.strictEqual(failed.isBusy, false);
    assert.ok(source.includes('@click="applyStagedReplace"'));
    console.log("Staged replacement UI tests passed.");
  } finally {
    global.window = previousWindow;
    global.localStorage = previousStorage;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
