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
const { prepareMergedLocalSaveDataPlan } = require(
  "../src/model/SaveDataLargeMergeLocalPlan.js"
);
const { normalizeAdaptiveProgress } = require(
  "../src/model/AdaptiveLearning.js"
);
Module._extensions[".js"] = originalLoader;

const stored = value => JSON.stringify({ data: value });
const read = (plan, key) => JSON.parse(plan.values[key]).data;

function storage(values = {}) {
  return {
    get length() { return Object.keys(values).length; },
    key(index) { return Object.keys(values)[index] || null; },
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key] : null; }
  };
}

function fixture() {
  const shell = createSaveDataBackup(storage(), {
    createdAt: "2026-09-28T12:00:00.000Z"
  });
  shell.data.options = { difficulty: "imported" };
  shell.data.adaptiveOptions = { inputMode: "imported" };
  shell.data.roundHistory = { version: 1, rounds: [] };
  shell.data.statistics.legacyRecord = 25;
  const importedRounds = [{ id: "imported", completedAt: 2, score: 9 }];
  const metadata = {
    key: "ready", shell,
    counts: { "data.roundHistory.rounds": importedRounds.length }
  };
  const staging = {
    async readMetadata() { return metadata; },
    async readBatch(section, start, limit) {
      assert.strictEqual(section, "data.roundHistory.rounds");
      const records = importedRounds.slice(start, start + limit);
      return { records, nextIndex: start + records.length,
        total: importedRounds.length };
    }
  };
  const marker = { state: "preparing" };
  const shadow = {
    name: "noten-pfoten-learning-import-local-merge-test",
    database: {
      async readImportGenerationMarker() { return marker; },
      async readProgressSnapshot(scope) {
        return scope === "screen:single-notes" ? [{
          noteKey: "treble-C4", learningRecord: { attempts: 3, correct: 2 }
        }] : [];
      }
    }
  };
  const summary = {
    activeGuard: "unchanged-active-data",
    source: { createdAt: shell.createdAt, fileSize: null },
    rounds: {}, attempts: {}, progress: {}
  };
  const currentValues = {
    options: stored({ difficulty: "current" }),
    adaptiveOptions: stored({ inputMode: "current" }),
    roundHistory: stored({ version: 1, rounds: [
      { id: "current", completedAt: 1, score: 8 }
    ] }),
    record: stored(10)
  };
  return { shell, importedRounds, metadata, staging, marker,
    shadow, summary, currentValues };
}

(async () => {
  const input = fixture();
  const plan = await prepareMergedLocalSaveDataPlan(input.staging,
    input.shadow, input.summary, storage(input.currentValues));
  assert.strictEqual(plan.normalRoundCount, 2);
  assert.deepStrictEqual(read(plan, "roundHistory").rounds.map(round => round.id),
    ["current", "imported"]);
  assert.deepStrictEqual(read(plan, "roundHistory").rounds
    .map(round => round.prestigeEligible), [undefined, false]);
  assert.strictEqual(read(plan, "options").difficulty, "current");
  assert.strictEqual(read(plan, "adaptiveOptions").inputMode, "current");
  assert.strictEqual(read(plan, "record"), 25);
  assert.strictEqual(read(plan, "adaptiveProgress").notes["treble-C4"].attempts, 3);
  assert.deepStrictEqual(read(plan, "adaptiveHistory").evaluations, []);
  assert.ok(plan.estimatedBytes < 3 * 1024 * 1024);

  const missing = fixture();
  const fallback = await prepareMergedLocalSaveDataPlan(missing.staging,
    missing.shadow, missing.summary, storage());
  assert.strictEqual(read(fallback, "options").difficulty, "imported");

  const legacy = fixture();
  const localProgress = normalizeAdaptiveProgress({ notes: {
    "bass-48": { attempts: 2, correctFirstTry: 1 }
  } });
  legacy.currentValues.adaptiveHistory = stored({ version: 2,
    baselines: [{ id: "old-baseline", progress: localProgress }],
    evaluations: [] });
  legacy.currentValues.adaptiveProgress = stored(localProgress);
  const activeDatabase = { async readProgressSnapshot(scope) {
    return scope === "screen:single-notes" ? [{
      noteKey: "bass-48", learningRecord: localProgress.notes["bass-48"]
    }] : [];
  } };
  await prepareMergedLocalSaveDataPlan(legacy.staging,
    legacy.shadow, legacy.summary, storage(legacy.currentValues), activeDatabase);
  await assert.rejects(prepareMergedLocalSaveDataPlan(legacy.staging,
    legacy.shadow, legacy.summary, storage(legacy.currentValues)),
  /needed to verify/);
  await assert.rejects(prepareMergedLocalSaveDataPlan(legacy.staging,
    legacy.shadow, legacy.summary, storage(legacy.currentValues), {
      async readProgressSnapshot() { return []; }
    }), /not in the database/);
  legacy.currentValues.adaptiveHistory = stored({ version: 2,
    baselines: [], evaluations: [{ id: "unmigrated" }] });
  await assert.rejects(prepareMergedLocalSaveDataPlan(legacy.staging,
    legacy.shadow, legacy.summary, storage(legacy.currentValues), activeDatabase),
  /must be migrated/);

  const duplicate = fixture();
  duplicate.importedRounds[0] = {
    id: "current", completedAt: 1, score: 8
  };
  const deduplicated = await prepareMergedLocalSaveDataPlan(duplicate.staging,
    duplicate.shadow, duplicate.summary, storage(duplicate.currentValues));
  assert.strictEqual(deduplicated.normalRoundCount, 1);
  assert.strictEqual(deduplicated.normalRoundDuplicates, 1);

  const conflict = fixture();
  conflict.importedRounds[0].id = "current";
  await assert.rejects(prepareMergedLocalSaveDataPlan(conflict.staging,
    conflict.shadow, conflict.summary, storage(conflict.currentValues)),
  /Conflicting legacy rounds/);

  const stale = fixture();
  stale.summary.source.fileSize = 7;
  await assert.rejects(prepareMergedLocalSaveDataPlan(stale.staging,
    stale.shadow, stale.summary, storage(stale.currentValues)), /incomplete or stale/);

  const oversized = fixture();
  oversized.importedRounds[0].payload = "x".repeat(2 * 1024 * 1024);
  await assert.rejects(prepareMergedLocalSaveDataPlan(oversized.staging,
    oversized.shadow, oversized.summary, storage(oversized.currentValues)),
  /safe local storage limit/);
  console.log("Large merge local plan tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
