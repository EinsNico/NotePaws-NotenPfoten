const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core');
const Vue=require('vue'),compiler=require('vue-template-compiler');
global.regeneratorRuntime=require('babel-runtime/regenerator');
global.window={scrollTo(){},addEventListener(){},removeEventListener(){}};
global.document={addEventListener(){},removeEventListener(){}};
global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
const root=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>filename.startsWith(root)?mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename):originalLoader(mod,filename);
Module._extensions['.vue']=mod=>{mod.exports={};};
const model=require('../src/model/Workshop'),tests=[];
function test(name,body){tests.push([name,body]);}
function clone(value){return JSON.parse(JSON.stringify(value));}
function direction(id,startSlot,value,type='dynamic'){return {id,type,startSlot,value};}
function fixture(partIndex=0){
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('',3).score,true),bars=score.parts[partIndex].measures;
  bars[0].dynamic='p';bars[1].dynamic='mp';bars[1].directions=[direction('initial',0,'mp'),direction('later',4,'f'),direction('pedal',2,'down','pedal')];
  bars[1].events=[0,2,4].map((slot,index)=>({id:'note-'+index,kind:'note',pitch:{step:'D',alter:0,octave:4},noteValue:'quarter',startSlot:slot}));
  return score;
}
function pitches(score){return model.workshopTimeline(score).events.filter(event=>event.value!==null).map(event=>event.dynamic);}
function component(name){const filename=path.resolve(root,'components',name+'.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8')),mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);return mod.exports.default;}

test('general dynamic changes synchronize only the selected staff initial direction and preserve later instructions',()=>{
  for(const partIndex of [0,1]){
    const score=fixture(partIndex),before=JSON.stringify(score),next=model.setWorkshopMeasureContext(score,1,{dynamic:'ff'},partIndex),bar=next.parts[partIndex].measures[1];
    assert(next);assert.strictEqual(bar.dynamic,'ff');assert.strictEqual(bar.directions[0].value,'ff');assert.strictEqual(bar.directions[0].id,'initial');
    assert.deepStrictEqual(bar.directions.slice(1),score.parts[partIndex].measures[1].directions.slice(1));assert.deepStrictEqual(next.parts[partIndex?0:1],score.parts[partIndex?0:1]);
    assert.deepStrictEqual(pitches(next),['ff','ff','f']);assert.strictEqual(model.workshopMeasureContext(next,2,partIndex).dynamic,'ff');assert.strictEqual(JSON.stringify(score),before);
  }
});

test('inherit removes initial dynamic instructions but retains later changes and other directions',()=>{
  const score=fixture(),next=model.setWorkshopMeasureContext(score,1,{dynamic:null}),bar=next.parts[0].measures[1];
  assert.strictEqual(bar.dynamic,undefined);assert.deepStrictEqual(bar.directions,score.parts[0].measures[1].directions.slice(1));assert.deepStrictEqual(pitches(next),['p','p','f']);
  const only=fixture();only.parts[0].measures[1].directions=only.parts[0].measures[1].directions.slice(0,1);
  const inherited=model.setWorkshopMeasureContext(only,1,{dynamic:null});assert.strictEqual(inherited.parts[0].measures[1].directions,undefined);
});

test('editing an initial direction updates inherited context and playback without changing its ID or other directions',()=>{
  const score=fixture(),before=JSON.stringify(score),entries=clone(score.parts[0].measures[1].directions);entries[0].value='pp';
  const next=model.setWorkshopMeasureDirections(score,1,entries),bar=next.parts[0].measures[1];assert.strictEqual(bar.dynamic,'pp');assert.deepStrictEqual(bar.directions,entries);
  assert.deepStrictEqual(pitches(next),['pp','pp','f']);assert.strictEqual(model.workshopMeasureContext(next,2).dynamic,'pp');assert.strictEqual(JSON.stringify(score),before);
});

test('moving or removing the mirrored initial direction restores prior context and keeps later changes',()=>{
  for(const operation of ['move','remove','change-kind']){
    const score=fixture(),entries=clone(score.parts[0].measures[1].directions);
    if(operation==='move')entries[0].startSlot=2;
    else if(operation==='remove')entries.shift();
    else {entries[0].type='text';entries[0].value='dolce';}
    const next=model.setWorkshopMeasureDirections(score,1,entries),bar=next.parts[0].measures[1];assert.strictEqual(bar.dynamic,undefined,operation);assert.deepStrictEqual(bar.directions,entries);
    assert.deepStrictEqual(pitches(next),operation==='move'?['p','mp','f']:['p','p','f']);
  }
});

test('adding an initial direction establishes context while later-only edits preserve independent initial loudness',()=>{
  const score=fixture();score.parts[0].measures[1].directions=score.parts[0].measures[1].directions.slice(1);
  let next=model.setWorkshopMeasureDirections(score,1,[direction('new',0,'pp')].concat(score.parts[0].measures[1].directions));assert.strictEqual(next.parts[0].measures[1].dynamic,'pp');
  next=model.setWorkshopMeasureDirections(score,1,[direction('later',4,'ff')]);assert.strictEqual(next.parts[0].measures[1].dynamic,'mp');assert.deepStrictEqual(pitches(next),['mp','mp','ff']);
  // Do not erase an independently specified context merely because a different
  // dynamic direction was removed from the same start position.
  const independent=fixture();independent.parts[0].measures[1].dynamic='pp';next=model.setWorkshopMeasureDirections(independent,1,independent.parts[0].measures[1].directions.slice(1));assert.strictEqual(next.parts[0].measures[1].dynamic,'pp');
});

test('invalid directions are rejected atomically without changing either dynamic representation',()=>{
  const score=fixture(),before=JSON.stringify(score);
  for(const entries of [[null],[direction('bad',0,'invalid')],[direction('bad',-1,'p')]])assert.strictEqual(model.setWorkshopMeasureDirections(score,1,entries),null);
  assert.strictEqual(model.setWorkshopMeasureContext(score,1,{dynamic:'bad'}),null);assert.strictEqual(JSON.stringify(score),before);
});

test('both editor controls record one undo step and redo restores the synchronized initial dynamic',()=>{
  const definition=component('Workshop'),controls=component('WorkshopNotationControls');
  const editor=new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},definition.methods,{$t:key=>key,$tc:key=>key})}));
  editor.$i18n={locale:'en'};editor.player={play(){},stopAll(){}};editor.newPiece();editor.draft.score=fixture();editor.barIndex=1;
  const before=JSON.stringify(editor.draft.score);assert(editor.setDynamic('ff'));const after=JSON.stringify(editor.draft.score);
  assert.strictEqual(editor.currentBar.dynamic,'ff');assert.strictEqual(editor.currentBar.directions[0].value,'ff');editor.undo();assert.strictEqual(JSON.stringify(editor.draft.score),before);editor.redo();assert.strictEqual(JSON.stringify(editor.draft.score),after);
  const panel=new Vue(Object.assign({},controls,{propsData:{score:editor.draft.score,barIndex:1,partIndex:0,section:'bar'},methods:Object.assign({},controls.methods,{$t:key=>key})}));
  panel.$on('change',score=>{editor.commitAdvancedNotation(score);panel.score=score;});panel.editDirection('initial');panel.dynamic='pp';panel.addDirection();
  const afterPanel=JSON.stringify(editor.draft.score);assert.strictEqual(editor.currentBar.dynamic,'pp');assert.strictEqual(editor.currentBar.directions[0].value,'pp');assert.strictEqual(editor.currentBar.directions[0].id,'initial');
  editor.undo();assert.strictEqual(JSON.stringify(editor.draft.score),after);editor.redo();assert.strictEqual(JSON.stringify(editor.draft.score),afterPanel);panel.$destroy();editor.$destroy();
});

(async()=>{for(const [name,body]of tests){await body();process.stdout.write('✓ '+name+'\n');}process.stdout.write('Workshop initial dynamic editing tests passed.\n');})().catch(error=>{console.error(error);process.exitCode=1;});
