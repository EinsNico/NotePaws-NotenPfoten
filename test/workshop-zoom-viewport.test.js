const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module');
const babel=require('babel-core'),compiler=require('vue-template-compiler');
const filename=path.resolve(__dirname,'../src/components/WorkshopZoomViewport.vue');
const parsed=compiler.parseComponent(fs.readFileSync(filename,'utf8'));
assert.deepStrictEqual(compiler.compile(parsed.template.content).errors,[]);
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod._compile(babel.transform(parsed.script.content,{babelrc:false,presets:[['env',{modules:'commonjs'}]]}).code,filename);
const definition=mod.exports.default,tests=[];
function test(name,body) { tests.push([name,body]); }
function near(actual,expected) { assert.ok(Math.abs(actual-expected)<.001,actual+' should equal '+expected); }
function fixture(props={}) {
  const ticks=[],emitted=[],viewport={clientWidth:360,clientLeft:0,scrollWidth:360,scrollLeft:0,left:40,getBoundingClientRect() {return {left:this.left,width:this.clientWidth};}};
  const content={width:360,getBoundingClientRect() {return {width:this.width,left:viewport.left+viewport.clientLeft+Math.max(0,(viewport.clientWidth-this.width)/2)-viewport.scrollLeft};}};
  const view=Object.assign({zoom:1,minWidth:0,maxWidth:Infinity,ariaLabel:'',
    $refs:{viewport,content},$nextTick(fn) {ticks.push(fn);},$emit(...args) {emitted.push(args);}},props,definition.data());
  Object.entries(definition.methods).forEach(([key,fn])=>{view[key]=fn.bind(view);});
  Object.entries(definition.computed).forEach(([key,fn])=>Object.defineProperty(view,key,{get:fn.bind(view)}));
  const flush=()=>{content.width=view.contentWidth;viewport.scrollWidth=Math.max(viewport.clientWidth,content.width);while(ticks.length) ticks.shift()();};
  const zoom=value=>{view.zoom=value;definition.watch.zoom.call(view);flush();};
  view.updateWidth();flush();return {view,viewport,content,flush,zoom,emitted};
}

test('100 percent retains its normal width, and invalid zoom cannot create unusable CSS dimensions',()=>{
  const f=fixture();assert.strictEqual(f.view.contentStyle.width,'360px');assert.strictEqual(f.viewport.scrollLeft,0);
  for(const value of [0,-1,NaN,Infinity]) {f.zoom(value);assert.strictEqual(f.view.contentWidth,360);assert.strictEqual(f.viewport.scrollLeft,0);}
  assert.strictEqual(f.view.contentStyle.maxWidth,'none');
});
test('zooming a centered capped score retains its actual center instead of treating its margin as score content',()=>{
  const f=fixture({maxWidth:570});f.viewport.clientWidth=866;f.view.updateWidth();f.flush();
  assert.strictEqual(f.content.getBoundingClientRect().left,188);near(f.view.scrollCenter(),.5);
  f.zoom(2);near(f.viewport.scrollLeft,137);near(f.view.scrollCenter(),.5);
  f.viewport.scrollLeft=200;near(f.view.scrollCenter(),633/1140);f.zoom(3);near(f.viewport.scrollLeft,516.5);
});
test('a panned visible center follows consecutive zoom changes without losing the selected score area',()=>{
  const f=fixture();f.zoom(2);near(f.viewport.scrollLeft,180);
  f.viewport.scrollLeft=150;f.zoom(3);near(f.viewport.scrollLeft,315);
  f.zoom(2);near(f.viewport.scrollLeft,150);
});
test('returning to 100 percent starts at the beginning even when a dense score remains wider than the viewport',()=>{
  const f=fixture({minWidth:700});f.zoom(2);f.viewport.scrollLeft=400;f.zoom(1);
  assert.strictEqual(f.view.contentWidth,700);assert.strictEqual(f.viewport.scrollLeft,0);
});
test('resizing changes the underlying width while preserving the visible position within the score',()=>{
  const f=fixture({zoom:2});f.viewport.scrollLeft=120;f.viewport.clientWidth=400;f.view.updateWidth();f.flush();
  assert.strictEqual(f.view.availableWidth,400);assert.strictEqual(f.view.contentWidth,800);
  near(f.viewport.scrollLeft,320/720*800-200);assert.deepStrictEqual(f.emitted[f.emitted.length-1],['resize',400]);
});
test('width constraints and zooming out retain a centered, finite score',()=>{
  const f=fixture({minWidth:500,maxWidth:570});assert.strictEqual(f.view.baseWidth,500);
  f.viewport.clientWidth=1000;f.view.updateWidth();f.flush();assert.strictEqual(f.view.baseWidth,570);
  f.zoom(.75);near(f.view.scrollCenter(),.5);assert.strictEqual(f.viewport.scrollLeft,0);
  f.zoom(2);near(f.viewport.scrollLeft,70);
});
test('manual scrolling clamps its range and reset cancels a pending zoom recenter',()=>{
  const f=fixture({zoom:2});f.view.zoom=3;definition.watch.zoom.call(f.view);f.view.resetScroll();f.flush();
  assert.strictEqual(f.viewport.scrollLeft,0);f.view.scrollBy(9999);assert.strictEqual(f.viewport.scrollLeft,720);
  f.view.scrollBy(-9999);assert.strictEqual(f.viewport.scrollLeft,0);f.view.scrollBy(NaN);assert.strictEqual(f.viewport.scrollLeft,0);
});
test('destruction disconnects observers, removes resize fallback listeners and cancels deferred scroll requests',()=>{
  const previousObserver=global.ResizeObserver,previousWindow=global.window,calls=[];
  try {
    global.ResizeObserver=class {constructor(fn) {this.fn=fn;} observe(target) {calls.push(['observe',target]);} disconnect() {calls.push(['disconnect']);}};
    const observed=fixture();definition.mounted.call(observed.view);assert.strictEqual(calls[0][1],observed.viewport);
    observed.view.zoom=2;definition.watch.zoom.call(observed.view);definition.beforeDestroy.call(observed.view);
    observed.viewport.scrollLeft=35;observed.flush();assert.strictEqual(observed.viewport.scrollLeft,35);assert.strictEqual(calls[1][0],'disconnect');
    delete global.ResizeObserver;global.window={addEventListener(...args) {calls.push(['add',...args]);},removeEventListener(...args) {calls.push(['remove',...args]);}};
    const fallback=fixture();definition.mounted.call(fallback.view);definition.beforeDestroy.call(fallback.view);
    assert.deepStrictEqual(calls.slice(2),[['add','resize',fallback.view.updateWidth],['remove','resize',fallback.view.updateWidth]]);
  } finally {if(previousObserver===undefined) delete global.ResizeObserver;else global.ResizeObserver=previousObserver;if(previousWindow===undefined) delete global.window;else global.window=previousWindow;}
});
for(const [name,body] of tests) {body();process.stdout.write('✓ '+name+'\n');}
process.stdout.write(tests.length+' workshop zoom viewport tests passed.\n');
