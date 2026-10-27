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
const { LearningDatabasePrototype } = require(
  "../src/model/LearningDatabasePrototype.js"
);
const { rebuildAdaptiveProgress } = require("../src/model/AdaptiveHistory.js");
const { createSingleNotesProgressSnapshot } = require(
  "../src/model/SingleNotesLearningStorage.js"
);
const { installStagedSingleNoteProgress } = require(
  "../src/model/SaveDataShadowProgress.js"
);
Module._extensions[".js"] = originalLoader;

const storage = { length: 0, key: () => null, getItem: () => null };
const shell = createSaveDataBackup(storage, {
  createdAt: "2026-09-28T12:00:00.000Z"
});
shell.data.adaptiveProgress = null;
shell.data.adaptiveProgressMidi = {
  version: 2,
  notes: { "treble:60:natural": { attempts: 2, correctFirstTry: 1 } }
};
const baseline = {
  id: "baseline-1",
  progress: {
    version: 2,
    notes: { "bass:48:natural": { attempts: 2, correctFirstTry: 1 } }
  }
};
const evaluations = Array.from({ length: 301 }, (_, index) => ({
  id: `evaluation-${String(index).padStart(4, "0")}`,
  completedAt: 1789550000000 + index * 1000,
  exercise: { clef: "bass", staff: "bass", value: 48 },
  correctFirstTry: index % 2 === 0,
  mistakeCount: index % 2,
  responseTimeMs: index % 2 === 0 ? 800 : null
}));
const sections = {
  "data.adaptiveHistory.baselines": [baseline],
  "data.adaptiveHistoryMidi.baselines": [],
  "data.adaptiveHistory.evaluations": evaluations,
  "data.adaptiveHistoryMidi.evaluations": []
};
const staging = {
  async readMetadata() {
    return {
      key: "ready", shell,
      counts: Object.keys(sections).reduce((counts, key) => {
        counts[key] = sections[key].length;
        return counts;
      }, {})
    };
  },
  async readBatch(section, start, limit) {
    const records = sections[section].slice(start, start + limit);
    const nextIndex = start + records.length;
    return { records, nextIndex, done: nextIndex === sections[section].length };
  },
  async readChronologicalBatch(section, after, limit) {
    const records = sections[section];
    const start = after
      ? records.findIndex(record => record.id === after.id) + 1 : 0;
    const values = records.slice(start, start + limit);
    return {
      records: values,
      cursor: values.length ? {
        completedAt: values[values.length - 1].completedAt,
        id: values[values.length - 1].id
      } : after,
      done: start + values.length === records.length
    };
  }
};

(async () => {
  const stored = new Map();
  const shadow = {
    name: "noten-pfoten-learning-import-progress-test",
    database: {
      async synchronizeProgressSnapshot(scope, snapshot, options) {
        assert.strictEqual(options.requireImportGeneration, true);
        stored.set(scope, snapshot.records.map(record => Object.assign({
          scope
        }, record)));
      },
      async readProgressSnapshot(scope) { return stored.get(scope) || []; }
    }
  };
  const installed = await installStagedSingleNoteProgress(staging, shadow);
  const legacy = rebuildAdaptiveProgress({
    version: 1, baselines: [baseline], evaluations
  });
  const expected = createSingleNotesProgressSnapshot(legacy);
  assert.strictEqual(installed["screen:single-notes"].signature,
    expected.signature);
  assert.strictEqual(installed["midi:single-notes"].noteCount, 1);
  assert.strictEqual(stored.get("screen:single-notes").length, 1);

  const damaged = Object.assign({}, staging, {
    async readMetadata() {
      const metadata = await staging.readMetadata();
      metadata.counts["data.adaptiveHistory.evaluations"] += 1;
      return metadata;
    }
  });
  await assert.rejects(installStagedSingleNoteProgress(damaged, shadow),
    /evaluations are incomplete/);
  await assert.rejects(installStagedSingleNoteProgress(staging, {
    name: "noten-pfoten-learning", database: shadow.database
  }), /inactive learning database/);

  let openedTransaction = false;
  const liveDatabase = new LearningDatabasePrototype({
    transaction() {
      openedTransaction = true;
      throw new Error("Live database must not be opened for an import snapshot.");
    }
  }, { name: "noten-pfoten-learning" });
  await assert.rejects(liveDatabase.synchronizeProgressSnapshot(
    "screen:single-notes", expected, { requireImportGeneration: true }
  ), /requires a shadow database/);
  assert.strictEqual(openedTransaction, false);
  process.stdout.write("Save-data shadow progress tests passed.\n");
})().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
