const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>filename.startsWith(sourceRoot)
  ? mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename)
  : originalLoader(mod,filename);
const backup=require('../src/model/SaveDataBackup'),files=require('../src/model/SaveDataFiles'),imports=require('../src/model/SaveDataImport');
const workshop=require('../src/model/Workshop');
const shadowPlan=require('../src/model/SaveDataShadowLocalPlan'),mergePlan=require('../src/model/SaveDataLargeMergeLocalPlan');
const shadowCommit=require('../src/model/SaveDataShadowCommit'),generation=require('../src/model/LearningDatabaseGeneration');
const stagedPreview=require('../src/model/SaveDataStagedPreview');
Module._extensions['.js']=originalLoader;
const LOCAL_WORKSHOP_KEYS=['workshopLibrary','workshopPracticeStatistics'];
const CREATED='2026-10-05T12:00:00.000Z';
const stored=value=>JSON.stringify({data:value});
const has=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);

// Reading, writing or rollback-owning the excluded areas is itself a failure.
// Direct setters represent independent editor writes while an import is open.
function storage(initial={}) {
  const values=Object.assign({},initial);let failKey=null;
  return {
    get length(){return Object.keys(values).length;},key(index){return Object.keys(values)[index]||null;},
    getItem(key){if(LOCAL_WORKSHOP_KEYS.includes(key))throw Error('General backup must not read '+key);return has(values,key)?values[key]:null;},
    setItem(key,value){if(LOCAL_WORKSHOP_KEYS.includes(key))throw Error('General backup must not write '+key);if(key===failKey){failKey=null;throw Error('simulated app storage failure');}values[key]=String(value);},
    removeItem(key){if(LOCAL_WORKSHOP_KEYS.includes(key))throw Error('General backup must not remove '+key);delete values[key];},
    direct(key,value){if(value===null)delete values[key];else values[key]=value;},
    failNext(key){failKey=key;},dump(){return Object.assign({},values);}
  };
}
function library(title='Private workshop piece') {
  const draft=workshop.createWorkshopDraft(title);
  draft.score.metadata={title,composer:'Private composer',copyright:'Private rights',license:'Private license',
    sources:[{label:'Private source',url:'https://example.org/private-score'}]};
  draft.score.musicXml={sourceXml:'<score-partwise><!--private-original-source--></score-partwise>',fingerprint:'private-source',warnings:[]};
  return workshop.saveWorkshopDraft({version:1,pieces:[]},draft,CREATED).library;
}
const statistics={version:1,pieces:[{pieceId:'private-piece',correct:7,early:2,late:3,wrong:4,missed:5,learnedNoteKeys:['private-note']}]};
function localStorageFixture(extra={}) {
  return storage(Object.assign({options:stored({language:'de'}),workshopLibrary:stored(library()),workshopPracticeStatistics:JSON.stringify(statistics)},extra));
}
function legacyBackup() {
  const result=backup.createSaveDataBackup(storage({options:stored({language:'en'})}),{createdAt:CREATED});
  result.version=5;result.data.workshopLibrary=library('Incoming workshop piece');result.data.workshopPracticeStatistics=statistics;
  assert(backup.validateSaveDataBackup(result).valid);return result;
}
function assertNoWorkshop(data) {LOCAL_WORKSHOP_KEYS.forEach(key=>assert(!has(data,key),'excluded field: '+key));}
function assertPrivateBytes(storage,before) {LOCAL_WORKSHOP_KEYS.forEach(key=>assert.strictEqual(storage.dump()[key],before[key],key));}
const cases=[];function test(name,body){cases.push([name,body]);}

test('ordinary backup collection and file export never read Workshop and exclude music, credits and practice results',()=>{
  const local=localStorageFixture(),before=local.dump();
  assertNoWorkshop(backup.collectSaveData(local));
  const result=backup.createSaveDataBackup(local,{createdAt:CREATED});assertNoWorkshop(result.data);assert.strictEqual(result.version,2);
  assert(backup.validateSaveDataBackup(result).valid);assertNoWorkshop(backup.normalizeSaveDataBackup(result).data);
  const exported=files.createSaveDataExport(local,{createdAt:CREATED});assertNoWorkshop(JSON.parse(exported.text).data);
  ['Private workshop piece','Private composer','Private rights','Private license','private-score','private-original-source','private-note'].forEach(value=>assert(!exported.text.includes(value),value));
  assertPrivateBytes(local,before);assert(!Object.values(backup.SAVE_DATA_STORAGE_KEYS).some(key=>LOCAL_WORKSHOP_KEYS.includes(key)));
});

test('legacy v5 files remain readable, but normalization and backup summaries discard incoming Workshop areas',()=>{
  const legacy=legacyBackup(),before=JSON.stringify(legacy),normalized=backup.normalizeSaveDataBackup(legacy);
  assert(normalized);assertNoWorkshop(normalized.data);assert.strictEqual(JSON.stringify(legacy),before);
  const parsed=files.parseSaveDataFile(JSON.stringify(legacy));assert(parsed.valid);assertNoWorkshop(backup.normalizeSaveDataBackup(parsed.backup).data);
  assert(!has(backup.summarizeSaveDataBackup(legacy),'workshopPieces'));
  assert(!has(stagedPreview.summarizeStagedSaveData({key:'ready',shell:legacy,counts:{}}),'workshopPieces'));
});

test('replace and merge preserve raw local Workshop bytes and never install incoming pieces on an empty device',()=>{
  for(const mode of ['replace','merge']) {
    const local=localStorageFixture(),before=local.dump(),prepared=imports.prepareSaveDataImport(local,legacyBackup(),mode,{createdAt:CREATED});
    assertNoWorkshop(prepared.resultBackup.data);assertNoWorkshop(prepared.importedBackup.data);
    assert(prepared.currentStorageSnapshot.every(entry=>!LOCAL_WORKSHOP_KEYS.includes(entry.key)));
    imports.applyPreparedSaveDataImport(local,prepared);assertPrivateBytes(local,before);
    assert.strictEqual(JSON.parse(local.dump().options).data.language,mode==='replace'?'en':'de');
    const empty=storage({options:stored({language:'de'})});imports.importSaveData(empty,legacyBackup(),mode,{createdAt:CREATED});
    LOCAL_WORKSHOP_KEYS.forEach(key=>assert(!has(empty.dump(),key)));
  }
});

test('malformed local Workshop data does not block general export, restore or merge',()=>{
  for(const mode of ['replace','merge']) {
    const local=localStorageFixture({workshopLibrary:'{unreadable local library',workshopPracticeStatistics:'invalid statistics'}),before=local.dump();
    assertNoWorkshop(backup.createSaveDataBackup(local,{createdAt:CREATED}).data);
    imports.importSaveData(local,legacyBackup(),mode,{createdAt:CREATED});assertPrivateBytes(local,before);
  }
});

test('independent Workshop changes during an import preview remain untouched on success and rollback',()=>{
  for(const fail of [false,true]) {
    const local=localStorageFixture(),prepared=imports.prepareSaveDataImport(local,legacyBackup(),'replace',{createdAt:CREATED});
    local.direct('workshopLibrary','new independent editor bytes');local.direct('workshopPracticeStatistics','new independent practice bytes');
    const before=local.dump();
    if(fail) {
      local.failNext('options');assert.throws(()=>imports.applyPreparedSaveDataImport(local,prepared),error=>error.rollbackSucceeded===true && /rolled back/.test(error.message));
      assert.strictEqual(local.dump().options,before.options);
    } else imports.applyPreparedSaveDataImport(local,prepared);
    assertPrivateBytes(local,before);
  }
});

function exportAdapters() {
  const progress={version:3,notes:{}};
  return {
    learningStorage:{readDailyTaskHistory:async()=>({saved:true,history:null}),flush:async()=>{},getStatus:()=>({failedWrites:0}),verifyHistoryReady:async()=>({saved:true,verified:true}),
      readBackupSnapshot:async()=>({saved:true,progress,attempts:[]}),readProgress:async()=>({saved:true,progress}),
      readBackupAttemptsPage:async()=>({saved:true,page:{records:[],done:true}})},
    noteFlowStorage:{flush:async()=>{},readRoundsForExport:async()=>({saved:true,rounds:[]}),readRoundsPage:async()=>({saved:true,page:{records:[],done:true}})},
    rhythmStorage:{flush:async()=>{},readBarsForExport:async()=>({saved:true,bars:[]}),readBarsPage:async()=>({saved:true,page:{records:[],done:true}})}
  };
}
test('IndexedDB-backed and streamed exports exclude Workshop in the actual mobile/browser export paths',async()=>{
  const local=localStorageFixture({workshopLibrary:'broken local score JSON'}),before=local.dump(),options=Object.assign(exportAdapters(),{createdAt:CREATED});
  const exported=await files.createIndexedDbSaveDataExport(local,options),document=JSON.parse(exported.text);
  assertNoWorkshop(document.data);assert.strictEqual(document.version,4);assert(backup.validateSaveDataBackup(document).valid);
  const chunks=[];await files.streamIndexedDbSaveDataBackup(async chunk=>chunks.push(chunk),local,options);
  const streamed=JSON.parse(chunks.join(''));assertNoWorkshop(streamed.data);assert.strictEqual(streamed.version,4);assert(backup.validateSaveDataBackup(streamed).valid);
  assertPrivateBytes(local,before);
});

function stagedFixture() {
  const shell=legacyBackup(),counts={};
  const source={createdAt:shell.createdAt,fileSize:null};
  const verified={state:'database-verified',summary:{source,rounds:{'screen:note-flow':0,'midi:note-flow':0,'midi:note-flow-chords':0,'rhythm:taktgefuehl':0},attempts:{'screen:single-notes':0,'midi:single-notes':0}}};
  const metadata={key:'ready',shell,counts},staging={async readMetadata(){return metadata;},async readBatch(){throw Error('empty staged backup must not read history batches');}};
  const shadow={name:'noten-pfoten-learning-import-workshop-exclusion',database:{async readImportGenerationMarker(){return verified;},async readProgressSnapshot(){return [];}}};
  return {staging,shadow,verified,source};
}
test('staged replacement and large merge plans never claim local Workshop keys or detect Workshop edits as app conflicts',async()=>{
  const fixture=stagedFixture(),local=localStorageFixture({workshopLibrary:'unreadable local bytes'}),before=local.dump();
  const replace=await shadowPlan.prepareStagedLocalSaveDataPlan(fixture.staging,fixture.shadow);assertNoWorkshop(replace.values);
  fixture.verified.state='preparing';
  const merge=await mergePlan.prepareMergedLocalSaveDataPlan(fixture.staging,fixture.shadow,{source:fixture.source,activeGuard:'guard',rounds:{},attempts:{},progress:{}},local);
  assertNoWorkshop(merge.values);assert(merge.sourceLocalSnapshot.every(entry=>!LOCAL_WORKSHOP_KEYS.includes(entry[0])));assertPrivateBytes(local,before);
  local.direct('workshopLibrary','editor wrote another version');local.direct('workshopPracticeStatistics','practice changed');
  assert(mergePlan.matchesMergeLocalSnapshot(local,merge.sourceLocalSnapshot));local.setItem('options',stored({language:'en'}));
  assert(!mergePlan.matchesMergeLocalSnapshot(local,merge.sourceLocalSnapshot));
});

test('historical rollback journals recover general app values while ignoring old Workshop snapshots',()=>{
  const local=localStorageFixture(),before=local.dump();local.setItem('options',stored({language:'en'}));
  local.setItem(shadowCommit.SHADOW_IMPORT_JOURNAL_KEY,JSON.stringify({
    target:'noten-pfoten-learning-import-old-workshop-journal',previousGeneration:generation.LEGACY_LEARNING_DATABASE_NAME,
    previous:[['options',before.options],['workshopLibrary',stored(library('Old rollback copy'))],['workshopPracticeStatistics','old statistics snapshot']]
  }));
  const recovered=shadowCommit.recoverPendingShadowImport(local);assert(recovered.recovered && recovered.committed===false);
  assert.strictEqual(local.dump().options,before.options);assertPrivateBytes(local,before);assert(!has(local.dump(),shadowCommit.SHADOW_IMPORT_JOURNAL_KEY));
});

test('new shadow commits and failed switches exclude Workshop from their owned snapshots and rollback writes',async()=>{
  for(const fail of [false,true]) {
    const local=localStorageFixture(),before=local.dump(),fixture=stagedFixture(),marker=fixture.verified;
    const plan=await shadowPlan.prepareStagedLocalSaveDataPlan(fixture.staging,fixture.shadow);
    fixture.shadow.database.markVerifiedImportReady=async()=>{marker.state='ready';};
    fixture.shadow.database.revertUnactivatedImportReady=async()=>{marker.state='database-verified';};
    const openDatabase=async()=>({database:{transaction(){const tx={objectStore(){return {get(){const request={};queueMicrotask(()=>{request.result=marker;request.onsuccess();});return request;}};}};setImmediate(()=>tx.oncomplete());return tx;}},close(){}});
    if(fail) {
      local.failNext(generation.ACTIVE_LEARNING_DATABASE_KEY);
      await assert.rejects(shadowCommit.commitStagedShadowImport(plan,fixture.shadow,local,{flushCurrentWrites:async()=>{},openDatabase}),/simulated app storage failure/);
      assert.strictEqual(local.dump().options,before.options);
    } else {
      const committed=await shadowCommit.commitStagedShadowImport(plan,fixture.shadow,local,{flushCurrentWrites:async()=>{},openDatabase});assert(committed.committed);
    }
    assertPrivateBytes(local,before);assert(!has(local.dump(),shadowCommit.SHADOW_IMPORT_JOURNAL_KEY));
  }
});

(async()=>{for(const [name,body] of cases){await body();process.stdout.write('✓ '+name+'\n');}process.stdout.write('Workshop backup exclusion checks passed.\n');})().catch(error=>{console.error(error);process.exitCode=1;});
