const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('babel-core');
const compiler = require('vue-template-compiler');
const Vue = require('vue');
const sourceRoot = path.resolve(__dirname, '../src') + path.sep;
const originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, 'utf8'), {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code, filename);
};
const model = require('../src/model/Workshop');
Module._extensions['.js'] = originalLoader;
const originalVueLoader = Module._extensions['.vue'];
Module._extensions['.vue'] = mod => { mod.exports = {}; };
const filename = path.resolve(sourceRoot, 'components/WorkshopPieceDetails.vue');
const parsed = compiler.parseComponent(fs.readFileSync(filename, 'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(babel.transform(parsed.script.content, {
  babelrc: false, presets: [['env', { modules: 'commonjs' }]]
}).code, filename);
const definition = mod.exports.default;
if (originalVueLoader) Module._extensions['.vue'] = originalVueLoader;
else delete Module._extensions['.vue'];
function create(draft = model.createWorkshopDraft('Original'), error = null) {
  const view = new Vue(Object.assign({}, definition, {
    mounted: undefined, beforeDestroy: undefined, propsData: { draft, error }
  }));
  view.saved = [];
  view.cancels = 0;
  view.$on('save', next => view.saved.push(next));
  view.$on('cancel', () => view.cancels++);
  return view;
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
let checks = 0;
function test(name, body) { body(); checks++; console.log('✓ ' + name); }

test('renaming and tempo edits preserve all score data and previous saved revisions', () => {
  const draft = model.createWorkshopDraft('Original', 2);
  draft.score.parts[0].measures[0].events = [{
    id: 'note-1', kind: 'note', noteValue: 'quarter', startSlot: 0,
    pitch: { step: 'F', octave: 4, alter: 1 }, voice: 2, lyric: 'la', fingering: 3
  }];
  draft.score.metadata = { title: 'Imported title', composer: 'Composer', subtitle: 'Movement 1' };
  draft.score.layout = { barsPerSystem: 2, systemBreaks: [draft.score.parts[0].measures[1].id] };
  draft.score.musicXml = {
    sourceXml: '<score-partwise>original reference</score-partwise>', fingerprint: 'original-hash',
    warnings: ['import-warning'], rootPath: 'score.xml', archiveAssets: [{ path: 'cover.txt', data: 'aGk=' }]
  };
  assert(model.isValidWorkshopScore(draft.score));
  const first = model.saveWorkshopDraft(null, draft, '2026-10-05T10:00:00.000Z');
  const opened = model.openWorkshopPiece(first.piece);
  const before = JSON.stringify(opened), historyBefore = JSON.stringify(first.library);
  const view = create(opened);
  view.title = '  Renamed piece  ';
  view.tempo = '120';
  view.credits.composer = 'New composer';
  view.save();
  assert.strictEqual(view.saved.length, 1);
  const updated = plain(view.saved[0]);
  const expected = JSON.parse(before);
  expected.title = expected.score.metadata.title = 'Renamed piece';
  expected.score.bpm = 120;
  expected.score.metadata.composer = 'New composer';
  assert.deepStrictEqual(updated, expected);
  assert.strictEqual(JSON.stringify(opened), before);
  const second = model.saveWorkshopDraft(first.library, updated, '2026-10-05T11:00:00.000Z');
  assert.strictEqual(second.piece.revisions.length, 2);
  assert.deepStrictEqual(second.piece.revisions[0], first.piece.revisions[0]);
  assert.strictEqual(JSON.stringify(first.library), historyBefore);
  assert.deepStrictEqual(model.openWorkshopPiece(second.piece), updated);
  view.$destroy();
});

test('unchanged fields keep imported long and multiline credits exactly, with no metadata truncation', () => {
  const draft = model.createWorkshopDraft('Short library name');
  draft.score.metadata = {
    title: 'Long imported movement title', subtitle: 'Line 1\nLine 2',
    composer: 'C'.repeat(2048), arranger: '  Original arranger  ', lyricist: '', copyright: '© 2026\n' + 'R'.repeat(2041)
  };
  const view = create(draft);
  assert.strictEqual(view.credits.composer.length, 2048);
  view.save();
  assert.strictEqual(view.saved.length, 1);
  assert.deepStrictEqual(plain(view.saved[0]), plain(draft));
  view.$destroy();
});

test('saving unchanged or tempo-only edits does not invent metadata; clearing credits removes only the requested value', () => {
  const draft = model.createWorkshopDraft('Original');
  const view = create(draft);
  view.save();
  assert.deepStrictEqual(plain(view.saved[0]), plain(draft));
  assert.strictEqual(view.saved[0].score.metadata, undefined);
  view.tempo = '95';
  view.save();
  assert.strictEqual(view.saved[1].score.metadata, undefined);
  assert.strictEqual(view.saved[1].score.bpm, 95);
  view.$destroy();
  draft.score.metadata = { composer: 'A', arranger: 'B' };
  const credits = create(draft);
  credits.credits.composer = '';
  credits.save();
  assert.deepStrictEqual(plain(credits.saved[0].score.metadata), { arranger: 'B' });
  assert.deepStrictEqual(plain(draft.score.metadata), { composer: 'A', arranger: 'B' });
  credits.$destroy();
});

test('invalid or empty title, tempo and excessive credit length cannot emit save; corrected inputs can retry', () => {
  const view = create();
  for (const title of ['', '   ', 'T'.repeat(81)]) {
    view.title = title; view.save();
    assert.strictEqual(view.saved.length, 0);
    assert.strictEqual(view.displayedError, 'WORKSHOP_PIECE_TITLE_REQUIRED');
  }
  view.title = 'Valid';
  for (const tempo of ['', ' ', '24', '241', 'Infinity', 'NaN', '80.5', '60abc']) {
    view.tempo = tempo; view.save();
    assert.strictEqual(view.saved.length, 0);
    assert.strictEqual(view.displayedError, 'WORKSHOP_PIECE_TEMPO_INVALID');
  }
  view.tempo = '25';
  view.credits.composer = 'C'.repeat(2049); view.save();
  assert.strictEqual(view.saved.length, 0);
  assert.strictEqual(view.displayedError, 'WORKSHOP_PIECE_CREDITS_INVALID');
  view.credits.composer = 'C'.repeat(2048); view.save();
  assert.strictEqual(view.saved.length, 1);
  assert.strictEqual(view.saved[0].score.bpm, 25);
  view.tempo = '240'; view.save();
  assert.strictEqual(view.saved[1].score.bpm, 240);
  view.$destroy();
});

test('rights, license and labeled sources are editable and preserved on save and reopen', () => {
  const draft=model.createWorkshopDraft('La Candeur');
  draft.score.metadata={title:draft.title,composer:'Friedrich Burgmüller',copyright:'Original rights',license:'Public Domain',sources:[
    {label:'Mutopia',url:'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=202'},
    {label:'Pianodemy',url:'https://pianodemy.com/pieces/burgmuller-tenderness-op-100-no-1/'}
  ]};
  const view=create(draft);
  assert.strictEqual(view.hasCredits,true);
  view.title='My study';view.credits.copyright='Edited rights notice';view.credits.license='Edited status';
  view.sources[1].label='File source';view.sources[1].url+='burgmuller-tenderness-op-100-no-1.musicxml';
  view.save();
  const saved=model.saveWorkshopDraft(null,plain(view.saved[0])),reopened=model.openWorkshopPiece(saved.piece);
  assert.strictEqual(reopened.title,'My study');assert.strictEqual(reopened.score.metadata.title,'My study');
  assert.strictEqual(reopened.score.metadata.composer,'Friedrich Burgmüller');
  assert.strictEqual(reopened.score.metadata.copyright,'Edited rights notice');assert.strictEqual(reopened.score.metadata.license,'Edited status');
  assert.deepStrictEqual(reopened.score.metadata.sources,plain(view.sources));
  assert.strictEqual(draft.score.metadata.copyright,'Original rights');
  view.sources[0].url='javascript:alert(1)';view.save();assert.strictEqual(view.saved.length,1);
  assert.strictEqual(view.displayedError,'WORKSHOP_SOURCES_INVALID');
  view.sources=[];view.save();assert.strictEqual(view.saved[1].score.metadata.sources,undefined);
  view.$destroy();
});

test('Escape cancels without submitting or mutating the draft; storage errors preserve typed fields for retry', () => {
  const draft = model.createWorkshopDraft('Original');
  const before = JSON.stringify(draft);
  const view = create(draft, 'WORKSHOP_SAVE_ERROR');
  view.title = 'Unsaved title';
  view.credits.subtitle = 'Unsaved subtitle';
  const event = { key: 'Escape', preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  view.handleKeydown(event);
  assert.strictEqual(view.cancels, 1);
  assert(event.prevented && event.stopped);
  assert.strictEqual(view.saved.length, 0);
  assert.strictEqual(JSON.stringify(draft), before);
  assert.strictEqual(view.displayedError, 'WORKSHOP_SAVE_ERROR');
  view.save();
  assert.strictEqual(view.saved[0].title, 'Unsaved title');
  assert.strictEqual(view.saved[0].score.metadata.subtitle, 'Unsaved subtitle');
  view.$destroy();
});

test('keyboard focus wraps visible dialog controls and omits collapsed credit inputs', () => {
  const previousDocument = global.document;
  global.document = { activeElement: null };
  const view = create();
  function control(visible = true) {
    return { getClientRects: () => visible ? [1] : [], focus() { document.activeElement = this; } };
  }
  const first = control(), hidden = control(false), last = control();
  view.$refs.dialog = { querySelectorAll: () => [first, hidden, last] };
  let prevented = 0;
  document.activeElement = first;
  view.handleKeydown({ key: 'Tab', shiftKey: true, preventDefault() { prevented++; } });
  assert.strictEqual(document.activeElement, last);
  view.handleKeydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented++; } });
  assert.strictEqual(document.activeElement, first);
  assert.strictEqual(prevented, 2);
  view.$destroy();
  if (previousDocument === undefined) delete global.document; else global.document = previousDocument;
});

console.log(checks + ' workshop piece-details checks passed.');
