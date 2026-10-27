const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const root=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(root))return original(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
const io=require('../src/model/WorkshopMusicXml'),model=require('../src/model/Workshop'),expression=require('../src/model/WorkshopExpression'),parser=require('../src/model/WorkshopMusicXmlParser'),tonality=require('../src/model/WorkshopTonality');
Module._extensions['.js']=original;
function test(name,callback){callback();process.stdout.write('✓ extended MusicXML: '+name+'\n');}
const attrs='<attributes><divisions>12</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
function xml(body){return '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'+body+'</part></score-partwise>';}
function note(step='C',octave=4,extra='',duration=12,type='quarter'){return '<note><pitch><step>'+step+'</step><octave>'+octave+'</octave></pitch><duration>'+duration+'</duration><voice>1</voice><type>'+type+'</type>'+extra+'</note>';}
function stripNative(xml){const doc=parser.parseWorkshopMusicXmlDocument(xml),misc=parser.musicXmlChild(parser.musicXmlChild(doc,'identification'),'miscellaneous'),field=parser.musicXmlChildren(misc,'miscellaneous-field').find(item=>item.attrs.name==='notenpfoten-editor-score-v1');return field?xml.slice(0,field.start)+xml.slice(field.end):xml;}
function plainExport(score){return stripNative(io.exportWorkshopMusicXmlText(score,{title:'Edited'}).data);}
function event(id,step='C',startSlot=0,extra={}){return Object.assign({id,kind:'note',pitch:{step,alter:0,octave:4},noteValue:'quarter',startSlot},extra);}
function pair(){const score=model.createWorkshopDraft('Pairs').score;score.parts[0].measures[0].events=[event('a','C',0),event('b','G',2)];return score;}
function pitches(score){return model.workshopTimeline(score).events.filter(event=>event.value!==null).map(event=>event.value);}
test('8va and 8vb import sounding pitches into written pitches and export actual pitches without native metadata',()=>{
 for(const [type,octave,written,value] of [['down',5,4,60],['up',3,4,36]]) {
  const source=xml('<measure>'+attrs+'<direction><direction-type><octave-shift type="'+type+'" size="8"/></direction-type></direction>'+note('C',octave)+'<direction><direction-type><octave-shift type="stop"/></direction-type></direction></measure>');
  const result=io.importWorkshopMusicXmlText(source);assert.strictEqual(result.score.parts[0].measures[0].events[0].pitch.octave,written);assert.deepStrictEqual(pitches(result.score),[value]);
  const exported=plainExport(result.score);assert(exported.includes('<octave>'+octave+'</octave>'));const back=io.importWorkshopMusicXmlText(exported).score;assert.deepStrictEqual(pitches(back),[value]);
 }
 const score=pair();score.parts[0].measures[0].directions=[{id:'two-octaves',type:'octaveShift',startSlot:0,endSlot:2,value:2}];assert(plainExport(score).includes('<octave>6</octave>'));assert.deepStrictEqual(pitches(io.importWorkshopMusicXmlText(plainExport(score)).score),pitches(score));
});
test('cross-bar octave spans transform only notes inside their exact endpoints',()=>{
 const score=model.createWorkshopDraft('Span',2).score;const bars=score.parts[0].measures;bars[0].events=[event('a','C',2)];bars[1].events=[event('b','D',0),event('c','E',2)];bars[0].directions=[{id:'octave',type:'octaveShift',startSlot:2,endBarId:bars[1].id,endSlot:2,value:1}];
 const back=io.importWorkshopMusicXmlText(plainExport(score)).score;assert.deepStrictEqual(pitches(back),pitches(score));assert.deepStrictEqual(back.parts[0].measures.map(bar=>bar.events.filter(e=>e.kind==='note').map(e=>e.pitch.octave)),[[4],[4,4]]);
});
test('ties across an octave-sign boundary compare sounding pitches instead of printed octaves',()=>{
 const source=xml('<measure>'+attrs+'<direction><direction-type><octave-shift type="down" size="8"/></direction-type></direction>'+note('C',5,'<tie type="start"/>')+'<direction><direction-type><octave-shift type="stop"/></direction-type></direction>'+note('C',5,'<tie type="stop"/>')+'</measure>');
 const score=io.importWorkshopMusicXmlText(source).score;assert.strictEqual(score.ties.length,1);assert.deepStrictEqual(score.parts[0].measures[0].events.map(event=>event.pitch.octave),[4,5]);assert.deepStrictEqual(pitches(score),[60,60]);
 const back=io.importWorkshopMusicXmlText(plainExport(score)).score;assert.strictEqual(back.ties.length,1);assert.deepStrictEqual(pitches(back),[60,60]);
 const invalid=model.cloneWorkshop(score);invalid.parts[0].measures[0].events[1].pitch.octave=4;assert(!model.isValidWorkshopScore(invalid));
});
test('note-attached pedal occurs at onset, and half pedal is represented by standard sound parameters',()=>{
 const score=pair();score.parts[0].measures[0].events[0].pedal='down';score.parts[0].measures[0].events[1].pedal='up';score.parts[0].measures[0].directions=[{id:'half',type:'pedal',startSlot:1,value:'half'}];
 const exported=plainExport(score);assert(exported.includes('damper-pedal="50"'));const before=model.workshopTimeline(score),after=model.workshopTimeline(io.importWorkshopMusicXmlText(exported).score);
 assert.deepStrictEqual(after.events.filter(e=>e.pedal).map(e=>[e.startMs,e.pedal]),before.events.filter(e=>e.pedal).map(e=>[e.startMs,e.pedal]));
 const sound=io.importWorkshopMusicXmlText(xml('<measure>'+attrs+'<sound damper-pedal="50"/>'+note()+'</measure>'));assert.strictEqual(sound.score.parts[0].measures[0].directions[0].value,'half');
 const sostenuto=io.importWorkshopMusicXmlText(xml('<measure>'+attrs+'<direction><direction-type><pedal type="sostenuto"/></direction-type></direction>'+note()+'</measure>'));assert(!sostenuto.warnings.includes('unsupported-notation'));assert.strictEqual(sostenuto.score.parts[0].measures[0].directions[0].pedal.kind,'sostenuto');assert(!model.workshopTimeline(sostenuto.score).events.some(event=>event.pedal));
});
test('duplicate system/page breaks across two source parts are deduplicated instead of rejecting the score',()=>{
 const measure='<measure><print new-system="yes" new-page="yes"/>'+attrs+note()+'</measure>',source='<score-partwise><part-list><score-part id="P1"><part-name>Upper</part-name></score-part><score-part id="P2"><part-name>Lower</part-name></score-part></part-list><part id="P1">'+measure+'</part><part id="P2">'+measure+'</part></score-partwise>';
 const score=io.importWorkshopMusicXmlText(source).score;assert(model.isValidWorkshopScore(score));assert.strictEqual(score.layout.systemBreaks.length,1);assert.strictEqual(score.layout.pageBreaks.length,1);
});
test('fermata shape, tremolo marks, grace slash and multiple lyric verses survive normal XML interchange',()=>{
 const source=xml('<measure>'+attrs+'<note><grace slash="no"/><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type></note>'+note('C',4,'<notations><fermata>angled</fermata><ornaments><tremolo type="single">1</tremolo></ornaments></notations><lyric number="1"><syllabic>begin</syllabic><text>Hal</text><extend type="start"/></lyric><lyric number="2"><syllabic>single</syllabic><text>Fox</text></lyric>')+'</measure>');
 const score=io.importWorkshopMusicXmlText(source).score,events=score.parts[0].measures[0].events;assert.strictEqual(events[0].graceSlash,false);assert.strictEqual(events[1].fermataShape,'angled');assert.strictEqual(events[1].tremoloMarks,1);assert.strictEqual(events[1].lyrics.length,2);
 const back=io.importWorkshopMusicXmlText(plainExport(score)).score,notes=back.parts[0].measures[0].events;assert.strictEqual(notes[0].graceSlash,false);assert.strictEqual(notes[1].fermataShape,'angled');assert.strictEqual(notes[1].tremoloMarks,1);assert.deepStrictEqual(notes[1].lyrics,events[1].lyrics);
 const square=model.cloneWorkshop(score);square.parts[0].measures[0].events[1].fermataShape='square';assert(plainExport(square).includes('<fermata>square</fermata>'));
});
test('single tremolo marks change measured playback rate while legacy ornaments remain valid',()=>{
 const score=pair();score.parts[0].measures[0].events=[event('a','C',0,{ornament:'tremolo',tremoloMarks:1})];const slow=pitches(score);assert.strictEqual(slow.length,2);
 score.parts[0].measures[0].events[0].tremoloMarks=4;assert.strictEqual(pitches(score).length,16);delete score.parts[0].measures[0].events[0].tremoloMarks;assert(model.isValidWorkshopScore(score));
});
test('two-note tremolo preserves timing, doubles written types, alternates pitches, and roundtrips MusicXML 2:1 timing',()=>{
 const initial=pair(),score=expression.connectWorkshopTremolo(initial,['a','b'],2);assert(score);assert(model.isValidWorkshopScore(score));assert.deepStrictEqual(score.parts[0].measures[0].events.map(e=>[e.noteValue,model.workshopEventUnits(e)]),[['half',2],['half',2]]);
 const values=pitches(score);assert(values.length>=4);assert(values.every((value,index)=>value===(index%2?55:48)));
 const exported=plainExport(score);assert(exported.includes('<actual-notes>2</actual-notes><normal-notes>1</normal-notes>'));assert(exported.includes('<tremolo type="start">2</tremolo>'));
 const back=io.importWorkshopMusicXmlText(exported).score;assert(model.isValidWorkshopScore(back));assert.strictEqual(back.tremolos[0].marks,2);assert.deepStrictEqual(pitches(back),values);
 assert.strictEqual(expression.connectWorkshopTremolo(score,['a','b'],4).tremolos[0].marks,4);assert.deepStrictEqual(expression.disconnectWorkshopTremolos(score,['a','b']).parts[0].measures[0].events,initial.parts[0].measures[0].events);
 const broken=model.cloneWorkshop(score);broken.parts[0].measures[0].events.splice(1,1);const repaired=expression.repairWorkshopTremolos(broken);assert(!repaired.tremolos);assert.strictEqual(repaired.parts[0].measures[0].events[0].noteValue,'quarter');assert(model.isValidWorkshopScore(repaired));
});
test('glissando and slide edges survive import/export and produce bounded chromatic piano steps',()=>{
 for(const type of ['glissando','slide']) {
  const score=expression.connectWorkshopGlissando(pair(),['a','b'],type);assert(model.isValidWorkshopScore(score));assert.deepStrictEqual(pitches(score),[48,49,50,51,52,53,54,55]);
  const back=io.importWorkshopMusicXmlText(plainExport(score)).score;assert.strictEqual(back.glissandos[0].type,type);assert.deepStrictEqual(pitches(back),pitches(score));assert(expression.workshopMeasureGlissandos(back,0,0)[0].toPitch.step==='G');
  const removed=expression.disconnectWorkshopGlissandos(score,['a']);assert(!removed.glissandos);
 }
});
test('alto/tenor clefs and independent staff keys keep exact contexts through normal XML interchange',()=>{
 let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Keys',2).score,true);score=model.setWorkshopPartKey(score,'G-major',0);score=model.setWorkshopPartKey(score,'F-major',1);score.parts[0].clef='alto';score.parts[1].clef='tenor';
 score=model.setWorkshopContextChange(score,0,1,{startSlot:2,keyId:'D-major',clef:'alto'},{partOnly:true});assert(score);assert.strictEqual(model.workshopMeasureContextAtSlot(score,0,3,0).keyId,'G-major');assert.strictEqual(model.workshopMeasureContextAtSlot(score,0,3,1).keyId,'D-major');
 score.parts[0].measures[0].events=[event('a')];score.parts[1].measures[0].events=[event('b','F',2)];const back=io.importWorkshopMusicXmlText(plainExport(score)).score;assert.strictEqual(back.parts[0].clef,'alto');assert.strictEqual(back.parts[1].clef,'tenor');assert.strictEqual(model.workshopMeasureContext(back,0,0).keyId,'G-major');assert.strictEqual(model.workshopMeasureContextAtSlot(back,0,3,1).keyId,'D-major');
 const change=score.parts[1].measures[0].contextChanges[0];const removed=model.removeWorkshopContextChange(score,0,1,change.id,{partOnly:true});assert.strictEqual(model.workshopMeasureContextAtSlot(removed,0,3,1).keyId,'F-major');assert.strictEqual(model.workshopMeasureContextAtSlot(removed,0,3,0).keyId,'G-major');
 const shared=model.setWorkshopMeasureContext(score,1,{keyId:'E-major'});assert.strictEqual(model.workshopMeasureContext(shared,1,0).keyId,'E-major');assert.strictEqual(model.workshopMeasureContext(shared,1,1).keyId,'E-major');
 assert.strictEqual(tonality.workshopKeySignature('G-major','alto')[0].octave,4);assert.strictEqual(tonality.workshopKeySignature('G-major','tenor')[0].octave,3);
});
test('imported tuplets keep selected rest members and complete their group',()=>{
 const mod='<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
 const source=xml('<measure>'+attrs+note('C',4,mod+'<notations><tuplet type="start"/></notations>',4,'eighth')+'<note><rest/><duration>4</duration><voice>1</voice><type>eighth</type>'+mod+'</note>'+note('D',4,mod+'<notations><tuplet type="stop"/></notations>',4,'eighth')+'</measure>');
 const score=io.importWorkshopMusicXmlText(source).score,events=score.parts[0].measures[0].events;assert(events.every(e=>e.tupletGroupId===events[0].tupletGroupId));assert(model.isValidWorkshopTripletGroup(events,events[0].tupletGroupId));assert(io.importWorkshopMusicXmlText(plainExport(score)).score.parts[0].measures[0].events.every(e=>e.tupletGroupId));
});
test('additional articulations and automatic accidentals with editorial flags survive normal XML interchange',()=>{
 const score=pair();score.parts[0].measures[0].events[0].articulations=['strong-accent','breath-mark','caesura','detached-legato'];score.parts[0].measures[0].events[0].pitch.alter=1;score.parts[0].measures[0].events[0].accidentalDisplay={force:false,editorial:true};
 assert(model.isValidWorkshopScore(score));const exported=plainExport(score);assert(exported.includes('editorial="yes"'));const back=io.importWorkshopMusicXmlText(exported).score;assert.deepStrictEqual(back.parts[0].measures[0].events[0].articulations,score.parts[0].measures[0].events[0].articulations);assert.strictEqual(back.parts[0].measures[0].events[0].accidentalDisplay.editorial,true);
});
test('new fields and graphs persist in saved revisions, libraries and native exports with legacy scores still valid',()=>{
 const draft=model.createWorkshopDraft('Saved extended',2);draft.score=model.setWorkshopSecondStaffEnabled(draft.score,true);draft.score.parts[0].clef='alto';draft.score.parts[1].keyId='D-major';draft.score.parts[0].measures[0].events=[event('a'),event('b','G',2)];draft.score=expression.connectWorkshopTremolo(draft.score,['a','b'],4);
 draft.score.parts[0].measures[1].events=[event('c','E',0,{fermata:1.75,fermataShape:'square',lyrics:[{number:'1',text:'Fox',syllabic:'begin',extend:'start'},{number:'2',text:'Pfote',syllabic:'single'}]}),event('d','F',2,{grace:true,graceSlash:false})];draft.score=expression.connectWorkshopGlissando(draft.score,['c','d'],'slide');
 const saved=model.saveWorkshopDraft({version:1,pieces:[]},draft,'2026-10-05T00:00:00.000Z');assert(saved);assert(model.isValidWorkshopLibrary(saved.library));const restored=model.openWorkshopPiece(JSON.parse(JSON.stringify(saved.library)).pieces[0]);assert.deepStrictEqual(restored.score,draft.score);
 const native=io.importWorkshopMusicXmlText(io.exportWorkshopMusicXmlText(draft.score,{title:draft.title}).data).score;delete native.musicXml;assert.deepStrictEqual(native,draft.score);assert(model.isValidWorkshopScore(model.createWorkshopDraft().score));
});
