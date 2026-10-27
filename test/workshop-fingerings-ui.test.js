const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module');
const babel = require('babel-core'), compiler = require('vue-template-compiler'), Vue = require('vue');

global.regeneratorRuntime = require('babel-runtime/regenerator');
global.window = { scrollTo() {}, addEventListener() {}, removeEventListener() {} };
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
  const filename = path.join(sourceRoot, 'components', name + '.vue');
  const parsed = compiler.parseComponent(fs.readFileSync(filename, 'utf8'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(babel.transform(parsed.script.content, { babelrc:false, presets:[['env', { modules:'commonjs' }]] }).code, filename);
  return { definition:Object.assign({}, mod.exports.default, compiler.compileToFunctions(parsed.template.content)), parsed };
}
const workshop = component('Workshop'), fingeringControl = component('WorkshopFingeringControls');
workshop.definition.components.WorkshopFingeringControls = fingeringControl.definition;
const model = require('../src/model/Workshop'), fingerings = require('../src/model/WorkshopFingerings');
const strings = { de:require('../src/resources/de').default, en:require('../src/resources/en').default };
Module._extensions['.js'] = originalJs;
if (originalVue) Module._extensions['.vue'] = originalVue; else delete Module._extensions['.vue'];

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function translator(locale) {
  return { $t(key, values = {}) { return Object.keys(values).reduce((text, name) => text.replace('{' + name + '}', values[name]), strings[locale][key] || key); },
    $tc(key, count, values) { return this.$t(key, values); } };
}
function editor(locale = 'de') {
  global.localStorage = storage();
  const view = new Vue(Object.assign({}, workshop.definition, { created:undefined, mounted:undefined,
    methods:Object.assign({}, workshop.definition.methods, translator(locale)) }));
  view.$i18n = { locale }; view.player = { play() {}, stopAll() {} }; view.newPiece();
  return view;
}
function control(parent, locale = 'de', compact = false) {
  const view = new Vue(Object.assign({}, fingeringControl.definition, { propsData:{ selectedNotes:parent.selectedNotes, compact },
    methods:Object.assign({}, fingeringControl.definition.methods, translator(locale)) }));
  view.sync = () => { view.selectedNotes = parent.selectedNotes; };
  view.$on('simple', value => { parent.setFingering(value); view.sync(); });
  view.$on('change', value => { parent.setFingerings(value); view.sync(); });
  return view;
}
function note(id, slot = 0, extra = {}) {
  return Object.assign({ id, kind:'note', pitch:{ step:'C', alter:0, octave:4 }, noteValue:'quarter', startSlot:slot }, extra);
}
function withNote(extra = {}, locale = 'de') {
  const parent = editor(locale); parent.currentBar.events = [note('fingering-note', 0, extra)]; parent.resetHistory(); parent.selectEvent(parent.currentBar.events[0]);
  return { parent, view:control(parent, locale) };
}
function nodes(node) { return [node].concat(...(node.children || []).map(nodes)); }
function text(node) { return (node.text || '') + (node.children || []).map(text).join(' '); }
function attrs(node) { return node.data && node.data.attrs || {}; }
function button(view, label) { const found = nodes(view._render()).find(node => node.tag === 'button' && (text(node).trim() === label || attrs(node)['aria-label'] === label)); assert(found, label); return found; }
function click(node) { assert(node.data && node.data.on && node.data.on.click); node.data.on.click({}); }
function entryControls(view, index) {
  const entry = nodes(view._render()).filter(node => node.data && node.data.staticClass === 'fingering-entry')[index]; assert(entry);
  return nodes(entry).filter(node => ['input', 'select'].includes(node.tag));
}
function withoutFingering(event) { const result = clone(event); delete result.fingering; delete result.fingerings; return result; }
function destroy(pair) { pair.view.$destroy(); pair.parent.$destroy(); }
const failures = [];
function test(name, callback) {
  try { callback(); process.stdout.write('✓ ' + name + '\n'); }
  catch (error) { failures.push(error); process.stderr.write('✗ ' + name + '\n' + error.stack + '\n'); }
}

function run() {
  failures.length = 0;
  test('fingering is directly visible beside the selected note, outside every disclosure', () => {
    const pair = withNote({ fingering:3 });
    let ancestors;
    function visit(node, parents = []) {
      if (node.componentOptions && node.componentOptions.tag === 'WorkshopFingeringControls') ancestors = parents;
      (node.children || []).forEach(child => visit(child, parents.concat(node)));
    }
    visit(pair.parent._render()); assert(ancestors); assert(!ancestors.some(node => node.tag === 'details'));
    assert(ancestors.some(node => node.data && node.data.staticClass === 'selection-panel'));
    assert(!workshop.parsed.template.content.includes('@change="setFingering($event.target.value)"'));
    assert.strictEqual(pair.view.currentLabel, '3'); assert.strictEqual(pair.view.simpleFinger, 3);
    pair.parent.clearSelection(); assert(!nodes(pair.parent._render()).some(node => node.componentOptions && node.componentOptions.tag === 'WorkshopFingeringControls'));
    destroy(pair);
  });
  test('quick choices work in German and English with accessible names and reversible legacy storage', () => {
    for (const locale of ['de', 'en']) {
      const pair = withNote({}, locale), original = withoutFingering(pair.parent.selectedEvent);
      for (const finger of [1, 5, 3]) {
        click(button(pair.view, pair.view.$t('WORKSHOP_FINGERING_FINGER', { finger })));
        assert.strictEqual(pair.parent.selectedEvent.fingering, finger); assert.strictEqual(pair.view.simpleFinger, finger);
        assert.strictEqual(attrs(button(pair.view, pair.view.$t('WORKSHOP_FINGERING_FINGER', { finger })))['aria-pressed'], true);
        assert.deepStrictEqual(withoutFingering(pair.parent.selectedEvent), original);
      }
      const count = pair.parent.undoStack.length; click(button(pair.view, pair.view.$t('WORKSHOP_FINGERING_FINGER', { finger:3 })));
      assert.strictEqual(pair.parent.undoStack.length, count); pair.parent.undo(); assert.strictEqual(pair.parent.currentBar.events[0].fingering, 5);
      pair.parent.redo(); assert.strictEqual(pair.parent.currentBar.events[0].fingering, 3); assert(model.isValidWorkshopScore(pair.parent.draft.score));
      assert(!text(pair.view._render()).includes('WORKSHOP_')); destroy(pair);
    }
  });
  test('the actual parent supplies selected notes and routes both child event hooks through editor history', () => {
    const pair = withNote({ fingering:3 }), original = withoutFingering(pair.parent.selectedEvent);
    const child = nodes(pair.parent._render()).find(node => node.componentOptions && node.componentOptions.tag === 'WorkshopFingeringControls');
    assert.deepStrictEqual(clone(child.componentOptions.propsData.selectedNotes), clone(pair.parent.selectedNotes));
    const configured = new Vue(Object.assign({}, fingeringControl.definition, { propsData:child.componentOptions.propsData,
      methods:Object.assign({}, fingeringControl.definition.methods, translator('de')) }));
    assert.strictEqual(configured.compact, true); configured.$destroy();
    child.componentOptions.listeners.simple('4'); assert.strictEqual(pair.parent.selectedEvent.fingering, 4);
    const rich = [{ value:'4' }, { value:'2', substitution:true }];
    child.componentOptions.listeners.change(rich); assert.deepStrictEqual(fingerings.workshopFingerings(pair.parent.selectedEvent), rich);
    assert.deepStrictEqual(withoutFingering(pair.parent.selectedEvent), original); assert.strictEqual(pair.parent.undoStack.length, 2);
    assert.strictEqual(pair.parent.historyAction.key, 'WORKSHOP_HISTORY_FINGERING');
    pair.parent.undo(); assert.strictEqual(pair.parent.currentBar.events[0].fingering, 4);
    pair.parent.undo(); assert.strictEqual(pair.parent.currentBar.events[0].fingering, 3); destroy(pair);
  });
  test('compact fingering keeps every quick finger directly accessible and its labelled clear action is undoable', () => {
    for (const locale of ['de', 'en']) {
      const parent = editor(locale); parent.currentBar.events = [note('compact-finger', 0, { fingering:3 })];
      parent.resetHistory(); parent.selectEvent(parent.currentBar.events[0]); const view = control(parent, locale, true);
      const original = clone(parent.selectedEvent);
      for (const finger of [1,2,3,4,5]) assert(button(view, view.$t('WORKSHOP_FINGERING_FINGER', { finger })));
      const clear = button(view, view.$t('WORKSHOP_FINGERING_CLEAR'));
      assert.strictEqual(attrs(clear).disabled, false); click(clear);
      assert.strictEqual(parent.selectedEvent.fingering, undefined); assert.strictEqual(parent.undoStack.length, 1);
      assert.strictEqual(attrs(button(view, view.$t('WORKSHOP_FINGERING_CLEAR'))).disabled, true);
      assert.deepStrictEqual(withoutFingering(parent.selectedEvent), withoutFingering(original));
      parent.undo(); assert.deepStrictEqual(clone(parent.currentBar.events[0]), original);
      destroy({ parent, view });
    }
  });
  test('finger changes, alternatives and placement edit the selected note without changing its musical timing', () => {
    const pair = withNote({ fingering:1 }), original = withoutFingering(pair.parent.selectedEvent);
    click(button(pair.view, pair.view.$t('WORKSHOP_FINGERING_ADD_CHANGE')));
    assert.deepStrictEqual(fingerings.workshopFingerings(pair.parent.selectedEvent), [{ value:'1' }, { value:'2', substitution:true }]);
    click(button(pair.view, pair.view.$t('WORKSHOP_FINGERING_ADD_ALTERNATIVE')));
    const alternative = entryControls(pair.view, 2);
    alternative[0].data.on.change({ target:{ value:'3' } });
    alternative[3].data.on.change({ target:{ value:'below' } });
    assert.deepStrictEqual(fingerings.workshopFingerings(pair.parent.selectedEvent), [{ value:'1' }, { value:'2', substitution:true }, { value:'3', alternate:true, placement:'below' }]);
    assert.strictEqual(pair.view.currentLabel, '1–2 (3)'); assert.strictEqual(pair.parent.selectedEvent.fingering, undefined);
    assert.deepStrictEqual(withoutFingering(pair.parent.selectedEvent), original); assert(model.isValidWorkshopScore(pair.parent.draft.score));
    const changed = clone(pair.parent.selectedEvent); pair.parent.undo(); assert.strictEqual(pair.parent.currentBar.events[0].fingerings[2].placement, undefined);
    pair.parent.redo(); assert.deepStrictEqual(clone(pair.parent.currentBar.events[0]), changed); destroy(pair);
  });
  test('opening and quick choices preserve imported alternatives, finger changes and their placement', () => {
    const imported = [{ value:'1', placement:'above' }, { value:'2', substitution:true, placement:'above' }, { value:'3', alternate:true, placement:'below' }];
    const pair = withNote({ fingerings:imported }), before = clone(pair.parent.selectedEvent);
    pair.view._render(); assert.deepStrictEqual(clone(pair.parent.selectedEvent), before); assert.strictEqual(pair.parent.undoStack.length, 0);
    click(button(pair.view, pair.view.$t('WORKSHOP_FINGERING_FINGER', { finger:4 })));
    assert.deepStrictEqual(fingerings.workshopFingerings(pair.parent.selectedEvent), [{ value:'4', placement:'above' }, { value:'2', substitution:true, placement:'above' }, { value:'3', alternate:true, placement:'below' }]);
    assert.strictEqual(pair.view.simpleFinger, 4); assert.strictEqual(pair.parent.selectedEvent.fingering, undefined);
    pair.parent.undo(); assert.deepStrictEqual(clone(pair.parent.currentBar.events[0]), before);
    pair.parent.redo(); assert.strictEqual(pair.parent.currentBar.events[0].fingerings[0].value, '4');
    pair.parent.selectEvent(pair.parent.currentBar.events[0]); assert(pair.parent.setFingering('5'));
    assert.strictEqual(pair.parent.selectedEvent.fingering, 5); assert.strictEqual(pair.parent.selectedEvent.fingerings, undefined);
    pair.parent.undo(); assert.deepStrictEqual(fingerings.workshopFingerings(pair.parent.currentBar.events[0]), [{ value:'4', placement:'above' }, { value:'2', substitution:true, placement:'above' }, { value:'3', alternate:true, placement:'below' }]); destroy(pair);
  });
  test('remove individual entries and clear all remove both formats with undo preserving complete annotations', () => {
    const imported = [{ value:'1' }, { value:'2', substitution:true }, { value:'3', alternate:true }];
    const pair = withNote({ fingerings:imported });
    click(button(pair.view, pair.view.$t('WORKSHOP_FINGERING_REMOVE_ENTRY', { number:2 })));
    assert.deepStrictEqual(fingerings.workshopFingerings(pair.parent.selectedEvent), [{ value:'1' }, { value:'3', alternate:true }]);
    click(button(pair.view, pair.view.$t('WORKSHOP_FINGERING_CLEAR')));
    assert.strictEqual(pair.parent.selectedEvent.fingerings, undefined); assert.strictEqual(pair.parent.selectedEvent.fingering, undefined);
    pair.parent.undo(); assert.deepStrictEqual(fingerings.workshopFingerings(pair.parent.currentBar.events[0]), [{ value:'1' }, { value:'3', alternate:true }]);
    pair.parent.undo(); assert.deepStrictEqual(fingerings.workshopFingerings(pair.parent.currentBar.events[0]), imported);
    pair.parent.selectEvent(pair.parent.currentBar.events[0]); assert(pair.parent.setFingering('')); assert.strictEqual(pair.parent.selectedEvent.fingerings, undefined); destroy(pair);
  });
  test('mixed and uniform multiple selections ask for one note and never overwrite other fingerings', () => {
    for (const mixed of [false, true]) {
      const parent = editor(); parent.currentBar.events = [note('a', 0, { fingering:1 }), note('b', 2, { fingering:mixed ? 3 : 1 })];
      parent.multiSelect = true; parent.restoreSelection(['a', 'b'], 'a'); const view = control(parent);
      const before = JSON.stringify(parent.draft.score); assert.strictEqual(view.mixed, mixed);
      assert(text(view._render()).includes(view.$t(mixed ? 'WORKSHOP_FINGERING_MIXED_HINT' : 'WORKSHOP_FINGERING_SELECT_ONE')));
      assert(!nodes(view._render()).some(node => ['button', 'input', 'select'].includes(node.tag)));
      view.chooseFinger(5); view.clear(); view.addEntry(); view.changeEntry(0, 'value', '4');
      assert.strictEqual(parent.setFingering('5'), false); assert.strictEqual(parent.setFingerings([{ value:'5' }]), false);
      assert.strictEqual(JSON.stringify(parent.draft.score), before); assert.strictEqual(parent.undoStack.length, 0);
      destroy({ parent, view });
    }
  });
  test('invalid entries and the annotation limit cannot corrupt the draft or add history', () => {
    const pair = withNote({ fingerings:[{ value:'1' }] });
    const initial = JSON.stringify(pair.parent.draft.score), valueInput = entryControls(pair.view, 0)[0];
    const empty = { target:{ value:'  ' } }; valueInput.data.on.change(empty); assert(pair.view.error); assert.strictEqual(empty.target.value, '1');
    const long = { target:{ value:'x'.repeat(33) } }; valueInput.data.on.change(long); assert(pair.view.error); assert.strictEqual(long.target.value, '1');
    assert.strictEqual(JSON.stringify(pair.parent.draft.score), initial); assert.strictEqual(pair.parent.undoStack.length, 0);
    valueInput.data.on.change({ target:{ value:'  1–2  ' } }); assert.strictEqual(pair.parent.selectedEvent.fingerings[0].value, '1–2'); assert.strictEqual(pair.view.error, false);
    assert.strictEqual(valueInput.data.attrs.maxlength, 32);
    while (pair.view.entries.length < 16) pair.view.addEntry(); const limited = JSON.stringify(pair.parent.draft.score), count = pair.parent.undoStack.length;
    assert.strictEqual(attrs(button(pair.view, pair.view.$t('WORKSHOP_FINGERING_ADD_CHANGE'))).disabled, true);
    assert.strictEqual(pair.view.addEntry('substitution'), false); assert.strictEqual(pair.parent.setFingerings(Array.from({ length:17 }, () => ({ value:'1' }))), false);
    assert.strictEqual(JSON.stringify(pair.parent.draft.score), limited); assert.strictEqual(pair.parent.undoStack.length, count); assert(model.isValidWorkshopScore(pair.parent.draft.score)); destroy(pair);
  });
  test('saving and reopening retains every finger, flag and placement independently on chord notes', () => {
    const parent = editor(); parent.currentBar.events = [note('low', 0), note('middle', 0, { pitch:{ step:'E', alter:0, octave:4 }, fingering:3 }), note('high', 0, { pitch:{ step:'G', alter:0, octave:4 }, fingering:5 })];
    parent.selectEvent(parent.currentBar.events[0]); const view = control(parent); const wanted = [{ value:'1', placement:'below' }, { value:'2', substitution:true }, { value:'3', alternate:true, placement:'above' }];
    assert(parent.setFingerings(wanted)); assert(parent.savePiece()); const saved = clone(parent.currentPiece);
    parent.closeEditor(); parent.openPiece(saved); assert.deepStrictEqual(fingerings.workshopFingerings(parent.currentBar.events[0]), wanted);
    assert.deepStrictEqual(parent.currentBar.events.slice(1).map(event => event.fingering), [3, 5]); assert.strictEqual(parent.dirty, false);
    parent.selectEvent(parent.currentBar.events[0]); view.sync(); assert.strictEqual(view.currentLabel, '1–2 (3)'); assert.strictEqual(entryControls(view, 0)[3].data.domProps.value, 'below');
    assert(model.isValidWorkshopScore(parent.draft.score)); destroy({ parent, view });
  });
  test('import notices retain a semantic spaced list without visible bullet markers', () => {
    const parent = editor(); parent.importNotice = true; parent.xmlMessage = 'WORKSHOP_XML_IMPORTED'; parent.xmlWarnings = ['unsupported-notation', 'source-preserved'];
    const dialog = nodes(parent._render()).find(node => node.tag === 'section' && attrs(node).role === 'dialog' && attrs(node)['aria-labelledby'] === 'workshop-import-notice-title'); assert(dialog);
    const list = nodes(dialog).find(node => node.tag === 'ul'); assert.strictEqual(attrs(list).role, 'list'); assert(nodes(list).filter(node => node.tag === 'li').length >= 2);
    const style = workshop.parsed.styles.map(entry => entry.content).join('\n'); assert(/\.import-notice ul\s*\{[^}]*list-style:none;[^}]*padding:0;/.test(style));
    assert(/\.import-notice li \+ li\s*\{[^}]*margin-top:10px;/.test(style)); parent.$destroy();
  });
  assert.strictEqual(failures.length, 0, failures.length + ' fingering UI test groups failed');
}
module.exports = run;
if (require.main === module) { try { run(); } catch (error) { console.error(error); process.exitCode = 1; } }
