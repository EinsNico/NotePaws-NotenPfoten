const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(loadedModule, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};
const { normalizeNoteFlowChordOptions } = require("../src/model/NoteFlowChordConfig");
Module._extensions[".js"] = originalLoader;

const defaults = normalizeNoteFlowChordOptions();
assert.strictEqual(defaults.chordSize, 3);
assert.strictEqual(defaults.bassNote, false);
assert.strictEqual(defaults.tonalityMode, "circle");
assert.strictEqual(defaults.selectedKey, "C-major");
assert.strictEqual(defaults.inputMode, "midi");
assert.strictEqual(defaults.behavior, "wait");
assert.strictEqual(defaults.bpm, 33);
assert.strictEqual(defaults.gameLength, 0);
assert.strictEqual(defaults.rhythmMeter, "4/4");
assert.deepStrictEqual(defaults.rhythmValues, ["quarter", "eighth"]);
assert.deepStrictEqual(defaults.algorithmSettings, { jumpFrequency: 30, jumpSize: 8, bassJumpFrequency: 25 });
assert.strictEqual(normalizeNoteFlowChordOptions({ movement: "custom" }).movement, "custom");
assert.deepStrictEqual(normalizeNoteFlowChordOptions({ movement: "custom", algorithmSettings: {
  jumpFrequency: 150, jumpSize: -7, bassJumpFrequency: "63", unexpected: true
} }).algorithmSettings, { jumpFrequency: 100, jumpSize: 2, bassJumpFrequency: 63 });
assert.deepStrictEqual(normalizeNoteFlowChordOptions({ algorithmSettings: {
  jumpFrequency: null, jumpSize: Infinity, bassJumpFrequency: ""
} }).algorithmSettings, defaults.algorithmSettings);
const rememberedSettings = { jumpFrequency: 72, jumpSize: 11, bassJumpFrequency: 60 };
assert.deepStrictEqual(normalizeNoteFlowChordOptions({ movement: "calm", algorithmSettings: rememberedSettings }).algorithmSettings,
  rememberedSettings, "custom values survive switching to a preset");

const chosen = normalizeNoteFlowChordOptions({ chordSize: 4, bassNote: true, tonalityMode: "circle", selectedKey: "G-major", accidentals: "sharpAndFlat" });
assert.strictEqual(chosen.chordSize, 5);
assert.strictEqual(chosen.bassNote, true);
assert.strictEqual(chosen.selectedKey, "G-major");
assert.strictEqual(normalizeNoteFlowChordOptions({ behavior: "wait" }).behavior, "wait");
assert.strictEqual(normalizeNoteFlowChordOptions({ behavior: "invalid" }).behavior, "wait");
assert.strictEqual(normalizeNoteFlowChordOptions({ behavior: "continuous" }).behavior, "continuous");
assert.strictEqual(normalizeNoteFlowChordOptions({ inputMode: "midi" }).inputMode, "midi");
assert.strictEqual(normalizeNoteFlowChordOptions({ inputMode: "screen" }).inputMode, "midi");
assert.strictEqual(normalizeNoteFlowChordOptions({ bpm: 72, gameLength: 60 }).bpm, 72);
assert.strictEqual(normalizeNoteFlowChordOptions({ bpm: 72, gameLength: 60 }).gameLength, 60);
assert.strictEqual(normalizeNoteFlowChordOptions({ bpm: 999, gameLength: 13 }).bpm, 120);
assert.strictEqual(normalizeNoteFlowChordOptions({ bpm: 999, gameLength: 13 }).gameLength, 0);
assert.deepStrictEqual(normalizeNoteFlowChordOptions({
  rhythmMeter: "6/8", rhythmValues: ["dotted-quarter", "eighth"]
}).rhythmValues, ["eighth", "dotted-quarter"]);
assert.deepStrictEqual(normalizeNoteFlowChordOptions({
  rhythmMeter: "3/4", rhythmValues: ["whole", "half"]
}).rhythmValues, ["half", "quarter"]);
assert.strictEqual(normalizeNoteFlowChordOptions({ rhythmMeter: "7/8" }).rhythmMeter, "4/4");

const invalid = normalizeNoteFlowChordOptions({ chordSize: 99, selectedKey: "not-a-key", accidentals: "no" });
assert.strictEqual(invalid.chordSize, 3);
assert.strictEqual(invalid.selectedKey, "C-major");
console.log("Chord menu options: OK");
