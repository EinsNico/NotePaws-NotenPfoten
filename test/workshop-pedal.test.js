const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalJs=Module._extensions['.js'],originalVue=Module._extensions['.vue'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(sourceRoot))return originalJs(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
Module._extensions['.vue']=mod=>{mod.exports={};};
function component(name){const file=path.resolve(sourceRoot,'components',name+'.vue'),parsed=compiler.parseComponent(fs.readFileSync(file,'utf8'));assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));}
const model=require('../src/model/Workshop'),io=require('../src/model/WorkshopMusicXml'),parser=require('../src/model/WorkshopMusicXmlParser'),pedals=require('../src/model/WorkshopPedal'),
  controlsDefinition=component('WorkshopNotationControls'),pedalDefinition=component('WorkshopPedalControls'),strings={de:require('../src/resources/de').default,en:require('../src/resources/en').default};
Module._extensions['.js']=originalJs;if(originalVue)Module._extensions['.vue']=originalVue;else delete Module._extensions['.vue'];
function test(name,fn){fn();process.stdout.write('✓ workshop pedal: '+name+'\n');}
function xml(body){return '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'+body+'</part></score-partwise>';}
const attrs='<attributes><divisions>1</divisions><key><fifths>0</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>',note='<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>';
function direction(mark,sound='',offset=0){return '<direction placement="below"><direction-type>'+mark+'</direction-type><offset>'+offset+'</offset>'+sound+'</direction>';}
function marks(score){return score.parts[0].measures.flatMap(bar=>(bar.directions||[]).filter(item=>item.type==='pedal'));}
function semantics(score){return marks(score).map(entry=>[entry.startSlot,pedals.workshopPedal(entry)]);}
function plain(value){const root=parser.parseWorkshopMusicXmlDocument(value),misc=parser.musicXmlChild(parser.musicXmlChild(root,'identification'),'miscellaneous'),field=parser.musicXmlChildren(misc,'miscellaneous-field').find(item=>item.attrs.name==='notenpfoten-editor-score-v1');return field?value.slice(0,field.start)+value.slice(field.end):value;}
function add(score,id,slot,kind,action,extra={}){const pedal=Object.assign({kind,action,line:true,sign:true,number:1,strength:['stop','discontinue'].includes(action)?0:100},extra),entry={id,type:'pedal',startSlot:slot,value:pedals.workshopPedalValue(pedal),pedal};score.parts[0].measures[0].directions=(score.parts[0].measures[0].directions||[]).concat(entry);return entry;}
function t(locale){return key=>strings[locale][key]||key;}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function text(node){return (node.text||'')+(node.children||[]).map(text).join(' ');}

test('legacy pedals stay valid while rich metadata is bounded and limited to pedal directions',()=>{
  for(const value of ['down','half','up'])assert(model.isValidWorkshopDirection({id:'legacy',type:'pedal',value,startSlot:0},8));
  const score=model.createWorkshopDraft('Pedal').score,entry=add(score,'rich',0,'sostenuto','start',{number:2,placement:'above',abbreviated:true,strength:25.5});assert(model.isValidWorkshopScore(score));
  for(const changes of [{kind:'organ'},{action:'unknown'},{strength:-1},{strength:101},{line:'yes'},{number:0},{number:17},{placement:'left'}])assert(!pedals.isValidWorkshopPedal(Object.assign({},entry.pedal,changes)));
  assert(!model.isValidWorkshopDirection(Object.assign({},entry,{type:'tempo',value:60}),8));
  assert(!model.isValidWorkshopDirection(Object.assign({},entry,{value:'up'}),8));
  assert(!pedals.isValidWorkshopPedal({kind:'soft',action:'start',line:true}));
});

test('damper notation preserves all line actions and exact fractional strength after edited plain XML export',()=>{
  const actions=['start','change','continue','discontinue','resume','stop'];
  const source=xml(actions.map((action,index)=>'<measure number="'+(index+1)+'">'+(index===0?attrs:'')+direction('<pedal type="'+action+'" line="yes" sign="yes" abbreviated="yes" number="3"/>',action==='continue'?'':'<sound damper-pedal="'+(['stop','discontinue'].includes(action)?0:37.5)+'"/>')+note+'</measure>').join(''));
  const result=io.importWorkshopMusicXmlText(source);assert(!result.warnings.includes('unsupported-notation'));assert.deepStrictEqual(marks(result.score).map(entry=>entry.pedal.action),actions);
  assert.strictEqual(marks(result.score)[0].pedal.strength,37.5);result.score.bpm=70;
  const out=io.exportWorkshopMusicXmlText(result.score,{title:result.title}).data,restored=io.importWorkshopMusicXmlText(plain(out));
  assert.deepStrictEqual(semantics(restored.score),semantics(result.score));assert(!restored.warnings.includes('unsupported-notation'));
});

test('numbered sostenuto and damper lines remain independent through their stop markers',()=>{
  const source=xml('<measure>'+attrs+direction('<pedal type="start" line="yes" number="1"/>')+direction('<pedal type="sostenuto" line="yes" sign="yes" number="2"/>')+note
    +direction('<pedal type="stop" line="yes" number="2"/>')+direction('<pedal type="stop" line="yes" number="1"/>')+'</measure>');
  const result=io.importWorkshopMusicXmlText(source);assert(!result.warnings.includes('unsupported-notation'));assert.deepStrictEqual(marks(result.score).map(entry=>entry.pedal.kind),['damper','sostenuto','sostenuto','damper']);
  assert.strictEqual(pedals.workshopPedalText(marks(result.score)[1]),'Sost.');result.score.bpm=80;
  const restored=io.importWorkshopMusicXmlText(plain(io.exportWorkshopMusicXmlText(result.score,{title:result.title}).data));assert.deepStrictEqual(semantics(restored.score),semantics(result.score));
  const resumed=io.importWorkshopMusicXmlText(xml('<measure>'+attrs+direction('<pedal type="sostenuto" line="yes" number="2"/>')+note+direction('<pedal type="discontinue" line="yes" number="2"/>')+direction('<pedal type="resume" line="yes" number="2"/>')+'</measure>'));
  assert.deepStrictEqual(marks(resumed.score).map(entry=>entry.pedal.kind),['sostenuto','sostenuto','sostenuto']);assert.strictEqual(marks(resumed.score)[2].pedal.strength,100);
});

test('una corda and tre corde become editable soft pedal instructions without duplicate text or damper sustain',()=>{
  const source=xml('<measure>'+attrs+direction('<words>una corda</words>','<sound soft-pedal="75"/>')+note+direction('<words>tre corde</words>','<sound soft-pedal="0"/>')+'</measure>');
  const result=io.importWorkshopMusicXmlText(source),entries=marks(result.score);assert.strictEqual(entries.length,2);assert.strictEqual(result.score.parts[0].measures[0].directions.length,2);
  assert.strictEqual(pedals.workshopPedalText(entries[0]),'una corda');assert.strictEqual(pedals.workshopPedalText(entries[1]),'tre corde');
  assert(!model.workshopTimeline(result.score).events.some(event=>event.pedal));result.score.bpm=65;
  assert.deepStrictEqual(semantics(io.importWorkshopMusicXmlText(plain(io.exportWorkshopMusicXmlText(result.score).data)).score),semantics(result.score));
  assert(!result.warnings.includes('unsupported-notation'));
});

test('sound-only channels retain their distinct kinds and preserve non-half damper strengths',()=>{
  const result=io.importWorkshopMusicXmlText(xml('<measure>'+attrs+'<sound damper-pedal="25" sostenuto-pedal="yes" soft-pedal="no"/>'+note+'</measure>'));
  assert(!result.warnings.includes('unsupported-notation'));assert.deepStrictEqual(marks(result.score).map(entry=>pedals.workshopPedal(entry).kind),['damper','sostenuto','soft']);
  assert.strictEqual(pedals.workshopPedal(marks(result.score)[0]).strength,25);
  const timeline=model.workshopTimeline(result.score).events.filter(event=>event.pedalKind);assert.strictEqual(timeline.filter(event=>event.pedal).length,1);
  assert.deepStrictEqual(timeline.map(event=>event.pedalStrength),[25,100,0]);
});

test('damper change releases previous sustain before pressing again; other channels add no note attacks',()=>{
  const score=io.importWorkshopMusicXmlText(xml('<measure>'+attrs+note+'</measure>')).score,before=model.workshopTimeline(score).events.filter(event=>event.value!==null).map(event=>[event.value,event.startMs,event.durationMs]);
  add(score,'change',2,'damper','change');add(score,'sost',3,'sostenuto','start');
  const timeline=model.workshopTimeline(score),change=timeline.events.filter(event=>event.pedalAction==='change');assert.deepStrictEqual(change.map(event=>event.pedal),['up','down']);
  assert.deepStrictEqual(timeline.events.filter(event=>event.value!==null).map(event=>[event.value,event.startMs,event.durationMs]),before);
  assert(!timeline.events.find(event=>event.pedalKind==='sostenuto').pedal);
});

test('pedal line segments span meters and expose release notches and discontinued open ends',()=>{
  const score=model.createWorkshopDraft('Lines',3).score;score.parts[0].measures[1].meter='3/4';score.parts[0].measures[2].meter='4/4';
  add(score,'press',2,'damper','start');
  const change={id:'change',type:'pedal',startSlot:3,value:'down',pedal:{kind:'damper',action:'change',line:true,sign:false,number:1,strength:100}};
  score.parts[0].measures[1].directions=[change];score.parts[0].measures[2].directions=[{id:'release',type:'pedal',startSlot:4,value:'up',pedal:{kind:'damper',action:'discontinue',line:true,sign:false,number:1,strength:0}}];
  const matrix=pedals.workshopPedalDirectionSegments(score,0);assert.strictEqual(matrix.length,3);assert.strictEqual(matrix[0][0].startSlot,2);assert.strictEqual(matrix[0][0].endSlot,8);
  assert.strictEqual(matrix[1].length,2);assert(matrix[1][0].changeEnd);assert(matrix[1][1].changeStart);assert.strictEqual(matrix[1][1].endSlot,6);
  assert(matrix[2][0].continuation);assert.strictEqual(matrix[2][0].endSlot,4);assert.strictEqual(matrix[2][0].endAction,'discontinue');
  assert.deepStrictEqual(pedals.workshopPedalDirectionSegments(score,0,1),matrix[1]);assert(model.isValidWorkshopScore(score));
});

test('pedal editor changes save existing instructions, retain IDs and remove them in both languages',()=>{
  for(const locale of ['de','en']){
    let score=model.createWorkshopDraft('Editor').score;
    const control=new Vue(Object.assign({},controlsDefinition,{propsData:{score,section:'bar',barIndex:0,partIndex:0,selectedEvents:[]},methods:Object.assign({},controlsDefinition.methods,{$t:t(locale)})}));
    control.$on('change',next=>{score=next;control.score=next;});control.directionType='pedal';
    control.setPedalDetails({kind:'sostenuto',action:'start',line:true,sign:true,number:2,strength:100,placement:'below'});control.addDirection();assert(!control.error);
    const entry=marks(score)[0],id=entry.id;assert(control.directionLabel(entry).includes(strings[locale].WORKSHOP_PEDAL_KIND_SOSTENUTO));
    control.editDirection(id);assert.strictEqual(control.pedalDetails.kind,'sostenuto');const saved=JSON.stringify(score);control.setPedalDetails(Object.assign({},control.pedalDraft,{strength:101}));assert(control.error);control.addDirection();assert.strictEqual(JSON.stringify(score),saved,'invalid draft cannot silently save old details');
    control.setPedalDetails(Object.assign({},control.pedalDraft,{action:'change',strength:50}));control.addDirection();assert(!control.error);assert.strictEqual(marks(score)[0].id,id);assert.strictEqual(marks(score)[0].pedal.strength,50);
    const out=control._render();assert(nodes(out).some(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopPedalControls'));
    control.removeDirection(id);assert.strictEqual(marks(score).length,0);control.$destroy();
  }
});

test('pedal detail controls are localized and switching to soft keeps valid readable notation',()=>{
  for(const locale of ['de','en']){
    const value=pedals.workshopPedal({value:'half',pedal:{kind:'sostenuto',action:'change',line:true,sign:true,strength:50}});
    const control=new Vue(Object.assign({},pedalDefinition,{propsData:{value},methods:Object.assign({},pedalDefinition.methods,{$t:t(locale)})}));
    const rendered=text(control._render());for(const key of ['WORKSHOP_PEDAL_KIND','WORKSHOP_PEDAL_ACTION','WORKSHOP_PEDAL_STRENGTH','WORKSHOP_PEDAL_NOT_ASSESSED'])assert(rendered.includes(strings[locale][key]),key);
    let next;control.$on('input',entry=>{next=entry;});control.changeKind('soft');assert(pedals.isValidWorkshopPedal(next));assert.strictEqual(next.action,'start');assert.strictEqual(next.line,false);assert(next.sign);
    control.value=next;assert.deepStrictEqual(control.actions,['start','stop']);control.changeAction('stop');assert.strictEqual(next.strength,0);control.$destroy();
  }
});

test('invalid pedal numbers, types, channels and graphics report bounded import limitations',()=>{
  for(const mark of ['<pedal type="start" number="17"/>','<pedal type="unknown"/>','<pedal type="start" line="maybe"/>']){
    const result=io.importWorkshopMusicXmlText(xml('<measure>'+attrs+direction(mark)+note+'</measure>'));assert(result.warnings.includes('unsupported-notation'));assert(model.isValidWorkshopScore(result.score));
  }
  const graphic=io.importWorkshopMusicXmlText(xml('<measure>'+attrs+direction('<pedal type="start" default-x="14"/>')+note+'</measure>'));assert(graphic.warnings.includes('layout-approximate'));
  const invalid=io.importWorkshopMusicXmlText(xml('<measure>'+attrs+'<sound sostenuto-pedal="101"/>'+note+'</measure>'));assert(invalid.warnings.includes('unsupported-notation'));
});
