const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>file.startsWith(sourceRoot)?mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file):original(mod,file);
const model=require('../src/model/Workshop'),xml=require('../src/model/WorkshopMusicXml'),archive=require('../src/model/WorkshopMusicXmlArchive'),files=require('../src/model/WorkshopFileExchange'),midi=require('../src/model/WorkshopMidi'),expression=require('../src/model/WorkshopExpression'),rhythm=require('../src/model/WorkshopRhythm');
Module._extensions['.js']=original;
function standard(text){return text.replace(/<miscellaneous-field name="notenpfoten-editor-score-v1">[\s\S]*?<\/miscellaneous-field>/,'');}
function piece(count=2){const s=model.createWorkshopDraft('Audit exchange regression',count).score;s.bpm=60;s.parts[0].measures.forEach((bar,i)=>bar.events=[{id:'note-'+i,kind:'note',noteValue:'quarter',startSlot:0,pitch:{step:'C',alter:0,octave:4}}]);return s;}
function endpoints(s,key){const index=expression.indexWorkshopExpressionNotes(s);return(s[key]||[]).map(edge=>[index.get(edge.fromId).start,index.get(edge.toId).start,edge.type||'slur'].join(':')).sort();}
async function test(name,fn){await fn();console.log('✓ Audit exchange: '+name);}
(async()=>{
 await test('partially silent pickup survives standard XML in two staves and multiple voices',()=>{
  const score=piece();score.pickupUnits=2;score.parts[0].measures[0].events[0].noteValue='eighth';
  score.parts[0].measures[0].events.push({id:'other-voice',kind:'note',noteValue:'sixteenth',voice:2,startSlot:0,pitch:{step:'E',alter:0,octave:4}});
  score.parts.push({id:'left',clef:'bass',enabled:true,measures:score.parts[0].measures.map((bar,i)=>({id:'left-bar-'+i,events:[{id:'left-note-'+i,kind:'note',noteValue:'eighth',startSlot:0,pitch:{step:'C',alter:0,octave:3}}]}))});
  const before=JSON.stringify(score),round=xml.importWorkshopMusicXmlText(standard(xml.exportWorkshopMusicXmlText(score).data)).score;
  assert.strictEqual(round.pickupUnits,2);assert.strictEqual(model.workshopTimeline(round).events.find(e=>e.barIndex===1 && e.value!==null).startMs,1000);assert.strictEqual(JSON.stringify(score),before);
  assert.strictEqual(model.workshopTimeline(round).events.filter(e=>e.value!==null).length,5);
 });
 await test('empty and full pickups retain their original extent',()=>{
  for(const empty of [true,false]){const score=piece();score.pickupUnits=2;if(empty)score.parts[0].measures[0].events=[];const round=xml.importWorkshopMusicXmlText(standard(xml.exportWorkshopMusicXmlText(score).data)).score;assert.strictEqual(round.pickupUnits,2);assert.strictEqual(model.workshopTimeline(round).events.find(e=>e.barIndex===1 && e.value!==null).startMs,1000);}
 });
 await test('long slur and glissando survive more than 16 sequential connections without native metadata',()=>{
  for(const key of ['slurs','glissandos']){const score=piece(19);score[key]=[{fromId:'note-0',toId:'note-18'}].concat(Array.from({length:16},(_,i)=>({fromId:'note-'+(i+1),toId:'note-'+(i+2)}))).reverse();if(key==='glissandos')score[key].forEach(edge=>edge.type='glissando');assert(model.isValidWorkshopScore(score));const round=xml.importWorkshopMusicXmlText(standard(xml.exportWorkshopMusicXmlText(score).data)).score;assert.deepStrictEqual(endpoints(round,key),endpoints(score,key));}
 });
 await test('same-note stop is emitted before reused start even with reversed edge order',()=>{
  const score=piece(3);score.slurs=[{fromId:'note-1',toId:'note-2'},{fromId:'note-0',toId:'note-1'}];const round=xml.importWorkshopMusicXmlText(standard(xml.exportWorkshopMusicXmlText(score).data)).score;assert.deepStrictEqual(endpoints(round,'slurs'),endpoints(score,'slurs'));
 });
 await test('more than 16 simultaneously open connections fail explicitly instead of losing a connection',()=>{
  const score=piece(35);score.slurs=Array.from({length:17},(_,i)=>({fromId:'note-'+i,toId:'note-'+(i+18)}));assert(model.isValidWorkshopScore(score));assert.throws(()=>xml.exportWorkshopMusicXmlText(score),error=>error.code==='unsupported-notation');
 });
 await test('own archived export above 8 MiB uses the normal browser and native import paths',async()=>{
  const data=new Uint8Array(fs.readFileSync(path.resolve(__dirname,'../docs/audits/editor-2026-10-07/full/fixtures/editor-eigener-mxl-export-ueber-8mib.mxl')));assert(data.length>8*1024*1024);assert(data.length<=archive.WORKSHOP_MUSICXML_MAX_ARCHIVE_BYTES);
  const browser=await files.readWorkshopMusicFile({size:data.length,name:'own.mxl',arrayBuffer:async()=>data.buffer});assert(model.isValidWorkshopScore((await xml.importWorkshopMusicXml(browser.data)).score));
  let cursor=0,closed=0;const adapter={openStream(mime,ok){ok({token:'test',size:data.length,name:'own.mxl'});},readChunk(token,ok){const chunk=data.subarray(cursor,cursor+49152);cursor+=chunk.length;ok({token,data:Buffer.from(chunk).toString('base64'),done:cursor===data.length});},closeStream(token,ok){closed++;ok({status:'closed'});}};
  const native=await files.readWorkshopMusicFile(null,adapter);assert.deepStrictEqual(native.data,data);assert.strictEqual(closed,1);
 });
 await test('over-budget normal import and export reject before opening a writer or loading bytes',async()=>{
  let read=0,write=0;await assert.rejects(files.readWorkshopMusicFile({size:archive.WORKSHOP_MUSICXML_MAX_ARCHIVE_BYTES+1,arrayBuffer:async()=>{read++;}}),/musicxml-too-large/);assert.strictEqual(read,0);
  await assert.rejects(files.saveWorkshopMusicFile({data:new Uint8Array(archive.WORKSHOP_MUSICXML_MAX_ARCHIVE_BYTES+1),extension:'mxl',mimeType:'application/zip'},'large',{openWriteStream(){write++;}}),/invalid-export/);assert.strictEqual(write,0);
 });
 await test('optional MIDI simplification produces quarter notes from 450/480 ticks while exact import remains unchanged',()=>{
  const input=new Uint8Array(fs.readFileSync(path.resolve(__dirname,'../docs/audits/editor-2026-10-07/full/fixtures/editor-midi-viertel-450-von-480-ticks.mid'))),exact=midi.importWorkshopMidi(input).score,before=JSON.stringify(exact),simple=midi.quantizeWorkshopMidiScore(exact);
  assert(simple&&model.isValidWorkshopScore(simple));const notes=s=>s.parts.flatMap(p=>p.measures.flatMap(b=>b.events.filter(e=>e.kind==='note')));
  assert(notes(exact).every(e=>e.noteValue==='eighth'&&e.dots===3));assert(notes(simple).every(e=>e.noteValue==='quarter'&&!e.dots));assert.deepStrictEqual(notes(simple).map(e=>[e.id,e.startSlot,e.pitch]),notes(exact).map(e=>[e.id,e.startSlot,e.pitch]));assert.strictEqual(JSON.stringify(exact),before);
 });
 await test('simplification preserves real dotted/triplet/tied notation and cannot extend over the next onset',()=>{
  const score=piece();const first=score.parts[0].measures[0].events[0];Object.assign(first,{noteValue:'eighth',dots:3});score.parts[0].measures[0].events.push({id:'close-note',kind:'note',noteValue:'sixteenth',startSlot:1.875,pitch:{step:'D',alter:0,octave:4}});
  const simple=midi.quantizeWorkshopMidiScore(score);assert.strictEqual(simple.parts[0].measures[0].events[0].dots,3);
  const conventional=piece();Object.assign(conventional.parts[0].measures[0].events[0],{dots:1,tuplet:3});assert.deepStrictEqual(midi.quantizeWorkshopMidiScore(conventional),conventional);
  const doubleDotted=piece();doubleDotted.parts[0].measures[0].events[0].dots=2;assert.deepStrictEqual(midi.quantizeWorkshopMidiScore(doubleDotted),doubleDotted);
  const tripleTriplet=piece();Object.assign(tripleTriplet.parts[0].measures[0].events[0],{noteValue:'eighth',dots:3,tuplet:3});assert.deepStrictEqual(midi.quantizeWorkshopMidiScore(tripleTriplet),tripleTriplet);
  const beamed=piece(1);Object.assign(beamed.parts[0].measures[0].events[0],{noteValue:'eighth',dots:3,beamGroupId:'beam'});beamed.parts[0].measures[0].events.push({id:'beam-next',kind:'note',noteValue:'eighth',dots:3,beamGroupId:'beam',startSlot:2,pitch:{step:'D',alter:0,octave:4}});assert(model.isValidWorkshopScore(beamed));assert.deepStrictEqual(midi.quantizeWorkshopMidiScore(beamed),beamed);
  const tied=piece();Object.assign(tied.parts[0].measures[0].events[0],{noteValue:'eighth',dots:3});tied.ties=[{fromId:'note-0',toId:'note-1',sustainAcrossGap:true}];assert(model.isValidWorkshopScore(tied));assert.deepStrictEqual(midi.quantizeWorkshopMidiScore(tied),tied);
 });
})().catch(error=>{console.error(error);process.exit(1);});
