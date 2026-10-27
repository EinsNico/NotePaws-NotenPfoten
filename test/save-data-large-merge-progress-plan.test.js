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
const { planMergedSingleNoteProgress } = require(
  "../src/model/SaveDataLargeMergeProgressPlan.js"
);
const { normalizeAdaptiveEvaluation } = require(
  "../src/model/AdaptiveHistory.js"
);
Module._extensions[".js"] = originalLoader;

const section = "data.adaptiveHistory.evaluations";
const midiSection = "data.adaptiveHistoryMidi.evaluations";
function evaluation(id, completedAt) {
  return { id, completedAt,
    exercise: { clef: "bass", staff: "bass", value: 48 },
    correctFirstTry: true, mistakeCount: 0, responseTimeMs: 700 };
}
const noteKey = normalizeAdaptiveEvaluation(evaluation("same", 1)).noteKey;
const importedEvaluations = [evaluation("same", 1), evaluation("new", 2)];
const indexed = { sections: {
  [section]: { current: 1, imported: 2, new: 1, duplicates: 1 },
  [midiSection]: { current: 0, imported: 0, new: 0, duplicates: 0 }
} };
function fixture() {
  const metadata = { key: "ready", counts: {
    [section]: 2, [midiSection]: 0,
    "data.adaptiveHistory.baselines": 0,
    "data.adaptiveHistoryMidi.baselines": 0
  }, shell: { data: {
    adaptiveProgress: { version: 2, notes: {
      [noteKey]: { attempts: 2, correctFirstTry: 2 }
    } },
    adaptiveProgressMidi: null
  } } };
  const staging = {
    async readMetadata() { return metadata; },
    async readChronologicalBatch(selectedSection, after, limit) {
      assert.strictEqual(limit, 250);
      const records = selectedSection === section && !after
        ? importedEvaluations : [];
      return { records, cursor: records.length
        ? { completedAt: 2, id: "new" } : after, done: true };
    },
    async hasMergeMatches(selectedSection, ids) {
      return ids.map(id => id === "same");
    }
  };
  const active = {
    async readProgressSnapshot(scope) {
      return scope === "screen:single-notes"
        ? [{ noteKey, learningRecord: { attempts: 1, correctFirstTry: 1 } }]
        : [];
    }
  };
  return { metadata, staging, active };
}

(async () => {
  const first = fixture();
  const plan = await planMergedSingleNoteProgress(first.staging,
    first.active, indexed);
  assert.strictEqual(plan["screen:single-notes"].newAnswers, 1);
  assert.strictEqual(plan["screen:single-notes"].duplicateAnswers, 1);
  assert.strictEqual(plan["screen:single-notes"].importedBaselineAttempts, 0);
  assert.strictEqual(plan["screen:single-notes"].noteAdditions[noteKey], 1);
  assert.strictEqual(plan["midi:single-notes"].newAnswers, 0);

  const overlap = fixture();
  overlap.metadata.shell.data.adaptiveProgress.notes[noteKey].attempts = 3;
  await assert.rejects(planMergedSingleNoteProgress(overlap.staging,
    overlap.active, indexed), /Overlapping learning baseline/);

  // Prestige has removed 100 older answers, but both sides retain the same
  // cumulative learning snapshot and the same two detailed answers.
  const prestige = fixture();
  const saved = { attempts: 102, correctFirstTry: 90 };
  prestige.metadata.shell.data.adaptiveProgress.notes[noteKey] = saved;
  prestige.active.readProgressSnapshot = async scope =>
    scope === "screen:single-notes" ? [{ noteKey, learningRecord: saved }] : [];
  prestige.staging.hasMergeMatches = async (selected, ids) => ids.map(() => true);
  const duplicateIndex = { sections: {
    [section]: { current: 2, imported: 2, new: 0, duplicates: 2 },
    [midiSection]: indexed.sections[midiSection]
  } };
  const repeated = await planMergedSingleNoteProgress(prestige.staging,
    prestige.active, duplicateIndex);
  assert.strictEqual(repeated["screen:single-notes"].newAnswers, 0);
  assert.strictEqual(repeated["screen:single-notes"].importedBaselineAttempts, 100);
  prestige.active.readProgressSnapshot = async scope =>
    scope === "screen:single-notes" ? [{ noteKey, learningRecord: {
      attempts: 102, correctFirstTry: 89
    } }] : [];
  await assert.rejects(planMergedSingleNoteProgress(prestige.staging,
    prestige.active, duplicateIndex), /Overlapping learning baseline/);

  const incomplete = fixture();
  incomplete.metadata.shell.data.adaptiveProgress.notes[noteKey].attempts = 1;
  await assert.rejects(planMergedSingleNoteProgress(incomplete.staging,
    incomplete.active, indexed), /omits answers/);

  const legacy = fixture();
  legacy.metadata.shell.data.adaptiveProgress = null;
  legacy.metadata.counts["data.adaptiveHistory.baselines"] = 1;
  await assert.rejects(planMergedSingleNoteProgress(legacy.staging,
    legacy.active, indexed), /separate reconciliation/);

  const cancelled = fixture();
  await assert.rejects(planMergedSingleNoteProgress(cancelled.staging,
    cancelled.active, indexed, () => false),
  error => error && error.name === "AbortError");

  const large = fixture();
  const total = 100000;
  large.metadata.counts[section] = total;
  large.metadata.shell.data.adaptiveProgress.notes[noteKey].attempts = total;
  large.staging.readChronologicalBatch = async (selectedSection, after,
    limit) => {
    assert.strictEqual(limit, 250);
    if (selectedSection !== section) {
      return { records: [], cursor: after, done: true };
    }
    const start = after ? Number(after.id.slice(1)) + 1 : 0;
    const end = Math.min(total, start + limit);
    const records = Array.from({ length: end - start }, (_, offset) =>
      evaluation(`e${start + offset}`, start + offset));
    return { records, cursor: records.length
      ? { completedAt: end - 1, id: `e${end - 1}` } : after,
    done: end === total };
  };
  large.staging.hasMergeMatches = async (selectedSection, ids) =>
    ids.map(() => false);
  large.active.readProgressSnapshot = async () => [];
  const largeIndexed = { sections: {
    [section]: { current: 0, imported: total, new: total,
      duplicates: 0 },
    [midiSection]: indexed.sections[midiSection]
  } };
  const largePlan = await planMergedSingleNoteProgress(large.staging,
    large.active, largeIndexed);
  assert.strictEqual(largePlan["screen:single-notes"].newAnswers, total);
  assert.strictEqual(largePlan["screen:single-notes"].noteAdditions[noteKey],
    total);
  process.stdout.write("Large learning-progress merge preflight tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
