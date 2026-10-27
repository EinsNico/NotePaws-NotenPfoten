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
const { prepareMergedBackupInShadow } = require(
  "../src/model/SaveDataLargeMergePreparation.js"
);
const { prepareMergedLocalSaveDataPlan } = require(
  "../src/model/SaveDataLargeMergeLocalPlan.js"
);
const { sealMergedBackupForCommit } = require(
  "../src/model/SaveDataLargeMergeSeal.js"
);
const { commitStagedShadowImport } = require(
  "../src/model/SaveDataShadowCommit.js"
);
const { activeLearningDatabaseName } = require(
  "../src/model/LearningDatabaseGeneration.js"
);
const { normalizeAdaptiveProgress } = require(
  "../src/model/AdaptiveLearning.js"
);
const { normalizeAdaptiveEvaluation } = require(
  "../src/model/AdaptiveHistory.js"
);
const {
  createEmptySingleNotesHistoryFingerprint,
  extendSingleNotesHistoryFingerprint
} = require(
  "../src/model/SingleNotesHistoryMigration.js"
);
Module._extensions[".js"] = originalLoader;

const stored = value => JSON.stringify({ data: value });
const normalRound = { id: "same-normal", completedAt: 1,
  mode: "normal", score: 80 };
const flowRound = { id: "new-flow", completedAt: "2026-09-28T12:00:00.000Z",
  score: { correct: 1 } };
const answer = { id: "new-answer", completedAt: 1789550000000,
  exercise: { clef: "bass", staff: "bass", value: 50 },
  correctFirstTry: true, mistakeCount: 0, responseTimeMs: 700 };
const shadowName = "noten-pfoten-learning-import-integrated-test";

function storage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    get length() { return data.size; },
    key(index) { return Array.from(data.keys())[index] || null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}

function fakeMetaDatabase(marker) {
  return async ({ name }) => {
    assert.strictEqual(name, shadowName);
    return {
      database: {
        transaction() {
          const transaction = {
            objectStore() {
              return {
                get() {
                  const request = {};
                  queueMicrotask(() => {
                    request.result = marker.value;
                    request.onsuccess();
                  });
                  return request;
                }
              };
            }
          };
          setImmediate(() => transaction.oncomplete());
          return transaction;
        }
      },
      close() {}
    };
  };
}

(async () => {
  const local = storage({
    options: stored({ difficulty: "current" }),
    roundHistory: stored({ version: 1, rounds: [normalRound] })
  });
  const previousStorage = global.localStorage;
  global.localStorage = local;
  try {
    const shell = createSaveDataBackup(storage(), {
      createdAt: "2026-09-28T12:00:00.000Z"
    });
    shell.data.options = { difficulty: "imported" };
    shell.data.roundHistory = { version: 1, rounds: [] };
    shell.data.adaptiveProgress = normalizeAdaptiveProgress({ notes: {
      "bass-48": { attempts: 2, correctFirstTry: 1, mistakes: 1 },
      [normalizeAdaptiveEvaluation(answer).noteKey]: {
        attempts: 1, correctFirstTry: 1
      }
    } });
    const counts = { "data.roundHistory.rounds": 1,
      "data.noteFlowRounds.screen": 1,
      "data.adaptiveHistory.evaluations": 1 };
    const staging = {
      async readMetadata() {
        return { key: "ready", shell, fileSize: 128, counts };
      },
      async resetMergeMatches() {},
      async markMergeMatches() {},
      async findRecordsByIdentities(section, ids) {
        return ids.map(() => null);
      },
      async hasMergeMatches(section, ids) {
        return ids.map(() => false);
      },
      async readBatch(section, start, limit) {
        const all = section === "data.roundHistory.rounds"
          ? [normalRound] : section === "data.noteFlowRounds.screen"
            ? [flowRound] : [];
        const records = all.slice(start, start + limit);
        return { records, nextIndex: start + records.length,
          total: all.length, done: start + records.length === all.length };
      },
      async readChronologicalBatch(section, cursor) {
        return { records: section === "data.adaptiveHistory.evaluations"
          && cursor === null ? [answer] : [],
        cursor: section === "data.adaptiveHistory.evaluations"
          && cursor === null
          ? { completedAt: answer.completedAt, id: answer.id } : cursor,
        done: true };
      }
    };
    const active = {
      async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
      async writeDailyTaskHistory(value) { this.dailyTaskHistory = value; },
      async readNoteFlowStatistics(scope) { return { scope, roundCount: 0 }; },
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
    const marker = { value: { state: "preparing" } };
    const rounds = new Map();
    const attempts = new Map();
    const progress = new Map();
    const migrations = new Map();
    const shadow = {
      name: shadowName,
      database: {
        async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
        async writeDailyTaskHistory(value) { this.dailyTaskHistory = value; },
        async readImportGenerationMarker() { return marker.value; },
        async appendImportedNoteFlowBatch(scope, batch, start) {
          const records = rounds.get(scope) || [];
          assert.strictEqual(records.length, start);
          records.push(...batch);
          rounds.set(scope, records);
          return { total: records.length };
        },
        async appendImportedAttemptBatch(scope, batch, start) {
          const records = attempts.get(scope) || [];
          assert.strictEqual(records.length, start);
          records.push(...batch);
          attempts.set(scope, records);
          let fingerprint = createEmptySingleNotesHistoryFingerprint();
          records.forEach(record => {
            fingerprint = extendSingleNotesHistoryFingerprint(
              fingerprint, record
            );
          });
          return { total: records.length, fingerprint };
        },
        async readNoteFlowStatistics(scope) {
          return { roundCount: (rounds.get(scope) || []).length };
        },
        async readNoteFlowRoundsPage(scope, after) {
          const records = after === null ? rounds.get(scope) || [] : [];
          return { records, nextBlockNumber: records.length ? 0 : null,
            done: true };
        },
        async readAttemptHistoryState(scope) {
          const records = attempts.get(scope) || [];
          let fingerprint = createEmptySingleNotesHistoryFingerprint();
          records.forEach(record => {
            fingerprint = extendSingleNotesHistoryFingerprint(
              fingerprint, record
            );
          });
          return { nextSequence: records.length, fingerprint,
            migration: migrations.get(scope) || null };
        },
        async readAttemptHistoryPage(scope, after) {
          const records = after === null ? attempts.get(scope) || [] : [];
          return { records, nextBlockNumber: records.length ? 0 : null,
            done: true };
        },
        async finalizeAttemptHistoryMigration(scope, value) {
          migrations.set(scope, { ...value, status: "complete" });
        },
        async synchronizeProgressSnapshot(scope, snapshot) {
          progress.set(scope, snapshot.records);
        },
        async readProgressSnapshot(scope) { return progress.get(scope) || []; },
        async sealVerifiedImportGeneration(summary) {
          marker.value = { state: "database-verified", summary };
        },
        async markVerifiedImportReady() {
          marker.value = { ...marker.value, state: "ready" };
        },
        async revertUnactivatedImportReady() {
          marker.value = { ...marker.value, state: "database-verified" };
        }
      }
    };
    const summary = await prepareMergedBackupInShadow(staging, active, shadow);
    assert.strictEqual(summary.rounds["screen:note-flow"].total, 1);
    assert.strictEqual(summary.attempts["screen:single-notes"].total, 1);
    const plan = await prepareMergedLocalSaveDataPlan(
      staging, shadow, summary, local
    );
    assert.strictEqual(plan.normalRoundCount, 1);
    assert.strictEqual(plan.normalRoundDuplicates, 1);
    assert.strictEqual(JSON.parse(plan.values.options).data.difficulty, "current");
    assert.strictEqual(JSON.parse(plan.values.adaptiveProgress)
      .data.notes["bass-48"].attempts, 2);
    await sealMergedBackupForCommit(active, shadow, summary, plan, local);
    const result = await commitStagedShadowImport(plan, shadow, local, {
      activeDatabase: active,
      flushCurrentWrites: async () => {},
      openDatabase: fakeMetaDatabase(marker)
    });
    assert.strictEqual(result.committed, true);
    assert.strictEqual(activeLearningDatabaseName(local), shadowName);
    assert.strictEqual(JSON.parse(local.getItem("roundHistory")).data.rounds.length, 1);
    assert.strictEqual(JSON.parse(local.getItem("adaptiveProgress"))
      .data.notes["bass-48"].attempts, 2);
    assert.strictEqual(rounds.get("screen:note-flow").length, 1);
    assert.strictEqual(attempts.get("screen:single-notes").length, 1);
    console.log("Large merge end-to-end test passed.");
  } finally {
    global.localStorage = previousStorage;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
