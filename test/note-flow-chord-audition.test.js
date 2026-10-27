const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = function transpileProjectModule(module, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalLoader(module, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false,
    presets: [["env", { modules: "commonjs" }]]
  });
  return module._compile(transformed.code, filename);
};
const { createNoteFlowChordAudition } = require("../src/model/NoteFlowChordAudition");
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { generateNoteFlowChordRhythmicScore } = require("../src/model/NoteFlowChordRhythm");
Module._extensions[".js"] = originalLoader;

const calls = [];
const timers = new Map();
let nextTimer = 1;
const player = {
  play(value, volume) { calls.push(["play", value, volume]); },
  stopAll() { calls.push(["stop"]); }
};
const plan = { blocks: [
  { chords: [{ id: "one", bassValue: 36, values: [48, 52, 55] }] },
  { chords: [{ id: "two", bassValue: null, values: [50, 53, 57] }] }
] };
const audition = createNoteFlowChordAudition(plan, {
  player,
  appVolume: 35,
  setTimeoutFn(handler, delay) {
    assert.strictEqual(delay, 900);
    const id = nextTimer++;
    timers.set(id, handler);
    return id;
  },
  clearTimeoutFn(id) { timers.delete(id); },
  onStep(chord, index, total) { calls.push(["step", chord.id, index, total]); },
  onStop() { calls.push(["ended"]); }
});

assert.strictEqual(audition.start(), true);
assert.strictEqual(audition.isPlaying(), true);
assert.deepStrictEqual(calls.filter(call => call[0] === "play"), [
  ["play", 36, 35], ["play", 48, 35], ["play", 52, 35], ["play", 55, 35]
]);
assert.deepStrictEqual(calls.find(call => call[0] === "step"), ["step", "one", 1, 2]);

const firstTimer = timers.keys().next().value;
const advance = timers.get(firstTimer);
timers.delete(firstTimer);
advance();
assert.deepStrictEqual(calls.filter(call => call[0] === "play").slice(-3), [
  ["play", 50, 35], ["play", 53, 35], ["play", 57, 35]
]);
assert.deepStrictEqual(calls.filter(call => call[0] === "step").slice(-1)[0], ["step", "two", 2, 2]);

audition.stop();
assert.strictEqual(audition.isPlaying(), false);
assert.strictEqual(timers.size, 0);
assert.strictEqual(calls[calls.length - 1][0], "ended");
assert.strictEqual(createNoteFlowChordAudition({ blocks: [] }, { player }).start(), false);

function timedAudition(score) {
  const calls = [], timers = new Map();
  let time = 0, nextId = 1;
  const audition = createNoteFlowChordAudition(plan, {
    rhythmScore: score, appVolume: 35,
    player: {
      play(value, volume) { calls.push(["play", time, value, volume]); },
      stopAll() { calls.push(["stop", time]); }
    },
    nowFn: () => time,
    setTimeoutFn(handler, delay) {
      assert(Number.isFinite(delay) && delay >= 0);
      const id = nextId++;
      timers.set(id, { handler, delay, due: time + delay });
      return id;
    },
    clearTimeoutFn(id) { timers.delete(id); },
    onStep(chord, index, total) { calls.push(["step", time, chord.id, index, total]); },
    onRest() { calls.push(["rest", time]); },
    onStop() { calls.push(["ended", time]); }
  });
  return { audition, calls, timers, advance(lateness = 0) {
    const id = timers.keys().next().value;
    assert(id !== undefined);
    const pending = timers.get(id);
    timers.delete(id);
    time = pending.due + lateness;
    pending.handler();
  } };
}

const timedScore = { measures: [{ events: [
  { kind: "note", chord: plan.blocks[0].chords[0], startMs: 0, endMs: 1000 },
  { kind: "rest", chord: null, startMs: 1000, endMs: 1250 },
  { kind: "note", chord: plan.blocks[1].chords[0], startMs: 1250, endMs: 1500 }
] }] };
const scoreBefore = JSON.stringify(timedScore);
const timed = timedAudition(timedScore);
assert.strictEqual(timed.audition.start(), true);
assert.strictEqual(timed.timers.values().next().value.delay, 1000);
timed.advance();
assert.deepStrictEqual(timed.calls.slice(-2), [["stop", 1000], ["rest", 1000]]);
assert.strictEqual(timed.timers.values().next().value.delay, 250);
timed.advance();
assert.deepStrictEqual(timed.calls.filter(call => call[0] === "step"), [
  ["step", 0, "one", 1, 2], ["step", 1250, "two", 2, 2]
]);
timed.advance();
assert.strictEqual(timed.audition.isPlaying(), false);
assert.strictEqual(timed.timers.size, 0);
assert.deepStrictEqual(timed.calls.slice(-2), [["stop", 1500], ["ended", 1500]]);
assert.strictEqual(JSON.stringify(timedScore), scoreBefore);

// A late browser timer must shorten the next wait instead of adding drift.
const delayed = timedAudition(timedScore);
delayed.audition.start();
delayed.advance(80);
assert.strictEqual(delayed.timers.values().next().value.delay, 170);
delayed.advance();
assert.deepStrictEqual(delayed.calls.filter(call => call[0] === "step").slice(-1)[0], ["step", 1250, "two", 2, 2]);
const cancelled = delayed.timers.values().next().value.handler;
delayed.audition.stop();
assert.strictEqual(delayed.timers.size, 0);
delayed.audition.start();
const restartedCalls = delayed.calls.length;
cancelled();
assert.strictEqual(delayed.calls.length, restartedCalls, "a cancelled callback cannot advance a restarted audition");
delayed.audition.stop();

const overdue = timedAudition(timedScore);
overdue.audition.start();
overdue.advance(600);
assert.strictEqual(overdue.audition.isPlaying(), false);
assert.strictEqual(overdue.calls.filter(call => call[0] === "step").length, 1,
  "resuming after the score end never plays expired chord attacks");
assert.strictEqual(overdue.timers.size, 0);

const separated = timedAudition({ measures: [{ events: [
  { kind: "note", chord: plan.blocks[0].chords[0], startMs: 200, endMs: 400 },
  { kind: "note", chord: plan.blocks[1].chords[0], startMs: 600, endMs: 800 }
] }] });
separated.audition.start();
assert.strictEqual(separated.calls.filter(call => call[0] === "play").length, 0);
separated.advance();
assert.deepStrictEqual(separated.calls.filter(call => call[0] === "step")[0], ["step", 200, "one", 1, 2]);
separated.advance();
assert.deepStrictEqual(separated.calls.slice(-2), [["stop", 400], ["rest", 400]]);
separated.advance();
separated.advance();
assert.deepStrictEqual(separated.calls.slice(-1)[0], ["ended", 800]);

// Hear precisely the score created by the same rhythm generator as training.
for (const bpm of [60, 120]) for (const meter of ["3/4", "4/4", "6/8"]) {
  const generatedPlan = createNoteFlowChordPlan({ bpm, bassNote: true, chordSize: 4,
    tonalityMode: "circle", selectedKey: "G-major", seed: 927 });
  const score = generateNoteFlowChordRhythmicScore(generatedPlan, {
    meter, bpm, allowedValues: ["quarter", "eighth"], restChance: .2, seed: 927
  });
  const generated = timedAudition(score);
  generated.audition.start();
  let callbacks = 0;
  while (generated.audition.isPlaying()) {
    assert(++callbacks <= 512);
    generated.advance();
  }
  const actualSteps = generated.calls.filter(call => call[0] === "step");
  assert.deepStrictEqual(actualSteps.map(call => [call[1], call[2]]), score.targets.map(event => [event.startMs, event.chord.id]));
  assert.deepStrictEqual(generated.calls.slice(-1)[0], ["ended", score.durationMs]);
  assert.strictEqual(generated.timers.size, 0);
}
assert.strictEqual(timedAudition({ measures: [] }).audition.start(), false);
assert.strictEqual(timedAudition({ measures: [{ events: [
  { kind: "note", chord: plan.blocks[0].chords[0], startMs: 500, endMs: 250 }
] }] }).audition.start(), false);
console.log("Chord audition: OK");
