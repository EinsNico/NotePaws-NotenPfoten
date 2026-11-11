const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const babel = require("babel-core");
const Vue = require("vue");
global.regeneratorRuntime = require("babel-runtime/regenerator");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalJsLoader = Module._extensions[".js"];
const originalVueLoader = Module._extensions[".vue"];
Module._extensions[".js"] = function transpileProjectModule(loadedModule, filename) {
  if (filename.indexOf(sourceRoot) !== 0) return originalJsLoader(loadedModule, filename);
  const transformed = babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  });
  return loadedModule._compile(transformed.code, filename);
};
Module._extensions[".vue"] = function stubVisualComponent(loadedModule) {
  loadedModule.exports = { default: { name: "VisualStub" } };
};

const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { appendNoteFlowChordRhythmicScore } = require("../src/model/NoteFlowChordRhythm");
const { startNoteFlowChordRhythmPractice, advanceNoteFlowChordRhythmPractice,
  rebaseNoteFlowChordRhythmPractice } = require("../src/model/NoteFlowChordRhythmPractice");
const filename = path.resolve(__dirname, "../src/components/NoteFlowChordTraining.vue");
const script = fs.readFileSync(filename, "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
const loadedModule = new Module(filename, module);
loadedModule.filename = filename;
loadedModule.paths = Module._nodeModulePaths(path.dirname(filename));
loadedModule._compile(babel.transform(script, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code, filename);
const Training = Vue.extend(loadedModule.exports.default);
// This fixture exercises immediate playback; visual preparation has dedicated lifecycle tests.
const Options = require("../src/model/Options").default;
Options.preparationSeconds = 0;
Module._extensions[".js"] = originalJsLoader;
if (originalVueLoader) Module._extensions[".vue"] = originalVueLoader;
else delete Module._extensions[".vue"];

function test(name, body) {
  body();
  process.stdout.write(`\u2713 ${name}\n`);
}

function training(behavior = "wait", meter = "3/4", chordSize = 3, chordPercent, chordExtensions) {
  const plan = createNoteFlowChordPlan({
    tonalityMode: "circle", selectedKey: "C-major", chordSize,
    bassNote: true, bpm: 60, behavior, rhythmMeter: meter,
    rhythmValues: meter === "6/8" ? ["dotted-quarter"] : ["quarter"],
    gameLength: 0, seed: 71, chordExtensions
  });
  if (chordPercent !== undefined) plan.chordPercent = chordPercent;
  return new Training({ propsData: { plan, mixed: chordPercent !== undefined } });
}

test("live training uses selected meter and MIDI pitches from the displayed score", () => {
  ["3/4", "4/4", "6/8"].forEach(meter => {
    const view = training("wait", meter);
    assert.strictEqual(view.rhythmScore.meter.signature, meter);
    assert.strictEqual(view.practice.timeline.targets[0].startTick,
      view.rhythmScore.targets[0].globalStartTick);
    assert.deepStrictEqual(view.practice.timeline.targets[0].expectedValues,
      view.rhythmScore.targets[0].expectedValues);
    assert.strictEqual(view.roundResult, null);
  });
});

test("live training collects three- and four-note chords through its MIDI handler", () => {
  const originalPerformance = global.performance;
  const originalFrame = global.requestAnimationFrame;
  let now = 1000;
  global.performance = { now: () => now };
  global.requestAnimationFrame = () => 1;
  try {
    [3, 4].forEach(chordSize => {
      const view = training("wait", "6/8", chordSize);
      const expected = view.rhythmScore.targets[0].expectedValues;
      view.rhythmState = startNoteFlowChordRhythmPractice(view.rhythmState);
      view.lastFrameAt = now;
      view.midiConnected = true;
      expected.slice().reverse().forEach(value => {
        now += 20;
        view.pressMidi(value);
      });
      assert.strictEqual(view.practice.correctCount, 1);
      assert.strictEqual(view.practice.targetIndex, 1);
      assert.strictEqual(view.roundScore.correct, 1);
    });
  } finally {
    global.performance = originalPerformance;
    global.requestAnimationFrame = originalFrame;
  }
});

test("wait training keeps recognized MIDI notes visible after a wrong key", () => {
  const originalPerformance = global.performance;
  const originalFrame = global.requestAnimationFrame;
  global.performance = { now: () => 1000 };
  global.requestAnimationFrame = () => 1;
  try {
    const view = training();
    const expected = view.rhythmScore.targets[0].expectedValues;
    view.rhythmState = startNoteFlowChordRhythmPractice(view.rhythmState);
    view.lastFrameAt = 1000;
    view.midiConnected = true;
    view.pressMidi(expected[0]);
    assert.deepStrictEqual(view.practice.pendingValues, [expected[0]]);
    view.pressMidi(127);
    assert.deepStrictEqual(view.practice.pendingValues, [expected[0]]);
    assert.strictEqual(view.practice.wrongCount, 1);
  } finally {
    global.performance = originalPerformance;
    global.requestAnimationFrame = originalFrame;
  }
});

test("mixed training accepts a single MIDI note followed by a complete chord", () => {
  const originalPerformance = global.performance;
  const originalFrame = global.requestAnimationFrame;
  let now = 1000;
  global.performance = { now: () => now };
  global.requestAnimationFrame = () => 1;
  const view = training("wait", "4/4", 3, 25);
  try {
    const [single, chord] = view.rhythmScore.targets;
    assert.strictEqual(single.expectedValues.length, 1);
    assert(chord.expectedValues.length > 1);
    view.rhythmState = startNoteFlowChordRhythmPractice(view.rhythmState);
    view.lastFrameAt = now;
    view.midiConnected = true;
    view.pressMidi(single.expectedValues[0]);
    assert.strictEqual(view.practice.correctCount, 1);
    view.releaseMidi(single.expectedValues[0]);
    now += chord.startMs;
    chord.expectedValues.forEach((value, index) => {
      view.pressMidi(value);
      assert.strictEqual(view.practice.correctCount, index === chord.expectedValues.length - 1 ? 2 : 1);
    });
    assert.strictEqual(view.practice.targetIndex, 2);
  } finally {
    global.performance = originalPerformance;
    global.requestAnimationFrame = originalFrame;
  }
});

test("live MIDI training accepts sus and dominant seventh chords and their resolutions", () => {
  const originalPerformance = global.performance;
  const originalFrame = global.requestAnimationFrame;
  let now = 1000;
  global.performance = { now: () => now };
  global.requestAnimationFrame = () => 1;
  try {
    for (const type of ["sus4", "dominant7"]) {
      now = 1000;
      const view = training("wait", "4/4", 3, 50, { [type]: { enabled: true, weight: 100 } });
      const targets = view.rhythmScore.targets;
      const index = targets.findIndex(target => target.chord.quality === type);
      assert(index >= 0, type);
      const resolutionDegree = type === "dominant7" ? 1 : targets[index].chord.scaleDegree;
      assert.strictEqual(targets[index + 1].chord.scaleDegree, resolutionDegree);
      view.rhythmState = startNoteFlowChordRhythmPractice(view.rhythmState);
      view.lastFrameAt = now;
      view.midiConnected = true;
      targets.slice(0, index + 2).forEach(target => {
        now = 1000 + target.startMs;
        target.expectedValues.forEach(value => view.pressMidi(value));
        target.expectedValues.forEach(value => view.releaseMidi(value));
      });
      assert.strictEqual(view.practice.correctCount, index + 2);
      assert.strictEqual(view.practice.wrongCount, 0);
    }
  } finally {
    global.performance = originalPerformance;
    global.requestAnimationFrame = originalFrame;
  }
});

test("a mixed training round keeps its ratio when another cycle is appended", () => {
  const view = training("continuous", "3/4", 3, 37);
  const initial = view.rhythmScore;
  view.rhythmState = startNoteFlowChordRhythmPractice(view.rhythmState);
  view.rhythmState = advanceNoteFlowChordRhythmPractice(
    view.rhythmState, initial.durationMs - 1, initial.durationMs - 1
  );
  view.ensureScoreAhead();
  const targets = view.rhythmScore.targets;
  assert(targets.length > initial.targets.length);
  assert.strictEqual(targets.filter(event => event.expectedValues.length > 1).length,
    Math.round(targets.length * 0.37));
});

test("live training extends and trims long streams without losing totals", () => {
  const view = training("continuous");
  const seed = view.rhythmScore;
  view.rhythmState = startNoteFlowChordRhythmPractice(view.rhythmState);
  const measureMs = view.practice.timeline.measures[0].endMs;
  view.rhythmState = advanceNoteFlowChordRhythmPractice(view.rhythmState,
    seed.durationMs - measureMs, seed.durationMs - measureMs);
  view.ensureScoreAhead();
  assert(view.rhythmScore.measures.length > seed.measures.length);
  for (let cycle = 0; cycle < 20; cycle += 1) {
    while (view.rhythmScore.measures.length <= 16) {
      view.rhythmScore = appendNoteFlowChordRhythmicScore(view.rhythmScore, seed);
      view.rhythmState = rebaseNoteFlowChordRhythmPractice(view.rhythmState,
        view.rhythmScore);
    }
    const advanceMs = view.practice.timeline.measures[5].endMs
      - view.practice.elapsedMs;
    view.rhythmState = advanceNoteFlowChordRhythmPractice(view.rhythmState,
      advanceMs, 100000 + cycle * 10000);
    const before = view.roundScore;
    const oldElapsed = view.practice.elapsedMs;
    view.trimScore();
    assert(view.practice.elapsedMs < oldElapsed);
    assert.strictEqual(view.roundScore.missed, before.missed);
    assert.strictEqual(view.practice.timeline.targets[0].startTick,
      view.rhythmScore.targets[0].globalStartTick);
  }
  assert(view.targetOffset > 100);
});

test("play, pause and resume keep the score and round timer synchronized", () => {
  const view = training();
  view.midiConnected = true;
  const originalPerformance = global.performance;
  const originalFrame = global.requestAnimationFrame;
  const originalCancel = global.cancelAnimationFrame;
  let now = 5000;
  global.performance = { now: () => now };
  global.requestAnimationFrame = () => 1;
  global.cancelAnimationFrame = () => {};
  try {
    view.playMotion();
    assert.strictEqual(view.practice.status, "running");
    assert.strictEqual(view.roundTimer.status, "running");
    now += 200;
    view.updateMotion();
    assert.strictEqual(view.practice.status, "waiting");
    view.pauseMotion();
    assert.strictEqual(view.practice.status, "paused");
    assert.strictEqual(view.roundTimer.status, "paused");
    const elapsed = view.practice.elapsedMs;
    now += 30000;
    view.playMotion();
    assert.strictEqual(view.practice.status, "waiting");
    assert.strictEqual(view.roundTimer.status, "running");
    assert.strictEqual(view.practice.elapsedMs, elapsed);
  } finally {
    view.stopTimerTicker();
    global.performance = originalPerformance;
    global.requestAnimationFrame = originalFrame;
    global.cancelAnimationFrame = originalCancel;
  }
});

test("round result retains the played meter and note values", () => {
  const view = training("wait", "6/8", 4);
  view.saveRoundResult = () => {};
  view.endRound();
  assert.strictEqual(view.roundResult.exerciseType, "chord");
  assert.strictEqual(view.roundResult.chord.rhythmMeter, "6/8");
  assert.deepStrictEqual(view.roundResult.chord.rhythmValues,
    ["dotted-quarter"]);
  assert.deepStrictEqual(view.roundResult.chord.rhythmValues,
    view.plan.options.rhythmValues);
});

console.log("Chord rhythm live integration: OK");
