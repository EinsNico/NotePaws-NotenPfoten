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

function training(behavior = "wait", meter = "3/4", chordSize = 3) {
  const plan = createNoteFlowChordPlan({
    tonalityMode: "circle", selectedKey: "C-major", chordSize,
    bassNote: true, bpm: 60, behavior, rhythmMeter: meter,
    rhythmValues: meter === "6/8" ? ["dotted-quarter"] : ["quarter"],
    gameLength: 0, seed: 71
  });
  return new Training({ propsData: { plan } });
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
