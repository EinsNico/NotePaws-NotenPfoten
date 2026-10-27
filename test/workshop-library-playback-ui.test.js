const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module');
const babel = require('babel-core'), compiler = require('vue-template-compiler'), Vue = require('vue');
global.regeneratorRuntime = require('babel-runtime/regenerator');
global.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {} };
global.document = { addEventListener() {}, removeEventListener() {} };
const stored = new Map();
let rejectWrites = false;
global.localStorage = {
  get length() { return stored.size; }, key(index) { return Array.from(stored.keys())[index] || null; },
  getItem(key) { return stored.has(key) ? stored.get(key) : null; },
  setItem(key, value) { if (rejectWrites) throw new Error('quota'); stored.set(key, String(value)); },
  removeItem(key) { stored.delete(key); }
};
const sourceRoot = path.resolve(__dirname, '../src') + path.sep, originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, 'utf8'), {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code, filename);
};
Module._extensions['.vue'] = mod => { mod.exports = {}; };
const model = require('../src/model/Workshop');
const storage = require('../src/model/WorkshopStorage');
const musicXml = require('../src/model/WorkshopMusicXml');
const backup = require('../src/model/SaveDataBackup');
const AudioSync = require('../src/model/AudioSynchronization').default;
const strings = { de: require('../src/resources/de').default, en: require('../src/resources/en').default };
function component(name) {
  const filename = path.resolve(sourceRoot, 'components', name + '.vue');
  const parsed = compiler.parseComponent(fs.readFileSync(filename, 'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const mod = new Module(filename, module); mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content, { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code, filename);
  return Object.assign({}, mod.exports.default, compiler.compileToFunctions(parsed.template.content));
}
const definition = component('Workshop'), detailsDefinition = component('WorkshopPieceDetails');
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function view(locale = 'de') {
  const instance = new Vue(Object.assign({}, definition, {
    created: undefined, mounted: undefined, beforeDestroy: undefined,
    methods: Object.assign({}, definition.methods, {
      $t(key) { return strings[locale][key] || key; }, $tc(key) { return strings[locale][key] || key; }
    })
  }));
  instance.$i18n = { locale }; instance.player = { play() {}, stopAll() {} };
  instance.loadLibrary(); instance.pieces.forEach(piece => instance.togglePieceExpanded(piece)); return instance;
}
function details(parent) {
  const child = new Vue(Object.assign({}, detailsDefinition, {
    mounted: undefined, beforeDestroy: undefined, propsData: { draft: parent.pieceDetailsDraft, error: parent.pieceDetailsError },
    methods: Object.assign({}, detailsDefinition.methods, { $t: key => key })
  }));
  child.$on('save', draft => { parent.savePieceDetails(draft); child.error = parent.pieceDetailsError; });
  child.$on('cancel', () => parent.closePieceDetails());
  return child;
}
function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
function sourcePiece() {
  const source = '<score-partwise version="4.0"><work><work-title>Imported song</work-title></work>' +
    '<identification><creator type="composer">Original composer</creator></identification>' +
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">' +
    '<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key>' +
    '<time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>' +
    '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>' +
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>' +
    '<backup><duration>4</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>2</staff></note></measure>' +
    '<measure number="2"><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>' +
    '<measure number="3"><note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note></measure>' +
    '</part></score-partwise>';
  const imported = musicXml.importWorkshopMusicXmlText(source);
  imported.score.layout = { barsPerSystem: 2, systemBreaks: [imported.score.parts[0].measures[2].id] };
  imported.score.musicXml.rootPath = 'score.xml';
  imported.score.musicXml.archiveAssets = [{ path: 'cover.txt', data: 'aGk=' }];
  assert(model.isValidWorkshopScore(imported.score));
  return storage.storeWorkshopDraft({ pieceId: null, title: imported.title, score: imported.score }).piece;
}
function fakeClock() {
  let time = 0, sequence = 0;
  const timers = new Map();
  return {
    timers, now() { return time; },
    setTimeout(callback, delay) { assert(Number.isFinite(delay) && delay >= 0); timers.set(++sequence, { callback, due: time + delay }); return sequence; },
    clearTimeout(id) { timers.delete(id); },
    advanceTo(target) {
      assert(target >= time);
      let iterations = 0;
      while (timers.size) {
        const [id, timer] = Array.from(timers.entries()).sort((a, b) => a[1].due - b[1].due)[0];
        if (timer.due > target) break;
        assert(++iterations < 20000); time = timer.due; timers.delete(id); timer.callback();
      }
      time = target;
    }
  };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function withPlayback(callback, delayMs = 0) {
  stored.clear(); const piece = sourcePiece(), instance = view(), clock = fakeClock(), played = [];
  instance.openPiece(piece);
  const original = { performance:global.performance, requestAnimationFrame:global.requestAnimationFrame, cancelAnimationFrame:global.cancelAnimationFrame,
    setTimeout: global.setTimeout, clearTimeout: global.clearTimeout,
    resume: AudioSync.resume, getContext: AudioSync.getContext, getDelayMs: AudioSync.getDelayMs };
  global.performance={now:clock.now}; global.setTimeout = clock.setTimeout; global.clearTimeout = clock.clearTimeout;
  global.requestAnimationFrame = callback => clock.setTimeout(callback, 16); global.cancelAnimationFrame = clock.clearTimeout;
  AudioSync.resume = async () => true; AudioSync.getContext = () => ({ state: 'running' }); AudioSync.getDelayMs = () => delayMs;
  instance.player = { play(value) { played.push({ value, time: clock.now(), listeningView: instance.listeningView }); return { pause() {}, currentTime: 0 }; }, stopAll() {} };
  try { await callback(instance, clock, played); }
  finally {
    instance.stopPlayback(); instance.$destroy();
    global.performance=original.performance; global.setTimeout = original.setTimeout; global.clearTimeout = original.clearTimeout;
    global.requestAnimationFrame=original.requestAnimationFrame; global.cancelAnimationFrame=original.cancelAnimationFrame;
    AudioSync.resume = original.resume; AudioSync.getContext = original.getContext; AudioSync.getDelayMs = original.getDelayMs;
  }
}
const cases = [];
function test(name, callback) { cases.push({ name, callback }); }

test('Play commits a focused tempo and title before preparing its exact playback timeline', async () => {
  await withPlayback(async instance => {
    instance.tempoInput='90';instance.beginTitleEdit();instance.draft.title='Focused title';
    await instance.startPlayback();
    assert.strictEqual(instance.tempoInput,null);assert.strictEqual(instance.draft.score.bpm,90);assert.strictEqual(instance.titleEditStart,null);
    assert.strictEqual(instance.draft.title,'Focused title');assert.strictEqual(instance.playback.getTimeline().durationMs,8000);
    instance.stopPlayback();instance.undo();assert.strictEqual(instance.draft.score.bpm,60);
    instance.undo();assert.strictEqual(instance.draft.title,'Imported song');
  });
});

test('library offers separate edit and rename actions; cancelling or saving unchanged details leaves storage untouched', () => {
  stored.clear(); const piece = sourcePiece(), before = localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
  for (const locale of ['de', 'en']) {
    const parent = view(locale);
    const actions = nodes(parent._render()).filter(node => node.tag === 'button' && node.data && node.data.attrs && node.data.attrs['aria-label']);
    assert(actions.some(node => node.data.attrs['aria-label'] === strings[locale].WORKSHOP_RENAME + ': ' + piece.title));
    assert(actions.some(node => node.data.attrs['aria-label'] === strings[locale].WORKSHOP_LIBRARY_EDIT + ': ' + piece.title));
    parent.openPieceDetails(piece); assert(parent.pieceDetailsDraft); assert.strictEqual(parent.draft, null);
    const child = details(parent); child.title = 'Cancelled name'; child.$emit('cancel');
    assert.strictEqual(parent.pieceDetailsDraft, null); assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY), before);
    child.$destroy(); parent.openPieceDetails(piece);
    assert.strictEqual(parent.savePieceDetails(plain(parent.pieceDetailsDraft)), true);
    assert.strictEqual(parent.pieceDetailsDraft, null); assert.strictEqual(parent.draft, null);
    assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY), before);
    assert.strictEqual(storage.readWorkshopLibrary().pieces[0].revisions.length, 1);
    parent.$destroy();
  }
});

test('library detail save persists rename, tempo and credits without opening the editor or losing XML, notes, layout and previous revisions', async () => {
  stored.clear(); const piece = sourcePiece(), original = model.openWorkshopPiece(piece), parent = view();
  parent.openPieceDetails(piece); const child = details(parent);
  child.title = 'New song name'; child.tempo = '90'; child.credits.composer = 'New composer'; child.credits.copyright = '© 2026\nA & B'; child.save();
  assert.strictEqual(parent.pieceDetailsDraft, null); assert.strictEqual(parent.draft, null); assert.strictEqual(parent.libraryNotice, 'WORKSHOP_SAVED');
  const saved = storage.readWorkshopLibrary().pieces[0], reopened = model.openWorkshopPiece(saved);
  assert.strictEqual(saved.revisions.length, 2); assert.deepStrictEqual(saved.revisions[0], piece.revisions[0]);
  assert.strictEqual(reopened.title, 'New song name'); assert.strictEqual(reopened.score.bpm, 90);
  assert.strictEqual(reopened.score.metadata.title, 'New song name'); assert.strictEqual(reopened.score.metadata.composer, 'New composer');
  assert.strictEqual(reopened.score.metadata.copyright, '© 2026\nA & B');
  for (const key of ['parts', 'layout', 'musicXml']) assert.deepStrictEqual(reopened.score[key], original.score[key]);
  const exportedBackup = backup.createSaveDataBackup(localStorage);
  assert(backup.validateSaveDataBackup(exportedBackup).valid);
  assert.strictEqual(exportedBackup.data.workshopLibrary, undefined);
  const exportedXml = await musicXml.exportWorkshopMusicXml(reopened.score, { title: reopened.title, compressed: true });
  const reimported = await musicXml.importWorkshopMusicXml(exportedXml.data, { filename: 'renamed.mxl' });
  assert.strictEqual(reimported.title, reopened.title); assert.strictEqual(reimported.score.bpm, 90);
  assert.strictEqual(reimported.score.metadata.composer, 'New composer');
  assert.deepStrictEqual(reimported.score.musicXml.archiveAssets, reopened.score.musicXml.archiveAssets);
  const pitches = score => model.workshopTimeline(score).events.filter(event => event.value !== null).map(event => [event.value, event.startMs, event.durationMs]);
  assert.deepStrictEqual(pitches(reimported.score), pitches(reopened.score));
  parent.openPiece(saved); assert.deepStrictEqual(plain(parent.draft), reopened); assert.strictEqual(parent.dirty, false);
  child.$destroy(); parent.$destroy();
});

test('failed library save keeps the dialog and typed values available for retry; Back closes it without touching storage', () => {
  stored.clear(); const piece = sourcePiece(), before = localStorage.getItem(model.WORKSHOP_STORAGE_KEY), parent = view();
  parent.openPieceDetails(piece); const child = details(parent); child.title = 'Retry title'; child.tempo = '100';
  rejectWrites = true;
  try { child.save(); } finally { rejectWrites = false; }
  assert(parent.pieceDetailsDraft); assert.strictEqual(parent.draft, null); assert.strictEqual(child.title, 'Retry title');
  assert.strictEqual(child.displayedError, 'WORKSHOP_SAVE_ERROR'); assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY), before);
  child.save(); assert.strictEqual(parent.pieceDetailsDraft, null);
  assert.strictEqual(parent.pieces[0].title, 'Retry title'); child.$destroy();
  const saved = localStorage.getItem(model.WORKSHOP_STORAGE_KEY); parent.openPieceDetails(parent.pieces[0]);
  assert.strictEqual(parent.handleBack(), true); assert.strictEqual(parent.pieceDetailsDraft, null); assert.strictEqual(parent.draft, null);
  assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY), saved); parent.$destroy();
});

test('whole-piece audition switches to listening strip before the first sound and follows heard bars without modifying saved state or undo', async () => {
  await withPlayback(async (parent, clock, played) => {
    parent.selectBar(2); const before = JSON.stringify(parent.draft), history = JSON.stringify(parent.undoStack);
    assert.strictEqual(parent.sheetView, false); await parent.startPlayback();
    assert.strictEqual(parent.listeningView, true); assert.strictEqual(parent.barIndex, 0); assert.strictEqual(parent.playing, true);
    assert(played.length > 0 && played.every(event => event.listeningView));
    clock.advanceTo(4000); assert.strictEqual(parent.barIndex, 0);
    clock.advanceTo(4300); assert.strictEqual(parent.barIndex, 1); assert.strictEqual(parent.playingBar, 1);
    clock.advanceTo(8300); assert.strictEqual(parent.barIndex, 2); assert.strictEqual(parent.playingBar, 2);
    clock.advanceTo(12300); assert.strictEqual(parent.playing, false); assert.strictEqual(parent.barIndex, 2);
    assert.strictEqual(parent.playingBar, 2); assert.strictEqual(parent.dirty, false);
    assert.strictEqual(JSON.stringify(parent.draft), before); assert.strictEqual(JSON.stringify(parent.undoStack), history);
    assert.strictEqual(clock.timers.size, 0);
  }, 300);
});

test('a silent opening measure remains visible before the first note; Stop retains the last heard bar rather than an upcoming buffered one', async () => {
  await withPlayback(async (parent, clock, played) => {
    parent.draft.score.parts.forEach(part => { part.measures[0].events = []; });
    parent.baseline = JSON.stringify(parent.draft);
    await parent.startPlayback();
    assert.strictEqual(parent.listeningView, true); assert.strictEqual(parent.barIndex, 0); assert.strictEqual(played.length, 0);
    clock.advanceTo(500); assert.strictEqual(parent.playingBar, 0); assert.deepStrictEqual(plain(parent.activeEventIds), []);
    clock.advanceTo(4100); assert(played.length > 0); assert.strictEqual(parent.barIndex, 0);
    parent.stopPlayback(); assert.strictEqual(parent.barIndex, 0); assert.strictEqual(parent.playing, false);
    assert.strictEqual(clock.timers.size, 0); clock.advanceTo(20000); assert.strictEqual(parent.barIndex, 0);
    assert.strictEqual(parent.dirty, false);
  }, 500);
});

test('selected-bar audition stays in the single-bar editor and never plays neighbouring bars', async () => {
  await withPlayback(async (parent, clock, played) => {
    parent.selectBar(1); const start = parent.startPlayback.bind(parent); let pending;
    parent.startPlayback = (...args) => { pending = start(...args); return pending; };
    parent.toggleBarPlayback(); await pending;
    assert.strictEqual(parent.sheetView, false); assert.strictEqual(parent.barIndex, 1); assert.strictEqual(parent.playbackBarIndex, 1);
    assert.strictEqual(parent.playingBar, 1); clock.advanceTo(5000);
    assert.deepStrictEqual(played.map(event => event.value), [50]); assert.strictEqual(parent.playing, false);
    assert.strictEqual(parent.barIndex, 1); assert.strictEqual(clock.timers.size, 0);
    const tabs=nodes(parent._render()).filter(node=>node.tag === 'button' && node.data.attrs && node.data.attrs.role === 'tab');
    assert(tabs.every(node=>!node.data.class.sounding),'completed audition must remove its sounding border');
    assert(tabs[1].data.class.selected,'normal bar selection remains visible');
  });
});

test('both editor transport controls pause and resume the same single-bar audition without playing neighbouring bars',async()=>{
  await withPlayback(async(parent,clock,played)=>{
    parent.selectBar(1);await parent.startPlayback(1);
    const playback=parent.playback,storedBefore=localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
    clock.advanceTo(1200);parent.togglePlayback();
    assert.strictEqual(parent.playback,playback);assert.strictEqual(parent.playing,false);assert.strictEqual(parent.playbackPaused,true);
    assert.strictEqual(parent.playbackPosition,1200);assert.strictEqual(clock.timers.size,0);assert.strictEqual(parent.playbackBarIndex,1);
    let tabs=nodes(parent._render()).filter(node=>node.tag === 'button' && node.data.attrs && node.data.attrs.role === 'tab');
    assert(tabs.every(node=>!node.data.class.sounding),'paused bars are not shown as sounding');
    clock.advanceTo(5000);assert.strictEqual(parent.playback.getPosition(),1200);
    parent.toggleBarPlayback();await Promise.resolve();await Promise.resolve();
    assert.strictEqual(parent.playback,playback);assert.strictEqual(parent.playing,true);assert.strictEqual(parent.playbackBarIndex,1);
    parent.toggleBarPlayback();assert.strictEqual(parent.playbackPaused,true);
    parent.togglePlayback();await Promise.resolve();await Promise.resolve();
    assert.strictEqual(parent.playback,playback);assert.strictEqual(parent.playing,true);
    clock.advanceTo(8000);assert(played.every(event=>event.value === 50));
    assert.strictEqual(parent.playing,false);assert.strictEqual(parent.playbackPaused,false);assert.strictEqual(clock.timers.size,0);
    parent.selectBar(2);tabs=nodes(parent._render()).filter(node=>node.tag === 'button' && node.data.attrs && node.data.attrs.role === 'tab');
    assert(tabs.every(node=>!node.data.class.sounding));assert(tabs[2].data.class.selected);
    assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),storedBefore);
  });
});

test('changing the selected bar cancels a paused single-bar transport and its pending resume',async()=>{
  await withPlayback(async(parent,clock,played)=>{
    parent.selectBar(1);await parent.startPlayback(1);clock.advanceTo(1000);parent.pausePlayback();
    const pending=deferred();AudioSync.resume=()=>pending.promise;
    const resuming=parent.resumePlayback();parent.selectBar(2);const count=played.length;
    pending.resolve(true);await resuming;
    assert.strictEqual(parent.playback,null);assert.strictEqual(parent.playing,false);assert.strictEqual(parent.playbackPaused,false);
    assert.strictEqual(parent.playbackBarIndex,null);assert.strictEqual(parent.barIndex,2);assert.strictEqual(played.length,count);
    assert.strictEqual(clock.timers.size,0);
  });
});

test('cancelling an audio-resume request or closing the editor cannot start stale playback', async () => {
  await withPlayback(async (parent, clock, played) => {
    let pendingAudio = deferred(); AudioSync.resume = () => pendingAudio.promise;
    const pendingStart = parent.startPlayback(); assert.strictEqual(parent.audioStarting, true);
    parent.togglePlayback(); assert.strictEqual(parent.audioStarting, false);
    pendingAudio.resolve(true); await pendingStart;
    assert.strictEqual(parent.playing, false); assert.strictEqual(parent.sheetView, false); assert.strictEqual(played.length, 0);
    pendingAudio = deferred(); const closingStart = parent.startPlayback(); parent.closeEditor();
    pendingAudio.resolve(true); await closingStart;
    assert.strictEqual(parent.draft, null); assert.strictEqual(parent.playing, false); assert.strictEqual(parent.audioStarting, false);
    assert.strictEqual(played.length, 0); assert.strictEqual(clock.timers.size, 0);
  });
});

test('closing during sample loading prevents a late load from starting sound or the strip', async () => {
  await withPlayback(async (parent, clock, played) => {
    const loading=deferred(), enteredLoading=deferred();
    parent.previewPlayer={ prepare() { enteredLoading.resolve(); return loading.promise; },
      play:parent.player.play, stopAll:parent.player.stopAll };
    const starting=parent.startPlayback(); await enteredLoading.promise;
    assert.strictEqual(parent.audioStarting,true); assert.strictEqual(played.length,0);
    parent.closeEditor(); loading.resolve(true); await starting;
    assert.strictEqual(parent.playing,false); assert.strictEqual(parent.draft,null);
    assert.strictEqual(played.length,0); assert.strictEqual(clock.timers.size,0);
  });
});

test('closing during strip-render preparation prevents the pending next tick from creating a playback session', async () => {
  await withPlayback(async (parent, clock, played) => {
    const rendering = deferred(), enteredRendering = deferred();
    parent.$nextTick = () => { enteredRendering.resolve(); return rendering.promise; };
    const starting = parent.startPlayback(); await enteredRendering.promise;
    assert.strictEqual(parent.listeningView, true); assert.strictEqual(parent.audioStarting, true); assert.strictEqual(played.length, 0);
    parent.closeEditor(); rendering.resolve(); await starting;
    assert.strictEqual(parent.draft, null); assert.strictEqual(parent.playing, false); assert.strictEqual(parent.audioStarting, false);
    assert.strictEqual(played.length, 0); assert.strictEqual(clock.timers.size, 0);
  });
});

test('Pause and Play preserve the audible position and keep the same listening session without undo or saved-data changes', async () => {
  await withPlayback(async (parent, clock, played) => {
    const originalDraft = JSON.stringify(parent.draft), storedBefore = localStorage.getItem(model.WORKSHOP_STORAGE_KEY);
    await parent.startPlayback(); const playback = parent.playback, timeline = parent.playbackTimeline;
    clock.advanceTo(1800); parent.togglePlayback();
    assert.strictEqual(parent.playing, false); assert.strictEqual(parent.playbackPaused, true); assert.strictEqual(parent.listeningView, true);
    assert.strictEqual(parent.playbackPosition, 1500); assert.strictEqual(clock.timers.size, 0);
    const previousPlays = played.length; clock.advanceTo(5000);
    assert.strictEqual(played.length, previousPlays); assert.strictEqual(parent.playbackPosition, 1500);
    await parent.resumePlayback(); assert.strictEqual(parent.playback, playback); assert.strictEqual(parent.playbackTimeline, timeline);
    assert.strictEqual(parent.playing, true); assert.strictEqual(parent.playbackPaused, false); assert.strictEqual(parent.audioStarting, false);
    clock.advanceTo(5312); assert.strictEqual(parent.playback.getPosition(), 1512);
    assert(parent.playbackPosition > 1500 && parent.playbackPosition <= 1512 && 1512 - parent.playbackPosition < 16);
    assert.strictEqual(parent.dirty, false); assert.strictEqual(parent.undoStack.length, 0);
    assert.strictEqual(JSON.stringify(parent.draft), originalDraft); assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY), storedBefore);
  }, 300);
});

test('jumping and dragging preserve the intended playing or paused state and never play while the drag is held', async () => {
  await withPlayback(async (parent, clock, played) => {
    await parent.startPlayback(); const timeline = parent.playbackTimeline;
    parent.seekPlayback(8500); assert.strictEqual(parent.playing, true); assert.strictEqual(parent.playbackPosition, 8500);
    assert.strictEqual(parent.barIndex, 2); assert.strictEqual(parent.playingBar, 2); assert.strictEqual(parent.playbackTimeline, timeline);
    parent.pausePlayback(); const previousPlays = played.length;
    clock.advanceTo(2000); assert.strictEqual(played.length, previousPlays); assert.strictEqual(clock.timers.size, 0);
    let pending; const resume = parent.resumePlayback.bind(parent);
    parent.resumePlayback = () => { pending = resume(); return pending; };
    parent.finishPlaybackScrub({ position:4500, resume:true }); await pending;
    assert.strictEqual(parent.playbackPosition, 4500); assert.strictEqual(parent.playing, true); assert.strictEqual(parent.barIndex, 1);
    parent.pausePlayback(); parent.finishPlaybackScrub({ position:1000, resume:false });
    assert.strictEqual(parent.playbackPosition, 1000); assert.strictEqual(parent.playing, false); assert.strictEqual(parent.playbackPaused, true);
    assert.strictEqual(parent.barIndex, 0); assert.strictEqual(clock.timers.size, 0);
    parent.seekPlayback(NaN); assert.strictEqual(parent.playbackPosition, 1000);
    parent.seekPlayback(999999); assert.strictEqual(parent.playbackPosition, 12000); assert.strictEqual(parent.barIndex, 2);
    assert.strictEqual(parent.playbackPaused, true); assert.strictEqual(parent.dirty, false);
  }, 250);
});

test('natural end keeps the listening view at the final position and Play restarts the same session at zero', async () => {
  await withPlayback(async (parent, clock, played) => {
    await parent.startPlayback(); const playback = parent.playback;
    clock.advanceTo(12300); assert.strictEqual(parent.playing, false); assert.strictEqual(parent.playbackPaused, false);
    assert.strictEqual(parent.listeningView, true); assert.strictEqual(parent.playbackPosition, 12000); assert.strictEqual(parent.barIndex, 2);
    assert.strictEqual(clock.timers.size, 0); const previousPlays = played.length;
    await parent.resumePlayback(); assert.strictEqual(parent.playback, playback); assert.strictEqual(parent.playing, true);
    assert.strictEqual(parent.playbackPosition, 0); assert(played.length > previousPlays);
    clock.advanceTo(12600); assert.strictEqual(parent.barIndex, 0); assert.strictEqual(parent.playingBar, 0);
  }, 300);
});

test('a pending resume cannot restart a cancelled or replaced player; failed resume keeps the paused position for retry', async () => {
  await withPlayback(async (parent, clock, played) => {
    await parent.startPlayback(); clock.advanceTo(1100); parent.pausePlayback();
    let pendingAudio = deferred(); AudioSync.resume = () => pendingAudio.promise;
    const cancelledResume = parent.resumePlayback(); assert.strictEqual(parent.audioStarting, true);
    parent.togglePlayback(); const count = played.length; pendingAudio.resolve(true); await cancelledResume;
    assert.strictEqual(parent.playback, null); assert.strictEqual(parent.listeningView, false); assert.strictEqual(parent.audioStarting, false);
    assert.strictEqual(parent.playing, false); assert.strictEqual(played.length, count); assert.strictEqual(clock.timers.size, 0);
    AudioSync.resume = async () => true; await parent.startPlayback(); parent.pausePlayback(); parent.seekPlayback(4500);
    pendingAudio = deferred(); AudioSync.resume = () => pendingAudio.promise; const obsoleteResume = parent.resumePlayback();
    parent.stopPlayback(); AudioSync.resume = async () => true; await parent.startPlayback(); const newPlayback = parent.playback;
    pendingAudio.resolve(true); await obsoleteResume;
    assert.strictEqual(parent.playback, newPlayback); assert.strictEqual(parent.playbackPosition, 0); assert.strictEqual(parent.playing, true);
    parent.pausePlayback(); parent.seekPlayback(6500); AudioSync.resume = async () => false; AudioSync.getContext = () => ({ state:'suspended' });
    await parent.resumePlayback(); assert.strictEqual(parent.playing, false); assert.strictEqual(parent.playbackPaused, true);
    assert.strictEqual(parent.playbackPosition, 6500); assert.strictEqual(parent.playbackError, 'WORKSHOP_AUDIO_UNAVAILABLE'); assert.strictEqual(parent.audioStarting, false);
    AudioSync.resume = async () => true; AudioSync.getContext = () => ({ state:'running' }); await parent.resumePlayback();
    assert.strictEqual(parent.playing, true); assert.strictEqual(parent.playbackPosition, 6500); assert.strictEqual(parent.playbackError, null);
  }, 100);
});

test('editing a heard bar, closing listening and Back release transport before returning to the unchanged editor', async () => {
  await withPlayback(async (parent, clock) => {
    const before = JSON.stringify(parent.draft); await parent.startPlayback(); parent.seekPlayback(8400);
    parent.openSheetBar(2); assert.strictEqual(parent.barIndex, 2); assert.strictEqual(parent.sheetView, false);
    assert.strictEqual(parent.listeningView, false); assert.strictEqual(parent.playback, null); assert.strictEqual(clock.timers.size, 0);
    assert.deepStrictEqual(plain(parent.activeEventIds), []); assert.strictEqual(JSON.stringify(parent.draft), before); assert.strictEqual(parent.dirty, false);
    await parent.startPlayback(); parent.pausePlayback(); parent.seekPlayback(4200); assert.strictEqual(parent.handleBack(), true);
    assert(parent.draft); assert.strictEqual(parent.barIndex, 1); assert.strictEqual(parent.listeningView, false); assert.strictEqual(parent.playback, null);
    assert.strictEqual(parent.handleBack(), true); assert.strictEqual(parent.draft, null); assert.strictEqual(clock.timers.size, 0);
  });
});

async function run() {
  for (const { name, callback } of cases) { await callback(); console.log('✓ ' + name); }
  console.log(cases.length + ' workshop library and playback UI checks passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
