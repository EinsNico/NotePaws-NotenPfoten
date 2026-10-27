const assert = require("assert");
const fs = require("fs");
const path = require("path");
const babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");
global.document = { addEventListener() {}, removeEventListener() {} };
global.window = { addEventListener() {}, removeEventListener() {} };
global.setInterval = ()=>1;global.clearInterval=()=>{};
const callbacks = new Set();
let revision = 0, delayMs = 250, resolveResume = null, contextState = null, ready = true;
const sync = {
  getState: () => ({ revision }),
  subscribe(fn) { callbacks.add(fn); fn({ revision }); return () => callbacks.delete(fn); },
  getDelayMs: () => delayMs,
  getContext: () => contextState,
  resume: () => resolveResume ? new Promise(resolve => { resolveResume.push(resolve); }) : Promise.resolve(ready)
};
function evaluate(source, imports) {
  const output = { exports: {} };
  const compiled = babel.transform(source, { babelrc: false, presets: [["env", { modules: "commonjs" }]] }).code;
  new Function("require", "module", "exports", compiled)(name => imports[name] || {}, output, output.exports);
  return output.exports;
}
const helper = evaluate(fs.readFileSync(path.resolve(__dirname, "../src/model/AudioSynchronizationPlayback.js"), "utf8"), {
  "./AudioSynchronization": sync
});
const renderingSnapshot = evaluate(fs.readFileSync(path.resolve(__dirname,
  "../src/model/NoteFlowRenderingSnapshot.js"), "utf8"), {});
let active = false, startCount = 0, lastOptions = null, playerOptions = null, plays = [];
const player = { stopAll() {}, play(value, volume) { plays.push([value, volume]); return {}; } };
function playback(options) {
  lastOptions = options;
  return { getPosition() {return 0;}, getTimeline() {return {events:[],measures:[],durationMs:0};}, start() { active = true; startCount++; return true; }, stop() { active = false; options.onStop(); } };
}
function component(name) {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/components", name + ".vue"), "utf8");
  return evaluate(source.match(/<script>([\s\S]*?)<\/script>/)[1], {
    "../model/AudioSynchronization": sync,
    "../model/AudioSynchronizationPlayback": helper,
    "../model/NoteFlowRenderingSnapshot": renderingSnapshot,
    "../model/PianoAudio": { createPianoSamplePlayer(options) { playerOptions = options; return player; } },
    "../model/WorkshopPianoAudio": { createWorkshopPianoPlayer() { return Object.assign({ prepare:async () => true },player); } },
    "../model/WorkshopPracticePersistence": { flushWorkshopPracticePersistence() { return true; } },
    "../model/Options": { appVolume: 37 },
    "../model/ScreenAwakeMixin": {createScreenAwakeMixin:()=>({})},
    "../model/MidiConnection": {connectedMidiInputs:()=>[],MIDI_CONNECTION_CHECK_INTERVAL_MS:1000},
    "../model/NoteFlowViewport": { lockNoteFlowViewport() { return () => {}; } },
    "../model/NoteFlowPreviewAudition": { createNoteFlowPreviewAudition(timeline, options) { return playback(options); } },
    "../model/NoteFlowChordAudition": { createNoteFlowChordAudition(plan, options) { return playback(options); } },
    "../model/WorkshopPlayback": { createWorkshopPlayback(score, inputPlayer, options) { return playback(options); } }
  }).default;
}
function routeChange() { revision++; callbacks.forEach(fn => fn({ revision })); }
function context(definition, values) { return Object.assign({}, definition.methods, values); }
async function run() {
  for (const [name, start, stop, extra] of [
    ["NoteFlowAlgorithmPreview", "listen", "stop", { timeline: { events: [] }, layout: { events: [] }, $refs: {} }],
    ["NoteFlowChordMenu", "startAudition", "stopAudition", { previewPlan: {}, rhythmScore: {}, savePreferences() {}, statisticsRequest: 0 }],
    ["Workshop", "startPlayback", "stopPlayback", { draft: { score: {} }, clearSelection() {}, $refs:{}, $nextTick(callback) { if(callback) callback(); return Promise.resolve(); } }]
  ]) {
    const definition = component(name), vm = context(definition, Object.assign({
      player, pianoPlayer: player, playing: false, auditionPlaying: false
    }, extra));
    definition.mounted.call(vm);
    assert.strictEqual(callbacks.size, 1);
    await vm[start]();
    assert(active, name + " starts after the audio context is resumed");
    if (name === "Workshop") assert.strictEqual(vm.listeningView, true, "whole-piece playback opens listening strip after resume");
    assert.strictEqual(lastOptions.delayMs, 250);
    delayMs = 400;
    assert.strictEqual(lastOptions.delayMs, 250, "the active controller owns a snapshot");
    routeChange(); assert(!active, name + " stops on output/timing revision");
    await vm[start](); assert.strictEqual(lastOptions.delayMs, 400);
    vm[stop]();
    contextState = { state: "suspended" }; ready = false;
    const beforeFailedStart = startCount;
    await vm[start]();
    assert.strictEqual(startCount, beforeFailedStart, name + " does not advance silently when its audio context cannot resume");
    contextState = null;
    await vm[start]();
    assert.strictEqual(startCount, beforeFailedStart + 1, name + " preserves the no-WebAudio HTMLAudio fallback");
    vm[stop](); ready = true;
    resolveResume = [];
    const starting = vm[start](), previousStarts = startCount;
    definition.beforeDestroy.call(vm);
    resolveResume.forEach(resolve => resolve(true)); resolveResume = null;
    await starting;
    assert.strictEqual(startCount, previousStarts, name + " cannot start after unmount during resume");
    assert.strictEqual(callbacks.size, 0, "lifecycle releases the global subscription");
    delayMs = 250;
  }
  for (const name of ["NoteFlowStaffPreview", "NoteFlowRhythmPreview", "NoteFlowChordTraining", "Game"]) {
    const definition = component(name);
    let pauses = 0;
    const vm = context(definition, {
      playbackStatus: "running", pianoPlayer: player,
      wrongPitchMarkers: [],
      resetMotion() {}, resetPreview() {}, startGame() {},
      pauseMotion() { pauses++; }, handleAppInterruption() { pauses++; },
      stopAnimationFrame() {}, stopInputSounds() {}, stopFrame() {}, stopAnimation() {}, stopTimerTicker() {}, onExit() {}
    });
    definition.mounted.call(vm);
    callbacks.forEach(fn => fn({ revision }));
    assert.strictEqual(pauses, 0, name + " ignores ordinary state notifications");
    routeChange(); assert.strictEqual(pauses, 1, name + " pauses without changing its input scoring model");
    definition.beforeDestroy.call(vm);
    assert.strictEqual(callbacks.size, 0);
  }
  const game = component("Game");
  const gameState = game.data.call({ mode: "normal" });
  assert.deepStrictEqual(playerOptions, { maxVoices: 1, feedback: true });
  game.methods.playNote.call(Object.assign(gameState, {
    options: { sound: false }, roundActive: true, gameReady: true, hasGeneratedExercise: true
  }), 48);
  assert.deepStrictEqual(plays, [[48, 37]], "single notes use the shared master player instead of old mode sound gates");
  for (const name of ["NoteFlowStaffPreview", "NoteFlowRhythmPreview"]) {
    const definition = component(name);
    definition.data.call({ cycle: {}, score: {} });
    assert.deepStrictEqual(playerOptions, { feedback: true }, name + " uses the shared player for live input");
  }
  console.log("Audio mode wiring: delay snapshots, output-change stop/pause, unmount cancellation, and shared feedback players OK.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
