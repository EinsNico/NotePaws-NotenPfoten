const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('babel-core');
const compiler = require('vue-template-compiler');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const entries = new Map();
let rejectWrites = false;
global.localStorage = {
  getItem(key) { return entries.has(key) ? entries.get(key) : null; },
  setItem(key, value) { if (rejectWrites) throw new Error('QuotaExceededError'); entries.set(key, String(value)); },
  removeItem(key) { entries.delete(key); }
};
global.window = { setTimeout };
global.navigator = {};
const originalLoader = Module._extensions['.js'];
const sourceRoot = path.resolve(__dirname, '../src') + path.sep;
Module._extensions['.js'] = function(module, filename) {
  if (!filename.startsWith(sourceRoot)) return originalLoader(module, filename);
  const code = babel.transform(fs.readFileSync(filename, 'utf8'), { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code;
  module._compile(code, filename);
};
const Lockr = require('lockr');
const Options = require('../src/model/Options').default;
const audioModule = require('../src/model/AudioSynchronization');
const feedback = require('../src/model/PersistenceFeedback');
const { writeVerified } = require('../src/model/VerifiedPersistence');
const translations = { de: require('../src/resources/de').default, en: require('../src/resources/en').default };
Module._extensions['.js'] = originalLoader;
function component(file, imports) {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/components', file), 'utf8');
  const code = babel.transform(compiler.parseComponent(source).script.content, { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', code)(module, module.exports, name => imports[name] || {});
  return module.exports.default;
}
function instance(definition, extra) {
  const value = Object.assign({}, definition.data ? definition.data.call(extra || {}) : {}, extra);
  Object.keys(definition.methods || {}).forEach(key => { value[key] = definition.methods[key].bind(value); });
  Object.keys(definition.computed || {}).forEach(key => {
    Object.defineProperty(value, key, { get: () => definition.computed[key].call(value) });
  });
  return value;
}
async function test(name, run) { await run(); console.log('✓ ' + name); }
const warn = console.warn;
console.warn = () => {};
(async () => {
  await test('real Lockr silently rejected writes are detected; matching durable values remain valid', () => {
    assert(writeVerified(Lockr, 'probe', { value: 1 }));
    rejectWrites = true;
    assert.strictEqual(writeVerified(Lockr, 'probe', { value: 2 }), false);
    assert.deepStrictEqual(Lockr.get('probe'), { value: 1 });
    assert(writeVerified(Lockr, 'probe', { value: 1 }));
    rejectWrites = false;
  });
  await test('unsaved settings survive navigation/load and failed retry, then save exactly the pending values', async () => {
    Options.language = 'de'; Options.appVolume = 60;
    assert.strictEqual(Options.saveOptions(), true);
    rejectWrites = true;
    Options.language = 'en'; Options.appVolume = 35;
    assert.strictEqual(Options.saveOptions(), false);
    assert(feedback.hasPersistenceFailure('options'));
    Options.loadOptions();
    assert.strictEqual(Options.language, 'en'); assert.strictEqual(Options.appVolume, 35);
    assert.strictEqual(await feedback.retryPersistenceFailures(), false);
    assert.strictEqual(Lockr.get('options').language, 'de');
    const settings = component('AppSettingsMenu.vue', { '../model/Options': Options });
    // Navigation is still allowed; the durable warning belongs to App, not this page.
    assert(fs.readFileSync(path.join(sourceRoot, 'App.vue'), 'utf8').includes('<div class="persistence-notice-layer"><PersistenceNotice /></div>'));
    assert(settings.methods.goBack);
    let exited = false;
    settings.methods.goBack.call({ storageBusy: false, resetInProgress: false, resetStep: '', $refs: {},
      saveOptions: () => Options.saveOptions(), $emit: event => { exited = event === 'back'; } });
    assert(exited, 'Storage failure must not block leaving settings');
    assert(feedback.hasPersistenceFailure('options'));
    rejectWrites = false;
    assert.strictEqual(await feedback.retryPersistenceFailures(), true);
    assert.strictEqual(Lockr.get('options').language, 'en');
    assert.strictEqual(Lockr.get('options').appVolume, 35);
    assert.strictEqual(Lockr.get('options').sources, undefined);
  });
  await test('manual calibration retains current delay and reports failure without claiming a durable save', async () => {
    const sync = audioModule.createAudioSynchronization({ storage: Lockr });
    sync.updateSettings({ automatic: false, manualMs: 175 });
    rejectWrites = true;
    const settings = component('AudioSyncSettings.vue', { '../model/AudioSynchronization': sync });
    const vm = instance(settings, { disabled: false, $t: (key, args) => translations.de[key].replace('{delay}', args && args.delay) });
    vm.exerciseId = 0; vm.exerciseTimers = []; vm.checkSources = [];
    global.document = { addEventListener() {}, removeEventListener() {} };
    settings.created.call(vm);
    vm.result = { ok: true, delayMs: 300, acceptedCount: 16 };
    vm.applyResult();
    assert.strictEqual(sync.getState().delayMs, 300);
    assert.strictEqual(sync.getState().storageSaved, false);
    assert(vm.notice.includes('vorübergehend'));
    assert.strictEqual(Lockr.get(audioModule.AUDIO_SYNC_STORAGE_KEY).manualMs, 175);
    assert(feedback.hasPersistenceFailure('audio-sync'));
    let last;
    sync.subscribe(state => { last = state; });
    rejectWrites = false;
    assert(await feedback.retryPersistenceFailures());
    assert.strictEqual(last.storageSaved, true);
    assert(vm.notice.includes('übernommen') && !vm.notice.includes('vorübergehend'));
    assert.strictEqual(Lockr.get(audioModule.AUDIO_SYNC_STORAGE_KEY).manualMs, 300);
    sync.dispose();
  });
  await test('backup export refuses stale options and pending rounds; it does not include local audio compensation', async () => {
    let exports = 0;
    const manager = component('SaveDataManager.vue', {
      '../model/PersistenceFeedback': feedback,
      '../model/SaveDataFiles': { async createIndexedDbSaveDataExport() { exports++; throw new Error('Reached verified export'); } }
    });
    const vm = instance(manager, { $t: key => key, $emit() {} });
    feedback.reportPersistenceFailure('options', 'PERSISTENCE_OPTIONS', () => false);
    await vm.exportBackup();
    assert.strictEqual(exports, 0); assert.strictEqual(vm.errorMessage, 'SAVE_DATA_UNSAVED_CHANGES');
    assert.strictEqual(vm.isBusy, false);
    feedback.clearPersistenceFailure('options');
    feedback.reportPersistenceFailure('free-rounds', 'PERSISTENCE_ROUNDS', () => false);
    await vm.exportBackup(); assert.strictEqual(exports, 0);
    feedback.clearPersistenceFailure('free-rounds');
    feedback.reportPersistenceFailure('audio-sync', 'PERSISTENCE_AUDIO', () => false);
    await vm.exportBackup(); assert.strictEqual(exports, 1);
    feedback.clearPersistenceFailure('audio-sync');
  });
  await test('warning retries independent owners, remains on rejection, and is translated in both languages', async () => {
    feedback.reportPersistenceFailure('options', 'PERSISTENCE_OPTIONS', () => { feedback.clearPersistenceFailure('options'); });
    feedback.reportPersistenceFailure('audio-sync', 'PERSISTENCE_AUDIO', () => { throw new Error('still full'); });
    const notice = component('PersistenceNotice.vue', { '../model/PersistenceFeedback': feedback });
    const vm = instance(notice);
    await vm.retry();
    assert.strictEqual(vm.retrying, false);
    assert.deepStrictEqual(feedback.persistenceFeedback.sources.map(source => source.id), ['audio-sync']);
    for (const language of ['de', 'en']) for (const key of ['PERSISTENCE_ERROR_TITLE', 'PERSISTENCE_ERROR_TEXT', 'PERSISTENCE_RETRY', 'PERSISTENCE_OPTIONS', 'PERSISTENCE_AUDIO', 'PERSISTENCE_ROUNDS', 'AUDIO_SYNC_SAVE_FAILED', 'AUDIO_SYNC_APPLIED_TEMPORARY', 'SAVE_DATA_UNSAVED_CHANGES']) assert(translations[language][key], language + ': ' + key);
    feedback.clearPersistenceFailure('audio-sync');
  });
  await test('backup waits for an uncommitted Web Locks round before exporting its verified state', async () => {
    let release, exports = 0;
    const pending = { pendingRounds: [{ id: 'round-waiting-for-lock' }],
      retryPendingRounds() { return new Promise(resolve => { release = () => { pending.pendingRounds = []; resolve(true); }; }); } };
    const manager = component('SaveDataManager.vue', {
      '../model/PersistenceFeedback': feedback, '../model/Statistics': pending,
      '../model/SaveDataFiles': { async createIndexedDbSaveDataExport() { exports++; throw new Error('Reached verified export'); } }
    });
    const vm = instance(manager, { $t: key => key, $emit() {} });
    const job = vm.exportBackup();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert(release); assert.strictEqual(exports, 0);
    release(); await job; assert.strictEqual(exports, 1);
  });
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { console.warn = warn; });
