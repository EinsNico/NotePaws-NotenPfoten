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
const { prepareMergedBackupInShadow } = require(
  "../src/model/SaveDataLargeMergePreparation.js"
);
const { normalizeAdaptiveEvaluation } = require(
  "../src/model/AdaptiveHistory.js"
);
const {
  createEmptySingleNotesHistoryFingerprint,
  extendSingleNotesHistoryFingerprint
} = require("../src/model/SingleNotesHistoryMigration.js");
Module._extensions[".js"] = originalLoader;

const sections = ["data.noteFlowRounds.screen", "data.noteFlowRounds.midi",
  "data.noteFlowRounds.chordMidi", "data.rhythmSenseBars",
  "data.adaptiveHistory.evaluations", "data.adaptiveHistoryMidi.evaluations",
  "data.adaptiveHistory.baselines", "data.adaptiveHistoryMidi.baselines"];
const roundSection = sections[0];
const noteSection = sections[4];
const roundScope = "screen:note-flow";
const noteScope = "screen:single-notes";
const evaluation = { id: "answer-1", completedAt: 1789550000000,
  exercise: { clef: "bass", staff: "bass", value: 48 },
  correctFirstTry: true, mistakeCount: 0, responseTimeMs: 700 };
const noteKey = normalizeAdaptiveEvaluation(evaluation).noteKey;
const round = { id: "round-1", completedAt: "2026-09-28T12:00:00.000Z",
  score: { correct: 1 } };

function fixture(withData = true) {
  const counts = Object.fromEntries(sections.map(section => [section,
    withData && (section === roundSection || section === noteSection) ? 1 : 0
  ]));
  const shell = { createdAt: "2026-09-28T12:00:00.000Z", data: {
    adaptiveProgress: withData ? { version: 2, notes: {
      [noteKey]: { attempts: 1, correctFirstTry: 1 }
    } } : null,
    adaptiveProgressMidi: null
  } };
  const staging = {
    async readMetadata() { return { key: "ready", counts, shell,
      fileSize: 100 }; },
    async resetMergeMatches() {},
    async markMergeMatches() {},
    async findRecordsByIdentities(section, ids) { return ids.map(() => null); },
    async hasMergeMatches(section, ids) { return ids.map(() => false); },
    async readBatch(section, start, limit) {
      const all = withData && section === roundSection ? [round] : [];
      const records = all.slice(start, start + limit);
      const nextIndex = start + records.length;
      return { records, nextIndex, total: all.length,
        done: nextIndex === all.length };
    },
    async readChronologicalBatch(section, after, limit) {
      const records = withData && section === noteSection && !after
        ? [evaluation] : [];
      return { records, cursor: records.length
        ? { completedAt: evaluation.completedAt, id: evaluation.id }
        : after, done: true };
    }
  };
  let statisticsReads = 0;
  const active = {
    async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
    async writeDailyTaskHistory(value) { this.dailyTaskHistory = value; },
    async readNoteFlowStatistics(scope) {
      statisticsReads += 1;
      return { roundCount: 0, scope };
    },
    async readAttemptHistoryState() {
      return { nextSequence: 0, fingerprint: null };
    },
    async readProgressSnapshot() { return []; },
    async readNoteFlowRoundsPage() {
      return { records: [], nextBlockNumber: null, done: true };
    },
    async readAttemptHistoryPage() {
      return { records: [], nextBlockNumber: null, done: true };
    }
  };
  const rounds = new Map();
  const attempts = new Map();
  const progress = new Map();
  const migrations = new Map();
  const database = {
    async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
    async writeDailyTaskHistory(value) { this.dailyTaskHistory = value; },
    async readImportGenerationMarker() {
      return { state: "preparing" };
    },
    async appendImportedNoteFlowBatch(scope, batch, start) {
      const existing = rounds.get(scope) || [];
      assert.strictEqual(existing.length, start);
      existing.push(...batch);
      rounds.set(scope, existing);
      return { total: existing.length };
    },
    async readNoteFlowRoundsPage(scope, after) {
      const records = after === null ? rounds.get(scope) || [] : [];
      return { records, nextBlockNumber: records.length ? 0 : null,
        done: true };
    },
    async readNoteFlowStatistics(scope) {
      return { roundCount: (rounds.get(scope) || []).length };
    },
    async appendImportedAttemptBatch(scope, batch, start) {
      const existing = attempts.get(scope) || [];
      assert.strictEqual(existing.length, start);
      existing.push(...batch);
      attempts.set(scope, existing);
      let fingerprint = createEmptySingleNotesHistoryFingerprint();
      existing.forEach(value => {
        fingerprint = extendSingleNotesHistoryFingerprint(fingerprint, value);
      });
      return { total: existing.length, fingerprint };
    },
    async readAttemptHistoryState(scope) {
      const existing = attempts.get(scope) || [];
      let fingerprint = createEmptySingleNotesHistoryFingerprint();
      existing.forEach(value => {
        fingerprint = extendSingleNotesHistoryFingerprint(fingerprint, value);
      });
      return { nextSequence: existing.length,
        fingerprint: existing.length ? fingerprint : null,
        migration: migrations.get(scope) || null };
    },
    async synchronizeProgressSnapshot(scope, snapshot, options) {
      assert.strictEqual(options.requireImportGeneration, true);
      progress.set(scope, snapshot.records);
    },
    async readProgressSnapshot(scope) { return progress.get(scope) || []; },
    async finalizeAttemptHistoryMigration(scope, migration) {
      migrations.set(scope, { ...migration, status: "complete" });
    },
    async sealVerifiedImportGeneration() {
      throw new Error("Merge preparation must not seal the database.");
    }
  };
  const shadow = { name: "noten-pfoten-learning-import-test", database };
  return { staging, active, shadow, rounds, attempts, progress,
    getStatisticsReads: () => statisticsReads };
}

(async () => {
  const first = fixture();
  const result = await prepareMergedBackupInShadow(first.staging,
    first.active, first.shadow);
  assert.strictEqual(result.rounds[roundScope].total, 1);
  assert.strictEqual(result.attempts[noteScope].total, 1);
  assert.strictEqual(result.progress[noteScope].noteCount, 1);
  assert.strictEqual(first.rounds.get(roundScope).length, 1);
  assert.strictEqual(first.attempts.get(noteScope).length, 1);
  assert.strictEqual(first.progress.get(noteScope).length, 1);
  assert.strictEqual(result.source.fileSize, 100);
  assert.strictEqual(first.getStatisticsReads(), 8);

  const empty = fixture(false);
  const emptyResult = await prepareMergedBackupInShadow(empty.staging,
    empty.active, empty.shadow);
  assert.strictEqual(emptyResult.rounds[roundScope].total, 0);
  assert.strictEqual(emptyResult.attempts[noteScope].total, 0);

  const notPreparing = fixture(false);
  notPreparing.shadow.database.readImportGenerationMarker = async () => ({
    state: "ready"
  });
  await assert.rejects(prepareMergedBackupInShadow(notPreparing.staging,
    notPreparing.active, notPreparing.shadow), /not preparing an import/);

  const changed = fixture();
  const original = changed.active.readNoteFlowStatistics;
  let reads = 0;
  changed.active.readNoteFlowStatistics = async scope => {
    const value = await original(scope);
    reads += 1;
    return reads > 4 ? { ...value, roundCount: 1 } : value;
  };
  await assert.rejects(prepareMergedBackupInShadow(changed.staging,
    changed.active, changed.shadow), /Active learning data changed/);

  const cancelled = fixture();
  await assert.rejects(prepareMergedBackupInShadow(cancelled.staging,
    cancelled.active, cancelled.shadow, () => false),
  error => error && error.name === "AbortError");
  assert.strictEqual(cancelled.rounds.size, 0);
  process.stdout.write("Large merge preparation tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
