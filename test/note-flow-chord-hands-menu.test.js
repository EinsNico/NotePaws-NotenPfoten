const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");
global.regeneratorRuntime = require("babel-runtime/regenerator");
global.window = { scrollTo() {} };
const values = new Map();
global.localStorage = {
  get length() { return values.size; },
  key(index) { return Array.from(values.keys())[index] || null; },
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
Module._extensions[".vue"] = mod => { mod.exports = {}; };
const Options = require("../src/model/Options").default;
const Lockr = require("lockr");
const backup = require("../src/model/SaveDataBackup");
const { prepareSaveDataImport, applyPreparedSaveDataImport } = require("../src/model/SaveDataImport");
const preferences = require("../src/model/NoteFlowPreferences");
function component(name) {
  const filename = path.resolve(sourceRoot, "components", name + ".vue");
  const script = compiler.parseComponent(fs.readFileSync(filename, "utf8")).script.content;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(script, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
  return mod.exports.default;
}
function view(definition, propsData = {}) {
  const instance = new Vue(Object.assign({}, definition, {
    propsData, created: undefined, mounted: undefined, beforeDestroy: undefined,
    methods: Object.assign({}, definition.methods, { $t: key => key })
  }));
  if (instance.savePreferences) instance.savePreferences();
  return instance;
}

async function run() {
  const chord = component("NoteFlowChordMenu");
  const controls = component("NoteFlowAlgorithmControls");
  const leftControls = view(controls, { kind: "chord", bassNote: true, primaryHand: "bass" });
  assert.deepStrictEqual(leftControls.controls.map(c => c.key), ["bassJumpFrequency", "jumpSize"]);
  let leftAlgorithm;
  leftControls.$on("input", value => { leftAlgorithm = value; });
  leftControls.update("bassJumpFrequency", "100");
  assert.strictEqual(leftAlgorithm.bassJumpFrequency, 100);
  const bothControls = new Vue(Object.assign({}, controls, { propsData: { kind: "chord", bassNote: true } }));
  assert.deepStrictEqual(bothControls.controls.map(c => c.key), ["jumpFrequency", "jumpSize", "bassJumpFrequency"]);
  const parsed = compiler.parseComponent(fs.readFileSync(path.resolve(sourceRoot, "components/NoteFlowChordMenu.vue"), "utf8"));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  Options.noteFlowChordSettings = null;
  Options.noteFlowMelodySettings = null;
  const freshMelody = preferences.normalizeNoteFlowMelodyPreferences();
  const freshChord = preferences.normalizeNoteFlowChordPreferences();
  for (const selected of [freshMelody.menuOptions, freshChord]) {
    assert.strictEqual(selected.tonalityMode, "circle");
    assert.strictEqual(selected.selectedKey, "C-major");
    assert.strictEqual(selected.accidentals, "no");
  }
  const savedMelody = preferences.normalizeNoteFlowMelodyPreferences({ menuOptions: {
    tonalityMode: "random", selectedKey: "F-major", accidentals: "onlyFlat" } });
  assert.strictEqual(savedMelody.menuOptions.tonalityMode, "random");
  assert.strictEqual(savedMelody.menuOptions.selectedKey, "F-major");
  assert.strictEqual(savedMelody.menuOptions.accidentals, "onlyFlat");
  const savedChord = preferences.normalizeNoteFlowChordPreferences({ tonalityMode: "random",
    selectedKey: "G-major", accidentals: "onlySharp" });
  assert.strictEqual(savedChord.tonalityMode, "random");
  assert.strictEqual(savedChord.selectedKey, "G-major");
  assert.strictEqual(savedChord.accidentals, "onlySharp");
  process.stdout.write("✓ new installations use C major without accidentals; saved key selections stay intact\n");

  const menu = view(chord);
  menu.openSettingSection("hands");
  assert.strictEqual(menu.activeSettingSection, "hands");
  menu.updateHands("two");
  menu.update("chordSize", 8);
  menu.updateHandCount("bass", 4);
  assert.strictEqual(menu.localOptions.chordSize, 8);
  assert.strictEqual(menu.localOptions.bassNotesPerChord, 4);
  assert.strictEqual(menu.localOptions.trebleNotesPerChord, 4);
  menu.updateRange("bass", "min", 36);
  menu.updateRange("bass", "max", 60);
  menu.updateRange("treble", "min", 48);
  menu.updateRange("treble", "max", 72);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(menu.localOptions.ranges)), {
    bass: { min: 36, max: 60 }, treble: { min: 48, max: 72 }
  });
  assert.strictEqual(menu.previewError, false);
  assert(menu.previewPlan.blocks.every(block => block.chords.every(c => c.values.length === 8)));
  menu.updateHandCount("treble", 3);
  assert.strictEqual(menu.localOptions.bassNotesPerChord, 5);
  assert.strictEqual(menu.localOptions.trebleNotesPerChord, 3);
  const persisted = JSON.parse(JSON.stringify(menu.localOptions));
  Options.loadOptions();
  const reopened = view(chord);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(reopened.localOptions)), persisted);
  assert.strictEqual(menu.roundHandsSummary({ handMode: "single", singleHand: "bass", bassNotesPerChord: 3,
    trebleNotesPerChord: 0 }), "FLOW_CHORD_LEFT_HAND: 3");
  assert.strictEqual(menu.roundHandsSummary({ handMode: "two", bassNotesPerChord: 4,
    trebleNotesPerChord: 4 }), "FLOW_CHORD_LEFT_HAND: 4 · FLOW_CHORD_RIGHT_HAND: 4");
  assert.strictEqual(menu.roundHandsSummary({ bassNote: true }), "FLOW_CHORD_BASS_ON");
  menu.updateHands("bass");
  assert.strictEqual(menu.localOptions.bassNotesPerChord, 8);
  assert.strictEqual(menu.localOptions.trebleNotesPerChord, 0);
  menu.updateHands("treble");
  assert.strictEqual(menu.localOptions.bassNotesPerChord, 0);
  assert.strictEqual(menu.localOptions.trebleNotesPerChord, 8);
  menu.update("chordSize", 3);
  menu.updateRange("treble", "min", 60);
  menu.updateRange("treble", "max", 60);
  assert.strictEqual(menu.previewPlan, null);
  assert.strictEqual(menu.previewError, true);
  let started = false;
  menu.$on("startTraining", () => { started = true; });
  menu.startTraining();
  assert.strictEqual(started, false);
  assert.strictEqual(menu.localOptions.customTrebleMinValue, 60);
  assert.strictEqual(menu.localOptions.customMaxValue, 60);
  process.stdout.write("✓ hands, overlapping ranges and 4+4 tone distribution survive reopening; infeasible selections cannot start\n");

  const handFields = ["handMode", "singleHand", "bassNotesPerChord", "trebleNotesPerChord", "ranges",
    "customMinValue", "customBassMaxValue", "customTrebleMinValue", "customMaxValue"];
  for (const size of [3, 4]) for (const bassNote of [false, true]) {
    const old = preferences.normalizeNoteFlowChordPreferences({ chordSize: size, bassNote,
      tonalityMode: "random", accidentals: "onlyFlat", selectedKey: "F-major" });
    handFields.forEach(key => { delete old[key]; });
    old.chordSize = size;
    assert.strictEqual(preferences.isValidNoteFlowChordPreferences(old), true);
    const migrated = preferences.normalizeNoteFlowChordPreferences(old);
    assert.strictEqual(migrated.chordSize, size + (bassNote ? 1 : 0));
    assert.strictEqual(migrated.trebleNotesPerChord, size);
    assert.strictEqual(migrated.bassNotesPerChord, bassNote ? 1 : 0);
    assert.deepStrictEqual(preferences.normalizeNoteFlowChordPreferences(migrated), migrated);
    assert.strictEqual(preferences.isValidNoteFlowChordPreferences(migrated), true);
    assert.strictEqual(preferences.isValidNoteFlowChordPreferences(Object.assign({}, old, { chordSize: "3" })), false);
    assert.strictEqual(preferences.isValidNoteFlowChordPreferences(Object.assign({}, old, { bpm: "33" })), false);
    assert.strictEqual(preferences.isValidNoteFlowChordPreferences(Object.assign({}, old, { singleHand: "treble" })), false);
  }
  assert.strictEqual(preferences.isValidNoteFlowChordPreferences(persisted), true);
  const malformed = Object.assign({}, persisted, { bassNotesPerChord: 9 });
  assert.strictEqual(preferences.isValidNoteFlowChordPreferences(malformed), false);
  const mismatchedRanges = JSON.parse(JSON.stringify(persisted));
  mismatchedRanges.ranges.bass.min = 12;
  assert.strictEqual(preferences.isValidNoteFlowChordPreferences(mismatchedRanges), false);
  Options.noteFlowChordSettings = persisted;
  Options.saveOptions();
  const exported = backup.parseSaveDataBackup(JSON.stringify(backup.createSaveDataBackup(localStorage)));
  assert.strictEqual(exported.valid, true);
  const prepared = prepareSaveDataImport(localStorage, exported.backup, "replace");
  applyPreparedSaveDataImport(localStorage, prepared);
  Options.loadOptions();
  assert.deepStrictEqual(Options.noteFlowChordSettings, persisted);
  process.stdout.write("✓ legacy additional bass settings migrate once; strict validation and backup restoration preserve all new hand settings\n");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
