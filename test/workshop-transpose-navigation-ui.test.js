const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const source=path.resolve(__dirname,'../src')+path.sep,original=Module._extensions['.js'];
Module._extensions['.js']=(mod,file)=>{if(!file.startsWith(source))return original(mod,file);mod._compile(babel.transform(fs.readFileSync(file,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);};
Module._extensions['.vue']=mod=>{mod.exports={};};
function component(name){const file=path.join(source,'components',name+'.vue'),parsed=compiler.parseComponent(fs.readFileSync(file,'utf8'));assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));require.cache[file]=mod;mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,file);return Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));}
const pitch=component('WorkshopPitchContextControls'),routes=component('WorkshopRouteControls'),contexts=component('WorkshopContextControls'),notation=component('WorkshopNotationControls'),model=require('../src/model/Workshop');
const de=require('../src/resources/de').default,en=require('../src/resources/en').default;
function score(count=1){const value=model.createWorkshopDraft('Controls',count).score;value.parts[0].measures.forEach((bar,index)=>bar.events=[{id:'note-'+index,kind:'note',pitch:{step:'C',alter:0,octave:4},startSlot:0,noteValue:'quarter'}]);return value;}
function fixture(definition,value=score(),extra={}){const view=new Vue(Object.assign({},definition,{propsData:Object.assign({score:value},extra),methods:Object.assign({},definition.methods,{$t:key=>key})})),changes=[];view.$on('change',value=>changes.push(value));return {view,changes};}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
const cases=[];function test(name,body){cases.push([name,body]);}

test('bar transposition controls load imports, apply a sounding shift and reset imported base contexts',async()=>{
  const value=score();value.parts[0].clefOctave=-1;value.parts[0].transpose={chromatic:2,diatonic:1,octaveChange:1};const before=JSON.stringify(value),{view,changes}=fixture(pitch,value);
  assert.deepStrictEqual([view.clefOctave,view.chromatic,view.diatonic,view.octaveChange],[-1,2,1,1]);
  view.clefOctave=1;view.chromatic=-2;view.diatonic=-1;view.octaveChange=0;assert(view.apply());let changed=changes.pop();assert.strictEqual(model.workshopTimeline(changed).events.find(event=>event.value!==null).value,58);assert.strictEqual(changed.parts[0].measures[0].events[0].pitch.octave,4);
  view.score=changed;await Vue.nextTick();assert(view.reset());changed=changes.pop();assert.strictEqual(model.workshopTimeline(changed).events.find(event=>event.value!==null).value,48);
  view.chromatic=99;assert.strictEqual(view.apply(),false);assert(view.error);assert.strictEqual(JSON.stringify(value),before);view.$destroy();
});

test('named navigation controls add, edit and remove labels and only offer existing target names',async()=>{
  const value=score(3);value.parts[0].measures[0].navigation=[{kind:'segno',label:'A'}];const {view,changes}=fixture(routes,value,{barIndex:2});
  view.kind='ds';await Vue.nextTick();assert.deepStrictEqual(Array.from(view.targets),['A']);view.target='A';view.passesText='2, 3';assert(view.save());let changed=changes.pop();assert.deepStrictEqual(changed.parts[0].measures[2].navigation,[{kind:'ds',target:'A',passes:[2,3]}]);
  view.score=changed;await Vue.nextTick();assert(view.edit(0));await Vue.nextTick();assert.strictEqual(view.target,'A');view.passesText='1';assert(view.save());changed=changes.pop();assert.deepStrictEqual(changed.parts[0].measures[2].navigation[0].passes,[1]);
  view.score=changed;await Vue.nextTick();assert(view.remove(0));assert(!changes.pop().parts[0].measures[2].navigation);
  view.passesText='0, 9';assert.strictEqual(view.save(),false);assert(view.error);view.$destroy();
});

test('in-bar context editor exposes octave and transposition properties and preserves them when other properties are edited',async()=>{
  const value=score(2);value.parts[0].measures[0].contextChanges=[{id:'octave-context',startSlot:2,clefOctave:1,transpose:{chromatic:-2,diatonic:-1,octaveChange:0}}];
  const {view,changes}=fixture(contexts,value);assert(view.editChange('octave-context'));assert.strictEqual(view.clefOctave,1);assert(view.useTranspose);view.keyId='G-major';assert(view.saveChange());const changed=changes.pop(),entry=changed.parts[0].measures[0].contextChanges[0];assert.strictEqual(entry.clefOctave,1);assert.deepStrictEqual(entry.transpose,{chromatic:-2,diatonic:-1,octaveChange:0});assert.strictEqual(entry.keyId,'G-major');
  view.score=changed;await Vue.nextTick();view.editChange(entry.id);view.useTranspose=false;view.clefOctave='';assert(view.saveChange());const removed=changes.pop().parts[0].measures[0].contextChanges[0];assert.strictEqual(removed.clefOctave,undefined);assert.strictEqual(removed.transpose,undefined);view.$destroy();
});

test('renaming a referenced sign updates its jump targets instead of blocking the teacher edit',async()=>{
  const value=score(2);value.parts[0].measures[0].navigation=[{kind:'segno',label:'A'}];value.parts[0].measures[1].navigation=[{kind:'ds',target:'A'}];
  const {view,changes}=fixture(routes,value);view.edit(0);await Vue.nextTick();view.routeName='Lesson';assert(view.save());
  const changed=changes.pop();assert.strictEqual(changed.parts[0].measures[0].navigation[0].label,'Lesson');assert.strictEqual(changed.parts[0].measures[1].navigation[0].target,'Lesson');assert.deepStrictEqual(model.workshopPlaybackBarOrder(changed),[0,1,0,1]);view.$destroy();
});

test('advanced bar menu includes the new detail panels and recognises named marker toggle state in both languages',()=>{
  const value=score(2);value.parts[0].measures[0].navigation=[{kind:'segno',label:'A'}];const {view,changes}=fixture(notation,value);
  const children=nodes(view._render()).filter(node=>node.componentOptions).map(node=>node.componentOptions.tag);assert(children.includes('WorkshopRouteControls'));assert(children.includes('WorkshopPitchContextControls'));assert(view.hasNavigation('segno'));view.toggleNavigation('segno');assert(!changes.pop().parts[0].measures[0].navigation);view.$destroy();
  ['WORKSHOP_PITCH_CONTEXT_DETAILS','WORKSHOP_CLEF_OCTAVE','WORKSHOP_TRANSPOSE_CHROMATIC','WORKSHOP_TRANSPOSE_DIATONIC','WORKSHOP_TRANSPOSE_OCTAVES','WORKSHOP_ROUTE_DETAILS','WORKSHOP_ROUTE_NAME','WORKSHOP_ROUTE_TARGET','WORKSHOP_ROUTE_PASSES','WORKSHOP_ROUTE_BLOCKED'].forEach(key=>{assert.strictEqual(typeof de[key],'string',key);assert.strictEqual(typeof en[key],'string',key);});
});

(async()=>{let failed=0;for(const[name,body]of cases){try{await body();process.stdout.write('✓ '+name+'\n');}catch(error){failed++;console.error('FAILED: '+name+'\n'+error.stack);}}assert.strictEqual(failed,0);process.stdout.write('Workshop transposition and navigation UI tests passed.\n');})().catch(error=>{console.error(error);process.exitCode=1;});
