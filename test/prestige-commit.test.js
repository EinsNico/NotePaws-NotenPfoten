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
const { preparePrestigeArchivePreview } = require("../src/model/PrestigePreparation");
const { preparePrestigeCommit, commitPreparedPrestige } = require("../src/model/PrestigeCommit");
const { ACTIVE_LEARNING_DATABASE_KEY } = require("../src/model/LearningDatabaseGeneration");
Module._extensions[".js"] = original;

function storage() {
  const values = new Map();
  return { values, get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] || null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); } };
}

const total = 100250;
const start = Date.UTC(2026, 8, 30);
const progress = [{ noteKey: "treble:C4", learningRecord: {
  attempts: total, correctFirstTry: 80000, difficulty: 1.2
} }];
const page = (after, imported = false) => {
  const offset = (after === null ? 0 : after + 1) * 250;
  const length = Math.min(250, Math.max(0, total - offset));
  return { records: Array.from({ length }, (_, index) => ({
    id: `note-${offset + index}`, scope: "screen:single-notes",
    sessionId: "one", noteKey: "treble:C4", staff: "treble",
    completedAt: start + (offset + index) * 1000,
    correctFirstTry: true, mistakeCount: 0, responseTimeMs: 500,
    ...(imported && offset + index < 100 ? { prestigeEligible: false } : {})
  })), nextBlockNumber: length ? Math.floor(offset / 250) : null,
  done: offset + length >= total };
};
const empty = { records: [], nextBlockNumber: null, done: true };

function fixture(imported = false) {
  const local = storage();
  const written = [];
  const storedProgress = {};
  const migrations = {};
  const marker = { state: "preparing" };
  const active = {
    async readStoredEntryCounts() { return { singleNotesScreen: total,
      singleNotesMidi: 0, melodyRounds: 0, chordRounds: 0, rhythmBars: 0 }; },
    async readAttemptHistoryPage(scope, after) {
      return scope === "screen:single-notes" ? page(after, imported) : empty;
    },
    async readNoteFlowRoundsPage() { return empty; },
    async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
    async readNoteFlowStatistics(scope) { return { scope, roundCount: 0 }; },
    async readAttemptHistoryState(scope) { return {
      nextSequence: scope === "screen:single-notes" ? total : 0,
      fingerprint: null
    }; },
    async readProgressSnapshot(scope) {
      return scope === "screen:single-notes" ? progress : [];
    }
  };
  const shadow = { name: "noten-pfoten-learning-import-prestige-commit",
    database: {
      async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
      async writeDailyTaskHistory(value) { this.dailyTaskHistory = value && JSON.parse(JSON.stringify(value)); },
      async readImportGenerationMarker() { return marker; },
      async appendImportedAttemptBatch(scope, batch, offset) {
        assert.strictEqual(scope, "screen:single-notes");
        assert.strictEqual(offset, written.length);
        written.push(...batch);
      },
      async appendImportedNoteFlowBatch() { throw new Error("Unexpected round."); },
      async readStoredEntryCounts() { return { singleNotesScreen: written.length,
        singleNotesMidi: 0, melodyRounds: 0, chordRounds: 0, rhythmBars: 0 }; },
      async synchronizeProgressSnapshot(scope, snapshot, options) {
        assert.strictEqual(options.requireImportGeneration, true);
        storedProgress[scope] = snapshot.records;
      },
      async readProgressSnapshot(scope) { return storedProgress[scope] || []; },
      async readAttemptHistoryState(scope) { return {
        nextSequence: scope === "screen:single-notes" ? written.length : 0,
        fingerprint: null, migration: migrations[scope]
      }; },
      async finalizeAttemptHistoryMigration(scope, value) {
        migrations[scope] = { ...value, status: "complete" };
      },
      async sealVerifiedImportGeneration(summary) {
        assert.strictEqual(marker.state, "preparing");
        marker.state = "database-verified";
        marker.summary = summary;
      },
      async markVerifiedImportReady() { marker.state = "ready"; },
      async revertUnactivatedImportReady() { marker.state = "database-verified"; }
    } };
  const openDatabase = async () => ({
    database: { transaction() {
      const tx = { objectStore() { return { get() {
        const request = {};
        queueMicrotask(() => { request.result = marker; request.onsuccess(); });
        return request;
      } }; } };
      setImmediate(() => tx.oncomplete());
      return tx;
    } }, close() {}
  });
  return { local, active, shadow, marker, written, openDatabase };
}

(async () => {
  const value = fixture();
  const dailyHistory = {
    version: 1, startDay: "2026-09-30", checkedThrough: "2026-09-29",
    days: { "2026-09-30": { tasks: ["single", "melody", "rhythm"].map(mode => ({
      id: "2026-09-30:" + mode, mode, goal: 1, value: 1, complete: true
    })) } }
  };
  value.active.dailyTaskHistory = dailyHistory;
  const preview = await preparePrestigeArchivePreview(value.active, {
    id: "prestige-real-1", createdAt: "2026-09-30T12:00:00.000Z"
  });
  const prepared = await preparePrestigeCommit(preview, value.active,
    value.shadow, value.local);
  assert.strictEqual(prepared.summary.details.kept["screen:single-notes"], 250);
  assert.strictEqual(value.written[0].id, "note-100000");
  assert.strictEqual(value.marker.state, "database-verified");
  assert.strictEqual(JSON.parse(prepared.plan.values.prestigeArchive)
    .data.segments[0].levels, 1);
  assert.deepStrictEqual(value.shadow.database.dailyTaskHistory, dailyHistory);
  assert.deepStrictEqual(prepared.summary.dailyTaskHistory, dailyHistory);
  // A changed archive after preparation must block activation, not lose a day.
  value.shadow.database.dailyTaskHistory = null;
  await assert.rejects(commitPreparedPrestige(prepared, value.shadow,
    value.active, value.local, { flushCurrentWrites: async () => {},
      openDatabase: value.openDatabase }), /prepared daily task history changed/);
  assert.strictEqual(value.local.getItem(ACTIVE_LEARNING_DATABASE_KEY), null);
  value.shadow.database.dailyTaskHistory = JSON.parse(JSON.stringify(dailyHistory));
  const result = await commitPreparedPrestige(prepared, value.shadow,
    value.active, value.local, { flushCurrentWrites: async () => {},
      openDatabase: value.openDatabase });
  assert.strictEqual(result.committed, true);
  assert.strictEqual(value.local.getItem(ACTIVE_LEARNING_DATABASE_KEY),
    value.shadow.name);
  assert.strictEqual(value.local.getItem("noten-pfoten:pending-backup-import"), null);
  assert.deepStrictEqual(value.shadow.database.dailyTaskHistory, dailyHistory);
  assert.deepStrictEqual(value.active.dailyTaskHistory, dailyHistory);
  process.stdout.write("✓ prestige preserves daily goals, completion and streak metadata; changed prepared history blocks activation\n");
  const mixed = fixture(true);
  const mixedFreeRounds = [
    { id: "imported-free", completedAt: start - 2000,
      numAnswers: 1, numCorrect: 1, prestigeEligible: false },
    { id: "earned-free", completedAt: start - 1000,
      numAnswers: 1, numCorrect: 1 }
  ];
  mixed.local.setItem("roundHistory", JSON.stringify({ data: {
    version: 1, rounds: mixedFreeRounds
  } }));
  const mixedPreview = await preparePrestigeArchivePreview(mixed.active, {
    id: "prestige-mixed", createdAt: "2026-09-30T12:00:00.000Z",
    freeRounds: mixedFreeRounds
  });
  assert.strictEqual(mixedPreview.sourceCounts.freeRounds, 1);
  assert.strictEqual(mixedPreview.sourceCounts["screen:single-notes"], 99999);
  const mixedPrepared = await preparePrestigeCommit(mixedPreview, mixed.active,
    mixed.shadow, mixed.local);
  assert.strictEqual(mixed.written.length, 251);
  assert.deepStrictEqual(mixed.written.slice(0, 100).map(record => record.id),
    Array.from({ length: 100 }, (_, index) => `note-${index}`));
  assert.strictEqual(mixed.written[100].id, "note-100099");
  assert.deepStrictEqual(JSON.parse(mixedPrepared.plan.values.roundHistory).data
    .rounds.map(round => round.id), ["imported-free"]);
  const mixedCommit = await commitPreparedPrestige(mixedPrepared,
    mixed.shadow, mixed.active, mixed.local, {
      flushCurrentWrites: async () => {}, openDatabase: mixed.openDatabase
    });
  assert.strictEqual(mixedCommit.committed, true);
  assert.strictEqual(mixed.local.getItem(ACTIVE_LEARNING_DATABASE_KEY),
    mixed.shadow.name);
  const stale = fixture();
  const stalePreview = await preparePrestigeArchivePreview(stale.active, {
    id: "prestige-stale-1", createdAt: "2026-09-30T12:00:00.000Z"
  });
  const stalePrepared = await preparePrestigeCommit(stalePreview, stale.active,
    stale.shadow, stale.local);
  stale.local.setItem("options", JSON.stringify({ data: { difficulty: "changed" } }));
  await assert.rejects(commitPreparedPrestige(stalePrepared, stale.shadow,
    stale.active, stale.local, { flushCurrentWrites: async () => {},
      openDatabase: stale.openDatabase }), /Learning data changed/);
  assert.strictEqual(stale.local.getItem(ACTIVE_LEARNING_DATABASE_KEY), null);
  assert.strictEqual(stale.marker.state, "database-verified");
  const writeFailure = fixture();
  writeFailure.local.setItem("options", JSON.stringify({ data: { language: "de" } }));
  const beforeFailure = Array.from(writeFailure.local.values.entries());
  const failurePreview = await preparePrestigeArchivePreview(writeFailure.active, {
    id: "prestige-write-failure", createdAt: "2026-09-30T12:00:00.000Z"
  });
  const failurePrepared = await preparePrestigeCommit(failurePreview,
    writeFailure.active, writeFailure.shadow, writeFailure.local);
  const originalSetItem = writeFailure.local.setItem.bind(writeFailure.local);
  let failOnce = true;
  writeFailure.local.setItem = (key, value) => {
    if (key === "prestigeArchive" && failOnce) {
      failOnce = false;
      throw new Error("Simulated local storage failure");
    }
    originalSetItem(key, value);
  };
  await assert.rejects(commitPreparedPrestige(failurePrepared,
    writeFailure.shadow, writeFailure.active, writeFailure.local,
    { flushCurrentWrites: async () => {}, openDatabase: writeFailure.openDatabase }),
  /Simulated local storage failure/);
  assert.deepStrictEqual(Array.from(writeFailure.local.values.entries()), beforeFailure);
  assert.strictEqual(writeFailure.local.getItem(ACTIVE_LEARNING_DATABASE_KEY), null);
  assert.strictEqual(writeFailure.local.getItem("noten-pfoten:pending-backup-import"), null);
  assert.strictEqual(writeFailure.marker.state, "database-verified");
  const historyFailure = fixture();
  historyFailure.active.dailyTaskHistory = dailyHistory;
  historyFailure.shadow.database.writeDailyTaskHistory = async () => { throw new Error("daily history quota"); };
  const historyPreview = await preparePrestigeArchivePreview(historyFailure.active, {
    id: "prestige-history-failure", createdAt: "2026-09-30T12:00:00.000Z"
  });
  await assert.rejects(preparePrestigeCommit(historyPreview, historyFailure.active,
    historyFailure.shadow, historyFailure.local), /daily history quota/);
  assert.strictEqual(historyFailure.local.getItem(ACTIVE_LEARNING_DATABASE_KEY), null);
  assert.strictEqual(historyFailure.marker.state, "preparing");
  assert.deepStrictEqual(historyFailure.active.dailyTaskHistory, dailyHistory);
  process.stdout.write("✓ a failed daily-history copy cannot activate prestige or change the current calendar\n");
  process.stdout.write("Prestige commit test passed (atomic switch, stale data and write rollback).\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
