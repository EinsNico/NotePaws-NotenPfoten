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
const {workshopStreamXAtTime,workshopStreamTimeAtX}=require('../src/model/WorkshopStreamPosition');
const {workshopKeySignature}=require('../src/model/WorkshopTonality');
const {importWorkshopMusicXmlText}=require('../src/model/WorkshopMusicXml');
const nodes=node=>[node].concat(...(node.children||[]).map(nodes));
const note=(id,startSlot=0,pitch={step:'C',alter:0,octave:4},extra={})=>Object.assign({id,kind:'note',noteValue:'quarter',startSlot,pitch},extra);
const plain=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-7,(message||'')+' '+actual+' differs from '+expected);
function fixture(score,width=390,extra={}){
  assert(model.isValidWorkshopScore(score));
  const timeline=createWorkshopPlayback(score,{}).getTimeline();
  const view=new Vue(Object.assign({},definition,{mounted:undefined,beforeDestroy:undefined,
    propsData:Object.assign({score,timeline,practice:true},extra),components:{WorkshopStaff:staff},
    methods:Object.assign({},definition.methods,{$t:key=>key})}));
  view.$refs.viewport={clientWidth:width};view.updateWidth();
  return {view,timeline,destroy:()=>view.$destroy()};
}
function boundaryScore(keyId='E-major',secondStaff=false){
  let score=model.createWorkshopDraft('Context handoff',3).score;score.keyId=keyId;
  if(secondStaff)score=model.setWorkshopSecondStaffEnabled(score,true);
  score.parts.forEach((part,partIndex)=>part.measures.forEach((bar,index)=>{
    bar.events=[0,2,4,6].map(slot=>note('handoff-'+partIndex+'-'+index+'-'+slot,slot,{step:'E',alter:0,octave:partIndex ? 3 : 4}));
    if(index===1)bar.clef=partIndex ? 'treble' : 'bass';
  }));
  return score;
}
function row(view,partIndex=0){return view.fixedContexts.find(entry=>entry.partIndex===partIndex);}
function rendered(view){return nodes(view._render());}
function fixedRow(view,partIndex=0){return rendered(view).find(node=>node.data&&node.data.attrs&&node.data.attrs['data-fixed-staff']===partIndex);}
function movingGroup(view,change){return rendered(view).find(node=>node.data&&node.data.attrs&&node.data.attrs['data-moving-context']===change.id);}
function previewGroup(view,change){return rendered(view).find(node=>node.data&&node.data.attrs&&node.data.attrs['data-preview-context']===change.id);}
function fieldGroup(parent,field){return parent&&nodes(parent).find(node=>node.data&&node.data.attrs&&node.data.attrs['data-context-field']===field);}
function opacity(node){
  assert(node,'expected rendered context group');
  const value=node.data&&node.data.attrs&&node.data.attrs.opacity;
  const styleValue=node.data&&node.data.style&&node.data.style.opacity;
  return value===undefined ? styleValue===undefined ? 1 : Number(styleValue) : Number(value);
}
function ink(parent){
  assert(parent,'expected context field');
  return nodes(parent).filter(node=>['path','text','g'].includes(node.tag)).map(node=>({tag:node.tag,
    attrs:Object.entries(node.data&&node.data.attrs||{}).filter(([key])=>['d','x','y','transform','data-clef-octave'].includes(key)),
    text:(node.children||[]).filter(child=>child.text!==undefined).map(child=>child.text).join('')}));
}
function seekX(view,x){
  view.position=workshopStreamTimeAtX(view.layout,x);
  near(workshopStreamXAtTime(view.layout,view.position),x,'inverse seek must retain the chosen handoff coordinate');
}
function band(view,change){
  const origins=[];
  if(change.fields.includes('clef'))origins.push(change.clefX);
  if(change.fields.includes('keyId')||change.fields.includes('clef'))origins.push(change.keyX);
  if(change.fields.includes('meter'))origins.push(change.meterX);
  const leading=Math.min(...origins),end=Math.max(view.anchor-view.noteClipInset+4*view.contextScale,view.anchor+leading-change.applyX);
  const finish=view.anchor+leading-end;
  return {start:finish-36*view.contextScale,finish};
}
function seekProgress(view,change,progress){const range=band(view,change);seekX(view,range.start+(range.finish-range.start)*progress);}
const tests=[];function test(name,run){tests.push([name,run]);}

test('clef and repeated key crossfade together before the incoming signs can be clipped, while the unchanged meter stays visible',()=>{
  const f=fixture(boundaryScore()),view=f.view,change=view.contexts.changes.find(entry=>entry.partIndex===0&&entry.fields.includes('clef'));
  try{
    const engraving=view._engraving,timeline=JSON.stringify(f.timeline),range=band(view,change);
    for(const spatial of [0,.2,.5,.8,1]){
      const progress=spatial*spatial*(3-2*spatial);seekProgress(view,change,spatial);
      near(view.contextHandoffProgress(change),progress,'geometric crossfade progress');
      near(view.incomingContextOpacity(change),1-progress,'incoming signs fade before clipping');
      near(view.fixedContextOpacity(row(view),'clef'),1-progress,'old clef fades in step');
      near(view.fixedContextOpacity(row(view),'keyId'),1-progress,'old key heights fade with their clef');
      near(view.fixedContextOpacity(row(view),'meter'),1,'unchanged meter remains present');
      const fixed=fixedRow(view),incoming=movingGroup(view,change);
      near(opacity(fieldGroup(fixed,'clef')),1-progress);near(opacity(fieldGroup(fixed,'keyId')),1-progress);
      near(opacity(fieldGroup(fixed,'meter')),1);
      assert.strictEqual(incoming.data.attrs['clip-path'],'url(#'+view.clipId+')','context signs never cross the fixed meter');
      near(opacity(incoming),1-progress);
      if(progress>0){const preview=previewGroup(view,change);near(opacity(preview),progress);assert(fieldGroup(preview,'clef'));assert(fieldGroup(preview,'keyId'));assert(!fieldGroup(preview,'meter'));}
      assert.strictEqual(row(view).context.clef,'treble','visual preview does not move the semantic clef change earlier');
      assert.strictEqual(view._engraving,engraving);assert.strictEqual(JSON.stringify(f.timeline),timeline);
      const children=rendered(view).filter(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff');
      assert(children.every(node=>node.componentOptions.propsData.noteClipPath.startsWith('url(#'+view.streamNoteClipId+'-')),'note-owned clipping is retained');
    }
    assert(range.finish<=change.applyX,'preview is complete by the written head');
    seekX(view,range.finish);assert(change.clefX+view.translation>=view.anchor-view.noteClipInset+4*view.contextScale-1e-7,'fade ends before the clef reaches the clipping edge');
  }finally{f.destroy();}
});

test('actual Moonlight boundary and in-bar changes use identical stationary ink immediately before and after semantic handoff',()=>{
  const score=importWorkshopMusicXmlText(fs.readFileSync(path.join(__dirname,'fixtures/workshop-moonlight-bars-21-23.musicxml'),'utf8')).score;
  const before=JSON.stringify(score),f=fixture(score),view=f.view;
  try{
    const changes=view.contexts.changes.filter(change=>change.partIndex===0&&change.fields.includes('clef'));
    assert(changes.length>=2,'fixture includes the boundary and later in-bar clef');
    for(const change of changes){
      seekX(view,change.applyX-1e-4);
      const preview=previewGroup(view,change);assert(preview,'target is already visible before the first written head');near(opacity(preview),1);
      const oldClef=row(view).context.clef;assert.notStrictEqual(oldClef,change.context.clef);
      const expected={clef:ink(fieldGroup(preview,'clef')),keyId:ink(fieldGroup(preview,'keyId'))};
      seekX(view,change.applyX+1e-4);assert.strictEqual(row(view).context.clef,change.context.clef);
      const fixed=fixedRow(view);assert.deepStrictEqual(ink(fieldGroup(fixed,'clef')),expected.clef);assert.deepStrictEqual(ink(fieldGroup(fixed,'keyId')),expected.keyId);
      assert(!previewGroup(view,change),'the same docked shape passes into the current header');
    }
    assert.strictEqual(JSON.stringify(score),before);
  }finally{f.destroy();}
});

test('key cancellations fade from the stream into final stationary signatures, including an empty C-major target',()=>{
  for(const [initial,target] of [['D-major','C-major'],['E-major','D-flat-major'],['C-major','E-major']]){
    const score=boundaryScore(initial);delete score.parts[0].measures[1].clef;score.parts[0].measures[1].keyId=target;
    const f=fixture(score),view=f.view,change=view.contexts.changes.find(entry=>entry.fields.includes('keyId'));
    try{
      seekProgress(view,change,.5);assert.strictEqual(row(view).context.keyId,initial);
      near(view.fixedContextOpacity(row(view),'clef'),1);near(view.fixedContextOpacity(row(view),'meter'),1);near(view.fixedContextOpacity(row(view),'keyId'),.5);
      const preview=previewGroup(view,change);assert(!fieldGroup(preview,'clef'));assert(!fieldGroup(preview,'meter'));
      const signature=fieldGroup(preview,'keyId'),paths=nodes(signature).filter(node=>node.tag==='path');
      const targetSignature=workshopKeySignature(target,change.context.clef);
      assert.strictEqual(paths.length,targetSignature.length,'stationary preview omits cancellation naturals');
      if(initial!=='C-major')assert(view.movingSignature(change).some(pitch=>pitch.alter===0),'moving original change still contains its cancellation signs');
      seekX(view,change.applyX-1e-4);const targetInk=ink(fieldGroup(previewGroup(view,change),'keyId'));
      seekX(view,change.applyX+1e-4);assert.strictEqual(row(view).context.keyId,target);assert.deepStrictEqual(ink(fieldGroup(fixedRow(view),'keyId')),targetInk);
    }finally{f.destroy();}
  }
});

test('simultaneous clef, octave, dense key and wide meter retain matched dock geometry on narrow screens',()=>{
  for(const width of [160,240,390,900]){
    const score=boundaryScore('C-sharp-major');score.parts[0].measures[1].clef='bass';score.parts[0].measures[1].clefOctave=-1;score.parts[0].measures[1].keyId='C-flat-major';score.parts[0].measures[1].meter='12/8';
    const f=fixture(score,width),view=f.view,change=view.contexts.changes.find(entry=>entry.fields.includes('meter'));
    try{
      if(width===160)assert(view.headerFit<1,'fixture exercises horizontal header compaction');
      seekProgress(view,change,.5);const fixed=fixedRow(view),preview=previewGroup(view,change);
      for(const field of ['clef','keyId','meter']){near(view.fixedContextOpacity(row(view),field),.5);near(opacity(fieldGroup(fixed,field)),.5);assert(fieldGroup(preview,field));}
      seekX(view,change.applyX-1e-4);const target=previewGroup(view,change),expected={};
      for(const field of ['clef','keyId','meter'])expected[field]=ink(fieldGroup(target,field));
      assert(nodes(target).some(node=>node.data&&node.data.attrs&&node.data.attrs['data-clef-octave']===-1),'octave text accompanies the preview clef');
      seekX(view,change.applyX+1e-4);
      for(const field of ['clef','keyId','meter'])assert.deepStrictEqual(ink(fieldGroup(fixedRow(view),field)),expected[field]);
    }finally{f.destroy();}
  }
});

test('octave-only clef changes crossfade the octave text with the clef and signature without changing the written onset',()=>{
  const score=boundaryScore('G-major');score.parts[0].measures[1].clef='treble';score.parts[0].measures[1].clefOctave=1;
  const f=fixture(score),view=f.view,change=view.contexts.changes.find(entry=>entry.context.clefOctave===1);
  try{
    assert.deepStrictEqual(plain(change.fields),['clef']);seekProgress(view,change,.5);
    near(view.fixedContextOpacity(row(view),'keyId'),.5);near(view.fixedContextOpacity(row(view),'meter'),1);
    assert.strictEqual(row(view).context.clefOctave||0,0);
    const target=previewGroup(view,change);assert(nodes(fieldGroup(target,'clef')).some(node=>node.data&&node.data.attrs&&node.data.attrs['data-clef-octave']===1));
    seekX(view,change.applyX);assert.strictEqual(row(view).context.clefOctave,1);
  }finally{f.destroy();}
});

test('rapid changes select the nearest incoming context independently for each staff',()=>{
  const score=boundaryScore('E-major',true);
  score.parts.forEach((part,index)=>{
    part.measures[0].events=[0,1,2,3].map(slot=>note('rapid-'+index+'-'+slot,slot,{step:'E',alter:0,octave:index ? 3 : 4},{noteValue:'sixteenth'}));
    part.measures[0].contextChanges=index ? [{id:'lower-key',startSlot:2,keyId:'G-major'}] : [{id:'first-clef',startSlot:1,clef:'bass'},{id:'upper-key',startSlot:2,keyId:'G-major'},{id:'second-clef',startSlot:3,clef:'treble'}];
  });
  const f=fixture(score),view=f.view;
  try{
    const upper=view.contexts.changes.filter(entry=>entry.partIndex===0&&entry.fields.includes('clef')&&entry.applyX<view.layout.bars[1].x),first=upper[0],second=upper[1];
    assert(first&&second);seekProgress(view,first,.5);
    const selected=view.previewContexts.filter(entry=>entry.change.partIndex===0);assert.strictEqual(selected.length,1);assert.strictEqual(selected[0].change.id,first.id);
    near(view.incomingContextOpacity(first),.5);near(view.incomingContextOpacity(second),1,'future change cannot fade or dock ahead of the nearest one');
    assert(!previewGroup(view,second));assert(view.previewContexts.every(entry=>view.contexts.changes.filter(change=>change.partIndex===entry.change.partIndex&&change.applyX>view.cursorX)[0].id===entry.change.id));
    seekProgress(view,second,.5);assert.strictEqual(view.previewContexts.find(entry=>entry.change.partIndex===0).change.id,second.id);
    assert.strictEqual(row(view).context.clef,'bass');near(view.fixedContextOpacity(row(view,1),'clef'),1,'upper clef handoff leaves lower clef intact');
  }finally{f.destroy();}
});

test('backward seeks restore the exact crossfade without timers, cache rebuilds or score and timeline mutations',()=>{
  const score=boundaryScore('E-major',true),before=JSON.stringify(score),f=fixture(score),view=f.view;
  try{
    const change=view.contexts.changes.find(entry=>entry.partIndex===0),engraving=view._engraving,timeline=JSON.stringify(f.timeline);
    seekProgress(view,change,.5);const position=view.position,initial=ink(previewGroup(view,change)),opacityBefore=view.fixedContextOpacity(row(view),'clef');
    seekX(view,change.applyX+20);assert.strictEqual(row(view).context.clef,'bass');
    view.position=position;assert.strictEqual(row(view).context.clef,'treble');assert.deepStrictEqual(ink(previewGroup(view,change)),initial);near(view.fixedContextOpacity(row(view),'clef'),opacityBefore);
    view.position=0;assert(!view.previewContexts.length);near(view.fixedContextOpacity(row(view),'clef'),1);
    assert.strictEqual(view._engraving,engraving);assert.strictEqual(JSON.stringify(score),before);assert.strictEqual(JSON.stringify(f.timeline),timeline);
  }finally{f.destroy();}
});

(async()=>{let failures=0;for(const [name,run] of tests){try{await run();process.stdout.write('✓ '+name+'\n');}catch(error){failures++;process.stderr.write('✗ '+name+'\n'+error.stack+'\n');}}
  if(failures)process.exitCode=1;else process.stdout.write(tests.length+' workshop context handoff tests passed.\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
