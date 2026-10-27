const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
Module._extensions['.vue']=mod => {mod.exports={};};
function component(name) {
  const filename=path.join(sourceRoot,'components',name+'.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));require.cache[filename]=mod;
  mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
  return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
}
const staff=component('WorkshopStaff'),definition=component('WorkshopListening');
const {workshopStaffNotation}=require('../src/components/WorkshopStaff.vue');
const model=require('../src/model/Workshop');
const {createWorkshopPracticePlan}=require('../src/model/WorkshopPractice');
const mapping=require('../src/model/WorkshopStreamPosition');
const {createWorkshopSheetSystems}=require('../src/components/WorkshopSheetLayout');
function note(id,startSlot,pitch={step:'C',alter:0,octave:4},extra={}) {return Object.assign({id,kind:'note',noteValue:'quarter',startSlot,pitch},extra);}
function performed(score,order=model.workshopPlaybackBarOrder(score)) {
  const source=model.workshopTimeline(score),measures=[],events=[];let cursor=0;
  order.forEach((index,measureIndex) => {
    const measure=source.measures[index],duration=measure.endMs-measure.startMs;
    measures.push(Object.assign({},measure,{startMs:cursor,endMs:cursor+duration}));
    source.events.filter(event=>event.barIndex===index).forEach(event=>events.push(Object.assign({},event,{measureIndex,startMs:cursor+event.startMs-measure.startMs})));
    cursor+=duration;
  });return {measures,events,durationMs:cursor};
}
function fixture(score,extra={},display={practiceNoteZoom:1,practiceZoom:1,practiceContextZoom:1}) {
  const timeline=performed(score),emitted=[];
  const view=new Vue(Object.assign({},definition,{mounted:undefined,beforeDestroy:undefined,data(){return Object.assign({},definition.data.call(this),display);},propsData:Object.assign({score,timeline},extra),
    components:{WorkshopStaff:staff},methods:Object.assign({},definition.methods,{$t:(key,values)=>key+(values ? JSON.stringify(values) : '')})}));
  ['seek','toggle','close','edit','settings-toggle','scrub-start','scrub-end'].forEach(name=>view.$on(name,payload=>emitted.push({name,payload})));
  const captures=new Set();view.$refs.viewport={clientWidth:390,getBoundingClientRect:()=>({left:10,width:390}),
    setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
  const pointer=(x,id=1,extra={})=>Object.assign({pointerId:id,isPrimary:true,button:0,clientX:10+x*view.scale,preventDefault() {}},extra);
  return {view,timeline,emitted,captures,pointer,destroy:()=>view.$destroy()};
}
function nodes(node) {return [node].concat(...(node.children || []).map(nodes));}
function drawnNotes(bar) {return bar.parts.reduce((all,part)=>all.concat(workshopStaffNotation({measure:part.measure,clef:part.context.clef,meter:part.context.meter,keyId:part.context.keyId,
  showClef:part.showClef,showKey:part.showKey,showMeter:part.showMeter,headerLeft:bar.headerLeft,horizontalColumns:bar.spacing.columns,staffIndex:part.partIndex,companionMeasure:part.companionMeasure}).events),[]);}
const tests=[];function test(name,run) {tests.push([name,run]);}

test('practice settings collapse without losing position or engraving, while the preview retains its original controls',async()=>{
  const score=model.createWorkshopDraft('Compact practice',3).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('compact-'+index,0)];});
  const f=fixture(score,{practice:true},{}),view=f.view;view.updateWidth();view.position=4000;
  const engraving=view._engraving,find=(tree,name)=>nodes(tree).find(node=>node.data && node.data.staticClass===name);
  try{
    let tree=view._render(),settings=find(tree,'practice-setup'),toggle=find(tree,'settings-toggle');
    assert.strictEqual(settings.data.attrs.hidden,false);
    assert.strictEqual(toggle.data.attrs['aria-expanded'],'true');
    assert.strictEqual(toggle.data.attrs['aria-controls'],settings.data.attrs.id);
    assert.strictEqual(nodes(settings).filter(node=>node.tag==='input' && node.data.attrs.type==='range').length,1);
    assert.strictEqual(nodes(settings).filter(node=>node.tag==='input' && node.data.attrs.type==='number').length,1,'practice retains the direct single-bar selection');
    assert(!find(tree,'practice-section-tools')); 
    assert.strictEqual(nodes(find(tree,'transport-controls')).filter(node=>node.tag==='button').length,2);
    toggle.data.on.click();assert.deepStrictEqual(f.emitted.pop(),{name:'settings-toggle',payload:undefined});
    view.settingsOpen=false;await Vue.nextTick();tree=view._render();settings=find(tree,'practice-setup');
    assert.strictEqual(settings.data.attrs.hidden,true);assert.strictEqual(find(tree,'settings-toggle').data.attrs['aria-expanded'],'false');
    assert(find(tree,'listening-viewport'));assert(find(tree,'practice-progress'));
    assert.strictEqual(view.position,4000);assert.strictEqual(view._engraving,engraving);
    view.settingsOpen=true;await Vue.nextTick();settings=find(view._render(),'practice-setup');
    const restart=nodes(settings).find(node=>node.tag==='button');restart.data.on.click();assert.deepStrictEqual(f.emitted.pop(),{name:'seek',payload:0});
    view.practice=false;await Vue.nextTick();tree=view._render();
    assert(!find(tree,'practice-setup'));assert(!find(tree,'settings-toggle'));assert(!find(tree,'practice-progress'));
    assert(find(tree,'piece-info-toggle'));assert.strictEqual(nodes(find(tree,'transport-controls')).filter(node=>node.tag==='button').length,4);
    assert.strictEqual(nodes(tree).filter(node=>node.tag==='input' && node.data.attrs.type==='range').length,1);
    assert.strictEqual(nodes(tree).filter(node=>node.tag==='input' && node.data.attrs.type==='number').length,1);
  }finally{f.destroy();}
});

test('compact progress follows the performed timeline and the live scrub position including repeated bars',()=>{
  const score=model.createWorkshopDraft('Repeated progress',2).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('progress-'+index,0)];});
  score.parts[0].measures[0].repeatStart=true;score.parts[0].measures[1].repeatEnd=2;
  const f=fixture(score,{practice:true,settingsOpen:false},{}),view=f.view;
  const progress=()=>nodes(view._render()).find(node=>node.tag==='progress');
  try{
    view.position=f.timeline.measures[2].startMs+500;
    assert.strictEqual(progress().data.domProps.value,view.position);assert.strictEqual(progress().data.attrs.max,f.timeline.durationMs);
    assert.strictEqual(view.currentBar,0);assert(progress().data.attrs['aria-valuetext'].includes(view.formatTime(f.timeline.durationMs)));
    view.updateWidth();view.beginDrag(f.pointer(view.anchor));view.moveDrag(f.pointer(view.anchor+40));
    assert(view.drag.position>view.position);assert.strictEqual(progress().data.domProps.value,view.drag.position);
    view.cancelDrag();assert.strictEqual(progress().data.domProps.value,view.position);
    view.position=f.timeline.durationMs;assert.strictEqual(progress().data.domProps.value,progress().data.attrs.max);
  }finally{f.destroy();}
});

test('a selected section retains source bar context, aligns scaled onsets, constrains seeking and omits unperformed navigation',()=>{
  const score=model.createWorkshopDraft('Section context',4).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('section-'+index,0)];});
  score.parts[0].measures[0].repeatStart=true;score.parts[0].measures[3].repeatEnd=2;
  score.parts[0].measures[1].keyId='G-major';score.parts[0].measures[1].clef='bass';score.parts[0].measures[2].navigation=['segno'];
  const before=JSON.stringify(score),plan=createWorkshopPracticePlan(score,{tempoPercent:50,range:{startBar:1,endBar:2}});
  const f=fixture(plan.score,{practice:true,linearPractice:true,timeline:plan.timeline},{}),view=f.view;view.updateWidth();
  try {
    assert.deepStrictEqual(view.layout.bars.map(bar=>bar.index),[1,2]);assert.strictEqual(view.startBarIndex,1);
    assert.strictEqual(view.currentBar,1);assert.strictEqual(view.fixedContexts[0].context.keyId,'G-major');assert.strictEqual(view.fixedContexts[0].context.clef,'bass');
    assert.strictEqual(view.openingRepeat(0),false);assert.strictEqual(view.barMinimum,2);assert.strictEqual(view.barMaximum,3);
    const bars=nodes(view._render()).filter(node=>node.data && node.data.staticClass==='stream-bar');
    bars.forEach(bar=>nodes(bar).filter(node=>node.componentOptions && node.componentOptions.tag==='WorkshopStaff').forEach(node=>{
      const measure=node.componentOptions.propsData.measure;assert.strictEqual(measure.repeatStart,false);assert.strictEqual(measure.repeatEnd,false);assert.deepStrictEqual(measure.navigation,[]);
    }));
    plan.targets.forEach(target=>{const bar=view.layout.bars[target.measureIndex],head=drawnNotes(bar).find(event=>target.eventIds.includes(event.id));
      assert(Math.abs(mapping.workshopStreamXAtTime(view.layout,target.startMs)-(bar.x+head.x))<1e-5);
    });
    view.jumpToBar({target:{value:'1'}});assert.strictEqual(f.emitted.pop().payload,0);
    view.jumpToBar({target:{value:'4'}});assert.strictEqual(f.emitted.pop().payload,plan.timeline.measures[1].startMs);
    assert.strictEqual(JSON.stringify(score),before);
  }finally{f.destroy();}
});

test('every performed onset aligns with its actual engraved note column, with inverse seeking and silent bar motion',()=>{
  const score=model.createWorkshopDraft('Columns',3).score;
  score.parts[0].measures[0].events=[note('a',0),note('b',2,{step:'F',alter:1,octave:4}),note('c',6,{step:'F',alter:0,octave:4})];
  score.parts[0].measures[2].events=[note('d',0),note('e',4)];
  const f=fixture(score),before=JSON.stringify(score);
  f.timeline.events.filter(event=>event.value!==null).forEach(event=>{
    const bar=f.view.layout.bars[event.measureIndex],head=drawnNotes(bar).find(item=>item.id===event.id);
    assert(Math.abs(mapping.workshopStreamXAtTime(f.view.layout,event.startMs)-(bar.x+head.x))<1e-5);
    assert(Math.abs(mapping.workshopStreamTimeAtX(f.view.layout,bar.x+head.x)-event.startMs)<1e-5);
  });
  const silence=f.timeline.measures[1];assert(mapping.workshopStreamXAtTime(f.view.layout,silence.startMs+2000)>mapping.workshopStreamXAtTime(f.view.layout,silence.startMs));
  assert.strictEqual(JSON.stringify(score),before);f.destroy();
});

test('repeats receive distinct forward-moving columns while bar selection uses the nearest performed occurrence',()=>{
  const score=model.createWorkshopDraft('Repeats',3).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('repeat-'+index,0)];});
  score.parts[0].measures[0].repeatStart=true;score.parts[0].measures[1].repeatEnd=2;
  const f=fixture(score);assert.deepStrictEqual(f.view.layout.bars.map(bar=>bar.index),[0,1,0,1,2]);
  for(let i=1;i<f.view.layout.anchors.length;i++) assert(f.view.layout.anchors[i].x>f.view.layout.anchors[i-1].x);
  const occurrence=f.view.layout.bars[2];f.view.position=occurrence.startMs+500;
  assert.strictEqual(f.view.currentBar,0);f.view.jumpToBar({target:{value:'1'}});
  assert.strictEqual(f.emitted.pop().payload,occurrence.startMs);
  const first=f.view.layout.bars[0];assert(occurrence.x>first.x+first.width);f.destroy();
});

test('only the sounding occurrence highlights when two copies of the same repeated bar are visible',()=>{
  const score=model.createWorkshopDraft('Repeated once',1).score,bar=score.parts[0].measures[0];
  bar.events=[note('shared-source-id',0)];bar.repeatStart=true;bar.repeatEnd=2;
  const f=fixture(score,{activeEventIds:['shared-source-id']});f.view.position=f.timeline.measures[1].startMs;
  const bars=nodes(f.view._render()).filter(node=>node.data && node.data.staticClass==='stream-bar');
  assert.strictEqual(bars.length,2);
  bars.forEach(node=>{
    const staves=nodes(node).filter(child=>child.componentOptions && child.componentOptions.tag==='WorkshopStaff');
    const expected=node.data.attrs['data-performance-index']===1 ? ['shared-source-id'] : [];
    staves.forEach(staff=>assert.deepStrictEqual(staff.componentOptions.propsData.activeEventIds,expected));
  });f.destroy();
});

test('a thousand-bar piece renders only the nearby window and position changes reuse its engraving',()=>{
  const score=model.createWorkshopDraft('Long strip',1000).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('long-'+index,0)];});
  const f=fixture(score);f.view.updateWidth();const engraved=f.view.sourceSystem,layout=f.view.layout;
  assert.strictEqual(layout.bars.length,1000);
  for(const index of [0,500,999]) {
    f.view.position=f.timeline.measures[index].startMs;
    assert(f.view.visibleBars.some(bar=>bar.index===index));assert(f.view.visibleBars.length<=6);
    assert.strictEqual(f.view.sourceSystem,engraved);assert.strictEqual(f.view.layout,layout);
    const rendered=nodes(f.view._render()).filter(node=>node.componentOptions && node.componentOptions.tag==='WorkshopStaff');assert(rendered.length<=6);
  }
  f.view.jumpToBar({target:{value:'94'}});assert.strictEqual(f.emitted.pop().payload,f.timeline.measures[93].startMs);
  f.destroy();
});

test('sheet layout extraction retains printed breaks while continuous playback lays out one strip',()=>{
  const score=model.createWorkshopDraft('Breaks',4).score;score.layout={systemBreaks:[score.parts[0].measures[2].id]};
  const args={score,scoreLayout:score.layout,pageRanges:[{start:0,end:4}],pageIndex:0,barsPerSystem:4,activeParts:[{part:score.parts[0],index:0}]};
  const printed=createWorkshopSheetSystems(args);assert.deepStrictEqual(printed.map(system=>system.bars.map(bar=>bar.index)),[[0,1],[2,3]]);
  const continuous=createWorkshopSheetSystems(Object.assign({},args,{continuous:true}));assert.strictEqual(continuous.length,1);assert.strictEqual(continuous[0].bars.length,4);
});

test('cross-staff beams retain their complete bridge when the source bar is repeated later in the stream',()=>{
  let score=model.createWorkshopDraft('Cross-staff',2).score;
  score.parts.push({id:'left',clef:'bass',measures:score.parts[0].measures.map((bar,index)=>({id:'left-'+index,events:[]}))});
  score.parts[0].measures[0].events=[note('upper',0,{step:'C',alter:0,octave:5},{noteValue:'eighth',beamGroupId:'cross'}),
    note('lower',1,{step:'A',alter:0,octave:3},{noteValue:'eighth',beamGroupId:'cross',displayStaff:1})];
  score.parts.forEach(part=>{part.measures[0].repeatStart=true;part.measures[1].repeatEnd=2;});
  assert(model.isValidWorkshopScore(score));const f=fixture(score),source=f.view.sourceSystem.bars[0],repeat=f.view.layout.bars[2];
  assert.deepStrictEqual(source.crossStaff.groupIds,['cross']);assert(source.crossStaff.stems.length===2);assert(source.crossStaff.beams.length);
  const offset=repeat.x-source.x;
  const heads=drawnNotes(repeat);source.crossStaff.stems.forEach(stem=>{
    const head=heads.find(event=>event.id===stem.eventIds[0]);assert(head);
    assert(Math.abs(Math.abs((stem.x+offset)-(repeat.x+head.x))-6)<1e-8);
  });
  f.view.position=repeat.startMs;const parts=nodes(f.view._render()).filter(node=>node.componentOptions && node.componentOptions.tag==='WorkshopStaff');
  assert(parts.some(node=>node.componentOptions.propsData.crossStaffBeamIds.includes('cross')));f.destroy();
});

test('dragging the page and play line seek opposite ways, retain pause state, and release capture',()=>{
  const score=model.createWorkshopDraft('Dragging',4).score;score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('drag-'+index,0)];});
  const f=fixture(score,{playing:true});f.view.position=4000;f.view.updateWidth();
  f.view.beginDrag(f.pointer(f.view.anchor+100));assert(f.captures.has(1));assert.strictEqual(f.emitted[0].name,'scrub-start');
  f.view.moveDrag(f.pointer(f.view.anchor+150));assert(f.view.drag.position<4000);
  f.view.endDrag(f.pointer(f.view.anchor+150));assert(!f.captures.has(1));assert.strictEqual(f.view.drag,null);
  assert.strictEqual(f.emitted[f.emitted.length-1].payload.resume,true);
  f.view.playing=false;f.view.beginDrag(f.pointer(f.view.anchor));f.view.moveDrag(f.pointer(f.view.anchor+50));assert(f.view.drag.position>4000);
  f.view.endDrag(f.pointer(f.view.anchor+50));assert.strictEqual(f.emitted[f.emitted.length-1].payload.resume,false);
  f.view.busy=true;f.view.beginDrag(f.pointer(f.view.anchor));assert.strictEqual(f.view.drag,null);f.destroy();
});

test('responsive widths retain proportions and cached engraving while page and line dragging use the actual SVG scale',async()=>{
  const score=model.createWorkshopDraft('Responsive dragging',8).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('overall-drag-'+index,0)];});
  const before=JSON.stringify(score),f=fixture(score,{practice:true,playing:true},{}),view=f.view;view.updateWidth();
  assert.deepStrictEqual([view.practiceNoteZoom,view.practiceZoom,view.practiceContextZoom],[.65,.7,.95]);
  const measure=f.timeline.measures[3],position=(measure.startMs+measure.endMs)/2;view.position=position;
  const engraving=view._engraving,system=view.sourceSystem,layout=view.layout,contexts=view.contexts,revision=view.engravingRevision;
  const notationScale=view.notationScale,contextScale=view.contextScale,duration=view.duration,currentBar=view.currentBar;
  const context=JSON.stringify(view.fixedContexts.map(entry=>entry.context));
  const origin=mapping.workshopStreamXAtTime(layout,position),physicalDistance=60;
  try{
    for(const [width,scale] of [[200,.7*.8],[260,.7*.8],[330,.7*(330/390)],[390,.7],[540,.7],[900,.7]]){
      view.$refs.viewport.clientWidth=width;view.updateWidth();await Vue.nextTick();
      assert.strictEqual(view.scale,scale);assert.strictEqual(view.logicalWidth,width/scale);
      assert.strictEqual(view.notationScale,notationScale,'responsive scale preserves the note profile');
      assert.strictEqual(view.contextScale,contextScale,'responsive scale preserves the header profile');
      const svg=nodes(view._render()).find(node=>node.tag==='svg'&&node.data.staticClass==='listening-score');
      assert.strictEqual(svg.data.style.height,system.height*scale+'px');
      const pageStart=view.anchor+30/scale;view.playing=true;view.beginDrag(f.pointer(pageStart));
      assert.strictEqual(view.drag.line,false,'30 physical pixels stay outside the line hit region at every combined scale');
      view.updateWidth();assert.strictEqual(view.drag.line,false,'a height-only observation leaves the scrub active');
      const pageEnd=pageStart+physicalDistance/scale;view.moveDrag(f.pointer(pageEnd));
      const earlier=mapping.workshopStreamTimeAtX(layout,origin-physicalDistance/scale);
      assert(Math.abs(view.drag.position-earlier)<1e-6);assert(earlier<position);
      view.endDrag(f.pointer(pageEnd));const pageResult=f.emitted[f.emitted.length-1];
      assert.strictEqual(pageResult.name,'scrub-end');assert.strictEqual(pageResult.payload.resume,true);assert(Math.abs(pageResult.payload.position-earlier)<1e-6);
      const lineStart=view.anchor+23/scale;view.playing=false;view.beginDrag(f.pointer(lineStart));
      assert.strictEqual(view.drag.line,true,'23 physical pixels stay inside the line hit region');
      const lineEnd=lineStart+physicalDistance/scale;view.moveDrag(f.pointer(lineEnd));
      const later=mapping.workshopStreamTimeAtX(layout,origin+physicalDistance/scale);
      assert(Math.abs(view.drag.position-later)<1e-6);assert(later>position);
      view.endDrag(f.pointer(lineEnd));const lineResult=f.emitted[f.emitted.length-1];
      assert.strictEqual(lineResult.name,'scrub-end');assert.strictEqual(lineResult.payload.resume,false);assert(Math.abs(lineResult.payload.position-later)<1e-6);
      assert.strictEqual(f.captures.size,0);assert.strictEqual(view.drag,null);
      await Vue.nextTick();
      assert.strictEqual(view._engraving,engraving);assert.strictEqual(view.sourceSystem,system);assert.strictEqual(view.layout,layout);assert.strictEqual(view.contexts,contexts);
      assert.strictEqual(view.engravingRevision,revision);assert.strictEqual(view.position,position);assert.strictEqual(view.duration,duration);
      assert.strictEqual(view.currentBar,currentBar);assert.strictEqual(JSON.stringify(view.fixedContexts.map(entry=>entry.context)),context);
      assert.strictEqual(JSON.stringify(score),before);
    }
  }finally{f.destroy();}
});

test('rotation ends a captured scrub before applying the new width and keeps playback position and resume state',async()=>{
  const score=model.createWorkshopDraft('Rotation',4).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('rotate-'+index,0)];});
  const f=fixture(score,{practice:true,playing:true},{}),view=f.view;view.updateWidth();view.position=4000;
  const engraving=view._engraving,before=JSON.stringify(score);
  try{
    for(const playing of [true,false]){
      view.playing=playing;view.beginDrag(f.pointer(view.anchor));view.moveDrag(f.pointer(view.anchor+40));
      assert(view.drag);assert(f.captures.has(1));
      view.$refs.viewport.clientWidth=playing ? 260 : 540;view.updateWidth();await Vue.nextTick();
      assert.strictEqual(view.drag,null);assert.strictEqual(f.captures.size,0);
      assert.deepStrictEqual(f.emitted[f.emitted.length-1],{name:'scrub-end',payload:{position:4000,resume:playing}});
      assert.strictEqual(view.position,4000);assert.strictEqual(view._engraving,engraving);
      assert.strictEqual(view.availableWidth,playing ? 260 : 540);
    }
    assert.strictEqual(JSON.stringify(score),before);
  }finally{f.destroy();}
});

test('resize notifications coalesce and update SVG dimensions outside observer delivery',()=>{
  const previous=global.requestAnimationFrame,callbacks=[];
  global.requestAnimationFrame=callback=>{callbacks.push(callback);return callbacks.length;};
  const f=fixture(model.createWorkshopDraft('Resize').score);
  try {
    f.view.queueWidthUpdate();f.view.queueWidthUpdate();
    assert.strictEqual(callbacks.length,1);assert.strictEqual(f.view.availableWidth,700);
    callbacks.shift()();assert.strictEqual(f.view.availableWidth,390);assert.strictEqual(f.view.resizeFrame,null);
    f.view.$refs.viewport.clientWidth=540;f.view.queueWidthUpdate();callbacks.shift()();assert.strictEqual(f.view.availableWidth,540);
  } finally {f.destroy();if(previous)global.requestAnimationFrame=previous;else delete global.requestAnimationFrame;}
});

test('fullscreen fits portrait and landscape, retains readable minimum on tiny displays, and reuses engraving',async()=>{
  const score=model.createWorkshopDraft('Two staves',8).score;
  score.parts.push({id:'left',clef:'bass',measures:score.parts[0].measures.map((bar,index)=>({id:'left-'+index,events:[note('bass-'+index,0,{step:'C',alter:0,octave:3})]}))});
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('upper-'+index,0)];});
  const f=fixture(score,{practice:true,playing:true,preparationRemaining:1},{}),view=f.view;view.updateWidth();view.position=4000;
  const engraving=view._engraving,before=JSON.stringify(score);view.fullscreen=true;
  try{
    for(const [width,height] of [[390,844],[844,390],[568,260],[260,180]]){
      view.$refs.viewport.clientWidth=width;view.$refs.viewport.clientHeight=height;view.updateWidth();await Vue.nextTick();
      assert.strictEqual(view.availableWidth,width);assert.strictEqual(view.availableHeight,height);
      assert(view.scale>=.4);assert(view.scale<=.7);assert.strictEqual(view.logicalWidth,width/view.scale);
      if((height-24)/view.system.height>=.4) assert(view.system.height*view.scale<=height-24+1e-6);
      assert.strictEqual(view.scoreTop,Math.max(0,(height-view.system.height*view.scale)/2));
      assert.strictEqual(view._engraving,engraving);assert.strictEqual(view.position,4000);
      const rendered=nodes(view._render());
      assert(view.preparationOffset>0);
      assert(!rendered.some(node=>node.data && node.data.staticClass==='practice-countdown'),'there is no numerical overlay');
      assert(!rendered.some(node=>node.data && node.data.staticClass==='piece-info-toggle'));
      assert.strictEqual(rendered.find(node=>node.data && node.data.staticClass==='listening-viewport').data.attrs['aria-modal'],'true');
    }
    // A height-only landscape resize changes the drag coordinate scale too.
    view.beginDrag(f.pointer(view.anchor));assert(f.captures.has(1));
    view.$refs.viewport.clientHeight=300;view.updateWidth();assert.strictEqual(view.drag,null);assert.strictEqual(f.captures.size,0);
    assert.deepStrictEqual(f.emitted[f.emitted.length-1],{name:'scrub-end',payload:{position:4000,resume:true}});
    view.fullscreen=false;view.updateWidth();assert.strictEqual(view.availableHeight,0);
    assert.strictEqual(view.scale,.7*.8);assert.strictEqual(JSON.stringify(score),before);
  }finally{f.destroy();}
});

test('fullscreen toggles safely, traps keyboard focus, and restores the original page overflow on exit and destruction',async()=>{
  const previous=global.document,body={style:{overflow:'auto'}};global.document={body};
  const f=fixture(model.createWorkshopDraft('Focus').score,{practice:true},{}),view=f.view;let focus=0;
  view.$refs.fullscreenButton={focus:()=>{focus++;}};view.$refs.viewport.clientHeight=600;
  const element=(initial={})=>{const attributes=Object.assign({},initial);return {attributes,hasAttribute:key=>Object.prototype.hasOwnProperty.call(attributes,key),getAttribute:key=>Object.prototype.hasOwnProperty.call(attributes,key) ? attributes[key] : null,setAttribute:(key,value)=>{attributes[key]=value;},removeAttribute:key=>{delete attributes[key];}};};
  const controls=element(),existingHidden=element({'inert':'','aria-hidden':'false'}),section=element(),outside=element();
  view.$refs.viewport.parentElement=section;section.children=[view.$refs.viewport,controls,existingHidden];section.parentElement=body;body.children=[section,outside];
  const events=[];view.$on('fullscreen-change',value=>events.push(value));
  try{
    assert.strictEqual(view.exitFullscreen(),false);view.toggleFullscreen();await Vue.nextTick();
    assert.strictEqual(view.fullscreen,true);assert.strictEqual(body.style.overflow,'hidden');assert.strictEqual(focus,1);
    [controls,existingHidden,outside].forEach(node=>{assert(node.hasAttribute('inert'));assert.strictEqual(node.getAttribute('aria-hidden'),'true');});
    assert.deepStrictEqual(section.attributes,{},'the ancestor containing the score stays accessible');
    let prevented=0,stopped=0;
    view.fullscreenKeydown({key:'Tab',preventDefault:()=>prevented++,stopPropagation:()=>stopped++});assert.strictEqual(prevented,1);assert.strictEqual(focus,2);
    view.fullscreenKeydown({key:'Escape',preventDefault:()=>prevented++,stopPropagation:()=>stopped++});await Vue.nextTick();
    assert.strictEqual(view.fullscreen,false);assert.strictEqual(body.style.overflow,'auto');assert.strictEqual(prevented,2);assert.strictEqual(stopped,1);
    assert.deepStrictEqual(controls.attributes,{});assert.deepStrictEqual(outside.attributes,{});assert.deepStrictEqual(existingHidden.attributes,{'inert':'','aria-hidden':'false'});
    assert.deepStrictEqual(events,[true,false]);assert.strictEqual(focus,3);
    view.toggleFullscreen();await Vue.nextTick();view.restoreFullscreenPage();assert.strictEqual(body.style.overflow,'auto');
    view.restoreFullscreenPage();assert.strictEqual(body.style.overflow,'auto');
    view.practice=false;view.fullscreen=false;view.toggleFullscreen();assert.strictEqual(view.fullscreen,false);
  }finally{view.restoreFullscreenPage();f.destroy();if(previous) global.document=previous;else delete global.document;}
});

test('single-bar selection stays within the chosen range and uses its rebased start times',()=>{
  const score=model.createWorkshopDraft('Bar selection',8).score;
  score.parts[0].measures.forEach((bar,index)=>{bar.events=[note('bar-'+index,0)];});
  const plan=createWorkshopPracticePlan(score,{range:{startBar:3,endBar:5}});
  const f=fixture(score,{practice:true,timeline:plan.timeline,linearPractice:true},{}),view=f.view;
  try {
    assert.strictEqual(view.barMinimum,4);assert.strictEqual(view.barMaximum,6);
    for(const [input,expected] of [[1,0],[4,0],[5,plan.timeline.measures[1].startMs],[99,plan.timeline.measures[2].startMs]]) {
      view.jumpToBar({target:{value:String(input)}});assert.deepStrictEqual(f.emitted.pop(),{name:'seek',payload:expected});
    }
    view.fullscreen=true;view.$refs.viewport.clientWidth=1024;view.$refs.viewport.clientHeight=768;view.updateWidth();
    assert(view.system.height*view.scale<=768);view.fullscreen=false;assert.strictEqual(view.scoreTop,0);
  } finally {f.destroy();}
});
test('fullscreen Tab cycles visible controls while excluding the hidden play-line handle',()=>{
  const previous=global.document;global.document={activeElement:null};
  const f=fixture(model.createWorkshopDraft('Fullscreen focus').score,{practice:true},{}),view=f.view;
  const control=(tabindex=null)=>({getAttribute:()=>tabindex,getClientRects:()=>[{}],focus(){document.activeElement=this;}});
  const first=control(),loop=control(),hidden=control('-1'),exit=control();
  view.$refs.viewport.querySelectorAll=()=>[first,loop,hidden,exit];view.fullscreen=true;
  try {
    document.activeElement=first;view.fullscreenKeydown({key:'Tab',preventDefault(){}});assert.strictEqual(document.activeElement,loop);
    view.fullscreenKeydown({key:'Tab',preventDefault(){}});assert.strictEqual(document.activeElement,exit);
    view.fullscreenKeydown({key:'Tab',preventDefault(){}});assert.strictEqual(document.activeElement,first);
    view.fullscreenKeydown({key:'Tab',shiftKey:true,preventDefault(){}});assert.strictEqual(document.activeElement,exit);
  } finally {f.destroy();if(previous)global.document=previous;else delete global.document;}
});
(async()=>{for(const [name,run] of tests) {await run();process.stdout.write('✓ '+name+'\n');}process.stdout.write(tests.length+' workshop listening layout tests passed.\n');})().catch(error=>{console.error(error);process.exitCode=1;});
