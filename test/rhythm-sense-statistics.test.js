const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const babel = require('babel-core');
const Vue = require('vue');
const compiler = require('vue-template-compiler');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const sourceRoot = path.resolve(__dirname, '../src') + path.sep;
const originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = function(mod, filename) {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  return mod._compile(babel.transform(fs.readFileSync(filename, 'utf8'), {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code, filename);
};
const model = require('../src/model/RhythmSenseStatistics');
const dbModel = require('../src/model/LearningDatabasePrototype');
const { RHYTHM_SENSE_SCOPE } = require('../src/model/RhythmSenseRoundStorage');
const backupModel = require('../src/model/SaveDataBackup');
const { mergeSaveDataBackups } = require('../src/model/SaveDataMerge');
const { SaveDataStreamReader } = require('../src/model/SaveDataStreamReader');
const { createRhythmSenseBar, createRhythmSenseBarRecord } = require('../src/model/RhythmSense');
const prestigeModel = require('../src/model/PrestigeArchive');
const languageModel = require('../src/model/LanguageOptions');
const translations = { de: require('../src/resources/de').default, en: require('../src/resources/en').default };
Module._extensions['.js'] = originalLoader;

function bar(sessionId, barNumber, options = {}) {
  return Object.assign({
    id: `${sessionId}:bar:${barNumber}`, sessionId, barNumber,
    completedAt: '2026-10-01T10:00:00.000Z', startedAt: '2026-10-01T09:59:57.000Z',
    durationMs: 3000, settings: { meter: '4/4', bpm: 80 },
    score: { correct: 3, wrong: 1, missed: 1, evaluatedInputs: 5 },
    timing: { precise: 3, early: 1, late: 0, evaluatedInputs: 4, totalAbsoluteOffsetMs: 400 }
  }, options);
}

// IndexedDB cursor fake checks readonly scope isolation and page boundaries.
function fakeReader(bars, blockSize = 100) {
  const blocks = dbModel.packNoteFlowRoundsIntoBlocks(bars, { scope: RHYTHM_SENSE_SCOPE, blockSize });
  let readBlocks = 0;
  const database = {
    keyRange: { bound: (lower, upper) => ({ lower, upper }) },
    database: {
      transaction(storeName, mode) {
        assert.strictEqual(mode, 'readonly');
        assert.strictEqual(storeName, dbModel.LEARNING_DATABASE_STORES.noteFlowRoundBlocks);
        const tx = {
          objectStore() { return {
            index(name) {
              assert.strictEqual(name, 'byScopeAndNumber');
              return {
                openCursor(range, direction) {
                  assert.strictEqual(range.lower[0], RHYTHM_SENSE_SCOPE);
                  assert.strictEqual(direction, 'prev');
                  const matched = blocks.filter(b => b.blockNumber <= range.upper[1]).slice().reverse();
                  const request = {};
                  let position = 0;
                  function advance() {
                    setImmediate(() => {
                      const block = matched[position++];
                      let continued = false;
                      if (block) readBlocks++;
                      request.onsuccess({ target: { result: block ? {
                        value: block,
                        continue() { continued = true; advance(); }
                      } : null } });
                      if (!continued) setImmediate(() => tx.oncomplete());
                    });
                  }
                  advance();
                  return request;
                }
              };
            }
          }; },
          abort() { if (tx.onabort) tx.onabort(); }
        };
        return tx;
      }
    },
    get readBlocks() { return readBlocks; }
  };
  return database;
}

(async () => {
  const summary = model.summarizeRhythmSenseStatistics({
    roundCount: 3, evaluatedNoteCount: 12, correctCount: 9, missedCount: 2,
    durationTotalMs: 9000, timingOffsetTotalMs: 1200, timedInputCount: 4
  }, { roundCount: 100, playedCount: 1000, correctCount: 500, missedCount: 10, durationTotalMs: 100000 });
  assert.strictEqual(summary.barCount, 103);
  assert.strictEqual(summary.accuracy, 50, 'accuracy is weighted by strikes, including retained prestige totals');
  assert.strictEqual(summary.averageOffsetMs, 300, 'archived bars do not invent stored timing samples');
  assert.strictEqual(summary.durationMs, 109000);
  assert.strictEqual(summary.missed, 12);
  assert.strictEqual(model.summarizeRhythmSenseStatistics(null).accuracy, null);
  assert.strictEqual(model.summarizeRhythmSenseStatistics().averageOffsetMs, null);

  const bars = [];
  for (let session = 0; session < 123; session++) {
    for (let index = 1; index <= 3; index++) bars.push(bar(`session-${session}`, index));
  }
  const reader = fakeReader(bars, 7); // sessions deliberately cross block boundaries
  let position = null;
  const seen = [];
  let pages = 0;
  do {
    const page = await model.readRhythmSenseHistoryPage(reader, position);
    pages++;
    assert(page.rounds.length <= 50);
    page.rounds.forEach(round => {
      assert.strictEqual(round.barCount, 3);
      assert.strictEqual(round.evaluated, 15);
      assert.strictEqual(round.accuracy, 60);
      assert.strictEqual(round.averageOffsetMs, 100);
      assert.strictEqual(round.partial, false);
      seen.push(round.id);
    });
    position = page.nextPosition;
  } while (position);
  assert.strictEqual(pages, 3);
  assert.strictEqual(seen.length, 123);
  assert.strictEqual(new Set(seen).size, 123, 'paging must neither split nor repeat sessions');
  const first = await model.readRhythmSenseHistoryPage(fakeReader(bars));
  assert.strictEqual(first.rounds[0].id, 'session-73');
  assert.strictEqual(first.rounds[49].id, 'session-122');
  const empty = await model.readRhythmSenseHistoryPage(fakeReader([]));
  assert.deepStrictEqual(empty.rounds, []);
  assert.strictEqual(empty.hasOlder, false);
  const unlimited = await model.readRhythmSenseHistoryPage(fakeReader(
    Array.from({ length: 501 }, (_, i) => bar('unlimited', i + 1))
  ));
  assert.strictEqual(unlimited.rounds.length, 1);
  assert.strictEqual(unlimited.rounds[0].barCount, 501);
  const partial = await model.readRhythmSenseHistoryPage(fakeReader([bar('partial', 4), bar('partial', 5)]));
  assert.strictEqual(partial.rounds[0].partial, true);
  const cancelled = await model.readRhythmSenseHistoryPage(fakeReader(bars), null, 50, () => false);
  assert.strictEqual(cancelled.cancelled, true);
  assert.strictEqual(cancelled.rounds.length, 0);

  const many = fakeReader(Array.from({ length: 10000 }, (_, i) => bar(`large-${i}`, 1)));
  await model.readRhythmSenseHistoryPage(many);
  assert(many.readBlocks <= 2, 'opening history must not scan all 10,000 saved bars');

  // A real backup merge orders bars by completion time. Training sessions
  // from different devices can therefore be interleaved after restoration.
  const events = createRhythmSenseBar(1);
  function savedBar(sessionId, barNumber, seconds) {
    return createRhythmSenseBarRecord({ sessionId, barNumber, meter: '4/4', bpm: 80,
      roundLength: 3, events, results: events.map(() => 'correct'),
      acceptedOffsets: events.map(() => 25),
      completedAt: new Date(Date.UTC(2026, 9, 1, 10, 0, seconds)).toISOString() });
  }
  const current = backupModel.createSaveDataBackup({ length: 0, key: () => null, getItem: () => null });
  current.version = 4;
  const zeros = () => Object.fromEntries(prestigeModel.PRESTIGE_METRIC_FIELDS.map(key => [key, 0]));
  const segment = { id: 'rhythm-archive-audit', createdAt: '2026-09-29T10:00:00.000Z', levels: 1,
    entryCounts: Object.fromEntries(prestigeModel.PRESTIGE_ENTRY_SCOPES.map(key => [key, 0])),
    metrics: Object.fromEntries(prestigeModel.PRESTIGE_ENTRY_SCOPES.map(key => [key, zeros()])),
    timeWindows: Object.fromEntries(prestigeModel.PRESTIGE_TIME_WINDOWS.map(key => [key, zeros()])) };
  segment.entryCounts.rhythmBars = 100000;
  Object.assign(segment.metrics.rhythmBars, { roundCount: 100000, durationTotalMs: 200000000,
    playedCount: 400000, correctCount: 320000, wrongCount: 40000, missedCount: 40000 });
  current.data.prestigeArchive = { version: 1, segments: [segment] };
  current.data.noteFlowRounds = { screen: [], midi: [], chordMidi: [] };
  current.data.rhythmSenseBars = [savedBar('device-a', 1, 1), savedBar('device-a', 2, 3), savedBar('device-a', 3, 5)];
  const incoming = JSON.parse(JSON.stringify(current));
  incoming.data.rhythmSenseBars = [savedBar('device-b', 1, 2), savedBar('device-b', 2, 4), savedBar('device-b', 3, 6)];
  const merged = mergeSaveDataBackups(current, incoming).backup;
  assert(backupModel.validateSaveDataBackup(merged).valid);
  assert.deepStrictEqual(merged.data.rhythmSenseBars.map(b => b.sessionId),
    ['device-a', 'device-b', 'device-a', 'device-b', 'device-a', 'device-b']);
  // Check the actual streaming parser used by large backups, including
  // offsets, session identity, notes, settings and per-bar counters.
  const restoredBars = [];
  const readerStream = new SaveDataStreamReader((section, record) => {
    if (section === 'data.rhythmSenseBars') restoredBars.push(record);
  });
  const textBackup = JSON.stringify(merged);
  for (let offset = 0; offset < textBackup.length; offset += 37) readerStream.push(textBackup.slice(offset, offset + 37));
  const restoredShell = readerStream.finish().backup;
  assert.deepStrictEqual(restoredShell.data.prestigeArchive, current.data.prestigeArchive);
  assert.strictEqual(merged.data.prestigeArchive.segments.length, 1);
  assert.deepStrictEqual(restoredBars, merged.data.rhythmSenseBars);
  const restored = await model.readRhythmSenseHistoryPage(fakeReader(restoredBars, 2));
  assert.strictEqual(restored.rounds.length, 2, 'merged sessions each produce one graph point');
  restored.rounds.forEach(round => {
    assert.strictEqual(round.barCount, 3);
    assert.strictEqual(round.accuracy, 100);
    assert.strictEqual(round.averageOffsetMs, 25);
    assert.strictEqual(round.durationMs, 9000);
    assert.strictEqual(round.partial, false);
  });
  // Exercise the actual inactive-generation importer and regenerated
  // aggregates, using an isolated in-memory IndexedDB facade only.
  const shadowTestFile = path.join(__dirname, 'save-data-shadow-note-flow.test.js');
  const shadowTestPrefix = fs.readFileSync(shadowTestFile, 'utf8').split('(async () => {')[0];
  const { fakeDatabase, LearningDatabasePrototype, copyStagedNoteFlowToShadow } =
    new Function('require', '__dirname', shadowTestPrefix + '\nreturn {fakeDatabase, LearningDatabasePrototype, copyStagedNoteFlowToShadow};')(
      Module.createRequire(shadowTestFile), __dirname);
  const sourceDatabase = new LearningDatabasePrototype(fakeDatabase());
  for (const record of merged.data.rhythmSenseBars) await sourceDatabase.recordNoteFlowRound(RHYTHM_SENSE_SCOPE, record);
  const beforeRestore = await sourceDatabase.readNoteFlowStatistics(RHYTHM_SENSE_SCOPE);
  const target = new LearningDatabasePrototype(fakeDatabase(), { name: 'noten-pfoten-learning-import-rhythm-audit' });
  await copyStagedNoteFlowToShadow({ async readBatch(section, start, limit) {
    const all = section === 'data.rhythmSenseBars' ? restoredBars : [];
    const records = all.slice(start, start + limit);
    return { records, nextIndex: start + records.length, total: all.length, done: start + records.length === all.length };
  } }, { name: 'noten-pfoten-learning-import-rhythm-audit', database: target });
  const afterRestore = await target.readNoteFlowStatistics(RHYTHM_SENSE_SCOPE);
  const archiveMetrics = prestigeModel.summarizePrestigeArchive(restoredShell.data.prestigeArchive).metrics.rhythmBars;
  assert.deepStrictEqual(model.summarizeRhythmSenseStatistics(afterRestore, archiveMetrics),
    model.summarizeRhythmSenseStatistics(beforeRestore, archiveMetrics));
  assert.strictEqual(model.summarizeRhythmSenseStatistics(afterRestore, archiveMetrics).barCount, 100006);
  assert.strictEqual(model.summarizeRhythmSenseStatistics(afterRestore, archiveMetrics).averageOffsetMs, 25);

  const reimported = mergeSaveDataBackups(merged, merged).backup;
  assert.strictEqual(reimported.data.rhythmSenseBars.length, 6, 'reimport does not duplicate bars');

  // Interleaved sessions crossing page boundaries must also stay whole.
  const overlappingBars = [];
  for (let index = 1; index <= 3; index++) {
    for (let session = 0; session < 153; session++) overlappingBars.push(bar(`overlap-${session}`, index));
  }
  const overlapReader = fakeReader(overlappingBars, 7);
  const overlapIds = [];
  let overlapPosition = null;
  do {
    const page = await model.readRhythmSenseHistoryPage(overlapReader, overlapPosition);
    for (const round of page.rounds) {
      assert.strictEqual(round.barCount, 3);
      assert.strictEqual(round.partial, false);
      overlapIds.push(round.id);
    }
    overlapPosition = page.nextPosition;
  } while (overlapPosition);
  assert.strictEqual(overlapIds.length, 153);
  assert.strictEqual(new Set(overlapIds).size, 153);

  const file = fs.readFileSync(path.join(__dirname, '../src/components/RhythmSenseStatistics.vue'), 'utf8');
  const parsed = compiler.parseComponent(file);
  const compiled = compiler.compileToFunctions(parsed.template.content);
  assert.deepStrictEqual(languageModel.ENABLED_LANGUAGES.slice().sort(), ['de', 'en']);
  const staticKeys = Array.from(file.matchAll(/\$t\('([^']+)'/g), match => match[1]);
  const breakdownKeys = ['RHYTHM_RESULT_CORRECT', 'RHYTHM_RESULT_EARLY', 'RHYTHM_RESULT_LATE', 'RHYTHM_RESULT_MISSED'];
  for (const language of languageModel.ENABLED_LANGUAGES) {
    for (const key of staticKeys.concat(breakdownKeys)) assert.strictEqual(typeof translations[language][key], 'string', `${language} is missing ${key}`);
    for (const key of Object.keys(translations.de).filter(key => key.startsWith('RHYTHM_STATS_'))) {
      assert.strictEqual(typeof translations.en[key], 'string');
      const placeholders = value => (value.match(/\{[^}]+\}/g) || []).sort();
      assert.deepStrictEqual(placeholders(translations.de[key]), placeholders(translations.en[key]));
    }
  }
  const componentModule = { exports: {} };
  new Function('module', 'exports', 'require', babel.transform(parsed.script.content, {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code)(componentModule, componentModule.exports, name => name.endsWith('RhythmSenseStatistics') ? model : {});
  const options = componentModule.exports.default;
  const vm = new Vue(Object.assign({}, options, {
    mounted: undefined, beforeDestroy: undefined,
    render: compiled.render, staticRenderFns: compiled.staticRenderFns,
    methods: Object.assign({}, options.methods, { $t: key => key }),
    computed: Object.assign({}, options.computed, { locale: () => 'de-DE' })
  }));
  function text(node) { return node.text || (node.children || []).map(text).join(''); }
  assert(text(vm._render()).includes('FLOW_STAT_LOADING'));
  vm.state = 'error'; assert(text(vm._render()).includes('FLOW_STAT_LOAD_ERROR'));
  vm.state = 'ready'; assert(text(vm._render()).includes('RHYTHM_STATS_EMPTY'));
  vm.summary = summary;
  vm.rounds = first.rounds;
  assert(text(vm._render()).includes('ROUND_STATS_CHART_TITLE'));
  vm.selectedRound = first.rounds[0];
  assert(text(vm._render()).includes('ROUND_STATS_ROUND_DETAILS'));
  assert(text(vm._render()).includes('80 BPM'));
  vm.selectedRound = null;
  assert(!text(vm._render()).includes('ROUND_STATS_ROUND_DETAILS'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  process.stdout.write('Rhythm Sense statistics totals, session paging, large history and render tests passed.\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
