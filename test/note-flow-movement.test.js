const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");
global.regeneratorRuntime = require("babel-runtime/regenerator");
global.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {} };

function storage() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    key(index) { return Array.from(entries.keys())[index] || null; },
    getItem(key) { return entries.has(key) ? entries.get(key) : null; },
    setItem(key, value) { entries.set(key, String(value)); },
    removeItem(key) { entries.delete(key); }
  };
}
global.localStorage = storage();
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalJsLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalJsLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
Module._extensions[".vue"] = mod => { mod.exports = {}; };

const movement = require("../src/model/NoteFlowMovement");
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { normalizeNoteFlowChordOptions } = require("../src/model/NoteFlowChordConfig");
const { createNoteFlowConfigFromMenu } = require("../src/model/NoteFlowMenuConfig");
const { createNoteFlowRoundResult } = require("../src/model/NoteFlowRoundResult");
const { NOTE_FLOW_TONALITIES } = require("../src/model/NoteFlowTonality");
const backup = require("../src/model/SaveDataBackup");
const { prepareSaveDataImport } = require("../src/model/SaveDataImport");
const Options = require("../src/model/Options").default;
const Lockr = require("lockr");

function component(name) {
  const filename = path.resolve(sourceRoot, "components", name + ".vue");
  const parsed = compiler.parseComponent(fs.readFileSync(filename, "utf8"));
  const compiled = compiler.compile(parsed.template.content);
  assert.deepStrictEqual(compiled.errors, []);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
  return Object.assign({}, mod.exports.default, compiler.compileToFunctions(parsed.template.content), {
    created: undefined, mounted: undefined, beforeDestroy: undefined
  });
}
function instance(definition, propsData = {}) {
  return new Vue(Object.assign({}, definition, { propsData,
    methods: Object.assign({}, definition.methods, { $t: key => key })
  }));
}
function test(name, body) { body(); process.stdout.write("✓ " + name + "\n"); }
function chords(plan) { return plan.blocks.reduce((all, block) => all.concat(block.chords), []); }
function meanMotion(first, second) {
  return second.values.reduce((total, value, index) => total + Math.abs(value - first.values[index]), 0) / second.values.length;
}

test("defaults to Mixed and carries the independent selection into both generators", () => {
  assert.strictEqual(movement.normalizeNoteFlowMovement(undefined), "mixed");
  assert.strictEqual(movement.normalizeNoteFlowMovement("unknown"), "mixed");
  for (const level of movement.NOTE_FLOW_MOVEMENTS) {
    assert.strictEqual(createNoteFlowConfigFromMenu({ difficulty: "custom", movement: level }).movement, level);
    assert.strictEqual(normalizeNoteFlowChordOptions({ chordSize: 4, movement: level }).movement, level);
    assert.strictEqual(createNoteFlowRoundResult({ menuOptions: { movement: level } }).settings.movement, level);
    assert.strictEqual(createNoteFlowRoundResult({ exerciseType: "chord", menuOptions: { movement: level } }).settings.movement, level);
  }
});

test("normalizes controls safely and validates complete numeric backup settings", () => {
  const defaults = { jumpFrequency: 35, jumpSize: 7, repetition: 35, noteDensity: 65 };
  assert.deepStrictEqual(movement.normalizeNoteFlowAlgorithmSettings(), defaults);
  assert.deepStrictEqual(movement.normalizeNoteFlowAlgorithmSettings(null), defaults);
  assert.deepStrictEqual(movement.normalizeNoteFlowAlgorithmSettings([], "chord"),
    { jumpFrequency: 30, jumpSize: 8, bassJumpFrequency: 25 });
  assert.deepStrictEqual(movement.normalizeNoteFlowAlgorithmSettings({ jumpFrequency: 200, jumpSize: 1, repetition: 23.7 }),
    { jumpFrequency: 100, jumpSize: 2, repetition: 24, noteDensity: 65 });
  assert.deepStrictEqual(movement.normalizeNoteFlowAlgorithmSettings({ jumpFrequency: NaN, jumpSize: Infinity, repetition: null }), defaults);
  assert.strictEqual(movement.isValidNoteFlowAlgorithmSettings(defaults), true);
  for (const value of [null, {}, [], { jumpFrequency: "35", jumpSize: 7, repetition: 35 },
    { jumpFrequency: 35, jumpSize: 7.5, repetition: 35 }, { jumpFrequency: 35, jumpSize: 7, repetition: 35, extra: true }]) {
    assert.strictEqual(movement.isValidNoteFlowAlgorithmSettings(value), false);
  }
});

test("keeps chord harmony, bass roots and playable grip limits in every key and level", () => {
  for (const key of NOTE_FLOW_TONALITIES) for (const chordSize of [3, 4]) {
    const options = { chordSize, bassNote: true, tonalityMode: "circle", selectedKey: key.id,
      accidentals: "sharpAndFlat", seed: "movement-harmony" };
    const reference = chords(createNoteFlowChordPlan(Object.assign({}, options, { movement: "calm" })));
    for (const level of movement.NOTE_FLOW_MOVEMENTS) {
      const plan = createNoteFlowChordPlan(Object.assign({}, options, { movement: level }));
      assert.deepStrictEqual(plan, createNoteFlowChordPlan(Object.assign({}, options, { movement: level })));
      chords(plan).forEach((chord, index) => {
        assert.deepStrictEqual(chord.pitchClasses, reference[index].pitchClasses);
        assert.strictEqual(chord.romanNumeral, reference[index].romanNumeral);
        assert.strictEqual(chord.trebleValues.length, chordSize);
        assert(chord.trebleValues.every(value => value >= 48 && value <= 71));
        assert(chord.trebleValues[chordSize - 1] - chord.trebleValues[0] <= 12);
        assert(chord.trebleValues.every((value, voice) => voice === 0 || value > chord.trebleValues[voice - 1]));
        assert(chord.pitchClasses.every(pc => chord.trebleValues.some(value => value % 12 === pc)));
        assert(chord.bassValue >= 28 && chord.bassValue <= 43);
        assert.strictEqual(chord.bassValue % 12, chord.pitchClasses[0]);
        assert(chord.bassValue <= chord.trebleValues[0] - 5);
      });
    }
  }
});

test("makes whole-grip and bass movement increase from Calm through Mixed to Leaping", () => {
  const results = {};
  for (const level of movement.NOTE_FLOW_MOVEMENTS) {
    let motion = 0, bassMotion = 0, count = 0, leaps = 0;
    for (const chordSize of [3, 4]) {
      let previous = null, state = null;
      for (let index = 0; index < 40; index++) {
        const options = { chordSize, bassNote: true, movement: level, accidentals: "sharpAndFlat",
          tonalityMode: "circle", selectedKey: ["C-major", "G-major", "A-minor"][Math.floor(index / 10) % 3], seed: "grip-movement" };
        const plan = createNoteFlowChordPlan(options, index, null, state);
        for (const chord of chords(plan)) {
          if (previous) {
            const distance = meanMotion({ values: previous.trebleValues }, { values: chord.trebleValues });
            motion += distance;
            bassMotion += Math.abs(chord.bassValue - previous.bassValue);
            leaps += distance >= 5 ? 1 : 0;
            count++;
          }
          previous = chord;
        }
        state = plan.nextState;
      }
    }
    results[level] = { mean: motion / count, bassMean: bassMotion / count, leapRatio: leaps / count };
  }
  process.stdout.write("Chord movement measurements: " + JSON.stringify(results) + "\n");
  assert(results.calm.mean < results.mixed.mean);
  assert(results.mixed.mean < results.leaping.mean);
  assert(results.calm.leapRatio < results.mixed.leapRatio);
  assert(results.mixed.leapRatio < results.leaping.leapRatio);
  assert(results.calm.bassMean < results.mixed.bassMean);
  assert(results.mixed.bassMean < results.leaping.bassMean);
});

test("continues a calm sequence with a fresh grip across generated boundaries", () => {
  const previous = { lastVoicing: [60, 64, 67], lastBassValue: 36 };
  const plan = createNoteFlowChordPlan({ movement: "calm", bassNote: true,
    tonalityMode: "circle", selectedKey: "C-major", accidentals: "no" }, 1, "C-major", previous);
  assert.notDeepStrictEqual(chords(plan)[0].trebleValues, previous.lastVoicing,
    "a repeated tonic picks another valid grip instead of parking the same hand");
  assert(chords(plan)[0].trebleValues.every(value => value >= 48 && value <= 71));
  assert.strictEqual(chords(plan)[0].bassValue, 36);
  assert.deepStrictEqual(previous, { lastVoicing: [60, 64, 67], lastBassValue: 36 });
  assert.deepStrictEqual(plan.nextState.lastVoicing, chords(plan).slice(-1)[0].values);
});

test("remembers both menu choices independently without changing Single Notes settings", () => {
  const melody = component("NoteFlowMenu");
  const chord = component("NoteFlowChordMenu");
  Options.saveOptions();
  const previousOptions = Lockr.get("options");
  const melodyView = instance(melody);
  melodyView.updateMovement("calm");
  const chordView = instance(chord);
  chordView.update("movement", "leaping");
  const saved = Lockr.get("options");
  assert.strictEqual(saved.noteFlowMelodyMovement, "calm");
  assert.strictEqual(saved.noteFlowChordMovement, "leaping");
  for (const key of Object.keys(previousOptions)) {
    if (!key.startsWith("noteFlow")) assert.deepStrictEqual(saved[key], previousOptions[key], key);
  }
  Options.noteFlowMelodyMovement = Options.noteFlowChordMovement = "mixed";
  Options.loadOptions();
  const reopenedMelody = instance(melody, { initialPreview: { menuOptions: { movement: "mixed" } } });
  const reopenedChord = instance(chord, { options: { movement: "mixed" } });
  assert.strictEqual(reopenedMelody.previewOptions.movement, "calm");
  assert.strictEqual(reopenedChord.localOptions.movement, "leaping");
});

test("preserves preferences and round movement through backup serialization and import preparation", () => {
  const exported = backup.createSaveDataBackup(localStorage);
  // This fixture includes rounds, but no daily archive: its format is version 4.
  exported.version = 4;
  exported.data.noteFlowRounds = { screen: [], midi: [], chordMidi: [] };
  exported.data.rhythmSenseBars = [];
  for (const level of movement.NOTE_FLOW_MOVEMENTS) {
    exported.data.noteFlowRounds.screen.push(createNoteFlowRoundResult({ id: "melody-" + level,
      menuOptions: { inputMode: "button", movement: level } }));
    exported.data.noteFlowRounds.chordMidi.push(createNoteFlowRoundResult({ id: "chord-" + level,
      exerciseType: "chord", menuOptions: { inputMode: "midi", movement: level } }));
  }
  assert.strictEqual(backup.validateSaveDataBackup(exported).valid, true);
  const restored = backup.normalizeSaveDataBackup(JSON.parse(JSON.stringify(exported)));
  const prepared = prepareSaveDataImport(storage(), restored, "replace");
  assert.deepStrictEqual(prepared.importedBackup.data.noteFlowRounds, exported.data.noteFlowRounds);
  assert.strictEqual(prepared.importedBackup.data.options.noteFlowMelodyMovement, "calm");
  assert.strictEqual(prepared.importedBackup.data.options.noteFlowChordMovement, "leaping");
  const legacy = JSON.parse(JSON.stringify(exported));
  delete legacy.data.options.noteFlowMelodyMovement;
  delete legacy.data.options.noteFlowChordMovement;
  legacy.data.noteFlowRounds.screen.forEach(round => { delete round.settings.movement; delete round.settings.algorithmSettings; });
  assert.strictEqual(backup.validateSaveDataBackup(legacy).valid, true);
  assert(!Object.prototype.hasOwnProperty.call(backup.normalizeSaveDataBackup(legacy).data.noteFlowRounds.screen[0].settings, "movement"));
  const invalid = JSON.parse(JSON.stringify(exported));
  invalid.data.options.noteFlowChordMovement = "unknown";
  assert.strictEqual(backup.validateSaveDataBackup(invalid).valid, false);
});

test("renders the correct mode label and help in German and English", () => {
  const selector = component("NoteFlowMovementSelector");
  for (const language of ["de", "en"]) {
    const strings = require("../src/resources/" + language).default;
    for (const kind of ["melody", "chord"]) for (const level of movement.NOTE_FLOW_MOVEMENTS) {
      const view = instance(selector, { kind, value: level });
      assert(strings[view.labelKey]);
      assert(strings[view.hintKey]);
      assert(strings[view.movementLabelKey(level)]);
      const choices = view._render().children.find(node => node.tag === "div");
      const buttons = choices.children.filter(node => node.tag === "button");
      assert.strictEqual(buttons.length, 4);
      assert.strictEqual(buttons.filter(node => node.data.attrs["aria-pressed"]).length, 1);
    }
  }
});
process.stdout.write("Note Flow movement tests passed.\n");
