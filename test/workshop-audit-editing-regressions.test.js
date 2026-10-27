const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
global.window={scrollTo(){},addEventListener(){},removeEventListener(){}};
global.document={addEventListener(){},removeEventListener(){}};
function memory(){const entries=new Map();return{getItem:key=>entries.has(key)?entries.get(key):null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};}
global.localStorage=memory();
const root=path.resolve(__dirname,'../src')+path.sep,oldJs=Module._extensions['.js'],oldVue=Module._extensions['.vue'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(root))return oldJs(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
Module._extensions['.vue']=mod=>{mod.exports={};};
const model=require('../src/model/Workshop'),store=require('../src/model/WorkshopStorage'),strings=require('../src/resources/de').default;
const file=root+'components/Workshop.vue',parsed=compiler.parseComponent(fs.readFileSync(file,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const component=new Module(file,module);component.filename=file;component.paths=Module._nodeModulePaths(path.dirname(file));
component._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);
const definition=component.exports.default;
Module._extensions['.js']=oldJs;if(oldVue)Module._extensions['.vue']=oldVue;else delete Module._extensions['.vue'];
function plain(value){return model.cloneWorkshop(value);}
function instance(score){
  global.localStorage=memory();
  const view=new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,methods:Object.assign({},definition.methods,{$t:(key)=>strings[key]||key,$tc:(key)=>strings[key]||key})}));
  view.$i18n={locale:'de'};view.player={play(){},stopAll(){}};
  view.draft={pieceId:null,title:'Audit regression piece',score:plain(score)};view.baseline=JSON.stringify(view.draft);view.resetEditor();return view;
}
function test(name,body){body();console.log('✓ workshop audit editing: '+name);}
function persistAndCheck(view){
  const score=plain(view.draft.score);assert.strictEqual(view.savePiece(),true);
  const persisted=store.readWorkshopLibrary().pieces[0];assert.deepStrictEqual(model.openWorkshopPiece(persisted).score,score);
  view.closeEditor();view.openPiece(persisted);assert.deepStrictEqual(plain(view.draft.score),score);assert.strictEqual(view.dirty,false);
}

test('F1 normal note insertion, undo, redo, save and reopen preserve the retained annotated rest',()=>{
  const score=model.createWorkshopDraft('Rest annotations').score;
  score.parts[0].measures[0].events=[{id:'ui-rest',kind:'rest',pitch:null,noteValue:'half',startSlot:0,autoRest:false,pedal:'down',fermata:2}];
  const view=instance(score),before=plain(view.draft.score);
  view.chooseToolKind('note');view.chooseToolValue('eighth');view.placeOnSheet({slot:2,pitch:model.workshopPitchFromValue(48)});
  assert.strictEqual(view.placementError,null);const rest=view.currentBar.events.find(event=>event.id==='ui-rest');assert(rest);assert.strictEqual(rest.pedal,'down');assert.strictEqual(rest.fermata,2);
  const after=plain(view.draft.score);view.undo();assert.deepStrictEqual(plain(view.draft.score),before);view.redo();assert.deepStrictEqual(plain(view.draft.score),after);
  persistAndCheck(view);assert(view.currentBar.events.some(event=>event.id==='ui-rest'&&event.pedal==='down'&&event.fermata===2));view.$destroy();
});

test('F4 moving a bar through the editor keeps its staff-specific base key through history and persistence',()=>{
  let score=model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft('Independent keys',3).score,true);
  score.parts[1].keyId='D-major';score.parts[1].measures[1].keyId='F-major';
  const view=instance(score),before=plain(view.draft.score),barId=view.bars[0].id;
  view.moveBar(1);assert.strictEqual(view.barIndex,1);assert.strictEqual(view.bars[1].id,barId);
  assert.strictEqual(model.workshopMeasureContext(view.draft.score,1,1).keyId,'D-major');
  const after=plain(view.draft.score);view.undo();assert.deepStrictEqual(plain(view.draft.score),before);view.redo();assert.deepStrictEqual(plain(view.draft.score),after);
  persistAndCheck(view);assert.strictEqual(model.workshopMeasureContext(view.draft.score,1,1).keyId,'D-major');view.$destroy();
});

test('F5 deleting the inherited-meter end bar succeeds atomically and remains undoable and saveable',()=>{
  for(const meter of ['3/4','6/4']){
    const score=model.createWorkshopDraft('Inherited wedge',3).score;score.parts[0].measures[0].meter=meter;
    score.parts[0].measures[1].directions=[{id:'ui-wedge',type:'wedge',value:'crescendo',startSlot:0,endBarId:score.parts[0].measures[2].id,endSlot:2}];
    const view=instance(score),before=plain(view.draft.score);view.selectBar(2);view.deleteBar();
    assert.strictEqual(view.notationError,null);assert.strictEqual(view.bars.length,2);assert.strictEqual(view.bars[1].directions[0].endSlot,model.workshopMeterUnits(meter));
    const after=plain(view.draft.score);view.undo();assert.deepStrictEqual(plain(view.draft.score),before);view.redo();assert.deepStrictEqual(plain(view.draft.score),after);
    persistAndCheck(view);view.$destroy();
  }
});

test('F6 a late grace note can be corrected by the single-note editor path, undo, redo, save and reopen',()=>{
  const score=model.createWorkshopDraft('Grace correction').score;
  score.parts[0].measures[0].events=[{id:'ui-grace',kind:'note',noteValue:'eighth',startSlot:7.5,pitch:model.workshopPitchFromValue(48),grace:true}];
  const view=instance(score),before=plain(view.draft.score),pitch=model.workshopPitchFromValue(50);
  view.moveSheetNote({id:'ui-grace',slot:7.5,pitch});assert.strictEqual(view.placementError,null);
  assert.deepStrictEqual(plain(view.currentBar.events.find(event=>event.id==='ui-grace').pitch),pitch);
  const after=plain(view.draft.score);view.undo();assert.deepStrictEqual(plain(view.draft.score),before);view.redo();assert.deepStrictEqual(plain(view.draft.score),after);
  persistAndCheck(view);view.$destroy();
});
