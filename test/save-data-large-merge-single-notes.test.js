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
const { copyMergedSingleNotesToShadow } = require(
  "../src/model/SaveDataLargeMergeSingleNotes.js"
);
const { normalizeAdaptiveEvaluation } = require(
  "../src/model/AdaptiveHistory.js"
);
const {
  createEmptySingleNotesHistoryFingerprint,
  extendSingleNotesHistoryFingerprint,
  formatSingleNotesHistoryFingerprint
} = require("../src/model/SingleNotesHistoryMigration.js");
Module._extensions[".js"] = originalLoader;

const screen = "data.adaptiveHistory.evaluations";
const midi = "data.adaptiveHistoryMidi.evaluations";
const scope = "screen:single-notes";
function evaluation(id, completedAt) {
  return { id, completedAt,
    exercise: { clef: "bass", value: 48, staff: "bass" },
    correctFirstTry: true, mistakeCount: 0, responseTimeMs: 700 };
}
function attempt(id, completedAt) {
  const normalized = normalizeAdaptiveEvaluation(evaluation(id, completedAt));
  return { id, completedAt, scope, sessionId: `existing-${id}`,
    noteKey: normalized.noteKey, staff: normalized.exercise.staff,
    correctFirstTry: true, mistakeCount: 0, responseTimeMs: 700 };
}
const plan = { sections: {
  [screen]: { current: 2, imported: 3, new: 2, duplicates: 1 },
  [midi]: { current: 0, imported: 0, new: 0, duplicates: 0 }
} };
function fixture() {
  const imported = [evaluation("new-first", 1), evaluation("same", 3),
    evaluation("new-last", 4)];
  const current = [attempt("old", 2), attempt("same", 3)];
  const written = [];
  let fingerprint = createEmptySingleNotesHistoryFingerprint();
  const staging = {
    async readChronologicalBatch(section, after, limit) {
      assert.strictEqual(limit, 250);
      const records = section === screen && !after ? imported : [];
      return { records, cursor: records.length ? { completedAt: 4,
        id: "new-last" } : after, done: true };
    },
    async hasMergeMatches(section, ids) {
      return ids.map(id => id === "same");
    }
  };
  const active = {
    async readAttemptHistoryPage(selectedScope, after, limit) {
      assert.strictEqual(limit, 1);
      const records = selectedScope === scope && after === null ? current : [];
      return { records, nextBlockNumber: records.length ? 0 : null, done: true };
    }
  };
  const shadow = { name: "noten-pfoten-learning-import-test", database: {
    async appendImportedAttemptBatch(selectedScope, batch, start) {
      assert.strictEqual(selectedScope, scope);
      assert.strictEqual(start, written.length);
      written.push(...batch);
      batch.forEach(value => {
        fingerprint = extendSingleNotesHistoryFingerprint(fingerprint, value);
      });
      return { total: written.length, fingerprint };
    },
    async readAttemptHistoryState(selectedScope) {
      return selectedScope === scope
        ? { nextSequence: written.length,
          fingerprint: written.length ? fingerprint : null }
        : { nextSequence: 0, fingerprint: null };
    }
  } };
  return { staging, active, shadow, written };
}

(async () => {
  const first = fixture();
  const result = await copyMergedSingleNotesToShadow(first.staging,
    first.active, first.shadow, plan);
  assert.deepStrictEqual(first.written.map(value => value.id),
    ["new-first", "old", "same", "new-last"]);
  assert.deepStrictEqual(first.written.map(value => value.prestigeEligible),
    [false, undefined, undefined, false]);
  assert.deepStrictEqual(result[scope], { current: 2, added: 2,
    total: 4, signature: formatSingleNotesHistoryFingerprint(
      first.written.reduce(extendSingleNotesHistoryFingerprint,
        createEmptySingleNotesHistoryFingerprint())
    ) });
  assert.strictEqual(first.written[2].sessionId, "existing-same");
  assert.strictEqual(first.written[0].sessionId,
    "screen:single-notes|legacy-history|0");

  const unindexed = fixture();
  unindexed.staging.hasMergeMatches = async (section, ids) => ids.map(() => false);
  await assert.rejects(copyMergedSingleNotesToShadow(unindexed.staging,
    unindexed.active, unindexed.shadow, plan), /Unindexed answer collision/);

  const shortPlan = { sections: { ...plan.sections,
    [screen]: { ...plan.sections[screen], new: 1, imported: 2 } } };
  const short = fixture();
  await assert.rejects(copyMergedSingleNotesToShadow(short.staging,
    short.active, short.shadow, shortPlan), /count differs/);

  const cancelled = fixture();
  await assert.rejects(copyMergedSingleNotesToShadow(cancelled.staging,
    cancelled.active, cancelled.shadow, plan, () => false),
  error => error && error.name === "AbortError");
  assert.strictEqual(cancelled.written.length, 0);

  const wrongBatch = fixture();
  wrongBatch.shadow.database.appendImportedAttemptBatch = async (
    selectedScope, batch, start
  ) => ({ total: start + batch.length,
    fingerprint: createEmptySingleNotesHistoryFingerprint() });
  await assert.rejects(copyMergedSingleNotesToShadow(wrongBatch.staging,
    wrongBatch.active, wrongBatch.shadow, plan), /batch was not verified/);

  const wrongState = fixture();
  wrongState.shadow.database.readAttemptHistoryState = async () => ({
    nextSequence: 4, fingerprint: createEmptySingleNotesHistoryFingerprint()
  });
  await assert.rejects(copyMergedSingleNotesToShadow(wrongState.staging,
    wrongState.active, wrongState.shadow, plan), /stored merged answers differ/);

  const many = fixture();
  const total = 100000;
  many.staging.readChronologicalBatch = async (section, after, limit) => {
    assert.strictEqual(limit, 250);
    if (section !== screen) return { records: [], cursor: after, done: true };
    const start = after ? Number(after.id.slice(4)) + 1 : 0;
    const end = Math.min(total, start + limit);
    const records = Array.from({ length: end - start }, (_, offset) =>
      evaluation(`note${start + offset}`, start + offset));
    return { records, cursor: records.length
      ? { completedAt: end - 1, id: `note${end - 1}` } : after,
    done: end === total };
  };
  many.staging.hasMergeMatches = async (section, ids) => ids.map(() => false);
  many.active.readAttemptHistoryPage = async () => ({ records: [],
    nextBlockNumber: null, done: true });
  let batches = 0;
  let largestBatch = 0;
  let manyFingerprint = createEmptySingleNotesHistoryFingerprint();
  many.shadow.database.appendImportedAttemptBatch = async (selectedScope,
    batch, start) => {
    batches += 1;
    largestBatch = Math.max(largestBatch, batch.length);
    batch.forEach(value => {
      manyFingerprint = extendSingleNotesHistoryFingerprint(
        manyFingerprint, value
      );
    });
    return { total: start + batch.length,
      fingerprint: manyFingerprint };
  };
  many.shadow.database.readAttemptHistoryState = async selectedScope => ({
    nextSequence: selectedScope === scope ? total : 0,
    fingerprint: selectedScope === scope ? manyFingerprint : null
  });
  const bigPlan = { sections: { [screen]: { current: 0,
    imported: total, new: total, duplicates: 0 },
  [midi]: plan.sections[midi] } };
  const big = await copyMergedSingleNotesToShadow(many.staging,
    many.active, many.shadow, bigPlan);
  assert.strictEqual(big[scope].total, total);
  assert.strictEqual(batches, 400);
  assert.strictEqual(largestBatch, 250);
  process.stdout.write("Large single-note merge writer tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
