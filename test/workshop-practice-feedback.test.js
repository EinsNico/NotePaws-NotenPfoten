const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
const root=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>filename.startsWith(root)
  ? mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename)
  : original(mod,filename);
const {workshopPracticeFeedback}=require('../src/model/WorkshopPracticeFeedback');
const de=require('../src/resources/de').default,en=require('../src/resources/en').default;
const PREFIX='WORKSHOP_PRACTICE_',tests=[];
function test(name,run){tests.push([name,run]);}
function result(counts={},behavior='continuous',extra={}){
  return Object.assign({behavior,durationMs:30000,reason:'complete',counts:Object.assign({correct:0,early:0,late:0,wrong:0,missed:0},counts)},extra);
}
function expect(value,suffix){assert.strictEqual(workshopPracticeFeedback(value),PREFIX+'TIP_'+suffix);}

test('empty rounds and missed targets without evaluated strikes do not generate a performance diagnosis',()=>{
  for(const value of [undefined,null,{},result(),result({missed:50})])expect(value,'EMPTY');
  expect(result({missed:50},'wait',{reason:'manual'}),'EMPTY');
});
test('one to four actual strikes remain a short sample even with many missed targets or a long session',()=>{
  for(const field of ['correct','early','late','wrong'])for(const count of [1,2,3,4]){
    expect(result({[field]:count,missed:100},'continuous',{durationMs:3600000}),'SHORT');
    expect(result({[field]:count},'wait',{reason:'manual'}),'SHORT');
  }
  expect(result({correct:1,early:1,late:1,wrong:1}),'SHORT');
  expect(result({correct:5}),'GOOD');
});
test('dominant wrong pitches recommend calm pitch practice before speed or timing tips',()=>{
  expect(result({correct:2,early:1,late:1,wrong:4}),'PITCH');
  expect(result({late:5,wrong:6},'wait'),'PITCH');
  expect(result({wrong:5}),'PITCH');
  expect(result({correct:5,wrong:5}),'PITCH');
  expect(result({correct:5,wrong:1,missed:15}),'SLOW');
});
test('late wait-mode strikes suggest taking time and never become a continuous rhythm diagnosis',()=>{
  for(const reason of ['manual','complete']){
    expect(result({correct:8,late:2},'wait',{reason}),'WAIT');
    expect(result({correct:1,late:9},'wait',{reason}),'WAIT');
  }
  expect(result({correct:19,late:1},'wait'),'GOOD');
});
test('a continuous section with many missed pitches or timing deviations suggests a slower short section',()=>{
  expect(result({correct:5,missed:5}),'SLOW');
  expect(result({correct:6,wrong:3}),'SLOW');
  expect(result({correct:3,early:4,late:3}),'SLOW');
  expect(result({correct:15,missed:5}),'SLOW');
});
test('moderate timing patterns yield one cautious early, late or mixed next step',()=>{
  expect(result({correct:6,early:3,late:1}),'EARLY');
  expect(result({correct:6,early:1,late:3}),'LATE');
  expect(result({correct:6,early:2,late:2}),'RHYTHM');
  expect(result({correct:6,early:3,late:1},'wait'),'EARLY');
});
test('strong observed counts acknowledge this tempo without depending on the rest of the piece',()=>{
  expect(result({correct:18,early:1,wrong:1}),'GOOD');
  expect(result({correct:8,early:1,wrong:1},'wait'),'GOOD');
  expect(result({correct:10},'continuous',{reason:'manual',endPositionMs:500,remainingNotes:5000}),'GOOD');
});
test('manual completion, duration and unrelated metadata cannot create extra errors or mutate the result',()=>{
  const counts=Object.freeze({correct:6,early:3,late:1,wrong:0,missed:0});
  const value=Object.freeze({counts,behavior:'continuous',durationMs:0,reason:'manual',endPositionMs:2000});
  const before=JSON.stringify(value);expect(value,'EARLY');assert.strictEqual(JSON.stringify(value),before);
  expect(Object.assign({},value,{reason:'complete',durationMs:3600000,endPositionMs:900000}),'EARLY');
});
test('invalid, fractional or overflowing counts fail conservatively rather than praising partial corrupt data',()=>{
  for(const counts of [null,[],{correct:-1},{correct:NaN},{correct:Infinity},{correct:'10'},{correct:2.5},
    {correct:10,late:-1},{correct:Number.MAX_SAFE_INTEGER,wrong:1}])expect({counts,behavior:'continuous'},'EMPTY');
});
test('every settings and feedback key has matching German and English interpolation fields',()=>{
  const keys=['TEMPO','ORIGINAL_TEMPO','SECTION','SECTION_ON','FROM_BAR','TO_BAR','LOOP','LOOP_PASS','SECTION_COMPLETE',
    'RESULT_TIP','RESULT_CONTEXT','RESULT_RANGE','TIP_EMPTY','TIP_SHORT','TIP_PITCH','TIP_WAIT','TIP_SLOW','TIP_EARLY','TIP_LATE','TIP_RHYTHM','TIP_GOOD'];
  for(const suffix of keys){const key=PREFIX+suffix;
    assert.strictEqual(typeof de[key],'string',key+' German');assert.strictEqual(typeof en[key],'string',key+' English');assert(de[key].trim());assert(en[key].trim());
    assert.deepStrictEqual((de[key].match(/\{\w+\}/g)||[]).sort(),(en[key].match(/\{\w+\}/g)||[]).sort(),key+' interpolation');
  }
});
for(const[name,run]of tests){run();console.log('PASS '+name);}console.log('All '+tests.length+' workshop practice feedback checks passed.');
