const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(loadedModule, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { generateNoteFlowChordRhythmicScore } = require("../src/model/NoteFlowChordRhythm");
const { appendNoteFlowChordRhythmicScore, dropNoteFlowChordRhythmicMeasures } = require("../src/model/NoteFlowChordRhythm");
const chordPractice = require("../src/model/NoteFlowChordRhythmPractice");
Module._extensions[".js"] = originalLoader;

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

const plan = createNoteFlowChordPlan({
  tonalityMode: "circle", selectedKey: "C-major", chordSize: 3,
  bassNote: true, bpm: 60, seed: 17
});
const score = generateNoteFlowChordRhythmicScore(plan, {
  meter: "4/4", allowedValues: ["quarter"], restChance: 1
});
const first = score.targets[0].expectedValues;

function complete(state, values, now) {
  // The synthetic player releases the preceding completed chord before its next attack.
  if (!state.practice.pendingValues.length) state.practice.grip.heldValues.forEach(value => {
    state=chordPractice.releaseNoteFlowChordRhythmInput(state,value);
  });
  return values.reduce((current, value, index) => (
    chordPractice.submitNoteFlowChordRhythmInput(current, value, now + index * 20)
  ), state);
}

test("timeline preserves chord onsets, rests and exact MIDI pitches", () => {
  const timeline = chordPractice.createNoteFlowChordRhythmTimeline(score);
  assert.strictEqual(timeline.targets.length, score.targets.length);
  assert.strictEqual(timeline.targets[0].startMs, 0);
  assert.deepStrictEqual(timeline.targets[0].expectedValues, first);
  assert(timeline.events.some(event => event.kind === "rest"));
  assert(timeline.targets[1].startMs > timeline.targets[0].startMs);
});

test("stream continuation keeps exact onset times and bounded measure rebasing", () => {
  const next = generateNoteFlowChordRhythmicScore(plan, {
    meter: "4/4", allowedValues: ["quarter"], restChance: 1, seed: 88
  });
  const appended = appendNoteFlowChordRhythmicScore(score, next);
  assert.strictEqual(appended.targets[score.targets.length].startMs, score.durationMs);
  assert.strictEqual(appended.measures[score.measures.length].index, score.measures.length);
  let state = chordPractice.startNoteFlowChordRhythmPractice(
    chordPractice.createNoteFlowChordRhythmPractice(score, { behavior: "continuous" })
  );
  state = chordPractice.advanceNoteFlowChordRhythmPractice(state,
    score.durationMs - 1, score.durationMs - 1);
  state = chordPractice.rebaseNoteFlowChordRhythmPractice(state, appended);
  assert.strictEqual(state.practice.status, "running");
  assert.strictEqual(state.practice.timeline.targets.length, appended.targets.length);
  state = chordPractice.advanceNoteFlowChordRhythmPractice(state, 1, score.durationMs);
  const removeCount = score.measures.length;
  const retained = dropNoteFlowChordRhythmicMeasures(appended, removeCount);
  state = chordPractice.rebaseNoteFlowChordRhythmPractice(state, retained, score.durationMs);
  assert.strictEqual(state.practice.elapsedMs, 0);
  assert.strictEqual(state.practice.targetIndex, 0);
  assert.deepStrictEqual(state.practice.timeline.targets[0].expectedValues,
    next.targets[0].expectedValues);
});

test("trimming a partial MIDI chord preserves timing and its wall-clock expiry", () => {
  for (const behavior of ["wait", "continuous"]) {
    let state = chordPractice.startNoteFlowChordRhythmPractice(
      chordPractice.createNoteFlowChordRhythmPractice(score, { behavior })
    );
    const target = score.targets[2];
    const wallNow = 100000 + target.startMs;
    score.targets.slice(0, 2).forEach(previous => {
      state = chordPractice.advanceNoteFlowChordRhythmPractice(
        state, previous.startMs - state.practice.elapsedMs, 100000 + previous.startMs
      );
      state = complete(state, previous.expectedValues, 100000 + previous.startMs);
    });
    state = chordPractice.advanceNoteFlowChordRhythmPractice(
      state, target.startMs - state.practice.elapsedMs, wallNow
    );
    state = chordPractice.submitNoteFlowChordRhythmInput(state, target.expectedValues[0], wallNow);
    const retained = dropNoteFlowChordRhythmicMeasures(score, 1);
    const shiftMs = chordPractice.createNoteFlowChordRhythmTimeline(score).measures[0].endMs;
    state = chordPractice.rebaseNoteFlowChordRhythmPractice(state, retained, shiftMs);
    assert.strictEqual(state.practice.pendingAtMs, target.startMs - shiftMs);
    assert.strictEqual(state.pendingSinceMs, wallNow);
    assert.deepStrictEqual(state.practice.pendingValues, [target.expectedValues[0]]);

    if (behavior === "continuous") {
      const expired = chordPractice.advanceNoteFlowChordRhythmPractice(state, 0, wallNow + 650);
      assert.strictEqual(expired.practice.wrongCount, 1);
      assert.deepStrictEqual(expired.practice.pendingValues, []);
    }
    state = complete(state, target.expectedValues.slice(1), wallNow + 20);
    assert.strictEqual(state.practice.results[1], "correct");
    assert.strictEqual(state.practice.correctCount, 3);
    assert.strictEqual(state.practice.wrongCount, 0);
    assert.strictEqual(state.practice.totalAbsoluteTimingOffsetMs, 0);
    assert.strictEqual(state.pendingSinceMs, null);
  }
});

test("wait mode accepts simultaneous chord pitches in any MIDI order", () => {
  let state = chordPractice.startNoteFlowChordRhythmPractice(
    chordPractice.createNoteFlowChordRhythmPractice(score)
  );
  state = chordPractice.advanceNoteFlowChordRhythmPractice(state, 0, 1000);
  assert.strictEqual(state.practice.status, "waiting");
  state = chordPractice.submitNoteFlowChordRhythmInput(state, 127, 1010);
  assert.strictEqual(state.practice.wrongCount, 1);
  assert.strictEqual(state.practice.targetIndex, 0);
  const order = first.slice().reverse();
  state = chordPractice.submitNoteFlowChordRhythmInput(state, order[0], 1020);
  state = chordPractice.releaseNoteFlowChordRhythmInput(state, 127);
  state = chordPractice.submitNoteFlowChordRhythmInput(state, 127, 1025);
  assert.strictEqual(state.practice.wrongCount, 2);
  assert.deepStrictEqual(state.practice.pendingValues, [order[0]]);
  const duplicate = chordPractice.submitNoteFlowChordRhythmInput(state, order[0], 1030);
  assert.strictEqual(duplicate.practice.wrongCount, 2);
  assert.strictEqual(duplicate.practice.pendingValues.length, 1);
  state = complete(duplicate, order.slice(1), 1040);
  assert.strictEqual(state.practice.correctCount, 1);
  assert.strictEqual(state.practice.correctFirstTryCount, 0);
  assert.strictEqual(state.practice.targetIndex, 1);
});

test("wait mode keeps correct notes marked beyond 650 ms", () => {
  let state = chordPractice.startNoteFlowChordRhythmPractice(
    chordPractice.createNoteFlowChordRhythmPractice(score)
  );
  state = chordPractice.advanceNoteFlowChordRhythmPractice(state, 0, 2000);
  state = chordPractice.submitNoteFlowChordRhythmInput(state, first[0], 2000);
  state = chordPractice.advanceNoteFlowChordRhythmPractice(state, 0, 2649);
  assert.strictEqual(state.practice.wrongCount, 0);
  state = chordPractice.advanceNoteFlowChordRhythmPractice(state, 0, 2650);
  assert.strictEqual(state.practice.wrongCount, 0);
  assert.deepStrictEqual(state.practice.pendingValues, [first[0]]);
  assert.strictEqual(state.practice.targetIndex, 0);
  state = complete(state, first.slice(1), 2700);
  assert.strictEqual(state.practice.correctCount, 1);
});

test("continuous mode still expires a partial chord after 650 ms", () => {
  let state = chordPractice.startNoteFlowChordRhythmPractice(
    chordPractice.createNoteFlowChordRhythmPractice(score, { behavior: "continuous" })
  );
  state = chordPractice.submitNoteFlowChordRhythmInput(state, first[0], 2000);
  state = chordPractice.advanceNoteFlowChordRhythmPractice(state, 0, 2650);
  assert.strictEqual(state.practice.wrongCount, 1);
  assert.deepStrictEqual(state.practice.pendingValues, []);
});

test("early complete chord is marked early, then the clock reaches the next onset", () => {
  let state = chordPractice.startNoteFlowChordRhythmPractice(
    chordPractice.createNoteFlowChordRhythmPractice(score)
  );
  state = chordPractice.advanceNoteFlowChordRhythmPractice(state, 0, 0);
  state = complete(state, first, 10);
  const second = score.targets[1];
  assert(second.startMs > 300);
  state = chordPractice.advanceNoteFlowChordRhythmPractice(state, 100, 200);
  state = complete(state, second.expectedValues, 220);
  assert.strictEqual(state.practice.results[1], "early");
  assert.strictEqual(state.practice.targetIndex, 2);
  assert.strictEqual(state.practice.earlyAttemptCount, 1);
});

test("continuous mode skips a missed chord and does not demand input at rests", () => {
  let state = chordPractice.startNoteFlowChordRhythmPractice(
    chordPractice.createNoteFlowChordRhythmPractice(score, { behavior: "continuous" })
  );
  state = chordPractice.advanceNoteFlowChordRhythmPractice(
    state, score.targets[1].startMs, score.targets[1].startMs
  );
  assert.strictEqual(state.practice.results[0], "missed");
  assert.strictEqual(state.practice.targetIndex, 1);
  state = complete(state, score.targets[1].expectedValues, score.targets[1].startMs);
  assert.strictEqual(state.practice.results[1], "correct");
});

test("pause clears a partial chord and resume keeps the target", () => {
  let state = chordPractice.startNoteFlowChordRhythmPractice(
    chordPractice.createNoteFlowChordRhythmPractice(score)
  );
  state = chordPractice.advanceNoteFlowChordRhythmPractice(state, 0, 1000);
  state = chordPractice.submitNoteFlowChordRhythmInput(state, first[0], 1010);
  state = chordPractice.pauseNoteFlowChordRhythmPractice(state);
  assert.strictEqual(state.practice.status, "paused");
  assert.deepStrictEqual(state.practice.pendingValues, []);
  state = chordPractice.resumeNoteFlowChordRhythmPractice(state);
  state = complete(state, first, 2000);
  assert.strictEqual(state.practice.correctCount, 1);
});

test("complete MIDI rounds finish in 3/4, 4/4 and 6/8 with either chord size", () => {
  ["3/4", "4/4", "6/8"].forEach(meter => [3, 4].forEach(chordSize => {
    const source = createNoteFlowChordPlan({
      tonalityMode: "circle", selectedKey: "C-major", chordSize,
      bassNote: chordSize === 4, bpm: 60, seed: 61
    });
    const round = generateNoteFlowChordRhythmicScore(source, {
      meter,
      allowedValues: meter === "6/8" ? ["dotted-quarter"] : ["quarter"],
      restChance: 0.3
    });
    let state = chordPractice.startNoteFlowChordRhythmPractice(
      chordPractice.createNoteFlowChordRhythmPractice(round, {
        behavior: "continuous"
      })
    );
    round.targets.forEach(target => {
      state = chordPractice.advanceNoteFlowChordRhythmPractice(
        state, target.startMs - state.practice.elapsedMs, target.startMs
      );
      state = complete(state, target.expectedValues, target.startMs);
    });
    state = chordPractice.advanceNoteFlowChordRhythmPractice(
      state, round.durationMs - state.practice.elapsedMs, round.durationMs
    );
    assert.strictEqual(state.practice.status, "complete");
    assert.strictEqual(state.practice.correctCount, round.targets.length);
    assert.strictEqual(state.practice.missedCount, 0);
  }));
});

console.log("Chord rhythm MIDI practice: OK");
