const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

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
const { summarizeStagedSaveData } = require("../src/model/SaveDataStagedPreview.js");
Module._extensions[".js"] = originalLoader;

const storage = { length: 0, key: () => null, getItem: () => null };
const shell = createSaveDataBackup(storage, { createdAt: "2026-09-28T12:00:00.000Z" });
const preview = summarizeStagedSaveData({
  key: "ready", shell, fileSize: 51792582,
  counts: {
    "data.adaptiveHistory.evaluations": 100000,
    "data.rhythmSenseBars": 80000,
    "data.roundHistory.rounds": 7,
    "data.noteFlowRounds.chordMidi": 2
  }
});
assert.strictEqual(preview.fileSize, 51792582);
assert.strictEqual(preview.screenEvaluations, 100000);
assert.strictEqual(preview.rhythmBars, 80000);
assert.strictEqual(preview.normalRounds, 7);
assert.strictEqual(preview.chordMidiRounds, 2);
assert.strictEqual(preview.mergeProjectionAvailable, false);
assert.throws(() => summarizeStagedSaveData({
  key: "ready", shell,
  counts: { "data.rhythmSenseBars": -1 }
}), /Invalid staged backup count/);
assert.throws(() => summarizeStagedSaveData({
  key: "ready", shell, counts: {}, fileSize: -1
}), /Invalid staged backup size/);
process.stdout.write("Save-data staged preview tests passed.\n");
