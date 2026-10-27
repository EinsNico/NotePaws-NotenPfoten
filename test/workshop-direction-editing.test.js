const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename)=>{
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
Module._extensions['.vue']=mod=>{mod.exports={};};
const model=require('../src/model/Workshop');
const strings={de:require('../src/resources/de').default,en:require('../src/resources/en').default};
const filename=path.resolve(sourceRoot,'components/WorkshopNotationControls.vue');
const parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const definition=Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
function fixture(entries=[],options={}) {
  const score=options.score || model.createWorkshopDraft('',3).score;
  score.parts[options.partIndex || 0].measures[options.barIndex || 0].directions=entries;
  assert(model.isValidWorkshopScore(score));
  const history=[],locale=options.locale || 'de';
  const view=new Vue(Object.assign({},definition,{propsData:Object.assign({score,section:'bar'},options),methods:Object.assign({},definition.methods,{
    $t(key,values={}) {return Object.keys(values).reduce((s,name)=>s.replace('{'+name+'}',values[name]),strings[locale][key] || key);}
  })}));
  view.$on('change',next=>{history.push(view.score);view.score=next;});
  return {view,history,destroy(){view.$destroy();}};
}
const cases=[];function test(name,body){cases.push([name,body]);}
function tree(node){return [node].concat(...(node.children || []).map(tree));}
function text(node){return (node.text || '')+(node.children || []).map(text).join(' ');}
function direction(type,value,extra={}){return Object.assign({id:model.workshopId('direction'),type,value,startSlot:2},extra);}

test('all seven timed direction kinds prefill and update in place, preserving IDs, siblings and source data',()=>{
  const kinds=[['tempo',90,'tempo',110],['tempoRamp',80,'tempo',125],['dynamic','p','dynamic','ff'],['wedge','crescendo','wedge','diminuendo'],['octaveShift',1,'octaveShift',-2],['pedal','down','pedal','half'],['text','cantabile','words','dolce']];
  for(const [kind,initial,field,changed] of kinds){
    const span=['tempoRamp','wedge','octaveShift'].includes(kind),entry=direction(kind,initial,span?{endSlot:6}:{}),sibling=direction('pedal','up',{startSlot:7});
    const f=fixture([entry,sibling]),view=f.view,before=JSON.stringify(view.score);
    view.editDirection(entry.id);assert.strictEqual(view.directionType,kind);assert.strictEqual(view[field],initial);assert.strictEqual(view.startBeat,2);
    if(span)assert.strictEqual(view.endBeat,4);
    assert.strictEqual(JSON.stringify(view.score),before);view[field]=changed;view.startBeat=1.5;view.addDirection();
    assert.strictEqual(view.error,false);assert.strictEqual(f.history.length,1);assert.strictEqual(JSON.stringify(f.history[0]),before);
    assert.deepStrictEqual(view.measure.directions.map(item=>item.id),[entry.id,sibling.id]);
    assert.strictEqual(view.measure.directions[0].value,changed);assert.strictEqual(view.measure.directions[0].startSlot,1);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(view.measure.directions[1])),sibling);assert.strictEqual(view.editingDirectionId,null);f.destroy();
  }
});

test('cross-bar editing converts endpoint beats using the destination meter and can shorten into the starting bar',()=>{
  let score=model.createWorkshopDraft('',3).score;score=model.setWorkshopMeasureContext(score,1,{meter:'6/8'});
  const entry=direction('wedge','crescendo',{startSlot:1,endSlot:3,endBarId:score.parts[0].measures[1].id});
  const f=fixture([entry],{score}),v=f.view;v.editDirection(entry.id);
  assert.strictEqual(v.startBeat,1.5);assert.strictEqual(v.endBar,2);assert.strictEqual(v.endBeat,4);assert.strictEqual(v.beatStep,.125);assert.strictEqual(v.endBeatStep,.25);
  v.endBeat=5.25;v.addDirection();assert.strictEqual(v.measure.directions[0].endSlot,4.25);assert.strictEqual(v.measure.directions[0].endBarId,score.parts[0].measures[1].id);
  v.editDirection(entry.id);v.endBar=1;v.endBeat=3;v.addDirection();assert.strictEqual(v.measure.directions[0].endSlot,4);assert.strictEqual(v.measure.directions[0].endBarId,undefined);f.destroy();
});

test('switching between spanning and point instructions removes old endpoints and validates new ones',()=>{
  const entry=direction('octaveShift',1,{endSlot:6}),f=fixture([entry]),v=f.view;v.editDirection(entry.id);v.directionType='tempo';v.tempo=100;v.addDirection();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(v.measure.directions[0])),{id:entry.id,startSlot:2,type:'tempo',value:100});
  v.editDirection(entry.id);v.directionType='tempoRamp';v.endBar=2;v.endBeat=2;v.tempo=140;v.addDirection();
  assert.strictEqual(v.measure.directions[0].id,entry.id);assert.strictEqual(v.measure.directions[0].endBarId,v.score.parts[0].measures[1].id);assert.strictEqual(v.measure.directions[0].endSlot,2);f.destroy();
});

test('invalid edits stay open without changing a score, and cancellation is nonmutating',()=>{
  const entry=direction('tempoRamp',100,{endSlot:6}),f=fixture([entry]),v=f.view,before=JSON.stringify(v.score);
  v.editDirection(entry.id);v.tempo=500;v.addDirection();assert(v.error);assert.strictEqual(v.editingDirectionId,entry.id);assert.strictEqual(f.history.length,0);
  v.tempo=120;v.endBar=1.5;v.addDirection();assert(v.error);assert.strictEqual(JSON.stringify(v.score),before);
  v.endBar=1;v.endBeat=1;v.addDirection();assert(v.error);assert.strictEqual(JSON.stringify(v.score),before);
  v.cancelDirectionEditing();assert.strictEqual(v.editingDirectionId,null);assert.strictEqual(v.error,false);assert.strictEqual(JSON.stringify(v.score),before);f.destroy();
});

test('note selection leaves an active edit intact, while changing bars or staffs cancels it',async()=>{
  const entry=direction('tempo',90),score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('',3).score,true),f=fixture([entry],{score}),v=f.view;
  v.editDirection(entry.id);v.tempo=110;v.selectedEvents=[{id:'selected',kind:'note',startSlot:6}];await Vue.nextTick();assert.strictEqual(v.editingDirectionId,entry.id);assert.strictEqual(v.startBeat,2);
  v.barIndex=1;await Vue.nextTick();assert.strictEqual(v.editingDirectionId,null);assert.strictEqual(f.history.length,0);
  v.barIndex=0;await Vue.nextTick();v.editDirection(entry.id);v.partIndex=1;await Vue.nextTick();assert.strictEqual(v.editingDirectionId,null);assert.strictEqual(v.endBar,1);assert.strictEqual(f.history.length,0);f.destroy();
});

test('a stale edit cannot overwrite an undo, deleted instruction or shifted cross-bar endpoint',async()=>{
  for(const change of ['undo','remove','bars','meter']){
    const f=fixture([direction('wedge','crescendo',{endSlot:6})]),v=f.view,entry=v.measure.directions[0];v.editDirection(entry.id);v.wedge='diminuendo';
    const next=model.cloneWorkshop(v.score);
    if(change==='undo')next.parts[0].measures[0].directions[0].value='diminuendo';
    else if(change==='remove')delete next.parts[0].measures[0].directions;
    else if(change==='bars')next.parts[0].measures[1].id=model.workshopId('bar');
    else next.parts[0].measures[1].meter='6/8';
    v.score=next;v.addDirection();assert.strictEqual(f.history.length,0,change);assert.strictEqual(v.editingDirectionId,null,change);await Vue.nextTick();f.destroy();
  }
  const f=fixture([direction('tempo',90)]),v=f.view;v.editDirection(v.measure.directions[0].id);const next=model.cloneWorkshop(v.score);delete next.parts[0].measures[0].directions;v.score=next;await Vue.nextTick();assert.strictEqual(v.editingDirectionId,null);f.destroy();
});

test('saving on the lower staff affects that staff only and removing the active item exits editing',()=>{
  const score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('',2).score,true),upper=direction('dynamic','p'),lower=direction('pedal','down');score.parts[0].measures[0].directions=[upper];
  const f=fixture([lower],{score,partIndex:1}),v=f.view;v.editDirection(lower.id);v.pedal='up';v.addDirection();assert.strictEqual(v.measure.directions[0].value,'up');assert.deepStrictEqual(JSON.parse(JSON.stringify(v.score.parts[0].measures[0].directions)),[upper]);
  v.editDirection(lower.id);v.removeDirection(lower.id);assert.strictEqual(v.editingDirectionId,null);assert.strictEqual(v.measure.directions,undefined);f.destroy();
});

test('an edit produces one real editor undo step and redo restores the same instruction ID',()=>{
  global.regeneratorRuntime=require('babel-runtime/regenerator');
  global.window={scrollTo(){},addEventListener(){},removeEventListener(){}};
  global.document={addEventListener(){},removeEventListener(){}};
  global.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
  const filename=path.resolve(sourceRoot,'components/Workshop.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
  const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
  const definition=loaded.exports.default,editor=new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,
    methods:Object.assign({},definition.methods,{$t:key=>strings.en[key] || key,$tc:key=>strings.en[key] || key})}));
  editor.$i18n={locale:'en'};editor.player={play(){},stopAll(){}};editor.newPiece();
  const entry=direction('tempo',90);editor.commitAdvancedNotation(model.setWorkshopMeasureDirections(editor.draft.score,0,[entry]));
  const before=JSON.stringify(editor.draft.score),f=fixture([entry],{score:editor.draft.score}),v=f.view;
  v.$on('change',score=>editor.commitAdvancedNotation(score));v.editDirection(entry.id);v.tempo=115;v.startBeat=3;v.addDirection();
  const after=JSON.stringify(editor.draft.score);assert.notStrictEqual(after,before);assert.strictEqual(editor.currentBar.directions[0].id,entry.id);
  editor.undo();assert.strictEqual(JSON.stringify(editor.draft.score),before);editor.redo();assert.strictEqual(JSON.stringify(editor.draft.score),after);f.destroy();editor.$destroy();
});

test('German and English lists expose an editable entry, a selected state, apply and cancel with translated labels',()=>{
  for(const locale of ['de','en']){
    const entry=direction('text','dolce'),f=fixture([entry],{locale}),v=f.view;
    let nodes=tree(v._render()),button=nodes.find(node=>node.data && node.data.staticClass==='direction-entry');assert(button);button.data.on.click();
    nodes=tree(v._render());button=nodes.find(node=>node.data && node.data.staticClass==='direction-entry');assert.strictEqual(button.data.attrs['aria-pressed'],true);
    const rendered=text(v._render());assert(rendered.includes(strings[locale].WORKSHOP_UPDATE_DIRECTION));assert(rendered.includes(strings[locale].WORKSHOP_CANCEL_DIRECTION_EDIT));assert(!/WORKSHOP_[A-Z_]+/.test(rendered),rendered);f.destroy();
  }
});
(async()=>{for(const [name,body] of cases){await body();process.stdout.write('✓ '+name+'\n');}process.stdout.write('Workshop direction editing tests passed.\n');})().catch(error=>{console.error(error);process.exitCode=1;});
