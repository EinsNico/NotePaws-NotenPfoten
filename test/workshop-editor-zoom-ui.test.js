const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module');
const babel = require('babel-core'), compiler = require('vue-template-compiler'), Vue = require('vue');
global.regeneratorRuntime = require('babel-runtime/regenerator');
global.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {}, cancelAnimationFrame() {} };
global.document = { addEventListener() {}, removeEventListener() {} };
function storage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key: index => Array.from(entries.keys())[index] || null,
    getItem: key => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
}
global.localStorage = storage();
const sourceRoot = path.resolve(__dirname, '../src') + path.sep;
const originalJs = Module._extensions['.js'], originalVue = Module._extensions['.vue'];
Module._extensions['.js'] = (mod, filename) => {
  if (!filename.startsWith(sourceRoot)) return originalJs(mod, filename);
  mod._compile(babel.transform(fs.readFileSync(filename, 'utf8'), { babelrc:false, presets:[['env', { modules:'commonjs' }]] }).code, filename);
};
Module._extensions['.vue'] = mod => { mod.exports = {}; };
function component(name) {
  const filename = path.join(sourceRoot, 'components', name + '.vue'), parsed = compiler.parseComponent(fs.readFileSync(filename, 'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content, { babelrc:false, presets:[['env', { modules:'commonjs' }]] }).code, filename);
  return { definition:Object.assign({}, mod.exports.default, compiler.compileToFunctions(parsed.template.content)), parsed };
}
const workshop = component('Workshop'), zoomControl = component('WorkshopEditorZoom'), staff = component('WorkshopStaff'), bridge = component('WorkshopEditorBeamBridge'), sheet = component('WorkshopSheet'), viewportControl = component('WorkshopZoomViewport');
workshop.definition.components.WorkshopEditorZoom = zoomControl.definition;
workshop.definition.components.WorkshopStaff = staff.definition;
workshop.definition.components.WorkshopSheet = sheet.definition;
workshop.definition.components.WorkshopZoomViewport = viewportControl.definition;
const model = require('../src/model/Workshop');
const strings = { de:require('../src/resources/de').default, en:require('../src/resources/en').default };
Module._extensions['.js'] = originalJs;
if (originalVue) Module._extensions['.vue'] = originalVue; else delete Module._extensions['.vue'];
function translator(locale) {
  return { $t(key, values = {}) { return Object.keys(values).reduce((text, name) => text.replace('{' + name + '}', values[name]), strings[locale][key] || key); },
    $tc(key, count, values) { return this.$t(key, values); } };
}
function editor(locale = 'de') {
  global.localStorage = storage();
  const view = new Vue(Object.assign({}, workshop.definition, { created:undefined, mounted:undefined,
    methods:Object.assign({}, workshop.definition.methods, translator(locale)) }));
  view.$i18n = { locale }; view.player = { play() {}, stopAll() {} }; view.newPiece();
  view.currentBar.events = [note('zoom-note')]; view.resetHistory();
  view.change(() => { view.draft.title = 'Version one'; });
  view.change(() => { view.draft.title = 'Version two'; }); view.undo();
  view.selectEvent(view.currentBar.events[0]); view.updateDraftDirty();
  return view;
}
function note(id, slot = 0, value = 48, extra = {}) {
  return Object.assign({ id, kind:'note', pitch:model.workshopPitchFromValue(value), noteValue:'eighth', startSlot:slot }, extra);
}
function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
function text(node) { return (node.text || '') + (node.children || []).map(text).join(' '); }
function attrs(node) { return node.data && node.data.attrs || {}; }
function child(view, tag) { return nodes(view._render()).find(node => node.componentOptions && node.componentOptions.tag === tag); }
function control(parent, locale = 'de') {
  const rendered = child(parent, 'WorkshopEditorZoom'); assert(rendered);
  const view = new Vue(Object.assign({}, zoomControl.definition, { propsData:rendered.componentOptions.propsData,
    methods:Object.assign({}, zoomControl.definition.methods, translator(locale)) }));
  const sync = () => { view.value = parent.editorZoom; view.panning = parent.editorPanning; };
  view.$on('input', value => { rendered.componentOptions.listeners.input(value); sync(); });
  view.$on('pan', value => { rendered.componentOptions.listeners.pan(value); sync(); });
  return view;
}
function button(view, label) {
  const found = nodes(view._render()).find(node => node.tag === 'button' && (text(node).trim() === label || attrs(node)['aria-label'] === label));
  assert(found, label); return found;
}
function click(node) { node.data.on.click({}); }
function musicalState(view) {
  return JSON.stringify({ draft:view.draft, dirty:view.dirty, undo:view.undoStack, redo:view.redoStack,
    selected:view.selectedEventId, selectedIds:view.selectedEventIds, historyAction:view.historyAction });
}
function capturedTarget() {
  const captures = new Set();
  return { captures, setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); }, releasePointerCapture(id) { captures.delete(id); } };
}
function panEvent(target, x = 200, type = 'mouse', id = 23) {
  return { pointerId:id, clientX:x, pointerType:type, isPrimary:true, button:0, currentTarget:target,
    cancelable:true, prevented:false, preventDefault() { this.prevented = true; } };
}
function realStaff(parent) {
  const view = new Vue(Object.assign({}, staff.definition, { propsData:{ measure:parent.currentBar },
    methods:Object.assign({}, staff.definition.methods, translator('de')) }));
  const target = capturedTarget();
  view.$refs.sheet = Object.assign({}, target, {
    getScreenCTM() { return { a:1, b:0, c:0, d:1, e:42, f:61, inverse() { return { a:1, b:0, c:0, d:1, e:-42, f:-61 }; } }; },
    createSVGPoint() { return { x:0, y:0, matrixTransform(m) { return { x:this.x + m.e, y:this.y + m.f }; } }; }
  });
  const emitted = [];
  ['place', 'move-note', 'select', 'change-clef'].forEach(name => view.$on(name, payload => emitted.push({ name, payload })));
  parent.$refs.sheet = [view];
  const pointer = (x, y) => Object.assign(panEvent(target, x + 42, 'touch'), { clientY:y + 61 });
  return { view, target, emitted, pointer };
}
const cases = [];
function test(name, body) { cases.push([name, body]); }

test('German and English zoom controls change only the view, retaining selection and real undo/redo history', () => {
  for (const locale of ['de', 'en']) {
    const parent = editor(locale), view = control(parent, locale), before = musicalState(parent);
    click(button(view, view.$t('WORKSHOP_ZOOM_IN'))); assert.strictEqual(parent.editorZoom, 1.25);
    click(button(view, view.$t('WORKSHOP_ZOOM_OUT'))); assert.strictEqual(parent.editorZoom, 1);
    const range = nodes(view._render()).find(node => node.tag === 'input');
    assert.strictEqual(attrs(range)['aria-label'], view.$t('WORKSHOP_EDITOR_ZOOM'));
    range.data.on.input({ target:{ value:'175' } }); assert.strictEqual(parent.editorZoom, 1.75);
    assert.strictEqual(attrs(nodes(view._render()).find(node => node.tag === 'input'))['aria-valuetext'], '175 %');
    click(button(view, view.$t('WORKSHOP_ZOOM_RESET'))); assert.strictEqual(parent.editorZoom, 1);
    click(button(view, view.$t('WORKSHOP_ZOOM_PAN'))); assert.strictEqual(parent.editorPanning, true);
    assert.strictEqual(attrs(button(view, view.$t('WORKSHOP_ZOOM_EDIT')))['aria-pressed'], true);
    click(button(view, view.$t('WORKSHOP_ZOOM_EDIT'))); assert.strictEqual(parent.editorPanning, false);
    assert.strictEqual(musicalState(parent), before); assert(!text(view._render()).includes('WORKSHOP_'));
    view.$destroy(); parent.$destroy();
  }
});

test('zoom stays between 75 and 200 percent and invalid changes preserve a clean saved draft', () => {
  const parent = editor(), view = control(parent); parent.baseline = JSON.stringify(parent.draft); parent.updateDraftDirty();
  assert.strictEqual(parent.dirty, false); const before = musicalState(parent);
  view.change(.1); assert.strictEqual(parent.editorZoom, .75);
  assert.strictEqual(attrs(button(view, view.$t('WORKSHOP_ZOOM_OUT'))).disabled, true);
  view.change(8); assert.strictEqual(parent.editorZoom, 2);
  assert.strictEqual(attrs(button(view, view.$t('WORKSHOP_ZOOM_IN'))).disabled, true);
  for (const value of [NaN, Infinity, '150']) { parent.setEditorZoom(value); assert.strictEqual(parent.editorZoom, 2); }
  assert.strictEqual(musicalState(parent), before); view.$destroy(); parent.$destroy();
});

test('zoom and pan controls cancel actual held staff input, including a queued clef release click', () => {
  for (const action of ['zoom', 'pan']) for (const kind of ['note', 'empty', 'clef']) {
    const parent = editor(), f = realStaff(parent), view = control(parent), before = musicalState(parent);
    const head = f.view.events.find(item => item.id === 'zoom-note');
    const position = kind === 'clef' ? { x:24, y:110 } : kind === 'note' ? head : { x:f.view.mappedSlotX(4), y:116 };
    f.view.pointerDown(f.pointer(position.x, position.y));
    if (kind === 'clef') f.view.pointerUp(f.pointer(position.x, position.y));
    if (action === 'zoom') click(button(view, view.$t('WORKSHOP_ZOOM_IN')));
    else click(button(view, view.$t('WORKSHOP_ZOOM_PAN')));
    assert.strictEqual(f.view.gesture, null); assert.strictEqual(f.target.captures.size, 0);
    f.view.pointerUp(f.pointer(position.x, position.y));
    f.view._render().data.on.click({ detail:1, button:0, preventDefault() {}, stopPropagation() {} });
    assert.deepStrictEqual(f.emitted, []); assert.strictEqual(musicalState(parent), before);
    view.$destroy(); parent.$destroy(); f.view.$destroy();
  }
});

test('mouse panning scrolls the enlarged paper instead of changing its notes', () => {
  const parent = editor(), viewport = { scrollLeft:120 }, target = capturedTarget();
  parent.$refs.editorViewport = { viewportElement:() => viewport }; parent.setEditorZoom(2); parent.setEditorPanning(true);
  const before = musicalState(parent), down = panEvent(target);
  parent.startEditorPan(down); assert.strictEqual(target.captures.size, 1); assert(down.prevented);
  parent.moveEditorPan(panEvent(target, 120)); assert.strictEqual(viewport.scrollLeft, 200);
  parent.moveEditorPan(panEvent(target, 500, 'mouse', 99)); assert.strictEqual(viewport.scrollLeft, 200);
  parent.cancelEditorPan(); assert.strictEqual(target.captures.size, 0); assert.strictEqual(parent.editorPanGesture, null);
  assert.strictEqual(musicalState(parent), before); parent.$destroy();
});

test('touch panning permits native browser scrolling without capturing or canceling the pointer', () => {
  const parent = editor(), viewport = { scrollLeft:120 }, target = capturedTarget();
  parent.$refs.editorViewport = { viewportElement:() => viewport }; parent.setEditorPanning(true);
  const before = musicalState(parent), down = panEvent(target, 200, 'touch');
  parent.startEditorPan(down); parent.moveEditorPan(panEvent(target, 100, 'touch'));
  assert.strictEqual(parent.editorPanGesture, null); assert.strictEqual(target.captures.size, 0);
  assert.strictEqual(down.prevented, false); assert.strictEqual(viewport.scrollLeft, 120);
  assert.strictEqual(musicalState(parent), before); parent.$destroy();
});

test('changing views cancels a captured pan, keeps zoom and sends that zoom to the sheet overview', () => {
  const parent = editor(), viewport = { scrollLeft:80 }, target = capturedTarget();
  parent.$refs.editorViewport = { viewportElement:() => viewport }; parent.setEditorZoom(1.5); parent.setEditorPanning(true);
  parent.startEditorPan(panEvent(target)); const before = JSON.stringify({ draft:parent.draft, undo:parent.undoStack, redo:parent.redoStack });
  parent.setSheetView(true);
  assert.strictEqual(parent.editorZoom, 1.5); assert.strictEqual(parent.editorPanning, false);
  assert.strictEqual(parent.editorPanGesture, null); assert.strictEqual(target.captures.size, 0);
  assert.strictEqual(child(parent, 'WorkshopEditorZoom').componentOptions.propsData.canPan, false);
  assert.strictEqual(child(parent, 'WorkshopSheet').componentOptions.propsData.zoom, 1.5);
  parent.setSheetView(false); assert.strictEqual(parent.editorZoom, 1.5);
  assert.strictEqual(child(parent, 'WorkshopZoomViewport').componentOptions.propsData.zoom, 1.5);
  assert.strictEqual(JSON.stringify({ draft:parent.draft, undo:parent.undoStack, redo:parent.redoStack }), before);
  parent.listeningView = true; assert(!child(parent, 'WorkshopEditorZoom')); parent.$destroy();
});

test('changing zoom or pan mode releases an unfinished mouse pan without adding history', () => {
  for (const change of ['zoom', 'pan']) {
    const parent = editor(), viewport = { scrollLeft:120 }, target = capturedTarget();
    parent.$refs.editorViewport = { viewportElement:() => viewport }; parent.setEditorPanning(true);
    parent.startEditorPan(panEvent(target)); const before = musicalState(parent);
    if (change === 'zoom') parent.setEditorZoom(1.75); else parent.setEditorPanning(false);
    assert.strictEqual(parent.editorPanGesture, null); assert.strictEqual(target.captures.size, 0);
    parent.moveEditorPan(panEvent(target, 100)); assert.strictEqual(viewport.scrollLeft, 120);
    assert.strictEqual(musicalState(parent), before); parent.$destroy();
  }
});

test('cross-staff beams, glissando waves and tremolo marks scale with the physically enlarged SVG', () => {
  const score = model.setWorkshopSecondStaffEnabled(model.createWorkshopDraft().score, true);
  const first = note('cross-a', 0, 52, { beamGroupId:'zoom-beam' });
  const second = note('cross-b', 1, 36, { beamGroupId:'zoom-beam', displayStaff:1 });
  const third = note('cross-c', 2, 55, { noteValue:'quarter', twoNoteTremolo:true });
  const fourth = note('cross-d', 3, 41, { noteValue:'quarter', twoNoteTremolo:true, displayStaff:1 });
  score.parts[0].measures[0].events = [first, second, third, fourth];
  score.glissandos = [{ fromId:first.id, toId:second.id, type:'glissando' }];
  score.tremolos = [{ fromId:third.id, toId:fourth.id, marks:3 }];
  assert(model.isValidWorkshopScore(score)); const before = JSON.stringify(score), structures = [];
  for (const scale of [.75, 1, 2]) {
    const staves = [0, 1].map(index => {
      const view = new Vue(Object.assign({}, staff.definition, { propsData:{ measure:model.resolveWorkshopMeasure(score, 0, index),
        clef:index ? 'bass' : 'treble', staffIndex:index, companionMeasure:model.resolveWorkshopMeasure(score, 0, index ? 0 : 1) },
        methods:Object.assign({}, staff.definition.methods, translator('de')) }));
      // Parent and each SVG share the actual left position after a 137px scroll.
      view.$refs.sheet = { getScreenCTM:() => ({ a:scale, b:0, c:0, d:scale, e:48 - 137, f:213 + index * 320 * scale }) };
      return view;
    });
    const view = new Vue(Object.assign({}, bridge.definition, { propsData:{ score, displayZoom:scale, getStaffs:() => staves }, mounted:undefined }));
    view.$el = { parentElement:{ getBoundingClientRect:() => ({ left:48 - 137, top:213, width:360 * scale, height:620 * scale }) } };
    view.updateOverlay(); assert.strictEqual(view.screenScale, scale);
    assert.strictEqual(view.overlay.beams.length, 1); assert.deepStrictEqual(view.overlay.curves.map(curve => curve.kind), ['glissando', 'tremolo']);
    const points = view.overlay.beams[0].points.split(' ').map(point => point.split(',').map(Number));
    assert(Math.abs(Math.abs(points[2][1] - points[1][1]) - 5 * scale) < 1e-8, 'beam thickness must enlarge with the note heads');
    const glissando = view.overlay.curves.find(curve => curve.kind === 'glissando').path;
    const tremolo = view.overlay.curves.find(curve => curve.kind === 'tremolo').path;
    structures.push({ points:points.map(point => point.map(value => Number((value / scale).toFixed(6)))),
      glissando:glissando.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(value => Number((Number(value) / scale).toFixed(6))),
      tremolo:tremolo.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(value => Number((Number(value) / scale).toFixed(6))) });
    assert.strictEqual(view._render().data.style['--workshop-bridge-scale'], scale);
    view.$destroy(); staves.forEach(item => item.$destroy());
  }
  assert.deepStrictEqual(structures[0], structures[1]); assert.deepStrictEqual(structures[2], structures[1]);
  assert.strictEqual(JSON.stringify(score), before);
});

test('leaving a piece releases pan capture and the next editor starts ready for notes at the chosen zoom', () => {
  const parent=editor(),target=capturedTarget(),viewport={scrollLeft:50};
  parent.$refs.editorViewport={viewportElement:()=>viewport};
  parent.setEditorZoom(1.5);parent.setEditorPanning(true);parent.startEditorPan(panEvent(target));
  assert.strictEqual(target.captures.size,1);
  parent.closeEditor();assert.strictEqual(target.captures.size,0);assert.strictEqual(parent.editorPanning,false);
  parent.newPiece();assert.strictEqual(parent.editorZoom,1.5);assert.strictEqual(parent.editorPanning,false);assert.strictEqual(parent.editorPanGesture,null);
  parent.$destroy();
});

(async () => {
  for (const [name, body] of cases) { await body(); process.stdout.write('✓ ' + name + '\n'); }
  process.stdout.write('Workshop editor zoom UI tests passed.\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
