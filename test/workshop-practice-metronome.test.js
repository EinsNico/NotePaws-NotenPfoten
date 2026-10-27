const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const root=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>filename.startsWith(root)
  ? mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename)
  : original(mod,filename);
const model=require('../src/model/Workshop');
const {createWorkshopPlayback}=require('../src/model/WorkshopPlayback');
const {createWorkshopPracticePlan}=require('../src/model/WorkshopPractice');
const {createWorkshopPracticeMetronome}=require('../src/model/WorkshopPracticeMetronome');
const silent={play(){return null;},stopAll(){}};
const tests=[];function test(name,run){tests.push([name,run]);}
function score(count=1){return model.createWorkshopDraft('Metronome',count).score;}
function note(id,startSlot,extra={}){return Object.assign({id,kind:'note',noteValue:'quarter',startSlot,pitch:{step:'C',alter:0,octave:4}},extra);}
function near(actual,expected){assert(Math.abs(actual-expected)<1e-6,actual+' differs from '+expected);}
function beatTimes(timeline){return timeline.beats.map(beat=>beat.startMs);}
function fixture(beats,options={}){
  let elapsed=0,counter=0,volume=50;
  const timers=new Map(),sources=[],gains=[],stale=[];
  const context={currentTime:10,state:'running',destination:{},
    createOscillator(){const source={connected:false,cancelled:false,
      frequency:{setValueAtTime(value,at){source.frequencyValue=value;source.frequencyAt=at;},exponentialRampToValueAtTime(){}},
      connect(){source.connected=true;},disconnect(){source.connected=false;},
      start(at){source.when=at;},stop(at){if(at===undefined){if(source.end===undefined || context.currentTime<source.end)source.cancelled=true;}else source.end=at;}};
      sources.push(source);return source;},
    createGain(){const gain={connected:false,gain:{setValueAtTime(value,at){gain.level=value;gain.at=at;},exponentialRampToValueAtTime(){}},
      connect(to){gain.connected=true;gain.destination=to;},disconnect(){gain.connected=false;}};gains.push(gain);return gain;}};
  const helper=createWorkshopPracticeMetronome({beats},Object.assign({getContext:()=>context,getVolume:()=>volume,
    setTimeoutFn(fn,delay){const id=++counter;timers.set(id,{fn,due:elapsed+delay});stale.push(fn);return id;},clearTimeoutFn:id=>timers.delete(id)},options));
  function advance(target){
    assert(target>=elapsed);let safety=100000;
    while(timers.size){const[id,timer]=Array.from(timers).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];
      if(timer.due>target+1e-7)break;assert(--safety>0);timers.delete(id);elapsed=Math.max(elapsed,timer.due);context.currentTime=10+elapsed/1000;timer.fn();}
    elapsed=target;context.currentTime=10+elapsed/1000;
    sources.forEach(source=>{if(source.end<=context.currentTime && source.onended)source.onended();});
  }
  return{helper,context,timers,sources,gains,stale,advance,setVolume(value){volume=value;},
    stall(target){assert(target>=elapsed);elapsed=target;context.currentTime=10+elapsed/1000;advance(target);}};
}
function beats(times){return times.map((startMs,index)=>({startMs,accent:index%4===0}));}

test('beat opt-in preserves the default timeline schema, note timings and score data',()=>{
  const value=score(2);value.parts[0].measures[0].events=[note('first',0),note('second',2)];
  const before=JSON.stringify(value),regular=model.workshopTimeline(value),withBeats=model.workshopTimeline(value,{includeBeats:true});
  assert.deepStrictEqual(Object.keys(regular),['events','measures','durationMs']);assert.strictEqual(regular.beats,undefined);
  assert.deepStrictEqual(withBeats.events,regular.events);assert.deepStrictEqual(withBeats.measures,regular.measures);assert.strictEqual(withBeats.durationMs,regular.durationMs);
  assert.deepStrictEqual(beatTimes(withBeats),[0,1000,2000,3000,4000,5000,6000,7000]);
  assert.deepStrictEqual(withBeats.beats.map(beat=>beat.accent),[true,false,false,false,true,false,false,false]);
  assert.strictEqual(JSON.stringify(value),before);
});
test('pulses share exact note timing through discrete tempo changes, ramps and fermata holds',()=>{
  const discrete=score();discrete.parts[0].measures[0].events=[note('slow',0),note('fast',2)];
  discrete.parts[0].measures[0].directions=[{id:'fast-tempo',type:'tempo',value:120,startSlot:2}];
  const changed=model.workshopTimeline(discrete,{includeBeats:true});assert.deepStrictEqual(beatTimes(changed),[0,1000,1500,2000]);
  changed.events.filter(event=>event.value!==null).forEach(event=>near(changed.beats.find(beat=>beat.startSlot===discrete.parts[0].measures[0].events.find(note=>note.id===event.id).startSlot).startMs,event.startMs));
  const ramp=score();ramp.parts[0].measures[0].events=[note('ramp-a',0),note('ramp-b',2),note('ramp-c',4),note('ramp-d',6)];
  ramp.parts[0].measures[0].directions=[{id:'accelerando',type:'tempoRamp',value:120,startSlot:0,endSlot:8}];
  const increasing=model.workshopTimeline(ramp,{includeBeats:true});
  increasing.beats.forEach((beat,index)=>near(beat.startMs,4000*Math.log((60+beat.startSlot*7.5)/60)));
  increasing.events.filter(event=>event.value!==null).forEach((event,index)=>near(event.startMs,increasing.beats[index].startMs));
  near(increasing.durationMs,4000*Math.log(2));
  const held=score();held.parts[0].measures[0].events=[note('held',0,{fermata:2}),note('after-hold',2)];
  const hold=model.workshopTimeline(held,{includeBeats:true});assert.deepStrictEqual(beatTimes(hold),[0,2000,3000,4000]);
  assert.strictEqual(hold.beats[0].durationMs,2000);assert.strictEqual(hold.events.find(event=>event.id==='after-hold').startMs,hold.beats[1].startMs);
});
test('simple, compound and explicitly additive meters retain their musical pulse groups',()=>{
  for(const [meter,expected] of [['2/2',[0,2000]],['3/8',[0,500,1000]],['6/8',[0,1500]],['9/8',[0,1500,3000]],['12/8',[0,1500,3000,4500]],['3+2/8',[0,1500]]]){
    const value=score();value.meter=meter;const timeline=model.workshopTimeline(value,{includeBeats:true});
    assert.deepStrictEqual(beatTimes(timeline),expected,meter);assert(timeline.beats[0].accent);assert(timeline.beats.slice(1).every(beat=>!beat.accent));
  }
  const changing=score(3);changing.parts[0].measures[1].meter='6/8';changing.parts[0].measures[2].meter='2/2';
  const timeline=model.workshopTimeline(changing,{includeBeats:true});
  assert.deepStrictEqual(timeline.beats.filter(beat=>beat.barIndex===1).map(beat=>beat.startMs),[4000,5500]);
  assert.deepStrictEqual(timeline.beats.filter(beat=>beat.barIndex===2).map(beat=>beat.startMs),[7000,9000]);
});
test('pickups keep their final-beat phase and never invent a downbeat at the piece start',()=>{
  const quarter=score(2);quarter.pickupUnits=2;
  const timeline=model.workshopTimeline(quarter,{includeBeats:true});
  assert.deepStrictEqual(timeline.beats.slice(0,2).map(beat=>[beat.startMs,beat.beatIndex,beat.accent]),[[0,3,false],[1000,0,true]]);
  const eighth=score(2);eighth.pickupUnits=1;
  const offbeat=model.workshopTimeline(eighth,{includeBeats:true});assert(!offbeat.beats.some(beat=>beat.barIndex===0));
  assert.strictEqual(offbeat.beats[0].startMs,500);assert(offbeat.beats[0].accent);
});
test('performed repeats and selected-bar playback rebase optional beats without changing ordinary playback',()=>{
  const value=score(3);value.pickupUnits=2;value.parts[0].measures[0].repeatStart=true;value.parts[0].measures[1].repeatEnd=2;
  value.parts[0].measures[1].meter='3/4';value.parts[0].measures[2].meter='6/8';
  const complete=model.workshopTimeline(value,{includeBeats:true}),regular=createWorkshopPlayback(value,silent).getTimeline();
  const performed=createWorkshopPlayback(value,silent,{includeBeats:true}).getTimeline();
  assert.strictEqual(regular.beats,undefined);assert.deepStrictEqual(performed.events,regular.events);assert.deepStrictEqual(performed.measures,regular.measures);
  assert.deepStrictEqual(performed.measures.map(measure=>measure.index),[0,1,0,1,2]);
  performed.measures.forEach(measure=>{
    const source=complete.measures[measure.index],original=complete.beats.filter(beat=>beat.barIndex===measure.index);
    const actual=performed.beats.filter(beat=>beat.measureIndex===measure.measureIndex);
    assert.deepStrictEqual(actual.map(beat=>beat.startMs),original.map(beat=>measure.startMs+beat.startMs-source.startMs));
    assert.deepStrictEqual(actual.map(beat=>beat.accent),original.map(beat=>beat.accent));
  });
  const selected=createWorkshopPlayback(value,silent,{includeBeats:true,barIndex:2}).getTimeline();assert.deepStrictEqual(beatTimes(selected),[0,1500]);
  const plan=createWorkshopPracticePlan(value);assert.deepStrictEqual(plan.timeline.beats,performed.beats);assert(Object.isFrozen(plan.timeline.beats));
});
test('countdown origin schedules heard clicks at the same target time for zero and Bluetooth output delays',()=>{
  for(const delayMs of [0,250,750]){
    const f=fixture(beats([0,1000,2000]),{delayMs});assert(f.helper.start(0,{audibleAtSeconds:13,limitMs:2000}));
    assert.strictEqual(f.sources.length,0,'no source is created three seconds ahead');f.advance(5000);
    assert.strictEqual(f.sources.length,3);f.sources.forEach((source,index)=>near(source.when+delayMs/1000,13+index));
    assert.strictEqual(f.sources[0].frequencyValue,1100);assert.strictEqual(f.sources[1].frequencyValue,720);
    assert(f.gains.filter(gain=>gain.destination!==f.context.destination).every(gain=>gain.level===.08));f.helper.destroy();assert.strictEqual(f.timers.size,0);
  }
});
test('waiting at countdown end preserves its initial click and bounds later scheduling at the frozen target',()=>{
  const f=fixture(beats([0,500,1000]));f.helper.start(0,{audibleAtSeconds:13,limitMs:0});f.advance(3000);
  assert.strictEqual(f.sources.length,1);const initial=f.sources[0];assert(initial.connected);assert(!initial.cancelled);
  f.helper.update(0,{waiting:true,limitMs:0});assert(initial.connected,'initial click finishes after the countdown boundary');assert(!initial.cancelled);assert.strictEqual(f.timers.size,0);
  f.advance(5000);assert.strictEqual(f.sources.length,1,'no metronome progress while waiting');
  f.helper.update(0,{waiting:false,limitMs:1000});f.advance(6000);
  assert.deepStrictEqual(f.sources.map(source=>source.when),[13,15.5,16]);f.helper.destroy();
});
test('a buffered output wait release omits impossible near pulses instead of producing late clicks or changing score times',()=>{
  const original=beats([0,100,600,1200]),before=JSON.stringify(original),f=fixture(original,{delayMs:300});
  f.helper.start(0,{audibleAtSeconds:13,limitMs:0});f.advance(3000);f.helper.update(0,{waiting:true,limitMs:0});
  f.advance(5000);f.helper.update(0,{waiting:false,limitMs:1200});f.advance(6500);
  assert.deepStrictEqual(f.sources.map(source=>Math.round(source.when*1000)),[12700,15300,15900]);
  assert.strictEqual(JSON.stringify(original),before);f.helper.destroy();
});
test('seeking starts at the next real beat and a stalled scheduler skips expired clicks without a burst',()=>{
  const f=fixture(beats([0,500,1000,1500,2000,2500,3000]));f.helper.start(1750,{audibleAtSeconds:13});f.advance(4300);
  assert.deepStrictEqual(f.sources.map(source=>source.when),[13.25,13.75,14.25]);f.helper.stop();
  const stalled=fixture(beats([0,100,200,300,400,500,600]));stalled.helper.start(0,{audibleAtSeconds:10});
  assert.deepStrictEqual(stalled.sources.map(source=>source.when),[10,10.1]);stalled.stall(550);
  assert(!stalled.sources.some(source=>source.when===10.55),'missed clicks are not replayed at the late timer time');
  assert(!stalled.sources.some(source=>[10.2,10.3,10.4,10.5].includes(source.when)));assert(stalled.sources.some(source=>source.when===10.6));
  stalled.helper.destroy();
});
test('stop, context interruption and disposal cancel sources and stale timers cannot revive another session',()=>{
  const f=fixture(beats([0,1000,2000]));f.helper.start(0,{audibleAtSeconds:13});const stale=f.stale.slice();
  f.helper.start(0,{audibleAtSeconds:14});stale.forEach(fn=>fn());assert.strictEqual(f.timers.size,1);f.helper.stop();assert.strictEqual(f.timers.size,0);
  f.helper.start(0,{audibleAtSeconds:10.1});assert.strictEqual(f.sources.length,1);f.context.state='suspended';f.advance(100);
  assert(f.sources[0].cancelled);assert(f.sources.every(source=>!source.connected));assert(f.gains.filter(gain=>gain.destination!==f.context.destination).every(gain=>!gain.connected));assert.strictEqual(f.timers.size,0);
  f.context.state='running';f.helper.start(0,{audibleAtSeconds:10.2});f.helper.destroy();const count=f.sources.length;f.stale.forEach(fn=>fn());
  assert.strictEqual(f.sources.length,count);assert.strictEqual(f.timers.size,0);assert.strictEqual(f.helper.start(0),false);
});
test('unavailable contexts remain silent and live app volume changes apply to the next pulse',()=>{
  const unavailable=createWorkshopPracticeMetronome({beats:beats([0])},{getContext:()=>null});assert.strictEqual(unavailable.start(0),false);unavailable.destroy();
  const f=fixture(beats([0,1000,2000]));f.helper.start(0,{audibleAtSeconds:10});assert.strictEqual(f.gains[0].level,.08);
  f.setVolume(0);f.advance(1000);assert.strictEqual(f.sources.length,1);f.setVolume(100);f.advance(2000);assert.strictEqual(f.gains.filter(gain=>gain.destination!==f.context.destination)[1].level,.16);f.helper.destroy();
});
for(const[name,run]of tests){run();console.log('PASS '+name);}console.log('All '+tests.length+' workshop practice metronome checks passed.');
