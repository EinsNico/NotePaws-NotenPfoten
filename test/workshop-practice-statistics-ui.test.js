const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const filename=path.resolve(__dirname,'../src/components/WorkshopPracticeStatistics.vue');
const parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const definition=Object.assign({},mod.exports.default,compiler.compileToFunctions(parsed.template.content));
let now=0,nextTimer=0;const timers=new Map(),documentListeners=new Map(),windowListeners=new Map(),viewportListeners=new Map();
const originalTimeout=global.setTimeout,originalClear=global.clearTimeout,originalDocument=global.document,originalWindow=global.window;
global.setTimeout=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,due:now+delay,delay});return id;};
global.clearTimeout=id=>timers.delete(id);
function add(map,key,callback){if(!map.has(key))map.set(key,new Set());map.get(key).add(callback);}
function remove(map,key,callback){if(map.has(key))map.get(key).delete(callback);}
global.document={activeElement:null,addEventListener:(key,callback)=>add(documentListeners,key,callback),removeEventListener:(key,callback)=>remove(documentListeners,key,callback)};
global.window={innerWidth:360,addEventListener:(key,callback)=>add(windowListeners,key,callback),removeEventListener:(key,callback)=>remove(windowListeners,key,callback),
  visualViewport:{width:360,offsetLeft:0,addEventListener:(key,callback)=>add(viewportListeners,key,callback),removeEventListener:(key,callback)=>remove(viewportListeners,key,callback)}};
function advance(ms){const end=now+ms;while(true){const pending=Array.from(timers.entries()).filter(entry=>entry[1].due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!pending)break;now=pending[1].due;timers.delete(pending[0]);pending[1].callback();}now=end;}
function nodes(node){return [node].concat(...(node.children||[]).map(nodes));}
function text(node){return [node.text||''].concat((node.children||[]).map(text)).join('');}
function view(props={}){
  const vm=new Vue(Object.assign({},definition,{propsData:props,methods:Object.assign({},definition.methods,{$t:(key,values)=>values ? key+' '+JSON.stringify(values) : key})}));
  const toggle={focus(){document.activeElement=toggle;}},close={focus(){document.activeElement=close;}};
  const popover={contains:target=>target===close,getBoundingClientRect:()=>({left:300-vm.popoverWidth+vm.popoverShift,right:300+vm.popoverShift})};
  vm.$refs.toggleButton=toggle;vm.$refs.closeButton=close;vm.$refs.popover=popover;
  vm.$el={contains:target=>target===toggle || target===close || target===popover};
  definition.mounted.call(vm);return vm;
}
const cases=[];function test(name,body){cases.push([name,body]);}

test('translated circle shows bounded progress and five distinct counts without mutating incoming statistics',async()=>{
  const statistics=Object.freeze({correct:7,early:2,late:3,wrong:4,missed:5}),vm=view({progressPercent:62.7,statistics,title:'Canon'});
  assert.strictEqual(vm.percent,63);assert.strictEqual(vm.rows.length,5);assert.deepStrictEqual(vm.rows.map(row=>row.count),[7,2,3,4,5]);
  const initial=nodes(vm._render()),button=initial.find(node=>node.data && node.data.staticClass==='progress-circle');
  assert(button.data.attrs['aria-label'].includes('Canon'));assert(button.data.attrs['aria-label'].includes('63'));
  assert.strictEqual(button.data.attrs['aria-expanded'],'false');assert(!initial.some(node=>node.tag==='section'));
  vm.togglePopover();await Vue.nextTick();
  const opened=nodes(vm._render()),rows=opened.filter(node=>node.tag==='dd');assert.deepStrictEqual(rows.map(text),['7','2','3','4','5']);
  assert(opened.some(node=>node.tag==='dt' && text(node)==='WORKSHOP_PRACTICE_STATS_EARLY'));
  assert(opened.some(node=>node.tag==='dt' && text(node)==='WORKSHOP_PRACTICE_STATS_MISSED'));
  assert(!opened.some(node=>node.data && node.data.attrs && node.data.attrs['aria-modal']));assert.strictEqual(document.activeElement,vm.$refs.closeButton);
  assert.deepStrictEqual(statistics,{correct:7,early:2,late:3,wrong:4,missed:5});vm.$destroy();assert.strictEqual(timers.size,0);
});

test('popover remains open for sixty seconds and reopening starts a fresh timer',async()=>{
  const vm=view();vm.togglePopover();await Vue.nextTick();assert.strictEqual(timers.size,1);assert.strictEqual(Array.from(timers.values())[0].delay,60000);
  advance(59999);assert(vm.isOpen);advance(1);assert(!vm.isOpen);assert.strictEqual(document.activeElement,vm.$refs.toggleButton);assert.strictEqual(timers.size,0);
  vm.togglePopover();await Vue.nextTick();advance(59000);vm.closePopover();assert.strictEqual(timers.size,0);
  vm.togglePopover();await Vue.nextTick();advance(1000);assert(vm.isOpen,'the old deadline must not close a reopened popup');
  advance(58999);assert(vm.isOpen);advance(1);assert(!vm.isOpen);vm.$destroy();
});

test('explicit close, Escape and outside click close cleanly without stealing outside focus',async()=>{
  const vm=view();vm.togglePopover();await Vue.nextTick();
  const button=nodes(vm._render()).find(node=>node.data && node.data.staticClass==='statistics-close');button.data.on.click({});
  assert(!vm.isOpen);assert.strictEqual(document.activeElement,vm.$refs.toggleButton);assert.strictEqual(timers.size,0);
  vm.togglePopover();await Vue.nextTick();let prevented=false,stopped=false;
  vm.handleKeydown({key:'Enter',preventDefault(){throw Error('other key');},stopPropagation(){throw Error('other key');}});assert(vm.isOpen);
  vm.handleKeydown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});assert(!vm.isOpen && prevented && stopped);
  assert.strictEqual(document.activeElement,vm.$refs.toggleButton);
  vm.togglePopover();await Vue.nextTick();vm.outsideClick({target:vm.$refs.closeButton});assert(vm.isOpen);
  const outside={};document.activeElement=outside;vm.outsideClick({target:outside});assert(!vm.isOpen);assert.strictEqual(document.activeElement,outside);assert.strictEqual(timers.size,0);
  vm.$destroy();
});

test('multiple library cards have unique accessible IDs and destruction removes timers and every listener',async()=>{
  const first=view(),second=view();assert.notStrictEqual(first.popoverId,second.popoverId);
  first.togglePopover();second.togglePopover();await Vue.nextTick();assert.strictEqual(timers.size,2);
  assert.strictEqual(documentListeners.get('click').size,2);assert.strictEqual(documentListeners.get('keydown').size,2);
  first.$destroy();assert.strictEqual(timers.size,1);assert.strictEqual(documentListeners.get('click').size,1);assert.strictEqual(windowListeners.get('resize').size,1);
  second.$destroy();assert.strictEqual(timers.size,0);
  [documentListeners,windowListeners,viewportListeners].forEach(map=>map.forEach(callbacks=>assert.strictEqual(callbacks.size,0)));
  advance(60000);assert.strictEqual(timers.size,0);
});

test('destroying immediately cancels pending positioning and focus work',async()=>{
  const vm=view(),outside={};document.activeElement=outside;
  vm.togglePopover();vm.$destroy();await Vue.nextTick();await Vue.nextTick();
  assert.strictEqual(document.activeElement,outside);assert.strictEqual(timers.size,0);assert(!vm.isOpen);
});

test('narrow viewports keep the popup inside its margins and progress accepts empty or invalid values safely',async()=>{
  const vm=view({progressPercent:Infinity,statistics:{correct:-2,early:NaN,late:3.9,wrong:Infinity,missed:0}});
  assert.strictEqual(vm.percent,0);assert.deepStrictEqual(vm.rows.map(row=>row.count),[0,0,3,0,0]);
  vm.progressPercent=-12;assert.strictEqual(vm.percent,0);vm.progressPercent=180;assert.strictEqual(vm.percent,100);assert.strictEqual(vm.dashOffset,0);
  window.visualViewport.width=240;window.visualViewport.offsetLeft=0;
  vm.$refs.popover.getBoundingClientRect=()=>({left:40-vm.popoverWidth+vm.popoverShift,right:40+vm.popoverShift});
  vm.togglePopover();await Vue.nextTick();await Vue.nextTick();assert.strictEqual(vm.popoverWidth,216);
  let rect=vm.$refs.popover.getBoundingClientRect();assert(rect.left>=12 && rect.right<=228);
  window.visualViewport.width=320;vm.$refs.popover.getBoundingClientRect=()=>({left:330-vm.popoverWidth+vm.popoverShift,right:330+vm.popoverShift});
  vm.positionPopover();await Vue.nextTick();rect=vm.$refs.popover.getBoundingClientRect();assert(rect.left>=12 && rect.right<=308);
  vm.$destroy();window.visualViewport.width=360;
});

test('a popup near the bottom opens above and constrains its height to available screen space',async()=>{
  const vm=view();window.visualViewport.height=640;window.visualViewport.offsetTop=0;
  vm.$refs.toggleButton.getBoundingClientRect=()=>({top:570,bottom:618});
  vm.$refs.popover.getBoundingClientRect=()=>({left:20,right:300,height:258});
  vm.togglePopover();await Vue.nextTick();await Vue.nextTick();assert(vm.popoverAbove);assert.strictEqual(vm.popoverMaxHeight,550);
  window.visualViewport.height=300;vm.$refs.toggleButton.getBoundingClientRect=()=>({top:100,bottom:148});
  vm.positionPopover();await Vue.nextTick();assert(!vm.popoverAbove);assert.strictEqual(vm.popoverMaxHeight,132);
  vm.$destroy();delete window.visualViewport.height;delete window.visualViewport.offsetTop;
});

(async()=>{try{for(const [name,body] of cases){await body();process.stdout.write('✓ '+name+'\n');}process.stdout.write('Workshop practice statistics UI checks passed.\n');}
finally{global.setTimeout=originalTimeout;global.clearTimeout=originalClear;if(originalDocument===undefined)delete global.document;else global.document=originalDocument;if(originalWindow===undefined)delete global.window;else global.window=originalWindow;}})().catch(error=>{console.error(error);process.exitCode=1;});
