const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
global.window={scrollTo(){},addEventListener(){},removeEventListener(){}};
global.document={addEventListener(){},removeEventListener(){},querySelector(){return null;}};
const entries=new Map();global.localStorage={getItem:k=>entries.has(k)?entries.get(k):null,setItem:(k,v)=>entries.set(k,String(v)),removeItem:k=>entries.delete(k)};
const root=path.resolve(process.env.NOTATION_SOURCE_ROOT || path.join(__dirname,'../src'))+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{
  if(!file.startsWith(root))return original(mod,file);
  mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);
};
Module._extensions['.vue']=(mod,file)=>{
  const parsed=compiler.parseComponent(fs.readFileSync(file,'utf8'));
  mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);
};
const definitions=new Map();
function component(name){
  if(definitions.has(name))return definitions.get(name);
  const file=root+'components/'+name+'.vue',parsed=compiler.parseComponent(fs.readFileSync(file,'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
  const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));
  mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);
  const value=Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));definitions.set(name,value);return value;
}
function instance(name,props={}){const d=component(name);return new Vue(Object.assign({},d,{created:undefined,mounted:undefined,beforeDestroy:undefined,propsData:props,methods:Object.assign({},d.methods,{$t:k=>k,$tc:k=>k})}));}
const M=require(root+'model/Workshop'),R=require(root+'model/WorkshopRhythm'),E=require(root+'model/WorkshopExpression');
const storage=require(root+'model/WorkshopStorage'),xml=require(root+'model/WorkshopMusicXml');
const {createWorkshopRenderContext}=require(root+'model/WorkshopRenderContext');
const {workshopMeasureDirectionSpans}=require(root+'model/WorkshopNotationDirections');
const {workshopTrillLineSpans}=require(root+'model/WorkshopTrillLines');
const {createWorkshopPiecePreviewScore}=require(root+'model/WorkshopPiecePreview');
const {createWorkshopPlayback}=require(root+'model/WorkshopPlayback');
const {createWorkshopSheetSystems}=require(root+'components/WorkshopSheetLayout');
const tests=[];function test(name,fn){tests.push([name,fn]);}
const clone=M.cloneWorkshop,serial=value=>JSON.stringify(value),near=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' != '+b);
function note(id,slot=0,value='quarter',extra={}){return Object.assign({id,kind:'note',noteValue:value,pitch:{step:'C',alter:0,octave:4},startSlot:slot},extra);}
function freshScore(count=3){return M.setWorkshopSecondStaffEnabled(M.createWorkshopDraft('Approved notation',count).score,true);}
function editor(score){const v=instance('Workshop');v.player={play(){},stopAll(){}};v.previewPlayer=v.player;v.$i18n={locale:'de'};v.newPiece();v.draft.score=clone(score);return v;}
function plainTimeline(score,expandExpressions=true){return M.workshopTimeline(score,{expandExpressions}).events.filter(e=>e.value!==null);}
function keyboard(v){
  v.multiSelect=true;const s=instance('WorkshopStaff',{measure:v.currentBar,multiSelect:true,noteValue:'quarter'});
  const sync=()=>{s.measure=v.currentBar;s.selectedEventId=v.selectedEventId;s.selectedEventIds=v.selectedEventIds;};
  s.$on('toggle-selection',p=>{v.onStaffEvent(0,'toggleSelection',p);sync();});
  s.$on('move-notes',p=>{v.onStaffEvent(0,'moveSheetNotes',p);sync();});
  const press=(id,key)=>s.keyDown({key,preventDefault(){},stopPropagation(){}},s.events.find(e=>e.id===id));
  return {s,press,sync};
}
// Exercise actual audio planning with a deterministic clock; no audio hardware.
function gates(score){
  let now=0,next=0;const queue=new Map(),records=[];
  const player={getAudioTime:()=>now,play(value,volume,options={}){const n={value,start:options.whenSeconds*1000};records.push(n);return n;},stop(n,options={}){if(Number.isFinite(options.whenSeconds))n.end=options.whenSeconds*1000;},stopAll(){}};
  const p=createWorkshopPlayback(score,player,{nowFn:()=>now,setTimeoutFn:(fn,delay)=>{queue.set(++next,{fn,time:now+delay});return next;},clearTimeoutFn:id=>queue.delete(id)});
  assert(p.start());let count=0;
  while(queue.size){assert(++count<10000);const [id,item]=[...queue].sort((a,b)=>a[1].time-b[1].time)[0];queue.delete(id);now=item.time;item.fn();}
  return records.map(n=>({value:n.value,start:n.start,duration:n.end-n.start}));
}

test('WN001: explicit long rests and flags remain distinct while empty arbitrary meters draw one whole measure rest',()=>{
  const glyphs=require(root+'model/WorkshopRestGlyphs'),symbol=instance('WorkshopSymbol',{kind:'rest'});
  const paths=Object.keys(M.WORKSHOP_NOTE_UNITS).map(noteValue=>{symbol.noteValue=noteValue;return symbol.restPath;});
  assert.strictEqual(new Set(paths).size,14);assert(paths.every(p=>p && !/NaN|Infinity/.test(p)));
  for(const meter of ['3/4','4/4','8/1','12/4','24/4','32+16/4','32+32/4']){
    const measure={events:[],meter},before=serial(measure),staff=instance('WorkshopStaff',{measure,meter});
    const events=staff.events,visible=events.filter(e=>e.kind==='rest'&&!e.restHidden);
    assert.strictEqual(visible.length,1,meter);assert(visible[0].implicit);assert.strictEqual(visible[0].restDisplayValue,'whole');
    assert.strictEqual(staff.restPath(visible[0]),glyphs.workshopRestPath('whole',visible[0].x,visible[0].y,1));
    near(events.reduce((sum,e)=>sum+R.workshopEventUnits(e),0),staff.meterUnits);assert.strictEqual(serial(measure),before);staff.$destroy();
  }
  for(const value of ['breve','long','maxima','twofiftysixth','fivehundredtwelfth','onethousandtwentyfourth'])for(const scale of [1,2]){
    const staff=instance('WorkshopStaff',{measure:{meter:'32+32/4',events:[{id:'explicit',kind:'rest',pitch:null,noteValue:value,startSlot:0,dots:2}]},meter:'32+32/4',notationScale:scale});
    const event=staff.events.find(e=>e.id==='explicit'),bounds=glyphs.workshopRestBounds(value,scale);
    assert(!event.restDisplayValue);assert(!event.restHidden);assert.strictEqual(staff.restPath(event),glyphs.workshopRestPath(value,event.x,event.y,scale));
    assert(event.dotX-2*scale>event.x+bounds.right);staff.$destroy();
  }
  symbol.$destroy();
});

test('WN004: all four tremolo marks preserve pair timing, audio gates, history and real save/open after group keys',()=>{
  for(const marks of [1,2,3,4])for(const [articulation,gate] of [[null,1],['staccato',.5],['staccatissimo',.25],['detached-legato',.75]]){
    entries.clear();let score=freshScore();score.parts[1].enabled=false;
    score.parts[0].measures[0].events=[note('a'),note('b',2,'quarter',{pitch:{step:'E',alter:0,octave:4}})].map(n=>articulation?Object.assign(n,{articulations:[articulation]}):n);
    score=E.connectWorkshopTremolo(score,['a','b'],marks);assert(score);
    const v=editor(score),before=clone(v.draft.score),k=keyboard(v),written=before.parts[0].measures[0].events;
    k.press('a','Enter');k.press('b','Enter');assert.strictEqual(v.selectedEventIds.length,2);
    k.press('a','ArrowRight');const moved=clone(v.draft.score),heads=moved.parts[0].measures[0].events.filter(e=>['a','b'].includes(e.id));
    assert.deepStrictEqual(moved.tremolos,before.tremolos);assert.strictEqual(moved.tremolos[0].marks,marks);
    heads.forEach((n,i)=>{assert(n.twoNoteTremolo);assert.strictEqual(n.noteValue,written[i].noteValue);near(R.workshopEventUnits(n),R.workshopEventUnits(written[i]));near(n.startSlot,written[i].startSlot+.5);});
    const original=plainTimeline(before),shifted=plainTimeline(moved);assert.strictEqual(shifted.length,original.length);
    shifted.forEach((e,i)=>{near(e.startMs,original[i].startMs+250);near(e.durationMs,original[i].durationMs);assert.strictEqual(e.value,original[i].value);});
    assert(original.some((e,i)=>i && e.value!==original[i-1].value),'paired tremolo alternates both pitches');
    const played=gates(moved);assert.strictEqual(played.length,shifted.length);played.forEach((e,i)=>{near(e.duration,shifted[i].durationMs*gate);near(e.start,shifted[i].startMs);});
    v.undo();assert.strictEqual(serial(v.draft.score),serial(before));v.redo();assert.strictEqual(serial(v.draft.score),serial(moved));
    assert.strictEqual(v.savePiece(),true);const library=storage.readWorkshopLibrary(),reopened=instance('Workshop');reopened.player=v.player;reopened.previewPlayer=v.player;reopened.$i18n={locale:'de'};reopened.library=library;reopened.openPiece(library.pieces[0]);assert.strictEqual(serial(reopened.draft.score),serial(moved));
    const exported=xml.exportWorkshopMusicXmlText(moved),imported=xml.importWorkshopMusicXmlText(exported.data);assert(imported.score);assert.deepStrictEqual(imported.score.tremolos,moved.tremolos);
    k.sync();if(v.selectedEventIds.length!==2){k.press('a','Enter');k.press('b','Enter');}assert.strictEqual(v.selectedEventIds.length,2);
    k.press('a','ArrowLeft');assert.deepStrictEqual(v.draft.score.tremolos,before.tremolos);near(v.currentBar.events.find(e=>e.id==='a').startSlot,0);
    k.press('a','ArrowUp');assert.deepStrictEqual(v.draft.score.tremolos,before.tremolos);v.currentBar.events.filter(e=>['a','b'].includes(e.id)).forEach(e=>near(R.workshopEventUnits(e),2));
    k.s.$destroy();v.$destroy();reopened.$destroy();
  }
});

test('WN003/005: editor, sheet and practice retain continuous wedges and one octave end across meter, pickup and systems',()=>{
  for(const wedge of ['crescendo','diminuendo'])for(const octave of [-2,-1,1,2]){
    const score=freshScore(3);score.pickupUnits=2;score.parts.forEach(p=>{p.measures[1].meter='3/4';p.measures[2].meter='5/4';p.measures.forEach((b,i)=>b.events=[note(p.id+i)]);});
    const bars=score.parts[0].measures;bars[0].directions=[{id:'w',type:'wedge',value:wedge,startSlot:0,endBarId:bars[2].id,endSlot:8},{id:'o',type:'octaveShift',value:octave,startSlot:0,endBarId:bars[2].id,endSlot:8}];
    score.layout={systemBreaks:[bars[1].id],pageBreaks:[bars[2].id]};assert(M.isValidWorkshopScore(score));
    const before=serial(score),timeline=serial(M.workshopTimeline(score)),context=createWorkshopRenderContext(score);
    const points=[[0,2/16],[2/16,8/16],[8/16,1]];let lastSpread;
    bars.forEach((bar,i)=>{
      const spans=context.directionSpans[0][i];assert.deepStrictEqual(spans,workshopMeasureDirectionSpans(score,0,i));
      const w=spans.find(d=>d.id==='w'),o=spans.find(d=>d.id==='o');near(w.spanStartProgress,points[i][0]);near(w.spanEndProgress,points[i][1]);assert.strictEqual(o.endsHere,i===2);
      for(const practiceLayout of [false,true]){
        const s=instance('WorkshopStaff',{measure:context.measure(0,i),barIndex:i,directionSpans:spans,practiceLayout,readOnly:practiceLayout});
        const marks=s.directionMarks,wm=marks.find(m=>m.id==='w'),om=marks.find(m=>m.id==='o');
        const coordinates=wm.path.match(/-?\d+(?:\.\d+)?/g).map(Number),left=(coordinates[5]-coordinates[1])/2,right=(coordinates[7]-coordinates[3])/2;
        near(left,8*(wedge==='crescendo'?points[i][0]:1-points[i][0]));near(right,8*(wedge==='crescendo'?points[i][1]:1-points[i][1]));
        if(!practiceLayout){if(i)near(left,lastSpread);lastSpread=right;}
        assert.strictEqual(/ v /.test(om.path),i===2);assert.strictEqual(om.text!==null,i===0);s.$destroy();
      }
    });
    for(const practice of [false,true]){
      const listening=instance('WorkshopListening',{score,timeline:M.workshopTimeline(score),practice});
      listening.rebuildEngraving();const parts=listening.sourceSystem.bars.flatMap(b=>b.parts);
      assert(parts.some(p=>p.directionSpans.some(d=>d.id==='w' && d.continuation && d.spanStartProgress>0)));listening.$destroy();
    }
    const systems=createWorkshopSheetSystems({score,scoreLayout:score.layout,pageRanges:[{start:0,end:3}],pageIndex:0,barsPerSystem:1,activeParts:score.parts.map((part,index)=>({part,index}))});assert.strictEqual(systems.length,3);
    assert.strictEqual(serial(score),before);assert.strictEqual(serial(M.workshopTimeline(score)),timeline);
  }
});

test('WN006: wavy lines follow their displayed start anchors and preserve owner voices and playback',()=>{
  for(const routed of [false,true]){
    const score=freshScore(3);
    score.parts.forEach((p,owner)=>{p.measures[0].events=[note('tr'+owner,0,'quarter',{ornament:'trill',ornamentWavy:{type:'start',number:1},...(routed?{displayStaff:1-owner}:{})})];p.measures[2].events=[note('stop'+owner,2,'quarter',{ornamentWavy:{type:'stop',number:1},...(routed?{displayStaff:1-owner}:{})})];});
    assert(M.isValidWorkshopScore(score));const before=serial(score),timeline=serial(M.workshopTimeline(score));
    for(const target of [0,1]){
      const source=routed?1-target:target,spans=workshopTrillLineSpans(score,target);assert.strictEqual(spans.length,3);spans.forEach((bar,i)=>{assert.strictEqual(bar.length,1);assert(bar[0].id.startsWith('trill-tr'+source));assert.strictEqual(bar[0].continuation,i>0);});
      const context=createWorkshopRenderContext(score);assert.deepStrictEqual(context.directionSpans[target][1],spans[1]);
      const staff=instance('WorkshopStaff',{staffIndex:target,measure:context.measure(target,0),companionMeasure:context.measure(1-target,0),directionSpans:context.directionSpans[target][0]});
      assert(staff.events.some(e=>e.id==='tr'+source));assert(staff.directionMarks.some(d=>d.id.startsWith('trill-tr'+source)));staff.$destroy();
    }
    assert.strictEqual(serial(score),before);assert.strictEqual(serial(M.workshopTimeline(score)),timeline);
  }
});

test('WN007: imported octave and transposition survive disposable preview without aliasing or full-score mutation',()=>{
  const file=path.resolve(__dirname,'../docs/audits/design-review-2026-10-08/workshop-notation/model-proof/imported-octave-preview.musicxml'),imported=xml.importWorkshopMusicXmlText(fs.readFileSync(file,'utf8'));
  assert(imported.score);const score=imported.score,before=serial(score),part=score.parts[0],preview=createWorkshopPiecePreviewScore(score);
  assert.strictEqual(preview.parts[0].clefOctave,part.clefOctave);assert.deepStrictEqual(preview.parts[0].transpose,part.transpose);assert.notStrictEqual(preview.parts[0].transpose,part.transpose);
  const context=createWorkshopRenderContext(preview);assert.strictEqual(context.contexts[0][0].clefOctave,1);const staff=instance('WorkshopStaff',{measure:context.measure(0,0),clefOctave:context.contexts[0][0].clefOctave});assert.strictEqual(staff.effectiveClefOctave,1);staff.$destroy();
  preview.parts[0].transpose.chromatic=99;assert.strictEqual(serial(score),before);
});

test('WW005 Staff interface: keyboard insertion keeps context, exact written pitch, grid and input-mode guards',()=>{
  const s=instance('WorkshopStaff',{measure:{events:[],contextChanges:[{id:'key',startSlot:2,keyId:'G-major',clef:'bass'}]},followKeySignature:true,noteValue:'quarter'});
  assert.deepStrictEqual(s.keyboardPlacement({slot:0,step:'C',octave:4}),{slot:0,pitch:{step:'C',alter:0,octave:4}});
  assert.deepStrictEqual(s.keyboardPlacement({slot:2,step:'F',octave:3}),{slot:2,pitch:{step:'F',alter:1,octave:3}});
  for(const slot of [-1,.1,8,NaN,Infinity])assert.strictEqual(s.keyboardPlacement({slot,step:'C',octave:4}),null);
  for(const [step,octave] of [['X',4],['C',-1],['C',4.5],['C',10]])assert.strictEqual(s.keyboardPlacement({slot:0,step,octave}),null);
  for(const prop of ['readOnly','selectionOnly','multiSelect']){s[prop]=true;assert.strictEqual(s.keyboardPlacement({slot:0,step:'C',octave:4}),null);s[prop]=false;}
  s.kind='rest';assert.deepStrictEqual(s.keyboardPlacement({slot:2}),{slot:2,pitch:null});s.$destroy();
});

(async()=>{let count=0;for(const [name,fn] of tests){if(process.env.NOTATION_CASE && !name.includes(process.env.NOTATION_CASE))continue;await fn();console.log('✓ '+name);count++;}assert(count);console.log('Approved notation checks passed: '+count+' groups.');})().catch(e=>{console.error(e);process.exitCode=1;});
