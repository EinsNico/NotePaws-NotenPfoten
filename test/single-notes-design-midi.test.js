const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');
const compiler = require('vue-template-compiler');
const Vue = require('vue');
const original = { regeneratorRuntime: global.regeneratorRuntime, document: global.document,
  window: global.window, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
global.regeneratorRuntime = require('babel-runtime/regenerator');
global.document = { removeEventListener() {} };
global.window = { removeEventListener() {} };
function load(relative, deps = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
  const parsed = relative.endsWith('.vue') ? compiler.parseComponent(source) : null;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', babel.transform(parsed ? parsed.script.content : source,
    { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code)(module, module.exports, name => deps[name] || {});
  if (parsed) {
    const rendered = compiler.compileToFunctions(parsed.template.content);
    assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, [], relative);
    Object.assign(module.exports.default, rendered);
  }
  return module.exports;
}
const options = { inputMode: 'midi', gameLength: 20, preparationSeconds: 3, displayNote: false };
const adaptiveOptions = Object.assign({}, options);
const storage = { status: { state: 'ready' } };
let loadProgress = () => Promise.resolve();
let now = 0, timerId = 0;
const timers = new Map();
global.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; };
global.clearTimeout = id => timers.delete(id);
const game = load('components/Game.vue', {
  '../model/Options': options, '../model/AdaptiveOptions': adaptiveOptions,
  '../model/PracticePreparation': load('model/PracticePreparation.js'),
  '../model/ScreenAwakeMixin': { createScreenAwakeMixin: () => ({}) },
  '../model/PianoAudio': { createPianoSamplePlayer: () => ({ stopAll() {}, play() {} }) },
  '../model/AudioSynchronization': { resume() {} },
  '../model/AdaptiveProgress': { loadFromDatabase: () => loadProgress(), createSession: () => 'synthetic-session', recordResult() {}, finishSession() {} },
  '../model/AdaptiveExercises': { createAdaptiveCandidates: () => [] },
  '../model/AdaptiveLearning': { normalizeResponseTimeMs: value => value },
  '../model/SingleNotesLearningStorage': storage,
  '../model/Utils': { getNearestNoteOfValue: value => value },
  '../model/RoundPause': load('model/RoundPause.js')
}).default;
function makeGame(mode = 'normal') {
  let note = 46;
  const vm = new Vue(Object.assign({}, game, { mounted: undefined, beforeDestroy: undefined,
    propsData: { mode }, methods: Object.assign({}, game.methods, {
      getCurrentTimeMs: () => now,
      generateExercise: () => ({ clef: 'treble', staff: 'treble', value: note += 2, isSharp: true })
    }) }));
  vm.$t = key => key;
  return vm;
}
function tick(id) { const item = timers.get(id); assert(item); timers.delete(id); now += item.delay; item.callback(); }
function renderNote(vm) { vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId); }
function finishPreparation(vm) { renderNote(vm); while (vm.isPreparing) tick(vm.preparationTimer); }
function finish(vm) { vm.onExit(); vm.$destroy(); }
function text(vnode) { return vnode ? (vnode.text || '') + (vnode.children || []).map(text).join(' ') : ''; }
async function test(name, body) {
  timers.clear(); now = 0; options.preparationSeconds = 3; options.gameLength = 20;
  storage.status.state = 'ready'; loadProgress = () => Promise.resolve();
  await body(); process.stdout.write('✓ ' + name + '\n');
}
(async () => {
  await test('initial MIDI wait keeps note generation, preparation, clock, answers and audio idle', async () => {
    const vm = makeGame(); let sounds = 0; vm.pianoPlayer.play = () => sounds++;
    await vm.startGame(); assert(vm.waitingForMidi); assert(!vm.hasGeneratedExercise);
    now = 8000; renderNote(vm); vm.finishPreparation(vm.preparationId); vm.startRoundTimer();
    vm.checkAnswer(36, true); vm.playNote(36);
    assert.strictEqual(vm.timeLeft, 20); assert.strictEqual(vm.roundTimeRemainingMs, 20000);
    assert.strictEqual(timers.size, 0); assert.strictEqual(vm.numAnswers, 0); assert.strictEqual(sounds, 0);
    vm.handleMidiConnection(true); assert(!vm.waitingForMidi); assert(vm.isPreparing);
    assert.strictEqual(vm.currentExerciseId, 1); assert.strictEqual(vm.timer, null);
    finishPreparation(vm); assert.strictEqual(now, 11000); tick(vm.timer); assert.strictEqual(vm.timeLeft, 19);
    finish(vm);
  });
  await test('already-bound MIDI before parent start starts once, and zero preparation still waits for rendering', async () => {
    options.preparationSeconds = 0;
    const vm = makeGame(); vm.handleMidiConnection(true); await vm.startGame();
    assert(vm.isPreparing && !vm.waitingForMidi); assert.strictEqual(vm.timer, null);
    vm.handleMidiConnection(true); assert.strictEqual(vm.currentExerciseId, 1);
    renderNote(vm); assert(!vm.isPreparing); assert(timers.has(vm.timer)); finish(vm);
  });
  await test('live connection loss leaves clock, note, answers and preparation unchanged until chosen pause', async () => {
    const vm = makeGame(); await vm.startGame(); vm.handleMidiConnection(true); finishPreparation(vm);
    vm.checkAnswer(vm.currentExercise.value, true); renderNote(vm);
    const note = vm.currentExercise, id = vm.currentExerciseId, clock = vm.timer, prep = vm.preparationId;
    now += 400; vm.handleMidiConnection(false);
    assert(vm.midiConnectionLost && !vm.waitingForMidi && !vm.isPaused);
    assert.strictEqual(vm.timer, clock); vm.checkAnswer(note.value, true); assert.strictEqual(vm.numCorrect, 1);
    vm.updateRoundTime(); assert.strictEqual(vm.roundTimeRemainingMs, 19600);
    now += 500; vm.handleMidiConnection(true); assert(!vm.midiConnectionLost);
    assert.strictEqual(vm.currentExercise, note); assert.strictEqual(vm.currentExerciseId, id);
    assert.strictEqual(vm.preparationId, prep); assert.strictEqual(vm.timer, clock);
    vm.updateRoundTime(); assert.strictEqual(vm.roundTimeRemainingMs, 19100);
    vm.handleMidiConnection(false); vm.pauseGame(); const remaining = vm.roundTimeRemainingMs;
    now += 9000; vm.resumeGame(); assert(vm.isPaused); assert.strictEqual(vm.roundTimeRemainingMs, remaining);
    vm.handleMidiConnection(true); assert(vm.isPaused); vm.resumeGame(); finishPreparation(vm);
    assert.strictEqual(vm.currentExercise, note); assert.strictEqual(vm.roundTimeRemainingMs, remaining);
    finish(vm);
  });
  await test('loss during preparation cancels countdown callbacks and reconnect prepares the same fixed note', async () => {
    const vm = makeGame(); await vm.startGame(); vm.handleMidiConnection(true); renderNote(vm);
    const oldId = vm.preparationId, stale = timers.get(vm.preparationTimer).callback, note = vm.currentExercise;
    now += 500; vm.handleMidiConnection(false); assert(vm.waitingForMidi); assert.strictEqual(timers.size, 0);
    now += 9000; stale(); vm.finishPreparation(oldId); renderNote(vm);
    assert.strictEqual(vm.timer, null); assert.strictEqual(vm.timeLeft, 20);
    vm.handleMidiConnection(true); assert.strictEqual(vm.currentExercise, note);
    assert(vm.preparationId > oldId); stale(); assert.strictEqual(vm.timer, null);
    finishPreparation(vm); assert.strictEqual(vm.roundTimeRemainingMs, 20000); finish(vm);
  });
  await test('pause before first MIDI readiness defers generation until an explicit ready resume', async () => {
    const vm = makeGame(); await vm.startGame(); vm.pauseGame(); now += 5000;
    vm.handleMidiConnection(true); assert(vm.isPaused && !vm.hasGeneratedExercise);
    vm.resumeGame(); assert.strictEqual(vm.currentExerciseId, 1); finishPreparation(vm); finish(vm);
  });
  await test('adaptive readiness respects pending/error storage and cannot reopen an aborted round', async () => {
    let resolve; loadProgress = () => new Promise(done => { resolve = done; });
    const vm = makeGame('adaptive'); const starting = vm.startGame(); vm.handleMidiConnection(true);
    assert(vm.storageBlocked && !vm.hasGeneratedExercise); vm.quit(); resolve(); await starting;
    vm.handleMidiConnection(true); assert(vm.gameClosed && !vm.hasGeneratedExercise); vm.$destroy();
    storage.status.state = 'error'; loadProgress = () => Promise.resolve();
    const blocked = makeGame('adaptive'); await blocked.startGame(); blocked.handleMidiConnection(true);
    assert(blocked.storageBlocked && !blocked.hasGeneratedExercise); finish(blocked);
  });
  await test('adaptive response timing excludes paused preparation and the device wait without discarding active response time', async () => {
    options.preparationSeconds = 0;
    const vm = makeGame('adaptive'); await vm.startGame(); vm.handleMidiConnection(true); finishPreparation(vm);
    now = 1000; vm.checkAnswer(vm.currentExercise.value, true); renderNote(vm);
    now = 1500; vm.pauseGame(); now = 1750; options.preparationSeconds = 3; vm.resumeGame(); renderNote(vm);
    now = 2000; vm.handleMidiConnection(false); now = 5000; vm.handleMidiConnection(true); finishPreparation(vm);
    now = 8250; vm.captureFirstResponseTime(); assert.strictEqual(vm.currentExerciseResponseTimeMs, 750); finish(vm);
  });
  await test('round result carries the unlimited marker while score math and timed zero remain unchanged', async () => {
    const timed = makeGame(); await timed.startGame(); assert.strictEqual(timed.result.score, 0);
    assert.strictEqual(timed.result.isInfiniteRound, false); finish(timed);
    const unlimited = makeGame(); unlimited.options = Object.assign({}, options, { gameLength: 0 });
    await unlimited.startGame(); unlimited.handleMidiConnection(true); finishPreparation(unlimited);
    unlimited.checkAnswer(unlimited.currentExercise.value, true); assert.strictEqual(unlimited.result.score, 0);
    assert.strictEqual(unlimited.result.isInfiniteRound, true); assert.strictEqual(unlimited.timer, null); finish(unlimited);
  });
  await test('silent MIDI connection feedback is opt-in and never exposes note prompts or last-note text', async () => {
    const midi = load('components/MidiInput.vue', { '../model/Options': options,
      '../model/Utils': { getDisplayNoteNamesArray: () => ['C'] } }).default;
    const make = props => { const vm = new Vue(Object.assign({}, midi, { mounted: undefined, beforeDestroy: undefined, propsData: props })); vm.$t = key => key; return vm; };
    const hidden = make({ silent: true }); hidden.errorMessage = 'device missing'; assert.strictEqual(hidden._render().tag, undefined);
    const feedback = make({ silent: true, showConnectionFeedback: true }); feedback.errorMessage = 'device missing';
    assert(text(feedback._render()).includes('device missing')); feedback.midiPermissionPending = true;
    assert(text(feedback._render()).includes('MIDI_PERMISSION_PENDING')); feedback.lastNotePlayed = 'C4'; feedback.midiIsReady = true;
    assert(!text(feedback._render()).includes('lastNotePlayed')); assert(!text(feedback._render()).includes('C4'));
    const normal = make({}); normal.midiIsReady = true; assert(text(normal._render()).includes('playTheNote'));
    hidden.$destroy(); feedback.$destroy(); normal.$destroy();
  });
})().catch(error => { process.exitCode = 1; console.error(error); }).finally(() => Object.assign(global, original));
