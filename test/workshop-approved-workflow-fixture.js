// Actual Vue/model scripts in an isolated RAM realm. No browser/layout claim.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const root=path.resolve(__dirname,'..'),loadedHashes=new Map(),transformedCache=new Map();
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function realm(locale='de') {
  const data=new Map(),timers=new Map();let timerId=0;
  const ram={getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key),key:index=>[...data.keys()][index]||null,get length(){return data.size;}};
  const player=()=>({stopAll(){},dispose(){},prepare:async()=>true,stop(){},play(){}});
  const mocks={
    'model/AudioSynchronization.js':{resume:async()=>true,getContext:()=>null,getDelayMs:()=>0,subscribe:()=>()=>{}},
    'model/AudioSynchronizationPlayback.js':{watchAudioTimingChanges:()=>()=>{}},
    'model/PianoAudio.js':{createPianoSamplePlayer:player},
    'model/WorkshopPianoAudio.js':{createWorkshopPianoPlayer:player},
    'model/ScreenAwakeMixin.js':{createScreenAwakeMixin:()=>({})}
  };
  const context=vm.createContext({regeneratorRuntime:require('babel-runtime/regenerator'),localStorage:ram,console,
    document:{hidden:false,addEventListener(){},removeEventListener(){},activeElement:null},
    window:{addEventListener(){},removeEventListener(){},scrollTo(){}},navigator:{},performance:{now:()=>1000},
    setTimeout(callback){const id=++timerId;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
    setInterval(callback){const id=++timerId;timers.set(id,callback);return id;},clearInterval:id=>timers.delete(id),
    requestAnimationFrame(callback){const id=++timerId;timers.set(id,callback);return id;},cancelAnimationFrame:id=>timers.delete(id)});
  const cache=new Map();
  function load(relative) {
    if(mocks[relative])return mocks[relative];
    const filename=path.join(root,'src',relative);
    if(cache.has(filename))return cache.get(filename).exports;
    loadedHashes.set(filename,sha(filename));
    const source=fs.readFileSync(filename,'utf8'),mod={exports:{}};cache.set(filename,mod);
    if(filename.endsWith('.json')){mod.exports=JSON.parse(source);return mod.exports;}
    const script=filename.endsWith('.vue')?compiler.parseComponent(source).script.content:source;
    if(!transformedCache.has(filename))transformedCache.set(filename,babel.transform(script,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code);
    const code=transformedCache.get(filename);
    new vm.Script('(function(module,exports,require){'+code+'\n})',{filename}).runInContext(context)(mod,mod.exports,name=>{
      if(name==='webmidi')return {inputs:[],enabled:false};
      if(name==='lockr')return {get:key=>{const v=ram.getItem(key);return v===null?undefined:JSON.parse(v);},set:(key,v)=>ram.setItem(key,JSON.stringify(v)),rm:key=>ram.removeItem(key)};
      if(!name.startsWith('.'))return require(name);
      const resolved=path.resolve(path.dirname(filename),name),target=fs.existsSync(resolved)?resolved:fs.existsSync(resolved+'.js')?resolved+'.js':resolved+'.vue';
      if(target.endsWith('.vue')&&!target.endsWith('WorkshopStaff.vue'))return {};
      return load(path.relative(path.join(root,'src'),target));
    });
    return mod.exports;
  }
  function view(name,props={},lifecycle={}) {
    const definition=load('components/'+name+'.vue').default;
    const strings=Object.assign({},load('resources/'+locale+'.js').default);
    // Pending central locale integration can be tested without modifying locales.
    const pending=path.join(root,'docs/audits/design-review-2026-10-08/implementation/workshop-workflow/locale-requests.json');
    if(fs.existsSync(pending))Object.assign(strings,JSON.parse(fs.readFileSync(pending,'utf8'))[locale]);
    const instance=new Vue({...definition,mounted:undefined,...lifecycle,propsData:props,
      methods:{...definition.methods,$t(key,values={}){return Object.keys(values).reduce((text,name)=>text.split('{'+name+'}').join(values[name]),strings[key]||key);},$tc(key,count,values){return this.$t(key,values);}}});
    instance.$i18n={locale};return instance;
  }
  function nodes(instance,name) {
    const parsed=compiler.parseComponent(fs.readFileSync(path.join(root,'src/components',name+'.vue'),'utf8'));
    const compiled=compiler.compileToFunctions(parsed.template.content);
    instance.$options.render=compiled.render;instance.$options.staticRenderFns=compiled.staticRenderFns;
    const flatten=node=>[node,...(node.children||[]).flatMap(flatten)];return flatten(instance._render());
  }
  function staffFor(workshop) {
    return view('WorkshopStaff',{measure:workshop.editorBar,clef:workshop.currentContext.clef,keyId:workshop.currentContext.keyId,
      meter:workshop.currentContext.meter,staffIndex:workshop.partIndex,kind:workshop.tool.kind,noteValue:workshop.tool.noteValue,
      dots:workshop.toolDots,voice:workshop.toolVoice,followKeySignature:workshop.followKeySignature,alter:workshop.tool.alter,multiSelect:workshop.multiSelect});
  }
  return {context,load,view,nodes,staffFor,ram,data,timers,player};
}
const plain=value=>JSON.parse(JSON.stringify(value));
module.exports={realm,plain,loadedHashes,sha,root,Vue};
