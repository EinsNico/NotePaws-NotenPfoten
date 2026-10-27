const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
global.localStorage={getItem(){return null;},setItem(){throw new Error('No storage writes in candidate validation tests');}};
const root=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(root))return original(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
const model=require('../src/model/Workshop'),editing=require('../src/model/WorkshopScoreEditor'),xml=require('../src/model/WorkshopMusicXml');
const {validateWorkshopEditCandidate,validateWorkshopEventEdit}=require('../src/model/WorkshopEditValidation');
Module._extensions['.js']=original;
const cases=[];function test(name,body){cases.push([name,body]);}
function note(id,value,startSlot=0,extra={}){return Object.assign({id,kind:'note',pitch:model.workshopPitchFromValue(value),noteValue:'quarter',startSlot},extra);}
function score(value=48,count=1){const result=model.createWorkshopDraft('Candidate validation',count).score;result.parts[0].measures[0].events=[note('original',value)];return result;}
function expectAllowed(result){assert.strictEqual(result.error,null);assert(result.score);assert(model.isValidWorkshopScore(result.score));return result.score;}
function expectRange(result,value){assert.strictEqual(result.score,null);assert.strictEqual(result.error,'pitch-range');assert.strictEqual(result.soundingValue,value);assert.strictEqual(result.min,9);assert.strictEqual(result.max,96);}
function deepFreeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}

test('C1 all four locally valid input candidates are rejected before adopting the imported upper-bound score',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../docs/audits/editor-chaos-2026-10-07/fixtures/transpose-upper-bound.musicxml'),'utf8');
  const imported=xml.importWorkshopMusicXmlText(source).score;assert(model.isValidWorkshopScore(imported));
  const originalNote=imported.parts[0].measures[0].events.find(event=>event.kind==='note');
  assert.strictEqual(model.workshopPitchValue(originalNote.pitch),72);
  const before=JSON.stringify(imported),bar=model.resolveWorkshopMeasure(imported,0,0),pitch=model.workshopPitchFromValue(74);
  const altered=Object.assign({},originalNote,{pitch:Object.assign({},originalNote.pitch,{alter:1})});
  const candidates=[
    ['accidental',editing.replaceWorkshopEvents(bar,[altered]),97],
    ['insert',editing.placeWorkshopEvent(bar,2,note('new-note',74,2)),98],
    ['move-single',editing.moveWorkshopNote(bar,originalNote.id,0,pitch),98],
    ['move-group',editing.moveWorkshopNotes(bar,[originalNote.id],originalNote.id,0,pitch),98]
  ];
  for(const[name,events,value]of candidates){assert(events,name);assert(model.isValidWorkshopMeasure(Object.assign({},bar,{events})),name);expectRange(validateWorkshopEventEdit(imported,0,0,events),value);assert.strictEqual(JSON.stringify(imported),before);}
  const lower=editing.moveWorkshopNote(bar,originalNote.id,0,model.workshopPitchFromValue(71));
  const accepted=expectAllowed(validateWorkshopEventEdit(imported,0,0,lower));assert.strictEqual(model.workshopTimeline(accepted).events.find(event=>event.value!==null).value,95);
  assert.strictEqual(JSON.stringify(imported),before);
});

test('positive and negative chromatic, octave-change and clef contexts respect both inclusive limits and quarter tones',()=>{
  const contexts=[
    [{transpose:{chromatic:24,diatonic:14,octaveChange:0}},72,72.5,96,96.5],
    [{transpose:{chromatic:-24,diatonic:-14}},33,32.5,9,8.5],
    [{transpose:{chromatic:2,octaveChange:1},clefOctave:-1},94,94.5,96,96.5],
    [{transpose:{chromatic:-2,octaveChange:-1},clefOctave:1},11,10.5,9,8.5],
    [{clefOctave:2},72,73,96,97],
    [{clefOctave:-2},33,32,9,8]
  ];
  for(const[context,allowed,blocked,expectedAllowed,expectedBlocked]of contexts){
    const initial=score(allowed);Object.assign(initial.parts[0],context);assert(model.isValidWorkshopScore(initial));
    const good=expectAllowed(validateWorkshopEditCandidate(initial));assert.strictEqual(model.workshopTimeline(good).events.find(event=>event.value!==null).value,expectedAllowed);
    expectRange(validateWorkshopEventEdit(initial,0,0,[note('original',blocked)]),expectedBlocked);
  }
  for(const value of [9,9.5,95.5,96])expectAllowed(validateWorkshopEditCandidate(score(value)));
});

test('inherited measure and mid-measure contexts are checked at the candidate note position, including explicit resets',()=>{
  const initial=score(20,3),bars=initial.parts[0].measures;initial.parts[0].transpose={chromatic:12};
  bars[0].contextChanges=[{id:'negative-context',startSlot:2,transpose:{chromatic:-12}}];
  bars[1].events=[note('inherited',21)];bars[2].transpose={chromatic:0};bars[2].events=[note('reset',9)];
  assert(model.isValidWorkshopScore(initial));expectAllowed(validateWorkshopEditCandidate(initial));
  const before=JSON.stringify(initial);
  expectRange(validateWorkshopEventEdit(initial,0,0,[note('original',20,2)]),8);
  expectRange(validateWorkshopEventEdit(initial,1,0,[note('inherited',20)]),8);
  expectAllowed(validateWorkshopEventEdit(initial,2,0,[note('reset',9)]));
  const boundary=validateWorkshopEventEdit(initial,0,0,[note('original',21,2)]);expectAllowed(boundary);
  assert.strictEqual(model.workshopTimeline(boundary.score).events.find(event=>event.id==='original').value,9);
  assert.strictEqual(JSON.stringify(initial),before);
});

test('cross-staff notes use the displayed staff transposition and its octave line instead of the owning voice context',()=>{
  const initial=model.setWorkshopSecondStaffEnabled(score(72),true);
  initial.parts[0].transpose={chromatic:-24};initial.parts[0].measures[0].events[0].displayStaff=1;
  initial.parts[1].transpose={chromatic:12};initial.parts[1].measures[0].directions=[{id:'lower-octave',type:'octaveShift',startSlot:0,endSlot:2,value:1}];
  assert(model.isValidWorkshopScore(initial));expectAllowed(validateWorkshopEditCandidate(initial));
  const result=validateWorkshopEventEdit(initial,0,0,[note('original',73,0,{displayStaff:1})]);expectRange(result,97);assert.strictEqual(result.partIndex,0);
  expectAllowed(validateWorkshopEventEdit(initial,0,0,[note('original',73)]));
});

test('octave lines alone check their exact endpoints and multibar spans even without explicit transpose context',()=>{
  for(const[shift,allowed,blocked,expected]of [[1,84,84.5,96.5],[-1,21,20.5,8.5]]){
    const initial=score(allowed,2),bars=initial.parts[0].measures;
    bars[0].directions=[{id:'octave-line',type:'octaveShift',startSlot:0,endBarId:bars[1].id,endSlot:2,value:shift}];bars[1].events=[note('next',allowed)];
    expectAllowed(validateWorkshopEditCandidate(initial));expectRange(validateWorkshopEventEdit(initial,1,0,[note('next',blocked)]),expected);
    const outside=expectAllowed(validateWorkshopEventEdit(initial,1,0,[note('next',blocked,2)]));
    assert.strictEqual(model.workshopTimeline(outside).events.find(event=>event.id==='next').value,blocked);
  }
  const oldValidatorGap=score(85);oldValidatorGap.parts[0].measures[0].directions=[{id:'octave-only',type:'octaveShift',startSlot:0,endSlot:2,value:1}];
  expectRange(validateWorkshopEditCandidate(oldValidatorGap),97);
});

test('whole-score copy candidates cannot move an otherwise valid source note into an out-of-range octave span',()=>{
  const initial=score(48,3),bars=initial.parts[0].measures;
  bars[1].events=[note('target',48)];bars[2].events=[note('source',85,4)];
  bars[0].directions=[{id:'copy-octave',type:'octaveShift',startSlot:2,endBarId:bars[2].id,endSlot:2,value:1}];
  expectAllowed(validateWorkshopEditCandidate(initial));const before=JSON.stringify(initial);
  const candidate=model.cloneWorkshop(initial);candidate.parts[0].measures[1].events=[note('copied',85,4)];
  expectRange(validateWorkshopEditCandidate(candidate),97);assert.strictEqual(JSON.stringify(initial),before);
  candidate.parts[0].measures[1].events=[note('copied',84,4)];
  const accepted=expectAllowed(validateWorkshopEditCandidate(candidate));
  assert.strictEqual(model.workshopTimeline(accepted).events.find(event=>event.id==='copied').value,96);
  assert.strictEqual(JSON.stringify(initial),before);
});

test('grace notes and all stored staffs are checked, while pedal and ordinary rest annotations have no pitch',()=>{
  const initial=model.setWorkshopSecondStaffEnabled(score(72),true);initial.parts[1].enabled=false;initial.parts[0].transpose={chromatic:24};
  initial.parts[0].measures[0].events=[note('original',72,7.5,{grace:true,noteValue:'half',fingering:5,pedal:'down'}),{id:'rest',kind:'rest',pitch:null,noteValue:'quarter',startSlot:0,pedal:'up'}];
  expectAllowed(validateWorkshopEditCandidate(initial));expectRange(validateWorkshopEventEdit(initial,0,0,[note('original',73,7.5,{grace:true,noteValue:'half'})]),97);
  initial.parts[1].transpose={chromatic:-24};initial.parts[1].measures[0].events=[note('disabled-staff',33)];
  expectAllowed(validateWorkshopEditCandidate(initial));expectRange(validateWorkshopEventEdit(initial,0,1,[note('disabled-staff',32)]),8);
});

test('relationship repair allows valid pitch corrections and removes stale edges after note deletion without altering source data',()=>{
  const initial=score(48);initial.parts[0].measures[0].events=[note('original',48),note('tied',48,2)];
  initial.ties=[{fromId:'original',toId:'tied'}];initial.slurs=[{fromId:'original',toId:'tied'}];initial.glissandos=[{fromId:'original',toId:'tied',type:'glissando'}];
  assert(model.isValidWorkshopScore(initial));const before=JSON.stringify(initial);
  const events=[note('original',49),note('tied',48,2)],eventText=JSON.stringify(events);
  const repaired=expectAllowed(validateWorkshopEventEdit(initial,0,0,events));assert.strictEqual(repaired.ties,undefined);assert.strictEqual(repaired.slurs.length,1);assert.strictEqual(repaired.glissandos.length,1);
  const removed=expectAllowed(validateWorkshopEventEdit(initial,0,0,[note('original',48)]));assert.strictEqual(removed.ties,undefined);assert.strictEqual(removed.slurs,undefined);assert.strictEqual(removed.glissandos,undefined);
  assert.strictEqual(JSON.stringify(initial),before);assert.strictEqual(JSON.stringify(events),eventText);
  repaired.parts[0].measures[0].events[0].pitch.alter=2;assert.strictEqual(JSON.stringify(events),eventText);assert.strictEqual(JSON.stringify(initial),before);
});

test('valid tremolo repair runs before the score check when a removed endpoint restores ordinary note duration',()=>{
  const initial=score(48);initial.parts[0].measures[0].events=[note('original',48,0,{noteValue:'half',twoNoteTremolo:true}),note('other',52,2,{noteValue:'half',twoNoteTremolo:true})];
  initial.tremolos=[{fromId:'original',toId:'other',marks:3}];assert(model.isValidWorkshopScore(initial));const before=JSON.stringify(initial);
  const result=expectAllowed(validateWorkshopEventEdit(initial,0,0,[initial.parts[0].measures[0].events[0]]));
  assert.strictEqual(result.tremolos,undefined);assert.strictEqual(result.parts[0].measures[0].events[0].twoNoteTremolo,undefined);assert.strictEqual(result.parts[0].measures[0].events[0].noteValue,'quarter');assert.strictEqual(JSON.stringify(initial),before);
});

test('malformed scores, coordinates and event arrays fail safely with the general validation error',()=>{
  const valid=score(),before=JSON.stringify(valid);
  for(const candidate of [null,undefined,{},Object.assign({},valid,{meter:'invalid'}),Object.assign({},valid,{parts:[null]})])assert.strictEqual(validateWorkshopEditCandidate(candidate).error,'invalid-score');
  for(const args of [[-1,0,[]],[0,-1,[]],[10,0,[]],[0,10,[]],[.5,0,[]],[0,0,null]])assert.strictEqual(validateWorkshopEventEdit(valid,...args).error,'invalid-score');
  assert.strictEqual(validateWorkshopEventEdit(valid,0,0,[note('duplicate',48),note('duplicate',52,2)]).error,'invalid-score');
  assert.strictEqual(validateWorkshopEventEdit(valid,0,0,[{id:'malformed',kind:'note',pitch:{},noteValue:'quarter',startSlot:0}]).error,'invalid-score');
  assert.strictEqual(JSON.stringify(valid),before);
});

test('successful candidates are detached copies and preserve unrelated bars, metadata, source XML and annotations',()=>{
  const initial=score(72,2);initial.parts[0].transpose={chromatic:24};initial.metadata={composer:'Keep composer'};
  initial.musicXml={sourceXml:'<score-partwise/>',fingerprint:'keep-source',warnings:[]};initial.parts[0].measures[1].events=[note('other-bar',60,0,{fingering:2,lyric:'retain'})];
  const events=[note('original',71,0,{fingering:5,lyric:'edited'})],before=JSON.stringify(initial),eventText=JSON.stringify(events);deepFreeze(initial);deepFreeze(events);
  const result=expectAllowed(validateWorkshopEventEdit(initial,0,0,events));assert.notStrictEqual(result,initial);assert.notStrictEqual(result.parts[0].measures[0].events,events);
  assert.deepStrictEqual(result.parts[0].measures[1],initial.parts[0].measures[1]);assert.deepStrictEqual(result.metadata,initial.metadata);assert.deepStrictEqual(result.musicXml,initial.musicXml);
  assert.strictEqual(JSON.stringify(initial),before);assert.strictEqual(JSON.stringify(events),eventText);
});

for(const[name,body]of cases){body();process.stdout.write('✓ '+name+'\n');}process.stdout.write(cases.length+' workshop edit candidate checks passed.\n');
