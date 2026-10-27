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

const playback = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowPlayback.js")
);
const generator = loadEsModule(
  path.resolve(__dirname, "../src/model/NoteFlowGenerator.js")
);

function timeline(expectedValues = [[60], [62], [64]]) {
  return {
    events: expectedValues.map((values, index) => ({
      id: `event-${index}`,
      expectedValues: values
    }))
  };
}

test("maps every menu speed to one stable step duration", () => {
  assert.deepStrictEqual(playback.NOTE_FLOW_SPEED_DURATIONS_MS, {
    "very-slow": 2400,
    slow: 1800,
    normal: 1200,
    fast: 800,
    "very-fast": 550
  });
  assert.strictEqual(playback.getNoteFlowStepDurationMs("unknown"), 1200);
  assert.strictEqual(playback.getNoteFlowPrecisionWindowMs(1200), 300);
  assert.strictEqual(playback.getNoteFlowPrecisionWindowMs(550), 150);
  assert.strictEqual(playback.getNoteFlowPrecisionWindowMs(2400), 320);
  assert.strictEqual(playback.getNoteFlowLateInputGraceMs(1200), 840);
});

test("counts taps near the play line but still rejects clearly early notes", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline(), { bpm: 50 }), 0
  );
  state = playback.submitNoteFlowInput(state, 60, 900);
  assert.strictEqual(state.timeline.events[0].inputResult, "correct");
  assert.strictEqual(state.timeline.events[0].timingOffsetMs, -300);

  let early = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline(), { bpm: 50 }), 0
  );
  early = playback.submitNoteFlowInput(early, 60, 899);
  assert.strictEqual(early.timeline.events[0].timingResult, "early");
});

test("uses explicit BPM as one beat per position without breaking old speeds", () => {
  assert.strictEqual(playback.normalizeNoteFlowBpm(null), null);
  assert.strictEqual(playback.normalizeNoteFlowBpm("invalid"), null);
  assert.strictEqual(playback.normalizeNoteFlowBpm(10), 25);
  assert.strictEqual(playback.normalizeNoteFlowBpm(200), 120);
  assert.strictEqual(playback.getNoteFlowBpmStepDurationMs(25), 2400);
  assert.strictEqual(playback.getNoteFlowBpmStepDurationMs(60), 1000);
  assert.strictEqual(playback.getNoteFlowBpmStepDurationMs(120), 500);

  const legacy = playback.createNoteFlowPlayback(timeline(), { speed: "fast" });
  assert.strictEqual(legacy.bpm, null);
  assert.strictEqual(legacy.stepDurationMs, 800);

  let timed = playback.createNoteFlowPlayback(timeline(), {
    speed: "fast",
    bpm: 60
  });
  assert.strictEqual(timed.bpm, 60);
  assert.strictEqual(timed.stepDurationMs, 1000);
  timed = playback.startNoteFlowPlayback(timed, 0);
  timed = playback.advanceNoteFlowPlayback(timed, 999);
  assert.strictEqual(timed.currentEventIndex, 0);
  timed = playback.advanceNoteFlowPlayback(timed, 1000);
  assert.strictEqual(timed.currentEventIndex, 1);
  assert.strictEqual(timed.nextTransitionAtMs, 2000);
});

test("keeps continuous flow moving and counts unanswered events", () => {
  let state = playback.createNoteFlowPlayback(timeline(), {
    speed: "normal",
    behavior: "continuous"
  });
  state = playback.startNoteFlowPlayback(state, 100);
  state = playback.advanceNoteFlowPlayback(state, 1300);
  assert.strictEqual(state.currentEventIndex, 1);
  assert.strictEqual(state.missedEventCount, 1);
  state = playback.advanceNoteFlowPlayback(state, 2500);
  assert.strictEqual(state.currentEventIndex, 2);
  assert.strictEqual(state.missedEventCount, 2);
  state = playback.advanceNoteFlowPlayback(state, 3700);
  assert.strictEqual(state.status, "complete");
  assert.strictEqual(state.missedEventCount, 3);
});

test("keeps a correct continuous answer on the musical cadence", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline()),
    0
  );
  state = playback.submitNoteFlowInput(state, 60, 1050);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.currentEventIndex, 0);
  assert.strictEqual(state.currentAnswered, true);
  assert.strictEqual(state.correctFirstTryCount, 1);
  assert.strictEqual(state.nextTransitionAtMs, 1200);
  assert.strictEqual(state.timeline.events[0].inputResult, "correct");
  state = playback.advanceNoteFlowPlayback(state, 1200);
  assert.strictEqual(state.currentEventIndex, 1);
  assert.strictEqual(state.missedEventCount, 0);
  assert.strictEqual(state.timeline.events[0].inputResult, "correct");
});

test("marks an early continuous input red and still allows a precise retry", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline()),
    0
  );
  state = playback.submitNoteFlowInput(state, 60, 300);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.currentAnswered, false);
  assert.strictEqual(state.feedback, "wrong");
  assert.strictEqual(state.timeline.events[0].timingResult, "early");
  assert.strictEqual(state.earlyAttemptCount, 1);
  assert.strictEqual(state.wrongAttemptCount, 1);
  assert.strictEqual(state.nextTransitionAtMs, 1200);
  state = playback.submitNoteFlowInput(state, 60, 1050);
  assert.strictEqual(state.feedback, "correct");
  assert.strictEqual(state.currentAnswered, true);
  assert.strictEqual(state.correctEventCount, 1);
  assert.strictEqual(state.correctFirstTryCount, 0);
});

test("marks a wrong continuous note without stopping or changing cadence", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline()),
    0
  );
  state = playback.submitNoteFlowInput(state, 61, 1050);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.waitingReason, null);
  assert.strictEqual(state.feedback, "wrong");
  assert.strictEqual(state.currentAnswered, false);
  assert.strictEqual(state.nextTransitionAtMs, 1200);
  assert.strictEqual(state.timeline.events[0].inputResult, "wrong");
  state = playback.advanceNoteFlowPlayback(state, 1199);
  assert.strictEqual(state.currentEventIndex, 0);
  state = playback.advanceNoteFlowPlayback(state, 1200);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.currentEventIndex, 1);
  assert.strictEqual(state.correctFirstTryCount, 0);
  assert.strictEqual(state.wrongAttemptCount, 1);
  assert.strictEqual(state.missedEventCount, 1);
  assert.strictEqual(state.nextTransitionAtMs, 2400);
  assert.strictEqual(state.timeline.events[0].inputResult, "wrong");
});

test("wait mode lets an early correct note pass in red at the play line", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline(), { behavior: "wait" }),
    0
  );
  state = playback.submitNoteFlowInput(state, 60, 600);
  assert.strictEqual(state.currentEventIndex, 0);
  assert.strictEqual(state.currentAnswered, true);
  assert.strictEqual(state.correctEventCount, 0);
  assert.strictEqual(state.feedback, "wrong");
  assert.strictEqual(state.timeline.events[0].inputResult, "wrong");
  assert.strictEqual(state.timeline.events[0].timingResult, "early");
  assert.strictEqual(state.earlyAttemptCount, 1);
  assert.strictEqual(state.nextTransitionAtMs, 1200);
  state = playback.submitNoteFlowInput(state, 60, 1050);
  assert.strictEqual(state.timeline.events[0].inputResult, "wrong");
  assert.strictEqual(state.correctEventCount, 0);
  state = playback.advanceNoteFlowPlayback(state, 1199);
  assert.strictEqual(state.currentEventIndex, 0);
  state = playback.advanceNoteFlowPlayback(state, 1200);
  assert.strictEqual(state.currentEventIndex, 1);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.nextTransitionAtMs, 2400);
  assert.strictEqual(state.timeline.events[0].inputResult, "wrong");
});

test("wait mode still pauses after a wrong pitch until the correct one is played", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline(), { behavior: "wait" }),
    0
  );
  state = playback.submitNoteFlowInput(state, 61, 600);
  assert.strictEqual(state.currentAnswered, false);
  state = playback.advanceNoteFlowPlayback(state, 1200);
  assert.strictEqual(state.status, "waiting");
  state = playback.submitNoteFlowInput(state, 60, 1250);
  assert.strictEqual(state.currentEventIndex, 1);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.nextTransitionAtMs, 2450);
});

test("keeps exact octave comparison in playback for future MIDI input", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline([[60]]), { behavior: "wait" }),
    0
  );
  state = playback.advanceNoteFlowPlayback(state, 1200);
  state = playback.submitNoteFlowInput(state, 72, 1300);
  assert.strictEqual(state.status, "waiting");
  assert.strictEqual(state.feedback, "wrong");
  assert.strictEqual(state.correctEventCount, 0);
});

test("recovers a just-passed note inside the precision tolerance", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline()),
    0
  );
  state = playback.advanceNoteFlowPlayback(state, 1200);
  assert.strictEqual(state.missedEventCount, 1);
  state = playback.submitNoteFlowInput(state, 60, 1300, 0);
  assert.strictEqual(state.timeline.events[0].inputResult, "correct");
  assert.strictEqual(state.timeline.events[0].timingOffsetMs, 100);
  assert.strictEqual(state.correctEventCount, 1);
  assert.strictEqual(state.missedEventCount, 0);
});

test("marks a genuinely late note red without disturbing the next note", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline()),
    0
  );
  state = playback.advanceNoteFlowPlayback(state, 1200);
  state = playback.submitNoteFlowInput(state, 60, 1600, 0);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.currentEventIndex, 1);
  assert.strictEqual(state.timeline.events[0].inputResult, "wrong");
  assert.strictEqual(state.timeline.events[0].timingResult, "late");
  assert.strictEqual(state.lateAttemptCount, 1);
  assert.strictEqual(state.nextTransitionAtMs, 2400);
});

test("does not mark an upcoming event when it is played too early", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline()),
    0
  );
  state = playback.submitNoteFlowInput(state, 62, 1050, 1);
  assert.strictEqual(state.wrongAttemptCount, 0);
  assert.strictEqual(state.timeline.events[1].inputResult, undefined);
  assert.strictEqual(state.currentEventIndex, 0);
});

test("attributes a late input to the missed event without changing the next", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline()),
    0
  );
  state = playback.advanceNoteFlowPlayback(state, 1200);
  state = playback.submitNoteFlowInput(state, 60, 1900, 0);
  assert.strictEqual(state.timeline.events[0].inputResult, "wrong");
  assert.strictEqual(state.timeline.events[0].timingResult, "late");
  assert.strictEqual(state.timeline.events[1].inputResult, undefined);
  assert.strictEqual(state.currentEventIndex, 1);
  assert.strictEqual(state.nextTransitionAtMs, 2400);
});

test("keeps the final wait-mode note red until it is corrected", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline([[60]]), { behavior: "wait" }),
    0
  );
  state = playback.advanceNoteFlowPlayback(state, 1200);
  state = playback.submitNoteFlowInput(state, 59, 1300);
  assert.strictEqual(state.status, "waiting");
  assert.strictEqual(state.feedback, "wrong");
  assert.strictEqual(state.timeline.events[0].inputResult, "wrong");
  state = playback.submitNoteFlowInput(state, 60, 1350);
  assert.strictEqual(state.status, "complete");
  assert.strictEqual(state.completionReason, "timeline-complete");
  assert.strictEqual(state.correctEventCount, 1);
  assert.strictEqual(state.correctFirstTryCount, 0);
  assert.strictEqual(state.timeline.events[0].inputResult, "correct");
});

test("lets a late but pitch-correct wait-mode answer continue in red", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline([[60]]), { behavior: "wait" }),
    0
  );
  state = playback.advanceNoteFlowPlayback(state, 1200);
  state = playback.submitNoteFlowInput(state, 60, 1600);
  assert.strictEqual(state.status, "complete");
  assert.strictEqual(state.correctEventCount, 0);
  assert.strictEqual(state.lateAttemptCount, 1);
  assert.strictEqual(state.timeline.events[0].inputResult, "wrong");
});

test("compares two-hand input without depending on key order", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline([[48, 67], [50, 69]])),
    0
  );
  state = playback.submitNoteFlowInput(state, [67, 48], 1050);
  assert.strictEqual(state.currentAnswered, true);
  assert.strictEqual(state.correctEventCount, 1);
});

test("runs directly on a generated two-hand cycle", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "two",
    secondaryNotesPerBlock: 4,
    seed: "echter-ablauf"
  });
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(cycle, {
      speed: "fast",
      behavior: "continuous"
    }),
    1000
  );
  const expected = cycle.timeline.events[0].expectedValues.slice().reverse();
  state = playback.submitNoteFlowInput(state, expected, 1700);
  assert.strictEqual(state.correctEventCount, 1);
  assert.strictEqual(state.currentAnswered, true);
  assert.strictEqual(state.stepDurationMs, 800);
});

test("pause and resume preserve the exact remaining movement time", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline()),
    100
  );
  state = playback.pauseNoteFlowPlayback(state, 600);
  assert.strictEqual(state.status, "paused");
  assert.strictEqual(state.pausedSnapshot.remainingTransitionMs, 700);
  state = playback.resumeNoteFlowPlayback(state, 5000);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.nextTransitionAtMs, 5700);
  assert.strictEqual(state.pausedDurationMs, 4400);
  state = playback.advanceNoteFlowPlayback(state, 5699);
  assert.strictEqual(state.currentEventIndex, 0);
  state = playback.advanceNoteFlowPlayback(state, 5700);
  assert.strictEqual(state.currentEventIndex, 1);
});

test("provides animation progress and the red feedback state", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline()),
    0
  );
  let frame = playback.getNoteFlowPlaybackFrame(state, 600);
  assert.strictEqual(frame.progress, 0.5);
  state = playback.submitNoteFlowInput(state, 12, 700);
  frame = playback.getNoteFlowPlaybackFrame(state, 900);
  assert.strictEqual(frame.progress, 0.75);
  assert.strictEqual(frame.highlight, "wrong");
});

test("appends a following cycle without completing the active stream", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline([[60], [62]])),
    0
  );
  state = playback.appendNoteFlowPlaybackEvents(
    state,
    timeline([[64], [65]]).events
  );
  state = playback.advanceNoteFlowPlayback(state, 2400);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.currentEventIndex, 2);
  assert.strictEqual(state.timeline.events.length, 4);
  assert.strictEqual(state.timeline.events[2].expectedValues[0], 64);
});

test("trims passed stream events while preserving absolute progress", () => {
  let state = playback.startNoteFlowPlayback(
    playback.createNoteFlowPlayback(timeline([
      [60], [62], [64], [65], [67], [69]
    ])),
    0
  );
  state = playback.advanceNoteFlowPlayback(state, 4800);
  assert.strictEqual(state.currentEventIndex, 4);
  state = playback.trimPassedNoteFlowPlaybackEvents(state, 1);
  assert.strictEqual(state.currentEventIndex, 1);
  assert.strictEqual(state.eventOffset, 3);
  assert.strictEqual(state.timeline.events.length, 3);
  const frame = playback.getNoteFlowPlaybackFrame(state, 4800);
  assert.strictEqual(frame.absoluteEventIndex, 4);
  assert.strictEqual(frame.event.expectedValues[0], 67);
});

process.stdout.write("Note Flow playback timing tests passed.\n");
