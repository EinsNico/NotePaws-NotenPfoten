const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");

function storage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key(index) { return Array.from(entries.keys())[index] || null; },
    getItem(key) { return entries.has(key) ? entries.get(key) : null; },
    setItem(key,value) { entries.set(key,String(value)); }, removeItem(key) { entries.delete(key); } };
}
if (!global.localStorage) global.localStorage = storage();
const sourceRoot = path.resolve(__dirname,"../src") + path.sep;
const originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,"utf8"),{ babelrc:false,
    presets:[["env",{ modules:"commonjs" }]] }).code,filename);
};
const model = require("../src/model/Workshop");
const store = require("../src/model/WorkshopStorage");
const backup = require("../src/model/SaveDataBackup");
const imports = require("../src/model/SaveDataImport");
const files = require("../src/model/SaveDataFiles");
const { SaveDataStreamReader } = require("../src/model/SaveDataStreamReader");
const { prepareStagedLocalSaveDataPlan } = require("../src/model/SaveDataShadowLocalPlan");
const { prepareMergedLocalSaveDataPlan } = require("../src/model/SaveDataLargeMergeLocalPlan");
const { createWorkshopPlayback } = require("../src/model/WorkshopPlayback");
const { createPianoSamplePlayer } = require("../src/model/PianoAudio");

function test(name,callback) { callback(); process.stdout.write("✓ "+name+"\n"); }
function note(value,noteValue,startSlot) {
  return { id:model.workshopId("note"),kind:"note",noteValue,startSlot,pitch:model.workshopPitchFromValue(value) };
}
function rest(noteValue,startSlot) { return { id:model.workshopId("rest"),kind:"rest",noteValue,startSlot,pitch:null }; }
function twoStaves() {
  let score = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("Two staves",3).score,true);
  score = model.setWorkshopMeasureContext(score,1,{ meter:"3/4",clef:"bass" });
  score = model.setWorkshopMeasureContext(score,2,{ meter:"6/8",clef:"treble" });
  score = model.setWorkshopMeasureContext(score,1,{ clef:"treble" },1);
  score = model.setWorkshopMeasureContext(score,2,{ clef:"bass" },1);
  score.parts[0].measures[0].events = [note(48,"half",0),note(52,"eighth",6)];
  score.parts[1].measures[0].events = [note(24,"quarter",0),rest("quarter",2),note(31,"half",4)];
  score.parts[0].measures[1].events = [note(55,"quarter",0),note(57,"eighth",4)];
  score.parts[1].measures[1].events = [note(36,"half",0),rest("quarter",4)];
  score.parts[0].measures[2].events = [note(60,"sixteenth",.5)];
  score.parts[1].measures[2].events = [note(28,"eighth",0)];
  assert(model.isValidWorkshopScore(score));
  return score;
}
function audioClock() {
  let time = 0; let timerId = 0;
  const timers = new Map(); const allCallbacks = []; const samples = [];
  class FakeAudio {
    constructor(src) { this.src=src; this.value=Number(src.match(/(\d+)\.mp3$/)[1]); this.currentTime=1;
      this.paused=false; this.stops=[]; samples.push(this); }
    addEventListener() {}
    play() { this.startedAt=time; this.paused=false; return { catch() {} }; }
    pause() { this.paused=true; this.stops.push(time); }
  }
  const clock = {
    nowFn() { return time; },
    setTimeoutFn(callback,delay) { const id=++timerId; timers.set(id,{ callback,due:time+delay }); allCallbacks.push(callback); return id; },
    clearTimeoutFn(id) { timers.delete(id); },
    advance(target) {
      assert(target >= time);
      let limit=10000;
      while (true) {
        const ready=Array.from(timers.entries()).filter(entry => entry[1].due <= target)
          .sort((left,right) => left[1].due-right[1].due || left[0]-right[0]);
        if (!ready.length) break;
        assert(--limit > 0,"timer loop");
        const [id,timer]=ready[0]; timers.delete(id); time=timer.due; timer.callback();
      }
      time=target;
    },
    timers,samples,allCallbacks,
    player:createPianoSamplePlayer({ AudioConstructor:FakeAudio,maxVoices:128 })
  };
  return clock;
}
function playbackFixture(score,options = {}) {
  const clock=audioClock(); const steps=[]; const active=[];
  clock.playback=createWorkshopPlayback(score,clock.player,Object.assign({},clock,options,{
    appVolume:37,onStep(event) { steps.push(Object.assign({},event)); },
    onActiveNotes(ids,barIndex) { active.push({ ids:ids.slice(),barIndex }); }
  }));
  clock.steps=steps; clock.active=active; return clock;
}
function last(values) { return values[values.length-1]; }

async function run() {
  test("both staves play synchronously with independent real sample durations and shared changing meters",() => {
    const score=twoStaves(); const original=JSON.stringify(score); const clock=playbackFixture(score);
    assert(clock.playback.start());
    assert.deepStrictEqual(clock.samples.map(sample => [sample.value,sample.startedAt]),[[48,0],[24,0]]);
    assert.deepStrictEqual(clock.steps.filter(event => event.value !== null).map(event => event.partIndex),[0,1]);
    const treble=score.parts[0].measures[0].events[0]; const bass=score.parts[1].measures[0].events[0];
    assert.deepStrictEqual(last(clock.active).ids,[treble.id,bass.id]);
    assert.strictEqual(clock.samples[0].volume,clock.samples[1].volume); assert(clock.samples[0].volume > 0);
    clock.advance(1000);
    assert.strictEqual(clock.samples[0].paused,false,"bass rest must not stop held treble note");
    assert(clock.samples[1].paused); assert.strictEqual(clock.samples[1].currentTime,0);
    assert.deepStrictEqual(last(clock.active).ids,[treble.id]);
    clock.advance(2000); assert(clock.samples[0].paused);
    assert.deepStrictEqual(clock.samples.map(sample => [sample.value,sample.startedAt]),[[48,0],[24,0],[31,2000]]);
    clock.advance(4000);
    assert(clock.samples[2].paused); assert.strictEqual(last(clock.active).barIndex,1);
    assert.deepStrictEqual(clock.samples.slice(-2).map(sample => [sample.value,sample.startedAt]),[[55,4000],[36,4000]]);
    clock.advance(6000); assert(clock.samples.find(sample => sample.value === 36).paused);
    assert(!clock.samples.find(sample => sample.value === 57).paused);
    clock.advance(7000); assert.strictEqual(last(clock.active).barIndex,2);
    assert.deepStrictEqual(last(clock.samples).value,28);
    clock.advance(7250); assert.strictEqual(last(clock.samples).value,60);
    clock.advance(7500); assert(last(clock.samples).paused); assert.deepStrictEqual(last(clock.active).ids,[]);
    clock.advance(10000); assert(!clock.playback.isPlaying()); assert.strictEqual(clock.timers.size,0);
    assert.strictEqual(JSON.stringify(score),original);
  });

  test("selected-bar playback rebases both staves while retaining original event and part identities",() => {
    const score=twoStaves(); const clock=playbackFixture(score,{ barIndex:1 });
    assert(clock.playback.start());
    assert.deepStrictEqual(clock.samples.map(sample => [sample.value,sample.startedAt]),[[55,0],[36,0]]);
    assert(clock.steps.every(event => event.barIndex === 1 && [0,1].includes(event.partIndex)));
    assert.deepStrictEqual(clock.steps.filter(event => event.value !== null).map(event => event.id),
      [score.parts[0].measures[1].events[0].id,score.parts[1].measures[1].events[0].id]);
    clock.advance(2000); assert(clock.samples.find(sample => sample.value === 36).paused);
    assert.deepStrictEqual(last(clock.samples).value,57);
    clock.advance(3000); assert(!clock.playback.isPlaying()); assert(clock.samples.every(sample => sample.paused));
    assert(clock.samples.every(sample => [55,36,57].includes(sample.value)),"neighboring bars never play");
    const invalid=playbackFixture(score,{ barIndex:3 }); assert.strictEqual(invalid.playback.start(),false);
    assert.strictEqual(invalid.samples.length,0); assert.strictEqual(invalid.timers.size,0);
  });

  test("hiding the second stave mutes its samples and progress without destroying pitches, clefs or notes",() => {
    const score=twoStaves(); const second=JSON.stringify(score.parts[1]);
    const hidden=model.setWorkshopSecondStaffEnabled(score,false);
    const clock=playbackFixture(hidden,{ barIndex:1 }); assert(clock.playback.start()); clock.advance(3000);
    assert.deepStrictEqual(clock.samples.map(sample => sample.value),[55,57]);
    assert(clock.steps.every(event => event.partIndex === 0));
    const restored=model.setWorkshopSecondStaffEnabled(hidden,true);
    assert.strictEqual(JSON.stringify(restored.parts[1]),second);
    assert.strictEqual(JSON.stringify(score.parts[1]),second);
    assert.deepStrictEqual(model.workshopTimeline(restored).events,model.workshopTimeline(score).events);
  });

  test("stopping and restarting two-stave playback cancels every old callback and sounding sample",() => {
    const clock=playbackFixture(twoStaves()); assert(clock.playback.start());
    const stale=clock.allCallbacks.slice(); const steps=clock.steps.length;
    clock.playback.stop(); assert(clock.samples.every(sample => sample.paused)); assert.strictEqual(clock.timers.size,0);
    stale.forEach(callback => callback()); assert.strictEqual(clock.samples.length,2); assert.strictEqual(clock.steps.length,steps);
    assert(clock.playback.start()); const samples=clock.samples.length;
    stale.forEach(callback => callback()); assert.strictEqual(clock.samples.length,samples);
    assert.deepStrictEqual(last(clock.active).ids,clock.steps.slice(-2).map(event => event.id));
    clock.playback.stop(); assert(clock.samples.every(sample => sample.paused));
  });

  const persisted=storage(); const legacy=model.createWorkshopDraft("Saved staves",3);
  legacy.score.parts[0].measures[0].events=[note(48,"quarter",0)];
  const first=store.storeWorkshopDraft(legacy,persisted); const legacyJson=JSON.stringify(first.piece.revisions[0].score);
  const edited=model.openWorkshopPiece(first.piece); edited.score=twoStaves();
  const active=store.storeWorkshopDraft(edited,persisted);
  const hidden=model.openWorkshopPiece(active.piece); hidden.score=model.setWorkshopSecondStaffEnabled(hidden.score,false);
  const saved=store.storeWorkshopDraft(hidden,persisted); const expected=store.readWorkshopLibrary(persisted);
  const exported=backup.createSaveDataBackup(persisted);
  test("stored revisions preserve old one-stave scores and every hidden second-stave event and clef",() => {
    assert.strictEqual(saved.piece.revisions.length,3); assert.strictEqual(JSON.stringify(saved.piece.revisions[0].score),legacyJson);
    assert.strictEqual(model.openWorkshopPiece(saved.piece,first.piece.currentRevisionId).score.parts.length,1);
    const oldActive=model.openWorkshopPiece(saved.piece,active.piece.currentRevisionId).score;
    assert.strictEqual(oldActive.parts.length,2); assert(oldActive.parts[1].enabled !== false);
    const current=model.openWorkshopPiece(saved.piece).score; assert.strictEqual(current.parts[1].enabled,false);
    assert.deepStrictEqual(current.parts[1].measures,oldActive.parts[1].measures);
    assert.deepStrictEqual([0,1,2].map(index => model.workshopMeasureContext(current,index,1).clef),["bass","treble","bass"]);
    assert(backup.validateSaveDataBackup(exported).valid);
  });

  test("app backup replacement and merging leave local active and hidden stave revisions untouched",() => {
    const target=storage(); target.setItem(model.WORKSHOP_STORAGE_KEY,persisted.getItem(model.WORKSHOP_STORAGE_KEY)); target.setItem("unrelated","keep");
    imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,exported,"replace"));
    assert.deepStrictEqual(store.readWorkshopLibrary(target),expected); assert.strictEqual(target.getItem("unrelated"),"keep");
    const local=store.storeWorkshopDraft(model.createWorkshopDraft("Local piece"),target);
    for (const mode of ["merge","merge"]) {
      imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,exported,mode));
      const library=store.readWorkshopLibrary(target); assert.strictEqual(library.pieces.length,2);
      assert.deepStrictEqual(library.pieces.find(piece => piece.id === saved.piece.id),saved.piece);
      assert(library.pieces.some(piece => piece.id === local.piece.id));
    }
    const corrupt=model.cloneWorkshop(exported); corrupt.version=5; corrupt.data.workshopLibrary=model.cloneWorkshop(expected);
    corrupt.data.workshopLibrary.pieces[0].revisions[2].score.parts[1].measures[1].meter="2/4";
    assert.strictEqual(backup.validateSaveDataBackup(corrupt).valid,false);
    const before=target.getItem(model.WORKSHOP_STORAGE_KEY);
    assert.throws(() => imports.prepareSaveDataImport(target,corrupt,"replace"));
    assert.strictEqual(target.getItem(model.WORKSHOP_STORAGE_KEY),before);
    const legacyStore=storage(); legacyStore.setItem(model.WORKSHOP_STORAGE_KEY,JSON.stringify({ data:first.library }));
    const legacyBackup=backup.createSaveDataBackup(legacyStore); legacyBackup.version=5; legacyBackup.data.workshopLibrary=first.library; assert(backup.validateSaveDataBackup(legacyBackup).valid);
    imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,legacyBackup,"replace"));
    assert.strictEqual(JSON.stringify(store.readWorkshopLibrary(target).pieces[0].revisions[0].score),legacyJson);
    const oldest=backup.createSaveDataBackup(storage()); delete oldest.data.workshopLibrary;
    assert(backup.validateSaveDataBackup(oldest).valid);
    imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,oldest,"replace"));
    assert.strictEqual(target.getItem(model.WORKSHOP_STORAGE_KEY),before);
  });

  const exportOptions={
    learningStorage:{ async flush() {},getStatus() { return { failedWrites:0 }; },
      async verifyHistoryReady() { return { saved:true,verified:true }; },async migrateLegacyHistory() { return { saved:true,verified:true }; },
      async synchronizeProgress() { return { saved:true }; },async readDailyTaskHistory() { return { saved: true, history: null }; },
      async readBackupSnapshot() { return { saved:true,progress:{ version:3,notes:{} },attempts:[] }; },
      async readProgress() { return { saved:true,progress:{ version:3,notes:{} } }; },
      async readBackupAttemptsPage() { return { saved:true,page:{ records:[],done:true } }; } },
    noteFlowStorage:{ async flush() {},async readRoundsForExport() { return { saved:true,rounds:[] }; },
      async readRoundsPage() { return { saved:true,page:{ records:[],done:true } }; } },
    rhythmStorage:{ async flush() {},async readBarsForExport() { return { saved:true,bars:[] }; },
      async readBarsPage() { return { saved:true,page:{ records:[],done:true } }; } },
    includeNoteFlowRounds:true,includeRhythmSenseBars:true
  };
  const full=await files.createIndexedDbSaveDataBackup(persisted,exportOptions);
  assert.strictEqual(full.data.workshopLibrary,undefined);
  const chunks=[]; await files.streamIndexedDbSaveDataBackup(async chunk => { chunks.push(chunk); },persisted,exportOptions);
  const json=chunks.join(""); const streamed=JSON.parse(json);
  assert(backup.validateSaveDataBackup(streamed).valid); assert.strictEqual(streamed.data.workshopLibrary,undefined);
  const reader=new SaveDataStreamReader(() => { throw new Error("No large collections expected"); });
  for (let index=0;index<json.length;index+=17) reader.push(json.slice(index,index+17));
  const read=reader.finish(); const metadata={ key:"ready",shell:read.backup,counts:read.counts };
  const summary={ source:{ createdAt:read.backup.createdAt,fileSize:null },
    rounds:{ "screen:note-flow":0,"midi:note-flow":0,"midi:note-flow-chords":0,"rhythm:taktgefuehl":0 },
    attempts:{ "screen:single-notes":0,"midi:single-notes":0 },progress:{},activeGuard:"test" };
  const marker={ state:"database-verified",summary };
  const staging={ async readMetadata() { return metadata; },async readBatch() { return { records:[],nextIndex:0,total:0,done:true }; } };
  const shadow={ name:"noten-pfoten-learning-import-workshop-two-staves-test",
    database:{ async readImportGenerationMarker() { return marker; },async readProgressSnapshot() { return []; } } };
  const replacement=await prepareStagedLocalSaveDataPlan(staging,shadow);
  assert.strictEqual(replacement.values[model.WORKSHOP_STORAGE_KEY],undefined);
  const target=storage(); const local=store.storeWorkshopDraft(model.createWorkshopDraft("Local staged piece"),target);
  marker.state="preparing";
  const merged=await prepareMergedLocalSaveDataPlan(staging,shadow,summary,target);
  assert.strictEqual(merged.values[model.WORKSHOP_STORAGE_KEY],undefined);
  assert.deepStrictEqual(store.readWorkshopLibrary(target),local.library);
  process.stdout.write("✓ complete and streamed exports plus staged plans exclude local hidden staves and clefs\n");
}
module.exports=run;
if (require.main === module) run().catch(error => { console.error(error); process.exitCode=1; });
