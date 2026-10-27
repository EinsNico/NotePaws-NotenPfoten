const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const root=path.resolve(__dirname,'../src')+path.sep,old=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(root))return old(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
const stats=require('../src/model/WorkshopPracticeStatistics'),backup=require('../src/model/SaveDataBackup'),imports=require('../src/model/SaveDataImport');
const workshop=require('../src/model/Workshop'),library=require('../src/model/WorkshopStorage');
Module._extensions['.js']=old;
function storage(){const map=new Map();let failure=null;return{
 get length(){return map.size;},key:i=>Array.from(map.keys())[i]||null,getItem:k=>map.has(k)?map.get(k):null,
 setItem(k,v){const mode=failure;failure=null;if(mode==='before')throw Error('quota');if(mode!=='ignore')map.set(k,mode==='corrupt'?'broken':String(v));if(mode==='after')throw Error('quota');},
 removeItem:k=>map.delete(k),failNext:mode=>failure=mode
};}
const delta=(correct=0,keys=[])=>Object.assign(stats.emptyWorkshopPracticeCounts(),{correct,learnedNoteKeys:keys});
function test(name,fn){fn();console.log('✓ '+name);}
test('per-piece tone counts accumulate across reloads while learned notes are unique',()=>{
 const persisted=storage();persisted.setItem('unrelated','unchanged');
 const first=stats.storeWorkshopPracticeAssessments([{pieceId:'a',assessment:Object.assign(delta(2,['n1','n2']),{early:1,late:3,wrong:4,missed:5})},{pieceId:'b',assessment:delta(1,['b1'])}],persisted);
 const original=JSON.stringify(first);
 const next=stats.storeWorkshopPracticeAssessments([{pieceId:'a',assessment:delta(1,['n1'])}],persisted);
 assert.strictEqual(JSON.stringify(first),original);assert.deepStrictEqual(stats.readWorkshopPracticeStatistics(persisted),next);
 const a=stats.workshopPracticeStatisticsFor(next,'a');assert.deepStrictEqual(a,{pieceId:'a',learnedNoteKeys:['n1','n2'],correct:3,early:1,late:3,wrong:4,missed:5});
 assert.strictEqual(stats.workshopPracticeStatisticsFor(next,'b').correct,1);assert.strictEqual(persisted.getItem('unrelated'),'unchanged');
});
test('progress reflects current written notes, deduplicates repeats, ignores removed and changed pitches, never rounds incomplete to100',()=>{
 const data=Object.assign(delta(2,['n1:C4','n2:E4','removed']),{early:4,late:4});
 assert.strictEqual(stats.workshopPracticeProgress(data,['n1:C4','n1:C4','n2:E4','n3:G4']),66);
 assert.strictEqual(stats.workshopPracticeProgress(data,['n1:C4','n2:F4']),50);
 assert.strictEqual(stats.workshopPracticeProgress(data,['n1:C4','n2:E4']),100);
 assert.strictEqual(stats.workshopPracticeProgress(data,[]),0);
 const many=Array.from({length:201},(_,i)=>'n'+i),learned=delta(200,many.slice(1));assert.strictEqual(stats.workshopPracticeProgress(learned,many),99);
});
test('invalid existing statistics and invalid assessments preserve original bytes',()=>{
 const persisted=storage();persisted.setItem(stats.WORKSHOP_PRACTICE_STATISTICS_KEY,'{broken');
 assert.throws(()=>stats.readWorkshopPracticeStatistics(persisted));assert.throws(()=>stats.storeWorkshopPracticeAssessments([{pieceId:'a',assessment:delta(1)}],persisted));
 assert.strictEqual(persisted.getItem(stats.WORKSHOP_PRACTICE_STATISTICS_KEY),'{broken');
 persisted.removeItem(stats.WORKSHOP_PRACTICE_STATISTICS_KEY);
 for(const bad of [Object.assign(delta(),{correct:-1}),Object.assign(delta(),{late:1.5}),delta(1,['duplicate','duplicate'])]){
  assert.throws(()=>stats.storeWorkshopPracticeAssessments([{pieceId:'a',assessment:bad}],persisted));assert.strictEqual(persisted.getItem(stats.WORKSHOP_PRACTICE_STATISTICS_KEY),null);
 }
});
test('quota and failed verification roll back, including the first write',()=>{
 for(const mode of ['before','after','ignore','corrupt'])for(const existing of [false,true]){
  const persisted=storage();if(existing)stats.storeWorkshopPracticeAssessments([{pieceId:'a',assessment:delta(1,['a1'])}],persisted);
  const before=persisted.getItem(stats.WORKSHOP_PRACTICE_STATISTICS_KEY);persisted.failNext(mode);
  assert.throws(()=>stats.storeWorkshopPracticeAssessments([{pieceId:'a',assessment:delta(2,['a2'])}],persisted));
  assert.strictEqual(persisted.getItem(stats.WORKSHOP_PRACTICE_STATISTICS_KEY),before);
 }
});
test('deleting a piece removes only its local practice history',()=>{
 const persisted=storage();stats.storeWorkshopPracticeAssessments([{pieceId:'a',assessment:delta(1,['a1'])},{pieceId:'b',assessment:delta(3,['b1'])}],persisted);
 persisted.setItem('unrelated','same');const next=stats.removeWorkshopPracticeStatistics('a',persisted);
 assert.strictEqual(next.pieces.length,1);assert.strictEqual(next.pieces[0].pieceId,'b');assert.strictEqual(persisted.getItem('unrelated'),'same');
});
test('backup export excludes statistics, including malformed local JSON',()=>{
 const persisted=storage();library.storeWorkshopDraft(workshop.createWorkshopDraft('Saved music'),persisted);
 const music= persisted.getItem(workshop.WORKSHOP_STORAGE_KEY);
 for(const raw of ['{"private":"workshop-only"}','{broken']){
  persisted.setItem(stats.WORKSHOP_PRACTICE_STATISTICS_KEY,raw);const exported=backup.createSaveDataBackup(persisted);
  assert(backup.validateSaveDataBackup(exported).valid);assert(!JSON.stringify(exported).includes('workshop-only'));assert(!JSON.stringify(exported).includes(stats.WORKSHOP_PRACTICE_STATISTICS_KEY));
  assert.strictEqual(persisted.getItem(stats.WORKSHOP_PRACTICE_STATISTICS_KEY),raw);assert.strictEqual(persisted.getItem(workshop.WORKSHOP_STORAGE_KEY),music);
 }
});
test('replace and merge backup imports retain local statistics without exporting or restoring them',()=>{
 for(const mode of ['replace','merge']){
  const local=storage(),incomingStore=storage();local.setItem('options',JSON.stringify({data:{language:'de'}}));
  incomingStore.setItem('options',JSON.stringify({data:{language:'en'}}));library.storeWorkshopDraft(workshop.createWorkshopDraft('Imported piece'),incomingStore);library.storeWorkshopDraft(workshop.createWorkshopDraft('Local piece'),local);const musicBefore=local.getItem(workshop.WORKSHOP_STORAGE_KEY);
  const sentinel='{"private":"local-only","version":1}';local.setItem(stats.WORKSHOP_PRACTICE_STATISTICS_KEY,sentinel);
  const result=imports.importSaveData(local,backup.createSaveDataBackup(incomingStore),mode);
  assert(result);assert.strictEqual(local.getItem(stats.WORKSHOP_PRACTICE_STATISTICS_KEY),sentinel);assert.strictEqual(local.getItem(workshop.WORKSHOP_STORAGE_KEY),musicBefore);assert.strictEqual(library.readWorkshopLibrary(local).pieces[0].title,'Local piece');
 }
});
