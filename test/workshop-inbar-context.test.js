const assert = require("assert"), fs = require("fs"), path = require("path"), Module = require("module");
const babel = require("babel-core");
global.regeneratorRuntime = require("babel-runtime/regenerator");
const sourceRoot = path.resolve(__dirname,"../src") + path.sep, originalLoader = Module._extensions[".js"];
Module._extensions[".js"] = (mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,"utf8"),{babelrc:false,presets:[["env",{modules:"commonjs"}]]}).code,filename);
};
function storage() { const data=new Map();return {get length(){return data.size;},key(i){return Array.from(data.keys())[i]||null;},getItem(k){return data.has(k)?data.get(k):null;},setItem(k,v){data.set(k,String(v));},removeItem(k){data.delete(k);}}; }
if (!global.localStorage) global.localStorage=storage();
const model = require("../src/model/Workshop"), helper = require("../src/model/WorkshopContextChanges");
const editor = require("../src/model/WorkshopScoreEditor"), store = require("../src/model/WorkshopStorage");
const backup = require("../src/model/SaveDataBackup"), imports = require("../src/model/SaveDataImport");
function test(name,body){body();process.stdout.write("✓ in-bar context: "+name+"\n");}
function changed(two=true) {
  let score=model.createWorkshopDraft("Context changes",4).score;
  if (two) score=model.setWorkshopSecondStaffEnabled(score,true);
  score.parts[0].measures[0].events=[{id:"fixed",kind:"note",pitch:{step:"F",alter:1,octave:4},noteValue:"quarter",startSlot:4}];
  score=model.setWorkshopContextChange(score,0,0,{startSlot:2,clef:"bass",keyId:"G-major"});
  score=model.setWorkshopContextChange(score,0,0,{startSlot:6,clef:"treble",keyId:"F-major"});
  assert(score); return score;
}

test("ordered boundaries apply at their exact onset and carry their final values into later measures",()=>{
  const score=changed(),bar=score.parts[0].measures[0],before=JSON.stringify(score);
  assert.strictEqual(model.workshopMeasureContext(score,0).clef,"treble");
  for(const [slot,clef,keyId] of [[0,"treble","C-major"],[1.5,"treble","C-major"],[2,"bass","G-major"],[5,"bass","G-major"],[6,"treble","F-major"],[8,"treble","F-major"]]) {
    const context=model.workshopMeasureContextAtSlot(score,0,slot);assert.strictEqual(context.clef,clef);assert.strictEqual(context.keyId,keyId);
  }
  assert.strictEqual(model.workshopMeasureContext(score,1).keyId,"F-major");
  assert.strictEqual(model.workshopMeasureContext(score,1,1).clef,"bass");
  assert.strictEqual(model.workshopMeasureContext(score,1,1).keyId,"F-major");
  const segments=helper.workshopContextChangeSegments(Object.assign({},bar,{contextChanges:bar.contextChanges.slice().reverse()}),model.workshopMeasureContext(score,0));
  assert.deepStrictEqual(segments.map(item=>[item.startSlot,item.clef,item.keyId]),[[0,"treble","C-major"],[2,"bass","G-major"],[6,"treble","F-major"]]);
  assert.deepStrictEqual(segments[1].changedFields,["clef","keyId"]);assert.strictEqual(segments[1].previous.keyId,"C-major");
  assert.strictEqual(JSON.stringify(score),before);
});

test("editing, moving and deleting a signature keeps shared keys and independent clefs coherent",()=>{
  let score=changed(); const original=score.parts[0].measures[0].contextChanges[0];
  score=model.setWorkshopContextChange(score,0,1,{startSlot:2,clef:"treble"});assert(score);
  let bottom=score.parts[1].measures[0].contextChanges.find(entry=>entry.startSlot===2);
  assert.strictEqual(bottom.keyId,"G-major");assert.strictEqual(bottom.clef,"treble");
  score=model.setWorkshopContextChange(score,0,0,{id:original.id,startSlot:3,keyId:"D-major",clef:"bass"});assert(score);
  assert.strictEqual(score.parts[0].measures[0].contextChanges[0].id,original.id);
  bottom=score.parts[1].measures[0].contextChanges.find(entry=>entry.startSlot===2);
  assert.strictEqual(bottom.keyId,undefined);assert.strictEqual(bottom.clef,"treble");
  assert.strictEqual(model.workshopMeasureContextAtSlot(score,0,3,1).keyId,"D-major");
  score=model.removeWorkshopContextChange(score,0,0,original.id);assert(score);
  assert.strictEqual(model.workshopMeasureContextAtSlot(score,0,3,0).keyId,"C-major");
  assert.strictEqual(model.workshopMeasureContextAtSlot(score,0,3,1).keyId,"C-major");
  assert.strictEqual(model.workshopMeasureContextAtSlot(score,0,3,1).clef,"treble");
});

test("keys and clefs never alter saved pitches or attack times, and bar-start edits keep interior boundaries",()=>{
  const score=changed(),notes=JSON.stringify(score.parts[0].measures[0].events),ids=score.parts[0].measures[0].contextChanges.map(entry=>entry.id);
  for(const updated of [model.setWorkshopKey(score,"D-major"),model.setWorkshopMeasureContext(score,0,{clef:"bass",keyId:"B-flat-major"})]) {
    assert(updated);assert.strictEqual(JSON.stringify(updated.parts[0].measures[0].events),notes);
    assert.deepStrictEqual(updated.parts[0].measures[0].contextChanges.map(entry=>entry.id),ids);
    assert.strictEqual(model.workshopMeasureContextAtSlot(updated,0,4).keyId,"G-major");
    const sounded=model.workshopTimeline(updated).events.find(entry=>entry.id==="fixed");
    assert.strictEqual(sounded.value,54);assert.strictEqual(sounded.startMs,2000);assert.strictEqual(sounded.durationMs,1000);
  }
});

test("invalid boundaries, duplicate IDs and context changes outside a shortened or pickup measure reject atomically",()=>{
  const score=changed(),before=JSON.stringify(score);
  for(const change of [{startSlot:0,clef:"bass"},{startSlot:8,keyId:"G-major"},{startSlot:9,clef:"bass"},{startSlot:-1,clef:"bass"},
    {startSlot:2,clef:"percussion"},{startSlot:2,keyId:"nonsense"},{startSlot:2},{startSlot:2,clef:null},{id:"unknown",startSlot:2,clef:"bass"},
    {startSlot:2,clef:"bass",unknown:true}]) assert.strictEqual(model.setWorkshopContextChange(score,0,0,change),null,JSON.stringify(change));
  assert.strictEqual(model.setWorkshopMeasureContext(score,0,{meter:"3/4"}),null);
  const invalid=model.cloneWorkshop(score);invalid.parts[1].measures[0].contextChanges[0].id=invalid.parts[0].measures[0].contextChanges[0].id;assert(!model.isValidWorkshopScore(invalid));
  const duplicate=model.cloneWorkshop(score);duplicate.parts[0].measures[0].contextChanges.push({id:"duplicate-position",startSlot:2,clef:"bass"});assert(!model.isValidWorkshopScore(duplicate));
  const pickup=model.createWorkshopDraft().score;pickup.pickupUnits=2;assert.strictEqual(model.setWorkshopContextChange(pickup,0,0,{startSlot:2,clef:"bass"}),null);
  assert(model.setWorkshopContextChange(pickup,0,0,{startSlot:1,clef:"bass"}));
  assert.strictEqual(JSON.stringify(score),before);
});

test("new, moved and removed measures preserve both in-bar identities and inherited contexts",()=>{
  const score=changed(),origin=score.parts[0].measures[0],originalIds=origin.contextChanges.map(entry=>entry.id);
  const extended=model.insertWorkshopMeasures(score,0,2);assert(extended);
  assert.strictEqual(model.workshopMeasureContext(extended,1).keyId,"F-major");
  const expected=new Map(score.parts[0].measures.map((bar,index)=>[bar.id,model.workshopMeasureContext(score,index)]));
  const moved=model.moveWorkshopMeasure(score,0,2);assert(moved);
  moved.parts[0].measures.forEach((bar,index)=>assert.deepStrictEqual(model.workshopMeasureContext(moved,index),expected.get(bar.id)));
  assert.deepStrictEqual(moved.parts[0].measures[2].contextChanges.map(entry=>entry.id),originalIds);
  const removed=model.removeWorkshopMeasure(score,0);assert(removed);assert.strictEqual(model.workshopMeasureContext(removed,0).keyId,"F-major");
  const deletedMiddle=model.removeWorkshopMeasure(score,1);assert(deletedMiddle);assert.strictEqual(model.workshopMeasureContext(deletedMiddle,1).keyId,"F-major");
});

test("adding or hiding a second staff copies shared signatures with fresh IDs and its own clef",()=>{
  const score=changed(false),two=model.setWorkshopSecondStaffEnabled(score,true);assert(two);
  const upper=two.parts[0].measures[0].contextChanges,lower=two.parts[1].measures[0].contextChanges;
  assert.deepStrictEqual(lower.map(entry=>[entry.startSlot,entry.keyId]),upper.map(entry=>[entry.startSlot,entry.keyId]));
  assert(lower.every(entry=>!entry.clef && !upper.some(other=>other.id===entry.id)));
  assert.strictEqual(model.workshopMeasureContextAtSlot(two,0,7,1).clef,"bass");
  const hidden=model.setWorkshopSecondStaffEnabled(two,false);assert(hidden);assert.deepStrictEqual(hidden.parts[1].measures,two.parts[1].measures);
});

test("ordinary note edits preserve context changes without sharing mutable objects",()=>{
  const score=changed(false),resolved=model.resolveWorkshopMeasure(score,0),before=JSON.stringify(resolved);
  const moved=editor.moveWorkshopNote(resolved,"fixed",3,{step:"G",alter:0,octave:4});assert(moved);
  assert(model.isValidWorkshopMeasure(Object.assign({},resolved,{events:moved})));
  moved[0].pitch && (moved[0].pitch.alter=0);assert.strictEqual(JSON.stringify(resolved),before);
  const cloned=model.cloneWorkshop(resolved);cloned.contextChanges[0].clef="treble";assert.strictEqual(JSON.stringify(resolved),before);
});

test("backup replacement, repeated merging and saved revisions retain every in-bar context",()=>{
  const source=storage(),score=changed(),draft={title:"Context changes",pieceId:null,score};
  const first=store.storeWorkshopDraft(draft,source),next=model.openWorkshopPiece(first.piece);
  const id=next.score.parts[0].measures[0].contextChanges[0].id;
  next.score=model.setWorkshopContextChange(next.score,0,0,{id,startSlot:3,clef:"bass",keyId:"E-major"});
  const saved=store.storeWorkshopDraft(next,source),exported=backup.createSaveDataBackup(source);
  assert(backup.validateSaveDataBackup(exported).valid);
  const target=storage();target.setItem(model.WORKSHOP_STORAGE_KEY,source.getItem(model.WORKSHOP_STORAGE_KEY));target.setItem("unrelated","keep");
  for(const mode of ["replace","merge","merge"]) {
    imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,exported,mode));
    assert.deepStrictEqual(store.readWorkshopLibrary(target),saved.library);assert.strictEqual(target.getItem("unrelated"),"keep");
  }
  assert.deepStrictEqual(model.openWorkshopPiece(saved.piece,first.piece.currentRevisionId).score,score);
  const malformed=model.cloneWorkshop(exported); malformed.version=5; malformed.data.workshopLibrary=model.cloneWorkshop(saved.library);malformed.data.workshopLibrary.pieces[0].revisions[0].score.parts[0].measures[0].contextChanges[0].startSlot=9;
  assert(!backup.validateSaveDataBackup(malformed).valid);assert.throws(()=>imports.prepareSaveDataImport(target,malformed,"replace"));
  assert.deepStrictEqual(store.readWorkshopLibrary(target),saved.library);
});


test("changing a starting key preserves redundant imported in-bar boundaries on either staff",()=>{
  for(const boundaryPart of [0,1]) {
    const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft("Redundant",2).score,true);
    score.parts[boundaryPart].measures[0].contextChanges=[{id:"redundant-key",startSlot:2,keyId:"C-major"}];
    assert(model.isValidWorkshopScore(score));
    for(const changed of [model.setWorkshopKey(score,"G-major"),model.setWorkshopMeasureContext(score,0,{keyId:"G-major"})]) {
      assert(changed);assert(model.isValidWorkshopScore(changed));
      assert.strictEqual(model.workshopMeasureContext(changed,0).keyId,"G-major");
      assert(changed.parts[boundaryPart].measures[0].contextChanges.some(entry=>entry.id==="redundant-key" && entry.keyId==="C-major"));
      assert.strictEqual(model.workshopMeasureContextAtSlot(changed,0,2).keyId,"C-major");
      for(const slot of [0,1,2,4])assert.strictEqual(model.workshopMeasureContextAtSlot(changed,0,slot,0).keyId,model.workshopMeasureContextAtSlot(changed,0,slot,1).keyId);
    }
  }
});
