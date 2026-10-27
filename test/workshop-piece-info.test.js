const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module');
const babel = require('babel-core'), compiler = require('vue-template-compiler'), Vue = require('vue');
const sourceRoot = path.resolve(__dirname, '../src') + path.sep;
const originalJsLoader = Module._extensions['.js'];
Module._extensions['.js'] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalJsLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, 'utf8'), {
    babelrc:false, presets:[['env', { modules:'commonjs' }]]
  }).code, filename);
};
const model = require('../src/model/Workshop');
const { createWorkshopPieceInfo, formatWorkshopInfoPitch, formatWorkshopInfoDuration } = require('../src/model/WorkshopPieceInfo');
const Options = require('../src/model/Options').default;
const filename = path.resolve(sourceRoot, 'components/WorkshopPieceInfo.vue');
const parsed = compiler.parseComponent(fs.readFileSync(filename, 'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
const mod = new Module(filename, module);
mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(babel.transform(parsed.script.content, {
  babelrc:false, presets:[['env', { modules:'commonjs' }]]
}).code, filename);
const definition = Object.assign({}, mod.exports.default, compiler.compileToFunctions(parsed.template.content));
Module._extensions['.js'] = originalJsLoader;
function note(id, value=48, startSlot=0, noteValue='quarter', extra={}) {
  return Object.assign({ id, kind:'note', pitch:model.workshopPitchFromValue(value), noteValue, startSlot }, extra);
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function frozen(value) {
  if (value && typeof value === 'object') { Object.keys(value).forEach(key => frozen(value[key])); Object.freeze(value); }
  return value;
}
function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
function renderedText(node) { return nodes(node).map(entry => entry.text || '').join(' '); }
function view(score, props={}) {
  return new Vue(Object.assign({}, definition, {
    mounted:undefined, beforeDestroy:undefined, propsData:Object.assign({ score }, props),
    methods:Object.assign({}, definition.methods, { $t:(key, values) => key + (values ? JSON.stringify(values) : '') }),
    computed:Object.assign({}, definition.computed, { noteNaming:() => Options.noteNaming || 'german' })
  }));
}
let checks = 0;
function test(name, body) { body(); checks++; console.log('✓ ' + name); }

test('counts written chord tones, tied fragments and both active staves once, with performed repeats and tempo', () => {
  const score = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Two hands', 2).score, true);
  score.bpm = 120;
  score.parts.forEach(part => { part.measures[0].repeatStart = true; part.measures[1].repeatEnd = 2; });
  score.parts[0].measures[0].events = [note('chord-c'), note('chord-e',52), note('tie-first',55,6), {
    id:'rest', kind:'rest', pitch:null, noteValue:'half', startSlot:2
  }];
  score.parts[0].measures[1].events = [note('tie-second',55), note('upper',71,2,'eighth',{dots:1})];
  score.parts[0].measures[1].directions = [{ id:'tempo-change', type:'tempo', value:60, startSlot:0 }];
  score.parts[1].measures[0].events = [note('bass',24)];
  score.ties = [{ fromId:'tie-first', toId:'tie-second' }];
  assert(model.isValidWorkshopScore(score));
  const before = JSON.stringify(score); frozen(score);
  const info = createWorkshopPieceInfo(score, { title:'Two hands' });
  assert.strictEqual(info.title, 'Two hands'); assert.strictEqual(info.barCount, 2);
  assert.strictEqual(info.noteCount, 6); assert.strictEqual(info.staffCount, 2);
  assert.strictEqual(info.durationMs, 12000); assert.strictEqual(formatWorkshopInfoDuration(info.durationMs), '0:12');
  assert.deepStrictEqual(info.pitches.map(pitch => pitch.value), [24,48,52,55,71]);
  assert.strictEqual(info.range.lowest.value, 24); assert.strictEqual(info.range.highest.value, 71);
  assert.deepStrictEqual(info.noteValues.map(value => [value.noteValue, value.dots]), [['quarter',0],['eighth',1]]);
  assert.deepStrictEqual(info.staves.map(staff => staff.clefs), [['treble'],['bass']]);
  assert.strictEqual(JSON.stringify(score), before);
  info.pitches[0].step = 'F'; assert.strictEqual(score.parts[1].measures[0].events[0].pitch.step, 'C');
});

test('respects a supplied practice timeline and excludes a disabled second staff consistently', () => {
  const score = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('One hand', 2).score, true);
  score.parts[0].measures[0].events = [note('active')];
  score.parts[1].measures[0].events = [note('inactive',24)]; score.parts[1].enabled = false;
  const timeline = frozen({ durationMs:1850, events:[], measures:[] });
  const info = createWorkshopPieceInfo(score, { timeline });
  assert.strictEqual(info.durationMs,1850); assert.strictEqual(info.noteCount,1); assert.strictEqual(info.staffCount,1);
  assert.deepStrictEqual(info.pitches.map(pitch => pitch.value), [48]); assert.strictEqual(formatWorkshopInfoDuration(1850),'0:02');
  assert.strictEqual(formatWorkshopInfoDuration(3599000),'59:59'); assert.strictEqual(formatWorkshopInfoDuration(null),'—');
});

test('includes inherited bar and within-bar key, meter and clef changes with written spelling and tuplets', () => {
  const score = model.createWorkshopDraft('Changing context', 3).score;
  score.parts[0].measures[0].contextChanges = [{ id:'within-bar', startSlot:4, keyId:'G-major', clef:'alto' }];
  score.parts[0].measures[1].keyId = 'D-major'; score.parts[0].measures[1].meter = '3/4';
  score.parts[0].measures[2].clef = 'bass';
  score.parts[0].measures[0].events = [note('tuplet',58,0,'eighth',{tuplet:3}), note('enharmonic',58,1,'quarter')];
  score.parts[0].measures[0].events[0].pitch = { step:'B', alter:-1, octave:4 };
  score.parts[0].measures[0].events[1].pitch = { step:'A', alter:1, octave:4 };
  assert(model.isValidWorkshopScore(score));
  const info = createWorkshopPieceInfo(score);
  assert.deepStrictEqual(info.staves[0].keys, ['C-major','G-major','D-major']);
  assert.deepStrictEqual(info.staves[0].meters, ['4/4','3/4']); assert.deepStrictEqual(info.staves[0].clefs, ['treble','alto','bass']);
  assert.deepStrictEqual(info.pitches.map(pitch => formatWorkshopInfoPitch(pitch,'german')), ['Ais4','B4']);
  assert.deepStrictEqual(info.pitches.map(pitch => formatWorkshopInfoPitch(pitch,'international')), ['A♯4','B♭4']);
  assert.strictEqual(formatWorkshopInfoPitch({step:'B',alter:0,octave:4},'german'),'H4');
  assert.strictEqual(formatWorkshopInfoPitch({step:'C',alter:.5,octave:4},'international'),'C+¼4');
  assert.deepStrictEqual(info.noteValues[1].tuplet, {actual:3,normal:2});
});

test('shows only stored credits and explicit performer/origin, while hiding license and rights by default', () => {
  const score = model.createWorkshopDraft('Imported').score;
  score.metadata = { title:'Full title', composer:'A & B', arranger:'Arranger', lyricist:'Lyricist', subtitle:'Movement',
    license:'Public Domain', copyright:'Rights notice', sources:[{label:'Source',url:'https://example.org/score'}] };
  score.musicXml = { sourceXml:'<score-partwise><identification><creator type="performer">Known performer</creator><source>Historical collection\nhttps://example.org/original</source></identification></score-partwise>', fingerprint:'known', warnings:['unsupported-notation'] };
  const before = JSON.stringify(score), info = createWorkshopPieceInfo(frozen(score));
  assert.strictEqual(info.title,'Full title'); assert.strictEqual(info.credits.find(row => row.key === 'performer').value,'Known performer');
  assert.strictEqual(info.credits.find(row => row.key === 'origin').value,'Historical collection');
  assert(!info.credits.some(row => row.key === 'copyright' || row.key === 'license'));
  assert(info.hasImportWarnings); assert.deepStrictEqual(info.sources,[{label:'Source',url:'https://example.org/score'}]);
  const licensed = createWorkshopPieceInfo(score, { showLicense:true });
  assert.strictEqual(licensed.credits.find(row => row.key === 'license').value,'Public Domain');
  assert.strictEqual(licensed.credits.find(row => row.key === 'copyright').value,'Rights notice');
  assert.strictEqual(JSON.stringify(score),before);
  const missing = createWorkshopPieceInfo(model.createWorkshopDraft('Empty').score);
  assert.deepStrictEqual(missing.credits,[]); assert.deepStrictEqual(missing.sources,[]); assert.strictEqual(missing.range,null);
  assert.strictEqual(missing.noteCount,0); assert.strictEqual(missing.title,'');
  assert(!JSON.stringify(missing).includes('CC0')); assert(!JSON.stringify(missing).includes('AGPL'));
});

test('renders safe source links and conditional rights without editable controls or stored-score mutation', () => {
  const score = model.createWorkshopDraft('Read only').score;
  score.parts[0].measures[0].events = [note('display',59)];
  score.metadata = { composer:'Known composer', license:'Local license', copyright:'Local rights', sources:[
    {label:'HTTPS source',url:'https://example.org/score?x=1&y=2'}, {label:'HTTP source',url:'http://example.org/score'},
    {label:'Script',url:'javascript:alert(1)'}, {label:'Local',url:'file:///private/score'},
    {label:'Credentials',url:'https://user:secret@example.org/'}, {label:'Whitespace',url:'https://example.org/ bad'}
  ] };
  const before = JSON.stringify(score); Options.noteNaming = 'german';
  const hidden = view(score, { title:'Read only', timeline:{ durationMs:2000 } });
  let rendered = nodes(hidden._render()), anchors = rendered.filter(node => node.tag === 'a');
  assert.strictEqual(anchors.length,2);
  assert(anchors.every(node => node.data.attrs.target === '_blank' && node.data.attrs.rel === 'noopener noreferrer'));
  assert(!rendered.some(node => ['input','textarea','form'].includes(node.tag)));
  assert(!renderedText(hidden._render()).includes('Local license')); assert(!renderedText(hidden._render()).includes('Local rights'));
  assert(renderedText(hidden._render()).includes('H4'));
  hidden.$destroy(); Options.noteNaming = 'international';
  const shown = view(score, { title:'Read only', timeline:{ durationMs:2000 }, showLicense:true });
  assert(renderedText(shown._render()).includes('Local license')); assert(renderedText(shown._render()).includes('Local rights'));
  assert(renderedText(shown._render()).includes('B4')); assert.strictEqual(JSON.stringify(score),before); shown.$destroy();
});

test('closes with Escape, traps Tab and restores focus using the existing dialog convention', () => {
  const currentDocument = global.document;
  let focus = null, closes = 0, prevented = 0, stopped = 0;
  const element = () => ({ disabled:false, getClientRects:() => [{}], focus() { focus=this; global.document.activeElement=this; } });
  const first = element(), last = element(), dialog = element(), previous = element();
  dialog.querySelectorAll = () => [first,last];
  global.document = { activeElement:previous, documentElement:{ contains:entry => entry === previous } };
  const host = { $refs:{dialog,close:first}, $emit(name) { if (name === 'close') closes++; }, $nextTick:callback => callback() };
  definition.mounted.call(host); assert.strictEqual(focus,first);
  const event = extra => Object.assign({ key:'Tab', preventDefault() { prevented++; }, stopPropagation() { stopped++; } },extra);
  definition.methods.handleKeydown.call(host,event({shiftKey:true})); assert.strictEqual(focus,last);
  definition.methods.handleKeydown.call(host,event({shiftKey:false})); assert.strictEqual(focus,first);
  definition.methods.handleKeydown.call(host,event({key:'Escape'})); assert.strictEqual(closes,1); assert.strictEqual(stopped,1);
  assert.strictEqual(prevented,3); definition.beforeDestroy.call(host); assert.strictEqual(focus,previous);
  global.document = currentDocument;
});

console.log('Workshop piece info tests passed (' + checks + ' checks).');
