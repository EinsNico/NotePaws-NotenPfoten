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
definition.components = Object.assign({},definition.components,{ WorkshopStaff:component('WorkshopStaff') });
function nodes(node) { return [node].concat(...(node.children || (node.componentOptions && node.componentOptions.children) || []).map(nodes)); }
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

test('dotted placement, rest values and explicit dot removal preserve duration through undo and redo',()=>{
  const view=editor(); view.chooseToolValue('quarter'); view.toggleDots(); assert.strictEqual(view.toolDots,1);
  view.placeOnSheet({ slot:0,pitch:{ step:'C',alter:0,octave:4 } });
  assert.strictEqual(view.selectedEvent.dots,1); assert.strictEqual(rhythm.workshopEventUnits(view.selectedEvent),3);
  const dotted=score(view); view.toggleDots(); assert.strictEqual(view.selectedEvent.dots,undefined); assert.strictEqual(view.selectedEvent.originalDots,undefined);
  view.undo(); assert.strictEqual(score(view),dotted); view.redo(); assert.strictEqual(view.currentBar.events.find(event=>event.kind==='note').dots,undefined);
  view.chooseToolKind('rest'); view.chooseToolValue('eighth'); view.toggleDots(); view.placeOnSheet({ slot:4,pitch:null });
  assert.strictEqual(view.selectedEvent.kind,'rest'); assert.strictEqual(view.selectedEvent.dots,1);
  view.toggleDots(); assert.strictEqual(view.selectedEvent.dots,undefined); assert(model.isValidWorkshopScore(view.draft.score)); view.$destroy();
});

test('automatic shortening remembers requested dots and explicit changes replace that remembered intent',()=>{
  const view=editor(); view.toggleDots(); view.placeOnSheet({ slot:0,pitch:{ step:'C',alter:0,octave:4 } }); const id=view.selectedEventId;
  view.clearSelection(); view.toggleDots(); view.placeOnSheet({ slot:2,pitch:{ step:'D',alter:0,octave:4 } }); const other=view.selectedEventId;
  view.selectEvent(view.currentBar.events.find(event=>event.id===id));
  assert.strictEqual(view.selectedEvent.dots,undefined); assert.strictEqual(view.selectedEvent.originalDots,1); assert.strictEqual(view.activeDots,1);
  view.toggleDots(); assert.strictEqual(view.selectedEvent.originalDots,undefined); assert.strictEqual(view.selectedEvent.originalNoteValue,undefined);
  view.selectEvent(view.currentBar.events.find(event=>event.id===other)); view.eraseSelectedEvent();
  assert.strictEqual(rhythm.workshopEventUnits(view.currentBar.events.find(event=>event.id===id)),2);
  view.selectEvent(view.currentBar.events.find(event=>event.id===id)); view.toggleDots(); view.chooseToolValue('sixteenth');
  assert.strictEqual(view.selectedEvent.dots,1); assert.strictEqual(rhythm.workshopEventUnits(view.selectedEvent),.75);
  view.chooseToolValue('thirtysecond'); assert.strictEqual(view.toolDots,1); assert.strictEqual(view.selectedEvent.dots,1); assert.strictEqual(view.canDotSelection,true);
  assert.strictEqual(rhythm.workshopEventUnits(view.selectedEvent),.375); view.toggleDots(); assert.strictEqual(view.selectedEvent.dots,undefined); assert.strictEqual(rhythm.workshopEventUnits(view.selectedEvent),.25); view.$destroy();
});

test('two selected consecutive equal pitches form a tie; removing or moving a segment repairs it with undo support',()=>{
  const view=editor(); const a=note(0),b=note(2); view.currentBar.events=[a,b];
  view.multiSelect=true; view.restoreSelection([a.id,b.id],a.id); assert.strictEqual(view.canTieSelection,true); view.connectTies();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(view.draft.score.ties)),[{ fromId:a.id,toId:b.id }]);
  const tied=score(view); view.selectEvent(view.currentBar.events[0]); assert(view.hasSelectedTies); view.unlinkTies(); assert.strictEqual(view.draft.score.ties,undefined);
  view.undo(); assert.strictEqual(score(view),tied); view.selectEvent(view.currentBar.events[1]); view.eraseSelectedEvent(); assert.strictEqual(view.draft.score.ties,undefined);
  view.undo(); assert.strictEqual(score(view),tied); view.moveSheetNote({ id:b.id,slot:3,pitch:b.pitch }); assert.strictEqual(view.draft.score.ties,undefined);
  view.undo(); assert.strictEqual(score(view),tied); assert(model.isValidWorkshopScore(view.draft.score)); view.$destroy();
});

test('guided tie selection crosses bar navigation, rejects wrong pitches and has an independent Back cancellation',()=>{
  const view=editor(); view.addBars(); const bars=view.draft.score.parts[0].measures;
  const a=note(4,'half'),b=note(0),wrong=note(2,'quarter','D'); bars[0].events=[a]; bars[1].events=[b,wrong];
  view.selectBar(0); view.selectEvent(a); const before=score(view), history=view.undoStack.length; view.connectTies();
  assert.strictEqual(view.tieAnchorId,a.id); assert.strictEqual(view.undoStack.length,history);
  assert.strictEqual(staffNodes(view)[0].componentOptions.propsData.selectionOnly,true);
  view.selectBar(1); assert.strictEqual(view.tieAnchorId,a.id); assert.strictEqual(view.tieAnchorEntry.barIndex,0);
  view.selectEvent(wrong); assert(view.tieError); assert.strictEqual(score(view),before);
  view.placeOnSheet({ slot:5,pitch:wrong.pitch }); assert.strictEqual(score(view),before);
  view.selectEvent(b); assert.strictEqual(view.tieAnchorId,null); assert.strictEqual(view.undoStack.length,history+1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(view.draft.score.ties)),[{ fromId:a.id,toId:b.id }]);
  assert.strictEqual(staffNodes(view)[0].componentOptions.propsData.ties[0].fromBarIndex,0);
  view.selectEvent(b); view.connectTies(); view.selectBar(0); view.selectEvent(a); assert(view.tieError); assert.strictEqual(view.tieAnchorId,b.id); view.cancelTieSelection();
  view.selectBar(0); view.selectEvent(view.currentBar.events[0]); view.connectTies(); const tied=score(view);
  assert(view.handleBack()); assert.strictEqual(view.tieAnchorId,null); assert.strictEqual(view.confirmExit,false); assert.strictEqual(score(view),tied);
  view.connectTies(); view.clearSelection({ type:'click' }); assert.strictEqual(view.tieAnchorId,null); view.$destroy();
});

test('guided selection cannot tie between staves, and still permits the correct target after returning',()=>{
  const view=editor(); view.toggleSecondStaff(); view.selectPart(0); const a=note(0),b=note(2),left=note(2);
  view.draft.score.parts[0].measures[0].events=[a,b]; view.draft.score.parts[1].measures[0].events=[left];
  view.selectEvent(a); view.connectTies(); view.onStaffEvent(1,'selectEvent',left);
  assert.strictEqual(view.tieAnchorId,a.id); assert(view.tieError); assert.strictEqual(view.draft.score.ties,undefined);
  view.onStaffEvent(0,'selectEvent',b); assert.strictEqual(view.tieAnchorId,null); assert.strictEqual(view.draft.score.ties.length,1);
  view.toggleSecondStaff(); assert.strictEqual(view.draft.score.ties.length,1); view.$destroy();
});

test('copying a bar remaps its internal ties and preserves dotted notation without copying external connections',()=>{
  const view=editor(); view.addBars(); view.selectBar(0);
  const a=note(0,'eighth'),b=note(1.5,'eighth'),end=note(6,'quarter'),next=note(0,'quarter'); a.dots=1;
  view.currentBar.events=[a,b,end]; view.draft.score.parts[0].measures[1].events=[next];
  view.multiSelect=true; view.restoreSelection([a.id,b.id],a.id); view.connectTies(); view.selectEvent(end); view.connectTies(); view.selectBar(1); view.selectEvent(next);
  assert.strictEqual(view.draft.score.ties.length,2); view.selectBar(0); view.copyTarget=1; view.copyBar();
  const copied=view.draft.score.parts[0].measures[1].events;
  assert.strictEqual(copied[0].dots,1); assert.notStrictEqual(copied[0].id,a.id);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(view.draft.score.ties)),[{ fromId:a.id,toId:b.id },{ fromId:copied[0].id,toId:copied[1].id }]);
  assert(model.isValidWorkshopScore(view.draft.score)); view.$destroy();
});

test('dotted notes and ties survive save, reopening and revision/history changes',()=>{
  entries.clear(); const view=editor(); const a=note(0,'quarter'),b=note(3); a.dots=1; view.currentBar.events=[a,b];
  view.multiSelect=true; view.restoreSelection([a.id,b.id],a.id); view.connectTies(); const expected=score(view); assert(view.savePiece()); const first=view.selectedRevisionId;
  view.selectEvent(view.currentBar.events[0]); view.unlinkTies(); assert(view.savePiece());
  view.chooseRevision(first); assert.strictEqual(score(view),expected); view.undo(); assert.strictEqual(view.draft.score.ties,undefined);
  view.chooseRevision(first); assert(view.savePiece()); view.closeEditor(); view.openPiece(view.library.pieces[0]); assert.strictEqual(score(view),expected);
  view.$destroy(); entries.clear();
});

test('copying an imported sustained gap preserves the sounding tie and exposes sf for editing',()=>{
  for (const locale of ['de','en']) {
    const view=editor(locale);view.addBars();view.selectBar(0);
    const a=note(0,'sixteenth'),b=note(1,'quarter');view.currentBar.events=[a,b];
    view.draft.score.ties=[{fromId:a.id,toId:b.id,sustainAcrossGap:true}];
    assert(model.isValidWorkshopScore(view.draft.score));
    view.copyTarget=1;view.copyBar();assert.strictEqual(view.notationError,null);
    const copied=view.draft.score.parts[0].measures[1].events;
    assert(view.draft.score.ties.some(edge=>edge.fromId===copied[0].id && edge.toId===copied[1].id && edge.sustainAcrossGap));
    assert(view.dynamics.includes('sf'));assert(strings[locale].WORKSHOP_DYNAMIC_SF);
    view.$destroy();
  }
});

test('dot controls, tie instructions and new history entries render in German and English with five basic duration choices and every additional value',()=>{
  for (const locale of ['de','en']) {
    const view=editor(locale); const a=note(0),b=note(2); view.currentBar.events=[a,b]; view.selectEvent(a);
    const all=nodes(view._render()); const durations=all.filter(node=>node.data && node.data.staticClass==='durations');
    assert.strictEqual(durations[0].children.filter(node=>node.tag==='button').length,5);
    assert.deepStrictEqual(durations.flatMap(node=>node.children.filter(child=>child.tag==='button').map(child=>child.key)).sort(),Object.keys(view.noteUnits).sort());
    const dot=all.find(node=>node.data && node.data.staticClass==='dot-toggle'); assert(text(dot).includes(strings[locale].WORKSHOP_DOTTED));
    const tie=all.find(node=>node.data && node.data.staticClass==='tie-controls'); assert(text(tie).includes(strings[locale].WORKSHOP_TIE));
    view.connectTies(); assert(text(view._render()).includes(strings[locale].WORKSHOP_TIE_TARGET_HINT));
    view.selectEvent(b);
    assert.strictEqual(view.historyEntryLabel(view.historyEntries[view.historyPosition]),strings[locale].WORKSHOP_HISTORY_TIE.replace('{count}','2'));
    for (const key of ['WORKSHOP_DOTTED_HINT','WORKSHOP_TIE_HINT','WORKSHOP_TIE_TARGET','WORKSHOP_HISTORY_DOT_ON','WORKSHOP_HISTORY_DOT_OFF','WORKSHOP_HISTORY_TIE','WORKSHOP_HISTORY_TIE_REMOVE']) {
      assert(strings[locale][key]); assert.deepStrictEqual((strings.de[key].match(/\{\w+\}/g)||[]).sort(),(strings.en[key].match(/\{\w+\}/g)||[]).sort(),key);
    }
    view.$destroy();
  }
});
