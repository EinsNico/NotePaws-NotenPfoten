const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const Vue = require("vue");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const rhythm = require("../src/model/NoteFlowChordRhythm");
const practice = require("../src/model/NoteFlowChordRhythmPractice");
const { createNoteFlowChordRhythmLayout } = require("../src/model/NoteFlowChordRhythmLayout");
const { getNoteFlowTonality } = require("../src/model/NoteFlowTonality");
const streamFilename = path.resolve(__dirname, "../src/components/NoteFlowChordRhythmStream.vue");
const streamModule = new Module(streamFilename, module);
streamModule.filename = streamFilename;
streamModule.paths = Module._nodeModulePaths(path.dirname(streamFilename));
streamModule._compile(babel.transform(fs.readFileSync(streamFilename, "utf8").match(/<script>([\s\S]*?)<\/script>/)[1], {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code, streamFilename);
const Stream = Vue.extend(streamModule.exports.default);
Module._extensions[".js"] = originalLoader;

function test(name, callback) {
  callback();
  process.stdout.write("✓ Chord stream spacing: " + name + "\n");
}
function fixture() {
  const plan = createNoteFlowChordPlan({ seed: "chord-density", bpm: 60 });
  const dense = rhythm.generateNoteFlowChordRhythmicScore(plan, { allowedValues: ["sixteenth"], bpm: 60 });
  dense.allowedValues = ["quarter", "sixteenth"];
  const sparse = rhythm.generateNoteFlowChordRhythmicScore(plan, { allowedValues: ["quarter"], bpm: 60 });
  return { plan, dense, sparse };
}
function layout(score, options = {}) {
  return createNoteFlowChordRhythmLayout(score, Object.assign({ measureCount: score.measures.length }, options));
}
function positions(view) {
  return view.layout.events.filter(event => event.kind === "note").map(event => ({
    values: event.parts.reduce((all, part) => all.concat((part.heads || []).map(head => head.value)), []),
    x: event.x + view.offsetX
  }));
}

test("trimming the last dense bars retains spacing without mutating or retaining source scores", () => {
  const { dense, sparse } = fixture();
  const appended = rhythm.appendNoteFlowChordRhythmicScore(dense, sparse);
  const original = JSON.stringify(appended);
  const before = layout(appended);
  const retained = rhythm.dropNoteFlowChordRhythmicMeasures(appended, dense.measures.length);
  const after = layout(retained);
  assert(before.pixelsPerQuarter > 76, "the fixture must exercise glyph-driven enlargement");
  assert.strictEqual(after.pixelsPerQuarter, before.pixelsPerQuarter);
  assert.strictEqual(retained.spacingScope, dense.spacingScope);
  assert.deepStrictEqual(Object.keys(retained.spacingScope), [], "only a small identity is retained, never past events");
  assert.strictEqual(JSON.stringify(appended), original);
  assert.strictEqual(layout(sparse).pixelsPerQuarter, 58, "a fresh round has no earlier spacing minimum");
  process.stdout.write("  Dense-window regression: " + before.pixelsPerQuarter + " → " + after.pixelsPerQuarter + " px/quarter\n");
});

test("a later dense extension can increase spacing once, and repeated trims never decrease it", () => {
  const { dense, sparse } = fixture();
  const initial = layout(sparse).pixelsPerQuarter;
  let score = rhythm.appendNoteFlowChordRhythmicScore(sparse, dense);
  const wide = layout(score).pixelsPerQuarter;
  assert(wide > initial);
  score = rhythm.appendNoteFlowChordRhythmicScore(score, sparse);
  layout(score);
  score = rhythm.dropNoteFlowChordRhythmicMeasures(score, sparse.measures.length + dense.measures.length);
  assert.strictEqual(layout(score).pixelsPerQuarter, wide);
  for (let index = 0; index < 10; index++) {
    score = rhythm.appendNoteFlowChordRhythmicScore(score, sparse);
    assert.strictEqual(layout(score).pixelsPerQuarter, wide);
    score = rhythm.dropNoteFlowChordRhythmicMeasures(score, sparse.measures.length);
    assert.strictEqual(layout(score).pixelsPerQuarter, wide);
  }
  assert(score.measures.length <= sparse.measures.length * 2);
});

test("spelling variants have independent minima and rendering never changes playback timing", () => {
  const { dense, sparse, plan } = fixture();
  const score = rhythm.appendNoteFlowChordRhythmicScore(dense, sparse);
  const before = JSON.stringify(practice.createNoteFlowChordRhythmTimeline(score));
  const variants = [{ preferSharp: true }, { preferSharp: false }, {
    tonality: getNoteFlowTonality(plan.keyId), displayKeySignature: true
  }];
  for (const options of variants) {
    const measured = layout(score, options).pixelsPerQuarter;
    const retained = rhythm.dropNoteFlowChordRhythmicMeasures(score, dense.measures.length);
    assert.strictEqual(layout(retained, options).pixelsPerQuarter, measured);
    const freshVariant = Object.assign({}, retained, { spacingScope: {} });
    assert(layout(freshVariant, options).pixelsPerQuarter <= measured);
  }
  assert.strictEqual(JSON.stringify(practice.createNoteFlowChordRhythmTimeline(score)), before);
});

test("actual wait and continuous stream screen coordinates survive trim while a chord is partially entered", () => {
  for (const behavior of ["wait", "continuous"]) {
    const { dense, sparse, plan } = fixture();
    const score = rhythm.appendNoteFlowChordRhythmicScore(dense, sparse);
    let state = practice.startNoteFlowChordRhythmPractice(practice.createNoteFlowChordRhythmPractice(score, { behavior }));
    for (const target of dense.targets) {
      state.practice.grip.heldValues.forEach(value => {state=practice.releaseNoteFlowChordRhythmInput(state,value);});
      state = practice.advanceNoteFlowChordRhythmPractice(state, target.startMs - state.practice.elapsedMs, 10000 + target.startMs);
      for (const value of target.expectedValues) {
        state = practice.submitNoteFlowChordRhythmInput(state, value, 10000 + target.startMs);
      }
    }
    state = practice.advanceNoteFlowChordRhythmPractice(state, dense.durationMs - state.practice.elapsedMs, 10000 + dense.durationMs);
    state.practice.grip.heldValues.forEach(value => {state=practice.releaseNoteFlowChordRhythmInput(state,value);});
    const target = state.practice.timeline.targets[state.practice.targetIndex];
    state = practice.submitNoteFlowChordRhythmInput(state, target.expectedValues[0], 10000 + dense.durationMs);
    const view = new Stream({ propsData: { score, elapsedMs: state.practice.elapsedMs,
      practiceState: state.practice, tonality: getNoteFlowTonality(plan.keyId) } });
    const before = positions(view).slice(dense.targets.length);
    const spacing = view.layout.pixelsPerQuarter;
    const pending = state.practice.pendingValues.slice();
    const counters = { correct: state.practice.correctCount, wrong: state.practice.wrongCount, missed: state.practice.missedCount };
    const retained = rhythm.dropNoteFlowChordRhythmicMeasures(score, dense.measures.length);
    state = practice.rebaseNoteFlowChordRhythmPractice(state, retained, dense.durationMs);
    view.score = retained;
    view.elapsedMs = state.practice.elapsedMs;
    view.practiceState = state.practice;
    const after = positions(view);
    assert.strictEqual(view.layout.pixelsPerQuarter, spacing);
    assert.strictEqual(after.length, before.length);
    after.forEach((entry, index) => {
      assert.deepStrictEqual(entry.values, before[index].values);
      assert(Math.abs(entry.x - before[index].x) < 1e-7, "retained notes must stay at the same screen x coordinate");
    });
    assert.deepStrictEqual(state.practice.pendingValues, pending);
    assert.deepStrictEqual({ correct: state.practice.correctCount, wrong: state.practice.wrongCount, missed: state.practice.missedCount }, counters);
    const restored = new Stream({ propsData: { score: sparse, practiceState: practice.createNoteFlowChordRhythmPractice(sparse).practice } });
    assert(restored.layout.pixelsPerQuarter < spacing, "a second round resets its own density");
    restored.$destroy();
    view.$destroy();
  }
});
