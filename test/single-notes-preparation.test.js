const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');
const compiler = require('vue-template-compiler');
const Vue = require('vue');

const previous = {
  regeneratorRuntime: global.regeneratorRuntime,
  document: global.document, window: global.window,
  setTimeout: global.setTimeout, clearTimeout: global.clearTimeout
};
global.regeneratorRuntime = require('babel-runtime/regenerator');
global.document = { removeEventListener() {} };
global.window = { removeEventListener() {} };

function load(relative, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
  const parsed = relative.endsWith('.vue') ? compiler.parseComponent(source) : null;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', babel.transform(parsed ? parsed.script.content : source, {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code)(module, module.exports, name => dependencies[name] || {});
  if (parsed) assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, [], relative);
  return module.exports;
}

const options = { gameLength: 20, preparationSeconds: 3, inputMode: 'button', displayNote: false };
const adaptiveOptions = Object.assign({}, options, { preparationSeconds: 0 });
const progress = {
  loadFromDatabase: () => Promise.resolve(),
  createSession: () => 'session', recordResult() {}, finishSession() {}
};
const game = load('components/Game.vue', {
  '../model/Options': options,
  '../model/AdaptiveOptions': adaptiveOptions,
  '../model/PracticePreparation': load('model/PracticePreparation.js'),
  '../model/ScreenAwakeMixin': {
    createScreenAwakeMixin: predicate => ({ computed: { testWakeRequested() { return predicate.call(this); } } })
  },
  '../model/PianoAudio': { createPianoSamplePlayer: () => ({ stopAll() {}, play() {} }) },
  '../model/AudioSynchronization': { resume() {} },
  '../model/AdaptiveProgress': progress,
  '../model/AdaptiveExercises': { createAdaptiveCandidates: () => [] },
  '../model/AdaptiveLearning': { normalizeResponseTimeMs: value => value },
  '../model/SingleNotesLearningStorage': { status: { state: 'ready' } },
  '../model/Utils': { getNearestNoteOfValue: value => value },
  '../model/RoundPause': load('model/RoundPause.js')
}).default;

let now = 0;
let nextTimerId = 0;
const timeouts = new Map();
global.setTimeout = (callback, delay) => { const id = ++nextTimerId; timeouts.set(id, { callback, delay }); return id; };
global.clearTimeout = id => timeouts.delete(id);

function makeGame(mode = 'normal') {
  return new Vue(Object.assign({}, game, {
    mounted: undefined, beforeDestroy: undefined,
    propsData: { mode },
    methods: Object.assign({}, game.methods, {
      getCurrentTimeMs: () => now,
      generateExercise: () => ({ clef: 'treble', staff: 'treble', value: 48, isSharp: true })
    })
  }));
}

function tickTimer(timerId, lateByMs = 0) {
  const pending = timeouts.get(timerId);
  assert(pending, 'the countdown schedules the next number');
  assert(pending.delay > 0 && pending.delay <= 1000);
  timeouts.delete(timerId);
  now += pending.delay + lateByMs;
  pending.callback();
}

function tickCountdown(vm, lateByMs = 0) { tickTimer(vm.preparationTimer, lateByMs); }
function tickRoundClock(vm) { tickTimer(vm.timer); }

function finishCountdown(vm) {
  while(vm.isPreparing) tickCountdown(vm);
}

async function test(name, body) {
  timeouts.clear(); now = 0; options.preparationSeconds = 3;
  await body();
  process.stdout.write('✓ ' + name + '\n');
}

(async () => {
  await test('fresh training counts 3, 2, 1 without counting early MIDI or screen answers', async () => {
    const vm = makeGame();
    let sounds = 0;
    vm.pianoPlayer.play = () => { sounds += 1; };
    await vm.startGame();
    assert(vm.isPreparing && vm.testWakeRequested, 'preparation keeps the active exercise awake');
    assert.strictEqual(vm.timeLeft, 20);
    assert.strictEqual(vm.timer, null);
    vm.checkAnswer(48, true); vm.checkAnswer(1); vm.playNote(48);
    assert.strictEqual(vm.numAnswers, 0);
    assert.strictEqual(sounds, 0);
    assert.strictEqual(vm.currentExerciseId, 1);
    assert.strictEqual(vm.preparationRemainingSeconds, 3);
    vm.onExerciseRendered(0, vm.preparationId);
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId - 1);
    assert.strictEqual(timeouts.size, 0, 'old renders cannot start a new countdown');
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    assert.strictEqual(timeouts.size, 1);
    tickCountdown(vm);
    assert.strictEqual(vm.preparationRemainingSeconds, 2);
    vm.checkAnswer(48, true);
    assert.strictEqual(vm.numAnswers, 0);
    assert.strictEqual(vm.timer, null);
    tickCountdown(vm);
    assert.strictEqual(vm.preparationRemainingSeconds, 1);
    tickCountdown(vm);
    assert.strictEqual(now, 3000);
    assert.strictEqual(vm.preparationRemainingSeconds, 0);
    assert.strictEqual(vm.isPreparing, false);
    assert(timeouts.has(vm.timer), 'the active round schedules its clock boundary');
    tickRoundClock(vm);
    assert.strictEqual(vm.timeLeft, 19);
    vm.checkAnswer(48, true);
    assert.strictEqual(vm.numCorrect, 1);
    assert.strictEqual(vm.currentExerciseId, 2);
    assert.strictEqual(vm.isPreparing, false, 'subsequent notes keep their ordinary immediate flow');
    vm.onExit(); vm.$destroy();
  });

  await test('zero preparation starts as soon as the rendered note is ready and unlimited rounds have no clock', async () => {
    options.preparationSeconds = 0;
    const vm = makeGame();
    await vm.startGame();
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    assert.strictEqual(vm.isPreparing, false);
    assert.strictEqual(vm.preparationTimer, null);
    assert(timeouts.has(vm.timer), 'the active round schedules its clock boundary');
    vm.onExit(); vm.$destroy();
    const unlimited = makeGame();
    unlimited.options = Object.assign({}, options, { gameLength: 0 });
    await unlimited.startGame();
    unlimited.onExerciseRendered(unlimited.currentExerciseId, unlimited.preparationId);
    assert.strictEqual(unlimited.timer, null);
    unlimited.checkAnswer(48, true);
    assert.strictEqual(unlimited.numCorrect, 1);
    unlimited.onExit(); unlimited.$destroy();
  });

  await test('a five-second countdown resets on resume and preserves the note and round time', async () => {
    options.preparationSeconds = 5;
    const vm = makeGame();
    await vm.startGame();
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    const oldCountdown = timeouts.get(vm.preparationTimer).callback;
    const note = vm.currentExercise;
    assert.strictEqual(vm.preparationRemainingSeconds, 5);
    tickCountdown(vm);
    assert.strictEqual(vm.preparationRemainingSeconds, 4);
    vm.pauseGame();
    assert.strictEqual(timeouts.size, 0);
    assert.strictEqual(vm.testWakeRequested, false);
    vm.resumeGame();
    assert(vm.isPreparing);
    assert.strictEqual(vm.currentExercise, note);
    assert.strictEqual(vm.preparationRemainingSeconds, 5);
    oldCountdown();
    assert(vm.isPreparing, 'a stale timeout cannot finish the new countdown');
    assert.strictEqual(vm.timer, null);
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    const countdownNumbers = [];
    while(vm.isPreparing){
      countdownNumbers.push(vm.preparationRemainingSeconds);
      tickCountdown(vm);
    }
    assert.deepStrictEqual(countdownNumbers, [5, 4, 3, 2, 1]);
    assert.strictEqual(vm.timeLeft, 20);
    tickRoundClock(vm);
    assert.strictEqual(vm.timeLeft, 19);
    vm.pauseGame(); vm.resumeGame();
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    finishCountdown(vm);
    assert.strictEqual(vm.timeLeft, 19);
    vm.onExit(); vm.$destroy();
  });

  await test('learning mode uses the global countdown and excludes pause plus preparation from response timing', async () => {
    const vm = makeGame('adaptive');
    await vm.startGame();
    assert.strictEqual(vm.preparationSeconds, 3, 'a legacy adaptive preference cannot override the global choice');
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    finishCountdown(vm);
    now = 4000;
    vm.shouldMeasureCurrentExercise = true;
    vm.exerciseRenderedAtMs = now;
    now = 4100;
    vm.pauseGame();
    now = 7100;
    vm.resumeGame();
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    vm.checkAnswer(48, true);
    assert.strictEqual(vm.numAnswers, 0);
    now = 7600;
    vm.pauseGame();
    assert.strictEqual(timeouts.size, 0);
    now = 10600;
    vm.resumeGame();
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    finishCountdown(vm);
    now += 100;
    vm.captureFirstResponseTime();
    assert.strictEqual(vm.currentExerciseResponseTimeMs, 200, 'even an interrupted resume countdown is excluded');
    vm.onExit(); vm.$destroy();
  });

  await test('destruction cancels preparation and late asynchronous learning loads cannot restart the round', async () => {
    const vm = makeGame();
    await vm.startGame();
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    const late = timeouts.get(vm.preparationTimer).callback;
    game.beforeDestroy.call(vm);
    late();
    assert.strictEqual(timeouts.size, 0);
    assert.strictEqual(vm.timer, null);
    assert.strictEqual(vm.testWakeRequested, false);
    vm.$destroy();

    let resolveLoad;
    progress.loadFromDatabase = () => new Promise(resolve => { resolveLoad = resolve; });
    const learning = makeGame('adaptive');
    const loading = learning.startGame();
    assert.strictEqual(learning.gameReady, false);
    game.beforeDestroy.call(learning);
    resolveLoad(); await loading;
    assert.strictEqual(learning.hasGeneratedExercise, false);
    assert.strictEqual(timeouts.size, 0);
    assert.strictEqual(learning.timer, null);
    learning.$destroy();
    progress.loadFromDatabase = () => Promise.resolve();
  });

  await test('late callbacks stay on the original countdown clock and restarting rejects the previous timeout', async () => {
    const vm = makeGame();
    await vm.startGame();
    // Rendering readiness anchors the countdown; time spent before rendering
    // must not shorten the user's preparation or run the round clock.
    now = 400;
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    const oldCountdown = timeouts.get(vm.preparationTimer).callback;
    tickCountdown(vm, 250);
    assert.strictEqual(now, 1650);
    assert.strictEqual(vm.preparationRemainingSeconds, 2);
    assert.strictEqual(timeouts.get(vm.preparationTimer).delay, 750);
    tickCountdown(vm, 1250);
    assert.strictEqual(vm.preparationRemainingSeconds, 0, 'late callbacks do not add preparation time');
    assert.strictEqual(vm.isPreparing, false);
    assert.strictEqual(vm.timeLeft, 20);
    await vm.startGame();
    oldCountdown();
    assert.strictEqual(vm.preparationRemainingSeconds, 3);
    assert.strictEqual(timeouts.size, 0, 'a restarted round waits for its own render');
    assert.strictEqual(vm.timer, null);
    vm.onExit(); vm.$destroy();
  });

  await test('the display renders a countdown instead of moving notes and keeps note preview blocked until ready', () => {
    const display = load('components/NoteDisplay.vue').default;
    const note = { style: {} };
    const renderedEvents = [];
    let renderCalls = 0;
    const svg = {
      setAttribute(name, value){ assert.strictEqual(name, 'preserveAspectRatio'); assert.strictEqual(value, 'xMidYMid meet'); }
    };
    const instance = { isPreparing: true, preparationRemainingSeconds: 5,
      exerciseId: 1, preparationId: 2, abc: 'K:C\nC',
      unselect() {}, $nextTick: callback => callback(),
      $el: { querySelector: () => svg },
      $emit: (...event) => renderedEvents.push(event) };
    const renderingDisplay = load('components/NoteDisplay.vue', {
      abcjs: { renderAbc() { renderCalls += 1; } }
    }).default;
    renderingDisplay.methods.renderNote.call(instance);
    assert.strictEqual(renderCalls, 1);
    assert.deepStrictEqual(renderedEvents, [['rendered', 1, 2]]);
    assert.deepStrictEqual(note.style, {}, 'no transform or motion is written to notes');
    assert.strictEqual(display.computed.showCountdown.call(instance), true);
    display.methods.playCurrentNote.call(instance);
    assert.strictEqual(renderedEvents.length, 1);
    instance.isPreparing = false;
    assert.strictEqual(display.computed.showCountdown.call(instance), false);
    display.methods.playCurrentNote.call(instance);
    assert.deepStrictEqual(renderedEvents[1], ['play']);
    const template = compiler.parseComponent(fs.readFileSync(path.join(__dirname, '../src/components/NoteDisplay.vue'), 'utf8')).template.content;
    const renderedDisplay = new Vue(Object.assign({}, display, compiler.compileToFunctions(template), {
      mounted: undefined,
      propsData: { currentExercise: { value: 48, clef: 'treble', staff: 'treble', isSharp: true },
        isPreparing: true, preparationRemainingSeconds: 3 },
      methods: Object.assign({}, display.methods, { $t: key => key })
    }));
    const children = renderedDisplay._render().children;
    assert(children[0].data.class['note-hidden-for-countdown']);
    const countdown = children.find(child => child.data && child.data.staticClass === 'note-preparation-countdown');
    assert(countdown);
    assert.strictEqual(countdown.children.find(child => child.tag === 'strong').children[0].text, '3');
    renderedDisplay.$destroy();
  });
  await test('free response timing excludes countdown, pauses and corrected wrong answers', async () => {
    const vm = makeGame();
    await vm.startGame();
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    finishCountdown(vm);
    now += 800;
    vm.captureFirstResponseTime(); vm.onCorrectAnswer(48, true);
    assert.strictEqual(vm.timedNoteCount, 1);
    assert.strictEqual(vm.responseTimeTotalMs, 800);
    vm.generateNewExercise(); vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    now += 200; vm.pauseGame(); now += 10000; vm.resumeGame();
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId); finishCountdown(vm);
    now += 800; vm.captureFirstResponseTime(); vm.onCorrectAnswer(48, true);
    assert.strictEqual(vm.responseTimeTotalMs, 1800);
    vm.generateNewExercise(); vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    now += 400; vm.captureFirstResponseTime(); vm.onWrongAnswer();
    now += 900; vm.onCorrectAnswer(48, true);
    assert.strictEqual(vm.result.timedNoteCount, 2);
    assert.strictEqual(vm.result.responseTimeTotalMs, 1800);
    vm.$destroy();
  });
  process.stdout.write('Single-note countdown and timing: 8 lifecycle groups passed.\n');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  Object.keys(previous).forEach(key => { global[key] = previous[key]; });
});
