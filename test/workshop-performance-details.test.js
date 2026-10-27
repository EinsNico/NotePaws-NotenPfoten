const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core'),Vue=require('vue'),compiler=require('vue-template-compiler');
global.regeneratorRuntime=require('babel-runtime/regenerator');
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.window={scrollTo(){},addEventListener(){},removeEventListener(){}};global.document={addEventListener(){},removeEventListener(){}};
const root=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'],originalVue=Module._extensions['.vue'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(root))return original(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
Module._extensions['.vue']=mod=>{mod.exports={};};
function component(name){const file=root+'components/'+name+'.vue',parsed=compiler.parseComponent(fs.readFileSync(file,'utf8'));assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));}
const model=require('../src/model/Workshop'),xml=require('../src/model/WorkshopMusicXml'),expression=require('../src/model/WorkshopExpression'),details=require('../src/model/WorkshopPerformanceDetails');
const performance=component('WorkshopPerformanceControls'),notation=component('WorkshopNotationControls'),workshop=component('Workshop');
const strings={de:require('../src/resources/de').default,en:require('../src/resources/en').default};
Module._extensions['.js']=original;if(originalVue)Module._extensions['.vue']=originalVue;else delete Module._extensions['.vue'];
function test(name,body){body();process.stdout.write('✓ performance details: '+name+'\n');}
function note(id,slot=0,extra={}){return Object.assign({id,kind:'note',pitch:{step:'C',alter:0,octave:4},startSlot:slot,noteValue:'quarter'},extra);}
function score(events=[]){const score=model.createWorkshopDraft('Expression',2).score;score.bpm=60;score.parts[0].measures[0].events=events;return score;}
function clone(value){return JSON.parse(JSON.stringify(value));}
function sounding(score,options){return model.workshopTimeline(score,options).events.filter(event=>event.value!==null);}
function close(actual,expected){assert(Math.abs(actual-expected)<1e-6,actual+' != '+expected);}
const attributes='<attributes><divisions>12</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
function document(body){return '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1">'+attributes+body+'</measure></part></score-partwise>';}
function xmlNote(extra='',step='C',type='quarter',duration=12){return '<note><pitch><step>'+step+'</step><octave>4</octave></pitch><duration>'+duration+'</duration><voice>1</voice><type>'+type+'</type>'+extra+'</note>';}
function plain(score){return xml.exportWorkshopMusicXmlText(score,{title:'Edited expression'}).data.replace(/<miscellaneous>[\s\S]*?<\/miscellaneous>/g,'');}
function translator(locale){return {$t(key,values={}){return Object.keys(values).reduce((text,keyName)=>text.replace('{'+keyName+'}',values[keyName]),strings[locale][key]||key);},$tc(key,count,values){return this.$t(key,values);}};}
function control(definition,score,ids=['a'],locale='de',section='selection'){
  const view=new Vue(Object.assign({},definition,{propsData:{score,selectedEvents:score.parts[0].measures[0].events.filter(event=>ids.includes(event.id)),barIndex:0,partIndex:0,section},methods:Object.assign({},definition.methods,translator(locale))}));
  view.$on('change',next=>{view.score=next;view.selectedEvents=next.parts[0].measures[0].events.filter(event=>ids.includes(event.id));});return view;
}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}function text(node){return (node.text||'')+(node.children||[]).map(text).join(' ');}
function label(view,key){const found=nodes(view._render()).find(node=>node.tag==='label'&&text(node).includes(view.$t(key)));assert(found,key);return nodes(found).find(node=>['input','select'].includes(node.tag));}

test('bounded expression schemas reject dependencies, invalid percentages, ratios and unknown fields',()=>{
  const good=note('a',0,{ornament:'delayed-turn',ornamentAccidentals:{upper:1,lower:-1},ornamentWavy:{type:'start',number:1},grace:true,graceTiming:{stealPrevious:10,stealFollowing:15,makeTime:.25}});assert(model.isValidWorkshopScore(score([good])));
  for(const extra of [{graceTiming:{stealFollowing:25}},{ornamentAccidentals:{upper:1}},{grace:true,graceTiming:{stealFollowing:101}},{grace:true,graceTiming:{makeTime:0}},{ornament:'turn',ornamentAccidentals:{upper:4}},{ornamentWavy:{type:'bad',number:1}},{ornamentWavy:{type:'start',number:17}}])assert(!model.isValidWorkshopScore(score([note('a',0,extra)])),JSON.stringify(extra));
  assert(details.isValidWorkshopSwing({first:3,second:2,unit:'sixteenth',style:'Swing'}));assert(details.isValidWorkshopSwing('straight'));
  for(const value of [{first:0,second:1,unit:'eighth'},{first:2.5,second:1,unit:'eighth'},{first:2,second:1,unit:'quarter'},'shuffle'])assert(!model.isValidWorkshopDirection({id:'swing',type:'swing',startSlot:0,value}));
});
test('four turn variants and upper/lower auxiliary accidentals roundtrip through ordinary MusicXML',()=>{
  for(const kind of ['delayed-turn','delayed-inverted-turn','vertical-turn','inverted-vertical-turn']){
    const imported=xml.importWorkshopMusicXmlText(document(xmlNote('<notations><ornaments><'+kind+'/><accidental-mark placement="above">sharp</accidental-mark><accidental-mark placement="below">flat</accidental-mark></ornaments></notations>')));
    assert(!imported.warnings.includes('unsupported-notation'));const event=imported.score.parts[0].measures[0].events[0];assert.strictEqual(event.ornament,kind);assert.deepStrictEqual(event.ornamentAccidentals,{upper:1,lower:-1});
    const back=xml.importWorkshopMusicXmlText(plain(imported.score)).score.parts[0].measures[0].events[0];assert.strictEqual(back.ornament,kind);assert.deepStrictEqual(back.ornamentAccidentals,event.ornamentAccidentals);
  }
});
test('wavy trill endpoints and number survive normal XML interchange without inventing required attacks',()=>{
  const source=document(xmlNote('<notations><ornaments><trill-mark/><wavy-line type="start" number="3"/></ornaments></notations>')+xmlNote('<notations><ornaments><wavy-line type="stop" number="3"/></ornaments></notations>','D'));
  const imported=xml.importWorkshopMusicXmlText(source);assert(!imported.warnings.includes('unsupported-notation'));const back=xml.importWorkshopMusicXmlText(plain(imported.score)).score;
  assert.deepStrictEqual(back.parts[0].measures[0].events.slice(0,2).map(event=>event.ornamentWavy),[{type:'start',number:3},{type:'stop',number:3}]);
  assert(sounding(imported.score).length>2);assert.strictEqual(sounding(imported.score,{expandExpressions:false}).length,2);
});
test('incomplete trill lines warn while retaining endpoints, scope by displayed staff and number, and preserve source',()=>{
  const mark=(type,number=1)=>'<notations><ornaments><wavy-line type="'+type+'" number="'+number+'"/></ornaments></notations>';
  for(const type of ['stop','continue','start']) {
    const source=document(xmlNote(mark(type))),imported=xml.importWorkshopMusicXmlText(source);
    assert(imported.warnings.includes('unsupported-notation'));assert.deepStrictEqual(imported.score.parts[0].measures[0].events[0].ornamentWavy,{type,number:1});
    assert.strictEqual(xml.exportWorkshopMusicXmlText(imported.score,{title:imported.title}).data,source);
    if(type==='stop')assert.strictEqual(sounding(imported.score).length,1);
  }
  const wrongNumber=xml.importWorkshopMusicXmlText(document(xmlNote(mark('start',1))+xmlNote(mark('stop',2),'D')));assert(wrongNumber.warnings.includes('unsupported-notation'));
  const wrongStaff=xml.importWorkshopMusicXmlText(document(xmlNote(mark('start')+'<staff>1</staff>')+xmlNote(mark('stop')+'<staff>2</staff>','D')));assert(wrongStaff.warnings.includes('unsupported-notation'));assert.strictEqual(wrongStaff.score.parts[0].measures[0].events[1].displayStaff,1);
  const valid=xml.importWorkshopMusicXmlText(document(xmlNote(mark('start'))+xmlNote(mark('continue'),'D')+xmlNote(mark('stop'),'E')));assert(!valid.warnings.includes('unsupported-notation'));
  const s=score([note('a',0,{ornamentWavy:{type:'stop',number:1}})]),native=xml.importWorkshopMusicXmlText(xml.exportWorkshopMusicXmlText(s,{title:'Native incomplete line'}).data);assert(native.warnings.includes('unsupported-notation'));assert.deepStrictEqual(native.score.parts[0].measures[0].events[0].ornamentWavy,s.parts[0].measures[0].events[0].ornamentWavy);
});
test('long mordents and their placement import/export, render controls and audition without affecting required notes',()=>{
  for(const kind of ['mordent','inverted-mordent']) {
    const result=xml.importWorkshopMusicXmlText(document(xmlNote('<notations><ornaments><'+kind+' long="yes" placement="below"/></ornaments></notations>')));assert(!result.warnings.includes('unsupported-notation'));
    const event=result.score.parts[0].measures[0].events[0];assert.strictEqual(event.ornamentLong,true);assert.strictEqual(event.ornamentPlacement,'below');
    const back=xml.importWorkshopMusicXmlText(plain(result.score)).score.parts[0].measures[0].events[0];assert.strictEqual(back.ornamentLong,true);assert.strictEqual(back.ornamentPlacement,'below');
    const s=score([note('a',0,{ornament:kind,ornamentLong:true,ornamentPlacement:'below'})]);assert.strictEqual(sounding(s).length,5);assert.strictEqual(sounding(s,{expandExpressions:false}).length,1);
    const view=control(performance,s);label(view,'WORKSHOP_ORNAMENT_LONG').data.on.change({target:{value:'false'}});assert.strictEqual(view.selectedEvents[0].ornamentLong,false);label(view,'WORKSHOP_ORNAMENT_PLACEMENT').data.on.change({target:{value:'above'}});assert.strictEqual(view.selectedEvents[0].ornamentPlacement,'above');view.$destroy();
    const editor=control(notation,s);editor.setNoteProperty('ornament','turn');assert.strictEqual(editor.selectedEvents[0].ornamentLong,undefined);editor.setNoteProperty('ornament',null);assert.strictEqual(editor.selectedEvents[0].ornamentPlacement,undefined);editor.$destroy();
  }
});
test('explicit grace percentages and make-time convert real divisions and survive ordinary MusicXML',()=>{
  const source=document('<note><grace slash="no" steal-time-previous="12.5" steal-time-following="25" make-time="3"/><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type></note>'+xmlNote());
  const result=xml.importWorkshopMusicXmlText(source);assert(!result.warnings.includes('unsupported-notation'));const event=result.score.parts[0].measures[0].events[0];assert.deepStrictEqual(event.graceTiming,{stealPrevious:12.5,stealFollowing:25,makeTime:.5});
  const exported=plain(result.score);assert(exported.includes('steal-time-following="25"'));const back=xml.importWorkshopMusicXmlText(exported).score;assert.deepStrictEqual(back.parts[0].measures[0].events[0].graceTiming,event.graceTiming);
});
test('unsupported ornament execution attributes, unknown marks and invalid grace/swing values warn explicitly',()=>{
  for(const extra of ['<notations><ornaments><trill-mark accelerate="yes" beats="6"/></ornaments></notations>','<notations><ornaments><schleifer/></ornaments></notations>','<notations><ornaments><turn/><accidental-mark>other</accidental-mark></ornaments></notations>'])assert(xml.importWorkshopMusicXmlText(document(xmlNote(extra))).warnings.includes('unsupported-notation'));
  const badGrace=document('<note><grace steal-time-following="120"/><pitch><step>D</step><octave>4</octave></pitch><type>eighth</type></note>'+xmlNote());assert(xml.importWorkshopMusicXmlText(badGrace).warnings.includes('unsupported-notation'));
  const badSwing=document('<sound><swing><first>2</first><second>1</second><swing-type>quarter</swing-type></swing></sound>'+xmlNote());assert(xml.importWorkshopMusicXmlText(badSwing).warnings.includes('unsupported-notation'));
  const styled=xml.importWorkshopMusicXmlText(document('<sound><swing><first>2</first><second>1</second><swing-style>Viennese</swing-style></swing></sound>'+xmlNote()));assert(styled.warnings.includes('unsupported-notation'));assert.strictEqual(styled.score.parts[0].measures[0].directions[0].value.style,'Viennese');
});
test('turns use their own accidentals and delayed turns retain the written tone before the embellishment',()=>{
  const s=score([note('a',0,{ornament:'delayed-turn',ornamentAccidentals:{upper:1,lower:-1}})]),performed=sounding(s);
  assert.deepStrictEqual(performed.map(event=>event.value),[48,51,48,46,48]);close(performed[0].durationMs,500);close(performed[1].startMs,500);close(performed[4].startMs+performed[4].durationMs,1000);
  assert.deepStrictEqual(sounding(s,{expandExpressions:false}).map(event=>[event.value,event.startMs,event.durationMs]),[[48,0,1000]]);
});
test('practice can suppress derived glissando, rolled-chord and tremolo-pair attacks while audition retains them',()=>{
  const gliss=expression.connectWorkshopGlissando(score([note('a'),note('b',2,{pitch:{step:'G',alter:0,octave:4}})]),['a','b']);assert(sounding(gliss).length>2);assert.strictEqual(sounding(gliss,{expandExpressions:false}).length,2);
  const rolled=score([note('a',0,{arpeggio:'up'}),note('b',0,{pitch:{step:'E',alter:0,octave:4},arpeggio:'up'})]);assert(sounding(rolled)[1].startMs>0);assert(sounding(rolled,{expandExpressions:false}).every(event=>event.startMs===0));
  const tremolo=expression.connectWorkshopTremolo(score([note('a'),note('b',2,{pitch:{step:'G',alter:0,octave:4}})]),['a','b'],2);assert(sounding(tremolo).length>2);assert.strictEqual(sounding(tremolo,{expandExpressions:false}).length,2);
});
test('grace timing steals from the correct adjacent same-voice note without changing the bar length',()=>{
  for(const [field,expected] of [['stealPrevious',[800,200,1000,1000]],['stealFollowing',[1000,250,1250,750]]]){
    const rate=field==='stealPrevious'?20:25,s=score([note('previous',0),note('grace',2,{grace:true,graceTiming:{[field]:rate}}),note('following',2)]),events=sounding(s,{expandExpressions:false}),grace=events.find(event=>event.id==='grace'),previous=events.find(event=>event.id==='previous'),following=events.find(event=>event.id==='following');
    close(grace.startMs,expected[0]);close(grace.durationMs,expected[1]);close(following.startMs,expected[2]);close(following.durationMs,expected[3]);close(previous.durationMs,field==='stealPrevious'?800:1000);close(model.workshopTimeline(s).durationMs,8000);
  }
});
test('make-time inserts time consistently for both staves, bar boundaries and metronome beats',()=>{
  let s=score([note('previous'),note('grace',2,{grace:true,graceTiming:{makeTime:1}}),note('following',2),note('later',4)]);s=model.setWorkshopSecondStaffEnabled(s,true);s.parts[1].measures[0].events=[note('bass',2,{pitch:{step:'C',alter:0,octave:3}})];
  const timeline=model.workshopTimeline(s,{includeBeats:true,expandExpressions:false}),event=id=>timeline.events.find(event=>event.id===id);
  close(event('previous').durationMs,1000);close(event('grace').startMs,1000);close(event('grace').durationMs,500);close(event('following').startMs,1500);close(event('bass').startMs,1500);close(event('later').startMs,2500);
  close(timeline.measures[0].endMs,4500);close(timeline.measures[1].startMs,4500);close(timeline.durationMs,8500);close(timeline.beats.find(beat=>beat.barIndex===0&&beat.startSlot===2).startMs,1500);
});
test('swing eighths and sixteenths preserve pitch and metric boundaries, exclude dots/tuplets, and stop at straight',()=>{
  const s=score([note('a',0,{noteValue:'eighth'}),note('b',1,{noteValue:'eighth'}),note('c',2,{noteValue:'eighth'}),note('d',3,{noteValue:'eighth'})]);s.parts[0].measures[0].directions=[{id:'swing',type:'swing',startSlot:0,value:{first:2,second:1,unit:'eighth'}},{id:'straight',type:'swing',startSlot:2,value:'straight'}];
  const played=sounding(s);close(played[0].durationMs,2000/3);close(played[1].startMs,2000/3);close(played[1].durationMs,1000/3);close(played[2].startMs,1000);close(played[3].startMs,1500);assert(played.every(event=>event.value===48));
  const short=score([note('a',0,{noteValue:'sixteenth'}),note('b',.5,{noteValue:'sixteenth'}),note('triplet',2,{noteValue:'eighth',tuplet:3})]);short.parts[0].measures[0].directions=[{id:'swing',type:'swing',startSlot:0,value:{first:3,second:1,unit:'sixteenth'}}];const events=sounding(short);close(events[0].durationMs,375);close(events[1].startMs,375);close(events[1].durationMs,125);close(events[2].startMs,1000);close(events[2].durationMs,1000/3);
});
test('swing changes and straight instructions import/export with no redundant text directions',()=>{
  const s=score([note('a',0,{noteValue:'eighth'}),note('b',1,{noteValue:'eighth'})]);s.parts[0].measures[0].directions=[{id:'swing',type:'swing',startSlot:0,value:{first:3,second:2,unit:'eighth'}},{id:'straight',type:'swing',startSlot:2,value:'straight'}];
  const back=xml.importWorkshopMusicXmlText(plain(s));assert(!back.warnings.includes('unsupported-notation'));const directions=back.score.parts[0].measures[0].directions;assert.deepStrictEqual(directions.filter(entry=>entry.type==='swing').map(entry=>[entry.startSlot,entry.value]),[[0,{first:3,second:2,unit:'eighth'}],[2,'straight']]);assert(!directions.some(entry=>entry.type==='text'&&entry.value.startsWith('Swing')));
});
test('performance editor preserves mixed auxiliary accidentals and edits/removes grace timing and trill endpoints',()=>{
  const s=score([note('a',0,{ornament:'turn',ornamentAccidentals:{lower:-1},grace:true,graceTiming:{stealFollowing:20}}),note('b',0,{ornament:'turn',ornamentAccidentals:{lower:1}})]),view=control(performance,s,['a','b']);
  assert.strictEqual(view.commonNested(view.ornamentNotes,'ornamentAccidentals','lower',''),'mixed');label(view,'WORKSHOP_ORNAMENT_ACCIDENTAL_UPPER').data.on.change({target:{value:'1'}});assert.deepStrictEqual(view.selectedEvents.map(event=>event.ornamentAccidentals),[{lower:-1,upper:1},{lower:1,upper:1}]);
  label(view,'WORKSHOP_GRACE_STEAL_FOLLOWING').data.on.change({target:{value:'35'}});assert.strictEqual(view.selectedEvents[0].graceTiming.stealFollowing,35);label(view,'WORKSHOP_GRACE_MAKE_TIME').data.on.change({target:{value:'.25'}});assert.strictEqual(view.selectedEvents[0].graceTiming.makeTime,.5);
  view.setWavy('start');view.setWavyNumber(2);assert(view.selectedEvents.every(event=>event.ornamentWavy.number===2));view.setWavy('');assert(view.selectedEvents.every(event=>event.ornamentWavy===undefined));view.setNested('graceTiming','stealFollowing','',view.graceNotes);view.setNested('graceTiming','makeTime','',view.graceNotes);assert.strictEqual(view.selectedEvents[0].graceTiming,undefined);assert(model.isValidWorkshopScore(view.score));view.$destroy();
});
test('ornament/grace clearing removes dependent data, and swing edit/add stays within existing menus',()=>{
  const view=control(notation,score([note('a',0,{ornament:'turn',ornamentAccidentals:{upper:1},grace:true,graceTiming:{stealFollowing:20}})]));
  view.setNoteProperty('grace',null);assert.strictEqual(view.selectedEvents[0].graceTiming,undefined);view.setNoteProperty('ornament',null);assert.strictEqual(view.selectedEvents[0].ornamentAccidentals,undefined);view.$destroy();
  const bar=control(notation,score(),[],'de','bar');bar.directionType='swing';bar.swingFirst=3;bar.swingSecond=2;bar.swingUnit='sixteenth';bar.addDirection();const entry=bar.score.parts[0].measures[0].directions[0];assert.deepStrictEqual(clone(entry.value),{first:3,second:2,unit:'sixteenth'});bar.editDirection(entry.id);assert.strictEqual(bar.swingFirst,3);assert.strictEqual(bar.swingUnit,'sixteenth');bar.swingMode='straight';bar.addDirection();assert.strictEqual(bar.score.parts[0].measures[0].directions[0].value,'straight');bar.$destroy();
});
test('new expression controls are translated in both languages and edits participate in undo and saved revisions',()=>{
  for(const locale of ['de','en']){const s=score([note('a',0,{ornament:'vertical-turn',grace:true,graceTiming:{makeTime:1},ornamentWavy:{type:'start',number:2}})]),view=control(performance,s,['a'],locale);assert(!text(view._render()).includes('WORKSHOP_'));view.$destroy();const bar=control(notation,s,[],locale,'bar');bar.directionType='swing';assert(!text(bar._render()).includes('WORKSHOP_'));bar.$destroy();}
  const parent=new Vue(Object.assign({},workshop,{created:undefined,mounted:undefined,methods:Object.assign({},workshop.methods,translator('de'))}));parent.$i18n={locale:'de'};parent.player={play(){},stopAll(){}};parent.newPiece();parent.draft.score=score([note('a',0,{ornament:'turn'})]);parent.resetHistory();parent.selectEvent(parent.currentBar.events[0]);const view=control(performance,parent.draft.score,['a']);view.$on('change',next=>parent.commitAdvancedNotation(next));view.setNested('ornamentAccidentals','upper','1',view.ornamentNotes);assert.strictEqual(parent.currentBar.events[0].ornamentAccidentals.upper,1);parent.undo();assert.strictEqual(parent.currentBar.events[0].ornamentAccidentals,undefined);parent.redo();assert.strictEqual(parent.currentBar.events[0].ornamentAccidentals.upper,1);const saved=model.saveWorkshopDraft({version:1,pieces:[]},parent.draft);assert.deepStrictEqual(model.openWorkshopPiece(saved.piece).score,parent.draft.score);view.$destroy();parent.$destroy();
});
