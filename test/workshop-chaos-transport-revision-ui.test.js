const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
global.regeneratorRuntime=require('babel-runtime/regenerator');
global.window={scrollTo(){},addEventListener(){},removeEventListener(){}};
global.document={addEventListener(){},removeEventListener(){}};
function ram(){const entries=new Map();return{getItem:key=>entries.has(key)?entries.get(key):null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};}
global.localStorage=ram();
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'],originalVue=Module._extensions['.vue'];
Module._extensions['.js']=(mod,filename)=>filename.startsWith(sourceRoot)
  ? mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename)
  : originalLoader(mod,filename);
Module._extensions['.vue']=mod=>{mod.exports={};};
const filename=sourceRoot+'components/Workshop.vue',parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));
loaded._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const definition=Object.assign({},loaded.exports.default,compiler.compileToFunctions(parsed.template.content));
const model=require('../src/model/Workshop'),storage=require('../src/model/WorkshopStorage'),AudioSync=require('../src/model/AudioSynchronization').default;
Module._extensions['.js']=originalLoader;if(originalVue)Module._extensions['.vue']=originalVue;else delete Module._extensions['.vue'];
function view(){
  global.localStorage=ram();const draft=model.createWorkshopDraft('Race test',3);
  draft.score.parts[0].measures.forEach((bar,index)=>{bar.events=[{id:'race-'+index,kind:'note',noteValue:'whole',startSlot:0,pitch:model.workshopPitchFromValue(48+index*2)}];});
  const piece=storage.storeWorkshopDraft(draft).piece;
  const instance=new Vue(Object.assign({},definition,{created:undefined,mounted:undefined,beforeDestroy:undefined,
    methods:Object.assign({},definition.methods,{$t:key=>key,$tc:key=>key})}));
  instance.$i18n={locale:'de'};instance.player={stopAll(){}};instance.loadLibrary();instance.openPiece(piece);return instance;
}
function nodes(node){return[node].concat(...(node.children||[]).map(nodes));}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
function clock(){let now=0,id=0;const pending=new Map();return{pending,now:()=>now,
  setTimeout(callback,delay){pending.set(++id,{callback,due:now+delay});return id;},clearTimeout:key=>pending.delete(key),
  advance(target){while(pending.size){const [key,next]=Array.from(pending.entries()).sort((a,b)=>a[1].due-b[1].due)[0];if(next.due>target)break;now=next.due;pending.delete(key);next.callback();}now=target;}};}
async function withAudio(body){
  const instance=view(),timing=clock(),played=[];
  const old={performance:global.performance,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout,requestAnimationFrame:global.requestAnimationFrame,cancelAnimationFrame:global.cancelAnimationFrame,
    resume:AudioSync.resume,getContext:AudioSync.getContext,getDelayMs:AudioSync.getDelayMs};
  global.performance={now:timing.now};global.setTimeout=timing.setTimeout;global.clearTimeout=timing.clearTimeout;
  global.requestAnimationFrame=callback=>timing.setTimeout(callback,16);global.cancelAnimationFrame=timing.clearTimeout;
  AudioSync.resume=async()=>true;AudioSync.getContext=()=>({state:'running'});AudioSync.getDelayMs=()=>0;
  instance.previewPlayer={prepare:async()=>true,play(value){played.push(value);return{pause(){},currentTime:0};},stopAll(){}};
  try{await body(instance,timing,played);}finally{
    instance.stopPlayback();instance.$destroy();global.performance=old.performance;global.setTimeout=old.setTimeout;global.clearTimeout=old.clearTimeout;
    global.requestAnimationFrame=old.requestAnimationFrame;global.cancelAnimationFrame=old.cancelAnimationFrame;
    AudioSync.resume=old.resume;AudioSync.getContext=old.getContext;AudioSync.getDelayMs=old.getDelayMs;
  }
}
const checks=[];function test(name,body){checks.push({name,body});}

test('C3: changing bars during audio resume cancels the old single-bar request before samples or sound start',async()=>{
  await withAudio(async(instance,timing,played)=>{
    const loading=deferred();let prepared=0;AudioSync.resume=()=>loading.promise;
    instance.previewPlayer.prepare=async()=>{prepared++;return true;};instance.selectBar(1);
    const before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY),draft=JSON.stringify(instance.draft),starting=instance.startPlayback(1);
    assert(instance.audioStarting);assert.strictEqual(instance.playing,false);instance.selectBar(2);loading.resolve(true);await starting;
    assert.strictEqual(instance.barIndex,2);assert.strictEqual(instance.playing,false);assert.strictEqual(instance.audioStarting,false);assert.strictEqual(instance.playback,null);
    assert.strictEqual(prepared,0);assert.deepStrictEqual(played,[]);assert.strictEqual(timing.pending.size,0);
    assert.strictEqual(JSON.stringify(instance.draft),draft);assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
  });
});

test('C3: changing bars during sample preparation cancels the old audition without stale sound or marking the new bar',async()=>{
  await withAudio(async(instance,timing,played)=>{
    const loading=deferred();instance.previewPlayer.prepare=()=>loading.promise;instance.selectBar(1);
    const before=localStorage.getItem(model.WORKSHOP_STORAGE_KEY),starting=instance.startPlayback(1);await Promise.resolve();
    assert(instance.audioStarting);assert(instance.playback);assert.strictEqual(instance.playbackBarIndex,1);
    instance.selectBar(2);loading.resolve(true);await starting;
    assert.strictEqual(instance.barIndex,2);assert.strictEqual(instance.playing,false);assert.strictEqual(instance.audioStarting,false);assert.strictEqual(instance.playback,null);
    assert.strictEqual(instance.playingBar,null);assert.deepStrictEqual(played,[]);assert.strictEqual(timing.pending.size,0);
    assert.strictEqual(localStorage.getItem(model.WORKSHOP_STORAGE_KEY),before);
  });
});

test('C3: a newly requested audition wins over an older delayed sample result and plays only the newly selected bar',async()=>{
  await withAudio(async(instance,timing,played)=>{
    const oldLoad=deferred(),newLoad=deferred();let request=0;instance.previewPlayer.prepare=()=>++request===1?oldLoad.promise:newLoad.promise;
    instance.selectBar(1);const oldStart=instance.startPlayback(1);await Promise.resolve();instance.selectBar(2);
    const newStart=instance.startPlayback(2);await Promise.resolve();assert.strictEqual(request,2);
    oldLoad.resolve(true);await oldStart;assert(instance.audioStarting);assert.deepStrictEqual(played,[]);assert.strictEqual(instance.playbackBarIndex,2);
    newLoad.resolve(true);await newStart;assert(instance.playing);assert.strictEqual(instance.barIndex,2);assert.strictEqual(instance.playingBar,2);
    assert.deepStrictEqual(played,[52]);timing.advance(4000);assert.strictEqual(instance.playing,false);assert.strictEqual(timing.pending.size,0);
  });
});

function revisionSelect(instance){
  const label=nodes(instance._render()).find(node=>node.tag==='label'&&node.data&&node.data.staticClass==='revision-select');assert(label);
  return nodes(label).find(node=>node.tag==='select');
}
function selectElement(vnode){
  let selected=-1;const element={multiple:false,options:[],_vOptions:[],
    get selectedIndex(){return selected;},set selectedIndex(index){selected=index;this.options.forEach((option,position)=>{option.selected=position===index;});},
    get value(){return this.options[selected]?this.options[selected].value:'';}};
  element.options=nodes(vnode).filter(node=>node.tag==='option').map(node=>({value:node.data.domProps.value,selected:false}));
  return element;
}
test('C5: the actual Vue v-model update hook selects every newly inserted saved revision and its change hook still loads older music',()=>{
  const instance=view();instance.setTempo({target:{value:'80'}});assert(instance.savePiece());
  let rendered=revisionSelect(instance),element=selectElement(rendered),binding=rendered.data.directives.find(item=>item.name==='model');assert(binding);
  const directive=Vue.options.directives.model;directive.inserted(element,binding,rendered,{});assert.strictEqual(element.value,instance.selectedRevisionId);
  for(const bpm of [90,100,110]){
    const previous=binding.value;instance.setTempo({target:{value:String(bpm)}});assert(instance.savePiece());
    rendered=revisionSelect(instance);binding=Object.assign({},rendered.data.directives.find(item=>item.name==='model'),{oldValue:previous});
    const inserted=selectElement(rendered);element.options=inserted.options;element.selectedIndex=0;
    directive.componentUpdated(element,binding,rendered);
    assert.strictEqual(element.selectedIndex,instance.currentPiece.revisions.length-1);assert.strictEqual(element.value,instance.currentPiece.currentRevisionId);
    assert.strictEqual(instance.selectedRevisionId,element.value);assert.strictEqual(instance.draft.score.bpm,bpm);
  }
  element.selectedIndex=0;rendered.data.on.change({target:element});assert.strictEqual(instance.draft.score.bpm,60);
  assert.strictEqual(instance.selectedRevisionId,instance.currentPiece.revisions[0].id);
  instance.undo();assert.strictEqual(instance.draft.score.bpm,110);instance.redo();assert.strictEqual(instance.draft.score.bpm,60);instance.$destroy();
});

(async()=>{for(const check of checks){await check.body();console.log('✓ '+check.name);}console.log(checks.length+' chaos transport/revision UI checks passed.');})().catch(error=>{console.error(error);process.exitCode=1;});
