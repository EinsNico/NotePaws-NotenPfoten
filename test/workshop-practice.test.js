const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
Module._extensions['.vue']=mod => {mod.exports={};};
const model=require('../src/model/Workshop'),practice=require('../src/model/WorkshopPractice');
const tests=[];function test(name,run) {tests.push([name,run]);}
function note(id,value=48,startSlot=0,noteValue='quarter',extra={}) {
  return Object.assign({id,kind:'note',noteValue,startSlot,pitch:model.workshopPitchFromValue(value)},extra);
}
function score(events,barCount=1) {
  const result=model.createWorkshopDraft('Practice',barCount).score;result.parts[0].measures[0].events=events;return result;
}
function plan(source,hands) {assert(model.isValidWorkshopScore(source));return practice.createWorkshopPracticePlan(source,{hands});}
function start(source,behavior='wait') {return practice.startWorkshopPractice(practice.createWorkshopPractice(source,{behavior}));}

test('attack chords deduplicate sounding pitches and hand selection follows owners even with matching clefs and cross-staff notes',()=>{
  let source=model.setWorkshopSecondStaffEnabled(score([note('right',48,0,'quarter',{displayStaff:1}),note('right-high',60)]),true);
  source.parts[1].clef='treble';source.parts[1].measures[0].events=[note('left',36),note('left-unison',48)];
  const before=JSON.stringify(source),both=plan(source),right=plan(source,{left:false,right:true}),left=plan(source,{left:true,right:false});
  assert.deepStrictEqual(both.targets[0].expectedValues,[36,48,60]);
  assert.deepStrictEqual(right.targets[0].expectedValues,[48,60]);assert.deepStrictEqual(left.targets[0].expectedValues,[36,48]);
  assert.deepStrictEqual(both.targets[0].eventIds,['right','right-high','left','left-unison']);
  assert.strictEqual(right.durationMs,left.durationMs);assert.strictEqual(JSON.stringify(source),before);
  assert(Object.isFrozen(both.score.parts[0].measures[0].events[0].pitch));assert(Object.isFrozen(both.timeline.events));
  source.parts[0].measures[0].events[0].pitch=model.workshopPitchFromValue(55);
  assert.deepStrictEqual(right.targets[0].expectedValues,[48,60],'practice owns a separate immutable score');
});
test('rests and disabled parts preserve the full timeline but do not become targets',()=>{
  let source=model.setWorkshopSecondStaffEnabled(score([note('right-late',48,4)],2),true);
  source.parts[1].measures[0].events=[note('disabled',36)];source.parts[1].enabled=false;
  const whole=plan(source),empty=plan(source,{right:false,left:true});
  assert.strictEqual(whole.durationMs,8000);assert.strictEqual(whole.targets[0].startMs,2000);
  assert.strictEqual(empty.targets.length,0);assert.strictEqual(empty.durationMs,8000);
  let state=start(whole);state=practice.advanceWorkshopPractice(state,5000);
  assert.strictEqual(state.positionMs,2000);assert.strictEqual(state.status,'waiting');
  state=practice.submitWorkshopPracticeInput(state,48);state=practice.advanceWorkshopPractice(state,6000);
  assert.strictEqual(state.status,'complete');assert.strictEqual(state.correctCount,1);assert.strictEqual(state.missedCount,0);
});
test('waiting chords accept individual exact-octave tones, keep collected tones after errors and reject octave substitution',()=>{
  const whole=plan(score([note('low',36),note('middle',48)]));let state=start(whole);
  assert.strictEqual(state.status,'waiting');
  const original=state;state=practice.submitWorkshopPracticeInput(state,36);
  assert.deepStrictEqual(original.pendingValues,[]);assert.deepStrictEqual(state.pendingValues,[36]);
  state=practice.submitWorkshopPracticeInput(state,36);assert.strictEqual(state.correctCount,0);
  state=practice.submitWorkshopPracticeInput(state,60);assert.strictEqual(state.wrongCount,1);assert.deepStrictEqual(state.pendingValues,[36]);
  state=practice.advanceWorkshopPractice(state,20000);assert.strictEqual(state.positionMs,0);
  state=practice.submitWorkshopPracticeInput(state,48);assert.strictEqual(state.correctCount,1);assert.strictEqual(state.status,'running');
  state=practice.advanceWorkshopPractice(state,4000);assert.strictEqual(state.status,'complete');assert.strictEqual(state.missedCount,0);
});
test('continuous mode records skipped attacks, rejects early input, and accepts a chord inside the timing window',()=>{
  const whole=plan(score([note('first',48),note('second',52,2),note('third',55,4)]));let state=start(whole,'continuous');
  state=practice.advanceWorkshopPractice(state,500);assert.strictEqual(state.missedCount,1);
  state=practice.submitWorkshopPracticeInput(state,52);assert.strictEqual(state.wrongCount,1,'500ms before attack is early');
  state=practice.advanceWorkshopPractice(state,300);state=practice.releaseWorkshopPracticeInput(state,52);state=practice.submitWorkshopPracticeInput(state,52);
  assert.strictEqual(state.correctCount,1);assert.strictEqual(state.targetIndex,2);
  state=practice.advanceWorkshopPractice(state,3200);assert.strictEqual(state.status,'complete');assert.strictEqual(state.missedCount,2);
  assert.deepStrictEqual(state.results,['missed','correct','missed']);
});
test('ties require one attack per actual performed chain, including repeats and grace continuations',()=>{
  const source=score([note('from',48,0,'whole')],2);
  source.parts[0].measures[1].events=[note('to',48,0,'whole')];source.ties=[{fromId:'from',toId:'to'}];
  source.parts[0].measures[0].repeatStart=true;source.parts[0].measures[1].repeatEnd=2;
  const whole=plan(source);assert.deepStrictEqual(whole.targets.map(target=>target.startMs),[0,8000]);
  assert.deepStrictEqual(whole.targets.map(target=>target.eventIds),[['from'],['from']]);
  const grace=score([note('grace',48,0,'eighth',{grace:true}),note('main',48)]);
  grace.ties=[{fromId:'grace',toId:'main'}];const gracePlan=plan(grace);
  assert.strictEqual(gracePlan.targets.length,1);assert.deepStrictEqual(gracePlan.targets[0].eventIds,['grace']);
});
test('navigation arrivals at a tied destination require a fresh attack after a jump',()=>{
  const source=score([note('from',48,0,'whole')],3);
  source.parts[0].measures[1].events=[note('to',48,0,'whole')];source.parts[0].measures[1].navigation=['segno'];
  source.parts[0].measures[2].events=[note('last',55)];source.parts[0].measures[2].navigation=['ds'];
  source.ties=[{fromId:'from',toId:'to'}];const whole=plan(source);
  assert.deepStrictEqual(whole.timeline.measures.map(measure=>measure.index),[0,1,2,1,2]);
  assert.deepStrictEqual(whole.targets.map(target=>target.eventIds[0]),['from','last','to','last']);
});
test('performed timing incorporates tempo, grace order, sounding octave shifts and imported transposition',()=>{
  const source=score([note('grace',60,0,'eighth',{grace:true}),note('main',64)],2);
  source.parts[0].measures[0].directions=[{id:'tempo',type:'tempo',startSlot:0,value:120},
    {id:'octave',type:'octaveShift',startSlot:0,endSlot:8,value:1}];
  source.parts[0].measures[1].events=[note('later',67)];const whole=plan(source);
  assert.deepStrictEqual(whole.targets.map(target=>target.expectedValues),[[72],[76],[67]]);
  assert.strictEqual(whole.targets[0].startMs,0);assert(whole.targets[1].startMs>0);
  assert.strictEqual(whole.targets[2].startMs,2000);assert.strictEqual(whole.durationMs,4000);
});
test('fractional-pitch chords are explicitly unscored and cannot falsely match a rounded pitch',()=>{
  const whole=plan(score([note('normal',48),note('quarter-tone',48.5),note('playable',52,2)]));
  assert.strictEqual(whole.unsupportedTargets.length,1);assert.deepStrictEqual(whole.unsupportedTargets[0].expectedValues,[48,48.5]);
  assert.strictEqual(whole.targets.length,1);assert.strictEqual(whole.targets[0].startMs,1000);
  let state=start(whole);state=practice.submitWorkshopPracticeInput(state,48);assert.strictEqual(state.correctCount,0);
  state=practice.advanceWorkshopPractice(state,1000);state=practice.submitWorkshopPracticeInput(state,52);
  assert.strictEqual(state.correctCount,1);assert.strictEqual(state.missedCount,0);
});
test('pause freezes time and position jumps restart an unscored section with clean counters',()=>{
  const whole=plan(score([note('a',48),note('b',52,2),note('c',55,4)]));let state=start(whole);
  state=practice.submitWorkshopPracticeInput(state,48);state=practice.advanceWorkshopPractice(state,500);
  state=practice.pauseWorkshopPractice(state);assert.strictEqual(practice.advanceWorkshopPractice(state,9999),state);
  state=practice.seekWorkshopPractice(state,1000);assert.strictEqual(state.status,'paused');assert.strictEqual(state.correctCount,0);
  assert.deepStrictEqual(state.results,['skipped',null,null]);state=practice.startWorkshopPractice(state);
  assert.strictEqual(state.status,'waiting');assert.deepStrictEqual(practice.workshopPracticeActiveEventIds(state),['b']);
  state=practice.submitWorkshopPracticeInput(state,52);state=practice.seekWorkshopPractice(state,2000);
  assert.strictEqual(state.status,'waiting');assert.strictEqual(state.correctCount,0);assert.strictEqual(state.missedCount,0);
});
test('a MIDI unison counts once while learning each written owner note; hand filters preserve separate progress',()=>{
  let source=model.setWorkshopSecondStaffEnabled(score([note('right',48)]),true);
  source.parts[1].measures[0].events=[note('left',48)];
  const both=plan(source),right=plan(source,{right:true,left:false}),left=plan(source,{right:false,left:true});
  assert.strictEqual(both.totalNoteKeys.length,2);assert.strictEqual(right.totalNoteKeys.length,1);assert.strictEqual(left.totalNoteKeys.length,1);
  assert(right.totalNoteKeys[0].startsWith('right:'));assert(left.totalNoteKeys[0].startsWith('left:'));
  assert.notStrictEqual(right.totalNoteKeys[0],left.totalNoteKeys[0]);
  const state=practice.submitWorkshopPracticeInput(start(both),48);
  assert.deepStrictEqual(state.toneCounts,{correct:1,early:0,late:0,wrong:0,missed:0});
  assert.deepStrictEqual(state.assessmentDelta.learnedNoteKeys,both.totalNoteKeys);
  const rightState=practice.submitWorkshopPracticeInput(start(right),48);
  assert.deepStrictEqual(rightState.assessmentDelta.learnedNoteKeys,right.totalNoteKeys);
});
test('written progress keys survive repeats and tempo edits but change with edited sounding pitch',()=>{
  const source=score([note('a',48)],2);source.parts[0].measures[1].events=[note('b',52)];
  source.parts[0].measures[0].repeatStart=true;source.parts[0].measures[1].repeatEnd=2;
  const first=plan(source);assert.strictEqual(first.targets.length,4);assert.strictEqual(first.totalNoteKeys.length,2);
  assert.deepStrictEqual(first.targets[0].noteKeysByValue[48],first.targets[2].noteKeysByValue[48]);
  const tempo=model.cloneWorkshop(source);tempo.bpm=120;assert.deepStrictEqual(plan(tempo).totalNoteKeys,first.totalNoteKeys);
  const edited=model.cloneWorkshop(source);edited.parts[0].measures[0].events[0].pitch=model.workshopPitchFromValue(49);
  const editedPlan=plan(edited);assert(!editedPlan.totalNoteKeys.includes(first.totalNoteKeys[0]));assert(editedPlan.totalNoteKeys.includes(first.totalNoteKeys[1]));
  const octave=model.cloneWorkshop(source);octave.parts[0].measures[0].directions=[{id:'shift',type:'octaveShift',startSlot:0,endSlot:8,value:1}];
  assert(plan(octave).totalNoteKeys[0].endsWith(':60'));assert(first.totalNoteKeys[0].endsWith(':48'));
});
test('a correct tied-chain attack credits its written continuations without multiplying repeat progress',()=>{
  const source=score([note('from',48,0,'whole')],2);source.parts[0].measures[1].events=[note('to',48,0,'whole')];
  source.ties=[{fromId:'from',toId:'to'}];source.parts[0].measures[0].repeatStart=true;source.parts[0].measures[1].repeatEnd=2;
  const whole=plan(source);assert.strictEqual(whole.totalNoteKeys.length,2);let state=start(whole);
  state=practice.submitWorkshopPracticeInput(state,48);const learned=new Set(state.assessmentDelta.learnedNoteKeys);
  assert.strictEqual(learned.size,2);state=practice.advanceWorkshopPractice(state,8000);
  state=practice.releaseWorkshopPracticeInput(state,48);state=practice.submitWorkshopPracticeInput(state,48);state.assessmentDelta.learnedNoteKeys.forEach(key=>learned.add(key));
  assert.strictEqual(state.toneCounts.correct,2);assert.strictEqual(learned.size,2);
});
test('continuous timing classifies every correct-pitch tone as correct, early or late without false wrong counts',()=>{
  const whole=plan(score([note('a',48,2)]));
  for(const [offset,kind] of [[-250,'early'],[-101,'early'],[-100,'correct'],[0,'correct'],[100,'correct'],[101,'late'],[250,'late']]) {
    let state=start(whole,'continuous');state=practice.advanceWorkshopPractice(state,1000+offset);
    state=practice.submitWorkshopPracticeInput(state,48);
    assert.strictEqual(state.toneCounts[kind],1,offset+'ms');assert.strictEqual(state.toneCounts.wrong,0);
    assert.strictEqual(state.assessmentDelta[kind],1);assert.strictEqual(state.feedback,kind);
    assert.strictEqual(state.assessmentDelta.learnedNoteKeys.length,kind==='correct' ? 1 : 0);
  }
  let waiting=start(whole);waiting=practice.advanceWorkshopPractice(waiting,1000);waiting=practice.advanceWorkshopPractice(waiting,60000);
  waiting=practice.submitWorkshopPracticeInput(waiting,48);assert.strictEqual(waiting.toneCounts.correct,0);
  assert.strictEqual(waiting.toneCounts.late,1,'active waiting time still judges the played tone');
});
test('waiting credits a complete held grip with individual response times and ignores manual pause time',()=>{
  const whole=plan(score([note('c',48),note('e',52)]));let state=start(whole);
  assert.strictEqual(state.targetDueActiveMs,0);state=practice.advanceWorkshopPractice(state,50);
  state=practice.submitWorkshopPracticeInput(state,48);assert.strictEqual(state.toneCounts.correct,0);
  assert.strictEqual(state.positionMs,0);assert.strictEqual(state.status,'waiting');
  state=practice.pauseWorkshopPractice(state);assert.strictEqual(practice.advanceWorkshopPractice(state,10000),state);
  state=practice.startWorkshopPractice(state);state=practice.advanceWorkshopPractice(state,30);
  state=practice.releaseWorkshopPracticeInput(state,48);state=practice.submitWorkshopPracticeInput(state,48);
  state=practice.submitWorkshopPracticeInput(state,52);assert.strictEqual(state.toneCounts.correct,2);
  assert.strictEqual(state.toneCounts.late,0);assert.strictEqual(state.activeMs,80);
  let split=start(whole);split=practice.advanceWorkshopPractice(split,50);split=practice.submitWorkshopPracticeInput(split,48);
  split=practice.advanceWorkshopPractice(split,1000);split=practice.submitWorkshopPracticeInput(split,52);
  assert.strictEqual(split.toneCounts.correct,1);assert.strictEqual(split.toneCounts.late,1);
  assert.strictEqual(split.assessmentDelta.learnedNoteKeys.length,1,'only the correctly timed held pitch earns progress after the complete grip');
});
test('waiting accepts very late correct pitches but subtracts their wait time from the following target schedule',()=>{
  const whole=plan(score([note('a',48),note('b',52,2)]));let state=start(whole);
  state=practice.advanceWorkshopPractice(state,3500);assert.strictEqual(state.positionMs,0);
  state=practice.submitWorkshopPracticeInput(state,48);assert.strictEqual(state.toneCounts.late,1);assert.strictEqual(state.wrongCount,0);
  assert.strictEqual(state.targetDueActiveMs,4500);state=practice.advanceWorkshopPractice(state,1000);
  assert.strictEqual(state.positionMs,1000);assert.strictEqual(state.activeMs,4500);
  state=practice.submitWorkshopPracticeInput(state,52);assert.strictEqual(state.toneCounts.correct,1);assert.strictEqual(state.toneCounts.late,1);
});
test('waiting accepts an early approach inside 250ms and starts a new section with an independent timing origin',()=>{
  const whole=plan(score([note('a',48,2),note('b',52,4)]));let state=start(whole);
  state=practice.advanceWorkshopPractice(state,820);state=practice.submitWorkshopPracticeInput(state,48);
  assert.strictEqual(state.toneCounts.early,1);assert.strictEqual(state.toneCounts.wrong,0);assert.strictEqual(state.positionMs,820);
  state=practice.advanceWorkshopPractice(state,1180);state=practice.submitWorkshopPracticeInput(state,52);
  assert.strictEqual(state.toneCounts.correct,1);assert.strictEqual(state.toneCounts.late,0);
  state=practice.seekWorkshopPractice(state,2000);assert.strictEqual(state.activeMs,0);assert.strictEqual(state.targetDueActiveMs,0);
  state=practice.submitWorkshopPracticeInput(state,52);assert.strictEqual(state.toneCounts.correct,1);
});
test('only complete physical chords earn tone credit; incomplete chords miss all required pitches',()=>{
  const whole=plan(score([note('c',48),note('e',52),note('g',55)]));let state=start(whole,'continuous');
  state=practice.submitWorkshopPracticeInput(state,48);assert.strictEqual(state.correctCount,0,'chord remains incomplete');
  assert.strictEqual(state.toneCounts.correct,0);assert.strictEqual(state.assessmentDelta.correct,0);
  assert.strictEqual(practice.submitWorkshopPracticeInput(state,48),state,'a collected pitch is not counted again');
  state=practice.advanceWorkshopPractice(state,251);assert.strictEqual(state.missedCount,1);
  assert.strictEqual(state.toneCounts.missed,3);assert.strictEqual(state.assessmentDelta.missed,3);
  const revision=state.assessmentRevision;state=practice.advanceWorkshopPractice(state,1);
  assert.strictEqual(state.assessmentRevision,revision);assert.strictEqual(state.assessmentDelta.missed,0);
  assert.strictEqual(state.toneCounts.correct,0);assert.strictEqual(state.toneCounts.wrong,0);
});

let nowMs=0,nextId=0,frames=new Map(),timers=new Map(),timingListener=null,visibilityListener=null;
const calls=[],fakePlayer={prepare:values=>{calls.push(['prepare',values]);return Promise.resolve(true);},
  play:value=>{calls.push(['play',value]);return {value};},stop:handle=>calls.push(['stop',handle.value]),stopAll:()=>calls.push(['stopAll'])};
const fakeSync={resume:()=>Promise.resolve(true),getContext:()=>null,getDelayMs:()=>0,getSettings:()=>({feedbackSound:true})};
function mock(name,exports) {const filename=path.join(sourceRoot,'model',name+'.js');require.cache[filename]={id:filename,filename,loaded:true,exports};}
mock('WorkshopPianoAudio',{createWorkshopPianoPlayer:()=>fakePlayer});
mock('WorkshopPracticeMetronome',{createWorkshopPracticeMetronome:(timeline,options)=>{
  calls.push(['metronome-create',timeline,options]);
  return {start:(position,settings)=>calls.push(['metronome-start',position,settings]),
    update:(position,settings)=>calls.push(['metronome-update',position,settings]),
    stop:()=>calls.push(['metronome-stop']),destroy:()=>calls.push(['metronome-destroy'])};
}});
mock('AudioSynchronization',{__esModule:true,default:fakeSync});
mock('AudioSynchronizationPlayback',{watchAudioTimingChanges:listener=>{timingListener=listener;return()=>{timingListener=null;};}});
global.window={addEventListener() {},removeEventListener() {}};
global.document={hidden:false,addEventListener:(name,listener)=>{if(name==='visibilitychange')visibilityListener=listener;},removeEventListener:(name,listener)=>{if(listener===visibilityListener)visibilityListener=null;}};
global.requestAnimationFrame=fn=>{const id=++nextId;frames.set(id,fn);return id;};
global.cancelAnimationFrame=id=>frames.delete(id);
Object.defineProperty(global,'performance',{value:{now:()=>nowMs},configurable:true});
const originalTimeout=global.setTimeout,originalClear=global.clearTimeout;
global.setTimeout=(fn,delay)=>{const id=++nextId;timers.set(id,{fn,due:nowMs+delay});return id;};
global.clearTimeout=id=>timers.delete(id);
function component(name='WorkshopPractice') {
  const filename=path.join(sourceRoot,'components',name+'.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
  return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
}
const definition=component();
function fixture(source,connected=true) {
  nowMs=0;calls.length=0;document.hidden=false;frames.clear();timers.clear();
  const view=new Vue(Object.assign({},definition,{propsData:{score:source},methods:Object.assign({},definition.methods,{$t:key=>key})}));
  view.$refs.listening={centerForPractice:()=>calls.push(['center']),exitFullscreen:()=>false};
  definition.mounted.call(view);view.handleMidiConnection(connected);return view;
}
async function flush() {await Promise.resolve();await Promise.resolve();}
function advanceTimers(ms) {
  const end=nowMs+ms;
  while(nowMs<end) {
    const due=Array.from(timers.values()).reduce((first,entry)=>Math.min(first,entry.due),Infinity);
    nowMs=Math.min(end,nowMs+16,due);
    for(const [id,entry] of Array.from(timers.entries())) if(entry.due<=nowMs) {timers.delete(id);entry.fn();}
    const pending=Array.from(frames.entries());
    for(const [id,frame] of pending) if(frames.delete(id)) frame(nowMs);
  }
}
async function play(view) {await view.toggle();if(view.preparing)advanceTimers(3000);await flush();}
function runClock(view,durationMs) {
  let remaining=durationMs;
  while(remaining>0) {
    const elapsed=Math.min(500,remaining),frame=Array.from(frames.entries())[0];
    assert(frame,'an active practice frame is scheduled');frames.delete(frame[0]);nowMs+=elapsed;frame[1](nowMs);remaining-=elapsed;
  }
}
function nodes(node) {return [node].concat(...(node.children || []).map(nodes));}
test('practice exposes only MIDI input and refuses to start or prepare sound without a connected device',async()=>{
  const view=fixture(score([note('a')]),false),rendered=nodes(view._render());
  const midi=rendered.find(node=>node.componentOptions && node.componentOptions.tag==='MidiInput');
  assert(midi,'MIDI input is always present');
  assert.strictEqual(midi.data.attrs.silent,true);
  assert(!rendered.some(node=>node.data && /practice-keyboard|practice-octave|piano-key/.test(node.data.staticClass || '')));
  const renderer=rendered.find(node=>node.componentOptions && node.componentOptions.tag==='WorkshopListening');
  assert.strictEqual(renderer.data.attrs['play-disabled'],true);assert.strictEqual(renderer.data.ref,'listening');
  const connection=renderer.componentOptions.children.find(node=>node.componentOptions && node.componentOptions.tag==='MidiConnectionStatus');
  assert(connection);assert.strictEqual(connection.data.slot,'connection-status');assert.strictEqual(connection.data.attrs.connected,false);
  assert(!rendered.some(node=>node.data && node.data.staticClass==='practice-status'));
  await view.toggle();view.press(48);assert(!view.playing);assert.strictEqual(calls.length,0);
  midi.componentOptions.listeners['connection-change'](true);await play(view);assert(view.playing);view.$destroy();
});
test('MIDI practice never auto-plays targets and collects an exact chord across played octaves',async()=>{
  const view=fixture(score([note('low',36),note('middle',48)]));
  await play(view);assert(view.playing);
  assert(!calls.some(call=>call[0]==='play'),'starting only prepares samples');
  const midi=nodes(view._render()).find(node=>node.componentOptions && node.componentOptions.tag==='MidiInput');
  midi.componentOptions.listeners.solved(36);await flush();assert.deepStrictEqual(view.practice.pendingValues,[36]);
  midi.componentOptions.listeners.solved(48);await flush();assert.strictEqual(view.practice.correctCount,1);
  assert.deepStrictEqual(calls.filter(call=>call[0]==='play').map(call=>call[1]),[36,48]);
  assert(frames.size);assert(timers.size);view.$destroy();assert.strictEqual(frames.size,0);assert.strictEqual(timers.size,0);
  assert.strictEqual(visibilityListener,null);assert.strictEqual(timingListener,null);
});
test('MIDI disconnection pauses time, ignores late input, releases sound, and requires explicit resume after reconnection',async()=>{
  const view=fixture(score([note('a',48),note('b',52,2)]));await play(view);view.press(48);await flush();
  nowMs+=500;view.updateClock();const position=view.practice.positionMs;
  view.handleMidiConnection(false);assert.strictEqual(view.practice.status,'paused');assert.strictEqual(frames.size,0);
  view.press(52);await view.toggle();assert.strictEqual(view.practice.positionMs,position);assert.strictEqual(view.practice.correctCount,1);
  assert(calls.some(call=>call[0]==='stopAll'));view.handleMidiConnection(true);assert(!view.playing);
  await play(view);assert(view.playing);view.$destroy();
});
test('visibility and audio timing changes pause practice and release pressed sound and frame callbacks',async()=>{
  const view=fixture(score([note('a',48),note('b',52,2)]));await play(view);view.press(48);await flush();
  document.hidden=true;visibilityListener();assert.strictEqual(view.practice.status,'paused');assert.strictEqual(frames.size,0);
  assert(calls.some(call=>call[0]==='stopAll'));document.hidden=false;await play(view);assert(view.playing);
  timingListener();assert.strictEqual(view.practice.status,'paused');assert.strictEqual(frames.size,0);view.$destroy();
});
test('restart and drag resume include preparation while stalled frames pause and back opens the round result',async()=>{
  const view=fixture(score([note('a',48),note('b',52,2)])),emitted=[];
  view.$on('back',()=>emitted.push(['back']));
  await play(view);view.press(48);assert.strictEqual(view.practice.correctCount,1);
  view.seek(0);assert.strictEqual(view.practice.correctCount,0);assert(!view.playing);
  await flush();await flush();assert.strictEqual(view.preparing,true);advanceTimers(3000);assert.strictEqual(view.practice.status,'waiting');
  view.scrubStart();assert.strictEqual(view.practice.status,'paused');view.scrubEnd({position:1000,resume:true});await flush();await flush();
  assert.strictEqual(view.preparing,true);assert(!view.playing);advanceTimers(3000);
  assert.strictEqual(view.practice.status,'waiting');assert.strictEqual(view.practice.targetIndex,1);
  nowMs+=2000;view.updateClock(nowMs);assert.strictEqual(view.practice.status,'paused','stalled frames freeze the round');
  view.back();assert(view.roundResult);assert.deepStrictEqual(emitted,[]);
  view.back();assert.deepStrictEqual(emitted,[['back']]);view.$destroy();
});
test('destroying while sound preparation is pending prevents late starts and samples',async()=>{
  const view=fixture(score([note('a')]));let release;
  fakeSync.resume=()=>new Promise(resolve=>{release=resolve;});const pending=view.toggle();view.$destroy();release(true);await pending;
  assert.strictEqual(frames.size,0);assert(!calls.some(call=>call[0]==='play'));assert(!view.playing);
  fakeSync.resume=()=>Promise.resolve(true);
});
test('MIDI disconnect during audio preparation cancels the pending start',async()=>{
  const view=fixture(score([note('a')]));let release;
  fakeSync.resume=()=>new Promise(resolve=>{release=resolve;});const pending=view.toggle();
  view.handleMidiConnection(false);release(true);await pending;
  assert(!view.playing);assert.strictEqual(view.audioStarting,false);assert.strictEqual(frames.size,0);
  assert(!calls.some(call=>call[0]==='prepare'));view.$destroy();fakeSync.resume=()=>Promise.resolve(true);
});
test('assessment credits a completed grip once while pause, seek and reset add no historical counts',async()=>{
  const view=fixture(score([note('c',48),note('e',52)])),deltas=[];
  view.$on('assessment',delta=>deltas.push(delta));await play(view);view.press(48);
  assert.strictEqual(deltas.length,0);view.press(48);assert.strictEqual(deltas.length,0);
  view.press(49);assert.strictEqual(deltas.length,1);assert.strictEqual(deltas[0].wrong,1);
  view.press(52);assert.strictEqual(deltas.length,2);assert.strictEqual(deltas[1].correct,2);
  assert.strictEqual(deltas[1].learnedNoteKeys.length,2);
  view.pause();await play(view);assert.strictEqual(deltas.length,2);
  const previous=view.practice;view.applyState(previous);assert.strictEqual(deltas.length,2);
  view.seek(0);assert.strictEqual(deltas.length,2);await flush();await flush();advanceTimers(3000);
  view.release(48);view.release(52);view.press(48);assert.strictEqual(deltas.length,2);
  view.press(52);assert.strictEqual(deltas.length,3,'only a newly completed physical grip is a new assessment');
  view.$destroy();
});
test('start and resume center the score after readiness, while canceled starts and pause never center',async()=>{
  const view=fixture(score([note('a')]));await play(view);await flush();
  assert.strictEqual(calls.filter(call=>call[0]==='center').length,1);
  view.pause();await flush();assert.strictEqual(calls.filter(call=>call[0]==='center').length,1);
  await play(view);await flush();assert.strictEqual(calls.filter(call=>call[0]==='center').length,2);
  view.pause();view.handleMidiConnection(false);await view.toggle();await flush();assert.strictEqual(calls.filter(call=>call[0]==='center').length,2);
  view.$destroy();
});
test('MIDI response timing includes the final frame fraction before manual pause and excludes its wall-clock duration',async()=>{
  const view=fixture(score([note('a')])),deltas=[];view.$on('assessment',delta=>deltas.push(delta));await play(view);
  nowMs+=495;view.pause();assert.strictEqual(view.practice.activeMs,495);
  nowMs+=10000;await play(view);nowMs+=10;view.press(48);
  assert.strictEqual(deltas.length,1);assert.strictEqual(deltas[0].late,1,'505ms of active response time is late');
  assert.strictEqual(deltas[0].wrong,0);assert.strictEqual(view.practice.activeMs,505);view.$destroy();
});
test('live tone judgements are hidden and the result shows individual categories rather than grouped chord success',async()=>{
  const view=fixture(score([note('c',48),note('e',52)]));await play(view);nowMs+=550;view.press(48);nowMs+=30;view.press(52);
  assert.strictEqual(view.practice.correctCount,1,'the existing grouped model counter remains compatible');
  function nodeText(node) {return (node.text || '')+(node.children || []).map(nodeText).join('');}
  const live=nodes(view._render());assert(!live.some(node=>node.data && /practice-counters|practice-feedback|practice-collected/.test(node.data.staticClass || '')));
  assert(!live.some(node=>node.data && /practice-status|practice-input|practice-help/.test(node.data.staticClass || '')));view.endRound();
  const rendered=nodes(view._render()),counter=rendered.find(node=>node.data && node.data.staticClass==='result-counts');
  const values=counter.children.filter(node=>node.tag==='div').map(node=>({
    count:Number(nodeText(node.children.find(child=>child.tag==='dd'))),
    label:nodeText(node.children.find(child=>child.tag==='dt'))
  }));
  assert.deepStrictEqual(values,[
    {count:0,label:'WORKSHOP_PRACTICE_STATS_CORRECT'},
    {count:0,label:'WORKSHOP_PRACTICE_STATS_EARLY'},
    {count:2,label:'WORKSHOP_PRACTICE_STATS_LATE'},
    {count:0,label:'WORKSHOP_PRACTICE_STATS_WRONG'},
    {count:0,label:'WORKSHOP_PRACTICE_STATS_MISSED'}
  ]);
  view.$destroy();
});

test('three seconds of preparation freeze the selected position and ignore MIDI before the actual start',async()=>{
  const view=fixture(score([note('a',48),note('b',52,2)])),deltas=[];
  view.$on('assessment',delta=>deltas.push(delta));view.seek(1000);await view.toggle();
  assert.strictEqual(view.preparing,true);assert(view.transportPlaying);assert(!view.playing);assert.strictEqual(view.practice.positionMs,1000);
  view.press(52);advanceTimers(1000);assert.strictEqual(view.preparing,true);
  view.press(52);advanceTimers(1999);view.press(52);view.updateClock();
  assert.strictEqual(view.preparing,true);assert(Math.abs(view.preparationRemaining-1/3000)<1e-9);assert.strictEqual(view.practice.activeMs,0);assert.strictEqual(deltas.length,0);
  assert(!calls.some(call=>call[0]==='play'));assert.strictEqual(frames.size,1,'a visual preparation frame is scheduled');
  advanceTimers(1);assert.strictEqual(view.preparing,false);assert(view.playing);assert(view.roundStarted);
  assert.strictEqual(view.practice.positionMs,1000);assert.strictEqual(view.practice.activeMs,0);
  view.press(52);assert.strictEqual(deltas.length,1);assert.strictEqual(deltas[0].correct,1);assert.strictEqual(deltas[0].late,0);
  assert.strictEqual(view.roundStartPosition,1000);view.$destroy();
});
test('audio readiness happens before the full preparation period and canceled sample loads cannot begin a preparation',async()=>{
  const previousPrepare=fakePlayer.prepare;
  try {
    let release;fakePlayer.prepare=()=>new Promise(resolve=>{release=resolve;});
    const view=fixture(score([note('a')]));const pending=view.toggle();await flush();
    assert(view.audioStarting);assert.strictEqual(view.preparing,false);nowMs=5000;release(true);await pending;
    assert.strictEqual(view.preparing,true);assert.strictEqual(view._preparationDeadline,8000);
    advanceTimers(2999);assert(!view.playing);advanceTimers(1);assert(view.playing);assert.strictEqual(view.practice.activeMs,0);view.$destroy();
    const canceled=fixture(score([note('b')]));const canceledStart=canceled.toggle();await flush();canceled.seek(1000);
    release(true);await canceledStart;advanceTimers(5000);assert(!canceled.playing);assert.strictEqual(canceled.preparing,false);assert.strictEqual(canceled.practice.positionMs,1000);canceled.$destroy();
  } finally {fakePlayer.prepare=previousPrepare;}
});
test('pause, seek, mode change, disconnect, background, timing changes and disposal cancel preparation without assessments',async()=>{
  const actions=[
    ['pause',view=>view.pause()],['seek',view=>view.seek(1000)],['mode',view=>view.changeBehavior('continuous')],
    ['disconnect',view=>view.handleMidiConnection(false)],['background',()=>{document.hidden=true;visibilityListener();}],
    ['audio timing',()=>timingListener()],['dispose',view=>view.$destroy()]
  ];
  for (const [name,action] of actions) {
    const view=fixture(score([note('a',48),note('b',52,2)])),deltas=[];view.$on('assessment',delta=>deltas.push(delta));
    await view.toggle();advanceTimers(1000);action(view);advanceTimers(5000);view.press(48);
    assert(!view.playing,name);assert.strictEqual(view.preparing,false,name);assert.strictEqual(view.practice.activeMs,0,name);
    assert.strictEqual(frames.size,0,name);assert.strictEqual(deltas.length,0,name);assert(!view.roundResult,name);
    if (name!=='dispose') view.$destroy();
  }
});
test('pressing transport pause during the preparation cancels it and an explicit resume gets another three seconds',async()=>{
  const view=fixture(score([note('a')]));await view.toggle();advanceTimers(1000);await view.toggle();
  assert.strictEqual(view.preparing,false);assert(!view.transportPlaying);advanceTimers(5000);assert(!view.playing);
  await view.toggle();assert.strictEqual(view.preparing,true);advanceTimers(3000);assert(view.playing);assert.strictEqual(view.practice.activeMs,0);view.$destroy();
});
test('small preparation frame jitter retains the audio deadline, while a suspended frame cancels the start',async()=>{
  const view=fixture(score([note('a')]));await view.toggle();advanceTimers(2990);
  const [id,frame]=Array.from(frames.entries())[0];frames.delete(id);nowMs=3040;frame(nowMs);
  assert(view.playing);assert.strictEqual(view._lastFrameAt,3000);view.press(48);
  assert.strictEqual(view.practice.activeMs,40);assert.strictEqual(view.practice.toneCounts.correct,1);view.$destroy();
  const stalled=fixture(score([note('b')]));await stalled.toggle();advanceTimers(2000);
  const [stalledId,stalledFrame]=Array.from(frames.entries())[0];frames.delete(stalledId);nowMs=3300;stalledFrame(nowMs);
  assert(!stalled.playing);assert.strictEqual(stalled.preparing,false);assert.strictEqual(stalled.practice.activeMs,0);
  assert.strictEqual(stalled.roundStarted,false);assert.strictEqual(stalled.practice.toneCounts.missed,0);stalled.$destroy();
});
test('the metronome starts before the preparation deadline with output delay and follows waiting, release and toggles',async()=>{
  const previousContext=fakeSync.getContext,previousDelay=fakeSync.getDelayMs;
  fakeSync.getContext=()=>({state:'running',currentTime:10+nowMs/1000});fakeSync.getDelayMs=()=>240;
  try {
    const view=fixture(score([note('a',48),note('b',52,2)]));assert.strictEqual(view.metronomeEnabled,false);
    await view.toggle();assert(!calls.some(call=>call[0]==='metronome-create'));
    advanceTimers(1000);view.toggleMetronome();
    const created=calls.find(call=>call[0]==='metronome-create'),started=calls.find(call=>call[0]==='metronome-start');
    assert.strictEqual(created[2].delayMs,240);assert.strictEqual(created[2].getVolume(),require('../src/model/Options').default.appVolume);
    assert.strictEqual(started[1],0);assert.strictEqual(started[2].audibleAtSeconds,13);assert.strictEqual(started[2].limitMs,0);
    advanceTimers(2000);assert(view.playing);
    assert(calls.some(call=>call[0]==='metronome-update' && call[1]===0 && call[2].waiting));
    view.press(48);assert(calls.some(call=>call[0]==='metronome-update' && !call[2].waiting && call[2].limitMs===1000));
    nowMs+=250;view.updateClock();const updates=calls.filter(call=>call[0]==='metronome-update');assert.strictEqual(updates[updates.length-1][1],250);
    view.toggleMetronome();assert.strictEqual(view.metronomeEnabled,false);assert(calls.some(call=>call[0]==='metronome-stop'));
    view.toggleMetronome();const starts=calls.filter(call=>call[0]==='metronome-start');assert.strictEqual(starts[starts.length-1][1],250);
    assert.strictEqual(starts[starts.length-1][2].audibleAtSeconds,13.25);view.pause();assert.strictEqual(view.practice.positionMs,250);view.$destroy();
  } finally {fakeSync.getContext=previousContext;fakeSync.getDelayMs=previousDelay;}
});
test('manual round results snapshot individual counts once and do not mark unfinished chords or later attacks missed',async()=>{
  const view=fixture(score([note('c',48),note('e',52),note('later',55,2)])),deltas=[];
  view.$on('assessment',delta=>deltas.push(delta));await play(view);view.press(48);view.press(49);
  assert.strictEqual(deltas.length,1);view.endRound();const result=view.roundResult;
  assert(result);assert.strictEqual(result.reason,'manual');assert(Object.isFrozen(result));assert(Object.isFrozen(result.counts));
  assert.deepStrictEqual(result.counts,{correct:0,early:0,late:0,wrong:1,missed:0});
  view.endRound();view.press(52);view.updateClock();assert.strictEqual(view.roundResult,result);assert.strictEqual(deltas.length,1);
  assert(!view.playing);assert.strictEqual(frames.size,0);view.$destroy();
});
test('the natural piece end opens results and saves only the original assessment deltas for partially missed chords',async()=>{
  const view=fixture(score([note('c',48),note('e',52),note('later',55,2)])),deltas=[];
  view.changeBehavior('continuous');view.$on('assessment',delta=>deltas.push(delta));await play(view);view.press(48);
  for(let index=0;index<8;index++){nowMs+=500;view.updateClock();}
  assert(view.roundResult);assert.strictEqual(view.roundResult.reason,'complete');assert.strictEqual(view.practice.status,'complete');
  assert.deepStrictEqual(view.roundResult.counts,{correct:0,early:0,late:0,wrong:0,missed:3});
  const totals=deltas.reduce((sum,delta)=>{Object.keys(sum).forEach(key=>sum[key]+=delta[key]);return sum;},{correct:0,early:0,late:0,wrong:0,missed:0});
  assert.deepStrictEqual(totals,view.roundResult.counts);const count=deltas.length;view.endRound();view.pause();assert.strictEqual(deltas.length,count);
  assert.strictEqual(frames.size,0);view.$destroy();
});
test('repeating starts from the chosen section with fresh counters and retained MIDI observation',async()=>{
  const view=fixture(score([note('a',48),note('b',52,2)])),deltas=[];
  view.$on('assessment',delta=>deltas.push(delta));view.seek(1000);await play(view);view.press(52);view.endRound();
  assert.strictEqual(view.roundResult.startPositionMs,1000);assert.strictEqual(deltas.length,1);
  const rendered=nodes(view._render());assert(rendered.some(node=>node.componentOptions && node.componentOptions.tag==='MidiInput'),'MIDI listener remains mounted behind result');
  view.repeatRound();await flush();await flush();assert.strictEqual(view.roundResult,null);assert.strictEqual(view.practice.positionMs,1000);
  assert.deepStrictEqual(view.practice.toneCounts,{correct:0,early:0,late:0,wrong:0,missed:0});assert.strictEqual(view.preparing,true);
  view.press(52);assert.strictEqual(deltas.length,1);advanceTimers(3000);view.press(52);assert.strictEqual(deltas.length,2);
  assert.strictEqual(deltas[1].correct,1);view.endRound();view.handleMidiConnection(false);view.repeatRound();await flush();assert(!view.playing);assert.strictEqual(view.preparing,false);view.$destroy();
});
test('back exits full screen first, then shows the begun round result, then leaves the practice session',async()=>{
  const view=fixture(score([note('a')])),emitted=[];let fullscreen=true;
  view.$refs.listening.exitFullscreen=()=>{const was=fullscreen;fullscreen=false;return was;};view.$on('back',()=>emitted.push('back'));
  await play(view);view.back();assert.strictEqual(fullscreen,false);assert(view.playing);assert(!view.roundResult);assert.strictEqual(emitted.length,0);
  view.back();assert(view.roundResult);assert(!view.playing);assert.strictEqual(emitted.length,0);
  view.back();assert.deepStrictEqual(emitted,['back']);view.$destroy();
  const unstarted=fixture(score([note('b')]));unstarted.$on('back',()=>emitted.push('unstarted'));await unstarted.toggle();unstarted.back();advanceTimers(4000);
  assert(!unstarted.roundResult);assert(!unstarted.playing);assert.deepStrictEqual(emitted,['back','unstarted']);unstarted.$destroy();
});

test('practice settings are passed into the listening disclosure and close only after audio readiness',async()=>{
  const previousPrepare=fakePlayer.prepare;
  try {
    let release;fakePlayer.prepare=()=>new Promise(resolve=>{release=resolve;});
    const view=fixture(score([note('a')]));assert.strictEqual(view.settingsOpen,true);
    const listening=nodes(view._render()).find(node=>node.componentOptions && node.componentOptions.tag==='WorkshopListening');
    assert.strictEqual(listening.data.attrs['settings-open'],true);assert.strictEqual(typeof listening.componentOptions.listeners['settings-toggle'],'function');
    const settings=listening.data.scopedSlots['practice-settings']({}).reduce((all,node)=>all.concat(nodes(node)),[]);
    assert(settings.some(node=>node.data && node.data.staticClass==='metronome-toggle'));
    assert(settings.some(node=>node.data && node.data.staticClass==='practice-tempo'));
    assert(settings.some(node=>node.data && node.data.staticClass==='practice-section'));
    const pending=view.toggle();await flush();assert(view.audioStarting);assert.strictEqual(view.settingsOpen,true);
    release(true);await pending;assert.strictEqual(view.settingsOpen,false);assert.strictEqual(view.preparing,true);
    advanceTimers(3000);view.pause();assert.strictEqual(view.settingsOpen,false,'pause alone does not reopen configuration');
    view.$destroy();
  } finally {fakePlayer.prepare=previousPrepare;}
});
test('reopening settings retains position and counters but requires a new physical grip',async()=>{
  const source=score([note('c',48),note('e',52),note('later',55,2)]),beforeScore=JSON.stringify(source),view=fixture(source),deltas=[];
  view.$on('assessment',delta=>deltas.push(delta));await play(view);view.press(48);
  const position=view.practice.positionMs,counts=Object.assign({},view.practice.toneCounts),pending=view.practice.pendingValues.slice(),results=view.practice.results.slice();
  const listening=nodes(view._render()).find(node=>node.componentOptions && node.componentOptions.tag==='WorkshopListening');
  listening.componentOptions.listeners['settings-toggle']();assert.strictEqual(view.settingsOpen,true);assert(!view.playing);
  assert.strictEqual(view.practice.status,'paused');assert.strictEqual(view.practice.positionMs,position);
  assert.deepStrictEqual(view.practice.pendingValues,[]);assert.deepStrictEqual(view.practice.results,results);assert.deepStrictEqual(view.practice.toneCounts,counts);
  assert.strictEqual(deltas.length,0);assert.strictEqual(JSON.stringify(source),beforeScore);assert.strictEqual(view.roundStarted,true);
  view.toggleSettings();assert.strictEqual(view.settingsOpen,false);assert(!view.playing);await view.toggle();assert.strictEqual(view.preparing,true);
  advanceTimers(3000);view.release(48);view.press(48);view.press(52);assert.strictEqual(view.practice.toneCounts.correct,2);assert.strictEqual(view.practice.toneCounts.late,0);view.$destroy();
});
test('opening settings cancels a preparation and pending audio start without seeking or starting a fresh round',async()=>{
  const view=fixture(score([note('a',48),note('b',52,2)]));view.seek(1000);await view.toggle();advanceTimers(1000);
  assert.strictEqual(view.settingsOpen,false);view.toggleSettings();assert.strictEqual(view.settingsOpen,true);
  assert.strictEqual(view.preparing,false);assert.strictEqual(view.practice.positionMs,1000);assert.strictEqual(view.practice.activeMs,0);
  advanceTimers(4000);assert(!view.playing);assert.strictEqual(view.roundStarted,false);view.$destroy();
  const previousResume=fakeSync.resume;
  try {
    let release;fakeSync.resume=()=>new Promise(resolve=>{release=resolve;});
    const loading=fixture(score([note('c')]));const pending=loading.toggle();assert(loading.audioStarting);
    loading.toggleSettings();assert.strictEqual(loading.settingsOpen,false);assert.strictEqual(loading.audioStarting,false);
    release(true);await pending;advanceTimers(4000);assert(!loading.playing);assert.strictEqual(loading.preparing,false);assert.strictEqual(loading.practice.positionMs,0);loading.$destroy();
  } finally {fakeSync.resume=previousResume;}
});
test('the silent MIDI listener stays present after results and no practice setup instructions occupy the game surface',async()=>{
  const view=fixture(score([note('a')]));
  for(const finished of [false,true]) {
    if(finished){await play(view);view.press(48);view.endRound();}
    const rendered=nodes(view._render()),midi=rendered.find(node=>node.componentOptions && node.componentOptions.tag==='MidiInput');
    assert(midi);assert.strictEqual(midi.data.attrs.silent,true);
    assert(!rendered.some(node=>node.tag==='details' || node.data && /practice-help|practice-status|practice-input/.test(node.data.staticClass || '')));
    midi.componentOptions.listeners['connection-change'](false);assert.strictEqual(view.midiConnected,false);
    midi.componentOptions.listeners['connection-change'](true);assert.strictEqual(view.midiConnected,true);
  }
  view.$destroy();
});

test('opening disconnected practice settings retries MIDI initialization once without altering the current section',async()=>{
  const view=fixture(score([note('a',48),note('b',52,2),note('c',55,4)])),deltas=[];let retries=0;
  view.$refs.midi={initMidi(){retries++;view.handleMidiConnection(false);}};
  view.$on('assessment',delta=>deltas.push(delta));view.seek(1000);await play(view);view.press(52);view.handleMidiConnection(false);
  const position=view.practice.positionMs,counts=Object.assign({},view.practice.toneCounts),results=view.practice.results.slice(),startPosition=view.roundStartPosition;
  view.toggleSettings();assert.strictEqual(view.settingsOpen,true);assert.strictEqual(retries,1);
  assert.strictEqual(view.practice.positionMs,position);assert.deepStrictEqual(view.practice.toneCounts,counts);assert.deepStrictEqual(view.practice.results,results);
  assert.strictEqual(view.roundStartPosition,startPosition);assert.strictEqual(deltas.length,1);assert(!view.playing);
  view.toggleSettings();assert.strictEqual(view.settingsOpen,false);assert.strictEqual(retries,1,'closing settings must not initialize MIDI');
  view.handleMidiConnection(true);view.toggleSettings();assert.strictEqual(view.settingsOpen,true);assert.strictEqual(retries,1,'a connected device must not be reinitialized');
  const midi=nodes(view._render()).find(node=>node.componentOptions && node.componentOptions.tag==='MidiInput');assert.strictEqual(midi.data.ref,'midi');assert.strictEqual(midi.data.attrs.silent,true);
  view.$destroy();
});

test('practice tempo changes pause, preserve musical position and scale every clock without changing the original score or re-emitting assessments',async()=>{
  const source=score([note('a',48),note('b',52,2)],2),original=JSON.stringify(source),view=fixture(source),deltas=[];
  view.$on('assessment',delta=>deltas.push(delta));view.changeBehavior('continuous');view.toggleMetronome();await play(view);
  view.press(48);await flush();runClock(view,500);const originalPlan=view.plan,originalPosition=view.practice.positionMs;
  assert(view._metronome);view.changeTempo(50);
  assert(!view.playing);assert.strictEqual(view.preparing,false);assert.strictEqual(view.audioStarting,false);
  assert.strictEqual(view.tempoPercent,50);assert.strictEqual(view.tempoDraft,50);assert.strictEqual(view.plan.tempoPercent,50);
  assert.strictEqual(view.practice.positionMs,originalPosition*2);assert.strictEqual(view.plan.durationMs,originalPlan.durationMs*2);
  for(const collection of ['events','measures','beats']) {
    assert.strictEqual(view.plan.timeline[collection].length,originalPlan.timeline[collection].length);
    view.plan.timeline[collection].forEach((item,index)=>{
      for(const key of ['startMs','endMs','durationMs']) if(Number.isFinite(originalPlan.timeline[collection][index][key])) {
        assert.strictEqual(item[key],originalPlan.timeline[collection][index][key]*2,collection+' '+key+' scales with the practice tempo');
      }
    });
  }
  assert.deepStrictEqual(view.plan.totalNoteKeys,originalPlan.totalNoteKeys);assert.strictEqual(JSON.stringify(source),original);
  assert.strictEqual(JSON.stringify(view.plan.score),JSON.stringify(originalPlan.score));assert.strictEqual(view._metronome,null);
  assert(calls.some(call=>call[0]==='metronome-destroy'));assert.strictEqual(deltas.length,1);assert.strictEqual(deltas[0].correct,1);
  view.changeTempo(100);assert.strictEqual(view.practice.positionMs,originalPosition);assert.strictEqual(deltas.length,1);
  view.$destroy();
});
test('section controls normalize crossed and out-of-bounds bar inputs and disabling the section disables its loop',()=>{
  const source=score([note('a')],5),original=JSON.stringify(source),view=fixture(source),deltas=[];
  view.$on('assessment',delta=>deltas.push(delta));view.changeSectionEnabled(true);
  assert.deepStrictEqual(view.plan.range,{startBar:0,endBar:3});view.changeSectionBar('start',3);view.changeSectionBar('end',4);
  assert.deepStrictEqual(view.plan.range,{startBar:2,endBar:3});assert.deepStrictEqual(view.plan.timeline.measures.map(bar=>bar.index),[2,3]);
  view.changeSectionBar('end',2);assert.strictEqual(view.sectionFrom,2);assert.strictEqual(view.sectionTo,2);assert.deepStrictEqual(view.plan.range,{startBar:1,endBar:1});
  view.changeSectionBar('start',5);assert.strictEqual(view.sectionFrom,5);assert.strictEqual(view.sectionTo,5);assert.deepStrictEqual(view.plan.range,{startBar:4,endBar:4});
  view.changeSectionBar('start',0);view.changeSectionBar('end',99);assert.deepStrictEqual(view.plan.range,{startBar:0,endBar:4});
  const validPlan=view.plan;view.changeSectionBar('start','');view.changeSectionBar('end','invalid');assert.strictEqual(view.plan,validPlan);
  view.changeLoop(true);assert.strictEqual(view.loopEnabled,true);view.changeSectionEnabled(false);
  assert.strictEqual(view.loopEnabled,false);assert.strictEqual(view.plan.range,null);assert.strictEqual(view.plan.timeline.measures.length,5);
  view.changeLoop(true);assert.strictEqual(view.loopEnabled,false);assert.strictEqual(deltas.length,0);assert.strictEqual(JSON.stringify(source),original);view.$destroy();
});
test('continuous section loops count completed passes once, prepare each pass and aggregate only newly emitted tone assessments',async()=>{
  const view=fixture(score([note('a')])),deltas=[];view.$on('assessment',delta=>deltas.push(delta));
  view.changeSectionEnabled(true);view.changeLoop(true);view.changeBehavior('continuous');await play(view);view.press(48);await flush();
  runClock(view,4000);await flush();await flush();assert.strictEqual(view.loopPass,2);assert.strictEqual(view.preparing,true);
  assert.strictEqual(view.roundStarted,true);assert.strictEqual(view.completedLoopCounts.correct,1);assert.strictEqual(view.completedLoopActiveMs,4000);
  assert(!view.roundResult);assert.strictEqual(view.practice.positionMs,0);assert.strictEqual(view.practice.activeMs,0);assert.strictEqual(deltas.length,1);
  view.press(48);assert.strictEqual(deltas.length,1,'next-pass preparation ignores MIDI input');advanceTimers(3000);
  view.press(49);view.press(48);view.endRound();assert.deepStrictEqual(view.roundResult.counts,{correct:2,early:0,late:0,wrong:1,missed:0});
  assert.strictEqual(view.roundResult.loopPass,2);assert.strictEqual(view.roundResult.durationMs,4000);assert.strictEqual(deltas.length,3);
  assert.deepStrictEqual(deltas.map(delta=>[delta.correct,delta.wrong]),[[1,0],[0,1],[1,0]]);
  view.endRound();assert.strictEqual(deltas.length,3);view.repeatRound();await flush();await flush();
  assert.strictEqual(view.roundResult,null);assert.strictEqual(view.loopPass,1);assert.strictEqual(view.completedLoopActiveMs,0);
  assert.deepStrictEqual(view.completedLoopCounts,{correct:0,early:0,late:0,wrong:0,missed:0});assert.strictEqual(view.preparing,true);assert.strictEqual(deltas.length,3);view.$destroy();
});
test('pausing or ending during the final frame fraction cannot start another loop, while an explicit resume starts the next pass',async()=>{
  for(const action of ['pause','endRound']) {
    const view=fixture(score([note('a')])),deltas=[];view.$on('assessment',delta=>deltas.push(delta));
    view.changeSectionEnabled(true);view.changeLoop(true);view.changeBehavior('continuous');await play(view);view.press(48);await flush();
    runClock(view,3500);nowMs+=500;view[action]();await flush();await flush();
    assert.strictEqual(view.practice.status,'complete');assert.strictEqual(view.loopPass,1);assert.strictEqual(view.preparing,false);
    assert.strictEqual(view.audioStarting,false);assert.strictEqual(frames.size,0);assert.strictEqual(deltas.length,1);
    assert.strictEqual(view.completedLoopCounts.correct,0);
    if(action==='pause') {
      assert.strictEqual(view.roundResult,null);await view.toggle();await flush();await flush();
      assert.strictEqual(view.loopPass,2);assert.strictEqual(view.preparing,true);assert.strictEqual(view.completedLoopCounts.correct,1);assert.strictEqual(deltas.length,1);
    } else {
      assert.strictEqual(view.roundResult.counts.correct,1);assert.strictEqual(view.roundResult.loopPass,1);advanceTimers(5000);assert.strictEqual(view.loopPass,1);
    }
    view.$destroy();
  }
});
test('ending while the next loop waits for audio readiness retains the prior pass result and cancels the delayed start',async()=>{
  const previousPrepare=fakePlayer.prepare;
  try {
    const view=fixture(score([note('a')])),deltas=[],backs=[];view.$on('assessment',delta=>deltas.push(delta));view.$on('back',()=>backs.push('back'));
    view.changeSectionEnabled(true);view.changeLoop(true);view.changeBehavior('continuous');await play(view);view.press(48);await flush();
    let release;fakePlayer.prepare=()=>new Promise(resolve=>{release=resolve;});runClock(view,4000);await flush();await flush();
    assert.strictEqual(view.loopPass,2);assert(view.audioStarting);assert.strictEqual(typeof release,'function');view.back();const result=view.roundResult;
    assert(result);assert.strictEqual(result.counts.correct,1);assert.strictEqual(result.counts.missed,0);assert.deepStrictEqual(backs,[]);
    release(true);await flush();await flush();advanceTimers(5000);assert.strictEqual(view.roundResult,result);assert.strictEqual(view.audioStarting,false);
    assert(!view.playing);assert.strictEqual(view.preparing,false);assert.strictEqual(frames.size,0);assert.strictEqual(deltas.length,1);view.$destroy();
  } finally {fakePlayer.prepare=previousPrepare;}
});
test('disconnecting, opening settings, hiding, changing tempo or bars and pausing safely cancel the next loop preparation without missed notes',async()=>{
  for(const action of ['disconnect','settings','background','tempo','range','pause']) {
    const source=score([note('a')],2);source.parts[0].measures[1].events=[note('b',52)];const view=fixture(source),deltas=[];
    view.$on('assessment',delta=>deltas.push(delta));view.changeSectionEnabled(true);view.changeSectionBar('end',1);view.changeLoop(true);view.changeBehavior('continuous');
    await play(view);view.press(48);await flush();runClock(view,4000);await flush();await flush();assert.strictEqual(view.preparing,true,action);
    advanceTimers(1000);
    if(action==='disconnect') view.handleMidiConnection(false);
    else if(action==='settings') view.toggleSettings();
    else if(action==='background') {document.hidden=true;visibilityListener();}
    else if(action==='tempo') view.changeTempo(50);
    else if(action==='range') view.changeSectionBar('end',2);
    else view.pause();
    const position=view.practice.positionMs;advanceTimers(10000);view.press(48);
    assert.strictEqual(view.preparing,false,action);assert.strictEqual(view.audioStarting,false,action);assert(!view.playing,action);
    assert.strictEqual(view.practice.positionMs,position,action);assert.strictEqual(view.practice.toneCounts.missed,0,action);
    assert.strictEqual(view.completedLoopCounts.missed,0,action);assert.strictEqual(deltas.length,1,action);assert.strictEqual(deltas[0].correct,1,action);
    assert.strictEqual(frames.size,0,action);view.$destroy();
  }
});
test('adjusting after the result reopens practice settings without autoplay, preserves the selected tempo and bars, and never repeats saved counts',async()=>{
  const source=score([],3);source.parts[0].measures[1].events=[note('a')];source.parts[0].measures[2].events=[note('b',52)];
  const view=fixture(source),deltas=[];view.$on('assessment',delta=>deltas.push(delta));
  view.changeTempo(50);view.changeSectionEnabled(true);view.changeSectionBar('start',2);view.changeSectionBar('end',3);view.changeLoop(true);view.seek(1000);
  await play(view);view.press(48);view.endRound();const position=view.roundResult.startPositionMs,counts=deltas.length;
  const resultNodes=nodes(view._render());assert(resultNodes.some(node=>node.data && node.data.staticClass==='result-tip'));
  assert(resultNodes.some(node=>node.tag==='button' && nodes(node).some(child=>child.text==='WORKSHOP_PRACTICE_SETTINGS')));
  view.adjustRound();assert.strictEqual(view.roundResult,null);assert.strictEqual(view.settingsOpen,true);assert.strictEqual(view.practice.positionMs,position);
  assert.strictEqual(view.tempoPercent,50);assert.deepStrictEqual(view.plan.range,{startBar:1,endBar:2});assert.strictEqual(view.loopEnabled,true);
  assert.strictEqual(view.roundStarted,false);assert.strictEqual(view.loopPass,1);assert.strictEqual(view.preparing,false);assert.strictEqual(view.audioStarting,false);
  advanceTimers(5000);assert(!view.playing);assert.strictEqual(deltas.length,counts);assert.strictEqual(view.practice.toneCounts.missed,0);view.$destroy();
});

test('the global preparation setting starts immediately or gives five unscored seconds and applies again on resume',async()=>{
  const options=require('../src/model/Options').default,previous=options.preparationSeconds;
  try {
    options.preparationSeconds=0;
    let view=fixture(score([note('instant',48)]));await view.toggle();
    assert(view.playing);assert(!view.preparing);assert.strictEqual(view.preparationRemaining,0);
    assert.strictEqual(view.practice.activeMs,0);view.press(48);assert.strictEqual(view.practice.toneCounts.correct,1);view.$destroy();
    options.preparationSeconds=5;
    view=fixture(score([note('five',48),note('next',52,2)]));await view.toggle();
    assert(view.preparing);assert.strictEqual(view.preparationRemaining,1);advanceTimers(2500);
    assert.strictEqual(view.preparationRemaining,.5);assert.strictEqual(view.practice.activeMs,0);
    view.press(49);assert.strictEqual(view.practice.toneCounts.wrong,0);
    options.preparationSeconds=0;advanceTimers(2499);assert(!view.playing);advanceTimers(1);assert(view.playing);
    assert.strictEqual(view.practice.activeMs,0);view.press(48);view.pause();const position=view.practice.positionMs;
    await view.toggle();assert(view.playing);assert(!view.preparing);assert.strictEqual(view.practice.positionMs,position);
    assert.strictEqual(view.practice.toneCounts.correct,1);view.$destroy();
  } finally {options.preparationSeconds=previous;}
});

test('in-piece hand changes cancel preparation, keep tempo and range, and assess only the chosen hand',async()=>{
  const source=model.setWorkshopSecondStaffEnabled(score([],3),true);
  source.parts[0].measures[1].events=[note('right',60)];
  source.parts[1].measures[1].events=[note('left',36)];
  const before=JSON.stringify(source),view=fixture(source),deltas=[];
  view.$on('assessment',delta=>deltas.push(delta));view.$on('hands-change',hands=>{view.hands=hands;});
  view.changeTempo(50);view.changeSectionEnabled(true);view.changeSectionRange({from:2,to:3});view.changeLoop(true);
  await view.toggle();assert(view.preparing);
  view.changeHands('left');assert(!view.preparing);assert(!view.audioStarting);
  await Vue.nextTick();assert.strictEqual(view.handMode,'left');
  assert.deepStrictEqual(view.plan.hands,{left:true,right:false});assert.deepStrictEqual(view.plan.targets[0].expectedValues,[36]);
  assert.strictEqual(view.tempoPercent,50);assert.deepStrictEqual(view.plan.range,{startBar:1,endBar:2});assert(view.loopEnabled);
  advanceTimers(5000);assert(!view.playing);assert.strictEqual(deltas.length,0);
  await play(view);view.press(36);assert.strictEqual(deltas[0].correct,1);view.changeHands('right');await Vue.nextTick();
  assert(!view.playing);assert.deepStrictEqual(view.plan.targets[0].expectedValues,[60]);assert.strictEqual(deltas.length,1);
  view.changeHands('both');await Vue.nextTick();assert.deepStrictEqual(view.plan.targets[0].expectedValues,[36,60]);
  assert.strictEqual(JSON.stringify(source),before);view.$destroy();
  const single=fixture(score([note('single')]));let changed=false;single.$on('hands-change',()=>{changed=true;});
  single.changeHands('left');single.changeHands('invalid');assert(!changed);single.$destroy();
});
test('graphical section boundaries use written bars once, span pages and filter miniature notes by hand',async()=>{
  const def=component('WorkshopPracticeRange');
  const source=model.setWorkshopSecondStaffEnabled(score([],19),true);
  source.parts[0].measures.forEach((bar,index)=>{bar.events=[note('r'+index,60+index%5)];});
  source.parts[1].measures.forEach((bar,index)=>{bar.events=[note('l'+index,36+index%5)];});
  source.parts.forEach(part=>{part.measures[0].repeatStart=true;part.measures[1].repeatEnd=2;});
  assert(model.isValidWorkshopScore(source));
  const before=JSON.stringify(source),view=new Vue(Object.assign({},def,{propsData:{score:source,hands:{left:true,right:true},from:1,to:4},methods:Object.assign({},def.methods,{$t:key=>key})}));
  const changes=[];view.$on('change',range=>{changes.push(range);view.from=range.from;view.to=range.to;});
  assert.strictEqual(view.writtenPlan.timeline.measures.length,19);assert.strictEqual(view.blocks.length,3);
  assert.strictEqual(nodes(view._render()).filter(node=>node.tag==='input').length,0);
  view.page=1;view.chooseBar(10);await Vue.nextTick();assert.deepStrictEqual(changes.pop(),{from:10,to:10});assert.strictEqual(view.boundary,'end');
  view.page=2;assert.deepStrictEqual(view.preview.bars.map(bar=>bar.number),[17,18,19]);
  view.chooseBar(18);await Vue.nextTick();assert.deepStrictEqual(changes.pop(),{from:10,to:18});
  view.selectBoundary('start');assert.strictEqual(view.page,1);view.chooseBar(12);await Vue.nextTick();assert.deepStrictEqual(changes.pop(),{from:12,to:18});
  view.page=2;view.chooseBlock();await Vue.nextTick();assert.deepStrictEqual(changes.pop(),{from:17,to:19});
  assert(view.preview.bars.every(bar=>bar.notes.some(note=>note.left) && bar.notes.some(note=>!note.left)));
  view.hands={left:true,right:false};await Vue.nextTick();assert(view.preview.bars.every(bar=>bar.notes.length===1 && bar.notes[0].left));
  view.selectBoundary('end');view.chooseBar(3);await Vue.nextTick();assert.deepStrictEqual(changes.pop(),{from:3,to:3});
  assert.strictEqual(JSON.stringify(source),before);view.$destroy();
});

(async()=>{
  try {for(const [name,run] of tests) {await run();process.stdout.write('✓ '+name+'\n');}}
  finally {global.setTimeout=originalTimeout;global.clearTimeout=originalClear;}
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
