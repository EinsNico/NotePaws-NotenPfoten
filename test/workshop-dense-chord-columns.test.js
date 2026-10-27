const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,loader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(sourceRoot))return loader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
Module._extensions['.vue']=mod=>{mod.exports={};};
const model=require('../src/model/Workshop'),io=require('../src/model/WorkshopMusicXml');
const {workshopEventVoice}=require('../src/model/WorkshopRhythm');
const {createWorkshopStaffRawNotation}=require('../src/model/WorkshopStaffNotation');
const {spaceWorkshopAccidentals}=require('../src/model/WorkshopChordLayout');
const {createWorkshopHorizontalMapping,workshopSlotAtMappedX}=require('../src/model/WorkshopHorizontalMapping');
const filename=path.join(sourceRoot,'components/WorkshopStaff.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const {workshopStaffNotation,workshopStaffContentGeometry}=mod.exports;
const xml=fs.readFileSync(path.join(__dirname,'fixtures/workshop-dense-natural-chords.musicxml'),'utf8');
const tests=[];function test(name,body){tests.push([name,body]);}
function imported(){return io.importWorkshopMusicXmlText(xml);}
function musical(events){return events.map(event=>[event.id,event.kind,event.pitch,event.startSlot,event.noteValue,event.originalNoteValue,event.dots,event.voice]);}
function props(score,notationScale=1){
  const context=model.workshopMeasureContext(score,0,0);
  return {measure:model.resolveWorkshopMeasure(score,0,0),clef:context.clef,meter:context.meter,keyId:context.keyId,notationScale};
}
function overlaps(a,b){return a.left<b.right-1e-8&&b.left<a.right-1e-8&&a.top<b.bottom-1e-8&&b.top<a.bottom-1e-8;}
function boxes(notation){
  const scale=notation.notationScale||1,boxes=[];
  notation.events.filter(event=>event.kind==='note').forEach(event=>{
    boxes.push({slot:event.startSlot,left:event.x-7*scale,right:event.x+7*scale,top:event.y-6*scale,bottom:event.y+6*scale});
    (event.ledgers||[]).forEach(y=>boxes.push({slot:event.startSlot,left:event.x-11*scale,right:event.x+11*scale,top:y-scale,bottom:y+scale}));
  });
  notation.stems.forEach(stem=>{
    if(['whole','breve'].includes(stem.noteValue))return;
    const event=notation.events.find(event=>stem.eventIds.includes(event.id)),slot=event.startSlot;
    boxes.push({slot,left:stem.x-scale,right:stem.x+scale,top:Math.min(stem.y1,stem.y2)-scale,bottom:Math.max(stem.y1,stem.y2)+scale});
    const flags=['eighth','sixteenth','thirtysecond','sixtyfourth'].indexOf(stem.noteValue)+1;
    if(flags&&!stem.beamed&&!stem.beamGroupId){
      const end=stem.y2+stem.direction*(20+(flags-1)*8)*scale;
      boxes.push({slot,left:stem.x+(stem.direction>0?-1:-9)*scale,right:stem.x+(stem.direction>0?9:1)*scale,top:Math.min(stem.y2,end)-scale,bottom:Math.max(stem.y2,end)+scale});
    }
  });
  return boxes;
}
function assertColumns(notation,counts){
  assert.strictEqual(notation.stems.length,counts.length);
  assert.deepStrictEqual(notation.stems.map(stem=>stem.eventIds.length),counts);
  notation.stems.forEach((stem,index)=>{
    const heads=notation.events.filter(event=>stem.eventIds.includes(event.id));
    assert(heads.every(event=>event.startSlot===index*.5));
    heads.forEach(event=>{
      assert(Math.abs(Math.abs(event.x-stem.x)-6*(notation.notationScale||1))<1e-8);
      assert(event.y>=Math.min(stem.y1,stem.y2)&&event.y<=Math.max(stem.y1,stem.y2));
    });
    if(index)assert(stem.x>notation.stems[index-1].x);
  });
  const ink=boxes(notation);
  ink.forEach((box,index)=>ink.slice(index+1).filter(other=>other.slot!==box.slot).forEach(other=>{
    assert(!overlaps(box,other),'separate onsets '+box.slot+' and '+other.slot+' overlap');
  }));
  assert(ink.every(box=>box.right+12<notation.width),'all dense columns must fit the widened paper');
}

test('the friend benchmark has 45 notes in 13 real chords in its saved 12/8 bar',()=>{
  const result=imported(),context=model.workshopMeasureContext(result.score,0,0),events=result.score.parts[0].measures[0].events;
  assert(model.isValidWorkshopScore(result.score));assert.strictEqual(result.title,'Mein Stück');
  assert.strictEqual(context.meter,'12/8');assert.strictEqual(context.units,12);assert.strictEqual(events.length,45);
  assert(events.every(event=>event.kind==='note'&&workshopEventVoice(event)===1&&event.pitch.alter===0));
  assert.deepStrictEqual(Array.from(new Set(events.map(event=>event.startSlot))).sort((a,b)=>a-b),Array.from({length:13},(_,i)=>i*.5));
  assert.deepStrictEqual(Array.from({length:13},(_,i)=>events.filter(event=>event.startSlot===i*.5).length),[2,5,3,3,3,4,3,4,4,2,3,4,5]);
});

test('fractional 12/8 columns no longer jump to the right edge or combine into enormous stacks',()=>{
  const result=imported(),score=result.score,before=JSON.stringify(score);
  for(const notationScale of [1,2]){
    const view=props(score,notationScale),raw=createWorkshopStaffRawNotation(view),spaced=spaceWorkshopAccidentals(raw,{gridStep:raw.gridStep});
    assertColumns(spaced,[2,5,3,3,3,4,3,4,4,2,3,4,5]);
    assert(spaced.width>360);assert(spaced.width<900*notationScale,'dense paper grows without a spurious boundary-sized blank interval');
    for(let index=1;index<spaced.stems.length;index++)assert(spaced.stems[index].x-spaced.stems[index-1].x<90*notationScale);
    assert.deepStrictEqual(musical(spaced.events.filter(event=>event.kind==='note')),musical(raw.events.filter(event=>event.kind==='note')));
    assert.deepStrictEqual(spaceWorkshopAccidentals(spaced,{gridStep:raw.gridStep}),spaced,'repeated rendering must not keep widening');
    const drawn=workshopStaffNotation(view),geometry=workshopStaffContentGeometry(view);
    assertColumns(drawn,[2,5,3,3,3,4,3,4,4,2,3,4,5]);assert(geometry.width>=drawn.width);
    const map=createWorkshopHorizontalMapping(drawn.events,drawn.timeGeometry,drawn.gridStep,drawn.timeUnits);
    drawn.events.filter(event=>event.kind==='note').forEach(event=>assert.strictEqual(workshopSlotAtMappedX(map,event.x),event.startSlot));
  }
  assert.strictEqual(JSON.stringify(score),before,'layout must never edit the source score');
});

test('a full 64-note bar extends past its initial paper boundary and retains 16 distinct chord stems',()=>{
  const score=model.createWorkshopDraft('Dense natural chords').score,measure=score.parts[0].measures[0];
  measure.events=Array.from({length:16},(_,i)=>['C','D','E','F'].map((step,j)=>({id:'dense-'+i+'-'+j,kind:'note',pitch:{step,alter:0,octave:5},startSlot:i*.5,noteValue:'sixteenth'}))).reduce((all,chord)=>all.concat(chord),[]);
  assert(model.isValidWorkshopScore(score));const before=JSON.stringify(score),raw=createWorkshopStaffRawNotation(props(score));
  assert(Math.max(...raw.events.filter(event=>event.kind==='note').map(event=>event.x))>331,'raw overflow must move forward, never pile up at331');
  const spaced=spaceWorkshopAccidentals(raw,{gridStep:raw.gridStep});assertColumns(spaced,Array(16).fill(4));
  assert.strictEqual(JSON.stringify(score),before);
});

test('legitimate simultaneous voice chords stay independent while the later chord receives enough room',()=>{
  const score=model.createWorkshopDraft('Two voices').score,measure=score.parts[0].measures[0];
  measure.events=[1,2].map(voice=>['C','E','G'].map((step,i)=>({id:'voice-'+voice+'-'+i,kind:'note',voice,pitch:{step,alter:0,octave:4},startSlot:0,noteValue:'quarter'}))).reduce((all,chord)=>all.concat(chord),[]);
  measure.events.push({id:'later',kind:'note',voice:1,pitch:{step:'E',alter:0,octave:4},startSlot:.5,noteValue:'sixteenth'});
  const before=JSON.stringify(score),drawn=workshopStaffNotation(props(score)),first=drawn.stems.filter(stem=>stem.eventIds.length===3);
  assert.strictEqual(first.length,2);assert.deepStrictEqual(first.map(stem=>stem.direction).sort(),[-1,1]);
  first.forEach(stem=>assert(new Set(stem.eventIds.map(id=>workshopEventVoice(drawn.events.find(event=>event.id===id)))).size===1));
  assert.strictEqual(drawn.stems.length,3);assert.strictEqual(JSON.stringify(score),before);
});

test('saving, reopening and XML roundtrip preserve every original benchmark note and automatic requested value',()=>{
  const result=imported(),before=musical(result.score.parts[0].measures[0].events),saved=model.saveWorkshopDraft(null,{title:result.title,score:result.score});
  const reopened=model.openWorkshopPiece(JSON.parse(JSON.stringify(saved.piece)));
  assert.deepStrictEqual(musical(reopened.score.parts[0].measures[0].events),before);
  const exported=io.exportWorkshopMusicXmlText(reopened.score,{title:reopened.title}),again=io.importWorkshopMusicXmlText(exported.data);
  assert.deepStrictEqual(musical(again.score.parts[0].measures[0].events),before);
  assert.strictEqual(model.workshopMeasureContext(again.score,0).meter,'12/8');
  assert.deepStrictEqual(model.workshopTimeline(again.score).events,model.workshopTimeline(reopened.score).events);
});

tests.forEach(([name,body])=>{body();process.stdout.write('PASS '+name+'\n');});
process.stdout.write('All '+tests.length+' dense chord column tests passed.\n');
