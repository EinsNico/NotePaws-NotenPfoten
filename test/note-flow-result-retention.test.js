const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');
const compiler = require('vue-template-compiler');
const Vue = require('vue');
global.regeneratorRuntime = require('babel-runtime/regenerator');

const baseline = process.argv.includes('--baseline');
const project = path.resolve(__dirname, '..');
const sourceRoot = baseline
  ? path.join(project, 'docs/audits/control-system-2026-10-08/baseline/src')
  : path.join(project, 'src');
const savedGlobals = {};
['window', 'document', 'navigator', 'localStorage', 'performance', 'setInterval',
  'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame'].forEach(key => {
  savedGlobals[key] = Object.getOwnPropertyDescriptor(global, key);
});
function installGlobal(key, value) {
  Object.defineProperty(global, key, { value, configurable: true, writable: true });
}
function ramStorage(values = {}) {
  const valuesByKey = new Map(Object.entries(values));
  return {
    get length() { return valuesByKey.size; },
    key(index) { return Array.from(valuesByKey.keys())[index] || null; },
    getItem(key) { return valuesByKey.has(key) ? valuesByKey.get(key) : null; },
    setItem(key, value) { valuesByKey.set(key, String(value)); },
    removeItem(key) { valuesByKey.delete(key); }
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() {
  for (let index = 0; index < 35; index++) await Promise.resolve();
  await Vue.nextTick();
}
function context() {
  installGlobal('window', { addEventListener() {}, removeEventListener() {} });
  installGlobal('document', { hidden: false, addEventListener() {}, removeEventListener() {} });
  installGlobal('navigator', {});
  installGlobal('localStorage', ramStorage());
  installGlobal('performance', { now: () => 1000 });
  installGlobal('setInterval', () => 1);
  installGlobal('clearInterval', () => {});
  installGlobal('requestAnimationFrame', () => 2);
  installGlobal('cancelAnimationFrame', () => {});
  const cache = new Map();
  const overrides = {
    'model/ScreenAwakeMixin.js': { createScreenAwakeMixin: () => ({}) },
    'model/AudioSynchronization.js': { resume: async () => true, getDelayMs: () => 0,
      getContext: () => null, subscribe: () => () => {} },
    'model/AudioSynchronizationPlayback.js': { watchAudioTimingChanges: () => () => {} }
  };
  function load(relative) {
    if (overrides[relative]) return overrides[relative];
    const file = path.join(sourceRoot, relative);
    if (cache.has(file)) return cache.get(file);
    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.json')) {
      const value = JSON.parse(source); cache.set(file, value); return value;
    }
    const parsed = file.endsWith('.vue') ? compiler.parseComponent(source) : null;
    const module = { exports: {} };
    const code = babel.transform(parsed ? parsed.script.content : source, {
      babelrc: false, presets: [['env', { modules: 'commonjs' }]]
    }).code;
    new Function('module', 'exports', 'require', code)(module, module.exports, name => {
      if (!name.startsWith('.')) return require(name);
      const base = path.resolve(path.dirname(file), name);
      const target = fs.existsSync(base) ? base : fs.existsSync(base + '.js') ? base + '.js' : base + '.vue';
      if (target.endsWith('.vue')) return {};
      return load(path.relative(sourceRoot, target));
    });
    cache.set(file, module.exports);
    return module.exports;
  }
  return { load, view(kind) {
    const options = load('model/Options.js').default;
    options.preparationSeconds = 0;
    const props = kind === 'melody' ? { preview: { menuOptions: {
      handMode: 'single', clef: ['treble'], tonalityMode: 'circle', selectedKey: 'C-major',
      accidentals: 'no', difficulty: 'normal', movement: 'calm', bpm: 50, gameLength: 20,
      behavior: 'wait', inputMode: 'button', sound: false, rhythmMeter: '4/4',
      rhythmValues: { treble: ['quarter'], bass: ['quarter'] }
    } } } : { plan: load('model/NoteFlowChordPlan.js').createNoteFlowChordPlan({
      tonalityMode: 'circle', selectedKey: 'C-major', chordSize: 3, bassNote: true,
      behavior: 'wait', bpm: 50, gameLength: 20, rhythmMeter: '4/4', rhythmValues: ['quarter']
    }) };
    const name = kind === 'melody' ? 'NoteFlowGamePreview' : 'NoteFlowChordTraining';
    const definition = load('components/' + name + '.vue').default;
    const vm = new Vue(Object.assign({}, definition, { propsData: props,
      methods: Object.assign({}, definition.methods, { $t: key => key }) }));
    vm.$refs.flowStaff = { finishMotion() {}, toggleMotion() {} };
    return { vm, name };
  } };
}

// This boundary intentionally reproduces the production backend's current-block
// duplicate check. A receipt regression must prevent a second backend call.
function syntheticDatabase() {
  const calls = [], records = [], blocks = new Map(), faults = new Map(), gates = new Map();
  const database = {
    recordNoteFlowRound(scope, result) {
      const snapshot = JSON.parse(JSON.stringify(result));
      calls.push({ scope, record: snapshot });
      function commit() {
        let block = blocks.get(scope) || [];
        if (block.some(record => record.id === snapshot.id)) return { duplicate: true };
        if (block.length === 100) block = [];
        block.push(snapshot); blocks.set(scope, block); records.push({ scope, record: snapshot });
        return { duplicate: false };
      }
      if (faults.get(result.id) === 'fail') return Promise.reject(new Error('Synthetic storage failure'));
      if (faults.get(result.id) === 'deferred') {
        const gate = deferred(); gates.set(result.id, gate);
        return gate.promise.then(commit);
      }
      return Promise.resolve(commit());
    },
    close() {}
  };
  return { database, calls, records, gates, faults,
    clear() { records.splice(0); blocks.clear(); },
    count(id) { return records.filter(entry => entry.record.id === id).length; }
  };
}
function attachDefault(ctx, rhythm = false) {
  const writer = ctx.load(rhythm ? 'model/RhythmSenseRoundStorage.js' : 'model/NoteFlowRoundStorage.js').default;
  const io = syntheticDatabase();
  writer.options.openDatabase = () => io.database;
  return { writer, io };
}
function record(id, chord = false) {
  return { id, completedAt: '2026-10-08T12:00:00.000Z', score: { correct: 2, wrong: 1 },
    settings: { inputMode: chord ? 'midi' : 'button', nested: { clefs: ['bass', 'treble'] } },
    ...(chord ? { exerciseType: 'chord', chord: { rhythmValues: ['quarter'] } } : {}) };
}
function actualButton(ctx, vm, component, className) {
  const source = fs.readFileSync(path.join(sourceRoot, 'components', component + '.vue'), 'utf8');
  const template = compiler.parseComponent(source).template.content;
  assert.deepStrictEqual(compiler.compile(template).errors, []);
  Object.assign(vm.$options, compiler.compileToFunctions(template));
  function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
  const button = nodes(vm._render()).find(node => node.tag === 'button' && node.data
    && (node.data.staticClass || '').split(' ').includes(className));
  assert(button, 'Actual rendered control exists: ' + className);
  assert(!(button.data.attrs && button.data.attrs.disabled), 'Existing navigation/play control stays enabled');
  return button;
}

async function trainingRecovery(kind, navigation) {
  const ctx = context(), { writer, io } = attachDefault(ctx);
  const { vm, name } = ctx.view(kind);
  // Set the failure before completion creates the unpredictable fresh round id.
  const originalWrite = io.database.recordNoteFlowRound;
  let delayedId;
  io.database.recordNoteFlowRound = (scope, value) => {
    if (!delayedId) { delayedId = value.id; io.faults.set(value.id, 'deferred'); }
    return originalWrite(scope, value);
  };
  if (kind === 'melody') { vm.startRound(); vm.completeRound('manual'); }
  else { vm.handleMidiConnection(true); vm.endRound(); }
  const original = vm.roundResult, immutable = JSON.parse(JSON.stringify(original));
  await settle();
  if (navigation) vm.$on('back', () => vm.$destroy());
  actualButton(ctx, vm, name, navigation ? 'flow-training-exit' : 'flow-training-play').data.on.click({});
  await settle();
  assert(navigation ? vm._isDestroyed : vm.roundResult === null);
  io.gates.get(original.id).reject(new Error('Synthetic delayed transaction failure'));
  await writer.flush(); await settle();
  io.faults.delete(original.id);
  const feedback = ctx.load('model/PersistenceFeedback.js');
  assert(await feedback.retryPersistenceFailures()); await writer.flush();
  assert.strictEqual(io.count(original.id), 1, 'Original round must survive restart/destroy and global retry');
  assert.deepStrictEqual(io.records[0].record, immutable);
  assert.strictEqual(feedback.persistenceFeedback.sources.length, 0);
  assert.strictEqual(writer.getStatus().failedWrites, 0);
  if (!navigation) { assert.strictEqual(vm.roundSaveState, 'idle'); vm.$destroy(); }
  else {
    const reopened = ctx.view(kind).vm;
    assert.strictEqual(reopened.roundResult, null);
    await reopened.saveRoundResult();
    assert.strictEqual(io.count(original.id), 1);
    reopened.$destroy();
  }
}

async function run() {
  const checks = [];
  async function test(name, body) {
    try { await body(); checks.push({ name, passed: true }); console.log('✓ ' + name); }
    catch (error) { checks.push({ name, passed: false }); console.error('✗ ' + name + '\n' + error.stack); }
  }
  for (const kind of ['melody', 'chord']) for (const navigation of [false, true]) {
    await test(kind + ': pending failure remains globally retryable after actual ' + (navigation ? 'Back/destroy/reopen' : 'Play again'),
      () => trainingRecovery(kind, navigation));
  }
  if (!baseline) {
    for (const rhythm of [false, true]) {
      await test((rhythm ? 'Rhythm' : 'Flow') + ': global receipt prevents stale local retry after more than 100 later saves', async () => {
        const ctx = context(), { writer, io } = attachDefault(ctx, rhythm);
        const save = rhythm ? value => writer.saveBar(value) : value => writer.saveRound(value);
        const original = record('original-receipt'); io.faults.set(original.id, 'fail');
        assert.strictEqual((await save(original)).saved, false);
        io.faults.delete(original.id);
        assert(await ctx.load('model/PersistenceFeedback.js').retryPersistenceFailures());
        for (let index = 0; index < 105; index++) assert((await save(record('later-' + index))).saved);
        const before = io.calls.length;
        assert((await save(original)).saved);
        assert.strictEqual(io.calls.length, before);
        assert.strictEqual(io.count(original.id), 1);
        assert.strictEqual(writer.capturePendingWrites().length, 0);
      });
    }
    await test('Immutable failed snapshot retains every scope while newer rounds pass; later retry saves once', async () => {
      const ctx = context(), { writer, io } = attachDefault(ctx);
      const original = record('failed-first', true), expected = JSON.parse(JSON.stringify(original));
      io.faults.set(original.id, 'deferred');
      const first = writer.saveRound(original);
      original.score.correct = 900; original.settings.nested.clefs.push('mutated');
      original.chord.rhythmValues.push('mutated');
      await settle(); io.gates.get(original.id).reject(new Error('Deferred failure'));
      assert.strictEqual((await first).saved, false);
      for (let index = 0; index < 105; index++) assert((await writer.saveRound(record('new-' + index, true))).saved);
      assert.strictEqual(writer.getStatus().failedWrites, 1);
      io.faults.delete(original.id);
      assert((await writer.retryFailedWrites()).saved);
      assert.deepStrictEqual(io.records.find(entry => entry.record.id === original.id).record, expected);
      assert.strictEqual(io.count(original.id), 1);
      assert.strictEqual(io.records.find(entry => entry.record.id === original.id).scope, 'midi:note-flow-chords');
      const sameIdOtherScope = record(original.id);
      assert((await writer.saveRound(sameIdOtherScope)).saved);
      assert.strictEqual(io.count(original.id), 2, 'The same id in distinct scopes has independent ownership');
    });
    await test('Concurrent local/global retry shares one transaction and cannot clear a different failed result', async () => {
      const ctx = context(), { writer, io } = attachDefault(ctx), feedback = ctx.load('model/PersistenceFeedback.js');
      const a = record('retry-a'), b = record('retry-b');
      io.faults.set(a.id, 'fail'); io.faults.set(b.id, 'fail');
      await writer.saveRound(a); await writer.saveRound(b);
      io.faults.set(a.id, 'deferred');
      const globalRetry = feedback.retryPersistenceFailures();
      const local = writer.saveRound(a), sameLocal = writer.saveRound(a);
      await settle();
      assert(feedback.hasPersistenceFailure('note-flow-rounds'), 'An in-flight failed retry keeps the warning');
      assert.strictEqual(io.calls.filter(call => call.record.id === a.id).length, 2);
      io.gates.get(a.id).resolve();
      assert((await local).saved); assert((await sameLocal).saved);
      assert.strictEqual((await sameLocal).duplicate, true);
      assert.strictEqual(await globalRetry, false);
      assert.strictEqual(writer.getStatus().failedWrites, 1);
      assert(feedback.hasPersistenceFailure('note-flow-rounds'), 'Success A cannot clear failure B');
      io.faults.delete(b.id); assert(await feedback.retryPersistenceFailures());
      assert.strictEqual(io.count(a.id), 1); assert.strictEqual(io.count(b.id), 1);
    });
    await test('Distinct global Flow and Rhythm sources preserve the other owner failure', async () => {
      const ctx = context(), flow = attachDefault(ctx), rhythm = attachDefault(ctx, true);
      const a = record('flow-failure'), b = record('rhythm-failure');
      flow.io.faults.set(a.id, 'fail'); rhythm.io.faults.set(b.id, 'fail');
      await flow.writer.saveRound(a); await rhythm.writer.saveBar(b);
      const feedback = ctx.load('model/PersistenceFeedback.js');
      assert.deepStrictEqual(feedback.persistenceFeedback.sources.map(source => source.id).sort(), ['note-flow-rounds', 'rhythm-sense-bars']);
      flow.io.faults.delete(a.id); assert.strictEqual(await feedback.retryPersistenceFailures(), false);
      assert.deepStrictEqual(feedback.persistenceFeedback.sources.map(source => source.id), ['rhythm-sense-bars']);
      rhythm.io.faults.delete(b.id); assert(await feedback.retryPersistenceFailures());
    });
    await test('A global retry batch honors B already saved locally before delayed A and 105 newer rounds', async () => {
      const ctx = context(), { writer, io } = attachDefault(ctx);
      const a = record('batch-delayed-a'), b = record('batch-local-b');
      io.faults.set(a.id, 'fail'); io.faults.set(b.id, 'fail');
      await writer.saveRound(a); await writer.saveRound(b);
      io.faults.set(a.id, 'deferred'); io.faults.delete(b.id);
      const localB = writer.saveRound(b);
      const globalRetry = ctx.load('model/PersistenceFeedback.js').retryPersistenceFailures();
      await settle(); assert((await localB).saved);
      const newer = Promise.all(Array.from({ length: 105 }, (_, index) => writer.saveRound(record('batch-new-' + index))));
      io.gates.get(a.id).resolve();
      assert(await globalRetry); assert((await newer).every(receipt => receipt.saved));
      assert.strictEqual(io.calls.filter(call => call.record.id === b.id).length, 2, 'Failed initial write and one local retry only');
      assert.strictEqual(io.count(b.id), 1, 'The stale batch must not replay B into the next block');
    });
    await test('Changed generation rejects old snapshots and receipts, while fresh rounds open the new generation', async () => {
      const ctx = context(), { writer, io } = attachDefault(ctx), generations = [];
      writer.options.openDatabase = options => { generations.push(options.name); return io.database; };
      const failed = record('old-failed'), saved = record('old-saved');
      io.faults.set(failed.id, 'fail'); await writer.saveRound(failed); await writer.saveRound(saved);
      localStorage.setItem('noten-pfoten:active-learning-database', 'noten-pfoten-learning-import-new-generation');
      io.faults.delete(failed.id); const before = io.calls.length;
      assert.strictEqual((await writer.retryFailedWrites()).saved, false);
      assert.strictEqual((await writer.saveRound(saved)).saved, false);
      assert.strictEqual(io.calls.length, before, 'No old result is replayed into a changed generation');
      assert((await writer.saveRound(record('new-generation-round'))).saved);
      assert.deepStrictEqual(generations, ['noten-pfoten-learning', 'noten-pfoten-learning-import-new-generation']);
      assert.strictEqual(writer.getStatus().failedWrites, 1);
    });
    await test('Practice backup/replacement recovery refuses remaining errors and then saves the retained original', async () => {
      const ctx = context(), { writer, io } = attachDefault(ctx), original = record('backup-failure');
      io.faults.set(original.id, 'fail'); await writer.saveRound(original);
      const recover = ctx.load('model/LearningWriteRecovery.js').recoverPendingPracticeWrites;
      await assert.rejects(recover(writer), error => error.key === 'SAVE_DATA_UNSAVED_CHANGES');
      assert.strictEqual(writer.getStatus().failedWrites, 1);
      io.faults.delete(original.id); await recover(writer);
      assert.strictEqual(io.count(original.id), 1);
      assert.strictEqual(writer.getStatus().failedWrites, 0);
    });
    await test('Actual failed reset restores local data and retains both global writers for later retry', async () => {
      const ctx = context(), flow = attachDefault(ctx), rhythm = attachDefault(ctx, true);
      const a = record('reset-failed-flow'), b = record('reset-failed-rhythm');
      flow.io.faults.set(a.id, 'fail'); rhythm.io.faults.set(b.id, 'fail');
      await flow.writer.saveRound(a); await rhythm.writer.saveBar(b);
      localStorage.setItem('roundHistory', 'synthetic-local-history');
      const reset = ctx.load('model/LearningDataReset.js').deleteAllLearningDataEverywhere;
      await assert.rejects(reset(localStorage, async () => ({ saved: false, error: new Error('Synthetic clear failure') })));
      assert.strictEqual(localStorage.getItem('roundHistory'), 'synthetic-local-history');
      assert.strictEqual(flow.writer.getStatus().failedWrites, 1);
      assert.strictEqual(rhythm.writer.getStatus().failedWrites, 1);
      flow.io.faults.delete(a.id); rhythm.io.faults.delete(b.id);
      assert(await ctx.load('model/PersistenceFeedback.js').retryPersistenceFailures());
      assert.strictEqual(flow.io.count(a.id), 1); assert.strictEqual(rhythm.io.count(b.id), 1);
    });
    await test('Actual successful reset cancels only captured results; newer Flow/Rhythm writes wait and save once', async () => {
      const ctx = context(), flow = attachDefault(ctx), rhythm = attachDefault(ctx, true);
      const oldFlow = record('reset-old-flow'), oldRhythm = record('reset-old-rhythm');
      flow.io.faults.set(oldFlow.id, 'fail'); rhythm.io.faults.set(oldRhythm.id, 'fail');
      await flow.writer.saveRound(oldFlow); await rhythm.writer.saveBar(oldRhythm);
      const reset = ctx.load('model/LearningDataReset.js').deleteAllLearningDataEverywhere, clearing = deferred();
      const resetPromise = reset(localStorage, () => clearing.promise.then(() => {
        flow.io.clear(); rhythm.io.clear(); return { saved: true };
      }));
      const newerFlow = record('reset-new-flow'), newerRhythm = record('reset-new-rhythm');
      const newFlowSave = flow.writer.saveRound(newerFlow), newRhythmSave = rhythm.writer.saveBar(newerRhythm);
      await settle();
      assert.strictEqual(flow.io.calls.length, 1); assert.strictEqual(rhythm.io.calls.length, 1);
      clearing.resolve(); assert((await resetPromise).databaseCleared);
      assert((await newFlowSave).saved); assert((await newRhythmSave).saved);
      assert.strictEqual((await flow.writer.saveRound(oldFlow)).saved, false);
      assert.strictEqual((await rhythm.writer.saveBar(oldRhythm)).saved, false);
      assert(await ctx.load('model/PersistenceFeedback.js').retryPersistenceFailures());
      assert.strictEqual(flow.io.count(oldFlow.id), 0); assert.strictEqual(rhythm.io.count(oldRhythm.id), 0);
      assert.strictEqual(flow.io.count(newerFlow.id), 1); assert.strictEqual(rhythm.io.count(newerRhythm.id), 1);
      assert.strictEqual(flow.writer.capturePendingWrites().length, 0);
      assert.strictEqual(rhythm.writer.capturePendingWrites().length, 0);
    });
    await test('A captured write that succeeds while reset waits also loses its stale receipt after successful clear', async () => {
      const ctx = context(), { writer, io } = attachDefault(ctx), original = record('reset-pending-success');
      io.faults.set(original.id, 'deferred'); const save = writer.saveRound(original); await settle();
      const reset = ctx.load('model/LearningDataReset.js').deleteAllLearningDataEverywhere;
      let clearCalls = 0;
      const clearing = reset(localStorage, async () => { clearCalls++; io.clear(); return { saved: true }; });
      await settle(); assert.strictEqual(clearCalls, 0);
      io.gates.get(original.id).resolve(); assert((await save).saved); await clearing;
      assert.strictEqual(io.count(original.id), 0);
      assert.strictEqual((await writer.saveRound(original)).saved, false);
      assert.strictEqual(io.calls.length, 1);
    });
  }
  const failed = checks.filter(check => !check.passed).length;
  console.log(JSON.stringify({ baseline, passed: checks.length - failed, failed }));
  if (failed) process.exitCode = 1;
}

run().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => {
  Object.keys(savedGlobals).forEach(key => {
    if (savedGlobals[key]) Object.defineProperty(global, key, savedGlobals[key]);
    else delete global[key];
  });
});
