const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(sourceRoot))return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
const {layoutWorkshopAccidentals}=require('../src/model/WorkshopAccidentals');
const {workshopAccidentalPath,workshopAccidentalEnclosurePath,workshopAccidentalInk}=require('../src/model/WorkshopAccidentalGlyphs');
const names=['dblflat','threequarterflat','flat','halfflat','nat','halfsharp','sharp','threequartersharp','dblsharp'];
function test(name,body){body();process.stdout.write('✓ '+name+'\n');}
function note(id,alter,slot,extra={}){return Object.assign({id,kind:'note',noteValue:'eighth',startSlot:slot,pitch:{step:'F',alter,octave:4}},extra);}
function signs(events,key='C-major',changes=[]){return layoutWorkshopAccidentals(events,key,changes).map(item=>item.accidental);}
function forced(enclosure){return {force:true,...(enclosure?{enclosure}:{})};}

test('quarter-tone signs preserve alterations and use normal same-bar inheritance and cancellation',()=>{
  const events=[];for(let alter=-2;alter<=2;alter+=.5){events.push(note('a'+alter,alter,events.length),note('b'+alter,alter,events.length+1));}
  const before=JSON.stringify(events);assert.deepStrictEqual(signs(events),names.reduce((a,name)=>a.concat([name,null]),[]));assert.strictEqual(JSON.stringify(events),before);
  assert.deepStrictEqual(signs([note('micro',.5,0),note('natural',0,1),note('again',0,2)]),['halfsharp','nat',null]);
});

test('forced natural and keyed signs remain visible and preserve display metadata without changing pitch',()=>{
  const events=[note('initial',0,0),note('reminder',0,1,{accidentalDisplay:forced('parentheses')}),note('another',0,2,{accidentalDisplay:{force:true,editorial:true,enclosure:'bracket'}}),note('normal',0,3)];
  const before=JSON.stringify(events);assert.deepStrictEqual(signs(events),[null,'nat','nat',null]);assert.strictEqual(JSON.stringify(events),before);
  assert.deepStrictEqual(signs([note('keyed',1,0,{accidentalDisplay:{force:true,cautionary:true}})],'G-major'),['sharp']);
});

test('simultaneous explicit unisons each retain their sign while automatic duplicates stay suppressed',()=>{
  const a=note('a',1,0,{accidentalDisplay:forced('parentheses')}),b=note('b',1,0,{voice:2,accidentalDisplay:forced('bracket')}),c=note('c',1,0,{voice:3});
  assert.deepStrictEqual(signs([a,b,c]),['sharp','sharp',null]);
  assert.deepStrictEqual(signs([c,b,a]),[null,'sharp','sharp']);
  assert.deepStrictEqual(signs([note('plain',1,0),b]),[null,'sharp']);
  assert.deepStrictEqual(signs([note('a',0,0,{accidentalDisplay:forced()}),note('b',.5,0,{voice:2}),note('c',0,1)]),['nat','halfsharp','nat']);
});

test('a changed key resets accidental memory before principal and grace notes at its onset',()=>{
  const changes=[{id:'back',startSlot:4,keyId:'C-major'},{id:'key',startSlot:2,keyId:'G-major'}];
  const events=[note('a',1,0),note('b',0,1),note('c',1,2),note('d',0,3),note('e',0,4)];
  assert.deepStrictEqual(signs(events,'C-major',changes),['sharp','nat',null,'nat',null]);
  assert.deepStrictEqual(signs([note('principal',1,2),note('grace',0,2,{grace:true})],'C-major',changes),['sharp','nat']);
  assert.deepStrictEqual(signs([note('a',1,0),note('b',1,3)],'C-major',[{id:'clef',startSlot:2,clef:'bass'}]),['sharp',null]);
  assert.deepStrictEqual(signs([note('a',1,0),note('b',1,3)],'C-major',[{id:'same',startSlot:2,keyId:'C-major'}]),['sharp',null]);
});

test('dragged notes cross key changes in displayed order without mutating stored notes or changes',()=>{
  const events=[note('a',1,0,{displaySlot:3})],changes=[{id:'key',startSlot:2,keyId:'G-major'}],before=JSON.stringify([events,changes]);
  Object.freeze(events[0].pitch);Object.freeze(events[0]);Object.freeze(events);Object.freeze(changes[0]);Object.freeze(changes);
  assert.deepStrictEqual(signs(events,'C-major',changes),[null]);assert.strictEqual(JSON.stringify([events,changes]),before);
  assert.deepStrictEqual(signs([note('a',0,3,{displaySlot:1})],'C-major',changes),[null]);
});

// Sample the public SVG paths independently, including every curve segment.
function sample(svg){
  const tokens=svg.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[],points=[];
  let index=0,x=0,y=0,sx=0,sy=0;
  while(index<tokens.length){
    const command=tokens[index++],kind=command.toLowerCase(),relative=kind===command;
    if(kind==='z'){x=sx;y=sy;points.push([x,y]);continue;}
    const count={m:2,l:2,c:6,q:4}[kind];assert(count,'unsupported path operation '+command);
    const values=tokens.slice(index,index+count).map(Number);index+=count;
    for(let i=0;i<values.length;i++)if(relative)values[i]+=i%2?y:x;
    if(kind==='c'||kind==='q')for(let step=0;step<=1000;step++){
      const t=step/1000,u=1-t;
      points.push(kind==='c'?[u**3*x+3*u*u*t*values[0]+3*u*t*t*values[2]+t**3*values[4],u**3*y+3*u*u*t*values[1]+3*u*t*t*values[3]+t**3*values[5]]:
        [u*u*x+2*u*t*values[0]+t*t*values[2],u*u*y+2*u*t*values[1]+t*t*values[3]]);
    }
    x=values[values.length-2];y=values[values.length-1];if(kind==='m'){sx=x;sy=y;}points.push([x,y]);
  }
  return points;
}

test('all nine glyph bounds tightly enclose the real filled curves at different origins and scales',()=>{
  const paths=new Set();
  for(const name of names)for(const scale of [.5,.85,1.4]){
    const event={accidental:name,accidentalX:73.5,y:109},svg=workshopAccidentalPath(event,73.5,109,scale),ink=workshopAccidentalInk(event,73.5,109,scale),points=sample(svg);
    assert(points.length>5);assert(!/NaN|Infinity/.test(svg));
    points.forEach(([x,y])=>{assert(x>=ink.left-1e-9&&x<=ink.right+1e-9,name+' x');assert(y>=ink.top-1e-9&&y<=ink.bottom+1e-9,name+' y');});
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    assert(Math.abs(Math.min(...xs)-ink.left)<.001,name);assert(Math.abs(Math.max(...xs)-ink.right)<.001,name);
    assert(Math.abs(Math.min(...ys)-ink.top)<.001,name);assert(Math.abs(Math.max(...ys)-ink.bottom)<.001,name);
    if(scale===.85)paths.add(svg);
  }
  assert.strictEqual(paths.size,9,'quarter-tone signs must have distinct outlines');
});

test('parentheses and brackets include their stroke in spacing bounds and leave a gap around each glyph',()=>{
  for(const name of names)for(const enclosure of ['parentheses','bracket']){
    const event={accidental:name,accidentalX:93,y:111,accidentalDisplay:forced(enclosure)},glyphInk=workshopAccidentalInk({accidental:name},93,111),ink=workshopAccidentalInk(event),svg=workshopAccidentalEnclosurePath(event),points=sample(svg);
    assert(points.length);assert(ink.left<glyphInk.left-3);assert(ink.right>glyphInk.right+3);assert(ink.top<glyphInk.top-1.5);assert(ink.bottom>glyphInk.bottom+1.5);
    points.forEach(([x,y])=>{assert(x-.5>=ink.left-1e-9&&x+.5<=ink.right+1e-9);assert(y-.5>=ink.top-1e-9&&y+.5<=ink.bottom+1e-9);});
    assert(points.every(([x])=>x<=glyphInk.left-1.5 || x>=glyphInk.right+1.5),'enclosure touches glyph');
  }
});

test('absent signs produce no stray enclosures and helper calls leave events unchanged',()=>{
  const event={accidental:null,accidentalDisplay:forced('parentheses'),x:12,y:50},before=JSON.stringify(event);Object.freeze(event);
  assert.strictEqual(workshopAccidentalPath(event),'');assert.strictEqual(workshopAccidentalEnclosurePath(event),'');assert.strictEqual(workshopAccidentalInk(event),null);assert.strictEqual(JSON.stringify(event),before);
  assert.strictEqual(workshopAccidentalEnclosurePath({accidental:'sharp'}),'');
});
process.stdout.write('Workshop accidental editing tests passed.\n');
