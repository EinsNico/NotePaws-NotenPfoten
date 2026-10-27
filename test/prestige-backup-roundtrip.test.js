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
const { createSaveDataBackup, normalizeSaveDataBackup,
  validateSaveDataBackup } = require("../src/model/SaveDataBackup");
const { mergeSaveDataBackups } = require("../src/model/SaveDataMerge");
const SaveDataStreamReader = require("../src/model/SaveDataStreamReader").default;
const { createEmptyPrestigeArchive, PRESTIGE_ENTRY_SCOPES,
  PRESTIGE_METRIC_FIELDS, PRESTIGE_TIME_WINDOWS,
  summarizePrestigeArchive } = require("../src/model/PrestigeArchive");
Module._extensions[".js"] = original;
const zeros = () => Object.fromEntries(PRESTIGE_METRIC_FIELDS.map(field => [field, 0]));
const segment = {
  id: "prestige-test-1", createdAt: "2026-09-30T12:00:00.000Z", levels: 1,
  entryCounts: Object.fromEntries(PRESTIGE_ENTRY_SCOPES.map(scope => [
    scope, scope === "singleNotesScreen" ? 100000 : 0
  ])),
  metrics: Object.fromEntries(PRESTIGE_ENTRY_SCOPES.map(scope => [scope, zeros()])),
  timeWindows: Object.fromEntries(PRESTIGE_TIME_WINDOWS.map(window => [window, zeros()]))
};
segment.metrics.singleNotesScreen.playedCount = 100000;
segment.metrics.singleNotesScreen.correctCount = 80000;
const archive = { version: 1, segments: [segment] };
const values = new Map([["prestigeArchive", JSON.stringify({ data: archive })]]);
const storage = { get length() { return values.size; },
  key: index => Array.from(values.keys())[index], getItem: key => values.get(key) || null };
const backup = createSaveDataBackup(storage);
backup.version = 4;
backup.data.noteFlowRounds = { screen: [], midi: [], chordMidi: [] };
backup.data.rhythmSenseBars = [];
assert.strictEqual(validateSaveDataBackup(backup).valid, true);
const restored = JSON.parse(JSON.stringify(backup));
const reader = new SaveDataStreamReader(() => {});
const serialized = JSON.stringify(restored);
for (let offset = 0; offset < serialized.length; offset += 65536) {
  reader.push(serialized.slice(offset, offset + 65536));
}
assert.strictEqual(reader.finish().backup.data.prestigeArchive.segments[0].id,
  "prestige-test-1");
assert.strictEqual(summarizePrestigeArchive(restored.data.prestigeArchive).prestige, 1);
assert.strictEqual(summarizePrestigeArchive(restored.data.prestigeArchive)
  .metrics.singleNotesScreen.correctCount, 80000);
const duplicate = mergeSaveDataBackups(restored, restored);
assert.strictEqual(duplicate.backup.data.prestigeArchive.segments.length, 1);
const conflicting = JSON.parse(JSON.stringify(restored));
conflicting.data.prestigeArchive.segments[0].metrics.singleNotesScreen.correctCount = 1;
assert.throws(() => mergeSaveDataBackups(restored, conflicting), /Conflicting prestige/);
const legacy = JSON.parse(JSON.stringify(restored));
delete legacy.data.prestigeArchive;
assert.strictEqual(validateSaveDataBackup(legacy).valid, true);
assert.strictEqual(normalizeSaveDataBackup(legacy).data.prestigeArchive, null);
assert.deepStrictEqual(createEmptyPrestigeArchive(), { version: 1, segments: [] });
process.stdout.write("Prestige backup roundtrip, merge and legacy compatibility passed.\n");
