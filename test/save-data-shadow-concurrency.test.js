const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const vm = require('vm');
const babel = require('babel-core');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const sourceRoot = path.resolve(process.env.NOTEN_PFOTEN_TEST_SOURCE_ROOT || path.join(__dirname, '../src'));
const filename = path.join(sourceRoot, 'model/SaveDataShadowCommit.js');
const originalLoader = Module._extensions['.js'];
const transform = source => babel.transform(source, {
  babelrc: false, presets: [['env', { modules: 'commonjs' }]]
}).code;
Module._extensions['.js'] = (mod, file) => file.startsWith(sourceRoot + path.sep)
  ? mod._compile(transform(fs.readFileSync(file, 'utf8')), file) : originalLoader(mod, file);
function loadCommit(separateRealm = false) {
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const code = transform(fs.readFileSync(filename, 'utf8'));
  if (!separateRealm) mod._compile(code, filename);
  else {
    const wrapper = vm.runInNewContext('(function(exports, require, module) {' + code + '\n})', {
      regeneratorRuntime: global.regeneratorRuntime
    });
    wrapper(mod.exports, mod.require.bind(mod), mod);
  }
  return mod.exports;
}
const generation = require(path.join(sourceRoot, 'model/LearningDatabaseGeneration.js'));
const commitA = loadCommit(), commitB = loadCommit();
const journalKey = commitA.SHADOW_IMPORT_JOURNAL_KEY;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function ticks(count = 5) { for (let i = 0; i < count; i++) await tick(); }
function gate() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}
function storage() {
  const values = new Map([['options', JSON.stringify({data: {language: 'de', appVolume: 50}})],
    ['workshopLibrary', 'protected synthetic music'], ['other', 'protected external data']]);
  return { get length() { return values.size; }, key(i) { return Array.from(values.keys())[i] || null; },
    getItem(k) { return values.has(k) ? values.get(k) : null; },
    setItem(k, v) { values.set(k, String(v)); }, removeItem(k) { values.delete(k); },
    dump() { return Object.fromEntries(values); } };
}
function replacement(suffix, language = 'en', appVolume = 10) {
  const name = 'noten-pfoten-learning-import-concurrency-' + suffix;
  const read = gate(), ready = gate();
  let activation = gate();
  activation.resolve();
  const marker = { state: 'database-verified', summary: {source: {
    createdAt: '2026-10-08T10:00:00.000Z', fileSize: 100}} };
  let reads = 0, readyCalls = 0, activationCalls = 0;
  const shadow = { name, database: {
    async readDailyTaskHistory() { return this.dailyTaskHistory || null; },
    async writeDailyTaskHistory(value) { this.dailyTaskHistory = value; },
    async readImportGenerationMarker() { reads++; if (reads === 1) await read.promise; return marker; },
    async markVerifiedImportReady() { readyCalls++; await ready.promise; marker.state = 'ready'; },
    async revertUnactivatedImportReady() { marker.state = 'database-verified'; }
  }};
  const plan = { generation: name, previousGeneration: generation.LEGACY_LEARNING_DATABASE_NAME,
    sourceCreatedAt: marker.summary.source.createdAt, sourceFileSize: 100, estimatedBytes: 100,
    values: { options: JSON.stringify({data: {language, appVolume}}) } };
  const openDatabase = async () => {
    activationCalls++; await activation.promise;
    return { close() {}, database: { transaction() {
      const tx = { objectStore() { return { get() {
        const request = {}; queueMicrotask(() => { request.result = marker; request.onsuccess(); });
        return request;
      }}; }};
      setImmediate(() => tx.oncomplete()); return tx;
    }}};
  };
  return { plan, shadow, marker, read, ready, openDatabase,
    holdActivation() { activation = gate(); return activation; },
    get reads() { return reads; }, get readyCalls() { return readyCalls; },
    get activationCalls() { return activationCalls; } };
}
function locks() {
  let queue = Promise.resolve();
  return { calls: 0, request(name, options, operation) {
    assert.strictEqual(options.mode, 'exclusive'); assert(name.includes('import'));
    this.calls++;
    const pending = queue.then(operation); queue = pending.catch(() => {}); return pending;
  }};
}
function run(commit, input, local, lockApi = null) {
  return commit.commitStagedShadowImport(input.plan, input.shadow, local, {
    locks: lockApi, flushCurrentWrites: async () => {}, openDatabase: input.openDatabase
  }).then(value => ({value}), error => ({error}));
}
const tests = [];
function test(name, operation) { tests.push({name, operation}); }
async function overlap(first, second, lockApi) {
  const local = storage(), a = replacement('a', 'de', 10), b = replacement('b', 'en', 90);
  const jobA = run(first, a, local, lockApi), jobB = run(second, b, local, lockApi);
  await ticks(); const bReadsWhileAOwnsBoundary = b.reads;
  a.read.resolve(); b.read.resolve(); await ticks();
  const localBeforeCommit = local.getItem('options');
  const journalBeforeCommit = local.getItem(journalKey);
  a.ready.resolve(); const resultA = await jobA;
  b.ready.reject(new Error('synthetic B marker transaction abort'));
  const resultB = await jobB;
  assert(resultA.value && resultA.value.committed);
  assert(resultB.error, 'the queued plan must be stale after A commits');
  assert.strictEqual(bReadsWhileAOwnsBoundary, 0, 'B entered async commit before A released ownership');
  assert.strictEqual(localBeforeCommit, a.plan.values.options);
  assert.strictEqual(JSON.parse(journalBeforeCommit).target, a.shadow.name);
  assert.strictEqual(generation.activeLearningDatabaseName(local), a.shadow.name);
  assert.strictEqual(local.getItem('options'), a.plan.values.options);
  assert.strictEqual(local.getItem(journalKey), null);
  assert.strictEqual(local.getItem('workshopLibrary'), 'protected synthetic music');
  assert.strictEqual(local.getItem('other'), 'protected external data');
}
test('two module instances serialize without Web Locks', () => overlap(commitA, commitB, null));
test('separate realms serialize through one origin Web Lock', async () => {
  const lockApi = locks(); await overlap(loadCommit(true), loadCommit(true), lockApi);
  assert.strictEqual(lockApi.calls, 2);
});
test('B completes before suspended A without a storage fault; final save stays coherent', async () => {
  const local = storage(), a = replacement('reverse-a', 'de', 10), b = replacement('reverse-b', 'en', 90);
  const lockApi = locks(), jobA = run(loadCommit(true), a, local, lockApi), jobB = run(loadCommit(true), b, local, lockApi);
  a.read.resolve(); b.read.resolve(); await ticks();
  b.ready.resolve(); await ticks(); // The original code committed B while A was still waiting.
  a.ready.resolve(); const resultA = await jobA, resultB = await jobB;
  assert(resultA.value && resultA.value.committed); assert(resultB.error);
  assert.strictEqual(generation.activeLearningDatabaseName(local), a.shadow.name);
  assert.strictEqual(local.getItem('options'), a.plan.values.options);
  assert.strictEqual(local.getItem(journalKey), null);
});
test('unavailable Lock API fails before any local mutation', async () => {
  const local = storage(), before = local.dump(), a = replacement('lock-denied');
  a.read.resolve(); a.ready.resolve();
  const result = await run(commitA, a, local, { request() { throw new Error('lock unavailable'); }});
  assert(result.error); assert.deepStrictEqual(local.dump(), before); assert.strictEqual(a.reads, 0);
});
test('single no-Web-Locks success and marker failure rollback remain exact', async () => {
  for (const failed of [false, true]) {
    const local = storage(), before = local.dump(), a = replacement('single-' + failed);
    const job = run(commitA, a, local); a.read.resolve(); await ticks();
    if (failed) a.ready.reject(new Error('synthetic marker abort')); else a.ready.resolve();
    const result = await job;
    if (failed) { assert(result.error); assert.deepStrictEqual(local.dump(), before); }
    else { assert(result.value.committed); assert.strictEqual(local.getItem('options'), a.plan.values.options); }
  }
});
test('journal arriving during marker read is rejected before settings mutation', async () => {
  const local = storage(), a = replacement('late-journal'), foreign = JSON.stringify({
    target: 'noten-pfoten-learning-import-foreign', previousGeneration: a.plan.previousGeneration,
    previous: [['options', 'foreign rollback bytes']]
  });
  const job = run(commitA, a, local); await ticks();
  local.setItem(journalKey, foreign); local.setItem('options', 'foreign settings bytes');
  a.read.resolve(); a.ready.resolve(); const result = await job;
  assert(result.error); assert.strictEqual(local.getItem(journalKey), foreign);
  assert.strictEqual(local.getItem('options'), 'foreign settings bytes');
  assert.strictEqual(a.readyCalls, 0);
});
test('generation changing during marker read makes the plan stale before local writes', async () => {
  const local = storage(), a = replacement('stale'), before = local.getItem('options');
  const job = run(commitA, a, local); await ticks();
  const other = 'noten-pfoten-learning-import-concurrent-generation';
  local.setItem(generation.ACTIVE_LEARNING_DATABASE_KEY, other);
  a.read.resolve(); a.ready.resolve(); const result = await job;
  assert(result.error); assert.strictEqual(local.getItem('options'), before);
  assert.strictEqual(generation.activeLearningDatabaseName(local), other);
  assert.strictEqual(local.getItem(journalKey), null); assert.strictEqual(a.readyCalls, 0);
});
for (const failed of [false, true]) test('foreign journal during ready ' + (failed ? 'failure' : 'success') + ' is never recovered or deleted', async () => {
  const local = storage(), a = replacement('foreign-' + failed);
  const job = run(commitA, a, local); a.read.resolve(); await ticks();
  const foreign = JSON.stringify({target: 'noten-pfoten-learning-import-foreign',
    previousGeneration: a.plan.previousGeneration, previous: [['options', 'foreign rollback bytes']]});
  local.setItem(journalKey, foreign); local.setItem('options', 'foreign settings bytes');
  if (failed) a.ready.reject(new Error('synthetic marker abort')); else a.ready.resolve();
  const result = await job;
  assert(result.error); assert(result.error.rollbackError, 'ownership loss must be explicitly reported');
  assert.strictEqual(local.getItem(journalKey), foreign);
  assert.strictEqual(local.getItem('options'), 'foreign settings bytes');
  assert.strictEqual(generation.activeLearningDatabaseName(local), a.plan.previousGeneration);
});
test('foreign journal arriving during activation IO prevents the generation switch', async () => {
  const local = storage(), a = replacement('activation-foreign'), activation = a.holdActivation();
  const job = run(commitA, a, local); a.read.resolve(); a.ready.resolve(); await ticks();
  assert.strictEqual(a.activationCalls, 1);
  const foreign = JSON.stringify({target: 'noten-pfoten-learning-import-foreign',
    previousGeneration: a.plan.previousGeneration, previous: [['options', 'foreign rollback bytes']]});
  local.setItem(journalKey, foreign); local.setItem('options', 'foreign settings bytes');
  activation.resolve(); const result = await job;
  assert(result.error); assert(result.error.rollbackError);
  assert.strictEqual(local.getItem(journalKey), foreign);
  assert.strictEqual(local.getItem('options'), 'foreign settings bytes');
  assert.strictEqual(generation.activeLearningDatabaseName(local), a.plan.previousGeneration);
});
test('legacy crash journal rollback and committed cleanup remain compatible', async () => {
  const local = storage(), a = replacement('crash'), before = local.getItem('options');
  const journal = JSON.stringify({ target: a.shadow.name, previousGeneration: a.plan.previousGeneration,
    previous: [['options', before]] });
  local.setItem(journalKey, journal); local.setItem('options', a.plan.values.options);
  assert.strictEqual(commitA.recoverPendingShadowImport(local).committed, false);
  assert.strictEqual(local.getItem('options'), before);
  local.setItem(journalKey, journal); local.setItem('options', a.plan.values.options);
  local.setItem(generation.ACTIVE_LEARNING_DATABASE_KEY, a.shadow.name);
  assert.strictEqual(commitA.recoverPendingShadowImport(local).committed, true);
  assert.strictEqual(local.getItem('options'), a.plan.values.options); assert.strictEqual(local.getItem(journalKey), null);
});
(async () => {
  let failed = 0;
  for (const {name, operation} of tests) {
    try { await operation(); console.log('PASS ' + name); }
    catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
  }
  Module._extensions['.js'] = originalLoader;
  if (failed) process.exitCode = 1;
  else console.log('Shadow commit concurrency regression tests passed.');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
