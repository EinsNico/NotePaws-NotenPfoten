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
definition.components = Object.assign({},definition.components,{ WorkshopStaff:component('WorkshopStaff'),WorkshopSheet:component('WorkshopSheet'),WorkshopFingeringControls:component('WorkshopFingeringControls') });
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

test('per-bar circle changes inherit into new bars while the first bar remains the base key',()=>{
  const view=editor(); view.addBarCount=2; view.addBars(); view.selectBar(1); view.toggleSecondStaff();
  assert(view.applyBarKey('G-major')); assert.strictEqual(view.draft.score.keyId,'C-major');
  assert.strictEqual(view.staffContexts[0].keyId,'G-major'); assert.strictEqual(view.staffContexts[1].keyId,'G-major');
  assert.strictEqual(model.workshopMeasureContext(view.draft.score,0).keyId,'C-major');
  view.selectBar(2); assert.strictEqual(view.currentContext.keyId,'G-major'); view.addBars(); assert.strictEqual(view.currentContext.keyId,'G-major');
  view.applyBarKey('F-major'); const changed=score(view); view.undo(); assert.strictEqual(view.currentContext.keyId,'G-major'); view.redo(); assert.strictEqual(score(view),changed);
  view.selectBar(1); view.applyBarKey(null); assert.strictEqual(view.currentContext.keyId,'C-major');
  view.selectBar(3); assert.strictEqual(view.currentContext.keyId,'F-major');
  view.selectBar(0); assert(view.applyBarKey('D-major')); assert.strictEqual(view.draft.score.keyId,'D-major');
  view.selectBar(2); assert.strictEqual(view.currentContext.keyId,'D-major'); view.$destroy();
});

test('new-note voice selection preserves long accompaniment, with shortening confined to the melody voice',()=>{
  const view=editor(); view.chooseToolValue('whole'); view.placeOnSheet({ slot:0,pitch:{ step:'C',alter:0,octave:4 } }); const bass=view.selectedEventId;
  view.clearSelection(); view.chooseVoice(2); view.chooseToolValue('quarter'); view.placeOnSheet({ slot:1,pitch:{ step:'E',alter:0,octave:4 } }); const melody=view.selectedEventId;
  assert.strictEqual(view.currentBar.events.find(event=>event.id===bass).noteValue,'whole'); assert.strictEqual(view.selectedEvent.voice,2);
  view.clearSelection(); view.placeOnSheet({ slot:2,pitch:{ step:'G',alter:0,octave:4 } }); const later=view.selectedEventId;
  assert.strictEqual(view.currentBar.events.find(event=>event.id===melody).noteValue,'eighth'); assert.strictEqual(view.currentBar.events.find(event=>event.id===melody).originalNoteValue,'quarter');
  assert.strictEqual(view.currentBar.events.find(event=>event.id===bass).originalNoteValue,undefined);
  view.eraseSelectedEvent(); assert.strictEqual(view.currentBar.events.find(event=>event.id===melody).noteValue,'quarter');
  view.selectEvent(view.currentBar.events.find(event=>event.id===melody)); view.chooseVoice(3); assert.strictEqual(view.selectedEvent.voice,3); assert.strictEqual(view.toolVoice,3);
  view.undo(); assert.strictEqual(view.currentBar.events.find(event=>event.id===melody).voice,2); view.redo(); assert.strictEqual(view.currentBar.events.find(event=>event.id===melody).voice,3);
  assert(model.isValidWorkshopScore(view.draft.score)); view.$destroy();
});

test('changing the base key from the lower staff clears a redundant shared first-bar override',()=>{
  const view=editor(); view.toggleSecondStaff(); view.draft.score.keyId='G-major';
  view.draft.score.parts[0].measures[0].keyId='G-major'; view.selectPart(1);
  assert(model.isValidWorkshopScore(view.draft.score)); assert(view.applyBarKey('F-major'));
  assert(model.isValidWorkshopScore(view.draft.score)); assert.strictEqual(view.draft.score.keyId,'F-major');
  view.draft.score.parts.forEach(part=>assert(!Object.prototype.hasOwnProperty.call(part.measures[0],'keyId')));
  assert.deepStrictEqual(view.staffContexts.map(context=>context.keyId),['F-major','F-major']); view.$destroy();
});

test('a pickup rejects a non-fitting first-bar replacement visibly and leaves history intact',()=>{
  const view=editor(); view.addBars(); view.selectBar(1); view.currentBar.events=[note(0,'whole')];
  view.selectBar(0); assert(view.setPickup('2')); const before=score(view),history=view.undoStack.length;
  view.deleteBar(); assert.strictEqual(score(view),before); assert.strictEqual(view.undoStack.length,history);
  assert.strictEqual(view.notationError,'WORKSHOP_BAR_CHANGE_BLOCKED'); view.selectBar(1); view.moveBar(-1);
  assert.strictEqual(score(view),before); assert.strictEqual(view.undoStack.length,history);
  assert.strictEqual(view.notationError,'WORKSHOP_BAR_CHANGE_BLOCKED'); view.$destroy();
});

test('three selected equal notes form and remove an exact triplet with reversible positions',()=>{
  const view=editor(); const notes=[note(0,'eighth'),note(1,'eighth','D'),note(2,'eighth','E')]; view.currentBar.events=notes;
  view.multiSelect=true; view.restoreSelection(notes.map(event=>event.id),notes[0].id); assert(view.canTripletSelection);
  const original=score(view); view.connectTriplet(); assert(view.hasSelectedTriplets);
  const triplet=score(view),events=view.selectedNotes.slice().sort((a,b)=>a.startSlot-b.startSlot);
  assert(events.every(event=>event.tuplet===3 && event.tupletGroupId===events[0].tupletGroupId));
  assert.deepStrictEqual(events.map(event=>rhythm.workshopTimeTicks(event.startSlot)),[0,rhythm.workshopTimeTicks(2/3),rhythm.workshopTimeTicks(4/3)]);
  assert(events.every(event=>rhythm.workshopTimeTicks(rhythm.workshopEventUnits(event))===rhythm.workshopTimeTicks(2/3)));
  view.undo(); assert.strictEqual(score(view),original); view.redo(); assert.strictEqual(score(view),triplet);
  view.restoreSelection(notes.map(event=>event.id),notes[0].id);
  view.unlinkTriplets(); assert(view.selectedNotes.every(event=>!event.tuplet)); assert.deepStrictEqual(view.selectedNotes.map(event=>event.startSlot).sort((a,b)=>a-b),[0,1,2]);
  assert(model.isValidWorkshopScore(view.draft.score)); view.$destroy();
});

test('pickup choices shorten only the first shared bar and reject overflowing existing content atomically',()=>{
  const view=editor(); view.addBars(); view.toggleSecondStaff(); assert(view.setPickup('2'));
  assert.strictEqual(model.workshopMeasureContext(view.draft.score,0,0).units,2); assert.strictEqual(model.workshopMeasureContext(view.draft.score,0,1).units,2);
  assert.strictEqual(model.workshopMeasureContext(view.draft.score,1).units,8);
  view.selectBar(0); view.chooseToolValue('eighth'); view.placeOnSheet({ slot:0,pitch:{ step:'C',alter:0,octave:3 } }); const before=score(view);
  assert.strictEqual(view.setPickup('0.5'),false); assert.strictEqual(score(view),before); assert(view.notationError);
  assert(view.setPickup('1')); assert.strictEqual(view.draft.score.pickupUnits,1); view.undo(); assert.strictEqual(view.draft.score.pickupUnits,2);
  assert(view.setPickup('')); assert.strictEqual(view.draft.score.pickupUnits,undefined); view.$destroy();
});

test('a pickup can shorten silent tails left by moving a note, while undo restores the complete bar',()=>{
  const view=editor(); view.chooseToolValue('half');
  view.placeOnSheet({ slot:2.5,pitch:{ step:'C',alter:0,octave:4 } }); const id=view.selectedEventId;
  view.moveSheetNote({ id,slot:0,pitch:{ step:'C',alter:0,octave:4 } });
  assert(model.workshopMeasureUnits(view.currentBar)>4); const before=score(view);
  assert(view.setPickup('4')); assert.strictEqual(view.draft.score.pickupUnits,4);
  assert.strictEqual(view.currentBar.events.find(event=>event.id===id).noteValue,'half');
  assert(model.workshopMeasureUnits(view.currentBar)<=4); assert(model.isValidWorkshopScore(view.draft.score));
  view.undo(); assert.strictEqual(score(view),before); view.redo(); assert.strictEqual(view.draft.score.pickupUnits,4); view.$destroy();
});

test('repeat start and end controls produce shared bounded playback passes and undo exact metadata',()=>{
  const view=editor(); view.addBarCount=2; view.addBars(); view.toggleSecondStaff(); view.selectBar(0);
  assert(view.setRepeat(true,null)); assert.deepStrictEqual(model.workshopPlaybackBarOrder(view.draft.score),[0,1,2]);
  view.selectBar(2); assert(view.setRepeat(false,3)); assert.deepStrictEqual(model.workshopPlaybackBarOrder(view.draft.score),[0,1,2,0,1,2,0,1,2]);
  assert.strictEqual(view.draft.score.parts[1].measures[0].repeatStart,true); assert.strictEqual(view.draft.score.parts[1].measures[2].repeatEnd,3);
  const repeated=score(view); view.undo(); assert.deepStrictEqual(model.workshopPlaybackBarOrder(view.draft.score),[0,1,2]); view.redo(); assert.strictEqual(score(view),repeated);
  assert(view.setRepeat(false,null)); assert.deepStrictEqual(model.workshopPlaybackBarOrder(view.draft.score),[0,1,2]); view.$destroy();
});

test('articulation, finger and pedal controls persist only meaningful metadata and remain undoable',()=>{
  const view=editor(); const a=note(0); view.currentBar.events=[a]; view.selectEvent(a);
  view.toggleArticulation('staccato'); assert(view.hasArticulation('staccato')); view.toggleArticulation('accent'); assert(view.hasArticulation('accent'));
  view.setFingering('3'); view.setPedal('down'); assert.strictEqual(view.selectedEvent.fingering,3); assert.strictEqual(view.selectedEvent.pedal,'down');
  const marked=score(view); view.setPedal('up'); assert.strictEqual(view.selectedEvent.pedal,'up'); view.undo(); assert.strictEqual(score(view),marked);
  view.selectEvent(view.currentBar.events.find(event=>event.id===a.id)); view.toggleArticulation('staccato'); view.toggleArticulation('accent'); view.setFingering(''); view.setPedal('');
  assert.strictEqual(view.selectedEvent.articulations,undefined); assert.strictEqual(view.selectedEvent.fingering,undefined); assert.strictEqual(view.selectedEvent.pedal,undefined);
  view.toggleArticulation('constructor'); assert.strictEqual(view.selectedEvent.articulations,undefined); assert(model.isValidWorkshopScore(view.draft.score)); view.$destroy();
});

test('staccatissimo is editable in both languages, replaces staccato and remains undoable',()=>{
  for (const locale of ['de','en']) {
    const view=editor(locale),a=note(0),b=note(2,'quarter','E');
    a.articulations=['staccato','accent']; view.currentBar.events=[a,b]; view.selectEvent(a);
    assert(view.articulationOptions.includes('staccatissimo'));
    assert.strictEqual(strings[locale].WORKSHOP_ARTICULATION_STACCATISSIMO,'Staccatissimo');
    view.toggleArticulation('staccatissimo');
    assert.deepStrictEqual(Array.from(view.selectedEvent.articulations),['accent','staccatissimo']);
    const marked=score(view); view.undo(); assert(view.currentBar.events[0].articulations.includes('staccato'));
    view.redo(); assert.strictEqual(score(view),marked); view.selectEvent(view.currentBar.events[0]);
    view.toggleArticulation('staccato'); assert.deepStrictEqual(Array.from(view.selectedEvent.articulations),['accent','staccato']);
    view.toggleArticulation('staccatissimo'); view.toggleArticulation('staccatissimo');
    assert.deepStrictEqual(Array.from(view.selectedEvent.articulations),['accent']);
    assert.strictEqual(view.currentBar.events[1].articulations,undefined); assert(model.isValidWorkshopScore(view.draft.score)); view.$destroy();
  }
});

test('staff dynamics inherit without changing other staff or pitch and are reversible',()=>{
  const view=editor(); view.addBarCount=2; view.addBars(); view.toggleSecondStaff(); view.selectBar(1); view.selectPart(1);
  assert(view.setDynamic('p')); assert.strictEqual(view.currentContext.dynamic,'p'); assert.strictEqual(view.staffContexts[0].dynamic,'mf');
  view.selectBar(2); assert.strictEqual(view.currentContext.dynamic,'p'); const before=score(view); assert.strictEqual(view.setDynamic('bad'),false); assert.strictEqual(score(view),before);
  view.setDynamic('ff'); const louder=score(view); view.undo(); assert.strictEqual(view.currentContext.dynamic,'p'); view.redo(); assert.strictEqual(score(view),louder);
  view.setDynamic(null); assert.strictEqual(view.currentContext.dynamic,'p'); view.$destroy();
});

test('a guided slur crosses bars and pitches within a voice while an invalid voice target stays pending',()=>{
  const view=editor(); view.addBars(); const a=note(0),b=note(0,'quarter','E'),wrong=note(2,'quarter','G'); wrong.voice=2;
  view.draft.score.parts[0].measures[0].events=[a]; view.draft.score.parts[0].measures[1].events=[b,wrong];
  view.selectBar(0); view.selectEvent(a); assert(view.canSlurSelection); view.connectSlur(); assert.strictEqual(view.connectionKind,'slur');
  view.selectBar(1); view.selectEvent(wrong); assert(view.tieError); assert.strictEqual(view.connectionKind,'slur'); view.selectEvent(b);
  assert.strictEqual(view.tieAnchorId,null); assert.deepStrictEqual(JSON.parse(JSON.stringify(view.draft.score.slurs)),[{ fromId:a.id,toId:b.id }]);
  assert.strictEqual(view.staffSlurs[0][0].fromBarIndex,0); view.selectEvent(b); assert(view.hasSelectedSlurs); view.unlinkSlurs(); assert.strictEqual(view.draft.score.slurs,undefined);
  view.undo(); assert.strictEqual(view.draft.score.slurs.length,1); view.$destroy();
});

test('copying notation preserves internal slurs, key and dynamics while following bars keep their own context',()=>{
  const view=editor(); view.addBarCount=2; view.addBars(); view.selectBar(0); view.applyBarKey('D-major'); view.setDynamic('p');
  const a=note(0),b=note(2,'quarter','E'); a.articulations=['accent']; a.fingering=2; a.pedal='down'; view.currentBar.events=[a,b];
  view.multiSelect=true; view.restoreSelection([a.id,b.id],a.id); view.connectSlur();
  view.selectBar(1); view.applyBarKey('F-major'); view.setDynamic('f'); view.selectBar(2); view.applyBarKey('G-major'); view.setDynamic('mp');
  view.selectBar(0); view.copyTarget=1; view.copyBar();
  assert.strictEqual(model.workshopMeasureContext(view.draft.score,1).keyId,'D-major'); assert.strictEqual(model.workshopMeasureContext(view.draft.score,1).dynamic,'p');
  assert.strictEqual(model.workshopMeasureContext(view.draft.score,2).keyId,'G-major'); assert.strictEqual(model.workshopMeasureContext(view.draft.score,2).dynamic,'mp');
  const copied=view.draft.score.parts[0].measures[1].events; assert.strictEqual(copied[0].fingering,2); assert.deepStrictEqual(Array.from(copied[0].articulations),['accent']);
  assert.strictEqual(view.draft.score.slurs.length,2); assert(view.draft.score.slurs.some(edge=>edge.fromId===copied[0].id && edge.toId===copied[1].id));
  assert(model.isValidWorkshopScore(view.draft.score)); view.$destroy();
});

test('sheet view uses the complete score and selecting a bar returns to editing without changing the piece',()=>{
  const view=editor(); view.addBarCount=3; view.addBars(); const before=score(view),history=view.undoStack.length;
  view.setSheetView(true); const sheet=nodes(view._render()).find(node=>node.componentOptions && node.componentOptions.tag==='WorkshopSheet'); assert(sheet);
  assert.strictEqual(sheet.componentOptions.propsData.score,view.draft.score); sheet.componentOptions.listeners['select-bar'](2);
  view.setSheetView(true);
  const selectedSheet=nodes(view._render()).find(node => node.componentOptions && node.componentOptions.tag === 'WorkshopSheet');
  assert.strictEqual(selectedSheet.componentOptions.propsData.activeBar,2);
  view.playing=true; view.playingBar=1;
  assert.strictEqual(nodes(view._render()).find(node => node.componentOptions && node.componentOptions.tag === 'WorkshopSheet').componentOptions.propsData.activeBar,1);
  view.playing=false; view.setSheetView(false);
  assert.strictEqual(view.sheetView,false); assert.strictEqual(view.barIndex,2); assert.strictEqual(score(view),before); assert.strictEqual(view.undoStack.length,history); view.$destroy();
});

test('all notation features survive saving, revisions, reopening and history restoration',()=>{
  entries.clear(); const view=editor(); view.addBars(); view.selectBar(0); view.setPickup('2'); view.setDynamic('p'); view.setRepeat(true,null);
  const a=note(0,'eighth'),b=note(1,'eighth','E'); a.voice=2; b.voice=2; a.articulations=['accent']; a.fingering=2; a.pedal='down'; b.pedal='up'; view.currentBar.events=[a,b];
  view.multiSelect=true; view.restoreSelection([a.id,b.id],a.id); view.connectSlur(); view.selectBar(1); view.applyBarKey('G-major'); view.setRepeat(false,2);
  const expected=score(view); assert(view.savePiece()); const revision=view.selectedRevisionId;
  view.setDynamic('ff'); assert(view.savePiece()); view.chooseRevision(revision); assert.strictEqual(score(view),expected); view.undo(); assert.strictEqual(view.currentContext.dynamic,'ff');
  view.chooseRevision(revision); assert(view.savePiece()); view.closeEditor(); view.openPiece(view.library.pieces[0]); assert.strictEqual(score(view),expected);
  view.$destroy(); entries.clear();
});

test('German and English render the new settings and history labels without unresolved placeholders',()=>{
  for (const locale of ['de','en']) {
    const view=editor(locale); view.currentBar.events=[note(0)]; view.selectEvent(view.currentBar.events[0]);
    const root=view._render(),fingeringNode=nodes(root).find(node=>node.componentOptions && node.componentOptions.tag === 'WorkshopFingeringControls');
    assert(fingeringNode);
    const fingeringDefinition=definition.components.WorkshopFingeringControls;
    const fingeringView=new Vue(Object.assign({},fingeringDefinition,{propsData:fingeringNode.componentOptions.propsData,
      methods:Object.assign({},fingeringDefinition.methods,{$t:view.$t})}));
    const rendered=text(root)+' '+text(fingeringView._render());
    for (const key of ['WORKSHOP_VIEW_EDIT','WORKSHOP_VIEW_SHEET','WORKSHOP_BAR_STRUCTURE','WORKSHOP_PICKUP','WORKSHOP_REPEAT_START','WORKSHOP_REPEAT_END','WORKSHOP_SLUR','WORKSHOP_EXPRESSION','WORKSHOP_FINGERING','WORKSHOP_PEDAL']) assert(rendered.includes(strings[locale][key]),key);
    const voiceButtons=nodes(view._render()).find(node=>node.data && node.data.staticClass==='voice-picker'); assert.strictEqual(voiceButtons.children.filter(node=>node.tag==='button').length,4);
    view.chooseVoice(4); assert(view.historyEntryLabel(view.historyEntries[view.historyPosition]).includes('4'));
    assert(!rendered.includes('WORKSHOP_')); assert(!rendered.includes('{staff}')); fingeringView.$destroy(); view.$destroy();
  }
});
