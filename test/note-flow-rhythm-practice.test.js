const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpile(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(loadedModule, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};
const practice = require("../src/model/NoteFlowRhythmPractice.js");
const generator = require("../src/model/NoteFlowGenerator.js");
const rhythm = require("../src/model/NoteFlowRhythmGenerator.js");
const clock = require("../src/model/NoteFlowRhythmTimeline.js");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

function timeline(targets, durationMs = 3000) {
  return { bpm: 60, durationMs, targets: targets.map(([at, values]) => ({
    startMs: at, expectedValues: values
  })) };
}

test("wait mode freezes at each note, not at a rest", () => {
  const source = timeline([[0, [60]], [2000, [62]]], 3000);
  let state = practice.createNoteFlowRhythmPractice(source);
  state = practice.startNoteFlowRhythmPractice(state);
  state = practice.advanceNoteFlowRhythmPractice(state, 250);
  assert.strictEqual(state.status, "waiting");
  assert.strictEqual(state.elapsedMs, 0);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 0, "touch");
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.correctCount, 1);
  state = practice.advanceNoteFlowRhythmPractice(state, 1500);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.elapsedMs, 1500);
  state = practice.advanceNoteFlowRhythmPractice(state, 1000);
  assert.strictEqual(state.status, "waiting");
  assert.strictEqual(state.elapsedMs, 2000);
});

test("wrong pitch stays at the line until corrected", () => {
  let state = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice(timeline([[0, [60]]]))
  );
  state = practice.advanceNoteFlowRhythmPractice(state, 1);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 2, "touch");
  assert.strictEqual(state.feedback, "wrong");
  assert.strictEqual(state.targetIndex, 0);
  assert.strictEqual(state.status, "waiting");
  state = practice.submitNoteFlowRhythmPracticeInput(state, 0, "touch");
  assert.strictEqual(state.correctCount, 1);
  assert.strictEqual(state.correctFirstTryCount, 0);
  assert.strictEqual(state.wrongCount, 1);
  assert.strictEqual(state.targetIndex, 1);
});

test("an early right pitch is red and passes instead of being requested twice", () => {
  let state = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice(timeline([[1000, [60]]]))
  );
  state = practice.advanceNoteFlowRhythmPractice(state, 200);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 0, "touch");
  assert.strictEqual(state.feedback, "wrong");
  assert.strictEqual(state.results[0], "early");
  assert.strictEqual(state.earlyAttemptCount, 1);
  assert.strictEqual(state.totalAbsoluteTimingOffsetMs, 800);
  assert.strictEqual(state.targetIndex, 1);
  state = practice.advanceNoteFlowRhythmPractice(state, 1200);
  assert.strictEqual(state.status, "running");
  assert.strictEqual(state.elapsedMs, 1400);
});

test("melody and chord rhythm share the more forgiving 50 BPM timing boundary", () => {
  let atBoundary = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice({
      bpm: 50, durationMs: 2400,
      targets: [{ startMs: 1200, expectedValues: [60] }]
    })
  );
  atBoundary = practice.advanceNoteFlowRhythmPractice(atBoundary, 900);
  atBoundary = practice.submitNoteFlowRhythmPracticeInput(atBoundary, 60, "midi");
  assert.strictEqual(atBoundary.results[0], "correct");

  let tooEarly = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice({
      bpm: 50, durationMs: 2400,
      targets: [{ startMs: 1200, expectedValues: [60] }]
    })
  );
  tooEarly = practice.advanceNoteFlowRhythmPractice(tooEarly, 899);
  tooEarly = practice.submitNoteFlowRhythmPracticeInput(tooEarly, 60, "midi");
  assert.strictEqual(tooEarly.results[0], "early");
});

test("continuous mode counts missed notes and advances through rests", () => {
  let state = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice(timeline([[0, [60]], [2000, [62]]]), {
      behavior: "continuous"
    })
  );
  state = practice.advanceNoteFlowRhythmPractice(state, 1500);
  assert.strictEqual(state.results[0], "missed");
  assert.strictEqual(state.targetIndex, 1);
  assert.strictEqual(state.missedCount, 1);
  state = practice.advanceNoteFlowRhythmPractice(state, 500);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 2, "touch");
  assert.strictEqual(state.results[1], "correct");
  state = practice.advanceNoteFlowRhythmPractice(state, 1000);
  assert.strictEqual(state.status, "complete");
});

test("continuous mode gives the next fast note priority at its own onset", () => {
  let state = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice({
      bpm: 120, durationMs: 500,
      targets: [
        { startMs: 0, expectedValues: [60] },
        { startMs: 83, expectedValues: [62] }
      ]
    }, { behavior: "continuous" })
  );
  state = practice.advanceNoteFlowRhythmPractice(state, 83);
  assert.strictEqual(state.results[0], "missed");
  assert.strictEqual(state.targetIndex, 1);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 62, "midi");
  assert.strictEqual(state.results[1], "correct");
  assert.strictEqual(state.wrongCount, 0);
});

test("continuous mode finishes when the final short note is missed", () => {
  let state = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice({
      bpm: 120, durationMs: 500,
      targets: [{ startMs: 417, expectedValues: [60] }]
    }, { behavior: "continuous" })
  );
  state = practice.advanceNoteFlowRhythmPractice(state, 500);
  assert.strictEqual(state.results[0], "missed");
  assert.strictEqual(state.missedCount, 1);
  assert.strictEqual(state.status, "complete");
});

test("all meters and both hand modes finish correctly in wait and continuous play", () => {
  for (const meter of ["3/4", "4/4", "6/8"]) {
    for (const handMode of ["single", "two"]) {
      const cycle = generator.generateNoteFlowCycle({
        handMode,
        clefs: ["bass", "treble"],
        secondaryNotesPerBlock: 8,
        seed: `practice-${meter}-${handMode}`
      });
      const score = rhythm.generateNoteFlowRhythmicScore(cycle, {
        meter,
        measureCount: 3,
        restChance: 0.35,
        allowedValues: {
          treble: ["quarter", "eighth", "sixteenth"],
          bass: ["quarter", "eighth"]
        }
      });
      const source = clock.createNoteFlowRhythmTimeline(score, { bpm: 120 });
      assert(source.targets.length > 0);
      source.targets.forEach(target => {
        const measure = source.measures[target.measureIndex];
        assert(target.startMs >= measure.startMs);
        assert(target.startMs < measure.endMs);
      });
      for (const behavior of ["wait", "continuous"]) {
        let state = practice.startNoteFlowRhythmPractice(
          practice.createNoteFlowRhythmPractice(source, {
            behavior,
            inputMode: "midi"
          })
        );
        source.targets.forEach((target, index) => {
          state.grip.heldValues.forEach(value => { state=practice.releaseNoteFlowRhythmPracticeInput(state,value); });
          state = practice.advanceNoteFlowRhythmPractice(
            state, target.startMs - state.elapsedMs
          );
          target.expectedValues.forEach(value => {
            state = practice.submitNoteFlowRhythmPracticeInput(state, value, "midi");
          });
          assert.strictEqual(state.results[index], "correct",
            `${meter} ${handMode} ${behavior} target ${index}`);
        });
        state = practice.advanceNoteFlowRhythmPractice(
          state, source.durationMs - state.elapsedMs
        );
        assert.strictEqual(state.status, "complete");
        assert.strictEqual(state.correctCount, source.targets.length);
        assert.strictEqual(state.missedCount, 0);
      }
      let skipped = practice.startNoteFlowRhythmPractice(
        practice.createNoteFlowRhythmPractice(source, { behavior: "continuous" })
      );
      skipped = practice.advanceNoteFlowRhythmPractice(skipped, source.durationMs);
      assert.strictEqual(skipped.status, "complete");
      assert.strictEqual(skipped.missedCount, source.targets.length);
      assert(source.events.length >= source.targets.length);
    }
  }
});

test("simultaneous MIDI notes are collected once with exact octaves", () => {
  let state = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice(timeline([[0, [60, 36]]]), {
      inputMode: "midi"
    })
  );
  state = practice.advanceNoteFlowRhythmPractice(state, 1);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 60);
  assert.deepStrictEqual(state.pendingValues, [60]);
  assert.strictEqual(state.targetIndex, 0);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 36);
  assert.strictEqual(state.results[0], "correct");
  assert.strictEqual(state.correctCount, 1);
  assert.deepStrictEqual(state.pendingValues, []);
});

test("pause and resume preserve the frozen logical clock", () => {
  let state = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice(timeline([[1000, [60]]]))
  );
  state = practice.advanceNoteFlowRhythmPractice(state, 500);
  state = practice.pauseNoteFlowRhythmPractice(state);
  assert.strictEqual(practice.advanceNoteFlowRhythmPractice(state, 2000).elapsedMs, 500);
  state = practice.resumeNoteFlowRhythmPractice(state);
  state = practice.advanceNoteFlowRhythmPractice(state, 500);
  assert.strictEqual(state.status, "waiting");
  assert.strictEqual(state.elapsedMs, 1000);
});

test("appending and trimming measures keeps cumulative progress and pending time", () => {
  const target = (startMs, startTick, value) => ({
    startMs, startTick, expectedValues: [value]
  });
  const first = {
    bpm: 60, durationMs: 4000,
    measures: [{ endMs: 2000, endTick: 192 }, { endMs: 4000, endTick: 384 }],
    targets: [target(0, 0, 60), target(2000, 192, 62)]
  };
  const appended = {
    bpm: 60, durationMs: 6000,
    measures: first.measures.concat([{ endMs: 6000, endTick: 576 }]),
    targets: first.targets.concat([target(4000, 384, 64)])
  };
  let state = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice(first)
  );
  state = practice.advanceNoteFlowRhythmPractice(state, 1);
  state = practice.submitNoteFlowRhythmPracticeInput(state, 0, "touch");
  state = practice.advanceNoteFlowRhythmPractice(state, 2000);
  state = practice.rebaseNoteFlowRhythmPractice(state, appended);
  assert.strictEqual(state.targetIndex, 1);
  assert.deepStrictEqual(state.results, ["correct", null, null]);
  const trimmed = {
    bpm: 60, durationMs: 4000,
    measures: [{ endMs: 2000, endTick: 192 }, { endMs: 4000, endTick: 384 }],
    targets: [target(0, 0, 62), target(2000, 192, 64)]
  };
  state = practice.rebaseNoteFlowRhythmPractice(state, trimmed, 2000);
  assert.strictEqual(state.elapsedMs, 0);
  assert.strictEqual(state.targetIndex, 0);
  assert.deepStrictEqual(state.results, [null, null]);
  assert.strictEqual(state.correctCount, 1);
  assert.strictEqual(state.status, "waiting");
});

test("long rounds append new rhythmic cycles and discard old visible measures", () => {
  const cycle = generator.generateNoteFlowCycle({
    handMode: "single", clefs: ["treble"], seed: "long-rhythm-round"
  });
  const options = {
    meter: "3/4", measureCount: 16,
    allowedValues: { treble: ["quarter"] }
  };
  let score = rhythm.generateNoteFlowRhythmicScore(cycle, options);
  let source = clock.createNoteFlowRhythmTimeline(score, { bpm: 120 });
  let state = practice.startNoteFlowRhythmPractice(
    practice.createNoteFlowRhythmPractice(source, { behavior: "continuous" })
  );
  state = practice.advanceNoteFlowRhythmPractice(state,
    source.measures[14].endMs);
  const nextCycle = generator.generateNoteFlowCycle(cycle.config, 1, cycle.nextState);
  const next = rhythm.generateNoteFlowRhythmicScore(nextCycle, options);
  score = Object.assign({}, score, {
    measures: score.measures.concat(next.measures)
  });
  source = clock.createNoteFlowRhythmTimeline(score, { bpm: 120 });
  state = practice.rebaseNoteFlowRhythmPractice(state, source);
  assert.strictEqual(source.measures.length, 32);
  assert.strictEqual(state.results.length, source.targets.length);
  assert.strictEqual(state.missedCount, 45);
  state = practice.advanceNoteFlowRhythmPractice(state,
    source.measures[25].endMs - state.elapsedMs);
  const beforeTrim = state.missedCount;
  const shiftMs = source.measures[15].endMs;
  score = Object.assign({}, score, { measures: score.measures.slice(16) });
  source = clock.createNoteFlowRhythmTimeline(score, { bpm: 120 });
  state = practice.rebaseNoteFlowRhythmPractice(state, source, shiftMs);
  assert.strictEqual(source.measures.length, 16);
  assert.strictEqual(state.missedCount, beforeTrim);
  assert.strictEqual(state.results.length, source.targets.length);
  assert.strictEqual(state.targetIndex, 30);
});

test("trimming preserves the onset of a partially collected two-hand input", () => {
  const target = (startMs, startTick, values) => ({
    startMs, startTick, expectedValues: values
  });
  const original = {
    bpm: 60, durationMs: 8000,
    measures: [{ endMs: 4000, endTick: 384 }, { endMs: 8000, endTick: 768 }],
    targets: [target(0, 0, [60]), target(5000, 480, [62, 38])]
  };
  const trimmed = {
    bpm: 60, durationMs: 4000,
    measures: [{ endMs: 4000, endTick: 384 }],
    targets: [target(1000, 96, [62, 38])]
  };
  for (const behavior of ["wait", "continuous"]) {
    for (const inputMode of ["touch", "midi"]) {
      let state = practice.startNoteFlowRhythmPractice(
        practice.createNoteFlowRhythmPractice(original, { behavior, inputMode })
      );
      state = practice.submitNoteFlowRhythmPracticeInput(state, 60);
      state = practice.advanceNoteFlowRhythmPractice(state, 5000);
      state = practice.submitNoteFlowRhythmPracticeInput(state, 62);
      assert.strictEqual(state.pendingAtMs, 5000);
      const appended = practice.rebaseNoteFlowRhythmPractice(state, original);
      assert.strictEqual(appended.pendingAtMs, 5000);

      state = practice.rebaseNoteFlowRhythmPractice(appended, trimmed, 4000);
      assert.strictEqual(state.elapsedMs, 1000);
      assert.strictEqual(state.pendingAtMs, 1000);
      assert.deepStrictEqual(state.pendingValues, [62]);
      state = practice.submitNoteFlowRhythmPracticeInput(state, 38);
      assert.deepStrictEqual(state.results, ["correct"]);
      assert.strictEqual(state.correctCount, 2);
      assert.strictEqual(state.wrongCount, 0);
      assert.strictEqual(state.totalAbsoluteTimingOffsetMs, 0);
      assert.strictEqual(state.pendingAtMs, null);
    }
  }
});
