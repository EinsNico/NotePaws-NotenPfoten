const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(sourceRoot))return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
const model=require('../src/model/Workshop'),practice=require('../src/model/WorkshopPractice');
const {createWorkshopPlayback}=require('../src/model/WorkshopPlayback');
const silent={play(){return null;},stopAll(){}};
const tests=[];function test(name,body){tests.push([name,body]);}
function note(id,value=48,startSlot=0,noteValue='quarter',extra={}){
  return Object.assign({id,kind:'note',startSlot,noteValue,pitch:model.workshopPitchFromValue(value)},extra);
}
function score(barCount=3){
  const value=model.createWorkshopDraft('Practice plan',barCount).score;
  value.parts[0].measures.forEach((bar,index)=>{bar.events=[note('right-'+index,48+index)];});
  return value;
}
function plan(value,options={}){assert(model.isValidWorkshopScore(value));return practice.createWorkshopPracticePlan(value,options);}
function near(actual,expected){assert(Math.abs(actual-expected)<1e-6,actual+' != '+expected);}
function checkScale(actual,original,factor){
  assert.strictEqual(actual.length,original.length);
  actual.forEach((entry,index)=>{
    const source=original[index];
    ['startMs','endMs','durationMs'].forEach(field=>{if(Number.isFinite(source[field]))near(entry[field],source[field]*factor);});
    ['id','index','barIndex','measureIndex','value','startSlot','units','meter','beatIndex','accent','tieFromId','tieToId'].forEach(field=>{
      if(Object.prototype.hasOwnProperty.call(source,field))assert.deepStrictEqual(entry[field],source[field],field);
    });
  });
}

test('default plans retain performed repeats and navigation with the original immutable score and timeline',()=>{
  const value=score(4);value.parts[0].measures[0].repeatStart=true;value.parts[0].measures[1].repeatEnd=2;
  value.parts[0].measures[2].navigation=['segno'];value.parts[0].measures[3].navigation=['ds'];
  const before=JSON.stringify(value),expected=createWorkshopPlayback(value,silent,{includeBeats:true}).getTimeline(),actual=plan(value);
  assert.deepStrictEqual(actual.timeline,expected);assert.strictEqual(actual.tempoPercent,100);assert.strictEqual(actual.range,null);
  assert(actual.timeline.measures.length>value.parts[0].measures.length);assert.strictEqual(JSON.stringify(value),before);
  assert.deepStrictEqual(actual.score,value);assert.notStrictEqual(actual.score,value);
  assert(Object.isFrozen(actual.score.parts[0].measures[0].events[0]));assert(Object.isFrozen(actual.timeline.beats));
});

test('practice percentages clamp safely while invalid input preserves the normal tempo',()=>{
  const value=score(1);
  for(const [input,expected] of [[undefined,100],[null,100],['',100],[NaN,100],[Infinity,100],[-Infinity,100],['invalid',100],[{},100],
    [0,25],[-10,25],[24,25],[25,25],[50.5,50.5],['75',75],[100,100],[175,100]]){
    const actual=plan(value,{tempoPercent:input});assert.strictEqual(actual.tempoPercent,expected,String(input));
    near(actual.durationMs,4000*100/expected);assert.strictEqual(actual.score.bpm,60);
  }
});

test('practice scaling covers note starts and lengths, measure boundaries, beats and full performance duration',()=>{
  const value=score(2);value.parts[0].measures[0].repeatStart=true;value.parts[0].measures[1].repeatEnd=2;
  value.parts[0].measures[0].events=[note('first',48,0),note('second',52,2)];
  const baseline=plan(value),before=JSON.stringify(value);
  for(const percent of [75,50,25]){
    const actual=plan(value,{tempoPercent:percent}),factor=100/percent;
    checkScale(actual.timeline.events,baseline.timeline.events,factor);checkScale(actual.timeline.measures,baseline.timeline.measures,factor);
    checkScale(actual.timeline.beats,baseline.timeline.beats,factor);near(actual.durationMs,baseline.durationMs*factor);
    actual.targets.forEach((target,index)=>{near(target.startMs,baseline.targets[index].startMs*factor);assert.deepStrictEqual(target.expectedValues,baseline.targets[index].expectedValues);});
    assert.deepStrictEqual(actual.totalNoteKeys,baseline.totalNoteKeys);assert.strictEqual(JSON.stringify(value),before);
    assert.strictEqual(actual.score.bpm,baseline.score.bpm);assert(Object.isFrozen(actual.timeline.events[0]));
  }
});

test('tempo changes, ramps, fermata and grace timing scale while written arpeggio chords stay together',()=>{
  const value=score(3);
  value.parts[0].measures[0].events=[note('held',48,0,'quarter',{fermata:2}),note('fast',52,2)];
  value.parts[0].measures[0].directions=[{id:'tempo-change',type:'tempo',startSlot:2,value:120}];
  value.parts[0].measures[1].events=[note('ramp-first',55),note('ramp-second',57,2),note('ramp-third',59,4),note('ramp-fourth',60,6)];
  value.parts[0].measures[1].directions=[{id:'slow-ramp',type:'tempoRamp',startSlot:0,endSlot:8,value:60}];
  value.parts[0].measures[2].events=[note('grace',60,0,'eighth',{grace:true}),note('rolled-low',60,0,'quarter',{arpeggio:'up'}),note('rolled-high',64,0,'quarter',{arpeggio:'up'})];
  const before=JSON.stringify(value),baseline=plan(value),slow=plan(value,{tempoPercent:50});
  checkScale(slow.timeline.events,baseline.timeline.events,2);checkScale(slow.timeline.measures,baseline.timeline.measures,2);
  checkScale(slow.timeline.beats,baseline.timeline.beats,2);near(slow.durationMs,baseline.durationMs*2);
  assert.strictEqual(JSON.stringify(value),before);assert.deepStrictEqual(slow.score.parts[0].measures[1].directions,value.parts[0].measures[1].directions);
  const firstBeat=slow.timeline.beats[0];assert.strictEqual(firstBeat.durationMs,4000);
  assert.strictEqual(slow.timeline.events.find(event=>event.id==='rolled-high').startMs,slow.timeline.events.find(event=>event.id==='rolled-low').startMs);
  assert(slow.targets.some(target=>target.eventIds.includes('rolled-low') && target.eventIds.includes('rolled-high')));
});

test('selected written bars run once in ascending order despite repeats and navigation and retain their source indices',()=>{
  const value=score(4);value.parts[0].measures[0].repeatStart=true;value.parts[0].measures[1].repeatEnd=2;
  value.parts[0].measures[2].navigation=['segno'];value.parts[0].measures[3].navigation=['ds'];
  const options={range:{startBar:1,endBar:3},tempoPercent:50},beforeOptions=JSON.stringify(options),beforeScore=JSON.stringify(value);
  const actual=plan(value,options);
  assert.deepStrictEqual(actual.range,{startBar:1,endBar:3});assert.deepStrictEqual(actual.timeline.measures.map(bar=>bar.index),[1,2,3]);
  assert.deepStrictEqual(actual.timeline.measures.map(bar=>bar.measureIndex),[0,1,2]);
  assert.deepStrictEqual(actual.targets.map(target=>target.eventIds),[['right-1'],['right-2'],['right-3']]);
  assert.deepStrictEqual(actual.targets.map(target=>[target.barIndex,target.measureIndex]),[[1,0],[2,1],[3,2]]);
  assert.deepStrictEqual(actual.timeline.measures.map(bar=>[bar.startMs,bar.endMs]),[[0,8000],[8000,16000],[16000,24000]]);
  assert.deepStrictEqual(actual.timeline.beats.filter(beat=>beat.accent).map(beat=>[beat.startMs,beat.barIndex,beat.measureIndex]),[[0,1,0],[8000,2,1],[16000,3,2]]);
  assert(actual.timeline.events.every(event=>event.barIndex>=1 && event.barIndex<=3 && event.measureIndex===event.barIndex-1));
  assert.strictEqual(JSON.stringify(value),beforeScore);assert.strictEqual(JSON.stringify(options),beforeOptions);assert(Object.isFrozen(actual.range));
  assert(!Object.isFrozen(options.range));assert.deepStrictEqual(actual.score,value);
});

test('range boundaries normalize to valid inclusive bars and an explicit whole-piece range still omits repeats',()=>{
  const value=score(3);value.parts[0].measures[0].repeatStart=true;value.parts[0].measures[1].repeatEnd=2;
  for(const [input,expected] of [
    [{startBar:-20,endBar:200},{startBar:0,endBar:2}],
    [{startBar:2,endBar:0},{startBar:0,endBar:2}],
    [{startBar:1.2,endBar:1.8},{startBar:1,endBar:2}],
    [{startBar:99,endBar:99},{startBar:2,endBar:2}],
    [{startBar:-9,endBar:-1},{startBar:0,endBar:0}]
  ]){
    const actual=plan(value,{range:input});assert.deepStrictEqual(actual.range,expected);
    assert.strictEqual(actual.timeline.measures.length,expected.endBar-expected.startBar+1);assert.strictEqual(actual.timeline.measures[0].startMs,0);
  }
  for(const invalid of [undefined,null,{},[],false,{startBar:0},{startBar:NaN,endBar:1},{startBar:0,endBar:Infinity}]){
    const actual=plan(value,{range:invalid});assert.strictEqual(actual.range,null);assert.strictEqual(actual.timeline.measures.length,5);
  }
  assert.strictEqual(plan(value,{range:{startBar:0,endBar:2}}).timeline.measures.length,3);
});

test('selection preserves inherited meter, key, clef, discrete tempo and a ramp begun before the section',()=>{
  const value=score(4);value.parts[0].measures[0].meter='3/4';value.parts[0].measures[0].clef='bass';value.parts[0].measures[0].keyId='D-major';
  value.parts[0].measures[0].directions=[{id:'prior-tempo',type:'tempo',startSlot:0,value:120}];
  value.parts[0].measures[1].directions=[{id:'cross-ramp',type:'tempoRamp',startSlot:0,endBarId:value.parts[0].measures[3].id,endSlot:6,value:60}];
  const full=model.workshopTimeline(value,{includeBeats:true}),actual=plan(value,{range:{startBar:2,endBar:3},tempoPercent:50}),origin=full.measures[2].startMs;
  actual.timeline.measures.forEach((measure,index)=>{
    const original=full.measures[index+2];near(measure.startMs,(original.startMs-origin)*2);near(measure.endMs,(original.endMs-origin)*2);
    assert.strictEqual(measure.meter,'3/4');assert.strictEqual(measure.clef,'bass');assert.strictEqual(measure.keyId,'D-major');
  });
  const originals=full.beats.filter(beat=>beat.barIndex>=2);
  actual.timeline.beats.forEach((beat,index)=>near(beat.startMs,(originals[index].startMs-origin)*2));
  assert.strictEqual(actual.score.bpm,60);assert.deepStrictEqual(actual.score.parts[0].measures[1].directions,value.parts[0].measures[1].directions);
});

test('a tie entering the chosen section needs a fresh attack and never learns notes outside its boundaries',()=>{
  const value=score(3);value.parts[0].measures.forEach((bar,index)=>{bar.events=[note('tied-'+index,48,0,'whole')];});
  value.ties=[{fromId:'tied-0',toId:'tied-1'},{fromId:'tied-1',toId:'tied-2'}];
  const whole=plan(value),section=plan(value,{range:{startBar:1,endBar:2},tempoPercent:50}),firstOnly=plan(value,{range:{startBar:0,endBar:0}});
  assert.strictEqual(whole.targets.length,1);assert.strictEqual(whole.totalNoteKeys.length,3);
  assert.strictEqual(section.targets.length,1);assert.deepStrictEqual(section.targets[0].eventIds,['tied-1']);assert.strictEqual(section.targets[0].startMs,0);
  assert.strictEqual(section.totalNoteKeys.length,2);assert(section.totalNoteKeys.every(key=>!key.includes(':tied-0:')));
  let state=practice.startWorkshopPractice(practice.createWorkshopPractice(section));assert.strictEqual(state.status,'waiting');
  state=practice.submitWorkshopPracticeInput(state,48);assert.strictEqual(state.toneCounts.correct,1);
  assert.deepStrictEqual(state.assessmentDelta.learnedNoteKeys,section.totalNoteKeys);assert.strictEqual(state.assessmentDelta.learnedNoteKeys.length,2);
  assert.strictEqual(firstOnly.totalNoteKeys.length,1);assert(firstOnly.totalNoteKeys[0].includes(':tied-0:'));
  assert.strictEqual(section.timeline.events.filter(event=>event.value!==null)[0].tieFromId,'tied-0','source tie metadata remains available to the notation');
});

test('hand ownership and written-note progress remain independent inside a selected section',()=>{
  let value=model.setWorkshopSecondStaffEnabled(score(3),true);
  value.parts[1].clef='treble';value.parts[1].measures.forEach((bar,index)=>{bar.events=[note('left-'+index,index===1?49:36+index)];});
  value.parts[0].measures[1].events[0].displayStaff=1;
  const options={range:{startBar:1,endBar:1},tempoPercent:25},both=plan(value,options),right=plan(value,Object.assign({},options,{hands:{left:false,right:true}})),left=plan(value,Object.assign({},options,{hands:{left:true,right:false}}));
  assert.deepStrictEqual(both.targets[0].expectedValues,[49]);assert.strictEqual(both.totalNoteKeys.length,2);
  assert.deepStrictEqual(right.targets[0].eventIds,['right-1']);assert.deepStrictEqual(left.targets[0].eventIds,['left-1']);
  assert.strictEqual(right.totalNoteKeys.length,1);assert.strictEqual(left.totalNoteKeys.length,1);assert.notStrictEqual(right.totalNoteKeys[0],left.totalNoteKeys[0]);
  assert.strictEqual(both.durationMs,16000);assert.strictEqual(right.durationMs,left.durationMs);
  const state=practice.submitWorkshopPracticeInput(practice.startWorkshopPractice(practice.createWorkshopPractice(both)),49);
  assert.strictEqual(state.toneCounts.correct,1);assert.strictEqual(state.assessmentDelta.learnedNoteKeys.length,2);
  value.parts[1].enabled=false;assert.strictEqual(plan(value,options).totalNoteKeys.length,1);
});

test('unsupported pitches outside the section do not leak warnings, targets or learning keys into practice',()=>{
  const value=score(3);value.parts[0].measures[0].events=[note('fractional',48.5),note('integer-chord',48)];
  value.parts[0].measures[2].events=[note('fractional-last',52.5)];
  const whole=plan(value),section=plan(value,{range:{startBar:1,endBar:1},tempoPercent:50});
  assert.strictEqual(whole.unsupportedTargets.length,2);assert.strictEqual(section.unsupportedTargets.length,0);
  assert.deepStrictEqual(section.targets[0].eventIds,['right-1']);assert.strictEqual(section.totalNoteKeys.length,1);
  assert(section.totalNoteKeys[0].includes(':right-1:'));assert.strictEqual(section.timeline.events.filter(event=>event.value!==null).length,1);
});

test('silent selected bars and pickups preserve their musical duration and beat phase',()=>{
  const value=score(3);value.pickupUnits=1;value.parts[0].measures[0].events=[note('pickup',48,0,'eighth')];
  value.parts[0].measures[1].meter='3/4';value.parts[0].measures[1].events=[];value.parts[0].measures[2].meter='6/8';value.parts[0].measures[2].events=[];
  const pickup=plan(value,{range:{startBar:0,endBar:0},tempoPercent:50}),silence=plan(value,{range:{startBar:1,endBar:2},tempoPercent:50});
  assert.strictEqual(pickup.durationMs,1000);assert.deepStrictEqual(pickup.timeline.beats,[]);
  assert.strictEqual(silence.targets.length,0);assert.strictEqual(silence.durationMs,12000);assert.deepStrictEqual(silence.totalNoteKeys,[]);
  assert.deepStrictEqual(silence.timeline.measures.map(measure=>measure.index),[1,2]);
  assert.deepStrictEqual(silence.timeline.beats.map(beat=>beat.startMs),[0,2000,4000,6000,9000]);
  assert.deepStrictEqual(silence.timeline.beats.filter(beat=>beat.accent).map(beat=>beat.startMs),[0,6000]);
});

test('slower selected practice still evaluates real input offsets without stretching the accepted timing window',()=>{
  const value=score(2);value.parts[0].measures[1].events=[note('later',52,2)];
  const section=plan(value,{range:{startBar:1,endBar:1},tempoPercent:50});assert.strictEqual(section.targets[0].startMs,2000);
  let state=practice.startWorkshopPractice(practice.createWorkshopPractice(section,{behavior:'continuous'}));
  state=practice.advanceWorkshopPractice(state,2110);state=practice.submitWorkshopPracticeInput(state,52);
  assert.strictEqual(state.toneCounts.late,1);assert.strictEqual(state.onTimeMs,100);assert.strictEqual(state.windowMs,250);
  assert.strictEqual(state.assessmentDelta.learnedNoteKeys.length,0);assert.strictEqual(state.plan.tempoPercent,50);
});

test('miniature bars retain selected written numbers and rebased seek times without changing learning data',()=>{
  const source=score(20),actual=plan(source,{range:{startBar:3,endBar:14},tempoPercent:50});
  const before=JSON.stringify(actual),first=practice.workshopPracticeSectionPreview(actual),second=practice.workshopPracticeSectionPreview(actual,1);
  assert.strictEqual(first.pageCount,2);assert.strictEqual(first.bars.length,8);
  assert.deepStrictEqual(first.bars.map(bar=>bar.number),[4,5,6,7,8,9,10,11]);
  assert.strictEqual(first.bars[0].startMs,0);assert.strictEqual(first.bars[1].startMs,8000);
  assert.deepStrictEqual(second.bars.map(bar=>bar.number),[12,13,14,15]);
  assert.strictEqual(practice.workshopPracticeSectionPreview(actual,999).page,1);
  assert.strictEqual(practice.workshopPracticeSectionPreview(actual,-1).page,0);
  assert(Object.isFrozen(first.bars[0].notes));assert.strictEqual(JSON.stringify(actual),before);
});
test('miniatures show only practiced hands, preserve silent bars and bound dense note drawings',()=>{
  const actual=plan(score(2)),left=Object.assign({},actual,{hands:{left:true,right:false}});
  assert(practice.workshopPracticeSectionPreview(left).bars.every(bar=>bar.notes.length===0));
  const events=Array.from({length:500},(_,index)=>({measureIndex:0,partIndex:0,value:36+index%60,startMs:index*5}));
  const dense=Object.assign({},actual,{timeline:Object.assign({},actual.timeline,{events})});
  const preview=practice.workshopPracticeSectionPreview(dense);
  assert(preview.bars[0].notes.length<=32);assert.strictEqual(preview.bars[0].noteCount,500);
  assert.strictEqual(preview.bars[1].notes.length,0);
  preview.bars[0].notes.forEach(note=>{assert(note.x>=7 && note.x<=81);assert(note.y>=8 && note.y<=32);});
});
for(const[name,body]of tests){body();console.log('PASS '+name);}
console.log('All '+tests.length+' workshop practice plan option checks passed.');
