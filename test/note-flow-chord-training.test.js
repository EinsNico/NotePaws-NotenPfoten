const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function (loaded, filename) {
  if (!filename.startsWith(sourceRoot)) return originalLoader(loaded, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  return loaded._compile(transformed.code, filename);
};
const { createNoteFlowChordTraining } = require("../src/model/NoteFlowChordTraining");
const { createNoteFlowPlayback, startNoteFlowPlayback, advanceNoteFlowPlayback, submitNoteFlowInput } = require("../src/model/NoteFlowPlayback");
Module._extensions[".js"] = originalLoader;

const training = createNoteFlowChordTraining({ blocks: [{ chords: [
  { id: "first", values: [48, 52, 55], bassValue: 36 },
  { id: "second", values: [50, 53, 57], bassValue: null }
] }] });
assert.strictEqual(training.state().total, 2);
assert.strictEqual(training.press(48, 1000), "correct");
assert.strictEqual(training.press(48, 1100), "duplicate");
assert.strictEqual(training.press(49, 1150), "wrong");
assert.strictEqual(training.state().mistakes, 1);
assert.deepStrictEqual(training.state().selected, []);
assert.strictEqual(training.next(), false);
assert.strictEqual(training.press(52, 2000), "correct");
assert.strictEqual(training.state().strikeDeadline, 2650);
assert.strictEqual(training.press(55, 2200), "correct");
assert.strictEqual(training.state().strikeDeadline, 2650);
assert.strictEqual(training.press(36, 2300), "correct");
assert.strictEqual(training.press(48, 2499), "complete");
assert.strictEqual(training.press(49, 2500), "ignored");
assert.strictEqual(training.state().mistakes, 1);
assert.strictEqual(training.next(), true);
assert.strictEqual(training.state().target.id, "second");
assert.strictEqual(training.press(50, 3000), "correct");
assert.strictEqual(training.expire(3649), false);
assert.strictEqual(training.expire(3650), true);
assert.strictEqual(training.state().mistakes, 2);
assert.deepStrictEqual(training.state().selected, []);
assert.strictEqual(training.press(50, 4000), "correct");
assert.strictEqual(training.press(53, 4651), "late");
assert.strictEqual(training.state().mistakes, 3);
assert.strictEqual(training.press(57, 5000), "correct");
training.cancelAttempt();
assert.deepStrictEqual(training.state().selected, []);
assert.strictEqual(training.press(57, 6000), "correct");
assert.strictEqual(training.press(53, 6050), "correct");
assert.strictEqual(training.press(50, 6090), "complete");
assert.strictEqual(training.next(), true);
assert.strictEqual(training.state().complete, true);
assert.strictEqual(training.press(50, 7000), "ignored");
const skipped = createNoteFlowChordTraining({ blocks: [{ chords: [
  { values: [48, 52, 55], bassValue: null },
  { values: [50, 53, 57], bassValue: null }
] }] });
assert.strictEqual(skipped.press(48, 100), "correct");
assert.strictEqual(skipped.skip(), true);
assert.strictEqual(skipped.state().index, 1);
assert.deepStrictEqual(skipped.state().selected, []);
assert.strictEqual(skipped.skip(), true);
assert.strictEqual(skipped.state().complete, true);
assert.strictEqual(skipped.skip(), false);
const streaming = createNoteFlowChordTraining({ blocks: [{ chords: [
  { values: [48, 52, 55], bassValue: null },
  { values: [50, 53, 57], bassValue: null }
] }] });
for (let index = 0; index < 80; index += 1) {
  assert.strictEqual(streaming.appendChords([{ values: [48, 52, 55], bassValue: null }]), 1);
  assert.strictEqual(streaming.skip(), true);
  streaming.trimPassed(1);
  assert.strictEqual(streaming.state().index, index + 1);
  assert(streaming.state().target);
}
assert.strictEqual(streaming.state().total, 82);
const waitingChord = createNoteFlowChordTraining({ blocks: [{ chords: [
  { values: [48, 52, 55], bassValue: null },
  { values: [50, 53, 57], bassValue: null }
] }] });
let waitingPlayback = createNoteFlowPlayback({ events: [
  { expectedValues: [48, 52, 55] }, { expectedValues: [50, 53, 57] }
] }, { behavior: "wait" });
waitingPlayback = startNoteFlowPlayback(waitingPlayback, 0);
waitingPlayback = advanceNoteFlowPlayback(waitingPlayback, 1200);
assert.strictEqual(waitingPlayback.status, "waiting");
assert.strictEqual(waitingPlayback.currentEventIndex, 0);
assert.strictEqual(waitingChord.press(49, 1200), "wrong");
assert.strictEqual(waitingPlayback.status, "waiting");
assert.strictEqual(waitingChord.press(48, 1220), "correct");
assert.strictEqual(waitingChord.press(52, 1250), "correct");
assert.strictEqual(waitingChord.press(55, 1280), "complete");
waitingPlayback = submitNoteFlowInput(waitingPlayback, [48, 52, 55], 1280);
assert.strictEqual(waitingPlayback.status, "running");
assert.strictEqual(waitingPlayback.currentEventIndex, 1);
assert.strictEqual(waitingChord.next(), true);
const midiChord = createNoteFlowChordTraining({ blocks: [{ chords: [
  { values: [48, 52, 55], bassValue: 36 }
] }] });
assert.strictEqual(midiChord.press(52, 100), "correct"); // MIDI note-on order is arbitrary
assert.strictEqual(midiChord.press(60, 120), "wrong"); // correct letter, wrong octave
assert.strictEqual(midiChord.press(36, 200), "correct");
assert.strictEqual(midiChord.press(55, 230), "correct");
assert.strictEqual(midiChord.press(48, 240), "correct");
assert.strictEqual(midiChord.press(52, 250), "complete");
console.log("note-flow chord training: ok");
