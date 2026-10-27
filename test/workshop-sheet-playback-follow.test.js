const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler'),Vue=require('vue');
const sourceRoot=path.resolve(__dirname,'../src')+path.sep,originalLoader=Module._extensions['.js'];
Module._extensions['.js']=(mod,filename) => {
  if (!filename.startsWith(sourceRoot)) return originalLoader(mod,filename);
  mod._compile(babel.transform(fs.readFileSync(filename,'utf8'),{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
};
Module._extensions['.vue']=mod => {mod.exports={};};
const model=require('../src/model/Workshop');
const filename=path.join(sourceRoot,'components/WorkshopSheet.vue'),parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const definition=mod.exports.default;
const tests=[];function test(name,body) {tests.push([name,body]);}
function rect(top,height=180,left=20,width=600) {return {top,bottom:top+height,left,right:left+width,height,width};}
function fixture(props={}) {
  const calls=[],callbacks=[],score=model.createWorkshopDraft('Following',60).score;
  global.window={innerHeight:600,innerWidth:900,addEventListener() {},removeEventListener() {},
    getComputedStyle:element => element.style || {},scrollBy:options => calls.push({correction:options})};
  const view=new Vue(Object.assign({},definition,{mounted:undefined,propsData:Object.assign({score,activeBar:0,followPlayback:true},props)}));
  const elements=new Map();
  const element=(index,position=rect(650)) => {
    const node={position,parentElement:null,getBoundingClientRect() {return this.position;},querySelector() {return this.head || null;},
      scrollIntoView(options) {calls.push({index,page:view.pageIndex,options});this.position=rect(200,Math.min(this.position.height,300));}};
    elements.set(index,node);return node;
  };
  view.$el={getBoundingClientRect:() => ({width:900}),querySelector(selector) {
    const index=Number(selector.match(/data-playback-bar="(\d+)"/)[1]),range=view.pageRanges[view.pageIndex];
    return index >= range.start && index < range.end ? elements.get(index) || null : null;
  }};
  return {view,calls,callbacks,element,score,destroy:() => view.$destroy()};
}
async function flush() {await Vue.nextTick();await Vue.nextTick();}

test('playback mounting reveals the active bar after render, and visible note changes do not move it again',async () => {
  const f=fixture();f.element(0);definition.mounted.call(f.view);
  assert.strictEqual(f.calls.length,0);await flush();assert.strictEqual(f.calls.length,1);
  assert.strictEqual(f.calls[0].index,0);assert.strictEqual(f.calls[0].options.behavior,'instant');
  for (const ids of [['first'],['second'],[],['third']]) {f.view.activeEventIds=ids;await flush();}
  assert.strictEqual(f.calls.length,1);f.destroy();
});

test('playback follows page boundaries, explicit page breaks, and repeat jumps back to an earlier page',async () => {
  const score=model.createWorkshopDraft('Pages',60).score;score.layout={pageBreaks:[score.parts[0].measures[3].id]};
  const f=fixture({score});[0,3,27,51].forEach(index => f.element(index));
  for (const [index,page] of [[3,1],[27,2],[51,3],[0,0]]) {
    f.view.activeBar=index;await flush();assert.strictEqual(f.view.pageIndex,page);
    assert.strictEqual(f.calls[f.calls.length-1].index,index);assert.strictEqual(f.calls[f.calls.length-1].page,page);
  }
  assert.strictEqual(f.calls.length,4);f.destroy();
});

test('ordinary sheet navigation keeps its existing behavior without playback scrolling',async () => {
  const f=fixture({followPlayback:false});f.element(25);f.view.changePage(2);
  assert.strictEqual(f.view.pageIndex,2);f.view.activeEventIds=['editor-selected'];await flush();assert.strictEqual(f.view.pageIndex,2);
  f.view.activeBar=25;await flush();assert.strictEqual(f.view.pageIndex,1);assert.strictEqual(f.calls.length,0);
  f.view.changePage(-1);f.view.followPlayback=true;await flush();
  assert.strictEqual(f.view.pageIndex,1);assert.strictEqual(f.calls.length,1);f.destroy();
});

test('stop and component destruction cancel deferred scrolling before it can touch the page',async () => {
  const stopped=fixture();stopped.element(0);stopped.view.queuePlaybackScroll();stopped.view.followPlayback=false;
  await flush();assert.strictEqual(stopped.calls.length,0);stopped.destroy();
  const destroyed=fixture();destroyed.element(0);destroyed.view.queuePlaybackScroll();destroyed.destroy();
  await flush();assert.strictEqual(destroyed.calls.length,0);
});

test('nested scrolling panes and the mobile visual viewport define actual visibility',async () => {
  const f=fixture(),bar=f.element(0,rect(200,180));
  bar.parentElement={style:{overflowY:'auto'},getBoundingClientRect:() => rect(150,180),parentElement:null};
  f.view.queuePlaybackScroll();await flush();assert.strictEqual(f.calls.length,1,'bottom of bar is clipped by inner pane');
  bar.parentElement=null;bar.position=rect(50,180);window.visualViewport={offsetTop:100,offsetLeft:0,height:400,width:900};
  f.view.queuePlaybackScroll();await flush();assert.strictEqual(f.calls.length,2,'top of bar is outside the mobile viewport');
  f.destroy();
});

test('oversized systems follow the sounding head and remain stable through silence between notes',async () => {
  const f=fixture(),bar=f.element(0,rect(-50,850));
  const head={position:rect(650,12,350,14),getBoundingClientRect() {return this.position;},scrollIntoView(options) {
    f.calls.push({head:true,options});this.position=rect(250,12,350,14);
  }};bar.head=head;
  f.view.queuePlaybackScroll();await flush();assert.strictEqual(f.calls.length,1);assert.strictEqual(f.calls[0].head,true);
  f.view.activeEventIds=['next'];await flush();assert.strictEqual(f.calls.length,1);
  bar.head=null;f.view.activeEventIds=[];await flush();assert.strictEqual(f.calls.length,1,'a rest must not pull the large system back to its beginning');
  f.destroy();
});

test('the sticky playback controls cannot cover a sounding bar and do not start scroll animations',async () => {
  const f=fixture(),bar=f.element(0,rect(20,180));f.view.$refs.toolbar={getBoundingClientRect:() => rect(0,80)};
  bar.scrollIntoView=options => {f.calls.push({options});};
  f.view.queuePlaybackScroll();await flush();assert.strictEqual(f.calls.length,2);
  assert.strictEqual(f.calls[1].correction.top,-60);assert.strictEqual(f.calls[1].correction.behavior,'instant');
  const pane={style:{overflowY:'auto'},scrollTop:120,scrollHeight:1000,clientHeight:600,parentElement:null,getBoundingClientRect:() => rect(0,600)};
  bar.parentElement=pane;f.view.queuePlaybackScroll();await flush();assert.strictEqual(pane.scrollTop,60);
  f.destroy();
});

test('invalid or no-longer-rendered active bars do not scroll unrelated content',async () => {
  const f=fixture();f.element(0);for (const index of [null,-1,90]) {f.view.activeBar=index;await flush();}
  assert.strictEqual(f.calls.length,0);f.destroy();
});

(async () => {for (const [name,body] of tests) {await body();process.stdout.write('✓ '+name+'\n');}process.stdout.write(tests.length+' workshop sheet playback follow tests passed.\n');})().catch(error => {console.error(error);process.exitCode=1;});
