const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
const root = path.resolve(__dirname, "../src") + path.sep;
const original = Module._extensions[".js"];
Module._extensions[".js"] = function compileProject(mod, filename) {
  if (!filename.startsWith(root)) return original(mod, filename);
  const output = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  return mod._compile(output.code, filename);
};
const {
  createEmptyPrestigeArchive, normalizePrestigeArchive, mergePrestigeArchives,
  summarizePrestigeArchive, PRESTIGE_ENTRY_SCOPES,
  PRESTIGE_METRIC_FIELDS, PRESTIGE_TIME_WINDOWS
} = require("../src/model/PrestigeArchive");
Module._extensions[".js"] = original;

function zeros() {
  return Object.fromEntries(PRESTIGE_METRIC_FIELDS.map(field => [field, 0]));
}
function segment(id, levels, notes, rhythm) {
  const entryCounts = Object.fromEntries(PRESTIGE_ENTRY_SCOPES.map(scope => [scope, 0]));
  const metrics = Object.fromEntries(PRESTIGE_ENTRY_SCOPES.map(scope => [scope, zeros()]));
  const timeWindows = Object.fromEntries(PRESTIGE_TIME_WINDOWS.map(window => [window, zeros()]));
  entryCounts.singleNotesScreen = notes;
  entryCounts.rhythmBars = rhythm;
  metrics.singleNotesScreen.playedCount = notes;
  metrics.singleNotesScreen.correctCount = Math.floor(notes * 0.8);
  metrics.rhythmBars.roundCount = rhythm;
  metrics.rhythmBars.durationTotalMs = rhythm * 1000;
  timeWindows["04-08"].playedCount = notes;
  return { id, createdAt: "2026-09-30T12:00:00.000Z",
    levels, entryCounts, metrics, timeWindows };
}

const three = segment("first", 3, 200000, 100000);
const one = segment("second", 1, 50000, 50000);
const first = { version: 1, segments: [three] };
const second = { version: 1, segments: [one] };
const merged = mergePrestigeArchives(first, second);
const summary = summarizePrestigeArchive(merged);
assert.strictEqual(summary.prestige, 4);
assert.strictEqual(summary.entryCounts.singleNotesScreen, 250000);
assert.strictEqual(summary.entryCounts.rhythmBars, 150000);
assert.strictEqual(summary.metrics.singleNotesScreen.correctCount, 200000);
assert.strictEqual(summary.metrics.rhythmBars.durationTotalMs, 150000000);
assert.strictEqual(summary.timeWindows["04-08"].playedCount, 250000);
assert.strictEqual(mergePrestigeArchives(merged, second).segments.length, 2);
assert.strictEqual(first.segments.length, 1);
assert.strictEqual(createEmptyPrestigeArchive().segments.length, 0);
assert.throws(() => normalizePrestigeArchive({ version: 2, segments: [] }), /version/);
assert.throws(() => normalizePrestigeArchive({ version: 1, segments: [three, three] }), /Duplicate/);
assert.throws(() => normalizePrestigeArchive({ version: 1,
  segments: [segment("short", 3, 199999, 100000)] }), /match/);
assert.throws(() => mergePrestigeArchives(first, { version: 1,
  segments: [segment("first", 3, 100000, 200000)] }), /Conflicting/);
process.stdout.write("Prestige archive validation and duplicate-safe merge tests passed.\n");
