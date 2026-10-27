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
const { sealMergedBackupForCommit } = require(
  "../src/model/SaveDataLargeMergeSeal.js"
);
const { readActiveMergeGuard } = require(
  "../src/model/SaveDataLargeMergePreparation.js"
);
const { snapshotMergeLocalStorage } = require(
  "../src/model/SaveDataLargeMergeLocalPlan.js"
);
const { createAdaptiveProgress } = require("../src/model/AdaptiveLearning.js");
const { createSingleNotesProgressSnapshot } = require(
  "../src/model/SingleNotesLearningStorage.js"
);
const { formatSingleNotesHistoryFingerprint } = require(
  "../src/model/SingleNotesHistoryMigration.js"
);
Module._extensions[".js"] = originalLoader;

const roundScopes = ["screen:note-flow", "midi:note-flow",
  "midi:note-flow-chords", "rhythm:taktgefuehl"];
const noteScopes = ["screen:single-notes", "midi:single-notes"];

function storage() {
  const values = { options: JSON.stringify({ data: { difficulty: "easy" } }) };
  return {
    values,
    get length() { return Object.keys(values).length; },
    key(index) { return Object.keys(values)[index] || null; },
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key] : null; }
  };
}

async function fixture() {
  const local = storage();
  const state = { activeRounds: 0, shadowRounds: 0, sealed: false };
  const activeDatabase = {
    async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
    async writeDailyTaskHistory(value) { this.dailyTaskHistory = value; },
    async readNoteFlowStatistics(scope) {
      return { scope, roundCount: state.activeRounds };
    },
    async readAttemptHistoryState() {
      return { nextSequence: 0, fingerprint: null };
    },
    async readProgressSnapshot() { return []; }
  };
  const signature = formatSingleNotesHistoryFingerprint(null);
  const shadow = {
    name: "noten-pfoten-learning-import-seal-test",
    database: {
      async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
      async writeDailyTaskHistory(value) { this.dailyTaskHistory = value; },
      async readImportGenerationMarker() { return { state: "preparing" }; },
      async readNoteFlowStatistics() {
        return { roundCount: state.shadowRounds };
      },
      async readAttemptHistoryState() {
        return { nextSequence: 0, fingerprint: null,
          migration: { status: "complete", signature } };
      },
      async readProgressSnapshot() { return []; },
      async sealVerifiedImportGeneration(value) {
        state.sealed = value;
      }
    }
  };
  const summary = {
    source: { createdAt: "2026-09-28T12:00:00.000Z", fileSize: 100 },
    activeGuard: await readActiveMergeGuard(activeDatabase),
    rounds: Object.fromEntries(roundScopes.map(scope => [scope, { total: 0 }])),
    attempts: Object.fromEntries(noteScopes.map(scope => [scope,
      { total: 0, signature }])),
    progress: Object.fromEntries(noteScopes.map(scope => [scope,
      { signature: createSingleNotesProgressSnapshot(
        createAdaptiveProgress()).signature }]))
  };
  const plan = {
    generation: shadow.name,
    previousGeneration: "noten-pfoten-learning",
    sourceCreatedAt: summary.source.createdAt,
    sourceFileSize: summary.source.fileSize,
    activeGuard: summary.activeGuard,
    sourceLocalSnapshot: snapshotMergeLocalStorage(local)
  };
  return { local, state, activeDatabase, shadow, summary, plan };
}

(async () => {
  const valid = await fixture();
  const sealed = await sealMergedBackupForCommit(valid.activeDatabase,
    valid.shadow, valid.summary, valid.plan, valid.local);
  assert.strictEqual(sealed.sealed, true);
  assert.strictEqual(valid.state.sealed, valid.summary);

  const localChange = await fixture();
  localChange.local.values.options = JSON.stringify({ data: { difficulty: "hard" } });
  await assert.rejects(sealMergedBackupForCommit(localChange.activeDatabase,
    localChange.shadow, localChange.summary, localChange.plan, localChange.local),
  /stale/);
  assert.strictEqual(localChange.state.sealed, false);

  const activeChange = await fixture();
  activeChange.state.activeRounds = 1;
  await assert.rejects(sealMergedBackupForCommit(activeChange.activeDatabase,
    activeChange.shadow, activeChange.summary, activeChange.plan, activeChange.local),
  /Active learning data changed/);
  assert.strictEqual(activeChange.state.sealed, false);

  const shadowChange = await fixture();
  shadowChange.state.shadowRounds = 1;
  await assert.rejects(sealMergedBackupForCommit(shadowChange.activeDatabase,
    shadowChange.shadow, shadowChange.summary, shadowChange.plan, shadowChange.local),
  /Merged rounds changed/);
  assert.strictEqual(shadowChange.state.sealed, false);
  console.log("Large merge sealing tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
