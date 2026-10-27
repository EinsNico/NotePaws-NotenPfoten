const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');
const Vue = require('vue');
const compiler = require('vue-template-compiler');
const VueI18n = require('vue-i18n');
Vue.use(VueI18n);
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function evaluate(source, imports = {}) {
  const compiled = babel.transform(source, { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    assert(Object.prototype.hasOwnProperty.call(imports, name), `Unexpected import ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const component = (file, imports) => evaluate(compiler.parseComponent(read(file)).script.content, imports).default;
function test(name, action) { action(); console.log(`✓ ${name}`); }

function focusFixture() {
  const listeners = {};
  const doc = {
    activeElement: null,
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = new Set())).add(fn); },
    removeEventListener(type, fn) { if (listeners[type]) listeners[type].delete(fn); },
    fire(type, details) {
      const event = Object.assign({ prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }, details);
      Array.from(listeners[type] || []).forEach(fn => fn(event));
      return event;
    },
    listenerCount(type) { return (listeners[type] || new Set()).size; }
  };
  class Element {
    constructor(tag = 'DIV', index = -1) {
      this.tagName = tag; this.tabIndex = index; this.children = []; this.parentElement = null;
      this.attributes = {}; this.style = {}; this.visible = true; this.disabled = false;
    }
    append(child) { this.children.push(child); child.parentElement = this; return child; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    closest(selector) {
      let element = this;
      while (element) {
        if ((selector.includes('[hidden]') && element.getAttribute('hidden') !== null)
          || (selector.includes('[inert]') && element.getAttribute('inert') !== null)
          || (selector.includes('[aria-hidden="true"]') && element.getAttribute('aria-hidden') === 'true')) return element;
        element = element.parentElement;
      }
      return null;
    }
    getClientRects() { return this.visible ? [{}] : []; }
    querySelectorAll() {
      const found = [];
      this.children.forEach(child => {
        if (child.tabIndex >= 0 && !child.disabled) found.push(child);
        found.push(...child.querySelectorAll());
      });
      return found;
    }
    focus() { doc.activeElement = this; doc.fire('focusin', { target: this }); }
  }
  const body = doc.body = new Element('BODY'); body.style.overflow = 'auto';
  const app = body.append(new Element());
  const notice = app.append(new Element()); notice.setAttribute('inert', 'preexisting'); notice.setAttribute('aria-hidden', 'false');
  const page = app.append(new Element());
  const content = page.append(new Element());
  const settings = content.append(new Element('BUTTON', 0));
  const opener = content.append(new Element('BUTTON', 0));
  const overlay = page.append(new Element());
  const dialog = overlay.append(new Element('SECTION'));
  const first = dialog.append(new Element('BUTTON', 0));
  const last = dialog.append(new Element('BUTTON', 0));
  const hidden = dialog.append(new Element('BUTTON', 0)); hidden.visible = false;
  const script = body.append(new Element('SCRIPT'));
  opener.focus();
  return { doc, body, app, page, content, opener, settings, overlay, dialog, first, last, hidden, notice, script, Element };
}
const modal = evaluate(read('src/model/ModalFocus.js'));
test('F5: the opening focus, forward/backward boundaries and all background branches stay inside the modal', () => {
  const f = focusFixture();
  const guard = modal.createModalFocusGuard(f.dialog, f.overlay, f.doc, f.opener);
  assert.strictEqual(f.doc.activeElement, f.dialog);
  assert.strictEqual(f.content.getAttribute('inert'), '');
  assert.strictEqual(f.notice.getAttribute('inert'), '');
  assert.strictEqual(f.page.getAttribute('inert'), null);
  assert.strictEqual(f.script.getAttribute('aria-hidden'), null);
  assert.strictEqual(f.body.style.overflow, 'hidden');
  assert(f.doc.fire('keydown', { key: 'Tab', shiftKey: true }).prevented);
  assert.strictEqual(f.doc.activeElement, f.last, 'Shift+Tab from the section must reach the last visible dialog control');
  assert(f.doc.fire('keydown', { key: 'Tab', shiftKey: false }).prevented);
  assert.strictEqual(f.doc.activeElement, f.first);
  assert(f.doc.fire('keydown', { key: 'Tab', shiftKey: true }).prevented);
  assert.strictEqual(f.doc.activeElement, f.last);
  guard.release();
  assert.strictEqual(f.doc.activeElement, f.opener);
  assert.strictEqual(f.content.getAttribute('inert'), null);
  assert.strictEqual(f.notice.getAttribute('inert'), 'preexisting');
  assert.strictEqual(f.notice.getAttribute('aria-hidden'), 'false');
  assert.strictEqual(f.body.style.overflow, 'auto');
  assert.strictEqual(f.doc.listenerCount('keydown'), 0);
  assert.strictEqual(f.doc.listenerCount('focusin'), 0);
  guard.release(); // Idempotent cleanup, e.g. a concurrent route close.
});
test('F5: newly expanded license controls participate; an external focus is recovered and a removed opener is not refocused', () => {
  const f = focusFixture();
  const guard = modal.createModalFocusGuard(f.dialog, f.overlay, f.doc, f.opener);
  const added = f.dialog.append(new f.Element('BUTTON', 0));
  f.doc.fire('keydown', { key: 'Tab', shiftKey: true });
  assert.strictEqual(f.doc.activeElement, added);
  f.settings.focus();
  assert.strictEqual(f.doc.activeElement, f.dialog, 'Programmatic/legacy-browser focus cannot activate the background');
  f.content.children = f.content.children.filter(child => child !== f.opener);
  f.opener.parentElement = null;
  guard.release();
  assert.notStrictEqual(f.doc.activeElement, f.opener);
});
test('F5: the actual dialog installs the guard on mount and Escape closes with reliable cleanup', () => {
  const f = focusFixture();
  const definition = component('src/components/AppInfoDialog.vue', {
    '../../package.json': { version: 'test' }, '../resources/third-party-licenses.v1.json': { components: [] },
    '../resources/agpl-license': '', './BrandWordmark': {}, '../model/ModalFocus': modal
  });
  const emitted = [];
  const instance = { $refs: { dialog: f.dialog }, $el: f.overlay, returnFocus: f.opener, $emit: event => emitted.push(event) };
  Object.keys(definition.methods).forEach(key => { instance[key] = definition.methods[key].bind(instance); });
  const original = global.document; global.document = f.doc;
  try {
    definition.mounted.call(instance);
    const event = f.doc.fire('keydown', { key: 'Escape' });
    assert.deepStrictEqual(emitted, ['close']);
    assert(event.prevented && event.stopped);
    definition.beforeDestroy.call(instance);
    assert.strictEqual(f.doc.activeElement, f.opener);
    assert.strictEqual(f.doc.listenerCount('keydown'), 0);
  } finally { global.document = original; }
});
test('U1: the actual bass-density group interpolates its current count for German and English accessibility', () => {
  const opening = read('src/components/NoteFlowMenu.vue').match(/<div class="flow-density-options"[^>]+>/)[0];
  const compiled = compiler.compileToFunctions(`${opening}</div>`);
  const de = evaluate(read('src/resources/de.js')).default;
  const en = evaluate(read('src/resources/en.js')).default;
  for (const locale of ['de', 'en']) for (const count of [8, 12, 16]) {
    const vm = new Vue({ i18n: new VueI18n({ locale, messages: { de, en } }),
      data: { positionsPerBlock: count }, render: compiled.render, staticRenderFns: compiled.staticRenderFns });
    const label = vm._render().data.attrs['aria-label'];
    assert(!label.includes('{count}'));
    assert(label.includes(String(count)));
    assert.strictEqual(label, (locale === 'de' ? de : en).FLOW_SECOND_NOTES_PER_BLOCK.replace('{count}', count));
  }
});

function withFakeClock(action) {
  const original = { now: Date.now, timeout: global.setTimeout, clear: global.clearTimeout,
    interval: global.setInterval, clearInterval: global.clearInterval, document: global.document, window: global.window };
  let now = 0; let id = 0; const timers = new Map();
  global.setTimeout = (fn, delay) => { const token = ++id; timers.set(token, { fn, at: now + delay }); return token; };
  global.clearTimeout = token => timers.delete(token);
  global.setInterval = () => ++id; global.clearInterval = () => {};
  Date.now = () => now;
  global.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  global.window = { addEventListener() {}, removeEventListener() {} };
  const advance = duration => {
    now += duration;
    let found = true;
    while (found) {
      found = Array.from(timers.entries()).find(entry => entry[1].at <= now);
      if (found) { timers.delete(found[0]); found[1].fn(); }
    }
  };
  try { action(advance); } finally {
    Date.now = original.now; global.setTimeout = original.timeout; global.clearTimeout = original.clear;
    global.setInterval = original.interval; global.clearInterval = original.clearInterval;
    global.document = original.document; global.window = original.window;
  }
}
function midiFixture() {
  const callbacks = [];
  const midi = { supported: true, enabled: false, inputs: [], addListener() {}, removeListener() {},
    enable(fn) { callbacks.push(fn); } };
  return { midi, callbacks };
}
function makeHome(midi, connection) {
  const definition = component('src/components/HomeMenu.vue', {
    './AppInfoDialog': {}, './DailyTasksButton': {}, './BrandWordmark': {}, './HomeMusicBackdrop': {}, webmidi: midi,
    '../model/MidiConnection': connection, lockr: { get: () => null },
    '../model/PrestigeArchive': { createEmptyPrestigeArchive: () => ({}), summarizePrestigeArchive: () => ({ prestige: 0 }) }
  });
  const instance = Object.assign(definition.data(), { $t: key => key });
  Object.keys(definition.methods).forEach(key => { instance[key] = definition.methods[key].bind(instance); });
  Object.keys(definition.computed).forEach(key => Object.defineProperty(instance, key, { get: () => definition.computed[key].call(instance) }));
  definition.mounted.call(instance);
  return { instance, destroy: () => definition.beforeDestroy.call(instance) };
}
test('U2: a long permission wait is distinct from disconnection; rechecking and reopening retain one native request', () => withFakeClock(advance => {
  const connection = evaluate(read('src/model/MidiConnection.js'));
  const f = midiFixture(); const home = makeHome(f.midi, connection);
  assert.strictEqual(home.instance.midiStatus, 'checking');
  advance(connection.MIDI_PERMISSION_WAIT_HINT_MS - 1);
  assert.strictEqual(home.instance.midiStatus, 'checking');
  advance(1);
  assert.strictEqual(home.instance.midiStatus, 'permission-pending');
  assert.strictEqual(home.instance.midiStatusLabel, 'HOME_MIDI_WAITING_PERMISSION');
  for (let i = 0; i < 50; i++) { home.instance.checkMidiConnection(); home.instance.refreshMidiStatus(); }
  assert.strictEqual(home.instance.midiStatus, 'permission-pending');
  assert.strictEqual(f.callbacks.length, 1, 'Checks never create competing browser permission requests');
  home.destroy();
  const reopened = makeHome(f.midi, connection);
  assert.strictEqual(reopened.instance.midiStatus, 'permission-pending');
  f.midi.enabled = true; f.midi.inputs = [{ state: 'connected' }]; f.callbacks[0](null);
  assert.strictEqual(reopened.instance.midiStatus, 'connected');
  assert.strictEqual(home.instance.midiStatus, 'permission-pending', 'A disposed view must ignore the late answer');
  f.callbacks[0](new Error('duplicate late callback'));
  assert.strictEqual(reopened.instance.midiStatus, 'connected');
  reopened.destroy();
}));
test('U2: superseded subscribers ignore late errors; a genuine failure unlocks exactly one fresh retry', () => withFakeClock(advance => {
  const connection = evaluate(read('src/model/MidiConnection.js'));
  const f = midiFixture(); const completed = []; const warned = [];
  const cancel = connection.enableMidiConnection(f.midi, error => completed.push(['old', error]), () => warned.push('old'));
  advance(connection.MIDI_PERMISSION_WAIT_HINT_MS); cancel();
  connection.enableMidiConnection(f.midi, error => completed.push(['current', error]), () => warned.push('current'));
  assert.deepStrictEqual(warned, ['old', 'current']);
  const error = new Error('denied'); f.callbacks[0](error);
  assert.deepStrictEqual(completed, [['current', error]]);
  connection.enableMidiConnection(f.midi, answer => completed.push(['retry', answer]));
  assert.strictEqual(f.callbacks.length, 2);
  f.callbacks[0](null);
  assert.strictEqual(completed.length, 1, 'The old native completion cannot resolve the newer attempt');
  f.callbacks[1](null);
  assert.deepStrictEqual(completed, [['current', error], ['retry', null]]);
}));
test('U2: the actual MIDI input exposes a pending hint, allows shared rechecks and discards destroyed subscriptions', () => withFakeClock(advance => {
  const connection = evaluate(read('src/model/MidiConnection.js'));
  const f = midiFixture();
  const definition = component('src/components/MidiInput.vue', {
    webmidi: f.midi, '../model/MidiConnection': connection, '../model/Utils': {}, '../model/Options': {}
  });
  const instance = Object.assign(definition.data(), { $t: key => key, $emit() {} });
  Object.keys(definition.methods).forEach(key => { instance[key] = definition.methods[key].bind(instance); });
  definition.mounted.call(instance);
  advance(connection.MIDI_PERMISSION_WAIT_HINT_MS);
  assert.strictEqual(instance.midiPermissionPending, true);
  assert.strictEqual(instance.errorMessage, '');
  assert.strictEqual(instance.midiEnabling, false);
  instance.initMidi(); assert.strictEqual(instance.midiPermissionPending, true);
  assert.strictEqual(f.callbacks.length, 1);
  f.callbacks[0](new Error('denied'));
  assert.strictEqual(instance.midiPermissionPending, false);
  assert.strictEqual(instance.errorMessage, 'noMidiSupport');
  instance.initMidi();
  assert.strictEqual(f.callbacks.length, 2);
  definition.beforeDestroy.call(instance);
  f.callbacks[1](null);
  assert.strictEqual(instance.errorMessage, '', 'Late success cannot mutate the disposed input');
}));
test('F5/U2: changed dialog, home and MIDI-input templates remain valid Vue templates', () => {
  for (const file of ['AppInfoDialog.vue', 'HomeMenu.vue', 'MidiInput.vue']) {
    const parsed = compiler.parseComponent(read(`src/components/${file}`));
    assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  }
});
