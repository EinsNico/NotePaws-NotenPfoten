const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');
const Vue = require('vue');
const compiler = require('vue-template-compiler');
global.regeneratorRuntime = require('babel-runtime/regenerator');

// These are separate module realms sharing only storage, as two browser tabs do.
function realm(overrides = {}) {
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(__dirname, '../src', relative);
    if(cache.has(file)) return cache.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const parsed = file.endsWith('.vue') ? compiler.parseComponent(source) : null;
    const module = { exports: {} };
    cache.set(file, module.exports);
    new Function('module', 'exports', 'require', babel.transform(parsed ? parsed.script.content : source, {
      babelrc: false, presets: [['env', { modules: 'commonjs' }]]
    }).code)(module, module.exports, name => {
      if(Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name];
      if(name.startsWith('.')) {
        if(name.includes('/components/') || (parsed && !name.includes('/model/'))) return {};
        const relativeFile = path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(file), name));
        return load(relativeFile.endsWith('.js') ? relativeFile : relativeFile + '.js');
      }
      return require(name);
    });
    cache.set(file, module.exports);
    if(parsed) assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
    return module.exports;
  }
  return { load };
}

const values = new Map();
let failure = null;
let warnings = 0;
const previousWarn = console.warn;
console.warn = () => { warnings++; };
global.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) {
    if(failure && failure(key)) { const error = new Error('Synthetic full storage'); error.name = 'QuotaExceededError'; throw error; }
    values.set(key, String(value));
  },
  removeItem(key) { values.delete(key); },
  clear() { values.clear(); }
};
const Lockr = require('lockr'); // The production library deliberately swallows quota errors.
const options = { gameLength: 0, difficulty: 'easy', clef: ['treble'], accidentals: 'no', inputMode: 'button' };
const result = score => ({ score, accuracy: 100, numAnswers: 1, numCorrect: 1, numWrong: 0 });
const scoreKey = 'lastScores__treble__easy__no';
function newStatistics() {
  const context = realm();
  const statistics = context.load('model/Statistics.js').default;
  statistics.init();
  return { statistics, feedback: context.load('model/PersistenceFeedback.js') };
}
function test(name, body) {
  values.clear(); failure = null; warnings = 0;
  body();
  process.stdout.write('✓ ' + name + '\n');
}

(async () => { try {
  test('two already-open tabs retain both round IDs, score details and legacy scores after a fresh load', () => {
    const a = newStatistics().statistics, b = newStatistics().statistics;
    a.addRound(result(300), options, { id: 'round-A', completedAt: 1000 });
    b.addRound(result(150), options, { id: 'round-B', completedAt: 2000 });
    const fresh = newStatistics().statistics;
    assert.deepStrictEqual(fresh.rounds.map(round => round.id), ['round-A', 'round-B']);
    assert.deepStrictEqual(fresh.rounds.map(round => round.score), [300, 150]);
    assert.deepStrictEqual(Lockr.get(scoreKey), [300, 150]);
    assert.strictEqual(Lockr.get('record__treble__easy__no'), 300);
  });

  test('an old tab merges only its new round and cannot restore history deliberately removed elsewhere', () => {
    const a = newStatistics().statistics;
    a.addRound(result(1), options, { id: 'removed-round', completedAt: 1000 });
    const stale = newStatistics().statistics;
    Lockr.set('roundHistory', { version: 1, rounds: [] });
    stale.addRound(result(2), options, { id: 'new-round', completedAt: 2000 });
    assert.deepStrictEqual(newStatistics().statistics.rounds.map(round => round.id), ['new-round']);
  });

  test('actual Lockr quota failure preserves immutable results, reports globally and survives menu init until retry', () => {
    const { statistics, feedback } = newStatistics();
    failure = () => true;
    const mutable = result(250);
    const round = statistics.addRound(mutable, options, { id: 'unsaved-round', completedAt: 1000 });
    mutable.score = 999;
    assert.strictEqual(round.score, 250);
    assert.strictEqual(statistics.pendingRounds.length, 1);
    assert(feedback.hasPersistenceFailure('free-rounds'));
    assert.strictEqual(Lockr.get('roundHistory'), undefined);
    assert(warnings >= 3, 'quota is swallowed by actual Lockr, not a throwing Lockr mock');
    statistics.init();
    assert.strictEqual(statistics.rounds[0].score, 250);
    assert.strictEqual(statistics.pendingRounds.length, 1);
    failure = null;
    assert.strictEqual(statistics.retryPendingRounds(), true);
    assert.strictEqual(statistics.pendingRounds.length, 0);
    assert.strictEqual(feedback.hasPersistenceFailure('free-rounds'), false);
    assert.strictEqual(newStatistics().statistics.rounds[0].score, 250);
    assert.deepStrictEqual(Lockr.get(scoreKey), [250]);
  });

  test('retry merges an intervening other-tab round and neither duplicates IDs nor equal-valued legacy scores', () => {
    const a = newStatistics().statistics;
    failure = () => true;
    a.addRound(result(0), options, { id: 'pending-A', completedAt: 1000 });
    failure = null;
    const b = newStatistics().statistics;
    b.addRound(result(0), options, { id: 'committed-B', completedAt: 2000 });
    assert.strictEqual(a.retryPendingRounds(), true);
    assert.strictEqual(a.retryPendingRounds(), true);
    assert.deepStrictEqual(Lockr.get(scoreKey), [0, 0]);
    assert.deepStrictEqual(newStatistics().statistics.rounds.map(round => round.id), ['pending-A', 'committed-B']);
    a.addRound(result(0), options, { id: 'pending-A', completedAt: 1000 });
    assert.deepStrictEqual(Lockr.get(scoreKey), [0, 0]);
  });

  test('a partial history failure retries its unchanged round without appending the already saved score again', () => {
    const { statistics, feedback } = newStatistics();
    failure = key => key === 'roundHistory';
    statistics.addRound(result(40), options, { id: 'history-pending', completedAt: 1000 });
    assert.deepStrictEqual(Lockr.get(scoreKey), [40]);
    assert.strictEqual(statistics.pendingRounds.length, 1);
    assert(feedback.hasPersistenceFailure('free-rounds'));
    failure = null;
    assert(statistics.retryPendingRounds());
    assert.deepStrictEqual(Lockr.get(scoreKey), [40]);
    assert.strictEqual(newStatistics().statistics.rounds.length, 1);
  });

  test('a partial record failure preserves score/history receipts while retrying only the failed highscore', () => {
    const { statistics, feedback } = newStatistics();
    failure = key => key.startsWith('record__');
    statistics.addRound(result(50), options, { id: 'record-pending', completedAt: 1000 });
    assert.deepStrictEqual(Lockr.get(scoreKey), [50]);
    assert.strictEqual(Lockr.get('roundHistory').rounds.length, 1);
    assert(feedback.hasPersistenceFailure('free-rounds'));
    failure = null;
    assert(statistics.retryPendingRounds());
    assert.deepStrictEqual(Lockr.get(scoreKey), [50]);
    assert.strictEqual(Lockr.get('record__treble__easy__no'), 50);
  });

  test('the actual Game completion still emits results once without blocking when its storage fails', () => {
    const { statistics, feedback } = newStatistics();
    const component = realm({
      '../model/Statistics': statistics,
      '../model/Options': options,
      '../model/AdaptiveOptions': options,
      '../model/AdaptiveProgress': {},
      '../model/AdaptiveExercises': {},
      '../model/AudioSynchronization': {},
      '../model/AudioSynchronizationPlayback': {},
      '../model/Utils': {},
      '../model/PianoAudio': { createPianoSamplePlayer: () => ({ stopAll() {} }) },
      '../model/ScreenAwakeMixin': { createScreenAwakeMixin: () => ({}) },
      '../model/SingleNotesLearningStorage': { status: { state: 'ready' } }
    }).load('components/Game.vue').default;
    const vm = new Vue(Object.assign({}, component, { mounted: undefined, beforeDestroy: undefined,
      propsData: { mode: 'normal' }, methods: Object.assign({}, component.methods,
        { recordUnresolvedAdaptiveMistake() {}, finishAdaptiveLearningSession() {} }) }));
    vm.numCorrect = 2;
    vm.roundActive = true;
    let emitted = null, ended = 0;
    vm.$on('gameEnded', value => { emitted = value; ended++; });
    failure = () => true;
    vm.onGameFinished();
    assert.strictEqual(ended, 1);
    assert.strictEqual(emitted.numCorrect, 2);
    assert.strictEqual(vm.gameClosed, true);
    assert.strictEqual(vm.roundActive, false);
    assert(feedback.hasPersistenceFailure('free-rounds'));
    assert.strictEqual(statistics.pendingRounds.length, 1);
    failure = null;
    assert(statistics.retryPendingRounds());
    assert.strictEqual(newStatistics().statistics.rounds[0].numCorrect, 2);
    vm.$destroy();
  });

  values.clear(); failure = null;
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
  const previousWindow = global.window;
  global.window = {};
  let queue = Promise.resolve();
  let locks = 0;
  Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: {
    request(name, settings, callback) {
      assert.strictEqual(name, 'noten-pfoten-free-round-history');
      assert.strictEqual(settings.mode, 'exclusive');
      locks++;
      const pending = queue.then(callback);
      queue = pending.then(() => undefined, () => undefined);
      return pending;
    }
  } } });
  try {
    const a = newStatistics().statistics, b = newStatistics().statistics;
    a.addRound(result(10), options, { id: 'concurrent-A', completedAt: 1000 });
    b.addRound(result(20), options, { id: 'concurrent-B', completedAt: 2000 });
    assert.strictEqual(a.rounds.length, 1, 'a new result is already available while its lock is pending');
    assert.strictEqual(b.rounds.length, 1);
    await Promise.all([a.roundSavePromise, b.roundSavePromise]);
    assert.strictEqual(locks, 2);
    assert.deepStrictEqual(newStatistics().statistics.rounds.map(round => round.id), ['concurrent-A', 'concurrent-B']);
    assert.deepStrictEqual(Lockr.get(scoreKey), [10, 20]);
    process.stdout.write('✓ Web Locks serialize simultaneous commits from independent tab realms\n');
    const context = newStatistics();
    failure = () => true;
    context.statistics.addRound(result(30), options, { id: 'locked-quota', completedAt: 3000 });
    await context.statistics.roundSavePromise;
    assert(context.feedback.hasPersistenceFailure('free-rounds'));
    assert.strictEqual(context.statistics.pendingRounds.length, 1);
    failure = null;
    assert(await context.feedback.retryPersistenceFailures());
    assert.strictEqual(newStatistics().statistics.rounds.length, 3);
    process.stdout.write('✓ An asynchronous locked quota failure reaches the global warning and retries successfully\n');
  } finally {
    if(navigatorDescriptor) Object.defineProperty(global, 'navigator', navigatorDescriptor);
    else delete global.navigator;
    if(previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
} finally { console.warn = previousWarn; } })().catch(error => { console.error(error); process.exitCode = 1; });
