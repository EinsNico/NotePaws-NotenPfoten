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
const model = require('../src/model/Workshop'), tonality = require('../src/model/NoteFlowTonality'), Options = require('../src/model/Options').default;
const strings = { de:require('../src/resources/de').default,en:require('../src/resources/en').default };
const definition = component('Workshop'), circleDefinition = component('NoteFlowCircleSelector');
definition.components = Object.assign({},definition.components,{ NoteFlowCircleSelector:circleDefinition,WorkshopStaff:component('WorkshopStaff') });
function nodes(node) { return [node].concat(...(node.children || (node.componentOptions && node.componentOptions.children) || []).map(nodes)); }
function editor(locale='de') {
  const view = new Vue(Object.assign({},definition,{ created:undefined,mounted:undefined,beforeDestroy:undefined,
    methods:Object.assign({},definition.methods,{ $t(key,values={}) { return Object.keys(values).reduce((s,name)=>s.replace('{'+name+'}',values[name]),strings[locale][key] || key); },$tc(key,count,values) { return this.$t(key,values); } }) }));
  view.$i18n = { locale }; view.player = { play() {},stopAll() {} }; view.newPiece(); return view;
}
function test(name,body) { body(); process.stdout.write('✓ '+name+'\n'); }
function note(step,alter=0) { return { id:model.workshopId('note'),kind:'note',pitch:{ step,alter,octave:4 },noteValue:'quarter',startSlot:0 }; }

test('the actual circle is wired with all keys enabled and updates the complete score',()=>{
  const view=editor(); view.toggleSecondStaff(); view.currentBar.events=[note('F')]; const before=JSON.stringify(view.draft.score.parts);
  view.openContextPicker('key');
  const node=nodes(view._render()).find(node=>node.componentOptions && node.componentOptions.tag==='NoteFlowCircleSelector');
  assert(node); assert.strictEqual(node.componentOptions.propsData.accidentals,'sharpAndFlat'); assert.strictEqual(node.componentOptions.propsData.value,'C-major');
  const circle=new Vue(Object.assign({},circleDefinition,{ propsData:node.componentOptions.propsData,methods:Object.assign({},circleDefinition.methods,{ $t:key=>key }) }));
  circle.$on('input',node.componentOptions.listeners.input);
  assert(circle.displaySegments.every(segment=>segment.majorAllowed.length && segment.minorAllowed.length));
  for (const key of tonality.NOTE_FLOW_TONALITIES) {
    circle.selectTonality(key); assert.strictEqual(view.draft.score.keyId,key.id); assert.strictEqual(JSON.stringify(view.draft.score.parts),before);
  }
  assert.strictEqual(view.contextPicker,'key'); assert.strictEqual(view.hasContextOverride,false);
  const staffs=nodes(view._render()).filter(node=>node.componentOptions && node.componentOptions.tag==='WorkshopStaff');
  assert.strictEqual(staffs.length,2); assert(staffs.every(staff=>staff.componentOptions.propsData.keyId===view.draft.score.keyId && staff.componentOptions.propsData.followKeySignature));
  circle.$destroy(); view.$destroy();
});

test('tonality changes are reversible in history and do not disturb clef or meter context',()=>{
  const view=editor(); view.currentBar.events=[note('F')]; view.setKey('G-major'); const changed=JSON.stringify(view.draft.score);
  const action=view.historyEntries.find(entry=>entry.action.key==='WORKSHOP_HISTORY_KEY'); assert(view.historyEntryLabel(action).includes('G Dur'));
  view.openContextPicker('key'); view.undo(); assert.strictEqual(view.draft.score.keyId,'C-major'); assert.strictEqual(view.contextPicker,null);
  view.redo(); assert.strictEqual(JSON.stringify(view.draft.score),changed);
  view.openContextPicker('meter'); assert(view.applyBarContext('3/4')); assert.strictEqual(view.draft.score.keyId,'G-major');
  view.openContextPicker('clef'); assert(view.applyBarContext('bass')); assert.strictEqual(view.draft.score.keyId,'G-major');
  view.addBars(); assert.strictEqual(view.draft.score.keyId,'G-major');
  assert.strictEqual(view.setKey('constructor'),false); assert.strictEqual(view.setKey('nonsense'),false); assert.strictEqual(view.keyLabel('constructor'),''); view.$destroy();
});

test('new-note key mode and explicit accidentals stay separate from editing selected notes',()=>{
  const view=editor(); view.setKey('F-major'); assert(view.followKeySignature);
  view.chooseToolAlter(0); assert.strictEqual(view.followKeySignature,false); assert.strictEqual(view.tool.alter,0);
  view.placeOnSheet({ slot:0,pitch:{ step:'B',alter:0,octave:4 } }); const id=view.selectedEventId;
  view.chooseKeyAccidentals(); assert(view.followKeySignature); assert.strictEqual(view.hasSelection,false);
  view.selectEvent(view.currentBar.events.find(event=>event.id===id)); view.changeSelectedAlter(-1);
  assert.strictEqual(view.selectedEvent.pitch.alter,-1); assert.strictEqual(view.draft.score.keyId,'F-major');
  view.chooseToolAlter(1); assert.strictEqual(view.followKeySignature,false); assert.strictEqual(view.hasSelection,false);
  view.resetEditor(); assert(view.followKeySignature); view.$destroy();
});

test('saved keys survive reopen and revision switches, and Back closes only the circle',()=>{
  entries.clear(); const view=editor(); view.setKey('E-flat-major'); assert(view.savePiece()); const id=view.selectedRevisionId;
  view.setKey('A-minor'); assert(view.savePiece()); assert.notStrictEqual(view.selectedRevisionId,id);
  view.chooseRevision(id); assert.strictEqual(view.draft.score.keyId,'E-flat-major');
  view.undo(); assert.strictEqual(view.draft.score.keyId,'A-minor'); view.closeEditor(); view.openPiece(view.library.pieces[0]);
  assert.strictEqual(view.draft.score.keyId,'A-minor'); view.openContextPicker('key'); assert(view.handleBack()); assert.strictEqual(view.contextPicker,null); assert(view.draft);
  view.$destroy(); entries.clear();
});

test('German and English retain pitch spelling for flat, sharp and edge-case keys',()=>{
  const savedNaming=Options.noteNaming; Options.noteNaming=null;
  const de=editor('de'), en=editor('en');
  for (const [step,alter,deName,enName] of [['B',0,'H4','B4'],['B',-1,'B4','B♭4'],['C',-1,'Ces4','C♭4'],['F',-1,'Fes4','F♭4'],['E',1,'Eis4','E♯4'],['B',1,'His4','B♯4']]) {
    assert.strictEqual(de.eventLabel(note(step,alter)),deName); assert.strictEqual(en.eventLabel(note(step,alter)),enName);
  }
  de.currentBar.events = [note('C',-1)]; de.selectEvent(de.currentBar.events[0]);
  en.currentBar.events = [note('E',1)]; en.selectEvent(en.currentBar.events[0]);
  assert.strictEqual(de.chordPitchLabel(11),'Ces'); assert.strictEqual(en.chordPitchLabel(5),'E♯');
  assert.strictEqual(de.keyLabel('B-major'),'H Dur'); assert.strictEqual(en.keyLabel('B-major'),'B Major');
  assert.strictEqual(de.keyLabel('B-flat-major'),'B Dur'); assert.strictEqual(en.keyLabel('B-flat-major'),'B♭ Major');
  for (const [key,value] of Object.entries(strings.de).filter(([key])=>key.startsWith('WORKSHOP_'))) {
    if (key in strings.en) assert.deepStrictEqual((value.match(/\{\w+\}/g)||[]).sort(),(strings.en[key].match(/\{\w+\}/g)||[]).sort(),key);
  }
  de.$destroy(); en.$destroy(); Options.noteNaming=savedNaming;
});
