const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('babel-core');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const sourceRoot = path.resolve(__dirname, '../src') + path.sep;
const originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, 'utf8'), {
    babelrc:false, presets:[['env', { modules:'commonjs' }]]
  }).code, filename);
};
const model = require('../src/model/Workshop');
const rhythm = require('../src/model/WorkshopRhythm');
const editor = require('../src/model/WorkshopScoreEditor');
const expression = require('../src/model/WorkshopExpression');
const tonalities = require('../src/model/NoteFlowTonality').NOTE_FLOW_TONALITIES;
Module._extensions['.js'] = originalLoader;
function test(name, callback) { callback(); process.stdout.write('✓ workshop composition model: ' + name + '\n'); }
function note(id, startSlot=0, noteValue='eighth', voice=1, value=48) {
  const event = { id, kind:'note', noteValue, startSlot, pitch:model.workshopPitchFromValue(value) };
  if (voice !== 1) event.voice = voice;
  return event;
}
function bar(events=[]) { return { id:'bar-test', events }; }
function eventsById(events) { return new Map(events.map(event => [event.id, event])); }
function stateByBarId(score) {
  const result = new Map();
  score.parts.forEach((part, p) => part.measures.forEach((measure, i) => result.set(measure.id, {
    context:model.workshopMeasureContext(score,i,p), events:measure.events
  })));
  return result;
}

test('the exact clock represents plain, dotted and triplet values exactly without changing legacy units', () => {
  assert.strictEqual(rhythm.WORKSHOP_SLOT_STEP,.5); assert.strictEqual(rhythm.WORKSHOP_FINE_SLOT_STEP,.25);
  assert.strictEqual(rhythm.WORKSHOP_TRIPLET_SLOT_STEP,1/12);
  for (const [value, ticks] of [['whole',64],['half',32],['quarter',16],['eighth',8],['sixteenth',4],['thirtysecond',2]]) {
    assert.strictEqual(rhythm.workshopTimeTicks(rhythm.workshopEventUnits({ noteValue:value,tuplet:3 })),ticks*rhythm.WORKSHOP_TICKS_PER_UNIT/12);
    if (value !== 'thirtysecond') assert.strictEqual(rhythm.workshopTimeTicks(rhythm.workshopEventUnits({ noteValue:value,tuplet:3,dots:1 })),ticks*1.5*rhythm.WORKSHOP_TICKS_PER_UNIT/12);
  }
  for (let tick=0;tick<=96;tick++) assert(rhythm.workshopTimeOnGrid(tick/12));
  for (const value of [-1,1/11,NaN,Infinity,'0']) assert(!rhythm.workshopTimeOnGrid(value));
  assert(rhythm.workshopTimeOnGrid(2/3 + Number.EPSILON));
  const saved = { noteValue:'sixteenth',tuplet:3,originalNoteValue:'quarter',originalDots:1 };
  assert.strictEqual(rhythm.workshopTimeTicks(rhythm.workshopRequestedUnits(saved)),2*rhythm.WORKSHOP_TICKS_PER_UNIT);
  assert.strictEqual(rhythm.workshopMeasureGridStep(bar([note('plain')])),.5);
  assert.strictEqual(rhythm.workshopMeasureGridStep(bar([Object.assign(note('tri'),{tuplet:3})])),1/12);
});

test('per-bar keys are shared and inherited while dynamics and clefs remain independent in both staves', () => {
  let score = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Contexts',5).score,true);
  score.parts[0].measures[0].events = [note('top')];
  score.parts[1].measures[0].events = [note('low',0,'whole',1,36)];
  const pitches = JSON.stringify(score.parts.map(part => part.measures.map(measure => measure.events)));
  for (const tonality of tonalities) {
    const keyChanged = model.setWorkshopMeasureContext(score,1,{keyId:tonality.id},1);
    assert(keyChanged);
    for (const p of [0,1]) {
      assert.strictEqual(model.workshopMeasureContext(keyChanged,0,p).keyId,'C-major');
      assert.strictEqual(model.workshopMeasureContext(keyChanged,4,p).keyId,tonality.id);
    }
    assert.strictEqual(JSON.stringify(keyChanged.parts.map(part => part.measures.map(measure => measure.events))),pitches);
  }
  score = model.setWorkshopMeasureContext(score,1,{keyId:'G-major',dynamic:'ff'});
  score = model.setWorkshopMeasureContext(score,3,{keyId:'D-major',dynamic:'p',clef:'treble'},1);
  assert.strictEqual(model.workshopMeasureContext(score,2,0).dynamic,'ff');
  assert.strictEqual(model.workshopMeasureContext(score,2,1).dynamic,'mf');
  assert.strictEqual(model.workshopMeasureContext(score,4,1).dynamic,'p');
  assert.strictEqual(model.workshopMeasureContext(score,4,0).dynamic,'ff');
  const reset = model.setWorkshopMeasureContext(score,3,{keyId:null},1);
  assert.strictEqual(model.workshopMeasureContext(reset,4,0).keyId,'G-major');
  assert.strictEqual(model.workshopMeasureContext(reset,4,1).keyId,'G-major');
  for (const value of ['constructor','toString','unknown',0,null]) {
    if (value === null) continue;
    assert.strictEqual(model.setWorkshopMeasureContext(score,1,{keyId:value}),null);
  }
  const independent = model.cloneWorkshop(score); independent.parts[1].measures[2].keyId = 'C-major';
  assert(model.isValidWorkshopScore(independent));
  assert.strictEqual(model.workshopMeasureContext(independent,2,0).keyId,'G-major');
  assert.strictEqual(model.workshopMeasureContext(independent,2,1).keyId,'C-major');
  assert.strictEqual(model.workshopMeasureContext(independent,4,1).keyId,'D-major');
  assert.strictEqual(JSON.stringify(independent.parts.map(part=>part.measures.map(measure=>measure.events))),pitches);
  const malformed=model.cloneWorkshop(independent);malformed.parts[1].measures[2].keyId='invalid-key';
  assert(!model.isValidWorkshopScore(malformed));
  const global = model.setWorkshopKey(score,'F-major');
  assert.strictEqual(model.workshopMeasureContext(global,0).keyId,'F-major');
  assert.strictEqual(model.workshopMeasureContext(global,4).keyId,'D-major');
  assert.strictEqual(JSON.stringify(global.parts.map(part => part.measures.map(measure => measure.events))),pitches);
});

test('changing the base key retains asymmetric imported boundaries and always returns a valid synchronized score', () => {
  for (const partIndex of [0,1]) for (const boundaryIndex of [0,1,3]) {
    const score = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Imported boundary',4).score,true);
    score.keyId = 'G-major';
    score.parts[partIndex].measures[boundaryIndex].keyId = 'G-major';
    score.parts[0].measures[0].events = [note('unchanged-upper',0,'quarter')];
    score.parts[1].measures[0].events = [note('unchanged-lower',0,'half',1,36)];
    if (partIndex === 1) score.parts[1].enabled = false;
    assert(model.isValidWorkshopScore(score));
    const before = JSON.stringify(score);
    assert.strictEqual(JSON.stringify(model.setWorkshopKey(score,'G-major')),before);
    const changed = model.setWorkshopKey(score,'F-major'); assert(changed);
    assert(model.isValidWorkshopScore(changed));
    for (let index=0;index<4;index++) for (const p of [0,1]) {
      assert.strictEqual(model.workshopMeasureContext(changed,index,p).keyId,index < boundaryIndex ? 'F-major' : 'G-major');
      assert.deepStrictEqual(changed.parts[p].measures[index].events,score.parts[p].measures[index].events);
    }
    assert.strictEqual(changed.parts[partIndex].measures[boundaryIndex].keyId,'G-major');
    assert.strictEqual(JSON.stringify(score),before);
    // The editor changes bar zero's signature by removing its explicit shared
    // boundary after changing the base; every later boundary still remains.
    if (boundaryIndex === 0) {
      const reset = model.setWorkshopMeasureContext(changed,0,{keyId:null}); assert(reset);
      assert(model.isValidWorkshopScore(reset));
      assert.strictEqual(model.workshopMeasureContext(reset,0,0).keyId,'F-major');
      assert.strictEqual(model.workshopMeasureContext(reset,0,1).keyId,'F-major');
    }
  }
});

test('bar insertion, deletion and every move preserve effective keys, dynamics, clefs and event identities', () => {
  let score = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Moving contexts',5).score,true);
  score = model.setWorkshopMeasureContext(score,1,{keyId:'G-major',dynamic:'p'});
  score = model.setWorkshopMeasureContext(score,3,{keyId:'D-major',dynamic:'ff'});
  score = model.setWorkshopMeasureContext(score,2,{dynamic:'pp',clef:'treble'},1);
  score.parts.forEach((part,p) => part.measures.forEach((measure,i) => { measure.events = [note('n-'+p+'-'+i,0,'eighth',1,48+p*12)]; }));
  const before = JSON.stringify(score), contexts = stateByBarId(score);
  for (let from=0;from<5;from++) for (let to=0;to<5;to++) {
    if (from===to) continue;
    const moved = model.moveWorkshopMeasure(score,from,to); assert(moved);
    for (const [id,state] of stateByBarId(moved)) assert.deepStrictEqual(state,contexts.get(id),id);
  }
  for (let index=0;index<5;index++) {
    const removed = model.removeWorkshopMeasure(score,index); assert(removed);
    for (const [id,state] of stateByBarId(removed)) assert.deepStrictEqual(state,contexts.get(id),id);
  }
  const inserted = model.insertWorkshopMeasures(score,2,200); assert(inserted);
  for (const [id,state] of stateByBarId(inserted)) if (contexts.has(id)) assert.deepStrictEqual(state,contexts.get(id),id);
  assert.strictEqual(model.workshopMeasureContext(inserted,202).keyId,'G-major');
  assert.strictEqual(JSON.stringify(score),before);
});

test('notes, rests, clipping, selection and beams operate within their own voice', () => {
  const bass = note('held',0,'whole',2,36), melody = [note('m1',0),note('m2',1),note('m3',2)];
  const measure = bar([bass].concat(melody));
  const events = editor.placeWorkshopEvent(measure,3,note('m4',3)); assert(events);
  assert.strictEqual(eventsById(events).get('held').noteValue,'whole');
  assert.deepStrictEqual(editor.workshopChordEvents({events},'m1').map(event=>event.id),['m1']);
  assert(editor.canJoinWorkshopNotes({events},['m1','m2','m3']));
  const beamed = editor.joinWorkshopNotes({events},['m1','m2','m3']); assert(beamed);
  assert(!eventsById(beamed).get('held').beamGroupId);
  const pause = {id:'voice-one-pause',kind:'rest',noteValue:'quarter',pitch:null,startSlot:4};
  const withPause = editor.placeWorkshopEvent({events:beamed},4,pause); assert(withPause);
  assert.strictEqual(eventsById(withPause).get('held').noteValue,'whole');
  const voice2pause = Object.assign({},pause,{id:'voice-two-pause',voice:2});
  assert.strictEqual(editor.placeWorkshopEvent({events:beamed},4,voice2pause),null);
  const timed = [note('a',0,'quarter'),note('b',0,'half',2),note('c',0,'eighth'),note('d',0,'quarter',2)];
  timed.forEach(event=>delete event.startSlot);
  assert.deepStrictEqual(model.workshopMeasureEvents({events:timed}).map(event=>event.startSlot),[0,0,2,4]);
  const clipped = editor.placeWorkshopEvent(bar([note('long',0,'whole'),bass]),2,note('next',2)); assert(clipped);
  assert.strictEqual(eventsById(clipped).get('long').noteValue,'quarter');
  assert.strictEqual(eventsById(clipped).get('held').noteValue,'whole');
});

test('three equal complete onsets become exact triplets and grouped movement retains their ratio and identity', () => {
  const notes = [note('t0',0),note('t1',1),note('t2',2)];
  const measure = bar(notes.concat(note('other-voice',0,'whole',2,36))), before=JSON.stringify(measure);
  assert(editor.canMakeWorkshopTriplet(measure,notes.map(event=>event.id)));
  const events = editor.makeWorkshopTriplet(measure,notes.map(event=>event.id)); assert(events);
  const byId=eventsById(events), group=byId.get('t0').tupletGroupId;
  assert(group); assert(notes.every(event=>byId.get(event.id).tupletGroupId===group));
  assert.deepStrictEqual(notes.map(event=>rhythm.workshopTimeTicks(byId.get(event.id).startSlot)),[0,8,16].map(tick=>tick*rhythm.WORKSHOP_TICKS_PER_UNIT/12));
  assert.strictEqual(model.workshopOccupiedSlots({events}),8);
  const moved = editor.moveWorkshopNotes({events},notes.map(event=>event.id),'t0',1/12,model.workshopPitchFromValue(50)); assert(moved);
  const movedById=eventsById(moved);
  assert.deepStrictEqual(notes.map(event=>rhythm.workshopTimeTicks(movedById.get(event.id).startSlot)),[1,9,17].map(tick=>tick*rhythm.WORKSHOP_TICKS_PER_UNIT/12));
  assert(notes.every(event=>movedById.get(event.id).tupletGroupId===group && movedById.get(event.id).tuplet===3));
  assert.deepStrictEqual(movedById.get('other-voice'),byId.get('other-voice'));
  const split = editor.splitWorkshopTriplets({events},['t1']); assert(split);
  const splitById=eventsById(split);
  assert.deepStrictEqual(notes.map(event=>splitById.get(event.id).startSlot),[0,1,2]);
  assert(notes.every(event=>!splitById.get(event.id).tuplet && !splitById.get(event.id).tupletGroupId));
  assert.strictEqual(JSON.stringify(measure),before);
});

test('triplet chords require complete same-voice tones and split or removal cannot erase other notes', () => {
  const notes = [0,1,2].reduce((all,start)=>all.concat([note('a'+start,start),note('b'+start,start,'eighth',1,52)]),[]);
  const measure=bar(notes), ids=notes.map(event=>event.id);
  assert.strictEqual(editor.makeWorkshopTriplet(measure,ids.slice(1)),null);
  const events=editor.makeWorkshopTriplet(measure,ids); assert(events);
  const removed=editor.removeWorkshopEvent({events},'a1'); assert(removed);
  const survivors=removed.filter(event=>event.kind==='note');
  assert.strictEqual(survivors.length,5); assert(survivors.every(event=>event.tuplet===3 && event.tupletGroupId));
  const missingOnset=editor.removeWorkshopEvent({events:removed},'b1'); assert(missingOnset);
  assert(missingOnset.filter(event=>event.kind==='note').every(event=>event.tuplet===3 && !event.tupletGroupId));
  const moved=editor.moveWorkshopNote({events},'a1',1,model.workshopPitchFromValue(55)); assert(moved);
  assert(moved.filter(event=>event.kind==='note').every(event=>event.tuplet===3 && !event.tupletGroupId));
  const blocker=note('block',2,'eighth');
  const blocked=bar(editor.makeWorkshopTriplet(bar([note('x',0),note('y',1),note('z',2)]),['x','y','z']).concat(blocker));
  const before=JSON.stringify(blocked);
  assert.strictEqual(editor.splitWorkshopTriplets(blocked,['x']),null);
  assert.strictEqual(JSON.stringify(blocked),before);
  const wrongVoice=bar([note('x',0),note('y',1),note('z',2,'eighth',2)]);
  assert.strictEqual(editor.makeWorkshopTriplet(wrongVoice,['x','y','z']),null);
  const different=bar([note('x',0),note('y',1,'sixteenth'),note('z',2)]);
  assert.strictEqual(editor.makeWorkshopTriplet(different,['x','y','z']),null);
});

test('triplet gaps, original values and tiny silent holes are covered without rounding or endless rest filling', () => {
  const held=Object.assign(note('held',0,'quarter'),{tuplet:3,dots:1});
  const short=Object.assign(note('short',2/3,'eighth'),{tuplet:3});
  const clipped=editor.placeWorkshopEvent(bar([held]),2/3,short); assert(clipped);
  const clippedHeld=eventsById(clipped).get('held');
  assert.strictEqual(rhythm.workshopTimeTicks(rhythm.workshopEventUnits(clippedHeld)),2*rhythm.WORKSHOP_TICKS_PER_UNIT/3);
  assert.strictEqual(clippedHeld.originalNoteValue,'quarter'); assert.strictEqual(clippedHeld.originalDots,1);
  const restored=editor.removeWorkshopEvent({events:clipped},'short'); assert(restored);
  assert.strictEqual(eventsById(restored).get('held').noteValue,'quarter');
  assert.strictEqual(eventsById(restored).get('held').dots,1); assert(!eventsById(restored).get('held').originalNoteValue);
  const tiny=editor.placeWorkshopEvent(bar(),1/12,Object.assign(note('tiny',1/12,'thirtysecond'),{tuplet:3})); assert(tiny);
  assert.strictEqual(tiny.filter(event=>event.kind==="note").length,1); assert(model.isValidWorkshopMeasure({events:tiny}));
  const score=model.createWorkshopDraft('Tiny gap').score; score.parts[0].measures[0].events=tiny;
  const timeline=model.workshopTimeline(score);
  assert.strictEqual(timeline.events.find(event=>event.id==='tiny').startMs,500/12);
  assert(Math.abs(timeline.events.find(event=>event.id==='tiny').durationMs-500/6)<1e-8);
  assert.strictEqual(timeline.events.filter(event=>event.value===null).reduce((sum,event)=>sum+event.durationMs,0),4000-500/6);
  assert.strictEqual(model.workshopOccupiedSlots({events:tiny}),1/6);
});

test('a pickup shortens the shared first bar, timeline and geometry while rejecting overflowing changes atomically', () => {
  let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Pickup',3).score,true);
  score.parts[0].measures[0].events=[note('up',0,'eighth')];
  score.parts[1].measures[0].events=[note('lower',.5,'sixteenth',1,36)];
  const pickup=model.setWorkshopPickup(score,1); assert(pickup);
  for(const p of [0,1]) {
    assert.strictEqual(model.workshopMeasureContext(pickup,0,p).units,1);
    assert.strictEqual(model.workshopMeasureUnitsLimit(model.resolveWorkshopMeasure(pickup,0,p)),1);
    assert(!Object.prototype.hasOwnProperty.call(pickup.parts[p].measures[0],'pickupUnits'));
  }
  const timeline=model.workshopTimeline(pickup);
  assert.deepStrictEqual(timeline.measures.map(measure=>[measure.startMs,measure.endMs]),[[0,500],[500,4500],[4500,8500]]);
  const geometry=editor.workshopStaffGeometry(1); assert(geometry);
  assert.strictEqual(editor.workshopSlotAtStaffX(geometry.left+(1-.5+.5)*geometry.unitWidth,1),.5);
  const before=JSON.stringify(pickup);
  assert.strictEqual(model.setWorkshopPickup(pickup,.5),null);
  assert.strictEqual(model.setWorkshopPickup(pickup,8),null);
  assert.strictEqual(model.setWorkshopPickup(pickup,1/11),null);
  assert.strictEqual(JSON.stringify(pickup),before);
  const expanded=model.setWorkshopPickup(pickup,null); assert(expanded); assert.strictEqual(model.workshopTimeline(expanded).durationMs,12000);
  score.parts[0].measures[1].events=[note('too-long',0,'half')];
  const shorter=model.setWorkshopPickup(score,1); assert(shorter);
  assert.strictEqual(model.removeWorkshopMeasure(shorter,0),null);
  assert.strictEqual(model.moveWorkshopMeasure(shorter,1,0),null);
  const prepended=model.insertWorkshopMeasures(shorter,-1); assert(prepended); assert.strictEqual(prepended.pickupUnits,1);
  assert.strictEqual(model.workshopMeasureContext(prepended,1).units,8);
});

test('a half note placed at 2.5 then moved to zero accepts a four-unit pickup despite its old generated pauses', () => {
  const late = note('moved-half',2.5,'half');
  const placed = editor.placeWorkshopEvent(bar(),2.5,late); assert(placed);
  const moved = editor.moveWorkshopNote({events:placed},late.id,0,late.pitch); assert(moved);
  assert(moved.some(event=>event.kind==='rest' && event.startSlot >= 4));
  const score=model.createWorkshopDraft('Shortened pickup').score;
  score.parts[0].measures[0].events=moved;
  const before=JSON.stringify(score), sounding=JSON.stringify(moved.filter(event=>event.kind==='note'));
  const pickup=model.setWorkshopPickup(score,4); assert(pickup);
  assert(model.isValidWorkshopScore(pickup));
  assert.strictEqual(JSON.stringify(pickup.parts[0].measures[0].events.filter(event=>event.kind==='note')),sounding);
  assert.strictEqual(model.workshopTimeline(pickup).durationMs,2000);
  assert(pickup.parts[0].measures[0].events.every(event=>rhythm.workshopTimeTicks(event.startSlot)+rhythm.workshopTimeTicks(rhythm.workshopEventUnits(event))<=4*rhythm.WORKSHOP_TICKS_PER_UNIT));
  assert.strictEqual(JSON.stringify(score),before);
  const withLateNote=model.cloneWorkshop(score);
  withLateNote.parts[0].measures[0].events.push(note('over-the-edge',4.5,'quarter'));
  const lateBefore=JSON.stringify(withLateNote);
  assert.strictEqual(model.setWorkshopPickup(withLateNote,4),null);
  assert.strictEqual(JSON.stringify(withLateNote),lateBefore);
  const first=model.saveWorkshopDraft(null,{pieceId:null,title:'Stored pickup',score},'2026-10-03T11:00:00.000Z');
  const oldRevision=JSON.stringify(first.piece.revisions[0]);
  const revision=model.openWorkshopPiece(first.piece); revision.score=pickup;
  const saved=model.saveWorkshopDraft(first.library,revision,'2026-10-03T11:01:00.000Z');
  assert.strictEqual(JSON.stringify(saved.piece.revisions[0]),oldRevision);
  assert.deepStrictEqual(model.openWorkshopPiece(saved.piece).score,pickup);
});

test('deliberate shorter limits trim all silent voices including hidden staves while preserving rest identities and legacy timing', () => {
  let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('All silent tails',2).score,true);
  score.parts[1].enabled=false;
  score.parts[0].measures[0].events=[note('upper-note',0,'quarter'),
    {id:'upper-rest',kind:'rest',noteValue:'whole',pitch:null,startSlot:0,voice:2,pedal:'down'}];
  score.parts[1].measures[0].events=[note('lower-note',0,'eighth',3,36),
    {id:'lower-rest',kind:'rest',noteValue:'half',pitch:null,startSlot:4,voice:4}];
  score.parts[0].measures[1].events=[{id:'inherited-rest',kind:'rest',noteValue:'whole',pitch:null,startSlot:0}];
  const before=JSON.stringify(score);
  const pickup=model.setWorkshopPickup(score,5.5); assert(pickup);
  const upper=pickup.parts[0].measures[0].events.filter(event=>event.kind==='rest');
  assert.strictEqual(upper[0].id,'upper-rest'); assert.strictEqual(upper[0].pedal,'down');
  assert.strictEqual(upper.reduce((sum,event)=>sum+rhythm.workshopEventUnits(event),0),5.5);
  assert(upper.every(event=>event.voice===2)); assert(upper.slice(1).every(event=>!event.pedal));
  const lower=pickup.parts[1].measures[0].events.find(event=>event.id==='lower-rest');
  assert(lower); assert.strictEqual(lower.startSlot,4); assert.strictEqual(lower.voice,4);
  assert.strictEqual(rhythm.workshopEventUnits(lower),1.5);
  assert.deepStrictEqual(pickup.parts[0].measures[1],score.parts[0].measures[1]);
  const meter=model.setWorkshopMeasureContext(score,0,{meter:'3/4'}); assert(meter);
  for(const p of [0,1]) for(const event of model.workshopMeasureEvents(meter.parts[p].measures[0])) {
    assert(rhythm.workshopTimeTicks(event.startSlot)+rhythm.workshopTimeTicks(rhythm.workshopEventUnits(event))<=6*rhythm.WORKSHOP_TICKS_PER_UNIT);
  }
  assert.strictEqual(model.workshopMeasureUnits(meter.parts[0].measures[1]),6);
  const stopped=model.cloneWorkshop(score); stopped.parts.forEach(part=>{part.measures[1].meter='4/4';});
  const stoppedShort=model.setWorkshopMeasureContext(stopped,0,{meter:'3/4'}); assert(stoppedShort);
  assert.deepStrictEqual(stoppedShort.parts[0].measures[1],stopped.parts[0].measures[1]);
  const hiddenTooLong=model.cloneWorkshop(score); hiddenTooLong.parts[1].measures[0].events.push(note('hidden-long',4.5,'quarter',2,36));
  const hiddenBefore=JSON.stringify(hiddenTooLong);
  assert.strictEqual(model.setWorkshopPickup(hiddenTooLong,4),null);
  assert.strictEqual(JSON.stringify(hiddenTooLong),hiddenBefore);
  assert.strictEqual(JSON.stringify(score),before);
  const legacy=model.createWorkshopDraft('Sequential pause').score;
  const oldNote=note('legacy-note',0,'quarter'); delete oldNote.startSlot;
  const pause={id:'legacy-rest',kind:'rest',noteValue:'half',pitch:null};
  legacy.parts[0].measures[0].events=[oldNote,pause];
  const legacyBefore=JSON.stringify(legacy);
  const shortened=model.setWorkshopPickup(legacy,5.5); assert(shortened);
  assert.deepStrictEqual(shortened.parts[0].measures[0].events[0],oldNote);
  assert.strictEqual(shortened.parts[0].measures[0].events[1].id,'legacy-rest');
  assert(shortened.parts[0].measures[0].events.every(event=>!Object.prototype.hasOwnProperty.call(event,'startSlot')));
  assert.strictEqual(model.workshopMeasureUnits(shortened.parts[0].measures[0]),5.5);
  assert.strictEqual(JSON.stringify(legacy),legacyBefore);
  const triplet=model.createWorkshopDraft('Fractional silence').score;
  triplet.parts[0].measures[0].events=[{id:'triplet-rest',kind:'rest',noteValue:'whole',pitch:null,startSlot:0,tuplet:3,voice:4}];
  const fractional=model.setWorkshopPickup(triplet,7/12); assert(fractional);
  assert.strictEqual(fractional.parts[0].measures[0].events[0].id,'triplet-rest');
  assert.strictEqual(rhythm.workshopTimeTicks(model.workshopMeasureUnits(fractional.parts[0].measures[0])),7*rhythm.WORKSHOP_TICKS_PER_UNIT/12);
  assert(fractional.parts[0].measures[0].events.every(event=>event.voice===4));
  const dense=model.createWorkshopDraft('Rest capacity').score;
  dense.parts[0].measures[0].events=Array.from({length:63},(_,i)=>note('dense-'+i)).concat({id:'dense-rest',kind:'rest',noteValue:'whole',pitch:null,startSlot:0});
  const denseShort=model.setWorkshopPickup(dense,7); assert(denseShort);
  assert.strictEqual(denseShort.parts[0].measures[0].events.filter(event=>event.kind==='note').length,63);
  assert.strictEqual(denseShort.parts[0].measures[0].events.length,64);
  assert(denseShort.parts[0].measures[0].events.some(event=>event.id==='dense-rest'));
  assert.strictEqual(model.workshopTimeline(denseShort).durationMs,3500);
});

test('single, implicit and nested repeats compile a bounded source-bar order and stay synchronized in hidden staves', () => {
  let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Repeats',4).score,true);
  assert.deepStrictEqual(model.workshopPlaybackBarOrder(score),[0,1,2,3]);
  score=model.setWorkshopMeasureRepeat(score,1,true,null); assert(score);
  assert.deepStrictEqual(model.workshopPlaybackBarOrder(score),[0,1,2,3]);
  score=model.setWorkshopMeasureRepeat(score,2,false,3); assert(score);
  assert.deepStrictEqual(model.workshopPlaybackBarOrder(score),[0,1,2,1,2,1,2,3]);
  score=model.setWorkshopMeasureRepeat(score,0,true,null);
  score=model.setWorkshopMeasureRepeat(score,3,false,2);
  assert.deepStrictEqual(model.workshopPlaybackBarOrder(score),[0,1,2,1,2,1,2,3,0,1,2,1,2,1,2,3]);
  score=model.setWorkshopSecondStaffEnabled(score,false); assert(score);
  for(let i=0;i<4;i++) assert.deepStrictEqual([score.parts[0].measures[i].repeatStart,score.parts[0].measures[i].repeatEnd],
    [score.parts[1].measures[i].repeatStart,score.parts[1].measures[i].repeatEnd]);
  let single=model.setWorkshopMeasureRepeat(model.createWorkshopDraft().score,0,true,8);
  assert.deepStrictEqual(model.workshopPlaybackBarOrder(single),Array(8).fill(0));
  let implicit=model.setWorkshopMeasureRepeat(model.createWorkshopDraft('',3).score,1,false,2);
  assert.deepStrictEqual(model.workshopPlaybackBarOrder(implicit),[0,1,0,1,2]);
  const maximum=model.setWorkshopMeasureRepeat(model.createWorkshopDraft('',1000).score,999,false,8); assert(maximum);
  assert.strictEqual(model.workshopPlaybackBarOrder(maximum).length,8000);
  const over=model.cloneWorkshop(maximum); over.parts[0].measures[998].repeatEnd=8;
  assert(!model.isValidWorkshopScore(over));
  assert.strictEqual(model.setWorkshopMeasureRepeat(maximum,998,false,8),null);
  for(const count of [1,9,2.5,'2']) assert.strictEqual(model.setWorkshopMeasureRepeat(single,0,false,count),null);
});

test('expression metadata is strict and inherited playback dynamics never transpose pitches or overwrite the app score', () => {
  let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Expression',2).score,true);
  const event=Object.assign(note('expressive',0,'quarter'),{articulations:['staccato','accent','tenuto'],fingering:5,pedal:'down'});
  score.parts[0].measures[0].events=[event]; score.parts[0].measures[1].events=[Object.assign(note('end',0),{pedal:'up'})];
  score=model.setWorkshopMeasureContext(score,0,{dynamic:'ff'});
  score=model.setWorkshopMeasureContext(score,1,{dynamic:'p'},1);
  score=expression.connectWorkshopSlur(score,['expressive','end']); assert(score);
  const before=JSON.stringify(score), timeline=model.workshopTimeline(score), scheduled=timeline.events.find(item=>item.id==='expressive');
  assert.deepStrictEqual(scheduled.articulations,event.articulations); assert.strictEqual(scheduled.fingering,5);
  assert.strictEqual(scheduled.dynamic,'ff'); assert.strictEqual(scheduled.pedal,'down'); assert.strictEqual(scheduled.value,48);
  assert.strictEqual(timeline.events.find(item=>item.id==='end').dynamic,'ff');
  assert.strictEqual(JSON.stringify(score),before);
  scheduled.articulations.pop(); assert.strictEqual(score.parts[0].measures[0].events[0].articulations.length,3);
  const badPatches=[{voice:0},{voice:5},{voice:1.5},{tuplet:2},{tupletGroupId:'orphan'},
    {articulations:['staccato','staccato']},{articulations:[]},{articulations:['legato']},{articulations:'accent'},
    {fingering:0},{fingering:6},{fingering:'3'},{pedal:true},{pedal:'hold'}];
  for(const patch of badPatches) assert(!model.isValidWorkshopMeasure(bar([Object.assign({},event,patch)])),JSON.stringify(patch));
  assert(!model.isValidWorkshopMeasure(bar(new Array(1))));
  const removed=model.removeWorkshopMeasure(score,1); assert(removed); assert(!removed.slurs);
});

test('new optional fields preserve schema one and earlier saved JSON while later composition revisions persist exactly', () => {
  const legacy=model.createWorkshopDraft('Legacy composition',4);
  legacy.score.parts[0].measures[0].events=[note('old',0,'whole')];
  const first=model.saveWorkshopDraft(null,legacy,'2026-10-03T10:00:00.000Z');
  const old=JSON.stringify(first.piece.revisions[0]);
  const edited=model.openWorkshopPiece(first.piece);
  edited.score=model.setWorkshopMeasureContext(edited.score,1,{keyId:'F-major',dynamic:'pp'});
  edited.score=model.setWorkshopMeasureRepeat(edited.score,1,true,null);
  edited.score=model.setWorkshopMeasureRepeat(edited.score,2,false,2);
  edited.score.parts[0].measures[1].events=editor.makeWorkshopTriplet(bar([note('one',0),note('two',1),note('three',2)]),['one','two','three']);
  edited.score.parts[0].measures[1].events.find(event=>event.id==='one').articulations=['accent'];
  const second=model.saveWorkshopDraft(first.library,edited,'2026-10-03T10:01:00.000Z');
  assert.strictEqual(JSON.stringify(second.piece.revisions[0]),old);
  assert.strictEqual(second.piece.revisions.length,2); assert.strictEqual(second.piece.revisions[1].score.version,1);
  assert.deepStrictEqual(model.openWorkshopPiece(second.piece).score,edited.score);
  assert(model.isValidWorkshopLibrary(second.library));
  assert.deepStrictEqual(model.openWorkshopPiece(second.piece,first.piece.currentRevisionId).score,legacy.score);
});
console.log('Workshop composition model tests passed.');
