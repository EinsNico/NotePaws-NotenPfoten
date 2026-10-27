const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>file.startsWith(sourceRoot)
  ? mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file)
  : original(mod,file);
const flow=require('../src/model/NoteFlowRhythmPractice'),chord=require('../src/model/NoteFlowChordRhythmPractice');
const timing=require('../src/model/PracticeTiming'),workshop=require('../src/model/WorkshopPractice'),model=require('../src/model/Workshop');
const compiler=require('vue-template-compiler');
let groups=0;
function test(name,run){run();groups++;console.log('✓ '+name);}
function timeline(values=[[48]],bpm=60){return {bpm,durationMs:4000,targets:values.map((expectedValues,i)=>({startMs:i*1000,startTick:i*384,expectedValues})),measures:[{endMs:1000,endTick:384}]};}
function start(values,bpm){return flow.advanceNoteFlowRhythmPractice(flow.startNoteFlowRhythmPractice(flow.createNoteFlowRhythmPractice(timeline(values,bpm),{inputMode:'midi'})),0);}
function press(s,value){return flow.submitNoteFlowRhythmPracticeInput(s,value,'midi');}
function note(id,value,startSlot=0){return {id,kind:'note',startSlot,noteValue:'quarter',pitch:model.workshopPitchFromValue(value)};}
function workshopStart(){const score=model.createWorkshopDraft('Synthetic timing',1).score;score.parts[0].measures[0].events=[note('c',48),note('g',55),note('next',55,2)];return workshop.startWorkshopPractice(workshop.createWorkshopPractice(workshop.createWorkshopPracticePlan(score)));}

test('wait mode stops the score while measuring real response time',()=>{
  let s=start();s=flow.advanceNoteFlowRhythmPractice(s,2000);
  assert.strictEqual(s.status,'waiting');assert.strictEqual(s.elapsedMs,0);assert.strictEqual(s.waitedMs,2000);
  s=press(s,48);assert.strictEqual(s.results[0],'late');assert.strictEqual(s.lateAttemptCount,1);
  assert.strictEqual(s.missedCount,0);assert.strictEqual(s.targetIndex,1);assert.strictEqual(s.totalAbsoluteTimingOffsetMs,2000);
});
test('generous tempo-dependent thresholds include their exact boundary',()=>{
  for(const [bpm,limit] of [[25,1000],[50,600],[60,500],[120,250]]){
    assert.strictEqual(timing.practiceWaitToleranceMs(60000/bpm),limit);
    let s=flow.advanceNoteFlowRhythmPractice(start(undefined,bpm),limit);s=press(s,48);assert.strictEqual(s.results[0],'correct');
    s=flow.advanceNoteFlowRhythmPractice(start(undefined,bpm),limit+1);s=press(s,48);assert.strictEqual(s.results[0],'late');
  }
});
test('frame overshoot is measured once, including a first frame longer than the piece',()=>{
  let s=flow.startNoteFlowRhythmPractice(flow.createNoteFlowRhythmPractice(timeline([[48]]),{inputMode:'midi'}));
  s=flow.advanceNoteFlowRhythmPractice(s,60000);assert.strictEqual(s.waitedMs,60000);assert.strictEqual(s.elapsedMs,0);
  s=press(s,48);assert.strictEqual(s.lateAttemptCount,1);assert.strictEqual(s.totalAbsoluteTimingOffsetMs,60000);
});
test('a completed grip is timed at its final currently held attack',()=>{
  let s=press(start([[48,55]]),48);s=flow.advanceNoteFlowRhythmPractice(s,1800);s=press(s,55);
  assert.strictEqual(s.targetIndex,1);assert.strictEqual(s.lateAttemptCount,1);assert.strictEqual(s.totalAbsoluteTimingOffsetMs,1800);
});
test('searching, wrong keys and releasing discovered notes do not restart the wait clock',()=>{
  let s=press(start([[48,55]]),48);s=flow.releaseNoteFlowRhythmPracticeInput(s,48);
  s=flow.advanceNoteFlowRhythmPractice(s,1200);s=press(s,49);s=press(s,55);assert.strictEqual(s.targetIndex,0);
  s=press(s,48);assert.strictEqual(s.lateAttemptCount,1);assert.strictEqual(s.wrongCount,2);
});
test('the next onset gets its own independent response window',()=>{
  let s=flow.advanceNoteFlowRhythmPractice(start([[48],[55]]),5000);s=press(s,48);
  assert.strictEqual(s.waitedMs,0);s=flow.advanceNoteFlowRhythmPractice(s,1000);s=press(s,55);
  assert.deepStrictEqual(s.results,['late','correct']);assert.strictEqual(s.lateAttemptCount,1);assert.strictEqual(s.preciseEventCount,1);
});
test('preparation and pause do not count, while active wait before pause remains',()=>{
  let s=flow.createNoteFlowRhythmPractice(timeline([[48]]),{inputMode:'midi'});
  assert.strictEqual(flow.advanceNoteFlowRhythmPractice(s,100000),s);
  s=flow.advanceNoteFlowRhythmPractice(flow.startNoteFlowRhythmPractice(s),200);
  s=flow.pauseNoteFlowRhythmPractice(s);assert.strictEqual(flow.advanceNoteFlowRhythmPractice(s,60000),s);
  s=flow.resumeNoteFlowRhythmPractice(s);s=flow.advanceNoteFlowRhythmPractice(s,300);s=press(s,48);assert.strictEqual(s.results[0],'correct');
});
test('pause does not erase already accumulated lateness',()=>{
  let s=flow.advanceNoteFlowRhythmPractice(start(),700);s=flow.pauseNoteFlowRhythmPractice(s);
  s=flow.resumeNoteFlowRhythmPractice(s);s=press(s,48);assert.strictEqual(s.results[0],'late');assert.strictEqual(s.totalAbsoluteTimingOffsetMs,700);
});
test('stream trimming preserves the response wait without carrying it to the next target',()=>{
  let s=press(start([[48],[55],[60]]),48);s=flow.advanceNoteFlowRhythmPractice(s,1000);s=flow.advanceNoteFlowRhythmPractice(s,900);
  const next=timeline([[55],[60]]);s=flow.rebaseNoteFlowRhythmPractice(s,next,1000);
  assert.strictEqual(s.elapsedMs,0);assert.strictEqual(s.waitedMs,900);s=press(s,55);
  assert.strictEqual(s.results[0],'late');assert.strictEqual(s.waitedMs,0);
});
test('continuous play keeps its existing timing and missed-note rules',()=>{
  let s=flow.startNoteFlowRhythmPractice(flow.createNoteFlowRhythmPractice(timeline([[48]]),{inputMode:'midi',behavior:'continuous'}));
  s=flow.advanceNoteFlowRhythmPractice(s,251);assert.strictEqual(s.missedCount,1);assert.strictEqual(s.waitedMs,0);
});
test('chords record a slow full grip as late and still advance exactly one target',()=>{
  const meter={signature:'4/4',durationTicks:384,pulseTicks:96};
  const score={meter,bpm:60,durationMs:4000,durationTicks:384,measures:[{index:0,events:[]}],targets:[{globalStartTick:0,startMs:0,endMs:1000,measureIndex:0,expectedValues:[48,55]}]};
  let s=chord.startNoteFlowChordRhythmPractice(chord.createNoteFlowChordRhythmPractice(score));
  s=chord.advanceNoteFlowChordRhythmPractice(s,0,0);s=chord.submitNoteFlowChordRhythmInput(s,48,0);
  s=chord.advanceNoteFlowChordRhythmPractice(s,2000,2000);s=chord.submitNoteFlowChordRhythmInput(s,55,2000);
  assert.strictEqual(s.practice.targetIndex,1);assert.strictEqual(s.practice.lateAttemptCount,1);assert.strictEqual(s.practice.missedCount,0);
});
test('workshop shares the wait tolerance but preserves independent tone timings',()=>{
  let s=workshopStart();assert.strictEqual(s.plan.targets[0].waitToleranceMs,500);
  s=workshop.advanceWorkshopPractice(s,400);s=workshop.submitWorkshopPracticeInput(s,48);s=workshop.submitWorkshopPracticeInput(s,55);
  assert.strictEqual(s.correctCount,1);assert.strictEqual(s.toneCounts.correct,2);assert.strictEqual(s.toneCounts.late,0);
  s=workshopStart();s=workshop.submitWorkshopPracticeInput(s,48);s=workshop.advanceWorkshopPractice(s,1200);s=workshop.submitWorkshopPracticeInput(s,55);
  assert.strictEqual(s.correctCount,1);assert.strictEqual(s.toneCounts.correct,1);assert.strictEqual(s.toneCounts.late,1);assert.strictEqual(s.missedCount,0);
});
test('workshop pause, tempo changes and selected practice tempo keep meaningful tolerances',()=>{
  let s=workshopStart();s=workshop.advanceWorkshopPractice(s,200);s=workshop.pauseWorkshopPractice(s);
  assert.strictEqual(workshop.advanceWorkshopPractice(s,100000),s);s=workshop.startWorkshopPractice(s);
  s=workshop.submitWorkshopPracticeInput(s,48);s=workshop.submitWorkshopPracticeInput(s,55);assert.strictEqual(s.toneCounts.correct,2);
  const score=model.createWorkshopDraft('Local tempo',1).score;score.parts[0].measures[0].events=[note('c',48)];
  score.parts[0].measures[0].directions=[{id:'tempo',type:'tempo',startSlot:0,value:120}];
  assert.strictEqual(workshop.createWorkshopPracticePlan(score).targets[0].waitToleranceMs,250);
  assert.strictEqual(workshop.createWorkshopPracticePlan(score,{tempoPercent:50}).targets[0].waitToleranceMs,500);
});
test('all changed live surfaces compile with the existing green/grey feedback',()=>{
  for(const name of ['NoteFlowRhythmPreview','NoteFlowChordTraining','NoteFlowChordRhythmStream']){
    const parsed=compiler.parseComponent(fs.readFileSync(path.join(sourceRoot,'components',name+'.vue'),'utf8'));
    assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[],name);
  }
});
console.log('All '+groups+' wait-mode timing groups passed.');
