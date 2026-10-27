const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module');
const babel = require('babel-core'), compiler = require('vue-template-compiler'), Vue = require('vue');
global.regeneratorRuntime = require('babel-runtime/regenerator');
global.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {} };
global.document = { addEventListener() {}, removeEventListener() {} };
const entries = new Map();
global.localStorage = { getItem: key => entries.has(key) ? entries.get(key) : null, setItem: (key,value) => entries.set(key,String(value)), removeItem: key => entries.delete(key) };
const sourceRoot = path.resolve(__dirname,'../src') + path.sep, originalJs = Module._extensions['.js'];
Module._extensions['.js'] = (mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalJs(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{ babelrc:false,presets:[['env',{ modules:'commonjs' }]] }).code,filename);
};
Module._extensions['.vue'] = mod => { mod.exports = {}; };
function component(name) {
  const filename = path.resolve(sourceRoot,'components',name+'.vue'), parsed = compiler.parseComponent(fs.readFileSync(filename,'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const mod = new Module(filename,module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content,{ babelrc:false,presets:[['env',{ modules:'commonjs' }]] }).code,filename);
  return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
}
const model = require('../src/model/Workshop');
const rhythm = require('../src/model/WorkshopRhythm');
const strings = { de:require('../src/resources/de').default,en:require('../src/resources/en').default };
const definition = component('Workshop');
definition.components = Object.assign({},definition.components,{ WorkshopStaff:component('WorkshopStaff'),WorkshopSheet:component('WorkshopSheet') });
function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
function editor(locale='de') {
  const view = new Vue(Object.assign({},definition,{ created:undefined,mounted:undefined,beforeDestroy:undefined,
    methods:Object.assign({},definition.methods,{ $t(key,values={}) { return Object.keys(values).reduce((s,name)=>s.replace('{'+name+'}',values[name]),strings[locale][key] || key); },$tc(key,count,values) { return this.$t(key,values); } }) }));
  view.$i18n = { locale }; view.player = { play() {},stopAll() {} }; view.newPiece(); return view;
}
function test(name,body) { body(); process.stdout.write('✓ '+name+'\n'); }
function note(slot, noteValue='quarter',step='C',octave=4) {
  return { id:model.workshopId('note'),kind:'note',pitch:{ step,alter:0,octave },noteValue,startSlot:slot };
}
function score(view) { return JSON.stringify(view.draft.score); }
function staffNodes(view) { return nodes(view._render()).filter(node => node.componentOptions && node.componentOptions.tag === 'WorkshopStaff'); }
function text(node) { return (node.text || '') + (node.children || []).map(text).join(' '); }


const notationDefinition=component('WorkshopNotationControls');
const backup=require('../src/model/SaveDataBackup');
const store=require('../src/model/WorkshopStorage');
const xml=require('../src/model/WorkshopMusicXml');
function controls(view,section='selection') {
  const control=new Vue(Object.assign({},notationDefinition,{propsData:{score:view.draft.score,section,barIndex:view.barIndex,partIndex:view.partIndex,selectedEvents:view.selectedEvents},methods:Object.assign({},notationDefinition.methods,{$t:view.$t.bind(view)})}));
  control.$on('change',next=>{view.commitAdvancedNotation(next);control.score=view.draft.score;control.selectedEvents=view.selectedEvents;});return control;
}
function select(view,notes) {view.currentBar.events=notes;view.multiSelect=true;view.restoreSelection(notes.map(n=>n.id),notes[0].id);}

test('advanced note controls preserve double dots, fermatas, lyrics and reversible cross-staff ownership',()=>{
  const view=editor();view.toggleSecondStaff();view.selectPart(0);const a=note(0,'eighth');select(view,[a]);const control=controls(view);
  control.setNoteProperty('dots',2);assert.strictEqual(view.selectedNotes[0].dots,2);control.setNoteProperty('fermata',2);control.setNoteProperty('ornament','trill');control.setNoteProperty('lyric','Hallo');control.setNoteProperty('displayStaff',1);
  assert.strictEqual(view.draft.score.parts[0].measures[0].events[0].displayStaff,1);assert.strictEqual(view.draft.score.parts[1].measures[0].events.length,0);
  view.onStaffEvent(1,'selectEvent',view.draft.score.parts[0].measures[0].events[0]);assert.strictEqual(view.partIndex,0);assert.strictEqual(view.selectedEvent.lyric,'Hallo');
  const marked=score(view);view.undo();assert.strictEqual(view.currentBar.events[0].displayStaff,undefined);view.redo();assert.strictEqual(score(view),marked);assert(model.isValidWorkshopScore(view.draft.score));control.$destroy();view.$destroy();
});
test('quintuplet controls respace five selected onsets and remove the ratio without losing pitches',()=>{
  const view=editor();const notes=Array.from({length:5},(_,i)=>note(i,'eighth',['C','D','E','F','G'][i]));select(view,notes);const original=score(view),control=controls(view);
  control.actual=5;control.normal=4;control.setTuplet();assert.strictEqual(control.error,false);assert(view.selectedNotes.every(event=>event.tuplet.actual===5 && event.tuplet.normal===4));
  assert.deepStrictEqual(view.selectedNotes.map(event=>event.startSlot),[0,.8,1.6,2.4,3.2]);control.clearTuplet();assert(view.selectedNotes.every(event=>!event.tuplet));assert.deepStrictEqual(view.selectedNotes.map(event=>event.startSlot),[0,1,2,3,4]);
  view.undo();view.undo();assert.strictEqual(score(view),original);control.$destroy();view.$destroy();
});
test('timed controls store cross-bar spans and copying a bar regenerates IDs and translates endpoints',()=>{
  const view=editor();view.addBarCount=3;view.addBars();view.selectBar(0);const control=controls(view,'bar');control.directionType='wedge';control.endBar=2;control.endBeat=2;control.addDirection();assert.strictEqual(control.error,false);
  const span=view.currentBar.directions[0];assert.strictEqual(span.endBarId,view.bars[1].id);view.copyTarget=2;view.copyBar();const copied=view.bars[2].directions[0];assert.notStrictEqual(copied.id,span.id);assert.strictEqual(copied.endBarId,view.bars[3].id);
  const before=score(view);control.directionType='tempoRamp';control.startBeat=4;control.endBar=1;control.endBeat=2;control.addDirection();assert(control.error);assert.strictEqual(score(view),before);
  assert(model.isValidWorkshopScore(view.draft.score));control.$destroy();view.$destroy();
});
test('ending and layout controls are shared, recoverable and do not alter existing notes',()=>{
  const view=editor();view.addBars();view.toggleSecondStaff();view.selectBar(1);const control=controls(view,'bar');const pitches=JSON.stringify(view.draft.score.parts.map(part=>part.measures.map(bar=>bar.events)));
  control.toggleEnding(2);assert.deepStrictEqual(Array.from(view.currentBar.ending),[2]);assert.deepStrictEqual(Array.from(view.draft.score.parts[0].measures[1].ending),[2]);control.toggleBreak('systemBreaks');control.toggleBreak('pageBreaks');assert(control.hasBreak('pageBreaks'));
  assert.strictEqual(JSON.stringify(view.draft.score.parts.map(part=>part.measures.map(bar=>bar.events))),pitches);control.toggleEnding(2);assert.strictEqual(view.currentBar.ending,undefined);view.undo();assert.deepStrictEqual(Array.from(view.currentBar.ending),[2]);control.$destroy();view.$destroy();
});
test('document controls persist credits and layout locally while app backups exclude them',()=>{
  entries.clear();const view=editor(),control=controls(view,'document');control.setMetadata('composer','Nico & Freunde');control.setLayout('staffDistance','80');control.setLayout('barsPerSystem','2');assert(view.savePiece());
  const saved=store.readWorkshopLibrary();assert.strictEqual(saved.pieces[0].revisions[0].score.metadata.composer,'Nico & Freunde');const exported=backup.createSaveDataBackup(localStorage);assert(backup.validateSaveDataBackup(exported).valid);assert.strictEqual(exported.data.workshopLibrary,undefined);assert.deepStrictEqual(store.readWorkshopLibrary(),saved);
  view.openPiece(saved.pieces[0]);assert.strictEqual(view.draft.score.layout.barsPerSystem,2);control.$destroy();view.$destroy();entries.clear();
});
test('additional values and double accidentals remain editable and selected dots survive duration changes',()=>{
  const view=editor();view.chooseToolValue('sixtyfourth');view.toolDots=3;view.placeOnSheet({slot:0,pitch:{step:'F',alter:2,octave:4}});assert.strictEqual(view.selectedEvent.pitch.alter,2);assert.strictEqual(view.selectedEvent.dots,3);view.chooseToolValue('thirtysecond');assert.strictEqual(view.selectedEvent.dots,3);
  assert.strictEqual(view.eventLabel(view.selectedEvent),'Fisis4');view.toggleDots();assert.strictEqual(view.selectedEvent.dots,undefined);assert(model.isValidWorkshopScore(view.draft.score));view.$destroy();
});
test('turning a tied note into a grace note repairs the tie and undo restores both',()=>{
  const view=editor(),a=note(0),b=note(2);select(view,[a,b]);view.connectTies();assert.strictEqual(view.draft.score.ties.length,1);
  view.restoreSelection([a.id],a.id);const before=score(view),control=controls(view);control.setNoteProperty('grace',true);
  assert.strictEqual(control.error,false);assert.strictEqual(view.selectedEvent.grace,true);assert.strictEqual((view.draft.score.ties || []).length,0);assert(model.isValidWorkshopScore(view.draft.score));
  view.undo();assert.strictEqual(score(view),before);view.redo();assert.strictEqual(view.currentBar.events.find(event=>event.id===a.id).grace,true);control.$destroy();view.$destroy();
});
test('advanced dots retain adaptive shortening and sensible beam connections',()=>{
  const view=editor(),a=note(0,'eighth'),b=note(1,'eighth');a.beamGroupId=b.beamGroupId='test-beam';select(view,[a,b]);view.restoreSelection([a.id],a.id);const control=controls(view);
  control.setNoteProperty('dots',1);assert.strictEqual(control.error,false);const changed=view.currentBar.events.find(event=>event.id===a.id);
  assert.strictEqual(changed.noteValue,'eighth');assert.strictEqual(changed.originalDots,1);assert.strictEqual(changed.beamGroupId,'test-beam');assert(model.isValidWorkshopScore(view.draft.score));control.$destroy();view.$destroy();
});
test('advanced tuplets respect pickup limits and direction positions follow the meter denominator',()=>{
  const view=editor();assert(view.setPickup('2'));select(view,Array.from({length:5},(_,i)=>note(i*.25,'thirtysecond')));const control=controls(view),before=score(view);
  control.actual=5;control.normal=9;assert.strictEqual(control.canApplyTuplet,false);control.setTuplet();assert.strictEqual(control.error,false);assert.strictEqual(score(view),before);control.$destroy();
  const other=editor();other.draft.score=model.setWorkshopMeasureContext(other.draft.score,0,{meter:'6/8'});const barControl=controls(other,'bar');assert.strictEqual(barControl.beats,6);
  barControl.directionType='tempo';barControl.startBeat=3;barControl.bpm=90;barControl.addDirection();assert.strictEqual(barControl.error,false);assert.strictEqual(other.currentBar.directions[0].startSlot,2);
  barControl.$destroy();view.$destroy();other.$destroy();
});
test('German and English advanced controls contain no untranslated keys',()=>{
  for(const locale of ['de','en']) {const view=editor(locale);select(view,[note(0,'eighth')]);for(const section of ['bar','document','selection']) {const control=controls(view,section),rendered=text(control._render());assert(!/WORKSHOP_[A-Z_]+/.test(rendered),locale+' '+section+' '+rendered);control.$destroy();}for(const value of Object.keys(view.noteUnits))assert(!view.durationLabel(value).startsWith('WORKSHOP_'));view.$destroy();}
});
async function run() {
  const view=editor();const sample='<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Importtest</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note></measure></part></score-partwise>';
  view.closeEditor();const initial=localStorage.getItem('workshopLibrary');await view.loadMusicXml({data:sample,filename:'test.musicxml'});assert(view.draft);assert.strictEqual(view.draft.title,'Importtest');assert.strictEqual(view.xmlMessage,'WORKSHOP_XML_IMPORTED');assert.strictEqual(localStorage.getItem('workshopLibrary'),initial);assert(view.dirty);assert(view.savePiece());assert(view.draft.score.musicXml.sourceXml.includes('Importtest'));
  const exported=await xml.exportWorkshopMusicXml(view.draft.score,{title:view.draft.title,compressed:true});const imported=await xml.importWorkshopMusicXml(exported.data,{filename:'again.mxl'});assert(model.isValidWorkshopScore(imported.score));assert.strictEqual(imported.score.parts[0].measures[0].events[0].pitch.step,'C');view.$destroy();entries.clear();process.stdout.write('✓ UI MusicXML import remains an unsaved draft until saving and MXL roundtrip retains source\n');
}
run().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
