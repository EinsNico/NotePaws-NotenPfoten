const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpileProjectModule(loaded, filename) {
  if (!filename.startsWith(sourceRoot)) return originalLoader(loaded, filename);
  const compiled = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  return loaded._compile(compiled.code, filename);
};
const input = require("../src/model/NoteFlowInput");
const practice = require("../src/model/NoteFlowRhythmPractice");
const chordPractice = require("../src/model/NoteFlowChordRhythmPractice");
const { createNoteFlowRhythmTimeline } = require("../src/model/NoteFlowRhythmTimeline");
const { getNoteFlowMeter } = require("../src/model/NoteFlowRhythm");
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { generateNoteFlowChordRhythmicScore } = require("../src/model/NoteFlowChordRhythm");
const { createNoteFlowChordTraining } = require("../src/model/NoteFlowChordTraining");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

function running(values, behavior = "wait", additionalTargets = []) {
  return practice.advanceNoteFlowRhythmPractice(
    practice.startNoteFlowRhythmPractice(practice.createNoteFlowRhythmPractice({
      bpm: 60, durationMs: 4000,
      targets: [{ startMs: 0, expectedValues: values }].concat(additionalTargets)
    }, { behavior, inputMode: "midi" })), 0
  );
}

test("one physical MIDI key answers overlapping staves but never another octave", () => {
  const shared = input.collectNoteFlowMidiInput([48, 48], [], 48);
  assert.strictEqual(shared.status, "complete");
  assert.deepStrictEqual(shared.playedValues, [48, 48]);
  const octave = input.collectNoteFlowMidiInput([48, 60], [], 48);
  assert.strictEqual(octave.status, "pending");
  assert.deepStrictEqual(octave.pendingValues, [48]);
  assert.strictEqual(input.collectNoteFlowMidiInput([48, 60], octave.pendingValues, 48), null);
  assert.strictEqual(input.collectNoteFlowMidiInput([48, 60], octave.pendingValues, 60).status, "complete");
});

test("re-striking the recognized hand neither clears progress nor counts a wrong key", () => {
  let state = practice.submitNoteFlowRhythmPracticeInput(running([36, 60]), 36);
  const pending = state;
  state = practice.submitNoteFlowRhythmPracticeInput(state, 36);
  assert.strictEqual(state, pending);
  assert.deepStrictEqual(state.pendingValues, [36]);
  assert.strictEqual(state.pendingAtMs, 0);
  assert.strictEqual(state.wrongCount, 0);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 60);
  assert.strictEqual(state.correctCount, 1);
  assert.strictEqual(state.targetIndex, 1);
});

test("a wrong octave stays wrong while a corrected wait-mode hand preserves the other hand", () => {
  let state = practice.submitNoteFlowRhythmPracticeInput(running([36, 60]), 36);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 72);
  assert.strictEqual(state.wrongCount, 1);
  assert.strictEqual(state.targetIndex, 0);
  assert.strictEqual(state.status, "waiting");
  assert.deepStrictEqual(state.pendingValues, [36]);
  assert.strictEqual(state.pendingAtMs, 0);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 60);
  assert.deepStrictEqual(state.results, ["correct"]);
  assert.strictEqual(state.correctFirstTryCount, 0);
  assert.strictEqual(state.wrongCount, 1);
});

test("continuous play retains physically held correct keys after a mistake and keeps its timing boundary", () => {
  let state = practice.submitNoteFlowRhythmPracticeInput(running([36, 60], "continuous"), 36);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 72);
  assert.deepStrictEqual(state.pendingValues, [36]);
  assert.strictEqual(state.wrongCount, 1);
  state = practice.advanceNoteFlowRhythmPractice(state, 251);
  assert.deepStrictEqual(state.results, ["missed"]);
  assert.strictEqual(state.missedCount, 1);
});

test("the actual two-hand rhythm timeline completes unisons with one strike at each onset", () => {
  const voice = [48, 50, 52, 48].map((value, index) => ({
    kind: "note", startTick: index * 96, noteValue: "quarter", note: { value }
  }));
  const meter = getNoteFlowMeter("4/4");
  const timeline = createNoteFlowRhythmTimeline({
    meter, hands: ["treble", "bass"],
    measures: [{ meter, voices: { treble: voice, bass: voice } }]
  }, { bpm: 60 });
  assert.deepStrictEqual(timeline.targets[0].expectedValues, [48, 48]);
  assert.strictEqual(timeline.events.length, 8, "Both written staves remain intact");
  let state = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice(timeline, { inputMode: "midi" })
  );
  timeline.targets.forEach(target => {
    state.grip.heldValues.forEach(value => {state=practice.releaseNoteFlowRhythmPracticeInput(state,value);});
    state = practice.advanceNoteFlowRhythmPractice(state, target.startMs - state.elapsedMs);
    state = practice.submitNoteFlowRhythmPracticeInput(state, target.expectedValues[0]);
  });
  assert.strictEqual(state.correctCount, 4);
  assert.strictEqual(state.wrongCount, 0);
  assert.deepStrictEqual(state.results, ["correct", "correct", "correct", "correct"]);
});

test("identical pitches in later targets still require a new MIDI strike", () => {
  let state = practice.submitNoteFlowRhythmPracticeInput(running([48, 48], "wait", [
    { startMs: 1000, expectedValues: [48, 48] }
  ]), 48);
  assert.strictEqual(state.correctCount, 1);
  state = practice.advanceNoteFlowRhythmPractice(state, 1000);
  assert.strictEqual(state.targetIndex, 1);
  assert.strictEqual(state.status, "waiting");
  assert.strictEqual(state.results[1], null);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 48);
  assert.strictEqual(state.correctCount, 1, "holding the preceding key is not a new attack");
  state = practice.releaseNoteFlowRhythmPracticeInput(state, 48);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 48);
  assert.strictEqual(state.correctCount, 2);
});

test("a pre-existing duplicate chord target no longer waits forever for the same key twice", () => {
  const plan = createNoteFlowChordPlan({
    tonalityMode: "circle", selectedKey: "C-major", chordSize: 3,
    bassNote: true, bpm: 60, seed: 17
  });
  const score = generateNoteFlowChordRhythmicScore(plan, {
    meter: "4/4", allowedValues: ["quarter"], restChance: 0
  });
  // Current generators use unique physical targets. Inject the older shared
  // key representation at the practice boundary to protect that compatibility.
  score.targets[0].expectedValues.push(score.targets[0].expectedValues[0]);
  const expected = score.targets[0].expectedValues;
  assert.strictEqual(new Set(expected).size, expected.length - 1);
  let state = chordPractice.advanceNoteFlowChordRhythmPractice(
    chordPractice.startNoteFlowChordRhythmPractice(
      chordPractice.createNoteFlowChordRhythmPractice(score)
    ), 0, 1000
  );
  Array.from(new Set(expected)).reverse().forEach((value, index) => {
    state = chordPractice.submitNoteFlowChordRhythmInput(state, value, 1000 + index * 20);
  });
  assert.strictEqual(state.practice.correctCount, 1);
  assert.strictEqual(state.practice.targetIndex, 1);
  assert.strictEqual(state.practice.wrongCount, 0);
});

test("both explicit hand arrays and legacy additional-bass chords produce the exact target keys", () => {
  const options = { bpm: 60, chordSize: 4 };
  const chord = { values: [36, 48, 52, 55], bassValues: [36],
    trebleValues: [48, 52, 55], bassValue: 36 };
  const plan = { options, hands: ["treble", "bass"], keyId: "C-major", cycleIndex: 0,
    chordSize: 4, bassNotePlanned: true, blocks: [{ chords: [chord] }] };
  const rhythmOptions = { meter: "4/4", allowedValues: ["quarter"], restChance: 0 };
  const explicit = generateNoteFlowChordRhythmicScore(plan, rhythmOptions);
  assert.deepStrictEqual(explicit.targets[0].expectedValues, [36, 48, 52, 55]);
  const legacyPlan = Object.assign({}, plan, { blocks: [{ chords: [
    { values: [48, 52, 55], bassValue: 36 }
  ] }] });
  const legacy = generateNoteFlowChordRhythmicScore(legacyPlan, rhythmOptions);
  assert.deepStrictEqual(legacy.targets[0].expectedValues, [36, 48, 52, 55]);
});

test("the chord strike collector also completes a shared bass key without demanding it twice", () => {
  const training = createNoteFlowChordTraining({ blocks: [{ chords: [
    { values: [48, 52, 55], bassValue: 48 }
  ] }] });
  assert.strictEqual(training.press(52, 1000), "correct");
  assert.strictEqual(training.press(48, 1020), "correct");
  assert.strictEqual(training.press(48, 1030), "duplicate");
  assert.strictEqual(training.press(55, 1040), "complete");
  assert.strictEqual(training.next(), true);
  assert.strictEqual(training.state().complete, true);
});

test("the explicit hand contract does not add the compatibility bass field to its complete values", () => {
  const training = createNoteFlowChordTraining({ blocks: [{ chords: [{
    values: [36, 48, 52, 55], bassValues: [36], trebleValues: [48, 52, 55],
    bassValue: 24 // The explicit arrays take precedence over a legacy compatibility field.
  }] }] });
  assert.strictEqual(training.press(36, 1000), "correct");
  assert.strictEqual(training.press(48, 1020), "correct");
  assert.strictEqual(training.press(52, 1040), "correct");
  assert.strictEqual(training.press(55, 1060), "complete");
  assert.strictEqual(training.next(), true);
});

test("three through eight exact MIDI keys complete in any cyclic order despite re-strikes", () => {
  const pitches = [36, 40, 43, 48, 52, 55, 60, 64];
  for (let count = 3; count <= 8; count += 1) {
    const values = pitches.slice(0, count);
    for (let rotation = 0; rotation < count; rotation += 1) {
      const order = values.slice(rotation).concat(values.slice(0, rotation));
      let state = running(values);
      order.forEach((value, index) => {
        state = practice.submitNoteFlowRhythmPracticeInput(state, value);
        if (index < order.length - 1) {
          const recognized = state;
          state = practice.submitNoteFlowRhythmPracticeInput(state, value);
          assert.strictEqual(state, recognized);
        }
      });
      assert.strictEqual(state.correctCount, 1, `${count} keys, rotation ${rotation}`);
      assert.strictEqual(state.wrongCount, 0);
      assert.deepStrictEqual(state.pendingValues, []);
    }
  }
});

test("touch octave collection and invalid or paused MIDI inputs remain unchanged", () => {
  const touch = input.collectNoteFlowPitchClassInput([48, 60], [], 0);
  assert.deepStrictEqual(touch.pendingValues, [48]);
  assert.strictEqual(input.collectNoteFlowPitchClassInput([48, 60], touch.pendingValues, 0).status, "complete");
  [null, undefined, "", 48.5, -1, 128, NaN].forEach(value => {
    const state = running([48]);
    assert.strictEqual(practice.submitNoteFlowRhythmPracticeInput(state, value), state);
  });
  const paused = practice.pauseNoteFlowRhythmPractice(running([48]));
  assert.strictEqual(practice.submitNoteFlowRhythmPracticeInput(paused, 48), paused);
});

process.stdout.write("MIDI practice recovery regressions passed.\n");
