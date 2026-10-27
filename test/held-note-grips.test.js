const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{
  if(!file.startsWith(sourceRoot))return original(mod,file);
  mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);
};
const held=require('../src/model/HeldNoteGrip'),flow=require('../src/model/NoteFlowRhythmPractice');
const chords=require('../src/model/NoteFlowChordRhythmPractice');
const workshop=require('../src/model/WorkshopPractice'),model=require('../src/model/Workshop');
const compiler=require('vue-template-compiler');
let groups=0;
function test(name,run){run();groups++;console.log('✓ '+name);}
function timeline(targets){return {bpm:60,durationMs:4000,targets:targets.map((values,i)=>({startMs:i*1000,expectedValues:values}))};}
function startFlow(targets){return flow.advanceNoteFlowRhythmPractice(flow.startNoteFlowRhythmPractice(flow.createNoteFlowRhythmPractice(timeline(targets),{inputMode:'midi'})),0);}
function down(s,v){return flow.submitNoteFlowRhythmPracticeInput(s,v,'midi');}
function up(s,v){return flow.releaseNoteFlowRhythmPracticeInput(s,v);}
function note(id,value,startSlot=0,noteValue='quarter'){return {id,kind:'note',startSlot,noteValue,pitch:model.workshopPitchFromValue(value)};}
function score(){const score=model.createWorkshopDraft('Synthetic held-grip test',2).score;
  score.parts[0].measures[0].events=[note('c',48),note('g',55),note('repeat-g',55,2)];return score;}
function startWorkshop(source=score()){return workshop.startWorkshopPractice(workshop.createWorkshopPractice(workshop.createWorkshopPracticePlan(source)));}

test('Normal → green → grey remembers the discovery but removes it from the grip',()=>{
  let s=startFlow([[48,55]]);s=down(s,48);
  assert.strictEqual(held.heldNoteGripColor(s.grip,48),'held');assert.strictEqual(held.heldNoteGripColor(s.grip,55),'');
  s=up(s,48);assert.deepStrictEqual(s.pendingValues,[]);assert.strictEqual(held.heldNoteGripColor(s.grip,48),'found');
  s=down(s,55);assert.strictEqual(s.targetIndex,0);assert.strictEqual(s.correctCount,0);
  assert.strictEqual(held.heldNoteGripColor(s.grip,48),'found');
  s=down(s,48);assert.strictEqual(s.correctCount,1);assert.strictEqual(s.targetIndex,1);
});
test('C + G followed by G needs a release and new G attack',()=>{
  let s=startFlow([[48,55],[55]]);s=down(down(s,48),55);
  s=flow.advanceNoteFlowRhythmPractice(s,1000);
  assert.strictEqual(s.targetIndex,1);assert.strictEqual(held.heldNoteGripColor(s.grip,55),'');
  const before=s;s=down(s,55);assert.strictEqual(s,before);assert.strictEqual(s.correctCount,1);
  s=up(s,55);s=down(s,55);assert.strictEqual(s.correctCount,2);
});
test('Repeated note-on messages never turn one physical press into multiple answers',()=>{
  let s=startFlow([[48],[48],[48]]);s=down(s,48);
  s=flow.advanceNoteFlowRhythmPractice(s,1000);
  for(let i=0;i<20;i++)s=down(s,48);
  assert.strictEqual(s.correctCount,1);assert.strictEqual(s.targetIndex,1);
  s=down(up(s,48),48);assert.strictEqual(s.correctCount,2);
});
test('An incorrect or premature held key cannot migrate into a later target',()=>{
  let s=startFlow([[48],[55]]);s=down(s,55);s=down(s,48);
  s=flow.advanceNoteFlowRhythmPractice(s,1000);s=down(s,55);assert.strictEqual(s.targetIndex,1);
  s=down(up(s,55),55);assert.strictEqual(s.targetIndex,2);
});
test('Octaves remain exact and a written unison needs one physical key',()=>{
  let s=startFlow([[48,48,60]]);s=down(s,48);assert.deepStrictEqual(s.pendingValues,[48,48]);
  s=down(s,72);assert.strictEqual(s.targetIndex,0);assert.strictEqual(s.wrongCount,1);
  s=down(s,60);assert.strictEqual(s.targetIndex,1);assert.strictEqual(s.correctCount,1);
});
test('Pause clears recognition without making held keys new attacks',()=>{
  let s=down(startFlow([[48,55]]),48);s=flow.pauseNoteFlowRhythmPractice(s);
  assert.deepStrictEqual(s.pendingValues,[]);s=flow.resumeNoteFlowRhythmPractice(s);
  s=down(s,55);s=down(s,48);assert.strictEqual(s.targetIndex,0);
  s=down(up(s,48),48);assert.strictEqual(s.targetIndex,1);
});
test('Release while paused prevents stuck green notes on resume',()=>{
  let s=down(startFlow([[48,55]]),48);s=flow.pauseNoteFlowRhythmPractice(s);s=up(s,48);
  s=flow.resumeNoteFlowRhythmPractice(s);s=down(down(s,55),48);assert.strictEqual(s.correctCount,1);
});
test('Continuous mode does not score sequential, released discoveries as a chord',()=>{
  let s=flow.startNoteFlowRhythmPractice(flow.createNoteFlowRhythmPractice(timeline([[48,55]]),{inputMode:'midi',behavior:'continuous'}));
  s=down(s,48);s=up(s,48);s=down(s,55);assert.strictEqual(s.correctCount,0);
  s=flow.advanceNoteFlowRhythmPractice(s,1000);assert.strictEqual(s.missedCount,1);
  assert.deepStrictEqual(s.grip.seenValues,[]);
});
test('A long wait retains the held grip and records its late completion',()=>{
  let s=down(startFlow([[48,55]]),48);
  s=flow.advanceNoteFlowRhythmPractice(s,60000);s=down(s,55);assert.strictEqual(s.targetIndex,1);assert.strictEqual(s.lateAttemptCount,1);assert.strictEqual(s.missedCount,0);
});
test('Workshop uses exactly the same held/grey/fresh-attack rules',()=>{
  let s=startWorkshop();s=workshop.submitWorkshopPracticeInput(s,48);
  assert.strictEqual(workshop.workshopPracticeNoteStates(s).c,'held');assert.strictEqual(s.toneCounts.correct,0);
  s=workshop.releaseWorkshopPracticeInput(s,48);assert.strictEqual(workshop.workshopPracticeNoteStates(s).c,'found');
  s=workshop.submitWorkshopPracticeInput(s,55);assert.strictEqual(s.targetIndex,0);assert.strictEqual(s.correctCount,0);
  s=workshop.submitWorkshopPracticeInput(s,48);assert.strictEqual(s.correctCount,1);assert.strictEqual(s.toneCounts.correct,2);
  s=workshop.advanceWorkshopPractice(s,1000);s=workshop.submitWorkshopPracticeInput(s,55);assert.strictEqual(s.targetIndex,1);
  s=workshop.releaseWorkshopPracticeInput(s,55);s=workshop.submitWorkshopPracticeInput(s,55);assert.strictEqual(s.correctCount,2);
});
test('Workshop does not award learned-note progress repeatedly for searching',()=>{
  let s=startWorkshop();for(let i=0;i<10;i++){s=workshop.submitWorkshopPracticeInput(s,48);s=workshop.releaseWorkshopPracticeInput(s,48);}
  assert.strictEqual(s.toneCounts.correct,0);assert.strictEqual(s.assessmentRevision,0);
  s=workshop.submitWorkshopPracticeInput(s,48);s=workshop.submitWorkshopPracticeInput(s,55);
  assert.strictEqual(s.toneCounts.correct,2);assert.strictEqual(s.assessmentDelta.learnedNoteKeys.length,2);
});
test('Wrong tones are still counted without erasing a genuinely held correct tone',()=>{
  let s=startWorkshop();s=workshop.submitWorkshopPracticeInput(s,48);s=workshop.submitWorkshopPracticeInput(s,49);
  assert.strictEqual(s.wrongCount,1);assert.deepStrictEqual(s.pendingValues,[48]);
  s=workshop.submitWorkshopPracticeInput(s,55);assert.strictEqual(s.correctCount,1);
});
test('Actual tied continuations remain exempt from a new attack; untied repeats do not',()=>{
  const source=score();source.parts[0].measures[0].events=[note('from',55,0,'whole')];
  source.parts[0].measures[1].events=[note('to',55,0,'half'),note('again',55,4,'half')];source.ties=[{fromId:'from',toId:'to'}];
  let s=startWorkshop(source);assert.deepStrictEqual(s.plan.targets.map(t=>t.eventIds),[['from'],['again']]);
  s=workshop.submitWorkshopPracticeInput(s,55);s=workshop.advanceWorkshopPractice(s,6000);
  s=workshop.submitWorkshopPracticeInput(s,55);assert.strictEqual(s.correctCount,1);
  s=workshop.releaseWorkshopPracticeInput(s,55);s=workshop.submitWorkshopPracticeInput(s,55);assert.strictEqual(s.correctCount,2);
});
test('Chord mode routes releases to the same core as melody mode',()=>{
  const meter={signature:'4/4',durationTicks:96,pulseTicks:24};
  const source={meter,bpm:60,durationMs:4000,durationTicks:96,measures:[{index:0,events:[]}],targets:[{globalStartTick:0,startMs:0,endMs:1000,measureIndex:0,expectedValues:[48,55]}]};
  let s=chords.startNoteFlowChordRhythmPractice(chords.createNoteFlowChordRhythmPractice(source));
  s=chords.submitNoteFlowChordRhythmInput(s,48,0);s=chords.releaseNoteFlowChordRhythmInput(s,48);
  s=chords.submitNoteFlowChordRhythmInput(s,55,100);assert.strictEqual(s.practice.targetIndex,0);
  s=chords.submitNoteFlowChordRhythmInput(s,48,200);assert.strictEqual(s.practice.correctCount,1);
});
test('Modified Vue surfaces compile and all active MIDI routes handle release events',()=>{
  for(const name of ['MidiInput','NoteFlowRhythmPreview','NoteFlowChordTraining','NoteFlowChordRhythmStream','WorkshopPractice','WorkshopListening','WorkshopStaff']){
    const parsed=compiler.parseComponent(fs.readFileSync(path.join(sourceRoot,'components',name+'.vue'),'utf8'));
    assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[],name);
    if(['NoteFlowRhythmPreview','NoteFlowChordTraining','WorkshopPractice'].includes(name))assert(parsed.template.content.includes('@released='),name);
  }
});
console.log('All '+groups+' held-grip regression groups passed.');
