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
const staff=component('WorkshopStaff'),listening=component('WorkshopListening'),model=require('../src/model/Workshop');
const {createWorkshopPlayback}=require('../src/model/WorkshopPlayback');
const {workshopStreamTimeAtX}=require('../src/model/WorkshopStreamPosition');
function records(node,parents=[]){return [{node,parents}].concat(...(node.children||[]).map(child=>records(child,parents.concat(node))));}
function nodes(node){return records(node).map(entry=>entry.node);}
function hasClass(node,name){return !!(node.data&&((node.data.staticClass||'').split(' ').includes(name)||node.data.class&&node.data.class[name]));}
function clipReference(node){return node.data&&node.data.attrs&&node.data.attrs['clip-path'];}
function clippedBy(entry,id){return entry.parents.concat(entry.node).some(node=>clipReference(node)==='url(#'+id+')');}
function rectangles(rendered,id){
  const clip=nodes(rendered).find(node=>node.tag==='clipPath'&&node.data.attrs.id===id);assert(clip,'missing clip '+id);
  return nodes(clip).filter(node=>node.tag==='rect').map(node=>Object.fromEntries(['x','y','width','height'].map(key=>[key,Number(node.data.attrs[key]||0)])));
}
function referencedClipId(path){assert(/^url\(#.+\)$/.test(path),'expected a stable SVG clip reference');return path.slice(5,-1);}
function contains(rect,x,y){return x>=rect.x&&x<=rect.x+rect.width&&y>=rect.y&&y<=rect.y+rect.height;}
function pointPasses(rects,x,y){return rects.some(rect=>rect.width>0&&rect.height>0&&contains(rect,x,y));}
function note(id,startSlot,pitch,extra={}){return Object.assign({id,kind:'note',startSlot,noteValue:'quarter',pitch},extra);}
function scoreFixture(){
  const score=model.createWorkshopDraft('Annotations',3).score;
  score.parts.push({id:'left',clef:'bass',measures:score.parts[0].measures.map((bar,index)=>({id:'lower-bar-'+index,events:[]}))});
  score.parts.forEach((part,partIndex)=>part.measures.forEach((bar,index)=>{
    bar.events=[note('a-'+partIndex+'-'+index,0,{step:'C',alter:0,octave:partIndex?1:7},{voice:1,fingerings:[{value:'1',placement:'above'},{value:'5',placement:'below'}],articulations:['staccato'],ornament:'turn',pedal:'down'}),
      note('b-'+partIndex+'-'+index,2,{step:'G',alter:0,octave:partIndex?2:5}),note('c-'+partIndex+'-'+index,4,{step:'E',alter:0,octave:partIndex?2:5})];
    bar.directions=[{id:'tempo-'+partIndex+'-'+index,type:'tempo',startSlot:0,value:90},{id:'text-'+partIndex+'-'+index,type:'text',startSlot:0,value:'Allegro con moto'},
      {id:'dynamic-'+partIndex+'-'+index,type:'dynamic',startSlot:0,value:'mp'},{id:'pedal-'+partIndex+'-'+index,type:'pedal',startSlot:0,value:'down'}];
  }));
  score.parts[0].measures[1].clef='bass';score.parts.forEach(part=>{part.measures[1].meter='3/4';});
  return score;
}
function viewFixture(score,extra={}){
  assert(model.isValidWorkshopScore(score));const timeline=createWorkshopPlayback(score,{}).getTimeline();
  const view=new Vue(Object.assign({},listening,{mounted:undefined,beforeDestroy:undefined,propsData:Object.assign({score,timeline,practice:true},extra),
    components:{WorkshopStaff:staff},methods:Object.assign({},listening.methods,{$t:key=>key})}));
  view.$refs.viewport={clientWidth:390};view.updateWidth();return {view,timeline,destroy:()=>view.$destroy()};
}
function renderStaff(props){return new Vue(Object.assign({},staff,{mounted:undefined,beforeDestroy:undefined,propsData:props,methods:Object.assign({},staff.methods,{$t:key=>key})}));}
function staffChildren(view){return nodes(view._render()).filter(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff');}
const tests=[];function test(name,run){tests.push([name,run]);}

test('practice keeps the annotation lane above, between and below staves while masking only the fixed staff bands',()=>{
  const score=scoreFixture(),before=JSON.stringify(score),f=viewFixture(score),view=f.view,rendered=view._render();
  try{
    const clips=rectangles(rendered,view.streamClipId),boundary=view.anchor-view.noteClipInset,left=boundary/2,right=boundary+1;
    const stream=nodes(rendered).find(node=>node.tag==='g'&&clipReference(node)==='url(#'+view.streamClipId+')');
    assert(stream&&nodes(stream).some(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff'));
    const ranges=view.system.frames.map(frame=>({top:frame.y-frame.top+76,bottom:frame.y-frame.top+156}));
    // Sampling actual SVG coordinates catches accidental use of frame.y alone:
    // expressive geometry makes frame.top non-zero and different in each row.
    assert(view.system.frames.some(frame=>frame.top!==0));
    for(let y=.5;y<view.system.height;y+=1){
      const onStaff=ranges.some(range=>y>range.top&&y<range.bottom);
      assert.strictEqual(pointPasses(clips,left,y),!onStaff,'left annotation clipping at global y='+y);
      assert(pointPasses(clips,right,y),'notes to the right must remain visible at global y='+y);
    }
    const headers=records(rendered).filter(entry=>hasClass(entry.node,'header-paper'));assert.strictEqual(headers.length,ranges.length);
    headers.forEach(entry=>{
      assert.strictEqual(Number(entry.node.data.attrs.y),76);assert.strictEqual(Number(entry.node.data.attrs.height),80);
      assert(entry.parents.some(node=>node.data&&node.data.attrs&&String(node.data.attrs.transform||'').startsWith('translate(0 ')),'paper belongs to its fixed staff transform');
    });
    assert.strictEqual(JSON.stringify(score),before);
  }finally{f.destroy();}
});

test('ledger notes and fingerings vanish at the header while tempo, text, pedal and articulations continue through its outer lanes',()=>{
  const score=scoreFixture(),before=JSON.stringify(score),f=viewFixture(score),view=f.view;
  try{
    const firstBar=view.layout.bars[0],firstChild=renderStaff(staffChildren(view)[0].componentOptions.propsData),firstX=firstChild.events.find(event=>event.id==='a-0-0').x;
    firstChild.$destroy();const boundary=view.anchor-view.noteClipInset;
    view.position=workshopStreamTimeAtX(view.layout,firstBar.x+firstX+view.anchor-boundary/2);
    const parentRendered=view._render(),union=rectangles(parentRendered,view.streamClipId);let above=0,below=0;
    for(const node of staffChildren(view).filter(node=>node.componentOptions.propsData.barIndex===0)){
      const props=node.componentOptions.propsData,partIndex=props.staffIndex,child=renderStaff(props),rendered=child._render(),entries=records(rendered);
      try{
        const clipId=referencedClipId(props.noteClipPath),local=rectangles(parentRendered,clipId),event=child.events.find(event=>event.id==='a-'+partIndex+'-0');
        assert.strictEqual(local[0].x,boundary-firstBar.x-view.translation);
        const globalX=firstBar.x+event.x+view.translation,offset=view.system.frames[partIndex].y-view.system.frames[partIndex].top;
        assert(globalX>0&&globalX<boundary,'fixture places passed notes inside the fixed header');
        assert(event.y<76||event.y>156,'high or low ledger note lies outside its staff');
        assert(!pointPasses(local,event.x,event.y),'ledger note must disappear even though its y lies in an annotation lane');
        for(const name of ['note-head','ledger','fingering','notation-stem']){
          const matching=entries.filter(entry=>hasClass(entry.node,name));assert(matching.length,'fixture lacks '+name);
          assert(matching.every(entry=>clippedBy(entry,clipId)),name+' must use the horizontal note clip');
        }
        for(const name of ['score-direction','expression-mark','notation-mark','pedal']){
          const matching=entries.filter(entry=>hasClass(entry.node,name));assert(matching.length,'fixture lacks '+name);
          assert(matching.every(entry=>!clippedBy(entry,clipId)),name+' must stay outside the note clip');
        }
        const marks=child.directionMarks.filter(mark=>['tempo','text','dynamic','pedal'].includes(mark.type));
        assert.strictEqual(new Set(marks.map(mark=>mark.type)).size,4);
        for(const mark of marks){
          const x=firstBar.x+mark.x+view.translation,y=offset+mark.y;
          assert(x>=0&&x<boundary,'direction has passed into the header area');
          assert(pointPasses(union,x,y),mark.type+' should continue visibly beside the fixed header');
          if(mark.y<76)above++;if(mark.y>156)below++;
        }
        for(const mark of event.expressionMarks.concat(event.notationMarks))assert(pointPasses(union,globalX,offset+mark.y),'outside articulation/ornament survives the header');
        assert(event.fingeringMarks.every(mark=>!pointPasses(local,mark.x,mark.y)),'all fingerings disappear with their passed note');
      }finally{child.$destroy();}
    }
    assert(above&&below,'fixture verifies both annotation lanes');assert.strictEqual(JSON.stringify(score),before);
  }finally{f.destroy();}
});

test('local clipping follows scrolling, seeking and narrow responsive fields without changing music or timelines',async()=>{
  const score=scoreFixture(),before=JSON.stringify(score),f=viewFixture(score),view=f.view,timelineBefore=JSON.stringify(f.timeline),frames=JSON.stringify(view.system.frames);
  try{
    for(const width of [200,260,390,700]){
      view.$refs.viewport.clientWidth=width;view.updateWidth();await Vue.nextTick();
      for(const position of [0,f.timeline.measures[1].startMs-1,f.timeline.measures[1].startMs,view.duration]){
        view.position=position;const rendered=view._render(),boundary=view.anchor-view.noteClipInset;
        assert.strictEqual(JSON.stringify(view.system.frames),frames,'responsive width and seeking preserve vertical notation frames');
        staffChildren(view).forEach(node=>{
          const props=node.componentOptions.propsData,bar=view.layout.bars.find(candidate=>candidate.index===props.barIndex),frame=view.system.frames[bar.parts.findIndex(part=>part.partIndex===props.staffIndex)],child=renderStaff(props);
          try{
            assert.strictEqual(props.noteClipPath,'url(#'+view.staffNoteClipId(bar,props.staffIndex)+')');
            assert.strictEqual(props.noteClipLeft,undefined,'changing clip coordinates must stay in the parent, avoiding whole-staff rerenders');
            const rect=rectangles(rendered,referencedClipId(props.noteClipPath))[0],left=boundary-bar.x-view.translation;
            assert.strictEqual(rect.x,left);assert.strictEqual(rect.y,frame.top);
            assert.strictEqual(rect.width,Math.max(0,bar.width-left));assert.strictEqual(rect.height,frame.height);
            assert(!nodes(child._render()).some(node=>node.tag==='clipPath'),'staff keeps stable external clipping rather than position-bound definitions');
          }finally{child.$destroy();}
        });
        const context=nodes(rendered).filter(node=>hasClass(node,'moving-context'));assert(context.every(node=>clipReference(node)==='url(#'+view.clipId+')'),'moving clef and meter keep their original full-height clipping');
        if(position===f.timeline.measures[1].startMs){
          const fixed=nodes(rendered).find(node=>node.data&&node.data.attrs&&node.data.attrs['data-fixed-staff']===0);
          assert.strictEqual(fixed.data.attrs['data-clef'],'bass');assert.strictEqual(fixed.data.attrs['data-meter'],'3/4');
        }
      }
    }
    view.drag={position:1500,line:true,translation:-137};
    staffChildren(view).forEach(node=>{
      const props=node.componentOptions.propsData,bar=view.layout.bars.find(candidate=>candidate.index===props.barIndex);
      const rect=rectangles(view._render(),referencedClipId(props.noteClipPath))[0];
      assert.strictEqual(rect.x,view.anchor-view.noteClipInset-bar.x+137,'line scrubbing uses its temporary stream translation');
    });
    assert.strictEqual(JSON.stringify(score),before);assert.strictEqual(JSON.stringify(f.timeline),timelineBefore);
  }finally{view.drag=null;f.destroy();}
});

test('normal listening and editing retain their uncut notation and fingerings',()=>{
  const score=scoreFixture(),before=JSON.stringify(score),f=viewFixture(score,{practice:false});
  try{
    assert(!nodes(f.view._render()).some(node=>node.tag==='clipPath'));
    for(const node of staffChildren(f.view)){
      assert.strictEqual(node.componentOptions.propsData.noteClipPath,null);
      const child=renderStaff(node.componentOptions.propsData);
      try{assert(!nodes(child._render()).some(node=>node.tag==='clipPath'));assert(nodes(child._render()).some(node=>hasClass(node,'fingering')));}finally{child.$destroy();}
    }
    const editor=renderStaff({measure:score.parts[0].measures[0],clef:'treble',readOnly:false});
    try{assert.strictEqual(editor.noteClipPath,null);assert(!nodes(editor._render()).some(node=>node.tag==='clipPath'));assert(nodes(editor._render()).some(node=>hasClass(node,'note-target')));}finally{editor.$destroy();}
    assert.strictEqual(JSON.stringify(score),before);
  }finally{f.destroy();}
});

test('cross-staff beams and stems keep the full-height note cutoff inside the open annotation lanes',()=>{
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Cross-staff cutoff',2).score,true);
  score.parts[0].measures[0].events=[note('cross-upper',0,{step:'E',alter:0,octave:5},{noteValue:'eighth',beamGroupId:'bridge'}),
    note('cross-lower',1,{step:'A',alter:0,octave:3},{noteValue:'eighth',beamGroupId:'bridge',displayStaff:1})];
  const before=JSON.stringify(score),f=viewFixture(score),view=f.view;
  try{
    const bar=view.layout.bars[0],source=view.sourceSystem.bars[bar.index],cross=bar.crossStaff;
    assert(cross.stems.length&&cross.beams.length,'fixture renders a real beam spanning both staves');
    const first=cross.stems[0],shift=bar.x-source.x,boundary=view.anchor-view.noteClipInset;
    view.position=workshopStreamTimeAtX(view.layout,first.x+shift+view.anchor-boundary/2);
    const rendered=view._render(),clip=rectangles(rendered,view.streamNoteClipId)[0];
    assert.strictEqual(clip.x,boundary-view.translation);assert.strictEqual(clip.y,0);assert.strictEqual(clip.height,view.system.height);
    const notation=records(rendered).filter(entry=>['cross-staff-stem','cross-staff-beam','cross-staff-curve'].some(name=>hasClass(entry.node,name)));
    assert(notation.length);assert(notation.every(entry=>clippedBy(entry,view.streamNoteClipId)));
    assert(!pointPasses([clip],first.x+shift,first.y1),'passed cross-staff stem must disappear for every vertical position');
    assert.strictEqual(JSON.stringify(score),before);
  }finally{f.destroy();}
});

test('scroll ticks keep stable staff clip references and repeated timeline occurrences use unique definitions',async()=>{
  const score=scoreFixture();score.parts.forEach(part=>{part.measures[0].repeatStart=true;part.measures[1].repeatEnd=2;});
  const before=JSON.stringify(score),f=viewFixture(score),view=f.view;
  try{
    assert(f.timeline.measures.length>score.parts[0].measures.length,'fixture expands written repeats');
    view.$refs.viewport.clientWidth=4000;view.updateWidth();await Vue.nextTick();
    const firstRender=view._render(),originalRefs=new Map(),originalX=new Map();
    staffChildren(view).forEach(node=>{
      const props=node.componentOptions.propsData,id=referencedClipId(props.noteClipPath);
      assert(!originalRefs.has(id),'each timeline occurrence and staff gets a separate clip ID');originalRefs.set(id,props.noteClipPath);
      originalX.set(id,rectangles(firstRender,id)[0].x);
    });
    const repeatedBars=view.layout.bars.filter(bar=>bar.index===0);assert(repeatedBars.length>1);
    const repeatIds=repeatedBars.map(bar=>view.staffNoteClipId(bar,0));assert.strictEqual(new Set(repeatIds).size,repeatIds.length);
    for(const position of [100,500,f.timeline.measures[1].startMs,f.timeline.measures[2].startMs]){
      view.position=position;const rendered=view._render(),ids=nodes(rendered).filter(node=>node.tag==='clipPath').map(node=>node.data.attrs.id);
      assert.strictEqual(new Set(ids).size,ids.length,'SVG definitions remain unique while repeated bars scroll');
      let moved=0;
      staffChildren(view).forEach(node=>{
        const props=node.componentOptions.propsData,id=referencedClipId(props.noteClipPath);
        assert.strictEqual(props.noteClipPath,originalRefs.get(id),'scrolling only updates parent rectangles; the staff receives the same clip string');
        if(rectangles(rendered,id)[0].x!==originalX.get(id))moved++;
      });
      assert(moved,'scrolling updates the actual clipping rectangle despite stable child props');
    }
    assert.strictEqual(JSON.stringify(score),before);
  }finally{f.destroy();}
});

(async()=>{let failures=0;for(const [name,run] of tests){try{await run();process.stdout.write('✓ '+name+'\n');}catch(error){failures++;process.stderr.write('✗ '+name+'\n'+error.stack+'\n');}}
  if(failures)process.exitCode=1;else process.stdout.write(tests.length+' workshop practice annotation clipping tests passed.\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
