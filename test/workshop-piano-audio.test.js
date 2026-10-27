const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const root=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>filename.startsWith(root)
  ? mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename)
  : original(mod,filename);
const {createWorkshopPianoPlayer}=require('../src/model/WorkshopPianoAudio');
const tests=[];function test(name,run){tests.push([name,run]);}
function fixture(options={}) {
  const loads=[],decodes=[],sources=[],gains=[],live=new Set();let fallbackPlays=0;
  const fallback={play(){fallbackPlays++;return {pause(){}};},stopAll(){},getActiveVoiceCount(){return 0;}};
  const context={currentTime:0,destination:{},
    decodeAudioData(bytes,resolve){decodes.push(bytes);const buffer={duration:8};resolve(buffer);return Promise.resolve(buffer);},
    createGain(){const gain={gain:{value:1},connect(to){this.destination=to;},disconnect(){this.disconnected=true;}};gains.push(gain);return gain;},
    createBufferSource(){const source={playbackRate:{value:1},connect(){},disconnect(){this.disconnected=true;},
      start(when,offset){this.when=when;this.offset=offset;live.add(this);},stop(when){this.stopWhen=when;if(when===undefined)live.delete(this);}};sources.push(source);return source;}};
  const sync={getContext:()=>context};
  const player=createWorkshopPianoPlayer(Object.assign({audioSynchronization:sync,fallbackPlayer:fallback,allowFractionalPitch:true,maxVoices:4,
    fetchFn:async url=>{loads.push(url);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};}},options));
  return {player,context,loads,decodes,sources,gains,live,sync,get fallbackPlays(){return fallbackPlays;}};
}
test('preloads and decodes each required pitch once, including quarter tones and octave-folded samples',async()=>{
  const f=fixture();await f.player.prepare([48,48.5,55,84,null]);await f.player.prepare([48.5,55]);
  assert.deepStrictEqual(f.loads.sort(),['static/samples/piano/48.mp3','static/samples/piano/55.mp3','static/samples/piano/60.mp3']);
  assert.strictEqual(f.decodes.length,3);assert.strictEqual(f.sources.length,0);
  const note=f.player.play(48.5,35);assert(note);assert.strictEqual(f.gains[0].gain.value,.35);
  assert(Math.abs(f.sources[0].playbackRate.value-Math.pow(2,.5/12))<1e-12);
  f.player.stopAll();
});
test('1603 attacks use cached buffers and keep only concurrent voices connected',async()=>{
  const f=fixture();await f.player.prepare([48,52,55,60]);const held=[];
  for(let i=0;i<1603;i++){
    if(held.length===4)f.player.stop(held.shift());held.push(f.player.play([48,52,55,60][i%4],80));
    assert.strictEqual(f.live.size,held.length);assert.strictEqual(f.player.getActiveVoiceCount(),held.length);
  }
  assert.strictEqual(f.loads.length,4);assert.strictEqual(f.decodes.length,4);assert.strictEqual(f.sources.length,1603);
  f.player.stopAll();assert.strictEqual(f.live.size,0);assert(f.sources.every(source=>source.disconnected));
  assert(f.gains.filter(gain=>gain.destination!==f.context.destination).every(gain=>gain.disconnected));
  assert.strictEqual(f.gains.filter(gain=>gain.destination===f.context.destination).length,1,'one shared master stays available across pieces');
  assert.strictEqual(f.fallbackPlays,0);
});
test('full imported pitch range keeps written octaves and quarter-tone sample age',async()=>{
  const f=fixture();await f.player.prepare([17,71,72,76,84.5]);
  [[17,1],[71,1],[72,2],[76,2],[84.5,Math.pow(2,24.5/12)]].forEach(([value,expectedRate])=>{
    const note=f.player.play(value,60);assert(note);
    const source=f.sources[f.sources.length-1];
    assert(Math.abs(source.playbackRate.value-expectedRate)<1e-12);
    assert.strictEqual(f.player.getPlaybackRate(value),source.playbackRate.value);f.player.stop(note);
  });
  const high=f.player.play(76,60,{offsetSeconds:2});f.context.currentTime=.5;
  assert.strictEqual(high.currentTime,3);f.player.stopAll();
});
test('audio-clock attacks and releases stay queued until their scheduled time and can be cancelled',async()=>{
  const f=fixture();await f.player.prepare([48]);f.context.currentTime=1;
  const note=f.player.play(48,80,{whenSeconds:1.25,offsetSeconds:.5});
  assert.strictEqual(f.player.getAudioTime(),1000);assert.strictEqual(f.sources[0].when,1.25);
  assert.strictEqual(note.currentTime,.5);f.player.stop(note,{whenSeconds:1.75});
  assert.strictEqual(f.sources[0].stopWhen,1.75);assert.strictEqual(f.player.getActiveVoiceCount(),1);
  f.context.currentTime=1.5;assert.strictEqual(note.currentTime,.75);f.player.stopAll();
  assert.strictEqual(f.live.size,0);assert(note.paused);assert.strictEqual(f.sources[0].stopWhen,undefined);
});
test('the workshop voice budget retains dense pedalled passages without evicting still-decaying notes',async()=>{
  const f=fixture({maxVoices:256});await f.player.prepare([48]);const held=[];
  for(let index=0;index<185;index++)held.push(f.player.play(48,30,{whenSeconds:index/1000}));
  assert.strictEqual(f.player.getActiveVoiceCount(),185);assert(held.every(handle=>!handle.paused));
  f.player.stopAll();assert.strictEqual(f.player.getActiveVoiceCount(),0);assert(f.sources.every(source=>source.disconnected));
});
test('voice stealing, stale handles and natural endings cannot stop later notes',async()=>{
  const f=fixture({maxVoices:1});await f.player.prepare([48,55]);
  const first=f.player.play(48,80),second=f.player.play(55,50);
  assert(first.paused);first.pause();first.volume=0;assert.strictEqual(second.volume,.5);assert.strictEqual(f.live.size,1);
  f.sources[1].onended();assert(second.paused);assert.strictEqual(f.player.getActiveVoiceCount(),0);
  f.player.stopAll();
});
test('pause/resume starts at the recorded decay and repeated starts need no fresh decoding',async()=>{
  const f=fixture();await f.player.prepare([48]);const first=f.player.play(48,70);
  f.context.currentTime=2;assert.strictEqual(first.currentTime,2);f.player.stopAll();
  const resumed=f.player.play(48,70,{offsetSeconds:2});assert.strictEqual(f.sources[1].offset,2);
  assert.strictEqual(resumed.volume,.7);assert.strictEqual(f.loads.length,1);
  assert.strictEqual(f.player.play(48,70,{offsetSeconds:8}),null);f.player.stopAll();
});
test('load failures stop preparation and can be retried instead of starting a silent timeline',async()=>{
  let fail=true;const f=fixture({fetchFn:async()=>({ok:!fail,arrayBuffer:async()=>new ArrayBuffer(8)})});
  await assert.rejects(f.player.prepare([48]),/piano-sample-unavailable/);assert.strictEqual(f.sources.length,0);
  fail=false;await f.player.prepare([48]);assert(f.player.play(48,100));f.player.stopAll();
});
test('unsupported hosts preserve the existing player and do not attempt fetching',async()=>{
  const f=fixture();f.sync.getContext=()=>null;assert(await f.player.prepare([48]));
  assert(f.player.play(48,100));assert.strictEqual(f.fallbackPlays,1);assert.strictEqual(f.loads.length,0);
});
(async()=>{for(const [name,run] of tests){await run();process.stdout.write('✓ '+name+'\n');}})().catch(error=>{console.error(error);process.exitCode=1;});
