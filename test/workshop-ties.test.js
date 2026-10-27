const assert=require("assert");
const fs=require("fs");
const path=require("path");
const Module=require("module");
const babel=require("babel-core");
global.regeneratorRuntime=require("babel-runtime/regenerator");
function storage() {
  const data=new Map();
  return { get length() { return data.size; },key(index) { return Array.from(data.keys())[index] || null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },setItem(key,value) { data.set(key,String(value)); },removeItem(key) { data.delete(key); } };
}
if (!global.localStorage) global.localStorage=storage();
const sourceRoot=path.resolve(__dirname,"../src")+path.sep;
const originalLoader=Module._extensions[".js"];
Module._extensions[".js"]=(mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,"utf8"),{ babelrc:false,presets:[["env",{ modules:"commonjs" }]] }).code,filename);
};
const model=require("../src/model/Workshop");
const ties=require("../src/model/WorkshopTies");
const store=require("../src/model/WorkshopStorage");
const backup=require("../src/model/SaveDataBackup");
const imports=require("../src/model/SaveDataImport");
const files=require("../src/model/SaveDataFiles");
const { SaveDataStreamReader }=require("../src/model/SaveDataStreamReader");
const { prepareStagedLocalSaveDataPlan }=require("../src/model/SaveDataShadowLocalPlan");
const { prepareMergedLocalSaveDataPlan }=require("../src/model/SaveDataLargeMergeLocalPlan");
const { createWorkshopPlayback }=require("../src/model/WorkshopPlayback");
const { createPianoSamplePlayer }=require("../src/model/PianoAudio");
function test(name,operation) { operation(); process.stdout.write("✓ "+name+"\n"); }
function note(id,value,noteValue,startSlot,dots) {
  const result={ id,kind:"note",noteValue,startSlot,pitch:model.workshopPitchFromValue(value) };
  if (dots) result.dots=dots;
  return result;
}
function fixture() {
  let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("Held chords",2).score,true);
  score=model.setWorkshopMeasureContext(score,1,{ meter:"3/4",clef:"bass" });
  score=model.setWorkshopMeasureContext(score,1,{ clef:"treble" },1);
  score.parts[0].measures[0].events=[note("a",48,"quarter",0,1),note("e1",52,"quarter",0,1),
    note("b",48,"eighth",3),note("e2",52,"eighth",3),note("c",48,"half",4),note("e3",52,"half",4)];
  score.parts[0].measures[1].events=[note("d",48,"quarter",0),note("e4",52,"quarter",0)];
  score.parts[1].measures[0].events=[note("g1",43,"half",0),note("g2",43,"half",4)];
  score.parts[1].measures[1].events=[note("g3",43,"quarter",0)];
  assert(model.isValidWorkshopScore(score)); return score;
}
function linkedFixture() {
  const first=ties.connectWorkshopTies(fixture(),["e4","c","b","d","e1","a","e3","e2"]);
  const result=ties.connectWorkshopTies(first,["g3","g1","g2"]);
  assert(result && model.isValidWorkshopScore(result)); return result;
}
function edgeNames(score) { return (score.ties || []).map(edge => edge.fromId+">"+edge.toId).sort(); }
function clockPlayback(score,options={}) {
  let time=0,counter=0,maxPending=0; const timers=new Map(),callbacks=[],samples=[],steps=[],active=[];
  class FakeAudio {
    constructor(src) { this.value=Number(src.match(/(\d+)\.mp3$/)[1]); this.currentTime=1; this.pauses=[]; samples.push(this); }
    addEventListener() {}
    play() { this.startedAt=time; return { catch() {} }; }
    pause() { this.pauses.push(time); }
  }
  const player=createPianoSamplePlayer({ AudioConstructor:FakeAudio,maxVoices:128 });
  const playback=createWorkshopPlayback(score,player,Object.assign({},options,{ appVolume:37,nowFn() { return time; },
    setTimeoutFn(callback,delay) { const id=++counter; timers.set(id,{ callback,due:time+delay }); callbacks.push(callback);
      maxPending=Math.max(maxPending,timers.size); return id; },clearTimeoutFn(id) { timers.delete(id); },
    onStep(event) { steps.push(event); },onActiveNotes(ids,barIndex) { active.push({ ids:ids.slice(),barIndex }); } }));
  return { playback,samples,steps,active,timers,callbacks,get maxPending() { return maxPending; },
    advance(target) {
      assert(target>=time); let limit=10000;
      while (true) {
        const pending=Array.from(timers.entries()).filter(item => item[1].due<=target).sort((a,b) => a[1].due-b[1].due || a[0]-b[0]);
        if (!pending.length) break;
        assert(--limit>0,"timer loop"); const [id,timer]=pending[0]; timers.delete(id); time=timer.due; timer.callback();
      }
      time=target;
    } };
}
function last(values) { return values[values.length-1]; }

async function run() {
  test("ties form chronological dotted-note chains and chord chains without mutating source scores",() => {
    const base=fixture(),before=JSON.stringify(base),linked=linkedFixture();
    assert.strictEqual(JSON.stringify(base),before);
    assert.deepStrictEqual(edgeNames(linked),["a>b","b>c","c>d","e1>e2","e2>e3","e3>e4","g1>g2","g2>g3"]);
    assert(ties.isValidWorkshopTies(linked));
    assert.deepStrictEqual(ties.connectWorkshopTies(linked,["a","b","c","d"]),linked);
    const hidden=model.setWorkshopSecondStaffEnabled(linked,false); assert(ties.isValidWorkshopTies(hidden));
    assert.deepStrictEqual(hidden.ties,linked.ties);
    const byBar=ties.workshopMeasureTies(linked,0,1).sort((a,b) => a.fromId.localeCompare(b.fromId));
    assert.deepStrictEqual(byBar,[{ fromId:"c",toId:"d",fromBarIndex:0,toBarIndex:1 },{ fromId:"e3",toId:"e4",fromBarIndex:0,toBarIndex:1 }]);
    assert.deepStrictEqual(ties.workshopMeasureTies(linked,1,1),[{ fromId:"g2",toId:"g3",fromBarIndex:0,toBarIndex:1 }]);
  });
  test("invalid direction, gaps, overlaps, spelling, rests, staff crossings, branches and malformed edges are rejected",() => {
    const base=fixture(); const source=JSON.stringify(base);
    const invalid=[null,{},new Array(1),[{ fromId:"a" }],[{ fromId:"a",toId:"b",extra:true }],
      [{ fromId:"a",toId:"a" }],[{ fromId:"b",toId:"a" }],[{ fromId:"a",toId:"c" }],
      [{ fromId:"a",toId:"e2" }],[{ fromId:"a",toId:"unknown" }],
      [{ fromId:"a",toId:"b" },{ fromId:"a",toId:"b" }],
      [{ fromId:"a",toId:"b" },{ fromId:"b",toId:"a" }],[{ fromId:"a",toId:"bad id" }]];
    for (const graph of invalid) {
      const score=model.cloneWorkshop(base); score.ties=graph;
      assert.strictEqual(ties.isValidWorkshopTies(score),false,JSON.stringify(graph)); assert.strictEqual(model.isValidWorkshopScore(score),false);
    }
    const cross=model.cloneWorkshop(base); cross.parts[1].measures[0].events[0].pitch=model.workshopPitchFromValue(48);
    cross.parts[1].measures[0].events[0].startSlot=3; cross.parts[1].measures[0].events[0].noteValue="eighth";
    cross.ties=[{ fromId:"a",toId:"g1" }]; assert.strictEqual(ties.isValidWorkshopTies(cross),false);
    const enharmonic=model.cloneWorkshop(base); enharmonic.parts[0].measures[0].events.find(event => event.id==="b").pitch={ step:"B",alter:1,octave:3 };
    assert.strictEqual(model.workshopPitchValue(enharmonic.parts[0].measures[0].events.find(event => event.id==="b").pitch),48);
    enharmonic.ties=[{ fromId:"a",toId:"b" }]; assert.strictEqual(ties.isValidWorkshopTies(enharmonic),false);
    const branch=model.cloneWorkshop(base); branch.parts[0].measures[0].events.push(note("other",48,"eighth",3));
    branch.ties=[{ fromId:"a",toId:"b" },{ fromId:"a",toId:"other" }]; assert.strictEqual(ties.isValidWorkshopTies(branch),false);
    for (const ids of [["a"],["a","a"],["a","c"],["a","e2"],["a","unknown"],["a","g1"]]) assert.strictEqual(ties.connectWorkshopTies(base,ids),null);
    assert.strictEqual(JSON.stringify(base),source);
  });
  test("repair and unbinding preserve independent edges, while target discovery rejects ambiguous duplicate heads",() => {
    const linked=linkedFixture(); const before=JSON.stringify(linked);
    const split=ties.disconnectWorkshopTies(linked,["b"]);
    assert.deepStrictEqual(edgeNames(split),["c>d","e1>e2","e2>e3","e3>e4","g1>g2","g2>g3"]);
    const edited=model.cloneWorkshop(linked); edited.parts[0].measures[0].events.find(event => event.id==="b").pitch=model.workshopPitchFromValue(49);
    assert.deepStrictEqual(edgeNames(ties.repairWorkshopTies(edited)),edgeNames(split));
    assert.strictEqual(ties.findWorkshopTieTarget(fixture(),"a"),"b");
    assert.strictEqual(ties.findWorkshopTieTarget(linked,"a"),"b");
    const duplicate=fixture(); duplicate.parts[0].measures[0].events.push(note("duplicate",48,"eighth",3));
    assert.strictEqual(ties.findWorkshopTieTarget(duplicate,"a"),null);
    const rest=fixture(); rest.parts[0].measures[0].events.find(event => event.id==="b").kind="rest";
    rest.parts[0].measures[0].events.find(event => event.id==="b").pitch=null;
    rest.ties=[{ fromId:"a",toId:"b" }]; assert.strictEqual(ties.isValidWorkshopTies(rest),false);
    const old=model.createWorkshopDraft("Legacy").score; const oldJson=JSON.stringify(old);
    assert.strictEqual(JSON.stringify(ties.repairWorkshopTies(old)),oldJson);
    assert.strictEqual(JSON.stringify(linked),before);
  });
  test("tied samples sustain without reattack while active segment IDs follow dotted boundaries and bar changes",() => {
    const score=linkedFixture(),original=JSON.stringify(score),clock=clockPlayback(score);
    assert(clock.playback.start()); assert.deepStrictEqual(clock.samples.map(sample => sample.value),[48,52,43]);
    clock.advance(1500); assert.strictEqual(clock.samples.length,3); assert(clock.samples.every(sample => !sample.pauses.length));
    assert.deepStrictEqual(last(clock.active).ids.sort(),["b","e2","g1"]);
    clock.advance(2000); assert.strictEqual(clock.samples.length,3); assert.deepStrictEqual(last(clock.active).ids.sort(),["c","e3","g2"]);
    clock.advance(4000); assert.strictEqual(last(clock.active).barIndex,1); assert.deepStrictEqual(last(clock.active).ids.sort(),["d","e4","g3"]);
    clock.advance(5000); assert(clock.samples.every(sample => sample.pauses[0]===5000)); assert.deepStrictEqual(last(clock.active).ids,[]);
    clock.advance(7000); assert(!clock.playback.isPlaying()); assert.strictEqual(clock.timers.size,0);
    assert.strictEqual(JSON.stringify(score),original);
  });
  test("single-bar and hidden-stave playback start incoming ties normally and stop outgoing ties at the chosen boundary",() => {
    const score=linkedFixture();
    for (const index of [0,1]) {
      const clock=clockPlayback(score,{ barIndex:index }); assert(clock.playback.start());
      assert.strictEqual(clock.samples.length,3); assert(clock.samples.every(sample => sample.startedAt===0));
      clock.advance(index===0?4000:3000); assert(!clock.playback.isPlaying());
      assert(clock.samples.every(sample => sample.pauses[0]===(index===0?4000:1000)));
      assert(clock.steps.every(event => event.barIndex===index));
    }
    const hidden=clockPlayback(model.setWorkshopSecondStaffEnabled(score,false)); assert(hidden.playback.start()); hidden.advance(7000);
    assert.deepStrictEqual(hidden.samples.map(sample => sample.value),[48,52]); assert(hidden.steps.every(event => event.partIndex===0));
  });
  test("an untied unison remains a separate sample while a tied voice transfers across the same boundary",() => {
    const score=linkedFixture(); score.parts[0].measures[0].events.push(note("untied",48,"eighth",3));
    const clock=clockPlayback(score); assert(clock.playback.start()); clock.advance(1500);
    assert.strictEqual(clock.samples.length,4); assert.deepStrictEqual(last(clock.active).ids.sort(),["b","e2","g1","untied"]);
    clock.advance(2000); assert.strictEqual(clock.samples[3].pauses[0],2000); assert.strictEqual(clock.samples[0].pauses.length,0);
    assert.deepStrictEqual(last(clock.active).ids.sort(),["c","e3","g2"]); clock.playback.stop();
  });
  test("fractional tempos, dotted sixteenths and thirty-second continuations use one exact attack",() => {
    for (const bpm of [37,71,113]) {
      const draft=model.createWorkshopDraft("Fine held values"); draft.score.bpm=bpm;
      draft.score.parts[0].measures[0].events=[note("short",48,"sixteenth",3,1),note("fine",48,"thirtysecond",3.75)];
      const linked=ties.connectWorkshopTies(draft.score,["fine","short"]); assert(linked && model.isValidWorkshopScore(linked));
      const clock=clockPlayback(linked); assert(clock.playback.start()); clock.advance(model.workshopTimeline(linked).durationMs);
      assert.strictEqual(clock.samples.length,1,bpm); assert(Math.abs(clock.samples[0].pauses[0]-4*30000/bpm)<0.000001,bpm);
    }
  });
  test("two hundred tied bars keep one pending timer, one sample and safely reject callbacks after stopping or restarting",() => {
    const draft=model.createWorkshopDraft("Long held tone",200); draft.score.bpm=37;
    draft.score.parts[0].measures.forEach((bar,index) => { bar.events=[note("held-"+index,48,"whole",0)]; });
    const linked=ties.connectWorkshopTies(draft.score,draft.score.parts[0].measures.map(bar => bar.events[0].id));
    const clock=clockPlayback(linked); assert(clock.playback.start()); assert.strictEqual(clock.timers.size,1);
    const stale=clock.callbacks.slice(); clock.playback.stop(); assert.strictEqual(clock.timers.size,0);
    stale.forEach(callback => callback()); assert.strictEqual(clock.samples.length,1);
    assert(clock.playback.start()); stale.forEach(callback => callback()); assert.strictEqual(clock.samples.length,2);
    clock.advance(model.workshopTimeline(linked).durationMs+0.000001);
    assert.strictEqual(clock.samples.length,2); assert.strictEqual(clock.maxPending,1);
    assert.strictEqual(clock.steps.filter(event => event.value!==null).length,201);
    assert.strictEqual(clock.timers.size,0); assert(!clock.playback.isPlaying());
  });

  const persisted=storage(),legacy=model.createWorkshopDraft("Ties and dots",2);
  legacy.score.parts[0].measures[0].events=[note("legacy-a",48,"quarter",0),note("legacy-b",48,"quarter",2)];
  const first=store.storeWorkshopDraft(legacy,persisted),oldJson=JSON.stringify(first.piece.revisions[0].score);
  const changed=model.openWorkshopPiece(first.piece); changed.score=model.setWorkshopKey(linkedFixture(),"G-major");
  const active=store.storeWorkshopDraft(changed,persisted); const hidden=model.openWorkshopPiece(active.piece);
  hidden.score=model.setWorkshopSecondStaffEnabled(hidden.score,false); const saved=store.storeWorkshopDraft(hidden,persisted);
  const expected=store.readWorkshopLibrary(persisted),exported=backup.createSaveDataBackup(persisted);
  test("storage and saved revisions retain v1 legacy data, dotted durations, ties and hidden-stave contents",() => {
    assert.strictEqual(saved.piece.revisions.length,3); assert.strictEqual(JSON.stringify(saved.piece.revisions[0].score),oldJson);
    const recalled=model.openWorkshopPiece(saved.piece,active.piece.currentRevisionId).score;
    assert.deepStrictEqual(recalled,changed.score); assert.strictEqual(recalled.parts[0].measures[0].events[0].dots,1);
    assert.deepStrictEqual(edgeNames(model.openWorkshopPiece(saved.piece).score),edgeNames(changed.score));
    assert.strictEqual(model.openWorkshopPiece(saved.piece).score.parts[1].enabled,false);
    assert(backup.validateSaveDataBackup(exported).valid);
  });
  test("app imports leave local connected revisions untouched and validate ties in legacy backup files",() => {
    const target=storage(); target.setItem(model.WORKSHOP_STORAGE_KEY,persisted.getItem(model.WORKSHOP_STORAGE_KEY)); target.setItem("unrelated","keep");
    for (const mode of ["replace","merge","merge"]) {
      imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,exported,mode));
      assert.deepStrictEqual(store.readWorkshopLibrary(target),expected); assert.strictEqual(target.getItem("unrelated"),"keep");
    }
    const before=target.getItem(model.WORKSHOP_STORAGE_KEY),corrupt=model.cloneWorkshop(exported); corrupt.version=5; corrupt.data.workshopLibrary=model.cloneWorkshop(expected);
    corrupt.data.workshopLibrary.pieces[0].revisions[1].score.ties.push({ fromId:"a",toId:"missing" });
    assert.strictEqual(backup.validateSaveDataBackup(corrupt).valid,false);
    assert.throws(() => imports.prepareSaveDataImport(target,corrupt,"replace")); assert.strictEqual(target.getItem(model.WORKSHOP_STORAGE_KEY),before);
    const legacyStore=storage(); legacyStore.setItem(model.WORKSHOP_STORAGE_KEY,JSON.stringify({ data:first.library }));
    imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,backup.createSaveDataBackup(legacyStore),"replace"));
    assert.strictEqual(JSON.stringify(store.readWorkshopLibrary(target).pieces[0].revisions[0].score),oldJson);
  });
  const options={
    learningStorage:{ async flush() {},getStatus() { return { failedWrites:0 }; },async verifyHistoryReady() { return { saved:true,verified:true }; },
      async migrateLegacyHistory() { return { saved:true,verified:true }; },async synchronizeProgress() { return { saved:true }; },
      async readDailyTaskHistory() { return { saved: true, history: null }; },
      async readBackupSnapshot() { return { saved:true,progress:{ version:3,notes:{} },attempts:[] }; },async readProgress() { return { saved:true,progress:{ version:3,notes:{} } }; },
      async readBackupAttemptsPage() { return { saved:true,page:{ records:[],done:true } }; } },
    noteFlowStorage:{ async flush() {},async readRoundsForExport() { return { saved:true,rounds:[] }; },async readRoundsPage() { return { saved:true,page:{ records:[],done:true } }; } },
    rhythmStorage:{ async flush() {},async readBarsForExport() { return { saved:true,bars:[] }; },async readBarsPage() { return { saved:true,page:{ records:[],done:true } }; } },
    includeNoteFlowRounds:true,includeRhythmSenseBars:true
  };
  const complete=await files.createIndexedDbSaveDataBackup(persisted,options); assert.strictEqual(complete.data.workshopLibrary,undefined);
  const chunks=[]; await files.streamIndexedDbSaveDataBackup(async chunk => { chunks.push(chunk); },persisted,options);
  const json=chunks.join(""); assert(backup.validateSaveDataBackup(JSON.parse(json)).valid);
  const reader=new SaveDataStreamReader(() => { throw new Error("No large collections expected"); });
  for (let index=0;index<json.length;index+=17) reader.push(json.slice(index,index+17));
  const parsed=reader.finish(); assert.strictEqual(parsed.backup.data.workshopLibrary,undefined);
  const metadata={ key:"ready",shell:parsed.backup,counts:parsed.counts };
  const summary={ source:{ createdAt:parsed.backup.createdAt,fileSize:null },rounds:{ "screen:note-flow":0,"midi:note-flow":0,"midi:note-flow-chords":0,"rhythm:taktgefuehl":0 },
    attempts:{ "screen:single-notes":0,"midi:single-notes":0 },progress:{},activeGuard:"test" };
  const marker={ state:"database-verified",summary };
  const staging={ async readMetadata() { return metadata; },async readBatch() { return { records:[],nextIndex:0,total:0,done:true }; } };
  const shadow={ name:"noten-pfoten-learning-import-workshop-ties-test",database:{ async readImportGenerationMarker() { return marker; },async readProgressSnapshot() { return []; } } };
  const replacement=await prepareStagedLocalSaveDataPlan(staging,shadow);
  assert.strictEqual(replacement.values[model.WORKSHOP_STORAGE_KEY],undefined);
  const target=storage(); store.storeWorkshopDraft(model.createWorkshopDraft("Local piece"),target); marker.state="preparing";
  const merged=await prepareMergedLocalSaveDataPlan(staging,shadow,summary,target);
  assert.strictEqual(merged.values[model.WORKSHOP_STORAGE_KEY],undefined);
  assert.strictEqual(store.readWorkshopLibrary(target).pieces.length,1);
  process.stdout.write("✓ complete and streamed exports plus staged plans exclude local dotted ties and revisions\n");
}
module.exports=run;
if (require.main===module) run().catch(error => { console.error(error); process.exitCode=1; });
