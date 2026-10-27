const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(sourceRoot))return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
const io=require('../src/model/WorkshopMusicXml'),model=require('../src/model/Workshop'),parser=require('../src/model/WorkshopMusicXmlParser');
Module._extensions['.js']=originalLoader;

function standardRoundtrip(score) {
  const xml=io.exportWorkshopMusicXmlText(score).data;
  const root=parser.parseWorkshopMusicXmlDocument(xml),misc=parser.musicXmlChild(parser.musicXmlChild(root,'identification'),'miscellaneous');
  const native=parser.musicXmlChildren(misc,'miscellaneous-field').find(item=>item.attrs.name==='notenpfoten-editor-score-v1');
  const imported=io.importWorkshopMusicXmlText(native?xml.slice(0,native.start)+xml.slice(native.end):xml);
  assert(model.isValidWorkshopScore(imported.score));
  return imported.score;
}
function dynamic(id,value,startSlot=0) {return {id,type:'dynamic',value,startSlot};}
function marks(score,barIndex=0,partIndex=0) {
  return (score.parts[partIndex].measures[barIndex].directions||[]).filter(mark=>mark.type==='dynamic').map(mark=>[mark.value,mark.startSlot]);
}
function test(name,run){run();process.stdout.write('✓ MusicXML dynamics: '+name+'\n');}

test('edited imported dynamics appear once after standard XML export and reimport',()=>{
  const xml='<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1">'+
    '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>'+
    '<direction><direction-type><dynamics><mp/></dynamics></direction-type></direction>'+
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>';
  const score=io.importWorkshopMusicXmlText(xml).score;
  score.parts[0].measures[0].events[0].pitch.step='D';
  const before=JSON.stringify(score),restored=standardRoundtrip(score);
  assert.deepStrictEqual(marks(restored),[['mp',0]]);
  assert.strictEqual(restored.parts[0].measures[0].events[0].pitch.step,'D');
  assert.strictEqual(JSON.stringify(score),before);
});

test('different initial values and later repetitions remain explicit',()=>{
  const score=model.createWorkshopDraft('Dynamics',1).score,bar=score.parts[0].measures[0];
  bar.dynamic='mp';bar.directions=[dynamic('different','p'),dynamic('later','mp',2)];
  assert.deepStrictEqual(marks(standardRoundtrip(score)),[['mp',0],['p',0],['mp',2]]);
  bar.directions=[dynamic('later-only','mp',2)];
  assert.deepStrictEqual(marks(standardRoundtrip(score)),[['mp',0],['mp',2]]);
});

test('equivalent marks suppress only their own staff and measure context',()=>{
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Two staves',2).score,true);
  const upper=score.parts[0].measures,lower=score.parts[1].measures;
  upper[0].dynamic='mp';upper[0].directions=[dynamic('upper','mp')];
  lower[0].dynamic='p';
  upper[1].dynamic='f';upper[1].directions=[dynamic('next-upper','f')];
  lower[1].dynamic='ff';lower[1].directions=[dynamic('next-lower','ff'),dynamic('lower-later','p',2)];
  const restored=standardRoundtrip(score);
  assert.deepStrictEqual(marks(restored,0,0),[['mp',0]]);
  assert.deepStrictEqual(marks(restored,0,1),[['p',0]]);
  assert.deepStrictEqual(marks(restored,1,0),[['f',0]]);
  assert.deepStrictEqual(marks(restored,1,1),[['ff',0],['p',2]]);
});
