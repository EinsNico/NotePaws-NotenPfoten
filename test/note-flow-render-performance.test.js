const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const Vue = require("vue");
const compiler = require("vue-template-compiler");
global.regeneratorRuntime = require("babel-runtime/regenerator");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalJs = Module._extensions[".js"];
const originalVue = Module._extensions[".vue"];
Module._extensions[".js"] = (loaded, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalJs(loaded, filename);
  loaded._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
Module._extensions[".vue"] = loaded => { loaded.exports = { default: {} }; };
const filename = path.join(sourceRoot, "components/NoteFlowRhythmPreview.vue");
const source = fs.readFileSync(filename, "utf8");
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(babel.transform(compiler.parseComponent(source).script.content, {
  babelrc: false, presets: [["env", { modules: "commonjs" }]]
}).code, filename);
const component = loaded.exports.default;
const compiled = compiler.compile(compiler.parseComponent(source).template.content);
assert.deepStrictEqual(compiled.errors, []);
component.render = new Function(compiled.render);
component.staticRenderFns = compiled.staticRenderFns.map(body => new Function(body));
const Rhythm = Vue.extend(component);
const { generateNoteFlowCycle } = require("../src/model/NoteFlowGenerator");
const { generateNoteFlowRhythmicScore } = require("../src/model/NoteFlowRhythmGenerator");
const practice = require("../src/model/NoteFlowRhythmPractice");
const { createNoteFlowRenderingSnapshot } = require("../src/model/NoteFlowRenderingSnapshot");
Module._extensions[".js"] = originalJs;
if (originalVue) Module._extensions[".vue"] = originalVue;
else delete Module._extensions[".vue"];

const originalPerformance = global.performance;
const originalRaf = global.requestAnimationFrame;
const originalCancel = global.cancelAnimationFrame;
let now = 1000, serial = 0;
const frames = new Map();
global.performance = { now: () => now };
global.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
global.cancelAnimationFrame = id => frames.delete(id);

function test(name, body) {
  body();
  process.stdout.write(`✓ ${name}\n`);
}
function fixture(behavior = "wait", measures = 16, dense = false) {
  const cycle = generateNoteFlowCycle({
    handMode: "two", clefs: ["bass", "treble"], difficulty: "normal",
    movement: "leaping", tonalityMode: "circle", selectedKey: "C-major",
    seed: "reactive-note-flow-performance"
  });
  const values = dense ? ["quarter", "eighth", "sixteenth"] : ["quarter"];
  const rhythmOptions = { meter: "4/4", noteDensity: 78,
    allowedValues: { treble: values, bass: values } };
  const scoreOptions = Object.assign({}, rhythmOptions, { measureCount: 16, restChance: 0.12 });
  let score = generateNoteFlowRhythmicScore(cycle, scoreOptions);
  for (let count = 16; count < measures; count += 16) {
    const next = generateNoteFlowRhythmicScore(cycle, scoreOptions);
    score = Object.assign({}, score, { measures: score.measures.concat(next.measures) });
  }
  // Root component props intentionally acquire ordinary Vue observers first.
  const parent = new Vue({ data: { cycle, score } });
  assert(score.__ob__, "the regression must cover an already observed parent score");
  const view = new Rhythm({ propsData: {
    cycle: parent.cycle, score: parent.score, behavior, bpm: 50,
    inputMode: "midi", training: true, rhythmOptions
  }, methods: { $t: key => key } });
  view.resetPreview();
  // This compiles the actual SVG/input template and collects Vue dependencies,
  // which plain model or mocked-component tests cannot expose. No DOM or MIDI
  // device, storage, real timers or media elements are used.
  let renders = 0;
  const stopRender = view.$watch(() => {
    renders += 1;
    return view._render();
  }, () => {}, { sync: true });
  return { parent, view, score, cycle, get renders() { return renders; },
    destroy() { stopRender(); view.$destroy(); parent.$destroy(); } };
}
function frameAt(view, time) {
  const id = view.frameRequest;
  const callback = frames.get(id);
  assert(callback, "one animation frame is scheduled");
  frames.delete(id);
  now = time;
  callback(now);
}
function answerNext(view) {
  view.practiceState.grip.heldValues.forEach(value => view.releaseMidi(value));
  view.ensureStream();
  const target = view.timeline.targets[view.practiceState.targetIndex];
  assert(target, "the streaming round retains a future target");
  const delta = Math.max(0, target.startMs - view.practiceState.elapsedMs);
  frameAt(view, now + delta);
  if (view.behavior === "wait") {
    assert.strictEqual(view.practiceState.status, "waiting");
    assert.strictEqual(view.frameRequest, null);
    assert.strictEqual(frames.size, 0, "waiting does not keep a background RAF alive");
    // Keep these perfect performance-round inputs within the wait tolerance;
    // long waits and pauses have separate grading regressions.
    now += 100;
  }
  target.expectedValues.forEach(value => view.submitMidi(value));
}

try {
  test("snapshot copies observed props without freezing parents and shares immutable prefixes", () => {
    const source = { part: { notes: [{ value: 60 }] } };
    Vue.observable(source);
    const snapshot = createNoteFlowRenderingSnapshot(source);
    assert.deepStrictEqual(snapshot, source);
    assert.notStrictEqual(snapshot, source);
    assert.notStrictEqual(snapshot.part, source.part);
    assert(Object.isFrozen(snapshot.part.notes[0]));
    assert.strictEqual(Object.getOwnPropertyDescriptor(snapshot.part, "notes").get, undefined);
    assert(!Object.isFrozen(source));
    source.part.notes[0].value = 62;
    assert.strictEqual(snapshot.part.notes[0].value, 60);
    const appended = createNoteFlowRenderingSnapshot({ parts: [snapshot.part, { notes: [] }] });
    assert.strictEqual(appended.parts[0], snapshot.part);
    assert(Object.isFrozen(appended.parts));
  });

  test("clock-only frames retain results while misses and answers copy on write", () => {
    const timeline = { bpm: 60, durationMs: 5000,
      targets: [{ startMs: 2000, expectedValues: [60] }] };
    let state = practice.startNoteFlowRhythmPractice(
      practice.createNoteFlowRhythmPractice(timeline, { behavior: "continuous" })
    );
    const results = state.results;
    state = practice.advanceNoteFlowRhythmPractice(state, 16);
    assert.strictEqual(state.results, results);
    state = practice.advanceNoteFlowRhythmPractice(state, 3000);
    assert.notStrictEqual(state.results, results);
    assert.deepStrictEqual(results, [null], "old frames remain immutable");
    assert.deepStrictEqual(state.results, ["missed"]);
  });

  test("16/32/48-bar SVG rendering keeps its frame dependency count bounded", () => {
    const measurements = [];
    for (const measures of [16, 32, 48]) {
      const f = fixture("continuous", measures, true), view = f.view;
      view.beginMotion();
      const initialLayout = view.layout, initialTimeline = view.timeline;
      const start = process.hrtime.bigint();
      for (let frame = 0; frame < 48; frame += 1) frameAt(view, now + 16);
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      assert.strictEqual(view.layout, initialLayout);
      assert.strictEqual(view.timeline, initialTimeline);
      assert(Object.isFrozen(view.timeline.targets));
      assert(Object.isFrozen(view.layout.events));
      assert(view.visibleEvents.length < 32, "only the visible band reaches the SVG");
      const dependencies = view._computedWatchers.frame.deps.length;
      assert(dependencies < 60,
        `frame dependency fanout must not grow with ${view.timeline.targets.length} targets (${dependencies})`);
      measurements.push({ measures, targets: view.timeline.targets.length,
        frameDependencies: dependencies, msPerFrame: +(ms / 48).toFixed(3) });
      f.destroy();
      assert.strictEqual(frames.size, 0);
    }
    process.stdout.write(`  RAM/VNode timings (not device FPS): ${JSON.stringify(measurements)}\n`);
  });

  test("wait and continuous rounds pass 300/1000 answers, trimming and a second round without retained callbacks", () => {
    for (const behavior of ["wait", "continuous"]) {
      for (const dense of [false, true]) {
      const f = fixture(behavior, 16, dense), view = f.view;
      const answers = dense ? 1000 : 300;
      view.handleMidiConnection(true);
      view.beginMotion();
      const height = view.layout.height;
      for (let answer = 1; answer <= answers; answer += 1) {
        answerNext(view);
        assert.strictEqual(view.practiceState.correctCount, answer);
        assert.strictEqual(view.practiceState.wrongCount, 0);
        assert.strictEqual(view.practiceState.missedCount, 0);
        assert(view.activeScore.measures.length <= 48, "passed score buffers are removed");
        assert.strictEqual(view.layout.height, height);
        assert(frames.size <= 1);
      }
      const position = view.practiceState.elapsedMs, pending = view.practiceState.pendingValues;
      view.pauseMotion();
      assert.strictEqual(frames.size, 0);
      assert.strictEqual(view.practiceState.elapsedMs, position);
      now += 100000;
      view.beginMotion();
      assert.strictEqual(view.practiceState.elapsedMs, position);
      assert.deepStrictEqual(view.practiceState.pendingValues, pending);
      answerNext(view);
      assert.strictEqual(view.practiceState.correctCount, answers + 1);
      view.finishMotion();
      assert.strictEqual(frames.size, 0);
      view.resetPreview();
      assert.strictEqual(view.practiceState.correctCount, 0);
      assert.strictEqual(view.activeScore.measures.length, 16);
      assert.deepStrictEqual(view.score, f.score);
      assert(!Object.isFrozen(f.score), "the parent's editable source remains ordinary data");
      view.beginMotion();
      for (let answer = 1; answer <= 150; answer += 1) {
        answerNext(view);
        assert.strictEqual(view.practiceState.correctCount, answer);
        assert(view._computedWatchers.frame.deps.length < 60);
      }
      f.destroy();
      assert.strictEqual(frames.size, 0);
      }
    }
  });
} finally {
  global.performance = originalPerformance;
  global.requestAnimationFrame = originalRaf;
  global.cancelAnimationFrame = originalCancel;
}
process.stdout.write("Note Flow render performance: OK\n");
