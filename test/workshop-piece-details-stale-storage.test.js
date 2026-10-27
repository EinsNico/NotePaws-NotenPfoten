const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>filename.startsWith(sourceRoot)
  ? mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename)
  : originalLoader(mod,filename);
const model=require('../src/model/Workshop'),storage=require('../src/model/WorkshopStorage');
const practice=require('../src/model/WorkshopPracticeStatistics');
Module._extensions['.js']=originalLoader;
function ram(){
  const values=new Map();let failure=null,writes=0;
  return{getItem:key=>values.has(key)?values.get(key):null,removeItem:key=>values.delete(key),
    setItem(key,value){writes++;const action=failure;failure=null;if(action==='quota')throw new Error('quota');if(action==='silent')return;values.set(key,action==='corrupt'?'invalid write':String(value));},
    failNext(action){failure=action;},get writes(){return writes;},snapshot(){return JSON.stringify(Array.from(values.entries()));}};
}
function fixture(){
  const memory=ram(),draft=model.createWorkshopDraft('Shared original',3);
  draft.score.parts[0].measures[0].events=[{id:'shared-note',kind:'note',noteValue:'quarter',startSlot:0,pitch:model.workshopPitchFromValue(48)}];
  draft.score.metadata={title:'Shared original',composer:'Original composer',copyright:'Keep this',sources:[{label:'Original source',url:'https://example.com/original'}]};
  draft.score.layout={barsPerSystem:2};draft.score.musicXml={sourceXml:'<score-partwise/>',fingerprint:'original',warnings:[],rootPath:'score.xml',archiveAssets:[{path:'cover.txt',data:'aGk='}]};
  const piece=storage.storeWorkshopDraft(draft,memory).piece,baseline=model.openWorkshopPiece(piece);
  memory.setItem(practice.WORKSHOP_PRACTICE_STATISTICS_KEY,JSON.stringify({version:1,pieces:[{pieceId:piece.id,correct:4,early:1,late:0,wrong:0,missed:0,learnedNoteKeys:['shared-note']}]}));
  memory.setItem('app-settings','keep all settings');
  return{memory,piece,baseline};
}
function music(score){const copy=model.cloneWorkshop(score);delete copy.bpm;delete copy.metadata;return copy;}
function rename(baseline,title){const changed=model.cloneWorkshop(baseline);changed.title=title;changed.score.metadata.title=title;return changed;}
function newerScore(context){
  const next=model.cloneWorkshop(context.baseline);next.score.parts[0].measures[0].events[0].pitch=model.workshopPitchFromValue(50);
  next.score.bpm=95;next.score.metadata.composer='Newer composer';next.score.metadata.subtitle='Added elsewhere';
  next.score.layout.barsPerSystem=3;next.score.musicXml.sourceXml='<score-partwise version="4.0"/>';next.score.musicXml.fingerprint='newer';
  next.score.musicXml.archiveAssets.push({path:'new.txt',data:'bmV3'});
  return storage.storeWorkshopDraft(next,context.memory);
}
const checks=[];function test(name,body){checks.push({name,body});}

test('stale rename applies to the freshly stored music and preserves every earlier revision, original asset and practice entry',()=>{
  const context=fixture(),newer=newerScore(context),updated=rename(context.baseline,'Only renamed');
  const original=JSON.stringify(context.baseline),input=JSON.stringify(updated),practiceBefore=context.memory.getItem(practice.WORKSHOP_PRACTICE_STATISTICS_KEY);
  const result=storage.storeWorkshopPieceDetails(context.baseline,updated,context.memory),active=model.openWorkshopPiece(result.piece);
  assert.strictEqual(result.changed,true);assert.strictEqual(active.title,'Only renamed');assert.strictEqual(active.score.metadata.title,'Only renamed');
  assert.strictEqual(active.score.parts[0].measures[0].events[0].pitch.step,'D');assert.strictEqual(active.score.bpm,95);
  assert.strictEqual(active.score.metadata.composer,'Newer composer');assert.strictEqual(active.score.metadata.subtitle,'Added elsewhere');
  assert.deepStrictEqual(music(active.score),music(model.openWorkshopPiece(newer.piece).score));
  assert.deepStrictEqual(result.piece.revisions.slice(0,2),newer.piece.revisions);assert.strictEqual(result.piece.revisions.length,3);
  assert.strictEqual(context.memory.getItem(practice.WORKSHOP_PRACTICE_STATISTICS_KEY),practiceBefore);assert.strictEqual(context.memory.getItem('app-settings'),'keep all settings');
  assert.strictEqual(JSON.stringify(context.baseline),original);assert.strictEqual(JSON.stringify(updated),input);
  assert.deepStrictEqual(storage.readWorkshopLibrary(context.memory),result.library);
});

test('only changed detail fields are patched, including explicit credit and source removal; untouched stale fields retain the newer values',()=>{
  const context=fixture(),newer=newerScore(context),updated=model.cloneWorkshop(context.baseline);
  updated.score.bpm=120;delete updated.score.metadata.copyright;updated.score.metadata.arranger='My arranger';delete updated.score.metadata.sources;
  const result=storage.storeWorkshopPieceDetails(context.baseline,updated,context.memory),active=model.openWorkshopPiece(result.piece);
  assert.strictEqual(active.title,'Shared original');assert.strictEqual(active.score.bpm,120);assert.strictEqual(active.score.metadata.composer,'Newer composer');
  assert.strictEqual(active.score.metadata.subtitle,'Added elsewhere');assert.strictEqual(active.score.metadata.arranger,'My arranger');
  assert(!Object.prototype.hasOwnProperty.call(active.score.metadata,'copyright'));assert(!Object.prototype.hasOwnProperty.call(active.score.metadata,'sources'));
  assert.deepStrictEqual(music(active.score),music(model.openWorkshopPiece(newer.piece).score));
  assert.deepStrictEqual(result.piece.revisions.slice(0,2),newer.piece.revisions);
});

test('an unchanged stale dialog reloads the latest version without creating a revision or writing storage',()=>{
  const context=fixture(),newer=newerScore(context),before=context.memory.snapshot(),writes=context.memory.writes;
  const result=storage.storeWorkshopPieceDetails(context.baseline,model.cloneWorkshop(context.baseline),context.memory);
  assert.strictEqual(result.changed,false);assert.deepStrictEqual(result.piece,newer.piece);assert.strictEqual(context.memory.snapshot(),before);assert.strictEqual(context.memory.writes,writes);
});

test('a piece deleted after opening the dialog is never recreated, including an unchanged submission',()=>{
  const context=fixture();storage.deleteStoredWorkshopPiece(context.piece.id,context.memory);const before=context.memory.snapshot();
  for(const updated of [rename(context.baseline,'Too late'),model.cloneWorkshop(context.baseline)]){
    assert.throws(()=>storage.storeWorkshopPieceDetails(context.baseline,updated,context.memory),error=>error.message==='missing-piece');
    assert.strictEqual(context.memory.snapshot(),before);assert.strictEqual(storage.readWorkshopLibrary(context.memory).pieces.length,0);
  }
});

test('quota, silently dropped writes and failed verification preserve the complete newer library and allow a corrected retry',()=>{
  for(const failure of ['quota','silent','corrupt']){
    const context=fixture(),newer=newerScore(context),updated=rename(context.baseline,'Retry title'),before=context.memory.snapshot();
    context.memory.failNext(failure);assert.throws(()=>storage.storeWorkshopPieceDetails(context.baseline,updated,context.memory));
    assert.strictEqual(context.memory.snapshot(),before);assert.deepStrictEqual(storage.readWorkshopLibrary(context.memory).pieces[0],newer.piece);
    const result=storage.storeWorkshopPieceDetails(context.baseline,updated,context.memory);
    assert.strictEqual(result.piece.title,'Retry title');assert.strictEqual(model.openWorkshopPiece(result.piece).score.parts[0].measures[0].events[0].pitch.step,'D');
  }
});

test('invalid details, mismatched identities and musical edits through the details API fail without changing stored music',()=>{
  const context=fixture();newerScore(context);const before=context.memory.snapshot();
  for(const mutate of [draft=>{draft.title=' ';},draft=>{draft.pieceId='another-piece';},draft=>{draft.score.bpm=0;},
    draft=>{draft.score.parts[0].measures[0].events[0].pitch=model.workshopPitchFromValue(52);},draft=>{draft.score.musicXml.sourceXml='changed original';},
    draft=>{draft.score.metadata.sources=[{label:'Bad link',url:'javascript:bad'}];}]){
    const updated=model.cloneWorkshop(context.baseline);mutate(updated);
    assert.throws(()=>storage.storeWorkshopPieceDetails(context.baseline,updated,context.memory),error=>error.message==='invalid-details');assert.strictEqual(context.memory.snapshot(),before);
  }
  context.memory.setItem(model.WORKSHOP_STORAGE_KEY,'broken library');const broken=context.memory.snapshot();
  assert.throws(()=>storage.storeWorkshopPieceDetails(context.baseline,rename(context.baseline,'Safe title'),context.memory));assert.strictEqual(context.memory.snapshot(),broken);
});

test('revision limits remain explicit and a title-only piece rename is allowed without replacing a full revision history',()=>{
  const context=fixture();let current=context.piece;
  for(let index=1;index<model.WORKSHOP_MAX_PIECE_REVISIONS;index++){
    const draft=model.openWorkshopPiece(current);draft.score.bpm=60+index;current=storage.storeWorkshopDraft(draft,context.memory).piece;
  }
  const titleOnly=model.cloneWorkshop(context.baseline);titleOnly.title='Title only';
  const result=storage.storeWorkshopPieceDetails(context.baseline,titleOnly,context.memory);
  assert.strictEqual(result.piece.title,'Title only');assert.strictEqual(result.piece.revisions.length,64);assert.strictEqual(result.piece.currentRevisionId,current.currentRevisionId);
  assert.deepStrictEqual(result.piece.revisions,current.revisions);const before=context.memory.snapshot();
  const changedTempo=model.cloneWorkshop(context.baseline);changedTempo.score.bpm=230;
  assert.throws(()=>storage.storeWorkshopPieceDetails(context.baseline,changedTempo,context.memory),error=>error.message==='revision-limit');assert.strictEqual(context.memory.snapshot(),before);
});

for(const check of checks){check.body();console.log('✓ '+check.name);}console.log(checks.length+' stale piece-details storage checks passed.');
