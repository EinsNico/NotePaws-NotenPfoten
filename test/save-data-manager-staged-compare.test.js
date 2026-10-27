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
let compare = null;
const database = { close() { calls.push("close database"); } };
const modules = {
  "../model/SaveDataBackup": { BACKUP_VALIDATION_ERRORS: {} },
  "../model/SaveDataFiles": {},
  "../model/SaveDataImportStaging": {},
  "../model/SaveDataStreamReader": {},
  "../model/LearningDatabasePrototype": {
    async openLearningDatabasePrototype(options) {
      assert.strictEqual(options.name, "active-test");
      calls.push("open database");
      return database;
    }
  },
  "../model/LearningDatabaseGeneration": {
    activeLearningDatabaseName() { return "active-test"; }
  },
  "../model/SaveDataLargeMergePreview": {
    previewStagedIndexedDbMerge(staging, opened, shouldContinue) {
      assert.strictEqual(opened, database);
      calls.push("compare");
      return compare(staging, shouldContinue);
    }
  },
  "../model/SaveDataShadowPreparation": {},
  "../model/SaveDataShadowLocalPlan": {},
  "../model/SaveDataShadowCommit": {},
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

function instance() {
  const staging = {
    async clear() { calls.push("clear staging"); },
    close() { calls.push("close staging"); }
  };
  const state = Object.assign(manager.data(), {
    stagedImport: staging, stagedPreview: {},
    $refs: { details: { open: true } },
    $t: key => key, $emit: () => {}
  });
  Object.keys(manager.methods).forEach(name => {
    state[name] = manager.methods[name].bind(state);
  });
  return state;
}

(async () => {
  assert.ok(source.includes('@click="compareStagedBackup"'));
  assert.ok(source.includes(':disabled="isBusy && !previewBusy"'));
  const template = source.split("<script>")[0];
  const activityPosition = template.indexOf('class="backup-activity"');
  assert.ok(activityPosition > template.lastIndexOf("</section>"),
    "All loading indicators follow the backup previews and action buttons");
  assert.strictEqual((template.match(/v-if="showImportActivity"/g) || []).length, 1);
  assert.ok(template.indexOf('v-if="exportLoading"') > activityPosition);
  assert.ok(template.indexOf('class="cancel import-abort"') > activityPosition);
  assert.ok(source.includes(':aria-label="importActivityMessage"'));
  assert.strictEqual(manager.computed.showImportActivity.call({
    importLoading: false, importPreparationBusy: false, previewBusy: true
  }), true);
  calls.length = 0;
  compare = async () => ({ total: {
    current: 3, imported: 5, new: 2, duplicates: 2, conflicts: 1
  } });
  const success = instance();
  await success.compareStagedBackup();
  assert.deepStrictEqual(calls, ["open database", "compare", "close database"]);
  assert.strictEqual(success.stagedMergePreview.total.new, 2);
  assert.strictEqual(success.isBusy, false);
  assert.ok(success.stagedImport);

  calls.length = 0;
  let release;
  compare = async (staging, shouldContinue) => {
    await new Promise(resolve => { release = resolve; });
    if (!shouldContinue()) {
      const error = new Error("cancelled");
      error.name = "AbortError";
      throw error;
    }
    return { total: {} };
  };
  const cancelled = instance();
  const pending = cancelled.compareStagedBackup();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.strictEqual(cancelled.previewBusy, true);
  await cancelled.cancelImport();
  release();
  await pending;
  assert.strictEqual(cancelled.stagedImport, null);
  assert.strictEqual(cancelled.stagedMergePreview, null);
  assert.strictEqual(cancelled.errorMessage, "");
  assert.deepStrictEqual(calls, [
    "open database", "compare", "close database",
    "clear staging", "close staging"
  ]);

  calls.length = 0;
  const back = instance();
  back.showMergeConfirmation = true;
  assert.strictEqual(back.handleBack(), true);
  assert.strictEqual(back.showMergeConfirmation, false);
  assert.ok(back.stagedImport);
  back.showReplaceConfirmation = true;
  assert.strictEqual(back.handleBack(), true);
  assert.strictEqual(back.showReplaceConfirmation, false);
  assert.ok(back.stagedImport);
  assert.strictEqual(back.handleBack(), true);
  await Promise.resolve();
  assert.strictEqual(back.stagedImport, null);
  assert.strictEqual(back.stagedPreview, null);
  assert.strictEqual(back.stagedMergePreview, null);
  assert.deepStrictEqual(calls, ["clear staging", "close staging"]);
  assert.strictEqual(back.handleBack(), true);
  assert.strictEqual(back.$refs.details.open, false);
  assert.strictEqual(back.handleBack(), false);
  process.stdout.write("Staged comparison UI tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
