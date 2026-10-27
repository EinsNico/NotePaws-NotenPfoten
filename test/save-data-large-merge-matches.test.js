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
const { indexStagedSingleNoteMatches } = require(
  "../src/model/SaveDataLargeMergeMatches.js"
);
const { normalizeAdaptiveEvaluation } = require(
  "../src/model/AdaptiveHistory.js"
);
Module._extensions[".js"] = originalLoader;

const screen = "data.adaptiveHistory.evaluations";
const midi = "data.adaptiveHistoryMidi.evaluations";
const evaluation = {
  id: "same", completedAt: 1789550000000,
  exercise: { clef: "bass", staff: "piano", value: 48 },
  correctFirstTry: true, mistakeCount: 0, responseTimeMs: 700
};
const normalized = normalizeAdaptiveEvaluation(evaluation);
const attempt = {
  id: normalized.id, noteKey: normalized.noteKey,
  staff: normalized.exercise.staff,
  completedAt: normalized.completedAt,
  correctFirstTry: normalized.correctFirstTry,
  mistakeCount: normalized.mistakeCount,
  responseTimeMs: normalized.responseTimeMs
};

function fixture(imported = evaluation) {
  const markers = new Set();
  const staging = {
    markers,
    async readMetadata() {
      return { key: "ready", counts: { [screen]: 2, [midi]: 0 } };
    },
    async resetMergeMatches() { markers.clear(); },
    async markMergeMatches(section, ids) {
      assert(ids.length <= 250);
      ids.forEach(id => {
        const key = `${section}:${id}`;
        assert(!markers.has(key));
        markers.add(key);
      });
    },
    async findRecordsByIdentities(section, ids) {
      assert(ids.length <= 250);
      return ids.map(id => section === screen && id === "same"
        ? { section, record: imported } : null);
    }
  };
  const active = {
    async readAttemptHistoryPage(scope, after, limit) {
      assert.strictEqual(limit, 1);
      if (scope !== "screen:single-notes") {
        return { records: [], nextBlockNumber: null, done: true };
      }
      assert.strictEqual(after, null);
      return { records: [attempt, { ...attempt, id: "old-only" }],
        nextBlockNumber: 0, done: true };
    }
  };
  return { staging, active };
}

(async () => {
  const { staging, active } = fixture();
  const result = await indexStagedSingleNoteMatches(staging, active);
  assert.deepStrictEqual(result.sections[screen], {
    current: 2, imported: 2, new: 1, duplicates: 1
  });
  assert.deepStrictEqual(result.sections[midi], {
    current: 0, imported: 0, new: 0, duplicates: 0
  });
  assert.deepStrictEqual([...staging.markers], [`${screen}:same`]);

  const conflict = fixture({ ...evaluation, completedAt: evaluation.completedAt + 1 });
  await assert.rejects(indexStagedSingleNoteMatches(
    conflict.staging, conflict.active
  ), /Conflicting answer ID/);
  assert.strictEqual(conflict.staging.markers.size, 0);

  const cancelled = fixture();
  let checks = 0;
  await assert.rejects(indexStagedSingleNoteMatches(
    cancelled.staging, cancelled.active, () => ++checks < 2
  ), error => error && error.name === "AbortError");
  assert.strictEqual(cancelled.staging.markers.size, 0);

  let pages = 0;
  let largestLookup = 0;
  const large = fixture();
  large.staging.findRecordsByIdentities = async (section, ids) => {
    largestLookup = Math.max(largestLookup, ids.length);
    return ids.map(() => null);
  };
  large.active.readAttemptHistoryPage = async (scope, after, limit) => {
    assert.strictEqual(limit, 1);
    if (scope !== "screen:single-notes") {
      return { records: [], nextBlockNumber: null, done: true };
    }
    const number = after === null ? 0 : after + 1;
    pages += 1;
    return {
      records: Array.from({ length: 250 }, (_, index) => ({
        id: `old-${number * 250 + index}`
      })),
      nextBlockNumber: number,
      done: number === 399
    };
  };
  const indexed = await indexStagedSingleNoteMatches(large.staging,
    large.active);
  assert.strictEqual(indexed.sections[screen].current, 100000);
  assert.strictEqual(indexed.sections[screen].duplicates, 0);
  assert.strictEqual(pages, 400);
  assert.strictEqual(largestLookup, 250);
  process.stdout.write("Large merge match-index tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
