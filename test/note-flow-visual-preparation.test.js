const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const Vue = require("vue");
const compiler = require("vue-template-compiler");
global.regeneratorRuntime = require("babel-runtime/regenerator");

const sourceRoot = path.resolve(__dirname, "../src") + path.sep;
const originalJs = Module._extensions[".js"], originalVue = Module._extensions[".vue"];
Module._extensions[".js"] = (loaded, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalJs(loaded, filename);
  loaded._compile(babel.transform(fs.readFileSync(filename, "utf8"), {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
};
Module._extensions[".vue"] = loaded => { loaded.exports = { default: {} }; };
function loadView(name) {
  const filename = path.join(sourceRoot, "components", name + ".vue");
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const script = fs.readFileSync(filename, "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
  loaded._compile(babel.transform(script, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
  return { definition: loaded.exports.default, View: Vue.extend(loaded.exports.default) };
}
const { View: Melody, definition: melodyDefinition } = loadView("NoteFlowGamePreview");
const { View: Rhythm, definition: rhythmDefinition } = loadView("NoteFlowRhythmPreview");
const { View: Chords, definition: chordDefinition } = loadView("NoteFlowChordTraining");
const { View: ChordStream } = loadView("NoteFlowChordRhythmStream");
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { generateNoteFlowRhythmicScore } = require("../src/model/NoteFlowRhythmGenerator");
const Options = require("../src/model/Options").default;
const Storage = require("../src/model/NoteFlowRoundStorage").default;
const AudioSync = require("../src/model/AudioSynchronization").default;
Module._extensions[".js"] = originalJs;
if (originalVue) Module._extensions[".vue"] = originalVue;
else delete Module._extensions[".vue"];

const originals = {
  performance: global.performance, raf: global.requestAnimationFrame,
  cancel: global.cancelAnimationFrame, document: global.document,
  save: Storage.saveRound, preparation: Options.preparationSeconds, resumeAudio: AudioSync.resume
};
let now = 1000, serial = 0, checks = 0, audioResumes = 0;
AudioSync.resume = () => { audioResumes++; return Promise.resolve(true); };
const frames = new Map(), views = [];
global.performance = { now: () => now };
global.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
global.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
global.cancelAnimationFrame = id => frames.delete(id);
Storage.saveRound = async () => ({ saved: true });
function frameAt(view, time, paintReady = true) {
  // Existing lifecycle cases assume immediate first paint. The delayed-paint
  // regression deliberately disables this priming and delivers a cold frame.
  if (paintReady && view.isPreparing && view.preparationStartedAt === null) {
    frameAt(view, now, false);
  }
  now = time;
  const id = view.frameRequest === undefined ? view.animationFrame : view.frameRequest;
  const callback = frames.get(id);
  assert(callback, "a visual frame is scheduled");
  frames.delete(id);
  callback(now);
}
function remember(view) { views.push(view); return view; }
function melody(behavior = "wait", inputMode = "midi", noteValue = "quarter") {
  const menuOptions = {
    // Screen piano is now intentionally limited to one hand and one system.
    handMode: inputMode === "keyboard" ? "single" : "two",
    clef: inputMode === "keyboard" ? ["treble"] : ["bass", "treble"], secondaryNotesPerBlock: 4,
    tonalityMode: "circle", selectedKey: "C-major", accidentals: "no",
    difficulty: "normal", movement: "calm", bpm: 50, gameLength: 20,
    behavior, inputMode, rhythmMeter: "4/4",
    rhythmValues: { treble: [noteValue], bass: [noteValue] }
  };
  const parent = remember(new Melody({ propsData: { preview: { menuOptions } }, methods: { $t: key => key } }));
  if (noteValue === "eighth") {
    parent.generatedRhythmScore = generateNoteFlowRhythmicScore(parent.generatedCycle,
      Object.assign({}, parent.rhythmOptions, { measureCount: 16, restChance: 0 }));
  }
  const child = remember(new Rhythm({ propsData: {
    cycle: parent.generatedCycle, score: parent.generatedRhythmScore,
    bpm: 50, behavior, inputMode, training: true, rhythmOptions: parent.rhythmOptions
  }, methods: { $t: key => key } }));
  child.$on("preparation-change", active => { parent.isPreparing = active; });
  child.$on("round-start", parent.startRound);
  child.$on("round-pause", parent.pauseRound);
  child.$on("round-resume", parent.resumeRound);
  child.$on("round-progress", parent.updateRoundProgress);
  child.$on("connection-change", connected => { parent.midiConnected = connected; });
  parent.$refs.flowStaff = child;
  child.resetPreview();
  child.handleMidiConnection(true);
  let sounds = 0;
  child.pianoPlayer = { stopAll() {}, play() { sounds++; } };
  return { parent, child, sounds: () => sounds };
}
function chords(behavior = "wait", noteValue = "quarter") {
  const plan = createNoteFlowChordPlan({
    tonalityMode: "circle", selectedKey: "C-major", chordSize: 3,
    bassNote: true, behavior, bpm: 50, gameLength: 20,
    rhythmMeter: "4/4", rhythmValues: [noteValue]
  });
  const view = remember(new Chords({ propsData: { plan }, methods: { $t: key => key } }));
  view.handleMidiConnection(true);
  return view;
}
function stream(view) {
  return new ChordStream({ propsData: {
    score: view.rhythmScore, elapsedMs: view.practice.elapsedMs,
    practiceState: view.practice, tonality: view.tonality,
    preparationProgress: view.isPreparing ? view.preparationProgress : 1
  }, methods: { $t: key => key } });
}
function renderClip(view, name) {
  const source = fs.readFileSync(path.join(sourceRoot, "components", name + ".vue"), "utf8");
  const template = compiler.parseComponent(source).template.content;
  const compiled = compiler.compileToFunctions(template);
  view.$options.render = compiled.render;
  view.$options.staticRenderFns = compiled.staticRenderFns;
  let clip = null;
  function visit(node, inClip) {
    if (!node) return;
    if (node.tag === "clipPath") inClip = true;
    if (inClip && node.tag === "rect") clip = node.data.attrs;
    (node.children || []).forEach(child => visit(child, inClip));
  }
  visit(view._render(), false);
  assert(clip, "the actual SVG render contains its moving-note clip rectangle");
  assert(clip.width >= 0);
  return clip;
}
function test(name, body) {
  body(); checks++;
  process.stdout.write(`✓ ${name}\n`);
}
try {
  test("melody preparation moves only notation, ignores MIDI/touch and keeps the round clock ready", () => {
    ["wait", "continuous"].forEach(behavior => {
      ["midi", "button", "keyboard"].forEach(inputMode => {
        Options.preparationSeconds = 3;
        const { parent, child, sounds } = melody(behavior, inputMode);
        const baseline = child.frame.offsetX, score = child.activeScore;
        const start = now;
        parent.playTraining();
        assert(parent.isPreparing && child.isPreparing);
        assert(parent.canPause && !parent.canPlay);
        assert.strictEqual(child.isPlaying, false);
        assert(child.frame.offsetX > baseline);
        const right = child.frame.offsetX;
        child.submitInput(127, inputMode === "midi" ? "midi" : "touch");
        child.timeline.targets[0].expectedValues.forEach(value => child.submitMidi(value));
        assert.strictEqual(sounds(), 0);
        assert.strictEqual(child.practiceState.correctCount, 0);
        assert.strictEqual(child.practiceState.wrongCount, 0);
        assert.deepStrictEqual(child.practiceState.pendingValues, []);
        frameAt(child, start + 1500);
        assert(child.frame.offsetX < right && child.frame.offsetX > baseline);
        assert.strictEqual(child.practiceState.elapsedMs, 0);
        assert.strictEqual(parent.roundTimer.status, "ready");
        assert.strictEqual(parent.roundTimer.remainingMs, 20000);
        frameAt(child, start + 3000);
        assert(!parent.isPreparing && !child.isPreparing);
        assert.strictEqual(child.frame.offsetX, baseline);
        assert.strictEqual(child.activeScore, score);
        assert.strictEqual(parent.roundTimer.status, "running");
        assert.strictEqual(parent.roundTimer.elapsedMs, 0);
        assert.strictEqual(parent.roundTimer.lastStartedAtMs, start + 3000);
        if (behavior === "wait") {
          frameAt(child, now + 20);
          assert.strictEqual(child.practiceState.status, "waiting");
          child.timeline.targets[0].expectedValues.forEach(value => child.submitInput(
            inputMode === "midi" ? value : value % 12, inputMode === "midi" ? "midi" : "touch"));
          assert.strictEqual(child.practiceState.correctCount, 1);
        }
        parent.stopRoundTicker(); child.stopFrame();
      });
    });
  });
  test("melody pause, resume, background and end cancel preparation without losing the score or time", () => {
    Options.preparationSeconds = 5;
    const { parent, child } = melody();
    const score = child.activeScore, start = now;
    parent.playTraining();
    frameAt(child, start + 2000);
    const cancelled = frames.get(child.frameRequest);
    parent.pauseTraining();
    assert(!child.isPreparing && !parent.isPreparing);
    assert.strictEqual(child.practiceState.status, "paused");
    assert.strictEqual(parent.roundTimer.status, "paused");
    assert.strictEqual(parent.roundTimer.elapsedMs, 0);
    cancelled(start + 10000);
    assert.strictEqual(parent.roundTimer.status, "paused");
    parent.playTraining();
    assert(parent.isPreparing);
    assert.strictEqual(parent.stageOverlayOpen, false);
    frameAt(child, now + 5000);
    frameAt(child, now + 20);
    assert.strictEqual(child.practiceState.status, "waiting");
    child.timeline.targets[0].expectedValues.forEach(value => child.submitMidi(value));
    frameAt(child, now + 100);
    parent.pauseTraining();
    const elapsed = child.practiceState.elapsedMs, timerElapsed = parent.roundTimer.elapsedMs;
    parent.playTraining();
    frameAt(child, now + 2500);
    assert.strictEqual(child.practiceState.elapsedMs, elapsed);
    assert.strictEqual(parent.roundTimer.elapsedMs, timerElapsed);
    global.document.hidden = true;
    parent.handleVisibilityChange();
    global.document.hidden = false;
    assert.strictEqual(child.practiceState.status, "paused");
    parent.playTraining();
    frameAt(child, now + 5000);
    assert.strictEqual(child.practiceState.elapsedMs, elapsed);
    assert.strictEqual(child.activeScore, score);
    parent.pauseTraining(); parent.playTraining();
    parent.completeRound("manual");
    assert(!child.isPreparing && !parent.isPreparing);
    assert.strictEqual(child.frameRequest, null);
    assert.strictEqual(child.practiceState.status, "complete");
    assert.strictEqual(parent.roundTimer.elapsedMs, timerElapsed);
    parent.stopRoundTicker();
  });
  test("chord preparation moves the actual displayed stream without MIDI evaluation or elapsed game time", () => {
    ["wait", "continuous"].forEach(behavior => {
      Options.preparationSeconds = 3;
      const view = chords(behavior), start = now;
      const baseline = stream(view).offsetX;
      view.playMotion();
      const right = stream(view).offsetX;
      assert(right > baseline);
      assert(view.canPause && !view.canPlay && view.roundIsActive);
      view.practice.timeline.targets[0].expectedValues.forEach(value => view.pressMidi(value));
      view.pressMidi(127);
      assert.strictEqual(view.practice.correctCount, 0);
      assert.strictEqual(view.practice.wrongCount, 0);
      assert.deepStrictEqual(view.practice.pendingValues, []);
      frameAt(view, start + 1500);
      assert(stream(view).offsetX < right && stream(view).offsetX > baseline);
      assert.strictEqual(view.practice.elapsedMs, 0);
      assert.strictEqual(view.roundTimer.status, "ready");
      assert.strictEqual(view.roundTimer.remainingMs, 20000);
      frameAt(view, start + 3000);
      assert(!view.isPreparing);
      assert.strictEqual(stream(view).offsetX, baseline);
      assert.strictEqual(view.roundTimer.lastStartedAtMs, start + 3000);
      assert.strictEqual(view.roundTimer.elapsedMs, 0);
      if (behavior === "wait") {
        frameAt(view, now + 20);
        assert.strictEqual(view.practice.status, "waiting");
        view.practice.timeline.targets[0].expectedValues.forEach(value => view.pressMidi(value));
        assert.strictEqual(view.practice.correctCount, 1);
      }
      view.stopAnimation(); view.stopTimerTicker();
    });
  });
  test("chord pause/resume and disconnect cancel preparation while preserving the stream and results", () => {
    Options.preparationSeconds = 5;
    const view = chords(), score = view.rhythmScore;
    view.playMotion(); frameAt(view, now + 2000);
    const cancelled = frames.get(view.animationFrame);
    view.pauseMotion();
    assert.strictEqual(view.practice.status, "paused");
    assert.strictEqual(view.roundTimer.status, "paused");
    assert(!view.isPreparing);
    cancelled(now + 10000);
    assert.strictEqual(view.roundTimer.status, "paused");
    view.playMotion();
    assert.strictEqual(view.stageOverlayOpen, false);
    frameAt(view, now + 5000);
    frameAt(view, now + 20);
    view.practice.timeline.targets[0].expectedValues.forEach(value => view.pressMidi(value));
    frameAt(view, now + 100);
    view.pauseMotion();
    const elapsed = view.practice.elapsedMs, timerElapsed = view.roundTimer.elapsedMs;
    view.playMotion(); frameAt(view, now + 2500);
    assert.strictEqual(view.practice.elapsedMs, elapsed);
    assert.strictEqual(view.roundTimer.elapsedMs, timerElapsed);
    view.handleMidiConnection(false);
    assert(!view.isPreparing && !view.canPlay);
    assert.strictEqual(view.practice.status, "paused");
    view.handleMidiConnection(true); view.playMotion();
    frameAt(view, now + 5000);
    assert.strictEqual(view.practice.elapsedMs, elapsed);
    assert.strictEqual(view.practice.correctCount, 1);
    assert.strictEqual(view.rhythmScore, score);
    view.pauseMotion(); view.playMotion(); view.endRound();
    assert(!view.isPreparing);
    assert.strictEqual(view.animationFrame, null);
    assert.strictEqual(view.roundTimer.elapsedMs, timerElapsed);
  });
  test("resume keeps already passed notes and ledger lines clipped while continuous beams remain visible", () => {
    Options.preparationSeconds = 0;
    const { parent, child } = melody("wait", "midi", "eighth");
    parent.playTraining(); frameAt(child, now + 20);
    child.timeline.targets[0].expectedValues.forEach(value => child.submitMidi(value));
    child.timeline.targets[0].expectedValues.forEach(value => child.releaseMidi(value));
    frameAt(child, now + 600);
    // Complete the second eighth and advance towards the third: the first head
    // has crossed the accidental inset, while its connected beam is still visible.
    const nextValues = child.timeline.targets[child.practiceState.targetIndex].expectedValues;
    nextValues.forEach(value => child.submitMidi(value));
    nextValues.forEach(value => child.releaseMidi(value));
    frameAt(child, now + 500);
    parent.pauseTraining();
    const pastMelody = child.layout.events.find(event => event.kind === "note" && event.startTick === 0);
    const melodyClip = renderClip(child, "NoteFlowRhythmPreview");
    assert(pastMelody.x + child.frame.offsetX + 11 < melodyClip.x,
      "the previous notehead and its ledger line have completely passed out of view");
    const melodyBeam = child.visibleBeams.find(beam => beam.x1 + child.frame.offsetX < melodyClip.x
      && beam.x2 + child.frame.offsetX >= melodyClip.x);
    assert(melodyBeam, "a beam continues from the passed note towards a visible note");
    const melodyBeamEndInset = melodyBeam.x2 + child.frame.offsetX - melodyClip.x;
    const baselineOffset = child.frame.offsetX;
    Options.preparationSeconds = 3; parent.playTraining();
    const melodyStart = now;
    [0, 1500, 2999, 3000].forEach(delta => {
      if (delta > 0) frameAt(child, melodyStart + delta);
      const clip = renderClip(child, "NoteFlowRhythmPreview");
      assert(pastMelody.x + child.frame.offsetX + 11 < clip.x,
        "resume never brings a passed notehead or ledger line back into the visible strip");
      assert(child.visibleBeams.some(beam => beam.x1 === melodyBeam.x1 && beam.x2 === melodyBeam.x2),
        "the connected beam remains rendered throughout the approach");
      assert(Math.abs(melodyBeam.x2 + child.frame.offsetX - clip.x - melodyBeamEndInset) < 1e-7,
        "the visible end of a connected beam keeps the same relationship to the clip boundary");
    });
    assert.strictEqual(child.frame.offsetX, baselineOffset);
    assert.strictEqual(renderClip(child, "NoteFlowRhythmPreview").x, melodyClip.x);
    parent.stopRoundTicker(); child.stopFrame();

    Options.preparationSeconds = 0;
    const view = chords("wait", "eighth");
    view.playMotion(); frameAt(view, now + 20);
    view.practice.timeline.targets[0].expectedValues.forEach(value => view.pressMidi(value));
    frameAt(view, now + 600); view.pauseMotion();
    const baseline = stream(view);
    const pastChord = baseline.layout.events.find(event => event.kind === "note" && event.globalStartTick === 0);
    const chordClip = renderClip(baseline, "NoteFlowChordRhythmStream");
    assert(pastChord.parts.every(part => part.heads.every(head => (
      pastChord.x + head.offsetX + baseline.offsetX + 11 < chordClip.x
    ))), "the previous chord's heads and ledger lines are outside the original clip");
    const chordBeam = baseline.visibleBeams.find(beam => beam.x1 + baseline.offsetX < chordClip.x
      && beam.x2 + baseline.offsetX >= chordClip.x);
    assert(chordBeam, "the displayed chord beam spans passed and visible events");
    const chordBeamEndInset = chordBeam.x2 + baseline.offsetX - chordClip.x;
    Options.preparationSeconds = 3; view.playMotion();
    const chordStart = now;
    [0, 1500, 2999, 3000].forEach(delta => {
      if (delta > 0) frameAt(view, chordStart + delta);
      const rendering = stream(view), clip = renderClip(rendering, "NoteFlowChordRhythmStream");
      assert(pastChord.parts.every(part => part.heads.every(head => (
        pastChord.x + head.offsetX + rendering.offsetX + 11 < clip.x
      ))), "passed chord heads and ledger lines remain hidden throughout resume");
      assert(rendering.visibleBeams.some(beam => beam.x1 === chordBeam.x1 && beam.x2 === chordBeam.x2));
      assert(Math.abs(chordBeam.x2 + rendering.offsetX - clip.x - chordBeamEndInset) < 1e-7);
    });
    const resumed = stream(view);
    assert.strictEqual(resumed.offsetX, baseline.offsetX);
    assert.strictEqual(renderClip(resumed, "NoteFlowChordRhythmStream").x, chordClip.x);
    view.stopTimerTicker(); view.stopAnimation();
  });
  test("melody unlocks Web Audio in the direct start and resume gesture, before RAF preparation", () => {
    Options.preparationSeconds = 3;
    const { parent, child } = melody();
    const before = audioResumes;
    parent.playTraining();
    assert.strictEqual(audioResumes, before + 1,
      "start resumes the context synchronously while the user gesture is still active");
    assert(child.isPreparing);
    assert.strictEqual(parent.roundTimer.status, "ready");
    frameAt(child, now + 3000);
    assert.strictEqual(audioResumes, before + 1, "the delayed RAF callback does not perform audio unlocking");
    parent.pauseTraining();
    parent.playTraining();
    assert.strictEqual(audioResumes, before + 2, "resume also unlocks inside the user gesture");
    assert(child.isPreparing);
    parent.pauseTraining();
    parent.stopRoundTicker(); child.stopFrame();
  });
  test("a delayed first mobile paint cannot consume the configured approach before it is visible", () => {
    Options.preparationSeconds = 3;
    const { parent, child } = melody();
    parent.playTraining();
    const requestedAt = now;
    frameAt(child, requestedAt + 4000, false);
    assert.strictEqual(child.isPreparing, true, "cold rendering must not skip preparation");
    assert.strictEqual(child.preparationProgress, 0, "the first painted frame begins the approach");
    assert.strictEqual(parent.roundTimer.status, "ready");
    child.submitMidi(60);
    assert.strictEqual(child.practiceState.targetIndex, 0);
    frameAt(child, requestedAt + 5500);
    assert.strictEqual(child.preparationProgress, 0.5);
    frameAt(child, requestedAt + 6999);
    assert.strictEqual(child.isPreparing, true);
    frameAt(child, requestedAt + 7000);
    assert.strictEqual(child.isPreparing, false);
    assert.strictEqual(parent.roundTimer.status, "running");
    child.pauseMotion(); parent.stopRoundTicker();
    const view = chords();
    view.playMotion();
    const chordRequestedAt = now;
    frameAt(view, chordRequestedAt + 4000, false);
    assert.strictEqual(view.isPreparing, true);
    assert.strictEqual(view.preparationProgress, 0);
    assert.strictEqual(view.roundTimer.status, "ready");
    frameAt(view, chordRequestedAt + 6999);
    assert.strictEqual(view.isPreparing, true);
    frameAt(view, chordRequestedAt + 7000);
    assert.strictEqual(view.isPreparing, false);
    assert.strictEqual(view.roundTimer.status, "running");
    view.stopTimerTicker(); view.stopAnimation();
  });
  test("zero seconds skips preparation in both modes, unmount stops pending frames and no countdown is rendered", () => {
    Options.preparationSeconds = 0;
    const { parent, child } = melody();
    parent.playTraining();
    assert(!child.isPreparing);
    assert.strictEqual(parent.roundTimer.status, "running");
    parent.stopRoundTicker(); child.stopFrame();
    const view = chords(); view.playMotion();
    assert(!view.isPreparing);
    assert.strictEqual(view.roundTimer.status, "running");
    view.stopAnimation(); view.stopTimerTicker();
    Options.preparationSeconds = 3;
    parent.pauseTraining(); parent.playTraining();
    rhythmDefinition.beforeDestroy.call(child);
    assert(!child.isPreparing);
    assert.strictEqual(child.frameRequest, null);
    view.pauseMotion(); view.playMotion();
    chordDefinition.beforeDestroy.call(view);
    assert(!view.isPreparing);
    assert.strictEqual(view.animationFrame, null);
    for (const name of ["NoteFlowGamePreview", "NoteFlowChordTraining", "NoteFlowRhythmPreview"]) {
      const template = fs.readFileSync(path.join(sourceRoot, "components", name + ".vue"), "utf8").split("<script>")[0];
      assert(!/countdown|preparationProgress\s*\}\}/i.test(template), `${name} never renders countdown numbers`);
    }
  });
  process.stdout.write(`Note Flow visual preparation: ${checks} lifecycle groups passed.\n`);
} finally {
  views.forEach(view => {
    if (view.cancelPreparation) view.cancelPreparation();
    if (view.stopRoundTicker) view.stopRoundTicker();
    if (view.stopTimerTicker) view.stopTimerTicker();
    if (view.stopFrame) view.stopFrame();
    if (view.stopAnimation) view.stopAnimation();
  });
  global.performance = originals.performance;
  global.requestAnimationFrame = originals.raf;
  global.cancelAnimationFrame = originals.cancel;
  global.document = originals.document;
  Storage.saveRound = originals.save;
  Options.preparationSeconds = originals.preparation;
  AudioSync.resume = originals.resumeAudio;
}
