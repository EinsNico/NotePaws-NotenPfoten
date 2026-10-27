const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');
const compiler = require('vue-template-compiler');
const Vue = require('vue');

function load(relative, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
  const parsed = relative.endsWith('.vue') ? compiler.parseComponent(source) : null;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', babel.transform(parsed ? parsed.script.content : source, {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code)(mod, mod.exports, name => {
    assert(Object.prototype.hasOwnProperty.call(dependencies, name), 'Unexpected dependency ' + name);
    return dependencies[name];
  });
  if (parsed) {
    assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
    Object.assign(mod.exports.default, compiler.compileToFunctions(parsed.template.content));
  }
  return mod.exports;
}
const naming = load('model/NoteNaming.js');
const utils = load('model/Utils.js', { './NoteNaming': naming }).default;
const ranges = load('model/NoteRanges.js');
const component = load('components/CustomKeyboardPreview.vue', {
  '../model/Utils': utils, '../model/Options': { noteNaming: 'international' },
  '../model/NoteNaming': naming, '../model/NoteRanges': ranges
}).default;
const originalTimeout = global.setTimeout, originalClear = global.clearTimeout;
let time = 0, sequence = 0;
const timers = new Map(), listeners = new Map();
global.setTimeout = (fn, delay) => { const id = ++sequence; timers.set(id, { fn, due: time + delay }); return id; };
global.clearTimeout = id => timers.delete(id);
global.window = {
  innerWidth: 390, innerHeight: 844,
  addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
  removeEventListener(type, listener) { if (listeners.has(type)) listeners.get(type).delete(listener); }
};
function tick(ms) {
  time += ms;
  for (const [id, timer] of Array.from(timers)) if (timer.due <= time) { timers.delete(id); timer.fn(); }
}
function fire(type, event = {}) { for (const fn of Array.from(listeners.get(type) || [])) fn(event); }
function tree(node) { return !node ? [] : [node].concat((node.children || []).flatMap(tree)); }
function fixture(overrides = {}, width = 245) {
  const vm = new Vue(Object.assign({}, component, {
    propsData: Object.assign({ minValue: 28, bassMaxValue: 48, trebleMinValue: 48, maxValue: 69, showClefAssignment: true }, overrides),
    methods: Object.assign({}, component.methods, { $t: key => key })
  }));
  vm.$refs.keyboard = { getBoundingClientRect: () => ({ left: 20, width }) };
  const updates = [], captures = new Set();
  const target = { setPointerCapture: id => captures.add(id), hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id) };
  for (const [event, prop] of [['min-value','minValue'], ['max-value','maxValue'], ['treble-min-value','trebleMinValue'], ['bass-max-value','bassMaxValue']]) {
    vm.$on('update:' + event, value => { updates.push([prop,value]); vm[prop] = value; });
  }
  const pointer = (x, y = 400, id = 1) => ({ pointerId:id, pointerType:'touch', isPrimary:true, button:0, clientX:x, clientY:y,
    currentTarget:target, cancelable:true, preventDefault() { this.prevented = true; } });
  const start = (handle = 'max', x = 200, y = 400) => vm.startDrag(handle, pointer(x,y));
  const move = (x,y = 400,id = 1) => vm.handlePointerMove(pointer(x,y,id));
  return {vm,updates,captures,pointer,start,move};
}
function test(name, body) {
  body();
  assert.strictEqual(timers.size,0,'No delayed lens may survive the gesture');
  assert(Array.from(listeners.values()).every(set=>set.size===0),'No gesture listeners may leak');
  console.log('✓ '+name);
}
try {
  test('long press opens without changing the range; finger drift does not cause a jump', () => {
    const f=fixture(); f.start(); tick(200); f.move(202,402); tick(249);
    assert.strictEqual(f.vm.precisionMode,false); tick(1);
    assert.strictEqual(f.vm.precisionMode,true); assert.deepStrictEqual(f.updates,[]);
    f.move(202,402); assert.deepStrictEqual(f.updates,[]);
    assert.strictEqual(tree(f.vm._render()).filter(n=>n.data && n.data.staticClass==='range-magnifier').length,1);
    f.vm.endDrag(f.pointer(202)); assert.strictEqual(f.vm.precisionMode,false); assert.strictEqual(f.captures.size,0); f.vm.$destroy();
  });
  test('phone precision requires 28 pixels per white key and remains responsive in both directions', () => {
    const f=fixture(); f.start(); tick(450); f.move(213); assert.strictEqual(f.vm.maxValue,69);
    f.move(228); assert.strictEqual(f.vm.maxValue,71); f.move(256); assert.strictEqual(f.vm.maxValue,72);
    f.move(172); assert.strictEqual(f.vm.maxValue,67); f.vm.$destroy();
  });
  test('normal drag stays direct and cancels long press instead of changing mode mid-drag', () => {
    const f=fixture(); f.start('max',210); f.move(215); assert.strictEqual(f.vm.maxValue,71);
    tick(500); assert.strictEqual(f.vm.precisionMode,false); f.move(220); assert.strictEqual(f.vm.maxValue,72); f.vm.$destroy();
  });
  test('wide screens use at least threefold finer control', () => {
    const f=fixture({},588); f.start(); tick(450); f.move(236); assert.strictEqual(f.vm.maxValue,71); f.vm.$destroy();
  });
  test('all four handles retain their own bounds, including overlap and gaps', () => {
    for (const [handle,prop,lower,upper] of [['min','minValue',12,48], ['max','maxValue',48,95], ['treble','trebleMinValue',12,69], ['bass','bassMaxValue',28,95]]) {
      const f=fixture(); f.start(handle); tick(450); f.move(10000); assert.strictEqual(f.vm[prop],upper);
      f.move(-10000); assert.strictEqual(f.vm[prop],lower); f.vm.$destroy();
    }
    const f=fixture(); f.start('treble'); tick(450); f.move(172); assert(f.vm.trebleMinValue < f.vm.bassMaxValue);
    f.move(228); assert(f.vm.trebleMinValue > f.vm.bassMaxValue); f.vm.$destroy();
  });
  test('two-handle layouts keep an ordered range and a complete seven-key lens at both edges', () => {
    const f=fixture({showClefAssignment:false,minValue:12,maxValue:95});
    for (const handle of ['min','max']) {
      f.start(handle); tick(450);
      const keys=f.vm.magnifiedKeys; assert.strictEqual(keys.filter(k=>!k.black).length,7);
      assert(keys.every(k=>parseFloat(k.style.left)>=0 && parseFloat(k.style.left)+parseFloat(k.style.width)<=196.001));
      f.vm.stopDrag();
    }
    f.start('min'); tick(450); f.move(10000); assert.strictEqual(f.vm.minValue,95); f.vm.$destroy();
  });
  test('tap, canceled pointer and vertical swipe never leave a delayed lens', () => {
    for (const end of ['up','cancel','vertical','capture']) {
      const f=fixture(); f.start(); tick(100);
      if(end==='vertical') f.move(201,420); else if(end==='capture') f.vm.endDrag(f.pointer(200)); else fire('pointer'+end,f.pointer(200));
      tick(1000); assert.strictEqual(f.vm.activeHandle,null); assert.strictEqual(f.vm.precisionMode,false); f.vm.$destroy();
    }
  });
  test('other fingers cannot take over or release the active handle', () => {
    const f=fixture(); f.start(); f.vm.startDrag('min',f.pointer(100,400,2)); f.move(240,400,2);
    fire('pointerup',f.pointer(240,400,2)); assert.strictEqual(f.vm.activeHandle,'max'); assert.deepStrictEqual(f.updates,[]);
    tick(450); assert.strictEqual(f.vm.precisionMode,true); fire('pointercancel',f.pointer(200)); f.vm.$destroy();
  });
  test('fine mode tolerates vertical finger drift; Escape, blur, scroll, rotation and teardown clean up', () => {
    for(const exit of ['Escape','blur','scroll','resize','destroy']) {
      const f=fixture(); f.start(); tick(450); f.move(228,425); assert.strictEqual(f.vm.maxValue,71);
      if(exit==='Escape') fire('keydown',{key:'Escape'}); else if(exit==='destroy') f.vm.$destroy(); else fire(exit);
      assert.strictEqual(f.vm.precisionMode,false); assert.strictEqual(f.vm.activeHandle,null); f.vm.$destroy();
    }
  });
  test('lens stays inside narrow portrait and landscape viewports and carries live accessible values', () => {
    for(const [w,h,x,y] of [[320,568,8,100],[320,568,315,560],[844,390,800,350]]) {
      window.innerWidth=w; window.innerHeight=h; const f=fixture(); f.start('max',x,y); tick(450);
      const p=f.vm.magnifierPosition; assert(p.left>=8 && p.left+222<=w-8); assert(p.top>=8 && p.top+128<=h-8);
      f.vm.moveHandleByKeyboard('max',{key:'ArrowRight',preventDefault(){}});
      const slider=tree(f.vm._render()).find(n=>n.data && n.data.attrs && n.data.attrs['aria-label']==='TREBLE_HIGHEST_NOTE');
      assert.strictEqual(slider.data.attrs['aria-valuenow'],71); assert.strictEqual(slider.data.attrs['aria-valuetext'],'B5');
      assert.strictEqual(slider.data.attrs['aria-describedby'],f.vm.precisionHintId); f.vm.$destroy();
    }
  });
} finally {
  global.setTimeout=originalTimeout; global.clearTimeout=originalClear;
}
console.log('All 10 keyboard precision groups passed.');
