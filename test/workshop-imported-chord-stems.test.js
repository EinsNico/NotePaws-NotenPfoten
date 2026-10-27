const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
Module._extensions['.vue']=mod => {mod.exports={};};
const io=require('../src/model/WorkshopMusicXml'),model=require('../src/model/Workshop');
const {createWorkshopStaffRawNotation}=require('../src/model/WorkshopStaffNotation');
const filename=path.join(sourceRoot,'components/WorkshopStaff.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const {workshopStaffNotation,workshopStaffContentGeometry}=mod.exports;

function chord(pitches,direction,value='half',beam) {
  const duration={half:4,quarter:2,eighth:1}[value];
  return pitches.map((pitch,index) => '<note>'+(index ? '<chord/>' : '')+'<pitch><step>'+pitch[0]+'</step>'+
    '<alter>'+(pitch[2] || 0)+'</alter><octave>'+pitch[1]+'</octave></pitch><duration>'+duration+'</duration><voice>1</voice>'+ 
    '<type>'+value+'</type><stem>'+direction+'</stem>'+(beam ? '<beam number="1">'+beam+'</beam>' : '')+'</note>').join('');
}
function imported(body) {
  const result=io.importWorkshopMusicXmlText('<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'+ 
    '<part id="P1"><measure number="1"><attributes><divisions>2</divisions><key><fifths>2</fifths></key>'+ 
    '<time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'+body+'</measure></part></score-partwise>');
  assert(model.isValidWorkshopScore(result.score));return result.score;
}
function assertJoined(notation,expectedDirection) {
  const chordStems=notation.stems.filter(stem => stem.eventIds.length > 1);assert(chordStems.length);
  chordStems.forEach(stem => {
    const heads=stem.eventIds.map(id => notation.events.find(event => event.id === id));
    assert.strictEqual(stem.direction,expectedDirection);
    heads.forEach(head => {
      assert(head.y >= Math.min(stem.y1,stem.y2) && head.y <= Math.max(stem.y1,stem.y2),'every chord head must touch the full vertical stem');
      assert.strictEqual(Math.abs(head.x-stem.x),6,'displaced seconds must remain on either side of their shared stem');
      assert.strictEqual(head.stemX,stem.x);assert.strictEqual(head.stemEndY,stem.y2);
    });
    const extension=stem.direction === 1 ? Math.min(...heads.map(head => head.y))-stem.y2 : stem.y2-Math.max(...heads.map(head => head.y));
    assert(extension >= 38-1e-8,'the stem must extend beyond the outermost chord head');
  });
}
function verify(body,direction) {
  const score=imported(body),before=JSON.stringify(score),context=model.workshopMeasureContext(score,0,0);
  const props={measure:model.resolveWorkshopMeasure(score,0,0),clef:context.clef,meter:context.meter,keyId:context.keyId,staffIndex:0};
  assertJoined(createWorkshopStaffRawNotation(props),direction);
  const drawn=workshopStaffNotation(props);assertJoined(drawn,direction);
  const geometry=workshopStaffContentGeometry(props);
  drawn.stems.forEach(stem => {assert(geometry.top <= Math.min(stem.y1,stem.y2));assert(geometry.top+geometry.height >= Math.max(stem.y1,stem.y2));});
  assert.strictEqual(JSON.stringify(score),before,'rendering must not modify imported pitches, durations or directions');
  return drawn;
}
function test(name,run) {run();process.stdout.write('✓ '+name+'\n');}

test('Canon in D bar 9: downward A4–D5–F-sharp5 and A4–C-sharp5–E5 halves share complete stems',() => {
  // Reduced notation from Canon_in_D.mxl, measure 9, right-hand staff.
  verify(chord([['A',4],['D',5],['F',5,1]],'down')+chord([['A',4],['C',5,1],['E',5]],'down'),-1);
});

test('Canon in D bar 10: upward F-sharp4–B4–D5 halves connect the highest head as well',() => {
  verify(chord([['F',4,1],['B',4],['D',5]],'up')+chord([['F',4,1],['A',4],['C',5,1]],'up'),1);
});

test('Canon in D bar 76: the adjacent D5–E5 chord heads remain connected to their downward stem',() => {
  verify(chord([['A',4],['D',5],['E',5]],'down','quarter'),-1);
});

test('Canon in D bar 94: the wide D5–B5–D6 half and both surrounding quarter chords retain every stem connection',() => {
  const drawn=verify(chord([['F',4,1],['C',5,1],['D',5]],'down','quarter')+
    chord([['D',5],['B',5],['D',6]],'down','half')+chord([['E',5],['A',5],['C',6]],'down','quarter'),-1);
  assert.strictEqual(drawn.stems.filter(stem=>stem.eventIds.length===3).length,3);
  const half=drawn.stems.find(stem=>stem.noteValue==='half');
  assert.strictEqual(half.y1,26);assert.strictEqual(half.y2,134);
});

test('explicit directions opposite to the automatic choice arrange seconds before setting the stem',() => {
  verify(chord([['C',4],['D',4],['E',4]],'down','quarter'),-1);
  verify(chord([['C',5],['B',4],['A',4]],'up','quarter'),1);
});

test('beamed imported chords keep every shared stem joined to their common beam',() => {
  const drawn=verify(chord([['A',4],['D',5],['F',5,1]],'down','eighth','begin')+chord([['A',4],['C',5,1],['E',5]],'down','eighth','end'),-1);
  const beam=drawn.beams.find(item => item.level === 1);assert(beam);
  const points=beam.points.split(' ').map(value => value.split(',').map(Number));
  drawn.stems.filter(stem => stem.beamed).forEach(stem => {
    const ratio=(stem.x-points[0][0])/(points[1][0]-points[0][0]);
    const y=points[0][1]+ratio*(points[1][1]-points[0][1]);assert(Math.abs(stem.y2-y) < 1e-8);
  });
});

process.stdout.write('Imported chord stem regression tests passed.\n');
