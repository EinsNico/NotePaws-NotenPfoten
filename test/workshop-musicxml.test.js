const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('babel-core');
const zlib = require('zlib');
global.regeneratorRuntime = require('babel-runtime/regenerator');
const root = path.resolve(__dirname,'../src')+path.sep;
const originalLoader = Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(root))return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
const io=require('../src/model/WorkshopMusicXml');
const archive=require('../src/model/WorkshopMusicXmlArchive');
const parser=require('../src/model/WorkshopMusicXmlParser');
const model=require('../src/model/Workshop');
const rhythm=require('../src/model/WorkshopRhythm');
Module._extensions['.js']=originalLoader;
function test(name,callback){return Promise.resolve().then(callback).then(()=>process.stdout.write('✓ workshop MusicXML: '+name+'\n'));}
function xml(body,header='',part='P1'){return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0">'+header+'<part-list><score-part id="'+part+'"><part-name>Piano</part-name></score-part></part-list><part id="'+part+'">'+body+'</part></score-partwise>';}
const attrs='<attributes><divisions>12</divisions><key><fifths>0</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
function note(step='C',duration=12,type='quarter',extra='',prefix=''){return '<note>'+prefix+'<pitch><step>'+step+'</step><octave>4</octave></pitch><duration>'+duration+'</duration><voice>1</voice><type>'+type+'</type>'+extra+'</note>';}
function stripNative(value){const root=parser.parseWorkshopMusicXmlDocument(value),misc=parser.musicXmlChild(parser.musicXmlChild(root,'identification'),'miscellaneous');const field=parser.musicXmlChildren(misc,'miscellaneous-field').find(item=>item.attrs.name==='notenpfoten-editor-score-v1');return field?value.slice(0,field.start)+value.slice(field.end):value;}
function zip(files,options={}){
  const locals=[],centrals=[];let offset=0;
  files.forEach(([name,content])=>{
    const nameBytes=Buffer.from(name),data=Buffer.from(content),packed=options.stored?data:zlib.deflateRawSync(data,options.deflateOptions||{}),method=options.stored?0:8,crc=archive.musicXmlCrc32(data);
    const local=Buffer.alloc(30+nameBytes.length);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(method,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);nameBytes.copy(local,30);
    const central=Buffer.alloc(46+nameBytes.length);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(method,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(nameBytes.length,28);central.writeUInt32LE(offset,42);nameBytes.copy(central,46);
    locals.push(local,packed);centrals.push(central);offset+=local.length+packed.length;
  });
  const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat(locals.concat([directory,end]));
}
const manifest='<?xml version="1.0"?><container><rootfiles><rootfile full-path="music/score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';
async function run(){
await test('imports plain MusicXML metadata and exact pitches, voices, chords, dotted values and rests',()=>{
  const source=xml('<measure number="1">'+attrs+note('C',18,'quarter','<dot/><notations><fermata/><articulations><accent/></articulations><technical><fingering>3</fingering></technical><ornaments><trill-mark/></ornaments></notations><lyric><text>Fuchs &amp; Pfote</text></lyric>')+
    note('E',18,'quarter','<dot/>','<chord/>')+'<note><rest/><duration>6</duration><type>eighth</type></note></measure>','<work><work-title>Fuchs &amp; Pfoten</work-title></work><identification><creator type="composer">Nico</creator><rights>© 2026</rights></identification>');
  const result=io.importWorkshopMusicXmlText(source);
  assert(model.isValidWorkshopScore(result.score));assert.strictEqual(result.title,'Fuchs & Pfoten');assert.strictEqual(result.score.metadata.composer,'Nico');
  const notes=result.score.parts[0].measures[0].events;
  assert.deepStrictEqual(notes.map(event=>[event.kind,event.startSlot,event.noteValue,event.dots||0]),[['note',0,'quarter',1],['note',0,'quarter',1],['rest',3,'eighth',0]]);
  assert.strictEqual(notes[0].lyric,'Fuchs & Pfote');assert.strictEqual(notes[0].fermata,2);assert.strictEqual(notes[0].ornament,'trill');assert.deepStrictEqual(notes[0].articulations,['accent']);assert.strictEqual(notes[0].fingering,3);
  assert.strictEqual(io.exportWorkshopMusicXmlText(result.score,{title:result.title}).data,source);
});
await test('imports normal two-staff piano data and preserves cross-staff notation',()=>{
  const source=xml('<measure number="1"><attributes><divisions>12</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>'+
    note('C',12,'quarter','<staff>1</staff>')+note('D',12,'quarter','<staff>2</staff>')+'<backup><duration>24</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>24</duration><voice>5</voice><type>half</type><staff>2</staff></note></measure>');
  const result=io.importWorkshopMusicXmlText(source);
  assert(model.isValidWorkshopScore(result.score));assert.strictEqual(result.score.parts.length,2);assert.strictEqual(result.score.parts[1].clef,'bass');
  assert.strictEqual(result.score.parts[0].measures[0].events[1].displayStaff,1);assert.strictEqual(result.score.parts[1].measures[0].events.length,1);
});
await test('imports timewise scores, changes, pickup measures, repeats, first and second endings and navigation',()=>{
  const source='<score-timewise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><measure number="0" implicit="yes"><part id="P1">'+attrs+'<barline location="left"><repeat direction="forward"/></barline>'+note('C',12)+'<direction><direction-type><segno/></direction-type></direction></part></measure><measure number="1"><part id="P1"><attributes><time><beats>3</beats><beat-type>4</beat-type></time><key><fifths>1</fifths><mode>major</mode></key></attributes><barline location="left"><ending number="1" type="start"/></barline>'+note('C',12)+'<barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline></part></measure><measure number="2"><part id="P1"><barline location="left"><ending number="2" type="start"/></barline>'+note('D',12)+'<direction><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction><barline location="right"><ending number="2" type="discontinue"/></barline></part></measure></score-timewise>';
  const result=io.importWorkshopMusicXmlText(source), bars=result.score.parts[0].measures;
  assert(model.isValidWorkshopScore(result.score));assert.strictEqual(result.score.pickupUnits,2);assert.strictEqual(bars[1].meter,'3/4');assert.strictEqual(bars[1].keyId,'G-major');assert.deepStrictEqual(bars[1].ending,[1]);assert.deepStrictEqual(bars[2].ending,[2]);assert.deepStrictEqual(bars[0].navigation,['segno']);assert.deepStrictEqual(bars[2].navigation,['fine']);
});
await test('imports span directions across measures, offset dynamics, tempo, octave shifts and pedal',()=>{
  const source=xml('<measure number="1">'+attrs+'<direction><direction-type><wedge type="crescendo" number="1"/></direction-type></direction><direction><direction-type><octave-shift type="down" size="8"/></direction-type></direction><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction>'+note('C',48,'whole')+'</measure><measure number="2"><direction><direction-type><dynamics><ff/></dynamics></direction-type><offset>12</offset></direction><direction><direction-type><pedal type="start"/></direction-type></direction>'+note('D',24,'half')+'<direction><direction-type><wedge type="stop" number="1"/></direction-type><direction-type><octave-shift type="stop"/></direction-type><direction-type><pedal type="stop"/></direction-type></direction></measure>');
  const score=io.importWorkshopMusicXmlText(source).score,bars=score.parts[0].measures;
  assert(model.isValidWorkshopScore(score));const wedge=bars[0].directions.find(item=>item.type==='wedge');assert.strictEqual(wedge.endBarId,bars[1].id);assert.strictEqual(wedge.endSlot,4);
  assert.strictEqual(bars[0].directions.find(item=>item.type==='octaveShift').value,1);assert.strictEqual(bars[0].directions.find(item=>item.type==='tempo').value,90);
  assert.strictEqual(bars[1].directions.find(item=>item.type==='dynamic').startSlot,2);assert.deepStrictEqual(bars[1].directions.filter(item=>item.type==='pedal').map(item=>item.value),['down','up']);
});
await test('pairs direction spans by musical time when a later voice contains the start after an earlier-serialized stop',()=>{
  const wedge=(type,number)=>'<direction><direction-type><wedge type="'+type+'" number="'+number+'"/></direction-type></direction>';
  const whole=note('C',48,'whole');
  const secondVoice=note('E',24,'half').replace('<voice>1</voice>','<voice>2</voice>');
  const bar=number=>'<measure number="'+number+'">'+(number===1?attrs:'')+wedge('crescendo',1)+whole+wedge('stop',2)
    +'<backup><duration>48</duration></backup>'+secondVoice+wedge('stop',1)+wedge('diminuendo',2)+secondVoice+'</measure>';
  const imported=io.importWorkshopMusicXmlText(xml(bar(1)+bar(2)+bar(3)));
  assert(model.isValidWorkshopScore(imported.score));
  assert.deepStrictEqual(imported.noteCounts,{source:9,imported:9,skipped:0});
  imported.score.parts[0].measures.forEach(measure=>{
    const spans=measure.directions.filter(direction=>direction.type==='wedge');
    assert.deepStrictEqual(spans.map(d=>[d.value,d.startSlot,d.endSlot,d.endBarId]),
      [['crescendo',0,4,undefined],['diminuendo',4,8,undefined]]);
  });
  assert(!imported.warnings.includes('unsupported-notation'));
});
await test('direction ordering retains the offset and divisions at each occurrence',()=>{
  const source=xml('<measure number="1">'+attrs+note('C',48,'whole')
    +'<direction><direction-type><wedge type="stop"/></direction-type><offset>-12</offset></direction>'
    +'<backup><duration>48</duration></backup><attributes><divisions>24</divisions></attributes>'
    +note('E',48,'half').replace('<voice>1</voice>','<voice>2</voice>')
    +'<direction><direction-type><wedge type="crescendo"/></direction-type><offset>-24</offset></direction>'
    +note('F',48,'half').replace('<voice>1</voice>','<voice>2</voice>')+'</measure>');
  const imported=io.importWorkshopMusicXmlText(source),span=imported.score.parts[0].measures[0].directions.find(d=>d.type==='wedge');
  assert(model.isValidWorkshopScore(imported.score));assert.strictEqual(span.startSlot,2);assert.strictEqual(span.endSlot,6);
});
await test('shows the initial imported tempo as base BPM and keeps later instructions independent',()=>{
  const initial='<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction>';
  const later='<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>140</per-minute></metronome></direction-type><sound tempo="140"/></direction>';
  const source=xml('<measure number="1">'+attrs+initial+note('C')+later+'</measure><measure number="2">'+later+note('D')+'</measure>');
  const imported=io.importWorkshopMusicXmlText(source),bars=imported.score.parts[0].measures;
  assert.strictEqual(imported.score.bpm,90);assert.deepStrictEqual(bars[0].directions.filter(item=>item.type==='tempo').map(item=>[item.startSlot,item.value]),[[0,90],[2,140]]);
  assert.strictEqual(bars[1].directions.find(item=>item.type==='tempo').value,140);
  const onlyLater=io.importWorkshopMusicXmlText(xml('<measure number="1">'+attrs+note('C')+later+'</measure><measure number="2">'+initial+note('D')+'</measure>'));
  assert.strictEqual(onlyLater.score.bpm,60);
  const fast=io.importWorkshopMusicXmlText(xml('<measure number="1">'+attrs+initial.replace(/90/g,'220')+note('C')+'</measure>'));assert.strictEqual(fast.score.bpm,220);
});
await test('imports ties, slurs, beams, quintuplets and multiple dots without altering their duration',()=>{
  const source=xml('<measure number="1">'+attrs+note('C',12,'quarter','<tie type="start"/><notations><tied type="start"/><slur type="start" number="1"/></notations>')+note('C',12,'quarter','<tie type="stop"/><notations><tied type="stop"/><slur type="stop" number="1"/></notations>')+Array.from({length:5},(_,i)=>note(['C','D','E','F','G'][i],12/5,'16th','<time-modification><actual-notes>5</actual-notes><normal-notes>4</normal-notes></time-modification><beam number="1">'+(i===0?'begin':i===4?'end':'continue')+'</beam><notations><tuplet type="'+(i===0?'start':i===4?'stop':'continue')+'"/></notations>')).join('')+'</measure>');
  const result=io.importWorkshopMusicXmlText(source),events=result.score.parts[0].measures[0].events;
  assert(model.isValidWorkshopScore(result.score));assert.strictEqual(result.score.ties.length,1);assert.strictEqual(result.score.slurs.length,1);assert.deepStrictEqual(events[2].tuplet,{actual:5,normal:4});assert.strictEqual(rhythm.workshopEventUnits(events[2]),.4);
  assert(events.slice(2).every(event=>event.beamGroupId));assert(events.slice(2).every(event=>event.tupletGroupId));
});
await test('native extension round-trips every editor field, requested values, IDs and custom playback factors',()=>{
  const score=model.createWorkshopDraft('Äußere Pfoten',2).score;
  score.metadata={title:'Äußere Pfoten',composer:'Nico & Co',subtitle:'Ruhig'};
  score.layout={barsPerSystem:3,fontFamily:'Bravura',pageWidth:1200,marginLeft:40,systemBreaks:[score.parts[0].measures[1].id]};
  const bar=score.parts[0].measures[0];bar.events=[{id:'extended-note',kind:'note',startSlot:0,noteValue:'quarter',originalNoteValue:'half',pitch:{step:'C',alter:2,octave:4},dots:1,fermata:3,ornament:'turn',arpeggio:'down',lyric:'Hi & <there>',stem:'up',articulations:['tenuto'],fingering:4}];
  bar.directions=[{id:'ramp',type:'tempoRamp',startSlot:0,endSlot:4,value:100},{id:'half-pedal',type:'pedal',startSlot:0,value:'half'}];bar.navigation=['segno'];
  assert(model.isValidWorkshopScore(score));const exported=io.exportWorkshopMusicXmlText(score);parser.parseWorkshopMusicXmlDocument(exported.data);
  assert(exported.data.includes('<alter>2</alter>'));assert(exported.data.includes('<fermata/>'));const imported=io.importWorkshopMusicXmlText(exported.data);
  const restored=model.cloneWorkshop(imported.score);delete restored.musicXml;assert.deepStrictEqual(restored,score);
  assert.strictEqual(io.exportWorkshopMusicXmlText(imported.score,{title:imported.title}).data,exported.data);
});
await test('other applications edits supersede stale native fields rather than restoring obsolete editor notes',()=>{
  const score=model.createWorkshopDraft('Before',1).score;score.parts[0].measures[0].events=[{id:'c-note',kind:'note',startSlot:0,noteValue:'quarter',pitch:{step:'C',alter:0,octave:4}}];
  const exported=io.exportWorkshopMusicXmlText(score).data,edited=exported.replace('<step>C</step>','<step>D</step>');
  const imported=io.importWorkshopMusicXmlText(edited);assert.strictEqual(imported.score.parts[0].measures[0].events[0].pitch.step,'D');assert(imported.warnings.includes('unsupported-notation'));
});
await test('plain exported MusicXML remains usable without the optional native extension',()=>{
  const score=model.createWorkshopDraft('Plain',2).score;score.parts[0].measures[0].events=[{id:'first',kind:'note',startSlot:0,noteValue:'quarter',pitch:{step:'C',alter:0,octave:4}}];
  score.parts[0].measures[1].events=[{id:'second',kind:'note',startSlot:0,noteValue:'half',pitch:{step:'D',alter:0,octave:4}}];score.slurs=[{fromId:'first',toId:'second'}];
  const result=io.importWorkshopMusicXmlText(stripNative(io.exportWorkshopMusicXmlText(score).data));
  assert(model.isValidWorkshopScore(result.score));assert.deepStrictEqual(result.score.parts[0].measures.map(bar=>bar.events[0].pitch.step),['C','D']);assert.strictEqual(result.score.slurs.length,1);
});
await test('unsupported original notation survives repeated edits and XML exports without recursive duplication',()=>{
  const source=xml('<measure number="1">'+attrs+note('C',12,'quarter','<notations><glissando type="start">gliss.</glissando></notations>')+'</measure>','<credit><credit-words>A rare credit</credit-words></credit>');
  let imported=io.importWorkshopMusicXmlText(source);assert(imported.warnings.includes('unsupported-notation'));
  let previousLength=0;
  for(let i=0;i<5;i++){
    imported.score.parts[0].measures[0].events[0].pitch.step=i%2?'C':'D';
    const exported=io.exportWorkshopMusicXmlText(imported.score,{title:imported.title});assert(exported.warnings.includes('edited-source-preserved'));
    const parsed=parser.parseWorkshopMusicXmlDocument(exported.data),fields=parser.musicXmlChildren(parser.musicXmlChild(parser.musicXmlChild(parsed,'identification'),'miscellaneous'),'miscellaneous-field');
    const preserved=fields.find(item=>item.attrs.name==='notenpfoten-preserved-musicxml');assert.strictEqual(Buffer.from(preserved.text,'base64').toString(),source);
    if(previousLength)assert(Math.abs(previousLength-exported.data.length)<200);previousLength=exported.data.length;
    imported=io.importWorkshopMusicXmlText(exported.data);
  }
});
await test('handles standards-compliant stored, fixed-Huffman and dynamic-Huffman DEFLATE archives',async()=>{
  const source=xml('<measure number="1">'+attrs+note('C')+'</measure>');
  for(const options of [{stored:true},{deflateOptions:{strategy:zlib.constants.Z_FIXED}},{deflateOptions:{level:9}}]){
    const packed=zip([['META-INF/container.xml',manifest],['music/score.musicxml',source]],options);
    const result=await io.importWorkshopMusicXml(packed,{filename:'Piece.mxl'});assert(model.isValidWorkshopScore(result.score));assert.strictEqual(result.score.parts[0].measures[0].events[0].pitch.step,'C');
  }
  for(let size of [0,1,300,10000,100000]){
    const bytes=Buffer.from(Array.from({length:size},(_,i)=>i%13?65+i%10:i%256));
    for(const strategy of [zlib.constants.Z_DEFAULT_STRATEGY,zlib.constants.Z_FIXED])assert.deepStrictEqual(Buffer.from(archive.inflateMusicXmlRaw(zlib.deflateRawSync(bytes,{strategy}),size)),bytes);
  }
});
await test('writes valid .mxl containers and imports their XML/native data without external dependencies',async()=>{
  const score=model.createWorkshopDraft('Export MXL',1).score,exported=await io.exportWorkshopMusicXml(score,{compressed:true});
  assert.strictEqual(exported.extension,'mxl');assert.strictEqual(exported.mimeType,'application/vnd.recordare.musicxml');assert(exported.data instanceof Uint8Array);
  const contents=archive.readMusicXmlArchive(exported.data);assert.strictEqual(archive.musicXmlUtf8Decode(contents.get('mimetype')),'application/vnd.recordare.musicxml');
  const imported=await io.importWorkshopMusicXml(exported.data);const restored=model.cloneWorkshop(imported.score);delete restored.musicXml;assert.deepStrictEqual(restored,score);
});
await test('preserves binary archive attachments, their relative root paths and XML exports through later edits',async()=>{
  const source=xml('<measure number="1">'+attrs+note('C')+'</measure>'),asset=Buffer.from([0,255,128,1,42,0,201]);
  const packed=zip([['META-INF/container.xml',manifest],['music/score.musicxml',source],['music/images/fox.bin',asset]]);
  let imported=await io.importWorkshopMusicXml(packed);assert(imported.warnings.includes('archive-assets-preserved'));assert.strictEqual(imported.score.musicXml.rootPath,'music/score.musicxml');
  assert.deepStrictEqual(Buffer.from(imported.score.musicXml.archiveAssets[0].data,'base64'),asset);
  imported.score.parts[0].measures[0].events[0].pitch.step='D';
  const compressed=await io.exportWorkshopMusicXml(imported.score,{title:imported.title,compressed:true}),contents=archive.readMusicXmlArchive(compressed.data);
  assert(contents.has('music/score.musicxml'));assert.deepStrictEqual(Buffer.from(contents.get('music/images/fox.bin')),asset);
  const xmlExport=io.exportWorkshopMusicXmlText(imported.score,{title:imported.title}),reopened=io.importWorkshopMusicXmlText(xmlExport.data);
  assert.deepStrictEqual(reopened.score.musicXml.archiveAssets,imported.score.musicXml.archiveAssets);assert.strictEqual(reopened.score.parts[0].measures[0].events[0].pitch.step,'D');
  const again=await io.exportWorkshopMusicXml(reopened.score,{title:reopened.title,compressed:true});assert.deepStrictEqual(Buffer.from(archive.readMusicXmlArchive(again.data).get('music/images/fox.bin')),asset);
});
await test('imports complete rests in uneven meters and exports correct secondary beam hooks',()=>{
  const source=xml('<measure number="1"><attributes><divisions>12</divisions><time><beats>5</beats><beat-type>8</beat-type></time></attributes><note><rest measure="yes"/><duration>30</duration></note></measure>');
  const imported=io.importWorkshopMusicXmlText(source);assert(model.isValidWorkshopScore(imported.score));assert.strictEqual(imported.score.meter,'5/8');assert.strictEqual(imported.score.parts[0].measures[0].events.reduce((sum,event)=>sum+rhythm.workshopEventUnits(event),0),5);
  const score=model.createWorkshopDraft('Mixed beams',1).score;score.parts[0].measures[0].events=[{id:'eighth',kind:'note',startSlot:0,noteValue:'eighth',pitch:{step:'C',alter:0,octave:4},beamGroupId:'mixed'},{id:'sixteenth',kind:'note',startSlot:1,noteValue:'sixteenth',pitch:{step:'D',alter:0,octave:4},beamGroupId:'mixed'}];
  assert(model.isValidWorkshopScore(score));const exported=io.exportWorkshopMusicXmlText(score).data;assert(exported.includes('<beam number="2">backward hook</beam>'));
  const additive=io.importWorkshopMusicXmlText(source.replace('<beats>5</beats>','<beats>3+2</beats>'));assert(model.isValidWorkshopScore(additive.score));assert.strictEqual(additive.score.meter,'3+2/8');
});
await test('renaming an imported piece exports the new title while retaining the original notation source',()=>{
  const source=xml('<measure number="1">'+attrs+note('C')+'</measure>','<work><work-title>Old name</work-title></work>'),imported=io.importWorkshopMusicXmlText(source);
  const exported=io.exportWorkshopMusicXmlText(imported.score,{title:'New name'});assert(exported.data.includes('<work-title>New name</work-title>'));assert(exported.warnings.includes('edited-source-preserved'));
  assert.strictEqual(io.importWorkshopMusicXmlText(exported.data).title,'New name');
});
await test('rejects traversal, corruption, missing manifests, encrypted archives and zip bombs before import',async()=>{
  const source=xml('<measure number="1">'+attrs+note('C')+'</measure>');
  await assert.rejects(io.importWorkshopMusicXml(zip([['../score.musicxml',source],['META-INF/container.xml',manifest]])));
  await assert.rejects(io.importWorkshopMusicXml(zip([['score.musicxml',source]])));
  const stored=zip([['META-INF/container.xml',manifest],['music/score.musicxml',source]],{stored:true});stored[40]^=1;await assert.rejects(io.importWorkshopMusicXml(stored));
  const bomb=zip([['huge',Buffer.alloc(archive.WORKSHOP_MUSICXML_MAX_BYTES+1)]]);assert.throws(()=>archive.readMusicXmlArchive(bomb));
  const encrypted=zip([['META-INF/container.xml',manifest],['music/score.musicxml',source]]);encrypted.writeUInt16LE(0x801,6);assert.throws(()=>archive.readMusicXmlArchive(encrypted));
});
await test('rejects entity expansion, malformed XML, unsafe timing and oversized text; accepts standard ignored public DTDs',()=>{
  const safe=xml('<measure number="1">'+attrs+note('C')+'</measure>');
  assert(model.isValidWorkshopScore(io.importWorkshopMusicXmlText(safe.replace('?>','?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">')).score));
  for(const source of ['<!DOCTYPE score-partwise [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+safe,safe.replace('<step>C</step>','<step>&external;</step>'),safe.replace('</pitch>','</wrong>'),safe.replace('<duration>12</duration>','<duration>-1</duration>'),'<score-partwise>'+('<a>'.repeat(70))+('</a>'.repeat(70))+'</score-partwise>',safe+'<other/>'])assert.throws(()=>io.importWorkshopMusicXmlText(source));
  assert.throws(()=>io.importWorkshopMusicXmlText(' '.repeat(archive.WORKSHOP_MUSICXML_MAX_SOURCE_BYTES+1)),caught=>caught.code==='musicxml-too-large');
});
await test('supports UTF-16 input and preserves namespace-prefixed MusicXML documents',async()=>{
  const source=xml('<measure number="1">'+attrs+note('C')+'</measure>');
  const utf16=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(source,'utf16le')]);assert(model.isValidWorkshopScore((await io.importWorkshopMusicXml(utf16)).score));
  const prefixed=source.replace(/<(\/?)([A-Za-z][A-Za-z0-9-]*)/g,'<$1mx:$2').replace('<mx:score-partwise ','<mx:score-partwise xmlns:mx="http://www.musicxml.org/ns/musicxml" ');
  assert(model.isValidWorkshopScore(io.importWorkshopMusicXmlText(prefixed).score));
  const declared=source.replace('UTF-8','UTF-16'),utf16Declared=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(declared,'utf16le')]),imported=await io.importWorkshopMusicXml(utf16Declared);
  assert(io.exportWorkshopMusicXmlText(imported.score,{title:imported.title}).data.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
});
}
run().catch(caught=>{process.stderr.write(String(caught.stack||caught)+'\n');process.exitCode=1;});
