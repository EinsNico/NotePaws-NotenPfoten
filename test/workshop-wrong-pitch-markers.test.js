// Actual Vue/model/render scripts with isolated RAM and a deterministic clock.
// No native browser, physical MIDI, audio, or real user storage claim.
const assert=require('assert');
const {realm,plain,Vue}=require('./workshop-approved-workflow-fixture');
const cases=[];function test(name,run){cases.push([name,run]);}
function fixture(edit=()=>{},locale='de') {
  const r=realm(locale),model=r.load('model/Workshop.js'),practice=r.load('model/WorkshopPractice.js');
  const note=(id,value=48,startSlot=0,extra={})=>Object.assign({id,kind:'note',noteValue:'quarter',startSlot,pitch:model.workshopPitchFromValue(value)},extra);
  let score=model.createWorkshopDraft('Wrong pitch markers',2).score;
  score.parts[0].measures[0].events=[note('first'),note('next',55,2)];
  score=edit(score,note,model)||score;assert(model.isValidWorkshopScore(score));
  const p=r.view('WorkshopPractice',{score});
  let now=0,id=10000;const jobs=new Map();
  r.context.performance.now=()=>now;
  r.context.setTimeout=(callback,delay)=>{const key=++id;jobs.set(key,{callback,delay,due:now+delay});r.timers.set(key,callback);return key;};
  r.context.clearTimeout=key=>{jobs.delete(key);r.timers.delete(key);};
  p.midiConnected=true;p.playPressedAudio=()=>{};p.practice=practice.startWorkshopPractice(p.practice);
  const advance=ms=>{now+=ms;for(const [key,job] of [...jobs])if(job.due<=now){jobs.delete(key);r.timers.delete(key);job.callback();}};
  const listening=(extra={})=>r.view('WorkshopListening',Object.assign({score:p.plan.score,timeline:p.plan.timeline,practice:true,
    wrongPitchTarget:p.currentTarget,wrongPitchValues:p.wrongPitchValues,pitchLabel:p.pitchLabel},extra));
  return {r,p,model,practice,note,score,jobs,advance,listening,destroy:()=>p.$destroy()};
}
function flatten(node){return (Array.isArray(node)?node:[node]).flatMap(n=>n?[n,...flatten(n.children||[])]:[]);}
function text(node){return node.text || (node.children||[]).map(text).join('');}
function slot(f){const n=f.r.nodes(f.p,'WorkshopPractice').find(n=>n.data&&n.data.scopedSlots&&n.data.scopedSlots['practice-settings']);assert(n);return flatten(n.data.scopedSlots['practice-settings']({}));}
function map(f,view,values,target=f.p.currentTarget){return f.r.load('model/WorkshopWrongPitchMapping.js').mapWorkshopWrongPitches({values,target,timeline:f.p.plan.timeline,system:view.system});}

test('DE/EN switch is only in the existing practice-settings slot and false survives reopening',()=>{
  for(const locale of ['de','en']) {
    const f=fixture(undefined,locale),before=JSON.stringify(f.score);
    assert.strictEqual(f.p.wrongPitchMarkersEnabled,true);
    const button=slot(f).find(n=>n.data&&n.data.staticClass==='wrong-pitch-toggle');assert(button);assert.strictEqual(button.data.attrs['aria-pressed'],true);
    assert(!text(button).includes('FLOW_'));assert(!button.data.attrs.title.includes('FLOW_'));
    button.data.on.click();assert.strictEqual(f.p.wrongPitchMarkersEnabled,false);
    assert.strictEqual(JSON.parse(f.r.ram.getItem('uiWorkshopWrongPitchMarkers')),false);
    const reopened=f.r.view('WorkshopPractice',{score:f.score});assert.strictEqual(reopened.wrongPitchMarkersEnabled,false);reopened.$destroy();
    const fresh=realm(locale);fresh.ram.setItem('uiWorkshopWrongPitchMarkers',JSON.stringify(false));const restart=fresh.view('WorkshopPractice',{score:f.score});assert.strictEqual(restart.wrongPitchMarkersEnabled,false);restart.$destroy();
    assert.strictEqual(JSON.stringify(f.score),before);assert.deepStrictEqual([...f.r.data.keys()],['uiWorkshopWrongPitchMarkers']);f.destroy();
  }
});

test('storage read/write failures keep a working in-session switch with no score/progress writes',()=>{
  for(const silent of [false,true]) {
    const f=fixture(),pref=f.r.load('model/WorkshopPracticePreferences.js');f.r.ram.setItem('uiWorkshopWrongPitchMarkers',JSON.stringify(true));
    f.r.ram.setItem=()=>{if(!silent)throw Error('quota');};f.p.toggleWrongPitchMarkers();assert.strictEqual(f.p.wrongPitchMarkersEnabled,false);
    assert.strictEqual(pref.loadWorkshopWrongPitchMarkers(),false);const reopened=f.r.view('WorkshopPractice',{score:f.score});assert.strictEqual(reopened.wrongPitchMarkersEnabled,false);reopened.$destroy();
    f.r.ram.getItem=()=>{throw Error('denied');};assert.strictEqual(pref.loadWorkshopWrongPitchMarkers(),false);
    f.p.toggleWrongPitchMarkers();assert.strictEqual(f.p.wrongPitchMarkersEnabled,true);assert.strictEqual(pref.loadWorkshopWrongPitchMarkers(),true);f.destroy();
  }
});

test('wrong input leaves actual assessment behavior unchanged and each marker lasts exactly1000ms',()=>{
  const f=fixture(),before=JSON.stringify(f.score),baseline=f.practice.submitWorkshopPracticeInput(f.p.practice,49);
  f.p.press(49);assert.deepStrictEqual(plain(f.p.practice),plain(baseline));assert.deepStrictEqual(plain(f.p.wrongPitchValues),[49]);
  assert.strictEqual([...f.jobs.values()][0].delay,1000);f.advance(999);assert.strictEqual(f.p.wrongPitchValues.length,1);f.advance(1);
  assert.strictEqual(f.p.wrongPitchValues.length,0);assert.strictEqual(f.jobs.size,0);assert.strictEqual(JSON.stringify(f.score),before);f.destroy();
});

test('multiple false tones have independent deadlines; repeat refreshes only that tone',()=>{
  const f=fixture();f.p.press(49);f.advance(500);f.p.press(50);f.p.press(49);
  assert.deepStrictEqual(plain(f.p.wrongPitchValues),[49,50]);assert.strictEqual(f.jobs.size,2);
  f.advance(500);assert.strictEqual(f.p.wrongPitchValues.length,2);f.advance(500);assert.strictEqual(f.p.wrongPitchValues.length,0);f.destroy();
});

test('stale callbacks cannot remove a newer equal-pitch marker or mutate a destroyed view',()=>{
  const f=fixture();f.p.press(49);const old=[...f.jobs.values()][0].callback;
  f.p.pause();f.p.practice=f.practice.startWorkshopPractice(f.p.practice);f.p.press(49);old();assert.deepStrictEqual(plain(f.p.wrongPitchValues),[49]);
  const current=[...f.jobs.values()][0].callback;f.destroy();current();assert.strictEqual(f.p.wrongPitchValues.length,0);assert.strictEqual(f.jobs.size,0);
});

test('all expected chord values including duplicates clear points without marking missing tones',()=>{
  const f=fixture((s,note)=>{s.parts[0].measures[0].events.unshift(note('chord',52));});
  f.p.press(48);assert.deepStrictEqual(plain(f.p.practice.pendingValues),[48]);f.p.press(49);assert.strictEqual(f.p.wrongPitchValues.length,1);
  f.p.press(48);assert.strictEqual(f.p.wrongPitchValues.length,0);assert.deepStrictEqual(plain(f.p.practice.pendingValues),[48]);
  f.p.press(50);f.p.press(52);assert.strictEqual(f.p.wrongPitchValues.length,0);assert.strictEqual(f.p.practice.targetIndex,1);f.destroy();
});

test('correct pitches classified early/late or wrong for timing receive no pitch marker',()=>{
  for(const delta of [-1000,-150,150]) {
    const f=fixture(),position=f.p.plan.targets[1].startMs+delta;f.p.behavior='continuous';f.p.practice=Object.assign({},f.p.practice,{behavior:'continuous',status:'running',targetIndex:1,positionMs:position});
    f.p.showWrongPitch(49);f.p.press(55);assert.strictEqual(f.p.wrongPitchValues.length,0);
    const expected=delta===-1000?'wrong':delta<0?'early':'late';assert.strictEqual(f.p.practice.feedback,expected);f.destroy();
  }
});

test('disabling markers leaves scoring active and clears every timer immediately',()=>{
  const f=fixture();f.p.press(49);f.p.toggleWrongPitchMarkers();assert.strictEqual(f.jobs.size,0);assert.strictEqual(f.p.wrongPitchValues.length,0);
  const before=f.p.practice.wrongCount;f.p.press(50);assert.strictEqual(f.p.practice.wrongCount,before+1);assert.strictEqual(f.jobs.size,0);f.destroy();
});

test('pause, seek, tempo, loop, mode, settings, MIDI loss, leave and destroy clean markers',()=>{
  const actions=[p=>p.pause(),p=>p.seek(0),p=>p.changeTempo(50),p=>p.changeLoop(true),p=>p.changeBehavior('continuous'),
    p=>p.toggleSettings(),p=>p.handleMidiConnection(false),p=>p.back(),p=>p.$destroy(),p=>p.resetSection(0)];
  for(const action of actions){const f=fixture();f.p.press(49);action(f.p);assert.strictEqual(f.p.wrongPitchValues.length,0);assert.strictEqual(f.jobs.size,0);if(!f.p._isDestroyed)f.destroy();}
});

test('continuous target advance and loop restart clear marker lifetime independently of feedback',()=>{
  const f=fixture();f.p.press(49);f.p.applyState(Object.assign({},f.p.practice,{targetIndex:1}));assert.strictEqual(f.jobs.size,0);
  f.p.showWrongPitch(49);f.p.toggle=()=>{};f.p.startNextLoop();assert.strictEqual(f.jobs.size,0);assert.strictEqual(f.p.wrongPitchValues.length,0);f.destroy();
});

test('MIDI internal C4=48 maps every clef exactly and expected/absent input produces no invented point',()=>{
  for(const [clef,y] of [['treble',176],['bass',56],['alto',116],['tenor',96]]) {
    const f=fixture(s=>{s.parts[0].clef=clef;s.parts[0].measures[0].events[0].pitch={step:'G',alter:0,octave:4};}),v=f.listening();
    const m=map(f,v,[48])[0];assert.strictEqual(m.localY,y);const frame=v.system.frames[0];assert.strictEqual(m.y,frame.y+y-frame.top);
    assert.strictEqual(map(f,v,f.p.currentTarget.expectedValues).length,0);assert.strictEqual(map(f,v,[48],null).length,0);v.$destroy();f.destroy();
  }
  const f=fixture(),helper=f.r.load('model/WorkshopWrongPitchMapping.js');assert.strictEqual(helper.mapWorkshopWrongPitches({values:[],target:f.p.currentTarget,system:{get bars(){throw Error('empty UI must not inspect notation');}},timeline:{get events(){throw Error('empty UI must not scan timeline');}}}).length,0);f.destroy();
});

test('nearest expected sounding pitch selects real lower/upper frames, including displayStaff',()=>{
  const f=fixture((s,note,model)=>{s=model.setWorkshopSecondStaffEnabled(s,true);s.parts[0].measures[0].events=[note('high',72)];s.parts[1].measures[0].events=[note('low',36)];return s;}),v=f.listening();
  const values=map(f,v,[37,71]);assert.deepStrictEqual(plain(values.map(m=>[m.value,m.referenceValue,m.partIndex])),[[37,36,1],[71,72,0]]);v.$destroy();f.destroy();
  const cross=fixture((s,note,model)=>{s=model.setWorkshopSecondStaffEnabled(s,true);s.parts[0].measures[0].events=[note('cross',48,0,{displayStaff:1})];s.parts[1].clefOctave=-1;s.parts[1].transpose={chromatic:2};s.parts[1].measures[0].directions=[{id:'octave',type:'octaveShift',startSlot:0,endSlot:8,value:1}];return s;}),cv=cross.listening(),m=map(cross,cv,[51])[0];
  assert.strictEqual(m.partIndex,1);assert.strictEqual(m.offset,2);assert.strictEqual(m.localY,56);assert.strictEqual(cross.model.workshopPitchValue(m.pitch)+m.offset,51);cv.$destroy();cross.destroy();
});

test('octave clefs, instrument transpose and octave-line offsets invert the actual timeline once',()=>{
  for(const [clefOctave,chromatic,octaveChange,shift] of [[-1,2,1,1],[1,-2,-1,-1],[0,12,0,0]]) {
    const f=fixture(s=>{s.parts[0].clefOctave=clefOctave;s.parts[0].transpose={chromatic,diatonic:chromatic===2?1:0,octaveChange};s.parts[0].measures[0].directions=shift ? [{id:'ottava',type:'octaveShift',startSlot:0,endSlot:2,value:shift}] : [];}),v=f.listening();
    const expected=f.p.currentTarget.expectedValues[0],m=map(f,v,[expected+1])[0];assert.strictEqual(m.localY,176);assert.strictEqual(f.model.workshopPitchValue(m.pitch),49);assert.strictEqual(m.offset,expected-48);v.$destroy();f.destroy();
  }
});

test('cross-bar grace targets retain all candidate systems and performed repeat occurrences',()=>{
  const f=fixture((s,note,model)=>{s=model.setWorkshopSecondStaffEnabled(s,true);s.bpm=120;
    s.parts[0].measures[0].events=[note('previous',64,6)];s.parts[0].measures[1].events=[note('grace',67,0,{grace:true,noteValue:'eighth',graceTiming:{stealPrevious:50}}),note('main',72)];s.parts[1].measures[0].events=[note('bass',36,7,{noteValue:'eighth'})];return s;}),v=f.listening();
  const target=f.p.plan.targets.find(t=>t.expectedValues.includes(67)&&t.expectedValues.includes(36));assert(target);
  const m=map(f,v,[37],target)[0];assert.strictEqual(m.referenceValue,36);assert.strictEqual(m.partIndex,1);v.$destroy();f.destroy();
  const repeat=fixture(s=>{s.parts[0].measures[0].repeatStart=true;s.parts[0].measures[1].repeatEnd=2;}),rv=repeat.listening();
  const targets=repeat.p.plan.targets.filter(t=>t.eventIds.includes('first'));assert(targets.length>1);
  for(const t of targets)assert.strictEqual(map(repeat,rv,[49],t)[0].referenceValue,48);rv.$destroy();repeat.destroy();
});

test('flat/sharp families, naturals and ledger lines preserve true pitch values',()=>{
  for(const keyId of ['C-major','F-major','G-major']){
    const f=fixture(s=>{s.keyId=keyId;s.parts[0].measures[0].events[0].pitch={step:'G',alter:0,octave:4};}),v=f.listening(),m=map(f,v,[49])[0];
    assert.strictEqual(f.model.workshopPitchValue(m.pitch),49);assert.strictEqual(m.accidental,keyId==='F-major'?'flat':'sharp');
    assert.strictEqual(m.pitch.step,keyId==='F-major'?'D':'C');const natural=map(f,v,[48])[0];assert.strictEqual(natural.accidental,'nat');assert(natural.ledgers.includes(natural.y));v.$destroy();f.destroy();
  }
});

test('extreme MIDI values remain truthful labels with no clamped point, including top boundary',()=>{
  const f=fixture(),v=f.listening({wrongPitchValues:[-12,115]});const markers=map(f,v,[-12,115]);
  assert.strictEqual(markers.length,2);assert(markers.every(m=>m.offscreen));assert.deepStrictEqual(plain(markers.map(m=>m.direction)),['↓','↑']);
  const rendered=f.r.nodes(v,'WorkshopListening');assert(!rendered.some(n=>n.data&&n.data.staticClass==='wrong-pitch-dot'));assert(text(v._render()).includes('C-1'));assert(text(v._render()).includes('G9'));
  const m=map(f,v,[72])[0],system=plain(v.system);system.frames[0].top=m.localY;
  const boundary=f.r.load('model/WorkshopWrongPitchMapping.js').mapWorkshopWrongPitches({values:[72],target:f.p.currentTarget,timeline:f.p.plan.timeline,system})[0];assert(boundary.offscreen);assert.strictEqual(boundary.direction,'↑');v.$destroy();f.destroy();
});

test('same-line false tones render one exact point with distinct labels and no overlapping accidentals',()=>{
  const f=fixture(s=>{s.parts[0].measures[0].events[0].pitch={step:'C',alter:0,octave:5};}),v=f.listening({wrongPitchValues:[48,49]});
  assert.strictEqual(v.wrongPitchGroups.length,1);assert.deepStrictEqual(plain(v.wrongPitchGroups[0].values),[48,49]);const nodes=f.r.nodes(v,'WorkshopListening');
  assert.strictEqual(nodes.filter(n=>n.data&&n.data.staticClass==='wrong-pitch-dot').length,1);assert(!nodes.some(n=>n.data&&n.data.staticClass==='wrong-pitch-accidental'));
  const label=nodes.find(n=>n.data&&n.data.staticClass==='wrong-pitch-edge');assert.notStrictEqual(f.p.pitchLabel(48),f.p.pitchLabel(49));assert(text(label).includes(f.p.pitchLabel(48)));assert(text(label).includes(f.p.pitchLabel(49)));
  v.wrongPitchValues=[48,49,50,51];assert.strictEqual(v.wrongPitchGroups.length,2);assert.strictEqual(v.wrongPitchCollisions.length,2);
  const adjacent=f.r.nodes(v,'WorkshopListening');assert.strictEqual(adjacent.filter(n=>n.data&&n.data.staticClass==='wrong-pitch-dot').length,2);
  assert.strictEqual(adjacent.filter(n=>n.data&&n.data.attrs&&n.data.attrs['data-shared-pitch-line']).length,2);assert(!adjacent.some(n=>n.tag==='text'&&text(n).includes(f.p.pitchLabel(48))));v.$destroy();f.destroy();
});

test('pending clef transition shows truthful label until displayed context matches; overlay does not re-engrave',async()=>{
  const f=fixture(s=>{s.parts[0].measures[0].contextChanges=[{id:'change',startSlot:2,clef:'bass',clefOctave:1}];s.parts[0].measures[0].events[1].pitch={step:'C',alter:0,octave:4};}),target=f.p.plan.targets[1];
  const v=f.listening({wrongPitchTarget:target,wrongPitchValues:[target.expectedValues[0]+1],position:target.startMs-200}),cache=v._engraving,scoreBefore=JSON.stringify(f.score);
  assert.strictEqual(v.fixedContexts[0].context.clef,'treble');assert(v.wrongPitchMarkers[0].contextPending);assert.strictEqual(v.wrongPitchGroups.length,0);assert.strictEqual(v.wrongPitchEdges[0].direction,'↔');
  v.position=target.startMs;await Vue.nextTick();assert(!v.wrongPitchMarkers[0].contextPending);assert.strictEqual(v._engraving,cache);assert.strictEqual(JSON.stringify(f.score),scoreBefore);
  v.wrongPitchValues=[];await Vue.nextTick();assert.strictEqual(v.wrongPitchMarkers.length,0);assert.strictEqual(v._engraving,cache);v.$destroy();f.destroy();
});

(async()=>{for(const [name,run] of cases){await run();process.stdout.write('PASS '+name+'\n');}process.stdout.write(JSON.stringify({groups:cases.length,failed:0,method:'Actual Vue/model/template with isolated RAM and deterministic timers; no native/hardware/audio/user-storage claim.'})+'\n');})().catch(error=>{console.error(error);process.exitCode=1;});
