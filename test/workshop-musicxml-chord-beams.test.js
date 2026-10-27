const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
global.regeneratorRuntime=require('babel-runtime/regenerator');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if(!filename.startsWith(sourceRoot))return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
const io=require('../src/model/WorkshopMusicXml'),model=require('../src/model/Workshop');
Module._extensions['.js']=originalLoader;

function note(step,beam,options={}) {
  return '<note>'+(options.chord?'<chord/>':'')+'<pitch><step>'+step+'</step><octave>4</octave></pitch>'+
    '<duration>1</duration><voice>'+(options.voice||1)+'</voice><type>eighth</type>'+
    (beam?'<beam number="1">'+beam+'</beam>':'')+'</note>';
}
function imported(body) {
  const result=io.importWorkshopMusicXmlText('<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'+
    '<part id="P1"><measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>'+body+'</measure></part></score-partwise>');
  assert(model.isValidWorkshopScore(result.score));
  assert(!result.warnings.includes('unsupported-notation'));
  return result.score.parts[0].measures[0].events;
}
function oneBeam(events) {
  assert(events.length>=2);
  assert(events[0].beamGroupId,'the beam must survive validation');
  assert(events.every(event=>event.beamGroupId===events[0].beamGroupId),'all chord members must share the same beam');
}
function test(name,run){run();process.stdout.write('✓ MusicXML chord beams: '+name+'\n');}

test('repeated begin, continue and end on each chord tone retain a complete run',()=>{
  // Audiveris repeats these tags on both tones of the four dyads in Canon, bar 52.
  const pitches=[['B','D'],['A','C'],['G','B'],['A','C']];
  const events=imported(pitches.map((chord,index)=>{
    const beam=index===0?'begin':index===pitches.length-1?'end':'continue';
    return chord.map((step,tone)=>note(step,beam,{chord:tone>0})).join('');
  }).join(''));
  oneBeam(events);
  assert.deepStrictEqual(events.map(event=>event.startSlot),[0,0,1,1,2,2,3,3]);
  assert.deepStrictEqual(events.map(event=>event.pitch.step),[].concat(...pitches));
});

test('beam tags on only the first chord tone still include all chord tones',()=>{
  oneBeam(imported(note('C','begin')+note('E',null,{chord:true})+note('G',null,{chord:true})+
    note('D','end')+note('F',null,{chord:true})+note('A',null,{chord:true})));
});

test('beam tags on a later chord tone include the preceding tones at that onset',()=>{
  oneBeam(imported(note('C')+note('E','begin',{chord:true})+note('G',null,{chord:true})+
    note('D')+note('F','end',{chord:true})+note('A',null,{chord:true})));
});

test('consecutive single-note beam groups stay separate',()=>{
  const events=imported(note('C','begin')+note('D','end')+note('E','begin')+note('F','end'));
  oneBeam(events.slice(0,2));oneBeam(events.slice(2));
  assert.notStrictEqual(events[0].beamGroupId,events[2].beamGroupId);
});

test('repeated chord ends do not attach a following unconnected note',()=>{
  const events=imported(note('C','begin')+note('E','begin',{chord:true})+
    note('D','end')+note('F','end',{chord:true})+note('G'));
  oneBeam(events.slice(0,4));assert.strictEqual(events[4].beamGroupId,undefined);
});

test('chord beams at the same time in different voices stay independent',()=>{
  const voiceBody=voice=>note('C','begin',{voice})+note('E','begin',{voice,chord:true})+
    note('D','end',{voice})+note('F','end',{voice,chord:true});
  const events=imported(voiceBody(1)+'<backup><duration>2</duration></backup>'+voiceBody(2));
  oneBeam(events.slice(0,4));oneBeam(events.slice(4));
  assert.notStrictEqual(events[0].beamGroupId,events[4].beamGroupId);
});
