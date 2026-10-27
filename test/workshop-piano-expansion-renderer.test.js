const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const root=path.resolve(__dirname,'../src')+path.sep,loader=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>file.startsWith(root)?mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file):loader(mod,file);
Module._extensions['.vue']=mod=>{mod.exports={};};
function component(name){
  const file=path.join(root,'components',name+'.vue'),parsed=compiler.parseComponent(fs.readFileSync(file,'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));require.cache[file]=mod;
  mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);
  return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
}
const staff=component('WorkshopStaff'),listening=component('WorkshopListening'),model=require('../src/model/Workshop');
const {workshopTrillLineSpans}=require('../src/model/WorkshopTrillLines');
const {createWorkshopRenderContext}=require('../src/model/WorkshopRenderContext');
const {createWorkshopPlayback}=require('../src/model/WorkshopPlayback');
const {createWorkshopPracticePlan}=require('../src/model/WorkshopPractice');
const {workshopPedalDirectionSegments}=require('../src/model/WorkshopPedal');
const {workshopAccidentalInk}=require('../src/model/WorkshopAccidentalGlyphs');
const xml=require('../src/model/WorkshopMusicXml');
const cases=[];function test(name,run){cases.push([name,run]);}
function note(id,extra={}){return Object.assign({id,kind:'note',startSlot:0,noteValue:'quarter',pitch:{step:'C',alter:0,octave:4}},extra);}
function fixture(props){return new Vue(Object.assign({},staff,{propsData:Object.assign({measure:{events:[note('n')]}},props),methods:Object.assign({},staff.methods,{$t:key=>key})}));}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function within(view){view.events.forEach(event=>(event.notationMarks||[]).forEach(mark=>{assert(mark.y-20*view.notationScale>=view.geometry.top);assert(mark.y+12*view.notationScale<=view.geometry.top+view.geometry.height);}));}
test('all turn variants and ornament accidentals are visible and included in the frame',()=>{
  for(const ornament of ['trill','delayed-turn','delayed-inverted-turn','vertical-turn','inverted-vertical-turn']){
    for(const alter of [-2,-1.5,-1,-.5,0,.5,1,1.5,2]){
      const measure={events:[note('ornament',{ornament,ornamentAccidentals:{upper:alter,lower:-alter},fingerings:[{value:'1'},{value:'2',alternate:true}]})]},before=JSON.stringify(measure),view=fixture({measure,compact:true});
      const marks=view.events[0].notationMarks;assert.strictEqual(marks.length,3);
      assert(marks.find(mark=>mark.kind===ornament).y<=42);
      marks.forEach(mark=>assert(view.notationMarkPath(view.events[0],mark).length>0));
      if(ornament.includes('vertical')) assert(view.notationMarkTransform(view.events[0],marks[0]).includes('rotate(90'));
      if(ornament.startsWith('delayed')) assert(marks[0].x>view.events[0].x);
      within(view);view._render();view.$destroy();assert.strictEqual(JSON.stringify(measure),before);
    }
  }
});
test('named navigation retains targets and pass labels without clipping long names vertically',()=>{
  const measure={events:[note('n')],navigation:[{kind:'segno',label:'SegnoA'},{kind:'ds',target:'SegnoA',passes:[2,4]},{kind:'coda',label:'Coda'.repeat(16)}]},view=fixture({measure,compact:true});
  const marks=view.navigationMarks;assert.strictEqual(marks[0].text,' SegnoA');assert(marks[1].text.includes('SegnoA'));assert(marks[1].text.includes('2,4'));assert(marks[2].lines.length>1);
  marks.forEach(mark=>{assert(mark.y-30>=view.geometry.top);assert(mark.y+8+Math.max(0,mark.lines.length-1)*18<=view.geometry.top+view.geometry.height);});
  assert(nodes(view._render()).some(node=>node.tag==='tspan'));view.$destroy();
});
test('long mordents remain distinguishable and explicit placement overrides the voice',()=>{
  for(const ornament of ['mordent','inverted-mordent']){
    const view=fixture({measure:{events:[note('long',{ornament,ornamentLong:true,ornamentPlacement:'below',fingerings:[{value:'4',placement:'below'}]})]}});
    const event=view.events[0],mark=event.notationMarks[0];assert(mark.long);assert(mark.y>Math.max(event.y,event.stemEndY));
    assert(view.notationMarkPath(event,mark).length>view.glyph(mark.glyph,event.x-8,mark.y,.9).length);
    assert(event.fingeringMarks[0].y-14>mark.y+12);within(view);view.$destroy();
  }
});
test('navigation clears simultaneous tempo, swing and trill lines above the notes',()=>{
  const measure={events:[note('n',{ornament:'turn',ornamentAccidentals:{upper:1,lower:-1}})],directions:[{id:'tempo',type:'tempo',startSlot:0,value:60},{id:'swing',type:'swing',startSlot:0,value:{first:2,second:1,unit:'eighth'}}],navigation:[{kind:'segno',label:'A'}]},view=fixture({measure,directionSpans:[{id:'trill-line',type:'trillLine',startSlot:0,endSlot:8}]});
  assert(view.navigationMarks[0].y+8<Math.min(...view.directionMarks.map(mark=>mark.minimumY)));
  const lower=view.events[0].notationMarks.find(mark=>mark.kind==='ornament-lower-accidental');assert(lower.y<76);within(view);view.$destroy();
});
test('ornament accidentals clear ledger note heads and stems at small and large practice scales',()=>{
  for(const scale of [.6,1,2,3]) for(const [step,octave,placement] of [['G',5,'above'],['C',4,'below']]) {
    const measure={events:[note('ledger',{pitch:{step,octave,alter:0},ornament:'turn',ornamentPlacement:placement,ornamentAccidentals:{upper:1,lower:-1},fingerings:[{value:'1',placement}]})]},before=JSON.stringify(measure);
    const view=fixture({measure,notationScale:scale,practiceLayout:true,showClef:false,showMeter:false,showKey:false}),event=view.events.find(event=>event.id==='ledger');
    const top=Math.min(event.y-5*scale,event.stemEndY-.85*scale),bottom=Math.max(event.y+5*scale,event.stemEndY+.85*scale);
    const signs=event.notationMarks.filter(mark=>mark.accidental);assert.strictEqual(signs.length,2);
    signs.forEach(mark=>{
      const ink=workshopAccidentalInk(mark,mark.x-3*scale,mark.y,.65*scale);
      if(placement==='above')assert(ink.bottom<=top-4*scale+1e-8,'upper ornament sign overlaps ledger note at '+scale);
      else assert(ink.top>=bottom+4*scale-1e-8,'lower ornament sign overlaps ledger note at '+scale);
    });
    const finger=event.fingeringMarks[0];
    if(placement==='above')assert(finger.y+5*scale<Math.min(...signs.map(mark=>mark.y-20*scale)));
    else assert(finger.y-14*scale>Math.max(...signs.map(mark=>mark.y+12*scale)));
    within(view);view._render();view.$destroy();assert.strictEqual(JSON.stringify(measure),before);
  }
});
test('trill lines connect numbered endpoints across bars and retain intermediate segments',()=>{
  const score=model.createWorkshopDraft('Trill line',3).score;
  score.parts[0].measures[0].events=[note('start',{startSlot:2,ornamentWavy:{type:'start',number:2}})];
  score.parts[0].measures[2].events=[note('stop',{startSlot:4,ornamentWavy:{type:'stop',number:2}})];
  const before=JSON.stringify(score),spans=workshopTrillLineSpans(score,0),context=createWorkshopRenderContext(score);
  assert.strictEqual(spans[0][0].startSlot,2);assert.strictEqual(spans[1][0].startSlot,0);assert.strictEqual(spans[2][0].endSlot,4);
  spans.forEach((list,index)=>{assert.strictEqual(list.length,1);assert(context.directionSpans[0][index].some(span=>span.type==='trillLine'));const view=fixture({measure:context.measure(0,index),directionSpans:context.directionSpans[0][index]});assert(view.directionMarks.some(mark=>mark.type==='trillLine'&&mark.path.includes(' Q ')));view.$destroy();});
  assert.strictEqual(JSON.stringify(score),before);
});
test('octave clefs render their small octave number in the header and at an inline change',()=>{
  for(const clefOctave of [-2,-1,1,2]){
    const view=fixture({clefOctave,measure:{events:[note('n')],contextChanges:[{id:'oct',startSlot:2,clefOctave:-clefOctave}]}});
    const numbers=nodes(view._render()).filter(node=>node.tag==='text'&&node.data&&node.data.attrs&&node.data.attrs['data-clef-octave']);
    assert.strictEqual(numbers.length,2);assert(view.notation.contextChanges[0].hasClef);within(view);view.$destroy();
  }
});
test('effective octave clefs survive bar inheritance and appear in the fixed practice header',()=>{
  const score=model.createWorkshopDraft('Octave clef',2).score;score.parts[0].clefOctave=-1;
  score.parts[0].measures[0].events=[note('a')];score.parts[0].measures[1].events=[note('b')];
  const context=createWorkshopRenderContext(score);assert(context);assert.strictEqual(context.measure(0,1).clefOctave,-1);
  const timeline=createWorkshopPlayback(score,{}).getTimeline(),view=new Vue(Object.assign({},listening,{propsData:{score,timeline,practice:true},mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},listening.methods,{$t:key=>key})}));
  assert.strictEqual(view.fixedContexts[0].context.clefOctave,-1);
  assert(nodes(view._render()).some(node=>node.data&&node.data.attrs&&node.data.attrs['data-clef-octave']===-1));view.$destroy();
});
test('audition embellishments add no mandatory practice attacks or split rolled chords',()=>{
  const score=model.createWorkshopDraft('Written attacks',1).score;
  score.parts[0].measures[0].events=[note('trill',{ornament:'trill'}),note('low',{startSlot:2,arpeggio:'up'}),note('high',{startSlot:2,pitch:{step:'G',alter:0,octave:4},arpeggio:'up'})];
  const audition=createWorkshopPlayback(score,{}).getTimeline(),plan=createWorkshopPracticePlan(score);
  assert(audition.events.filter(event=>Number.isFinite(event.value)).length>3);
  assert.strictEqual(plan.targets.length,2);assert.deepStrictEqual(plan.targets[0].expectedValues,[48]);assert.deepStrictEqual(plan.targets[1].expectedValues,[48,55]);
  const selected=createWorkshopPracticePlan(score,{range:{startBar:0,endBar:0}});assert.deepStrictEqual(selected.targets,plan.targets);
});
test('pedal lines show their channel, change notch and continuation across bars',()=>{
  const score=model.createWorkshopDraft('Pedal lines',2).score;
  score.parts[0].measures[0].events=[note('n')];
  score.parts[0].measures[0].directions=[{id:'pedal-start',type:'pedal',startSlot:0,value:'down',pedal:{kind:'sostenuto',action:'start',line:true,sign:true}},{id:'pedal-change',type:'pedal',startSlot:4,value:'down',pedal:{kind:'sostenuto',action:'change',line:true,sign:false}}];
  score.parts[0].measures[1].directions=[{id:'pedal-stop',type:'pedal',startSlot:4,value:'up',pedal:{kind:'sostenuto',action:'stop',line:true,sign:false}}];
  const first=workshopPedalDirectionSegments(score,0,0),last=workshopPedalDirectionSegments(score,0,1);
  assert(first.some(span=>span.changeEnd));assert(last.some(span=>span.continuation));
  for(const [barIndex,spans] of [[0,first],[1,last]]){
    const view=fixture({measure:score.parts[0].measures[barIndex],directionSpans:spans});
    const marks=view.directionMarks.filter(mark=>mark.type==='pedal');
    assert(marks.some(mark=>mark.path&&mark.pedalKind==='sostenuto'));if(barIndex===0)assert.strictEqual(marks.filter(mark=>mark.text==='Sost.').length,1);
    view.$destroy();
  }
});
test('every pedal channel and strength leaves the same practice targets and timing',()=>{
  const score=model.createWorkshopDraft('No pedal needed',1).score;score.parts[0].measures[0].events=[note('n')];
  const original=createWorkshopPracticePlan(score),signature=plan=>plan.targets.map(target=>({startMs:target.startMs,expectedValues:target.expectedValues}));
  for(const kind of ['damper','sostenuto','soft']){
    score.parts[0].measures[0].directions=[{id:'p',type:'pedal',startSlot:0,value:'half',pedal:{kind,action:'start',strength:25,line:false,sign:true}}];
    const plan=createWorkshopPracticePlan(score);assert.deepStrictEqual(signature(plan),signature(original));assert.strictEqual(plan.durationMs,original.durationMs);
  }
});
test('combined piano imports survive ordinary MusicXML export, notation layout and practice routing',()=>{
  const imported=xml.importWorkshopMusicXmlText(fs.readFileSync(path.join(__dirname,'fixtures/workshop-piano-expansion.musicxml'),'utf8'));
  assert(!imported.warnings.includes('unsupported-notation'));assert.strictEqual(imported.score.parts.length,2);
  const first=imported.score.parts[0].measures[0].events.find(event=>event.ornament);
  assert.strictEqual(first.ornament,'delayed-turn');assert.strictEqual(first.fingerings.length,3);assert.strictEqual(imported.score.parts[0].clefOctave,1);
  const score=model.cloneWorkshop(imported.score);score.parts[0].transpose={chromatic:2,diatonic:1};
  const normalXml=xml.exportWorkshopMusicXmlText(score,{title:'Edited piano'}).data.replace(/<miscellaneous>[\s\S]*?<\/miscellaneous>/g,'');
  const restored=xml.importWorkshopMusicXmlText(normalXml).score;
  assert.strictEqual(restored.parts[0].transpose.chromatic,2);assert.strictEqual(restored.parts[0].clefOctave,1);
  const route=model.workshopPlaybackBarOrder(score);assert.deepStrictEqual(route,[0,1,2,0,1,3]);assert.deepStrictEqual(model.workshopPlaybackBarOrder(restored),route);
  const signature=plan=>plan.targets.map(target=>({bar:target.barIndex,time:Math.round(target.startMs*1000)/1000,notes:target.expectedValues}));
  assert.deepStrictEqual(signature(createWorkshopPracticePlan(restored)),signature(createWorkshopPracticePlan(score)));
  const context=createWorkshopRenderContext(restored);assert(context);
  restored.parts.forEach((part,partIndex)=>part.measures.forEach((measure,barIndex)=>{const view=fixture({measure:context.measure(partIndex,barIndex),directionSpans:context.directionSpans[partIndex][barIndex]});within(view);view._render();view.$destroy();}));
});
test('a chosen bar retains a leading grace prelude without negative times or missing practice notes',()=>{
  const score=model.createWorkshopDraft('Leading grace',2).score;score.bpm=60;
  score.parts[0].measures[0].events=[note('previous',{startSlot:6})];
  score.parts[0].measures[1].events=[note('grace',{grace:true,noteValue:'eighth',graceTiming:{stealPrevious:20},pitch:{step:'D',alter:0,octave:4}}),note('main')];
  const playback=createWorkshopPlayback(score,{}, {barIndex:1,includeBeats:true,expandExpressions:false}).getTimeline(),plan=createWorkshopPracticePlan(score,{range:{startBar:1,endBar:1}});
  const played=playback.events.filter(event=>Number.isFinite(event.value));assert.strictEqual(played[0].id,'grace');assert.strictEqual(played[0].startMs,0);assert.strictEqual(played[1].startMs,200);
  assert.strictEqual(playback.durationMs,4200);assert.strictEqual(playback.beats[0].startMs,200);
  assert.deepStrictEqual(plan.targets.map(target=>[target.startMs,target.expectedValues]),[[0,[50]],[200,[48]]]);assert.strictEqual(plan.durationMs,playback.durationMs);
});
(async()=>{for(const[name,run]of cases){await run();process.stdout.write('✓ '+name+'\n');}process.stdout.write('Workshop piano expansion rendering and practice tests passed.\n');})().catch(error=>{console.error(error.stack);process.exitCode=1;});
