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
const { summarizePrestigeArchive, PRESTIGE_ENTRY_SCOPES,
  PRESTIGE_METRIC_FIELDS, PRESTIGE_TIME_WINDOWS } = require("../src/model/PrestigeArchive");
const { ACTIVE_LEARNING_DATABASE_KEY } = require("../src/model/LearningDatabaseGeneration");
Module._extensions[".js"] = original;

const counts = { singleNotesScreen: 150000, singleNotesMidi: 0,
  melodyRounds: 100000, chordRounds: 0, rhythmBars: 100000 };
const scopeSizes = { "screen:single-notes": 150000, "midi:single-notes": 0,
  "screen:note-flow": 100000, "midi:note-flow": 0,
  "midi:note-flow-chords": 0, "rhythm:taktgefuehl": 100000 };
const base = Date.UTC(2026, 8, 1);
const scopeStart = { "screen:single-notes": 0, "screen:note-flow": 150000,
  "rhythm:taktgefuehl": 250000 };
const emptyPage = { records: [], nextBlockNumber: null, done: true };

function page(scope, after, blockSize, kind) {
  const size = scopeSizes[scope] || 0;
  const offset = (after === null ? 0 : after + 1) * blockSize;
  const length = Math.min(blockSize, Math.max(0, size - offset));
  if (!length) return emptyPage;
  const records = Array.from({ length }, (_, index) => {
    const number = offset + index;
    const completedAt = base + ((scopeStart[scope] || 0) + number) * 1000;
    return kind === "attempt"
      ? { id: `note-${number}`, scope, sessionId: "stress-session",
        noteKey: "treble:C4", staff: "treble", completedAt,
        correctFirstTry: number % 4 !== 0,
        mistakeCount: number % 4 === 0 ? 1 : 0, responseTimeMs: 500 }
      : { id: `${scope}-${number}`, scope,
        completedAt: new Date(completedAt).toISOString(),
        durationMs: 2000, score: { correct: 2, wrong: 1, missed: 0 } };
  });
  return { records, nextBlockNumber: Math.floor(offset / blockSize),
    done: offset + length >= size };
}

function storage() {
  const values = new Map([["options", JSON.stringify({ data: { language: "de" } })]]);
  return { values, get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] || null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); } };
}

function fixture(local, onAppend = () => {}) {
  const retained = new Map();
  const progress = new Map();
  const migrations = new Map();
  const marker = { state: "preparing" };
  const active = {
    async readStoredEntryCounts() { return { ...counts }; },
    async readAttemptHistoryPage(scope, after) {
      return page(scope, after, 250, "attempt");
    },
    async readNoteFlowRoundsPage(scope, after) {
      return page(scope, after, 100, "round");
    },
    async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
    async readNoteFlowStatistics(scope) {
      return { scope, roundCount: scopeSizes[scope] || 0 };
    },
    async readAttemptHistoryState(scope) {
      return { nextSequence: scopeSizes[scope] || 0, fingerprint: null };
    },
    async readProgressSnapshot(scope) {
      return scope === "screen:single-notes" ? [{ noteKey: "treble:C4",
        learningRecord: { attempts: 150000, correctFirstTry: 112500,
          difficulty: 1.5 } }] : [];
    }
  };
  const shadow = { name: "noten-pfoten-learning-import-prestige-stress",
    database: {
      async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
      async writeDailyTaskHistory(value) { this.dailyTaskHistory = value && JSON.parse(JSON.stringify(value)); },
      async readImportGenerationMarker() { return marker; },
      async appendImportedAttemptBatch(scope, batch, offset) {
        const list = retained.get(scope) || [];
        assert.strictEqual(offset, list.length);
        list.push(...batch);
        retained.set(scope, list);
        onAppend(scope);
      },
      async appendImportedNoteFlowBatch(scope, batch, offset) {
        const list = retained.get(scope) || [];
        assert.strictEqual(offset, list.length);
        list.push(...batch);
        retained.set(scope, list);
        onAppend(scope);
      },
      async readStoredEntryCounts() { return {
        singleNotesScreen: (retained.get("screen:single-notes") || []).length,
        singleNotesMidi: (retained.get("midi:single-notes") || []).length,
        melodyRounds: (retained.get("screen:note-flow") || []).length
          + (retained.get("midi:note-flow") || []).length,
        chordRounds: (retained.get("midi:note-flow-chords") || []).length,
        rhythmBars: (retained.get("rhythm:taktgefuehl") || []).length
      }; },
      async synchronizeProgressSnapshot(scope, snapshot) {
        progress.set(scope, snapshot.records);
      },
      async readProgressSnapshot(scope) { return progress.get(scope) || []; },
      async readAttemptHistoryState(scope) { return {
        nextSequence: (retained.get(scope) || []).length,
        fingerprint: null, migration: migrations.get(scope)
      }; },
      async finalizeAttemptHistoryMigration(scope, value) {
        migrations.set(scope, { ...value, status: "complete" });
      },
      async sealVerifiedImportGeneration(summary) {
        marker.state = "database-verified";
        marker.summary = summary;
      },
      async markVerifiedImportReady() { marker.state = "ready"; },
      async revertUnactivatedImportReady() { marker.state = "database-verified"; }
    } };
  const openDatabase = async () => ({ database: { transaction() {
    const transaction = { objectStore() { return { get() {
      const request = {};
      queueMicrotask(() => { request.result = marker; request.onsuccess(); });
      return request;
    } }; } };
    setImmediate(() => transaction.oncomplete());
    return transaction;
  } }, close() {} });
  return { active, shadow, marker, retained, progress, local, openDatabase };
}

(async () => {
  const local = storage();
  const zeros = () => Object.fromEntries(PRESTIGE_METRIC_FIELDS.map(field => [field, 0]));
  const oldSegment = {
    id: "prestige-stress-existing", createdAt: "2026-08-31T12:00:00.000Z",
    levels: 2,
    entryCounts: Object.fromEntries(PRESTIGE_ENTRY_SCOPES.map(scope => [
      scope, scope === "singleNotesScreen" ? 200000 : 0
    ])),
    metrics: Object.fromEntries(PRESTIGE_ENTRY_SCOPES.map(scope => [scope, zeros()])),
    timeWindows: Object.fromEntries(PRESTIGE_TIME_WINDOWS.map(window => [window, zeros()]))
  };
  oldSegment.metrics.singleNotesScreen.playedCount = 200000;
  local.setItem("prestigeArchive", JSON.stringify({ data: {
    version: 1, segments: [oldSegment]
  } }));
  const initialSnapshot = Array.from(local.values.entries());
  const cancelled = { value: false };
  const first = fixture(local, scope => {
    if (scope === "rhythm:taktgefuehl") cancelled.value = true;
  });
  const preview = await preparePrestigeArchivePreview(first.active, {
    id: "prestige-stress-350k", createdAt: "2026-09-30T12:00:00.000Z"
  });
  assert.strictEqual(preview.segment.levels, 3);
  assert.strictEqual(preview.segment.entryCounts.singleNotesScreen, 150000);
  assert.strictEqual(preview.segment.entryCounts.melodyRounds, 100000);
  assert.strictEqual(preview.segment.entryCounts.rhythmBars, 50000);
  assert.strictEqual(preview.detailEntriesRemaining, 50000);
  await assert.rejects(preparePrestigeCommit(preview, first.active,
    first.shadow, local, () => !cancelled.value),
  error => error && error.name === "AbortError");
  assert.strictEqual(first.marker.state, "preparing");
  assert.deepStrictEqual(Array.from(local.values.entries()), initialSnapshot);
  assert.strictEqual(local.getItem(ACTIVE_LEARNING_DATABASE_KEY), null);

  const second = fixture(local);
  const prepared = await preparePrestigeCommit(preview, second.active,
    second.shadow, local);
  assert.strictEqual((second.retained.get("rhythm:taktgefuehl") || []).length, 50000);
  assert.strictEqual((second.retained.get("screen:single-notes") || []).length, 0);
  assert.strictEqual(second.progress.get("screen:single-notes")[0]
    .learningRecord.attempts, 150000);
  const result = await commitPreparedPrestige(prepared, second.shadow,
    second.active, local, { flushCurrentWrites: async () => {},
      openDatabase: second.openDatabase });
  assert.strictEqual(result.committed, true);
  assert.strictEqual(local.getItem(ACTIVE_LEARNING_DATABASE_KEY), second.shadow.name);
  const archive = JSON.parse(local.getItem("prestigeArchive")).data;
  const summary = summarizePrestigeArchive(archive);
  assert.strictEqual(summary.prestige, 5);
  assert.strictEqual(archive.segments.length, 2);
  assert.strictEqual(summary.entryCounts.singleNotesScreen, 350000);
  assert.strictEqual(summary.entryCounts.rhythmBars, 50000);
  assert.strictEqual(summary.metrics.singleNotesScreen.playedCount, 350000);
  assert.strictEqual(summary.metrics.melodyRounds.roundCount, 100000);
  process.stdout.write("Prestige stress passed (350k -> +3 levels, 50k details; existing prestige retained; cancel unchanged).\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
