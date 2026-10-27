const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const root=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(root))return original(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
const io=require('../src/model/WorkshopMusicXml'),model=require('../src/model/Workshop'),editor=require('../src/model/WorkshopScoreEditor'),display=require('../src/model/WorkshopTupletDisplay');
Module._extensions['.js']=original;
function test(name,callback){callback();process.stdout.write('✓ tuplet display: '+name+'\n');}
const source=fs.readFileSync(path.join(__dirname,'fixtures/workshop-moonlight-bar-10.musicxml'),'utf8');
const attrs='<attributes><divisions>12</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
const modification='<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
function note(index,extra=''){return '<note><pitch><step>'+['C','D','E'][index]+'</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>eighth</type>'+modification+extra+'</note>';}
function xml(notes){return '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure>'+attrs+notes+'</measure></part></score-partwise>';}
function triplet(attributes=''){return xml(note(0,'<notations><tuplet type="start" number="2" '+attributes+'/></notations>')+note(1)+note(2,'<notations><tuplet type="stop" number="2"/></notations>'));}
function importedNotes(score){return score.parts[0].measures[0].events.filter(event=>event.kind==='note');}
function standardBack(score){return io.importWorkshopMusicXmlText(io.exportWorkshopMusicXmlText(score,{title:'Changed title'}).data,{standardOnly:true}).score;}
test('Moonlight explicit hidden triplet brackets and numbers propagate to all twelve notes',()=>{
  const result=io.importWorkshopMusicXmlText(source),notes=importedNotes(result.score).filter(event=>event.tuplet);
  assert.strictEqual(notes.length,12);assert(notes.every(event=>event.stem==='down'));
  assert(notes.every(event=>JSON.stringify(event.tupletDisplay)===JSON.stringify({bracket:false,showNumber:'none'})));
  assert.strictEqual(new Set(notes.map(event=>event.tupletGroupId)).size,4);assert(model.isValidWorkshopScore(result.score));
  notes[0].tupletDisplay.bracket=true;assert.strictEqual(notes[1].tupletDisplay.bracket,false,'group members never share mutable objects');
});
test('partial choices remain partial and unspecified defaults remain absent',()=>{
  for(const [attributes,value] of [['',undefined],['bracket="no"',{bracket:false}],['show-number="both" placement="below"',{showNumber:'both',placement:'below'}],['bracket="yes" show-number="actual" placement="above"',{bracket:true,showNumber:'actual',placement:'above'}]]){
    const score=io.importWorkshopMusicXmlText(triplet(attributes)).score;
    importedNotes(score).forEach(event=>assert.deepStrictEqual(event.tupletDisplay,value));
    assert.strictEqual(new Set(importedNotes(score).map(event=>event.tupletGroupId)).size,1,'numbered groups propagate through notes without notation tags');
  }
});
test('invalid XML display values are omitted with a warning while valid values survive',()=>{
  const result=io.importWorkshopMusicXmlText(triplet('bracket="maybe" show-number="anything" placement="below"'));
  assert(result.warnings.includes('unsupported-notation'));assert(model.isValidWorkshopScore(result.score));
  importedNotes(result.score).forEach(event=>assert.deepStrictEqual(event.tupletDisplay,{placement:'below'}));
});
test('strict model validation rejects invalid metadata and metadata without a rhythm',()=>{
  for(const value of [null,[],{}, {bracket:'no'},{showNumber:'hidden'},{placement:'sideways'},{bracket:false,other:true}]){
    assert.strictEqual(display.isValidWorkshopTupletDisplay(value),false);
    const score=io.importWorkshopMusicXmlText(triplet()).score;importedNotes(score)[0].tupletDisplay=value;assert.strictEqual(model.isValidWorkshopScore(score),false);
  }
  const score=model.createWorkshopDraft().score;score.parts[0].measures[0].events=[{id:'plain',kind:'note',noteValue:'quarter',pitch:{step:'C',alter:0,octave:4},startSlot:0,tupletDisplay:{bracket:false}}];assert.strictEqual(model.isValidWorkshopScore(score),false);
});
test('standard MusicXML exports all explicit display fields without relying on native payloads',()=>{
  for(const attributes of ['bracket="no" show-number="none"','bracket="yes" show-number="both" placement="below"','show-number="actual" placement="above"']){
    const score=io.importWorkshopMusicXmlText(triplet(attributes)).score,back=standardBack(score);
    assert.deepStrictEqual(importedNotes(back).map(event=>event.tupletDisplay),importedNotes(score).map(event=>event.tupletDisplay));
    assert.deepStrictEqual(importedNotes(back).map(event=>[event.pitch,event.startSlot,event.tuplet]),importedNotes(score).map(event=>[event.pitch,event.startSlot,event.tuplet]));
  }
});
test('tuplets containing a chord keep one group and independent display metadata on every tone',()=>{
  const chord=note(0).replace('<note>','<note><chord/>');
  const score=io.importWorkshopMusicXmlText(xml(note(0,'<notations><tuplet type="start" bracket="no" show-number="none"/></notations>')+chord+note(1)+note(2,'<notations><tuplet type="stop"/></notations>'))).score;
  const events=importedNotes(score);assert.strictEqual(events.length,4);assert.strictEqual(new Set(events.map(event=>event.tupletGroupId)).size,1);assert(events.every(event=>event.tupletDisplay.showNumber==='none'));assert(model.isValidWorkshopScore(score));
  const back=standardBack(score);assert(model.isValidWorkshopScore(back));assert(importedNotes(back).every(event=>event.tupletDisplay.showNumber==='none'));
});
test('detached time-modified notes retain standalone choices in standard XML after group fragmentation',()=>{
  const score=io.importWorkshopMusicXmlText(triplet('bracket="no" show-number="none" placement="below"')).score;
  importedNotes(score).forEach(event=>{delete event.tupletGroupId;});assert(model.isValidWorkshopScore(score));
  const exported=io.exportWorkshopMusicXmlText(score,{title:'Fragmented'}).data;
  assert.strictEqual((exported.match(/<tuplet type="start" number="1" bracket="no" show-number="none" placement="below"\/>/g)||[]).length,3);
  const result=io.importWorkshopMusicXmlText(exported,{standardOnly:true}),back=importedNotes(result.score);
  assert(back.every(event=>!event.tupletGroupId));assert(back.every(event=>event.tuplet===3));assert.deepStrictEqual(back.map(event=>event.tupletDisplay),importedNotes(score).map(event=>event.tupletDisplay));assert(!result.warnings.includes('unsupported-notation'));
});
test('saved revisions and independent copies retain display choices; dissolving a tuplet removes them',()=>{
  const draft=model.createWorkshopDraft('Tuplet test');draft.score=io.importWorkshopMusicXmlText(triplet('bracket="no" show-number="none"')).score;
  const saved=model.saveWorkshopDraft({version:1,pieces:[]},draft,'2026-10-06T00:00:00.000Z');assert(saved&&model.isValidWorkshopLibrary(saved.library));
  const restored=model.openWorkshopPiece(JSON.parse(JSON.stringify(saved.library)).pieces[0]);assert.deepStrictEqual(restored.score,draft.score);
  const copy=model.cloneWorkshop(restored.score);importedNotes(copy)[0].tupletDisplay.bracket=true;assert.strictEqual(importedNotes(restored.score)[0].tupletDisplay.bracket,false);
  const bar=restored.score.parts[0].measures[0],split=editor.splitWorkshopTriplets(bar,[bar.events[0].id]);assert(split);assert(split.every(event=>!event.tupletDisplay));assert(model.isValidWorkshopMeasure({events:split}));
});
test('untouched old imports recover missing choices without changing IDs, notes, source or input',()=>{
  const imported=io.importWorkshopMusicXmlText(source),old=model.cloneWorkshop(imported.score);
  old.parts.forEach(part=>part.measures.forEach(bar=>bar.events.forEach(event=>{delete event.tupletDisplay;})));
  old.musicXml.fingerprint=io.workshopMusicXmlFingerprint(old,imported.title);
  const before=JSON.stringify(old),restored=io.restoreWorkshopTupletDisplay(old,imported.title);assert.notStrictEqual(restored,old);assert.strictEqual(JSON.stringify(old),before);
  assert.deepStrictEqual(restored.parts.flatMap(part=>part.measures.flatMap(bar=>bar.events.map(event=>event.id))),old.parts.flatMap(part=>part.measures.flatMap(bar=>bar.events.map(event=>event.id))));
  assert.strictEqual(restored.musicXml.sourceXml,old.musicXml.sourceXml);assert.strictEqual(restored.musicXml.fingerprint,io.workshopMusicXmlFingerprint(restored,imported.title));
  const stripped=model.cloneWorkshop(restored);stripped.parts.forEach(part=>part.measures.forEach(bar=>bar.events.forEach(event=>{delete event.tupletDisplay;})));stripped.musicXml.fingerprint=old.musicXml.fingerprint;assert.deepStrictEqual(stripped,old);
  assert.strictEqual(io.restoreWorkshopTupletDisplay(restored,imported.title),restored,'already recovered scores stay untouched');
});
test('recovery skips edited, renamed, invalid-source and structurally different scores',()=>{
  const imported=io.importWorkshopMusicXmlText(source),old=model.cloneWorkshop(imported.score);old.parts.forEach(part=>part.measures.forEach(bar=>bar.events.forEach(event=>{delete event.tupletDisplay;})));old.musicXml.fingerprint=io.workshopMusicXmlFingerprint(old,imported.title);
  const edited=model.cloneWorkshop(old);edited.parts[0].measures[0].events[0].pitch.octave+=1;assert.strictEqual(io.restoreWorkshopTupletDisplay(edited,imported.title),edited);
  assert.strictEqual(io.restoreWorkshopTupletDisplay(old,imported.title+' renamed'),old);
  const bad=model.cloneWorkshop(old);bad.musicXml.sourceXml='<invalid/>';assert.strictEqual(io.restoreWorkshopTupletDisplay(bad,imported.title),bad);
  const different=model.cloneWorkshop(old);different.musicXml.sourceXml=triplet('bracket="no"');assert.strictEqual(io.restoreWorkshopTupletDisplay(different,imported.title),different);
});
test('older importer annotations may differ while exact groups recover without adopting unrelated data',()=>{
  const imported=io.importWorkshopMusicXmlText(source),old=model.cloneWorkshop(imported.score);
  old.parts.forEach(part=>part.measures.forEach(bar=>{delete bar.directions;bar.events.forEach(event=>{delete event.tupletDisplay;});}));
  old.metadata={title:'Older import metadata'};delete old.layout;
  old.musicXml.fingerprint=io.workshopMusicXmlFingerprint(old,imported.title);
  const before=JSON.stringify(old),restored=io.restoreWorkshopTupletDisplay(old,imported.title);assert.notStrictEqual(restored,old);assert.strictEqual(JSON.stringify(old),before);
  assert(importedNotes(restored).filter(event=>event.tuplet).every(event=>event.tupletDisplay.showNumber==='none'));
  const stripped=model.cloneWorkshop(restored);stripped.parts.forEach(part=>part.measures.forEach(bar=>bar.events.forEach(event=>{delete event.tupletDisplay;})));stripped.musicXml.fingerprint=old.musicXml.fingerprint;assert.deepStrictEqual(stripped,old,'only display fields and the guarded fingerprint may change');
});
test('guarded recovery checks complete group membership, pitch and explicit stem even with a matching fingerprint',()=>{
  for(const patch of [event=>{event.pitch.octave+=1;},event=>{event.stem='up';}]){
    const imported=io.importWorkshopMusicXmlText(triplet('bracket="no" show-number="none"').replace(/<type>eighth<\/type>/g,'<type>eighth</type><stem>down</stem>')),old=model.cloneWorkshop(imported.score);
    importedNotes(old).forEach(event=>{delete event.tupletDisplay;});patch(importedNotes(old)[0]);assert(model.isValidWorkshopScore(old));old.musicXml.fingerprint=io.workshopMusicXmlFingerprint(old,imported.title);
    assert.strictEqual(io.restoreWorkshopTupletDisplay(old,imported.title),old,'the source gate alone cannot authorize copying choices to a different group');
  }
});
