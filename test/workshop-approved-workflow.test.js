const assert=require('assert');
const {realm,plain,Vue}=require('./workshop-approved-workflow-fixture');
const cases=[];function test(name,body){cases.push({name,body});}
function editor(locale='de') {const r=realm(locale),w=r.view('Workshop',{}, {created:undefined});w.player=r.player();w.newPiece();return {r,w};}
function pitch(step='C',octave=4,alter=0){return {step,octave,alter};}
function renderText(r,w){return r.nodes(w,'Workshop').map(n=>n.text||'').join(' ');}
function bindStaff(r,w){const staff=r.staffFor(w);w.$refs.sheet=[staff];return staff;}

test('explicit New Note and New Rest leave multiselect and insert through the existing score/history path',()=>{
  for(const kind of ['note','rest']){
    const {r,w}=editor();w.multiSelect=true;w.selectedEventIds=['old'];
    const before=JSON.stringify(w.draft.score);assert(w.chooseToolKind(kind));
    assert.strictEqual(w.multiSelect,false);assert.strictEqual(w.hasSelection,false);assert.strictEqual(JSON.stringify(w.draft.score),before);
    assert(w.placeOnSheet({slot:0,pitch:pitch()}));
    assert(w.currentBar.events.some(e=>e.kind===kind&&e.startSlot===0));
    const after=plain(w.draft.score);w.undo();assert.strictEqual(JSON.stringify(w.draft.score),before);w.redo();assert.deepStrictEqual(plain(w.draft.score),after);
    assert(r.load('model/Workshop.js').isValidWorkshopScore(w.draft.score));w.$destroy();
  }
});

test('custom meter reports format, values and real overflow separately without score/history mutation',()=>{
  for(const locale of ['de','en']){
    const {r,w}=editor(locale);w.openContextPicker('meter');
    for(const [value,key] of [['3 + 2/8','WORKSHOP_METER_FORMAT_ERROR'],['0/0','WORKSHOP_METER_VALUE_ERROR']]){
      const before=JSON.stringify(w.draft),history=JSON.stringify(w.undoStack);
      assert.strictEqual(w.applyBarContext(value),false);assert.strictEqual(w.contextError,key);
      assert.strictEqual(JSON.stringify(w.draft),before);assert.strictEqual(JSON.stringify(w.undoStack),history);
      assert(!w.$t(key).includes('WORKSHOP_'));
    }
    assert(w.applyBarContext('3+2/8'));assert.strictEqual(w.currentContext.meter,'3+2/8');
    w.undo();w.chooseToolValue('whole');assert(w.placeOnSheet({slot:0,pitch:pitch()}));w.openContextPicker('meter');
    const before=JSON.stringify(w.draft),history=JSON.stringify(w.undoStack);
    assert.strictEqual(w.applyBarContext('2/4'),false);assert.strictEqual(w.contextError,'WORKSHOP_METER_BLOCKED');
    assert.strictEqual(JSON.stringify(w.draft),before);assert.strictEqual(JSON.stringify(w.undoStack),history);w.$destroy();
  }
});

test('saving retains undo/redo on the same piece and DE/EN history describes the actual lifetime',()=>{
  for(const locale of ['de','en']){
    const {r,w}=editor(locale);assert(w.placeOnSheet({slot:0,pitch:pitch()}));const before=plain(w.draft.score),count=w.undoStack.length;
    assert(w.savePiece());const identity=w.draft.pieceId;assert.strictEqual(w.undoStack.length,count);
    w.historyOpen=true;const text=renderText(r,w);
    assert(text.includes(locale==='de'?'Speichern erhält den Verlauf':'Saving keeps the history'));
    w.undo();assert.strictEqual(w.draft.pieceId,identity);assert(!w.currentBar.events.some(e=>e.kind==='note'));
    w.redo();assert.deepStrictEqual(plain(w.draft.score),before);w.closeEditor();assert.strictEqual(w.undoStack.length,0);w.$destroy();
  }
});

test('copy replaces both staves, explains the target, preserves full undo/redo and clears stale success after undo',()=>{
  for(const locale of ['de','en']){
    const {r,w}=editor(locale);w.addBars();w.selectBar(0);w.toggleSecondStaff();w.selectPart(0);
    w.chooseToolValue('quarter');assert(w.placeOnSheet({slot:0,pitch:pitch('E')}));w.selectPart(1);assert(w.placeOnSheet({slot:0,pitch:pitch('G',3)}));
    w.selectBar(1);w.selectPart(0);assert(w.placeOnSheet({slot:0,pitch:pitch('A')}));w.selectPart(1);assert(w.placeOnSheet({slot:0,pitch:pitch('B',2)}));
    w.selectBar(0);w.copyTarget=1;const before=plain(w.draft.score);assert(w.copyBar());const after=plain(w.draft.score);
    assert.deepStrictEqual(plain(w.copyNotice),{from:1,to:2});const text=renderText(r,w);assert(text.includes(locale==='de'?'ersetzt':'replaced'));assert(text.includes(locale==='de'?'Rückgängig':'Undo'));
    for(let part=0;part<2;part++)assert.deepStrictEqual(after.parts[part].measures[1].events.filter(e=>e.kind==='note').map(e=>e.pitch),after.parts[part].measures[0].events.filter(e=>e.kind==='note').map(e=>e.pitch));
    w.undo();assert.deepStrictEqual(plain(w.draft.score),before);assert.strictEqual(w.copyNotice,null);w.redo();assert.deepStrictEqual(plain(w.draft.score),after);w.$destroy();
  }
});

test('keyboard form inserts the first note/rest using actual Staff grid/key/range and model voice rules',async()=>{
  for(const locale of ['de','en'])for(const kind of ['note','rest']){
    const {r,w}=editor(locale);w.multiSelect=true;w.prepareKeyboardInsertion({target:{open:true}});w.chooseToolKind(kind);w.toolVoice=2;
    w.applyBarKey('G-major');w.keyboardStep='F';w.keyboardOctave=4;w.keyboardBeat=1.5;
    const before=JSON.stringify(w.draft.score),staff=bindStaff(r,w);assert(await w.insertWithKeyboard());
    const added=w.currentBar.events.find(e=>e.kind===kind&&e.startSlot===1&&e.voice===2);assert(added);
    if(kind==='note')assert.deepStrictEqual(plain(added.pitch),pitch('F',4,1));else assert.strictEqual(added.pitch,null);
    assert.strictEqual(w.multiSelect,false);assert.strictEqual(w.hasSelection,false);assert(w.keyboardInsertNotice);
    const nodes=r.nodes(w,'Workshop'),form=nodes.find(n=>n.tag==='form');assert(form&&form.data.on.submit);
    assert(nodes.some(n=>n.tag==='summary'&&n.children.some(c=>(c.text||'').includes(locale==='de'?'per Tastatur':'with the keyboard'))));
    w.undo();assert.strictEqual(JSON.stringify(w.draft.score),before);staff.$destroy();w.$destroy();
  }
});

test('keyboard placement rejects off-grid/out-of-range/overflow input and never mutates the draft on failure',async()=>{
  const {r,w}=editor();const before=JSON.stringify(w.draft.score);const staff=bindStaff(r,w);
  w.keyboardBeat=1.1;assert.strictEqual(await w.insertWithKeyboard(),false);assert.strictEqual(w.placementError,'WORKSHOP_KEYBOARD_POSITION_ERROR');
  w.keyboardBeat=1;w.keyboardStep='C';w.keyboardOctave=0;assert.strictEqual(await w.insertWithKeyboard(),false);assert.strictEqual(w.placementError,'WORKSHOP_KEYBOARD_PLACEMENT_ERROR');
  w.keyboardOctave=4;w.keyboardBeat=4.75;assert.strictEqual(await w.insertWithKeyboard(),false);
  assert.strictEqual(JSON.stringify(w.draft.score),before);assert.strictEqual(w.undoStack.length,0);
  staff.$destroy();w.$destroy();
});

test('keyboard insertion supports lower staff, additive/pickup timing, dotted values and explicit accidental policy',async()=>{
  const {r,w}=editor();w.toggleSecondStaff();w.selectPart(1);w.openContextPicker('meter');assert(w.applyBarContext('3+2/8'));
  assert(w.setPickup(2));w.chooseToolKind('note');w.tool.noteValue='eighth';w.toolDots=1;w.toolVoice=4;w.chooseToolAlter(-.5);w.keyboardStep='E';w.keyboardOctave=3;
  const staff=bindStaff(r,w);assert(await w.insertWithKeyboard());const added=w.currentBar.events.find(e=>e.kind==='note');
  assert.deepStrictEqual(plain(added.pitch),pitch('E',3,-.5));assert.strictEqual(added.voice,4);assert.strictEqual(added.dots,1);assert.strictEqual(w.partIndex,1);
  assert(r.load('model/Workshop.js').isValidWorkshopScore(w.draft.score));staff.$destroy();w.$destroy();
});

test('queued keyboard insertion cannot write after leaving the editor',async()=>{
  const {r,w}=editor();const staff=bindStaff(r,w),pending=w.insertWithKeyboard();w.closeEditor();assert.strictEqual(await pending,false);assert.strictEqual(w.draft,null);assert.strictEqual(w.keyboardInserting,false);staff.$destroy();w.$destroy();
});

test('WorkshopPractice keeps silent note display and requests the existing MIDI connection feedback only',()=>{
  const {r,w}=editor();assert(w.placeOnSheet({slot:0,pitch:pitch()}));
  const p=r.view('WorkshopPractice',{score:w.draft.score}),nodes=r.nodes(p,'WorkshopPractice');
  const midi=nodes.find(n=>n.data&&n.data.attrs&&n.data.attrs.silent===true);
  assert(midi);assert(Object.prototype.hasOwnProperty.call(midi.data.attrs,'show-connection-feedback'));
  const definition=r.load('components/MidiInput.vue').default;assert.strictEqual(definition.props.showConnectionFeedback.default,false);
  const connection=r.view('MidiInput',{silent:true,showConnectionFeedback:true});connection.boundMidiInputs=[];connection.errorMessage='Synthetic denied';connection.lastNotePlayed='C4';connection.midiPermissionPending=true;
  const feedback=r.nodes(connection,'MidiInput');assert(feedback.some(n=>n.data&&n.data.staticClass==='error-message'));assert(feedback.some(n=>n.data&&n.data.staticClass==='permission-message'));
  assert(!feedback.some(n=>n.data&&['ready','last-note'].includes(n.data.staticClass)));assert(feedback.some(n=>n.tag==='button'&&n.data.staticClass==='persistence-retry'));connection.$destroy();
  assert.strictEqual(p.midiConnected,false);const before=JSON.stringify(p.practice);void p.toggle();assert.strictEqual(JSON.stringify(p.practice),before);
  p.$destroy();w.$destroy();
});

(async()=>{let failed=0;for(const item of cases){try{await item.body();process.stdout.write('PASS '+item.name+'\n');}catch(error){failed++;process.stderr.write('FAIL '+item.name+'\n'+error.stack+'\n');}}await Vue.nextTick();console.log(JSON.stringify({groups:cases.length,failed,method:'Actual Vue/model in synthetic isolated RAM; no native browser/layout/hardware claim.'}));if(failed)process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
