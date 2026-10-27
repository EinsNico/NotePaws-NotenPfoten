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
  instance.savePreferences();
  return instance;
}
async function run() {
  const melody = component("NoteFlowMenu");
  const chord = component("NoteFlowChordMenu");
  Options.saveOptions();
  const singleNotes = Lockr.get("options");
  const first = view(melody);
  assert.strictEqual(first.previewOptions.inputMode, "midi");
  assert.strictEqual(Options.difficulty, "easy", "Single Notes already has the easiest initial difficulty");
  assert.strictEqual(first.previewOptions.difficulty, "easy");
  assert.strictEqual(preferences.normalizeNoteFlowMelodyPreferences().menuOptions.difficulty, "easy");
  assert.strictEqual(preferences.normalizeNoteFlowMelodyPreferences({ menuOptions: { difficulty: "invalid" } }).menuOptions.difficulty, "easy");
  for (const difficulty of ["easy", "normal", "hard", "custom"]) {
    assert.strictEqual(preferences.normalizeNoteFlowMelodyPreferences({ menuOptions: { difficulty } }).menuOptions.difficulty, difficulty,
      "a deliberately saved difficulty remains selected");
  }

  assert.strictEqual(Options.inputMode, singleNotes.inputMode);
  assert.strictEqual(preferences.normalizeNoteFlowMelodyPreferences().menuOptions.inputMode, "midi");
  for (const inputMode of ["button", "keyboard", "midi"]) {
    assert.strictEqual(preferences.normalizeNoteFlowMelodyPreferences({ menuOptions: { inputMode } }).menuOptions.inputMode, inputMode);
  }
  assert.strictEqual(preferences.normalizeNoteFlowChordPreferences().inputMode, "midi");
  process.stdout.write("✓ Note Flow defaults to MIDI independently of Single Notes and retains explicit input choices\n");
  first.updateClefs(["bass"]);
  first.updateHandMode("two");
  Object.assign(first.previewOptions, {
    gameLength: 300, bpm: 85, behavior: "continuous", inputMode: "midi",
    difficulty: "custom", customMinValue: 24, customMaxValue: 72,
    customTrebleMinValue: 50, customBassMaxValue: 45,
    secondaryNotesPerBlock: 8, tonalityMode: "circle", selectedKey: "G-major",
    accidentals: "onlySharp", movement: "leaping", sound: true, vibration: false, displayNote: false
  });
  first.updateRhythmMeter("6/8");
  first.previewOptions.rhythmValues = { treble: ["dotted-quarter", "eighth"], bass: ["eighth"] };
  const melodyAlgorithm = { jumpFrequency: 82, jumpSize: 10, repetition: 15, noteDensity: 88 };
  first.updateMovement("custom");
  first.updateAlgorithmSettings(melodyAlgorithm);
  first.updateMovement("calm");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(first.previewOptions.algorithmSettings)), melodyAlgorithm);
  first.updateMovement("custom");
  await Vue.nextTick(); // Exercise the automatic watcher, without a Start or Back action.
  const savedMelody = JSON.parse(JSON.stringify(Lockr.get("options").noteFlowMelodySettings));
  assert.strictEqual(savedMelody.menuOptions.bpm, 85);
  assert.strictEqual(savedMelody.menuOptions.inputMode, "midi");
  assert.deepStrictEqual(savedMelody.lastSingleHandClef, ["bass"]);
  assert.deepStrictEqual(savedMelody.menuOptions.algorithmSettings, melodyAlgorithm);
  first.$destroy();
  const chords = view(chord);
  for (const [key, value] of Object.entries({ chordSize: 4, bassNote: true, movement: "calm",
    bpm: 65, gameLength: 20, behavior: "continuous", tonalityMode: "circle", selectedKey: "F-major",
    accidentals: "onlyFlat", rhythmMeter: "3/4", rhythmValues: ["half", "quarter"] })) {
    chords.update(key, value);
  }
  const chordAlgorithm = { jumpFrequency: 74, jumpSize: 9, bassJumpFrequency: 48 };
  chords.update("movement", "custom");
  chords.update("algorithmSettings", chordAlgorithm);
  chords.update("movement", "mixed");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(chords.localOptions.algorithmSettings)), chordAlgorithm);
  chords.update("movement", "custom");
  const savedChord = JSON.parse(JSON.stringify(Lockr.get("options").noteFlowChordSettings));
  assert.deepStrictEqual(savedChord.algorithmSettings, chordAlgorithm);
  chords.$destroy();
  Options.noteFlowMelodySettings = Options.noteFlowChordSettings = null;
  Options.loadOptions();
  const reopened = view(melody, { initialPreview: { menuOptions: { bpm: 33, inputMode: "button" } } });
  const reopenedChord = view(chord, { options: { chordSize: 3, bpm: 33 } });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(reopened.previewOptions)), savedMelody.menuOptions);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(reopenedChord.localOptions)), savedChord);
  assert.strictEqual(Options.noteFlowMelodySettings.trainingMode, "normal");
  let startedPreview;
  reopened.$on("startPreview", preview => { startedPreview = preview; });
  reopened.startPreview();
  assert(!Object.prototype.hasOwnProperty.call(startedPreview, "trainingMode"));
  reopened.updateHandMode("single");
  assert.deepStrictEqual(reopened.previewOptions.clef, ["bass"]);
  reopened.updateHandMode("two");
  await Vue.nextTick();
  reopened.$destroy();
  reopenedChord.$destroy();
  for (const key of Object.keys(singleNotes).filter(key => !key.startsWith("noteFlow"))) {
    assert.deepStrictEqual(Lockr.get("options")[key], singleNotes[key], key + " must stay unchanged");
  }
  process.stdout.write("✓ all settings survive reopening without starting a round; modes and Single Notes stay independent\n");

  // Flush even if the menu is destroyed in the same tick as the user's change.
  const quick = view(melody);
  quick.previewOptions.bpm = 91;
  melody.beforeDestroy.call(quick);
  assert.strictEqual(Lockr.get("options").noteFlowMelodySettings.menuOptions.bpm, 91);
  quick.$destroy();
  await Vue.nextTick();
  process.stdout.write("✓ immediate menu departure saves pending edits\n");

  const exported = backup.parseSaveDataBackup(JSON.stringify(backup.createSaveDataBackup(localStorage)));
  assert.strictEqual(exported.valid, true);
  const document = exported.backup;
  const savedOptions = JSON.parse(JSON.stringify(document.data.options));
  Options.noteFlowMelodySettings = null;
  Options.noteFlowChordSettings = preferences.normalizeNoteFlowChordPreferences({ bpm: 33 });
  Options.saveOptions();
  const prepared = prepareSaveDataImport(localStorage, document, "replace");
  applyPreparedSaveDataImport(localStorage, prepared);
  Options.loadOptions();
  assert.deepStrictEqual(Lockr.get("options"), savedOptions);
  assert.deepStrictEqual(Options.noteFlowMelodySettings, savedOptions.noteFlowMelodySettings);
  assert.deepStrictEqual(Options.noteFlowChordSettings, savedChord);
  const current = Lockr.get("options");
  const incoming = JSON.parse(JSON.stringify(document));
  incoming.data.options.noteFlowChordSettings.bpm = 90;
  applyPreparedSaveDataImport(localStorage, prepareSaveDataImport(localStorage, incoming, "merge"));
  assert.deepStrictEqual(Lockr.get("options"), current);
  process.stdout.write("✓ export and replacement restore every setting; merging retains local settings\n");

  const olderPresets = JSON.parse(JSON.stringify(document));
  olderPresets.data.options.noteFlowMelodySettings.menuOptions.movement = "mixed";
  olderPresets.data.options.noteFlowChordSettings.movement = "calm";
  delete olderPresets.data.options.noteFlowMelodySettings.menuOptions.algorithmSettings;
  delete olderPresets.data.options.noteFlowChordSettings.algorithmSettings;
  assert.strictEqual(backup.validateSaveDataBackup(olderPresets).valid, true);
  assert.deepStrictEqual(preferences.normalizeNoteFlowMelodyPreferences(olderPresets.data.options.noteFlowMelodySettings).menuOptions.algorithmSettings,
    { jumpFrequency: 35, jumpSize: 7, repetition: 35, noteDensity: 65 });
  assert.deepStrictEqual(preferences.normalizeNoteFlowChordPreferences(olderPresets.data.options.noteFlowChordSettings).algorithmSettings,
    { jumpFrequency: 30, jumpSize: 8, bassJumpFrequency: 25 });
  process.stdout.write("✓ older preset preferences import without new controls and receive safe defaults\n");

  const oldLearningSelection = JSON.parse(JSON.stringify(document));
  oldLearningSelection.data.options.noteFlowMelodySettings.trainingMode = "learning";
  assert.strictEqual(backup.validateSaveDataBackup(oldLearningSelection).valid, true);
  applyPreparedSaveDataImport(localStorage,
    prepareSaveDataImport(localStorage, oldLearningSelection, "replace"));
  Options.loadOptions();
  const restored = view(melody);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(restored.previewOptions)), savedOptions.noteFlowMelodySettings.menuOptions);
  assert.strictEqual(Lockr.get("options").noteFlowMelodySettings.trainingMode, "normal");
  assert(!Object.prototype.hasOwnProperty.call(restored.$data, "activeMode"));
  restored.$destroy();
  process.stdout.write("✓ an older Learning Mode selection imports safely and opens regular training\n");

  const legacy = JSON.parse(JSON.stringify(document));
  delete legacy.data.options.noteFlowMelodySettings;
  delete legacy.data.options.noteFlowChordSettings;
  assert.strictEqual(backup.validateSaveDataBackup(legacy).valid, true);
  applyPreparedSaveDataImport(localStorage, prepareSaveDataImport(localStorage, legacy, "replace"));
  Options.loadOptions();
  assert.strictEqual(Options.noteFlowMelodySettings, null);
  assert.strictEqual(Options.noteFlowChordSettings, null);
  for (const [key, field, invalidValue] of [
    ["noteFlowMelodySettings", "trainingMode", "invalid"],
    ["noteFlowChordSettings", "bpm", "invalid"],
    ["noteFlowChordSettings", "inputMode", "button"],
    ["noteFlowChordSettings", "rhythmValues", []],
    ["noteFlowMelodySettings", "menuOptions", { bpm: 85 }]
  ]) {
    const invalid = JSON.parse(JSON.stringify(document));
    invalid.data.options[key][field] = invalidValue;
    assert.strictEqual(backup.validateSaveDataBackup(invalid).valid, false);
  }
  process.stdout.write("✓ legacy backups reset newer settings; malformed nested preferences are rejected\n");
  for (const invalidValue of [null, {}, [], { jumpFrequency: "74", jumpSize: 9, bassJumpFrequency: 48 },
    { jumpFrequency: 74, jumpSize: 9, bassJumpFrequency: 101 }]) {
    const invalid = JSON.parse(JSON.stringify(document));
    invalid.data.options.noteFlowChordSettings.algorithmSettings = invalidValue;
    assert.strictEqual(backup.validateSaveDataBackup(invalid).valid, false);
  }
  for (const invalidValue of [null, {}, [], { jumpFrequency: 82, jumpSize: 10, repetition: -1 },
    { jumpFrequency: 82, jumpSize: 10, repetition: 15, extra: true }]) {
    const invalid = JSON.parse(JSON.stringify(document));
    invalid.data.options.noteFlowMelodySettings.menuOptions.algorithmSettings = invalidValue;
    assert.strictEqual(backup.validateSaveDataBackup(invalid).valid, false);
  }
  for (const key of ["noteFlowMelodySettings", "noteFlowChordSettings"]) {
    const invalid = JSON.parse(JSON.stringify(document));
    const target = key === "noteFlowMelodySettings" ? invalid.data.options[key].menuOptions : invalid.data.options[key];
    delete target.algorithmSettings;
    assert.strictEqual(backup.validateSaveDataBackup(invalid).valid, false);
  }
  process.stdout.write("✓ malformed or missing custom controls are rejected before importing\n");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
