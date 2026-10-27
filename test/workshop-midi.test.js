const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(sourceRoot))return original(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
const midi=require('../src/model/WorkshopMidi'),model=require('../src/model/Workshop'),xml=require('../src/model/WorkshopMusicXml');
const storeModel=require('../src/model/WorkshopStorage'),backup=require('../src/model/SaveDataBackup'),imports=require('../src/model/SaveDataImport');
Module._extensions['.js']=original;
function word(value){return [(value>>>8)&255,value&255];}
function long(value){return [(value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255];}
function variable(value){let bytes=[value&127];while(value=Math.floor(value/128))bytes.unshift((value&127)|128);return bytes;}
function event(delta,...bytes){return variable(delta).concat(bytes);}
function meta(delta,type,bytes=[]){return event(delta,255,type,...variable(bytes.length),...bytes);}
function text(value){return Array.from(Buffer.from(value,'utf8'));}
function track(events){const data=[].concat(...events,meta(0,47));return [77,84,114,107,...long(data.length),...data];}
function smf(tracks,format=tracks.length===1?0:1,division=480){return Uint8Array.from([77,84,104,100,0,0,0,6,...word(format),...word(tracks.length),...word(division),...tracks.reduce((all,events)=>all.concat(track(events)),[])]);}
function notes(score){return score.parts.reduce((all,part)=>all.concat(...part.measures.map(bar=>bar.events.filter(note=>note.kind==='note'))),[]);}
function sounding(score){return model.workshopTimeline(score).events.filter(event=>event.value!==null);}
function storage(){const data=new Map();return {get length(){return data.size;},key(index){return Array.from(data.keys())[index]||null;},getItem(key){return data.has(key)?data.get(key):null;},setItem(key,value){data.set(key,String(value));},removeItem(key){data.delete(key);}};}
function errorCode(bytes,code){assert.throws(()=>midi.importWorkshopMidi(bytes),error=>error.code===code);}
async function test(name,run){await run();process.stdout.write('✓ Workshop MIDI: '+name+'\n');}
async function run(){
  await test('format0 imports a timed chord, running status and note-on-zero releases',()=>{
    const data=smf([[meta(0,3,text('A MIDI chord')),event(0,144,60,90),event(0,64,90),event(0,67,90),event(480,144,60,0),event(0,64,0),event(0,67,0)]]);
    const imported=midi.importWorkshopMidi(data,{filename:'fallback.mid'});assert(model.isValidWorkshopScore(imported.score));assert.strictEqual(imported.title,'A MIDI chord');assert.deepStrictEqual(imported.warnings,['notation-inferred']);assert.strictEqual(imported.score.bpm,120);
    assert.deepStrictEqual(sounding(imported.score).map(event=>[event.value,event.startMs,event.durationMs]),[[48,0,500],[52,0,500],[55,0,500]]);assert(notes(imported.score).every(note=>note.noteValue==='quarter'&&note.startSlot===0));
    assert.strictEqual(imported.score.parts.length,1);assert.strictEqual(imported.score.metadata.title,imported.title);
  });
  await test('format1 merges tracks into two editable hands and preserves overlapping lengths',()=>{
    const data=smf([[meta(0,81,[7,161,32]),meta(0,88,[3,2,24,8])],[event(0,144,64,80),event(480,144,67,80),event(480,128,67,0),event(960,128,64,0)],[event(0,145,48,80),event(1440,129,48,0)]]);
    const imported=midi.importWorkshopMidi(data,{filename:'Two hands.midi'}),score=imported.score;assert(model.isValidWorkshopScore(score));assert.strictEqual(imported.title,'Two hands');assert.strictEqual(score.parts.length,2);assert.deepStrictEqual(score.parts.map(part=>part.clef),['treble','bass']);assert.strictEqual(score.meter,'3/4');assert.strictEqual(score.parts[0].measures.length,2);
    const attacks=sounding(score).filter(event=>!event.tieFromId);assert.strictEqual(attacks.length,3);assert(attacks.some(event=>event.value===36&&event.startMs===0&&event.durationMs===1500));assert(attacks.some(event=>event.value===55&&event.startMs===500&&event.durationMs===500));
    assert(score.ties.length);assert(notes(score).filter(note=>note.pitch.step==='G').every(note=>note.voice===2));
  });
  await test('tempo changes integrate held notes and boundary time-signature changes retain future positions',()=>{
    const data=smf([[meta(0,81,[7,161,32]),event(0,144,60,80),meta(480,81,[15,66,64]),event(480,128,60,0),meta(960,88,[3,2,24,8]),event(0,144,62,80),event(480,128,62,0)]]);
    const score=midi.importWorkshopMidi(data).score,timeline=sounding(score);assert.strictEqual(timeline[0].durationMs,1500);assert.strictEqual(timeline[1].startMs,3500);assert.strictEqual(timeline[1].durationMs,1000);assert.strictEqual(score.parts[0].measures[1].meter,'3/4');
    errorCode(smf([[event(0,144,60,80),meta(480,88,[3,2,24,8]),event(480,128,60,0)]]),'unsupported-midi-score');
  });
  await test('key signatures, natural cancellations and intra-bar key changes retain MIDI pitches',()=>{
    const data=smf([[meta(0,89,[255,0]),event(0,144,70,80),event(480,128,70,0),meta(0,89,[1,0]),event(0,144,66,80),event(480,128,66,0),event(0,144,65,80),event(480,128,65,0)]]);
    const score=midi.importWorkshopMidi(data).score,written=notes(score);assert.strictEqual(score.keyId,'F-major');assert.deepStrictEqual(written[0].pitch,{step:'B',alter:-1,octave:4});assert.deepStrictEqual(written[1].pitch,{step:'F',alter:1,octave:4});assert.deepStrictEqual(written[2].pitch,{step:'F',alter:0,octave:4});assert.strictEqual(score.parts[0].measures[0].contextChanges[0].keyId,'G-major');assert.deepStrictEqual(sounding(score).map(note=>note.value),[58,54,53]);
  });
  await test('bar crossings create valid ties without retriggering an independent same-pitch attack',()=>{
    const data=smf([[event(1440,144,72,80),event(960,128,72,0),event(0,144,72,80),event(480,128,72,0)]]);
    const score=midi.importWorkshopMidi(data).score;assert(model.isValidWorkshopScore(score));assert.strictEqual(score.parts[0].measures.length,2);assert.strictEqual(score.ties.length,1);const timeline=sounding(score);assert.strictEqual(timeline.filter(note=>!note.tieFromId).length,2);assert.strictEqual(timeline[2].startMs,2500);assert(!timeline[2].tieFromId);
  });
  await test('same-pitch overlapping attacks pair FIFO and retain both notes',()=>{
    const data=smf([[event(0,144,60,80),event(240,144,60,80),event(240,128,60,0),event(240,128,60,0)]]),score=midi.importWorkshopMidi(data).score;
    assert.deepStrictEqual(sounding(score).map(note=>[note.startMs,note.durationMs]),[[0,500],[250,500]]);assert.strictEqual(notes(score)[1].voice,2);assert(!score.ties);
  });
  await test('more than four inferred overlapping streams retain all attacks and disclose merged voices and velocity',()=>{
    const events=[],pitches=[60,62,64,65,67];pitches.forEach((pitch,index)=>events.push(event(index?240:0,144,pitch,70+index)));pitches.forEach((pitch,index)=>events.push(event(index?240:960,128,pitch,0)));
    const imported=midi.importWorkshopMidi(smf([events]));assert(imported.warnings.includes('voices-merged'));assert(imported.warnings.includes('performance-controls-ignored'));assert.strictEqual(sounding(imported.score).filter(note=>!note.tieFromId).length,5);assert(model.isValidWorkshopScore(imported.score));
  });
  await test('sustain pedal and all-notes-off are preserved without extending key-down note values twice',()=>{
    const data=smf([[event(0,176,64,127),event(0,144,60,80),event(480,128,60,0),event(480,176,64,0),event(0,144,64,80),event(480,176,123,0)]]),score=midi.importWorkshopMidi(data).score;
    assert.deepStrictEqual(score.parts[0].measures[0].directions.map(direction=>[direction.startSlot,direction.type,direction.value]),[[0,'pedal','down'],[4,'pedal','up']]);assert.deepStrictEqual(sounding(score).map(note=>note.durationMs),[500,500]);assert(!midi.importWorkshopMidi(data).warnings.includes('incomplete-notes'));
  });
  await test('sixteenth-note chords with common release gates remain a useful editable score',()=>{
    const events=[];
    for(let index=0;index<16;index++){[60,64,67,72].forEach((pitch,position)=>events.push(event(index&&position===0?12:0,144,pitch,80)));[60,64,67,72].forEach((pitch,position)=>events.push(event(position===0?108:0,128,pitch,0)));}
    const imported=midi.importWorkshopMidi(smf([events])),written=notes(imported.score);assert.strictEqual(written.length,64);assert(written.every(note=>note.noteValue==='sixteenth'&&!note.tuplet&&!note.dots));assert(!imported.score.ties);assert(imported.warnings.includes('quantized-timing'));assert(model.isValidWorkshopScore(imported.score));
  });
  await test('exact triplets, dotted notes and non-grid recordings use supported durations with a visible quantization warning',()=>{
    const triplet=smf([[event(0,144,60,80),event(160,128,60,0),event(0,144,62,80),event(160,128,62,0),event(0,144,64,80),event(160,128,64,0),event(0,144,65,80),event(720,128,65,0)]]),imported=midi.importWorkshopMidi(triplet);assert.strictEqual(notes(imported.score)[0].tuplet,3);assert.strictEqual(notes(imported.score)[3].noteValue,'quarter');assert.strictEqual(notes(imported.score)[3].dots,1);assert(!imported.warnings.includes('quantized-timing'));
    const odd=midi.importWorkshopMidi(smf([[event(7,144,60,80),event(237,128,60,0)]],0,479));assert(odd.warnings.includes('quantized-timing'));assert(model.isValidWorkshopScore(odd.score));
  });
  await test('percussion and unrepresented instrument/controller data are disclosed; dangling notes are repaired visibly',()=>{
    const data=smf([[meta(0,2,text('Copyright provided in file')),event(0,201,10),event(0,153,40,80),event(0,192,40),event(0,176,7,64),event(0,144,60,80),meta(480,6,text('Section marker'))]]),imported=midi.importWorkshopMidi(data);
    ['percussion-ignored','instruments-ignored','performance-controls-ignored','incomplete-notes'].forEach(code=>assert(imported.warnings.includes(code)));assert.strictEqual(imported.score.metadata.copyright,'Copyright provided in file');assert.strictEqual(notes(imported.score).length,1);
    errorCode(smf([[event(0,153,40,80),event(480,137,40,0)]]),'empty-midi');
  });
  await test('format, timing, pitch and score limits fail explicitly instead of silently dropping notes',()=>{
    errorCode(smf([[event(0,144,60,80),event(480,128,60,0)]],2),'unsupported-midi-format');
    errorCode(smf([[event(0,144,60,80),event(480,128,60,0)]],0,0xe728),'unsupported-midi-timing');
    errorCode(smf([[event(0,144,60,80),event(480,128,60,0)]],0,0),'invalid-midi');
    errorCode(smf([[event(0,144,10,80),event(480,128,10,0)]]),'unsupported-midi-score');
    errorCode(smf([[meta(0,81,[1,0,0]),event(0,144,60,80),event(480,128,60,0)]]),'unsupported-midi-score');
    const crowded=[];for(let index=0;index<65;index++)crowded.push(event(0,144,60,80));for(let index=0;index<65;index++)crowded.push(event(index===0?480:0,128,60,0));errorCode(smf([crowded]),'unsupported-midi-score');
    errorCode(smf([[event(0,144,60,80),event(480,128,60,0),meta(4000*480,1,[])]]),'unsupported-midi-score');
    errorCode(new Uint8Array(30*1024*1024+1),'midi-too-large');
  });
  await test('truncated chunks, invalid variable lengths, missing running status, bad channel bytes and malformed meta lengths are rejected',()=>{
    const valid=smf([[event(0,144,60,80),event(480,128,60,0)]]);
    for(let size=0;size<valid.length;size++)errorCode(valid.subarray(0,size),'invalid-midi');
    errorCode(smf([[event(0,60,80)]]),'invalid-midi');
    errorCode(smf([[event(0,144,60,128)]]),'invalid-midi');
    errorCode(smf([[meta(0,81,[1,2])]]),'invalid-midi');
    errorCode(smf([[meta(0,88,[4,2,24])]]),'invalid-midi');
    errorCode(smf([[[128,128,128,128,0,144,60,80]]]),'invalid-midi');
    errorCode(smf([[event(0,144,60,80),meta(0,1,[]),event(480,60,0)]]),'invalid-midi');
    errorCode(smf([[meta(0,47),event(0,144,60,80)]]),'invalid-midi');
  });
  await test('local saves and MusicXML retain imported timing while app backups leave pieces untouched',async()=>{
    const data=smf([[meta(0,89,[2,0]),meta(0,81,[7,161,32]),event(0,144,66,80),event(2400,128,66,0)],[event(0,145,42,80),event(480,129,42,0)]]),imported=midi.importWorkshopMidi(data,{filename:'Saved MIDI.mid'}),store=storage();
    const existing=storeModel.storeWorkshopDraft(model.createWorkshopDraft('An existing user piece'),store),before=JSON.stringify(existing.piece);const draft={pieceId:null,title:imported.title,score:imported.score},saved=storeModel.storeWorkshopDraft(draft,store),again=model.openWorkshopPiece(storeModel.readWorkshopLibrary(store).pieces.find(piece=>piece.id===saved.piece.id));assert.deepStrictEqual(again.score,imported.score);assert.strictEqual(JSON.stringify(storeModel.readWorkshopLibrary(store).pieces.find(piece=>piece.id===existing.piece.id)),before);
    const exported=await xml.exportWorkshopMusicXml(again.score,{title:again.title,compressed:true}),reimported=await xml.importWorkshopMusicXml(exported.data);assert.deepStrictEqual(reimported.score.parts,again.score.parts);assert.deepStrictEqual(reimported.score.ties,again.score.ties);assert.deepStrictEqual(sounding(reimported.score),sounding(again.score));
    const document=backup.createSaveDataBackup(store,{createdAt:'2026-10-05T14:00:00.000Z'}),parsed=backup.parseSaveDataBackup(JSON.stringify(document));assert(parsed.valid);assert.strictEqual(parsed.backup.data.workshopLibrary,undefined);const target=storage();target.setItem(model.WORKSHOP_STORAGE_KEY,store.getItem(model.WORKSHOP_STORAGE_KEY));imports.importSaveData(target,parsed.backup,'replace');assert.deepStrictEqual(model.openWorkshopPiece(storeModel.readWorkshopLibrary(target).pieces.find(piece=>piece.id===saved.piece.id)),again);
    again.score.parts[0].measures.forEach(bar=>bar.events.forEach(event=>{event.pitch={step:'G',alter:0,octave:4};}));assert(model.isValidWorkshopScore(again.score));assert.strictEqual(storeModel.storeWorkshopDraft(again,store).piece.revisions.length,2);
  });
}
run().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
