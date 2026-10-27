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

const { createNoteFlowPreviewAudition } = require("../src/model/NoteFlowPreviewAudition");
const { createNoteFlowRhythmTimeline } = require("../src/model/NoteFlowRhythmTimeline");
const { createNoteFlowRoundResult } = require("../src/model/NoteFlowRoundResult");
const { NOTE_FLOW_MOVEMENTS } = require("../src/model/NoteFlowMovement");

async function run() {
  for (const name of ["NoteFlowMenu", "NoteFlowChordMenu", "NoteFlowAlgorithmControls", "NoteFlowAlgorithmPreview", "NoteFlowChordRhythmScore"]) {
    const file = fs.readFileSync(path.resolve(sourceRoot, "components", name + ".vue"), "utf8");
    const compiled = compiler.compile(compiler.parseComponent(file).template.content);
    assert.deepStrictEqual(compiled.errors, [], name);
  }
  const melody = view(component("NoteFlowMenu"));
  melody.openSettingSection("algorithm");
  melody.updateMovement("custom");
  melody.updateAlgorithmSettings({ jumpFrequency: 91, jumpSize: 11, repetition: 8, noteDensity: 83 });
  const excerpt = melody.algorithmMotionPreview;
  assert.strictEqual(excerpt.score.measures.length, 4);
  assert.deepStrictEqual(excerpt.cycle.config.algorithmSettings, { jumpFrequency: 91, jumpSize: 11, repetition: 8, noteDensity: 83 });
  const melodyNotes = JSON.stringify(excerpt.cycle.timeline);
  melody.algorithmPreviewIndex += 1;
  assert.notStrictEqual(JSON.stringify(melody.algorithmMotionPreview.cycle.timeline), melodyNotes);
  melody.previewOptions.rhythmValues = { treble: ["half"], bass: ["quarter"] };
  melody.updateHandMode("two");
  const score = melody.algorithmMotionPreview.score;
  const timeline = createNoteFlowRhythmTimeline(score, { bpm: 60 });
  const faster = createNoteFlowRhythmTimeline(score, { bpm: 120 });
  assert.strictEqual(timeline.durationMs, faster.durationMs * 2);
  const chords = view(component("NoteFlowChordMenu"));
  chords.update("rhythmValues", ["half"]);
  assert(chords.rhythmScore.measures.length <= 4);
  assert(chords.rhythmScore.targets.length > 0);
  assert.strictEqual(chords.rhythmScore.durationMs, Math.round(4 * 4 * 60000 / chords.localOptions.bpm));
  const customControls = view(component("NoteFlowAlgorithmControls"), { kind: "chord", bassNote: false });
  assert.strictEqual(customControls.controls.length, 2);
  customControls.bassNote = true;
  assert.strictEqual(customControls.controls.length, 3);
  process.stdout.write("✓ slider settings reach the real generator; new examples and four-bar previews use selected rhythm and BPM\n");

  let now = 0, seq = 0;
  const pending = new Map(), played = [], stopped = [];
  const player = { play(value) { played.push([now, value]); return { pause() { stopped.push([now, value]); }, currentTime: 0 }; }, stopAll() {} };
  const audition = createNoteFlowPreviewAudition({ durationMs: 2000, events: [
    { kind: "note", startMs: 0, endMs: 2000, note: { value: 48 } },
    { kind: "note", startMs: 0, endMs: 500, note: { value: 60 } },
    { kind: "rest", startMs: 500, endMs: 1000, note: null },
    { kind: "note", startMs: 1000, endMs: 1500, note: { value: 62 } }
  ] }, { player, setTimeoutFn(fn, delay) { const id = ++seq; pending.set(id, { fn, at: now + delay }); return id; }, clearTimeoutFn(id) { pending.delete(id); } });
  function advance(time) {
    now = time;
    const due = Array.from(pending.entries()).filter(([, task]) => task.at <= now).sort((a,b) => a[1].at-b[1].at);
    due.forEach(([id, task]) => { if (pending.delete(id)) task.fn(); });
  }
  assert(audition.start());
  assert.deepStrictEqual(played, [[0,48],[0,60]]);
  advance(500);
  assert.deepStrictEqual(stopped, [[500,60]]); // A rest in the melody must not stop the held bass.
  advance(1000);
  assert.deepStrictEqual(played[2], [1000,62]);
  audition.stop();
  assert.strictEqual(pending.size, 0);
  advance(2000);
  assert.strictEqual(played.length, 3);
  assert.strictEqual(audition.isPlaying(), false);
  process.stdout.write("✓ audition preserves independent note lengths and rests; stopping cancels all future notes\n");

  const exported = backup.createSaveDataBackup(localStorage);
  // This fixture includes rounds, but no daily archive: its format is version 4.
  exported.version = 4;
  exported.data.noteFlowRounds = { screen: [], midi: [], chordMidi: [] };
  exported.data.rhythmSenseBars = [];
  for (const kind of ["melody", "chord"]) {
    const group = kind === "chord" ? "chordMidi" : "screen";
    const parameters = kind === "chord" ? { jumpFrequency:80, jumpSize:9, bassJumpFrequency:70 } : { jumpFrequency:80, jumpSize:9, repetition:70 };
    const round = createNoteFlowRoundResult({ id: kind+"-custom", exerciseType: kind,
      menuOptions: { inputMode: kind === "chord" ? "midi" : "button", movement: "custom", algorithmSettings: parameters } });
    exported.data.noteFlowRounds[group].push(round);
    assert(backup.validateStreamedBackupRecord("data.noteFlowRounds."+group, round).valid);
    for (const invalid of [null, {}, { ...parameters, jumpSize: 13 }, { ...parameters, jumpSize: "9" }, { ...parameters, surprise: true }]) {
      const malformed = JSON.parse(JSON.stringify(round));
      malformed.settings.algorithmSettings = invalid;
      assert.strictEqual(backup.validateStreamedBackupRecord("data.noteFlowRounds."+group, malformed).valid, false);
    }
    const missing = JSON.parse(JSON.stringify(round));
    delete missing.settings.algorithmSettings;
    assert.strictEqual(backup.validateStreamedBackupRecord("data.noteFlowRounds."+group, missing).valid, false);
    delete missing.settings.movement;
    assert(backup.validateStreamedBackupRecord("data.noteFlowRounds."+group, missing).valid);
  }
  assert(backup.validateSaveDataBackup(exported).valid);
  const prepared = prepareSaveDataImport(localStorage, JSON.parse(JSON.stringify(exported)), "replace");
  assert.deepStrictEqual(prepared.importedBackup.data.noteFlowRounds, exported.data.noteFlowRounds);
  process.stdout.write("✓ full backup/import retains custom round settings; streamed import rejects malformed values and accepts older rounds\n");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
