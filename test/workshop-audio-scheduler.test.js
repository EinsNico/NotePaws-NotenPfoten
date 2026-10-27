const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>filename.startsWith(sourceRoot)
  ? mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename)
  : original(mod,filename);
const model=require('../src/model/Workshop'),ties=require('../src/model/WorkshopTies');
const {createWorkshopPlayback}=require('../src/model/WorkshopPlayback');
Module._extensions['.js']=original;
function note(id,startSlot=0,noteValue='quarter',value=48,extra={}) {
  return Object.assign({id,kind:'note',startSlot,noteValue,pitch:model.workshopPitchFromValue(value)},extra);
}
function score(count=1) {return model.createWorkshopDraft('Audio clock',count).score;}
function fixture(value,options={}) {
  let time=0,counter=0,maxPending=0;const timers=new Map(),played=[],updates=[],stale=[];
  const player={getAudioTime:()=>time,getPlaybackRate:value=>Math.pow(2,(value>71?12:value-Math.floor(value))/12),
    play(value,volume,settings) {
      const sample={value,volume,scheduledAt:time,startMs:settings.whenSeconds*1000,offset:settings.offsetSeconds,endMs:null,cancelled:false,changes:[]};
      played.push(sample);return sample;
    },
    stop(sample,settings={}) {if(settings.whenSeconds!==undefined)sample.endMs=settings.whenSeconds*1000;else sample.cancelled=true;},
    stopAll() {played.forEach(sample=>sample.cancelled=true);},
    setVolume(sample,volume,settings) {sample.changes.push({volume,time:settings.whenSeconds*1000});}
  };
  const playback=createWorkshopPlayback(value,player,Object.assign({},options,{appVolume:100,nowFn:()=>time,
    setTimeoutFn(fn,delay) {const id=++counter;timers.set(id,{fn,due:time+delay});stale.push(fn);maxPending=Math.max(maxPending,timers.size);return id;},
    clearTimeoutFn:id=>timers.delete(id),onActiveNotes:(ids,barIndex)=>updates.push({ids,time,barIndex})}));
  function advance(target) {
    assert(target>=time);let safety=100000;
    while(timers.size) {
      const [id,timer]=Array.from(timers).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];
      if(timer.due>target+1e-7)break;assert(--safety>0);timers.delete(id);time=Math.max(time,timer.due);timer.fn();
    }
    time=target;
  }
  return {playback,player,played,updates,timers,stale,advance,stallTo(target) {assert(target>=time);time=target;advance(target);},get maxPending(){return maxPending;},get time(){return time;}};
}
let checks=0;
function test(name,run) {run();checks++;console.log('✓ '+name);}
test('audio attacks and releases stay exact through a 180ms main-thread stall',()=>{
  const value=score(2);value.bpm=170;
  value.parts[0].measures.forEach((bar,barIndex)=>{bar.events=Array.from({length:16},(_,index)=>note('fast-'+barIndex+'-'+index,index/2,'sixteenth',48+index%12));});
  const f=fixture(value);assert(f.playback.start());f.advance(80);f.stallTo(260);f.advance(f.playback.getDuration());
  assert.strictEqual(f.played.length,32);
  const events=f.playback.getTimeline().events.filter(event=>event.value!==null);
  events.forEach((event,index)=>{
    assert(Math.abs(f.played[index].startMs-event.startMs)<1e-7,'written onset survives stall');
    assert(Math.abs(f.played[index].endMs-event.startMs-event.durationMs)<1e-7,'release uses audio clock');
    assert(f.played[index].scheduledAt<=event.startMs+1e-7,'source queued before onset');assert.strictEqual(f.played[index].offset,0);
  });
  assert(f.maxPending<=3);assert.strictEqual(f.timers.size,0);
});
test('a stall longer than lookahead skips expired attacks and resumes only the current sample decay',()=>{
  const value=score();value.bpm=170;value.parts[0].measures[0].events=Array.from({length:16},(_,index)=>note('n-'+index,index/2,'sixteenth',48+index%12));
  const f=fixture(value);f.playback.start();f.stallTo(800);
  const late=f.played.filter(sample=>sample.scheduledAt===800);
  assert.strictEqual(late.filter(sample=>sample.startMs===800).length,1,'one currently held note, no burst of missed attacks');
  assert.strictEqual(late[0].value,57);assert(late[0].offset>0);assert(late[0].offset<.01);
  assert(!f.played.some(sample=>sample.value===52||sample.value===53||sample.value===54||sample.value===55||sample.value===56));
  f.advance(f.playback.getDuration());assert.strictEqual(f.timers.size,0);
});
test('ties, full and half pedal have scheduled lifetimes and resumed octave offsets',()=>{
  let value=score();value.parts[0].measures[0].events=[note('a',0,'quarter',76,{pedal:'down'}),note('b',2,'quarter',76),note('c',4,'quarter',52),
    {id:'up',kind:'rest',noteValue:'quarter',startSlot:6,pitch:null,pedal:'up'}];
  value=ties.connectWorkshopTies(value,['a','b']);const f=fixture(value);f.playback.start();f.advance(2500);
  assert.strictEqual(f.played.length,2);assert.deepStrictEqual(f.played.map(sample=>[sample.startMs,sample.endMs]),[[0,3000],[2000,3000]]);
  f.playback.pause();assert(f.played.every(sample=>sample.cancelled));assert.strictEqual(f.timers.size,0);f.advance(5000);f.playback.resume();
  assert.deepStrictEqual(f.played.slice(2).map(sample=>[sample.value,sample.offset,sample.startMs,sample.endMs]),[[76,5,5000,5500],[52,.5,5000,5500]]);
  f.advance(6500);assert.strictEqual(f.timers.size,0);
  const half=score();half.parts[0].measures[0].events=[note('half',0,'quarter',48)];
  half.parts[0].measures[0].directions=[{id:'half-direction',type:'pedal',value:'half',startSlot:0}];
  const h=fixture(half);h.playback.start();assert.strictEqual(h.played[0].endMs,1300);h.playback.seek(1200);
  assert.strictEqual(h.played[1].offset,1.2);assert.strictEqual(h.played[1].endMs,100);h.playback.stop();assert.strictEqual(h.timers.size,0);
});
test('output latency keeps visual notes behind queued audio and transport cancels future sources',()=>{
  const value=score();value.parts[0].measures[0].events=[note('first'),note('second',2)];
  const f=fixture(value,{delayMs:200});f.playback.start();assert.strictEqual(f.played[0].startMs,0);assert.strictEqual(f.updates.length,0);
  f.advance(200);assert.deepStrictEqual(f.updates[f.updates.length-1].ids,['first']);assert.strictEqual(f.playback.getPosition(),0);
  f.advance(900);assert.strictEqual(f.played.length,2);const queued=f.played[1];assert.strictEqual(queued.startMs,1000);
  assert.strictEqual(f.playback.getPosition(),700);f.playback.seek(1500);assert(queued.cancelled);
  assert.strictEqual(f.played[2].offset,.5);assert.strictEqual(f.played[2].startMs,900);assert.strictEqual(f.playback.getPosition(),1500);
  const count=f.played.length;f.playback.stop();f.stale.forEach(fn=>fn());assert.strictEqual(f.played.length,count);assert.strictEqual(f.timers.size,0);
});
test('tied dynamics use audio-clock volume automation instead of reattacking',()=>{
  let value=score();value.parts[0].measures[0].dynamic='p';value.parts[0].measures[0].events=[note('a'),note('b',2)];
  value.parts[0].measures[0].directions=[{id:'louder',type:'dynamic',value:'f',startSlot:2}];value=ties.connectWorkshopTies(value,['a','b']);
  const f=fixture(value);f.playback.start();assert.strictEqual(f.played.length,1);assert.strictEqual(f.played[0].volume,35);
  assert.deepStrictEqual(f.played[0].changes,[{volume:85,time:1000}]);assert.strictEqual(f.played[0].endMs,2000);f.playback.stop();
});
test('explicit gaps and tied grace notes sustain their target once without crossing a repeat jump',()=>{
  const gap=score();gap.parts[0].measures[0].events=[note('a'),note('intervening',2,'quarter',50),note('b',4)];
  gap.ties=[{fromId:'a',toId:'b',sustainAcrossGap:true}];assert(model.isValidWorkshopScore(gap));
  const g=fixture(gap);g.playback.start();g.advance(3000);
  assert.deepStrictEqual(g.played.map(sample=>[sample.value,sample.startMs,sample.endMs]),[[48,0,3000],[50,1000,2000]]);g.playback.stop();
  const grace=score();grace.parts[0].measures[0].events=[note('grace-a',0,'eighth',48,{grace:true}),note('grace-other',0,'eighth',50,{grace:true}),note('main')];
  grace.ties=[{fromId:'grace-a',toId:'main'}];assert(model.isValidWorkshopScore(grace));
  const h=fixture(grace);h.playback.start();h.advance(1000);assert.strictEqual(h.played.length,2);
  assert.deepStrictEqual(h.played.map(sample=>[sample.value,Math.round(sample.startMs),Math.round(sample.endMs)]),[[48,0,1000],[50,60,120]]);h.playback.stop();
  const repeat=score(3);repeat.parts[0].measures[0].events=[note('source')];repeat.parts[0].measures[2].events=[note('target')];
  repeat.parts[0].measures[0].repeatStart=true;repeat.parts[0].measures[1].repeatEnd=2;repeat.ties=[{fromId:'source',toId:'target',sustainAcrossGap:true}];
  const r=fixture(repeat);r.playback.start();r.advance(r.playback.getDuration());
  assert.deepStrictEqual(r.played.map(sample=>[sample.startMs,sample.endMs]),[[0,1000],[8000,17000]]);
});
if(process.env.WORKSHOP_MOONLIGHT_SCORE) test('the supplied 201-bar Moonlight score schedules every repeated attack across its full pitch range',()=>{
  const imported=JSON.parse(fs.readFileSync(process.env.WORKSHOP_MOONLIGHT_SCORE,'utf8')),value=imported.score||imported,f=fixture(value);
  assert.strictEqual(value.parts[0].measures.length,201);f.playback.start();f.advance(f.playback.getDuration());
  assert.strictEqual(f.playback.getTimeline().measures.length,264);assert.strictEqual(f.played.length,value.ties.length===164?6450:6481);
  assert.strictEqual(Math.min(...f.played.map(sample=>sample.value)),17);assert.strictEqual(Math.max(...f.played.map(sample=>sample.value)),76);
  assert(f.played.every(sample=>sample.startMs>=sample.scheduledAt-1e-7&&sample.offset===0&&sample.endMs>sample.startMs));
  assert(f.maxPending<=3);assert.strictEqual(f.timers.size,0);assert.strictEqual(f.playback.getPositionState().barIndex,200);
});
console.log(checks+' workshop audio-clock scheduler checks passed.');
