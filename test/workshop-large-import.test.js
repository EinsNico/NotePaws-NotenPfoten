const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module'), babel = require('babel-core');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const sourceRoot = path.resolve(__dirname, '../src') + path.sep, original = Module._extensions['.js'];
Module._extensions['.js'] = (mod, file) => {
  if (!file.startsWith(sourceRoot)) return original(mod, file);
  let source = fs.readFileSync(file, 'utf8');
  const before = process.env.WORKSHOP_IMPORT_BEFORE;
  const saved = before && path.join(before, path.relative(path.resolve(__dirname, '..'), file).replace(/\//g, '__') + '.before');
  if (saved && fs.existsSync(saved)) source = fs.readFileSync(saved, 'utf8');
  mod._compile(babel.transform(source, { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code, file);
};
const model = require('../src/model/Workshop'), io = require('../src/model/WorkshopMusicXml'), files = require('../src/model/WorkshopFileExchange');
const archive = require('../src/model/WorkshopMusicXmlArchive'), storage = require('../src/model/WorkshopStorage'), encoding = require('../src/model/WorkshopLibraryEncoding');
const midi = require('../src/model/WorkshopMidi');
Module._extensions['.js'] = original;
const MAX = 30 * 1024 * 1024;
function memoryStore(maxChars = 5 * 1024 * 1024) {
  const values = new Map();
  return { values, fail: false,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (this.fail || String(value).length > maxChars) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      values.set(key, String(value));
    }, removeItem(key) { values.delete(key); }
  };
}
const header = '<score-partwise><work><work-title>Large piano</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part>';
function xml(size, unit = 'x') {
  const extra = size - Buffer.byteLength(header + '<!----></score-partwise>');
  return header + '<!--' + unit.repeat(Math.floor(extra / Buffer.byteLength(unit))) + '--></score-partwise>';
}
let groups = 0;
async function test(name, action) { await action(); groups++; console.log('✓ large import: ' + name); }
async function run() {
  await test('accepts an ordinary MusicXML file above the old two-MiB boundary without discarding its source', () => {
    const source = xml(3 * 1024 * 1024), result = io.importWorkshopMusicXmlText(source);
    assert.strictEqual(result.score.musicXml.sourceXml, source);
    assert.strictEqual(result.score.parts[0].measures[0].events.filter(e => e.kind === 'note').length, 1);
    assert(model.isValidWorkshopScore(result.score));
  });
  await test('accepts exactly 30 MiB, rejects a larger original and counts UTF-8 bytes rather than characters', () => {
    assert.strictEqual(archive.WORKSHOP_MUSICXML_MAX_SOURCE_BYTES, MAX);
    const source = xml(MAX); assert.strictEqual(Buffer.byteLength(source), MAX);
    assert.strictEqual(io.importWorkshopMusicXmlText(source).score.musicXml.sourceXml, source);
    for (const tooBig of [xml(MAX + 1), xml(MAX + 2, 'ä') + ' '])
      assert.throws(() => io.importWorkshopMusicXmlText(tooBig), error => error.code === 'musicxml-too-large');
  });
  await test('stores and reopens a 30-MiB original and an edited version within a five-MiB storage quota', () => {
    const source = xml(MAX), result = io.importWorkshopMusicXmlText(source), draft = model.createWorkshopDraft('Large piano');
    draft.score = result.score;
    const store = memoryStore(), first = storage.storeWorkshopDraft(draft, store);
    const reopened = model.openWorkshopPiece(storage.readWorkshopLibrary(store).pieces[0]);
    assert.strictEqual(reopened.score.musicXml.sourceXml, source);
    reopened.score.bpm = reopened.score.bpm === 110 ? 111 : 110;
    const second = storage.storeWorkshopDraft(reopened, store);
    const restored = storage.readWorkshopLibrary(store);
    assert.strictEqual(restored.pieces[0].revisions.length, 2);
    assert.strictEqual(model.openWorkshopPiece(restored.pieces[0]).score.bpm, reopened.score.bpm);
    assert.strictEqual(model.openWorkshopPiece(restored.pieces[0], first.piece.currentRevisionId).score.musicXml.sourceXml, source);
    assert.strictEqual(model.openWorkshopPiece(restored.pieces[0]).score.musicXml.sourceXml, source);
    assert.deepStrictEqual(restored, second.library);
    assert(store.getItem(model.WORKSHOP_STORAGE_KEY).length < 1024 * 1024);
  });
  await test('an edited 30-MiB original exports and reimports its exact original and edited pitch', () => {
    const source = xml(MAX), result = io.importWorkshopMusicXmlText(source);
    result.score.parts[0].measures[0].events[0].pitch.step = 'D';
    const exported = io.exportWorkshopMusicXmlText(result.score, { title: 'Edited large piano' });
    const restored = io.importWorkshopMusicXmlText(exported.data);
    assert.strictEqual(restored.score.musicXml.sourceXml, source);
    assert.strictEqual(restored.score.parts[0].measures[0].events[0].pitch.step, 'D');
  });
  await test('valid MIDI above the old eight-MiB boundary imports and larger than 30 MiB is rejected', () => {
    const padding = Buffer.alloc(9 * 1024 * 1024, 32);
    function vlq(value) { const bytes = [value & 127]; while (value >>= 7) bytes.unshift((value & 127) | 128); return bytes; }
    const track = Buffer.concat([Buffer.from([0, 255, 1, ...vlq(padding.length)]), padding,
      Buffer.from([0, 144, 60, 90, ...vlq(480), 128, 60, 0, 0, 255, 47, 0])]);
    const length = Buffer.alloc(4); length.writeUInt32BE(track.length);
    const bytes = Buffer.concat([Buffer.from('MThd'), Buffer.from([0,0,0,6,0,0,0,1,1,224]), Buffer.from('MTrk'), length, track]);
    const imported = midi.importWorkshopMidi(bytes);
    assert(model.isValidWorkshopScore(imported.score));
    assert.strictEqual(imported.score.parts.flatMap(p => p.measures.flatMap(bar => bar.events)).filter(e => e.kind === 'note').length, 1);
    assert.throws(() => midi.importWorkshopMidi(new Uint8Array(MAX + 1)), error => error.code === 'midi-too-large');
  });
  await test('large MusicXML uses both browser and Android stream adapters without the former small-file cutoff', async () => {
    const bytes = Buffer.from(xml(3 * 1024 * 1024));
    const browser = await files.readWorkshopMusicFile({ name: 'large.musicxml', size: bytes.length, async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } });
    let offset = 0, closed = false;
    const native = await files.readWorkshopMusicFile(null, {
      openStream(mime, done) { done({ token: 'large', name: 'large.musicxml', size: bytes.length }); },
      readChunk(token, done) { const end = Math.min(offset + 65536, bytes.length), data = bytes.subarray(offset, end).toString('base64'); offset = end; done({ token, data, done: offset === bytes.length }); },
      closeStream(token, done) { closed = true; done({}); }
    });
    assert(closed); assert.deepStrictEqual(native.data, browser.data);
    assert.strictEqual((await io.importWorkshopMusicXml(native.data)).score.parts[0].measures[0].events.length, 1);
  });
  await test('legacy uncompressed libraries remain readable and small writes retain their existing format', () => {
    const store = memoryStore(), saved = model.saveWorkshopDraft({ version: 1, pieces: [] }, model.createWorkshopDraft('Old piece'));
    const old = JSON.stringify({ data: saved.library }); store.setItem(model.WORKSHOP_STORAGE_KEY, old);
    assert.deepStrictEqual(storage.readWorkshopLibrary(store), saved.library);
    const reopened = model.openWorkshopPiece(saved.piece); reopened.title = 'Renamed'; storage.storeWorkshopDraft(reopened, store);
    assert.strictEqual(JSON.parse(store.getItem(model.WORKSHOP_STORAGE_KEY)).encoding, undefined);
    assert.strictEqual(storage.readWorkshopLibrary(store).pieces[0].title, 'Renamed');
  });
  await test('a failed large write preserves the previous raw save and the unsaved draft', () => {
    const store = memoryStore(), draft = model.createWorkshopDraft('Existing'); storage.storeWorkshopDraft(draft, store);
    const previous = store.getItem(model.WORKSHOP_STORAGE_KEY);
    const large = model.createWorkshopDraft('New large'); large.score = io.importWorkshopMusicXmlText(xml(3 * 1024 * 1024)).score;
    store.fail = true; assert.throws(() => storage.storeWorkshopDraft(large, store), /quota/);
    assert.strictEqual(store.getItem(model.WORKSHOP_STORAGE_KEY), previous);
    assert.strictEqual(large.score.musicXml.sourceXml.length, 3 * 1024 * 1024);
  });
  await test('damaged, truncated, over-expanding and unknown compressed saves are rejected without writes', () => {
    const library = model.saveWorkshopDraft({ version: 1, pieces: [] }, model.createWorkshopDraft('Corruption checks')).library;
    library.pieces[0].revisions[0].score.musicXml = { sourceXml: '<!--' + 'x'.repeat(200000) + '-->', fingerprint: '', warnings: [] };
    const raw = encoding.encodeWorkshopLibrary(library), packed = JSON.parse(raw); assert(packed.encoding);
    const variants = [Object.assign({}, packed, { encoding: 'unknown' }), Object.assign({}, packed, { bytes: 1 }),
      Object.assign({}, packed, { bytes: 256 * 1024 * 1024 + 1 }), Object.assign({}, packed, { data: '!!!!' }),
      Object.assign({}, packed, { data: Buffer.from(packed.data, 'base64').subarray(0, -2).toString('base64') })];
    for (const bad of variants) {
      const store = memoryStore(), stored = JSON.stringify(bad); store.setItem(model.WORKSHOP_STORAGE_KEY, stored);
      assert.throws(() => storage.readWorkshopLibrary(store)); assert.strictEqual(store.getItem(model.WORKSHOP_STORAGE_KEY), stored);
    }
  });
  console.log('All ' + groups + ' large-import groups passed; synthetic data only.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
