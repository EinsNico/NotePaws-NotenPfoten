const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const values=new Map();
global.localStorage={getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(sourceRoot))return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
const model=require('../src/model/Workshop'),editor=require('../src/model/WorkshopScoreEditor');
const storage=require('../src/model/WorkshopStorage'),xml=require('../src/model/WorkshopMusicXml'),archive=require('../src/model/WorkshopMusicXmlArchive');
Module._extensions['.js']=originalLoader;
const cases=[];
function test(name,body){cases.push({name,body});}
function note(id,startSlot=0,noteValue='eighth',voice=1){return{id,kind:'note',noteValue,startSlot,pitch:model.workshopPitchFromValue(48),voice};}
function savedVersions(count=64){
  let draft=model.createWorkshopDraft('Saved versions'),result;
  for(let index=0;index<count;index++){
    draft.score.bpm=25+index;
    result=model.saveWorkshopDraft(result ? result.library : null,draft,new Date(Date.UTC(2026,0,1,0,0,index)).toISOString());
    draft=model.openWorkshopPiece(result.piece);
  }
  return result;
}
function memoryStorage(){
  const entries=new Map();let writes=0,reject=false;
  return{getItem:key=>entries.has(key)?entries.get(key):null,
    setItem(key,value){if(reject)throw new Error('quota');writes++;entries.set(key,String(value));},
    removeItem:key=>entries.delete(key),writes:()=>writes,reject:value=>{reject=value;}};
}
function annotationScore(assets){const score=model.createWorkshopDraft('Attachments').score;
  score.musicXml={sourceXml:'<score-partwise/>',fingerprint:'source',warnings:[],archiveAssets:assets};return score;}
function asset(path,size){return{path,data:Buffer.alloc(size,17).toString('base64')};}

test('F1 intentional rest retains its onset identity and annotations exactly once when split into several durations',()=>{
  const rest={id:'annotated-rest',kind:'rest',pitch:null,noteValue:'half',startSlot:0,autoRest:false,pedal:'down',fermata:2,fermataShape:'square'};
  const measure={events:[rest]},before=JSON.stringify(measure);
  const result=editor.placeWorkshopEvent(measure,2.5,note('inserted',2.5,'sixteenth'));assert(result);
  const retained=result.find(event=>event.id===rest.id);assert(retained);
  assert.strictEqual(retained.startSlot,0);assert.strictEqual(retained.noteValue,'quarter');
  assert.strictEqual(retained.pedal,'down');assert.strictEqual(retained.fermata,2);assert.strictEqual(retained.fermataShape,'square');
  assert.strictEqual(result.filter(event=>event.pedal).length,1);assert.strictEqual(result.filter(event=>event.fermata).length,1);
  assert(result.filter(event=>event.kind==='rest').every(event=>event.autoRest===false));
  assert(model.isValidWorkshopMeasure({events:result}));assert.strictEqual(JSON.stringify(measure),before);
});

test('F1 rest annotations are not moved to a later surviving tail or repeated across voices',()=>{
  const rest={id:'rest-at-onset',kind:'rest',pitch:null,noteValue:'half',startSlot:0,voice:2,autoRest:false,pedal:'up',fermata:2};
  const measure={events:[rest,note('other-voice',0,'quarter')]};
  const result=editor.placeWorkshopEvent(measure,0,note('covers-onset',0,'quarter',2));assert(result);
  assert(!result.some(event=>event.id===rest.id || event.pedal || event.fermata));
  assert(result.some(event=>event.kind==='rest' && event.startSlot===2 && event.voice===2));
  assert.deepStrictEqual(result.find(event=>event.id==='other-voice').pitch,measure.events[1].pitch);
  const atStart=editor.placeWorkshopEvent(measure,2,note('middle',2,'eighth',2));assert(atStart);
  assert.strictEqual(atStart.find(event=>event.id===rest.id).voice,2);
  assert.strictEqual(atStart.filter(event=>event.pedal).length,1);
});

test('F1 fragment rhythm replaces old dots/tuplets while preserving a deliberate rest and not converting filler identities',()=>{
  const rest={id:'dotted-rest',kind:'rest',pitch:null,noteValue:'quarter',dots:1,startSlot:0,autoRest:false,pedal:'down'};
  const result=editor.placeWorkshopEvent({events:[rest]},1,note('new-note',1));assert(result);
  const retained=result.find(event=>event.id===rest.id);assert(retained);assert.strictEqual(retained.dots,undefined);assert.strictEqual(retained.noteValue,'eighth');
  const filler={id:'plain-filler',kind:'rest',pitch:null,noteValue:'half',startSlot:0,autoRest:true};
  const filled=editor.placeWorkshopEvent({events:[filler]},2,note('new-filler-note',2));assert(filled);
  assert(!filled.some(event=>event.id===filler.id));assert(filled.filter(event=>event.kind==='rest').every(event=>event.autoRest===true));
});

test('F4 every bar move keeps both staff base keys, inherited boundaries, mid-bar context and absolute pitches',()=>{
  let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Staff keys',3).score,true);
  score.parts[0].keyId='G-major';score.parts[1].keyId='D-major';
  score.parts[1].measures[1].keyId='F-major';
  score.parts[1].measures[2].contextChanges=[{id:'lower-mid-key',startSlot:4,keyId:'A-major'}];
  score.parts.forEach((part,p)=>part.measures.forEach((bar,i)=>{bar.events=[note('staff-'+p+'-bar-'+i,0)];}));
  assert(model.isValidWorkshopScore(score));const before=JSON.stringify(score);
  const expected=new Map();score.parts.forEach((part,p)=>part.measures.forEach((bar,i)=>expected.set(bar.id,{events:bar.events,contexts:[0,2,4,Infinity].map(slot=>model.workshopMeasureContextAtSlot(score,i,slot,p))})));
  for(let from=0;from<3;from++)for(let to=0;to<3;to++){
    if(from===to)continue;const moved=model.moveWorkshopMeasure(score,from,to);assert(moved);
    moved.parts.forEach((part,p)=>part.measures.forEach((bar,i)=>{
      assert.deepStrictEqual(bar.events,expected.get(bar.id).events);
      for(const [index,slot] of [0,2,4,Infinity].entries())assert.deepStrictEqual(model.workshopMeasureContextAtSlot(moved,i,slot,p),expected.get(bar.id).contexts[index]);
    }));
    assert.strictEqual(JSON.stringify(score),before);
  }
});

test('F5 removing a direction end bar respects inherited short, long and additive meters in each staff',()=>{
  for(const meter of ['3/4','6/4','3/8','2+3/8'])for(const type of ['wedge','tempoRamp','octaveShift']){
    let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Inherited direction',3).score,true);
    score.parts.forEach((part,p)=>{
      part.measures[0].meter=meter;
      part.measures[1].directions=[{id:'direction-'+p,type,value:type==='wedge'?'crescendo':type==='tempoRamp'?120:1,startSlot:0,endBarId:part.measures[2].id,endSlot:2}];
    });
    assert(model.isValidWorkshopScore(score));const before=JSON.stringify(score),removed=model.removeWorkshopMeasure(score,2);assert(removed);
    removed.parts.forEach(part=>{
      const direction=part.measures[1].directions[0];assert.strictEqual(direction.endSlot,model.workshopMeterUnits(meter));assert.strictEqual(direction.endBarId,undefined);
    });
    assert(model.isValidWorkshopScore(removed));assert.strictEqual(JSON.stringify(score),before);
  }
});

test('F5 a shortened direction endpoint respects a pickup instead of the full first-bar meter',()=>{
  const score=model.createWorkshopDraft('Pickup direction',2).score;score.pickupUnits=2;
  score.parts[0].measures[0].directions=[{id:'pickup-wedge',type:'wedge',value:'crescendo',startSlot:.5,endBarId:score.parts[0].measures[1].id,endSlot:1}];
  assert(model.isValidWorkshopScore(score));const removed=model.removeWorkshopMeasure(score,1);assert(removed);
  assert.strictEqual(removed.parts[0].measures[0].directions[0].endSlot,2);assert(model.isValidWorkshopScore(removed));
  score.parts[0].measures[0].directions[0].startSlot=2;
  const zeroLength=model.removeWorkshopMeasure(score,1);assert(zeroLength);assert.strictEqual(zeroLength.parts[0].measures[0].directions.length,0);
});

test('F6 single grace-note movement and duration edits at bar and pickup ends consume no regular time',()=>{
  for(const units of [8,2]){
    const grace=Object.assign(note('late-grace-'+units,units-.5),{grace:true,graceSlash:true});
    const measure={events:[grace]};if(units===2)measure.pickupUnits=2;
    const before=JSON.stringify(measure),pitch=model.workshopPitchFromValue(50);
    const moved=editor.moveWorkshopNote(measure,grace.id,grace.startSlot,pitch);assert(moved);
    assert.deepStrictEqual(moved.find(event=>event.id===grace.id).pitch,pitch);
    const changed=editor.replaceWorkshopEvent(measure,grace.id,Object.assign({},grace,{noteValue:'whole'}));assert(changed);
    assert(changed.find(event=>event.id===grace.id).grace);
    assert.strictEqual(editor.moveWorkshopNote(measure,grace.id,units+.5,pitch),null);
    assert.strictEqual(JSON.stringify(measure),before);
    assert(model.isValidWorkshopMeasure(Object.assign({},measure,{events:moved})));
  }
  const grace=Object.assign(note('grace-with-rest',1),{grace:true});
  const placed=editor.placeWorkshopEvent({events:[grace]},0,{id:'deliberate-rest',kind:'rest',noteValue:'half',pitch:null,startSlot:0});
  assert(placed);assert(placed.some(event=>event.id===grace.id));assert(placed.some(event=>event.id==='deliberate-rest'));
});

test('U2 reaching the revision cap has a precise error, preserves data and permits unchanged scores and renames',()=>{
  const result=savedVersions(),draft=model.openWorkshopPiece(result.piece),before=JSON.stringify(result.library);
  assert.strictEqual(result.piece.revisions.length,model.WORKSHOP_MAX_PIECE_REVISIONS);
  draft.score.bpm=150;assert.throws(()=>model.saveWorkshopDraft(result.library,draft),error=>error.message==='revision-limit');
  assert.strictEqual(JSON.stringify(result.library),before);
  const renamed=model.openWorkshopPiece(result.piece);renamed.title='Renamed without extra revision';
  const saved=model.saveWorkshopDraft(result.library,renamed);assert.strictEqual(saved.piece.revisions.length,64);assert.strictEqual(saved.piece.title,renamed.title);
  assert.deepStrictEqual(saved.piece.revisions,result.piece.revisions);
});

test('U2 explicit deletion removes only chosen old revisions and enables saving again without altering the current version',()=>{
  const result=savedVersions(),before=JSON.stringify(result.library),selected=[result.piece.revisions[4].id,result.piece.revisions[1].id];
  const deleted=model.deleteWorkshopRevisions(result.library,result.piece.id,selected);
  assert.strictEqual(JSON.stringify(result.library),before);assert.strictEqual(deleted.piece.revisions.length,62);
  assert.strictEqual(deleted.piece.currentRevisionId,result.piece.currentRevisionId);assert.strictEqual(deleted.piece.updatedAt,result.piece.updatedAt);
  assert.deepStrictEqual(deleted.piece.revisions,result.piece.revisions.filter(revision=>!selected.includes(revision.id)));
  assert.deepStrictEqual(deleted.removedRevisionIds,[result.piece.revisions[1].id,result.piece.revisions[4].id]);
  const draft=model.openWorkshopPiece(deleted.piece);draft.score.bpm=150;const saved=model.saveWorkshopDraft(deleted.library,draft);
  assert.strictEqual(saved.piece.revisions.length,63);assert.strictEqual(model.openWorkshopPiece(saved.piece).score.bpm,150);
});

test('U2 protected current revision and malformed, unknown or duplicate selections reject atomically',()=>{
  const result=savedVersions(3),before=JSON.stringify(result.library),old=result.piece.revisions[0].id;
  for(const [selection,message] of [[[],'invalid-revisions'],[null,'invalid-revisions'],[[old,old],'invalid-revisions'],[[old,17],'invalid-revisions'],[[old,'missing-version'],'missing-revision'],[[old,result.piece.currentRevisionId],'current-revision-protected']]){
    assert.throws(()=>model.deleteWorkshopRevisions(result.library,result.piece.id,selection),error=>error.message===message);
    assert.strictEqual(JSON.stringify(result.library),before);
  }
  assert.throws(()=>model.deleteWorkshopRevisions(result.library,'missing-piece',[old]),error=>error.message==='missing-piece');
});

test('U2 storage deletion reads the current library, preserves other new saves and rolls back failed writes',()=>{
  const memory=memoryStorage(),full=savedVersions();memory.setItem(model.WORKSHOP_STORAGE_KEY,JSON.stringify({data:full.library}));
  const old=full.piece.revisions[0].id,other=storage.storeWorkshopDraft(model.createWorkshopDraft('Saved elsewhere'),memory).piece;
  const count=memory.writes(),before=memory.getItem(model.WORKSHOP_STORAGE_KEY);
  assert.throws(()=>storage.deleteStoredWorkshopRevisions(full.piece.id,[full.piece.currentRevisionId],memory),error=>error.message==='current-revision-protected');
  assert.strictEqual(memory.writes(),count);assert.strictEqual(memory.getItem(model.WORKSHOP_STORAGE_KEY),before);
  memory.reject(true);assert.throws(()=>storage.deleteStoredWorkshopRevisions(full.piece.id,[old],memory),/quota/);memory.reject(false);
  assert.strictEqual(memory.getItem(model.WORKSHOP_STORAGE_KEY),before);
  const deleted=storage.deleteStoredWorkshopRevisions(full.piece.id,[old],memory);
  assert.deepStrictEqual(deleted.library.pieces.find(piece=>piece.id===other.id),other);assert.strictEqual(deleted.piece.revisions.length,63);
  const draft=model.openWorkshopPiece(deleted.piece);draft.score.bpm=150;
  const saved=storage.storeWorkshopDraft(draft,memory);assert.strictEqual(saved.piece.revisions.length,64);
  assert.deepStrictEqual(storage.readWorkshopLibrary(memory),saved.library);
  const verification=memoryStorage();verification.setItem(model.WORKSHOP_STORAGE_KEY,before);
  const verifiedWrite=verification.setItem;let corruptOnce=true;
  verification.setItem=(key,value)=>{verifiedWrite(key,corruptOnce ? String(value)+' ' : value);corruptOnce=false;};
  assert.throws(()=>storage.deleteStoredWorkshopRevisions(full.piece.id,[old],verification),/save-verification-failed/);
  assert.strictEqual(verification.getItem(model.WORKSHOP_STORAGE_KEY),before);
  const newerCurrent=model.cloneWorkshop(full.library);newerCurrent.pieces[0].currentRevisionId=old;
  verification.setItem(model.WORKSHOP_STORAGE_KEY,JSON.stringify({data:newerCurrent}));
  const protectedBefore=verification.getItem(model.WORKSHOP_STORAGE_KEY);
  assert.throws(()=>storage.deleteStoredWorkshopRevisions(full.piece.id,[old],verification),/current-revision-protected/);
  assert.strictEqual(verification.getItem(model.WORKSHOP_STORAGE_KEY),protectedBefore);
});

test('F12 archive byte budget accepts exact and padded multi-attachment limits but rejects an extra decoded byte',()=>{
  const limit=model.WORKSHOP_MAX_ARCHIVE_ASSET_BYTES;
  for(const size of [limit-2,limit-1,limit])assert(model.isValidWorkshopScore(annotationScore([asset('images/single.bin',size)])));
  assert(!model.isValidWorkshopScore(annotationScore([asset('images/oversize.bin',limit+1)])));
  const sizes=[1,limit-1];assert(model.isValidWorkshopScore(annotationScore(sizes.map((size,i)=>asset('images/'+i+'.bin',size)))));
  assert(!model.isValidWorkshopScore(annotationScore([asset('images/a.bin',1),asset('images/b.bin',limit)])));
});

test('F12 archive Base64 validation requires correct alphabet, length and canonical padding bits',()=>{
  for(const data of ['', 'AA==','AAA=','AAAA','/w==','//8='])assert(model.isValidWorkshopScore(annotationScore([{path:'images/good.bin',data}])));
  for(const data of ['A','AA','AAA','AA=A','A===','AA===','AB==','AAB=','/x==','//9=','AA==\n','@@=='])assert(!model.isValidWorkshopScore(annotationScore([{path:'images/bad.bin',data}])));
  assert(!model.isValidWorkshopScore(annotationScore(new Array(1))));
});

test('F12 real MXL import accepts exact 2 MiB and independent padding across attachments and exports them again',async()=>{
  const source='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>';
  for(const sizes of [[model.WORKSHOP_MAX_ARCHIVE_ASSET_BYTES],[1,model.WORKSHOP_MAX_ARCHIVE_ASSET_BYTES-1]]){
    const assets=sizes.map((size,index)=>({path:'images/'+index+'.bin',data:new Uint8Array(size)}));
    const packed=archive.writeMusicXmlArchive(source,{rootPath:'score.musicxml',assets});
    const imported=await xml.importWorkshopMusicXml(packed);assert(model.isValidWorkshopScore(imported.score));
    assert.deepStrictEqual(imported.score.musicXml.archiveAssets.map(entry=>Buffer.from(entry.data,'base64').length),sizes);
    const exported=await xml.exportWorkshopMusicXml(imported.score,{compressed:true}),reopened=await xml.importWorkshopMusicXml(exported.data);
    assert.deepStrictEqual(reopened.score.musicXml.archiveAssets,imported.score.musicXml.archiveAssets);
  }
});

(async()=>{for(const entry of cases){await entry.body();console.log('✓ workshop audit model repairs: '+entry.name);}console.log('Workshop audit model repair regressions passed ('+cases.length+' cases).');})().catch(error=>{console.error(error.stack);process.exitCode=1;});
