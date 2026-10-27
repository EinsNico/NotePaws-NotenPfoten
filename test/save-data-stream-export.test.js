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
  streamIndexedDbSaveDataBackup
} = require("../src/model/SaveDataFiles.js");
const { validateSaveDataBackup } = require("../src/model/SaveDataBackup.js");
const { SaveDataStreamReader } = require("../src/model/SaveDataStreamReader.js");
Module._extensions[".js"] = originalLoader;

const localData = Object.create(null);
const storage = {
  get length() { return Object.keys(localData).length; },
  key: index => Object.keys(localData)[index] || null,
  getItem: key => Object.prototype.hasOwnProperty.call(localData, key)
    ? localData[key] : null,
  setItem: (key, value) => { localData[key] = String(value); },
  removeItem: key => { delete localData[key]; }
};
const attempt = (id, value) => ({
  id, completedAt: 1789550001000 + value,
  noteKey: `treble:${value}:natural`, staff: "piano",
  correctFirstTry: true, mistakeCount: 0, responseTimeMs: 500
});
const rhythmBar = {
  id: "bar-1", sessionId: "session-1", barNumber: 1,
  completedAt: "2026-09-28T12:00:00.000Z",
  settings: { meter: "4/4", bpm: 80 }, score: { correct: 1 },
  timing: {}, notes: [{ beat: 0, value: "quarter", result: "correct", offsetMs: 20 }]
};
const learningStorage = {
  readDailyTaskHistory: async () => ({ saved: true, history: null }),
  flush: async () => {},
  getStatus: () => ({ failedWrites: 0 }),
  verifyHistoryReady: async () => ({ saved: true, verified: true }),
  migrateLegacyHistory: async () => ({ saved: true, verified: true }),
  synchronizeProgress: async () => ({ saved: true }),
  readProgress: async () => ({ saved: true, progress: { version: 3, notes: {} } }),
  readBackupSnapshot: () => { throw new Error("Whole-history read is forbidden."); },
  async readBackupAttemptsPage(group, after) {
    if (group === "midi") {
      return { saved: true, page: { records: [], done: true } };
    }
    return { saved: true, page: after === null
      ? { records: [attempt("n1", 60)], nextBlockNumber: 0, done: false }
      : { records: [attempt("n2", 62)], nextBlockNumber: 1, done: true } };
  }
};
const noteFlowStorage = {
  flush: async () => {},
  readRoundsPage: async (group, after, limit, kind) => ({
    saved: true,
    page: { records: group === "screen" && kind !== "chord"
      ? [{ id: "flow-1", settings: { inputMode: "button" },
        label: "🙂".repeat(40000) }] : [], done: true }
  })
};
const rhythmStorage = {
  flush: async () => {},
  readBarsPage: async () => ({ saved: true, page: { records: [rhythmBar], done: true } })
};

(async () => {
  const chunks = [];
  const progress = [];
  const result = await streamIndexedDbSaveDataBackup(async chunk => {
    await Promise.resolve(); // The writer may apply asynchronous backpressure.
    chunks.push(chunk);
  }, storage, {
    learningStorage, noteFlowStorage, rhythmStorage,
    onProgress: value => progress.push(value),
    createdAt: "2026-09-28T12:00:00.000Z"
  });
  const text = chunks.join("");
  chunks.forEach(chunk => {
    const last = chunk.charCodeAt(chunk.length - 1);
    assert(!(last >= 0xd800 && last <= 0xdbff));
  });
  const backup = JSON.parse(text);
  assert.strictEqual(result.bytesWritten, Buffer.byteLength(text, "utf8"));
  assert.strictEqual(progress[0].phase, "preparing");
  assert.strictEqual(progress[progress.length - 1].phase, "finalizing");
  assert.strictEqual(progress[progress.length - 1].bytesWritten, result.bytesWritten);
  assert.strictEqual(progress[progress.length - 1].recordCount, 4);
  for (let index = 1; index < progress.length; index++) {
    assert(progress[index].bytesWritten >= progress[index - 1].bytesWritten);
    assert(progress[index].recordCount >= progress[index - 1].recordCount);
  }
  assert.strictEqual(backup.version, 4);
  assert.strictEqual(validateSaveDataBackup(backup).valid, true);
  assert.deepStrictEqual(
    backup.data.adaptiveHistory.evaluations.map(value => value.id),
    ["n1", "n2"]
  );
  assert.strictEqual(backup.data.noteFlowRounds.screen[0].id, "flow-1");
  assert.strictEqual(backup.data.rhythmSenseBars[0].id, "bar-1");
  assert.strictEqual(result.counts["data.adaptiveHistory.evaluations"], 2);
  const streamed = [];
  const reader = new SaveDataStreamReader((section, record) => {
    streamed.push([section, record.id]);
  });
  chunks.forEach(chunk => reader.push(chunk));
  reader.finish();
  assert.deepStrictEqual(streamed, [
    ["data.adaptiveHistory.evaluations", "n1"],
    ["data.adaptiveHistory.evaluations", "n2"],
    ["data.noteFlowRounds.screen", "flow-1"],
    ["data.rhythmSenseBars", "bar-1"]
  ]);
  await assert.rejects(
    streamIndexedDbSaveDataBackup(() => Promise.reject(new Error("disk full")),
      storage, { learningStorage, noteFlowStorage, rhythmStorage }),
    /disk full/
  );
  if (process.argv.includes("--stress")) {
    const notesTotal = 300000;
    const barsTotal = 200000;
    const pageSize = 1000;
    const largeLearningStorage = Object.assign({}, learningStorage, {
      async readBackupAttemptsPage(group, after) {
        if (group === "midi") {
          return { saved: true, page: { records: [], done: true } };
        }
        const start = after === null ? 0 : (after + 1) * pageSize;
        const end = Math.min(notesTotal, start + pageSize);
        const records = [];
        for (let index = start; index < end; index += 1) {
          records.push({
            id: `note-${index}`, completedAt: 1789550000000 + index,
            noteKey: "treble:60:natural", staff: "piano",
            correctFirstTry: true, mistakeCount: 0, responseTimeMs: 500
          });
        }
        return { saved: true, page: {
          records, nextBlockNumber: Math.floor(start / pageSize),
          done: end === notesTotal
        } };
      }
    });
    const largeNoteFlowStorage = {
      flush: async () => {},
      readRoundsPage: async () => ({ saved: true, page: { records: [], done: true } })
    };
    const largeRhythmStorage = {
      flush: async () => {},
      async readBarsPage(after) {
        const start = after === null ? 0 : (after + 1) * pageSize;
        const end = Math.min(barsTotal, start + pageSize);
        const records = [];
        for (let index = start; index < end; index += 1) {
          records.push(Object.assign({}, rhythmBar, {
            id: `bar-${index}`, sessionId: `session-${Math.floor(index / 10)}`,
            barNumber: index % 10 + 1
          }));
        }
        return { saved: true, page: {
          records, nextBlockNumber: Math.floor(start / pageSize),
          done: end === barsTotal
        } };
      }
    };
    let recordsSeen = 0;
    let maxChunkLength = 0;
    const largeReader = new SaveDataStreamReader(() => { recordsSeen += 1; });
    const largeResult = await streamIndexedDbSaveDataBackup(chunk => {
      maxChunkLength = Math.max(maxChunkLength, chunk.length);
      largeReader.push(chunk);
    }, storage, {
      learningStorage: largeLearningStorage,
      noteFlowStorage: largeNoteFlowStorage, rhythmStorage: largeRhythmStorage
    });
    largeReader.finish();
    assert.strictEqual(recordsSeen, notesTotal + barsTotal);
    assert.strictEqual(largeResult.counts["data.adaptiveHistory.evaluations"], notesTotal);
    assert.strictEqual(largeResult.counts["data.rhythmSenseBars"], barsTotal);
    assert(maxChunkLength < 128 * 1024);
    process.stdout.write(`Stream export processed ${recordsSeen} records in bounded chunks.\n`);
  }
  process.stdout.write("Streamed save-data export tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
