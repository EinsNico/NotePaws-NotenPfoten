const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module');
const babel = require('babel-core'), compiler = require('vue-template-compiler'), Vue = require('vue');
global.regeneratorRuntime = require('babel-runtime/regenerator');
global.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {} };
global.document = { addEventListener() {}, removeEventListener() {} };
const entries = new Map();
global.localStorage = { getItem:key => entries.has(key) ? entries.get(key) : null,
  setItem:(key,value) => entries.set(key,String(value)), removeItem:key => entries.delete(key) };
const sourceRoot = path.resolve(__dirname,'../src')+path.sep, originalJs = Module._extensions['.js'];
Module._extensions['.js'] = (mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalJs(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
Module._extensions['.vue'] = mod => { mod.exports = {}; };
function component(name) {
  const filename = path.resolve(sourceRoot,'components',name+'.vue'), parsed = compiler.parseComponent(fs.readFileSync(filename,'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const mod = new Module(filename,module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
  return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
}
const model = require('../src/model/Workshop');
const strings = {de:require('../src/resources/de').default,en:require('../src/resources/en').default};
const definition = component('Workshop'), contextDefinition = component('WorkshopContextControls');
definition.components = Object.assign({},definition.components,{WorkshopContextControls:contextDefinition});
function editor(locale='de') {
  const view = new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,
    methods:Object.assign({},definition.methods,{$t(key,values={}) {
      return Object.keys(values).reduce((text,name) => text.replace('{'+name+'}',values[name]),strings[locale][key] || key);
    },$tc(key,count,values) { return this.$t(key,values); }})}));
  view.$i18n = {locale}; view.player = {play() {},stopAll() {}}; view.newPiece(); return view;
}
function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
function content(node) { return (node.text || '')+(node.children || []).map(content).join(' '); }
function hasClass(node,name) { return !!(node.data && (node.data.staticClass || '').split(/\s+/).includes(name)); }
function findClass(root,name) { const found=nodes(root).find(node=>hasClass(node,name)); assert(found,'Missing '+name); return found; }
function button(root,label) { const found=nodes(root).find(node=>node.tag==='button' && content(node).trim().replace(/\s+/g,' ')===label); assert(found,'Missing button '+label); return found; }
function note(slot,step='C',alter=0) { return {id:model.workshopId('note'),kind:'note',pitch:{step,alter,octave:4},noteValue:'quarter',startSlot:slot}; }
function score(view) { return JSON.stringify(view.draft.score); }
const tests=[];
function test(name,body) { tests.push([name,body]); }

test('the common accidental button edits only the selected note, retains selection and remains undoable',()=>{
  for (const locale of ['de','en']) {
    const view=editor(locale),selected=note(0,'F'),untouched=note(2,'A',-1);
    view.currentBar.events=[selected,untouched]; view.selectEvent(selected);
    const before=score(view),undo=view.undoStack.length;
    button(findClass(view._render(),'toolbox'),view.alterSymbol(1)+' '+view.alterLabel(1)).data.on.click();
    assert.strictEqual(view.selectedEventId,selected.id); assert.strictEqual(view.selectedEvent.pitch.alter,1);
    assert.strictEqual(view.currentBar.events.find(event=>event.id===untouched.id).pitch.alter,-1);
    assert.strictEqual(view.undoStack.length,undo+1); assert.strictEqual(view.isActiveAlter(1),true);
    assert.strictEqual(view.isActiveAlter(0),false); const changed=score(view);
    view.undo(); assert.strictEqual(score(view),before); view.redo(); assert.strictEqual(score(view),changed);
    view.$destroy();
  }
});

test('mixed chord accidentals apply to the whole selected group without changing another onset',()=>{
  const view=editor(),a=note(0,'C',0),b=note(0,'E',1),c=note(0,'G',0),other=note(4,'D',-1);
  view.currentBar.events=[a,b,c,other]; view.selectGroup({anchorId:a.id});
  const ids=view.selectedEventIds.slice(),before=score(view);
  assert.strictEqual(view.selectedNotes.length,3); assert.strictEqual(view.selectionAlter,null);
  for (const alter of [-1,0,1]) assert.strictEqual(view.isActiveAlter(alter),false);
  view.chooseActiveAlter(-.5);
  assert.deepStrictEqual(view.selectedEventIds,ids); assert.strictEqual(view.groupSelected,true);
  assert(view.selectedNotes.every(event=>event.pitch.alter===-.5)); assert.strictEqual(view.isActiveAlter(-.5),true);
  assert.strictEqual(view.currentBar.events.find(event=>event.id===other.id).pitch.alter,-1);
  const changed=score(view); view.undo(); assert.strictEqual(score(view),before); view.redo(); assert.strictEqual(score(view),changed);
  view.$destroy();
});

test('without selection accidentals configure insertion, while a selected rest cannot acquire a pitch',()=>{
  const view=editor(),existing=note(0); view.currentBar.events=[existing];
  const before=score(view),undo=view.undoStack.length;
  view.chooseActiveAlter(-1); assert.strictEqual(view.hasSelection,false); assert.strictEqual(view.tool.alter,-1);
  assert.strictEqual(view.followKeySignature,false); assert.strictEqual(view.isActiveAlter(-1),true);
  assert.strictEqual(score(view),before); assert.strictEqual(view.undoStack.length,undo);
  view.chooseKeyAccidentals(); assert.strictEqual(view.followKeySignature,true); assert.strictEqual(view.isActiveAlter(-1),false);
  const rest={id:model.workshopId('rest'),kind:'rest',pitch:null,noteValue:'quarter',startSlot:2};
  view.currentBar.events.push(rest); view.selectEvent(rest); const resting=score(view),restUndo=view.undoStack.length;
  assert(!nodes(view._render()).some(node=>hasClass(node,'placement-alter') || hasClass(node,'rare-alter') || hasClass(node,'quarter-alter')));
  view.chooseActiveAlter(1); assert.strictEqual(score(view),resting); assert.strictEqual(view.selectedEventId,rest.id);
  assert.strictEqual(view.undoStack.length,restUndo); assert.strictEqual(view.selectedEvent.pitch,null);
  assert.strictEqual(view.isActiveAlter(1),false); view.$destroy();
});

test('five basic durations stay quick to reach and every other supported value remains selectable',()=>{
  for (const locale of ['de','en']) {
    const view=editor(locale),root=view._render(),toolbox=findClass(root,'toolbox');
    const basic=findClass(toolbox,'durations').children.filter(node=>node.tag==='button');
    assert.deepStrictEqual(basic.map(node=>node.key),['whole','half','quarter','eighth','sixteenth']);
    const durations=nodes(root).filter(node=>hasClass(node,'durations'));
    const choices=durations.flatMap(node=>node.children.filter(child=>child.tag==='button'));
    assert.deepStrictEqual(choices.map(node=>node.key).sort(),Object.keys(view.noteUnits).sort());
    const before=score(view),undo=view.undoStack.length;
    for (const choice of choices) { choice.data.on.click(); assert.strictEqual(view.tool.noteValue,choice.key); }
    assert.strictEqual(score(view),before); assert.strictEqual(view.undoStack.length,undo);
    assert(!content(root).includes('WORKSHOP_')); view.$destroy();
  }
});

test('the reserved selection area and insertion-versus-editing controls remain unambiguous',()=>{
  const view=editor(); let root=view._render();
  assert(findClass(root,'selection-panel')); assert(findClass(findClass(root,'toolbox'),'toggle'));
  const a=note(0); view.currentBar.events=[a]; view.selectEvent(a); root=view._render();
  const selection=findClass(root,'selection-panel'),toolbox=findClass(root,'toolbox');
  assert(content(selection).includes(view.eventLabel(a))); assert(button(selection,view.$t('WORKSHOP_DESELECT')));
  assert(button(selection,view.$t('WORKSHOP_REMOVE')));
  const insertion=findClass(toolbox,'toggle');
  const newRest=button(insertion,view.$t('WORKSHOP_NEW_REST_TOOL'));
  assert(newRest,'explicitly labelled insertion stays available while a note is selected');
  assert(nodes(root).indexOf(toolbox)<nodes(root).indexOf(selection),'basic tools precede the expanded selection and fingering area');
  const before=score(view),selected=view.selectedEventId,undo=view.undoStack.length;
  const advanced=findClass(root,'note-more'),bar=findClass(root,'bar-settings');
  assert.strictEqual(advanced.tag,'details'); assert.strictEqual(bar.tag,'details');
  assert.strictEqual(!!(advanced.data.attrs && advanced.data.attrs.open),false);
  assert.strictEqual(!!(bar.data.attrs && bar.data.attrs.open),false);
  assert(nodes(advanced).some(node=>hasClass(node,'voice-picker')));
  assert(nodes(bar).some(node=>node.componentOptions && node.componentOptions.tag==='WorkshopContextControls'));
  assert.strictEqual(score(view),before); assert.strictEqual(view.selectedEventId,selected); assert.strictEqual(view.undoStack.length,undo);
  newRest.data.on.click();
  assert.strictEqual(view.hasSelection,false);assert.strictEqual(view.tool.kind,'rest');assert.strictEqual(score(view),before);assert.strictEqual(view.undoStack.length,undo);
  assert(findClass(view._render(),'selection-panel')); assert(findClass(findClass(view._render(),'toolbox'),'toggle'));
  view.$destroy();
});

test('guided ties and slurs retain visible target and cancellation outside the collapsed extra tools',()=>{
  for (const kind of ['tie','slur']) {
    const view=editor(),a=note(0); view.currentBar.events=[a]; view.selectEvent(a);
    if (kind==='tie') view.connectTies(); else view.connectSlur();
    const panel=findClass(view._render(),'selection-panel'),target=findClass(panel,'tie-target');
    assert(content(target).includes(view.eventLabel(a)));
    const key=kind==='tie'?'WORKSHOP_TIE_CANCEL':'WORKSHOP_SLUR_CANCEL';
    button(target,view.$t(key)).data.on.click(); assert.strictEqual(view.tieAnchorId,null);
    assert.strictEqual(view.currentBar.events.length,1); view.$destroy();
  }
});

test('opening a change from the score reveals both levels and preserves its editor reference and selection',async()=>{
  const view=editor(); view.draft.score=model.setWorkshopContextChange(view.draft.score,0,0,{startSlot:2,clef:'bass'});
  const a=note(0); view.currentBar.events=[a]; view.selectEvent(a); const change=view.currentBar.contextChanges[0];
  const control=new Vue(Object.assign({},contextDefinition,{propsData:{score:view.draft.score,barIndex:0,partIndex:0,selectedEvents:view.selectedEvents,noteNaming:view.noteNaming},
    methods:Object.assign({},contextDefinition.methods,{$t:view.$t.bind(view)})}));
  const barSettings={open:false},panel={open:false}; let scrolled=0;
  control.$refs.panel=panel; control.$el={scrollIntoView() { assert.strictEqual(barSettings.open,true); assert.strictEqual(panel.open,true); scrolled++; }};
  view.$refs.barSettings=barSettings; view.$refs.contextChanges=control;
  const before=score(view),undo=view.undoStack.length; view.editInbarContext(0,change.id);
  await Vue.nextTick();
  assert.strictEqual(barSettings.open,true); assert.strictEqual(panel.open,true); assert.strictEqual(scrolled,1);
  assert.strictEqual(view.$refs.contextChanges,control); assert.strictEqual(control.editingId,change.id);
  assert.strictEqual(control.clef,'bass'); assert.strictEqual(view.selectedEventId,a.id);
  assert.strictEqual(score(view),before); assert.strictEqual(view.undoStack.length,undo);
  control.$destroy(); view.$destroy();
});

(async()=>{
  for (const [name,body] of tests) { await body(); process.stdout.write('✓ workshop toolbox: '+name+'\n'); }
})().catch(error=>{console.error(error);process.exitCode=1;});
