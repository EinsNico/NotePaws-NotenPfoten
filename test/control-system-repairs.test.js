/* Actual Vue component regression probes. All persistence/audio are RAM-only stubs. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { createRequire } = require('module');
const liveRoot = path.resolve(__dirname, '..');
const sourceRoot = process.env.AUDIT_SOURCE_ROOT || liveRoot;
const req = createRequire(path.join(liveRoot, 'package.json'));
const babel = req('babel-core'), compiler = req('vue-template-compiler'), Vue = req('vue');
const previous = {};
['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'regeneratorRuntime', 'document', 'window'].forEach(key => { previous[key] = global[key]; });
global.regeneratorRuntime = req('babel-runtime/regenerator');
let now = 0, sequence = 0;
const timers = new Map(), hashes = {}, models = {}, saves = [], evaluations = [];
global.performance = { now: () => now };
function schedule(callback, delay, interval = 0) {
  const id = ++sequence;
  timers.set(id, { callback, at: now + delay, interval });
  return id;
}
global.setTimeout = (callback, delay = 0) => schedule(callback, delay);
global.setInterval = (callback, delay) => schedule(callback, delay, delay);
global.clearTimeout = global.clearInterval = id => timers.delete(id);
function advance(ms, callbacks = true) {
  const end = now + ms;
  if(callbacks) while(true) {
    const entry = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if(!entry) break;
    const [id, timer] = entry;
    now = Math.max(now, timer.at);
    if(timer.interval) timer.at += timer.interval; else timers.delete(id);
    timer.callback();
  }
  now = end;
}
function deliverOne(id) {
  const timer = timers.get(id);
  assert(timer);
  if(timer.interval) timer.at = now + timer.interval; else timers.delete(id);
  timer.callback();
}
function source(relative) {
  const text = fs.readFileSync(path.join(sourceRoot, relative), 'utf8');
  hashes[relative] = crypto.createHash('sha256').update(text).digest('hex');
  return text;
}
function model(name) {
  name = name.replace(/\.js$/, '');
  if(models[name]) return models[name].exports;
  const module = { exports: {} }; models[name] = module;
  new Function('module', 'exports', 'require', babel.transform(source('src/model/' + name + '.js'), {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code)(module, module.exports, dependency => dependency.startsWith('./') ? model(dependency.slice(2)) : req(dependency));
  return module.exports;
}
const options = { gameLength: 20, preparationSeconds: 0, inputMode: 'button', displayNote: false, sound: false, vibration: false, appVolume: 0 };
function component(name, dependencies = {}) {
  const parsed = compiler.parseComponent(source('src/components/' + name + '.vue'));
  assert.deepStrictEqual(compiler.compile(parsed.template.content).errors, []);
  const module = { exports: {} };
  new Function('module', 'exports', 'require', babel.transform(parsed.script.content, {
    babelrc: false, presets: [['env', { modules: 'commonjs' }]]
  }).code)(module, module.exports, dependency => {
    if(Object.prototype.hasOwnProperty.call(dependencies, dependency)) return dependencies[dependency];
    if(dependency.startsWith('../model/')) return model(dependency.slice('../model/'.length));
    return dependency === 'lodash' ? req('lodash') : {};
  });
  return { definition: module.exports.default, template: parsed.template.content };
}
const game = component('Game', {
  '../model/Options': options, '../model/AdaptiveOptions': options,
  '../model/AdaptiveProgress': { loadFromDatabase: () => Promise.resolve(), createSession: () => 'synthetic-session', recordResult: (...args) => evaluations.push(args), finishSession() {} },
  '../model/SingleNotesLearningStorage': { status: { state: 'ready' }, flush() {} },
  '../model/Statistics': { addRound: (...args) => saves.push(args) },
  '../model/ScreenAwakeMixin': { createScreenAwakeMixin: () => ({}) },
  '../model/PianoAudio': { createPianoSamplePlayer: () => ({ play() {}, stopAll() {} }) },
  '../model/AudioSynchronization': { resume() {} },
  '../model/AudioSynchronizationPlayback': { watchAudioTimingChanges: () => () => {} },
  '../model/Utils': { getNearestNoteOfValue: value => value }
}).definition;
const instances = [];
function focusFixture() {
  const listeners = {};
  const doc = {
    activeElement: null,
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = new Set())).add(fn); },
    removeEventListener(type, fn) { if(listeners[type]) listeners[type].delete(fn); },
    fire(type, details) {
      const event = Object.assign({ prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} }, details);
      [...(listeners[type] || [])].forEach(fn => fn(event)); return event;
    },
    listenerCount(type) { return (listeners[type] || new Set()).size; }
  };
  class Element {
    constructor(tag = 'DIV', tabIndex = -1) { this.tagName = tag; this.tabIndex = tabIndex; this.children = []; this.parentElement = null; this.attrs = {}; this.style = {}; this.disabled = false; }
    append(child) { this.children.push(child); child.parentElement = this; return child; }
    remove(child) { this.children = this.children.filter(candidate => candidate !== child); child.parentElement = null; }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
    setAttribute(name, value) { this.attrs[name] = value; }
    removeAttribute(name) { delete this.attrs[name]; }
    closest(selector) {
      for(let current = this; current; current = current.parentElement) {
        if((selector.includes('[inert]') && current.getAttribute('inert') !== null)
          || (selector.includes('[hidden]') && current.getAttribute('hidden') !== null)
          || (selector.includes('[aria-hidden="true"]') && current.getAttribute('aria-hidden') === 'true')) return current;
      }
      return null;
    }
    getClientRects() { return [{}]; }
    querySelectorAll() { return this.children.flatMap(child => [child.tabIndex >= 0 && !child.disabled ? child : null, ...child.querySelectorAll()]).filter(Boolean); }
    focus() { doc.activeElement = this; doc.fire('focusin', { target: this }); }
  }
  const body = doc.body = new Element('BODY'); body.style.overflow = 'auto';
  const app = body.append(new Element());
  const notice = app.append(new Element()); notice.setAttribute('inert', 'existing'); notice.setAttribute('aria-hidden', 'false');
  const page = app.append(new Element()); const content = page.append(new Element());
  const opener = content.append(new Element('BUTTON', 0)); const key = content.append(new Element('BUTTON', 0));
  const dialog = page.append(new Element()); const first = dialog.append(new Element('BUTTON', 0)); const last = dialog.append(new Element('BUTTON', 0));
  opener.focus();
  return { doc, body, app, notice, content, opener, key, dialog, first, last, Element };
}
async function makeGame({ mode = 'normal', duration = 20, preparation = 0 } = {}) {
  options.preparationSeconds = preparation;
  let nextValue = 48;
  const vm = new Vue(Object.assign({}, game, {
    mounted: undefined, beforeDestroy: undefined, propsData: { mode },
    methods: Object.assign({}, game.methods, {
      generateExercise: () => { nextValue = nextValue === 48 ? 60 : 48; return { clef: 'treble', staff: 'treble', value: nextValue, isSharp: true }; }
    })
  }));
  instances.push(vm);
  vm.options = Object.assign({}, options, { gameLength: duration });
  await vm.startGame();
  vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
  return vm;
}
function answer(vm) { vm.checkAnswer(0); vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId); }
function resume(vm) { vm.resumeGame(); vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId); }
const evidence = { sourceRoot, generatedAt: new Date().toISOString(), protections: ['RAM-only stubs', 'no browser/8093', 'no build', 'no real learning/music data'], tests: [] };
async function test(name, body) {
  now = 0; timers.clear(); saves.length = 0; evaluations.length = 0;
  try { const details = await body(); evidence.tests.push({ name, passed: true, details }); }
  catch(error) { evidence.tests.push({ name, passed: false, error: error.stack }); }
  finally { for(const vm of instances.splice(0)) { vm.onExit(); vm.$destroy(); } timers.clear(); }
  process.stdout.write((evidence.tests.at(-1).passed ? 'PASS ' : 'FAIL ') + name + '\n');
}
async function run() {
  await test('F1: 100 x 900ms active segments cannot extend a 20s scoring round', async () => {
    const vm = await makeGame(); let endedAt = null;
    vm.$on('gameEnded', () => { endedAt = now; });
    for(let i = 0; i < 100; i++) { advance(900); answer(vm); vm.pauseGame(); resume(vm); }
    const details = { activeMs: now, endedAt, remainingSeconds: vm.timeLeft, correct: vm.numCorrect, score: vm.score, active: vm.roundActive, saves: saves.length };
    assert.strictEqual(vm.roundActive, false, JSON.stringify(details));
    assert.strictEqual(endedAt, 20000);
    assert.strictEqual(vm.timeLeft, 0); assert.strictEqual(vm.numCorrect, 22); assert.strictEqual(vm.score, 6600); assert.strictEqual(saves.length, 1);
    return details;
  });
  await test('F1: 400 x 50ms active segments end exactly at accumulated 20s', async () => {
    const vm = await makeGame();
    for(let i = 0; i < 399; i++) { advance(50); vm.pauseGame(); advance(7); resume(vm); }
    advance(49); assert.strictEqual(vm.roundActive, true); assert.strictEqual(vm.timeLeft, 1);
    advance(1); assert.strictEqual(vm.roundActive, false); assert.strictEqual(saves.length, 1);
  });
  await test('F1: whole/fractional seconds survive a long pause', async () => {
    const vm = await makeGame(); advance(1250); vm.pauseGame();
    assert.strictEqual(vm.timeLeft, 19); advance(3600000); assert.strictEqual(vm.timeLeft, 19);
    resume(vm); advance(749); assert.strictEqual(vm.timeLeft, 19);
    advance(1); assert.strictEqual(vm.timeLeft, 18); advance(17999); assert.strictEqual(vm.roundActive, true);
    advance(1); assert.strictEqual(vm.timeLeft, 0); assert.strictEqual(vm.roundActive, false);
  });
  await test('F1: no-pause control ends exactly at 20s', async () => {
    const vm = await makeGame(); advance(19999); assert.strictEqual(vm.roundActive, true);
    advance(1); assert.strictEqual(vm.roundActive, false); assert.strictEqual(vm.timeLeft, 0); assert.strictEqual(saves.length, 1);
  });
  await test('F1: delayed callbacks catch up to monotone active elapsed time', async () => {
    const vm = await makeGame(); advance(3450, false); deliverOne(vm.timer);
    assert.strictEqual(vm.timeLeft, 17); advance(16550, false); deliverOne(vm.timer);
    assert.strictEqual(vm.timeLeft, 0); assert.strictEqual(vm.roundActive, false); assert.strictEqual(saves.length, 1);
  });
  await test('F1: answer delivery at exact expiry cannot score before overdue timeout', async () => {
    const vm = await makeGame(); advance(20000, false); answer(vm);
    assert.strictEqual(vm.numCorrect, 0); assert.strictEqual(vm.roundActive, false); assert.strictEqual(saves.length, 1);
  });
  await test('F1: pausing at expiry cannot evade an overdue deadline', async () => {
    const vm = await makeGame(); advance(20001, false); vm.pauseGame();
    assert.strictEqual(vm.roundActive, false); assert.strictEqual(vm.isPaused, false); assert.strictEqual(saves.length, 1);
  });
  await test('F1: rendering and both complete/interrupted preparation exclude active time', async () => {
    const vm = await makeGame({ preparation: 3 }); advance(3000); advance(900); vm.pauseGame();
    advance(60000); vm.resumeGame(); advance(5000); assert.strictEqual(vm.timeLeft, 20, 'render wait is idle');
    vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId); advance(500); vm.pauseGame();
    advance(5000); resume(vm); advance(3000); advance(100); assert.strictEqual(vm.timeLeft, 19);
    advance(18999); assert.strictEqual(vm.roundActive, true); advance(1); assert.strictEqual(vm.roundActive, false);
  });
  await test('F1: stale timer callbacks are inert during pause, after resume, restart and finish', async () => {
    const vm = await makeGame(); const beforePause = timers.get(vm.timer).callback;
    advance(900); vm.pauseGame(); advance(5000); beforePause(); assert.strictEqual(vm.timeLeft, 20);
    resume(vm); beforePause(); assert.strictEqual(timers.size, 1); advance(100); assert.strictEqual(vm.timeLeft, 19);
    const beforeRestart = timers.get(vm.timer).callback; await vm.startGame(); vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    beforeRestart(); assert.strictEqual(vm.timeLeft, 20); assert.strictEqual(timers.size, 1);
    const beforeFinish = timers.get(vm.timer).callback; advance(20000); beforeFinish(); vm.onGameFinished();
    assert.strictEqual(vm.timeLeft, 0); assert.strictEqual(saves.length, 1); assert.strictEqual(timers.size, 0);
  });
  await test('F1: restart resets fractions, abort discards, exit cancels stale timers', async () => {
    const vm = await makeGame(); advance(1900); vm.pauseGame(); await vm.startGame(); vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId);
    advance(19999); assert.strictEqual(vm.roundActive, true);
    const stale = timers.get(vm.timer).callback; const events = []; vm.$on('gameEnded', value => events.push(value));
    vm.handleRoundExit(); stale(); advance(60000); assert.strictEqual(saves.length, 0); assert.deepStrictEqual(events, [null]); assert.strictEqual(timers.size, 0);
  });
  await test('F1: unlimited rounds remain untimed with normal answer/end behavior', async () => {
    const vm = await makeGame({ duration: 0 }); advance(3600000); answer(vm); vm.pauseGame(); advance(60000); resume(vm); answer(vm);
    assert.strictEqual(vm.numCorrect, 2); assert.strictEqual(vm.timeLeft, 0); assert.strictEqual(timers.size, 0);
    vm.handleRoundExit(); assert.strictEqual(saves.length, 1);
  });
  await test('F1: adaptive response time excludes pause/preparation and expires fairly', async () => {
    const vm = await makeGame({ mode: 'adaptive', preparation: 3 }); advance(3000); answer(vm); advance(100); vm.pauseGame();
    advance(60000); resume(vm); advance(3000); advance(100); answer(vm);
    assert.strictEqual(evaluations[0][3], null, 'the first note is intentionally unmeasured');
    assert.strictEqual(evaluations[1][3], 200); assert.strictEqual(vm.numCorrect, 2);
    advance(19800); assert.strictEqual(vm.roundActive, false); assert.strictEqual(saves.length, 0);
  });
  await test('U1: every choice is a native type=button with preserved input values and aria-pressed', () => {
    const { definition, template } = component('SelectOption');
    for(const value of ['midi', 20, false]) {
      const items = [{ value, label: 'DE Auswahl' }, { value: 'other', label: 'EN Choice' }];
      const vm = new Vue(Object.assign({}, definition, compiler.compileToFunctions(template), { propsData: { items, label: 'Auswahl / Choice', value } }));
      const group = vm._render().children.find(node => node.data && node.data.staticClass === 'options-container');
      const choices = group.children.flat().filter(node => node.data && node.data.staticClass === 'value-box');
      assert.strictEqual(choices.length, 2);
      const emitted = []; vm.$on('input', choice => emitted.push(choice));
      choices.forEach((node, index) => { assert.strictEqual(node.tag, 'button'); assert.strictEqual(node.data.attrs.type, 'button'); assert.strictEqual(node.data.attrs['aria-pressed'], index === 0); node.data.on.click(); });
      assert.deepStrictEqual(emitted, [value, 'other']); vm.$destroy();
    }
  });
  await test('U2: 13 unique localized piano names preserve every original input and disabled behavior', () => {
    const { definition, template } = component('KeyboardInput', { '../model/Options': options });
    for(const language of ['de', 'en']) for(const naming of ['german', 'international']) {
      const dictionary = {};
      const module = { exports: {} };
      new Function('module', 'exports', babel.transform(source('src/resources/' + language + '.js'), { babelrc: false, presets: [['env', { modules: 'commonjs' }]] }).code)(module, module.exports);
      Object.assign(dictionary, module.exports.default);
      options.noteNaming = naming;
      const vm = new Vue(Object.assign({}, definition, compiler.compileToFunctions(template), { methods: Object.assign({}, definition.methods, { $t: (key, values) => dictionary[key].replace('{note}', values.note) }) }));
      const keys = vm._render().children.filter(node => node.tag === 'button');
      assert.strictEqual(keys.length, 13);
      const labels = keys.map(node => node.data.attrs['aria-label']);
      assert(labels.every(label => typeof label === 'string' && label.length > 0)); assert.strictEqual(new Set(labels).size, 13);
      assert.strictEqual(labels[11], naming === 'german' ? 'H' : 'B');
      assert.strictEqual(labels[1], naming === 'german' ? 'Cis / Des' : 'C♯ / D♭');
      assert(labels[0].includes(language === 'de' ? 'linke' : 'left'));
      assert(labels[12].includes(language === 'de' ? 'rechte' : 'right'));
      const emitted = []; vm.$on('solved', value => emitted.push(value));
      keys.forEach(key => key.data.on.click({ stopPropagation() {} })); assert.deepStrictEqual(emitted, Array.from({ length: 13 }, (_, value) => value));
      vm.disabled = true; keys.forEach(key => key.data.on.click({ stopPropagation() {} })); assert.strictEqual(emitted.length, 13);
      assert(vm._render().children.filter(node => node.tag === 'button').every(node => node.data.attrs.disabled));
      vm.$destroy();
    }
  });
  await test('U3: actual pause opens focus containment, blocks scoring and restores background state', async () => {
    const f = focusFixture(); global.document = f.doc;
    const vm = await makeGame(); vm.$refs.pauseDialog = f.dialog; vm.$refs.pauseButton = f.opener;
    advance(100); vm.pauseGame(); await vm.$nextTick();
    assert.strictEqual(f.doc.activeElement, f.dialog); assert.strictEqual(f.content.getAttribute('inert'), '');
    assert.strictEqual(f.body.style.overflow, 'hidden');
    f.doc.fire('keydown', { key: 'Tab', shiftKey: true }); assert.strictEqual(f.doc.activeElement, f.last);
    f.doc.fire('keydown', { key: 'Tab', shiftKey: false }); assert.strictEqual(f.doc.activeElement, f.first);
    f.key.focus(); assert.strictEqual(f.doc.activeElement, f.dialog);
    vm.checkAnswer(0); vm.checkAnswer(60, true); assert.strictEqual(vm.numCorrect, 0);
    // The old v-if pause button is removed, then recreated on resume.
    f.content.remove(f.opener); const recreated = f.content.append(new f.Element('BUTTON', 0)); vm.$refs.pauseButton = recreated;
    resume(vm); await vm.$nextTick();
    assert.strictEqual(f.doc.activeElement, recreated); assert.strictEqual(f.content.getAttribute('inert'), null);
    assert.strictEqual(f.notice.getAttribute('inert'), 'existing'); assert.strictEqual(f.notice.getAttribute('aria-hidden'), 'false');
    assert.strictEqual(f.body.style.overflow, 'auto'); assert.strictEqual(f.doc.listenerCount('focusin'), 0);
    answer(vm); assert.strictEqual(vm.numCorrect, 1);
  });
  await test('U3: rapid pause/resume, restart, exit and destruction invalidate pending focus work', async () => {
    const f = focusFixture(); global.document = f.doc; global.window = { removeEventListener() {} };
    const vm = await makeGame(); vm.$refs.pauseDialog = f.dialog; vm.$refs.pauseButton = f.opener;
    vm.pauseGame(); resume(vm); await vm.$nextTick(); assert.strictEqual(f.doc.listenerCount('keydown'), 0);
    vm.pauseGame(); await vm.startGame(); vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId); await vm.$nextTick();
    assert.strictEqual(f.doc.listenerCount('keydown'), 0); assert.strictEqual(f.content.getAttribute('inert'), null);
    vm.pauseGame(); await vm.$nextTick(); assert.strictEqual(f.doc.listenerCount('keydown'), 1);
    vm.onExit(); await vm.$nextTick(); assert.strictEqual(f.doc.listenerCount('keydown'), 0); assert.strictEqual(f.body.style.overflow, 'auto');
    await vm.startGame(); vm.onExerciseRendered(vm.currentExerciseId, vm.preparationId); vm.pauseGame();
    game.beforeDestroy.call(vm); await vm.$nextTick(); assert.strictEqual(f.doc.listenerCount('keydown'), 0); assert.strictEqual(f.content.getAttribute('inert'), null);
  });
  evidence.hashes = hashes;
  evidence.sourceHashesStable = Object.entries(hashes).every(([relative, hash]) => crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceRoot, relative))).digest('hex') === hash);
  evidence.passed = evidence.tests.every(test => test.passed) && evidence.sourceHashesStable;
  const output = process.env.REPAIR_EVIDENCE;
  if(output) fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ passed: evidence.passed, tests: evidence.tests.length, failed: evidence.tests.filter(test => !test.passed).map(test => test.name), sourceHashesStable: evidence.sourceHashesStable }) + '\n');
  if(!evidence.passed) process.exitCode = 1;
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => Object.keys(previous).forEach(key => { global[key] = previous[key]; }));
