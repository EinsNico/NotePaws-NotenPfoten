const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');
const Vue = require('vue');
const compiler = require('vue-template-compiler');
global.regeneratorRuntime = require('babel-runtime/regenerator');

const cache = new Map();
function load(relative, dependencies = {}) {
  const file = path.resolve(__dirname, '../src', relative);
  if(!file.endsWith('.vue') && cache.has(file)) return cache.get(file);
  const text = fs.readFileSync(file, 'utf8');
  const parsed = file.endsWith('.vue') ? compiler.parseComponent(text) : null;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', babel.transform(parsed ? parsed.script.content : text, {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code)(module, module.exports, name => {
    if(Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
    if(name.startsWith('.')) {
      if(parsed && !name.includes('/model/')) return {};
      // Resolve relative to the actual module, including transitive model imports.
      const resolved = path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(path.resolve(__dirname, '../src', relative)), name));
      return load(resolved.endsWith('.js') ? resolved : resolved + '.js');
    }
    return require(name);
  });
  if(parsed) {
    assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
    Object.assign(module.exports.default, compiler.compileToFunctions(parsed.template.content));
  } else cache.set(file, module.exports);
  return module.exports;
}
const { RhythmSenseRoundWriter, RHYTHM_SENSE_SCOPE } = load('model/RhythmSenseRoundStorage.js');
function flatten(node) { return !node ? [] : [node].concat((node.children || []).flatMap(flatten)); }
function text(vm) { return flatten(vm._render()).filter(node => node.text).map(node => node.text).join(' '); }
async function settle() { for(let i = 0; i < 40; i++) await Promise.resolve(); await Vue.nextTick(); }
const timers = { setInterval: global.setInterval, clearInterval: global.clearInterval };
global.setInterval = () => 1;
global.clearInterval = () => {};

(async () => {
  const transactions = [], saved = new Map();
  let rejectOld, failedSession = null, delayedSession = null;
  let delayed = false;
  const oldTransaction = new Promise((resolve, reject) => { rejectOld = reject; });
  const writer = new RhythmSenseRoundWriter({ openDatabase: () => ({
    recordNoteFlowRound(scope, record) {
      assert.strictEqual(scope, RHYTHM_SENSE_SCOPE);
      transactions.push({ id: record.id, sessionId: record.sessionId, barNumber: record.barNumber });
      if(record.sessionId === delayedSession && record.barNumber === 3 && !delayed) {
        delayed = true;
        return oldTransaction;
      }
      if(record.sessionId === failedSession) return Promise.reject(new Error('Synthetic failed rhythm transaction'));
      const duplicate = saved.has(record.id);
      saved.set(record.id, JSON.parse(JSON.stringify(record)));
      return Promise.resolve({ duplicate });
    }, close() {}
  }) });
  const definition = load('components/RhythmSense.vue', {
    '../model/Options': { appVolume: 100, rhythmSenseSettings: null, vibration: false },
    '../model/RhythmSenseRoundStorage': writer,
    '../model/AudioSynchronization': {},
    '../model/ScreenAwakeMixin': { createScreenAwakeMixin: () => ({}) }
  }).default;
  const vm = new Vue(Object.assign({}, definition, { created: undefined, beforeDestroy: undefined,
    methods: Object.assign({}, definition.methods, { $t: key => key, scheduleBarAudio() {}, tick() {} }) }));
  vm.screen = 'training'; vm.meter = '2/4'; vm.bpm = 120; vm.roundLength = 3;
  vm.startReady();
  const oldSession = vm.sessionId;
  delayedSession = oldSession;
  for(let i = 0; i < 3; i++) { vm.completeBar(); if(i < 2) vm.beginNextBar(); }
  vm.showFinalResult();
  assert.strictEqual(vm.completedBarCount, 3);
  assert.strictEqual(vm.storageError, false);
  assert.strictEqual(vm.currentRoundSaved, false);
  assert(text(vm).includes('RHYTHM_SAVE_PENDING'));
  assert(!text(vm).includes('RHYTHM_EVAL_SAVED'), 'pending work must never render a save confirmation');
  process.stdout.write('✓ The actual writer queue leaves a completed three-bar result pending until its commits settle\n');

  await settle();
  assert.strictEqual(vm.storagePendingCount, 1);
  assert.deepStrictEqual(transactions.map(record => record.barNumber), [1, 2, 3]);
  vm.startReady();
  const currentSession = vm.sessionId;
  assert.notStrictEqual(currentSession, oldSession);
  assert.strictEqual(vm.storagePendingCount, 0);
  assert.strictEqual(vm.storageError, false);
  rejectOld(new Error('Synthetic delayed previous-round transaction failure'));
  await settle();
  assert.strictEqual(vm.completedBarCount, 0);
  assert.strictEqual(vm.storageError, false);
  assert.strictEqual(vm.storagePendingCount, 0);
  assert.strictEqual(vm.previousStorageError, true);
  const previousWarning = text(vm);
  assert(previousWarning.includes('RHYTHM_SAVE_PREVIOUS_FAILED'));
  assert(!previousWarning.includes('RHYTHM_SAVE_FAILED'), 'previous-round failure must not become the current-round error');
  process.stdout.write('✓ A delayed old transaction failure stays in its own session and renders an explicit previous-round warning\n');

  vm.completeBar(); vm.showFinalResult();
  await settle();
  assert.strictEqual(vm.sessionId, currentSession);
  assert.strictEqual(vm.currentRoundSaved, true);
  assert.strictEqual(vm.storageError, false);
  assert.strictEqual(vm.previousStorageError, true);
  assert(text(vm).includes('RHYTHM_EVAL_SAVED'), 'an old failure cannot suppress the new successful result receipt');
  process.stdout.write('✓ A new round receives its own successful save receipt despite an earlier session failure\n');

  assert.strictEqual(await vm.retryFailedBars(), true);
  await settle();
  assert.strictEqual(vm.previousStorageError, false);
  assert.strictEqual(vm.currentRoundSaved, true);
  assert.strictEqual(saved.size, 4);
  assert.strictEqual(transactions.filter(record => record.sessionId === oldSession && record.barNumber === 3).length, 2);
  assert(!text(vm).includes('RHYTHM_SAVE_PREVIOUS_FAILED'));
  process.stdout.write('✓ Retrying an immutable failed old bar clears only its session warning without duplicating saved bars\n');

  vm.startReady();
  assert.strictEqual(Object.keys(vm.barSaveSessions).length, 0, 'successful prior session states are pruned');
  failedSession = vm.sessionId;
  vm.completeBar(); vm.showFinalResult();
  await settle();
  assert.strictEqual(vm.storageError, true);
  assert.strictEqual(vm.currentRoundSaved, false);
  assert.strictEqual(vm.storagePendingCount, 0);
  assert(text(vm).includes('RHYTHM_SAVE_FAILED'));
  assert(!text(vm).includes('RHYTHM_EVAL_SAVED'));
  const countBeforeRetry = saved.size;
  failedSession = null;
  assert.strictEqual(await vm.retryFailedBars(), true);
  await settle();
  assert.strictEqual(vm.storageError, false);
  assert.strictEqual(vm.currentRoundSaved, true);
  assert.strictEqual(saved.size, countBeforeRetry + 1);
  process.stdout.write('✓ Current-session transaction errors preserve the bar and become saved only after confirmed retry\n');

  for(const locale of ['de', 'en']) {
    const dictionary = load('resources/' + locale + '.js').default;
    ['RHYTHM_SAVE_PENDING', 'RHYTHM_SAVE_PREVIOUS_FAILED', 'RHYTHM_SAVE_RETRY',
      'RHYTHM_SAVE_FAILED', 'RHYTHM_EVAL_SAVED'].forEach(key => assert.strictEqual(typeof dictionary[key], 'string'));
    vm.$t = (key, values = {}) => (dictionary[key] || key).replace(/\{(\w+)\}/g, (match, field) => values[field] === undefined ? match : values[field]);
    assert(text(vm).includes(dictionary.RHYTHM_EVAL_SAVED));
    assert(!text(vm).includes(dictionary.RHYTHM_SAVE_PENDING));
    assert(!text(vm).includes(dictionary.RHYTHM_SAVE_FAILED));
  }
  process.stdout.write('✓ German and English result rendering shows the correct confirmed receipt without stale/pending warnings\n');

  vm.$destroy();
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.setInterval = timers.setInterval; global.clearInterval = timers.clearInterval;
});
