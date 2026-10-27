const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module"), babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");
const root = path.resolve(__dirname, "../src") + path.sep, original = Module._extensions[".js"];
Module._extensions[".js"] = (module, filename) => filename.startsWith(root)
  ? module._compile(babel.transform(fs.readFileSync(filename, "utf8"), { babelrc:false, presets:[["env", {modules:"commonjs"}]] }).code, filename)
  : original(module, filename);
const Options = require("../src/model/Options").default;
const { createAppSoundController, getAppAudioDestination, refreshAppSound } = require("../src/model/AppSound");
const { createPianoSamplePlayer } = require("../src/model/PianoAudio");
const { createWorkshopPianoPlayer } = require("../src/model/WorkshopPianoAudio");
const { createWorkshopPracticeMetronome } = require("../src/model/WorkshopPracticeMetronome");
const { createAudioCalibration } = require("../src/model/AudioCalibration");
const { createNoteFlowPreviewAudition } = require("../src/model/NoteFlowPreviewAudition");
const { createNoteFlowChordAudition } = require("../src/model/NoteFlowChordAudition");
Module._extensions[".js"] = original;

const tests = []; function test(name, run) { tests.push([name, run]); }
function context() {
  const gains = [], sources = [];
  function source() {
    const value = { frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}}, playbackRate:{value:1},
      connect(to) { this.destination = to; }, disconnect() { this.disconnected = true; },
      start(at) { this.at = at; }, stop() {} };
    sources.push(value); return value;
  }
  return { currentTime:1, state:"running", destination:{}, gains, sources,
    createGain() {
      const node = { gain:{value:1, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(){}, exponentialRampToValueAtTime(){}},
        connect(to) { this.destination = to; }, disconnect() { this.disconnected = true; } };
      gains.push(node); return node;
    },
    createOscillator:source, createBufferSource:source, createMediaElementSource:source,
    decodeAudioData(bytes, resolve) { resolve({duration:8}); }
  };
}
class Sample {
  constructor(src) { this.src = src; this.played = 0; this.paused = false; this.listeners = {}; }
  play() { this.played++; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  removeEventListener(name) { delete this.listeners[name]; }
}
function timers() {
  let clock = 0, next = 0; const pending = new Map();
  return { now:()=>clock,
    set(fn, delay) { const id=++next; pending.set(id, {at:clock+delay,fn}); return id; },
    clear(id) { pending.delete(id); },
    advance(end) {
      for (;;) {
        const first = Array.from(pending).sort((a,b)=>a[1].at-b[1].at || a[0]-b[0])[0];
        if (!first || first[1].at > end) break;
        clock = first[1].at; pending.delete(first[0]); first[1].fn();
      }
      clock = end;
    }
  };
}
test("one master per context mutes already queued envelopes and every tracked fallback immediately", () => {
  let enabled = true; const master = createAppSoundController(()=>enabled), first=context(), second=context();
  const output=master.destination(first), other=master.destination(second), media={volume:.7};
  const release=master.trackMedia(media);
  assert.strictEqual(master.destination(first), output); assert.strictEqual(first.gains.length,1);
  assert.strictEqual(output.destination,first.destination); assert.strictEqual(media.muted,false);
  enabled=false; master.refresh();
  assert.strictEqual(output.gain.value,0); assert.strictEqual(other.gain.value,0); assert.strictEqual(media.muted,true);
  media.volume=1; assert.strictEqual(media.muted,true,"expressive volume cannot bypass mute");
  enabled=true; master.refresh(); assert.strictEqual(output.gain.value,1); assert.strictEqual(media.muted,false); assert.strictEqual(media.volume,1);
  release(); enabled=false; master.refresh(); assert.strictEqual(media.muted,false,"released elements are no longer retained");
  second.state="closed"; master.refresh(); assert.strictEqual(other.disconnected,true);
});
test("legacy feedback switches cannot suppress input or bypass the global mute", () => {
  const player=createPianoSamplePlayer({AudioConstructor:Sample, feedback:true,
    audioSynchronization:{getContext:()=>null,getSettings:()=>({feedbackSound:false})}});
  Options.sound=true; refreshAppSound(); const feedback=player.play(48,35,{feedback:true});
  assert(feedback); assert.strictEqual(feedback.played,1); assert.strictEqual(feedback.muted,false); assert.strictEqual(feedback.volume,.35);
  Options.sound=false; refreshAppSound(); assert.strictEqual(feedback.muted,true);
  const preview=player.play(52,100,{feedback:false}); assert.strictEqual(preview.played,1); assert.strictEqual(preview.muted,true);
  Options.sound=true; refreshAppSound(); assert.strictEqual(preview.muted,false); assert.strictEqual(feedback.volume,.35);
  player.stopAll();
});
test("media routing, decoded piano, calibration and metronome share the same output gate", async () => {
  Options.sound=false; refreshAppSound(); const audio=context(), sync={getContext:()=>audio};
  const mediaPlayer=createPianoSamplePlayer({AudioConstructor:Sample,audioSynchronization:sync});
  mediaPlayer.play(48,80); const output=getAppAudioDestination(audio);
  assert.strictEqual(audio.sources[0].destination,output);
  const decoded=createWorkshopPianoPlayer({audioSynchronization:sync,fetchFn:async()=>({arrayBuffer:async()=>new ArrayBuffer(8)})});
  await decoded.prepare([48]); const voice=decoded.play(48,80,{whenSeconds:4});
  const pianoSource=audio.sources[audio.sources.length-1];
  assert.strictEqual(pianoSource.at,4); assert.strictEqual(pianoSource.destination.destination,output);
  voice.volume=1; assert.strictEqual(output.gain.value,0);
  const timer=timers(), click=createWorkshopPracticeMetronome({beats:[{startMs:0,accent:true}]},
    {context:audio,setTimeoutFn:timer.set,clearTimeoutFn:timer.clear});
  click.start(0); assert.strictEqual(audio.sources[audio.sources.length-1].destination.destination,output);
  const calibration=createAudioCalibration({context:audio,now:()=>1000,setTimeout:timer.set,clearTimeout:timer.clear});
  assert.strictEqual(calibration.start(),true);
  assert.strictEqual(audio.sources[audio.sources.length-1].destination.destination,output);
  assert.strictEqual(output.gain.value,0,"all current and future sources remain muted");
  Options.sound=true; refreshAppSound(); assert.strictEqual(output.gain.value,1);
  click.destroy(); calibration.stop(); decoded.stopAll(); mediaPlayer.stopAll();
});
test("muting changes only audio output: melody and chord auditions keep their timing and finish", () => {
  Options.sound=false; refreshAppSound(); const player=createPianoSamplePlayer({AudioConstructor:Sample});
  const timer=timers(), highlights=[];
  const melody=createNoteFlowPreviewAudition({durationMs:1000,events:[
    {kind:"note",startMs:0,endMs:500,note:{value:48}}, {kind:"note",startMs:500,endMs:1000,note:{value:52}}
  ]},{player,appVolume:80,setTimeoutFn:timer.set,clearTimeoutFn:timer.clear,onActiveNotes:notes=>highlights.push(notes)});
  assert(melody.start()); assert.strictEqual(player.getActiveVoiceCount(),1);
  timer.advance(500); assert.deepStrictEqual(highlights[highlights.length-1],[1]);
  timer.advance(1000); assert.strictEqual(melody.isPlaying(),false); assert.strictEqual(player.getActiveVoiceCount(),0);
  const steps=[], chords=createNoteFlowChordAudition({blocks:[{chords:[{values:[48,52,55]},{values:[50,53,57]}]}]},
    {player,stepMs:500,setTimeoutFn:timer.set,clearTimeoutFn:timer.clear,onStep:(chord,index)=>steps.push(index)});
  assert(chords.start()); timer.advance(2000); assert.deepStrictEqual(steps,[1,2]); assert.strictEqual(chords.isPlaying(),false);
  player.stopAll();
});
test("mode-specific sound preferences and feedback toggles no longer gate gameplay or appear in menus", () => {
  const read=name=>fs.readFileSync(path.resolve(__dirname,"../src/components",name+".vue"),"utf8");
  for(const name of ["Menu","AdaptiveMenu","NoteFlowMenu"]) assert(!/v-model="(?:options|previewOptions)\.sound"/.test(read(name)),name);
  for(const name of ["Game","NoteFlowStaffPreview","NoteFlowRhythmPreview","WorkshopPractice","RhythmSense"])
    assert(!/if\s*\([^\n]*(?:options\.sound|soundEnabled|feedbackSound)/.test(read(name)),name);
  assert(!read("AudioSyncSettings").includes("AUDIO_SYNC_FEEDBACK"));
});
(async()=>{for(const[name,run]of tests){await run();process.stdout.write("✓ "+name+"\n");}})().catch(error=>{console.error(error);process.exitCode=1;});
