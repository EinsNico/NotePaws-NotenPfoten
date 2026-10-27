const assert=require("assert"), fs=require("fs"), path=require("path"), Module=require("module"), babel=require("babel-core");
global.regeneratorRuntime=require("babel-runtime/regenerator");
function storage() { const data=new Map(); return { get length() { return data.size; },key(index) { return Array.from(data.keys())[index]||null; },
  getItem(key) { return data.has(key)?data.get(key):null; },setItem(key,value) { data.set(key,String(value)); },removeItem(key) { data.delete(key); } }; }
if (!global.localStorage) global.localStorage=storage();
const sourceRoot=path.resolve(__dirname,"../src")+path.sep, originalLoader=Module._extensions[".js"];
Module._extensions[".js"]=(mod,filename) => { if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,"utf8"),{babelrc:false,presets:[["env",{modules:"commonjs"}]]}).code,filename); };
const model=require("../src/model/Workshop"), ties=require("../src/model/WorkshopTies"), expression=require("../src/model/WorkshopExpression");
const store=require("../src/model/WorkshopStorage"), backup=require("../src/model/SaveDataBackup"), imports=require("../src/model/SaveDataImport");
const files=require("../src/model/SaveDataFiles"), {SaveDataStreamReader}=require("../src/model/SaveDataStreamReader");
const {prepareStagedLocalSaveDataPlan}=require("../src/model/SaveDataShadowLocalPlan");
const {prepareMergedLocalSaveDataPlan}=require("../src/model/SaveDataLargeMergeLocalPlan");
const {createWorkshopPlayback}=require("../src/model/WorkshopPlayback"), {createPianoSamplePlayer}=require("../src/model/PianoAudio");
function test(name,operation) { operation(); process.stdout.write("✓ "+name+"\n"); }
function note(id,value,noteValue,startSlot,extra={}) { return Object.assign({id,kind:"note",noteValue,startSlot,pitch:model.workshopPitchFromValue(value)},extra); }
function base(count=1) { return model.createWorkshopDraft("Expression",count).score; }
function clockPlayback(score,options={}) {
  let time=0,counter=0,maxPending=0; const timers=new Map(),callbacks=[],samples=[],steps=[],active=[];
  class FakeAudio { constructor(src) { this.value=Number(src.match(/(\d+)\.mp3$/)[1]); this.pauses=[]; samples.push(this); }
    addEventListener() {} play() { this.startedAt=time; return {catch(){}}; } pause() { this.pauses.push(time); } }
  const player=createPianoSamplePlayer({AudioConstructor:FakeAudio,maxVoices:128});
  const playback=createWorkshopPlayback(score,player,Object.assign({},options,{appVolume:options.appVolume===undefined?50:options.appVolume,nowFn() {return time;},
    setTimeoutFn(callback,delay) {const id=++counter; timers.set(id,{callback,due:time+delay}); callbacks.push(callback); maxPending=Math.max(maxPending,timers.size); return id;},
    clearTimeoutFn(id) {timers.delete(id);},onStep(event) {steps.push(event);},onActiveNotes(ids,barIndex) {active.push({ids:ids.slice(),barIndex});}}));
  return {playback,player,samples,steps,active,timers,callbacks,get maxPending() {return maxPending;},advance(target) {assert(target>=time); let limit=100000;
    while (true) {const pending=Array.from(timers.entries()).filter(item=>item[1].due<=target).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0]); if (!pending.length) break;
      assert(--limit>0,"timer loop"); const [id,timer]=pending[0]; timers.delete(id); time=timer.due; timer.callback();} time=target;}};
}
function last(values) {return values[values.length-1];}
function annotatedScore() {
  let score=model.setWorkshopSecondStaffEnabled(base(3),true); score.pickupUnits=2;
  score.parts.forEach((part,index)=>{
    part.measures[0].repeatStart=true; part.measures[1].repeatEnd=2;
    part.measures[1].keyId="D-minor"; part.measures[1].meter="3/4";
    part.measures[0].dynamic=index===0?"pp":"ff";
  });
  score.parts[0].measures[0].events=[note("pickup-a",48,"quarter",0,{voice:2,articulations:["tenuto","accent"],fingering:1,pedal:"down"})];
  score.parts[0].measures[1].events=[note("tri-a",48,"quarter",0,{voice:2,tuplet:3,tupletGroupId:"triplet"}),
    note("tri-b",50,"quarter",4/3,{voice:2,tuplet:3,tupletGroupId:"triplet"}),note("tri-c",52,"quarter",8/3,{voice:2,tuplet:3,tupletGroupId:"triplet",pedal:"up"}),
    note("other-voice",55,"half",0,{voice:3,articulations:["staccatissimo"],fingering:5})];
  score.parts[0].measures[2].events=[note("later",53,"quarter",0,{voice:2})];
  score.parts[1].measures[0].events=[note("lower",36,"quarter",0,{voice:4})];
  score=ties.connectWorkshopTies(score,["pickup-a","tri-a"]); assert(score);
  score=expression.connectWorkshopSlur(score,["tri-a","later"]); assert(score && model.isValidWorkshopScore(score)); return score;
}
async function run() {
  test("ties distinguish written voices and use exact triplet ticks plus pickup boundaries",()=>{
    const score=base(2); score.pickupUnits=2;
    score.parts[0].measures[0].events=[note("a",48,"quarter",0,{voice:2})];
    score.parts[0].measures[1].events=[note("b",48,"eighth",0,{voice:2,tuplet:3}),note("c",48,"eighth",2/3,{voice:2,tuplet:3})];
    assert(model.isValidWorkshopScore(score)); const before=JSON.stringify(score);
    const linked=ties.connectWorkshopTies(score,["c","a","b"]); assert(linked && model.isValidWorkshopScore(linked));
    assert.deepStrictEqual(linked.ties,[{fromId:"a",toId:"b"},{fromId:"b",toId:"c"}]); assert.strictEqual(JSON.stringify(score),before);
    const changed=model.cloneWorkshop(linked); changed.parts[0].measures[1].events[0].voice=1;
    assert(!ties.isValidWorkshopTies(changed)); assert(!model.isValidWorkshopScore(changed)); assert.strictEqual(ties.repairWorkshopTies(changed).ties,undefined);
    const near=model.cloneWorkshop(linked); near.parts[0].measures[1].events[1].startSlot+=1e-10; assert(ties.isValidWorkshopTies(near));
    near.parts[0].measures[1].events[1].startSlot+=1/12; assert(!ties.isValidWorkshopTies(near));
    const implicit=base(); implicit.parts[0].measures[0].events=[note("v1a",48,"quarter",0),note("v2a",52,"eighth",0,{voice:2}),note("v1b",48,"quarter",0)];
    implicit.parts[0].measures[0].events.forEach(event=>delete event.startSlot); assert(model.isValidWorkshopScore(implicit));
    assert(ties.connectWorkshopTies(implicit,["v1a","v1b"]));
  });
  test("slurs span different pitches and bars in one staff and voice without holding samples",()=>{
    const score=base(3); score.parts[0].measures.forEach((bar,index)=>{bar.events=[note("s"+index,48+index*2,"quarter",0,{voice:2})];});
    const before=JSON.stringify(score), connected=expression.connectWorkshopSlur(score,["s2","s0"]);
    assert.deepStrictEqual(connected.slurs,[{fromId:"s0",toId:"s2"}]); assert.strictEqual(JSON.stringify(score),before);
    assert.deepStrictEqual(expression.workshopMeasureSlurs(connected,0,1),[{fromId:"s0",toId:"s2",fromBarIndex:0,toBarIndex:2,voice:2}]);
    const nested=expression.connectWorkshopSlur(connected,["s0","s1"]); assert(expression.isValidWorkshopSlurs(nested));
    assert.deepStrictEqual(expression.connectWorkshopSlur(nested,["s1","s0"]),nested);
    assert.strictEqual(expression.disconnectWorkshopSlurs(nested,["s0"]).slurs,undefined);
    const edited=model.cloneWorkshop(nested); edited.parts[0].measures[2].events[0].voice=3;
    assert.deepStrictEqual(expression.repairWorkshopSlurs(edited).slurs,[{fromId:"s0",toId:"s1"}]);
    const clock=clockPlayback(connected); clock.playback.start(); clock.advance(12000);
    assert.deepStrictEqual(clock.samples.map(sample=>sample.startedAt),[0,4000,8000]); assert.deepStrictEqual(clock.samples.map(sample=>sample.pauses[0]),[1000,5000,9000]);
    const malformed=[null,{},new Array(1),[{fromId:"s0"}],[{fromId:"s0",toId:"s2",extra:1}],
      [{fromId:"s2",toId:"s0"}],[{fromId:"s0",toId:"s0"}],[{fromId:"s0",toId:"missing"}],
      [{fromId:"s0",toId:"s2"},{fromId:"s0",toId:"s2"}]];
    for (const graph of malformed) {const corrupt=model.cloneWorkshop(score); corrupt.slurs=graph; assert(!expression.isValidWorkshopSlurs(corrupt)); assert(!model.isValidWorkshopScore(corrupt));}
    const other=model.setWorkshopSecondStaffEnabled(score,true); other.parts[1].measures[1].events=[note("lower",50,"quarter",0,{voice:2})];
    assert.strictEqual(expression.connectWorkshopSlur(other,["s0","lower"]),null);
    const old=base(); assert.deepStrictEqual(expression.repairWorkshopSlurs(old),old); assert(!("slurs" in expression.repairWorkshopSlurs(old)));
  });
  test("relative dynamics inherit per staff and accents remain bounded while staccato gates notes",()=>{
    const score=model.setWorkshopSecondStaffEnabled(base(2),true);
    score.parts[0].measures[0].dynamic="p"; score.parts[1].measures[0].dynamic="ff";
    score.parts[0].measures[0].events=[note("short",48,"quarter",0,{articulations:["staccato","accent"]}),note("held",50,"quarter",2,{articulations:["tenuto"]})];
    score.parts[0].measures[1].events=[note("inherited",52,"quarter",0)];
    score.parts[1].measures[0].events=[note("loud",36,"quarter",0,{articulations:["accent"]})];
    const clock=clockPlayback(score); clock.playback.start(); assert.strictEqual(clock.samples[0].volume,.21); assert.strictEqual(clock.samples[1].volume,.5);
    clock.advance(500); assert.strictEqual(clock.samples[0].pauses[0],500); assert(!clock.samples[1].pauses.length);
    clock.advance(2000); assert.strictEqual(clock.samples[2].pauses[0],2000);
    clock.advance(4000); assert.strictEqual(clock.samples[3].volume,.18); clock.playback.stop();
    assert.strictEqual(expression.workshopExpressionVolume(100,"ff",["accent"]),100); assert.strictEqual(expression.workshopExpressionVolume(0,"ff",["accent"]),0);
    const tied=base(); tied.parts[0].measures[0].events=[note("a",48,"quarter",0,{articulations:["staccato"]}),note("b",48,"quarter",2,{articulations:["staccato"]})];
    const held=clockPlayback(ties.connectWorkshopTies(tied,["a","b"])); held.playback.start(); held.advance(2000);
    assert.strictEqual(held.samples.length,1); assert.strictEqual(held.samples[0].pauses[0],2000);
    const transition=base(2); transition.parts[0].measures[0].dynamic="pp"; transition.parts[0].measures[1].dynamic="ff";
    transition.parts[0].measures[0].events=[note("quiet",48,"whole",0)]; transition.parts[0].measures[1].events=[note("strong",48,"quarter",0)];
    const sustained=clockPlayback(ties.connectWorkshopTies(transition,["quiet","strong"])); sustained.playback.start(); assert.strictEqual(sustained.samples[0].volume,.1);
    sustained.advance(4000); assert.strictEqual(sustained.samples.length,1); assert.strictEqual(sustained.samples[0].volume,.5); assert(!sustained.samples[0].pauses.length); sustained.playback.stop();
  });
  test("staccatissimo shortens audition only, preserves tuplets and obeys ties and pedal",()=>{
    const score=base(); score.parts[0].measures[0].events=[
      note("very-short",48,"quarter",0,{articulations:["staccatissimo","accent"]}),
      note("short",50,"quarter",2,{articulations:["staccato"]}),note("normal",52,"quarter",4)];
    const before=JSON.stringify(score), clock=clockPlayback(score); clock.playback.start(); clock.advance(4000);
    assert.deepStrictEqual(clock.samples.map(sample=>sample.startedAt),[0,1000,2000]);
    assert.deepStrictEqual(clock.samples.map(sample=>sample.pauses[0]),[250,1500,3000]);
    assert.strictEqual(JSON.stringify(score),before);
    const triplet=base(); triplet.parts[0].measures[0].events=[note("tuple",48,"eighth",0,{tuplet:3,articulations:["staccatissimo"]})];
    const fractional=clockPlayback(triplet); fractional.playback.start(); fractional.advance(1000);
    assert(Math.abs(fractional.samples[0].pauses[0]-1000/12)<1e-8); fractional.playback.stop();
    const tied=base(); tied.parts[0].measures[0].events=[note("tie-a",48,"quarter",0,{articulations:["staccatissimo"]}),note("tie-b",48,"quarter",2,{articulations:["staccatissimo"]})];
    const held=clockPlayback(ties.connectWorkshopTies(tied,["tie-a","tie-b"])); held.playback.start(); held.advance(2000);
    assert.strictEqual(held.samples.length,1); assert.strictEqual(held.samples[0].pauses[0],2000); held.playback.stop();
    const pedaled=base(); pedaled.parts[0].measures[0].events=[note("pedal-note",48,"quarter",0,{articulations:["staccatissimo"],pedal:"down"}),
      {id:"release",kind:"rest",pitch:null,noteValue:"quarter",startSlot:2,pedal:"up"}];
    const sustained=clockPlayback(pedaled); sustained.playback.start(); sustained.advance(1000);
    assert.strictEqual(sustained.samples[0].pauses[0],1000); sustained.playback.stop();
  });
  test("strong accents alone enable expressive headroom and increase attack volume without changing written timing",()=>{
    const score=base();score.parts[0].measures[0].events=[note("plain",48,"quarter",0),note("strong",50,"quarter",2,{articulations:["strong-accent"]})];
    const before=JSON.stringify(score),clock=clockPlayback(score,{appVolume:100});assert(model.isValidWorkshopScore(score));
    clock.playback.start();clock.advance(4000);
    assert.deepStrictEqual(clock.samples.map(sample=>sample.startedAt),[0,1000]);
    assert.deepStrictEqual(clock.samples.map(sample=>sample.pauses[0]),[1000,2000]);
    assert.strictEqual(clock.samples[0].volume,.7);assert.strictEqual(clock.samples[1].volume,.95);
    assert(clock.samples[1].volume>clock.samples[0].volume && clock.samples[1].volume<=1);
    assert.deepStrictEqual(clock.steps.filter(event=>event.value!==null).map(event=>event.durationMs),[1000,1000]);
    assert.strictEqual(JSON.stringify(score),before);
    const legacy=base();legacy.parts[0].measures[0].events=[note("legacy",48,"quarter",0)];
    const unchanged=clockPlayback(legacy,{appVolume:100});unchanged.playback.start();assert.strictEqual(unchanged.samples[0].volume,1);unchanged.playback.stop();
  });
  test("detached legato gates quarter and tuplet notes at three quarters while preserving onsets and full tied sustain",()=>{
    const score=base();score.parts[0].measures[0].events=[note("detached",48,"quarter",0,{articulations:["detached-legato"]}),note("next",50,"quarter",2)];
    const before=JSON.stringify(score),clock=clockPlayback(score);clock.playback.start();clock.advance(749);assert.strictEqual(clock.samples[0].pauses.length,0);
    clock.advance(750);assert.strictEqual(clock.samples[0].pauses[0],750);assert.strictEqual(clock.samples.length,1);
    clock.advance(2000);assert.deepStrictEqual(clock.samples.map(sample=>sample.startedAt),[0,1000]);
    assert.deepStrictEqual(clock.steps.filter(event=>event.value!==null).map(event=>event.durationMs),[1000,1000]);
    assert.strictEqual(JSON.stringify(score),before);clock.playback.stop();
    const triplet=base();triplet.parts[0].measures[0].events=[note("tuple",48,"eighth",0,{tuplet:3,articulations:["detached-legato"]}),note("tuple-next",50,"eighth",2/3,{tuplet:3})];
    const fractional=clockPlayback(triplet);fractional.playback.start();fractional.advance(1000);
    assert(Math.abs(fractional.samples[0].pauses[0]-250)<1e-8);assert(Math.abs(fractional.samples[1].startedAt-1000/3)<1e-8);
    assert(Math.abs(fractional.steps[0].durationMs-1000/3)<1e-8);fractional.playback.stop();
    const source=base();source.parts[0].measures[0].events=[note("tie-a",48,"quarter",0,{articulations:["detached-legato"]}),note("tie-b",48,"quarter",2,{articulations:["detached-legato"]})];
    const tied=ties.connectWorkshopTies(source,["tie-a","tie-b"]),tiedBefore=JSON.stringify(tied),held=clockPlayback(tied);
    held.playback.start();held.advance(1999);assert.strictEqual(held.samples.length,1);assert.strictEqual(held.samples[0].pauses.length,0);
    held.advance(2000);assert.strictEqual(held.samples[0].pauses[0],2000);assert.strictEqual(JSON.stringify(tied),tiedBefore);held.playback.stop();
  });
  test("expressive scores reserve headroom at full app volume while untouched legacy samples stay unchanged",()=>{
    const score=base(3); score.parts[0].measures[0].events=[note("default-mf",48,"quarter",0),note("accent",50,"quarter",2,{articulations:["accent"]})];
    score.parts[0].measures[1].dynamic="f"; score.parts[0].measures[1].events=[note("forte",52,"quarter",0)];
    score.parts[0].measures[2].dynamic="ff"; score.parts[0].measures[2].events=[note("fortissimo",53,"quarter",0)];
    const clock=clockPlayback(score,{appVolume:100}); clock.playback.start(); clock.advance(12000);
    assert.deepStrictEqual(clock.samples.map(sample=>sample.volume),[.7,.84,.85,1]);
    const excerpt=model.cloneWorkshop(score); excerpt.parts[0].measures[0].events=[note("unmarked",48,"quarter",0)];
    const selected=clockPlayback(excerpt,{appVolume:100,barIndex:0}); selected.playback.start(); assert.strictEqual(selected.samples[0].volume,.7); selected.playback.stop();
    const legacy=base(); legacy.parts[0].measures[0].events=[note("plain",48,"quarter",0),note("short",50,"quarter",2,{articulations:["staccato","tenuto"]})];
    const old=clockPlayback(legacy,{appVolume:100}); old.playback.start(); old.advance(4000); assert.deepStrictEqual(old.samples.map(sample=>sample.volume),[1,1]);
    assert.strictEqual(expression.workshopExpressionVolume(50,"f",["accent"]),50);
  });
  test("one global pedal holds expired samples on both staves and releases them without ending live notes",()=>{
    const score=model.setWorkshopSecondStaffEnabled(base(),true);
    score.parts[0].measures[0].events=[note("down",48,"quarter",0,{pedal:"down"}),note("live",50,"half",2),
      {id:"release",kind:"rest",pitch:null,noteValue:"quarter",startSlot:4,pedal:"up"}];
    score.parts[1].measures[0].events=[note("lower",36,"quarter",0)];
    const clock=clockPlayback(score); clock.playback.start(); clock.advance(1000);
    assert.strictEqual(clock.samples.length,3); assert(clock.samples.every(sample=>!sample.pauses.length)); assert.deepStrictEqual(last(clock.active).ids,["live"]);
    clock.advance(2000); assert.strictEqual(clock.samples[0].pauses[0],2000); assert.strictEqual(clock.samples[1].pauses[0],2000); assert(!clock.samples[2].pauses.length);
    clock.advance(3000); assert.strictEqual(clock.samples[2].pauses[0],3000); clock.advance(4000); assert(!clock.playback.isPlaying());
    const noRelease=base(); noRelease.parts[0].measures[0].events=[note("down",48,"quarter",0,{pedal:"down"})];
    const end=clockPlayback(noRelease); end.playback.start(); end.advance(4000); assert.strictEqual(end.samples[0].pauses[0],4000);
    const stopped=clockPlayback(noRelease); stopped.playback.start(); stopped.advance(1000); const stale=stopped.callbacks.slice(); stopped.playback.stop();
    assert.strictEqual(stopped.samples[0].pauses[0],1000); stale.forEach(callback=>callback()); assert.strictEqual(stopped.samples.length,1);
    const prior=base(2); prior.parts[0].measures[0].events=[note("previous-down",48,"quarter",0,{pedal:"down"})];
    prior.parts[0].measures[1].events=[note("new-attack",50,"quarter",0),{id:"up",kind:"rest",pitch:null,noteValue:"quarter",startSlot:4,pedal:"up"}];
    const selected=clockPlayback(prior,{barIndex:1}); selected.playback.start(); selected.advance(1000); assert.strictEqual(selected.samples.length,1); assert(!selected.samples[0].pauses.length);
    selected.advance(2000); assert.strictEqual(selected.samples[0].pauses[0],2000); selected.playback.stop();
  });
  test("performed repeats respect pickups, changing meter, source highlighting and actual adjacent tie continuations",()=>{
    const score=base(3); score.pickupUnits=2;
    score.parts[0].measures[0].events=[note("a",48,"quarter",0)]; score.parts[0].measures[0].repeatStart=true;
    score.parts[0].measures[1].events=[note("b",48,"whole",0)]; score.parts[0].measures[1].repeatEnd=2;
    score.parts[0].measures[2].events=[note("c",48,"quarter",0)]; score.parts[0].measures[2].meter="3/4";
    const linked=ties.connectWorkshopTies(score,["a","b","c"]); assert(linked); assert.deepStrictEqual(model.workshopPlaybackBarOrder(linked),[0,1,0,1,2]);
    const before=JSON.stringify(linked), clock=clockPlayback(linked); clock.playback.start(); clock.advance(13000);
    assert.deepStrictEqual(clock.steps.filter(event=>event.value!==null).map(event=>[event.id,event.barIndex]),[["a",0],["b",1],["a",0],["b",1],["c",2]]);
    assert.deepStrictEqual(clock.samples.map(sample=>sample.startedAt),[0,5000]); assert.deepStrictEqual(clock.samples.map(sample=>sample.pauses[0]),[5000,11000]);
    assert(!clock.playback.isPlaying()); assert.strictEqual(JSON.stringify(linked),before);
    const single=clockPlayback(linked,{barIndex:1}); single.playback.start(); single.advance(4000);
    assert.strictEqual(single.samples.length,1); assert.strictEqual(single.samples[0].pauses[0],4000); assert.deepStrictEqual(single.steps.filter(event=>event.value!==null).map(event=>event.id),["b"]);
  });
  test("nested repeats and repeated triplet timings keep independent occurrence samples",()=>{
    const score=base(4); score.bpm=71; score.parts[0].measures[0].repeatStart=true; score.parts[0].measures[1].repeatStart=true;
    score.parts[0].measures[2].repeatEnd=2; score.parts[0].measures[3].repeatEnd=2;
    score.parts[0].measures.forEach((bar,index)=>{bar.events=[note("n"+index,48+index,"eighth",1/3,{tuplet:3,voice:3})];});
    const order=[0,1,2,1,2,3,0,1,2,1,2,3]; assert.deepStrictEqual(model.workshopPlaybackBarOrder(score),order);
    const clock=clockPlayback(score); clock.playback.start(); clock.advance(order.length*8*30000/71+1e-6);
    assert.deepStrictEqual(clock.samples.map(sample=>sample.value),order.map(index=>48+index));
    assert.deepStrictEqual(clock.steps.filter(event=>event.value!==null).map(event=>event.barIndex),order);
    clock.samples.forEach(sample=>assert(Math.abs(sample.pauses[0]-sample.startedAt-2/3*30000/71)<1e-6)); assert(!clock.playback.isPlaying());
  });
  test("large repeat plans keep one pending timer and cancel stale callbacks safely",()=>{
    const score=base(200); score.bpm=37; score.parts[0].measures[0].repeatStart=true; score.parts[0].measures[199].repeatEnd=8;
    score.parts[0].measures.forEach((bar,index)=>{bar.events=[note("long-"+index,48,"quarter",0)];});
    const clock=clockPlayback(score); clock.playback.start(); const stale=clock.callbacks.slice(); clock.playback.stop(); stale.forEach(callback=>callback());
    assert(clock.playback.start()); stale.forEach(callback=>callback()); clock.advance(1600*8*30000/37+1e-6);
    assert.strictEqual(clock.maxPending,1); assert.strictEqual(clock.samples.length,1601); assert.strictEqual(clock.timers.size,0); assert(!clock.playback.isPlaying());
  });
  test("sample-specific release frees short voices without evicting a continuously held tie",()=>{
    const score=base(200), heldIds=[];
    score.parts[0].measures.forEach((bar,index)=>{heldIds.push("held-"+index); bar.events=[note("held-"+index,48,"whole",0),note("brief-"+index,60,"eighth",0,{voice:2})];});
    const clock=clockPlayback(ties.connectWorkshopTies(score,heldIds)); clock.playback.start();
    assert.strictEqual(clock.player.getActiveVoiceCount(),2); clock.advance(500); assert.strictEqual(clock.player.getActiveVoiceCount(),1);
    clock.advance(180*4000); assert.strictEqual(clock.player.getActiveVoiceCount(),2); assert.strictEqual(clock.samples[0].pauses.length,0);
    clock.advance(180*4000+500); assert.strictEqual(clock.player.getActiveVoiceCount(),1); assert.strictEqual(clock.samples[0].pauses.length,0);
    assert.strictEqual(clock.samples.length,182); clock.advance(200*4000); assert.strictEqual(clock.player.getActiveVoiceCount(),0); assert.strictEqual(clock.samples[0].pauses[0],200*4000);
    const short=base(); short.parts[0].measures[0].events=[note("one",48,"half",0),note("two",52,"half",0)];
    const independent=clockPlayback(short); independent.playback.start(); independent.player.stop(independent.samples[0]);
    assert.strictEqual(independent.player.getActiveVoiceCount(),1); assert.strictEqual(independent.samples[1].pauses.length,0);
    independent.player.stop(null); assert.strictEqual(independent.player.getActiveVoiceCount(),1); independent.playback.stop(); assert.strictEqual(independent.player.getActiveVoiceCount(),0);
    short.parts[0].measures[0].events[0].noteValue="quarter";
    const fallback=clockPlayback(short); delete fallback.player.stop; fallback.playback.start(); fallback.advance(1000);
    assert.strictEqual(fallback.samples[0].pauses[0],1000); assert.strictEqual(fallback.samples[0].currentTime,0); assert.strictEqual(fallback.samples[1].pauses.length,0); fallback.playback.stop();
  });
  const persisted=storage(),draft=model.createWorkshopDraft("Legacy"); draft.score.parts[0].measures[0].events=[note("old",48,"quarter",0)];
  const first=store.storeWorkshopDraft(draft,persisted), old=JSON.stringify(first.piece.revisions[0].score), changed=model.openWorkshopPiece(first.piece);
  changed.score=annotatedScore(); const active=store.storeWorkshopDraft(changed,persisted), hidden=model.openWorkshopPiece(active.piece);
  hidden.score=model.setWorkshopSecondStaffEnabled(hidden.score,false); const saved=store.storeWorkshopDraft(hidden,persisted), expected=store.readWorkshopLibrary(persisted);
  const exported=backup.createSaveDataBackup(persisted);
  test("revisions retain expressions and app imports preserve their separate local storage",()=>{
    assert.strictEqual(saved.piece.revisions.length,3); assert.strictEqual(JSON.stringify(saved.piece.revisions[0].score),old);
    assert.deepStrictEqual(model.openWorkshopPiece(saved.piece,active.piece.currentRevisionId).score,changed.score);
    const target=storage(); target.setItem(model.WORKSHOP_STORAGE_KEY,persisted.getItem(model.WORKSHOP_STORAGE_KEY)); for (const mode of ["replace","merge","merge"]) {imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,exported,mode)); assert.deepStrictEqual(store.readWorkshopLibrary(target),expected);}
    const corrupt=model.cloneWorkshop(exported); corrupt.version=5; corrupt.data.workshopLibrary=model.cloneWorkshop(expected); corrupt.data.workshopLibrary.pieces[0].revisions[1].score.slurs.push({fromId:"tri-a",toId:"other-voice"});
    assert(!backup.validateSaveDataBackup(corrupt).valid); const before=target.getItem(model.WORKSHOP_STORAGE_KEY);
    assert.throws(()=>imports.prepareSaveDataImport(target,corrupt,"replace")); assert.strictEqual(target.getItem(model.WORKSHOP_STORAGE_KEY),before);
    const hiddenPlayback=clockPlayback(hidden.score); hiddenPlayback.playback.start(); hiddenPlayback.advance(16000);
    assert(hiddenPlayback.steps.every(event=>event.partIndex===0)); assert(hiddenPlayback.samples.every(sample=>sample.value!==36));
  });
  const options={learningStorage:{async flush(){},getStatus(){return {failedWrites:0};},async verifyHistoryReady(){return {saved:true,verified:true};},
    async migrateLegacyHistory(){return {saved:true,verified:true};},async synchronizeProgress(){return {saved:true};},async readDailyTaskHistory() { return { saved: true, history: null }; },
      async readBackupSnapshot(){return {saved:true,progress:{version:3,notes:{}},attempts:[]};},
    async readProgress(){return {saved:true,progress:{version:3,notes:{}}};},async readBackupAttemptsPage(){return {saved:true,page:{records:[],done:true}};}},
    noteFlowStorage:{async flush(){},async readRoundsForExport(){return {saved:true,rounds:[]};},async readRoundsPage(){return {saved:true,page:{records:[],done:true}};}},
    rhythmStorage:{async flush(){},async readBarsForExport(){return {saved:true,bars:[]};},async readBarsPage(){return {saved:true,page:{records:[],done:true}};}},includeNoteFlowRounds:true,includeRhythmSenseBars:true};
  const complete=await files.createIndexedDbSaveDataBackup(persisted,options); assert.strictEqual(complete.data.workshopLibrary,undefined);
  const chunks=[]; await files.streamIndexedDbSaveDataBackup(async chunk=>chunks.push(chunk),persisted,options); const json=chunks.join("");
  const reader=new SaveDataStreamReader(()=>{throw new Error("No large collections expected");}); for (let index=0;index<json.length;index+=13) reader.push(json.slice(index,index+13));
  const parsed=reader.finish(); assert.strictEqual(parsed.backup.data.workshopLibrary,undefined); assert(backup.validateSaveDataBackup(parsed.backup).valid);
  const metadata={key:"ready",shell:parsed.backup,counts:parsed.counts};
  const summary={source:{createdAt:parsed.backup.createdAt,fileSize:null},rounds:{"screen:note-flow":0,"midi:note-flow":0,"midi:note-flow-chords":0,"rhythm:taktgefuehl":0},
    attempts:{"screen:single-notes":0,"midi:single-notes":0},progress:{},activeGuard:"test"};
  const marker={state:"database-verified",summary};
  const staging={async readMetadata(){return metadata;},async readBatch(){return {records:[],nextIndex:0,total:0,done:true};}};
  const shadow={name:"noten-pfoten-learning-import-workshop-expression-test",database:{async readImportGenerationMarker(){return marker;},async readProgressSnapshot(){return [];}}};
  const replacement=await prepareStagedLocalSaveDataPlan(staging,shadow); assert.strictEqual(replacement.values[model.WORKSHOP_STORAGE_KEY],undefined);
  const target=storage(); store.storeWorkshopDraft(model.createWorkshopDraft("Local"),target); marker.state="preparing";
  const merged=await prepareMergedLocalSaveDataPlan(staging,shadow,summary,target);
  assert.strictEqual(merged.values[model.WORKSHOP_STORAGE_KEY],undefined);
  assert.strictEqual(store.readWorkshopLibrary(target).pieces.length,1);
  process.stdout.write("✓ complete and streamed backups plus staged plans exclude local expression revisions\n");
}
module.exports=run;
if (require.main===module) run().catch(error=>{console.error(error);process.exitCode=1;});
