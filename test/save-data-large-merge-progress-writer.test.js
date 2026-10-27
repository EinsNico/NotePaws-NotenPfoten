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
const { installMergedSingleNoteProgress } = require(
  "../src/model/SaveDataLargeMergeProgressWriter.js"
);
const { normalizeAdaptiveEvaluation } = require(
  "../src/model/AdaptiveHistory.js"
);
Module._extensions[".js"] = originalLoader;

const section = "data.adaptiveHistory.evaluations";
const midi = "data.adaptiveHistoryMidi.evaluations";
function evaluation(id, completedAt) {
  return { id, completedAt,
    exercise: { clef: "bass", staff: "bass", value: 48 },
    correctFirstTry: true, mistakeCount: 0, responseTimeMs: 700 };
}
const noteKey = normalizeAdaptiveEvaluation(evaluation("same", 1)).noteKey;
const indexed = { sections: {
  [section]: { current: 1, imported: 2, new: 1, duplicates: 1 },
  [midi]: { current: 0, imported: 0, new: 0, duplicates: 0 }
} };

function fixture() {
  const metadata = { key: "ready", counts: {
    [section]: 2, [midi]: 0,
    "data.adaptiveHistory.baselines": 0,
    "data.adaptiveHistoryMidi.baselines": 0
  }, shell: { data: {
    adaptiveProgress: { version: 2, notes: {
      [noteKey]: { attempts: 2, correctFirstTry: 2 }
    } }, adaptiveProgressMidi: null
  } } };
  const evaluations = [evaluation("same", 1), evaluation("new", 2)];
  const staging = {
    async readMetadata() { return metadata; },
    async readChronologicalBatch(selected, after, limit) {
      assert.strictEqual(limit, 250);
      const records = selected === section && !after ? evaluations : [];
      return { records, cursor: records.length
        ? { completedAt: records[records.length - 1].completedAt,
          id: records[records.length - 1].id } : after, done: true };
    },
    async hasMergeMatches(selected, ids) {
      return ids.map(id => id === "same");
    }
  };
  const current = [{ noteKey, learningRecord: {
    attempts: 1, correctFirstTry: 1, timedAttempts: 1,
    recentResults: [true], recentResponseTimesMs: [700]
  } }];
  const active = {
    async readProgressSnapshot(scope) {
      return scope === "screen:single-notes" ? current : [];
    },
    async readAttemptHistoryState(scope) {
      return { nextSequence: scope === "screen:single-notes" ? 1 : 0,
        fingerprint: null };
    },
    async readAttemptHistoryPage(scope, after, limit) {
      assert.strictEqual(limit, 1);
      const records = scope === "screen:single-notes" && after === null
        ? [{ id: "same", completedAt: 1, noteKey }] : [];
      return { records, nextBlockNumber: records.length ? 0 : null,
        done: true };
    }
  };
  const stored = new Map();
  const shadow = { name: "noten-pfoten-learning-import-test", database: {
    async synchronizeProgressSnapshot(scope, snapshot, options) {
      assert.strictEqual(options.requireImportGeneration, true);
      stored.set(scope, snapshot.records);
    },
    async readProgressSnapshot(scope) { return stored.get(scope) || []; }
  } };
  return { metadata, evaluations, staging, current, active, stored, shadow };
}

(async () => {
  const first = fixture();
  const result = await installMergedSingleNoteProgress(first.staging,
    first.active, first.shadow, indexed);
  assert.strictEqual(result["screen:single-notes"].addedAnswers, 1);
  assert.strictEqual(first.stored.get("screen:single-notes")[0]
    .learningRecord.attempts, 2);
  assert.strictEqual(result["midi:single-notes"].noteCount, 0);

  const prestige = fixture();
  const saved = { attempts: 101, correctFirstTry: 90,
    timedAttempts: 101, recentResults: [true], recentResponseTimesMs: [700] };
  prestige.current[0].learningRecord = saved;
  prestige.metadata.shell.data.adaptiveProgress.notes[noteKey] = saved;
  prestige.evaluations.splice(1, 1);
  prestige.metadata.counts[section] = 1;
  const duplicateIndex = { sections: {
    [section]: { current: 1, imported: 1, new: 0, duplicates: 1 },
    [midi]: indexed.sections[midi]
  } };
  const unchanged = await installMergedSingleNoteProgress(prestige.staging,
    prestige.active, prestige.shadow, duplicateIndex);
  assert.strictEqual(unchanged["screen:single-notes"].addedAnswers, 0);
  assert.strictEqual(prestige.stored.get("screen:single-notes")[0]
    .learningRecord.attempts, 101);
  assert.strictEqual(prestige.stored.get("screen:single-notes")[0]
    .learningRecord.correctFirstTry, 90);

  const older = fixture();
  older.evaluations[1] = evaluation("new", 0);
  await assert.rejects(installMergedSingleNoteProgress(older.staging,
    older.active, older.shadow, indexed), /Older imported answers/);
  assert.strictEqual(older.stored.size, 0);

  const changed = fixture();
  let stateReads = 0;
  changed.active.readAttemptHistoryState = async () => ({
    nextSequence: ++stateReads === 1 ? 1 : 2, fingerprint: null
  });
  await assert.rejects(installMergedSingleNoteProgress(changed.staging,
    changed.active, changed.shadow, indexed), /Active learning data changed/);
  assert.strictEqual(changed.stored.size, 0);

  const changedProgress = fixture();
  let progressReads = 0;
  changedProgress.active.readProgressSnapshot = async scope => {
    if (scope !== "screen:single-notes") return [];
    progressReads += 1;
    return progressReads === 1 ? changedProgress.current : [{
      noteKey, learningRecord: { attempts: 2, correctFirstTry: 2 }
    }];
  };
  await assert.rejects(installMergedSingleNoteProgress(
    changedProgress.staging, changedProgress.active,
    changedProgress.shadow, indexed
  ), /changed after preflight/);
  assert.strictEqual(changedProgress.stored.size, 0);

  const corrupted = fixture();
  corrupted.shadow.database.readProgressSnapshot = async () => [];
  await assert.rejects(installMergedSingleNoteProgress(corrupted.staging,
    corrupted.active, corrupted.shadow, indexed), /Stored merged learning progress differs/);

  const cancelled = fixture();
  await assert.rejects(installMergedSingleNoteProgress(cancelled.staging,
    cancelled.active, cancelled.shadow, indexed, () => false),
  error => error && error.name === "AbortError");
  assert.strictEqual(cancelled.stored.size, 0);
  process.stdout.write("Large learning-progress merge writer tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
