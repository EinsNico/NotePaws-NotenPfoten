const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const root=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{if(!filename.startsWith(root))return original(mod,filename);mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);};
const model=require('../src/model/Workshop'),store=require('../src/model/WorkshopStorage'),io=require('../src/model/WorkshopMusicXml');
const backup=require('../src/model/SaveDataBackup'),files=require('../src/model/SaveDataFiles'),imports=require('../src/model/SaveDataImport');
const {SaveDataStreamReader}=require('../src/model/SaveDataStreamReader');
const {MAX_SHADOW_LOCAL_PLAN_BYTES,shadowLocalPlanByteLimit,prepareStagedLocalSaveDataPlan,readLegacyRounds}=require('../src/model/SaveDataShadowLocalPlan');
const {prepareMergedLocalSaveDataPlan}=require('../src/model/SaveDataLargeMergeLocalPlan');
const {readActiveMergeGuard}=require('../src/model/SaveDataLargeMergePreparation');
const {commitStagedShadowImport,SHADOW_IMPORT_JOURNAL_KEY}=require('../src/model/SaveDataShadowCommit');
const {ACTIVE_LEARNING_DATABASE_KEY}=require('../src/model/LearningDatabaseGeneration');
Module._extensions['.js']=original;
function storage(){const values=new Map();let failKey=null;return {get length(){return values.size;},key(index){return Array.from(values.keys())[index]||null;},getItem(key){return values.has(key)?values.get(key):null;},setItem(key,value){if(failKey===key){failKey=null;throw new Error('Simulated workshop quota failure');}values.set(key,String(value));},removeItem(key){values.delete(key);},failNext(key){failKey=key;}};}
function stored(value){return JSON.stringify({data:value});}
function plain(score){const value=model.cloneWorkshop(score);delete value.musicXml;return value;}
function databaseExportOptions(){return {
  learningStorage:{async flush(){},getStatus(){return {failedWrites:0};},async verifyHistoryReady(){return {saved:true,verified:true};},async migrateLegacyHistory(){return {saved:true,verified:true};},async synchronizeProgress(){return {saved:true};},async readDailyTaskHistory() { return { saved: true, history: null }; },
      async readBackupSnapshot(){return {saved:true,progress:{version:3,notes:{}},attempts:[]};},async readProgress(){return {saved:true,progress:{version:3,notes:{}}};},async readBackupAttemptsPage(){return {saved:true,page:{records:[],done:true}};}},
  noteFlowStorage:{async flush(){},async readRoundsForExport(){return {saved:true,rounds:[]};},async readRoundsPage(){return {saved:true,page:{records:[],done:true}};}},
  rhythmStorage:{async flush(){},async readBarsForExport(){return {saved:true,bars:[]};},async readBarsPage(){return {saved:true,page:{records:[],done:true}};}},includeNoteFlowRounds:true,includeRhythmSenseBars:true
};}
function fixture(exported){
  const reader=new SaveDataStreamReader(()=>{throw new Error('No training records in fixture');}),json=JSON.stringify(exported);
  for(let index=0;index<json.length;index+=8192)reader.push(json.slice(index,index+8192));
  const result=reader.finish(),metadata={key:'ready',shell:result.backup,counts:result.counts};
  const summary={source:{createdAt:exported.createdAt,fileSize:null},rounds:{'screen:note-flow':0,'midi:note-flow':0,'midi:note-flow-chords':0,'rhythm:taktgefuehl':0},attempts:{'screen:single-notes':0,'midi:single-notes':0},progress:{},activeGuard:'test'};
  const marker={state:'database-verified',summary},staging={async readMetadata(){return metadata;},async readBatch(){return {records:[],nextIndex:0,total:0,done:true};}};
  const shadow={name:'noten-pfoten-learning-import-musicxml-backup',database:{async readImportGenerationMarker(){return marker;},async readProgressSnapshot(){return [];},async markVerifiedImportReady(){marker.state='ready';},async revertUnactivatedImportReady(){marker.state='database-verified';}}};
  const openDatabase=async ({name})=>{assert.strictEqual(name,shadow.name);return {database:{transaction(){const tx={objectStore(){return {get(){const request={};queueMicrotask(()=>{request.result=marker;request.onsuccess();});return request;}};}};setImmediate(()=>tx.oncomplete());return tx;}},close(){}};};
  return {metadata,staging,shadow,marker,summary,openDatabase};
}
async function test(name,callback){await callback();process.stdout.write('✓ workshop MusicXML backup: '+name+'\n');}
async function run(){
  const source='<score-partwise version="4.0"><work><work-title>MusicXML backup</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>12</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>12</duration><type>quarter</type></note></measure><measure number="2"><note><pitch><step>D</step><octave>4</octave></pitch><duration>12</duration><type>quarter</type></note></measure></part><!--'+ 'x'.repeat(850000)+'--></score-partwise>';
  const imported=io.importWorkshopMusicXmlText(source),draft=model.createWorkshopDraft(imported.title,2);draft.score=imported.score;
  draft.score.metadata={title:imported.title,composer:'Nico',arranger:'Fox',lyricist:'Pfote',copyright:'© 2026',subtitle:'Advanced notation'};
  draft.score.layout={barsPerSystem:3,pageWidth:1200,pageHeight:1700,marginLeft:40,fontFamily:'Bravura',fontSize:12,systemBreaks:[draft.score.parts[0].measures[1].id],pageBreaks:[]};
  draft.score.parts[0].measures[0].events[0].fermata=3;
  draft.score.parts[0].measures[0].events[0].ornament='trill';
  draft.score.parts[0].measures[0].events[0].arpeggio='up';
  draft.score.parts[0].measures[0].events[0].lyric='Fuchs';
  draft.score.parts[0].clef='alto';draft.score.parts[0].keyId='G-major';
  draft.score.parts[0].measures[0].events[0].fermataShape='square';
  draft.score.parts[0].measures[0].events[0].lyrics=[{number:'1',text:'Fuchs',syllabic:'begin',extend:'start'},{number:'2',text:'Pfote',syllabic:'single'}];
  draft.score.parts[0].measures[1].events[0].ornament='tremolo';draft.score.parts[0].measures[1].events[0].tremoloMarks=2;
  draft.score.glissandos=[{fromId:draft.score.parts[0].measures[0].events[0].id,toId:draft.score.parts[0].measures[1].events[0].id,type:'slide'}];
  draft.score.parts[0].measures[0].events[0].pitch.alter=2;
  draft.score.parts[0].measures[0].events[0].dots=2;
  draft.score.parts[0].measures[0].directions=[{id:'tempo-ramp-backup',type:'tempoRamp',startSlot:0,value:110,endSlot:4,endBarId:draft.score.parts[0].measures[1].id},{id:'wedge-backup',type:'wedge',startSlot:0,value:'crescendo',endSlot:4},{id:'octave-backup',type:'octaveShift',startSlot:0,value:1,endSlot:4},{id:'pedal-backup',type:'pedal',startSlot:0,value:'half'}];
  draft.score.parts[0].measures[0].navigation=['segno'];
  draft.score.parts[0].measures[1].navigation=['fine','ds'];
  draft.score.musicXml.archiveAssets=[{path:'images/a.bin',data:Buffer.from([0,255,31,15]).toString('base64')}];draft.score.musicXml.rootPath='score.musicxml';
  assert(model.isValidWorkshopScore(draft.score));
  const sourceStorage=storage(),first=store.storeWorkshopDraft(draft,sourceStorage),reopened=model.openWorkshopPiece(first.piece);reopened.score.bpm=90;
  const second=store.storeWorkshopDraft(reopened,sourceStorage),expected=second.library;
  assert.strictEqual(expected.pieces[0].revisions.length,2);assert(JSON.stringify(expected).length*2>MAX_SHADOW_LOCAL_PLAN_BYTES);
  const exported=backup.createSaveDataBackup(sourceStorage,{createdAt:'2026-10-03T12:00:00.000Z'});assert(backup.validateSaveDataBackup(exported).valid);
  const legacy=model.cloneWorkshop(exported);legacy.version=5;legacy.data.workshopLibrary=model.cloneWorkshop(expected);
  assert(backup.validateSaveDataBackup(legacy).valid);
  await test('local XML sources, assets and notation revisions survive app exports without entering them',async()=>{
    assert.strictEqual(backup.parseSaveDataBackup(JSON.stringify(exported)).backup.data.workshopLibrary,undefined);
    const full=await files.createIndexedDbSaveDataBackup(sourceStorage,databaseExportOptions());assert.strictEqual(full.version,4);assert.strictEqual(full.data.workshopLibrary,undefined);
    const chunks=[];await files.streamIndexedDbSaveDataBackup(async chunk=>chunks.push(chunk),sourceStorage,databaseExportOptions());const streamed=JSON.parse(chunks.join(''));assert(backup.validateSaveDataBackup(streamed).valid);assert.strictEqual(streamed.version,4);assert.strictEqual(streamed.data.workshopLibrary,undefined);
    assert.deepStrictEqual(store.readWorkshopLibrary(sourceStorage),expected);
    const reopened=model.openWorkshopPiece(store.readWorkshopLibrary(sourceStorage).pieces[0]);
    const xml=await io.exportWorkshopMusicXml(reopened.score,{title:reopened.title,compressed:true}),roundtrip=await io.importWorkshopMusicXml(xml.data);
    assert.deepStrictEqual(plain(roundtrip.score),plain(reopened.score));assert.strictEqual(roundtrip.score.musicXml.sourceXml,source);assert.deepStrictEqual(roundtrip.score.musicXml.archiveAssets,reopened.score.musicXml.archiveAssets);
    assert.deepStrictEqual(fixture(legacy).metadata.shell.data.workshopLibrary,expected,'legacy source documents remain readable');
  });
  await test('ordinary app replacement and merge preserve local source documents, expressions, layout and revisions',()=>{
    const target=storage();target.setItem('workshopLibrary',sourceStorage.getItem('workshopLibrary'));target.setItem('unrelated','keep');
    for(const incoming of [exported,legacy])for(const mode of ['replace','merge']){
      imports.applyPreparedSaveDataImport(target,imports.prepareSaveDataImport(target,incoming,mode));assert.deepStrictEqual(store.readWorkshopLibrary(target),expected);assert.strictEqual(target.getItem('unrelated'),'keep');
    }
  });
  await test('large legacy XML sources never inflate staged replacement or merge plans',async()=>{
    const input=fixture(legacy),plan=await prepareStagedLocalSaveDataPlan(input.staging,input.shadow);
    assert(plan.estimatedBytes<MAX_SHADOW_LOCAL_PLAN_BYTES);assert.strictEqual(shadowLocalPlanByteLimit(plan.values),MAX_SHADOW_LOCAL_PLAN_BYTES);assert.strictEqual(plan.values.workshopLibrary,undefined);assert.strictEqual(plan.values.undefined,undefined);
    const target=storage();target.setItem('workshopLibrary',sourceStorage.getItem('workshopLibrary'));input.marker.state='preparing';
    const merged=await prepareMergedLocalSaveDataPlan(input.staging,input.shadow,input.summary,target);assert(merged.estimatedBytes<MAX_SHADOW_LOCAL_PLAN_BYTES);assert.strictEqual(merged.values.workshopLibrary,undefined);assert.strictEqual(merged.values.undefined,undefined);assert.deepStrictEqual(store.readWorkshopLibrary(target),expected);
  });
  await test('verified staged commits preserve large local XML sources and unrelated storage',async()=>{
    const input=fixture(legacy),plan=await prepareStagedLocalSaveDataPlan(input.staging,input.shadow),target=storage();target.setItem('workshopLibrary',sourceStorage.getItem('workshopLibrary'));target.setItem('unrelated','keep');
    const result=await commitStagedShadowImport(plan,input.shadow,target,{flushCurrentWrites:async()=>{},openDatabase:input.openDatabase});assert.strictEqual(result.committed,true);assert.strictEqual(target.getItem(ACTIVE_LEARNING_DATABASE_KEY),input.shadow.name);assert.deepStrictEqual(store.readWorkshopLibrary(target),expected);assert.strictEqual(target.getItem('unrelated'),'keep');assert.strictEqual(target.getItem(SHADOW_IMPORT_JOURNAL_KEY),null);
  });
  await test('large merged commits preserve existing local source revisions while ignoring incoming pieces',async()=>{
    const input=fixture(legacy),target=storage();target.setItem('workshopLibrary',sourceStorage.getItem('workshopLibrary'));const local=store.storeWorkshopDraft(model.createWorkshopDraft('Local score'),target).library;
    const activeDatabase={async readDailyTaskHistory(){return null;},async readNoteFlowStatistics(scope){return {scope,roundCount:0};},async readAttemptHistoryState(){return {nextSequence:0,fingerprint:null};},async readProgressSnapshot(){return [];}};
    input.summary.activeGuard=await readActiveMergeGuard(activeDatabase);input.marker.state='preparing';
    const plan=await prepareMergedLocalSaveDataPlan(input.staging,input.shadow,input.summary,target);input.marker.state='database-verified';
    const result=await commitStagedShadowImport(plan,input.shadow,target,{flushCurrentWrites:async()=>{},openDatabase:input.openDatabase,activeDatabase});assert.strictEqual(result.committed,true);assert.deepStrictEqual(store.readWorkshopLibrary(target),local);
  });
  await test('quota failure during an app commit leaves the large Workshop library and active database unchanged',async()=>{
    const incoming=model.cloneWorkshop(legacy);incoming.data.statistics.legacyRecord=12;
    const input=fixture(incoming),plan=await prepareStagedLocalSaveDataPlan(input.staging,input.shadow),target=storage();target.setItem('workshopLibrary',sourceStorage.getItem('workshopLibrary'));const before=target.getItem('workshopLibrary');target.failNext('record');
    await assert.rejects(commitStagedShadowImport(plan,input.shadow,target,{flushCurrentWrites:async()=>{},openDatabase:input.openDatabase}),/quota failure/);assert.strictEqual(target.getItem('workshopLibrary'),before);assert.strictEqual(target.getItem(ACTIVE_LEARNING_DATABASE_KEY),null);assert.strictEqual(target.getItem(SHADOW_IMPORT_JOURNAL_KEY),null);
  });
  await test('legacy file validation still rejects malformed or oversized Workshop sources',async()=>{
    const invalid=model.cloneWorkshop(legacy);invalid.data.workshopLibrary.pieces[0].revisions[0].score.musicXml.sourceXml='x'.repeat(30*1024*1024+1);assert.strictEqual(backup.validateSaveDataBackup(invalid).valid,false);
    invalid.data.workshopLibrary={version:1,pieces:[null]};assert.strictEqual(backup.validateSaveDataBackup(invalid).valid,false);
    assert.strictEqual(shadowLocalPlanByteLimit({workshopLibrary:'not-json'}),MAX_SHADOW_LOCAL_PLAN_BYTES,'Workshop data is outside plan ownership');
    const input=fixture(legacy);input.metadata.shell.data.workshopLibrary={version:1,pieces:[null]};const plan=await prepareStagedLocalSaveDataPlan(input.staging,input.shadow);assert.strictEqual(plan.values.workshopLibrary,undefined);
  });
  await test('non-workshop settings and legacy rounds retain their independent original three-megabyte guard',async()=>{
    assert.strictEqual(shadowLocalPlanByteLimit({}),MAX_SHADOW_LOCAL_PLAN_BYTES);assert.strictEqual(shadowLocalPlanByteLimit({workshopLibrary:null}),MAX_SHADOW_LOCAL_PLAN_BYTES);
    const input=fixture(legacy);input.metadata.shell.data.options={payload:'x'.repeat(MAX_SHADOW_LOCAL_PLAN_BYTES/2+1)};await assert.rejects(prepareStagedLocalSaveDataPlan(input.staging,input.shadow),/safe local storage limit/);
    input.marker.state='preparing';await assert.rejects(prepareMergedLocalSaveDataPlan(input.staging,input.shadow,input.summary,storage()),/safe local storage limit/);
    await assert.rejects(readLegacyRounds({async readBatch(){return {records:[{id:'large',payload:'x'.repeat(MAX_SHADOW_LOCAL_PLAN_BYTES/2+1)}],nextIndex:1,total:1};}},{counts:{'data.roundHistory.rounds':1},shell:{data:{roundHistory:{version:1,rounds:[]}}}}),/Normal rounds exceed/);
  });
  await test('commit rechecks actual byte size and rejects forged low estimates for oversized unrelated settings',async()=>{
    const input=fixture(legacy),plan=await prepareStagedLocalSaveDataPlan(input.staging,input.shadow);plan.values.options=stored({payload:'x'.repeat(MAX_SHADOW_LOCAL_PLAN_BYTES/2+1)});plan.estimatedBytes=1;
    const target=storage();await assert.rejects(commitStagedShadowImport(plan,input.shadow,target,{flushCurrentWrites:async()=>{},openDatabase:input.openDatabase}),/safe storage limit/);assert.strictEqual(target.length,0);
  });
}
run().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
