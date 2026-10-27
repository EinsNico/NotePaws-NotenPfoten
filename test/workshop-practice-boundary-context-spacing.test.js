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
const {workshopStreamContextsAtX}=require('../src/model/WorkshopStreamContext');
const {workshopStreamTimeAtX}=require('../src/model/WorkshopStreamPosition');
const {workshopKeySignature}=require('../src/model/WorkshopTonality');
const {workshopAccidentalInk,workshopAccidentalPath}=require('../src/model/WorkshopAccidentalGlyphs');
const {workshopRestInk}=require('../src/model/WorkshopRestLayout');
const {createWorkshopSheetSystems}=require('../src/components/WorkshopSheetLayout');
const {importWorkshopMusicXmlText}=require('../src/model/WorkshopMusicXml');
const Glyphs=require('abcjs/src/write/creation/glyphs');
function equivalentPathGeometry(actual, expected) {
  const tokens = value => value.match(/[a-df-zA-DF-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g) || [];
  const left = tokens(actual), right = tokens(expected);
  return left.length === right.length && left.every((token, index) =>
    Number.isFinite(Number(token)) ? Number.isFinite(Number(right[index])) && Math.abs(Number(token) - Number(right[index])) < 1e-8 : token === right[index]);
}
const ACCEPTED={practiceNoteZoom:.65,practiceZoom:.7,practiceContextZoom:.95};
const PROFILES=[ACCEPTED,{practiceNoteZoom:.5,practiceZoom:.5,practiceContextZoom:1.5},
  {practiceNoteZoom:1.5,practiceZoom:2,practiceContextZoom:.5},{practiceNoteZoom:.8,practiceZoom:.9,practiceContextZoom:1.05}];
const plain=value=>JSON.parse(JSON.stringify(value));
const nodes=node=>[node].concat(...(node.children||[]).map(nodes));
const note=(id,pitch={step:'C',alter:0,octave:4},extra={})=>Object.assign({id,kind:'note',noteValue:'quarter',startSlot:0,pitch},extra);
function fixture(score,profile=ACCEPTED,extra={}){
  assert(model.isValidWorkshopScore(score));
  const timeline=createWorkshopPlayback(score,{}).getTimeline();
  const view=new Vue(Object.assign({},definition,{mounted:undefined,beforeDestroy:undefined,
    data(){return Object.assign({},definition.data.call(this),profile);},
    propsData:Object.assign({score,timeline,practice:true},extra),components:{WorkshopStaff:staff},
    computed:Object.assign({},definition.computed,{practiceResponsiveScale:()=>1}),
    methods:Object.assign({},definition.methods,{$t:key=>key})}));
  view.$refs.viewport={clientWidth:390};view.updateWidth();
  return {view,timeline,destroy:()=>view.$destroy()};
}
function renderStaff(props){return new Vue(Object.assign({},staff,{mounted:undefined,beforeDestroy:undefined,propsData:props,methods:Object.assign({},staff.methods,{$t:key=>key})}));}
function state(view,x,partIndex=0){return plain(workshopStreamContextsAtX(view.contexts,x).find(row=>row.partIndex===partIndex).context);}
function boundaryScore(keyId='E-major',twoStaves=false,firstKind='note'){
  let score=model.createWorkshopDraft('Boundary spacing',3).score;score.keyId=keyId;
  if(twoStaves)score=model.setWorkshopSecondStaffEnabled(score,true);
  score.parts.forEach((part,partIndex)=>{
    const initial=partIndex===0 ? 'treble' : 'bass',changed=initial==='treble' ? 'bass' : 'treble';
    part.measures[1].clef=changed;part.measures[2].clef=initial;
    part.measures.forEach((bar,index)=>{bar.events=[firstKind==='rest'
      ? {id:'first-'+partIndex+'-'+index,kind:'rest',pitch:null,noteValue:'sixteenth',startSlot:0}
      : note('first-'+partIndex+'-'+index,{step:'F',alter:0,octave:partIndex===0 ? 4 : 3},index ? {accidentalDisplay:{force:true,enclosure:'bracket'}} : {})];});
  });
  return score;
}

// Compute horizontal ink from the actual ABC glyph curves, rather than assuming
// a key column's centre or a nominal CSS width is its painted right edge.
function cubicAt(start,a,b,end,t){const q=1-t;return q*q*q*start+3*q*q*t*a+3*q*t*t*b+t*t*t*end;}
function extrema(start,a,b,end){
  const qa=-start+3*a-3*b+end,qb=2*(start-2*a+b),qc=a-start;
  if(Math.abs(qa)<1e-12)return Math.abs(qb)<1e-12 ? [] : [-qc/qb];
  const d=qb*qb-4*qa*qc;return d<0 ? [] : [(-qb+Math.sqrt(d))/(2*qa),(-qb-Math.sqrt(d))/(2*qa)];
}
function glyphInk(name,x,scale){
  const values=[];let px=0,py=0,startX=0,startY=0;
  Glyphs.getPathForSymbol(x,0,name,scale,scale).forEach(command=>{
    const op=command[0],lower=op.toLowerCase(),relative=op===lower;
    if(lower==='z'){px=startX;py=startY;return;}
    const points=command.slice(1).map((value,index)=>value+(relative ? index%2 ? py : px : 0));
    if(lower==='c')extrema(px,points[0],points[2],points[4]).filter(t=>t>0&&t<1)
      .forEach(t=>values.push(cubicAt(px,points[0],points[2],points[4],t)));
    px=points[points.length-2];py=points[points.length-1];values.push(px);
    if(lower==='m'){startX=px;startY=py;}
  });
  return {left:Math.min(...values),right:Math.max(...values)};
}
function eventInkLeft(event,scale){
  if(event.kind==='rest')return workshopRestInk(event,scale).left;
  const head=event.x-(event.grace ? 4.5 : 7)*scale;
  const accidental=event.accidental && workshopAccidentalInk(event,event.accidentalX,event.y,.85*scale);
  return Math.min(head,accidental ? accidental.left : head,(event.ledgers||[]).length ? event.x-11*scale : head);
}
function assertBoundaryClear(view,barIndex,partIndex=0,startSlot=0){
  const bar=view.layout.bars[barIndex],part=bar.parts.find(row=>row.partIndex===partIndex);
  const change=view.contexts.changes.find(entry=>entry.partIndex===partIndex&&entry.applyX>=bar.x&&entry.applyX<bar.x+bar.width);
  assert(change,'bar '+barIndex+' must contain its real boundary change');
  const first=part.notation.events.filter(event=>!event.implicit&&event.startSlot===startSlot);
  assert(first.length,'fixture must paint a note or rest at the boundary');
  const left=bar.x+Math.min(...first.map(event=>eventInkLeft(event,view.notationScale)));
  const signature=view.movingSignature(change);
  const contextInk=[];
  if(change.fields.includes('clef'))contextInk.push(glyphInk(change.context.clef==='bass' ? 'clefs.F' : 'clefs.G',change.clefX,1.9*view.contextScale));
  signature.forEach((pitch,index)=>contextInk.push(glyphInk(pitch.alter>0 ? 'accidentals.sharp' : pitch.alter<0 ? 'accidentals.flat' : 'accidentals.nat',change.keyX+index*view.signatureStep,1.7*view.contextScale)));
  if(change.fields.includes('clef')&&signature.length){
    assert(contextInk[0].right<contextInk[1].left,'clef ink overlaps the first key sign in bar '+barIndex);
  }
  if(change.fields.includes('meter')){
    const meter=change.context.meter.split('/'),half=Math.max(...meter.map(text=>text.length))*10*view.contextScale;
    const meterLeft=change.meterX-half,meterRight=change.meterX+half;
    assert(Math.max(...contextInk.map(ink=>ink.right))<meterLeft,'key signature must precede both meter numbers');
    contextInk.push({left:meterLeft,right:meterRight});
  }
  const right=Math.max(...contextInk.map(ink=>ink.right));
  assert(right<left,'bar '+barIndex+' staff '+partIndex+' context ink ends at '+right+' but following music begins at '+left);
  assert.strictEqual(change.applyX,bar.x+Math.min(...first.map(event=>event.x)),'context still takes effect at its written onset');
  return {bar,part,change};
}
const tests=[];function test(name,run){tests.push([name,run]);}

test('actual Moonlight bars 21–23 keep both the boundary and following in-bar clef change clear of the unchanged four sharps',async()=>{
  // The reduced source keeps original events/attributes from bars 21–23 and
  // adds bar 1's initial E-major/two-staff attributes to make it self-contained.
  const text=fs.readFileSync(path.join(__dirname,'fixtures/workshop-moonlight-bars-21-23.musicxml'),'utf8');
  const score=importWorkshopMusicXmlText(text).score,before=JSON.stringify(score);
  assert.deepStrictEqual(score.parts.map(part=>part.measures.length),[3,3]);
  assert.strictEqual(model.workshopMeasureContext(score,0,0).keyId,'E-major');
  for(const profile of PROFILES){
    const f=fixture(score,profile),view=f.view;
    try{
      for(const index of [1,2]){
        const inbar=score.parts[0].measures[index].contextChanges || [],startSlot=inbar.length ? inbar[0].startSlot : 0;
        const {change}=assertBoundaryClear(view,index,0,startSlot);
        assert.deepStrictEqual(plain(change.fields),['clef']);
        assert.strictEqual(view.movingSignature(change).length,4);
        view.position=workshopStreamTimeAtX(view.layout,change.applyX)-1;await Vue.nextTick();
        assert(view.upcomingContexts.some(entry=>entry.id===change.id),'the separated incoming signs remain visible before docking');
      }
      assert.strictEqual(JSON.stringify(score),before);
    }finally{f.destroy();}
  }
});

test('C major, sharp and flat signatures clear first-note accidentals in both boundary directions across independent scales',()=>{
  for(const keyId of ['C-major','G-major','E-major','C-sharp-major','F-major','D-flat-major','C-flat-major']){
    const score=boundaryScore(keyId),before=JSON.stringify(score);
    for(const profile of PROFILES){
      const f=fixture(score,profile);
      try{
        for(const index of [1,2]){
          const {change}=assertBoundaryClear(f.view,index);
          assert.deepStrictEqual(plain(change.fields),['clef']);
          assert.deepStrictEqual(plain(f.view.movingSignature(change)),plain(workshopKeySignature(keyId,change.context.clef)));
        }
        assert.strictEqual(JSON.stringify(score),before);
      }finally{f.destroy();}
    }
  }
});

test('explicit rest glyphs reserve their left ink beside a boundary clef and repeated key',()=>{
  for(const profile of PROFILES){
    const score=boundaryScore('D-flat-major',false,'rest'),f=fixture(score,profile);
    try{for(const index of [1,2])assertBoundaryClear(f.view,index);}finally{f.destroy();}
  }
});

test('both piano rows reserve boundary context before visual notes owned by the other staff',()=>{
  const score=boundaryScore('E-major',true),before=JSON.stringify(score);
  for(const part of score.parts)for(const [index,bar] of part.measures.entries()){
    if(index)bar.events.forEach(event=>{event.displayStaff=part===score.parts[0] ? 1 : 0;});
  }
  const moved=JSON.stringify(score);
  for(const profile of PROFILES){
    const f=fixture(score,profile);
    try{
      for(const index of [1,2])for(const partIndex of [0,1]){
        const {part}=assertBoundaryClear(f.view,index,partIndex),event=part.notation.events.find(item=>!item.implicit&&item.startSlot===0);
        assert.notStrictEqual(event.sourcePartIndex,partIndex,'first printed note comes from the companion staff');
      }
      assert.strictEqual(JSON.stringify(score),moved);
    }finally{f.destroy();}
  }
  assert.notStrictEqual(moved,before,'fixture really uses cross-staff ownership');
});

test('combined boundary clef, cancellation, new key and meter leave space for the first note or rest',()=>{
  for(const kind of ['note','rest'])for(const profile of PROFILES){
    const score=boundaryScore('E-major',true,kind);
    score.parts.forEach(part=>{part.measures[1].keyId='D-flat-major';part.measures[1].meter='12/8';part.measures[2].keyId='C-major';part.measures[2].meter='3/4';});
    const f=fixture(score,profile);
    try{
      for(const index of [1,2])for(const partIndex of [0,1]){
        const {change}=assertBoundaryClear(f.view,index,partIndex),signature=f.view.movingSignature(change);
        assert.deepStrictEqual(plain(change.fields),['clef','keyId','meter']);
        assert(signature.some(pitch=>pitch.alter===0),'cancelled signs are included in the painted width');
      }
    }finally{f.destroy();}
  }
});

test('actual WorkshopStaff glyphs retain the parent spacing reservation, including rests that shared note columns cannot constrain',()=>{
  const cross=boundaryScore('E-major',true);
  cross.parts.forEach((part,partIndex)=>part.measures.slice(1).forEach(bar=>bar.events.forEach(event=>{event.displayStaff=1-partIndex;})));
  const original=importWorkshopMusicXmlText(fs.readFileSync(path.join(__dirname,'fixtures/workshop-moonlight-bars-21-23.musicxml'),'utf8')).score;
  for(const score of [boundaryScore('C-major'),boundaryScore('C-sharp-major'),boundaryScore('D-flat-major',true,'rest'),cross,original])for(const profile of PROFILES){
    const f=fixture(score,profile),view=f.view;
    try{
      for(const barIndex of [1,2]){
        view.position=f.timeline.measures[barIndex].startMs;
        const bar=view.layout.bars[barIndex],children=nodes(view._render()).filter(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff');
        for(const part of bar.parts){
          const node=children.find(child=>child.componentOptions.propsData.barIndex===barIndex&&child.componentOptions.propsData.staffIndex===part.partIndex);
          assert(node,'current staff is rendered at its playback position');
          const props=node.componentOptions.propsData;
          assert.strictEqual(props.leadingContextRight,part.leadingContextRight,'stable leading-context reservation reaches the real child component');
          const child=renderStaff(props),rendered=nodes(child._render());
          try{
            for(const expected of part.notation.events){
              const actual=child.events.find(event=>event.id===expected.id);
              assert(actual,'runtime must render '+expected.id);
              for(const field of ['x','y','accidentalX','dotX','stemX']){
                if(Number.isFinite(expected[field]))assert(Math.abs(actual[field]-expected[field])<1e-8,'runtime '+expected.id+' '+field+' diverges from parent engraving');
              }
              const eventNode=rendered.find(item=>item.key==='event-'+expected.id),ink=nodes(eventNode);
              assert(eventNode,'event has its real SVG group');
              if(expected.kind==='note'){
                const head=ink.find(item=>item.tag==='ellipse'&&item.data.staticClass==='note-head');
                assert(head);assert.strictEqual(head.data.attrs.cx,expected.x);
                if(expected.accidental)assert(ink.some(item=>item.tag==='path'&&item.data.attrs.d===workshopAccidentalPath(expected,expected.accidentalX,expected.y,.85*view.notationScale)),'runtime accidental path matches the spaced parent ink');
              }else{
                const path=Glyphs.getPathForSymbol(expected.x-4*view.notationScale,expected.y,child.restGlyph(expected.noteValue),1.1*view.notationScale,1.1*view.notationScale).map(command=>command.join(' ')).join('');
                assert(ink.some(item=>item.tag==='path'&&equivalentPathGeometry(item.data.attrs.d,path)),'runtime rest path matches the spaced parent ink');
              }
            }
          }finally{child.$destroy();}
        }
      }
    }finally{f.destroy();}
  }
});

test('octave-only clef changes also reserve the repeated key and remain seekable at the note onset',()=>{
  const score=boundaryScore('E-major',true);
  score.parts.forEach((part,partIndex)=>{
    part.measures[1].clef=part.clef;part.measures[1].clefOctave=partIndex ? -1 : 1;
    part.measures[2].clef=part.clef;part.measures[2].clefOctave=0;
  });
  const before=JSON.stringify(score);
  for(const profile of PROFILES){
    const f=fixture(score,profile);
    try{
      for(const index of [1,2])for(const partIndex of [0,1]){
        const {change}=assertBoundaryClear(f.view,index,partIndex);
        assert.deepStrictEqual(plain(change.fields),['clef']);
        f.view.position=f.timeline.measures[index].startMs;
        assert.strictEqual(f.view.fixedContexts.find(row=>row.partIndex===partIndex).context.clefOctave||0,index===1 ? partIndex ? -1 : 1 : 0);
      }
      assert.strictEqual(JSON.stringify(score),before);
    }finally{f.destroy();}
  }
});

function returnScore(route,changedKey,kind='note'){
  let score=model.createWorkshopDraft('Noninitial '+route+' return',3).score;score.keyId='E-major';
  score=model.setWorkshopSecondStaffEnabled(score,true);
  score.parts.forEach((part,partIndex)=>part.measures.forEach((bar,index)=>{
    bar.events=[kind==='rest' ? {id:'return-'+partIndex+'-'+index,kind:'rest',pitch:null,noteValue:'sixteenth',startSlot:0}
      : note('return-'+partIndex+'-'+index,{step:'F',alter:0,octave:partIndex ? 3 : 4},{accidentalDisplay:{force:true,enclosure:'bracket'}})];
    if(index===2){bar.clef=partIndex ? 'treble' : 'bass';bar.keyId=changedKey;bar.meter='12/8';}
  }));
  const bars=score.parts[0].measures;
  score.parts.forEach(part=>{
    if(route==='repeat'){part.measures[1].repeatStart=true;part.measures[2].repeatEnd=2;}
    else{part.measures[1].navigation=[{kind:'segno',label:'Return'}];part.measures[2].navigation=[{kind:'ds',target:'Return'}];}
  });
  assert.strictEqual(bars[1].clef,undefined,'jump destination has no written context change');
  assert.strictEqual(bars[1].keyId,undefined);assert.strictEqual(bars[1].meter,undefined);
  return score;
}

test('returns to a noninitial repeat or named segno reserve the actual incoming clef, cancelled key and restored meter',()=>{
  for(const route of ['repeat','ds'])for(const changedKey of ['E-major','C-major','D-flat-major','C-sharp-major'])for(const profile of PROFILES){
    const score=returnScore(route,changedKey),before=JSON.stringify(score),reference=createWorkshopPlayback(score,{}).getTimeline(),f=fixture(score,profile),view=f.view;
    try{
      assert.deepStrictEqual(view.layout.bars.map(bar=>bar.index),[0,1,2,1,2]);
      assert.deepStrictEqual(plain(f.timeline),plain(reference),'reserving return signs leaves the performed time and order unchanged');
      for(const partIndex of [0,1]){
        const {change}=assertBoundaryClear(view,3,partIndex),signature=view.movingSignature(change);
        assert(change.fields.includes('clef'));assert(change.fields.includes('meter'));
        assert.strictEqual(change.context.keyId,'E-major');assert.strictEqual(change.context.meter,'4/4');
        if(['D-flat-major','C-sharp-major'].includes(changedKey))assert(signature.some(pitch=>pitch.alter===0),'return paints cancellation of the actual jump-source key');
        assert.strictEqual(state(view,change.applyX-.001,partIndex).keyId,changedKey);
        assert.strictEqual(state(view,change.applyX,partIndex).keyId,'E-major');
        assert(Math.abs(workshopStreamTimeAtX(view.layout,change.applyX)-f.timeline.measures[3].startMs)<1e-6,'return context takes effect at the unchanged first note time');
      }
      for(const occurrence of [3,2,1,3,0]){
        view.position=f.timeline.measures[occurrence].startMs;
        assert.strictEqual(view.currentMeasure.measureIndex,occurrence);
        for(const partIndex of [0,1]){
          const expected=model.workshopMeasureContext(score,view.layout.bars[occurrence].index,partIndex),fixed=view.fixedContexts.find(row=>row.partIndex===partIndex);
          assert.deepStrictEqual([fixed.context.clef,fixed.context.keyId,fixed.context.meter],[expected.clef,expected.keyId,expected.meter],'forward and backward seeking restore each occurrence');
        }
      }
      assert.strictEqual(JSON.stringify(score),before);
    }finally{f.destroy();}
  }
});

test('returned performance occurrences forward reserved header geometry to the actual note and rest SVG',()=>{
  for(const kind of ['note','rest'])for(const profile of PROFILES){
    const score=returnScore('repeat','D-flat-major',kind),before=JSON.stringify(score),f=fixture(score,profile),view=f.view;
    try{
      const returned=view.layout.bars[3];
      for(const partIndex of [0,1])assertBoundaryClear(view,3,partIndex);
      view.position=f.timeline.measures[3].startMs;
      const children=nodes(view._render()).filter(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff');
      for(const part of returned.parts){
        const node=children.find(child=>child.data.attrs.x===returned.x&&child.componentOptions.propsData.staffIndex===part.partIndex);
        assert(node,'the returning occurrence has its own visible SVG staff');
        const props=node.componentOptions.propsData;assert.strictEqual(props.leadingContextRight,part.leadingContextRight);
        assert(Number.isFinite(props.leadingContextRight));
        const child=renderStaff(props);
        try{
          const svg=nodes(child._render());
          for(const expected of part.notation.events){
            const actual=child.events.find(event=>event.id===expected.id);
            assert.strictEqual(actual.x,expected.x,'returned '+kind+' keeps parent-reserved x');
            const eventNode=svg.find(item=>item.key==='event-'+expected.id),ink=nodes(eventNode);
            if(expected.kind==='note')assert(ink.some(item=>item.tag==='ellipse'&&item.data.attrs.cx===expected.x),'actual returned note uses reserved x');
            else{
              const path=Glyphs.getPathForSymbol(expected.x-4*view.notationScale,expected.y,child.restGlyph(expected.noteValue),1.1*view.notationScale,1.1*view.notationScale).map(command=>command.join(' ')).join('');
              assert(ink.some(item=>item.tag==='path'&&equivalentPathGeometry(item.data.attrs.d,path)),'actual returned rest uses reserved x');
            }
          }
        }finally{child.$destroy();}
      }
      assert.strictEqual(JSON.stringify(score),before);
    }finally{f.destroy();}
  }
});

test('reserving context changes engraving only, preserves timeline and source, and switches at the same musical onset with backward seeking',()=>{
  const score=boundaryScore('E-major',true),before=JSON.stringify(score),reference=createWorkshopPlayback(score,{}).getTimeline();
  for(const profile of PROFILES){
    const f=fixture(score,profile),view=f.view,timelineBefore=JSON.stringify(f.timeline),engraving=view._engraving;
    try{
      assert.deepStrictEqual(plain(f.timeline),plain(reference));
      for(const index of [1,2,1,0]){
        view.position=f.timeline.measures[index].startMs;
        for(const partIndex of [0,1]){
          const expected=model.workshopMeasureContext(score,index,partIndex),fixed=view.fixedContexts.find(row=>row.partIndex===partIndex);
          assert.deepStrictEqual([fixed.context.clef,fixed.context.keyId,fixed.context.meter],[expected.clef,expected.keyId,expected.meter]);
        }
      }
      for(const change of view.contexts.changes){
        const bar=view.layout.bars.find(item=>change.applyX>=item.x&&change.applyX<item.x+item.width),index=bar.index;
        assert.strictEqual(state(view,change.applyX-.001,change.partIndex).clef,model.workshopMeasureContext(score,index-1,change.partIndex).clef);
        assert.strictEqual(state(view,change.applyX,change.partIndex).clef,change.context.clef);
        assert(Math.abs(workshopStreamTimeAtX(view.layout,change.applyX)-f.timeline.measures[index].startMs)<1e-6);
      }
      assert.strictEqual(view._engraving,engraving);assert.strictEqual(JSON.stringify(f.timeline),timelineBefore);assert.strictEqual(JSON.stringify(score),before);
    }finally{f.destroy();}
  }
});

test('ordinary hearing and editor retain their existing clef-only header and uncut note rendering',()=>{
  const score=boundaryScore('E-major',true),before=JSON.stringify(score);
  const system=createWorkshopSheetSystems({score,scoreLayout:{},pageRanges:[{start:0,end:3}],pageIndex:0,barsPerSystem:3,
    activeParts:score.parts.map((part,index)=>({part,index})),continuous:true,notationScale:1})[0];
  for(const index of [1,2])for(const part of system.bars[index].parts){
    assert.strictEqual(part.showClef,true);assert.strictEqual(part.showKey,false);assert.strictEqual(part.showMeter,false);
  }
  const f=fixture(score,ACCEPTED,{practice:false});
  try{
    assert(!nodes(f.view._render()).some(node=>node.tag==='clipPath'));
    for(const node of nodes(f.view._render()).filter(node=>node.componentOptions&&node.componentOptions.tag==='WorkshopStaff')){
      assert.strictEqual(node.componentOptions.propsData.noteClipPath,null);
    }
    const editor=renderStaff({measure:score.parts[0].measures[1],clef:'bass',keyId:'E-major',readOnly:false});
    try{assert.strictEqual(editor.noteClipPath,null);assert(nodes(editor._render()).some(node=>node.data&&node.data.staticClass==='note-target'));}finally{editor.$destroy();}
    assert.strictEqual(JSON.stringify(score),before);
  }finally{f.destroy();}
});

(async()=>{let failures=0;for(const [name,run] of tests){try{await run();process.stdout.write('✓ '+name+'\n');}catch(error){failures++;process.stderr.write('✗ '+name+'\n'+error.stack+'\n');}}
  if(failures)process.exitCode=1;else process.stdout.write(tests.length+' workshop practice boundary context spacing tests passed.\n');
})().catch(error=>{console.error(error);process.exitCode=1;});
