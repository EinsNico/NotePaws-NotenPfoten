const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
const Vue = require("vue");
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
  const source = fs.readFileSync(filename, "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];
  loaded._compile(babel.transform(source, {
    babelrc: false, presets: [["env", { modules: "commonjs" }]]
  }).code, filename);
  return Vue.extend(loaded.exports.default);
}
const Melody = loadView("NoteFlowGamePreview");
const Rhythm = loadView("NoteFlowRhythmPreview");
const Chords = loadView("NoteFlowChordTraining");
const { createNoteFlowChordPlan } = require("../src/model/NoteFlowChordPlan");
const { generateNoteFlowCycle } = require("../src/model/NoteFlowGenerator");
const { generateNoteFlowRhythmicScore } = require("../src/model/NoteFlowRhythmGenerator");
const Storage = require("../src/model/NoteFlowRoundStorage").default;
// This fixture exercises immediate playback; visual preparation has dedicated lifecycle tests.
const Options = require("../src/model/Options").default;
Options.preparationSeconds = 0;
Module._extensions[".js"] = originalJs;
if (originalVue) Module._extensions[".vue"] = originalVue;
else delete Module._extensions[".vue"];

const originals = {
  performance: global.performance, raf: global.requestAnimationFrame,
  cancel: global.cancelAnimationFrame, save: Storage.saveRound
};
let now = 1000, serial = 0;
const frames = new Map();
global.performance = { now: () => now };
global.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
global.cancelAnimationFrame = id => frames.delete(id);
Storage.saveRound = async () => ({ saved: true });
function frameAt(view, time) {
  now = time;
  const callback = frames.get(view.frameRequest);
  assert(callback, "one frame is scheduled");
  frames.delete(view.frameRequest);
  callback(now);
}
function melody() {
  const menuOptions = {
    handMode: "two", clef: ["bass", "treble"], secondaryNotesPerBlock: 4,
    tonalityMode: "circle", selectedKey: "C-major", accidentals: "no",
    difficulty: "normal", movement: "calm", bpm: 50, gameLength: 20,
    behavior: "wait", inputMode: "midi", sound: false, rhythmMeter: "4/4",
    rhythmValues: { treble: ["quarter"], bass: ["quarter"] }
  };
  const parent = new Melody({ propsData: { preview: { menuOptions } } });
  const child = new Rhythm({ propsData: {
    cycle: parent.generatedCycle, score: parent.generatedRhythmScore,
    bpm: 50, behavior: "wait", inputMode: "midi", training: true,
    rhythmOptions: parent.rhythmOptions
  }, methods: { $t: key => key } });
  child.$on("preparation-change", active => { parent.isPreparing = active; });
  child.$on("round-start", parent.startRound);
  child.$on("round-pause", parent.pauseRound);
  child.$on("round-resume", parent.resumeRound);
  child.$on("round-progress", parent.updateRoundProgress);
  child.$on("connection-change", connected => { parent.midiConnected = connected; });
  parent.$refs.flowStaff = child;
  child.resetPreview();
  return { parent, child };
}
async function test(name, body) {
  await body();
  process.stdout.write(`✓ ${name}\n`);
}
async function run() {
  await test("dense melody buffers continue from the actual last played note and reset that state", () => {
    const config = {
      handMode: "single", clefs: ["treble"], difficulty: "normal",
      movement: "leaping", tonalityMode: "circle", selectedKey: "C-major",
      seed: "played-continuation"
    };
    const cycle = generateNoteFlowCycle(config);
    const rhythmOptions = {
      meter: "4/4", noteDensity: 78, allowedValues: { treble: ["quarter", "eighth", "sixteenth"] }
    };
    const scoreOptions = Object.assign({}, rhythmOptions, { measureCount: 16, restChance: 0.12 });
    const score = generateNoteFlowRhythmicScore(cycle, scoreOptions);
    const child = new Rhythm({ propsData: { cycle, score, rhythmOptions,
      training: true, inputMode: "midi" }, methods: { $t: key => key } });
    assert(score.nextState);
    assert.deepStrictEqual(child.continuationState, score.nextState);
    child.resetPreview();
    const nextCycle = generateNoteFlowCycle(cycle.config, 1, score.nextState);
    const nextScore = generateNoteFlowRhythmicScore(nextCycle, scoreOptions);
    child.practiceState.elapsedMs = child.timeline.durationMs - child.timeline.measures[0].endMs;
    child.ensureStream();
    assert.deepStrictEqual(child.activeScore.measures.slice(16), nextScore.measures);
    assert.deepStrictEqual(child.continuationState, nextScore.nextState);
    assert.strictEqual(child.nextCycleIndex, 2);
    child.resetPreview();
    assert.deepStrictEqual(child.continuationState, score.nextState);
    assert.deepStrictEqual(child.activeScore, score);
    assert.notStrictEqual(child.activeScore, score,
      "the notation snapshot must not freeze or observe the parent's score");
    child.stopFrame();
  });
  await test("live melody stops at the line and restarts without charging time spent waiting", () => {
    const { parent, child } = melody();
    child.handleMidiConnection(true);
    parent.playTraining();
    frameAt(child, now + 20);
    assert.strictEqual(child.practiceState.status, "waiting");
    const elapsed = child.practiceState.elapsedMs, offset = child.frame.offsetX;
    assert.strictEqual(child.frameRequest, null);
    now += 5000;
    const expected = child.timeline.targets[0].expectedValues;
    assert(expected.length > 1);
    expected.forEach(value => child.submitMidi(value));
    // Five seconds of active waiting now count as late, while the score
    // still resumes from exactly the same visual/time position.
    assert.strictEqual(child.practiceState.correctCount, 0);
    assert.strictEqual(child.practiceState.lateAttemptCount, 1);
    assert.strictEqual(child.practiceState.targetIndex, 1);
    assert.strictEqual(child.practiceState.results[0], "late");
    assert.strictEqual(child.practiceState.elapsedMs, elapsed);
    assert.strictEqual(child.frame.offsetX, offset);
    frameAt(child, now + 16);
    assert.strictEqual(child.practiceState.elapsedMs, elapsed + 16);
    assert.strictEqual(parent.roundProgress.correct, 0);
    assert.strictEqual(parent.roundProgress.late, 1);
    parent.stopRoundTicker(); child.stopFrame();
  });
  await test("wrong MIDI input keeps the waiting note and visual position available", () => {
    const { parent, child } = melody();
    child.handleMidiConnection(true); parent.playTraining();
    frameAt(child, now + 20);
    const offset = child.frame.offsetX;
    now += 4000; child.submitMidi(127);
    assert.strictEqual(child.practiceState.status, "waiting");
    assert.strictEqual(child.practiceState.targetIndex, 0);
    assert.strictEqual(child.frame.offsetX, offset);
    assert.strictEqual(parent.roundProgress.wrong, 1);
    parent.stopRoundTicker(); child.stopFrame();
  });
  await test("MIDI disconnect pauses both clocks and reconnect waits for explicit resume", () => {
    const { parent, child } = melody();
    parent.playTraining();
    assert.strictEqual(parent.roundTimer.status, "ready");
    child.handleMidiConnection(true); parent.playTraining();
    frameAt(child, now + 20);
    const score = child.activeScore, elapsed = child.practiceState.elapsedMs;
    child.handleMidiConnection(false);
    assert.strictEqual(child.practiceState.status, "paused");
    assert.strictEqual(parent.roundTimer.status, "paused");
    assert.strictEqual(child.practiceStatusLabel, "PAUSED");
    assert.strictEqual(parent.canPlay, false);
    now += 50000; child.submitMidi(48);
    assert.strictEqual(child.practiceState.wrongCount, 0);
    child.handleMidiConnection(true);
    assert.strictEqual(child.practiceState.status, "paused");
    parent.playTraining();
    assert.strictEqual(child.practiceState.status, "waiting");
    assert.strictEqual(child.practiceState.elapsedMs, elapsed);
    assert.strictEqual(child.activeScore, score);
    parent.stopRoundTicker(); child.stopFrame();
  });
  await test("pausing at the melody time limit produces one result instead of a stuck timer", () => {
    const { parent, child } = melody();
    child.handleMidiConnection(true); parent.playTraining();
    now += 20001; parent.pauseTraining();
    assert.strictEqual(parent.roundTimer.status, "complete");
    assert.strictEqual(parent.roundResult.completionReason, "time-limit");
    const result = parent.roundResult;
    parent.completeRound("manual");
    assert.strictEqual(parent.roundResult, result);
    assert.strictEqual(child.practiceState.status, "complete");
    parent.stopRoundTicker(); child.stopFrame();
  });
  await test("pausing at the chord time limit also finishes; disconnected MIDI cannot restart", () => {
    const plan = createNoteFlowChordPlan({
      tonalityMode: "circle", selectedKey: "C-major", chordSize: 3,
      bassNote: true, behavior: "wait", bpm: 50, gameLength: 20,
      rhythmMeter: "4/4", rhythmValues: ["quarter"]
    });
    const view = new Chords({ propsData: { plan } });
    view.playMotion();
    assert.strictEqual(view.practice.status, "ready");
    view.handleMidiConnection(true); view.playMotion();
    now += 20001; view.pauseMotion();
    assert.strictEqual(view.roundResult.completionReason, "time-limit");
    view.stopTimerTicker(); view.stopAnimation();
  });
  await test("an old asynchronous save cannot set the next melody round to saved", async () => {
    const { parent, child } = melody();
    let resolveSave;
    Storage.saveRound = () => new Promise(resolve => { resolveSave = resolve; });
    parent.roundResult = { id: "old-round" };
    const saving = parent.saveRoundResult();
    assert.strictEqual(parent.roundSaveState, "saving");
    parent.resetRound();
    resolveSave({ saved: true }); await saving;
    assert.strictEqual(parent.roundResult, null);
    assert.strictEqual(parent.roundSaveState, "idle");
    parent.stopRoundTicker(); child.stopFrame();
  });
  await test("pause and result overlays start at the top of a previously scrolled stage", async () => {
    const { parent, child } = melody();
    parent.$refs.flowStage = { scrollTop: 300 };
    parent.roundTimer = Object.assign({}, parent.roundTimer, { status: "paused" });
    await parent.$nextTick();
    assert.strictEqual(parent.$refs.flowStage.scrollTop, 0);
    parent.roundTimer = Object.assign({}, parent.roundTimer, { status: "ready" });
    await parent.$nextTick();
    parent.$refs.flowStage.scrollTop = 250;
    parent.roundResult = { id: "result-overlay" };
    await parent.$nextTick();
    assert.strictEqual(parent.$refs.flowStage.scrollTop, 0);
    parent.stopRoundTicker(); child.stopFrame();

    const plan = createNoteFlowChordPlan({ selectedKey: "C-major", gameLength: 20 });
    const chordView = new Chords({ propsData: { plan } });
    chordView.$refs.flowStage = { scrollTop: 220 };
    chordView.roundResult = { id: "chord-overlay" };
    await chordView.$nextTick();
    assert.strictEqual(chordView.$refs.flowStage.scrollTop, 0);
  });
}
run().then(() => process.stdout.write("Note Flow live training: OK\n"))
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    global.performance = originals.performance;
    global.requestAnimationFrame = originals.raf;
    global.cancelAnimationFrame = originals.cancel;
    Storage.saveRound = originals.save;
  });
