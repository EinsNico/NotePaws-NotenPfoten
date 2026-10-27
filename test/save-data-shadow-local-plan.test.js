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
const { normalizeNoteFlowMelodyPreferences, normalizeNoteFlowChordPreferences } = require("../src/model/NoteFlowPreferences.js");
const { prepareStagedLocalSaveDataPlan } = require(
  "../src/model/SaveDataShadowLocalPlan.js"
);
Module._extensions[".js"] = originalLoader;

function fixture(roundCount = 2) {
  const shell = createSaveDataBackup({
    length: 0, key: () => null, getItem: () => null
  }, { createdAt: "2026-09-28T12:00:00.000Z" });
  shell.data.options = {
    difficulty: "easy",
    noteFlowMelodySettings: normalizeNoteFlowMelodyPreferences({ menuOptions: {
      bpm: 85, handMode: "two", rhythmMeter: "6/8", inputMode: "midi", movement: "leaping"
    } }),
    noteFlowChordSettings: normalizeNoteFlowChordPreferences({
      chordSize: 4, bassNote: true, bpm: 65, movement: "calm", rhythmMeter: "3/4"
    })
  };
  shell.data.adaptiveHistory = { version: 2, baselines: [], evaluations: [] };
  shell.data.roundHistory = { version: 1, rounds: [] };
  const rounds = Array.from({ length: roundCount }, (_, index) => ({
    id: `normal-${index}`, completedAt: index + 1, mode: "normal"
  }));
  const counts = {
    "data.roundHistory.rounds": roundCount,
    "data.noteFlowRounds.screen": 0,
    "data.noteFlowRounds.midi": 0,
    "data.noteFlowRounds.chordMidi": 0,
    "data.rhythmSenseBars": 0,
    "data.adaptiveHistory.evaluations": 0,
    "data.adaptiveHistoryMidi.evaluations": 0
  };
  const summary = {
    source: { createdAt: shell.createdAt, fileSize: null },
    rounds: {
      "screen:note-flow": 0, "midi:note-flow": 0,
      "midi:note-flow-chords": 0, "rhythm:taktgefuehl": 0
    },
    attempts: { "screen:single-notes": 0, "midi:single-notes": 0 }
  };
  const metadata = { key: "ready", shell, counts };
  const staging = {
    async readMetadata() { return metadata; },
    async readBatch(section, start, limit) {
      assert.strictEqual(section, "data.roundHistory.rounds");
      const records = rounds.slice(start, start + limit);
      return {
        records, nextIndex: start + records.length,
        total: rounds.length, done: start + records.length === rounds.length
      };
    }
  };
  const marker = { state: "database-verified", summary };
  const shadow = {
    name: "noten-pfoten-learning-import-local-plan-test",
    database: { async readImportGenerationMarker() { return marker; } }
  };
  return { metadata, staging, shadow, marker };
}

(async () => {
  const input = fixture();
  const plan = await prepareStagedLocalSaveDataPlan(input.staging, input.shadow);
  assert.strictEqual(plan.normalRoundCount, 2);
  assert.strictEqual(JSON.parse(plan.values.roundHistory).data.rounds.length, 2);
  assert(JSON.parse(plan.values.roundHistory).data.rounds
    .every(round => round.prestigeEligible === false));
  assert.deepStrictEqual(JSON.parse(plan.values.adaptiveHistory).data.evaluations, []);
  assert.strictEqual(JSON.parse(plan.values.options).data.difficulty, "easy");
  assert.deepStrictEqual(JSON.parse(plan.values.options).data, input.metadata.shell.data.options);
  assert.ok(plan.estimatedBytes < 3 * 1024 * 1024);

  input.marker.summary.rounds["screen:note-flow"] = 1;
  await assert.rejects(prepareStagedLocalSaveDataPlan(input.staging, input.shadow),
    /differs from the staged backup/);
  input.marker.summary.rounds["screen:note-flow"] = 0;
  input.marker.state = "preparing";
  await assert.rejects(prepareStagedLocalSaveDataPlan(input.staging, input.shadow),
    /not been verified/);

  const oversized = fixture(1);
  oversized.staging.readBatch = async () => ({
    records: [{ id: "large", completedAt: 1, payload: "x".repeat(2 * 1024 * 1024) }],
    nextIndex: 1, total: 1, done: true
  });
  await assert.rejects(prepareStagedLocalSaveDataPlan(
    oversized.staging, oversized.shadow
  ), /safe local storage limit/);
  console.log("Shadow local plan tests passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
