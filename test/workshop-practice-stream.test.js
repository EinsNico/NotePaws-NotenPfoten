const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(sourceRoot))return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
Module._extensions['.vue']=mod=>{mod.exports={};};
function component(name){
  const filename=path.join(sourceRoot,'components',name+'.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));require.cache[filename]=mod;
  mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
  return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
}
const staff=component('WorkshopStaff'),definition=component('WorkshopListening');
const model=require('../src/model/Workshop');
const {createWorkshopPlayback}=require('../src/model/WorkshopPlayback');
const mapping=require('../src/model/WorkshopStreamPosition');
const {workshopStreamContextsAtX}=require('../src/model/WorkshopStreamContext');
const {workshopKeySignature}=require('../src/model/WorkshopTonality');
const {importWorkshopMusicXmlText}=require('../src/model/WorkshopMusicXml');
const {createWorkshopSheetSystems}=require('../src/components/WorkshopSheetLayout');
function note(id,startSlot=0,pitch={step:'C',alter:0,octave:4},extra={}){
  return Object.assign({id,kind:'note',noteValue:'quarter',startSlot,pitch},extra);
}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function plain(value){return JSON.parse(JSON.stringify(value));}
function fixture(score,extra={},display={practiceNoteZoom:1,practiceZoom:1,practiceContextZoom:1},responsive=false){
  assert(model.isValidWorkshopScore(score));
  const timeline=createWorkshopPlayback(score,{}).getTimeline();
  const view=new Vue(Object.assign({},definition,{mounted:undefined,beforeDestroy:undefined,data(){return Object.assign({},definition.data.call(this),display);},propsData:Object.assign({score,timeline,practice:true},extra),
    components:{WorkshopStaff:staff},computed:Object.assign({},definition.computed,responsive ? {} : {practiceResponsiveScale:()=>1}),
    methods:Object.assign({},definition.methods,{$t:(key,values)=>key+(values?JSON.stringify(values):'')})}));
  view.$refs.viewport={clientWidth:390};view.updateWidth();
  return {view,timeline,destroy:()=>view.$destroy()};
}
function rowAt(view,partIndex=0){return view.fixedContexts.find(entry=>entry.partIndex===partIndex);}
function contextAtX(view,x,partIndex=0){return workshopStreamContextsAtX(view.contexts,x).find(entry=>entry.partIndex===partIndex).context;}
function children(view){return nodes(view._render()).filter(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff');}
function renderStaff(props){return new Vue(Object.assign({},staff,{mounted:undefined,beforeDestroy:undefined,propsData:props,methods:Object.assign({},staff.methods,{$t:key=>key})}));}
function state(entry){return {clef:entry.context.clef,keyId:entry.context.keyId,meter:entry.context.meter};}
const tests=[];function test(name,run){tests.push([name,run]);}

test('a calibrated 100 percent note profile has readable 28 by 20 px heads and a fixed clipped header',()=>{
  const score=model.createWorkshopDraft('Phone').score;score.parts[0].measures[0].events=[note('phone')];
  const f=fixture(score),view=f.view;
  assert.strictEqual(view.scale,1);assert.strictEqual(view.logicalWidth,390);
  const rendered=nodes(view._render()),svg=rendered.find(node=>node.tag==='svg'&&node.data.staticClass==='listening-score');
  assert.strictEqual(svg.data.attrs.viewBox,'0 0 390 '+view.system.height);
  assert.strictEqual(svg.data.style.height,view.system.height+'px');
  const clip=rendered.find(node=>node.tag==='clipPath');assert.strictEqual(clip.data.attrs.id,view.clipId);
  const rect=nodes(clip).find(node=>node.tag==='rect');assert.strictEqual(rect.data.attrs.x,view.anchor-view.noteClipInset);
  const noteWindow=rendered.find(node=>node.tag==='g'&&node.data&&node.data.attrs&&node.data.attrs['clip-path']==='url(#'+view.streamClipId+')');
  assert(noteWindow);assert(nodes(noteWindow).some(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff'));
  assert(!nodes(noteWindow).some(node=>node.data&&node.data.staticClass==='fixed-context'));
  assert(rendered.some(node=>node.data&&node.data.staticClass==='fixed-context'));
  const firstHead=view.layout.bars[0].parts[0].notation.events.find(event=>event.id==='phone');
  assert.strictEqual(view.layout.bars[0].x+firstHead.x+view.translation,view.anchor);
  assert(view.anchor-16>rect.data.attrs.x,'current normal notehead must fit inside the clip');
  const child=children(view)[0],props=child.componentOptions.propsData;
  assert(props.readOnly&&props.compact);assert.strictEqual(props.showClef,false);assert.strictEqual(props.showKey,false);
  assert.strictEqual(props.showMeter,false);assert.strictEqual(props.showContextChanges,false);
  const practiceStaff=renderStaff(props),sourceStaff=renderStaff(Object.assign({},props,{notationScale:1,showClef:true,showKey:true,showMeter:true,showContextChanges:true}));
  const shape=instance=>{
    const drawn=nodes(instance._render()),head=drawn.find(node=>node.tag==='ellipse'&&node.data.staticClass==='note-head');
    const lines=drawn.filter(node=>node.tag==='line'&&node.data.staticClass==='staff-line'&&node.data.attrs.y1===node.data.attrs.y2);
    return {rx:head.data.attrs.rx,ry:head.data.attrs.ry,spacing:lines[1].data.attrs.y1-lines[0].data.attrs.y1};
  };
  assert.deepStrictEqual(shape(practiceStaff),{rx:14,ry:10,spacing:20});
  assert.deepStrictEqual({width:shape(practiceStaff).rx*2*view.scale,height:shape(practiceStaff).ry*2*view.scale,gap:shape(practiceStaff).spacing*view.scale},{width:28,height:20,gap:20});
  assert.deepStrictEqual(shape(sourceStaff),{rx:7,ry:5,spacing:20});
  assert.strictEqual(props.notationScale,2);
  const stem=practiceStaff.stems.find(item=>item.eventIds.includes('phone'));
  assert.strictEqual(Math.abs(stem.y1-stem.y2),76);
  practiceStaff.$destroy();sourceStaff.$destroy();f.destroy();
});

test('practice automatically fits narrow viewports while preserving accepted proportions, cached engraving and performance without size controls',async()=>{
  const score=model.createWorkshopDraft('Responsive practice size',2).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('zoom-'+index)];});
  const before=JSON.stringify(score),f=fixture(score,{playing:true,activeEventIds:['zoom-1']},{},true),view=f.view;
  view.position=f.timeline.measures[1].startMs;
  const position=view.position,active=view.activeEventIds,timeline=view.timeline,timelineBefore=JSON.stringify(timeline),duration=view.duration;
  const assertNoSizeControls=()=>{
    const rendered=nodes(view._render());
    assert(!rendered.some(node=>node.data&&node.data.staticClass==='practice-appearance'),'appearance settings are removed');
    assert(!rendered.some(node=>node.data&&node.data.attrs&&node.data.attrs['data-practice-size']),'no adjustable size control remains');
    assert.strictEqual(rendered.filter(node=>node.tag==='input'&&node.data&&node.data.attrs&&node.data.attrs.type==='range').length,1,'only the musical position slider remains');
  };
  const physical=()=>{
    const calls=[],original=view.glyph;view.glyph=(...args)=>{calls.push(args);return '';};
    view.clefPath('treble',16);view.signaturePath({step:'F',alter:1,octave:5},'treble',54);view.glyph=original;
    const child=renderStaff(children(view)[0].componentOptions.propsData),drawn=nodes(child._render());
    const head=drawn.find(node=>node.tag==='ellipse'&&node.data.staticClass==='note-head');
    const lines=drawn.filter(node=>node.tag==='line'&&node.data.staticClass==='staff-line');
    const result={headWidth:head.data.attrs.rx*2*view.scale,headHeight:head.data.attrs.ry*2*view.scale,
      staffGap:(lines[1].data.attrs.y1-lines[0].data.attrs.y1)*view.scale,
      clefScale:calls[0][3]*view.scale,signatureScale:calls[1][3]*view.scale,
      meterFont:parseFloat(view.contextMeterStyle.fontSize)*view.scale};child.$destroy();return result;
  };
  const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,actual+' differs from '+expected);
  assert.deepStrictEqual([view.practiceNoteZoom,view.practiceZoom,view.practiceContextZoom],[.65,.7,.95]);
  const defaults=physical();
  Object.entries({headWidth:18.2,headHeight:13,staffGap:14,clefScale:1.805,signatureScale:1.615,meterFont:30.4}).forEach(([key,value])=>near(defaults[key],value));
  assert.strictEqual(view.scale,.7);assert.strictEqual(view.logicalWidth,390/.7);
  assertNoSizeControls();
  for(const name of ['setPracticeZoom','setPracticeNoteZoom','setPracticeContextZoom','previewPracticeOverallZoom','setPracticeOverallZoom','practiceOverallZoom','practiceOverallDraft','practiceSizeValue'])assert.strictEqual(typeof view[name],'undefined');
  const engraving=view._engraving,system=view.sourceSystem,layout=view.layout,contexts=view.contexts,revision=view.engravingRevision;
  const notationScale=view.notationScale,contextScale=view.contextScale;
  for(const [width,factor] of [[200,.8],[260,.8],[330,330/390],[390,1],[540,1],[900,1]]){
    view.$refs.viewport.clientWidth=width;view.updateWidth();await Vue.nextTick();
    const current=physical();
    assert.strictEqual(view.availableWidth,width,'real field width is retained even below 240px');
    assert.strictEqual(view.practiceResponsiveScale,factor);
    Object.keys(defaults).forEach(key=>near(current[key],defaults[key]*factor));
    assert.deepStrictEqual([view.practiceNoteZoom,view.practiceZoom,view.practiceContextZoom],[.65,.7,.95]);
    assert.strictEqual(view.scale,.7*factor,'responsive scaling applies after the fixed proportions');
    assert.strictEqual(view.logicalWidth,width/view.scale);
    assert.strictEqual(view.notationScale,notationScale);assert.strictEqual(view.contextScale,contextScale);
    assert.strictEqual(view._engraving,engraving,'viewport resizing changes the outer SVG size without rebuilding notation');
    assert.strictEqual(view.sourceSystem,system);assert.strictEqual(view.layout,layout);assert.strictEqual(view.contexts,contexts);assert.strictEqual(view.engravingRevision,revision);
    assert.strictEqual(view.position,position);assert.strictEqual(view.playing,true);assert.strictEqual(view.activeEventIds,active);assert.strictEqual(view.timeline,timeline);
    assert.strictEqual(view.duration,duration);assert.strictEqual(JSON.stringify(timeline),timelineBefore);assert.strictEqual(JSON.stringify(score),before);
    assertNoSizeControls();
    const svg=nodes(view._render()).find(node=>node.tag==='svg'&&node.data.staticClass==='listening-score');
    assert.strictEqual(svg.data.style.height,view.system.height*view.scale+'px');
  }
  const summary=nodes(view._render()).filter(node=>node.text).map(node=>node.text).join(' ');
  assert(!summary.includes('WORKSHOP_OVERALL_SIZE_HINT'));assert(!summary.includes('WORKSHOP_SIZE_VALUES'));
  view.practice=false;await Vue.nextTick();assert.strictEqual(view.scale,.9);assertNoSizeControls();
  view.$refs.viewport.clientWidth=260;view.updateWidth();await Vue.nextTick();assert.strictEqual(view.scale,.75,'normal listening keeps its existing compact scale');
  assert.strictEqual(view.notationScale,1);assert.strictEqual(view.contextScale,1);
  assert.strictEqual(JSON.stringify(score),before);f.destroy();
  const reopened=fixture(score,{},{},true);assert.deepStrictEqual([reopened.view.practiceNoteZoom,reopened.view.practiceZoom,reopened.view.practiceContextZoom,reopened.view.practiceResponsiveScale],[.65,.7,.95,1]);reopened.destroy();
});

test('viewport measurement ignores hidden or invalid widths and safely ends scrubbing only when its coordinate system changes',async()=>{
  const score=model.createWorkshopDraft('Safe responsive measurement').score,before=JSON.stringify(score);
  const f=fixture(score,{},{},true),view=f.view,emitted=[];
  view.position=1200;view.$on('scrub-end',payload=>emitted.push(payload));
  const timelineBefore=JSON.stringify(view.timeline),engraving=view._engraving;
  try{
    const drag={position:2200,resume:true};view.drag=drag;
    for(const width of [0,-1,NaN,Infinity,undefined,'260',390]){
      view.$refs.viewport.clientWidth=width;view.updateWidth();await Vue.nextTick();
      assert.strictEqual(view.availableWidth,390);assert.strictEqual(view.scale,.7);
      assert.strictEqual(view.drag,drag,'hidden, invalid and unchanged fields leave the active scrub intact');assert.strictEqual(emitted.length,0);
    }
    view.busy=true;view.$refs.viewport.clientWidth=260;view.updateWidth();await Vue.nextTick();
    assert.strictEqual(view.availableWidth,260);assert.strictEqual(view.scale,.7*.8);assert.strictEqual(view.drag,null);
    assert.deepStrictEqual(emitted,[{position:1200,resume:true}],'a resize cancels the tentative seek and preserves its resume state');
    view.busy=false;view.drag={position:2400,resume:false};view.$refs.viewport.clientWidth=540;view.updateWidth();await Vue.nextTick();
    assert.strictEqual(view.availableWidth,540);assert.strictEqual(view.scale,.7);assert.strictEqual(view.drag,null);
    assert.deepStrictEqual(emitted[1],{position:1200,resume:false},'a paused scrub remains paused after resizing');
    assert.strictEqual(view.position,1200);assert.strictEqual(view._engraving,engraving);
    assert.strictEqual(JSON.stringify(score),before);assert.strictEqual(JSON.stringify(view.timeline),timelineBefore);
    assert.deepStrictEqual([view.practiceNoteZoom,view.practiceZoom,view.practiceContextZoom],[.65,.7,.95]);
  }finally{f.destroy();}
});

test('the demo practice system removes unused vertical reserves while keeping note size, source score and a stable frame',()=>{
  const score=importWorkshopMusicXmlText(require('../src/resources/demo-pieces/la-candeur.musicxml.json')).score;
  const before=JSON.stringify(score),f=fixture(score),view=f.view;
  const original=createWorkshopSheetSystems({score,scoreLayout:{},pageRanges:[{start:0,end:score.parts[0].measures.length}],pageIndex:0,
    barsPerSystem:score.parts[0].measures.length,activeParts:score.parts.map((part,index)=>({part,index})),continuous:true,notationScale:2})[0];
  assert.strictEqual(original.height,676,'default sheet/listening layout is unchanged');
  assert(view.system.height<original.height*.85,'practice removes at least 15 percent of unused height');
  assert.strictEqual(view.scale,1);assert.strictEqual(view.notationScale,2);
  assert(view.system.height*view.scale<600,'both demo staves fit below 600 display pixels by default');
  const system=view.system,frames=plain(system.frames);
  for(const bar of f.timeline.measures){
    view.position=bar.startMs;
    assert.strictEqual(view.system,system);assert.deepStrictEqual(plain(view.system.frames),frames,'rows do not jump as playback advances');
    children(view).forEach(node=>{
      const props=node.componentOptions.propsData;assert.strictEqual(props.practiceLayout,true);
      const child=renderStaff(props),head=nodes(child._render()).find(item=>item.tag==='ellipse'&&item.data.staticClass==='note-head');
      if(head){assert.strictEqual(head.data.attrs.rx,14);assert.strictEqual(head.data.attrs.ry,10);}
      child.$destroy();
    });
  }
  assert.strictEqual(JSON.stringify(score),before);f.destroy();
});

test('tighter practice bounds keep real flags, enclosed accidentals, lyrics, pedal and expression marks visible',()=>{
  const accidental=require('../src/model/WorkshopAccidentalGlyphs');
  const variations=[
    [note('whole',0,{step:'G',alter:0,octave:5},{noteValue:'whole'})],
    [note('breve',0,{step:'G',alter:0,octave:6},{noteValue:'breve'})],
    [note('flag',0,{step:'G',alter:0,octave:5},{noteValue:'sixtyfourth'})],
    [note('beam-a',0,{step:'G',alter:0,octave:5},{noteValue:'eighth',beamGroupId:'beam'}),note('beam-b',1,{step:'F',alter:0,octave:5},{noteValue:'eighth',beamGroupId:'beam'})],
    [note('symbols',0,{step:'F',alter:1,octave:4},{dots:1,articulations:['accent'],ornament:'trill',fingering:3,pedal:'down',lyric:'Music',accidentalDisplay:{force:true,enclosure:'bracket'}})],
    [note('arp-low',0,{step:'G',alter:0,octave:5},{noteValue:'whole',arpeggio:'up'}),note('arp-high',0,{step:'A',alter:0,octave:6},{noteValue:'whole'})],
    [0,1,2].map(index=>note('triplet-'+index,index*2/3,{step:'C',alter:0,octave:5},{noteValue:'eighth',tuplet:3,tupletGroupId:'triplet'})),
    [note('low',0,model.workshopPitchFromValue(9)),note('high',2,model.workshopPitchFromValue(96))]
  ];
  for(const events of variations){
    const props={measure:{meter:'32/1',events},notationScale:2,practiceLayout:true,readOnly:true,compact:true,clef:'treble',showClef:false,showKey:false,showMeter:false};
    const child=renderStaff(props),normal=renderStaff(Object.assign({},props,{practiceLayout:false}));
    const {top,height}=child.geometry,bottom=top+height;
    for(const event of child.events.filter(event=>event.pitch)){
      assert(event.y-16>=top&&event.y+16<=bottom,event.id+' notehead is clipped');
      if(event.noteValue === 'breve')assert(event.y-20>=top&&event.y+20<=bottom,'breve side strokes are clipped');
      if(event.accidental){const ink=accidental.workshopAccidentalInk(event,event.accidentalX,event.y,1.7);assert(ink.top>=top&&ink.bottom<=bottom,'accidental enclosure is clipped');}
      if(event.fingering)assert(event.fingeringY-28>=top&&event.fingeringY+10<=bottom);
      if(event.displayLyrics.length)assert(event.lyricY-28>=top&&event.lyricY+12<=bottom);
      if(event.pedal)assert(event.pedalY-30>=top&&event.pedalY+12<=bottom);
      (event.expressionMarks||[]).forEach(mark=>assert(mark.y-10>=top&&mark.y+10<=bottom));
      (event.notationMarks||[]).forEach(mark=>assert(mark.y-40>=top&&mark.y+24<=bottom));
    }
    for(const stem of child.stems.filter(item=>!['whole','breve'].includes(item.noteValue))){
      assert(Math.min(stem.y1,stem.y2)>=top&&Math.max(stem.y1,stem.y2)<=bottom);
      if(!stem.beamed&&child.flagCount(stem.noteValue)){const end=stem.y2+stem.direction*(20+child.flagCount(stem.noteValue)*8)*2;assert(end>=top&&end<=bottom,'real flag is clipped');}
    }
    const rendered=nodes(child._render());
    child.arpeggios.forEach(mark=>assert(mark.minimumY>=top&&mark.maximumY<=bottom,'arpeggio or arrow is clipped'));
    child.tuplets.forEach(mark=>assert(mark.y-34>=top&&mark.y+24<=bottom,'tuplet is clipped'));
    if(['whole','breve','beam-a'].includes(events[0].id)){
      assert(!rendered.some(node=>node.data&&node.data.staticClass==='flag'));
      assert(child.geometry.height<normal.geometry.height,'unpainted stems or flags must not reserve height');
    }
    assert(child.dynamicY-44>=Math.max(...child.events.filter(event=>event.pitch).map(event=>event.y+12)),'dynamic text clears noteheads');
    child.$destroy();normal.$destroy();
  }
});

test('a compact fixed header retains physical clef, key and meter size while the staff alone is zoomed',async()=>{
  const score=model.createWorkshopDraft('Tall narrow header').score;score.keyId='C-sharp-major';
  score.parts[0].measures[0].events=[note('narrow-sign',0,{step:'F',alter:0,octave:4},{accidentalDisplay:{force:true,enclosure:'bracket'}})];
  const f=fixture(score),view=f.view;view.$refs.viewport.clientWidth=300;view.updateWidth();
  for(const zoom of [1,1.5,2]){
    view.practiceZoom=zoom;await Vue.nextTick();assert(view.headerFit<1);
    assert(view.anchor+16<view.logicalWidth,'current head remains fully visible');
    const calls=[],original=view.glyph;view.glyph=(...args)=>{calls.push(args);return '';};
    view.clefPath('treble',16*view.headerFit,view.headerFit);
    view.signaturePath({step:'F',alter:1,octave:4},'treble',54*view.headerFit,view.headerFit);
    view.glyph=original;
    assert.strictEqual(calls[0][3],1.9/zoom);assert.strictEqual(calls[0][4],1.9/zoom*view.headerFit);
    assert.strictEqual(calls[1][3],1.7/zoom);assert.strictEqual(calls[1][4],1.7/zoom*view.headerFit);
    const rendered=nodes(view._render()),meter=rendered.find(node=>node.tag==='text'&&node.data.staticClass==='context-meter');
    assert.strictEqual(parseFloat(meter.data.style.fontSize),32/zoom,'meter compensates staff zoom to retain physical font size');
    assert(rendered.some(node=>node.tag==='g'&&node.data&&node.data.attrs&&node.data.attrs.transform==='translate('+view.meterDock+' 0) scale('+view.headerFit+' 1)'));
  }
  f.destroy();
});

test('practice scales rests, accidentals, dots and articulations while preview and source retain their editor profile',async()=>{
  const score=model.createWorkshopDraft('Readable symbols').score;
  score.parts[0].measures[0].events=[note('sharp',0,{step:'F',alter:1,octave:4},{noteValue:'eighth',dots:1,articulations:['accent'],ornament:'trill',fingering:2}),
    {id:'rest',kind:'rest',pitch:null,noteValue:'sixteenth',startSlot:4}];
  const before=JSON.stringify(score),f=fixture(score),view=f.view;
  const props=children(view)[0].componentOptions.propsData,large=renderStaff(props),small=renderStaff(Object.assign({},props,{notationScale:1}));
  const a=large.events.find(event=>event.id==='sharp'),b=small.events.find(event=>event.id==='sharp');
  const accidental=require('../src/model/WorkshopAccidentalGlyphs');
  assert.strictEqual(large.accidentalPath(a),accidental.workshopAccidentalPath(a,a.accidentalX,a.y,1.7));
  const rendered=nodes(large._render());
  const expected=large.glyph('rests.16th',large.events.find(event=>event.id==='rest').x-8,large.events.find(event=>event.id==='rest').y,2.2);
  const tokens=value=>value.match(/[a-df-zA-DF-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g);
  const equivalent=value=>{const actual=tokens(value),reference=tokens(expected);return actual.length===reference.length&&actual.every((token,index)=>
    Number.isFinite(Number(token)) ? Math.abs(Number(token)-Number(reference[index]))<1e-7 : token===reference[index]);};
  const rest=rendered.find(node=>node.tag==='path'&&node.data.staticClass==='symbol'&&equivalent(node.data.attrs.d));
  assert(rest,'written rest uses the same full-size profile');
  const dot=rendered.find(node=>node.tag==='circle'&&node.data.staticClass==='augmentation-dot');assert.strictEqual(dot.data.attrs.r,4);
  const mark=rendered.find(node=>node.data&&node.data.staticClass==='symbol expression-mark');assert(mark.data.attrs.transform.includes('scale(2)'));
  assert(a.fingeringY<a.stemEndY-24,'larger written annotations clear the longer stem');
  assert(a.dotX-a.x>=26);assert.strictEqual(b.dotX-b.x,13);
  view.practice=false;await Vue.nextTick();assert.strictEqual(children(view)[0].componentOptions.propsData.notationScale,1);
  assert.strictEqual(view.sourceSystem.bars[0].parts[0].notation.notationScale,undefined);
  assert.strictEqual(JSON.stringify(score),before);
  large.$destroy();small.$destroy();f.destroy();
});

test('bar and in-bar contexts switch at their written heads and backward seeks restore the earlier fixed header',()=>{
  const score=model.createWorkshopDraft('Context',3).score;
  score.parts[0].measures[0].events=[note('first',0),note('after-change',4)];
  score.parts[0].measures[0].contextChanges=[{id:'inside',startSlot:4,clef:'alto',keyId:'G-major'}];
  score.parts[0].measures[1].events=[note('next',0)];score.parts[0].measures[1].meter='3/4';
  score.parts[0].measures[1].clef='bass';score.parts[0].measures[1].keyId='D-major';
  score.parts[0].measures[2].events=[note('last',0)];
  const f=fixture(score),view=f.view,change=view.contexts.changes.find(entry=>entry.context.clef==='alto');
  assert.deepStrictEqual(state({context:contextAtX(view,change.applyX-.001)}),{clef:'treble',keyId:'C-major',meter:'4/4'});
  assert.deepStrictEqual(state({context:contextAtX(view,change.applyX)}),{clef:'alto',keyId:'G-major',meter:'4/4'});
  const changedEvent=f.timeline.events.find(event=>event.id==='after-change');view.position=changedEvent.startMs;
  assert.deepStrictEqual(state(rowAt(view)),{clef:'alto',keyId:'G-major',meter:'4/4'});
  view.position=f.timeline.measures[1].startMs;
  assert.deepStrictEqual(state(rowAt(view)),{clef:'bass',keyId:'D-major',meter:'3/4'});
  const fixed=nodes(view._render()).find(node=>node.data&&node.data.attrs&&node.data.attrs['data-fixed-staff']===0);
  assert.deepStrictEqual([fixed.data.attrs['data-clef'],fixed.data.attrs['data-key'],fixed.data.attrs['data-meter']],['bass','D-major','3/4']);
  view.position=0;assert.deepStrictEqual(state(rowAt(view)),{clef:'treble',keyId:'C-major',meter:'4/4'});f.destroy();
});

test('all independent size combinations retain in-bar and later context changes, both hands and backward seeking',async()=>{
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Resized context changes',3).score,true);
  score.parts[0].measures[0].events=[note('upper-initial',0),note('upper-change',4,{step:'G',alter:0,octave:4})];
  score.parts[0].measures[0].contextChanges=[{id:'upper-context-change',startSlot:4,clef:'alto',keyId:'G-major'}];
  score.parts[1].measures[0].events=[note('lower-initial',0,{step:'C',alter:0,octave:3})];
  score.parts.forEach((part,index)=>{
    part.measures[1].events=[note('resized-next-'+index,0,{step:'C',alter:1,octave:index===0 ? 4 : 3})];
    part.measures[1].meter='12/8';part.measures[1].keyId='C-sharp-major';part.measures[1].clef=index===0 ? 'bass' : 'treble';
    part.measures[2].events=[note('resized-last-'+index,0,{step:'G',alter:0,octave:index===0 ? 4 : 3})];
  });
  const before=JSON.stringify(score),f=fixture(score,{},{}),view=f.view,timeline=view.timeline;
  const changedTime=f.timeline.events.find(event=>event.id==='upper-change').startMs;
  for(const [staffZoom,noteZoom,contextZoom] of [[.5,.5,1.5],[2,1.5,.5],[.9,.8,1.05]]){
    Object.assign(view,{practiceZoom:staffZoom,practiceNoteZoom:noteZoom,practiceContextZoom:contextZoom});await Vue.nextTick();
    assert.strictEqual(view.timeline,timeline);assert.strictEqual(view.duration,timeline.durationMs);
    view.position=changedTime;
    assert.deepStrictEqual(state(rowAt(view)),{clef:'alto',keyId:'G-major',meter:'4/4'});
    assert.deepStrictEqual(state(rowAt(view,1)),{clef:'bass',keyId:'C-major',meter:'4/4'});
    view.position=f.timeline.measures[1].startMs;
    assert.deepStrictEqual(state(rowAt(view)),{clef:'bass',keyId:'C-sharp-major',meter:'12/8'});
    assert.deepStrictEqual(state(rowAt(view,1)),{clef:'treble',keyId:'C-sharp-major',meter:'12/8'});
    const rows=nodes(view._render()).filter(node=>node.data&&node.data.attrs&&Object.prototype.hasOwnProperty.call(node.data.attrs,'data-fixed-staff'));
    assert.strictEqual(rows.length,2);assert.notStrictEqual(rows[0].data.attrs.transform,rows[1].data.attrs.transform);
    assert(rows.every(row=>nodes(row).filter(node=>node.tag==='text'&&node.data.staticClass==='context-meter').every(node=>
      Math.abs(parseFloat(node.data.style.fontSize)*view.scale-32*contextZoom)<1e-8)),'all fixed meter signs use the independent physical context size');
    const engraving=view._engraving;view.position=0;
    assert.deepStrictEqual(state(rowAt(view)),{clef:'treble',keyId:'C-major',meter:'4/4'});
    assert(view.contexts.changes.some(change=>change.context.clef==='alto'),'in-bar change remains in the seekable stream');
    assert.strictEqual(view._engraving,engraving,'seeking only updates the visible context, never engraving');
    assert.strictEqual(JSON.stringify(score),before);
  }
  f.destroy();
});

test('large in-bar clef and key signs reserve horizontal space separately from note size',async()=>{
  const score=model.createWorkshopDraft('Context clearance').score;
  score.parts[0].measures[0].events=[note('before-context',0,{step:'G',alter:0,octave:4}),note('after-context',2,{step:'C',alter:1,octave:3}),note('later-context',6,{step:'E',alter:1,octave:3})];
  score.parts[0].measures[0].contextChanges=[{id:'wide-in-bar',startSlot:2,clef:'bass',keyId:'C-sharp-major'}];
  const f=fixture(score,{},{}),view=f.view,glyphs=require('abcjs/src/write/creation/glyphs');
  for(const [staffZoom,noteZoom,contextZoom] of [[.5,.5,1.5],[2,1.5,.5],[1,.75,1.35]]){
    Object.assign(view,{practiceZoom:staffZoom,practiceNoteZoom:noteZoom,practiceContextZoom:contextZoom});await Vue.nextTick();
    const bar=view.layout.bars[0],notation=bar.parts[0].notation,change=view.contexts.changes.find(entry=>entry.context.keyId==='C-sharp-major');
    const head=notation.events.find(event=>event.id==='after-context'),signature=view.movingSignature(change);
    assert.strictEqual(signature.length,7);
    const clefRight=change.clefX+glyphs.getSymbolWidth('clefs.F')*1.9*view.contextScale;
    const keyRight=change.keyX+(signature.length-1)*view.signatureStep+glyphs.getSymbolWidth('accidentals.sharp')*1.7*view.contextScale;
    assert(clefRight<change.keyX,'large clef clears the first key sign');
    assert(keyRight<bar.x+head.x-7*view.notationScale,'last key sign clears the following notehead');
    assert.strictEqual(change.applyX,bar.x+head.x,'the independently resized change still docks at its written note');
  }
  f.destroy();
});

test('a large clef-only in-bar change clears its repeated existing sharp or flat key before small notes',async()=>{
  const glyphs=require('abcjs/src/write/creation/glyphs');
  for(const keyId of ['G-major','D-flat-major']){
    const score=model.createWorkshopDraft('Repeated signature '+keyId).score;score.keyId=keyId;
    score.parts[0].measures[0].events=[note('clef-only-before',0,{step:'G',alter:0,octave:4}),note('clef-only-after',2,{step:'C',alter:0,octave:3})];
    score.parts[0].measures[0].contextChanges=[{id:'clef-only-wide',startSlot:2,clef:'bass'}];
    const before=JSON.stringify(score),f=fixture(score,{},{}),view=f.view;
    Object.assign(view,{practiceZoom:.5,practiceNoteZoom:.5,practiceContextZoom:1.5});await Vue.nextTick();
    const bar=view.layout.bars[0],notation=bar.parts[0].notation,change=view.contexts.changes.find(entry=>entry.context.clef==='bass');
    assert.deepStrictEqual(change.fields,['clef']);assert.strictEqual(change.context.keyId,keyId);
    const signature=view.movingSignature(change),written=notation.contextChanges.find(entry=>entry.id==='clef-only-wide');
    assert.deepStrictEqual(plain(signature),plain(workshopKeySignature(keyId,'bass')));
    assert.deepStrictEqual(plain(written.signature),plain(signature),'the raw layout reserves the signature that the moving header actually paints');
    const clefRight=change.clefX+glyphs.getSymbolWidth('clefs.F')*1.9*view.contextScale;
    const last=signature[signature.length-1],keyRight=change.keyX+(signature.length-1)*view.signatureStep+
      glyphs.getSymbolWidth(last.alter>0 ? 'accidentals.sharp' : 'accidentals.flat')*1.7*view.contextScale;
    assert(clefRight<change.keyX,'repeated signature clears the independently enlarged clef');
    const head=notation.events.find(event=>event.id==='clef-only-after'),headLeft=bar.x+head.x-7*view.notationScale;
    assert(keyRight<headLeft,'repeated signature clears the following small note');
    view.position=f.timeline.events.find(event=>event.id==='clef-only-after').startMs;
    assert.deepStrictEqual(state(rowAt(view)),{clef:'bass',keyId,meter:'4/4'});
    assert.strictEqual(JSON.stringify(score),before);f.destroy();
  }
});

test('repeat occurrences reset the fixed context and remain independently seekable in both directions',()=>{
  const score=model.createWorkshopDraft('Repeat reset',2).score;
  score.parts[0].measures[0].events=[note('opening')];score.parts[0].measures[0].repeatStart=true;
  score.parts[0].measures[1].events=[note('changed')];score.parts[0].measures[1].repeatEnd=2;
  score.parts[0].measures[1].clef='bass';score.parts[0].measures[1].keyId='F-major';score.parts[0].measures[1].meter='3/4';
  const f=fixture(score),view=f.view;
  assert.deepStrictEqual(view.layout.bars.map(bar=>bar.index),[0,1,0,1]);
  for(const [index,expected] of [[1,['bass','F-major','3/4']],[2,['treble','C-major','4/4']],[3,['bass','F-major','3/4']],[0,['treble','C-major','4/4']]]){
    view.position=f.timeline.measures[index].startMs;const entry=rowAt(view);
    assert.deepStrictEqual([entry.context.clef,entry.context.keyId,entry.context.meter],expected);
    assert.strictEqual(view.currentMeasure.measureIndex,index);
  }
  const entries=view.contexts.rows[0].entries;assert(entries.every((entry,index)=>!index||entry.applyX>entries[index-1].applyX));f.destroy();
});

test('empty bars and explicit rest bars retain their context changes without requiring pitched notes',()=>{
  const score=model.createWorkshopDraft('Rest context',3).score;
  score.parts[0].measures[0].events=[note('before-rest')];
  score.parts[0].measures[1].keyId='G-major';score.parts[0].measures[1].clef='alto';
  score.parts[0].measures[2].meter='3/4';score.parts[0].measures[2].clef='bass';
  score.parts[0].measures[2].events=[{id:'written-rest',kind:'rest',pitch:null,noteValue:'half',startSlot:0}];
  const f=fixture(score),view=f.view;
  view.position=f.timeline.measures[1].startMs;
  assert.deepStrictEqual(state(rowAt(view)),{clef:'alto',keyId:'G-major',meter:'4/4'});
  view.position=f.timeline.measures[2].startMs;
  assert.deepStrictEqual(state(rowAt(view)),{clef:'bass',keyId:'G-major',meter:'3/4'});
  assert(children(view).some(node=>node.componentOptions.propsData.measure.events.some(event=>event.id==='written-rest')));f.destroy();
});

test('two staves using the same clef keep independent keys and fixed glyph rows',()=>{
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Same clefs',2).score,true);
  score.parts[1].clef='treble';score.parts[1].keyId='G-major';
  score.parts.forEach((part,index)=>part.measures.forEach((bar,barIndex)=>{bar.events=[note('staff-'+index+'-'+barIndex)];}));
  score.parts[0].measures[1].keyId='D-major';score.parts[1].measures[1].keyId='F-major';
  const f=fixture(score),view=f.view;
  assert.deepStrictEqual(view.fixedContexts.map(entry=>[entry.partIndex,entry.context.clef,entry.context.keyId]),[[0,'treble','C-major'],[1,'treble','G-major']]);
  view.position=f.timeline.measures[1].startMs;
  assert.deepStrictEqual(view.fixedContexts.map(entry=>[entry.partIndex,entry.context.clef,entry.context.keyId]),[[0,'treble','D-major'],[1,'treble','F-major']]);
  const rows=nodes(view._render()).filter(node=>node.data&&node.data.attrs&&Object.prototype.hasOwnProperty.call(node.data.attrs,'data-fixed-staff'));
  assert.strictEqual(rows.length,2);assert.notStrictEqual(rows[0].data.attrs.transform,rows[1].data.attrs.transform);
  assert.notStrictEqual(view.frameOffset(0),view.frameOffset(1));f.destroy();
});

test('a clef-only change following an in-bar key change displays the new clef signature while it docks',()=>{
  const score=model.createWorkshopDraft('Signature positioning').score;
  score.parts[0].measures[0].events=[note('initial'),note('new-key',2),note('new-clef',4)];
  score.parts[0].measures[0].contextChanges=[{id:'key-first',startSlot:2,keyId:'D-major'},{id:'clef-after',startSlot:4,clef:'bass'}];
  const f=fixture(score),view=f.view;
  view.position=f.timeline.events.find(event=>event.id==='new-clef').startMs;
  const entry=rowAt(view);assert.strictEqual(entry.context.clef,'bass');assert.strictEqual(entry.context.keyId,'D-major');
  assert(entry.keyX+view.translation>54,'fixture must catch the signature before docking');
  assert.deepStrictEqual(plain(view.fixedSignature(entry)),plain(workshopKeySignature('D-major','bass')));
  f.destroy();
});

test('a per-bar key cancellation retains its natural sign while the new context moves into the fixed header',()=>{
  const score=model.createWorkshopDraft('Key cancellation',2).score;score.keyId='G-major';
  score.parts[0].measures[0].events=[note('sharp-key')];score.parts[0].measures[1].events=[note('natural-key')];
  score.parts[0].measures[1].keyId='C-major';
  const f=fixture(score),view=f.view,change=view.contexts.changes.find(entry=>entry.context.keyId==='C-major');
  assert(change);assert(change.fields.includes('keyId'));
  assert(view.movingSignature(change).some(pitch=>pitch.step==='F'&&pitch.alter===0),'C-major boundary must show cancellation of preceding F-sharp');
  view.position=f.timeline.measures[1].startMs;
  assert.strictEqual(rowAt(view).context.keyId,'C-major');f.destroy();
});

test('playing, seeking and resizing reuse the same engraving and context cache without changing the saved score',()=>{
  const score=model.createWorkshopDraft('Cache',10).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('cache-'+index)];});
  const before=JSON.stringify(score),f=fixture(score),view=f.view;
  const engraving=view._engraving,system=view.sourceSystem,layout=view.layout,contexts=view.contexts,revision=view.engravingRevision;
  for(const position of [0,1700,12000,500,view.duration-1]){
    view.position=position;view.playing=!view.playing;view._render();
    assert.strictEqual(view._engraving,engraving);assert.strictEqual(view.sourceSystem,system);
    assert.strictEqual(view.layout,layout);assert.strictEqual(view.contexts,contexts);assert.strictEqual(view.engravingRevision,revision);
  }
  view.$refs.viewport.clientWidth=540;view.updateWidth();view._render();assert.strictEqual(view.scale,1);
  assert.strictEqual(view._engraving,engraving);assert.strictEqual(JSON.stringify(score),before);f.destroy();
});

test('replacing the timeline refreshes the first fixed context and header width while retaining score engraving',async()=>{
  const score=model.createWorkshopDraft('Timeline context',2).score;
  score.parts[0].measures[0].events=[note('simple-key')];score.parts[0].measures[1].events=[note('full-key')];
  score.parts[0].measures[1].keyId='C-sharp-major';score.parts[0].measures[1].clef='bass';score.parts[0].measures[1].meter='3/4';
  const f=fixture(score),view=f.view;
  view.practiceZoom=1.5;await Vue.nextTick();
  const sourceSystem=view.sourceSystem,oldContexts=view.contexts;
  const wideHeader=244*view.contextScale;
  assert(Math.abs(view._engraving.headerWidth-wideHeader)<1e-8);assert(view.headerWidth<=wideHeader);
  view.timeline=createWorkshopPlayback(score,{}, {barIndex:0}).getTimeline();await Vue.nextTick();
  assert.strictEqual(view.sourceSystem,sourceSystem);assert.notStrictEqual(view.contexts,oldContexts);
  assert.strictEqual(view.layout.bars.length,1);assert(Math.abs(view.headerWidth-104*view.contextScale)<1e-8);
  assert.deepStrictEqual(state(rowAt(view)),{clef:'treble',keyId:'C-major',meter:'4/4'});
  view.timeline=createWorkshopPlayback(score,{}, {barIndex:1}).getTimeline();await Vue.nextTick();
  assert.strictEqual(view.sourceSystem,sourceSystem);assert(Math.abs(view._engraving.headerWidth-wideHeader)<1e-8);assert(view.headerWidth<=wideHeader);
  assert.deepStrictEqual(state(rowAt(view)),{clef:'bass',keyId:'C-sharp-major',meter:'3/4'});
  const fixed=nodes(view._render()).find(node=>node.data&&node.data.attrs&&node.data.attrs['data-fixed-staff']===0);
  assert.strictEqual(fixed.data.attrs['data-clef'],'bass');assert.strictEqual(fixed.data.attrs['data-key'],'C-sharp-major');f.destroy();
});

test('centering targets the score viewport only in practice, retaining normal scale and fixed play line',()=>{
  const score=model.createWorkshopDraft('Centered score').score;score.parts[0].measures[0].events=[note('center')];
  const f=fixture(score),view=f.view,calls=[],anchor=view.anchor;
  view.$refs.viewport.scrollIntoView=options=>calls.push(options);view.centerForPractice();
  assert.deepStrictEqual(calls,[{block:'center',inline:'nearest',behavior:'instant'}]);
  assert.strictEqual(view.scale,1);assert.strictEqual(view.anchor,anchor);
  view.practice=false;view.centerForPractice();assert.strictEqual(calls.length,1);f.destroy();
});
function openingGroups(view){return nodes(view._render()).filter(node=>node.data&&node.data.staticClass==='fixed-start-barline');}
function openingInk(group){return nodes(group).filter(node=>['line','circle'].includes(node.tag)).map(node=>{
  const attrs=plain(node.data.attrs);['x1','x2','y1','y2','cx','cy','r'].forEach(key=>{if(key in attrs)attrs[key]=Number(attrs[key]);});
  return {tag:node.tag,attrs,class:node.data.staticClass};
});}
test('the initial repeat keeps both lines and dots permanently behind the fixed meter at start, middle and end',()=>{
  const score=model.createWorkshopDraft('Opening repeat',3).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('opening-note-'+index)];});
  score.parts[0].measures[0].repeatStart=true;score.parts[0].measures[1].repeatEnd=2;
  score.parts[0].measures[2].clef='bass';score.parts[0].measures[2].keyId='D-major';score.parts[0].measures[2].meter='3/4';
  const before=JSON.stringify(score),f=fixture(score),view=f.view;let expected=null;
  for(const position of [0,f.timeline.measures[2].startMs,view.duration/2,view.duration]){
    view.position=position;view.playing=!view.playing;
    const groups=openingGroups(view);assert.strictEqual(groups.length,1);assert.strictEqual(groups[0].data.class['repeat-start'],true);
    const ink=openingInk(groups[0]);if(!expected)expected=ink;else assert.deepStrictEqual(ink,expected);
    const lines=ink.filter(item=>item.tag==='line'),dots=ink.filter(item=>item.tag==='circle');
    assert.strictEqual(lines.length,2);assert.strictEqual(lines[1].attrs.x1-lines[0].attrs.x1,5);
    assert(lines.every(item=>item.attrs.y1===76&&item.attrs.y2===156));
    assert.deepStrictEqual(dots.map(item=>[item.attrs.cx,item.attrs.cy,item.attrs.r]),[[view.headerWidth+3,106,2.6],[view.headerWidth+3,126,2.6]]);
    assert(lines[0].attrs.x1>view.meterDock+12,'beginning is after the docked meter');
    assert(dots[0].attrs.cx+dots[0].attrs.r<view.anchor-20,'opening dots cannot overlap the moving-note clip');
    assert.strictEqual(view.scale,1);assert.strictEqual(view.availableWidth,390);
  }
  assert.deepStrictEqual(state(rowAt(view)),{clef:'bass',keyId:'D-major',meter:'3/4'});
  view.position=0;
  const moving=children(view).filter(node=>node.componentOptions.propsData.barIndex===0);assert(moving.length);
  moving.forEach(node=>{
    assert.strictEqual(node.componentOptions.propsData.measure.repeatStart,false,'initial repeat has no moving duplicate');
    const child=renderStaff(node.componentOptions.propsData);
    assert(!nodes(child._render()).some(item=>item.data&&item.data.staticClass==='repeat-start'));child.$destroy();
  });
  assert.strictEqual(JSON.stringify(score),before);f.destroy();
});
test('a normal initial separator remains one line through meter changes and later local repeat marks stay in the score',()=>{
  const score=model.createWorkshopDraft('Plain opening',3).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('plain-'+index)];});
  score.parts[0].measures[1].meter='3/4';score.parts[0].measures[1].repeatStart=true;score.parts[0].measures[2].repeatEnd=2;
  const f=fixture(score),view=f.view;
  for(const position of [0,f.timeline.measures[1].startMs,view.duration]){
    view.position=position;const groups=openingGroups(view);assert.strictEqual(groups.length,1);
    assert.strictEqual(groups[0].data.class['repeat-start'],false);const ink=openingInk(groups[0]);
    assert.strictEqual(ink.length,1);assert.strictEqual(ink[0].tag,'line');assert.strictEqual(ink[0].attrs.x1,view.headerWidth-3);
  }
  view.position=f.timeline.measures[1].startMs;
  assert(children(view).some(node=>node.componentOptions.propsData.barIndex===1&&node.componentOptions.propsData.measure.repeatStart),'later written repeat still travels with its measure');
  f.destroy();
});
test('an imported heavy-light forward repeat is fixed on both staves and survives clef/key/meter changes on a phone',()=>{
  const xml='<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'+
    '<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>'+
    '<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>'+
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note><backup><duration>4</duration></backup>'+
    '<note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>2</staff></note><barline location="right"><repeat direction="backward" times="2"/></barline></measure>'+
    '<measure number="2"><attributes><key><fifths>2</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef number="1"><sign>F</sign><line>4</line></clef><clef number="2"><sign>G</sign><line>2</line></clef></attributes>'+
    '<note><pitch><step>C</step><octave>3</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note><backup><duration>2</duration></backup>'+
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>2</voice><type>half</type><staff>2</staff></note></measure></part></score-partwise>';
  const score=importWorkshopMusicXmlText(xml).score;assert.strictEqual(score.parts.length,2);
  assert(score.parts.every(part=>part.measures[0].repeatStart));const before=JSON.stringify(score),f=fixture(score),view=f.view;
  for(const width of [390,320]){
    view.$refs.viewport.clientWidth=width;view.updateWidth();
    for(const position of [0,f.timeline.measures[1].startMs,f.timeline.measures[2].startMs,view.duration]){
      view.position=position;const groups=openingGroups(view);assert.strictEqual(groups.length,2);
      assert.deepStrictEqual(groups.map(group=>group.data.attrs['data-opening-staff']),[0,1]);
      assert(groups.every(group=>openingInk(group).filter(item=>item.tag==='line').length===2));
      assert(groups.every(group=>openingInk(group).filter(item=>item.tag==='circle').length===2));
      assert.strictEqual(view.scale,1);assert.strictEqual(view.logicalWidth,width);
      const rows=nodes(view._render()).filter(node=>node.data&&node.data.attrs&&Object.prototype.hasOwnProperty.call(node.data.attrs,'data-fixed-staff'));
      assert.notStrictEqual(rows[0].data.attrs.transform,rows[1].data.attrs.transform);
    }
  }
  assert.deepStrictEqual(view.fixedContexts.map(entry=>[entry.context.clef,entry.context.keyId,entry.context.meter]),[['bass','D-major','3/4'],['treble','D-major','3/4']]);
  assert.strictEqual(JSON.stringify(score),before);f.destroy();
});
test('the permanent initial barline only appears in practice and leaves the original listening repeat untouched',()=>{
  const score=model.createWorkshopDraft('Preview repeat',2).score;score.parts[0].measures[0].events=[note('preview')];
  score.parts[0].measures[0].repeatStart=true;score.parts[0].measures[1].repeatEnd=2;
  const f=fixture(score,{practice:false}),view=f.view;assert.strictEqual(openingGroups(view).length,0);
  const opening=children(view).find(node=>node.componentOptions.propsData.barIndex===0);
  assert.strictEqual(opening.componentOptions.propsData.measure.repeatStart,true);
  const child=renderStaff(opening.componentOptions.propsData);
  assert(nodes(child._render()).some(node=>node.data&&node.data.staticClass==='repeat-start'));child.$destroy();f.destroy();
});
test('12/8, 3/16 and additive meters reserve a stable header with clear space before the initial repeat',()=>{
  const score=model.createWorkshopDraft('Wide meter',4).score;score.keyId='G-major';
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('wide-meter-'+index)];});
  score.parts[0].measures[0].repeatStart=true;score.parts[0].measures[1].repeatEnd=2;
  score.parts[0].measures[1].meter='12/8';score.parts[0].measures[2].meter='3/16';score.parts[0].measures[3].meter='3+2/8';
  score.parts[0].measures[2].events[0].noteValue='eighth';
  const f=fixture(score),view=f.view;
  assert.strictEqual(view.meterExtraWidth,40);assert.strictEqual(view._engraving.headerWidth,164);
  for(const width of [390,320]){
    view.$refs.viewport.clientWidth=width;view.updateWidth();
    const header=view.headerWidth,anchor=view.anchor,meterDock=view.meterDock;
    for(const measure of f.timeline.measures){
      view.position=measure.startMs;assert.strictEqual(view.headerWidth,header);assert.strictEqual(view.anchor,anchor);assert.strictEqual(view.meterDock,meterDock);
      const entry=rowAt(view),widthBudget=Math.max(...entry.context.meter.split('/').map(number=>number.length*20*view.headerFit));
      const barline=openingInk(openingGroups(view)[0]).find(item=>item.class==='repeat-heavy');
      assert(meterDock+widthBudget/2+5*view.headerFit<barline.attrs.x1-1.5,'bold meter has at least5px before the heavy stroke');
      assert(meterDock-widthBudget/2>view.headerWidth-(view.meterExtraWidth+48)*view.headerFit,'wide meter extends to the right, away from clef/key');
      assert(view.anchor+16<view.logicalWidth,'normal current note fits at phone width');assert.strictEqual(view.scale,1);
    }
  }
  view.position=0;assert.strictEqual(rowAt(view).context.meter,'4/4');assert.strictEqual(view._engraving.headerWidth,164);f.destroy();
});
test('the current enlarged accidental and its brackets fit fully between header and play line',()=>{
  const score=model.createWorkshopDraft('Visible accidentals').score;
  score.parts[0].measures[0].events=[note('bracket-sharp',0,{step:'F',alter:1,octave:4},{accidentalDisplay:{force:true,enclosure:'bracket'}})];
  const f=fixture(score),view=f.view;
  const accidental=require('../src/model/WorkshopAccidentalGlyphs'),head=view.sourceSystem.bars[0].parts[0].notation.events.find(event=>event.id==='bracket-sharp');
  const ink=accidental.workshopAccidentalInk(head,head.accidentalX,head.y,1.7);
  const left=ink.left+view.translation+view.layout.bars[0].x,right=ink.right+view.translation+view.layout.bars[0].x;
  const clip=nodes(view._render()).find(node=>node.tag==='clipPath').children[0];
  assert(left>=clip.data.attrs.x,'entire current sign and bracket are within clip');
  assert(left>view.headerWidth,'header paper cannot cover current accidental');
  assert(right<view.anchor-14,'sign stays before full-size notehead');
  assert(view.noteClipInset>20);f.destroy();
});

test('plain high ledger notes and low breves stay entirely inside the play-line clip at extreme independent sizes',async()=>{
  const score=model.createWorkshopDraft('Unmarked note clearance',2).score;score.meter='8/4';
  score.parts[0].measures[0].events=[note('plain-high',0,{step:'C',alter:0,octave:6})];
  score.parts[0].measures[1].events=[note('plain-breve',0,{step:'C',alter:0,octave:4},{noteValue:'breve'})];
  const before=JSON.stringify(score),f=fixture(score,{},{}),view=f.view;
  for(const [staffZoom,noteZoom] of [[.5,1.5],[.5,1],[2,1.5]]){
    Object.assign(view,{practiceZoom:staffZoom,practiceNoteZoom:noteZoom});await Vue.nextTick();
    for(const [index,id] of [[0,'plain-high'],[1,'plain-breve']]){
      view.position=f.timeline.measures[index].startMs;
      const bar=view.layout.bars[index],head=bar.parts[0].notation.events.find(event=>event.id===id);
      assert(!head.accidental,'regression must exercise notes without an accidental reserve');
      const rendered=nodes(view._render()),clip=rendered.find(node=>node.tag==='clipPath').children[0].data.attrs;
      const childNode=children(view).find(node=>node.componentOptions.propsData.barIndex===index),child=renderStaff(childNode.componentOptions.propsData);
      const shapes=nodes(child._render()),ledgerLines=shapes.filter(node=>node.tag==='line'&&node.data.staticClass==='ledger');
      assert(ledgerLines.length,'regression note has real ledger strokes');
      const offset=bar.x+view.translation,strokeHalf=.85*view.notationScale;
      ledgerLines.forEach(line=>assert(line.data.attrs.x1+offset-strokeHalf>=clip.x,'entire current ledger stroke clears the clip and fixed header'));
      const ellipse=shapes.find(node=>node.tag==='ellipse'&&node.data.staticClass==='note-head');
      const theta=20*Math.PI/180,extent=Math.sqrt(Math.pow(ellipse.data.attrs.rx*Math.cos(theta),2)+Math.pow(ellipse.data.attrs.ry*Math.sin(theta),2));
      assert(ellipse.data.attrs.cx+offset-extent-(id==='plain-breve' ? strokeHalf : 0)>=clip.x,'rotated plain notehead is fully visible');
      if(id==='plain-breve'){
        const bars=shapes.find(node=>node.tag==='path'&&node.data.staticClass==='stem breve-bars');assert(bars,'written breve side strokes remain present');
        const firstX=Number(bars.data.attrs.d.split(' ')[1]);assert(firstX+offset-strokeHalf>=clip.x,'breve left side stroke clears the clip');
      }
      assert(clip.x>view.headerWidth,'current strokes stay to the right of the fixed header paper');
      child.$destroy();
    }
  }
  assert.strictEqual(JSON.stringify(score),before);f.destroy();
});

test('an arpeggio preceding a current chord is included in the permanent play-line reserve',()=>{
  const score=model.createWorkshopDraft('Visible arpeggio').score;
  score.parts[0].measures[0].events=[note('arp-low',0,{step:'C',alter:0,octave:4},{arpeggio:'up'}),note('arp-sharp',0,{step:'F',alter:1,octave:4})];
  const f=fixture(score),view=f.view,part=view.sourceSystem.bars[0].parts[0];
  const left=Math.min(...part.notation.events.filter(event=>event.kind==='note').map(event=>event.accidental ? event.accidentalX : event.x))-32;
  const clip=nodes(view._render()).find(node=>node.tag==='clipPath').children[0];
  assert(left+view.translation+view.layout.bars[0].x>=clip.data.attrs.x);f.destroy();
});

test('dense signatures retain a visible full-size current note even on a narrow practice viewport',()=>{
  const score=model.createWorkshopDraft('Narrow full key').score;score.keyId='C-sharp-major';
  score.parts[0].measures[0].events=[note('dense-key')];
  const f=fixture(score),view=f.view;
  for(const width of [390,320,260,240]){
    view.$refs.viewport.clientWidth=width;view.updateWidth();
    assert(view.anchor+16<view.logicalWidth);assert((view.logicalWidth-view.anchor)*view.scale>=62-1e-8);
    assert.strictEqual(children(view)[0].componentOptions.propsData.notationScale,2);
    assert.strictEqual(view.scale,1);
    const rect=nodes(view._render()).find(node=>node.tag==='clipPath').children[0];
    assert(Math.abs(rect.data.attrs.x+rect.data.attrs.width-view.logicalWidth)<1e-8);
  }
  assert(view.headerFit<1,'only the fixed key header compacts when it needs room');f.destroy();
});

test('a two-digit denominator widens the header even when its numerator is one digit',()=>{
  const score=model.createWorkshopDraft('Small denominator').score;score.meter='3/16';score.parts[0].measures[0].repeatStart=true;
  const f=fixture(score),view=f.view;assert.strictEqual(view.meterExtraWidth,20);assert.strictEqual(view.headerWidth,124);
  assert.strictEqual(view.meterDock,88);assert(view.meterDock+20+5<view.headerWidth-9.5);f.destroy();
});
test('a meter transition immediately uses its safe dock while upcoming glyphs cannot paint over the permanent opening',()=>{
  const score=model.createWorkshopDraft('Safe transition',2).score;
  score.parts[0].measures[0].events=[note('transition-before')];score.parts[0].measures[0].repeatStart=true;
  score.parts[0].measures[1].events=[note('transition-after')];score.parts[0].measures[1].meter='12/8';
  score.parts[0].measures[1].clef='bass';score.parts[0].measures[1].keyId='D-major';
  const f=fixture(score),view=f.view,onset=f.timeline.measures[1].startMs,headerWidth=view.headerWidth,anchor=view.anchor;
  for(const position of [onset-1,onset,onset+100,view.duration]){
    view.position=position;const rendered=nodes(view._render());
    const fixedRow=rendered.find(node=>node.data&&node.data.attrs&&node.data.attrs['data-fixed-staff']===0);
    const meterTexts=nodes(fixedRow).filter(node=>node.tag==='text'&&node.data.staticClass==='context-meter');
    assert.strictEqual(meterTexts.length,2);assert(meterTexts.every(node=>node.data.attrs.x==='0'));
    const meterGroup=nodes(fixedRow).find(node=>node.tag==='g'&&node.data&&node.data.attrs&&node.data.attrs.transform==='translate('+view.meterDock+' 0) scale('+view.headerFit+' 1)');assert(meterGroup);
    assert.strictEqual(view.headerWidth,headerWidth);assert.strictEqual(view.anchor,anchor);
    const future=rendered.filter(node=>node.data&&node.data.staticClass==='moving-context');
    if(position<onset)assert(future.length,'fixture catches the incoming context immediately before its first head');
    assert(future.every(node=>node.data.attrs['clip-path']==='url(#'+view.clipId+')'));
    const repeat=openingInk(openingGroups(view)[0]);assert.strictEqual(repeat.filter(item=>item.tag==='circle').length,2);
  }
  view.position=onset;
  const entry=rowAt(view);assert(view.dockX(entry.meterX,view.meterDock)>view.meterDock,'old animated meter would still be inside the opening line area');
  const rendered=nodes(view._render()),fixedRow=rendered.find(node=>node.data&&node.data.attrs&&node.data.attrs['data-fixed-staff']===0);
  const clef=nodes(fixedRow).find(node=>node.tag==='path'&&node.data.staticClass==='context-glyph');
  assert.strictEqual(clef.data.attrs.d,view.clefPath(entry.context.clef,16*view.headerFit,view.headerFit),'clef takes over at the same stationary dock as its incoming preview');
  assert.deepStrictEqual(state(entry),{clef:'bass',keyId:'D-major',meter:'12/8'});f.destroy();
});

test('preparation moves the note band gently toward a stationary line without rebuilding or revealing past notes',async()=>{
  const score=model.createWorkshopDraft('Visual preparation',2).score;
  score.parts[0].measures[0].events=[note('first'),note('second',2)];
  const f=fixture(score,{preparationRemaining:1},{},true),view=f.view;
  try {
    const before=JSON.stringify(score),engraving=view._engraving,position=view.position,anchor=view.anchor;
    const first=view.layout.bars[0].parts[0].notation.events.find(event=>event.id==='first');
    const onset=view.layout.bars[0].x+first.x;
    let previous=Infinity;
    for(const remaining of [1,.75,.5,.25,0]) {
      view.preparationRemaining=remaining;await Vue.nextTick();
      const renderedX=onset+view.translation;
      assert(renderedX<=previous);previous=renderedX;
      assert(renderedX>=anchor);assert(renderedX<view.logicalWidth);
      assert.strictEqual(view.lineX,anchor);assert.strictEqual(view.cursorX,onset);
      assert.strictEqual(view.noteClipLeft,anchor+view.preparationOffset-view.noteClipInset);
      assert.strictEqual(view._engraving,engraving);assert.strictEqual(view.position,position);
      assert(!nodes(view._render()).some(node=>node.data&&node.data.staticClass==='practice-countdown'));
    }
    assert.strictEqual(onset+view.translation,anchor);assert.strictEqual(JSON.stringify(score),before);
    view.position=1000;view.preparationRemaining=1;await Vue.nextTick();
    assert(onset+view.translation<view.noteClipLeft,'an earlier note remains behind the moving note clip');
  } finally {f.destroy();}
});

(async()=>{let failures=0;for(const [name,run] of tests){try{await run();process.stdout.write('✓ '+name+'\n');}catch(error){failures++;process.stderr.write('✗ '+name+'\n'+error.stack+'\n');}}
  if(failures)process.exitCode=1;else process.stdout.write(tests.length+' workshop practice stream tests passed.\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
