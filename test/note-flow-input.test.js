const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

function loadEsModule(filePath) {
  const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
  const originalLoader = Module._extensions[".js"];
  Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
    if (filename.indexOf(sourceRoot) !== 0) {
      return originalLoader(loadedModule, filename);
    }
    const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
      babelrc: false,
      presets: [["env", { modules: "commonjs" }]]
    });
    return loadedModule._compile(transformed.code, filename);
  };
  delete require.cache[filePath];
  try {
    return require(filePath);
  } finally {
    Module._extensions[".js"] = originalLoader;
  }
}

function test(name, body) {
  try {
    body();
    process.stdout.write(`\u2713 ${name}\n`);
  } catch (error) {
    process.stderr.write(`\u2717 ${name}\n`);
    throw error;
  }
}

const input = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowInput.js")
);
const playbackModel = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowPlayback.js")
);

test("maps a pitch-class button to the expected written octave", () => {
  const result = input.collectNoteFlowPitchClassInput([72], [], 0);
  assert.strictEqual(result.status, "complete");
  assert.deepStrictEqual(result.playedValues, [72]);
});

test("MIDI accepts only the exact expected octave", () => {
  const correct = input.collectNoteFlowMidiInput([60], [], 60);
  const wrongOctave = input.collectNoteFlowMidiInput([60], [], 48);
  assert.strictEqual(correct.status, "complete");
  assert.deepStrictEqual(correct.playedValues, [60]);
  assert.strictEqual(wrongOctave.status, "wrong");
  assert.deepStrictEqual(wrongOctave.playedValues, [48]);
});

test("MIDI collects a two-hand event across successive note-ons", () => {
  const first = input.collectNoteFlowMidiInput([48, 67], [], 67);
  assert.strictEqual(first.status, "pending");
  assert.deepStrictEqual(first.pendingValues, [67]);
  const second = input.collectNoteFlowMidiInput([48, 67], first.pendingValues, 48);
  assert.strictEqual(second.status, "complete");
  assert.deepStrictEqual(second.playedValues, [67, 48]);
});

test("MIDI preserves duplicate pitches but rejects unrelated or invalid notes", () => {
  const first = input.collectNoteFlowMidiInput([48, 48], [], 48);
  const second = input.collectNoteFlowMidiInput([48, 48], first.pendingValues, 48);
  assert.deepStrictEqual(second.playedValues, [48, 48]);
  assert.strictEqual(input.collectNoteFlowMidiInput([48, 67], [48], 60).status, "wrong");
  assert.strictEqual(input.collectNoteFlowMidiInput([48], [], null), null);
});

test("accepts every screen-key note name independently of its octave", () => {
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    const expectedValue = 48 + pitchClass;
    [-12, 0, 12, 24].forEach(octaveOffset => {
      const result = input.collectNoteFlowPitchClassInput(
        [expectedValue],
        [],
        pitchClass + octaveOffset
      );
      assert.strictEqual(result.status, "complete");
      assert.deepStrictEqual(result.playedValues, [expectedValue]);
    });
  }
});

test("maps both end keys of the graphical keyboard to the note C", () => {
  const lowerC = input.collectNoteFlowPitchClassInput([60], [], 0);
  const upperC = input.collectNoteFlowPitchClassInput([60], [], 12);
  assert.deepStrictEqual(lowerC.playedValues, [60]);
  assert.deepStrictEqual(upperC.playedValues, [60]);
});

test("chooses the matching written octave for touch-input audio", () => {
  assert.strictEqual(
    input.getNoteFlowTouchAudioValue([48, 67], [], 7),
    67
  );
  assert.strictEqual(
    input.getNoteFlowTouchAudioValue([48, 60], [48], 0),
    60
  );
});

test("places a wrong touch-input sound near the current notation", () => {
  assert.strictEqual(
    input.getNoteFlowTouchAudioValue([60], [], 9),
    57
  );
});

test("assigns a late touch input to the matching previous note", () => {
  const playback = {
    behavior: "continuous",
    currentEventIndex: 1,
    currentTargetAtMs: 2400,
    stepDurationMs: 1200,
    lastUpdatedAtMs: 1200,
    timeline: {
      events: [
        { expectedValues: [60] },
        { expectedValues: [62] },
        { expectedValues: [64] }
      ]
    }
  };
  const target = input.selectNoteFlowTouchTarget(playback, 0, 1300);
  assert.strictEqual(target.eventIndex, 0);
  assert.strictEqual(target.timing.result, "precise");
  assert.strictEqual(target.timing.offsetMs, 100);
});

test("does not pre-occupy an upcoming note with a matching wrong pitch", () => {
  const playback = {
    behavior: "continuous",
    currentEventIndex: 0,
    currentTargetAtMs: 1200,
    stepDurationMs: 1200,
    lastUpdatedAtMs: 0,
    timeline: {
      events: [
        { expectedValues: [60] },
        { expectedValues: [62] },
        { expectedValues: [64] }
      ]
    }
  };
  const target = input.selectNoteFlowTouchTarget(playback, 4, 300);
  assert.strictEqual(target.eventIndex, 0);
  assert.strictEqual(target.timing.result, "early");
});

test("ignores repeat touches after an early correct wait-mode answer", () => {
  let state = playbackModel.startNoteFlowPlayback(
    playbackModel.createNoteFlowPlayback({
      events: [
        { expectedValues: [60] },
        { expectedValues: [62] }
      ]
    }, { behavior: "wait" }),
    0
  );
  state = playbackModel.submitNoteFlowInput(state, 60, 600);
  assert.strictEqual(state.currentAnswered, true);
  assert.strictEqual(input.selectNoteFlowTouchTarget(state, 0, 1050), null);
  assert.strictEqual(input.selectNoteFlowTouchTarget(state, 2, 1200).eventIndex, 1);
});

test("keeps the just-missed note targetable beyond the old midpoint", () => {
  const playback = {
    behavior: "continuous",
    currentEventIndex: 1,
    currentTargetAtMs: 2400,
    stepDurationMs: 1200,
    lastUpdatedAtMs: 1200,
    timeline: {
      events: [
        { expectedValues: [60], missedRecorded: true },
        { expectedValues: [62] },
        { expectedValues: [64] }
      ]
    }
  };
  const late = input.selectNoteFlowTouchTarget(playback, 0, 1900);
  assert.strictEqual(late.eventIndex, 0);
  assert.strictEqual(late.timing.result, "late");
  assert.strictEqual(late.timing.offsetMs, 700);
  const afterGrace = input.selectNoteFlowTouchTarget(playback, 0, 2100);
  assert.strictEqual(afterGrace.eventIndex, 1);
});

test("ignores a previous note that was already completed", () => {
  const playback = {
    behavior: "continuous",
    currentEventIndex: 1,
    currentTargetAtMs: 2400,
    stepDurationMs: 1200,
    lastUpdatedAtMs: 1200,
    timeline: {
      events: [
        { expectedValues: [60], inputResult: "correct" },
        { expectedValues: [62] },
        { expectedValues: [64] }
      ]
    }
  };
  assert.strictEqual(
    input.selectNoteFlowTouchTarget(playback, 0, 1400).eventIndex,
    1
  );
});

test("keeps future notes untouched after a wrong pitch and a late correction", () => {
  let state = playbackModel.startNoteFlowPlayback(
    playbackModel.createNoteFlowPlayback({
      events: [
        { expectedValues: [60] },
        { expectedValues: [62] },
        { expectedValues: [64] }
      ]
    }),
    0
  );
  const wrongTarget = input.selectNoteFlowTouchTarget(state, 4, 1050);
  assert.strictEqual(wrongTarget.eventIndex, 0);
  const wrong = input.collectNoteFlowPitchClassInput(
    wrongTarget.event.expectedValues,
    [],
    4
  );
  state = playbackModel.submitNoteFlowInput(
    state,
    wrong.playedValues,
    1050,
    wrongTarget.eventIndex
  );
  assert.strictEqual(state.timeline.events[0].inputResult, "wrong");
  assert.strictEqual(state.timeline.events[2].inputResult, undefined);

  state = playbackModel.advanceNoteFlowPlayback(state, 1200);
  const lateTarget = input.selectNoteFlowTouchTarget(state, 0, 1900);
  assert.strictEqual(lateTarget.eventIndex, 0);
  const late = input.collectNoteFlowPitchClassInput(
    lateTarget.event.expectedValues,
    [],
    0
  );
  state = playbackModel.submitNoteFlowInput(
    state,
    late.playedValues,
    1900,
    lateTarget.eventIndex
  );
  assert.strictEqual(state.timeline.events[0].timingResult, "late");
  assert.strictEqual(state.timeline.events[1].inputResult, undefined);
  assert.strictEqual(state.timeline.events[2].inputResult, undefined);

  const nextTarget = input.selectNoteFlowTouchTarget(state, 2, 2250);
  assert.strictEqual(nextTarget.eventIndex, 1);
});

test("collects two-hand notes in either order", () => {
  const first = input.collectNoteFlowPitchClassInput([48, 67], [], 7);
  assert.strictEqual(first.status, "pending");
  assert.deepStrictEqual(first.pendingValues, [67]);
  assert.strictEqual(first.playedValues, null);
  assert.strictEqual(first.collectedCount, 1);
  assert.strictEqual(first.expectedCount, 2);
  const second = input.collectNoteFlowPitchClassInput(
    [48, 67],
    first.pendingValues,
    0
  );
  assert.strictEqual(second.status, "complete");
  assert.deepStrictEqual(second.playedValues, [67, 48]);
  assert.strictEqual(second.collectedCount, 2);
  assert.strictEqual(second.expectedCount, 2);
});

test("supports the same pitch class in two different octaves", () => {
  const first = input.collectNoteFlowPitchClassInput([48, 60], [], 0);
  const second = input.collectNoteFlowPitchClassInput(
    [48, 60],
    first.pendingValues,
    0
  );
  assert.deepStrictEqual(second.playedValues, [48, 60]);
});

test("marks an unrelated pitch class as wrong and clears the chord", () => {
  const result = input.collectNoteFlowPitchClassInput([48, 67], [48], 2);
  assert.strictEqual(result.status, "wrong");
  assert.deepStrictEqual(result.pendingValues, []);
  assert.notDeepStrictEqual(result.playedValues, [48, 67]);
});

process.stdout.write("Note Flow touch input tests passed.\n");
