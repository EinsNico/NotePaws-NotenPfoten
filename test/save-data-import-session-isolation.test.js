const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const stagingMemory = require("./helpers/save-data-staging-memory");

global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function loadSource(mod, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(mod, filename);
  return mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const stagingModel = require("../src/model/SaveDataImportStaging");
const { createSaveDataBackup } = require("../src/model/SaveDataBackup");
const { prepareStagedLocalSaveDataPlan } = require("../src/model/SaveDataShadowLocalPlan");
const { commitStagedShadowImport } = require("../src/model/SaveDataShadowCommit");
Module._extensions[".js"] = originalLoader;

function memoryStorage(initial = {}) {
  const values = new Map(Object.keys(initial).map(key => [key, initial[key]]));
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] || null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}
const stored = value => JSON.stringify({ data: value });
function file(id, language, appVolume) {
  const backup = createSaveDataBackup(memoryStorage({
    options: stored({ language, appVolume }),
    roundHistory: stored({ version: 1, rounds: [{ id: `round-${id}`, completedAt: 1 }] })
  }), { createdAt: `2026-10-07T${id === "a" ? "10" : "11"}:00:00.000Z` });
  return { backup, blob: new Blob([JSON.stringify(backup)]) };
}

let duringCopy = null;
let duringCompare = null;
let duringMergeSeal = null;
let copies = 0;
let commits = 0;
const managerSource = fs.readFileSync(path.resolve(__dirname, "../src/components/SaveDataManager.vue"), "utf8");
const definitionModule = { exports: {} };
new Function("module", "exports", "require", babel.transform(
  managerSource.match(/<script>([\s\S]*?)<\/script>/)[1], {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }
).code)(definitionModule, definitionModule.exports, name => ({
  "../model/SaveDataImportStaging": stagingModel,
  "../model/LearningDatabaseGeneration": {
    activeLearningDatabaseName() { return "noten-pfoten-learning"; },
    async createShadowLearningDatabase() {
      return { name: "noten-pfoten-learning-import-session-test", database: { close() {} } };
    },
    async discardInactiveShadowLearningDatabase() {}
  },
  "../model/LearningDatabasePrototype": {
    async openLearningDatabasePrototype() { return { close() {} }; }
  },
  "../model/SaveDataLargeMergePreview": {
    async previewStagedIndexedDbMerge(staging) {
      if (duringCompare) await duringCompare(staging);
      return { total: { conflicts: 0 } };
    }
  },
  "../model/SaveDataLargeMergePreparation": {
    async prepareMergedBackupInShadow() { return {}; }
  },
  "../model/SaveDataLargeMergeLocalPlan": {
    async prepareMergedLocalSaveDataPlan() { return {}; }
  },
  "../model/SaveDataLargeMergeSeal": {
    async sealMergedBackupForCommit() { if (duringMergeSeal) await duringMergeSeal(); }
  },
  "../model/SaveDataShadowPreparation": {
    async prepareStagedBackupInShadow(staging) {
      copies += 1;
      if (duringCopy) await duringCopy(staging);
    }
  },
  "../model/SaveDataShadowLocalPlan": { async prepareStagedLocalSaveDataPlan() { return {}; } },
  "../model/SaveDataShadowCommit": {
    async flushCurrentWrites() {},
    async commitStagedShadowImport() { commits += 1; return { committed: true }; }
  },
  "../model/SaveDataImportNotice": { markSaveDataImportSuccess() {} }
}[name] || {}));
const manager = definitionModule.exports.default;
function view() {
  const state = Object.assign(manager.data(), {
    $t: key => key, $emit() {}, $refs: {}
  });
  Object.keys(manager.methods).forEach(name => { state[name] = manager.methods[name].bind(state); });
  // F3's independent backup preflight is tested separately. These cases own
  // only isolated import-session behavior and never persist live Options.
  state.prepareCurrentStorage = () => {};
  return state;
}

async function commitRealPlan(staging, storage) {
  const metadata = await staging.readMetadata();
  const marker = { state: "database-verified", summary: {
    source: { createdAt: metadata.shell.createdAt, fileSize: metadata.fileSize },
    rounds: { "screen:note-flow": 0, "midi:note-flow": 0,
      "midi:note-flow-chords": 0, "rhythm:taktgefuehl": 0 },
    attempts: { "screen:single-notes": 0, "midi:single-notes": 0 }
  } };
  const shadow = {
    name: "noten-pfoten-learning-import-session-real-commit",
    database: {
      async readImportGenerationMarker() { return marker; },
      async markVerifiedImportReady() { marker.state = "ready"; }
    }
  };
  const plan = await prepareStagedLocalSaveDataPlan(staging, shadow);
  await staging.assertSessionIdentity();
  const result = await commitStagedShadowImport(plan, shadow, storage, {
    flushCurrentWrites: async () => {},
    openDatabase: async () => ({ database: { transaction() {
      const transaction = { objectStore: () => ({ get() {
        const request = {};
        queueMicrotask(() => { request.result = marker; request.onsuccess(); });
        return request;
      } }) };
      setImmediate(() => transaction.oncomplete());
      return transaction;
    } }, close() {} })
  });
  assert.strictEqual(result.committed, true);
  return plan;
}

const previousStorage = global.localStorage;
const previousIndexedDB = global.indexedDB;
const previousWindow = global.window;
(async () => {
  try {
    global.window = { setTimeout: () => 1, clearTimeout() {} };
    const fileA = file("a", "de", 10), fileB = file("b", "en", 90);
    for (const abortB of [false, true]) {
      const indexedDB = stagingMemory();
      global.indexedDB = indexedDB;
      const a = view(), b = view();
      await Promise.all([
        a.loadBackupFile({ target: { files: [fileA.blob] } }),
        b.loadBackupFile({ target: { files: [fileB.blob] } })
      ]);
      assert.strictEqual(a.errorMessage, "");
      assert.strictEqual(b.errorMessage, "");
      assert.notStrictEqual(a.stagedImport.sessionId, b.stagedImport.sessionId);
      assert.notStrictEqual(a.stagedImport.databaseName, b.stagedImport.databaseName);
      assert.strictEqual(a.stagedPreview.createdAt, fileA.backup.createdAt);
      assert.strictEqual(b.stagedPreview.createdAt, fileB.backup.createdAt);
      const selectedA = a.stagedImport, selectedB = b.stagedImport;
      if (abortB) await b.cancelImport();
      await selectedA.assertSessionIdentity();
      assert.strictEqual((await selectedA.readBatch("data.roundHistory.rounds")).records[0].id, "round-a");
      global.localStorage = memoryStorage({ foreignValue: "untouched", workshopLibrary: "synthetic-protected" });
      const plan = await commitRealPlan(selectedA, localStorage);
      assert.strictEqual(plan.sourceCreatedAt, fileA.backup.createdAt);
      assert.deepStrictEqual(JSON.parse(localStorage.getItem("options")).data,
        { language: "de", appVolume: 10 });
      assert.strictEqual(JSON.parse(localStorage.getItem("roundHistory")).data.rounds[0].id, "round-a");
      assert.strictEqual(localStorage.getItem("foreignValue"), "untouched");
      assert.strictEqual(localStorage.getItem("workshopLibrary"), "synthetic-protected");
      if (!abortB) {
        assert.strictEqual((await selectedB.readMetadata()).shell.createdAt, fileB.backup.createdAt);
        await b.cancelImport();
      }
      assert.ok(indexedDB.deletedNames.includes(selectedB.databaseName));
      assert.ok(!indexedDB.deletedNames.includes(selectedA.databaseName));
      await selectedA.assertSessionIdentity();
      await a.cancelImport();
      assert.strictEqual(indexedDB.databases.size, 0);
      console.log(`✓ simultaneous previews and A's real local commit; B ${abortB ? "aborted first" : "remained open"}`);
    }

    global.indexedDB = stagingMemory();
    const a = view(), b = view();
    await a.loadBackupFile({ target: { files: [fileA.blob] } });
    await b.loadBackupFile({ target: { files: [fileB.blob] } });
    const selectedA = a.stagedImport;
    // Even identical timestamps, counts and sizes cannot authorize changed
    // metadata under an existing handle or a foreign session ID.
    indexedDB.alterMetadata(selectedA.databaseName, metadata => { metadata.shell.data.options.appVolume = 90; });
    await assert.rejects(selectedA.readMetadata(), error => error.name === "StagedImportSessionError");
    await assert.rejects(selectedA.readBatch("data.roundHistory.rounds"), error => error.name === "StagedImportSessionError");
    a.showReplaceConfirmation = true;
    await a.applyStagedReplace();
    assert.strictEqual(a.errorMessage, "SAVE_DATA_STAGED_SESSION_CHANGED");
    assert.strictEqual(copies, 0);
    assert.strictEqual(commits, 0);
    await a.cancelImport();
    console.log("✓ changed metadata is rejected with a visible session error before copying/commit");

    const c = view();
    await c.loadBackupFile({ target: { files: [fileA.blob] } });
    const selectedC = c.stagedImport;
    c.showReplaceConfirmation = true;
    duringCopy = async () => { c.stagedImport = b.stagedImport; };
    await c.applyStagedReplace();
    assert.strictEqual(c.errorMessage, "SAVE_DATA_STAGED_SESSION_CHANGED");
    assert.strictEqual(commits, 0);
    assert.strictEqual((await b.stagedImport.readMetadata()).shell.createdAt, fileB.backup.createdAt);
    await selectedC.clear(); selectedC.close();
    c.stagedImport = null;
    duringCopy = null;
    console.log("✓ a replaced handle during awaited copy cannot reach the commit");

    const compare = view();
    await compare.loadBackupFile({ target: { files: [fileA.blob] } });
    const comparedSource = compare.stagedImport;
    duringCompare = async () => { compare.stagedImport = b.stagedImport; };
    await compare.compareStagedBackup();
    assert.strictEqual(compare.errorMessage, "SAVE_DATA_STAGED_SESSION_CHANGED");
    assert.strictEqual(compare.stagedMergePreview, null);
    await comparedSource.clear(); comparedSource.close();
    compare.stagedImport = null;
    duringCompare = null;

    const merge = view();
    await merge.loadBackupFile({ target: { files: [fileA.blob] } });
    const mergedSource = merge.stagedImport;
    merge.stagedMergePreview = { total: { conflicts: 0 } };
    merge.showMergeConfirmation = true;
    duringMergeSeal = async () => { merge.stagedImport = b.stagedImport; };
    await merge.applyStagedMerge();
    assert.strictEqual(merge.errorMessage, "SAVE_DATA_STAGED_SESSION_CHANGED");
    assert.strictEqual(commits, 0);
    await mergedSource.clear(); mergedSource.close();
    merge.stagedImport = null;
    duringMergeSeal = null;
    console.log("✓ stale comparison and a handle change during merge sealing cannot publish or commit");

    const late = view();
    const result = await stagingModel.stageBrowserSaveDataFile(fileA.blob);
    let finish;
    const pending = late.prepareStagedBackup(new Promise(resolve => { finish = resolve; }));
    manager.beforeDestroy.call(late);
    finish(result);
    await assert.rejects(pending, error => error.name === "AbortError");
    assert.strictEqual(result.staging.closed, true);
    assert.strictEqual(late.stagedImport, null);
    await b.stagedImport.assertSessionIdentity();
    console.log("✓ late import completion after leaving the view cleans up only its own session");

    const existingName = b.stagedImport.databaseName;
    await assert.rejects(stagingModel.openSaveDataImportStaging({ indexedDB: {
      open: () => indexedDB.open(existingName),
      deleteDatabase: name => indexedDB.deleteDatabase(name)
    } }), error => error.name === "StagedImportSessionError");
    await b.stagedImport.assertSessionIdentity();
    assert.ok(!indexedDB.deletedNames.includes(existingName));
    await b.cancelImport();
    console.log("✓ generated-name collision cannot clear or delete another session");

    const unsaved = view();
    await unsaved.loadBackupFile({ target: { files: [fileA.blob] } });
    const retryableImport = unsaved.stagedImport;
    const beforeCopies = copies;
    unsaved.prepareCurrentStorage = () => {
      const error = new Error("Current settings or round results have not been saved.");
      error.key = "SAVE_DATA_UNSAVED_CHANGES";
      throw error;
    };
    unsaved.showReplaceConfirmation = true;
    await unsaved.applyStagedReplace();
    assert.strictEqual(unsaved.errorMessage, "SAVE_DATA_UNSAVED_CHANGES");
    assert.strictEqual(unsaved.stagedImport, retryableImport);
    unsaved.stagedMergePreview = { total: { conflicts: 0 } };
    unsaved.showMergeConfirmation = true;
    await unsaved.applyStagedMerge();
    assert.strictEqual(unsaved.errorMessage, "SAVE_DATA_UNSAVED_CHANGES");
    assert.strictEqual(unsaved.stagedImport, retryableImport);
    assert.strictEqual(copies, beforeCopies);
    assert.strictEqual(commits, 0);
    await unsaved.cancelImport();
    console.log("✓ unsaved-changes preflight remains explicit and preserves the selected backup for retry");
  } finally {
    global.localStorage = previousStorage;
    global.indexedDB = previousIndexedDB;
    global.window = previousWindow;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
