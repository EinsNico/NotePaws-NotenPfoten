const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const root=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(root))return original(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
const model=require('../src/model/Workshop'),io=require('../src/model/WorkshopMusicXml'),parser=require('../src/model/WorkshopMusicXmlParser'),expression=require('../src/model/WorkshopExpression'),pitchContext=require('../src/model/WorkshopPitchContext'),navigation=require('../src/model/WorkshopNavigation');
const {createWorkshopPlayback}=require('../src/model/WorkshopPlayback'),{createWorkshopPracticePlan}=require('../src/model/WorkshopPractice');
Module._extensions['.js']=original;
const cases=[];function test(name,body){cases.push([name,body]);}
function note(id,extra={}){return Object.assign({id,kind:'note',pitch:{step:'C',alter:0,octave:4},noteValue:'quarter',startSlot:0},extra);}
function score(count=1){const score=model.createWorkshopDraft('Transposition',count).score;score.parts[0].measures.forEach((bar,index)=>bar.events=[note('note-'+index)]);return score;}
function xml(bars){return '<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'+bars+'</part></score-partwise>';}
const basic='<divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>';
function xmlNote(octave=4){return '<note><pitch><step>C</step><octave>'+octave+'</octave></pitch><duration>1</duration><type>quarter</type></note>';}
function plainExport(value){const source=io.exportWorkshopMusicXmlText(value,{title:'Edited'}).data,doc=parser.parseWorkshopMusicXmlDocument(source),misc=parser.musicXmlChild(parser.musicXmlChild(doc,'identification'),'miscellaneous'),fields=parser.musicXmlChildren(misc,'miscellaneous-field').filter(node=>node.attrs.name==='notenpfoten-editor-score-v1');return fields.reduceRight((out,node)=>out.slice(0,node.start)+out.slice(node.end),source);}
function values(value){return model.workshopTimeline(value).events.filter(event=>event.value!==null).map(event=>event.value);}

test('MusicXML octave clefs and instrument transpose preserve written notes and shift sounding pitch once',()=>{
  const source=xml('<measure><attributes>'+basic+'<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef><transpose><diatonic>1</diatonic><chromatic>2</chromatic><octave-change>1</octave-change></transpose></attributes>'+xmlNote(3)+'</measure>');
  const imported=io.importWorkshopMusicXmlText(source),part=imported.score.parts[0],event=part.measures[0].events[0];
  assert.strictEqual(part.clefOctave,-1);assert.deepStrictEqual(part.transpose,{diatonic:1,chromatic:2,octaveChange:1});assert.strictEqual(event.pitch.octave,4);
  assert.deepStrictEqual(values(imported.score),[50]);assert(!imported.warnings.includes('unsupported-notation'));
  const exported=plainExport(imported.score);assert(exported.includes('<clef-octave-change>-1</clef-octave-change>'));assert(exported.includes('<octave>3</octave>'));assert(exported.includes('<chromatic>2</chromatic>'));
  const restored=io.importWorkshopMusicXmlText(exported).score;assert.strictEqual(restored.parts[0].measures[0].events[0].pitch.octave,4);assert.deepStrictEqual(values(restored),[50]);
  const timeline=createWorkshopPlayback(restored,{}).getTimeline();assert.deepStrictEqual(timeline.events.filter(event=>event.value!==null).map(event=>event.value),[50]);
  const plan=createWorkshopPracticePlan(restored);assert.deepStrictEqual(plan.targets.flatMap(target=>target.expectedValues),[50]);
});

test('octave line, octave clef and chromatic transpose combine without changing source note geometry',()=>{
  let value=score();value.parts[0].clefOctave=-1;value.parts[0].transpose={chromatic:2,diatonic:1};value.parts[0].measures[0].directions=[{id:'octave',type:'octaveShift',startSlot:0,endSlot:2,value:1}];
  const before=JSON.stringify(value),heard=values(value);assert.deepStrictEqual(heard,[50]);
  const index=expression.indexWorkshopExpressionNotes(value);assert.strictEqual(model.workshopPitchValue(index.get('note-0').soundingPitch),50);
  const exported=plainExport(value);assert(exported.includes('<octave>4</octave>'));assert.deepStrictEqual(values(io.importWorkshopMusicXmlText(exported).score),heard);assert.strictEqual(JSON.stringify(value),before);
});

test('per-bar and in-bar contexts inherit, reset, survive move/delete and reject pitches outside the piano range',()=>{
  const value=score(4),bars=value.parts[0].measures;value.parts[0].clefOctave=-1;value.parts[0].transpose={chromatic:2};bars[1].clefOctave=1;bars[2].transpose={chromatic:0};bars[3].clefOctave=0;
  assert(model.isValidWorkshopScore(value));assert.deepStrictEqual(values(value),[38,62,60,48]);
  const moved=model.moveWorkshopMeasure(value,2,0);assert(moved);assert.deepStrictEqual(values(moved),[60,38,62,48]);
  const removed=model.removeWorkshopMeasure(value,1);assert(removed);assert.deepStrictEqual(values(removed),[38,60,48]);
  let changed=score(2);changed.parts[0].measures[0].events=[note('before'),note('after',{startSlot:2})];
  changed=model.setWorkshopContextChange(changed,0,0,{startSlot:2,clefOctave:1,transpose:{chromatic:-2,diatonic:-1}},{partOnly:true});assert(changed);assert.deepStrictEqual(values(changed),[48,58,58]);
  const back=io.importWorkshopMusicXmlText(plainExport(changed)).score;assert.deepStrictEqual(values(back),[48,58,58]);assert.strictEqual(back.parts[0].measures[0].events[1].pitch.octave,4);
  assert.strictEqual(model.setWorkshopMeasureContext(changed,0,{transpose:{chromatic:25}}),null);
  const high=score();high.parts[0].measures[0].events=[note('highest',{pitch:{step:'C',alter:0,octave:8}})];assert.strictEqual(model.setWorkshopMeasureContext(high,0,{clefOctave:1}),null);
  assert(pitchContext.isValidWorkshopTranspose({chromatic:0,diatonic:0,octaveChange:0}));
});

test('named segno and coda targets route to the requested signs with safe pass constraints',()=>{
  const value=score(7),bars=value.parts[0].measures;
  bars[0].navigation=[{kind:'segno',label:'A'}];bars[1].navigation=[{kind:'segno',label:'B'}];bars[2].navigation=[{kind:'toCoda',target:'Final',passes:[2]}];bars[3].navigation=[{kind:'ds',target:'B'}];bars[4].navigation=[{kind:'coda',label:'Wrong'}];bars[5].navigation=[{kind:'coda',label:'Final'}];bars[6].navigation=['fine'];
  assert.deepStrictEqual(model.workshopPlaybackBarOrder(value),[0,1,2,3,1,2,5,6]);
  const back=io.importWorkshopMusicXmlText(plainExport(value)).score;assert.deepStrictEqual(model.workshopPlaybackBarOrder(back),[0,1,2,3,1,2,5,6]);
  assert.deepStrictEqual(back.parts[0].measures[2].navigation,[{kind:'toCoda',target:'Final',passes:[2]}]);
  assert.strictEqual(back.parts[0].measures[1].navigation.filter(entry=>navigation.workshopNavigationKind(entry)==='segno').length,1);
});

test('time-only after repeated endings and named cycles remain deterministic and bounded',()=>{
  const value=score(4),bars=value.parts[0].measures;bars[0].repeatStart=true;bars[1].ending=[1];bars[1].repeatEnd=2;bars[2].ending=[2];bars[2].navigation=[{kind:'dc',passes:[2]}];bars[3].navigation=['fine'];
  const order=model.workshopPlaybackBarOrder(value);assert(order);assert.deepStrictEqual(order,[0,1,0,2,0,1,0,2,3]);
  const cycle=score(2);cycle.parts[0].measures[0].navigation=[{kind:'segno',label:'A'}];cycle.parts[0].measures[1].navigation=[{kind:'ds',target:'A',passes:[1,2,3,4,5,6,7,8]}];
  assert.strictEqual(model.workshopPlaybackBarOrder(cycle).length,18);assert.strictEqual(navigation.createWorkshopNavigationOrder(cycle,4),null);
});

test('missing or ambiguous named targets are rejected while legacy unlabelled navigation remains compatible',()=>{
  const value=score(2);value.parts[0].measures[1].navigation=[{kind:'ds',target:'Missing'}];assert(!model.isValidWorkshopScore(value));assert.strictEqual(model.workshopPlaybackBarOrder(value),null);
  value.parts[0].measures[0].navigation=[{kind:'segno',label:'A'}];value.parts[0].measures[1].navigation=[{kind:'segno',label:'A'}];assert(!model.isValidWorkshopScore(value));
  value.parts[0].measures[0].navigation=['segno'];value.parts[0].measures[1].navigation=['ds'];assert.deepStrictEqual(model.workshopPlaybackBarOrder(value),[0,1,0,1]);
  assert(!navigation.isValidWorkshopNavigation([{kind:'dc',passes:[0]}]));assert(!navigation.isValidWorkshopNavigation([{kind:'ds',label:'A'}]));
});

test('default jumps use the first named sign while unlabelled signs retain priority',()=>{
  const value=score(6),bars=value.parts[0].measures;
  bars[0].navigation=[{kind:'segno',label:'Start'}];bars[1].navigation=['toCoda'];bars[2].navigation=['ds'];bars[3].navigation=[{kind:'coda',label:'Final'}];bars[4].navigation=[{kind:'coda',label:'Other'}];bars[5].navigation=['fine'];
  assert.deepStrictEqual(model.workshopPlaybackBarOrder(value),[0,1,2,0,1,3,4,5]);
  const restored=io.importWorkshopMusicXmlText(plainExport(value)).score;
  assert.deepStrictEqual(model.workshopPlaybackBarOrder(restored),[0,1,2,0,1,3,4,5]);
  bars[4].navigation=['coda'];assert.deepStrictEqual(model.workshopPlaybackBarOrder(value),[0,1,2,0,1,4,5]);
  bars[1].navigation=['segno'];bars[2].navigation=['ds'];assert.deepStrictEqual(model.workshopPlaybackBarOrder(value),[0,1,2,1,2,3,4,5]);
  bars[2].navigation=[{kind:'ds',target:'Missing'}];assert.strictEqual(model.workshopPlaybackBarOrder(value),null);
});

test('unsupported MusicXML time-only never turns conditional navigation into unconditional jumps',()=>{
  ['9','one','1,,2','1.5','1.0','1e0','0x1',''].forEach(passes=>{
    const source=xml('<measure><attributes>'+basic+'<clef><sign>G</sign><line>2</line></clef></attributes><direction><sound segno="Start" coda="Final" dacapo="yes" dalsegno="Start" tocoda="Final" fine="yes" time-only="'+passes+'"/></direction>'+xmlNote()+'</measure><measure>'+xmlNote()+'</measure>');
    const imported=io.importWorkshopMusicXmlText(source);
    assert(imported.score);assert(imported.warnings.includes('unsupported-notation'));
    assert.deepStrictEqual(imported.score.parts[0].measures[0].navigation,[{kind:'segno',label:'Start'},{kind:'coda',label:'Final'}]);
    assert.deepStrictEqual(model.workshopPlaybackBarOrder(imported.score),[0,1]);
  });
  const source=xml('<measure><attributes>'+basic+'<clef><sign>G</sign><line>2</line></clef></attributes>'+xmlNote()+'</measure><measure><direction><sound dacapo="yes" time-only="1, 2"/></direction>'+xmlNote()+'</measure>');
  const imported=io.importWorkshopMusicXmlText(source);
  assert.deepStrictEqual(imported.score.parts[0].measures[1].navigation,[{kind:'dc',passes:[1,2]}]);
  assert.deepStrictEqual(model.workshopPlaybackBarOrder(imported.score),[0,1,0,1,0,1]);
});

for(const[name,body]of cases){body();process.stdout.write('✓ '+name+'\n');}process.stdout.write('Workshop transposition and named navigation tests passed.\n');
