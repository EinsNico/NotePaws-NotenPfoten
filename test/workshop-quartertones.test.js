const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module"), babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");
function storage() { const data = new Map(); return { get length() { return data.size; }, key(index) { return Array.from(data.keys())[index] || null; },
  getItem(key) { return data.has(key) ? data.get(key) : null; }, setItem(key, value) { data.set(key, String(value)); }, removeItem(key) { data.delete(key); } }; }
global.localStorage = storage();
const sourceRoot = path.resolve(__dirname, "../src") + path.sep, originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code, filename);
};
const model = require("../src/model/Workshop"), editor = require("../src/model/WorkshopScoreEditor");
const store = require("../src/model/WorkshopStorage"), backup = require("../src/model/SaveDataBackup"), imports = require("../src/model/SaveDataImport");
const ties = require("../src/model/WorkshopTies"), expression = require("../src/model/WorkshopExpression");
const { recognizeWorkshopChord } = require("../src/model/WorkshopChordNames");
const { createPianoSamplePlayer } = require("../src/model/PianoAudio"), { createWorkshopPlayback } = require("../src/model/WorkshopPlayback");
Module._extensions[".js"] = originalLoader;
function test(name, operation) { operation(); process.stdout.write("✓ workshop quarter tones: " + name + "\n"); }
function note(id, value, startSlot = 0, extra = {}) {
  return Object.assign({ id, kind: "note", noteValue: "quarter", startSlot, pitch: model.workshopPitchFromValue(value) }, extra);
}

test("every allowed quarter-tone pitch roundtrips numerically while unsupported fractions fail explicitly", () => {
  for (let value = model.WORKSHOP_MIN_PITCH; value <= model.WORKSHOP_MAX_PITCH; value += 0.5) {
    const event = note("pitch", value);
    assert(model.isValidWorkshopMeasure({ events: [event] }), String(value));
    assert.strictEqual(model.workshopPitchValue(event.pitch), value);
  }
  for (const value of [NaN, Infinity, "48.5", 48.25, 48.1]) assert.strictEqual(model.workshopPitchFromValue(value), null);
  for (const alter of model.WORKSHOP_PITCH_ALTERS) {
    const pitch = { step: "F", alter, octave: 4 };
    assert(model.isValidWorkshopMeasure({ events: [Object.assign(note("written", 53), { pitch })] }));
    assert.deepStrictEqual(editor.workshopPitchAtStaffY(editor.workshopStaffY(pitch), alter), pitch);
  }
  for (const alter of [0.25, -0.25, 2.5, "0.5", NaN]) {
    assert(!model.isValidWorkshopMeasure({ events: [Object.assign(note("bad", 53), { pitch: { step: "F", alter, octave: 4 } })] }));
    assert.strictEqual(editor.workshopPitchAtStaffY(100, alter), null);
  }
});

test("horizontal and vertical group moves retain exact pitches and intervals", () => {
  const measure = { events: [note("a", 48.5), note("b", 52), note("c", 55.5)] };
  const before = JSON.stringify(measure);
  const horizontal = editor.moveWorkshopNotes(measure, ["a", "b", "c"], "a", 2, measure.events[0].pitch);
  assert(horizontal && model.isValidWorkshopMeasure({ events: horizontal }));
  assert.deepStrictEqual(horizontal.filter(event => event.kind === "note").map(event => event.pitch), measure.events.map(event => event.pitch));
  const shifted = editor.moveWorkshopNotes(measure, ["a", "b", "c"], "a", 2, { step: "D", alter: 0.5, octave: 4 });
  assert(shifted && model.isValidWorkshopMeasure({ events: shifted }));
  assert.deepStrictEqual(shifted.filter(event => event.kind === "note").map(event => model.workshopPitchValue(event.pitch)), [50.5, 54, 57.5]);
  const semitoneBoundary = editor.moveWorkshopNotes(measure, ["a", "b", "c"], "a", 0, { step: "C", alter: 1, octave: 4 });
  assert.deepStrictEqual(semitoneBoundary.filter(event => event.kind === "note").map(event => model.workshopPitchValue(event.pitch)), [49, 52.5, 56]);
  assert.strictEqual(JSON.stringify(measure), before);
});

test("saving and reopening retain quarter-tone revisions that app backup imports leave untouched", () => {
  const draft = model.createWorkshopDraft("Quarter tones", 1), persisted = storage();
  draft.score.parts[0].measures[0].events = [-1.5, -0.5, 0.5, 1.5].map((alter, index) =>
    Object.assign(note("micro-" + index, 53, index * 2), { pitch: { step: "F", alter, octave: 4 } }));
  draft.score.parts[0].measures[0].events[0].accidentalDisplay = { force: true, enclosure: "parentheses", cautionary: true };
  draft.score.parts[0].measures[0].events[1].accidentalDisplay = { force: true, enclosure: "bracket", editorial: true };
  const first = store.storeWorkshopDraft(draft, persisted), edited = model.openWorkshopPiece(first.piece);
  edited.score.parts[0].measures[0].events[0].pitch.alter = 0;
  const saved = store.storeWorkshopDraft(edited, persisted), expected = store.readWorkshopLibrary(persisted);
  assert.deepStrictEqual(model.openWorkshopPiece(saved.piece, first.piece.currentRevisionId).score, draft.score);
  const exported = backup.createSaveDataBackup(persisted);
  assert(backup.validateSaveDataBackup(exported).valid);
  const target = storage(); target.setItem(model.WORKSHOP_STORAGE_KEY,persisted.getItem(model.WORKSHOP_STORAGE_KEY));
  for (const mode of ["replace", "merge", "merge"]) {
    imports.applyPreparedSaveDataImport(target, imports.prepareSaveDataImport(target, exported, mode));
    assert.deepStrictEqual(store.readWorkshopLibrary(target), expected);
    const restored = model.openWorkshopPiece(store.readWorkshopLibrary(target).pieces[0]);
    const notes = restored.score.parts[0].measures[0].events;
    assert.strictEqual(notes[0].pitch.alter, 0, "the latest revision keeps the explicit natural");
    assert.deepStrictEqual(notes[0].accidentalDisplay, { force: true, enclosure: "parentheses", cautionary: true });
    assert.deepStrictEqual(notes[1].accidentalDisplay, { force: true, enclosure: "bracket", editorial: true });
  }
  const invalid = model.cloneWorkshop(exported); invalid.version=5; invalid.data.workshopLibrary=model.cloneWorkshop(expected);
  invalid.data.workshopLibrary.pieces[0].revisions[0].score.parts[0].measures[0].events[0].pitch.alter = 0.25;
  assert.strictEqual(backup.validateSaveDataBackup(invalid).valid, false);
});

test("ties, slurs and ornamental principal notes retain quarter-tone identity", () => {
  let score = model.createWorkshopDraft("Ties", 1).score;
  score.parts[0].measures[0].events = [note("a", 48.5), note("b", 48.5, 2), note("c", 52.5, 4)];
  score = ties.connectWorkshopTies(score, ["a", "b"]);
  assert(score && model.isValidWorkshopScore(score));
  score = expression.connectWorkshopSlur(score, ["a", "c"]);
  assert(score && model.isValidWorkshopScore(score));
  const changed = model.cloneWorkshop(score); changed.parts[0].measures[0].events[1].pitch.alter = 0;
  assert(!ties.isValidWorkshopTies(changed));
  const ornamented = model.createWorkshopDraft("Ornament", 1).score;
  ornamented.parts[0].measures[0].events = [note("trill", 48.5, 0, { ornament: "trill" })];
  const timeline = model.workshopTimeline(ornamented).events.filter(event => event.value !== null);
  assert(timeline.length > 2);
  assert.strictEqual(timeline[0].value, 48.5);
  assert(timeline.filter((event, index) => index % 2 === 0).every(event => event.value === 48.5));
});

test("microtonal selections cannot receive a misleading twelve-tone chord name", () => {
  assert.strictEqual(recognizeWorkshopChord([note("c", 48.5), note("e", 52.5), note("g", 55.5)]), null);
  assert.strictEqual(recognizeWorkshopChord([note("c", 48), note("e", 52), note("g", 55.5)]), null);
  const conventional = recognizeWorkshopChord([note("c", 48), note("e", 52), note("g", 55)]);
  assert(conventional.recognized && conventional.root === 0);
  const doubleSpelled = recognizeWorkshopChord([Object.assign(note("c", 48), { pitch: { step: "D", alter: -2, octave: 4 } }), note("e", 52), note("g", 55)]);
  assert(doubleSpelled.recognized && doubleSpelled.root === 0);
});

class FakeAudio {
  constructor(src) { this.src = src; this.playbackRate = 1; this.preservesPitch = true; this.currentTime = 0; FakeAudio.samples.push(this); }
  play() { return { catch() {} }; } pause() { this.paused = true; } addEventListener() {}
}
FakeAudio.samples = [];
test("opt-in piano playback detunes samples by exactly fifty cents and preserves the shared integer behavior", () => {
  const quarterPlayer = createPianoSamplePlayer({ AudioConstructor: FakeAudio, allowFractionalPitch: true });
  for (const value of [48.5, 51.5, 71.5, 83.5]) {
    const sample = quarterPlayer.play(value, 35);
    const sampleValue = Number(sample.src.match(/(\d+)\.mp3$/)[1]);
    const actualValue = sampleValue + 12 * Math.log(sample.playbackRate) / Math.LN2;
    assert(Math.abs(actualValue - (value > 71.5 ? value - 12 : value)) < 1e-10);
    assert.strictEqual(sample.preservesPitch, false); assert.strictEqual(sample.webkitPreservesPitch, false); assert.strictEqual(sample.mozPreservesPitch, false);
    assert.strictEqual(sample.volume, 0.35);
  }
  const integer = quarterPlayer.play(48, 35);
  assert.strictEqual(integer.src, "static/samples/piano/48.mp3"); assert.strictEqual(integer.playbackRate, 1); assert.strictEqual(integer.preservesPitch, true);
  const existingPlayer = createPianoSamplePlayer({ AudioConstructor: FakeAudio });
  const existing = existingPlayer.play(48.5, 35);
  assert.strictEqual(existing.src, "static/samples/piano/49.mp3"); assert.strictEqual(existing.playbackRate, 1);
});

test("workshop playback sends exact fractional values and sustains a tied pair without a second attack", () => {
  let score = model.createWorkshopDraft("Quarter-tone playback", 1).score;
  score.parts[0].measures[0].events = [note("first", 48.5), note("held", 48.5, 2), note("later", 53.5, 4)];
  score = ties.connectWorkshopTies(score, ["first", "held"]);
  const timers = new Map(), attacks = [], stopped = []; let next = 0;
  const player = { play(value) { attacks.push(value); return { value }; }, stop(sample) { stopped.push(sample.value); }, stopAll() {} };
  const playback = createWorkshopPlayback(score, player, {
    setTimeoutFn(callback, delay) { timers.set(++next, { callback, delay }); return next; }, clearTimeoutFn(id) { timers.delete(id); }
  });
  assert(playback.start()); assert.deepStrictEqual(attacks, [48.5]);
  Array.from(timers.values()).sort((a, b) => a.delay - b.delay).forEach(timer => timer.callback());
  assert.deepStrictEqual(attacks, [48.5, 53.5]); assert(stopped.includes(48.5)); assert(!playback.isPlaying());
});
process.stdout.write("Workshop quarter-tone tests passed.\n");
