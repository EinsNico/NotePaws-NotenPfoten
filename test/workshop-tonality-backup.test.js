const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");

function storage() {
  const entries = new Map();
  return { get length() { return entries.size; },key(index) { return Array.from(entries.keys())[index] || null; },
    getItem(key) { return entries.has(key) ? entries.get(key) : null; },
    setItem(key,value) { entries.set(key,String(value)); },removeItem(key) { entries.delete(key); } };
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
const { NOTE_FLOW_TONALITIES } = require("../src/model/NoteFlowTonality");
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
function note(step,alter,octave,noteValue,startSlot) {
  return { id:model.workshopId("note"),kind:"note",noteValue,startSlot,pitch:{ step,alter,octave } };
}
function twoStaves() {
  let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("Key signatures",2).score,true);
  score=model.setWorkshopMeasureContext(score,1,{ meter:"3/4",clef:"bass" });
  score=model.setWorkshopMeasureContext(score,1,{ clef:"treble" },1);
  score.parts[0].measures[0].events=[
    note("F",0,4,"sixteenth",0),note("F",1,4,"sixteenth",.5),note("B",-1,4,"eighth",1),
    note("B",0,4,"quarter",2),note("C",-1,5,"eighth",4),note("B",1,4,"quarter",5)
  ];
  score.parts[1].measures[0].events=[
    note("F",0,3,"quarter",0),note("F",1,3,"quarter",2),note("B",-1,2,"eighth",4),
    note("B",0,2,"eighth",5),note("C",-1,3,"sixteenth",6),note("B",1,2,"sixteenth",6.5)
  ];
  score.parts[0].measures[1].events=[note("F",0,3,"quarter",0),note("F",1,3,"quarter",0)];
  score.parts[1].measures[1].events=[note("G",0,5,"half",0)];
  assert(model.isValidWorkshopScore(score)); return score;
}
function heard(score) {
  let time=0; let counter=0; const timers=new Map(); const samples=[];
  class FakeAudio {
    constructor(src) { this.value=Number(src.match(/(\d+)\.mp3$/)[1]); this.currentTime=1; this.paused=false; samples.push(this); }
    addEventListener() {}
    play() { this.startedAt=time; return { catch() {} }; }
    pause() { this.paused=true; }
  }
  const player=createPianoSamplePlayer({ AudioConstructor:FakeAudio,maxVoices:128 });
  const playback=createWorkshopPlayback(score,player,{ nowFn() { return time; },
    setTimeoutFn(callback,delay) { const id=++counter; timers.set(id,{ callback,due:time+delay }); return id; },
    clearTimeoutFn(id) { timers.delete(id); } });
  assert(playback.start()); let limit=1000;
  while (timers.size) {
    assert(--limit>0,"timer loop");
    const [id,timer]=Array.from(timers.entries()).sort((a,b) => a[1].due-b[1].due || a[0]-b[0])[0];
    timers.delete(id); time=timer.due; timer.callback();
  }
  assert.strictEqual(playback.isPlaying(),false); assert(samples.every(sample => sample.paused));
  return samples.map(sample => [sample.value,sample.startedAt]);
}

async function run() {
  const base=twoStaves(); const baseJson=JSON.stringify(base);
  const expectedAttacks=[[53,0],[41,0],[54,250],[58,500],[59,1000],[42,1000],[59,2000],[34,2000],
    [60,2500],[35,2500],[35,3000],[36,3250],[41,4000],[42,4000],[67,4000]];
  test("all 30 major and minor keys preserve absolute naturals, sharps, flats and enharmonic spellings in actual sample playback",() => {
    assert.strictEqual(NOTE_FLOW_TONALITIES.length,30);
    assert.strictEqual(new Set(NOTE_FLOW_TONALITIES.map(key => key.id)).size,30);
    assert.deepStrictEqual(heard(base),expectedAttacks);
    const beforeTimeline=model.workshopTimeline(base);
    for (const key of NOTE_FLOW_TONALITIES) {
      const changed=model.setWorkshopKey(base,key.id); assert(changed,key.id);
      assert.strictEqual(changed.keyId,key.id); assert(model.isValidWorkshopScore(changed),key.id);
      assert.deepStrictEqual(changed.parts,base.parts,key.id);
      assert.deepStrictEqual(model.workshopTimeline(changed),beforeTimeline,key.id);
      assert.deepStrictEqual(heard(changed),expectedAttacks,key.id);
      assert.strictEqual(JSON.stringify(base),baseJson,"key selection must not modify the source score");
    }
  });

  test("every key also preserves hidden second-stave content and independent inherited clefs without sounding it",() => {
    const hidden=model.setWorkshopSecondStaffEnabled(base,false); const parts=model.cloneWorkshop(hidden.parts);
    const attacks=heard(hidden);
    assert.deepStrictEqual(attacks,[[53,0],[54,250],[58,500],[59,1000],[59,2000],[60,2500],[41,4000],[42,4000]]);
    for (const key of NOTE_FLOW_TONALITIES) {
      const changed=model.setWorkshopKey(hidden,key.id);
      assert.deepStrictEqual(changed.parts,parts,key.id); assert.strictEqual(changed.parts[1].enabled,false);
      assert.deepStrictEqual([0,1].map(index => model.workshopMeasureContext(changed,index,0).clef),["treble","bass"]);
      assert.deepStrictEqual([0,1].map(index => model.workshopMeasureContext(changed,index,1).clef),["bass","treble"]);
      assert.deepStrictEqual(heard(changed),attacks,key.id);
      assert.deepStrictEqual(model.setWorkshopSecondStaffEnabled(changed,true).parts,base.parts,key.id);
    }
  });

  const persisted=storage(); const legacy=model.createWorkshopDraft("All circle keys",2);
  legacy.score.parts[0].measures[0].events=[note("F",0,4,"quarter",0),note("B",-1,4,"quarter",2)];
  const first=store.storeWorkshopDraft(legacy,persisted); const legacyJson=JSON.stringify(first.piece.revisions[0].score);
  let saved=first; const revisionByKey=new Map();
  test("all 30 keys save as distinct recoverable score revisions alongside the untouched legacy C-major score",() => {
    for (const key of NOTE_FLOW_TONALITIES) {
      const draft=model.openWorkshopPiece(saved.piece); draft.score=model.setWorkshopKey(base,key.id);
      saved=store.storeWorkshopDraft(draft,persisted); revisionByKey.set(key.id,saved.piece.currentRevisionId);
      const reopened=model.openWorkshopPiece(saved.piece);
      assert.strictEqual(reopened.score.keyId,key.id); assert.deepStrictEqual(reopened.score.parts,base.parts);
    }
    assert.strictEqual(saved.piece.revisions.length,31);
    assert.strictEqual(new Set(revisionByKey.values()).size,30);
    assert.strictEqual(JSON.stringify(saved.piece.revisions[0].score),legacyJson);
    for (const key of NOTE_FLOW_TONALITIES) {
      const reopened=model.openWorkshopPiece(saved.piece,revisionByKey.get(key.id));
      assert.strictEqual(reopened.score.keyId,key.id); assert.deepStrictEqual(heard(reopened.score),expectedAttacks);
    }
    const draft=model.openWorkshopPiece(saved.piece); draft.score=model.setWorkshopSecondStaffEnabled(draft.score,false);
    saved=store.storeWorkshopDraft(draft,persisted); assert.strictEqual(saved.piece.revisions.length,32);
    const reopened=model.openWorkshopPiece(saved.piece); assert.strictEqual(reopened.score.parts[1].enabled,false);
    assert.deepStrictEqual(reopened.score.parts[1].measures,base.parts[1].measures);
  });
  const expected=store.readWorkshopLibrary(persisted); const exported=backup.createSaveDataBackup(persisted);
  test("app backup replacement and merging leave local key revisions and hidden staves untouched",() => {
    assert(backup.validateSaveDataBackup(exported).valid);
    const target=storage(); target.setItem(model.WORKSHOP_STORAGE_KEY,persisted.getItem(model.WORKSHOP_STORAGE_KEY)); target.setItem("unrelated","keep");
    imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,exported,"replace"));
    assert.deepStrictEqual(store.readWorkshopLibrary(target),expected); assert.strictEqual(target.getItem("unrelated"),"keep");
    const local=store.storeWorkshopDraft(model.createWorkshopDraft("Local C major"),target);
    for (const mode of ["merge","merge"]) {
      imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,exported,mode));
      const library=store.readWorkshopLibrary(target); assert.strictEqual(library.pieces.length,2);
      assert.deepStrictEqual(library.pieces.find(piece => piece.id===saved.piece.id),saved.piece);
      assert(library.pieces.some(piece => piece.id===local.piece.id));
    }
    const imported=store.readWorkshopLibrary(target).pieces.find(piece => piece.id===saved.piece.id);
    for (const key of NOTE_FLOW_TONALITIES) {
      const score=model.openWorkshopPiece(imported,revisionByKey.get(key.id)).score;
      assert.strictEqual(score.keyId,key.id); assert.deepStrictEqual(heard(score),expectedAttacks);
    }
  });

  test("unknown and prototype-like keys are rejected before imports can overwrite valid score revisions",() => {
    const target=storage(); target.setItem(model.WORKSHOP_STORAGE_KEY,persisted.getItem(model.WORKSHOP_STORAGE_KEY)); imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,exported,"replace"));
    const before=target.getItem(model.WORKSHOP_STORAGE_KEY);
    for (const keyId of ["not-a-key","C-dorian","toString","constructor","__proto__",null,0]) {
      assert.strictEqual(model.setWorkshopKey(base,keyId),null,String(keyId));
      const invalid=model.cloneWorkshop(exported); invalid.version=5; invalid.data.workshopLibrary=model.cloneWorkshop(expected);
      invalid.data.workshopLibrary.pieces[0].revisions[12].score.keyId=keyId;
      assert.strictEqual(backup.validateSaveDataBackup(invalid).valid,false,String(keyId));
      assert.throws(() => imports.prepareSaveDataImport(target,invalid,"replace"));
      assert.throws(() => imports.prepareSaveDataImport(target,invalid,"merge"));
      assert.strictEqual(target.getItem(model.WORKSHOP_STORAGE_KEY),before);
    }
    assert.strictEqual(JSON.stringify(base),baseJson);
  });

  test("legacy C-major backup files remain readable and imports preserve local score bytes",() => {
    const legacyStorage=storage(); legacyStorage.setItem(model.WORKSHOP_STORAGE_KEY,JSON.stringify({ data:first.library }));
    const oldBackup=backup.createSaveDataBackup(legacyStorage); oldBackup.version=5; oldBackup.data.workshopLibrary=first.library; assert(backup.validateSaveDataBackup(oldBackup).valid);
    const target=storage(); target.setItem(model.WORKSHOP_STORAGE_KEY,persisted.getItem(model.WORKSHOP_STORAGE_KEY)); imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,oldBackup,"replace"));
    const restored=store.readWorkshopLibrary(target).pieces[0].revisions[0].score;
    assert.strictEqual(JSON.stringify(restored),legacyJson);
    assert.deepStrictEqual(heard(restored),[[53,0],[58,1000]]);
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
  const full=await files.createIndexedDbSaveDataBackup(persisted,exportOptions); assert.strictEqual(full.data.workshopLibrary,undefined);
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
  const shadow={ name:"noten-pfoten-learning-import-workshop-tonality-test",
    database:{ async readImportGenerationMarker() { return marker; },async readProgressSnapshot() { return []; } } };
  const replacement=await prepareStagedLocalSaveDataPlan(staging,shadow);
  assert.strictEqual(replacement.values[model.WORKSHOP_STORAGE_KEY],undefined);
  const target=storage(); const local=store.storeWorkshopDraft(model.createWorkshopDraft("Local staged C major"),target);
  marker.state="preparing";
  const merged=await prepareMergedLocalSaveDataPlan(staging,shadow,summary,target);
  assert.strictEqual(merged.values[model.WORKSHOP_STORAGE_KEY],undefined);
  assert.strictEqual(store.readWorkshopLibrary(target).pieces.length,1);
  process.stdout.write("✓ complete and streamed exports plus staged plans exclude local key and hidden-stave revisions\n");
}
module.exports=run;
if (require.main===module) run().catch(error => { console.error(error); process.exitCode=1; });
