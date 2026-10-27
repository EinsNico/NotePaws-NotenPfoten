const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core');
const root=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(root))return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
const {layoutWorkshopChords,spaceWorkshopAccidentals,spaceWorkshopAccidentalsTogether}=require('../src/model/WorkshopChordLayout');
const {layoutWorkshopBeams,layoutWorkshopCrossStaffBeams,layoutWorkshopCrossStaffCurves}=require('../src/model/WorkshopBeamLayout');
const {workshopAccidentalInk}=require('../src/model/WorkshopAccidentalGlyphs');
const {workshopRestInk,layoutWorkshopRestLanes}=require('../src/model/WorkshopRestLayout');
const {createWorkshopStaffRawNotation}=require('../src/model/WorkshopStaffNotation');
const model=require('../src/model/Workshop');
function note(id,slot=0,x=140,y=156,extra={}){
  return Object.assign({id,kind:'note',noteValue:'eighth',startSlot:slot,displaySlot:slot,x,y,ledgers:[],pitch:{step:'E',alter:0,octave:4}},extra);
}
function musical(events){return events.map(event=>[event.id,event.kind,event.noteValue,event.pitch,event.startSlot,event.displaySlot,event.dots,event.voice,event.beamGroupId]);}
function overlaps(a,b){return a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;}
function headInk(event){return{left:event.x-14,right:event.x+14,top:event.y-12,bottom:event.y+12};}
function signInk(event){return workshopAccidentalInk(event,event.accidentalX,event.y,1.7);}
function checkSigns(notation){
  const signs=notation.events.filter(event=>event.accidental);
  signs.forEach((event,index)=>{
    const ink=signInk(event);
    notation.events.filter(other=>other.kind==='note').forEach(other=>assert(!overlaps(ink,headInk(other)),event.id+' touches '+other.id));
    notation.events.filter(other=>other.kind==='rest').forEach(other=>assert(!overlaps(ink,workshopRestInk(other,2)),event.id+' touches rest '+other.id));
    signs.slice(index+1).forEach(other=>assert(!overlaps(ink,signInk(other)),event.id+' touches accidental '+other.id));
  });
}
const tests=[];function test(name,body){tests.push([name,body]);}

test('default profile leaves existing chord, rest and beam geometry unchanged',()=>{
  const events=[note('default-a'),note('default-b',1,190,146,{accidental:'nat'})];
  assert.deepStrictEqual(layoutWorkshopChords(events),layoutWorkshopChords(events,null,1));
  const ordinary=layoutWorkshopChords(events),before=JSON.stringify(ordinary);
  assert.deepStrictEqual(spaceWorkshopAccidentals(ordinary),spaceWorkshopAccidentals(ordinary,{notationScale:1}));
  assert.strictEqual(JSON.stringify(ordinary),before);
  const rest={id:'rest',kind:'rest',noteValue:'quarter',x:140,y:116,dots:1};
  assert.deepStrictEqual(workshopRestInk(rest),workshopRestInk(rest,1));
});

test('full-size seconds retain a common attached stem and the full chord height',()=>{
  for(const direction of[1,-1]){
    const events=[note('low',0,140,156),note('middle',0,140,146),note('high',0,140,136)];
    const before=JSON.stringify(events),directions=new Map(events.map(event=>[event.id,direction]));
    const notation=layoutWorkshopChords(events,directions,2),stem=notation.stems[0];
    assert.strictEqual(notation.notationScale,2);assert.strictEqual(notation.stems.length,1);
    assert.strictEqual(Math.max(...notation.events.map(event=>event.x))-Math.min(...notation.events.map(event=>event.x)),24);
    notation.events.forEach(event=>{assert.strictEqual(Math.abs(event.x-stem.x),12);assert.strictEqual(event.stemOffset,12);});
    assert.strictEqual(Math.abs(stem.y2-(direction===1?136:156)),76);
    assert.strictEqual(JSON.stringify(events),before);assert.deepStrictEqual(musical(notation.events),musical(events));
  }
});

test('normal-size accidentals, cancellation signs and enclosures avoid heads and neighbouring rests',()=>{
  for(const accidental of['sharp','flat','nat','dblsharp','dblflat','halfsharp','halfflat','threequartersharp','threequarterflat']){
    for(const enclosure of[undefined,'parentheses','bracket']){
      const extra={accidental,accidentalDisplay:{enclosure}};
      const events=[note('first',0,140,156,extra),note('second',0,140,146,extra),
        {id:'pause',kind:'rest',noteValue:'sixteenth',startSlot:1,displaySlot:1,x:165,y:116,pitch:null},
        note('next',2,180,136,extra)];
      const raw=layoutWorkshopChords(events,null,2),before=JSON.stringify(raw),spaced=spaceWorkshopAccidentals(raw);
      checkSigns(spaced);assert.deepStrictEqual(musical(spaced.events),musical(raw.events));
      assert.strictEqual(JSON.stringify(raw),before);assert.deepStrictEqual(spaceWorkshopAccidentals(spaced),spaced);
    }
  }
});

test('larger unbeamed heads reserve horizontal room even without incidentals',()=>{
  const events=[note('one',0,140,116,{noteValue:'quarter'}),note('two',1,155,116,{noteValue:'quarter'}),note('three',2,170,116,{noteValue:'quarter'})];
  const spaced=spaceWorkshopAccidentals(layoutWorkshopChords(events,null,2));
  for(let index=1;index<spaced.events.length;index++)assert(spaced.events[index].x-spaced.events[index-1].x>=34);
  assert.deepStrictEqual(musical(spaced.events),musical(events));
});

test('scaled beams follow larger stems and keep rhythm grouping unchanged on both staves',()=>{
  const events=[note('beam-a',0,140,156,{beamGroupId:'group',noteValue:'sixteenth'}),
    note('beam-b',.5,180,136,{beamGroupId:'group',noteValue:'sixteenth'})];
  const chords=layoutWorkshopChords(events,new Map(events.map(event=>[event.id,1])),2),result=layoutWorkshopBeams(chords);
  assert.strictEqual(result.notationScale,2);assert.strictEqual(result.beams.length,2);
  result.beams.forEach(beam=>{const points=beam.points.split(' ').map(point=>point.split(',').map(Number));assert.strictEqual(Math.abs(points[2][1]-points[1][1]),10);});
  result.stems.forEach(stem=>assert(stem.y1-stem.y2>=76));
  assert.deepStrictEqual(musical(result.events),musical(events));
  const crossEvents=result.events.map((event,index)=>Object.assign({},event,{visualStaff:index,y:event.y+index*200}));
  const cross=layoutWorkshopCrossStaffBeams(crossEvents,result.stems,250);
  assert.strictEqual(cross.beams.length,2);
  cross.stems.forEach(stem=>{const head=crossEvents.find(event=>stem.eventIds.includes(event.id));assert.strictEqual(Math.abs(stem.x-head.x),12);});
  cross.beams.forEach(beam=>{const points=beam.points.split(' ').map(point=>point.split(',').map(Number));assert.strictEqual(Math.abs(points[2][1]-points[1][1]),10);});
});

test('very short beamed values leave their complete beam stack clear of full-size heads',()=>{
  for(const value of['thirtysecond','sixtyfourth','onetwentyeighth','twofiftysixth','fivehundredtwelfth','onethousandtwentyfourth']){
    const events=[note('fast-a',0,140,156,{beamGroupId:'fast',noteValue:value}),note('fast-b',.0625,180,156,{beamGroupId:'fast',noteValue:value})];
    const chords=layoutWorkshopChords(events,new Map(events.map(event=>[event.id,1])),2),result=layoutWorkshopBeams(chords);
    const lowest=Math.max(...result.beams.reduce((all,beam)=>all.concat(beam.points.split(' ').map(point=>Number(point.split(',')[1]))),[]));
    assert(lowest<144,value+' beams touch full-size note heads');
  }
});

test('direct raw headers and cross-staff tie curves reserve full-size notation ink',()=>{
  const measure=model.createWorkshopDraft('Header').score.parts[0].measures[0];
  measure.events=[{id:'key-head',kind:'note',noteValue:'quarter',startSlot:0,pitch:{step:'E',alter:0,octave:4}}];
  const props={measure,clef:'treble',meter:'4/4',keyId:'D-major'};
  const normal=createWorkshopStaffRawNotation(props),large=createWorkshopStaffRawNotation(Object.assign({},props,{notationScale:2}));
  assert.strictEqual(large.headerOffset-normal.headerOffset,32);
  const events=[note('tie-first',0,140,156,{visualStaff:0,stemOffset:12}),note('tie-last',1,220,350,{visualStaff:1,stemOffset:12})];
  const curves=layoutWorkshopCrossStaffCurves(events,[{fromId:'tie-first',toId:'tie-last'}]).curves;
  assert.strictEqual(curves.length,1);
  const initial=curves[0].path.split(' ').slice(1,3).map(Number);
  assert(initial[0]>=events[0].x+12);assert.strictEqual(initial[1],events[0].y+14);
});

test('rest lanes and source engraving carry the practice profile without changing score data',()=>{
  const score=model.createWorkshopDraft('Profile').score,measure=score.parts[0].measures[0];
  measure.events=[{id:'note',kind:'note',noteValue:'quarter',startSlot:0,pitch:{step:'E',alter:1,octave:4}},
    {id:'rest',kind:'rest',noteValue:'sixteenth',startSlot:0,pitch:null,voice:2}];
  const before=JSON.stringify(score),raw=createWorkshopStaffRawNotation({measure,clef:'treble',meter:'4/4',keyId:'C-major',notationScale:2});
  assert.strictEqual(raw.notationScale,2);assert(raw.events.every(event=>event.notationScale===2));
  const rest=raw.events.find(event=>event.id==='rest'),head=raw.events.find(event=>event.id==='note');
  assert(!overlaps(workshopRestInk(rest),headInk(head)));
  const normal=createWorkshopStaffRawNotation({measure,clef:'treble',meter:'4/4',keyId:'C-major'});
  assert.strictEqual(normal.notationScale,undefined);assert(normal.events.every(event=>event.notationScale===undefined));
  const sourceRest={kind:'rest',noteValue:'sixteenth',x:200,y:116};
  const small=workshopRestInk(sourceRest),large=workshopRestInk(sourceRest,2);
  assert(Math.abs((large.right-large.left)-2*(small.right-small.left))<1e-8);
  assert(Math.abs((large.bottom-large.top)-2*(small.bottom-small.top))<1e-8);
  const other=createWorkshopStaffRawNotation({measure:Object.assign({},measure,{events:[Object.assign({},measure.events[0],{id:'other',pitch:{step:'C',alter:0,octave:4}})]}),clef:'bass',meter:'4/4',keyId:'C-major',notationScale:2});
  const shared=spaceWorkshopAccidentalsTogether([raw,other]);
  assert.strictEqual(shared.notations[0].events.find(event=>event.id==='note').x,shared.notations[1].events.find(event=>event.id==='other').x);
  assert.strictEqual(JSON.stringify(score),before);
});
(async()=>{for(const[name,body]of tests){await body();console.log('PASS '+name);}console.log('All '+tests.length+' practice notation profile tests passed.');})().catch(error=>{console.error(error);process.exitCode=1;});
