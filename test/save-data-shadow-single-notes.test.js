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
const {
  streamStagedSingleNoteAttempts,
  verifyStagedSingleNoteAttempts
} = require("../src/model/SaveDataShadowSingleNotes.js");
const { createSingleNotesHistoryMigrationPlan } = require(
  "../src/model/SingleNotesHistoryMigration.js"
);
Module._extensions[".js"] = originalLoader;

function evaluation(index) {
  return {
    id: `eval-${index}`,
    completedAt: index,
    exercise: { clef: "bass", value: 48, staff: "bass" },
    correctFirstTry: index % 2 === 0,
    mistakeCount: index % 2,
    responseTimeMs: index % 2 === 0 ? 750 : null
  };
}

function stagedWithCount(count) {
  return {
    async readMetadata() {
      return {
        key: "ready",
        counts: { "data.adaptiveHistory.evaluations": count }
      };
    },
    async readChronologicalBatch(section, after, limit) {
      const total = section === "data.adaptiveHistory.evaluations" ? count : 0;
      const start = after ? after.completedAt + 1 : 0;
      const end = Math.min(total, start + limit);
      const records = Array.from({ length: end - start }, (_, i) => evaluation(start + i));
      return {
        records,
        cursor: records.length
          ? { completedAt: end - 1, id: records[records.length - 1].id }
          : after,
        done: end === total
      };
    }
  };
}

(async () => {
  const attempts = [];
  const counts = await streamStagedSingleNoteAttempts(stagedWithCount(301), batch => {
    assert(batch.attempts.length <= 250);
    assert.strictEqual(batch.start, attempts.length);
    attempts.push(...batch.attempts);
  });
  assert.strictEqual(counts["screen:single-notes"], 301);
  assert.strictEqual(counts["midi:single-notes"], 0);
  const expected = createSingleNotesHistoryMigrationPlan({
    version: 1, baselines: [],
    evaluations: Array.from({ length: 301 }, (_, i) => evaluation(i))
  }, "screen:single-notes");
  assert.deepStrictEqual(attempts, expected.attempts);
  const manifest = await verifyStagedSingleNoteAttempts(stagedWithCount(301));
  assert.strictEqual(manifest["screen:single-notes"].attemptCount, 301);
  assert.deepStrictEqual(manifest["screen:single-notes"].fingerprint,
    expected.fingerprint);
  assert.strictEqual(manifest["screen:single-notes"].signature,
    expected.signature);

  const truncated = stagedWithCount(300);
  truncated.readMetadata = async () => ({
    key: "ready", counts: { "data.adaptiveHistory.evaluations": 301 }
  });
  await assert.rejects(verifyStagedSingleNoteAttempts(truncated),
    /count is inconsistent/);

  let streamed = 0;
  const large = await streamStagedSingleNoteAttempts(stagedWithCount(100000), batch => {
    streamed += batch.attempts.length;
  });
  assert.strictEqual(streamed, 100000);
  assert.strictEqual(large["screen:single-notes"], 100000);
  await assert.rejects(streamStagedSingleNoteAttempts(stagedWithCount(1), () => {
    throw new Error("target failed");
  }), /target failed/);
  process.stdout.write("Save-data shadow single-note tests passed.\n");
})().catch(error => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
