const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");
const root = path.resolve(__dirname, "../src") + path.sep;
const original = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(root)) return original(mod, filename);
  return mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const { copyPrestigeLearningProgress } = require("../src/model/PrestigeProgressCopy");
Module._extensions[".js"] = original;

const scopeRecords = {
  "screen:single-notes": [
    { noteKey: "treble:C4", learningRecord: {
      attempts: 100000, correctFirstTry: 80000, difficulty: 1.2
    } }
  ],
  "midi:single-notes": [
    { noteKey: "bass:F3", learningRecord: {
      attempts: 320, correctFirstTry: 250, difficulty: 1.7
    } }
  ]
};
const counts = { singleNotesScreen: 100000, singleNotesMidi: 320 };
function fixture() {
  const written = {};
  const active = {
    async readStoredEntryCounts() { return { ...counts }; },
    async readAttemptHistoryState(scope) {
      return { nextSequence: scope === "screen:single-notes" ? 100000 : 320,
        fingerprint: { count: scope === "screen:single-notes" ? 100000 : 320 } };
    },
    async readProgressSnapshot(scope) { return scopeRecords[scope]; }
  };
  const shadow = {
    name: "noten-pfoten-learning-import-prestige-test",
    database: {
      async synchronizeProgressSnapshot(scope, snapshot, options) {
        assert.strictEqual(options.requireImportGeneration, true);
        written[scope] = snapshot.records;
      },
      async readProgressSnapshot(scope) { return written[scope]; }
    }
  };
  return { active, shadow, written };
}

(async () => {
  const { active, shadow, written } = fixture();
  const installed = await copyPrestigeLearningProgress(active, shadow);
  assert.strictEqual(installed["screen:single-notes"].noteCount, 1);
  assert.strictEqual(installed["midi:single-notes"].noteCount, 1);
  assert.strictEqual(written["screen:single-notes"][0].learningRecord.attempts, 100000);
  const alteredShadow = fixture();
  alteredShadow.shadow.database.readProgressSnapshot = async scope => (
    scope === "screen:single-notes"
      ? [{ noteKey: "treble:C4", learningRecord: { attempts: 1 } }]
      : alteredShadow.written[scope]
  );
  await assert.rejects(copyPrestigeLearningProgress(
    alteredShadow.active, alteredShadow.shadow
  ), /Copied learning progress differs/);
  const changedActive = fixture();
  let reads = 0;
  changedActive.active.readProgressSnapshot = async scope => {
    reads += 1;
    return scope === "screen:single-notes" && reads === 2
      ? [{ noteKey: "treble:C4", learningRecord: { attempts: 1 } }]
      : scopeRecords[scope];
  };
  await assert.rejects(copyPrestigeLearningProgress(
    changedActive.active, changedActive.shadow
  ), /Active learning progress changed/);
  const missing = fixture();
  missing.active.readProgressSnapshot = async scope => (
    scope === "screen:single-notes" ? [] : scopeRecords[scope]
  );
  await assert.rejects(copyPrestigeLearningProgress(missing.active,
    missing.shadow), /progress is missing/);
  const cancelled = fixture();
  await assert.rejects(copyPrestigeLearningProgress(cancelled.active,
    cancelled.shadow, () => false), error => error.name === "AbortError");
  process.stdout.write("Prestige progress copy tests passed (both inputs; no loss or activation).\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
