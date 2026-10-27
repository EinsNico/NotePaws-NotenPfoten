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
const { createSaveDataBackup } = require("../src/model/SaveDataBackup.js");
const { prepareStagedBackupInShadow } = require("../src/model/SaveDataShadowPreparation.js");
const { LearningDatabasePrototype } = require("../src/model/LearningDatabasePrototype.js");
Module._extensions[".js"] = originalLoader;

const sections = [
  "data.noteFlowRounds.screen", "data.noteFlowRounds.midi",
  "data.noteFlowRounds.chordMidi", "data.rhythmSenseBars",
  "data.adaptiveHistory.evaluations", "data.adaptiveHistoryMidi.evaluations",
  "data.adaptiveHistory.baselines", "data.adaptiveHistoryMidi.baselines"
];
const shell = createSaveDataBackup({ length: 0, key: () => null, getItem: () => null }, {
  createdAt: "2026-09-28T12:00:00.000Z"
});
const metadata = {
  key: "ready", shell,
  counts: Object.fromEntries(sections.map(section => [section, 0]))
};
const staging = {
  async readMetadata() { return metadata; },
  async readBatch() {
    return { records: [], nextIndex: 0, total: 0, done: true };
  },
  async readChronologicalBatch() {
    return { records: [], cursor: null, done: true };
  }
};

function shadow(roundCount = 0) {
  const saved = new Map();
  const migrations = new Map();
  const database = {
    async appendImportedNoteFlowBatch() { throw new Error("Unexpected round batch."); },
    async appendImportedAttemptBatch() { throw new Error("Unexpected answer batch."); },
    async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
    async writeDailyTaskHistory(value) { this.dailyTaskHistory = value; },
    async readNoteFlowStatistics() { return { roundCount }; },
    async readAttemptHistoryState(scope) {
      return { nextSequence: 0, fingerprint: null,
        migration: migrations.get(scope) || null };
    },
    async finalizeAttemptHistoryMigration(scope, migration) {
      migrations.set(scope, Object.assign({ status: "complete" }, migration));
    },
    async synchronizeProgressSnapshot(scope, snapshot) {
      saved.set(scope, snapshot.records);
    },
    async readProgressSnapshot(scope) { return saved.get(scope) || []; },
    async sealVerifiedImportGeneration(summary) { this.sealed = summary; }
  };
  return { name: "noten-pfoten-learning-import-preparation-test", database };
}

function fakeMetaDatabase(state) {
  const values = new Map([["backup-import-generation", {
    key: "backup-import-generation", state
  }]]);
  return {
    values,
    transaction() {
      const staged = new Map(values);
      let aborted = false;
      const tx = {
        objectStore() {
          return {
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = staged.get(key);
                request.onsuccess();
              });
              return request;
            },
            put(value) { staged.set(value.key, value); }
          };
        },
        abort() { aborted = true; queueMicrotask(() => tx.onabort()); }
      };
      setImmediate(() => {
        if (!aborted) {
          staged.forEach((value, key) => values.set(key, value));
          tx.oncomplete();
        }
      });
      return tx;
    }
  };
}

(async () => {
  const good = shadow();
  const summary = await prepareStagedBackupInShadow(staging, good);
  assert.deepStrictEqual(good.database.sealed, summary);
  assert.strictEqual(summary.rounds["screen:note-flow"], 0);
  assert.strictEqual((await good.database.readAttemptHistoryState(
    "screen:single-notes"
  )).migration.status, "complete");
  const wrong = shadow(1);
  await assert.rejects(
    prepareStagedBackupInShadow(staging, wrong), /round count differs/
  );
  assert.strictEqual(wrong.database.sealed, undefined);

  const raw = fakeMetaDatabase("preparing");
  const database = new LearningDatabasePrototype(raw, {
    name: "noten-pfoten-learning-import-preparation-test"
  });
  await database.sealVerifiedImportGeneration(summary);
  assert.strictEqual(raw.values.get("backup-import-generation").state,
    "database-verified");
  await database.markVerifiedImportReady();
  assert.strictEqual(raw.values.get("backup-import-generation").state, "ready");
  await database.revertUnactivatedImportReady();
  assert.strictEqual(raw.values.get("backup-import-generation").state,
    "database-verified");
  await assert.rejects(database.sealVerifiedImportGeneration(summary),
    /not preparing/);
  console.log("Shadow preparation tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
