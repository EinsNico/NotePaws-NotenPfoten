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
const { SingleNotesLearningWriter } = require("../src/model/SingleNotesLearningStorage.js");
const { NoteFlowRoundWriter } = require("../src/model/NoteFlowRoundStorage.js");
const { RhythmSenseRoundWriter } = require("../src/model/RhythmSenseRoundStorage.js");
Module._extensions[".js"] = originalLoader;

(async () => {
  const calls = [];
  const database = {
    readAttemptHistoryPage(scope, after, limit) {
      calls.push(["attempts", scope, after, limit]);
      return Promise.resolve({ records: [{ id: "n1" }], nextBlockNumber: 1, done: false });
    },
    readNoteFlowRoundsPage(scope, after, limit) {
      calls.push(["rounds", scope, after, limit]);
      return Promise.resolve({ records: [{ id: "r1" }], nextBlockNumber: 2, done: true });
    }
  };
  const notes = new SingleNotesLearningWriter();
  const melody = new NoteFlowRoundWriter();
  const rhythm = new RhythmSenseRoundWriter();
  notes.open = melody.open = rhythm.open = () => Promise.resolve(database);

  assert.strictEqual((await notes.readBackupAttemptsPage("screen", null, 3)).page.records[0].id, "n1");
  assert.strictEqual((await notes.readBackupAttemptsPage("midi", 1, 2)).saved, true);
  assert.strictEqual((await melody.readRoundsPage("midi", 2, 3, "chord")).page.done, true);
  assert.strictEqual((await rhythm.readBarsPage(4, 2)).page.records[0].id, "r1");
  assert.deepStrictEqual(calls, [
    ["attempts", "screen:single-notes", null, 3],
    ["attempts", "midi:single-notes", 1, 2],
    ["rounds", "midi:note-flow-chords", 2, 3],
    ["rounds", "rhythm:taktgefuehl", 4, 2]
  ]);

  database.readAttemptHistoryPage = () => Promise.reject(new Error("read failed"));
  const failed = await notes.readBackupAttemptsPage("screen");
  assert.strictEqual(failed.saved, false);
  assert.match(failed.error.message, /read failed/);
  process.stdout.write("Paged export storage tests passed.\n");
})().catch(error => { console.error(error); process.exitCode = 1; });
