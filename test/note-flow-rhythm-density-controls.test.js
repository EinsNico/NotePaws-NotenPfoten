const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const compiler = require("vue-template-compiler");
const Vue = require("vue");
global.regeneratorRuntime = require("babel-runtime/regenerator");
global.window = { scrollTo() {} };
const entries = new Map();
global.localStorage = {
  get length() { return entries.size; },
  key(index) { return Array.from(entries.keys())[index] || null; },
  getItem(key) { return entries.has(key) ? entries.get(key) : null; },
  setItem(key, value) { entries.set(key, String(value)); },
  removeItem(key) { entries.delete(key); }
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

const movement = require("../src/model/NoteFlowMovement");
const menu = require("../src/model/NoteFlowMenuConfig");
const preferences = require("../src/model/NoteFlowPreferences");
const backup = require("../src/model/SaveDataBackup");
const rounds = require("../src/model/NoteFlowRoundResult");

function controls(propsData = {}) {
  const filename = path.resolve(sourceRoot, "components/NoteFlowAlgorithmControls.vue");
  const parsed = compiler.parseComponent(fs.readFileSync(filename, "utf8"));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
  return new Vue(Object.assign({}, mod.exports.default,
    compiler.compileToFunctions(parsed.template.content), {
      propsData,
      methods: Object.assign({}, mod.exports.default.methods, { $t: key => key })
    }));
}

const existing = { jumpFrequency: 82, jumpSize: 10, repetition: 15 };
const normalized = movement.normalizeNoteFlowAlgorithmSettings(existing);
assert.deepStrictEqual(normalized, Object.assign({}, existing, { noteDensity: 65 }));
assert(movement.isValidNoteFlowAlgorithmSettings(existing));
assert(movement.isValidNoteFlowAlgorithmSettings(normalized));
for (const value of ["88", NaN, -1, 101, 34.5, null]) {
  assert.strictEqual(movement.isValidNoteFlowAlgorithmSettings(
    Object.assign({}, normalized, { noteDensity: value })), false);
}
assert.strictEqual(movement.normalizeNoteFlowAlgorithmSettings({ noteDensity: "82" }).noteDensity, 82);
assert.strictEqual(movement.normalizeNoteFlowAlgorithmSettings({ noteDensity: 170 }).noteDensity, 100);
assert.strictEqual(movement.normalizeNoteFlowAlgorithmSettings({ noteDensity: -20 }).noteDensity, 0);
assert.strictEqual(movement.normalizeNoteFlowAlgorithmSettings({ noteDensity: null }).noteDensity, 65);
process.stdout.write("✓ density is normalized safely and older numeric algorithm controls remain valid\n");

const view = controls({ value: existing });
assert.strictEqual(view.controls.length, 4);
const density = view.controls.find(control => control.key === "noteDensity");
assert(density);
for (const language of ["de", "en"]) {
  const strings = require("../src/resources/" + language).default;
  for (const key of [density.label, density.low, density.high]) assert(strings[key]);
}
let changed;
view.$on("input", value => { changed = value; });
view.update("noteDensity", "91");
assert.deepStrictEqual(changed, Object.assign({}, existing, { noteDensity: 91 }));
assert.deepStrictEqual(existing, { jumpFrequency: 82, jumpSize: 10, repetition: 15 });
const renderedInput = view._render().children
  .find(node => node.key === "noteDensity").children.find(node => node.tag === "input");
assert.strictEqual(renderedInput.data.attrs.min, 0);
assert.strictEqual(renderedInput.data.attrs.max, 100);
assert(!controls({ kind: "chord", bassNote: true }).controls.some(control => control.key === "noteDensity"));
process.stdout.write("✓ the melody slider emits complete settings with German and English labels; chord controls stay independent\n");

for (const [profile, expected] of [["calm", 35], ["mixed", 65], ["leaping", 78], ["custom", 91]]) {
  const options = { movement: profile, algorithmSettings: changed,
    handMode: "two", secondaryNotesPerBlock: 4,
    rhythmMeter: "3/4", rhythmValues: { treble: ["quarter", "sixteenth"], bass: ["half", "quarter"] } };
  const rhythm = menu.createNoteFlowRhythmOptionsFromMenu(options);
  assert.strictEqual(rhythm.noteDensity, expected);
  assert.strictEqual(rhythm.meter, "3/4");
  assert.deepStrictEqual(rhythm.allowedValues, options.rhythmValues);
  assert.strictEqual(menu.createNoteFlowConfigFromMenu(options).secondaryNotesPerBlock, 4);
}
process.stdout.write("✓ preview and training rhythm options use preset or custom density without changing selected values or accompaniment density\n");

const legacyPreferences = preferences.normalizeNoteFlowMelodyPreferences({ menuOptions: {
  movement: "custom", algorithmSettings: existing
} });
delete legacyPreferences.menuOptions.algorithmSettings.noteDensity;
assert(preferences.isValidNoteFlowMelodyPreferences(legacyPreferences));
assert.deepStrictEqual(preferences.normalizeNoteFlowMelodyPreferences(legacyPreferences).menuOptions.algorithmSettings, normalized);
const legacyRound = rounds.createNoteFlowRoundResult({ id: "before-density", menuOptions: {
  inputMode: "midi", movement: "custom", algorithmSettings: existing
} });
delete legacyRound.settings.algorithmSettings.noteDensity;
assert(backup.validateStreamedBackupRecord("data.noteFlowRounds.midi", legacyRound).valid);
const invalidLegacy = JSON.parse(JSON.stringify(legacyPreferences));
invalidLegacy.menuOptions.algorithmSettings.repetition = "15";
assert.strictEqual(preferences.isValidNoteFlowMelodyPreferences(invalidLegacy), false);
process.stdout.write("✓ older custom preferences and round backups import safely without accepting malformed controls\n");
