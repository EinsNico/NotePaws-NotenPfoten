const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module');
const babel = require('babel-core'), compiler = require('vue-template-compiler'), Vue = require('vue');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const values = new Map();
let writes = 0;
global.localStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem(key, value) { writes++; values.set(key, String(value)); },
  removeItem(key) { writes++; values.delete(key); }
};
global.window = { addEventListener() {}, removeEventListener() {}, scrollTo() {} };
global.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
const sourceRoot = path.resolve(__dirname, '../src') + path.sep, originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, 'utf8'), {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code, filename);
};
Module._extensions['.vue'] = mod => { mod.exports = {}; };
const filename = sourceRoot + 'components/Workshop.vue';
const parsed = compiler.parseComponent(fs.readFileSync(filename, 'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
const mod = new Module(filename, module); mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(babel.transform(parsed.script.content, {
  babelrc: false, presets: [['env', { modules: 'commonjs' }]]
}).code, filename);
const definition = Object.assign({}, mod.exports.default, compiler.compileToFunctions(parsed.template.content));
const model = require('../src/model/Workshop'), storage = require('../src/model/WorkshopStorage');
const musicXml = require('../src/model/WorkshopMusicXml'), files = require('../src/model/WorkshopFileExchange');
const parser = require('../src/model/WorkshopMusicXmlParser');
const strings = { de: require('../src/resources/de').default, en: require('../src/resources/en').default };
const originalExport = musicXml.exportWorkshopMusicXml, originalSave = files.saveWorkshopMusicFile;
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
function hasClass(node, name) { return node.data && (node.data.staticClass || '').split(' ').includes(name); }
function exportButtons(instance) { return nodes(instance._render()).filter(node => node.tag === 'button' && hasClass(node, 'export-piece')); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function withoutNative(xml) {
  const root = parser.parseWorkshopMusicXmlDocument(xml);
  const miscellaneous = parser.musicXmlChild(parser.musicXmlChild(root, 'identification'), 'miscellaneous');
  const field = parser.musicXmlChildren(miscellaneous, 'miscellaneous-field').find(item => item.attrs.name === 'notenpfoten-editor-score-v1');
  return field ? xml.slice(0, field.start) + xml.slice(field.end) : xml;
}
function noteRows(score) {
  return score.parts.map((part, staff) => part.measures.flatMap((measure, bar) => measure.events.map(event => [
    staff, bar, event.kind, event.pitch ? model.workshopPitchValue(event.pitch) : null,
    event.startSlot, event.noteValue, event.dots || 0, event.voice || 1
  ])).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
}
function fixture(locale = 'de') {
  values.clear();
  const source = '<score-partwise version="4.0"><work><work-title>Earlier title</work-title></work>' +
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">' +
    '<measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key>' +
    '<time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>' +
    '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>' +
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>' +
    '<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>' +
    '<note><pitch><step>D</step><octave>4</octave></pitch><duration>6</duration><voice>1</voice><type>quarter</type><dot/><staff>1</staff></note>' +
    '<note><rest/><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>' +
    '<note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>' +
    '<backup><duration>16</duration></backup>' +
    '<note><pitch><step>C</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note>' +
    '<note><pitch><step>G</step><octave>2</octave></pitch><duration>8</duration><voice>2</voice><type>half</type><staff>2</staff></note></measure>' +
    '<measure number="2"><note><pitch><step>B</step><octave>3</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type><staff>1</staff></note>' +
    '<backup><duration>16</duration></backup><note><rest/><duration>4</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>' +
    '<note><pitch><step>E</step><octave>3</octave></pitch><duration>12</duration><voice>2</voice><type>half</type><dot/><staff>2</staff></note>' +
    '</measure></part></score-partwise>';
  const imported = musicXml.importWorkshopMusicXmlText(source);
  const stale = storage.storeWorkshopDraft({ pieceId: null, title: imported.title, score: imported.score }).piece;
  const revised = model.openWorkshopPiece(stale);
  revised.title = 'Saved étude & paws'; revised.score.bpm = 96;
  revised.score.parts[0].measures[0].events[0].pitch.alter = 1;
  revised.score = model.setWorkshopMetadata(revised.score, {
    title: revised.title, composer: 'A & B', arranger: 'Library arranger', lyricist: 'Library lyricist', subtitle: 'Both hands',
    copyright: '© 2026 – own arrangement', license: 'User supplied source status',
    sources: [{ label: 'Original score', url: 'https://example.com/score?version=2&staff=both' }]
  });
  assert(model.isValidWorkshopScore(revised.score));
  storage.storeWorkshopDraft(revised);
  const otherDraft = model.createWorkshopDraft('Another piece');
  otherDraft.score.parts[0].measures[0].events = [{ id: 'other-note', kind: 'note', noteValue: 'whole', startSlot: 0, pitch: model.workshopPitchFromValue(48) }];
  storage.storeWorkshopDraft(otherDraft);
  const instance = new Vue(Object.assign({}, definition, {
    created: undefined, mounted: undefined, beforeDestroy: undefined,
    methods: Object.assign({}, definition.methods, {
      $t: (key, args = {}) => Object.keys(args).reduce((text, name) => text.replace('{' + name + '}', args[name]), strings[locale][key] || key),
      $tc: key => strings[locale][key] || key
    }),
    computed: Object.assign({}, definition.computed, { noteNaming: () => 'german' })
  }));
  instance.loadLibrary();instance.pieces.forEach(piece=>instance.togglePieceExpanded(piece));
  const piece = instance.pieces.find(item => item.id === stale.id), other = instance.pieces.find(item => item.id !== stale.id);
  const calls = { libraryStops: 0, playbackStops: 0 };
  instance.libraryPlayback = { stop() { calls.libraryStops++; instance.libraryAudio = { pieceId: null, busy: false, playing: false, error: null }; } };
  instance.playback = { stop() { calls.playbackStops++; } };
  instance.libraryAudio = { pieceId: piece.id, busy: false, playing: true, error: null };
  instance.playing = true;
  writes = 0;
  return { instance, piece, stale, other, calls, before: JSON.stringify(Array.from(values)), libraryBefore: JSON.stringify(instance.library) };
}
function untouched(fixture) {
  assert.strictEqual(writes, 0, 'export must never write local storage');
  assert.strictEqual(JSON.stringify(Array.from(values)), fixture.before);
  assert.strictEqual(JSON.stringify(fixture.instance.library), fixture.libraryBefore);
  assert.strictEqual(fixture.instance.draft, null);
  assert.strictEqual(fixture.instance.dirty, false);
}
async function test(name, run) {
  try { await run(); console.log('✓ library MusicXML export: ' + name); }
  finally { musicXml.exportWorkshopMusicXml = originalExport; files.saveWorkshopMusicFile = originalSave; }
}

(async () => {
  await test('German and English card buttons route the selected saved piece and expose their label and busy state', async () => {
    for (const locale of ['de', 'en']) {
      const current = fixture(locale), { instance } = current, routed = [];
      instance.exportLibraryPiece = async piece => { routed.push(piece.id); return true; };
      const articles = nodes(instance._render()).filter(node => node.tag === 'article' && hasClass(node, 'piece-entry'));
      assert.strictEqual(articles.length, 2);
      for (const article of articles) {
        const button = nodes(article).find(node => node.tag === 'button' && hasClass(node, 'export-piece'));
        const title = nodes(article).find(node=>hasClass(node,'piece-title')).children.map(node=>node.text || '').join('');
        assert(button); assert.strictEqual(button.data.attrs.type, 'button');
        assert.strictEqual(button.data.attrs['aria-label'], strings[locale].WORKSHOP_XML_EXPORT + ': ' + title);
        assert(button.children.some(node => (node.text || '').includes(strings[locale].WORKSHOP_XML_EXPORT)));
        await button.data.on.click();
        assert.strictEqual(routed[routed.length - 1], instance.pieces.find(piece => piece.title === title).id);
      }
      instance.xmlBusy = true;
      assert(exportButtons(instance).every(button => button.data.attrs.disabled === true));
      untouched(current); instance.$destroy();
    }
  });
  await test('card click exports a complete two-staff MusicXML file through the native saver without opening or changing the piece', async () => {
    const current = fixture(), { instance, piece, calls } = current;
    assert(instance.togglePracticeHand(piece, 'left'));
    const handsBefore = plain(instance.practiceHands), chunks = [], saves = [];
    files.saveWorkshopMusicFile = async (result, title) => {
      assert.strictEqual(instance.xmlBusy, true); assert.strictEqual(instance.xmlMessage, null);
      assert.strictEqual(calls.libraryStops, 1); assert.strictEqual(calls.playbackStops, 1);
      saves.push({ result, title });
      return originalSave(result, title, {
        openWriteStream(name, mimeType, done) { saves[0].filename = name; saves[0].mimeType = mimeType; done({ token: 'export-token' }); },
        writeBinaryChunk(token, data, done) { assert.strictEqual(token, 'export-token'); chunks.push(Buffer.from(data, 'base64')); done({ token }); },
        finishWriteStream(token, bytes, done) { assert.strictEqual(token, 'export-token'); done({ status: 'saved', verified: true, bytesWritten: bytes }); }
      });
    };
    const button = exportButtons(instance).find(node => node.data.attrs['aria-label'].endsWith(': ' + piece.title));
    assert.strictEqual(await button.data.on.click(), true);
    assert.strictEqual(saves.length, 1); assert.strictEqual(saves[0].title, piece.title);
    assert.strictEqual(saves[0].filename, piece.title + '.musicxml');
    assert.strictEqual(saves[0].mimeType, 'application/vnd.recordare.musicxml+xml');
    const exported = Buffer.concat(chunks).toString('utf8'); assert.strictEqual(exported, saves[0].result.data);
    const expected = plain(instance.pieceScore(piece));
    for (const xml of [exported, withoutNative(exported)]) {
      const back = await musicXml.importWorkshopMusicXml(xml, { filename: saves[0].filename });
      assert.strictEqual(back.title, piece.title); assert.strictEqual(back.score.parts.length, 2);
      assert.strictEqual(back.score.bpm, expected.bpm); assert.strictEqual(back.score.meter, expected.meter);
      assert.deepStrictEqual(noteRows(back.score), noteRows(expected));
      assert.deepStrictEqual(back.score.metadata, expected.metadata);
    }
    assert.strictEqual(instance.xmlMessage, 'WORKSHOP_XML_EXPORTED'); assert.strictEqual(instance.xmlError, null);
    assert.strictEqual(instance.xmlBusy, false); assert.strictEqual(instance.libraryAudio.playing, false); assert.strictEqual(instance.playing, false);
    assert.deepStrictEqual(plain(instance.practiceHands), handsBefore);
    untouched(current); instance.$destroy();
  });
  await test('a stale piece argument uses the current saved revision and title, clones deeply and deduplicates warnings', async () => {
    const current = fixture(), { instance, piece, stale } = current, expected = plain(instance.pieceScore(piece));
    assert.notStrictEqual(stale.currentRevisionId, piece.currentRevisionId);
    let exported = 0, saved = 0;
    musicXml.exportWorkshopMusicXml = async (score, options) => {
      exported++; assert.deepStrictEqual(score, expected);
      assert.deepStrictEqual(options, { title: piece.title, compressed: false });
      assert.notStrictEqual(score, instance.pieceScore(piece));
      score.parts[0].measures[0].events[0].pitch.step = 'G'; score.metadata.composer = 'Exporter mutation';
      return { data: '<score-partwise/>', extension: 'musicxml', mimeType: 'application/vnd.recordare.musicxml+xml', warnings: ['source-preserved', 'source-preserved', 'layout-approximate'] };
    };
    files.saveWorkshopMusicFile = async (result, title) => { saved++; assert.strictEqual(title, piece.title); return true; };
    assert.strictEqual(await instance.exportLibraryPiece(stale), true);
    assert.strictEqual(exported, 1); assert.strictEqual(saved, 1);
    assert.deepStrictEqual(plain(instance.xmlWarnings), ['source-preserved', 'layout-approximate']);
    untouched(current); instance.$destroy();
  });
  await test('cancelled, failed conversion and failed saving clear the lock without claiming success and permit retry', async () => {
    for (const outcome of ['cancelled', 'conversion-error', 'save-error']) {
      const current = fixture(), { instance, piece } = current;
      instance.xmlMessage = 'WORKSHOP_XML_EXPORTED'; instance.xmlError = 'previous-error'; instance.xmlWarnings = ['previous-warning'];
      let saveCalls = 0;
      const result = { data: '<score-partwise/>', extension: 'musicxml', warnings: [] };
      musicXml.exportWorkshopMusicXml = async () => { if (outcome === 'conversion-error') throw new Error('invalid-export'); return result; };
      files.saveWorkshopMusicFile = async () => { saveCalls++; if (outcome === 'save-error') throw new Error('file-verification-failed'); return false; };
      assert.strictEqual(await instance.exportLibraryPiece(piece), false, outcome);
      assert.strictEqual(saveCalls, outcome === 'conversion-error' ? 0 : 1);
      assert.strictEqual(instance.xmlBusy, false); assert.strictEqual(instance.xmlMessage, null);
      assert.strictEqual(instance.xmlError, outcome === 'cancelled' ? null : 'WORKSHOP_XML_EXPORT_ERROR');
      assert.deepStrictEqual(plain(instance.xmlWarnings), []);
      musicXml.exportWorkshopMusicXml = async () => result; files.saveWorkshopMusicFile = async () => true;
      assert.strictEqual(await instance.exportLibraryPiece(piece), true); assert.strictEqual(instance.xmlBusy, false);
      assert.strictEqual(instance.xmlError, null); assert.strictEqual(instance.xmlMessage, 'WORKSHOP_XML_EXPORTED');
      untouched(current); instance.$destroy();
    }
  });
  await test('busy state, open editor, detail dialog, deletion and absent pieces cannot export or stop audio', async () => {
    for (const guard of ['busy', 'draft', 'details', 'delete', 'missing', 'null']) {
      const current = fixture(), { instance, piece, calls } = current;
      musicXml.exportWorkshopMusicXml = async () => { throw new Error('guard called exporter'); };
      files.saveWorkshopMusicFile = async () => { throw new Error('guard called saver'); };
      if (guard === 'busy') instance.xmlBusy = true;
      if (guard === 'draft') instance.draft = model.openWorkshopPiece(piece);
      if (guard === 'details') instance.pieceDetailsDraft = model.openWorkshopPiece(piece);
      if (guard === 'delete') instance.pieceToDelete = { id: piece.id, title: piece.title };
      instance.xmlMessage = 'existing-message'; instance.xmlError = 'existing-error'; instance.xmlWarnings = ['existing-warning'];
      assert.strictEqual(await instance.exportLibraryPiece(guard === 'missing' ? { id: 'missing' } : guard === 'null' ? null : piece), false, guard);
      assert.strictEqual(calls.libraryStops, 0); assert.strictEqual(calls.playbackStops, 0);
      assert.strictEqual(instance.xmlBusy, guard === 'busy'); assert.strictEqual(instance.xmlMessage, 'existing-message');
      assert.strictEqual(instance.xmlError, 'existing-error'); assert.deepStrictEqual(plain(instance.xmlWarnings), ['existing-warning']);
      instance.draft = null; untouched(current); instance.$destroy();
    }
  });
  await test('one export holds the busy lock through conversion and saving and refuses concurrent card exports', async () => {
    const current = fixture(), { instance, piece, other } = current;
    const conversion = deferred(), saving = deferred(), saveStarted = deferred(); let exports = 0, saves = 0;
    musicXml.exportWorkshopMusicXml = () => { exports++; return conversion.promise; };
    files.saveWorkshopMusicFile = () => { saves++; saveStarted.resolve(); return saving.promise; };
    const pending = instance.exportLibraryPiece(piece);
    assert.strictEqual(instance.xmlBusy, true); assert.strictEqual(await instance.exportLibraryPiece(other), false);
    assert.strictEqual(exports, 1); assert.strictEqual(saves, 0);
    conversion.resolve({ data: '<score-partwise/>', extension: 'musicxml', warnings: [] });
    await saveStarted.promise;
    assert.strictEqual(instance.xmlBusy, true); assert.strictEqual(instance.xmlMessage, null);
    assert(exportButtons(instance).every(button => button.data.attrs.disabled === true));
    assert.strictEqual(await instance.exportLibraryPiece(other), false); assert.strictEqual(exports, 1); assert.strictEqual(saves, 1);
    saving.resolve(true); assert.strictEqual(await pending, true); assert.strictEqual(instance.xmlBusy, false);
    assert.strictEqual(instance.xmlMessage, 'WORKSHOP_XML_EXPORTED'); untouched(current); instance.$destroy();
  });
})().catch(error => { console.error(error); process.exitCode = 1; });
