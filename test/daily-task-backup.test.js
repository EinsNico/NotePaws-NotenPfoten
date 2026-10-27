const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module'), babel = require('babel-core');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const original = Module._extensions['.js'], root = path.resolve(__dirname, '../src') + '/';
Module._extensions['.js'] = (mod, file) => file.startsWith(root)
  ? mod._compile(babel.transform(fs.readFileSync(file, 'utf8'), { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code, file) : original(mod, file);
const data = require('../src/model/DailyTaskHistoryData'), daily = require('../src/model/DailyTasks');
const backups = require('../src/model/SaveDataBackup'), files = require('../src/model/SaveDataFiles');
const { mergeSaveDataBackups } = require('../src/model/SaveDataMerge');
const { prepareSaveDataImport, applyPreparedSaveDataImport } = require('../src/model/SaveDataImport');
const { readActiveMergeGuard } = require('../src/model/SaveDataLargeMergePreparation');
const { SaveDataStreamReader } = require('../src/model/SaveDataStreamReader');
const { summarizeStagedSaveData } = require('../src/model/SaveDataStagedPreview');
Module._extensions['.js'] = original;
const clone = value => JSON.parse(JSON.stringify(value));
const local = new Map();
const storage = { get length() { return local.size; }, key: index => [...local.keys()][index] || null, getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value), removeItem: key => local.delete(key) };
function archive(day = '2026-10-20', complete = true) {
  const tasks = daily.createDailyTasks(data.dailyHistoryDate(day));
  if (complete) tasks.forEach(task => { task.value = task.goal; task.complete = true; });
  return { version: 1, startDay: day, checkedThrough: data.shiftDailyHistoryDay(day, -1), days: { [day]: { tasks } } };
}
function document(history) {
  const backup = backups.createSaveDataBackup(storage, { createdAt: '2026-10-20T12:00:00Z' });
  if (history) { backup.version = 6; backup.data.dailyTaskHistory = history; }
  return backup;
}
function adapters(history = archive()) {
  const progress = { version: 3, notes: {} };
  return {
    createdAt: '2026-10-20T12:00:00Z',
    learningStorage: {
      flush: async () => {}, getStatus: () => ({ failedWrites: 0 }),
      verifyHistoryReady: async () => ({ saved: true, verified: true }),
      readDailyTaskHistory: async () => ({ saved: true, history: clone(history) }),
      readBackupSnapshot: async () => ({ saved: true, progress, attempts: [] }),
      readProgress: async () => ({ saved: true, progress }),
      readBackupAttemptsPage: async () => ({ saved: true, page: { records: [], done: true } })
    },
    noteFlowStorage: { flush: async () => {}, readRoundsForExport: async () => ({ saved: true, rounds: [] }),
      readRoundsPage: async () => ({ saved: true, page: { records: [], done: true } }) },
    rhythmStorage: { flush: async () => {}, readBarsForExport: async () => ({ saved: true, bars: [] }),
      readBarsPage: async () => ({ saved: true, page: { records: [], done: true } }) }
  };
}
let count = 0;
async function test(name, run) { await run(); count++; console.log('✓ ' + name); }
(async () => {
  await test('browser export includes exact original goals, values and streak metadata in version six', async () => {
    const result = await files.createIndexedDbSaveDataExport(storage, adapters());
    const parsed = files.parseSaveDataFile(result.text);
    assert(parsed.valid); assert.strictEqual(parsed.backup.version, 6);
    assert.deepStrictEqual(parsed.backup.data.dailyTaskHistory, archive());
    assert.strictEqual(data.dailyTaskStreak(parsed.backup.data.dailyTaskHistory, '2026-10-20'), 1);
  });
  await test('Android chunked export carries the same archive and excludes it from played-answer counts', async () => {
    const chunks = [], result = await files.streamIndexedDbSaveDataBackup(async chunk => chunks.push(chunk), storage, adapters());
    const text = chunks.join(''), parsed = files.parseSaveDataFile(text);
    assert(parsed.valid); assert.strictEqual(parsed.backup.version, 6);
    assert.deepStrictEqual(parsed.backup.data.dailyTaskHistory, archive());
    assert.strictEqual(result.bytesWritten, Buffer.byteLength(text));
    assert(!Object.keys(result.counts).some(key => key.includes('daily')));
  });
  await test('no archive keeps the existing compatible backup format, without invented past tasks', async () => {
    const result = await files.createIndexedDbSaveDataExport(storage, adapters(null));
    assert.strictEqual(result.backup.version, 4); assert(!('dailyTaskHistory' in result.backup.data));
    assert(backups.validateSaveDataBackup(document()).valid);
  });
  await test('read failures reject both exports; the chunk writer receives no partial backup', async () => {
    const options = adapters(); options.learningStorage.readDailyTaskHistory = async () => ({ saved: false, error: Error('history unavailable') });
    await assert.rejects(files.createIndexedDbSaveDataExport(storage, options), /history unavailable/);
    let chunks = 0;
    await assert.rejects(files.streamIndexedDbSaveDataBackup(async () => { chunks++; }, storage, options), /history unavailable/);
    assert.strictEqual(chunks, 0);
  });
  await test('malformed dates, ranges, values, IDs and completion flags are rejected before restoration', () => {
    const edits = [h => { h.version = 99; }, h => { h.startDay = '2026-02-30'; },
      h => { h.startDay = '2026-10-21'; }, h => { h.checkedThrough = '2026-10-18'; },
      h => { h.days['2026-10-20'].tasks[0].value = -1; },
      h => { h.days['2026-10-20'].tasks[0].goal = 100001; },
      h => { h.days['2026-10-20'].tasks[0].id = 'different'; },
      h => { h.days['2026-10-20'].tasks[0].complete = false; },
      h => { h.days['2026-10-20'].tasks[0].value++; },
      h => { h.days['2026-10-20'].tasks[1].mode = h.days['2026-10-20'].tasks[0].mode; }];
    edits.forEach(edit => { const h = archive(); edit(h); assert(!backups.validateSaveDataBackup(document(h)).valid); });
    const missing = document(); missing.version = 6; assert(!backups.validateSaveDataBackup(missing).valid);
    const old = document(archive()); old.version = 4; assert(!backups.validateSaveDataBackup(old).valid);
  });
  await test('corrupt stored completion flags prevent a seemingly successful export', async () => {
    const h = archive(); h.days['2026-10-20'].tasks[0].complete = false;
    await assert.rejects(files.createIndexedDbSaveDataExport(storage, adapters(h)), /invalid/);
  });
  await test('merging takes maximum progress, unions days and is idempotent without modifying either source', () => {
    const left = archive('2026-10-20', false), right = archive('2026-10-19');
    right.days['2026-10-20'] = archive().days['2026-10-20'];
    const before = JSON.stringify([left, right]);
    const result = mergeSaveDataBackups(document(left), document(right)).backup;
    assert(backups.validateSaveDataBackup(result).valid); assert.strictEqual(result.version, 6);
    assert.strictEqual(data.dailyTaskStreak(result.data.dailyTaskHistory, '2026-10-20'), 2);
    assert.deepStrictEqual(mergeSaveDataBackups(result, document(right)).backup.data.dailyTaskHistory, result.data.dailyTaskHistory);
    assert.strictEqual(JSON.stringify([left, right]), before);
  });
  await test('older backups retain current tasks when merging; imported-only tasks are also retained', () => {
    assert.deepStrictEqual(mergeSaveDataBackups(document(archive()), document()).backup.data.dailyTaskHistory, archive());
    assert.deepStrictEqual(mergeSaveDataBackups(document(), document(archive())).backup.data.dailyTaskHistory, archive());
  });
  await test('conflicting assignments reject the merge rather than replacing earned goals', () => {
    const left = archive(), right = archive();
    right.days['2026-10-20'].tasks[0].goal++; right.days['2026-10-20'].tasks[0].value++; const before = JSON.stringify(left);
    assert.throws(() => mergeSaveDataBackups(document(left), document(right)), /Conflicting daily task/);
    assert.strictEqual(JSON.stringify(left), before);
  });
  await test('local-only imports cannot silently discard the archive; merge requires a complete database snapshot', () => {
    const prepared = prepareSaveDataImport(storage, document(archive()), 'replace');
    assert.throws(() => applyPreparedSaveDataImport(storage, prepared), /database-backed/);
    assert.throws(() => prepareSaveDataImport(storage, document(archive()), 'merge'), /complete daily task/);
  });
  await test('stream staging keeps archive metadata intact and exposes the number of backed-up days', async () => {
    const text = JSON.stringify(document(archive()));
    const reader = new SaveDataStreamReader(() => { throw Error('No large record expected'); });
    for (let index = 0; index < text.length; index += 17) reader.push(text.slice(index, index + 17));
    const result = await reader.finish();
    assert.deepStrictEqual(result.backup.data.dailyTaskHistory, archive());
    const preview = summarizeStagedSaveData({ key: 'ready', shell: result.backup, counts: result.counts });
    assert.strictEqual(preview.dailyTaskDays, 1); assert.strictEqual(preview.normalRounds, 0);
  });
  await test('the active merge guard detects another tab changing only daily progress', async () => {
    let h = archive('2026-10-20', false);
    const database = { readNoteFlowStatistics: async () => ({ roundCount: 0 }),
      readAttemptHistoryState: async () => ({ nextSequence: 0 }), readProgressSnapshot: async () => [],
      readDailyTaskHistory: async () => h };
    const before = await readActiveMergeGuard(database); h = archive();
    assert.notStrictEqual(await readActiveMergeGuard(database), before);
  });
  console.log('All ' + count + ' daily backup groups passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
